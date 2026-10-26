/**
 * IQ QUEST: preparation for a NON-ESCROW, ATOMIC Devnet platform fee.
 * Pure transaction builder + read-only verifier. NO wallet connection,
 * sendTransaction, automatic retries, or Mainnet activation in this module.
 *
 * The 0.03 test-SOL transfer and IQ Labs final registration run in ONE Solana
 * transaction. If either instruction fails, the platform transfer is rolled
 * back, but normal Solana transaction fees can still be charged. Earlier
 * IQ Labs data chunks are separate transactions with separate fees.
 */

export const ATOMIC_DEVNET_PRICE_LAMPORTS=30_000_000;
export const ATOMIC_DEVNET_RECIPIENT='BbMdFqpXfkJeKLvoT8W7QSFZmVeLV35gp6At2MbZF377';
export const IQ_LABS_PROGRAM='9KLLchQVJpGkw4jPuUmnvqESdR7mtNCYr3qS4iQLabs';

const INVENTORY_SEED='inventorymY}AGBJiqLabs';
const INVENTORY_TAG='51b1057ad57d15ee';
const MAX_LEGACY_TX_BYTES=1232;

function fail(message){throw Error('Atomic Devnet final: '+message);}
function toBytes(value){
 if(value instanceof Uint8Array)return value;
 if(Array.isArray(value))return Uint8Array.from(value);
 return null;
}
function parseFinalData(value){
 const bytes=toBytes(value);
 if(!bytes||bytes.length<19||Array.from(bytes.subarray(0,8),b=>b.toString(16).padStart(2,'0')).join('')!==INVENTORY_TAG)
  fail('Expected the official IQ Labs final inventory instruction.');
 let p=8;
 const field=()=>{
  if(p+4>bytes.length)fail('Truncated inventory data.');
  const len=new DataView(bytes.buffer,bytes.byteOffset+p,4).getUint32(0,true);p+=4;
  if(len>4096||p+len>bytes.length)fail('Invalid final inventory field length.');
  const value=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(p,p+len));p+=len;
  return value;
 };
 const path=field(),metadataText=field();
 if(p+1!==bytes.length||bytes[p]!==0)fail('Unexpected inventory instruction layout.');
 let metadata;
 try{metadata=JSON.parse(metadataText);}catch(_e){fail('IQ Labs inventory metadata is not JSON.');}
 if(!path||path.length>100||metadata?.filetype!=='application/json'||metadata?.filename!=='iq-quest-15.json'||
    metadata?.method!==0||!Number.isInteger(metadata.total_chunks)||metadata.total_chunks<1||metadata.total_chunks>9)
  fail('Unexpected IQ Labs chain path or file metadata.');
 return {path,metadataText,metadata};
}
function key(web3,value,label){
 try{return new web3.PublicKey(value);}catch(_e){fail('Invalid '+label+' public key.');}
}
function checkFinalInstruction({web3,wallet,finalInstruction,iqLabsFeeReceiver}){
 const program=key(web3,IQ_LABS_PROGRAM,'IQ Labs program');
 const receiver=key(web3,iqLabsFeeReceiver,'IQ Labs registration fee recipient');
 if(!finalInstruction?.programId?.equals?.(program)||finalInstruction.keys?.length!==4)
  fail('The last instruction is not the expected IQ Labs registration.');
 const keys=finalInstruction.keys;
 // IQ Labs inventory PDA has seeds ["inventorymY}AGBJiqLabs", payer].
 const correctInventory=web3.PublicKey.findProgramAddressSync([new TextEncoder().encode(INVENTORY_SEED),wallet.toBuffer()],program)[0];
 if(!keys[0].pubkey.equals(wallet)||!keys[0].isSigner||!keys[0].isWritable||
    !keys[1].pubkey.equals(correctInventory)||!keys[1].isWritable||
    !keys[2].pubkey.equals(web3.SystemProgram.programId)||
    !keys[3].pubkey.equals(receiver))fail('IQ Labs inventory accounts differ from the expected payer, PDA or fee receiver.');
 return parseFinalData(finalInstruction.data);
}

/** Build but NEVER sign or submit. Only for Solana Devnet test coins. */
export function prepareAtomicDevnetFinal({web3,wallet,finalInstruction,iqLabsFeeReceiver,latestBlockhash,network='devnet',acknowledged=false}={}){
 if(network!=='devnet')fail('Mainnet is forbidden.');
 if(acknowledged!==true)fail('Explicit 0.03 Devnet-SOL test acknowledgment is required.');
 if(!web3?.Transaction||!web3?.SystemProgram?.transfer||!web3?.ComputeBudgetProgram||!web3?.PublicKey)
  fail('A compatible Solana web3 implementation is required.');
 if(!wallet?.toBase58?.()||!wallet?.toBuffer?.())fail('No public payer wallet.');
 if(typeof latestBlockhash!=='string'||!latestBlockhash.trim())fail('A fresh Devnet blockhash is required.');
 const payer=key(web3,wallet.toBase58(),'payer');
 const receiver=key(web3,ATOMIC_DEVNET_RECIPIENT,'platform recipient');
 const final=checkFinalInstruction({web3,wallet:payer,finalInstruction,iqLabsFeeReceiver});
 const transaction=new web3.Transaction();
 transaction.feePayer=payer;
 transaction.recentBlockhash=latestBlockhash;
 transaction.add(
  web3.ComputeBudgetProgram.setComputeUnitPrice({microLamports:1000}),
  web3.ComputeBudgetProgram.setComputeUnitLimit({units:400000}),
  finalInstruction,
  web3.SystemProgram.transfer({fromPubkey:payer,toPubkey:receiver,lamports:ATOMIC_DEVNET_PRICE_LAMPORTS})
 );
 // This is a stricter legacy size guard than an optimistic instruction count.
 const bytes=transaction.serialize({requireAllSignatures:false,verifySignatures:false});
 if(bytes.length>MAX_LEGACY_TX_BYTES)fail('Final registration + payment exceeds the 1,232-byte legacy Solana transaction limit.');
 return Object.freeze({transaction,network:'devnet',lamports:ATOMIC_DEVNET_PRICE_LAMPORTS,
  receiver:ATOMIC_DEVNET_RECIPIENT,onChainPath:final.path,serializedBytes:bytes.length});
}

