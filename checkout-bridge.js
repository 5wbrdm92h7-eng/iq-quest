/* IQ QUEST V4.6 — DEVNET-ONLY payment rehearsal. Mainnet transfers are deliberately disabled.
 * This module never has access to a private key or seed phrase. Phantom must approve any transaction.
 */
export const TREASURY_ADDRESS='BbMdFqpXfkJeKLvoT8W7QSFZmVeLV35gp6At2MbZF377';
export const DEVNET_TEST_LAMPORTS=2_000_000; // 0.002 test SOL; helps initialize the recipient on devnet if needed.
export const MEMO_PROGRAM='MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
export const COMPUTE_BUDGET_PROGRAM='ComputeBudget111111111111111111111111111111';
export const DEVNET_RPC='https://api.devnet.solana.com';
export const MAINNET_PAYMENTS_ENABLED=false;
const ALPHABET=/^[1-9A-HJ-NP-Za-km-z]{80,100}$/;
export function isValidSignature(signature){return typeof signature==='string'&&ALPHABET.test(signature);}
export function canonicalQuest(draft,plan){
 if(!['community','unlisted'].includes(plan))throw Error('Select a valid publishing plan.');
 if(!draft||!Array.isArray(draft.levels)||draft.levels.length!==15)throw Error('The quest must contain exactly 15 valid questions.');
 const str=x=>String(x??'').trim();
 const levels=draft.levels.map((l,i)=>{
  const level={title:str(l.title),story:str(l.story),q:str(l.q),h:str(l.h),a:str(l.a)};
  if(!level.title||!level.q||!level.h||!level.a)throw Error('Question '+(i+1)+' is incomplete.');
  return level;
 });
 return {v:1,title:str(draft.title),theme:str(draft.theme),difficulty:str(draft.difficulty),levels,plan};
}
export async function questFingerprint(draft,plan){
 if(!globalThis.crypto?.subtle)throw Error('HTTPS is required for the cryptographic quest fingerprint.');
 const json=JSON.stringify(canonicalQuest(draft,plan));
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(json));
 return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function devnetMemo(draft,plan){return 'IQQUEST-DEV-PAY-V1:'+plan+':'+await questFingerprint(draft,plan);}

let web3Promise=null;
async function loadWeb3(){
 if(!web3Promise)web3Promise=(async()=>{
   const buff=await import('https://esm.sh/buffer@6.0.3?bundle');
   if(!globalThis.Buffer)globalThis.Buffer=buff.Buffer;
   if(!globalThis.process)globalThis.process={env:{NODE_ENV:'production'},version:'',versions:{}};
   return import('https://esm.sh/@solana/web3.js@1.99.0?bundle');
 })().catch(error=>{web3Promise=null;throw error});
 return web3Promise;
}
const asPubkey=x=>typeof x?.toBase58==='function'?x.toBase58():String(x||'');

// Pure receipt verification: only a confirmed successful transfer to our exact wallet
// from the expected payer, with the expected amount AND memo, will be accepted.
export function inspectDevnetReceipt(tx,{signature,from,lamports=DEVNET_TEST_LAMPORTS,memo}){
 if(!isValidSignature(signature))throw Error('Invalid transaction signature.');
 if(!tx||tx.meta?.err!==null)throw Error('No successful confirmed transaction was found on Devnet.');
 if(tx.transaction?.signatures?.[0]!==signature)throw Error('Transaction signature does not match the requested receipt.');
 const instructions=tx.transaction?.message?.instructions;
 if(!Array.isArray(instructions))throw Error('The transaction did not contain readable instructions.');
 let paymentCount=0,memoCount=0;
 for(const ix of instructions){
   const data=ix?.parsed;
   if(ix.program==='system'){
     if(data?.type!=='transfer')throw Error('Unexpected System program instruction in payment receipt.');
     const details=data.info||{};
     if(details.source!==from||details.destination!==TREASURY_ADDRESS||Number(details.lamports)!==lamports)
       throw Error('No exact transfer to the IQ QUEST recipient was found.');
     paymentCount++;
   }else if(ix.program==='spl-memo'||asPubkey(ix.programId)===MEMO_PROGRAM){
     if(typeof data!=='string'||data!==memo)throw Error('The receipt memo does not match these 15 questions and this publishing plan.');
     memoCount++;
   }else if(ix.program!=='compute-budget'&&asPubkey(ix.programId)!==COMPUTE_BUDGET_PROGRAM){
     throw Error('Unexpected instruction in receipt. Test payment must contain only transfer, memo and compute budget.');
   }
 }
 if(paymentCount!==1)throw Error('No exact transfer to the IQ QUEST recipient was found.');
 if(memoCount!==1)throw Error('The receipt memo does not match these 15 questions and this publishing plan.');
 const payerKeys=tx.transaction?.message?.accountKeys||[];
 const payerSigned=payerKeys.some(k=>asPubkey(k.pubkey||k)===from&&k.signer===true);
 if(!payerSigned)throw Error('The expected creator wallet did not sign this transaction.');
 return {signature,from,to:TREASURY_ADDRESS,lamports,memo,slot:tx.slot};
}

