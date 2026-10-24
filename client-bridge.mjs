/* IQ QUEST V5.4 — staged Mainnet checkout client; imported only by gated UI.
 * Deliberate double lock: this flag is false AND the server has three false gates.
 * Do not enable until identity, order confirmation, refunds, and publishing are live.
 */
import {RECEIVER,USD_PRICE,verifyOrderInputs,sha256Hex,lamportsForUsd} from './order-core.mjs';
export const MAINNET_CLIENT_ENABLED=false;
const MEMO_PROGRAM='MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

export function validateServerQuote(order,payer,now=Date.now()){
 if(!order||typeof order!=='object')throw Error('The server did not return a quote.');
 if(order.receiver!==RECEIVER||order.payer!==payer||order.usd!==USD_PRICE||order.plan!=='community')
  throw Error('Quote receiver, payer, price or publishing plan mismatch.');
 if(!Number.isSafeInteger(order.lamports)||order.lamports<=0)
  throw Error('Invalid SOL amount.');
 if(!Number.isFinite(order.quoteUsdPerSol)||
    lamportsForUsd(order.quoteUsdPerSol)!==order.lamports||
    order.sol!==(order.lamports/1_000_000_000).toFixed(9))
  throw Error('SOL invoice does not match the agreed USD price.');
 if(!Number.isFinite(order.expiresAt)||order.expiresAt<=now+30_000||order.expiresAt>now+10*60_000)
  throw Error('Quote has expired or has an invalid expiry. Request a new quote before signing.');
 if(typeof order.memo!=='string'||!/^IQQUEST-MAIN-V1:[0-9a-f-]{36}:[0-9a-f]{32}$/.test(order.memo))
  throw Error('Invalid order reference.');
 if(typeof order.fingerprint!=='string'||!/^[0-9a-f]{64}$/.test(order.fingerprint))
  throw Error('Quest fingerprint missing from quote.');
 if(!Number.isFinite(order.issuedAt)||order.issuedAt>now+30_000||order.issuedAt<now-10*60_000)
  throw Error('Quote issuance time is invalid.');
 if(order.memo!=='IQQUEST-MAIN-V1:'+order.orderId+':'+order.fingerprint.slice(0,32))
  throw Error('Order reference does not match this quest.');
 return order;
}

export async function fingerprintDraft(draft,payer,plan='community'){
 return sha256Hex(JSON.stringify(verifyOrderInputs({draft,payer,plan})));
}

let web3Promise=null;
async function loadWeb3(){
 if(!web3Promise)web3Promise=(async()=>{
  const buffer=await import('https://esm.sh/buffer@6.0.3?bundle');
  if(!globalThis.Buffer)globalThis.Buffer=buffer.Buffer;
  if(!globalThis.process)globalThis.process={env:{NODE_ENV:'production'},version:'',versions:{}};
  return import('https://esm.sh/@solana/web3.js@1.99.0?bundle');
 })().catch(e=>{web3Promise=null;throw e});
 return web3Promise;
}
function requireLiveConfig(){
 if(!MAINNET_CLIENT_ENABLED)throw Error('Real SOL checkout is disabled while legal and publication work is unfinished.');
}
export async function createMainnetOrder({apiBase,provider,draft,plan='community'}){
 requireLiveConfig();
 if(!provider?.publicKey?.toBase58)throw Error('Connect a supported wallet at the checkout step.');
 const payer=provider.publicKey.toBase58();
 const response=await fetch(new URL('/api/orders',apiBase),{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({payer,plan,draft}),cache:'no-store'
 });
 const body=await response.json();
 if(!response.ok)throw Error(body.error||'Payment quote was not available.');
 const quote=validateServerQuote(body,payer);
 if(quote.fingerprint!==await fingerprintDraft(draft,payer,plan))
  throw Error('The checkout server quoted a different quest; nothing was signed.');
 return quote;
}

