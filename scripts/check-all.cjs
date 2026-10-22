const {execFileSync}=require('node:child_process'),path=require('node:path');
const root=path.resolve(__dirname,'..');
for(const [file,dir] of [['check.cjs',''],['check-cloud-state.cjs',''],['scripts/build-cloud.cjs',''],['check-cloud.cjs',''],['check.mjs','checkin-status']]){
 execFileSync(process.execPath,[file],{cwd:path.join(root,dir),stdio:'inherit'});
}
