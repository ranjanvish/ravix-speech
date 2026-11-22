/**
 * RAVIX Speech Assistant - Background Service Worker & Telepathy Engine
 * Connects Local Bridge (127.0.0.1:17842) <-> Browser Tabs <-> Download Engine
 */
"use strict";

const BRIDGE_URL = "http://127.0.0.1:17842";
let isProcessingJob = false;
let pairingToken = "";

// Keep service worker awake with alarms and intervals
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("speech_bridge_heartbeat", { periodInMinutes: 0.25 });
  pollBridge();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("speech_bridge_heartbeat", { periodInMinutes: 0.25 });
  pollBridge();
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm && alarm.name === "speech_bridge_heartbeat") {
    pollBridge();
  }
});

// Fast 1000ms loop while service worker is active
setInterval(() => {
  pollBridge();
}, 1000);

async function findAIStudioTab() {
  const tabs = await chrome.tabs.query({ url: "*://aistudio.google.com/*" });
  if (!tabs || !tabs.length) return null;
  const speechTabs = tabs.filter(t => t.url && new URL(t.url).pathname === '/generate-speech');
  if (speechTabs.length > 1) {
    const activeSpeech = speechTabs.filter(t => t.active);
    if (activeSpeech.length === 1) return activeSpeech[0];
    return null;
  }
  if (speechTabs.length === 1) return speechTabs[0];
  const active = tabs.find(t => t.active);
  return active || tabs[0];
}

async function ensureAIStudioTab() {
  const candidates = await chrome.tabs.query({ url: 'https://aistudio.google.com/generate-speech*' });
  if (candidates.length > 1) {
    const active = candidates.filter(t => t.active);
    if (active.length !== 1) throw new Error('Multiple speech tabs found; activate the intended tab and retry.');
    return active[0];
  }
  if (candidates.length === 1) return candidates[0];

  console.log("[RAVIX Background] No AI Studio tab found. Creating new tab automatically...");
  let tab = await chrome.tabs.create({
    url: "https://aistudio.google.com/generate-speech?model=gemini-3.8-flash-tts",
    active: true
  });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const scan = await chrome.tabs.sendMessage(tab.id, {action:'scan'});
      if (scan?.ok && ['landing','editor','welcome_terms'].includes(scan.phase)) return await chrome.tabs.get(tab.id);
    } catch (_) { /* Content script or page may still be loading. */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('Speech page did not become ready; inspect the tab before retrying.');
}

async function recoverEmptySpeechTab(tab) {
  const before = await chrome.tabs.sendMessage(tab.id, {action:'recovery_check'});
  if (!before?.ok || !before.safeToRefresh) return {ok:false, error:before?.reason || 'Cannot verify a safe refresh state.', check:before || null};
  let navigationComplete;
  const navigated = new Promise(resolve => {
    let timer;
    const listener = (id, change) => {
      if (id === tab.id && change.status === 'complete') {
        clearTimeout(timer); chrome.tabs.onUpdated.removeListener(listener); resolve(true);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    timer = setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); resolve(false); }, 30000);
  });
  try { await chrome.tabs.reload(tab.id); navigationComplete = await navigated; }
  catch (e) { await navigated; throw e; }
  if (!navigationComplete) return {ok:false,error:'Refresh completion was not observed; inspect the page before retrying.'};
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 500));
    const current = await chrome.tabs.get(tab.id);
    if (current.status !== 'complete') continue;
    try {
      const scan = await chrome.tabs.sendMessage(tab.id, {action:'scan'});
      if (scan?.ok && ['landing','editor'].includes(scan.phase) && /\/generate-speech(?:[/?#]|$)/.test(scan.url || '')) {
        return {ok:true, message:'Refreshed the empty speech page once; scan before editing.', scan};
      }
    } catch (_) { /* Page may still be loading. */ }
  }
  return {ok:false, error:'Refresh outcome is uncertain; inspect the page before retrying.'};
}

