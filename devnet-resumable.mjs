/* IQ QUEST V5.16 — story-free, size-safe, resumable Devnet writes using official IQ Labs instruction builders.
 * Mobile Phantom broadcasts approved transactions itself. Nothing is signed
 * automatically after a reload; the user must return and explicitly Publish.
 */
import {sha256Hex} from './payments/order-core.mjs';

const JOB_KEY='iqquest_devnet_mobile_upload_v1';
export const DEVNET_STORAGE_ONLY_JOB_KEY='iqquest_devnet_mobile_storage_only_v515';
// New inscription format: never overwrite a partially uploaded V5.15 story quest.
export const DEVNET_STORY_FREE_JOB_KEY='iqquest_devnet_mobile_storage_only_v516_no_story';
const SEND_CODE='ef8123d03ea86ec9';
const INVENTORY_CODE='51b1057ad57d15ee';
const ALPHABET='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export const DEVNET_MOBILE_JOB_KEY=JOB_KEY;

export function decodeSolanaBase58(value){
 if(typeof value!=='string'||!value.length)throw Error('Invalid base58 value.');
 let n=0n;
 for(const char of value){const index=ALPHABET.indexOf(char);if(index<0)throw Error('Invalid base58 character.');n=n*58n+BigInt(index);}
 const bytes=[];
 while(n){bytes.unshift(Number(n&255n));n>>=8n;}
 for(const char of value){if(char!=='1')break;bytes.unshift(0);}
 return Uint8Array.from(bytes);
}
export function decodeIqInstruction(ix,program){
 if(!ix?.data||!ix.programId?.equals?.(program))return null;
 let b;
 try{b=decodeSolanaBase58(ix.data);}catch(_e){return null;}
 if(b.length<8)return null;
 const tag=Array.from(b.subarray(0,8),x=>x.toString(16).padStart(2,'0')).join('');
 if(tag!==SEND_CODE&&tag!==INVENTORY_CODE)return null;
 let p=8;
 const string=()=>{
  if(p+4>b.length)throw Error('Damaged IQ Labs instruction.');
  const len=new DataView(b.buffer,b.byteOffset+p,4).getUint32(0,true);p+=4;
  if(len>16000||p+len>b.length)throw Error('Oversized IQ Labs instruction field.');
  const text=new TextDecoder('utf-8',{fatal:true}).decode(b.subarray(p,p+len));p+=len;
  return text;
 };
 try{
  if(tag===SEND_CODE){const code=string(),beforeTx=string();return p+2===b.length?{type:'chunk',code,beforeTx}:null;}
  const onChainPath=string(),metadata=string();
  return p+1===b.length&&b[p]===0?{type:'final',onChainPath,metadata}:null;
 }catch(_e){return null;}
}
function saveJob(storage,job,jobKey=JOB_KEY){
 try{storage.setItem(jobKey,JSON.stringify(job));}
 catch(_e){throw Error('Browser storage is needed to resume Phantom Devnet uploads. No wallet request was started.');}
}
function getJob(storage,jobKey=JOB_KEY){
 let saved;
 try{saved=JSON.parse(storage.getItem(jobKey)||'null');}catch(_e){throw Error('Cannot read the saved Devnet upload. No transaction was requested.');}
 return saved&&typeof saved==='object'?saved:null;
}
export function getSavedMobileJob(storage=globalThis.localStorage,jobKey=JOB_KEY){return getJob(storage,jobKey);}

// Every SendCode transaction after the first contains an 88-character previous
// Solana signature. 850 data bytes with that signature made a 1,245-byte
// transaction on Phantom (Solana max 1,232). 800 leaves a safety margin.
export const DEVNET_CHUNK_BYTES=800;
export function splitDevnetChunks(payload){
 if(typeof payload!=='string'||!/^[\x00-\x7f]+$/.test(payload))
  throw Error('IQ Labs chunk input must be ASCII.');
 const chunks=[];
 for(let i=0;i<payload.length;i+=DEVNET_CHUNK_BYTES)chunks.push(payload.slice(i,i+DEVNET_CHUNK_BYTES));
 if(!chunks.length||chunks.length>=10)throw Error('Devnet upload must fit in 1–9 safe 800-byte IQ Labs chunks. Shorten the quest before signing.');
 return chunks;
}

