/** Static HTML delivery only. Lua source, execution and compiler requests never reach this Worker. */
interface Assets { fetch(request: Request): Promise<Response> }
export default {
  async fetch(request: Request, environment: { ASSETS: Assets }): Promise<Response> {
    const response = await environment.ASSETS.fetch(request);
    if (response.status !== 200 || !response.headers.get('content-type')?.startsWith('text/html')) return response;
    const headers = new Headers(response.headers);
    const policy = headers.get('content-security-policy');
    if (!policy || !/(?:^|;)\s*script-src\s/.test(policy)) throw new Error('Playground HTML must have its build-time Content Security Policy');
    // Cloudflare adds this response nonce to its own JavaScript Detection script.
    // Never allow arbitrary inline scripts or disable zone-wide Bot protection.
    const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))));
    headers.set('content-security-policy', policy.replace(/((?:^|;)\s*script-src\s+[^;]*)/, `$1 'nonce-${nonce}'`));
    // Each response needs a fresh nonce; the original static asset may remain edge-cached.
    headers.set('cache-control', 'no-store');
    return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
  },
};
