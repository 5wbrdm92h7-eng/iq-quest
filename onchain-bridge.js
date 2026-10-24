/* IQ QUEST V5.5 — official IQ Labs SDK: Devnet testing, gated Mainnet publishing. */
import {MAINNET_CLIENT_ENABLED} from './payments/client-bridge.mjs';
import {sha256Hex,verifyOrderInputs} from './payments/order-core.mjs';
import {mainnetPublicationPayload,IQ_LABS_PROGRAM} from './payments/publication-core.mjs';
const DEVNET_RPC='https://api.devnet.solana.com';
const MAINNET_RPC='https://api.mainnet-beta.solana.com';
const IQ_PROGRAM=IQ_LABS_PROGRAM;
export const isSolanaSignature=value=>typeof value==='string' && /^[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(value);
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
 let data;
 try{data=JSON.parse(text)}catch(e){throw Error('The saved onchain data is not valid JSON.');}
 if(data?.iqquest?.format!=='IQ-QUEST-ONCHAIN-V1')throw Error('This inscription is not a supported IQ QUEST adventure.');
 if(!Array.isArray(data.levels)||data.levels.length!==15)throw Error('The saved adventure does not have 15 levels.');
 return {data,raw:text,signature,network};
}

function same(a,b){if(a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true;}
export async function publishQuestOnchain({draft,provider,plan='community',network='devnet',paymentTestSignature,paymentSignature,orderId,fingerprint,onSignature=()=>{},onProgress=()=>{}}){
 if(!['devnet','mainnet-beta'].includes(network))throw Error('Unsupported publishing network.');
 if(network==='mainnet-beta'&&!MAINNET_CLIENT_ENABLED)throw Error('Real Mainnet IQ Labs publishing is disabled pending launch verification.');
 if(!draft||draft.levels?.length!==15)throw Error('Validate 15 complete puzzles first.');
 if(!['community','unlisted'].includes(plan)||network==='mainnet-beta'&&plan!=='community')throw Error('Invalid listing plan.');
 if(network==='devnet'&&!isSolanaSignature(paymentTestSignature))throw Error('A verified Devnet test-payment signature is required before publication.');
 if(network==='mainnet-beta'&&!isSolanaSignature(paymentSignature))throw Error('A verified Mainnet payment signature is required before uploading.');
 if(typeof provider?.signTransaction!=='function'||!provider.publicKey?.toBase58)throw Error('Choose and connect a supported Solana wallet at publication.');
 const wallet=provider.publicKey;
 if(!wallet?.toBase58)throw Error('Connect your selected Solana wallet first.');
 const {sdk,connection,web3,BufferClass}=await runtime(network);
 let payload;
 if(network==='mainnet-beta'){
  const canonical=verifyOrderInputs({payer:wallet.toBase58(),plan,draft});
  if(await sha256Hex(JSON.stringify(canonical))!==fingerprint)
   throw Error('The quest changed since payment. Restore the paid 15-question draft before uploading.');
  payload=mainnetPublicationPayload({canonical,payer:wallet.toBase58(),orderId,fingerprint,paymentSignature});
 }else{
  payload=JSON.stringify({...draft,iqquest:{format:'IQ-QUEST-ONCHAIN-V1',network:'devnet',plan,publisher:wallet.toBase58(),testPaymentSignature:paymentTestSignature}});
 }
 const byteSize=new TextEncoder().encode(payload).length;
 if(byteSize>8000)throw Error('The quest is '+byteSize+' bytes. Please shorten it below 8,000 bytes before uploading.');
 const program=new web3.PublicKey(IQ_PROGRAM);
 const budget=web3.ComputeBudgetProgram.programId;
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
 const signer={
   publicKey:wallet,
   async signTransaction(tx){
     const prepared=inspect(tx),message=new Uint8Array(prepared.serializeMessage());
     signaturePrompts++;
     onProgress('Wallet signing request '+signaturePrompts+'. '+network.toUpperCase()+' transaction. Review every request and storage fee.');
     const signed=await provider.signTransaction(prepared);
     if(!same(message,new Uint8Array(signed.serializeMessage())))throw Error('The wallet changed the signed transaction message. Upload stopped.');
     return signed;
   },
   async signAllTransactions(txs){
     if(!Array.isArray(txs)||txs.length>70)throw Error('Unexpected transaction batch size.');
     const prepared=txs.map(inspect),messages=prepared.map(tx=>new Uint8Array(tx.serializeMessage()));
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
 onProgress('Uploading '+byteSize+' bytes through the official IQ Labs SDK on Solana '+network+'.');
 const signature=await sdk.writer.codeIn({connection,signer},payload,'iq-quest-15.json',0,'application/json',(percent)=>onProgress('IQ Labs upload: '+Math.round(Number(percent)||0)+'%'));
 if(!isSolanaSignature(signature))throw Error('The SDK did not return a valid transaction signature. Review wallet history before retrying.');
 onProgress('Written on Devnet. Reading all 15 questions back for verification…');
 // Save the recovery signature before attempting a potentially slow read.
 if(network==='devnet'){
  try{localStorage.setItem('iqquest_devnet_last_sig_v45',signature);}catch(e){}
 }else await onSignature(signature); // Must persist BEFORE any slow readback.
 const read=await readQuestOnchain(signature,network);
 if(read.raw!==payload)throw Error('The SDK readback does not match the submitted questions. Transaction: '+signature);
 if(network==='devnet'&&read.data.iqquest?.testPaymentSignature!==paymentTestSignature)throw Error('The saved quest is missing its verified Devnet test-payment reference. Transaction: '+signature);
 if(network==='mainnet-beta'&&(read.data.iqquest?.orderId!==orderId||read.data.iqquest?.paymentSignature!==paymentSignature))
  throw Error('The saved quest does not match the paid order. Transaction: '+signature);
 onProgress('Verified: all 15 questions and answers match IQ Labs '+network+' storage.');
 return {signature,network,bytes:byteSize,data:read.data};
}

export function publishQuestDevnet(options){
 return publishQuestOnchain({...options,network:'devnet'});
}