async function findLanded({connection,address,program,kind,chunk,beforeTx,metadata,limit=50}){
 const entries=await connection.getSignaturesForAddress(address,{limit},'confirmed');
 for(const entry of entries){
  if(entry.err||!entry.signature)continue;
  const tx=await connection.getParsedTransaction(entry.signature,{commitment:'confirmed',maxSupportedTransactionVersion:0});
  if(!tx||tx.meta?.err)continue;
  for(const ix of tx.transaction?.message?.instructions||[]){
   const decoded=decodeIqInstruction(ix,program);
   if(kind==='chunk'&&decoded?.type==='chunk'&&decoded.code===chunk&&decoded.beforeTx===beforeTx)
    return entry.signature;
   if(kind==='final'&&decoded?.type==='final'&&decoded.onChainPath===beforeTx&&decoded.metadata===metadata)
    return entry.signature;
  }
 }
 return null;
}

async function waitForConfirmed(connection,signature){
 for(let i=0;i<5;i++){
  const result=await connection.getSignatureStatuses([signature],{searchTransactionHistory:true});
  const status=result?.value?.[0];
  if(status?.err)throw Error('Phantom submitted a failed Devnet transaction '+signature+'. Review it on Solana Explorer before retrying.');
  if(status?.confirmationStatus==='confirmed'||status?.confirmationStatus==='finalized')return;
  await new Promise(resolve=>setTimeout(resolve,1500));
 }
 throw Error('Phantom submitted transaction '+signature+' but Devnet confirmation is pending. Wait, then return to Publish to resume. Do not pay again.');
}

