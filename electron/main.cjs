const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");
const https = require("https");
const http = require("http");
const AUDIO_EXT = new Set([".mp3",".wav",".flac",".m4a",".aac",".ogg",".opus",".wma",".aiff"]);
let win, metadataModule;
const artworkCache = new Map();
async function findArtwork(artist, album, title) {
 const key = [artist, album].filter(Boolean).join(" | ") || title;
 if (artworkCache.has(key)) return artworkCache.get(key);
 try { const term = encodeURIComponent([artist, album, title].filter(Boolean).join(" ")); const data = await getJson("https://itunes.apple.com/search?term="+term+"&entity=song&limit=1&media=music"); const url = data.results?.[0]?.artworkUrl100?.replace("100x100bb","600x600bb") || null; artworkCache.set(key,url); return url; } catch { artworkCache.set(key,null); return null; }
}
const dataFile = () => path.join(app.getPath("userData"), "library.json");
const readStore = () => { try { return JSON.parse(fs.readFileSync(dataFile(),"utf8")); } catch { return {folders:[]}; } };
const writeStore = v => fs.writeFileSync(dataFile(),JSON.stringify(v,null,2));
function createWindow() {
  win = new BrowserWindow({width:1260,height:800,minWidth:980,minHeight:640,center:true,transparent:true,backgroundColor:"#00000000",title:"SHAKI MUSIC",frame:false,autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,"preload.cjs"),contextIsolation:true,nodeIntegration:false,sandbox:false}});
  if(app.isPackaged) win.loadFile(path.join(__dirname,"../dist/index.html")); else win.loadURL("http://127.0.0.1:5173");
}
app.whenReady().then(()=>{createWindow();app.on("activate",()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});});
app.on("window-all-closed",()=>{if(process.platform!=="darwin")app.quit();});
ipcMain.handle("window:minimize",()=>win?.minimize());
ipcMain.handle("window:maximize",()=>{if(win?.isMaximized())win.unmaximize();else win?.maximize();return !!win?.isMaximized();});
ipcMain.handle("window:close",()=>win?.close());
ipcMain.handle("window:isMaximized",()=>!!win?.isMaximized());
async function getMetadata(file){
 try{
  metadataModule ||= await import("music-metadata");
  const meta=await metadataModule.parseFile(file,{skipCovers:false,duration:true}), c=meta.common||{}, pic=c.picture?.[0];
  return {title:c.title||path.basename(file,path.extname(file)),artist:c.artist||c.albumartist||"هنرمند ناشناس",album:c.album||path.basename(path.dirname(file)),duration:meta.format?.duration||0,cover:pic&&pic.data.length<700000?"data:"+pic.format+";base64,"+pic.data.toString("base64"):null,year:c.year||null,genre:c.genre?.[0]||null};
 }catch{return {title:path.basename(file,path.extname(file)),artist:"هنرمند ناشناس",album:path.basename(path.dirname(file)),duration:0,cover:null};}
}
async function walk(dir,out=[],depth=0){
 if(depth>8||out.length>=5000)return out;
 let entries;try{entries=await fs.promises.readdir(dir,{withFileTypes:true});}catch{return out;}
 const dirs=[],files=[];
 for(const e of entries){const full=path.join(dir,e.name);if(e.isDirectory()){if(!["System Volume Information","$RECYCLE.BIN","Windows","Program Files","node_modules"].includes(e.name))dirs.push(full);}else if(AUDIO_EXT.has(path.extname(e.name).toLowerCase()))files.push(full);}
 for(let i=0;i<files.length;i+=4){
  const batch=files.slice(i,i+4);
  const found=await Promise.all(batch.map(async file=>{try{const s=await fs.promises.stat(file);return{id:file,path:file,url:pathToFileURL(file).href,size:s.size,...await getMetadata(file)};}catch{return null;}}));
  out.push(...found.filter(Boolean));if(out.length>=5000)break;
 }
 for(const folder of dirs){if(out.length>=5000)break;await walk(folder,out,depth+1);}
 return out;
}
ipcMain.handle("library:get",async()=>{const s=readStore();if(Array.isArray(s.tracks))return{folders:s.folders||[],tracks:s.tracks.filter(t=>t.path&&fs.existsSync(t.path))};const tracks=[];for(const f of s.folders||[])await walk(f,tracks);s.tracks=tracks;writeStore(s);return{folders:s.folders||[],tracks};});
ipcMain.handle("library:addFolder",async()=>{const r=await dialog.showOpenDialog(win,{properties:["openDirectory"]});if(r.canceled||!r.filePaths[0])return null;const folder=r.filePaths[0],s=readStore();s.folders=[...new Set([...(s.folders||[]),folder])];const tracks=await walk(folder);const merged=new Map((s.tracks||[]).map(t=>[t.id,t]));tracks.forEach(t=>merged.set(t.id,t));s.tracks=[...merged.values()];writeStore(s);return {folder,tracks};});
ipcMain.handle("library:rescan",async()=>{const s=readStore(),tracks=[];for(const f of s.folders||[])await walk(f,tracks);s.tracks=tracks;writeStore(s);return tracks;});
ipcMain.handle("library:chooseFiles",async()=>{const r=await dialog.showOpenDialog(win,{properties:["openFile","multiSelections"],filters:[{name:"Audio",extensions:[...AUDIO_EXT].map(x=>x.slice(1))}]});if(r.canceled)return[];const out=[];for(const f of r.filePaths){const s=await fs.promises.stat(f);out.push({id:f,path:f,url:pathToFileURL(f).href,size:s.size,...await getMetadata(f)});}return out;});
ipcMain.handle("library:paths",async(_,paths)=>{const out=[];for(const file of (Array.isArray(paths)?paths:[]).slice(0,200)){try{if(!AUDIO_EXT.has(path.extname(file).toLowerCase()))continue;const s=await fs.promises.stat(file);out.push({id:file,path:file,url:pathToFileURL(file).href,size:s.size,...await getMetadata(file)});}catch{}}return out;});
function getJson(url){return new Promise((resolve,reject)=>{const req=https.get(url,{headers:{"User-Agent":"SHAKI-MUSIC/2.0",Accept:"application/json"}},res=>{let b="";res.setEncoding("utf8");res.on("data",x=>b+=x);res.on("end",()=>{if(res.statusCode!==200)return reject(Error("HTTP "+res.statusCode));try{resolve(JSON.parse(b));}catch(e){reject(e);}});});req.setTimeout(7000,()=>req.destroy(Error("Request timeout")));req.on("error",reject);});}
ipcMain.handle("search:archive",async(_,query)=>{const q=String(query||"").trim().slice(0,160);if(!q)return[];const url="https://archive.org/advancedsearch.php?q="+encodeURIComponent(q+" AND mediatype:audio")+"&fl[]=identifier,title,creator,year&rows=30&page=1&output=json";const data=await getJson(url),docs=data.response?.docs||[];const results=await Promise.all(docs.map(async d=>{try{const m=await getJson("https://archive.org/metadata/"+encodeURIComponent(d.identifier));const f=(m.files||[]).find(x=>/\.(mp3|ogg|flac|m4a|wav|aac)$/i.test(x.name||"")&&x.size&&!x.source&&!String(x.name).includes("/"));if(!f)return null;return{id:"ia-"+d.identifier,title:d.title||d.identifier,artist:Array.isArray(d.creator)?d.creator[0]:(d.creator||"Internet Archive"),album:d.year?String(d.year):"Internet Archive",url:"https://archive.org/download/"+encodeURIComponent(d.identifier)+"/"+encodeURIComponent(f.name),source:"Internet Archive",pageUrl:"https://archive.org/details/"+encodeURIComponent(d.identifier),cover:"https://archive.org/services/img/"+encodeURIComponent(d.identifier),duration:Number(f.length||0),canDownload:true,size:Number(f.size||0)};}catch{return null;}}));return results.filter(Boolean);});
ipcMain.handle("download:audio",async(_,d)=>{const url=d?.url;if(typeof url!=="string"||!/^https?:\/\//i.test(url))throw Error("آدرس دانلود معتبر نیست.");const filename=String(d.filename||"audio.mp3").replace(/[<>:"/\\|?*\x00-\x1F]/g,"_").slice(0,150),r=await dialog.showSaveDialog(win,{defaultPath:filename});if(r.canceled||!r.filePath)return{canceled:true};await new Promise((resolve,reject)=>{const req=(url.startsWith("https:")?https:http).get(url,{headers:{"User-Agent":"SHAKI-MUSIC/2.0"}},res=>{if(res.statusCode>=300&&res.statusCode<400&&res.headers.location){res.resume();downloadRedirect(res.headers.location,r.filePath,resolve,reject);return;}if(res.statusCode!==200){res.resume();reject(Error("سرور فایل را ارائه نکرد."));return;}const w=fs.createWriteStream(r.filePath);res.pipe(w);w.on("finish",()=>w.close(resolve));w.on("error",reject);});req.on("error",reject);});return{canceled:false,path:r.filePath};});
function downloadRedirect(url,dest,resolve,reject){const req=(url.startsWith("https:")?https:http).get(url,res=>{if(res.statusCode!==200){res.resume();reject(Error("دانلود ناموفق بود."));return;}const w=fs.createWriteStream(dest);res.pipe(w);w.on("finish",()=>w.close(resolve));w.on("error",reject);});req.on("error",reject);}
ipcMain.handle("external:open",async(_,url)=>{if(typeof url==="string"&&/^https?:\/\//i.test(url))await shell.openExternal(url);return true;});
