/** The page someone opens on a phone to send files in. Server-rendered, no build step. */
export function uploadPage(slug: string, reason: string | undefined, files: { name: string; size: number }[]): string {
  const esc = (v: string) =>
    v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const size = (n: number) =>
    n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`;

  const sent = files.length
    ? `<h2>Already sent · ${files.length}</h2><ul class="sent">${files
        .map((f) => `<li><span>${esc(f.name)}</span><i>${size(f.size)}</i></li>`)
        .join("")}</ul>`
    : "";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#000000"><title>Send files</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#000;color:#f4f4f5;font:16px/1.45 system-ui,-apple-system,sans-serif;min-height:100vh}
main{width:min(560px,calc(100% - 32px));margin:0 auto;padding:48px 0 64px}
h1{font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#71717a;margin:0}
.reason{font-size:19px;font-weight:600;margin:12px 0 0;line-height:1.35}
.drop{display:block;margin-top:28px;padding:44px 20px;text-align:center;border:1.5px dashed #3f3f46;border-radius:24px;background:#0a0a0b;cursor:pointer;transition:border-color .15s,background .15s}
.drop:hover,.drop.over{border-color:#a1a1aa;background:#131316}
.plus{display:grid;place-items:center;width:52px;height:52px;margin:0 auto;border:1px solid #3f3f46;border-radius:50%;font-size:24px;font-weight:300;color:#a1a1aa}
.drop b{display:block;margin-top:14px;font-size:15px}
.drop span{display:block;margin-top:4px;font-size:13px;color:#71717a}
input[type=file]{display:none}
ul{list-style:none;padding:0;margin:20px 0 0}
li{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:12px 0;border-top:1px solid #1c1c1f;font-size:14px}
li span{min-width:0;overflow-wrap:anywhere}
li i{flex:none;font-style:normal;color:#71717a;font-size:13px;font-variant-numeric:tabular-nums}
li button{flex:none;width:26px;height:26px;padding:0;border:1px solid #27272a;border-radius:50%;background:#0a0a0b;color:#a1a1aa;font-size:13px;cursor:pointer}
li button:hover{background:#dc2626;color:#fff;border-color:transparent}
h2{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#71717a;margin:32px 0 0}
.sent li{color:#a1a1aa}
button.send{width:100%;margin-top:24px;padding:16px;border:0;border-radius:16px;background:#fafafa;color:#000;font-size:16px;font-weight:650;cursor:pointer}
button.send:disabled{opacity:.35;cursor:default}
.bar{height:6px;margin-top:14px;border-radius:6px;background:#18181b;overflow:hidden}
.fill{height:100%;width:0;background:#22c55e;transition:width .2s}
#status{margin-top:12px;font-size:14px;color:#71717a;min-height:20px}
.ok{color:#22c55e}.bad{color:#f87171}
</style></head>
<body><main>
<h1>Send files</h1>
${reason ? `<p class="reason">${esc(reason)}</p>` : ""}
<label class="drop" id="drop">
  <input id="picker" type="file" multiple>
  <span class="plus">+</span>
  <b>Choose files</b>
  <span>or drop them here — any type, any size</span>
</label>
<ul id="queue"></ul>
<button class="send" id="send" disabled>Send</button>
<div class="bar"><div class="fill" id="fill"></div></div>
<div id="status"></div>
${sent}
</main>
<script>
var SLUG=${JSON.stringify(slug)};
var picker=document.getElementById('picker'),drop=document.getElementById('drop'),
    queue=document.getElementById('queue'),send=document.getElementById('send'),
    fill=document.getElementById('fill'),statusEl=document.getElementById('status');
var chosen=[];
function esc(s){var d=document.createElement('div');d.textContent=s;return d.innerHTML}
function fmt(n){return n<1024?n+' B':n<1048576?(n/1024).toFixed(0)+' KB':(n/1048576).toFixed(1)+' MB'}
function render(){
  queue.innerHTML=chosen.map(function(f,i){
    return '<li><span>'+esc(f.name)+'</span><i>'+fmt(f.size)+'</i>'+
           '<button data-i="'+i+'" aria-label="Remove">&#10005;</button></li>';
  }).join('');
  send.disabled=!chosen.length;
  send.textContent=chosen.length?'Send '+chosen.length+' file'+(chosen.length>1?'s':''):'Send';
}
queue.addEventListener('click',function(e){
  var b=e.target.closest('button[data-i]'); if(!b)return;
  chosen.splice(+b.getAttribute('data-i'),1); render();
});
picker.addEventListener('change',function(){chosen=chosen.concat([].slice.call(picker.files));picker.value='';render()});
['dragenter','dragover'].forEach(function(ev){drop.addEventListener(ev,function(e){e.preventDefault();drop.classList.add('over')})});
['dragleave','drop'].forEach(function(ev){drop.addEventListener(ev,function(e){e.preventDefault();drop.classList.remove('over')})});
drop.addEventListener('drop',function(e){if(e.dataTransfer&&e.dataTransfer.files.length){chosen=chosen.concat([].slice.call(e.dataTransfer.files));render()}});
send.onclick=async function(){
  send.disabled=true; var done=0;
  try{
    for(var i=0;i<chosen.length;i++){
      var f=chosen[i], type=f.type||'application/octet-stream';
      statusEl.className=''; statusEl.textContent='Sending '+f.name+'…';
      var r=await fetch('/api/u/'+SLUG+'/sign',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name:f.name,contentType:type})});
      if(!r.ok)throw new Error('Could not prepare upload ('+r.status+')');
      var slot=await r.json();
      var put=await fetch(slot.url,{method:'PUT',headers:{'Content-Type':type},body:f});
      if(!put.ok)throw new Error('Upload failed ('+put.status+')');
      var rec=await fetch('/api/u/'+SLUG+'/record',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({key:slot.key,name:f.name,size:f.size,contentType:type})});
      if(!rec.ok)throw new Error('Could not record upload ('+rec.status+')');
      done++; fill.style.width=(done/chosen.length*100)+'%';
    }
    statusEl.className='ok'; statusEl.textContent='Sent '+done+' file'+(done>1?'s':'')+'. You can close this page.';
    chosen=[]; render(); setTimeout(function(){location.reload()},900);
  }catch(e){statusEl.className='bad'; statusEl.textContent=e.message; send.disabled=false}
};
render();
</script></body></html>`;
}
