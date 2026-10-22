// Build one self-contained Worker; the existing static files remain the editable source.
const fs=require('node:fs'),vm=require('node:vm');
const assets={},mime={html:'text/html',js:'text/javascript',css:'text/css',svg:'image/svg+xml',webmanifest:'application/manifest+json',txt:'text/plain'};
for(const name of fs.readdirSync('dist'))if(fs.statSync('dist/'+name).isFile()){
 const ext=name.split('.').pop();if(!mime[ext])throw Error('Unsupported asset: '+name);
 assets['/'+name]={type:mime[ext]+'; charset=utf-8',body:fs.readFileSync('dist/'+name,'utf8')};
}
const ctx={window:{}};vm.runInNewContext(assets['/data.js'].body,ctx);
const {cards,glossary}=ctx.window.IELTS_DATA;
fs.mkdirSync('dist/server',{recursive:true});fs.mkdirSync('dist/.openai',{recursive:true});
const core=fs.readFileSync('dist/cloud-state.js','utf8');
const output=core+'\nconst CLOUD_CARD_IDS='+JSON.stringify(cards.map(c=>c.id))+';\nconst CLOUD_WORDS='+JSON.stringify(Object.keys(glossary))+';\nconst CLOUD_ASSETS='+JSON.stringify(assets)+';\n'+fs.readFileSync('worker/index.js','utf8');
fs.writeFileSync('dist/server/index.js',output);
const manifest=fs.existsSync('.openai/hosting.json')?'.openai/hosting.json':'.openai/hosting.example.json';
fs.copyFileSync(manifest,'dist/.openai/hosting.json');
console.log('Built private cloud Worker:',Buffer.byteLength(output),'bytes');
