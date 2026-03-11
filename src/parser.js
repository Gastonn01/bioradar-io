/**
 * BIORADAR.IO — Wearable Data Parser
 * Supports: Whoop, Oura Ring, Apple Health (CSV)
 * Persists last 7 days to localStorage
 */

const STORAGE_KEY = "bioradar_history_v1";

// ─── UTILS ────────────────────────────────────────────────────────────────────
const safeNum = (v, fallback = 0) => {
  const n = parseFloat(String(v).replace(",", "."));
  return isNaN(n) ? fallback : n;
};

// Handles quoted CSV fields
function splitCSVLine(line) {
  const parts = [];
  let inQuote = false;
  let cur = "";
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === "," && !inQuote) { parts.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  parts.push(cur.trim());
  return parts;
}

function findCol(headers, keywords) {
  return headers.findIndex(h =>
    keywords.some(k => h.toLowerCase().includes(k.toLowerCase()))
  );
}

// ─── WHOOP PARSER ─────────────────────────────────────────────────────────────
function parseWhoop(lines, headers) {
  const cHRV    = findCol(headers, ["hrv", "heart rate variability"]);
  const cRec    = findCol(headers, ["recovery percentage", "recovery score", "recovery"]);
  const cSleep  = findCol(headers, ["sleep performance percentage", "sleep performance", "sleep score"]);
  const cStrain = findCol(headers, ["day strain", "strap strain", "strain"]);
  const cRHR    = findCol(headers, ["resting heart rate", "rhr"]);
  const cDate   = findCol(headers, ["date", "cycle start", "start time"]);

  // Must have at least HRV or Recovery to be a Whoop file
  if (cHRV === -1 && cRec === -1) return null;

  const days = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const row = splitCSVLine(lines[i]);
    const hrv = safeNum(row[cHRV], 0);
    const rec = safeNum(row[cRec], 0);
    if (hrv === 0 && rec === 0) continue;
    days.push({
      date:     cDate !== -1 ? (row[cDate] || "") : new Date().toISOString().slice(0, 10),
      hrv:      Math.min(200, Math.max(0, hrv)),
      recovery: Math.min(100, Math.max(0, rec)),
      sleep:    Math.min(100, Math.max(0, safeNum(row[cSleep], 70))),
      strain:   Math.min(21,  Math.max(0, safeNum(row[cStrain], 10))),
      rhr:      Math.min(200, Math.max(20, safeNum(row[cRHR], 55))),
      source:   "WHOOP",
    });
  }
  return days.length ? days : null;
}

// ─── OURA PARSER ──────────────────────────────────────────────────────────────
function parseOura(lines, headers) {
  const cReady = findCol(headers, ["readiness score", "readiness"]);
  const cSleep = findCol(headers, ["sleep score"]);
  const cHRV   = findCol(headers, ["average hrv", "hrv balance", "hrv"]);
  const cRHR   = findCol(headers, ["lowest resting heart rate", "resting heart rate", "rhr"]);
  const cDate  = findCol(headers, ["date", "summary date"]);

  if (cReady === -1 && cSleep === -1) return null;

  const days = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const row = splitCSVLine(lines[i]);
    days.push({
      date:     cDate !== -1 ? row[cDate] : new Date().toISOString().slice(0, 10),
      hrv:      cHRV   !== -1 ? Math.max(0, safeNum(row[cHRV], 60))   : 60,
      recovery: cReady !== -1 ? Math.min(100, safeNum(row[cReady], 70)) : 70,
      sleep:    cSleep !== -1 ? Math.min(100, safeNum(row[cSleep], 70)) : 70,
      strain:   10,
      rhr:      cRHR   !== -1 ? safeNum(row[cRHR], 55) : 55,
      source:   "OURA",
    });
  }
  return days.length ? days : null;
}

// ─── APPLE HEALTH PARSER ──────────────────────────────────────────────────────
function parseApple(lines, headers) {
  const cType  = findCol(headers, ["type", "hkquantitytypeidentifier"]);
  const cValue = findCol(headers, ["value", "quantity"]);
  if (cType === -1) return null;

  const out = {
    date: new Date().toISOString().slice(0, 10),
    hrv: 60, recovery: 70, sleep: 70, strain: 10, rhr: 55,
    source: "APPLE HEALTH",
  };
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const row   = splitCSVLine(lines[i]);
    const type  = (row[cType] || "").toLowerCase();
    const value = safeNum(row[cValue]);
    if (type.includes("heartratevariabilitysdnn")) out.hrv = value;
    if (type.includes("restingheartrate"))         out.rhr = value;
  }
  return [out];
}

// ─── MAIN ENTRY ───────────────────────────────────────────────────────────────
export function parseCSV(rawText) {
  const lines   = rawText.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { error: "File too short or empty." };

  const headers = splitCSVLine(lines[0]).map(h =>
    h.replace(/"/g, "").trim().toLowerCase()
  );

  const whoopDays = parseWhoop(lines, headers);
  if (whoopDays) {
    saveHistory(whoopDays);
    const latest = whoopDays[whoopDays.length - 1];
    return { ...latest, history: whoopDays.slice(-7) };
  }

  const ouraDays = parseOura(lines, headers);
  if (ouraDays) {
    saveHistory(ouraDays);
    const latest = ouraDays[ouraDays.length - 1];
    return { ...latest, history: ouraDays.slice(-7) };
  }

  const appleDays = parseApple(lines, headers);
  if (appleDays) {
    return { ...appleDays[0], history: appleDays };
  }

  return {
    error: "Format not recognized. Supported: Whoop, Oura Ring, Apple Health CSV exports.",
  };
}

// ─── LOCALSTORAGE ─────────────────────────────────────────────────────────────
export function saveHistory(days) {
  try {
    const existing = loadHistory();
    const map = new Map();
    [...existing, ...days].forEach(d => map.set(d.date + "__" + d.source, d));
    const merged = [...map.values()].slice(-7);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch (e) {
    console.warn("localStorage unavailable:", e);
  }
}

export function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function clearHistory() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}
