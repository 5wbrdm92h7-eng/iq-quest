/* IQ QUEST V5.15 — recoverable Phantom Devnet storage-only test, with paid publishing unchanged. */
import {MAINNET_CLIENT_ENABLED} from './payments/client-bridge.mjs';
import {sha256Hex,verifyOrderInputs} from './payments/order-core.mjs';
const DEVNET_RPC='https://api.devnet.solana.com';
const MAINNET_RPC='https://api.mainnet-beta.solana.com';
// Devnet must not depend on the server-only Mainnet publication module.
// That module is imported only inside the disabled Mainnet branch below.
const IQ_PROGRAM='9KLLchQVJpGkw4jPuUmnvqESdR7mtNCYr3qS4iQLabs';
export const isSolanaSignature=value=>typeof value==='string' && /^[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(value);
const PACKED_FORMAT='IQQUEST-GZIP-V1';
const MAX_UNPACKED_BYTES=120000;
// A browser-wallet IQ Labs write uses 850-byte chunks. Fewer than ten chunks
// keeps us on the SDK's linked-list path, avoiding CreateSession on Devnet.
const DEVNET_PACKED_LIMIT=7600;

export async function packDevnetQuestPayload(raw){
 if(typeof raw!=='string'||!raw)throw Error('Cannot pack an empty quest.');
 const rawBytes=new TextEncoder().encode(raw);
 if(rawBytes.length>MAX_UNPACKED_BYTES)throw Error('The quest is too large to pack.');
 if(typeof CompressionStream!=='function')throw Error('This browser cannot compress a Devnet quest. Update Phantom before publishing.');
 const compressed=new Uint8Array(await new Response(new Blob([rawBytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
 const base64=btoa(Array.from(compressed,b=>String.fromCharCode(b)).join(''));
 const packed=JSON.stringify({iqquestPacked:{format:PACKED_FORMAT,sha256:await sha256Hex(raw),data:base64}});
 const size=new TextEncoder().encode(packed).length;
 if(size>DEVNET_PACKED_LIMIT)throw Error('Lossless onchain packing still needs '+size+' bytes. Maximum for this Devnet publishing route is '+DEVNET_PACKED_LIMIT+' bytes. The original 15 questions were not changed or signed.');
 return packed;
}

export async function unpackDevnetQuestPayload(stored){
 if(typeof stored!=='string')throw Error('IQ Labs returned no readable quest data.');
 let packed;
 try{packed=JSON.parse(stored)?.iqquestPacked;}catch(e){return stored;}
 if(!packed)return stored;
 if(packed.format!==PACKED_FORMAT||typeof packed.data!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(packed.data)||packed.data.length>16000||!/^([a-f0-9]{64})$/.test(packed.sha256||''))
  throw Error('Unknown or damaged compressed IQ QUEST inscription.');
 if(typeof DecompressionStream!=='function')throw Error('This browser cannot read compressed onchain quests. Update your browser.');
 const bytes=Uint8Array.from(atob(packed.data),c=>c.charCodeAt(0));
 const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
 const chunks=[];let length=0;
 try{
  while(true){
   const {value,done}=await reader.read();
   if(done)break;
   length+=value.length;
   if(length>MAX_UNPACKED_BYTES)throw Error('The decompressed quest exceeds the safety limit.');
   chunks.push(value);
  }
 }catch(e){try{await reader.cancel();}catch(_e){}throw Error('Could not safely decompress the onchain quest: '+String(e?.message||e));}
 const rawBytes=new Uint8Array(length);let offset=0;
 for(const chunk of chunks){rawBytes.set(chunk,offset);offset+=chunk.length;}
 const raw=new TextDecoder('utf-8',{fatal:true}).decode(rawBytes);
 if(await sha256Hex(raw)!==packed.sha256)throw Error('The onchain quest failed its SHA-256 integrity check.');
 return raw;
}
// The storage-only test is deliberately a different kind of Devnet inscription:
// no test payment is accepted, claimed, or fabricated. Mainnet never uses this.
export function buildDevnetQuestEnvelope({draft,plan,publisher,paymentTestSignature,storageOnly=false}){
 if(!draft||!Array.isArray(draft.levels)||draft.levels.length!==15)throw Error('Exactly 15 validated puzzles are needed.');
 if(!['community','unlisted'].includes(plan))throw Error('Invalid publishing plan.');
 if(typeof publisher!=='string'||!publisher.trim())throw Error('A connected publisher wallet is required.');
 const metadata={format:'IQ-QUEST-ONCHAIN-V1',network:'devnet',plan,publisher};
 if(storageOnly){
  if(paymentTestSignature!=null)throw Error('Storage-only testing must not claim an earlier Devnet payment.');
  metadata.testMode='storage-only';
 }else{
  if(!isSolanaSignature(paymentTestSignature))throw Error('A verified Devnet test-payment signature is required for the payment-gated test.');
  metadata.testPaymentSignature=paymentTestSignature;
 }
 return {...draft,iqquest:metadata};
}
let sdkPromise=null;
async function runtime(network='devnet'){
 if(!['devnet','mainnet-beta'].includes(network))throw Error('Unsupported Solana network.');
 if(!sdkPromise){sdkPromise=(async()=>{
   const buff=await import('https://esm.sh/buffer@6.0.3?bundle');
   globalThis.Buffer=buff.Buffer;
   if(!globalThis.process)globalThis.process={env:{NODE_ENV:'production'},version:'',versions:{}};
   const [web3,mod]=await Promise.all([
     import('https://esm.sh/@solana/web3.js@1.99.0?bundle'),
     import('https://esm.sh/@iqlabs-official/solana-sdk@0.3.6?bundle')
   ]);
   const sdk=mod.default||mod;
   if(typeof sdk.writer?.codeIn!=='function'||typeof sdk.reader?.readCodeIn!=='function'||typeof sdk.setRpcUrl!=='function')throw Error('Official IQ Labs SDK could not be initialized.');
   return {web3,sdk,BufferClass:buff.Buffer};
 })().catch(e=>{sdkPromise=null;throw e});}
 const result=await sdkPromise;
 const rpc=network==='devnet'?DEVNET_RPC:MAINNET_RPC;
 result.sdk.setRpcUrl(rpc);
 return {...result,rpc,connection:new result.web3.Connection(rpc,'confirmed')};
}

export async function readQuestOnchain(signature,network='devnet'){
 if(!isSolanaSignature(signature))throw Error('The onchain quest transaction signature is invalid.');
 const {sdk}=await runtime(network);
 const result=await sdk.reader.readCodeIn(signature,'light');
 let text=result?.data;
 if(text instanceof Uint8Array)text=new TextDecoder().decode(text);
 if(typeof text!=='string'||!text.trim())throw Error('IQ Labs returned no readable quest data.');
 if(new TextEncoder().encode(text).length>120000)throw Error('The onchain payload is unexpectedly large.');
 const storedRaw=text;
 text=await unpackDevnetQuestPayload(storedRaw);
 let data;
 try{data=JSON.parse(text)}catch(e){throw Error('The saved onchain data is not valid JSON.');}
 if(data?.iqquest?.format!=='IQ-QUEST-ONCHAIN-V1')throw Error('This inscription is not a supported IQ QUEST adventure.');
 if(!Array.isArray(data.levels)||data.levels.length!==15)throw Error('The saved adventure does not have 15 levels.');
 return {data,raw:text,storedRaw,signature,network};
}

function same(a,b){if(a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true;}
export async function simulateFirstUploadOnDevnet({connection,web3,tx,onProgress=()=>{}}){
 const estimatedWireBytes=tx.serializeMessage().length+65;
 if(estimatedWireBytes>1232)throw Error('The IQ Labs transaction is too large for Solana ('+estimatedWireBytes+' bytes). No wallet approval was requested.');
 onProgress('Checking the next IQ Labs upload transaction on Devnet before wallet approval (free simulation)…');
 let simulated;
 try{
   const unsigned=new web3.VersionedTransaction(tx.compileMessage());
   simulated=await connection.simulateTransaction(unsigned,{commitment:'confirmed',sigVerify:false,replaceRecentBlockhash:true});
 }catch(e){
   throw Error('Devnet preflight could not run: '+String(e?.message||e).slice(0,300)+'. No wallet approval was requested.');
 }
 if(!simulated?.value)throw Error('Devnet RPC returned no simulation result. No wallet approval was requested.');
 if(simulated.value.err){
   const logs=(simulated.value.logs||[]).filter(line=>/Program log:|failed|error|insufficient|invoke/.test(line)).slice(-5).join(' | ').slice(0,750);
   throw Error('IQ Labs Devnet preflight rejected the upload: '+JSON.stringify(simulated.value.err)+(logs?' — '+logs:'')+'. No wallet approval was requested.');
 }
 onProgress('Devnet RPC simulated this upload transaction successfully. Review the wallet request carefully.');
}
export async function verifyDevnetIqPdas({tx,program,expectedCodeAccount,expectedUserState,BufferClass,connection,checkedAccounts=new Set(),wallet}){
 for(const ix of tx.instructions){
   if(!ix.programId.equals(program))continue;
   const tag=BufferClass.from(ix.data).subarray(0,8).toString('hex');
   // Official IQ Labs 0.3.6 IDL discriminators for SendCode and CreateSession.
   const expected=tag==='ef8123d03ea86ec9'?expectedCodeAccount:tag==='f2c18fb396197ae3'?expectedUserState:null;
   if(!expected)continue;
   const name=tag==='ef8123d03ea86ec9'?'code_account':'user_state';
   const actual=ix.keys?.[1]?.pubkey;
   if(!actual?.equals(expected))throw Error('IQ Labs SDK used unexpected '+name+' for wallet '+wallet.toBase58()+'. Got '+String(actual?.toBase58?.()||'missing')+', expected '+expected.toBase58()+'. No transaction was signed.');
   if(!checkedAccounts.has(name)){
     const account=await connection.getAccountInfo(expected,'confirmed');
     if(!account||!account.owner.equals(program)||account.data.length<8)
       throw Error('IQ Labs '+name+' was not initialized at expected address '+expected.toBase58()+' on Devnet. No transaction was signed.');
     checkedAccounts.add(name);
   }
 }
}
// In the Phantom browser the bundled SDK has produced a SendCode instruction
// using an uninitialized code_account, even though the canonical PDA already
// exists. Rebind ONLY that exact account meta, ONLY on Devnet, after verifying
// the payer, account layout, program ownership and the absence of the SDK's
// incorrect account. The resulting message is always simulated before signing.
export async function correctDevnetSendCodeAccount({tx,program,wallet,expectedCodeAccount,systemProgram,BufferClass,connection,checkedAccounts=new Set(),missingSdkAccounts=new Set(),onProgress=()=>{}}){
 for(const ix of tx.instructions){
   if(!ix.programId.equals(program))continue;
   if(BufferClass.from(ix.data).subarray(0,8).toString('hex')!=='ef8123d03ea86ec9')continue;
   const keys=ix.keys||[];
   if(keys.length!==3||!keys[0].pubkey.equals(wallet)||!keys[0].isSigner||!keys[0].isWritable||
      !keys[1].pubkey||keys[1].isSigner||!keys[1].isWritable||
      !keys[2].pubkey.equals(systemProgram)||keys[2].isSigner||keys[2].isWritable)
      throw Error('Unexpected IQ Labs SendCode account layout. No transaction was signed.');
   const actual=keys[1].pubkey;
   if(actual.equals(expectedCodeAccount))continue;
   const incorrect=actual.toBase58();
   if(!missingSdkAccounts.has(incorrect)){
     let infos;
     try{infos=await connection.getMultipleAccountsInfo([actual,expectedCodeAccount],'confirmed');}
     catch(e){throw Error('Could not safely check SDK code accounts on Devnet: '+String(e?.message||e)+'. No transaction was signed.');}
     const [actualInfo,expectedInfo]=infos||[];
     if(actualInfo)throw Error('IQ Labs SDK selected another initialized code account '+incorrect+'. Upload stopped rather than changing it. No transaction was signed.');
     if(!expectedInfo||!expectedInfo.owner?.equals(program)||expectedInfo.data?.length<8)
       throw Error('The correct IQ Labs code_account '+expectedCodeAccount.toBase58()+' is missing or invalid on Devnet. No transaction was signed.');
     missingSdkAccounts.add(incorrect);
     checkedAccounts.add('code_account');
   }
   keys[1]={...keys[1],pubkey:expectedCodeAccount};
   onProgress('Corrected the IQ Labs SDK Devnet code-account address. Simulating the corrected transaction before asking Phantom…');
 }
}
export async function publishQuestOnchain({draft,provider,plan='community',network='devnet',paymentTestSignature,paymentSignature,orderId,fingerprint,devnetStorageOnly=false,onSignature=()=>{},onProgress=()=>{}}){
 if(!['devnet','mainnet-beta'].includes(network))throw Error('Unsupported publishing network.');
 if(network!=='devnet'&&devnetStorageOnly)throw Error('Storage-only publication is prohibited on Mainnet.');
 if(network==='mainnet-beta'&&!MAINNET_CLIENT_ENABLED)throw Error('Real Mainnet IQ Labs publishing is disabled pending launch verification.');
 if(!draft||draft.levels?.length!==15)throw Error('Validate 15 complete puzzles first.');
 if(!['community','unlisted'].includes(plan)||network==='mainnet-beta'&&plan!=='community')throw Error('Invalid listing plan.');
 if(network==='devnet'&&!devnetStorageOnly&&!isSolanaSignature(paymentTestSignature))throw Error('A verified Devnet test-payment signature is required before publication.');
 if(network==='mainnet-beta'&&!isSolanaSignature(paymentSignature))throw Error('A verified Mainnet payment signature is required before uploading.');
 if(typeof provider?.signTransaction!=='function'||!provider.publicKey?.toBase58)throw Error('Choose and connect a supported Solana wallet at publication.');
 const walletAddress=provider.publicKey.toBase58();
 if(!walletAddress)throw Error('Connect your selected Solana wallet first.');
 const {sdk,connection,web3,BufferClass}=await runtime(network);
 // Phantom, Wallet Standard and the SDK may bundle different PublicKey classes.
 // Derive PDAs and serialize instructions from one normalized public key.
 const wallet=new web3.PublicKey(walletAddress);
 let payload;
 if(network==='mainnet-beta'){
  const {mainnetPublicationPayload}=await import('./payments/publication-core.mjs');
  const canonical=verifyOrderInputs({payer:wallet.toBase58(),plan,draft});
  if(await sha256Hex(JSON.stringify(canonical))!==fingerprint)
   throw Error('The quest changed since payment. Restore the paid 15-question draft before uploading.');
  payload=mainnetPublicationPayload({canonical,payer:wallet.toBase58(),orderId,fingerprint,paymentSignature});
 }else{
  const uncompressed=JSON.stringify(buildDevnetQuestEnvelope({draft,plan,publisher:wallet.toBase58(),paymentTestSignature,storageOnly:devnetStorageOnly}));
  payload=await packDevnetQuestPayload(uncompressed);
 }
 const byteSize=new TextEncoder().encode(payload).length;
 // Devnet stays below the SDK's ten-chunk CreateSession threshold. Preserve
 // the conservative Mainnet gate while its paid publishing path is disabled.
 const uploadLimit=network==='devnet'?DEVNET_PACKED_LIMIT:8000;
 if(byteSize>uploadLimit)throw Error('The quest payload is '+byteSize+' bytes, above the '+uploadLimit+'-byte '+network+' limit. No upload was started.');
 const program=new web3.PublicKey(IQ_PROGRAM);
 const budget=web3.ComputeBudgetProgram.programId;
 const expectedCodeAccount=web3.PublicKey.findProgramAddressSync([BufferClass.from('codemY}AGBJiqLabs'),wallet.toBuffer()],program)[0];
 const expectedUserState=web3.PublicKey.findProgramAddressSync([BufferClass.from('usermY}AGBJiqLabs'),program.toBuffer(),wallet.toBuffer()],program)[0];
 const checkedAccounts=new Set();
 const missingSdkAccounts=new Set();
 let signaturePrompts=0;
 const inspect=tx=>{
   if(!tx||!Array.isArray(tx.instructions)||!tx.instructions.length)throw Error('SDK supplied no transaction instructions.');
   if(tx.feePayer&&!tx.feePayer.equals(wallet))throw Error('Unexpected transaction fee payer. Refusing to sign.');
   if(tx.version!==undefined)throw Error('Unsupported transaction version. Refusing to sign.');
   let iqCount=0;
   for(const ix of tx.instructions){
     if(ix.programId.equals(program)){
       iqCount++;
       if(ix.keys.some(k=>k.isSigner&&!k.pubkey.equals(wallet)))throw Error('Unexpected additional signer.');
     }else if(ix.programId.equals(budget)){
       const b=BufferClass.from(ix.data),tag=b[0];
       if(tag===2&&b.readUInt32LE(1)>400000)throw Error('Compute limit too high.');
       else if(tag===3&&Number(b.readBigUInt64LE(1))>2000)throw Error('Compute price too high.');
       else if(tag!==2&&tag!==3)throw Error('Unexpected compute instruction.');
     }else throw Error('Unexpected non-IQ-Labs program '+ix.programId.toBase58()+'. Nothing was signed.');
   }
   if(!iqCount)throw Error('The transaction does not invoke the IQ Labs program.');
   const budgetTags=new Set(tx.instructions.filter(ix=>ix.programId.equals(budget)).map(ix=>ix.data[0]));
   // Both explicit compute-budget instructions prevent wallet software from prepending
   // a different instruction and silently changing the signed message.
   if(!budgetTags.has(3))tx.instructions.unshift(web3.ComputeBudgetProgram.setComputeUnitPrice({microLamports:1000}));
   if(!budgetTags.has(2))tx.instructions.unshift(web3.ComputeBudgetProgram.setComputeUnitLimit({units:400000}));
   if(tx.instructions.length>20)throw Error('Unexpectedly many instructions.');
   tx.feePayer=wallet;
   return tx;
 };
 // Check each sequential Devnet chunk before Phantom sees it, including the
 // final inventory transaction. No risky approval is requested on an RPC error.
 const preflight=async tx=>{
   if(network==='devnet'){
     await correctDevnetSendCodeAccount({tx,program,wallet,expectedCodeAccount,systemProgram:web3.SystemProgram.programId,BufferClass,connection,checkedAccounts,missingSdkAccounts,onProgress});
     await verifyDevnetIqPdas({tx,program,expectedCodeAccount,expectedUserState,BufferClass,connection,checkedAccounts,wallet});
     await simulateFirstUploadOnDevnet({connection,web3,tx,onProgress});
   }
 };
 const signer={
   publicKey:wallet,
   async signTransaction(tx){
     const prepared=inspect(tx);
     await preflight(prepared);
     const message=new Uint8Array(prepared.serializeMessage());
     signaturePrompts++;
     onProgress('Wallet signing request '+signaturePrompts+'. '+network.toUpperCase()+' transaction. Review every request and storage fee.');
     const signed=await provider.signTransaction(prepared);
     if(!same(message,new Uint8Array(signed.serializeMessage())))throw Error('The wallet changed the signed transaction message. Upload stopped.');
     return signed;
   },
   async signAllTransactions(txs){
     if(!Array.isArray(txs)||txs.length>70)throw Error('Unexpected transaction batch size.');
     const prepared=txs.map(inspect),messages=prepared.map(tx=>new Uint8Array(tx.serializeMessage()));
     if(prepared.length)await preflight(prepared[0]);
     signaturePrompts+=txs.length;
     onProgress('Your wallet will review a '+network+' batch of '+txs.length+' IQ Labs transactions.');
     if(typeof provider.signAllTransactions!=='function'){
       const signed=[];
       for(const tx of prepared)signed.push(await provider.signTransaction(tx));
       signed.forEach((tx,i)=>{if(!same(messages[i],new Uint8Array(tx.serializeMessage())))throw Error('A signed batch transaction was changed.');});
       return signed;
     }
     const signed=await provider.signAllTransactions(prepared);
     if(signed.length!==prepared.length)throw Error('Wallet returned a different number of signed transactions.');
     signed.forEach((tx,i)=>{if(!same(messages[i],new Uint8Array(tx.serializeMessage())))throw Error('A signed batch transaction was changed.');});
     return signed;
   }
 };
 onProgress('Uploading '+byteSize+' losslessly packed bytes through the official IQ Labs SDK on Solana '+network+'.');
 let signature;
 if(network==='devnet'&&provider.walletName==='Phantom'&&typeof provider.signAndSendTransaction!=='function'&&
    typeof navigator!=='undefined'&&/iPhone|iPad|iPod|Android/i.test(navigator.userAgent||''))
   throw Error('Phantom mobile did not expose its sign-and-send capability. Update Phantom and reload IQ QUEST V5.15 before publishing. No wallet approval was requested.');
 if(network==='devnet'&&typeof provider.signAndSendTransaction==='function'){
   // Phantom mobile can reload the in-app page after signing. By letting the
   // wallet broadcast, then recording/recovering each SDK-built chunk onchain,
   // a page reset cannot silently discard a signed-but-unsent transaction.
   const {publishResumableDevnet,DEVNET_STORAGE_ONLY_JOB_KEY}=await import('./devnet-resumable.mjs?v=515');
   onProgress('Using Phantom’s recoverable Devnet sign-and-send route. IQ Labs instructions are verified before wallet approval.');
   signature=await publishResumableDevnet({sdk,web3,BufferClass,connection,wallet,provider,payload,
     ...(devnetStorageOnly?{jobKey:DEVNET_STORAGE_ONLY_JOB_KEY}:{}),
     preflight:async tx=>{inspect(tx);await preflight(tx);},onProgress});
 }else{
   signature=await sdk.writer.codeIn({connection,signer},payload,'iq-quest-15.json',0,'application/json',(percent)=>onProgress('IQ Labs upload: '+Math.round(Number(percent)||0)+'%'));
 }
 if(!isSolanaSignature(signature))throw Error('The SDK did not return a valid transaction signature. Review wallet history before retrying.');
 onProgress('Written on Devnet. Reading all 15 questions back for verification…');
 // Save the recovery signature before attempting a potentially slow read.
 if(network==='devnet'){
  try{localStorage.setItem('iqquest_devnet_last_sig_v45',signature);}catch(e){}
 }else await onSignature(signature); // Must persist BEFORE any slow readback.
 const read=await readQuestOnchain(signature,network);
 if(read.storedRaw!==payload)throw Error('The SDK readback does not match the uploaded bytes. Transaction: '+signature);
 if(network==='devnet'){
  const meta=read.data.iqquest||{};
  if(devnetStorageOnly){
   if(meta.testMode!=='storage-only'||Object.hasOwn(meta,'testPaymentSignature'))
    throw Error('The saved storage test was unexpectedly marked as a paid quest. Transaction: '+signature);
  }else if(meta.testPaymentSignature!==paymentTestSignature||Object.hasOwn(meta,'testMode'))
   throw Error('The saved quest is missing its verified Devnet test-payment reference. Transaction: '+signature);
 }
 if(network==='mainnet-beta'&&(read.data.iqquest?.orderId!==orderId||read.data.iqquest?.paymentSignature!==paymentSignature))
  throw Error('The saved quest does not match the paid order. Transaction: '+signature);
 onProgress('Verified: all 15 questions and answers match IQ Labs '+network+' storage.');
 return {signature,network,bytes:byteSize,data:read.data};
}

export function publishQuestDevnet(options){
 return publishQuestOnchain({...options,network:'devnet'});
}
export function publishQuestDevnetStorageTest(options){
 if(options?.paymentTestSignature!=null)throw Error('Do not attach a payment receipt to a storage-only Devnet test.');
 return publishQuestOnchain({...options,network:'devnet',devnetStorageOnly:true});
}
