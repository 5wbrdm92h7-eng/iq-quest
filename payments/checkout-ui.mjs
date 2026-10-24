/* V5.4 Mainnet checkout/recovery UI. Disabled by three independent barriers:
 * site-config, client-bridge, and the server's legally reviewed production gates.
 * No wallet connection occurs while creating or editing a quest.
 */
import {API_BASE,MAINNET_RPC_URL,CHECKOUT_UI_ENABLED} from './site-config.mjs';
import {MAINNET_CLIENT_ENABLED,createMainnetOrder,submitMainnetOrder,
 verifyMainnetOrder,fingerprintDraft} from './client-bridge.mjs';
import {RECEIVER} from './order-core.mjs';
import {LEGAL_PROFILE} from '../legal-config.mjs';
import {requestCheckoutWallet} from '../wallet-bridge.js';

const get=id=>document.getElementById(id);
const start=get('simple-publish'),confirm=get('mainnet-confirm'),recovery=get('mainnet-recover');
const panel=get('mainnet-quote-panel'),invoice=get('mainnet-invoice'),consent=get('mainnet-order-consent');
const status=get('mainnet-status');
const RECOVERY_KEY='iqquest_mainnet_payment_v54';
let provider=null,order=null,draft=null,busy=false,active=false;

function message(value){status.textContent=String(value);}
function record(value){localStorage.setItem(RECOVERY_KEY,JSON.stringify(value));}
function readRecord(){try{return JSON.parse(localStorage.getItem(RECOVERY_KEY)||'null');}catch{return null;}}
function gameUrl(questId){
 const url=new URL('index.html',location.href);
 url.searchParams.set('quest',questId);
 return url.toString();
}
function showCompleted(questId){
 const url=gameUrl(questId);
 const old=readRecord();
 if(old&&old.orderId===questId)record({...old,published:true,gameUrl:url});
 message('✓ Finalized SOL payment verified. Your 15-question quest is available at '+url+'\nPublishing mode: IQ QUEST database, NOT IQ Labs onchain.');
 panel.classList.add('hidden');
 recovery.classList.add('hidden');
 window.IQQuestShowVerifiedPublication?.({url,title:draft?.title||old?.title||'Your mystery',network:'cloud'});
}
function refresh(){
 start.disabled=!active||busy;
 start.setAttribute('aria-disabled',String(start.disabled));
 start.classList.toggle('publish-simple-button',!active);
 if(active)start.textContent='CONNECT SOLANA WALLET · GET EXACT SOL QUOTE';
 confirm.disabled=!active||busy||!consent.checked||!order;
 recovery.disabled=!active||busy;
}
async function checkReadiness(){
 const legalReady=LEGAL_PROFILE.reviewedForLaunch===true&&
  ['operatorName','operatorAddress','businessEmail','businessPhone'].every(key=>String(LEGAL_PROFILE[key]||'').trim());
 if(!CHECKOUT_UI_ENABLED||!MAINNET_CLIENT_ENABLED||!API_BASE||!MAINNET_RPC_URL||!legalReady){
  message('SOL Mainnet checkout is prepared but OFF. You can create and test a quest without connecting a wallet. Operator details, the live payment server and independent Mainnet QA are required before launch.');
  return;
 }
 try{
  const response=await fetch(new URL('/api/health',API_BASE),{cache:'no-store'});
  const info=await response.json();
  if(!response.ok||!info.mainnetCheckoutEnabled||info.receiver!==RECEIVER)throw Error('Checkout backend is not approved or is configured for a different payout wallet.');
  active=true;
  message('Mainnet checkout available. Your wallet will connect only when you request a payment quote.');
  const saved=readRecord();
  if(saved?.signature&&!saved.published){
   recovery.classList.remove('hidden');
   message('An earlier signed SOL transaction was saved. Verify the same signature BEFORE beginning another payment.');
  }else if(saved?.published&&saved.gameUrl){
   message('Your previous quest: '+saved.gameUrl+'\nYou can create a different quest and request a new quote.');
  }
 }catch(error){message('SOL Mainnet checkout unavailable: '+String(error.message||error)+'. No wallet connection or payment was requested.');}
 finally{refresh();}
}

