let weekOffset = 0;
let monthOffset = 0;
let currentView = "Weekly";
let currentExportData = null;

const canvas = document.getElementById("chart");
const ctx = canvas.getContext("2d");

canvas.width = 348;
canvas.height = 220;

// apply saved theme on load and set up toggle button
function applyTheme(theme) {
  const html = document.documentElement;

  if (theme === "dark") {
    html.classList.add("dark");
    document.getElementById("themeToggle").textContent = "☀";
  } else {
    html.classList.remove("dark");
    document.getElementById("themeToggle").textContent = "⏾";
  }

  // re-render the current view
  if (currentView === "Weekly") loadWeekly();
  if (currentView === "Monthly") loadMonthly();
  if (currentView === "Session") loadSession();
}

// toggle theme and save preference
document.getElementById("themeToggle").addEventListener("click", () => {
  chrome.storage.local.get(["theme"], res => {
    const current = res.theme === "dark" ? "dark" : "light";
    const next = current === "dark" ? "light" : "dark";
    chrome.storage.local.set({ theme: next }, () => applyTheme(next));
  });
});

// show/hide daily average block based on view
function toggleDailyAverage(show) {
  const avgBlock = document.getElementById("avgCount").closest(".stat-block");
  avgBlock.style.display = show ? "block" : "none";
}

// update active state of nav buttons
function setActiveButton(view) {
  ["weekly", "monthly", "session"].forEach(id => {
    document.getElementById(id).classList.remove("active");
  });
  document.getElementById(view.toLowerCase()).classList.add("active");
}

