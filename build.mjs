import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
const modules=['math','model','demo','icons','renderer','exporter','importer','app'];
const sources=await Promise.all(modules.map(async name=>{
  const source=await readFile(new URL(`src/${name}.js`,import.meta.url),'utf8');
  return `\n// ── ${name}.js ──\n`+source.replace(/^import .*?;\s*$/gm,'').replace(/^export /gm,'');
}));
let html=await readFile(new URL('index.html',import.meta.url),'utf8');
const css=await readFile(new URL('styles.css',import.meta.url),'utf8');
const js=`(()=>{\n'use strict';\n${sources.join('\n')}\n})();`.replace(/<\/script/gi,'<\\/script');
html=html.replace('<link rel="stylesheet" href="styles.css">',()=>`<style>\n${css}\n</style>`)
 .replace('<script type="module" src="src/app.js"></script>',()=>`<script>\n${js}\n</script>`);
await mkdir(new URL('dist/',import.meta.url),{recursive:true});
await writeFile(new URL('dist/index.html',import.meta.url),html);
console.log(`Built dist/index.html: ${(Buffer.byteLength(html)/1024).toFixed(1)} KiB, zero external requests.`);
