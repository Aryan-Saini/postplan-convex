/** The page Aryan opens on his phone to read or keep files an agent sent him. */
export function downloadPage(
  slug: string,
  reason: string | undefined,
  files: { name: string; size: number; contentType: string; url: string }[],
): string {
  const esc = (v: string) =>
    v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const size = (n: number) =>
    n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`;

  const kind = (type: string, name: string) => {
    if (type.startsWith("image/")) return "image";
    if (type.startsWith("video/")) return "video";
    if (type.startsWith("audio/")) return "audio";
    if (type === "application/pdf") return "pdf";
    if (type.startsWith("text/") || /\.(md|txt|csv|log|json|ya?ml|toml|ini|py|jsx?|tsx?|sh|sql|html|css|rs|go)$/i.test(name))
      return "text";
    return "other";
  };

  const items = files
    .map((f, i) => {
      const k = kind(f.contentType, f.name);
      // Media renders inline; everything else previews on tap, so opening the page
      // never pulls down a PDF or a text file you did not ask for.
      const inline =
        k === "image"
          ? `<img src="${esc(f.url)}" alt="" loading="lazy">`
          : k === "video"
            ? `<video src="${esc(f.url)}" controls preload="metadata" playsinline></video>`
            : k === "audio"
              ? `<audio src="${esc(f.url)}" controls preload="metadata"></audio>`
              : "";
      const canPreview = k === "pdf" || k === "text";
      return `<li>
<div class="row"><div class="meta"><b>${esc(f.name)}</b><i>${size(f.size)}</i></div>
<div class="acts">${canPreview ? `<button data-i="${i}" data-k="${k}">Preview</button>` : ""}
<a href="${esc(f.url)}" download="${esc(f.name)}">Download</a></div></div>
${inline ? `<div class="media">${inline}</div>` : ""}
<div class="slot" id="slot-${i}"></div></li>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#000000"><title>Files for you</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#000;color:#f4f4f5;font:16px/1.45 system-ui,-apple-system,sans-serif;min-height:100vh}
main{width:min(620px,calc(100% - 32px));margin:0 auto;padding:48px 0 64px}
h1{font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#71717a;margin:0}
.reason{font-size:19px;font-weight:600;margin:12px 0 0;line-height:1.35}
ul{list-style:none;padding:0;margin:28px 0 0}
li{border-top:1px solid #1c1c1f;padding:18px 0}
.row{display:flex;gap:14px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.meta{min-width:0}
.meta b{display:block;font-weight:600;overflow-wrap:anywhere}
.meta i{font-style:normal;color:#71717a;font-size:13px;font-variant-numeric:tabular-nums}
.acts{display:flex;gap:8px;flex:none}
.acts button,.acts a{padding:9px 15px;border-radius:999px;font-size:13px;font-weight:600;cursor:pointer;text-decoration:none;border:1px solid #27272a;background:#0a0a0b;color:#e4e4e7}
.acts a{background:#fafafa;color:#000;border-color:transparent}
.acts button:hover{background:#18181b}
.media{margin-top:14px}
.media img,.media video{display:block;width:auto;max-width:100%;max-height:260px;object-fit:contain;background:#0a0a0b;border-radius:12px}
.media audio{width:100%}
.slot:not(:empty){margin-top:14px}
.slot iframe{width:100%;height:min(70vh,540px);border:0;border-radius:12px;background:#fff}
.slot pre{margin:0;max-height:340px;overflow:auto;background:#0a0a0b;border:1px solid #1c1c1f;border-radius:14px;padding:14px;font:13px/1.55 ui-monospace,SFMono-Regular,monospace;white-space:pre-wrap;overflow-wrap:anywhere;color:#d4d4d8}
.hint{margin-top:26px;font-size:13px;color:#52525b}
</style></head>
<body><main>
<h1>Files for you</h1>
${reason ? `<p class="reason">${esc(reason)}</p>` : ""}
<ul>${items || '<li class="hint">Nothing here.</li>'}</ul>
<div class="hint">${files.length} file(s) · previews open on tap; download to keep.</div>
</main>
<script>
var FILES=${JSON.stringify(files.map((f) => ({ url: f.url, name: f.name })))};
document.addEventListener('click',function(e){
  var b=e.target.closest('button[data-i]'); if(!b)return;
  var i=+b.getAttribute('data-i'), k=b.getAttribute('data-k'), slot=document.getElementById('slot-'+i);
  if(slot.innerHTML){slot.innerHTML='';b.textContent='Preview';return}
  b.textContent='Hide';
  if(k==='pdf'){slot.innerHTML='<iframe src="'+FILES[i].url+'"></iframe>';return}
  slot.innerHTML='<pre>Loading…</pre>';
  fetch(FILES[i].url).then(function(r){if(!r.ok)throw 0;return r.text()}).then(function(t){
    slot.querySelector('pre').textContent=t.length>20000?t.slice(0,20000)+'\\n\\n… truncated — download for the rest':t;
  }).catch(function(){slot.querySelector('pre').textContent='Preview unavailable — download instead.'});
});
</script></body></html>`;
}
