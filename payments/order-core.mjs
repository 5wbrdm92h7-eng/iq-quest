/* IQ QUEST V5.3 — pure building blocks for a FUTURE Mainnet SOL checkout.
 * No network calls or private keys. No live checkout is enabled by this module.
 */
export const USD_PRICE = 3.99;
export const RECEIVER = 'BbMdFqpXfkJeKLvoT8W7QSFZmVeLV35gp6At2MbZF377';
export const MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
export const COMPUTE_BUDGET = 'ComputeBudget111111111111111111111111111111';
const SIG_RE = /^[1-9A-HJ-NP-Za-km-z]{80,100}$/;
const ADDR_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function verifyOrderInputs({payer,plan,draft}) {
 if(typeof payer!=='string'||!ADDR_RE.test(payer))throw Error('A valid payer wallet is required.');
 if(plan!=='community')throw Error('Only the community publishing option is supported.');
 if(!draft||typeof draft!=='object'||!Array.isArray(draft.levels)||draft.levels.length!==15)
  throw Error('Exactly 15 questions are required.');
 const trimmed = value => String(value??'').trim();
 const levels=draft.levels.map((row,index)=>{
  if(!row||typeof row!=='object'||Array.isArray(row))throw Error('Question '+(index+1)+' is incomplete.');
  const level={title:trimmed(row.title),story:trimmed(row.story),q:trimmed(row.q),h:trimmed(row.h),a:trimmed(row.a)};
  if(!level.title||!level.q||!level.h||!level.a)throw Error('Question '+(index+1)+' is incomplete.');
  for(const [field,value] of Object.entries(level))if(value.length>800)throw Error('A question field exceeds the limit.');
  return level;
 });
 const title=trimmed(draft.title),creator=trimmed(draft.creator)||'Community';
 const theme=trimmed(draft.theme),difficulty=trimmed(draft.difficulty);
 if(!title||title.length>100||creator.length>70||theme.length>500||!['Easy','Medium','Hard'].includes(difficulty))
  throw Error('Invalid quest title, creator, theme or difficulty.');
 const canonical={v:1,title,creator,theme,difficulty,levels,plan};
 if(JSON.stringify(canonical).length>12000)throw Error('Quest is too large.');
 return canonical;
}

export async function sha256Hex(value){
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
 return [...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('');
}

export function lamportsForUsd(usdPerSol) {
 if(!Number.isFinite(usdPerSol)||usdPerSol<0.01||usdPerSol>1_000_000)
  throw Error('Unreliable SOL/USD quote.');
 const lamports=Math.ceil(USD_PRICE*1_000_000_000/usdPerSol);
 if(!Number.isSafeInteger(lamports)||lamports<=0)throw Error('Invalid payment amount.');
 return lamports;
}
export function memoForOrder(orderId,fingerprint){
 if(!UUID_RE.test(orderId)||!/^[0-9a-f]{64}$/.test(fingerprint))throw Error('Invalid order binding.');
 return 'IQQUEST-MAIN-V1:'+orderId+':'+fingerprint.slice(0,32);
}
const pubkey=value=>typeof value?.toBase58==='function'?value.toBase58():String(value??'');

// Validates a parsed, FINALIZED Solana Mainnet receipt. The caller must fetch
// the transaction exclusively from a server-configured, trusted Mainnet RPC.
export function inspectMainnetReceipt(tx,{signature,payer,lamports,memo,issuedAt,expiresAt}){
 if(!SIG_RE.test(signature)||!ADDR_RE.test(payer)||!Number.isSafeInteger(lamports)||lamports<=0)
  throw Error('Invalid expected payment.');
 if(!tx||tx.meta?.err!==null)throw Error('Transaction missing, not finalized, or failed.');
 if(tx.transaction?.signatures?.[0]!==signature)throw Error('Receipt signature mismatch.');
 if(typeof tx.blockTime!=='number')throw Error('Missing reliable transaction time; investigate before another payment.');
 if(Number.isFinite(issuedAt)&&tx.blockTime*1000<issuedAt-120_000)
  throw Error('Payment predates this order; contact support, do not pay again.');
 if(tx.blockTime*1000>expiresAt+120_000)throw Error('Payment arrived after quote expiry; contact support, do not pay again.');
 if((tx.meta?.innerInstructions||[]).some(group=>group.instructions?.length))
  throw Error('Unexpected inner instructions in payment.');
 const instructions=tx.transaction?.message?.instructions;
 if(!Array.isArray(instructions))throw Error('Payment instructions missing.');
 let transfers=0,memos=0;
 for(const instruction of instructions){
  const programId=pubkey(instruction.programId);
  if(instruction.program==='system'){
   if(instruction.parsed?.type!=='transfer')throw Error('Unexpected System instruction.');
   const info=instruction.parsed.info||{};
   if(info.source!==payer||info.destination!==RECEIVER||Number(info.lamports)!==lamports)
    throw Error('Incorrect payer, receiver or amount.');
   transfers++;
  }else if(instruction.program==='spl-memo'||programId===MEMO_PROGRAM){
   if(instruction.parsed!==memo)throw Error('Incorrect order memo.');
   memos++;
  }else if(instruction.program==='compute-budget'||programId===COMPUTE_BUDGET){
   continue;
  }else throw Error('Unexpected transaction instruction.');
 }
 if(transfers!==1||memos!==1)throw Error('Expected exactly one transfer and one matching memo.');
 const keys=tx.transaction?.message?.accountKeys||[];
 if(!keys.some(key=>pubkey(key.pubkey||key)===payer&&key.signer===true))
  throw Error('The expected payer did not sign.');
 return {signature,payer,lamports,receiver:RECEIVER,slot:tx.slot,blockTime:tx.blockTime};
}
