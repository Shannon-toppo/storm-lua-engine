// このワールドはサンプル専用です。実ゲームの流体・衝突・ビークル構造は再現しません。
export type BoatKind = 'rescue_boat' | 'cargo_boat';
export interface Boat {
  id: number; kind: BoatKind; x: number; y: number; z: number; heading: number;
  speed: number; throttle: number; steering: number; tooltip: string;
}
export interface WorldSnapshot { tick: number; nextId: number; boats: Boat[]; wind: number }
export const MAX_BOATS = 24;
export const STEP = 1 / 60;
export const WAYPOINTS = [[-36, -24], [36, -24], [36, 28], [-36, 28]] as const;
export const BOAT_TYPES: Readonly<Record<BoatKind, {name: string; maxSpeed: number; color: number}>> = {
  rescue_boat: {name: 'レスキュー艇', maxSpeed: 13, color: 0xf49b54},
  cargo_boat: {name: '小型輸送船', maxSpeed: 8, color: 0x55b8bd},
};
export function finite(value: unknown, name: string, limit = 1e6): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > limit) throw new Error(`${name}は±${limit}以内の有限数で指定してください。`);
  return value;
}
export function integer(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${name}は${min}〜${max}の整数で指定してください。`);
  return value;
}
export function object(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${name}はオブジェクトである必要があります。`);
  return value as Record<string, unknown>;
}
export function text(value: unknown, name: string, limit: number): string {
  if (typeof value !== 'string' || value.length > limit) throw new Error(`${name}は${limit}文字以内で指定してください。`);
  return value;
}
export function parseWorld(value: unknown): WorldSnapshot {
  const v = object(value, 'world');
  const tick = integer(v.tick, 'tick', 0, 1e12), nextId = integer(v.nextId, 'nextId', 1, 1e9);
  const wind = finite(v.wind, 'wind', 5);
  if (!Array.isArray(v.boats) || v.boats.length > MAX_BOATS) throw new Error('ビークル数の上限を超えています。');
  const ids = new Set<number>();
  const boats = v.boats.map((value):Boat => {
    const b = object(value, 'boat');
    const id = integer(b.id, 'vehicle id', 1, nextId - 1);
    if (ids.has(id)) throw new Error('ビークルIDが重複しています。');
    ids.add(id);
    if (b.kind !== 'rescue_boat' && b.kind !== 'cargo_boat') throw new Error('未対応のビークル種別です。');
    return {id, kind:b.kind, x:finite(b.x,'x'), y:finite(b.y,'y'), z:finite(b.z,'z'), heading:finite(b.heading,'heading',Math.PI + 0.001), speed:finite(b.speed,'speed',20), throttle:finite(b.throttle,'throttle',1), steering:finite(b.steering,'steering',1), tooltip:text(b.tooltip,'tooltip',512)};
  });
  return {tick,nextId,wind,boats};
}
export class World {
  tick = 0;
  nextId = 1;
  wind = 0;
  readonly boats = new Map<number, Boat>();
  constructor(snapshot?: WorldSnapshot) {
    if (snapshot) {
      const valid = parseWorld(snapshot);
      this.tick = valid.tick; this.nextId = valid.nextId; this.wind = valid.wind;
      valid.boats.forEach(boat => this.boats.set(boat.id, {...boat}));
    }
  }
  spawn(kind: BoatKind, x: number, y: number, z: number, heading: number): Boat {
    if (this.boats.size >= MAX_BOATS || this.nextId >= 1e9) throw new Error('サンプルのビークル上限に達しました。');
    const boat: Boat = {id:this.nextId++, kind, x, y, z, heading, speed:0, throttle:0, steering:0, tooltip:BOAT_TYPES[kind].name};
    this.boats.set(boat.id, boat); return boat;
  }
  step(): void {
    // 固定60Hzの簡易モデルです。キー入力→速度の追従と、舵→ヨー回転だけを計算します。
    this.tick++;
    for (const boat of this.boats.values()) {
      const desired = boat.throttle * BOAT_TYPES[boat.kind].maxSpeed;
      boat.speed += (desired - boat.speed) * (1 - Math.exp(-1.1 * STEP));
      boat.heading = Math.atan2(Math.sin(boat.heading + boat.steering * 0.65 * STEP), Math.cos(boat.heading + boat.steering * 0.65 * STEP));
      boat.x += (Math.sin(boat.heading) * boat.speed + this.wind * 0.1) * STEP;
      boat.z += Math.cos(boat.heading) * boat.speed * STEP;
      // 浮力の代用品。見た目の小さな揺れであり、力やエネルギーの保存は保証しません。
      boat.y = 0.12 + 0.09 * Math.sin(this.tick * STEP * 1.4 + boat.id);
      if (Math.abs(boat.x) > 10000 || Math.abs(boat.z) > 10000) throw new Error('サンプルのワールド範囲外へ移動しました。');
    }
  }
  snapshot(): WorldSnapshot { return {tick:this.tick, nextId:this.nextId, wind:this.wind, boats:[...this.boats.values()].map(boat=>({...boat}))}; }
}
