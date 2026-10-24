/* IQ QUEST V5.1 — Wallet connection is deliberately delayed until checkout
 * or recovery of a previously paid Devnet publication. Never auto-connect.
 */
export const WALLET_CHOICES=Object.freeze([
 {id:'phantom',name:'Phantom'},
 {id:'solflare',name:'Solflare'},
 {id:'backpack',name:'Backpack'}
]);

let activeProvider=null;
let activeWalletId='';
let activeNetwork='';
let walletRegistryPromise=null;
let chooserPromise=null;

function matchesWallet(provider,id){
 return !!provider&&typeof provider.connect==='function'&&typeof provider.signTransaction==='function'&&
  ((id==='phantom'&&provider.isPhantom===true)||
   (id==='solflare'&&provider.isSolflare===true)||
   (id==='backpack'&&provider.isBackpack===true));
}

// Exact vendor flags avoid accidentally using whichever extension owns window.solana.
export function findInjectedProvider(id,root=globalThis){
 if(!WALLET_CHOICES.some(w=>w.id===id))return null;
 const candidates=id==='phantom'
  ?[root.phantom?.solana,root.solana]
  :id==='solflare'
  ?[root.solflare?.solana,root.solflare,root.solana]
  :[root.backpack?.solana,root.backpack,root.solana];
 return candidates.find(provider=>matchesWallet(provider,id))||null;
}

async function walletStandardRegistry(){
 if(!walletRegistryPromise)walletRegistryPromise=import('https://esm.sh/@wallet-standard/app@1.1.1?bundle')
  .then(module=>module.getWallets())
  .catch(error=>{walletRegistryPromise=null;throw error;});
 return walletRegistryPromise;
}

function findStandardWallet(wallets,id){
 const names=id==='backpack'?['backpack','backpack wallet']
  :id==='solflare'?['solflare','solflare wallet']:['phantom','phantom wallet'];
 return wallets.find(wallet=>
  names.includes(String(wallet?.name||'').toLowerCase().trim())&&
  typeof wallet.features?.['standard:connect']?.connect==='function'&&
  typeof wallet.features?.['solana:signTransaction']?.signTransaction==='function')||null;
}

async function loadWeb3(){
 const buffer=await import('https://esm.sh/buffer@6.0.3?bundle');
 if(!globalThis.Buffer)globalThis.Buffer=buffer.Buffer;
 if(!globalThis.process)globalThis.process={env:{NODE_ENV:'production'},version:'',versions:{}};
 return import('https://esm.sh/@solana/web3.js@1.99.0?bundle');
}

async function connectStandardWallet(id,{network='devnet',registryFactory=walletStandardRegistry,web3Factory=loadWeb3}={}){
 const chain=network==='mainnet-beta'?'solana:mainnet':'solana:devnet';
 const networkLabel=network==='mainnet-beta'?'Mainnet':'Devnet';
 const registry=await registryFactory();
 let wallet=findStandardWallet(registry.get(),id);
 if(!wallet){
  // Some mobile wallet providers register just after the app-ready event.
  await new Promise(resolve=>setTimeout(resolve,120));
  wallet=findStandardWallet(registry.get(),id);
 }
 if(!wallet)throw Error('This wallet was not detected. Install its extension or open IQ QUEST inside its wallet browser, then try again.');
 if(!wallet.chains?.includes(chain))throw Error(wallet.name+' does not advertise Solana '+networkLabel+' here. Select the correct network in your wallet and retry.');
 const {accounts}=await wallet.features['standard:connect'].connect();
 const account=accounts?.find(item=>item.chains?.includes(chain)&&
  item.features?.includes('solana:signTransaction'));
 if(!account)throw Error(wallet.name+' did not provide an account able to sign '+network+' transactions.');
 const web3=await web3Factory();
 const publicKey=new web3.PublicKey(account.address);
 const sign=async transaction=>{
  const bytes=transaction.serialize({requireAllSignatures:false,verifySignatures:false});
  const feature=wallet.features['solana:signTransaction'];
  const results=await feature.signTransaction({account,chain,transaction:new Uint8Array(bytes)});
  const raw=results?.[0]?.signedTransaction;
  if(!raw)throw Error(wallet.name+' did not return a signed transaction. Nothing was submitted.');
  const signed=web3.Transaction.from(new Uint8Array(raw));
  if(!signed.feePayer?.equals(publicKey))throw Error('The wallet returned an unexpected fee payer. Nothing was submitted.');
  return signed;
 };
 // Deliberately omit signAllTransactions: the onchain bridge will ask for
 // explicit per-transaction approvals when a wallet does not batch-sign.
 return {
  walletName:wallet.name,
  publicKey,
  signTransaction:sign,
  async connect(){return {publicKey};}
 };
}

