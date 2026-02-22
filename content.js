console.log("Sentinel running!");

// triggers - expandable list, can be moved to separate JSON or storage later
const TRIGGERS = {
  words: ["suicide", "self-harm"],
  phrases: ["kill myself", "end my life"]
};

// highlight style for the triggers
const HIGHLIGHT_TEXT =
  `color:#ff3b30; font-weight:700; background:rgba(255,59,48,0.18);` +
  `padding:0 3px; border-radius:5px; box-decoration-break:clone; -webkit-box-decoration-break:clone;`;

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeJSONParse(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

function tmsHash(str) {
  // tiny stable hash (fast, good enough for de-dup)
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function getMessageKey(msg) {
  // Try to find a stable id from the DOM (best case)
  const carrier =
    msg.closest("[data-message-id]") ||
    msg.closest("[data-testid]") ||
    msg;

  const msgId =
    carrier.getAttribute?.("data-message-id") ||
    carrier.getAttribute?.("data-testid") ||
    msg.getAttribute?.("data-message-id");

  if (msgId) return `id:${msgId}`;

  // Fallback: hash the text (works even if node is recreated)
  const text = (msg.innerText || "").trim();
  return `hash:${tmsHash(text)}`;
}

function wasAlreadyCounted(key) {
  const raw = sessionStorage.getItem("tms_seenMessageKeys") || "[]";
  const arr = safeJSONParse(raw, []);
  return arr.includes(key);
}

function markCounted(key) {
  const raw = sessionStorage.getItem("tms_seenMessageKeys") || "[]";
  const arr = safeJSONParse(raw, []);
  if (!arr.includes(key)) arr.push(key);
  sessionStorage.setItem("tms_seenMessageKeys", JSON.stringify(arr));
}

// single instance with dynamic content update + timer reset
let popupTimer = null;

function ensurePopupStyles() {
  if (document.getElementById("tms-popup-style")) return;

  const style = document.createElement("style");
  style.id = "tms-popup-style";
  style.innerHTML = `
    .tms-popup-box {
      position: fixed;
      top: 80px;
      left: 24px;
      width: 360px;
      max-width: calc(100vw - 48px);
      padding: 16px 20px 20px 20px;
      border-radius: 18px;
      font-family: system-ui, -apple-system, sans-serif;
      color: white;
      box-shadow: 0 12px 28px rgba(0,0,0,0.18);
      z-index: 999999;
      animation: tmsSlideIn 0.25s ease forwards;
      overflow: hidden;
    }
    .tms-popup-header { display:flex; justify-content:space-between; align-items:center; font-weight:600; margin-top:-2px; }
    .tms-popup-close { cursor:pointer; font-size:20px; font-weight:600; padding:4px 8px; border-radius:6px; transition:background 0.2s ease; }
    .tms-popup-close:hover { background: rgba(255,255,255,0.2); }
    .tms-popup-body { margin-top:12px; font-size:14px; }
    .tms-popup-expand { margin-top:12px; font-size:13px; cursor:pointer; opacity:0.9; }
    .tms-popup-details { max-height:0; overflow:hidden; transition:max-height 0.3s ease; margin-top:10px; font-size:13px; }
    .tms-popup-details.open { max-height:200px; }
    .tms-popup-snippet { background: rgba(255,255,255,0.15); padding:6px; border-radius:8px; word-break:break-word; }
    .tms-popup-progress {
      position:absolute; bottom:0; left:0; height:4px; width:100%;
      background: rgba(255,255,255,0.4);
      animation: tmsCountdown 8s linear forwards;
    }
    @keyframes tmsSlideIn { from { opacity:0; transform:translateX(-12px);} to { opacity:1; transform:translateX(0);} }
    @keyframes tmsCountdown { from { width:100%; } to { width:0%; } }
  `;
  document.head.appendChild(style);
}

// function to update the popup with session totals and matched words
function showPopup(sessionTotalHits, lastMatchedWords) {
  ensurePopupStyles();

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

  const existing = document.getElementById("tms-trigger-popup");
  if (existing) {
    existing.querySelector("#tp-title").textContent = `⚠ ${title}`;
    existing.querySelector("#tp-severity").textContent = severity.toUpperCase();
    existing.querySelector("#tp-count").textContent = sessionTotalHits;
    existing.querySelector("#tp-detailText").textContent = detailText;
    existing.querySelector("#tp-words").textContent = wordList;
    existing.querySelector("#tp-time").textContent = nowTime;

    existing.querySelector(".tms-popup-box").style.background = color;

    const bar = existing.querySelector(".tms-popup-progress");
    const newBar = bar.cloneNode(true);
    bar.parentNode.replaceChild(newBar, bar);

    if (popupTimer) clearTimeout(popupTimer);
    popupTimer = setTimeout(() => existing.remove(), 8000);
    return;
  }

  const popup = document.createElement("div");
  popup.id = "tms-trigger-popup";

  popup.innerHTML = `
    <div class="tms-popup-box" style="background:${color};">
      <div class="tms-popup-header">
        <div id="tp-title">⚠ ${title}</div>
        <div class="tms-popup-close">×</div>
      </div>

      <div class="tms-popup-body">
        Severity: <strong id="tp-severity">${severity.toUpperCase()}</strong><br>
        Session triggers: <strong id="tp-count">${sessionTotalHits}</strong>
      </div>

      <div class="tms-popup-expand">View details ▾</div>

      <div class="tms-popup-details">
        <div class="tms-popup-snippet">
          <span id="tp-detailText">${detailText}</span>: <strong id="tp-words">${wordList}</strong>
        </div>
        <div style="margin-top:6px;font-size:12px;" id="tp-time">${nowTime}</div>
      </div>

      <div class="tms-popup-progress"></div>
    </div>
  `;

  document.body.appendChild(popup);

  popup.querySelector(".tms-popup-close").onclick = () => {
    popup.remove();
    if (popupTimer) clearTimeout(popupTimer);
    popupTimer = null;
  };

  popup.querySelector(".tms-popup-expand").onclick = () =>
    popup.querySelector(".tms-popup-details").classList.toggle("open");

  popupTimer = setTimeout(() => popup.remove(), 8000);
}

// detect triggers in text, return total hits, matched terms, and per-term counts
function detectTriggers(text) {
  const lower = text.toLowerCase();
  let hits = 0;

  // term -> occurrences in this message
  const termCounts = {};

  // phrases
  TRIGGERS.phrases.forEach(p => {
    const phrase = p.toLowerCase();
    const re = new RegExp(escapeRegex(phrase), "g");
    const m = lower.match(re);
    const count = m ? m.length : 0;
    if (count > 0) {
      termCounts[p] = (termCounts[p] || 0) + count;
      hits += count;
    }
  });

  // words
  TRIGGERS.words.forEach(w => {
    const re = new RegExp(`\\b${escapeRegex(w)}\\b`, "gi");
    const m = text.match(re);
    const count = m ? m.length : 0;
    if (count > 0) {
      termCounts[w] = (termCounts[w] || 0) + count;
      hits += count;
    }
  });

  const matchedWords = Object.keys(termCounts);
  return { hits, matchedWords, termCounts };
}

/*
  STORAGE
  - dailyCounts -> chrome.storage.local (for trends)
  - sessionTriggers -> window.sessionStorage (resets when tab closes)
*/
function updateStorage(hits, matchedTerms, termCounts) {
  if (hits === 0) return;

  const today = new Date().toISOString().split("T")[0];
  const now = Date.now();
  const SESSION_TIMEOUT = 30 * 60 * 1000;

  const last = Number(sessionStorage.getItem("tms_lastTriggerTime") || "0");
  let sessionTriggers = safeJSONParse(sessionStorage.getItem("tms_sessionTriggers") || "{}", {});
  let sessionTotalHits = Number(sessionStorage.getItem("tms_sessionTotalHits") || "0");

  if (now - last > SESSION_TIMEOUT) {
  sessionTriggers = {};
  sessionTotalHits = 0;

  // reset de-dup for a new session window
  sessionStorage.removeItem("tms_seenMessageKeys");
}

  // total occurrences
  sessionTotalHits += hits;

  // per-term occurrences (NOT +1)
  Object.entries(termCounts).forEach(([term, count]) => {
    sessionTriggers[term] = (sessionTriggers[term] || 0) + count;
  });

  sessionStorage.setItem("tms_sessionTriggers", JSON.stringify(sessionTriggers));
  sessionStorage.setItem("tms_sessionTotalHits", String(sessionTotalHits));
  sessionStorage.setItem("tms_lastTriggerTime", String(now));

  showPopup(sessionTotalHits, matchedTerms);

  // persistent daily trends
  chrome.storage.local.get(["dailyCounts"], res => {
    const daily = res.dailyCounts || {};
    daily[today] = (daily[today] || 0) + hits;
    chrome.storage.local.set({ dailyCounts: daily });
  });

  // persistent daily term counts (occurrences)
  chrome.storage.local.get(["dailyWordCounts"], res => {
    const dailyWordCounts = res.dailyWordCounts || {};
    if (!dailyWordCounts[today]) dailyWordCounts[today] = {};

    Object.entries(termCounts).forEach(([term, count]) => {
      dailyWordCounts[today][term] = (dailyWordCounts[today][term] || 0) + count;
    });

    chrome.storage.local.set({ dailyWordCounts });
  });

  // keep session snapshot for dashboard
  chrome.storage.local.set({
    activeSession: {
      totalHits: sessionTotalHits,
      words: sessionTriggers
    }
  });
}

// highlighting
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
        match => `<span style="${HIGHLIGHT_TEXT}">${match}</span>`
      );
      node.parentNode.replaceChild(span, node);
    }
  });

  element.dataset.highlighted = "true";
}

// main scanning function
function processMessage(msg) {
  const key = getMessageKey(msg);

  // IMPORTANT: de-dup survives React re-renders
  if (wasAlreadyCounted(key)) return;

  const result = detectTriggers(msg.innerText);

  if (result.hits > 0) {
    highlight(msg);
    updateStorage(result.hits, result.matchedWords, result.termCounts);

    // Only mark as counted if we actually counted it
    markCounted(key);
  } else {
    // Still mark so we don't keep re-processing the same message forever
    markCounted(key);
  }
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

// cleanup session snapshot on tab close
window.addEventListener("pagehide", () => {
  chrome.storage.local.remove("activeSession");
});