export async function publishResumableDevnet({sdk,web3,BufferClass,connection,wallet,provider,payload,preflight,onProgress=()=>{},storage=globalThis.localStorage,jobKey=JOB_KEY}){
 if(![JOB_KEY,DEVNET_STORAGE_ONLY_JOB_KEY,DEVNET_STORY_FREE_JOB_KEY].includes(jobKey))throw Error('Unsupported IQ Labs Devnet recovery namespace. No wallet request was started.');
 if(typeof provider?.signAndSendTransaction!=='function')throw Error('This wallet cannot broadcast an approved Devnet transaction.');
 if(!/^[\x00-\x7f]+$/.test(payload))throw Error('The packed onchain data must be ASCII to preserve IQ Labs chunk boundaries.');
 // V5.15 jobs retain the original 850-byte boundaries for safe legacy
 // recovery. New story-free jobs use 800 bytes and a separate local key.
 const chunks=jobKey===DEVNET_STORY_FREE_JOB_KEY?splitDevnetChunks(payload):
   Array.from({length:Math.ceil(payload.length/850)},(_,i)=>payload.slice(i*850,(i+1)*850));
 if(!chunks.length||chunks.length>=10)throw Error('Mobile Devnet upload must use 1–9 official IQ Labs chunks.');
 const digest=await sha256Hex(payload);
 const payer=wallet.toBase58();
 const program=new web3.PublicKey('9KLLchQVJpGkw4jPuUmnvqESdR7mtNCYr3qS4iQLabs');
 const codeAccount=web3.PublicKey.findProgramAddressSync([BufferClass.from('codemY}AGBJiqLabs'),wallet.toBuffer()],program)[0];
 const inventoryAccount=web3.PublicKey.findProgramAddressSync([BufferClass.from('inventorymY}AGBJiqLabs'),wallet.toBuffer()],program)[0];
 const receiver=new web3.PublicKey(sdk.constants.DEFAULT_WRITE_FEE_RECEIVER);
 const metadata=JSON.stringify({filetype:'application/json',method:0,filename:'iq-quest-15.json',total_chunks:chunks.length});
 const builder=sdk.contract.createInstructionBuilder(sdk.contract.IQ_IDL,program);
 let job=getJob(storage,jobKey);
 if(job&&(job.payer!==payer||job.digest!==digest))
  throw Error('An older IQ Labs Devnet upload is saved for a different wallet or quest. Do not overwrite a potentially submitted upload. Ask for recovery help.');
 if(!job){job={version:1,payer,digest,index:0,tail:'Genesis',pending:null,finalSignature:null};saveJob(storage,job,jobKey);}
 if(job.version!==1||!Number.isInteger(job.index)||job.index<0||job.index>chunks.length||typeof job.tail!=='string')
  throw Error('Saved Devnet upload state is invalid. Do not sign again until it has been checked.');
 if((job.index===0)!==(job.tail==='Genesis'))throw Error('Saved IQ Labs linked-list position is inconsistent. No wallet request was started.');
 if(job.finalSignature)return job.finalSignature;

 // Recover a wallet-broadcast transaction when Phantom reloaded the page before
 // JavaScript received its signature. Scan only the payer's deterministic IQ
 // Labs storage account; never mark progress without a verified onchain match.
 if(job.pending){
  const {type,index,tail,at,signature}=job.pending;
  if((type==='final'&&job.index!==chunks.length)||
     (type!=='final'&&(type!=='chunk'||index!==job.index||tail!==job.tail)))
   throw Error('Saved upload sequence is inconsistent. No transaction was signed.');
  onProgress('Checking whether Phantom submitted the previous '+(type==='final'?'publication':'chunk')+' before the page reloaded…');
  const found=await findLanded({connection,address:type==='final'?inventoryAccount:codeAccount,program,
   kind:type==='final'?'final':'chunk',chunk:chunks[index],beforeTx:tail,metadata});
  if(found){
   if(type==='final')job.finalSignature=found;
   else{job.index=index+1;job.tail=found;}
   job.pending=null;saveJob(storage,job,jobKey);
   onProgress('Recovered confirmed IQ Labs Devnet transaction '+found+'.');
  }else{
   // Wait through Solana blockhash expiry before permitting a second attempt.
   // A returned signature with unknown status is never treated as a failure.
   if(signature)throw Error('Wallet may have submitted '+signature+' but no matching Devnet record is readable yet. Wait and verify; no duplicate request was sent.');
   if(!Number.isFinite(at)||Date.now()-at<150000)
    throw Error('A Phantom request was interrupted. Devnet has no confirmed match yet. Wait about 3 minutes, then use Publish to safely resume.');
   job.pending=null;saveJob(storage,job,jobKey);
  }
 }
 if(job.finalSignature)return job.finalSignature;

 if(job.index>0){
  const status=(await connection.getSignatureStatuses([job.tail],{searchTransactionHistory:true}))?.value?.[0];
  if(status?.err||!['confirmed','finalized'].includes(status?.confirmationStatus))
   throw Error('The previous IQ Labs chunk '+job.tail+' is not confirmed on Devnet. No new wallet request was started.');
 }

 const submit=async (ix,type)=>{
  const tx=new web3.Transaction().add(
   web3.ComputeBudgetProgram.setComputeUnitPrice({microLamports:1000}),
   web3.ComputeBudgetProgram.setComputeUnitLimit({units:400000}),ix);
  tx.feePayer=wallet;
  tx.recentBlockhash=(await connection.getLatestBlockhash('confirmed')).blockhash;
  await preflight(tx);
  const record={type,index:job.index,tail:job.tail,at:Date.now(),signature:null};
  job.pending=record;saveJob(storage,job,jobKey);
  onProgress('Phantom will SIGN AND SEND '+type+' on Devnet ('+(job.index+1)+'/'+(chunks.length+1)+'). Confirm only if you trust the IQ Labs instruction.');
  let result;
  try{result=await provider.signAndSendTransaction(tx);}
  catch(error){
   // A wallet UI can disappear between signing and reporting. Keep the pending
   // marker so a returning user checks the chain before any new signature.
   throw Error('Phantom did not return a broadcast receipt: '+String(error?.message||error)+'. Check Devnet status before trying again.');
  }
  const signature=typeof result==='string'?result:result?.signature;
  if(typeof signature!=='string'||!/^[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(signature))
   throw Error('Phantom returned no valid Devnet signature. Wait and recover rather than approving again.');
  job.pending.signature=signature;saveJob(storage,job,jobKey);
  await waitForConfirmed(connection,signature);
  const verified=await findLanded({connection,address:type==='final'?inventoryAccount:codeAccount,
   program,kind:type==='final'?'final':'chunk',chunk:chunks[job.index],beforeTx:job.tail,metadata});
  if(verified!==signature)throw Error('Devnet receipt '+signature+' has not been matched to the expected IQ Labs '+type+'. Do not retry until it is checked.');
  job.pending=null;
  if(type==='final')job.finalSignature=signature;
  else{job.index++;job.tail=signature;}
  saveJob(storage,job,jobKey);
  return signature;
 };

 while(job.index<chunks.length){
  const ix=sdk.contract.sendCodeInstruction(builder,{user:wallet,code_account:codeAccount,system_program:web3.SystemProgram.programId},
   {code:chunks[job.index],before_tx:job.tail,method:0,decode_break:0});
  await submit(ix,'chunk');
  onProgress('IQ Labs Devnet chunk '+job.index+'/'+chunks.length+' confirmed.');
 }
 const last=job.tail;
 const ix=sdk.contract.userInventoryCodeInInstruction(builder,{
  user:wallet,user_inventory:inventoryAccount,system_program:web3.SystemProgram.programId,receiver
 },{on_chain_path:last,metadata,session:null});
 if(!ix.keys?.[0]?.pubkey.equals(wallet)||!ix.keys?.[1]?.pubkey.equals(inventoryAccount)||
    !ix.keys?.[3]?.pubkey.equals(receiver))throw Error('Unexpected IQ Labs final inventory accounts. No approval requested.');
 await submit(ix,'final');
 return job.finalSignature;
}