/** Read only. Nothing counts as paid unless the finalized transaction contains
 * the exact IQ Labs registration AND exactly one exact SOL platform transfer. */
export async function verifyAtomicDevnetFinal({connection,web3,signature,payer,expectedPath,expectedMetadata,iqLabsFeeReceiver}={}){
 if(!connection?.getSignatureStatuses||!connection?.getParsedTransaction)fail('Devnet RPC is unavailable.');
 if(!web3?.PublicKey||!web3?.SystemProgram?.programId||!web3?.ComputeBudgetProgram?.programId)
  fail('A compatible Solana web3 implementation is required.');
 if(typeof expectedPath!=='string'||!expectedPath||typeof expectedMetadata!=='string'||!expectedMetadata)
  fail('The independently expected quest path and metadata are required.');
 const wallet=key(web3,payer,'payer');
 const feeReceiver=key(web3,iqLabsFeeReceiver,'IQ Labs fee receiver');
 if(typeof signature!=='string'||!/^[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(signature))fail('Invalid final transaction signature.');
 const state=await connection.getSignatureStatuses([signature],{searchTransactionHistory:true});
 const confirmation=state?.value?.[0];
 if(!confirmation||confirmation.confirmationStatus!=='finalized'||confirmation.err)
  fail('Final transaction is not successful and finalized; do not request a new platform payment.');
 const tx=await connection.getParsedTransaction(signature,{commitment:'finalized',maxSupportedTransactionVersion:0});
 if(!tx||tx.meta?.err||tx.transaction?.signatures?.[0]!==signature)
  fail('Finalized transaction receipt is missing or failed.');
 const signers=(tx.transaction.message?.accountKeys||[]).filter(item=>item.signer);
 if(signers.length!==1||!key(web3,signers[0].pubkey,'receipt signer').equals(wallet))
  fail('The finalized receipt is not signed by exactly the expected creator wallet.');
 const instructions=tx.transaction?.message?.instructions||[];
 const program=key(web3,IQ_LABS_PROGRAM,'IQ Labs program');
 const inventory=web3.PublicKey.findProgramAddressSync([new TextEncoder().encode(INVENTORY_SEED),wallet.toBuffer()],program)[0];
 let foundFinal=0,foundTransfer=0,foundBudget=0;
 for(const ix of instructions){
  if(ix.programId?.equals?.(program)){
   // getParsedTransaction returns IQ Labs instructions as raw base58 data.
   const data=base58Decode(ix.data);
   const decoded=parseFinalData(data);
   if(decoded.path!==expectedPath||decoded.metadataText!==expectedMetadata)fail('IQ Labs registration did not match the expected quest data.');
   const keys=(ix.accounts||[]).map(account=>String(account?.toBase58?.()||account));
   if(keys.length!==4||keys[0]!==wallet.toBase58()||keys[1]!==inventory.toBase58()||
      keys[2]!==web3.SystemProgram.programId.toBase58()||keys[3]!==feeReceiver.toBase58())
    fail('Inventory registration uses the wrong onchain accounts.');
   foundFinal++;
  }else if(ix.programId?.equals?.(web3.SystemProgram.programId)){
   const parsed=ix.parsed;
   if(parsed?.type!=='transfer'||String(parsed.info?.source)!==wallet.toBase58()||
      String(parsed.info?.destination)!==ATOMIC_DEVNET_RECIPIENT||
      parsed.info?.lamports!==ATOMIC_DEVNET_PRICE_LAMPORTS)fail('Unexpected SOL transfer in final transaction.');
   foundTransfer++;
  }else if(ix.programId?.equals?.(web3.ComputeBudgetProgram.programId)){
   foundBudget++;
  }else{
   fail('Unexpected program in final payment transaction.');
  }
 }
 if(foundFinal!==1||foundTransfer!==1||foundBudget!==2||instructions.length!==4)
  fail('The receipt must contain only two compute budgets, one IQ Labs registration and exactly one 0.03 SOL transfer.');
 return Object.freeze({network:'devnet',status:'finalized',signature,platformPaidLamports:ATOMIC_DEVNET_PRICE_LAMPORTS,
  payer:wallet.toBase58(),receiver:ATOMIC_DEVNET_RECIPIENT,registrationPath:expectedPath});
}

// Minimal strict base58 decoder used only for RPC transaction *data*, no keys.
function base58Decode(value){
 const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
 if(typeof value!=='string'||!value.length)fail('Missing IQ Labs instruction bytes.');
 let n=0n;
 for(const digit of value){const index=alphabet.indexOf(digit);if(index<0)fail('Invalid base58 instruction.');n=n*58n+BigInt(index);}
 const bytes=[];
 while(n){bytes.unshift(Number(n&255n));n>>=8n;}
 for(const digit of value){if(digit!=='1')break;bytes.unshift(0);}
 return Uint8Array.from(bytes);
}