export async function connectSelectedWallet(id,{network='devnet',root=globalThis,registryFactory=walletStandardRegistry,web3Factory=loadWeb3}={}){
 if(!WALLET_CHOICES.some(w=>w.id===id))throw Error('Choose a supported Solana wallet.');
 if(!['devnet','mainnet-beta'].includes(network))throw Error('Unsupported wallet network.');
 const injected=findInjectedProvider(id,root);
 let provider;
 if(injected){
  const connected=await injected.connect();
  const key=injected.publicKey||connected?.publicKey;
  if(typeof key?.toBase58!=='function')throw Error('The selected wallet did not return a valid public key.');
  provider={
   walletName:WALLET_CHOICES.find(wallet=>wallet.id===id).name,
   publicKey:key,
   signTransaction:tx=>injected.signTransaction(tx)
  };
  if(typeof injected.signAllTransactions==='function')
   provider.signAllTransactions=txs=>injected.signAllTransactions(txs);
 }else{
  provider=await connectStandardWallet(id,{network,registryFactory,web3Factory});
 }
 activeProvider=provider;
 activeWalletId=id;
 activeNetwork=network;
 return provider;
}

export function currentCheckoutWallet(network='devnet'){
 return activeNetwork===network&&activeProvider?.publicKey?.toBase58?.()?activeProvider:null;
}

export function currentWalletName(){return WALLET_CHOICES.find(w=>w.id===activeWalletId)?.name||'';}

// This is called only after the creator clicks a payment/publication action.
// The wallet's connect() runs in the chooser's confirm-button handler.
export function requestCheckoutWallet({purpose='payment',network='devnet',forceChoice=false,onProgress=()=>{}}={}){
 if(!forceChoice&&currentCheckoutWallet(network))return Promise.resolve(currentCheckoutWallet(network));
 if(chooserPromise)return chooserPromise;
 const panel=document.getElementById('wallet-choice-panel');
 const confirm=document.getElementById('wallet-choice-confirm');
 const cancel=document.getElementById('wallet-choice-cancel');
 const status=document.getElementById('wallet-choice-status');
 const heading=document.getElementById('wallet-choice-heading');
 if(!panel||!confirm||!cancel||!status||!heading)throw Error('The wallet chooser is unavailable. Refresh the creator page.');
 heading.textContent=purpose==='publication'?'Connect Phantom to finish Devnet publication':'Connect Phantom just before the test transfer';
 status.textContent='Only a wallet connection is requested first. Network: '+network+'. You will separately approve each transaction.';
 panel.classList.remove('hidden');
 // Discover Wallet Standard registrations while the creator chooses; this
 // only reads installed providers and never requests account access.
 void walletStandardRegistry().catch(()=>{});
 panel.scrollIntoView({behavior:'smooth',block:'nearest'});
 panel.querySelector('input[name="checkout-wallet"]:checked')?.focus({preventScroll:true});
 const promise=new Promise((resolve,reject)=>{
  let connecting=false;
  function cleanup(){
   confirm.removeEventListener('click',accept);
   cancel.removeEventListener('click',abort);
   panel.classList.add('hidden');
   confirm.disabled=false;
  }
  async function accept(){
   if(connecting)return;
   const id=panel.querySelector('input[name="checkout-wallet"]:checked')?.value;
   connecting=true;confirm.disabled=true;
   status.textContent='Connecting '+(WALLET_CHOICES.find(w=>w.id===id)?.name||'wallet')+'… Please approve the connection in your wallet.';
   onProgress(status.textContent);
   try{
    const provider=await connectSelectedWallet(id,{network});
    status.textContent='Wallet connected. Continuing with the requested '+network+' step…';
    cleanup();resolve(provider);
   }catch(error){
    connecting=false;confirm.disabled=false;
    status.textContent='Wallet connection failed: '+String(error?.message||error)+'. Check Phantom and Devnet settings, then retry or cancel.';
    onProgress(status.textContent);
   }
  }
  function abort(){if(connecting)return;cleanup();reject(Error('Wallet selection cancelled. Nothing was charged or published.'));}
  confirm.addEventListener('click',accept);
  cancel.addEventListener('click',abort);
 });
 chooserPromise=promise.finally(()=>{chooserPromise=null;});
 return chooserPromise;
}
