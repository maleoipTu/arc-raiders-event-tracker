// Actual Electron/file:// smoke, isolated from the user's installed application data.
const {app,BrowserWindow,ipcMain,session}=require('electron');
const path=require('node:path');const fs=require('node:fs/promises');const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const userData=path.join(root,'dist',`electron-smoke-${Date.now()}`);
app.setPath('userData',userData);
const deadline=setTimeout(()=>{console.error('Electron smoke timed out');app.exit(1);},45000);
app.whenReady().then(async()=>{
  const calls={
    'app:version':()=>require('../package.json').version,
    'schedule:fetch':()=>({events:[],syncedAt:Date.now()}),
    'credentials:status':()=>({}), 'settings:get':()=>({notifications:false,notifyLeadMinutes:10}),
    'notifications:schedule':()=>({scheduled:0}), 'updates:status':()=>({phase:'idle'})
  };
  for(const [channel,callback]of Object.entries(calls))ipcMain.handle(channel,callback);
  session.defaultSession.webRequest.onBeforeRequest({urls:['https://*/*']},(_details,callback)=>callback({cancel:true}));
  const win=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{preload:path.join(root,'preload.js'),contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,offscreen:true}});
  await win.loadFile(path.join(root,'index.html'));
  const result=await win.webContents.executeJavaScript(`(async()=>{
    const wait=async selector=>{for(let n=0;n<150;n++){if(document.querySelector(selector))return;await new Promise(resolve=>setTimeout(resolve,100));}throw Error('Missing '+selector+'; '+document.body.innerText.slice(-500));};
    document.querySelector('[data-view="maps"]').click();await wait('#atlasViewport');await wait('.atlas-pin');
    const maps=document.querySelector('#atlasMap').options.length;
    const image=document.querySelector('#atlasImage');for(let n=0;n<100&&!image.naturalWidth;n++)await new Promise(resolve=>setTimeout(resolve,50));
    const imageWidth=image.naturalWidth;
    document.querySelector('[data-view="wiki"]').click();await wait('.book-card');const cards=document.querySelectorAll('.book-card').length;
    document.querySelector('[data-view="hideout"]').click();await wait('.hideout-station');
    return {maps,imageWidth,cards,stations:document.querySelectorAll('.hideout-station').length,version:await window.arcApp.version()};
  })()`);
  assert.equal(result.maps,7);assert.equal(result.stations,10);assert.ok(result.imageWidth>0);assert.ok(result.cards>0);assert.equal(result.version,require('../package.json').version);
  await fs.mkdir(path.join(root,'dist','atlas-preview'),{recursive:true});
  await win.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(resolve,300))))');
  await fs.writeFile(path.join(root,'dist','atlas-preview','electron-hideout.png'),(await win.webContents.capturePage()).toPNG());
  console.log('Actual Electron file:// PASS:',JSON.stringify(result));
  clearTimeout(deadline);win.destroy();app.exit(0);
}).catch(error=>{console.error(error);clearTimeout(deadline);app.exit(1);});
