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
  const speechTab = tabs.find(t => t.url && t.url.includes("generate-speech"));
  if (speechTab) return speechTab;
  const active = tabs.find(t => t.active);
  return active || tabs[0];
}

async function ensureAIStudioTab() {
  let tab = await findAIStudioTab();
  if (tab) return tab;

  console.log("[RAVIX Background] No AI Studio tab found. Creating new tab automatically...");
  tab = await chrome.tabs.create({
    url: "https://aistudio.google.com/generate-speech?model=gemini-3.8-flash-tts",
    active: true
  });
  await new Promise(r => setTimeout(r, 6000));
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
  } catch (e) {}
  await new Promise(r => setTimeout(r, 1000));
  return tab;
}

async function pollBridge() {
  if (isProcessingJob) return;

  try {
    // 1. Initial Handshake if token missing
    if (!pairingToken) {
      const hRes = await fetch(`${BRIDGE_URL}/handshake`, { method: "GET" });
      if (hRes.ok) {
        const hData = await hRes.json();
        pairingToken = hData.token || "";
      }
    }

    const tab = await findAIStudioTab();
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
    isProcessingJob = true;

    let result = null;

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
      if (!tab) {
        console.log("[RAVIX Background] Ensuring AI Studio tab is open for job...");
        tab = await ensureAIStudioTab();
      }

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
          console.log("[RAVIX Background] Content script detached/missing. Injecting content.js dynamically...");
          try {
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
            await new Promise(r => setTimeout(r, 600));
            result = await chrome.tabs.sendMessage(tab.id, {
              action: job.action,
              payload: job.payload || {}
            });
          } catch (scriptErr) {
            console.log("[RAVIX Background] Reloading tab as fallback...");
            await chrome.tabs.reload(tab.id);
            await new Promise(r => setTimeout(r, 4000));
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] }).catch(() => {});
            result = await chrome.tabs.sendMessage(tab.id, {
              action: job.action,
              payload: job.payload || {}
            });
          }
        }
      }

      if (!result) {
        result = { ok: false, error: "Empty response from AI Studio tab" };
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
