const ids = ['mode','character','intent','voice','style','script','expression'];
const $ = id => document.getElementById(id);
let lastEye = '';
const BRIDGE_URL = 'http://127.0.0.1:17842';

function draft(){return Object.fromEntries(ids.map(id=>[id,$(id).value]));}
async function persist(){await chrome.storage.local.set({speechDraft:draft()});}

async function findTab(){
  const tabs = await chrome.tabs.query({url:'https://aistudio.google.com/generate-speech*'});
  if(!tabs.length) throw new Error('AI Studio का Generate speech tab नहीं मिला।');
  if(tabs.length > 1) { 
    const active = tabs.filter(t=>t.active); 
    if(active.length === 1) return active[0]; 
    return tabs[0]; 
  }
  return tabs[0];
}

async function send(type, extra={}){
  const tab = await findTab(); 
  try {
    return await chrome.tabs.sendMessage(tab.id, {type, ...extra});
  } catch(e) {
    throw new Error('पेज से कनेक्शन नहीं बना। AI Studio tab को refresh करें।');
  }
}

function status(text, error=false){
  const el = $('status');
  if (!el) return;
  el.textContent = text; 
  el.style.background = error ? '#552e35' : '#1b3550';
}

function brief(){
  let d = draft();
  return `RAVIX Speech — agent brief\nWorkflow: ${d.mode}\nCharacter: ${d.character}\nScene / intent: ${d.intent}\nVoice / gender: ${d.voice}\nStyle: ${d.style}\nExpression decision: ${d.expression || 'कोई नहीं / तय नहीं'}\n\nScript:\n${d.script}\n\nनिर्देश: दृश्य के अनुसार style रखें; बिना कारण expressions न जोड़ें।`;
}

async function copy(text){
  await navigator.clipboard.writeText(text);
  status('कॉपी हो गया।');
}

// Auto handshake with bridge on panel load
async function autoHandshake() {
  try {
    const res = await fetch(`${BRIDGE_URL}/handshake`);
    if (res.ok) {
      const data = await res.json();
      if (data.token) {
        await chrome.storage.local.set({ bridgeToken: data.token });
        if ($('bridgeToken')) $('bridgeToken').value = data.token;
        status(`Bridge ऑनलाइन है (v${data.version})। AI Studio से कनेक्टेड।`);
      }
    }
  } catch (e) {
    // bridge offline
  }
}
autoHandshake();

$('scan')?.addEventListener('click', async()=>{
  try {
    const r = await send('speech:scan');
    if (!r.ok) throw Error(r.error);
    lastEye = JSON.stringify(r, null, 2);
    $('eye').textContent = lastEye;
    status(`Page Eye: Phase=${r.phase}, Blocks=${r.blockCount}, Ready=${r.canRun}`);
  } catch(e) {
    status(e.message, true);
  }
});

$('open')?.addEventListener('click', () => chrome.tabs.create({url:'https://aistudio.google.com/generate-speech'}));
$('copyEye')?.addEventListener('click', () => copy(lastEye || 'अभी कोई page snapshot नहीं है।').catch(e=>status(e.message,true)));
$('copyBrief')?.addEventListener('click', () => copy(brief()).catch(e=>status(e.message,true)));
$('save')?.addEventListener('click', () => persist().then(()=>status('Draft सेव हो गया।')).catch(e=>status(e.message,true)));

chrome.storage.local.get('speechDraft').then(({speechDraft})=>{
  if(speechDraft) for(const id of ids) if(typeof speechDraft[id]==='string' && $(id)) $(id).value=speechDraft[id];
});

function makeDialoguePlan() {
  const cast = JSON.parse($('castJson').value);
  const turns = JSON.parse($('turnJson').value);
  if(!Array.isArray(cast)||!Array.isArray(turns)||!cast.length||!turns.length) throw Error('पात्र और turns की valid JSON lists दें।');
  return { model: 'gemini-3.8-flash-tts', createdAt: new Date().toISOString(), turns };
}

$('planDialogue')?.addEventListener('click', () => {
  try {
    $('dialoguePlan').textContent = JSON.stringify(makeDialoguePlan(), null, 2);
    status('Dialogue plan तैयार है।');
  } catch(e) {
    status(e.message, true);
  }
});

$('saveDialogue')?.addEventListener('click', async() => {
  try {
    makeDialoguePlan();
    await chrome.storage.local.set({dialogueProject:{cast:$('castJson').value,turns:$('turnJson').value}});
    status('Dialogue project सेव हुआ।');
  } catch(e) {
    status(e.message, true);
  }
});

$('copyDialogue')?.addEventListener('click', () => {
  try {
    copy(JSON.stringify(makeDialoguePlan(), null, 2)).catch(e=>status(e.message, true));
  } catch(e) {
    status(e.message, true);
  }
});

chrome.storage.local.get('dialogueProject').then(({dialogueProject}) => {
  if(dialogueProject){
    if ($('castJson')) $('castJson').value = dialogueProject.cast;
    if ($('turnJson')) $('turnJson').value = dialogueProject.turns;
  }
});

$('pairBridge')?.addEventListener('click', async() => {
  const token = $('bridgeToken').value.trim();
  if(!token) { status('Pairing token आवश्यक है।', true); return; }
  await chrome.storage.local.set({bridgeToken: token});
  status('Bridge टोकन सेव हुआ।');
});

$('pollBridge')?.addEventListener('click', async() => {
  try {
    const res = await fetch(`${BRIDGE_URL}/status`);
    const data = await res.json();
    status(data.ok ? `Bridge active: ${data.jobs?.length || 0} jobs processed.` : 'Bridge error', !data.ok);
  } catch (e) {
    status('Bridge connection failed: ' + e.message, true);
  }
});

$('unpairBridge')?.addEventListener('click', async() => {
  await chrome.storage.local.remove('bridgeToken');
  if ($('bridgeToken')) $('bridgeToken').value = '';
  status('Bridge हटाया गया।');
});
