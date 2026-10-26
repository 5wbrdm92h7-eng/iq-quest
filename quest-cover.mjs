/* IQ QUEST personalised X artwork, drawn locally — no image uploads or API.
 * X's automatic link card remains the shared static social-cover.jpg. These
 * custom images may be attached manually or through the device share sheet.
 */
export const QUEST_COVER_WIDTH=1200;
export const QUEST_COVER_HEIGHT=630;

const themes=[
 ['space',/\b(space|spaceship|star|stars|galaxy|galaxie|galaxien|cosmos|cosmic|planet|mars|moon|universe|weltraum|stern|mond|rakete|universum|astronaut)\b/i],
 ['football',/\b(football|soccer|world.?cup|stadium|fussball|fußball|stadion|elfmeter|bundesliga)\b/i],
 ['egypt',/(?:\b(?:egypt|egyptian|egypten|agypt|pyramid|pyramide|pharaoh|pharao|sphinx|nile|nil)\b|ägypt)/i],
 ['ocean',/\b(ocean|sea|seas|pirate|piraten|meer|ozean|underwater|unterwasser|island|insel)\b/i],
 ['jungle',/\b(jungle|dschungel|forest|wald|temple|tempel|aztec|maya|amazon|ruins|ruinen)\b/i]
];
export function chooseQuestCoverTheme(title='',topic=''){
 const haystack=String(title||'')+' '+String(topic||'');
 return themes.find(([,expression])=>expression.test(haystack))?.[0]||'mystery';
}
export function safeCoverTitle(title){
 const clean=String(title||'').replace(/[\u0000-\u001f\u007f<>]/g,' ').replace(/\s+/g,' ').trim();
 return (clean||'Your Onchain Quest').slice(0,80);
}
export function coverFilename(title){
 const slug=safeCoverTitle(title).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
  .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,45);
 return 'iq-quest-'+(slug||'quest')+'-x-cover.png';
}
function deterministicRandom(seed){
 let value=2166136261;
 for(const char of seed){value=Math.imul(value^char.charCodeAt(0),16777619)>>>0;}
 return ()=>{value^=value<<13;value^=value>>>17;value^=value<<5;return (value>>>0)/4294967296;};
}
function gradient(ctx,x,y,w,h,from,to){
 const g=ctx.createLinearGradient(x,y,x+w,y+h);g.addColorStop(0,from);g.addColorStop(1,to);return g;
}
function polygon(ctx,points,fill){
 ctx.fillStyle=fill;ctx.beginPath();ctx.moveTo(...points[0]);for(const p of points.slice(1))ctx.lineTo(...p);ctx.closePath();ctx.fill();
}
function circle(ctx,x,y,r,fill){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();}
function line(ctx,points,color,width=3){
 ctx.beginPath();ctx.moveTo(...points[0]);for(const p of points.slice(1))ctx.lineTo(...p);
 ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
}
function background(ctx,type,seed){
 const rand=deterministicRandom(seed);
 const palette={space:['#070e28','#18385a'],football:['#051d1b','#0a4936'],egypt:['#432c22','#b06a37'],ocean:['#071e31','#087c8c'],jungle:['#082a22','#195836'],mystery:['#0a1e1b','#2b4e3a']}[type];
 ctx.fillStyle=gradient(ctx,0,0,1200,630,...palette);ctx.fillRect(0,0,1200,630);
 if(type==='space'){
  for(let i=0;i<120;i++)circle(ctx,rand()*1200,rand()*600,rand()*2.2+.5,`rgba(220,245,255,${.26+rand()*.7})`);
  circle(ctx,1020,240,148,gradient(ctx,870,100,260,290,'#c8c8da','#536fbd'));
  ctx.beginPath();ctx.ellipse(1020,243,214,54,-.36,0,Math.PI*2);ctx.strokeStyle='#d8d4b6aa';ctx.lineWidth=15;ctx.stroke();
  circle(ctx,947,186,26,'#e7e2cd45');circle(ctx,1085,275,16,'#394e8545');
 }else if(type==='football'){
  for(let i=0;i<9;i++){ctx.fillStyle=i%2?'#185341':'#14503e';ctx.fillRect(700+i*64,0,64,630);}
  polygon(ctx,[[745,570],[1190,570],[1142,100],[796,100]],'#176345');
  ctx.strokeStyle='#d5fff0aa';ctx.lineWidth=5;ctx.strokeRect(805,150,330,370);
  ctx.beginPath();ctx.ellipse(965,337,84,84,0,0,Math.PI*2);ctx.stroke();
  circle(ctx,1030,385,109,'#f4efe0');polygon(ctx,[[1030,331],[1081,369],[1062,430],[995,431],[976,367]],'#152820');
  for(let i=0;i<5;i++){const a=i*Math.PI*2/5;circle(ctx,1030+Math.cos(a)*82,385+Math.sin(a)*82,17,'#193a30');}
 }else if(type==='egypt'){
  circle(ctx,1045,145,93,'#f5d18c');
  polygon(ctx,[[670,595],[944,142],[1150,595]],'#d5a365');polygon(ctx,[[944,142],[1150,595],[995,595]],'#925737');
  polygon(ctx,[[955,625],[1130,285],[1260,625]],'#dbad71');polygon(ctx,[[1130,285],[1260,625],[1170,625]],'#986242');
  polygon(ctx,[[720,630],[890,405],[1047,630]],'#a66e47');
  ctx.fillStyle='#e2ae67';ctx.beginPath();ctx.ellipse(900,635,700,95,0,0,Math.PI*2);ctx.fill();
 }else if(type==='ocean'){
  circle(ctx,1030,180,110,'#d7dcaf');
  for(let i=0;i<5;i++){
   const y=340+i*74;ctx.fillStyle=i%2?'#096375':'#0c4e67';ctx.beginPath();ctx.moveTo(600,y);
   for(let x=600;x<=1220;x+=28)ctx.lineTo(x,y+Math.sin((x+i*60)/60)*21);ctx.lineTo(1220,650);ctx.lineTo(600,650);ctx.closePath();ctx.fill();
  }
  polygon(ctx,[[940,419],[1090,417],[1170,453],[880,453]],'#172e35');
  polygon(ctx,[[1013,415],[1013,170],[1129,376]],'#e6d9ac');line(ctx,[[1011,175],[1011,421]],'#eee8d7',6);
 }else if(type==='jungle'){
  polygon(ctx,[[880,580],[1040,236],[1190,580]],'#54715d');polygon(ctx,[[905,570],[1045,340],[1165,570]],'#183b30');
  for(let row=0;row<5;row++){ctx.fillStyle=row%2?'#648565':'#3b604c';ctx.fillRect(937+row*20,388+row*39,203-row*40,13);}
  for(let i=0;i<45;i++){let x=680+rand()*560,y=rand()*660;circle(ctx,x,y,22+rand()*38,`rgba(24,94,52,${.22+rand()*.3})`);}
 }else{
  for(let i=0;i<11;i++){
   const x=700+i*48,y=155+(i%4)*40;ctx.save();ctx.translate(x,y);ctx.rotate(Math.PI/4);
   ctx.strokeStyle='#8de4a744';ctx.lineWidth=3;ctx.strokeRect(0,0,130+i*3,130+i*3);ctx.restore();
  }
  circle(ctx,1030,300,171,'#2f725533');circle(ctx,1030,300,115,'#c3e5a611');
 }
 // Uniform dark, high-contrast caption field independent of the artwork.
 const shade=ctx.createLinearGradient(0,0,940,0);shade.addColorStop(0,'#06110df7');shade.addColorStop(.61,'#071712ea');shade.addColorStop(1,'#07171205');
 ctx.fillStyle=shade;ctx.fillRect(0,0,1200,630);
}
function wrapText(ctx,text,maxWidth,maxLines){
 const words=text.split(' ');let lines=[],current='';
 for(const word of words){
  const candidate=current?current+' '+word:word;
  if(ctx.measureText(candidate).width<=maxWidth||!current){current=candidate;continue;}
  lines.push(current);current=word;
  if(lines.length===maxLines-1)break;
 }
 const consumed=lines.join(' ').split(' ').filter(Boolean).length;
 const rest=words.slice(consumed).join(' ');
 if(rest){current=rest;while(ctx.measureText(current).width>maxWidth&&current.length>1)current=current.slice(0,-2)+'…';}
 if(current)lines.push(current);
 return lines.slice(0,maxLines);
}
export function drawQuestCover(ctx,{title,topic='',difficulty=''}={}){
 if(!ctx||typeof ctx.fillRect!=='function')throw Error('Canvas is unavailable.');
 const name=safeCoverTitle(title),theme=chooseQuestCoverTheme(name,topic);
 background(ctx,theme,name+' '+topic);
 ctx.fillStyle='#72fa92';ctx.font='900 33px system-ui, sans-serif';ctx.fillText('IQ',66,82);
 ctx.fillStyle='#f1d5a5';ctx.fillText(' QUEST',111,82);
 line(ctx,[[65,112],[663,112]],'#7be68f',3);
 ctx.fillStyle='#9df6c4';ctx.font='800 21px system-ui, sans-serif';ctx.fillText('YOUR COMMUNITY’S CHALLENGE',66,171);
 ctx.font='bold 62px Georgia, serif';let lines=wrapText(ctx,name,735,3);
 if(lines.some(value=>ctx.measureText(value).width>735)){
  ctx.font='bold 52px Georgia, serif';lines=wrapText(ctx,name,735,3);
 }
 ctx.fillStyle='#f9e2b4';for(let i=0;i<lines.length;i++)ctx.fillText(lines[i],66,264+i*82);
 const difficultyLabel=['easy','medium','hard'].includes(String(difficulty).toLowerCase())?' · '+String(difficulty).toUpperCase():'';
 ctx.fillStyle='#cff5d7';ctx.font='800 22px system-ui, sans-serif';ctx.fillText('15 ONCHAIN PUZZLES · SOLANA DEVNET'+difficultyLabel,66,546);
 ctx.fillStyle='#8cd4ad';ctx.font='700 19px system-ui, sans-serif';ctx.fillText('POWERED BY IQ LABS  ·  IQ QUEST',66,587);
 return {title:name,theme};
}
export function createQuestCoverCanvas(options={}){
 if(typeof document==='undefined')throw Error('Cover creation needs a browser.');
 const canvas=document.createElement('canvas');canvas.width=QUEST_COVER_WIDTH;canvas.height=QUEST_COVER_HEIGHT;
 drawQuestCover(canvas.getContext('2d'),options);return canvas;
}
export function previewQuestCover(canvas,options={}){
 if(!canvas?.getContext)throw Error('No image preview available.');
 canvas.width=QUEST_COVER_WIDTH;canvas.height=QUEST_COVER_HEIGHT;
 return drawQuestCover(canvas.getContext('2d'),options);
}
async function makePngFile(options){
 const canvas=createQuestCoverCanvas(options);
 const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('Cannot export PNG image.')),'image/png'));
 return new File([blob],coverFilename(options?.title),{type:'image/png'});
}
function saveFile(file){
 const href=URL.createObjectURL(file),link=document.createElement('a');link.href=href;link.download=file.name;
 document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(href),30000);
}
export async function downloadQuestCover(options={}){
 const file=await makePngFile(options);saveFile(file);return file.name;
}
/** Opens native phone share sheet with the image and game link when supported;
 * otherwise downloads PNG. It never claims that X attached the image itself. */
export async function shareQuestCover(options={}){
 const file=await makePngFile(options);
 const canShare=typeof navigator!=='undefined'&&typeof navigator.share==='function'&&
  typeof navigator.canShare==='function'&&navigator.canShare({files:[file]});
 if(canShare){
  try{await navigator.share({title:safeCoverTitle(options.title),text:'🧠 Try my onchain IQ QUEST! Powered by IQ Labs.',url:options.url||undefined,files:[file]});return 'shared';}
  catch(error){if(error?.name==='AbortError')return 'cancelled';}
 }
 saveFile(file);return 'downloaded';
}
