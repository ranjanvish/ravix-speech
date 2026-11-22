/* Pure, local dialogue planning; this module never runs or downloads audio. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RavixDialoguePlanner = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const allowed = new Set(['masculine', 'feminine', 'neutral', 'unspecified']);
  const required = (v, label) => {
    if (typeof v !== 'string' || !v.trim()) throw new Error(label + ' आवश्यक है।');
    return v.trim();
  };
  function plan(cast, turns, options = {}) {
    if (!Array.isArray(cast) || !cast.length || !Array.isArray(turns) || !turns.length) throw new Error('पात्र और क्रमवार turns की non-empty JSON lists दें।');
    const byName = new Map(), byVoice = new Map(), issues = [];
    for (const entry of cast) {
      if (!entry || typeof entry !== 'object') throw new Error('हर पात्र एक object होना चाहिए।');
      const name = required(entry.name, 'पात्र का नाम');
      const voice = required(entry.voice, `${name}: voice`);
      const style = required(entry.style, `${name}: baseline style`);
      const presentation = entry.presentation || 'unspecified';
      const voicePresentation = entry.voicePresentation || 'unspecified';
      if (!allowed.has(presentation) || !allowed.has(voicePresentation)) throw new Error(`${name}: presentation masculine, feminine, neutral या unspecified होना चाहिए।`);
      if (byName.has(name)) throw new Error(`पात्र दो बार दिया गया: ${name}`);
      const voiceKey = voice.toLocaleLowerCase();
      if (byVoice.has(voiceKey) && !options.allowSharedVoice) throw new Error(`${name} और ${byVoice.get(voiceKey)} की voice एक ही है। अलग voice चुनें या जानबूझकर reuse स्पष्ट करें।`);
      byVoice.set(voiceKey, name);
      if (presentation === 'unspecified' || voicePresentation === 'unspecified') issues.push(`${name}: पात्र और voice presentation सत्यापित करें; नाम से अनुमान न लगाएँ।`);
      else if (presentation !== voicePresentation) issues.push(`${name}: ${presentation} पात्र और ${voicePresentation} voice का चयन मेल नहीं खाता; उद्देश्यपूर्वक हो तो जाँचकर दर्ज करें।`);
      if (entry.auditioned !== true) issues.push(`${name}: voice का भाषा और अभिनय में audition अभी सत्यापित नहीं है।`);
      byName.set(name, {name, voice, style, presentation, voicePresentation, auditioned:entry.auditioned === true});
    }
    const planned = turns.map((turn, index) => {
      if (!turn || typeof turn !== 'object') throw new Error(`Turn ${index+1}: object आवश्यक है।`);
      const speaker = required(turn.speaker, `Turn ${index+1}: speaker`);
      const actor = byName.get(speaker);
      if (!actor) throw new Error(`Turn ${index+1}: ${speaker} casting में नहीं है।`);
      if (turn.voice != null && (typeof turn.voice !== 'string' || turn.voice.trim().toLocaleLowerCase() !== actor.voice.toLocaleLowerCase())) throw new Error(`Turn ${index+1}: ${speaker} की voice casting से अलग है।`);
      return {turn:index+1, speaker, voice:actor.voice, style:typeof turn.style === 'string' && turn.style.trim() ? turn.style.trim() : actor.style, text:required(turn.text, `Turn ${index+1}: text`)};
    });
    // Creative batches contain as many consecutive turns as fit within two characters.
    const batches=[];
    for (const turn of planned) {
      let last=batches[batches.length-1];
      const chars = last ? new Set(last.turns.map(t=>t.speaker)) : new Set();
      if (!last || (chars.size === 2 && !chars.has(turn.speaker))) {
        last={batch:batches.length+1, turns:[]}; batches.push(last);
      }
      last.turns.push(turn);
    }
    // The observed editor alternates speaker assignment; consecutive identical speakers
    // need separate execution batches until a supported assignment control is verified.
    const executionBatches=[];
    for (const turn of planned) {
      let last=executionBatches[executionBatches.length-1];
      const chars=last ? new Set(last.turns.map(t=>t.speaker)) : new Set();
      if (!last || (chars.size===2 && !chars.has(turn.speaker)) || last.turns[last.turns.length-1].speaker===turn.speaker) {
        last={batch:executionBatches.length+1,turns:[]};executionBatches.push(last);
      }
      last.turns.push(turn);
    }
    return {version:1, model:'gemini-3.8-flash-tts', readyForGeneration:issues.length===0, casting:[...byName.values()], turns:planned,
      batches, executionBatches, issues, timing:{preferred:'download each contiguous execution batch immediately and concatenate in script order', pairExport:'Split combined output only when boundaries can be independently verified.', preserveOriginals:true, forcedAlignment:'Not needed when concatenating verified contiguous batches; use only if a batch must be split.', speed:'No fixed speedup is guaranteed; measure on actual hardware and compare output quality.'}};
  }
  return {plan};
});
