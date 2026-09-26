// Browserプラグインが無い環境向けのPlaywright検証です。画像とログは指定した外部フォルダへ保存します。
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {extname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
const root=resolve(fileURLToPath(new URL('../dist/',import.meta.url)));
const evidence=process.env.LAB_EVIDENCE_DIR??'/tmp/storm-lua-addon-lab-qa';
await mkdir(evidence,{recursive:true});
const server=createServer(async(req,res)=>{
  try {
    const route=new URL(req.url,'http://local').pathname;
    if(!route.startsWith('/lab/')){res.writeHead(404).end();return;}
    const name=decodeURIComponent(route.slice(5))||'index.html';
    const path=resolve(root,name);
    if(!path.startsWith(root+sep)&&path!==resolve(root,'index.html')){res.writeHead(403).end();return;}
    const bytes=await readFile(path);
    res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.txt':'text/plain'})[extname(path)]??'application/octet-stream');
    res.end(bytes);
  }catch{res.writeHead(404).end();}
});
await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
const address=server.address();if(!address||typeof address==='string')throw new Error('HTTP待受に失敗しました。');
const origin=`http://127.0.0.1:${address.port}/lab/`;
const names=(process.env.LAB_BROWSERS??'chromium').split(',');
const results=[];
try {
  for(const name of names){
    const browserType={chromium,firefox,webkit}[name];if(!browserType)throw new Error('未対応のブラウザです。');
    const browser=await browserType.launch({headless:true,...(name==='chromium'?{args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}:{})});
    const errors=[],network=[];
    try {
      const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
      const page=await context.newPage();page.setDefaultTimeout(20000);
      page.on('pageerror',error=>errors.push(error.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
      page.on('requestfailed',req=>network.push(req.url()+': '+req.failure()?.errorText));
      page.on('dialog',dialog=>dialog.accept());
      await page.goto(origin);
      await page.waitForFunction(()=>document.querySelector('#app')?.getAttribute('data-phase')==='paused');
      assert.equal(await page.title(),'Addon Lab — Storm Lua Engine');
      assert.equal(await page.locator('#boat-list button').count(),3);
      assert.equal(await page.locator('.cm-editor').count(),1);
      await page.screenshot({path:resolve(evidence,`${name}-desktop.png`),fullPage:true});
      const tick=()=>page.locator('#app').getAttribute('data-tick').then(Number);
      assert.equal(await tick(),0);await page.click('#step');assert.equal(await tick(),1);
      await page.click('#play');await page.waitForFunction(()=>Number(document.querySelector('#app')?.getAttribute('data-tick'))>50);await page.click('#play');
      const stopped=await tick();await page.waitForTimeout(150);assert.equal(await tick(),stopped);
      await page.fill('#chat','/spawn');await page.click('#send');assert.equal(await page.locator('#boat-list button').count(),4);
      await page.fill('#chat','/ping');await page.click('#send');await page.waitForFunction(()=>document.querySelector('#output-logs')?.textContent.includes('httpReply'));
      await page.click('[data-file=host]');await page.waitForFunction(()=>document.querySelector('.cm-content')?.textContent.includes('ServerFunctions'));
      assert.equal(await page.locator('.cm-content').getAttribute('contenteditable'),'false');
      await page.click('[data-file=physics]');await page.waitForFunction(()=>document.querySelector('.cm-content')?.textContent.includes('BOAT_TYPES'));
      await page.click('[data-file=lua]');
      await page.click('[data-output=savedata]');assert.ok((await page.locator('#output-savedata').textContent()).includes('fleet'));
      await page.click('[data-output=api]');assert.equal(await page.locator('#output-api tbody tr').count(),0);assert.ok(await page.locator('#output-api tr').count()>10);
      await page.click('[data-output=logs]');
      const downloadPromise=page.waitForEvent('download');await page.click('#export');const download=await downloadPromise;
      const projectPath=resolve(evidence,`${name}-project.json`);await download.saveAs(projectPath);
      const exported=JSON.parse(await readFile(projectPath,'utf8'));assert.equal(exported.checkpoint.world.boats.length,4);
      // リロードで位置とtickが復元され、勝手に再生されないことを確認します。
      await page.reload();await page.waitForFunction(()=>document.querySelector('#app')?.getAttribute('data-phase')==='paused');
      assert.equal(await tick(),exported.checkpoint.world.tick);assert.equal(await page.locator('#boat-list button').count(),4);
      // 不正なimportは、正常なプロジェクトを破棄しません。
      await page.locator('#import-file').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"version":999}')});
      await page.waitForFunction(()=>document.querySelector('#error')?.textContent.includes('読み込みを中止'));
      assert.equal(await page.locator('#boat-list button').count(),4);
      await page.locator('#import-file').setInputFiles(projectPath);await page.waitForFunction(()=>document.querySelector('#error')?.hidden);
      // 実際のCodeMirror編集経路で構文エラーと復旧を検証します。
      const editable=page.locator('.cm-content[contenteditable=true]');await editable.click();await page.keyboard.press('ControlOrMeta+A');await page.keyboard.insertText('function onTick( !!!');await page.click('#apply');
      await page.waitForFunction(()=>document.querySelector('#app')?.getAttribute('data-phase')==='error');assert.ok((await page.locator('#error').textContent()).length>0);
      await page.screenshot({path:resolve(evidence,`${name}-error.png`),fullPage:true});
      await page.locator('#import-file').setInputFiles(projectPath);await page.waitForFunction(()=>document.querySelector('#app')?.getAttribute('data-phase')==='paused');
      await page.click('#step');
      await page.setViewportSize({width:390,height:844});await page.click('[data-pane=world]');await page.waitForTimeout(150);
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false,'モバイル画面が横にはみ出しています');
      await page.screenshot({path:resolve(evidence,`${name}-mobile.png`),fullPage:true});
      await page.click('#help');assert.equal(await page.locator('#guide').evaluate(d=>d.open),true);await page.click('#close-help');
      assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
      results.push({browser:name,version:browser.version(),desktop:[1440,1000],mobile:[390,844],tick:stopped,entities:4,webgl:true,codeMirror:true,editAndErrorRecovery:true,readOnlyHost:true,eventAndHttp:true,reloadAndImport:true,consoleErrors:errors,requestFailures:network});
      await context.close();
    }catch(error){
      console.error(JSON.stringify({browser:name,consoleErrors:errors,requestFailures:network},null,2));
      throw error;
    }finally{await browser.close();}
  }
  await writeFile(resolve(evidence,'results.json'),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results,null,2));
}finally{await new Promise(resolve=>server.close(resolve));}
