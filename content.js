/**
 * RAVIX Speech Assistant - 100% Fully Autonomous Content Engine
 * Google AI Studio (Gemini 3.8 Flash TTS / Multi-Speaker Screenplays)
 * Version 1.2.2 - Multi-Turn Speech Blocks, 2,000+ Voices Catalog, 100% All-Block Style Engine
 */
(() => {
  if (window.__ravixAutonomousEngineLoaded) {
    console.log('[RAVIX Speech Engine] Updating engine instance in place...');
  }
  window.__ravixAutonomousEngineLoaded = true;

  console.log('[RAVIX Speech Engine] Autonomous Engine v1.2.2 active on:', window.location.href);

  let latestAudioData = null;

  window.addEventListener('message', ev => {
    if (ev.data && ev.data.type === '__RAVIX_AUDIO_DATA__') {
      const size = ev.data.size || 0;
      if (size > 50000) {
        console.log('[RAVIX Speech Engine] Intercepted master dialogue audio, bytes:', size);
        if (!latestAudioData || size > (latestAudioData.size || 0)) {
          latestAudioData = ev.data;
        }
      } else {
        console.log('[RAVIX Speech Engine] Ignored preview chirp/sample sound, bytes:', size);
      }
    }
  });

  function injectMainWorldHook() {
    try {
      const script = document.createElement('script');
      script.textContent = `
        (() => {
          if (window.__ravixAudioHookInstalled) return;
          window.__ravixAudioHookInstalled = true;
          const origCreate = URL.createObjectURL;
          URL.createObjectURL = function(blob) {
            const url = origCreate.call(URL, blob);
            try {
              if (blob && blob.size > 50000) {
                const reader = new FileReader();
                reader.onloadend = () => {
                  window.postMessage({
                    type: '__RAVIX_AUDIO_DATA__',
                    url: url,
                    base64: reader.result ? reader.result.split(',')[1] : null,
                    size: blob.size
                  }, '*');
                };
                reader.readAsDataURL(blob);
              }
            } catch(e) {}
            return url;
          };
          console.log('[RAVIX Hook] URL.createObjectURL master audio interceptor active.');
        })();
      `;
      (document.head || document.documentElement).appendChild(script);
      script.remove();
    } catch(e) {}
  }
  injectMainWorldHook();

  const delay = ms => new Promise(r => setTimeout(r, ms));

  function isVisible(el) {
    if (!el) return false;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function getText(el) {
    if (!el) return '';
    return ((el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('title') || '') + ' ' + (el.innerText || '')).replace(/\s+/g, ' ').trim();
  }

  function getButtons(root = document) {
    return [...root.querySelectorAll('button, [role="button"]')].filter(isVisible);
  }

  function findButton(regex, root = document) {
    return getButtons(root).find(b => regex.test(getText(b))) || null;
  }

  function findClickableByText(regex, root = document) {
    const candidates = [...root.querySelectorAll('button, [role="button"], a, mat-card, .card, div[class*="card"], div[class*="dialog"], span, div')].filter(isVisible);
    const matches = candidates.filter(el => {
      const text = getText(el);
      return regex.test(text);
    });

    if (!matches.length) return null;
    matches.sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length);
    return matches[0];
  }

  function clickElement(el) {
    if (!el) return;
    el.focus?.();
    try { el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); } catch(e) {}
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    try { el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true })); } catch(e) {}
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    el.click();
  }

  async function waitFor(fn, description = 'Condition', timeoutMs = 15000, intervalMs = 250) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const res = fn();
        if (res) return res;
      } catch (e) {}
      await delay(intervalMs);
    }
    throw new Error(`Timeout waiting for ${description} after ${timeoutMs}ms`);
  }

  function setElementValue(el, val) {
    if (!el) return false;
    el.focus();
    if (el.isContentEditable) {
      el.textContent = val;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: val }));
    } else {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) {
        setter.call(el, val);
      } else {
        el.value = val;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ' }));
    return true;
  }

  // Get all dialogue speech textareas in the main editor (excluding modals/settings)
  function getSpeechTextareas() {
    return [...document.querySelectorAll('textarea')].filter(el => {
      if (!isVisible(el)) return false;
      if (el.closest('[role="dialog"], mat-dialog-container, .cdk-overlay-pane')) return false;
      return true;
    });
  }

  // Find the "+ Add speech block" button
  function findAddSpeechBlockButton() {
    const btns = getButtons();
    const btn = btns.find(b => /add speech block/i.test(getText(b)));
    if (btn) return btn;
    return findClickableByText(/add speech block/i);
  }

  // Find enclosing block card for a given textarea (contains exactly 1 speech textarea and toolbar buttons)
  function getBlockCard(ta) {
    let el = ta.parentElement;
    while (el && el !== document.body) {
      const tas = el.querySelectorAll('textarea');
      if (tas.length === 1 && el.querySelector('button, [role="button"]')) {
        return el;
      }
      el = el.parentElement;
    }
    return ta.parentElement?.parentElement || ta;
  }

  function scanPage() {
    const btns = getButtons().map(getText).filter(Boolean);
    const editors = getSpeechTextareas();
    const runBtn = findButton(/^run\b/i) || findButton(/run ctrl/i);
    const stopBtn = findButton(/^stop\b/i);
    const downloadBtn = findButton(/download/i);
    const addBlockBtn = findAddSpeechBlockButton();

    const models = btns.filter(b => /gemini.*tts/i.test(b));
    const speakers = [...new Set(btns.filter(b => /^speaker\s*\d/i.test(b)))];

    const speechPage = location.hostname === 'aistudio.google.com' && /^\/generate-speech(?:\/|$)/.test(location.pathname);
    const isEditorActive = speechPage && editors.length > 0 && Boolean(addBlockBtn);
    const create = speechPage && Boolean(findButton(/create\s*(?:new)?\s*dialog/i) || findClickableByText(/create\s*(?:new)?\s*dialog/i));
    const welcome = [...document.querySelectorAll('[role="dialog"], mat-dialog-container, .mat-mdc-dialog-container')].filter(isVisible)
      .find(d => /welcome to ai studio/i.test(d.innerText || '') && /terms of service/i.test(d.innerText || ''));
    const phase = welcome ? 'welcome_terms' : !speechPage ? 'wrong_page' : isEditorActive ? 'editor' : create ? 'landing' : 'unknown';

    return {
      ok: true,
      url: window.location.href,
      title: document.title,
      phase,
      blockCount: isEditorActive ? editors.length : 0,
      modelCandidates: models,
      speakers,
      canRun: Boolean(!welcome && isEditorActive && runBtn && !runBtn.disabled && runBtn.getAttribute('aria-disabled') !== 'true'),
      isGenerating: Boolean(isEditorActive && stopBtn),
      canDownload: Boolean(isEditorActive && downloadBtn && !downloadBtn.disabled),
      hasAddBlock: Boolean(isEditorActive && addBlockBtn),
      guidance: phase === 'welcome_terms' ? 'AI Studio welcome/terms dialog is blocking the editor. Inspect it and continue only with the user’s authorization.' : phase === 'wrong_page' ? 'Open Run settings > model > Audio > a TTS model, then Create new dialog.' : phase === 'unknown' ? 'Speech controls not recognized; wait or inspect the page.' : '',
      dialogueGuidance: 'Read docs/INSTANT-RUNBOOK.md before a new speech task. Cast distinct auditioned voices appropriate to each character; keep voices stable. Use maximal contiguous batches of at most two characters when requested; verify each voice and style before Run, download and verify immediately, then join in script order. Second-speaker selection and automatic end-to-end delivery are not verified. Preserve drafts and existing audio; never repeat an uncertain Run. Forced alignment is unnecessary for intact batches and cannot independently verify a cut.'
    };
  }

  // Ensure dialogue editor is open
  async function ensureEditor(metrics = null) {
    const initial = scanPage();
    if (initial.phase === 'wrong_page') throw new Error('Wrong page: select a TTS model under Run settings > model > Audio, then Create new dialog.');
    if (initial.phase === 'welcome_terms') throw new Error('Welcome/terms dialog blocks the editor; inspect it first.');
    if (initial.phase === 'editor') return true;
    // Wait on the actual button, not a fixed page-load sleep or an unrelated model card.
    const create = await waitFor(() => {
      const state = scanPage();
      if (state.phase !== 'landing') return null;
      const matches = getButtons().filter(b => /create\s*(?:new)?\s*dialog/i.test(getText(b)));
      return matches.length === 1 ? matches[0] : null;
    }, 'unique Create new dialog button', 15000, 100);
    if (metrics) metrics.createClickAt = Date.now();
    create.click();
    await waitFor(() => scanPage().phase === 'editor', 'speech editor after Create new dialog', 12000, 100);
    return true;
  }

  // Add speech blocks until targetCount is reached
  async function ensureBlockCount(targetCount) {
    await ensureEditor();
    let textareas = getSpeechTextareas();
    let currentCount = textareas.length;
    let attempts = 0;

    console.log(`[RAVIX Speech Engine] Target blocks: ${targetCount}, Current blocks: ${currentCount}`);

    while (currentCount < targetCount && attempts < 20) {
      attempts++;
      const addBtn = findAddSpeechBlockButton();
      if (!addBtn) {
        console.warn('Add speech block button not found yet, retrying...');
        await delay(600);
        continue;
      }
      console.log(`[RAVIX Speech Engine] Clicking '+ Add speech block' (attempt ${attempts}, current ${currentCount}/${targetCount})...`);
      clickElement(addBtn);
      await delay(600);

      textareas = getSpeechTextareas();
      currentCount = textareas.length;
    }

    console.log(`[RAVIX Speech Engine] Finished block setup: ${currentCount} speech blocks present.`);
    if (currentCount !== targetCount) throw new Error(`Expected ${targetCount} blocks, found ${currentCount}; existing blocks were not removed.`);
    return currentCount;
  }

  // Configure Voice for Speaker 1 or Speaker 2 from 2,000+ voices catalog
  async function configureSpeakerVoice(speakerNum, targetVoice) {
    if (!targetVoice) return;
    console.log(`[RAVIX Speech Engine] Setting Speaker ${speakerNum} to voice: "${targetVoice}"...`);

    const currentChips = [...document.querySelectorAll('.voice-chip-label, button')].filter(isVisible);
    const existing = currentChips.find(c => {
      const t = getText(c);
      return new RegExp(`speaker\\s*${speakerNum}`, 'i').test(t) && t.toLowerCase().includes(targetVoice.toLowerCase());
    });
    if (existing) {
      console.log(`[RAVIX Speech Engine] Speaker ${speakerNum} already set to "${targetVoice}".`);
      return;
    }

    const settingsButtons = [...document.querySelectorAll('button[aria-label="Open voice settings" i]')].filter(isVisible);
    const spkBtn = settingsButtons[speakerNum - 1] || [...document.querySelectorAll('button')].filter(isVisible).find(b => {
      const t = getText(b);
      return new RegExp(`speaker\\s*${speakerNum}\\b`, 'i').test(t);
    });

    if (spkBtn) {
      clickElement(spkBtn);
      await delay(500);
    }

    let searchInput = await waitFor(() => {
      const inputs = [...document.querySelectorAll('.voice-search-input input, input[placeholder*="Search" i], input')].filter(isVisible);
      return inputs.find(i => /search/i.test(i.placeholder || '') || /search/i.test(i.getAttribute('aria-label') || ''));
    }, 'Voice catalog search input', 4000).catch(() => null);
    if (!searchInput && spkBtn) {
      await delay(900);
      spkBtn.click();
      searchInput = await waitFor(() => [...document.querySelectorAll('input')].filter(isVisible).find(i => /search/i.test(i.placeholder || '') || /search/i.test(i.getAttribute('aria-label') || '')), 'Voice catalog search input', 5000).catch(() => null);
    }

    if (searchInput) {
      console.log(`[RAVIX Speech Engine] Searching voice catalog for: "${targetVoice}"...`);
      searchInput.focus();
      searchInput.value = targetVoice;
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      searchInput.dispatchEvent(new Event('change', { bubbles: true }));
      await delay(700);

      const match = [...document.querySelectorAll('button')].find(b => {
        const a = b.getAttribute('aria-label') || '';
        return a.toLowerCase() === targetVoice.toLowerCase();
      });

      if (match) {
        console.log(`[RAVIX Speech Engine] Voice row found. Selecting: ${targetVoice}`);
        clickElement(match);
        await delay(350);
      } else throw new Error(`Voice ${targetVoice} not found in catalog`);

      const closeBtn = document.querySelector('button[aria-label="Close panel" i]');
      if (closeBtn) {
        clickElement(closeBtn);
      } else {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      }
      await delay(300);
    } else throw new Error('Voice catalog search unavailable');
    const selected = [...document.querySelectorAll('button, .voice-chip-label')].filter(isVisible).some(c => new RegExp(`speaker\\s*${speakerNum}\\b`, 'i').test(getText(c)) && getText(c).toLowerCase().includes(targetVoice.toLowerCase()));
    if (!selected) throw new Error(`Voice ${targetVoice} for Speaker ${speakerNum} could not be verified`);
  }

  // Select Speaker 1 or Speaker 2 for a specific block
  async function setBlockSpeaker(blockCard, targetSpeakerNum) {
    const blockSpeakerBtn = [...blockCard.querySelectorAll('button, [role="button"]')].find(b => /speaker\s*\d/i.test(getText(b)));
    if (!blockSpeakerBtn) throw new Error('Speaker control not found in block');

    const currentText = getText(blockSpeakerBtn);
    if (new RegExp(`Speaker\\s*${targetSpeakerNum}`, 'i').test(currentText)) {
      return; // Already correct
    }

    console.log(`[RAVIX Speech Engine] Switching block speaker to Speaker ${targetSpeakerNum}...`);
    clickElement(blockSpeakerBtn);
    await delay(350);

    const menuOptions = [...document.querySelectorAll('[role="menuitem"], mat-option, button, .mat-menu-item, div')].filter(isVisible);
    const targetOption = menuOptions.find(el => new RegExp(`^speaker\\s*${targetSpeakerNum}`, 'i').test(getText(el)));

    if (targetOption) {
      clickElement(targetOption);
      await delay(300);
    } else {
      const addSpeakerOption = menuOptions.find(el => /add\s*speaker/i.test(getText(el)));
      if (addSpeakerOption) {
        clickElement(addSpeakerOption);
        await delay(400);
      } else throw new Error(`Speaker ${targetSpeakerNum} option not found`);
    }
    const updated = [...blockCard.querySelectorAll('button, [role="button"]')].find(b => /speaker\s*\d/i.test(getText(b)));
    if (!updated || !new RegExp(`Speaker\\s*${targetSpeakerNum}\\b`, 'i').test(getText(updated))) throw new Error(`Speaker ${targetSpeakerNum} assignment could not be verified`);
  }

  // Set Style description for a block with 100% reliable popover commit
  async function setBlockStyle(blockCard, styleText, blockIndex = 0, currentTa = null) {
    if (!styleText || !styleText.trim()) return;

    const styleBtn = blockCard.querySelector('button[aria-label*="Style" i]') ||
                     [...blockCard.querySelectorAll('button')].find(b => {
                       const a = b.getAttribute('aria-label') || '';
                       const t = getText(b);
                       return a.toLowerCase().includes('style') || /^style/i.test(t);
                     });

    if (!styleBtn) {
      throw new Error(`Style button not found for block ${blockIndex + 1}`);
    }

    console.log(`[RAVIX Speech Engine] Opening Style popup for block ${blockIndex + 1}...`);
    clickElement(styleBtn);
    await delay(350);

    const styleTa = document.querySelector('.voice-style-dropdown-menu textarea, .daikon-custom-style-container textarea');
    if (styleTa) {
      console.log(`[RAVIX Speech Engine] Setting block ${blockIndex + 1} style: "${styleText.slice(0, 35)}..."`);
      styleTa.focus();
      styleTa.value = styleText;
      styleTa.dispatchEvent(new Event('input', { bubbles: true }));
      styleTa.dispatchEvent(new Event('change', { bubbles: true }));
      await delay(100);
      styleTa.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      styleTa.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      await delay(100);
      styleTa.blur();
      await delay(150);

      // Close popup by clicking backdrop
      const backdrop = document.querySelector('.cdk-overlay-backdrop');
      if (backdrop) {
        clickElement(backdrop);
      } else {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      }
      await delay(250);
      clickElement(styleBtn);
      await delay(250);
      const verifyStyle = document.querySelector('.voice-style-dropdown-menu textarea, .daikon-custom-style-container textarea');
      const actualStyle = verifyStyle && verifyStyle.value;
      const close = document.querySelector('.cdk-overlay-backdrop');
      if (close) clickElement(close); else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      await delay(200);
      if (actualStyle !== styleText) throw new Error(`Style for block ${blockIndex + 1} did not persist`);
    } else {
      const bd = document.querySelector('.cdk-overlay-backdrop');
      if (bd) clickElement(bd);
      await delay(200);
      throw new Error(`Style input not found for block ${blockIndex + 1}`);
    }
  }

  // Setup entire multi-turn screenplay into all blocks
  async function setupScreenplay(payload) {
    const turns = payload.turns;
    if (!Array.isArray(turns) || !turns.length || turns.length > 100) throw new Error('Provide 1–100 ordered dialogue turns');
    const voices = new Map();
    for (const [i, turn] of turns.entries()) {
      if (!turn || typeof turn.speaker !== 'string' || !turn.speaker.trim() || typeof turn.text !== 'string' || !turn.text.trim()) throw new Error(`Turn ${i + 1} requires speaker and text`);
      if (typeof turn.style !== 'string' || !turn.style.trim()) throw new Error(`Turn ${i + 1} requires an explicit style`);
      const name = turn.speaker.trim();
      const voice = typeof turn.voice === 'string' ? turn.voice.trim() : '';
      if (!voices.has(name)) voices.set(name, voice);
      else if (voice && voices.get(name) && voice.toLowerCase() !== voices.get(name).toLowerCase()) throw new Error(`Conflicting voices for ${name}`);
      else if (voice) voices.set(name, voice);
    }
    if (voices.size > 2) throw new Error(`This adapter supports at most two characters per batch; received ${voices.size}. Generate ordered batches or individual turns with consistent voices.`);
    if ([...voices.values()].some(v => !v)) throw new Error('Specify an explicit voice for each character; defaults are not assigned automatically.');
    const uniqueVoices = new Set([...voices.values()].map(v => v.trim().toLocaleLowerCase()));
    if (uniqueVoices.size !== voices.size) throw new Error('Different characters have the same voice. Select distinct voices before setup.');
    await ensureEditor(payload.__metrics);
    const scan = scanPage();
    if (!scan.modelCandidates.some(m => /gemini.*3\.8.*tts/i.test(m))) throw new Error('Verify a supported Gemini 3.8 TTS model before setup.');
    if (scan.canDownload) throw new Error('Existing audio is present. Save and verify it before starting a new dialog.');
    if (getSpeechTextareas().some(ta => String(ta.value || '').trim())) throw new Error('Existing speech text found. Preserve it and open a fresh dialog before setup.');
    await ensureBlockCount(turns.length);
    const characters = [...voices.keys()];
    // The observed speaker chip opens voice settings, not a reliable assignment menu.
    // Validate the editor's assignments before editing any block instead of guessing.
    for (let i = 0; i < turns.length; i++) {
      const ta = getSpeechTextareas()[i];
      const button = ta && [...getBlockCard(ta).querySelectorAll('button, [role="button"]')].find(b => /speaker\s*\d/i.test(getText(b)));
      const expected = characters.indexOf(turns[i].speaker.trim()) + 1;
      if (!button || !new RegExp(`Speaker\\s*${expected}\\b`, 'i').test(getText(button))) throw new Error(`Block ${i + 1} speaker does not match ${turns[i].speaker}. Use separate ordered batches; no text was written.`);
    }
    for (let i = 0; i < turns.length; i++) {
      const ta = getSpeechTextareas()[i];
      if (!ta) throw new Error(`Block ${i + 1} missing`);
      const card = getBlockCard(ta);
      const speakerNum = characters.indexOf(turns[i].speaker.trim()) + 1;
      await setBlockStyle(card, turns[i].style, i, ta);
      setElementValue(ta, turns[i].text);
      await delay(200);
      if (ta.value !== turns[i].text) throw new Error(`Block ${i + 1} text did not persist`);
    }
    for (const [i, name] of characters.entries()) await configureSpeakerVoice(i + 1, voices.get(name));
    for (let i = 0; i < turns.length; i++) {
      const ta = getSpeechTextareas()[i];
      const button = ta && [...getBlockCard(ta).querySelectorAll('button, [role="button"]')].find(b => /speaker\s*\d/i.test(getText(b)));
      const expected = characters.indexOf(turns[i].speaker.trim()) + 1;
      if (!ta || ta.value !== turns[i].text || !button || !new RegExp(`Speaker\\s*${expected}\\b`, 'i').test(getText(button))) throw new Error(`Final verification failed at block ${i + 1}`);
    }
    return {ok:true, turnsCount:turns.length, characters:characters.map((name,i)=>({name, speaker:i+1, voice:voices.get(name)})), message:'Text, speaker labels and selected voices verified; audition delivery and review output.'};
  }

  // 100% Reliable Run Generation Engine
  async function runGeneration(metrics = null) {
    if (scanPage().phase !== 'editor') throw new Error('Speech editor not verified; refusing to run.');
    if (scanPage().canDownload) throw new Error('Existing audio is present; save it and open a fresh dialog before generating.');
    let runBtn = findButton(/^run\b/i) || findButton(/run ctrl/i) || findClickableByText(/^run\b/i);
    if (!runBtn) throw new Error('Run button not found on page');

    if (runBtn.disabled || runBtn.getAttribute('aria-disabled') === 'true') {
      try {
        await waitFor(() => !runBtn.disabled && runBtn.getAttribute('aria-disabled') !== 'true', 'Run button to enable', 8000);
      } catch (e) {
        throw new Error('Run is disabled; check text, model access and account state.');
      }
    }

    console.log('[RAVIX Speech Engine] Triggering Run for all 6 speech blocks...');
    latestAudioData = null;
    if (metrics) metrics.runClickAt = Date.now();
    clickElement(runBtn);

    // Wait up to 10s for generation to actively start
    console.log('[RAVIX Speech Engine] Waiting for TTS generation to start...');
    let started = false;
    const startDeadline = Date.now() + 10000;
    while (Date.now() < startDeadline) {
      await delay(600);
      const stop = findButton(/^stop\b/i) || findClickableByText(/^stop\b/i);
      if (stop) {
        started = true;
        console.log('[RAVIX Speech Engine] TTS generation actively running in Google AI Studio...');
        break;
      }
    }

    if (!started) {
      throw new Error('Generation start not observed; state is unknown. Inspect this job and the page before retrying.');
    }

    // Wait for generation to FINISH (Stop gone, Run enabled, and Download active)
    console.log('[RAVIX Speech Engine] Waiting for TTS generation to complete...');
    await waitFor(() => {
      const stop = findButton(/^stop\b/i) || findClickableByText(/^stop\b/i);
      const run = findButton(/^run\b/i) || findButton(/run ctrl/i);
      const isRunReady = run && !run.disabled && run.getAttribute('aria-disabled') !== 'true';
      const download = findButton(/download/i);
      return !stop && isRunReady && download && !download.disabled && download.getAttribute('aria-disabled') !== 'true';
    }, 'TTS generation to finish and Run button to become ready', 240000, 1500);

    await delay(2000);
    console.log('[RAVIX Speech Engine] TTS Generation completed successfully!');
    return { ok: true, message: 'Generation completed and download control appeared. Verify and listen to the output.' };
  }

  async function getAudioBlobBase64() {
    try {
      const audios = [...document.querySelectorAll('audio')];
      // Pick master audio with highest duration or largest src
      const masterAudio = audios.filter(a => Number.isFinite(a.duration) && a.duration > 1).sort((a,b) => b.duration - a.duration)[0];
      const src = masterAudio && (masterAudio.src || masterAudio.querySelector('source')?.src);
      if (!src) return null;

      if (src.startsWith('data:audio')) {
        const b64 = src.split(',')[1];
        return { base64: b64, size: Math.round(b64.length * 0.75), type: 'audio/wav', duration: masterAudio?.duration };
      }

      const resp = await fetch(src);
      if (!resp.ok) return null;
      const blob = await resp.blob();

      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const res = reader.result;
          if (typeof res === 'string' && res.includes(',')) {
            resolve({ base64: res.split(',')[1], size: blob.size, type: blob.type, duration: masterAudio?.duration });
          } else {
            resolve(null);
          }
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      return null;
    }
  }

  async function triggerDownload() {
    if (scanPage().phase !== 'editor') throw new Error('Speech editor not verified; refusing download.');
    const audioData = await getAudioBlobBase64();
    if (audioData && audioData.base64) {
      latestAudioData = audioData;
    }

    let downloadBtn = findButton(/download/i) ||
                      findClickableByText(/download/i) ||
                      document.querySelector('[aria-label*="Download" i], button[title*="Download" i], [data-tooltip*="Download" i]');

    if (downloadBtn) {
      console.log('[RAVIX Speech Engine] Clicking UI download button...');
      clickElement(downloadBtn);
      await delay(350);

      const menuItems = [...document.querySelectorAll('[role="menuitem"], .mat-menu-item, mat-option, button, a')].filter(isVisible);
      const wavOption = menuItems.find(el => /wav|audio/i.test(getText(el)));
      if (wavOption) {
        clickElement(wavOption);
        await delay(500);
      }
    }

    // Use one download mechanism; avoid duplicate files.
    if (!downloadBtn && audioData && audioData.base64) {
      try {
        const a = document.createElement('a');
        a.href = `data:audio/wav;base64,${audioData.base64}`;
        a.download = `Generated Audio ${new Date().toISOString().replace(/[:.]/g, '-')}.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch (e) { throw new Error('Audio download could not be initiated'); }
    }

    if (!downloadBtn && !(audioData && audioData.base64)) throw new Error('No audio or download control found');
    return { ok: true, message: 'Download requested; browser completion and file identity are not verified.' };
  }

  // Dynamic Message Dispatcher (allows instant content.js updates)
  window.__ravix_onMessage = async (msg) => {
    if (msg.action === 'debug_test_download_click') {
      const dlBtn = document.querySelector('button[aria-label="Download" i]') || findButton(/download/i);
      if (!dlBtn) return { ok: false, error: 'No download button found' };

      // Check audio elements
      const audios = [...document.querySelectorAll('audio')].map(a => ({
        src: a.src,
        duration: a.duration,
        currentTime: a.currentTime
      }));

      // Click download button
      clickElement(dlBtn);
      await delay(400);

      const overlays = [...document.querySelectorAll('.cdk-overlay-pane, [role="menu"], [role="dialog"]')].filter(isVisible).map(el => ({
        tag: el.tagName,
        text: el.innerText.slice(0, 100),
        buttons: [...el.querySelectorAll('button, a, [role="menuitem"]')].map(b => ({
          text: getText(b),
          href: b.getAttribute('href'),
          download: b.getAttribute('download')
        }))
      }));

      return {
        ok: true,
        dlBtnText: getText(dlBtn),
        audios,
        overlays
      };
    }
    if (msg.action === 'debug_set_all_styles_test') {
      const styles = msg.payload?.styles || [
        "Fierce, menacing, aggressive war cry; powerful resonant Hindi delivery.",
        "Resolute authority, righteous anger and fearless divine challenge; crisp Hindi.",
        "Proud, defiant anger, booming roar; immense arrogance and commanding Hindi projection.",
        "Steadfast conviction with restrained righteous anger; measured, powerful Hindi.",
        "Desperate, agonizing, loud cry of defeat and shock; intense emotion.",
        "Dignified, serene, triumphant and godly composure; clear measured divine delivery."
      ];

      const tas = getSpeechTextareas();
      const report = [];

      for (let i = 0; i < Math.min(tas.length, styles.length); i++) {
        const ta = tas[i];
        const card = getBlockCard(ta);
        const styleText = styles[i];

        const styleBtn = card.querySelector('button[aria-label*="Style" i]') ||
                         [...card.querySelectorAll('button')].find(b => {
                           const a = b.getAttribute('aria-label') || '';
                           const t = getText(b);
                           return a.toLowerCase().includes('style') || /^style/i.test(t);
                         });

        if (!styleBtn) {
          report.push({ block: i + 1, ok: false, error: 'Style button not found' });
          continue;
        }

        // Click style button to open popup
        clickElement(styleBtn);
        await delay(350);

        const styleTa = document.querySelector('.voice-style-dropdown-menu textarea, .daikon-custom-style-container textarea');
        if (!styleTa) {
          report.push({ block: i + 1, ok: false, error: 'Style popup textarea not found' });
          // Dismiss
          const bd = document.querySelector('.cdk-overlay-backdrop');
          if (bd) clickElement(bd);
          await delay(200);
          continue;
        }

        styleTa.focus();
        styleTa.value = styleText;
        styleTa.dispatchEvent(new Event('input', { bubbles: true }));
        styleTa.dispatchEvent(new Event('change', { bubbles: true }));
        await delay(100);
        styleTa.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        styleTa.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
        await delay(100);
        styleTa.blur();
        await delay(150);

        // Close popup
        const backdrop = document.querySelector('.cdk-overlay-backdrop');
        if (backdrop) {
          clickElement(backdrop);
        } else {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
        }
        await delay(250);

        report.push({
          block: i + 1,
          ok: true,
          styleSet: styleText.slice(0, 35) + '...',
          newBtnText: getText(styleBtn).slice(0, 40)
        });
      }

      return { ok: true, report };
    }
    if (msg.action === 'debug_check_blocks') {
      const tas = getSpeechTextareas();
      const results = tas.map((ta, idx) => {
        const card = getBlockCard(ta);
        const btns = [...card.querySelectorAll('button')].filter(isVisible);
        const spkBtn = btns.find(b => /speaker/i.test(getText(b)));
        const styleBtn = btns.find(b => b.getAttribute('aria-label')?.toLowerCase().includes('style') || /style/i.test(getText(b)));
        return {
          blockIndex: idx,
          spkText: spkBtn ? getText(spkBtn) : null,
          styleText: styleBtn ? getText(styleBtn) : null,
          styleAria: styleBtn ? styleBtn.getAttribute('aria-label') : null,
          textVal: ta.value.slice(0, 30)
        };
      });
      return { ok: true, count: tas.length, blocks: results };
    }
    if (msg.action === 'debug_test_voice_search') {
      const voiceToFind = msg.payload?.voice || "Algenib";
      const spkNum = msg.payload?.speakerNum || 1;

      // Click the speaker button for this speaker to open voice catalog for it
      const spkBtn = [...document.querySelectorAll('button')].find(b => new RegExp(`speaker\\s*${spkNum}\\b`, 'i').test(getText(b)));
      if (spkBtn) {
        clickElement(spkBtn);
        await delay(500);
      }

      let searchInput = document.querySelector('.voice-search-input input, input[placeholder*="Search" i]');
      if (!searchInput) return { ok: false, error: 'Voice search input not found' };

      searchInput.focus();
      searchInput.value = voiceToFind;
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      searchInput.dispatchEvent(new Event('change', { bubbles: true }));
      await delay(700);

      // Click the candidate if found
      const match = [...document.querySelectorAll('button')].find(b => {
        const a = b.getAttribute('aria-label') || '';
        return a.toLowerCase() === voiceToFind.toLowerCase();
      });

      let clicked = false;
      if (match) {
        clickElement(match);
        clicked = true;
        await delay(300);
      }

      // Close panel
      const closeBtn = document.querySelector('button[aria-label="Close panel" i]');
      if (closeBtn) clickElement(closeBtn);

      return {
        ok: true,
        speakerNum: spkNum,
        searched: voiceToFind,
        clicked
      };
    }
    if (msg.action === 'debug_add_block2_test') {
      const addBtn = findAddSpeechBlockButton();
      if (!addBtn) return { ok: false, error: 'No add block btn' };
      clickElement(addBtn);
      await delay(600);

      const tas = getSpeechTextareas();
      const blocksInfo = tas.map((ta, idx) => {
        const card = getBlockCard(ta);
        const btns = [...card.querySelectorAll('button, [role="button"]')].filter(isVisible).map(b => ({
          text: getText(b),
          aria: b.getAttribute('aria-label')
        }));
        return { index: idx, btns };
      });

      // Also check speaker elements on page
      const spkElements = [...document.querySelectorAll('*')].filter(el => {
        const t = el.innerText || '';
        return (t.includes('Speaker 1') || t.includes('Speaker 2')) && el.children.length === 0;
      }).map(el => ({ tag: el.tagName, text: el.innerText.trim(), class: el.className }));

      return {
        ok: true,
        blockCount: tas.length,
        blocksInfo,
        spkElements
      };
    }
    if (msg.action === 'debug_test_speaker_menu') {
      const textareas = getSpeechTextareas();
      if (!textareas.length) return { ok: false, error: 'No textareas' };
      const ta = textareas[0];
      const card = getBlockCard(ta);
      const spkBtn = card.querySelector('button[aria-label*="Speaker" i]') || [...card.querySelectorAll('button')].find(b => /speaker/i.test(getText(b)));
      if (!spkBtn) return { ok: false, error: 'No speaker button found on block' };

      clickElement(spkBtn);
      await delay(400);

      const menuItems = [...document.querySelectorAll('.cdk-overlay-pane [role="menuitem"], .cdk-overlay-pane button, .cdk-overlay-pane mat-option, .mat-mdc-menu-content *')].filter(isVisible).map(el => ({
        tag: el.tagName,
        text: getText(el),
        aria: el.getAttribute('aria-label'),
        class: el.className
      }));

      // Close menu
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      const backdrop = document.querySelector('.cdk-overlay-backdrop');
      if (backdrop) clickElement(backdrop);

      // Also look for any speaker settings on right panel
      const rightPanelItems = [...document.querySelectorAll('mat-sidenav, aside, .settings-panel, .speaker-settings, [class*="speaker"], [class*="voice"]')].filter(isVisible).map(el => ({
        tag: el.tagName,
        class: el.className,
        text: el.innerText.slice(0, 100)
      })).slice(0, 10);

      return {
        ok: true,
        spkBtnText: getText(spkBtn),
        menuItems,
        rightPanelItems
      };
    }
    if (msg.action === 'debug_set_style_test') {
      const textareas = getSpeechTextareas();
      if (!textareas.length) return { ok: false, error: 'No textareas' };
      const ta = textareas[0];
      const card = getBlockCard(ta);
      const styleBtn = card.querySelector('button[aria-label*="Style" i]') || [...card.querySelectorAll('button')].find(b => /style/i.test(getText(b)));
      if (!styleBtn) return { ok: false, error: 'No style button' };

      clickElement(styleBtn);
      await delay(400);

      const styleTa = document.querySelector('.voice-style-dropdown-menu textarea, .daikon-custom-style-container textarea');
      if (!styleTa) return { ok: false, error: 'Style textarea not found' };

      const testText = "Booming demonic roar";
      styleTa.focus();
      styleTa.value = testText;
      styleTa.dispatchEvent(new Event('input', { bubbles: true }));
      styleTa.dispatchEvent(new Event('change', { bubbles: true }));
      await delay(100);
      styleTa.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      styleTa.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      await delay(100);
      styleTa.blur();
      await delay(200);

      // Close menu by clicking backdrop or body or escape
      const backdrop = document.querySelector('.cdk-overlay-backdrop');
      if (backdrop) {
        clickElement(backdrop);
      } else {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      }
      await delay(400);

      // Check what styleBtn says now
      const newBtnText = getText(styleBtn);
      const newBtnAria = styleBtn.getAttribute('aria-label');

      // Reopen to see if value persisted
      clickElement(styleBtn);
      await delay(400);
      const reopenedTa = document.querySelector('.voice-style-dropdown-menu textarea, .daikon-custom-style-container textarea');
      const persistedVal = reopenedTa ? reopenedTa.value : null;

      // Close again
      const bd2 = document.querySelector('.cdk-overlay-backdrop');
      if (bd2) clickElement(bd2);

      return {
        ok: true,
        newBtnText,
        newBtnAria,
        persistedVal
      };
    }
    if (msg.action === 'debug_test_style') {
      const textareas = getSpeechTextareas();
      if (!textareas.length) return { ok: false, error: 'No textareas' };
      const ta = textareas[0];
      const card = getBlockCard(ta);
      const styleBtn = card.querySelector('button[aria-label*="Style" i]') || [...card.querySelectorAll('button')].find(b => /style/i.test(getText(b)));
      if (!styleBtn) return { ok: false, error: 'No style button found' };
      clickElement(styleBtn);
      await delay(400);
      const overlays = [...document.querySelectorAll('.cdk-overlay-pane, [role="dialog"], [role="menu"]')].map(el => ({
        html: el.innerHTML.slice(0, 300),
        inputs: [...el.querySelectorAll('input, textarea')].map(i => ({ tag: i.tagName, ph: i.placeholder, val: i.value })),
        buttons: [...el.querySelectorAll('button')].map(b => getText(b))
      }));
      // Close it
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      const backdrop = document.querySelector('.cdk-overlay-backdrop');
      if (backdrop) clickElement(backdrop);
      return { ok: true, overlays };
    }
    if (msg.action === 'inspect_page') {
      const result = {
        url: window.location.href,
        textareas: [...document.querySelectorAll('textarea')].map(t => ({
          placeholder: t.placeholder,
          value: t.value.slice(0, 50),
          visible: isVisible(t)
        })),
        buttons: [...document.querySelectorAll('button, [role="button"]')].filter(isVisible).map(b => ({
          text: getText(b),
          aria: b.getAttribute('aria-label')
        })),
        speakerElements: [...document.querySelectorAll('*')].filter(el => {
          const t = el.innerText || '';
          return (t.includes('Speaker') || t.includes('Algenib') || t.includes('Achird') || t.includes('Fola') || t.includes('Rami')) && el.children.length === 0;
        }).slice(0, 30).map(el => ({ tag: el.tagName, text: el.innerText.trim(), class: el.className }))
      };
      return { ok: true, data: result };
    }
    if (msg.action === 'refresh_page') {
      window.location.reload();
      return { ok: true, message: 'Reload initiated' };
    }
    if (msg.type === 'scan' || msg.type === 'speech:scan' || msg.action === 'scan') {
      return scanPage();
    }
    if (msg.action === 'recovery_check') {
      const state = scanPage();
      const editors = getSpeechTextareas();
      const nonempty = editors.filter(el => String(el.value || '').trim()).length;
      const visibleAudio = [...document.querySelectorAll('audio')].some(el => Boolean(el.currentSrc || el.src));
      // Even an empty editor may contain a user's selected voices or styles.
      const safe = state.phase === 'landing' && !state.isGenerating && !state.canDownload && !visibleAudio && nonempty === 0;
      return {ok:true, safeToRefresh:safe, phase:state.phase, blocks:editors.length, nonemptyBlocks:nonempty,
        hasAudio:Boolean(state.canDownload || visibleAudio), isGenerating:state.isGenerating,
        reason:safe ? 'Empty verified speech page.' : 'Refresh blocked: page state is uncertain or contains text, audio, or an active generation.'};
    }
    if (msg.action === 'continue_welcome') {
      const dialogs = [...document.querySelectorAll('[role="dialog"], mat-dialog-container, .mat-mdc-dialog-container')].filter(isVisible)
        .filter(d => /welcome to ai studio/i.test(d.innerText || '') && /terms of service/i.test(d.innerText || ''));
      if (dialogs.length !== 1) throw new Error('Welcome/terms dialog was not uniquely identified; inspect the active tab.');
      const buttons = getButtons(dialogs[0]).filter(b => /^continue$/i.test((b.innerText || '').trim()) || /^continue$/i.test((b.getAttribute('aria-label') || '').trim()));
      if (buttons.length !== 1) throw new Error('Continue button was not uniquely identified.');
      buttons[0].click(); await delay(1200);
      if (isVisible(dialogs[0])) throw new Error('Continue was clicked but dialog dismissal was not verified.');
      return {ok:true,message:'Welcome dialog dismissed; scan the page before continuing.'};
    }
    if (msg.action === 'ensure_editor') {
      await ensureEditor();
      return scanPage();
    }
    if (msg.action === 'setup_screenplay') {
      return await setupScreenplay(msg.payload || {});
    }
    if (msg.action === 'setup_and_run') {
      const metrics = {startedAt:Date.now()};
      const setup = await setupScreenplay({...msg.payload, __metrics:metrics});
      metrics.setupVerifiedAt = Date.now();
      // User preference: give the verified editor one second before Run.
      await delay(1000);
      const run = await runGeneration(metrics);
      return {ok:true, setup, run, timing:{jobToCreateClickMs:metrics.createClickAt == null ? null : metrics.createClickAt-metrics.startedAt, setupToRunClickMs:metrics.runClickAt-metrics.setupVerifiedAt, setupMs:metrics.setupVerifiedAt-metrics.startedAt}, message:'Setup verified and Run clicked once. Download and verify the audio separately.'};
    }
    if (msg.action === 'configure_voice') {
      if (scanPage().phase !== 'editor') throw new Error('Speech editor not verified');
      const {speakerNum, voice} = msg.payload || {};
      if (![1,2].includes(speakerNum) || typeof voice !== 'string' || !voice.trim()) throw new Error('Expected speakerNum 1 or 2 and a voice name');
      await configureSpeakerVoice(speakerNum, voice.trim());
      return {ok:true, speakerNum, voice:voice.trim(), message:'Voice selection verified in the editor'};
    }
    if (msg.action === 'run') {
      return await runGeneration();
    }
    if (msg.action === 'get_audio') {
      const audioData = latestAudioData || await getAudioBlobBase64();
      return { ok: Boolean(audioData), audio: audioData };
    }
    if (msg.action === 'download') {
      return await triggerDownload();
    }
    if (msg.action === 'generate_screenplay') {
      throw new Error('All-in-one generation is disabled because downloaded file association cannot be verified. Use setup_screenplay, inspect blocks, run, and verify the download separately.');
    }
    return { ok: false, error: 'Unknown message action' };
  };

  // Register listener once
  if (!window.__ravix_listener_registered) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (window.__ravix_onMessage) {
        window.__ravix_onMessage(msg).then(sendResponse, err => sendResponse({ ok: false, error: String(err.message || err) }));
        return true;
      }
    });
    window.__ravix_listener_registered = true;
  }
})();
