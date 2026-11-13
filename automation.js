/**
 * RAVIX Speech Assistant - Core DOM Automation Engine
 * Supports Google AI Studio (Gemini 3.8 Flash TTS / Dual-Speaker Screenplay / Narration)
 */
(() => {
  if (window.__ravixSpeechAutomation) return;
  window.__ravixSpeechAutomation = true;

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

  function findButtonByRegex(regex, root = document) {
    const btns = getButtons(root);
    return btns.find(b => regex.test(getText(b))) || null;
  }

  function findAllButtonsByRegex(regex, root = document) {
    const btns = getButtons(root);
    return btns.filter(b => regex.test(getText(b)));
  }

  async function waitFor(fn, description = 'Condition', timeoutMs = 15000, intervalMs = 200) {
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

  // Find all speech blocks currently in the DOM
  function getSpeechBlocks() {
    // Blocks usually have aria-label="Speech block" or role="region"
    let blocks = [...document.querySelectorAll('[aria-label="Speech block"], [role="region"][aria-label*="Speech block"]')].filter(isVisible);
    if (!blocks.length) {
      // Fallback: locate via speech text editors and find their parent containers
      const editors = getSpeechEditors();
      blocks = editors.map(ed => ed.closest('[role="region"], [aria-label*="Speech"], div[class*="block"]') || ed.parentElement);
      // Deduplicate
      blocks = [...new Set(blocks.filter(Boolean))];
    }
    return blocks;
  }

  function getSpeechEditors() {
    return [...document.querySelectorAll('textarea, input, [contenteditable="true"], [role="textbox"]')].filter(el => {
      if (!isVisible(el)) return false;
      const t = getText(el);
      return /speech block text/i.test(t) || /enter speech text/i.test(t) || /type something/i.test(t);
    });
  }

  // Scan current page and return structured summary
  function scanPage() {
    const btns = getButtons().map(getText).filter(Boolean);
    const editors = getSpeechEditors();
    const blocks = getSpeechBlocks();
    const createBtn = findButtonByRegex(/^Create new dialog$/i);
    const runBtn = findButtonByRegex(/^Run(\s|$)/i);
    const stopBtn = findButtonByRegex(/^Stop(\s|$)/i);
    const downloadBtn = findButtonByRegex(/^Download(\s|$)/i);
    const addBlockBtn = findButtonByRegex(/^Add speech block$/i);

    const models = btns.filter(b => /gemini.*tts/i.test(b));
    const speakers = [...new Set(btns.filter(b => /^speaker\s*\d/i.test(b)))];

    const phase = createBtn && !editors.length ? 'landing' : (editors.length ? 'editor' : 'unknown');

    return {
      ok: true,
      url: window.location.href,
      title: document.title,
      phase,
      blockCount: Math.max(blocks.length, editors.length),
      modelCandidates: models,
      speakers,
      canRun: Boolean(runBtn && !runBtn.disabled && runBtn.getAttribute('aria-disabled') !== 'true'),
      isGenerating: Boolean(stopBtn),
      canDownload: Boolean(downloadBtn && !downloadBtn.disabled),
      hasAddBlock: Boolean(addBlockBtn)
    };
  }

  // Ensure editor is open
  async function ensureEditor() {
    let scan = scanPage();
    if (scan.phase === 'landing') {
      const create = findButtonByRegex(/^Create new dialog$/i);
      if (create) {
        create.click();
        await waitFor(() => getSpeechEditors().length > 0, 'Speech editor to initialize after Create click', 8000);
      }
    }
    await delay(300);
    return scanPage();
  }

  // Ensure exact count of speech blocks exist
  async function ensureBlockCount(targetCount) {
    await ensureEditor();
    let currentCount = getSpeechEditors().length;
    let attempts = 0;

    while (currentCount < targetCount && attempts < 25) {
      attempts++;
      const addBtn = findButtonByRegex(/^Add speech block$/i);
      if (!addBtn) {
        throw new Error('Could not find "Add speech block" button on page');
      }
      addBtn.click();
      await delay(400);
      currentCount = getSpeechEditors().length;
    }

    if (currentCount < targetCount) {
      throw new Error(`Failed to create ${targetCount} blocks. Only ${currentCount} created.`);
    }
    return currentCount;
  }

  // Configure voice for a speaker (e.g. Speaker 1 or Speaker 2)
  async function configureVoice(speakerLabelRegex, targetVoice) {
    if (!targetVoice) return;
    const speakerBtn = findButtonByRegex(speakerLabelRegex);
    if (!speakerBtn) {
      console.warn(`Speaker button matching ${speakerLabelRegex} not found`);
      return;
    }

    // Check if current button already shows target voice
    if (getText(speakerBtn).toLowerCase().includes(targetVoice.toLowerCase())) {
      console.log(`Speaker already set to ${targetVoice}`);
      return;
    }

    speakerBtn.click();
    await delay(400);

    // Wait for Voice search input
    const searchInput = await waitFor(() => {
      const inputs = [...document.querySelectorAll('input, textarea')].filter(isVisible);
      return inputs.find(i => /search voices|search 2,000\+ voices/i.test(getText(i)));
    }, 'Voice search box in Speaker settings', 6000);

    setElementValue(searchInput, targetVoice);
    await delay(500);

    // Find candidate voice in results
    const voiceCandidate = await waitFor(() => {
      const btns = getButtons();
      return btns.find(b => {
        const t = getText(b).toLowerCase();
        return t === targetVoice.toLowerCase() || t.startsWith(targetVoice.toLowerCase() + ' ') || t.includes(targetVoice.toLowerCase());
      });
    }, `Voice row for "${targetVoice}"`, 6000);

    voiceCandidate.click();
    await delay(400);

    // Close panel
    const closeBtn = findButtonByRegex(/close panel|close/i);
    if (closeBtn) {
      closeBtn.click();
      await delay(300);
    } else {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      await delay(300);
    }
  }

  // Set style for a specific block
  async function setBlockStyle(blockScope, styleText) {
    if (!styleText || !styleText.trim()) return;
    const styleBtn = findButtonByRegex(/^style(\s|$)/i, blockScope);
    if (!styleBtn) {
      console.warn('Style button not found in block container');
      return;
    }

    styleBtn.click();
    await delay(350);

    // Wait for style textarea/input
    const styleInput = await waitFor(() => {
      const inputs = [...document.querySelectorAll('textarea, input, [contenteditable="true"]')].filter(isVisible);
      return inputs.find(i => /describe the voice style|voice style/i.test(getText(i) + ' ' + (i.getAttribute('placeholder') || '')));
    }, 'Style input field', 5000);

    setElementValue(styleInput, styleText);
    await delay(200);

    // Commit by blur and Escape / click outside
    styleInput.blur();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    await delay(300);
  }

  // Setup an entire screenplay (array of dialogue turns)
  async function setupScreenplay(payload) {
    const turns = payload.turns || [];
    if (!turns.length) throw new Error('No turns provided in screenplay payload');

    console.log(`[RAVIX Automation] Setting up screenplay with ${turns.length} dialogue turns...`);
    await ensureBlockCount(turns.length);
    await delay(400);

    const editors = getSpeechEditors();
    const blocks = getSpeechBlocks();

    // Map unique characters to speakers and setup voices
    const characterMap = new Map();
    for (const t of turns) {
      if (t.speaker && t.voice && !characterMap.has(t.speaker)) {
        characterMap.set(t.speaker, t.voice);
      }
    }

    // Configure distinct speakers if voice is specified
    const speakersList = [...characterMap.entries()];
    if (speakersList.length >= 1) {
      try {
        await configureVoice(/^Speaker 1/i, speakersList[0][1]);
      } catch (e) {
        console.warn('Speaker 1 configuration notice:', e.message);
      }
    }
    if (speakersList.length >= 2) {
      try {
        await configureVoice(/^Speaker 2/i, speakersList[1][1]);
      } catch (e) {
        console.warn('Speaker 2 configuration notice:', e.message);
      }
    }

    // Populate each dialogue block
    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i];
      const editor = editors[i];
      if (!editor) continue;

      const blockScope = blocks[i] || editor.closest('[aria-label="Speech block"], [role="region"]') || editor.parentElement;

      // Assign speaker toggle if block has speaker button
      if (turn.speaker) {
        const charIndex = speakersList.findIndex(([name]) => name === turn.speaker);
        if (charIndex >= 0) {
          const targetSpeakerNum = charIndex + 1; // 1 or 2
          const blockSpeakerBtn = findButtonByRegex(/^Speaker\s*\d/i, blockScope);
          if (blockSpeakerBtn && !getText(blockSpeakerBtn).includes(`Speaker ${targetSpeakerNum}`)) {
            blockSpeakerBtn.click();
            await delay(300);
            // Select speaker from menu if present
            const menuOption = findButtonByRegex(new RegExp(`Speaker ${targetSpeakerNum}`, 'i'));
            if (menuOption) {
              menuOption.click();
              await delay(200);
            }
          }
        }
      }

      // Set style if provided
      if (turn.style) {
        try {
          await setBlockStyle(blockScope, turn.style);
        } catch (e) {
          console.warn(`Block ${i + 1} style notice:`, e.message);
        }
      }

      // Write dialogue text
      setElementValue(editor, turn.text);
      await delay(200);
    }

    console.log(`[RAVIX Automation] Screenplay successfully populated in AI Studio DOM!`);
    return {
      ok: true,
      turnsCount: turns.length,
      message: `Configured ${turns.length} dialogue blocks with voices and styles.`
    };
  }

  // Trigger Run and wait for generation to complete
  async function runGeneration() {
    const runBtn = findButtonByRegex(/^Run(\s|$)/i);
    if (!runBtn) throw new Error('Run button not found on page');
    if (runBtn.disabled || runBtn.getAttribute('aria-disabled') === 'true') {
      throw new Error('Run button is currently disabled. Ensure text blocks are populated.');
    }

    console.log('[RAVIX Automation] Clicking Run...');
    runBtn.click();

    // 1. Wait for generation to start (Stop button appears)
    await waitFor(() => {
      const stop = findButtonByRegex(/^Stop(\s|$)/i);
      return Boolean(stop);
    }, 'Generation to start (Stop button)', 15000);

    console.log('[RAVIX Automation] Generation active in background...');

    // 2. Wait for generation to finish (Stop button disappears and Download becomes available)
    await waitFor(() => {
      const stop = findButtonByRegex(/^Stop(\s|$)/i);
      const run = findButtonByRegex(/^Run(\s|$)/i);
      const download = findButtonByRegex(/^Download(\s|$)/i);
      return !stop && Boolean(run && !run.disabled) && Boolean(download && !download.disabled);
    }, 'Generation to finish and Download button to become active', 240000, 500);

    console.log('[RAVIX Automation] Generation finished successfully!');
    return {
      ok: true,
      message: 'Audio generation complete. Download is ready.'
    };
  }

  // Trigger Download button
  function triggerDownload() {
    const downloadBtn = findButtonByRegex(/^Download(\s|$)/i);
    if (!downloadBtn) throw new Error('Download button not found');
    if (downloadBtn.disabled) throw new Error('Download button is disabled');

    downloadBtn.click();
    return {
      ok: true,
      message: 'Download button clicked; file will be captured in Downloads.'
    };
  }

  // Expose API on window
  window.__ravixEngine = {
    scanPage,
    ensureEditor,
    ensureBlockCount,
    configureVoice,
    setBlockStyle,
    setupScreenplay,
    runGeneration,
    triggerDownload
  };
})();