async function pollBridge() {
  if (isProcessingJob) return;
  isProcessingJob = true;

  try {
    // 1. Initial Handshake if token missing
    if (!pairingToken) {
      const hRes = await fetch(`${BRIDGE_URL}/handshake`, { method: "GET" });
      if (hRes.ok) {
        const hData = await hRes.json();
        pairingToken = hData.token || "";
      }
    }

    let tab = await findAIStudioTab();
    if (tab && tab.id) {
      // Send heartbeat with tab status
      try {
        let tabScan = null;
        try {
          tabScan = await chrome.tabs.sendMessage(tab.id, { action: "scan" });
        } catch (missingCS) {
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] }).catch(() => {});
          await new Promise(r => setTimeout(r, 300));
          tabScan = await chrome.tabs.sendMessage(tab.id, { action: "scan" }).catch(() => null);
        }

        if (tabScan) {
          await fetch(`${BRIDGE_URL}/client/heartbeat`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": pairingToken ? `Bearer ${pairingToken}` : ""
            },
            body: JSON.stringify({
              page: tabScan.phase || "editor",
              url: tab.url,
              blocks: tabScan.blockCount || 0,
              speakers: tabScan.speakers || [],
              canRun: tabScan.canRun || false,
              isGenerating: tabScan.isGenerating || false,
              canDownload: tabScan.canDownload || false
            })
          });
        }
      } catch (e) {
        // Tab may still be loading or navigating
      }
    }

    // 2. Poll for queued jobs
    const nextRes = await fetch(`${BRIDGE_URL}/next`, {
      method: "GET",
      headers: {
        "Authorization": pairingToken ? `Bearer ${pairingToken}` : ""
      }
    });

    if (!nextRes.ok) return;
    const nextData = await nextRes.json();
    if (!nextData || !nextData.job) return;

    const job = nextData.job;
    console.log(`[RAVIX Background] Dispatching job ${job.id} (${job.action})...`);

    let result = null;

    if (job.action === 'open_speech') {
      const existing = await chrome.tabs.query({url:'https://aistudio.google.com/generate-speech*'});
      if (existing.length > 1) result = {ok:false,error:'Multiple speech tabs exist; select the intended one before continuing.'};
      else {
        const speech = existing[0] || await chrome.tabs.create({url:'https://aistudio.google.com/generate-speech?model=gemini-3.8-flash-tts',active:true});
        if (existing[0]) await chrome.tabs.update(speech.id,{active:true});
        result = {ok:true,tabId:speech.id,message:'Speech tab selected; scan after the page finishes loading.'};
      }
      await fetch(`${BRIDGE_URL}/result`, {method:'POST',headers:{'Content-Type':'application/json','Authorization':pairingToken ? `Bearer ${pairingToken}` : ''},body:JSON.stringify({id:job.id,result})});
      return;
    }

    if (job.action === 'recover_page') {
      try {
        if (!tab?.id) throw new Error('No unambiguous AI Studio tab is selected.');
        result = await recoverEmptySpeechTab(tab);
      } catch (e) { result = {ok:false,error:String(e.message || e)}; }
      await fetch(`${BRIDGE_URL}/result`, {method:'POST',headers:{'Content-Type':'application/json','Authorization':pairingToken ? `Bearer ${pairingToken}` : ''},body:JSON.stringify({id:job.id,result})});
      return;
    }

    if (job.action === 'list_tabs') {
      const allTabs = await chrome.tabs.query({});
      const aiTabs = allTabs.filter(t => t.url && t.url.includes('aistudio.google.com')).map(t => ({ id: t.id, title: t.title, url: t.url, active: t.active, windowId: t.windowId }));
      result = { ok: true, tabs: aiTabs, totalTabs: allTabs.length };
      await fetch(`${BRIDGE_URL}/result`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": pairingToken ? `Bearer ${pairingToken}` : "" },
        body: JSON.stringify({ id: job.id, result })
      });
      isProcessingJob = false;
      return;
    }

    if (job.action === 'reload_extension') {
      console.log("[RAVIX Background] Self-reloading extension from disk...");
      await fetch(`${BRIDGE_URL}/result`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": pairingToken ? `Bearer ${pairingToken}` : "" },
        body: JSON.stringify({ id: job.id, result: { ok: true, message: "Reloading" } })
      });
      setTimeout(() => { chrome.runtime.reload(); }, 200);
      isProcessingJob = false;
      return;
    }

    if (job.action === 'reload_tab') {
      console.log("[RAVIX Background] Reloading AI Studio tab...");
      if (tab && tab.id) {
        await chrome.tabs.reload(tab.id);
        await new Promise(r => setTimeout(r, 3500));
        try {
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
        } catch (e) {}
      }
      result = { ok: true, message: "Tab reloaded and script injected" };
      await fetch(`${BRIDGE_URL}/result`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": pairingToken ? `Bearer ${pairingToken}` : "" },
        body: JSON.stringify({ id: job.id, result })
      });
      isProcessingJob = false;
      return;
    }

    if (job.action === 'inject_content_script') {
      console.log("[RAVIX Background] Injecting latest content.js into tab...");
      if (tab && tab.id) {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
        result = { ok: true, message: "content.js injected" };
      } else {
        result = { ok: false, error: "No active tab" };
      }
      await fetch(`${BRIDGE_URL}/result`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": pairingToken ? `Bearer ${pairingToken}` : "" },
        body: JSON.stringify({ id: job.id, result })
      });
      isProcessingJob = false;
      return;
    }

    try {
      const speechActions = new Set(['setup_screenplay','setup_and_run','run','get_audio','download','generate_screenplay','configure_voice','continue_welcome']);
      if (speechActions.has(job.action) && (!tab?.url || new URL(tab.url).pathname !== '/generate-speech')) {
        tab = await ensureAIStudioTab();
      } else if (!tab) {
        console.log("[RAVIX Background] Ensuring AI Studio tab is open for job...");
        tab = await ensureAIStudioTab();
      }

      const downloadStartedAt = new Date().toISOString();
      if (job.action === 'eval_js') {
        const [execRes] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (codeStr) => {
            try { return (0, eval)(codeStr); } catch (e) { return { error: String(e) }; }
          },
          args: [job.payload.code]
        });
        result = { ok: true, data: execRes ? execRes.result : null };
      } else {
        // Forward action directly to tab content script with dynamic auto-recovery
        try {
          result = await chrome.tabs.sendMessage(tab.id, {
            action: job.action,
            payload: job.payload || {}
          });
        } catch (missingContentScript) {
          throw new Error('Page connection failed after dispatch; operation state is unknown. Inspect the page and job before retrying.');
        }
      }

      if (!result) {
        result = { ok: false, error: "Empty response from AI Studio tab" };
      }
      if (job.action === 'setup_screenplay' && !result.ok && /Speech editor not verified|Voice catalog search unavailable/i.test(result.error || '')) {
        const recovery = await recoverEmptySpeechTab(tab);
        if (recovery.ok) {
          result = await chrome.tabs.sendMessage(tab.id, {action:'setup_screenplay', payload:job.payload || {}});
          result.recovery = {refreshedOnce:true, message:'The verified empty speech page was refreshed once and setup was retried.'};
        } else {
          result.recovery = {refreshedOnce:false, message:recovery.error, check:recovery.check || null};
        }
      }
      if (job.action === 'download' && result.ok) {
        const deadline = Date.now() + 60000;
        let matches = [];
        while (Date.now() < deadline) {
          matches = (await chrome.downloads.search({ startedAfter: downloadStartedAt, orderBy: ['-startTime'], limit: 20 }))
            .filter(d => /\.wav$/i.test(d.filename || '') && d.state !== 'interrupted');
          if (matches.length > 1) throw new Error('Multiple WAV downloads appeared; association is ambiguous. Inspect downloads manually.');
          if (matches.length === 1 && matches[0].state === 'complete' && matches[0].fileSize > 0) break;
          await new Promise(r => setTimeout(r, 500));
        }
        if (matches.length !== 1 || matches[0].state !== 'complete' || !(matches[0].fileSize > 0)) throw new Error('A completed WAV download was not verified; inspect browser downloads before retrying.');
        result = {ok:true, filename:matches[0].filename, bytes:matches[0].fileSize, download_id:matches[0].id, message:'Browser reports a completed WAV download; verify its audio content.'};
      }
    } catch (err) {
      console.error("[RAVIX Background] Execution error:", err);
      result = { ok: false, error: String(err.message || err) };
    }

    // 3. Post result back to bridge
    await fetch(`${BRIDGE_URL}/result`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": pairingToken ? `Bearer ${pairingToken}` : ""
      },
      body: JSON.stringify({
        id: job.id,
        result: result
      })
    });
    console.log(`[RAVIX Background] Job ${job.id} completed and result sent.`);

  } catch (err) {
    // Local bridge offline or transient error
  } finally {
    isProcessingJob = false;
  }
}

// Track downloads
chrome.downloads.onChanged.addListener(delta => {
  if (delta.state && delta.state.current === "complete") {
    chrome.downloads.search({ id: delta.id }, items => {
      if (items && items.length) {
        const item = items[0];
        if (item.filename && item.filename.endsWith(".wav")) {
          console.log("[RAVIX Background] Completed WAV Download:", item.filename);
        }
      }
    });
  }
});