// This function does not initiate a transfer while MAINNET_CLIENT_ENABLED=false.
// It is intentionally not attached to any UI button in the preparation build.
export async function submitMainnetOrder({
 apiBase,provider,order,mainnetRpcUrl,onSigned,onProgress=()=>{}
}){
 requireLiveConfig();
 if(typeof provider?.signTransaction!=='function'||!provider.publicKey?.toBase58)
  throw Error('A selected wallet with transaction signing is required.');
 if(typeof onSigned!=='function')
  throw Error('A durable transaction-recovery callback is required before any wallet signature.');
 const payer=provider.publicKey.toBase58();
 validateServerQuote(order,payer);
 if(!mainnetRpcUrl||!/^https:\/\//.test(mainnetRpcUrl)||/devnet|testnet/.test(mainnetRpcUrl))
  throw Error('A reviewed Mainnet RPC endpoint is required.');
 const web3=await loadWeb3();
 const connection=new web3.Connection(mainnetRpcUrl,'confirmed');
 const block=await connection.getLatestBlockhash('confirmed');
 const tx=new web3.Transaction({feePayer:provider.publicKey,recentBlockhash:block.blockhash});
 tx.add(web3.ComputeBudgetProgram.setComputeUnitLimit({units:50000}));
 tx.add(web3.ComputeBudgetProgram.setComputeUnitPrice({microLamports:1000}));
 tx.add(web3.SystemProgram.transfer({
  fromPubkey:provider.publicKey,toPubkey:new web3.PublicKey(RECEIVER),lamports:order.lamports
 }));
 tx.add(new web3.TransactionInstruction({
  keys:[],programId:new web3.PublicKey(MEMO_PROGRAM),data:new TextEncoder().encode(order.memo)
 }));
 const prepared=new Uint8Array(tx.serializeMessage());
 validateServerQuote(order,payer); // reject an invoice that expired while preparing the transaction
 onProgress('Review the exact SOL amount, recipient and network in your wallet.');
 const signed=await provider.signTransaction(tx);
 const actual=new Uint8Array(signed.serializeMessage());
 if(prepared.length!==actual.length||!prepared.every((b,i)=>b===actual[i]))
  throw Error('Wallet changed the payment details. Nothing was broadcast.');
 const serialized=signed.serialize();
 const signature=encodeSignature(signed.signature);
 if(!/^[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(signature))
  throw Error('No valid transaction ID was signed; nothing was broadcast.');
 if(Date.now()>order.expiresAt-10_000)
  throw Error('The quote expired while signing. Nothing was broadcast. Check the wallet history before trying again.');
 // The caller must durably store this BEFORE any send. A storage failure means
 // no broadcast. A retry must recover this exact signature; never pay twice.
 const saved=await onSigned({orderId:order.orderId,signature,payer,receiver:RECEIVER,lamports:order.lamports});
 if(saved!==true)throw Error('Transaction recovery record was not saved. Nothing was broadcast.');
 onProgress('Signed transaction saved. Submitting once to Solana Mainnet.');
 const submitted=await connection.sendRawTransaction(serialized,{skipPreflight:false,maxRetries:3});
 if(submitted!==signature)throw Error('Unexpected RPC signature. Inspect wallet history; do not pay again.');
 return verifyMainnetOrder({apiBase,orderId:order.orderId,signature});
}

export async function verifyMainnetOrder({apiBase,orderId,signature}){
 requireLiveConfig();
 const response=await fetch(new URL('/api/orders/'+encodeURIComponent(orderId)+'/verify',apiBase),{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({signature}),cache:'no-store'
 });
 const body=await response.json();
 if(response.status===202)return body; // pending: retry SAME signature later.
 if(!response.ok)throw Error((body.error||'Verification delayed.')+' Check your saved signature; do not pay twice.');
 return body; // paid does NOT imply published.
}

const BASE58='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function encodeSignature(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.length!==64)
  throw Error('The wallet did not return a valid 64-byte signature.');
 let value=0n;
 for(const byte of bytes)value=(value<<8n)+BigInt(byte);
 let encoded='';
 while(value>0n){encoded=BASE58[Number(value%58n)]+encoded;value/=58n;}
 let zeros=0;
 while(zeros<bytes.length&&bytes[zeros]===0)zeros++;
 return '1'.repeat(zeros)+encoded;
}
