'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
require('./atlas-locales.js');require('./atlas-shell-locales.js');
const {validate,defaults}=require('./atlas-preferences.js');
const locales=['en','es','fr','zh-Hans','ar','de'],catalogs=globalThis.AtlasLocales;
assert.deepEqual(validate(null),defaults);
assert.deepEqual(validate({language:'xx',theme:'remote',textSize:'500%',contrast:'yes',reduceMotion:1}),defaults);
assert.deepEqual(validate({language:'ar',theme:'dark',textSize:'xlarge',contrast:true,reduceMotion:true,record:{secret:'not saved'}}),
  {language:'ar',theme:'dark',textSize:'xlarge',contrast:true,reduceMotion:true});
console.log('PASS display preferences validate only known viewer-local values');
const keys=Object.keys(catalogs.en).sort();
const parameters=text=>[...String(text).matchAll(/\{([\w.-]+)\}/g)].map(match=>match[1]).sort();
for(const locale of locales){
 assert.deepEqual(Object.keys(catalogs[locale]).sort(),keys,locale+' catalog key parity');
 for(const key of keys)assert.deepEqual(parameters(catalogs[locale][key]),parameters(catalogs.en[key]),locale+':'+key);
}
for(const name of ['bond-atlas.html','atlas-preferences.js']){
 const source=fs.readFileSync(path.join(__dirname,name),'utf8');
 for(const match of source.matchAll(/['"]((?:shell|viewer|prefs|explorer)\.[\w.-]+)['"]/g)){
  if(match[1].endsWith('.'))continue;
  for(const locale of locales)assert.equal(typeof catalogs[locale][match[1]],'string',name+': '+locale+': '+match[1]);
 }
}
console.log('PASS '+keys.length+' complete message keys in six locales, interpolation and shell bindings');
function rgb(hex){let v=hex.slice(1);if(v.length===3)v=[...v].map(x=>x+x).join('');return [0,2,4].map(i=>parseInt(v.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);}
function luminance(hex){const v=rgb(hex);return v[0]*.2126+v[1]*.7152+v[2]*.0722;}
function ratio(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
const html=fs.readFileSync(path.join(__dirname,'bond-atlas.html'),'utf8');
const palette=block=>Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*[;}]/g)].map(match=>[match[1],match[2]]));
const light=palette(html.match(/:root\s*\{([\s\S]*?)\}/)[1]);
const dark={...light,...palette(html.match(/:root:not\(\[data-theme="light"\]\)\s*\{([\s\S]*?)\}/)[1])};
for(const [name,colors] of Object.entries({light,dark})){
 for(const background of ['bg','surface','stage','stage-end'])for(const foreground of ['ink','muted'])assert(ratio(colors[foreground],colors[background])>=4.5,name+': '+foreground+' on '+background);
 assert(ratio(colors['on-accent'],colors.accent)>=4.5,name+' primary action contrast');
 assert(ratio(colors.error,colors['error-bg'])>=4.5,name+' error contrast');
}
assert(ratio('#6e8493',light.surface)>=3,'Light field boundary contrast');
assert(ratio('#7d95ab',dark.surface)>=3,'Dark field boundary contrast');
console.log('PASS normal light/dark text, action, error and field-boundary contrast');
const fontRoot=path.join(__dirname,'vendor/fonts'),manifest=JSON.parse(fs.readFileSync(path.join(fontRoot,'manifest.json'),'utf8'));
for(const file of manifest.files){
 assert.match(file.name,/^(arabic|han|body|display|mono)-[a-f0-9]{16}\.woff2$/);
 const bytes=fs.readFileSync(path.join(fontRoot,file.name));assert.equal(bytes.subarray(0,4).toString(),'wOF2');
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),file.sha256);
}
const fontCSS=fs.readFileSync(path.join(__dirname,'atlas-fonts.css'),'utf8');
function rangesFor(family){return [...fontCSS.matchAll(/@font-face\s*\{([^}]+)\}/g)].filter(match=>match[1].includes('"'+family+'"')).flatMap(match=>match[1].match(/unicode-range:\s*([^;]+)/)[1].split(',').map(item=>{
 const value=item.trim().slice(2);if(value.includes('?'))return [parseInt(value.replace(/\?/g,'0'),16),parseInt(value.replace(/\?/g,'f'),16)];
 const [lo,hi=lo]=value.split('-');return [parseInt(lo,16),parseInt(hi,16)];
}));}
for(const [locale,family,needed] of [['zh-Hans','Atlas Han',point=>point>=0x4e00&&point<=0x9fff],['ar','Atlas Arabic',point=>point>=0x600&&point<=0x8ff]]){
 const ranges=rangesFor(family),characters=new Set(Object.values(catalogs[locale]).join(''));
 for(const character of characters){const point=character.codePointAt(0);if(needed(point))assert(ranges.some(([lo,hi])=>lo<=point&&point<=hi),locale+' missing local glyph U+'+point.toString(16));}
}
console.log('PASS local language font integrity and Arabic/CJK interface glyph-range coverage');
