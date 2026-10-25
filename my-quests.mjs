/* IQ QUEST V5.35 — public, read-only Devnet creator history.
 * Published data remains on Solana. Local storage is only a convenient cache.
 * No wallet connection, signature, server account or payment is required to search.
 */
import {readQuestOnchain,isSolanaSignature} from './onchain-bridge.js?v=517';

export const MY_QUESTS_KEY='iqquest_verified_creator_links_v535';
export const HISTORY_PAGE_LIMIT=12;
const MAX_SAVED=100;
const DEVNET_RPC='https://api.devnet.solana.com';
const IQ_LABS_PROGRAM='9KLLchQVJpGkw4jPuUmnvqESdR7mtNCYr3qS4iQLabs';
const INVENTORY_SEED='inventorymY}AGBJiqLabs';

function cleanRecord(value){
 if(!value||typeof value!=='object'||!isSolanaSignature(value.signature))return null;
 const title=String(value.title||'Untitled Onchain Quest').trim().slice(0,100);
 const publisher=typeof value.publisher==='string'&&/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.publisher)?value.publisher:'';
 return {signature:value.signature,title,network:'devnet',publisher,
  difficulty:['Easy','Medium','Hard'].includes(value.difficulty)?value.difficulty:'',
  verifiedAt:Number.isFinite(value.verifiedAt)&&value.verifiedAt>0?Math.floor(value.verifiedAt):Date.now()};
}
export function readMyQuests(storage=globalThis.localStorage){
 try{
  const raw=JSON.parse(storage.getItem(MY_QUESTS_KEY)||'[]');
  if(!Array.isArray(raw))return [];
  const seen=new Set();
  return raw.slice(0,MAX_SAVED).map(cleanRecord).filter(item=>{
   if(!item||seen.has(item.signature))return false;
   seen.add(item.signature);return true;
  });
 }catch(_e){return [];}
}
export function rememberVerifiedQuest(record,storage=globalThis.localStorage){
 const valid=cleanRecord(record);
 if(!valid)throw Error('Only a confirmed Solana quest signature can be saved.');
 const old=readMyQuests(storage);
 const previous=old.find(item=>item.signature===valid.signature);
 const merged={...previous,...valid,publisher:valid.publisher||previous?.publisher||'',
  difficulty:valid.difficulty||previous?.difficulty||'',verifiedAt:previous?.verifiedAt||valid.verifiedAt};
 const list=[merged,...old.filter(item=>item.signature!==valid.signature)].slice(0,MAX_SAVED);
 storage.setItem(MY_QUESTS_KEY,JSON.stringify(list));
 return merged;
}
// Earlier Devnet editions already saved signed publication receipts locally.
// They must be independently read from Solana before entering My Quests.
export function findLegacyDevnetSignatures(storage=globalThis.localStorage){
 const found=new Set();
 const readRecord=key=>{
  try{const rec=JSON.parse(storage.getItem(key)||'null');if(isSolanaSignature(rec?.signature))found.add(rec.signature);}catch(_e){}
 };
 for(const key of ['iqquest_devnet_completed_v50','iqquest_devnet_storage_only_completed_v516_story_free'])readRecord(key);
 try{const last=storage.getItem('iqquest_devnet_last_sig_v45');if(isSolanaSignature(last))found.add(last);}catch(_e){}
 try{
  const count=Math.min(storage.length||0,500);
  for(let i=0;i<count;i++){
   const key=storage.key(i);
   if(typeof key==='string'&&key.startsWith('iqquest_devnet_storage_only_completed_v517_'))readRecord(key);
  }
 }catch(_e){}
 return [...found].slice(0,50);
}
export function signatureFromPlayerLink(input){
 const value=String(input||'').trim();
 if(isSolanaSignature(value))return value;
 try{
  const url=new URL(value);
  if(!['https:','http:'].includes(url.protocol))return null;
  if(url.searchParams.get('network')==='mainnet-beta')return null;
  const signature=url.searchParams.get('tx')||'';
  return isSolanaSignature(signature)?signature:null;
 }catch(_e){return null;}
}
export function makePublishedQuestUrl(signature,baseUrl=globalThis.location.href){
 if(!isSolanaSignature(signature))throw Error('Not a Solana publication signature.');
 const url=new URL('index.html',baseUrl);
 url.searchParams.set('tx',signature);
 url.searchParams.set('network','devnet');
 return url.toString();
}
export function makeCreatorShareUrl(item,baseUrl=globalThis.location.href){
 const play=new URL(makePublishedQuestUrl(item.signature,baseUrl));
 play.searchParams.set('battle','1');
 const intent=new URL('https://x.com/intent/tweet');
 intent.searchParams.set('text',`🧠 I created “${item.title}” on IQ QUEST! Can you solve all 15 puzzles? ⚔ Challenge your friends and community! Quest data stored on Solana Devnet (beta), powered by IQ Labs. #IQQUEST #Solana`);
 intent.searchParams.set('url',play.toString());
 return intent.toString();
}
function verifiedItemFromRead(signature,read,publisher='',time=Date.now()){
 const data=read?.data;
 if(data?.iqquest?.format!=='IQ-QUEST-ONCHAIN-V1'||data.iqquest.network!=='devnet'||
   !Array.isArray(data.levels)||data.levels.length!==15||typeof data.iqquest.publisher!=='string')
  throw Error('Not a supported verified IQ QUEST Devnet publication.');
 if(publisher&&data.iqquest.publisher!==publisher)throw Error('The quest belongs to a different publisher wallet.');
 return cleanRecord({signature,title:data.title,difficulty:data.difficulty,publisher:data.iqquest.publisher,verifiedAt:time});
}
export async function verifyOneQuest(signature,{reader=readQuestOnchain}={}){
 if(!isSolanaSignature(signature))throw Error('Enter a valid Solana Devnet transaction signature or game link.');
 const read=await reader(signature,'devnet');
 return verifiedItemFromRead(signature,read);
}
export async function findWalletDevnetQuests(address,{before='',limit=HISTORY_PAGE_LIMIT,onProgress=()=>{},reader=readQuestOnchain,web3,connection}={}){
 const input=String(address||'').trim();
 if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(input))throw Error('Enter a PUBLIC Solana wallet address, never a recovery phrase.');
 const sdkWeb3=web3||await import('https://esm.sh/@solana/web3.js@1.99.0?bundle');
 let wallet;
 try{wallet=new sdkWeb3.PublicKey(input);}catch(_e){throw Error('This is not a valid Solana wallet address.');}
 const publisher=wallet.toBase58();
 if(publisher!==input)throw Error('This wallet address is not in canonical Solana format.');
 const program=new sdkWeb3.PublicKey(IQ_LABS_PROGRAM);
 const seed=new TextEncoder().encode(INVENTORY_SEED);
 const inventory=sdkWeb3.PublicKey.findProgramAddressSync([seed,wallet.toBytes()],program)[0];
 const rpc=connection||new sdkWeb3.Connection(DEVNET_RPC,'confirmed');
 const capped=Math.max(1,Math.min(20,Math.floor(Number(limit)||HISTORY_PAGE_LIMIT)));
 const options={limit:capped};
 if(before){if(!isSolanaSignature(before))throw Error('Invalid search cursor.');options.before=before;}
 const entries=await rpc.getSignaturesForAddress(inventory,options,'confirmed');
 if(!Array.isArray(entries))throw Error('Solana returned an invalid wallet publication history.');
 const records=[];let failures=0;
 for(let i=0;i<entries.length;i++){
  const entry=entries[i];
  onProgress(`Checking onchain publication ${i+1} of ${entries.length}…`);
  if(entry?.err||!isSolanaSignature(entry?.signature))continue;
  try{
   const read=await reader(entry.signature,'devnet');
   const record=verifiedItemFromRead(entry.signature,read,publisher,(entry.blockTime||0)*1000||Date.now());
   if(record)records.push(record);
  }catch(_e){failures++;}
 }
 if(failures&&records.length===0)throw Error('Solana could not verify the retrieved transactions right now. Please try again later, or restore a known game link below.');
 return {records,publisher,checked:entries.length,failures,
  nextBefore:entries.length===capped?entries[entries.length-1]?.signature||'':''};
}