start.addEventListener('click',async()=>{
 if(!active||busy)return;
 const saved=readRecord();
 if(saved?.signature&&!saved.published){
  recovery.classList.remove('hidden');
  message('Existing signed order found. Verify its signature first; never pay twice.');
  return;
 }
 busy=true;refresh();panel.classList.add('hidden');
 try{
  draft=window.IQQuestEditorGetDraft?.();
  if(!draft)throw Error('Complete all 15 questions first.');
  message('Choose a wallet for SOL Mainnet. No SOL is sent at this step.');
  provider=await requestCheckoutWallet({purpose:'payment',network:'mainnet-beta',forceChoice:true,onProgress:message});
  message('Fetching a 5-minute server quote for these exact 15 questions…');
  order=await createMainnetOrder({apiBase:API_BASE,provider,draft,plan:'community'});
  consent.checked=false;
  invoice.textContent=[
   'One-time public quest publication · 15 questions',
   'Price: $3.99 USD equivalent = '+order.sol+' SOL',
   'Network: Solana MAINNET (real SOL)',
   'Recipient: '+order.receiver,
   'Payer: '+order.payer,
   'Rate: $'+order.quoteUsdPerSol+' per SOL',
   'Valid until: '+new Date(order.expiresAt).toLocaleString(),
   'Additional wallet/network fees apply. Public IQ QUEST database release; not IQ Labs onchain.'
  ].join('\n');
  confirm.textContent='ORDER WITH OBLIGATION TO PAY · '+order.sol+' SOL';
  panel.classList.remove('hidden');
  message('Review the quote and fees, then explicitly place your paid order. Nothing has been sent yet.');
 }catch(error){message('No SOL was requested: '+String(error?.message||error));order=null;}
 finally{busy=false;refresh();}
});

consent.addEventListener('change',refresh);
confirm.addEventListener('click',async()=>{
 if(!active||busy||!order||!consent.checked)return;
 busy=true;refresh();
 try{
  const latest=window.IQQuestEditorGetDraft?.();
  if(await fingerprintDraft(latest,provider.publicKey.toBase58())!==order.fingerprint)
   throw Error('You edited your quest after receiving the invoice. Start checkout again for a fresh quote; nothing was sent.');
  const last=readRecord();
  if(last?.signature&&!last.published)throw Error('Another signed transaction is awaiting recovery. Verify it first.');
  message('Final wallet signature request. Verify the exact SOL amount, Mainnet and receiving wallet.');
  const result=await submitMainnetOrder({
   apiBase:API_BASE,provider,order,mainnetRpcUrl:MAINNET_RPC_URL,
   onSigned:details=>{
    // Called BEFORE broadcast. Failure to persist aborts the transfer.
    record({...details,createdAt:Date.now(),title:draft.title,published:false});
    recovery.classList.remove('hidden');
    return true;
   },
   onProgress:message
  });
  if(result.status==='published')showCompleted(result.questId);
  else message('Transaction is still pending. Do not pay again. Use Verify Saved SOL Transaction with the same signature.');
 }catch(error){
  if(String(error?.message||error).includes('edited your quest')){order=null;panel.classList.add('hidden');}
  message('Payment/publication NOT confirmed: '+String(error?.message||error)+'\nIf you approved a transaction, check the saved signature and wallet history. Never send another payment without investigating.');
 }finally{busy=false;refresh();}
});

recovery.addEventListener('click',async()=>{
 if(!active||busy)return;
 const saved=readRecord();
 if(!saved?.orderId||!saved.signature){message('No saved signed transaction to verify.');return;}
 busy=true;refresh();
 try{
  message('Checking the same transaction '+saved.signature+' against Solana Mainnet…');
  const result=await verifyMainnetOrder({apiBase:API_BASE,orderId:saved.orderId,signature:saved.signature});
  if(result.status==='published')showCompleted(result.questId);
  else message('Not finalized/indexed yet. Retry THIS saved transaction later. Do not pay again.');
 }catch(error){message('Verification still unresolved: '+String(error?.message||error)+'. Check this exact signature in Solana Explorer before doing anything else: '+saved.signature);}
 finally{busy=false;refresh();}
});

refresh();
void checkReadiness();
