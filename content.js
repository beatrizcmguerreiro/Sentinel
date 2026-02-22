console.log("Trigger monitoring system running.");

/* -----------------------------
   CONFIG
----------------------------- */
const TRIGGERS = {
  words: ["suicide", "self-harm"],
  phrases: ["kill myself", "end my life"]
};

const HIGHLIGHT_STYLE =
  `color:#ff3b30; font-weight:700; background:rgba(255,59,48,0.18);` +
  `padding:0 3px; border-radius:5px; box-decoration-break:clone; -webkit-box-decoration-break:clone;`;

/* -----------------------------
   UTIL
----------------------------- */
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeJSONParse(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

/* -----------------------------
   POPUP SYSTEM (Original UI)
----------------------------- */
let popupTimer = null;

function showPopup(sessionTotalHits, lastMatchedWords) {
  let severity = "low";
  let color = "#e53935";
  let title = "Trigger detected";

  if (sessionTotalHits >= 5) {
    severity = "severe";
    color = "#7f0000";
    title = "Severe trigger accumulation";
  } else if (sessionTotalHits >= 3) {
    severity = "high";
    color = "#c62828";
    title = "High trigger accumulation";
  }

  const detailText = sessionTotalHits >= 3
    ? "Triggers detected in session"
    : "Trigger detected in session";

  const wordList = lastMatchedWords.join(", ");
  const nowTime = new Date().toLocaleTimeString();

  // If popup exists, just update it (don't block)
  const existing = document.getElementById("trigger-popup");
  if (existing) {
    existing.querySelector("#tp-title").textContent = `⚠ ${title}`;
    existing.querySelector("#tp-severity").textContent = severity.toUpperCase();
    existing.querySelector("#tp-count").textContent = sessionTotalHits;
    existing.querySelector("#tp-detailText").textContent = detailText;
    existing.querySelector("#tp-words").textContent = wordList;
    existing.querySelector("#tp-time").textContent = nowTime;

    // update background color (severity)
    existing.querySelector(".trigger-box").style.background = color;

    // restart countdown bar + timer
    const bar = existing.querySelector(".trigger-progress");
    const newBar = bar.cloneNode(true);
    bar.parentNode.replaceChild(newBar, bar);

    if (popupTimer) clearTimeout(popupTimer);
    popupTimer = setTimeout(() => existing.remove(), 8000);

    return;
  }

  const popup = document.createElement("div");
  popup.id = "trigger-popup";

  popup.innerHTML = `
    <div class="trigger-box" style="background:${color};">
      <div class="trigger-header">
        <div id="tp-title">⚠ ${title}</div>
        <div class="trigger-close">×</div>
      </div>

      <div class="trigger-body">
        Severity: <strong id="tp-severity">${severity.toUpperCase()}</strong><br>
        Session triggers: <strong id="tp-count">${sessionTotalHits}</strong>
      </div>

      <div class="trigger-expand">View details ▾</div>

      <div class="trigger-details">
        <div class="trigger-snippet">
          <span id="tp-detailText">${detailText}</span>: <strong id="tp-words">${wordList}</strong>
        </div>
        <div style="margin-top:6px;font-size:12px;" id="tp-time">${nowTime}</div>
      </div>

      <div class="trigger-progress"></div>
    </div>
  `;

  // keep your same CSS injection (unchanged)
  const style = document.createElement("style");
  style.innerHTML = `
    .trigger-box {
      position: fixed;
      top: 80px;
      left: 24px;
      width: 360px;
      padding: 16px 20px 20px 20px;
      border-radius: 18px;
      font-family: system-ui, -apple-system, sans-serif;
      color: white;
      box-shadow: 0 12px 28px rgba(0,0,0,0.18);
      z-index: 999999;
      animation: slideIn 0.25s ease forwards;
      overflow: hidden;
    }
    .trigger-header { display:flex; justify-content:space-between; align-items:center; font-weight:600; margin-top:-2px; }
    .trigger-close { cursor:pointer; font-size:20px; font-weight:600; padding:4px 8px; border-radius:6px; transition:background 0.2s ease; }
    .trigger-close:hover { background: rgba(255,255,255,0.2); }
    .trigger-body { margin-top:12px; font-size:14px; }
    .trigger-expand { margin-top:12px; font-size:13px; cursor:pointer; opacity:0.9; }
    .trigger-details { max-height:0; overflow:hidden; transition:max-height 0.3s ease; margin-top:10px; font-size:13px; }
    .trigger-details.open { max-height:200px; }
    .trigger-snippet { background: rgba(255,255,255,0.15); padding:6px; border-radius:8px; word-break:break-word; }
    .trigger-progress {
      position:absolute; bottom:0; left:0; height:4px; width:100%;
      background: rgba(255,255,255,0.4);
      animation: countdown 8s linear forwards;
    }
    @keyframes slideIn { from { opacity:0; transform:translateX(-12px);} to { opacity:1; transform:translateX(0);} }
    @keyframes countdown { from { width:100%; } to { width:0%; } }
  `;

  document.head.appendChild(style);
  document.body.appendChild(popup);

  popup.querySelector(".trigger-close").onclick = () => {
    popup.remove();
    if (popupTimer) clearTimeout(popupTimer);
    popupTimer = null;
  };
  popup.querySelector(".trigger-expand").onclick = () =>
    popup.querySelector(".trigger-details").classList.toggle("open");

  popupTimer = setTimeout(() => popup.remove(), 8000);
}

/* -----------------------------
   DETECTION
----------------------------- */
function detectTriggers(text) {
  const lower = text.toLowerCase();
  let hits = 0;
  let matchedWords = [];

  TRIGGERS.phrases.forEach(p => {
    const phrase = p.toLowerCase();
    if (lower.includes(phrase)) {
      // conta ocorrências da frase (não só 1)
      const re = new RegExp(escapeRegex(phrase), "g");
      const m = lower.match(re);
      if (m) hits += m.length;
      matchedWords.push(p);
    }
  });

  TRIGGERS.words.forEach(w => {
    const regex = new RegExp(`\\b${escapeRegex(w)}\\b`, "gi");
    const matches = text.match(regex);
    if (matches) {
      hits += matches.length;          // ✅ ocorrências reais
      matchedWords.push(w);
    }
  });

  return { hits, matchedWords: [...new Set(matchedWords)] };
}

/* -----------------------------
   STORAGE
   - dailyCounts -> chrome.storage.local (for trends)
   - sessionTriggers -> window.sessionStorage (per-tab, resets when tab closes)
----------------------------- */
function updateStorage(hits, words) {
  if (hits === 0) return;

  const today = new Date().toISOString().split("T")[0];
  const now = Date.now();
  const SESSION_TIMEOUT = 30 * 60 * 1000;

  // per-tab session store
  const last = Number(sessionStorage.getItem("tms_lastTriggerTime") || "0");
  let sessionTriggers = safeJSONParse(sessionStorage.getItem("tms_sessionTriggers") || "{}", {});
  let sessionTotalHits = Number(sessionStorage.getItem("tms_sessionTotalHits") || "0");

  if (now - last > SESSION_TIMEOUT) {
    sessionTriggers = {};
    sessionTotalHits = 0;
  }

  // ✅ add real hits, not 1-per-word
  sessionTotalHits += hits;

  // keep a word list breakdown (optional, still useful)
  words.forEach(word => {
    sessionTriggers[word] = (sessionTriggers[word] || 0) + 1;
  });

  sessionStorage.setItem("tms_sessionTriggers", JSON.stringify(sessionTriggers));
  sessionStorage.setItem("tms_sessionTotalHits", String(sessionTotalHits));
  sessionStorage.setItem("tms_lastTriggerTime", String(now));

  // show popup with correct total
  showPopup(sessionTotalHits, words);

  // persistent daily trends
  chrome.storage.local.get(["dailyCounts"], res => {
    const daily = res.dailyCounts || {};
    daily[today] = (daily[today] || 0) + hits;
    chrome.storage.local.set({ dailyCounts: daily });
  });
  chrome.storage.local.get(["dailyWordCounts"], res => {
  const dailyWordCounts = res.dailyWordCounts || {};
  
  if (!dailyWordCounts[today]) {
    dailyWordCounts[today] = {};
  }

  words.forEach(word => {
    dailyWordCounts[today][word] =
      (dailyWordCounts[today][word] || 0) + 1;
  });

  chrome.storage.local.set({ dailyWordCounts });
});
chrome.storage.local.set({
  activeSession: {
    totalHits: sessionTotalHits,
    words: sessionTriggers
  }
});
}

/* -----------------------------
   HIGHLIGHTING
----------------------------- */
function highlight(element) {
  if (element.dataset.highlighted) return;

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  const allPatterns = [
    ...TRIGGERS.phrases.map(p => escapeRegex(p)),
    ...TRIGGERS.words.map(w => `\\b${escapeRegex(w)}\\b`)
  ];
  const combinedRegex = new RegExp(`(${allPatterns.join("|")})`, "gi");

  textNodes.forEach(node => {
    if (node.parentElement?.closest("code, pre")) return;

    const originalText = node.nodeValue;
    combinedRegex.lastIndex = 0;

    if (combinedRegex.test(originalText)) {
      const span = document.createElement("span");
      span.innerHTML = originalText.replace(
        combinedRegex,
        match => `<span style="${HIGHLIGHT_STYLE}">${match}</span>`
      );
      node.parentNode.replaceChild(span, node);
    }
  });

  element.dataset.highlighted = "true";
}

/* -----------------------------
   SCAN & OBSERVE
----------------------------- */
function processMessage(msg) {
  if (msg.dataset.scanned) return;

  const result = detectTriggers(msg.innerText);

  if (result.hits > 0) {
    highlight(msg);
    updateStorage(result.hits, result.matchedWords);
  }

  msg.dataset.scanned = "true";
}

function scan() {
  const userMessages = document.querySelectorAll('[data-message-author-role="user"]');
  userMessages.forEach(processMessage);
}

let debounceTimer;
const observer = new MutationObserver(() => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(scan, 300);
});

observer.observe(document.body, { childList: true, subtree: true });
scan();

window.addEventListener("beforeunload", () => {
  chrome.storage.local.remove("activeSession");
});