function startMyQuestsUI(){
 const root=document.getElementById('my-quests');
 if(!root)return;
 const el=id=>document.getElementById(id);
 const status=(message,error=false)=>{el('my-quests-status').textContent=message;el('my-quests-status').classList.toggle('bad',error);};
 let busy=false,searchWallet='',nextBefore='',volatile=[];
 const allRecords=()=>{
  const seen=new Set();
  return [...volatile,...readMyQuests()].filter(record=>{
   if(seen.has(record.signature))return false;
   seen.add(record.signature);return true;
  });
 };
 const remember=record=>{
  volatile=[record,...volatile.filter(item=>item.signature!==record.signature)];
  try{rememberVerifiedQuest(record);}catch(_e){status('Your verified quest is visible here, but this browser did not allow saving it for later.',true);}
 };
 const render=()=>{
  const list=el('my-quests-list');list.replaceChildren();
  const records=allRecords();
  el('my-quests-count').textContent=records.length+' SAVED QUEST'+(records.length===1?'':'S');
  if(!records.length){
   const empty=document.createElement('p');empty.className='tiny-note';empty.textContent='No verified links on this device yet. Recover earlier quests below, or search your PUBLIC creator wallet on Solana Devnet.';list.append(empty);return;
  }
  for(const item of records){
   const card=document.createElement('article');card.className='my-quest-card';
   const title=document.createElement('h4');title.textContent=item.title;
   const subtitle=document.createElement('p');subtitle.textContent=['✓ DEVNET ONCHAIN',item.difficulty,item.publisher?item.publisher.slice(0,7)+'…'+item.publisher.slice(-5):''].filter(Boolean).join(' · ');
   const actions=document.createElement('div');actions.className='my-quest-actions';
   const play=document.createElement('a');play.className='btn btn-green';play.textContent='▶ PLAY';play.href=makePublishedQuestUrl(item.signature);play.target='_blank';play.rel='noopener noreferrer';
   const copy=document.createElement('button');copy.type='button';copy.className='btn btn-outline';copy.textContent='⧉ COPY LINK';
   copy.addEventListener('click',async()=>{
    const url=makePublishedQuestUrl(item.signature);
    try{await navigator.clipboard.writeText(url);copy.textContent='✓ COPIED';}catch(_e){prompt('Copy your player link:',url);}
   });
   const share=document.createElement('a');share.className='btn btn-gold';share.textContent='↗ SHARE ON X';share.href=makeCreatorShareUrl(item);share.target='_blank';share.rel='noopener noreferrer';
   actions.append(play,copy,share);card.append(title,subtitle,actions);list.append(card);
  }
 };
 const setBusy=value=>{
  busy=value;
  for(const id of ['my-quests-recover-device','my-quests-find-wallet','my-quests-more','my-quests-recover-link'])el(id).disabled=value;
 };
 el('my-quests-recover-device').addEventListener('click',async()=>{
  if(busy)return;
  const signatures=findLegacyDevnetSignatures().filter(sig=>!allRecords().some(item=>item.signature===sig));
  if(!signatures.length){status('No older unsaved quest receipts found on this device. If you switched phones, use your public wallet address below.');return;}
  setBusy(true);let recovered=0,failed=0;
  try{
   for(let i=0;i<signatures.length;i++){
    status(`Checking saved onchain receipt ${i+1}/${signatures.length}…`);
    try{remember(await verifyOneQuest(signatures[i]));recovered++;render();}catch(_e){failed++;}
   }
   status(`✓ Restored ${recovered} verified quest(s) from this device.`+(failed?' '+failed+' could not be verified; you can retry later.':''),!recovered&&!!failed);
  }finally{setBusy(false);}
 });
 el('my-quests-recover-link').addEventListener('click',async()=>{
  if(busy)return;
  const signature=signatureFromPlayerLink(el('my-quests-link').value);
  if(!signature){status('Paste a Devnet player URL containing ?tx=… or the final Solana publication signature.',true);return;}
  setBusy(true);
  try{
   status('Verifying all 15 questions directly from Solana Devnet…');
   remember(await verifyOneQuest(signature));render();
   status('✓ Quest verified onchain and added to My Quests. No wallet was connected.');
   el('my-quests-link').value='';
  }catch(error){status('Could not recover this link: '+String(error?.message||error),true);}finally{setBusy(false);}
 });
 async function findForWallet(more=false){
  if(busy)return;
  const address=el('my-quests-wallet').value.trim();
  if(more&&(!nextBefore||address!==searchWallet)){status('Start a new wallet search first.',true);return;}
  setBusy(true);
  try{
   status('Looking up the wallet’s public IQ Labs inventory on Solana Devnet…');
   const result=await findWalletDevnetQuests(address,{before:more?nextBefore:'',onProgress:message=>status(message)});
   searchWallet=result.publisher;nextBefore=result.nextBefore;
   let added=0;
   for(const record of result.records){
    const known=allRecords().some(item=>item.signature===record.signature);
    remember(record);if(!known)added++;
   }
   render();
   el('my-quests-more').classList.toggle('hidden',!nextBefore);
   try{localStorage.setItem('iqquest_my_wallet_address_v535',searchWallet);}catch(_e){}
   status(`✓ ${result.records.length} IQ QUEST publication(s) verified in ${result.checked} recent inventory record(s); ${added} newly added.`+
    (result.failures?' Some records could not be read; retry the search later.':'')+
    (nextBefore?' Tap LOAD MORE to check older publications.':' No wallet connection or payment needed.'));
  }catch(error){status('Could not search this wallet: '+String(error?.message||error),true);}
  finally{setBusy(false);}
 }
 el('my-quests-find-wallet').addEventListener('click',()=>{void findForWallet(false);});
 el('my-quests-more').addEventListener('click',()=>{void findForWallet(true);});
 el('my-quests-wallet').addEventListener('input',()=>{nextBefore='';el('my-quests-more').classList.add('hidden');});
 try{el('my-quests-wallet').value=localStorage.getItem('iqquest_my_wallet_address_v535')||'';}catch(_e){}
 const nav=el('nav-my-quests');
 nav?.addEventListener('click',()=>{root.open=true;render();});
 root.addEventListener('toggle',()=>{if(root.open)render();});
 window.addEventListener('iqquest:quest-verified',event=>{
  const detail=event.detail||{};
  if(detail.network!=='devnet')return;
  const signature=signatureFromPlayerLink(detail.url);
  if(!signature)return;
  remember({signature,title:detail.title,network:'devnet'});render();
 });
 render();
}

if(typeof document!=='undefined')startMyQuestsUI();
