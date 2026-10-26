/**
 * Deterministic IQ QUEST Battle Pool selector (alongside the JSON packs).
 * Each difficulty needs two independently verified 15-question IQ Labs packs.
 * For every one of the 15 puzzle families, a seed chooses exactly one of two
 * variants. It then shuffles the 15 independent questions reproducibly.
 *
 * This module does NOT claim any local JSON file is onchain. The caller must
 * independently verify pack signatures/readbacks before showing that badge.
 */

function seedHash(value){
 let h=2166136261;
 for(const ch of value)h=Math.imul(h^ch.charCodeAt(0),16777619)>>>0;
 return h||0x9e3779b9;
}

function makeRandom(seed){
 let x=seedHash(seed);
 return ()=>{
  x^=x<<13;x^=x>>>17;x^=x<<5;
  return (x>>>0)/0x100000000;
 };
}

export function assembleBattleQuest(packA,packB,seed){
 if(typeof seed!=='string'||!/^[-_A-Za-z0-9]{6,40}$/.test(seed))throw Error('Battle seed must have 6–40 URL-safe characters.');
 if(!packA||!packB||packA.difficulty!==packB.difficulty||!['Easy','Medium','Hard'].includes(packA.difficulty))throw Error('Battle packs must use the same supported difficulty.');
 if(!Array.isArray(packA.levels)||packA.levels.length!==15||!Array.isArray(packB.levels)||packB.levels.length!==15)throw Error('Exactly 15 questions are needed from EACH published pack.');
 const rng=makeRandom(packA.difficulty+':'+seed);
 const questions=[];
 for(let i=0;i<15;i++){
  const chosen=rng()<0.5?packA.levels[i]:packB.levels[i];
  if(!chosen||!['title','q','h','a'].every(field=>typeof chosen[field]==='string'&&chosen[field].trim()))throw Error('Battle pool contains an incomplete question at position '+(i+1));
  questions.push({title:chosen.title,q:chosen.q,h:chosen.h,a:chosen.a});
 }
 for(let i=questions.length-1;i>0;i--){
  const j=Math.floor(rng()*(i+1));
  [questions[i],questions[j]]=[questions[j],questions[i]];
 }
 const levels=questions.map((q,i)=>({...q,title:`${String(i+1).padStart(2,'0')} · ${q.title.replace(/^\d{2}\s*[·.]\s*/,'')}`}));
 return {v:1,title:`IQ QUEST ${packA.difficulty} Battle`,creator:'IQ QUEST · Powered by IQ Labs',difficulty:packA.difficulty,theme:'Fifteen independently solvable mysteries selected from the Battle Pool. Compare times with friends; browser times and scores are unverified.',levels};
}

/**
 * V2: Select 15 independent puzzles from three separately verified Devnet
 * inscriptions (45 source questions). A and B contain alternate variants of
 * the same 15 families; C contributes 15 additional families. A shared seed
 * deterministically selects distinct families and the same questions for all
 * players opening that battle link.
 */
export function assembleBattleQuestV2(packs,seed){
 if(typeof seed!=='string'||!/^[-_A-Za-z0-9]{6,40}$/.test(seed))throw Error('Battle seed must have 6–40 URL-safe characters.');
 if(!Array.isArray(packs)||packs.length!==3)throw Error('Three verified Devnet Battle packs are required.');
 const difficulty=packs[0]?.difficulty;
 if(!['Easy','Medium','Hard'].includes(difficulty))throw Error('Unsupported Battle difficulty.');
 const families=new Map();
 for(const [packIndex,pack] of packs.entries()){
  if(pack?.difficulty!==difficulty||!Array.isArray(pack.levels)||pack.levels.length!==15)
   throw Error('All three packs must have 15 questions of the same difficulty.');
  for(const [questionIndex,question] of pack.levels.entries()){
   if(!question||!['title','q','h','a'].every(key=>typeof question[key]==='string'&&question[key].trim()))
    throw Error('Incomplete Battle question in pack '+(packIndex+1)+' at index '+(questionIndex+1));
   const family=question.title.replace(/^\d{2}\s*[·.]\s*/,'').trim().toLowerCase();
   if(!family)throw Error('A Battle question is missing its family title.');
   if(!families.has(family))families.set(family,[]);
   families.get(family).push(question);
  }
 }
 if(families.size!==30)throw Error('The 45 questions must contain 30 distinct puzzle families.');
 const rng=makeRandom('v2:'+difficulty+':'+seed);
 const shuffle=items=>{
  for(let i=items.length-1;i>0;i--){
   const j=Math.floor(rng()*(i+1));
   [items[i],items[j]]=[items[j],items[i]];
  }
  return items;
 };
 const chosen=shuffle([...families.values()]).slice(0,15).map(variants=>variants[Math.floor(rng()*variants.length)]);
 shuffle(chosen);
 const levels=chosen.map((question,index)=>({
  title:`${String(index+1).padStart(2,'0')} · ${question.title.replace(/^\d{2}\s*[·.]\s*/,'')}`,
  q:question.q,h:question.h,a:question.a
 }));
 return {v:1,title:`IQ QUEST ${difficulty} Battle`,creator:'IQ QUEST · Powered by IQ Labs',difficulty,
  theme:'Fifteen independent puzzles chosen from 45 verified onchain questions. The same Battle link gives every player identical puzzles; browser times and scores are unverified.',levels};
}

// The seed is published in a challenge URL to let another browser assemble
// the exact same 15 questions AFTER both verified pack signatures are loaded.
export function freshBattleSeed(cryptoSource=globalThis.crypto){
 if(!cryptoSource?.getRandomValues)throw Error('Secure random seed generation is not available.');
 const bytes=new Uint8Array(12);cryptoSource.getRandomValues(bytes);
 return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
