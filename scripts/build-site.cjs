// Build the same static assets used locally, without scraping or installing packages.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),output=path.join(root,'site-build');
// Only this known generated directory may be removed, including on Windows.
if(path.dirname(output)!==root||path.basename(output)!=='site-build')throw new Error('Invalid build directory.');
require('../build-download.cjs');
fs.rmSync(output,{recursive:true,force:true});
fs.cpSync(path.join(root,'dist'),output,{recursive:true});
fs.copyFileSync(path.join(root,'..','maple-journal-calculator.html'),path.join(output,'maple-journal-calculator.html'));
const commit=process.env.GITHUB_SHA||require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
if(!/^[a-f0-9]{40}$/.test(commit))throw new Error('Expected a full source commit SHA.');
fs.writeFileSync(path.join(output,'deployment.json'),JSON.stringify({commit})+'\n');
const html=fs.readFileSync(path.join(output,'index.html'),'utf8');
for(const match of html.matchAll(/(?:src|href)="([^"#?]+)"/g)){
  const name=match[1];if(/^(?:https?:|data:|\/)/.test(name))continue;
  if(!fs.existsSync(path.join(output,name)))throw new Error('Missing website asset: '+name);
}
for(const name of fs.readdirSync(output).filter(name=>name.endsWith('.js')))new vm.Script(fs.readFileSync(path.join(output,name),'utf8'),{filename:name});
for(const name of ['README.txt','FEATURES.txt','TODO.txt','VERIFICATION.txt'])if(fs.existsSync(path.join(output,name)))throw new Error('Internal document leaked into website: '+name);
console.log('Built site-build/ with validated scripts, local ETC assets, offline download, and deployment revision.');