export async function verifyDevnetPayment({signature,draft,plan,payer,onProgress=()=>{}}){
 if(!isValidSignature(signature))throw Error('Missing or invalid Devnet transaction signature.');
 const web3=await loadWeb3();
 const payerAddress=new web3.PublicKey(String(payer)).toBase58();
 const memo=await devnetMemo(draft,plan);
 const connection=new web3.Connection(DEVNET_RPC,'confirmed');
 onProgress('Checking the payment receipt using Solana Devnet RPC…');
 for(let i=0;i<6;i++){
   const tx=await connection.getParsedTransaction(signature,{commitment:'confirmed',maxSupportedTransactionVersion:0});
   if(tx)return inspectDevnetReceipt(tx,{signature,from:payerAddress,memo});
   await new Promise(resolve=>setTimeout(resolve,1200));
 }
 throw Error('Transaction not indexed yet. Try Verify Last Payment again later; do not send another payment.');
}

export async function sendDevnetPayment({provider,draft,plan,onProgress=()=>{},onSubmitted=()=>{}}){
 if(MAINNET_PAYMENTS_ENABLED)throw Error('Unexpected payment configuration. Refusing to sign.');
 if(!provider?.isPhantom||!provider?.signTransaction)throw Error('Open the Phantom wallet browser and connect Phantom.');
 if(!provider.publicKey)throw Error('Connect Phantom first.');
 const web3=await loadWeb3();
 const wallet=new web3.PublicKey(provider.publicKey.toBase58());
 const target=new web3.PublicKey(TREASURY_ADDRESS);
 if(target.toBase58()!==TREASURY_ADDRESS)throw Error('Invalid payout wallet configuration.');
 const memo=await devnetMemo(draft,plan);
 const connection=new web3.Connection(DEVNET_RPC,'confirmed');
 const latest=await connection.getLatestBlockhash('confirmed');
 const tx=new web3.Transaction({feePayer:wallet,recentBlockhash:latest.blockhash});
 tx.add(web3.ComputeBudgetProgram.setComputeUnitLimit({units:50000}));
 tx.add(web3.ComputeBudgetProgram.setComputeUnitPrice({microLamports:1000}));
 tx.add(web3.SystemProgram.transfer({fromPubkey:wallet,toPubkey:target,lamports:DEVNET_TEST_LAMPORTS}));
 tx.add(new web3.TransactionInstruction({keys:[],programId:new web3.PublicKey(MEMO_PROGRAM),data:new TextEncoder().encode(memo)}));
 const originalMessage=new Uint8Array(tx.serializeMessage());
 onProgress('Phantom will request 0.002 DEVNET test SOL + network fee. Confirm the receiving address in your wallet. This is NOT the $3/$5 mainnet payment.');
 const signed=await provider.signTransaction(tx);
 const signedMessage=new Uint8Array(signed.serializeMessage());
 if(originalMessage.length!==signedMessage.length||!originalMessage.every((b,i)=>b===signedMessage[i]))throw Error('Phantom changed the requested transaction. Nothing was broadcast.');
 onProgress('Submitting the signed Devnet transaction…');
 const signature=await connection.sendRawTransaction(signed.serialize(),{skipPreflight:false,maxRetries:3});
 if(!isValidSignature(signature))throw Error('No valid transaction signature returned.');
 onSubmitted({signature,payer:wallet.toBase58(),plan,fingerprint:await questFingerprint(draft,plan)});
 onProgress('Submitted '+signature+'. Waiting for blockchain confirmation…');
 const confirmation=await connection.confirmTransaction({signature,blockhash:latest.blockhash,lastValidBlockHeight:latest.lastValidBlockHeight},'confirmed');
 if(confirmation.value.err)throw Error('Devnet transaction failed. View signature '+signature+' in Explorer.');
 return verifyDevnetPayment({signature,draft,plan,payer:wallet.toBase58(),onProgress});
}

// Indicative quote ONLY. Never sent to Phantom, never valid as an invoice.
export async function indicativeMainnetQuote(usd){
 if(usd!==3&&usd!==5)throw Error('Only the $3 and $5 publishing plans are supported.');
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),9000);
 try{
  const response=await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',{signal:controller.signal,cache:'no-store'});
  if(!response.ok)throw Error('Live exchange-rate service is unavailable.');
  const data=await response.json();
  const usdPerSol=Number(data?.solana?.usd);
  if(!Number.isFinite(usdPerSol)||usdPerSol<=0)throw Error('Invalid SOL/USD rate returned.');
  return {usd,usdPerSol,sol:usd/usdPerSol,retrievedAt:new Date().toISOString(),informationalOnly:true};
 }finally{clearTimeout(timer);}
}
