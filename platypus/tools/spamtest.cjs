// Spams every attack (mouse, keys, on-screen buttons) in each level; reports any unexpected return to the menu.
const http=require("http"),fs=require("fs"),path=require("path");
const puppeteer=require(path.join(__dirname,"..","..","node_modules","puppeteer"));
const ROOT=path.join(__dirname,"..");const MIME={".html":"text/html",".js":"text/javascript",".css":"text/css",".png":"image/png",".json":"application/json"};
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const LV=(process.argv[2]||"1,2,3,4,5,6,7,8,9,10,11").split(",").map(Number);
(async()=>{
 const srv=await new Promise(res=>{const s=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split("?")[0]);if(p.endsWith("/"))p+="index.html";fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{"Content-Type":MIME[path.extname(p)]||"application/octet-stream"});r.end(b);});});s.listen(0,"127.0.0.1",()=>res(s));});
 const browser=await puppeteer.launch({headless:true,args:["--use-angle=d3d11","--enable-gpu","--ignore-gpu-blocklist","--window-size=1280,720","--mute-audio"],defaultViewport:{width:1280,height:720}});
 const page=await browser.newPage();let errs=[];
 page.on("pageerror",e=>errs.push("pageerror: "+(e.stack||e.message)));
 page.on("console",m=>{if(m.type()==="error")errs.push("console: "+m.text());});
 await page.goto("http://127.0.0.1:"+srv.address().port+"/index.html");
 await page.waitForFunction(()=>window.__platy&&window.__platy.state);
 await page.evaluate(()=>window.__platy.unlockAll());
 const keys=["KeyF","KeyQ","KeyR","KeyG","KeyT","KeyX","KeyZ","KeyV","Digit1","Digit2","Digit3","Digit4","Space","KeyE","Enter"];
 for(const n of LV){
  errs=[];
  await page.evaluate(n=>window.__platy.startLevel(n),n);
  await page.waitForFunction(()=>window.__platy.state().mode==="level",{timeout:60000}).catch(()=>{});
  let bad=null;const t0=Date.now();
  while(Date.now()-t0<45000){
   for(let i=0;i<6;i++){await page.mouse.click(640+((i*97)%300)-150,360,{button:i%3?"left":"right"});}
   for(const k of keys){await page.keyboard.down(k);await page.keyboard.up(k);}
   await page.evaluate(()=>{for(const b of document.querySelectorAll(".abil")){if(b.offsetParent){const o={bubbles:true,pointerId:7,pointerType:"mouse"};b.dispatchEvent(new PointerEvent("pointerdown",o));b.dispatchEvent(new PointerEvent("pointerup",o));}}});
   const s=await page.evaluate(()=>{const s=window.__platy.state();return {mode:s.mode,step:s.step,beaten:s.progress.beaten}});
   if(s.mode!=="level"){bad=s;break;}
   // advance the story a bit so later phases get spammed too
   await page.evaluate(()=>{try{window.__platy.cinema.skip&&window.__platy.cinema.skip();}catch(e){}});
  }
  console.log("L"+n+": "+(bad?"LEFT LEVEL -> "+JSON.stringify(bad):"ok")+(errs.length?"\n  "+errs.slice(0,4).join("\n  "):""));
  if(!bad) await page.evaluate(()=>window.__platy.quit());
  await page.waitForFunction(()=>window.__platy.state().mode==="menu",{timeout:20000}).catch(()=>{});
 }
 await browser.close();srv.close();
})();