// helper to format date as the universal format
function formatDMY(date) {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${d}/${m}/${date.getFullYear()}`;
}

// draw line graph for weekly/monthly views, with grid lines and labels
function drawGraph(labels, values) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const padL = 24, padR = 24, padT = 20, padB = 42;
  const w = canvas.width - padL - padR;
  const h = canvas.height - padT - padB;
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? w / (values.length - 1) : 0;

  // draw horizontal grid lines
  ctx.strokeStyle = getComputedStyle(document.documentElement)
    .getPropertyValue("--separator");

  // 4 lines for 0%, 25%, 50%, 75%
  ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const y = padT + (h / 4) * g;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + w, y);
    ctx.stroke();
  }

  // calculate points for the line graph based on values and max, handle single value case by centering it
  const pts = values.map((v, i) => ({
    x: values.length === 1 ? padL + w / 2 : padL + step * i,
    y: padT + h - (v / max) * h
  }));

  // draw the line graph if we have more than 1 point, otherwise just show the single point
  if (pts.length > 1) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.strokeStyle = "#FF3B30";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // draw points on the graph
  pts.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, 2 * Math.PI);
    ctx.fillStyle = "#FF3B30";
    ctx.fill();
  });

  ctx.textAlign = "center";

  // draw labels for each point, showing day and date if available
  pts.forEach((p, i) => {
    const lbl = labels[i];
    if (lbl.day) {
      ctx.fillStyle = "#FF3B30";
      ctx.font = "600 11px -apple-system, sans-serif";
      ctx.fillText(lbl.day, p.x, padT + h + 16);
    }
    if (lbl.date) {
      ctx.fillStyle = "#FF3B30";
      ctx.font = "400 10px -apple-system, sans-serif";
      ctx.fillText(lbl.date, p.x, padT + h + 30);
    }
  });

  // update total and average counts below the graph
  const total = values.reduce((a, b) => a + b, 0);
  document.getElementById("totalCount").textContent = total;
  document.getElementById("avgCount").textContent =
    values.length ? (total / values.length).toFixed(1) : 0;
}

// render a simple word cloud for the session view, showing top 5 triggers with size based on count
function renderWordCloud(wordData) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const allTotal = Object.values(wordData || {}).reduce((a, b) => a + b, 0);
  document.getElementById("totalCount").textContent = allTotal;

  const entries = Object.entries(wordData || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (!entries.length) {
    ctx.font = "14px -apple-system, sans-serif";
    ctx.fillStyle = "#8E8E93";
    ctx.textAlign = "center";
    ctx.fillText("No triggers this session", canvas.width / 2, canvas.height / 2);
    return;
  }

  const max = entries[0][1];
  const centerX = canvas.width / 2;
  let y = 60;

  entries.forEach(([word, count]) => {
    const size = 16 + (count / max) * 30;
    ctx.font = `600 ${size}px -apple-system, sans-serif`;
    ctx.fillStyle = "#FF3B30";
    ctx.textAlign = "center";
    ctx.fillText(word, centerX, y);
    y += size + 16;
  });
}

// calculate the current week's date range based on the offset, 
// return arrays of day labels and dates for graphing
function getCurrentWeek(offset = 0) {
  const now = new Date();
  now.setDate(now.getDate() - offset * 7);

  const day = now.getDay();
  const mondayOffset = (day === 0 ? -6 : 1 - day);

  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const days = [];
  const labels = [];
  const weekNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  // loop through the week and create labels for each day, showing the day name and date
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d.toISOString().split("T")[0]);
    labels.push({ day: weekNames[i], date: String(d.getDate()).padStart(2, "0") });
  }

  // update the period label to show the current week's date range
  const range = `${formatDMY(monday)} – ${formatDMY(sunday)}`;
  document.getElementById("periodLabel").textContent = range;
  document.getElementById("navPeriodLabel").textContent = range;

  return { days, labels };
}

// load weekly data from storage, prepare it for graphing and export, then draw the graph
function loadWeekly() {
  currentView = "Weekly";
  setActiveButton("Weekly");
  toggleDailyAverage(true);
  document.querySelector(".week-nav").style.display = "flex";

  chrome.storage.local.get(["dailyCounts"], res => {
    const data = res.dailyCounts || {};
    const week = getCurrentWeek(weekOffset);
    const values = week.days.map(d => data[d] || 0);

    currentExportData = {
      type: "weekly",
      rows: week.days.map((date, i) => ({ date, count: values[i] }))
    };

    drawGraph(week.labels, values);
  });
}

// calculate the current month's date range based on the offset,
// return arrays of day labels and dates for graphing, with options to show day numbers at certain intervals
function getCurrentMonth(offset = 0) {
  const base = new Date();
  base.setMonth(base.getMonth() - offset, 1);
  base.setHours(0, 0, 0, 0);

  const year = base.getFullYear();
  const month = base.getMonth();

  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);

  const days = [];
  const labels = [];
  const numDays = last.getDate();

  // loop through the month and create labels for each day
  // showing the day number at certain intervals to avoid clutter
  for (let i = 1; i <= numDays; i++) {
    const d = new Date(year, month, i);
    days.push(d.toISOString().split("T")[0]);
    const show = (i === 1 || i === numDays || i % 5 === 0);
    labels.push({ day: show ? String(i) : "", date: "" });
  }

  // update the period label to show the current month and year
  document.getElementById("periodLabel").textContent =
    `${String(month + 1).padStart(2,"0")}/${year}`;
  document.getElementById("navPeriodLabel").textContent =
    `${formatDMY(first)} – ${formatDMY(last)}`;

  return { days, labels };
}

// load monthly data from storage, prepare it for graphing and export, then draw the graph
function loadMonthly() {
  currentView = "Monthly";
  setActiveButton("Monthly");
  toggleDailyAverage(true);
  document.querySelector(".week-nav").style.display = "flex";

  // get daily counts from storage
  // extract the relevant days for the current month
  // and prepare data for graphing and export
  chrome.storage.local.get(["dailyCounts"], res => {
    const data = res.dailyCounts || {};
    const month = getCurrentMonth(monthOffset);
    const values = month.days.map(d => data[d] || 0);

    currentExportData = {
      type: "monthly",
      rows: month.days.map((date, i) => ({ date, count: values[i] }))
    };

    drawGraph(month.labels, values);
  });
}

// load session data from storage, prepare it for the word cloud and export, then render the cloud
function loadSession() {
  currentView = "Session";
  setActiveButton("Session");
  toggleDailyAverage(false);
  document.querySelector(".week-nav").style.display = "none";

  chrome.storage.local.get(["activeSession"], res => {
    const session = res.activeSession || { totalHits: 0, words: {} };

    const todayFormatted = formatDMY(new Date());
    document.getElementById("periodLabel").textContent = todayFormatted;
    document.getElementById("navPeriodLabel").textContent = todayFormatted;

    currentExportData = {
      type: "session",
      rows: Object.entries(session.words).map(([word, count]) => ({ word, count }))
    };

    renderWordCloud(session.words);
  });
}

// export the current view's data as a CSV file, with different formats for session vs weekly/monthly data
function exportCSV() {
  if (!currentExportData || !currentExportData.rows.length) {
    alert("No data to export.");
    return;
  }

  let csv = "";

  // for session data, export word and count, for weekly/monthly export date and count
  if (currentExportData.type === "session") {
    csv += "Word,Count\n";
    currentExportData.rows.forEach(r => {
      csv += `${r.word},${r.count}\n`;
    });
  } else {
    csv += "Date,TriggerCount\n";
    currentExportData.rows.forEach(r => {
      csv += `${r.date},${r.count}\n`;
    });
  }

  // create a blob from the CSV string and trigger a download 
  // with a filename that includes the view type and timestamp
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `trigger_export_${currentExportData.type}_${Date.now()}.csv`;
  a.click();

  URL.revokeObjectURL(url);
}

document.getElementById("pdf").addEventListener("click", exportCSV);

// set up navigation buttons to load the corresponding views 
// and reset offsets when switching between weekly and monthly
document.getElementById("weekly").onclick = () => { weekOffset = 0; loadWeekly(); };
document.getElementById("monthly").onclick = () => { monthOffset = 0; loadMonthly(); };
document.getElementById("session").onclick = () => { loadSession(); };

document.getElementById("prevWeek").onclick = () => {
  if (currentView === "Weekly") { weekOffset++; loadWeekly(); }
  else if (currentView === "Monthly") { monthOffset++; loadMonthly(); }
};

document.getElementById("nextWeek").onclick = () => {
  if (currentView === "Weekly" && weekOffset > 0) { weekOffset--; loadWeekly(); }
  else if (currentView === "Monthly" && monthOffset > 0) { monthOffset--; loadMonthly(); }
};

// on load, apply the saved theme and load the default weekly view
chrome.storage.local.get(["theme"], res => {
  applyTheme(res.theme === "dark" ? "dark" : "light");
});

loadWeekly();