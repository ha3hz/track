import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";

/* ═══════════════════════════════════════════════════
   SUPABASE CONFIG
   ═══════════════════════════════════════════════════ */
const SB_URL = "https://jthfqynavqpzvkgwznzy.supabase.co";
const SB_KEY = "sb_publishable_uI_kw2bzlXrAG6qf6jgvkA_I8bjZsBL";
const SB_H = {
  apikey: SB_KEY,
  Authorization: "Bearer " + SB_KEY,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};
const TBL_ACT = "perf_activities";
const TBL_POMO = "perf_pomodoro";

async function sbFetch(table, method, body, query) {
  try {
    const url = SB_URL + "/rest/v1/" + table + (query ? "?" + query : "");
    const opts = { method: method || "GET", headers: { ...SB_H } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (!res.ok) return null;
    try { return await res.json(); } catch (e) { return true; }
  } catch (e) { return null; }
}

/* ═══ ACTIVITY MAPPERS ═══ */
function toSnake(o) {
  return {
    id: o.id, name: o.name || "", description: o.description || "",
    category: o.category || "work", start_time: o.startTime || "",
    end_time: o.endTime || "", expected_duration: o.expectedDuration || "",
    date: o.date || "", status: o.status || "done",
    planned: o.planned !== false, important: !!o.important,
    urgent: !!o.urgent, useful: o.useful !== false,
    high_energy: !!o.highEnergy, deep_focus: !!o.deepFocus,
    real_progress: !!o.realProgress, delegatable: !!o.delegatable,
    shortenable: !!o.shortenable, distracting: !!o.distracting,
    good_habit: !!o.goodHabit, waste_source: !!o.wasteSource,
    importance: o.importance || "متوسطة", impact: o.impact || "متوسط",
    satisfaction: o.satisfaction || "جيد", focus_level: o.focusLevel || "متوسط",
    energy_level: o.energyLevel || "متوسطة",
    quality_rating: o.qualityRating || 3, personal_rating: o.personalRating || 3,
    why_done: o.whyDone || "", why_not_done: o.whyNotDone || "",
    obstacle: o.obstacle || "", delay_reason: o.delayReason || "",
    benefit: o.benefit || "", repeat_worthy: o.repeatWorthy !== false,
    should_reduce: !!o.shouldReduce, notes: o.notes || "",
  };
}
function toCamel(r) {
  return {
    id: r.id, name: r.name || "", description: r.description || "",
    category: r.category || "work", startTime: r.start_time || "",
    endTime: r.end_time || "", expectedDuration: r.expected_duration || "",
    date: r.date || "", status: r.status || "done",
    planned: r.planned !== false, important: !!r.important,
    urgent: !!r.urgent, useful: r.useful !== false,
    highEnergy: !!r.high_energy, deepFocus: !!r.deep_focus,
    realProgress: !!r.real_progress, delegatable: !!r.delegatable,
    shortenable: !!r.shortenable, distracting: !!r.distracting,
    goodHabit: !!r.good_habit, wasteSource: !!r.waste_source,
    importance: r.importance || "متوسطة", impact: r.impact || "متوسط",
    satisfaction: r.satisfaction || "جيد", focusLevel: r.focus_level || "متوسط",
    energyLevel: r.energy_level || "متوسطة",
    qualityRating: r.quality_rating || 3, personalRating: r.personal_rating || 3,
    whyDone: r.why_done || "", whyNotDone: r.why_not_done || "",
    obstacle: r.obstacle || "", delayReason: r.delay_reason || "",
    benefit: r.benefit || "", repeatWorthy: r.repeat_worthy !== false,
    shouldReduce: !!r.should_reduce, notes: r.notes || "",
    createdAt: r.created_at || "",
  };
}

/* ═══ POMODORO MAPPERS ═══ */
function pomoToDb(p) {
  return {
    id: p.id, session_type: p.sessionType || "focus", date: p.date || "",
    start_time: p.startTime || "", end_time: p.endTime || "",
    duration: p.duration || 25, completed: !!p.completed,
    linked_activity_id: p.linkedActivityId || "",
    accomplishment: p.accomplishment || "", not_accomplished: p.notAccomplished || "",
    was_useful: p.wasUseful !== false, was_distracted: !!p.wasDistracted,
    distraction_reason: p.distractionReason || "",
    focus_level: p.focusLevel || "متوسط", energy_level: p.energyLevel || "متوسطة",
    was_deep: !!p.wasDeep, rating: p.rating || 3, notes: p.notes || "",
    cycle_number: p.cycleNumber || 1, session_in_cycle: p.sessionInCycle || 1,
  };
}
function pomoFromDb(r) {
  return {
    id: r.id, sessionType: r.session_type || "focus", date: r.date || "",
    startTime: r.start_time || "", endTime: r.end_time || "",
    duration: r.duration || 25, completed: !!r.completed,
    linkedActivityId: r.linked_activity_id || "",
    accomplishment: r.accomplishment || "", notAccomplished: r.not_accomplished || "",
    wasUseful: r.was_useful !== false, wasDistracted: !!r.was_distracted,
    distractionReason: r.distraction_reason || "",
    focusLevel: r.focus_level || "متوسط", energyLevel: r.energy_level || "متوسطة",
    wasDeep: !!r.was_deep, rating: r.rating || 3, notes: r.notes || "",
    cycleNumber: r.cycle_number || 1, sessionInCycle: r.session_in_cycle || 1,
    createdAt: r.created_at || "",
  };
}

/* ═══ REALTIME ═══ */
class RTChannel {
  constructor(url, key, table, cb) {
    this.wsUrl = url.replace("https://", "wss://") + "/realtime/v1/websocket?apikey=" + key + "&vsn=1.0.0";
    this.table = table; this.cb = cb; this.ws = null; this.hb = null; this.ref = 0;
  }
  connect() {
    try {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => {
        this.send({ topic: "realtime:public:" + this.table, event: "phx_join",
          payload: { config: { postgres_changes: [{ event: "*", schema: "public", table: this.table }] } },
          ref: String(++this.ref) });
        this.hb = setInterval(() => {
          this.send({ topic: "phoenix", event: "heartbeat", payload: {}, ref: String(++this.ref) });
        }, 30000);
      };
      this.ws.onmessage = (ev) => {
        try { const msg = JSON.parse(ev.data); if (msg.event === "postgres_changes") this.cb(msg.payload); } catch (e) {}
      };
      this.ws.onclose = () => { clearInterval(this.hb); setTimeout(() => this.connect(), 3000); };
      this.ws.onerror = () => { if (this.ws) this.ws.close(); };
    } catch (e) { setTimeout(() => this.connect(), 5000); }
  }
  send(msg) { try { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg)); } catch (e) {} }
  disconnect() { clearInterval(this.hb); if (this.ws) this.ws.close(); }
}

/* ═══ CONSTANTS ═══ */
const CATS = [
  { id: "work", label: "عمل", color: "#00d4ff", icon: "💼" },
  { id: "study", label: "دراسة", color: "#a78bfa", icon: "📚" },
  { id: "project", label: "مشروع", color: "#00e5a0", icon: "🚀" },
  { id: "selfdev", label: "تطوير ذات", color: "#34d399", icon: "🌱" },
  { id: "reading", label: "قراءة", color: "#fbbf24", icon: "📖" },
  { id: "sport", label: "رياضة", color: "#f87171", icon: "🏃" },
  { id: "worship", label: "عبادة", color: "#c4b5fd", icon: "🤲" },
  { id: "rest", label: "راحة", color: "#94a3b8", icon: "😴" },
  { id: "sleep", label: "نوم", color: "#475569", icon: "🌙" },
  { id: "entertainment", label: "ترفيه", color: "#f472b6", icon: "🎮" },
  { id: "family", label: "عائلة", color: "#fb923c", icon: "👨‍👩‍👧‍👦" },
  { id: "meetings", label: "اجتماعات", color: "#2dd4bf", icon: "🤝" },
  { id: "calls", label: "اتصالات", color: "#38bdf8", icon: "📞" },
  { id: "errands", label: "مشاوير", color: "#a1a1aa", icon: "🚗" },
  { id: "admin", label: "إدارة", color: "#818cf8", icon: "⚙️" },
  { id: "marketing", label: "تسويق", color: "#e879f9", icon: "📢" },
  { id: "followup", label: "متابعة", color: "#a3e635", icon: "📋" },
  { id: "waste", label: "مضيعة وقت", color: "#ef4444", icon: "⏳" },
  { id: "uncat", label: "غير مصنف", color: "#71717a", icon: "❓" },
  { id: "other", label: "أخرى", color: "#78716c", icon: "📌" },
];
const STS = [
  { id: "done", label: "تم", color: "#00e5a0", icon: "✅" },
  { id: "not_done", label: "لم يتم", color: "#ef4444", icon: "❌" },
  { id: "in_progress", label: "جاري", color: "#00d4ff", icon: "🔄" },
  { id: "paused", label: "متوقف", color: "#fbbf24", icon: "⏸️" },
  { id: "postponed", label: "مؤجل", color: "#a78bfa", icon: "📅" },
  { id: "cancelled", label: "ألغي", color: "#6b7280", icon: "🚫" },
  { id: "partial", label: "جزئي", color: "#06b6d4", icon: "◐" },
];
const LVLS = ["عالية", "متوسطة", "منخفضة"];
const IMPS = ["عال", "متوسط", "ضعيف"];
const SATS = ["ممتاز", "جيد", "مقبول", "ضعيف"];

// Pomodoro colors
const POMO_COLORS = { focus: "#ef4444", short_break: "#00e5a0", long_break: "#a78bfa" };
const POMO_LABELS = { focus: "🎯 جلسة تركيز", short_break: "☕ بريك قصير", long_break: "🌴 بريك طويل" };

/* ═══ HELPERS ═══ */
function fmt12(h, m) {
  const hh = h % 12 || 12;
  return String(hh).padStart(2, "0") + ":" + String(m).padStart(2, "0") + " " + (h < 12 ? "AM" : "PM");
}
function now12() { const d = new Date(); return fmt12(d.getHours(), d.getMinutes()); }
function toMin(t) {
  if (!t) return 0;
  const p = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!p) return 0;
  let h = parseInt(p[1]); const m = parseInt(p[2]); const a = p[3].toUpperCase();
  if (a === "PM" && h !== 12) h += 12; if (a === "AM" && h === 12) h = 0;
  return h * 60 + m;
}
function diffMin(s, e) { const a = toMin(s), b = toMin(e); return b >= a ? b - a : (1440 - a) + b; }
function mStr(m) {
  if (!m || m <= 0) return "0 د";
  const h = Math.floor(m / 60); const mm = m % 60;
  if (!h) return mm + " د"; if (!mm) return h + " س"; return h + " س " + mm + " د";
}
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function todayStr() { return new Date().toISOString().slice(0, 10); }
function padZ(n) { return String(n).padStart(2, "0"); }

function newActivity() {
  return {
    id: genId(), name: "", description: "", category: "work",
    startTime: "", endTime: "", expectedDuration: "", date: todayStr(),
    status: "done", planned: true, important: false, urgent: false,
    useful: true, highEnergy: false, deepFocus: false, realProgress: false,
    delegatable: false, shortenable: false, distracting: false,
    goodHabit: false, wasteSource: false, importance: "متوسطة",
    impact: "متوسط", satisfaction: "جيد", focusLevel: "متوسط",
    energyLevel: "متوسطة", qualityRating: 3, personalRating: 3,
    whyDone: "", whyNotDone: "", obstacle: "", delayReason: "",
    benefit: "", repeatWorthy: true, shouldReduce: false, notes: "",
  };
}

/* ═══ ANALYTICS (includes pomodoro data) ═══ */
function analyze(acts, date) {
  const da = date ? acts.filter(function(a) { return a.date === date; }) : acts;
  const total = da.reduce(function(s, a) { return s + diffMin(a.startTime, a.endTime); }, 0);
  const prod = da.filter(function(a) { return ["done", "partial", "in_progress"].indexOf(a.status) >= 0 && a.useful !== false; }).reduce(function(s, a) { return s + diffMin(a.startTime, a.endTime); }, 0);
  const wst = da.filter(function(a) { return a.wasteSource || a.category === "waste" || a.useful === false; }).reduce(function(s, a) { return s + diffMin(a.startTime, a.endTime); }, 0);
  const upl = da.filter(function(a) { return !a.planned; }).reduce(function(s, a) { return s + diffMin(a.startTime, a.endTime); }, 0);
  const dn = da.filter(function(a) { return a.status === "done"; }).length;
  const nd = da.filter(function(a) { return a.status === "not_done"; }).length;
  const pp = da.filter(function(a) { return a.status === "postponed"; }).length;
  const uc = da.filter(function(a) { return !a.planned; }).length;
  const pl = da.filter(function(a) { return a.planned; }).length;
  const pd = da.filter(function(a) { return a.planned && a.status === "done"; }).length;
  const ct = {};
  da.forEach(function(a) { const d = diffMin(a.startTime, a.endTime); ct[a.category] = (ct[a.category] || 0) + d; });
  const hp = new Array(24).fill(0); const ht = new Array(24).fill(0);
  da.forEach(function(a) { const s = toMin(a.startTime); const dur = diffMin(a.startTime, a.endTime); const sh = Math.floor(s / 60); for (let i = 0; i < Math.ceil(dur / 60); i++) { const h = (sh + i) % 24; ht[h] += Math.min(60, dur - i * 60); if (a.useful !== false && !a.wasteSource) hp[h] += Math.min(60, dur - i * 60); } });
  const pk = hp.indexOf(Math.max.apply(null, hp));
  const cr = pl > 0 ? Math.round((pd / pl) * 100) : 0;
  const wr = total > 0 ? Math.round((wst / total) * 100) : 0;
  const fm = { "عال": 3, "متوسط": 2, "منخفض": 1 };
  const af = da.length > 0 ? (da.reduce(function(s, a) { return s + (fm[a.focusLevel] || 2); }, 0) / da.length) : 0;
  const aq = da.length > 0 ? (da.reduce(function(s, a) { return s + (a.qualityRating || 3); }, 0) / da.length) : 0;
  const ps = total > 0 ? Math.round((prod / total) * 100) : 0;
  const fs = Math.round((af / 3) * 100);
  const tc = Math.max(0, 100 - wr);
  const eq = Math.round(aq / 5 * 100);
  const ds = Math.round(ps * 0.3 + fs * 0.2 + cr * 0.2 + eq * 0.2 + tc * 0.1);
  const drt = ds >= 80 ? "ممتاز" : ds >= 60 ? "جيد" : ds >= 40 ? "متوسط" : "ضعيف";
  const dc = ds >= 80 ? "#00e5a0" : ds >= 60 ? "#00d4ff" : ds >= 40 ? "#fbbf24" : "#ef4444";
  return { dayActs: da, total, productive: prod, wasted: wst, unplanned: upl, done: dn, notDone: nd, postponed: pp, unplannedCount: uc, catTime: ct, hourProd: hp, hourTotal: ht, peakHour: pk, commitRate: cr, wasteRate: wr, productivityScore: ps, focusScore: fs, timeControlScore: tc, executionQuality: eq, dailyScore: ds, dayRating: drt, dayColor: dc, planned: pl };
}

function analyzePomos(pomos, date) {
  const dp = date ? pomos.filter(function(p) { return p.date === date; }) : pomos;
  const focus = dp.filter(function(p) { return p.sessionType === "focus"; });
  const completed = focus.filter(function(p) { return p.completed; });
  const totalFocusMin = focus.reduce(function(s, p) { return s + (p.duration || 0); }, 0);
  const breakMin = dp.filter(function(p) { return p.sessionType !== "focus"; }).reduce(function(s, p) { return s + (p.duration || 0); }, 0);
  const avgRating = completed.length > 0 ? (completed.reduce(function(s, p) { return s + (p.rating || 3); }, 0) / completed.length).toFixed(1) : 0;
  const deepCount = focus.filter(function(p) { return p.wasDeep; }).length;
  const distractedCount = focus.filter(function(p) { return p.wasDistracted; }).length;
  const successRate = focus.length > 0 ? Math.round((completed.length / focus.length) * 100) : 0;
  return {
    totalSessions: focus.length, completedSessions: completed.length,
    incompleteSessions: focus.length - completed.length,
    totalFocusMin, breakMin, avgRating: parseFloat(avgRating),
    deepCount, distractedCount, successRate,
    allPomos: dp, focusPomos: focus,
  };
}

function getInsights(s, ps) {
  const ins = [];
  if (!s.dayActs.length && !ps.totalSessions) return ins;
  if (s.wasteRate > 30) ins.push({ t: "warn", x: "نسبة الهدر مرتفعة (" + s.wasteRate + "%). قلّص الأنشطة غير المفيدة." });
  if (s.productivityScore < 40 && s.dayActs.length > 0) ins.push({ t: "danger", x: "الإنتاجية منخفضة (" + s.productivityScore + "%). ركّز على المهام المؤثرة." });
  if (s.commitRate < 50 && s.planned > 0) ins.push({ t: "warn", x: "الالتزام بالخطة ضعيف (" + s.commitRate + "%)." });
  if (s.peakHour >= 0 && s.hourProd[s.peakHour] > 0) ins.push({ t: "ok", x: "ذروة إنتاجيتك: " + fmt12(s.peakHour, 0) + ". خصصها للعمل العميق." });
  if (s.dailyScore >= 80) ins.push({ t: "ok", x: "أداء ممتاز اليوم! استمر." });
  if (s.postponed > 3) ins.push({ t: "danger", x: s.postponed + " مهام مؤجلة. التأجيل يضعف الإنتاجية." });
  // Pomodoro insights
  if (ps.totalSessions > 0) {
    ins.push({ t: "info", x: "أتممت " + ps.completedSessions + " جلسة تركيز من " + ps.totalSessions + " (" + ps.successRate + "% نجاح)." });
    if (ps.distractedCount > ps.totalSessions * 0.5) ins.push({ t: "warn", x: "التشتت مرتفع في جلساتك. حاول تقليل المقاطعات." });
    if (ps.deepCount > 0) ins.push({ t: "ok", x: ps.deepCount + " جلسات تركيز عميق — ممتاز!" });
    if (ps.successRate < 60 && ps.totalSessions >= 3) ins.push({ t: "warn", x: "جرّب تقليل مدة الجلسة. كثير من جلساتك لم تكتمل." });
  }
  return ins;
}

/* ═══ ANIMATED NUMBER ═══ */
function ANum({ value }) {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);
  useEffect(function() {
    const target = typeof value === "number" ? value : parseInt(value) || 0;
    const from = prev.current; const start = Date.now();
    function tick() {
      const p = Math.min((Date.now() - start) / 1000, 1);
      setDisplay(Math.round(from + (target - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick); prev.current = target;
  }, [value]);
  return display;
}

/* ═══ SCORE RING ═══ */
function ScoreRing({ score, size, color, label, sub }) {
  const sz = size || 200; const r = (sz - 24) / 2; const c = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width={sz} height={sz} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={sz / 2} cy={sz / 2} r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="10" />
        <circle cx={sz / 2} cy={sz / 2} r={r} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={c} strokeDashoffset={c - (score / 100) * c} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1.5s cubic-bezier(0.22,1,0.36,1)", filter: "drop-shadow(0 0 8px " + color + "60)" }} />
      </svg>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: sz > 150 ? "2.8rem" : "1rem", fontWeight: 900, color, fontFamily: "monospace", lineHeight: 1 }}><ANum value={score} /></div>
        {sub && <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{sub}</div>}
        {label && <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.5)", marginTop: 4 }}>{label}</div>}
      </div>
    </div>
  );
}

function MiniGauge({ score, color, label, size }) {
  const sz = size || 80; const r = (sz - 8) / 2; const c = 2 * Math.PI * r;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div style={{ position: "relative", width: sz, height: sz }}>
        <svg width={sz} height={sz} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={sz / 2} cy={sz / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
          <circle cx={sz / 2} cy={sz / 2} r={r} fill="none" stroke={color} strokeWidth="4"
            strokeDasharray={c} strokeDashoffset={c - (score / 100) * c} strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.22,1,0.36,1)" }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", fontWeight: 700, color, fontFamily: "monospace" }}><ANum value={score} />%</div>
      </div>
      <span style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.5)" }}>{label}</span>
    </div>
  );
}

function KPI({ icon, label, value, color, sub }) {
  return (
    <div className="kpi">
      <div className="kpi-icon">{icon}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.45)" }}>{label}</span>
        <span style={{ fontSize: "1.35rem", fontWeight: 800, color, fontFamily: "monospace" }}>{typeof value === "number" ? <ANum value={value} /> : value}</span>
        {sub && <span style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.35)" }}>{sub}</span>}
      </div>
    </div>
  );
}

function Badge({ children, color }) {
  const c = color || "#00d4ff";
  return <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 16, fontSize: "0.68rem", fontWeight: 600, color: c, background: c + "18", border: "1px solid " + c + "30" }}>{children}</span>;
}

function Toggle({ checked, onChange, label }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.82rem" }}>
      <div onClick={function() { onChange(!checked); }} style={{ width: 40, height: 24, borderRadius: 12, position: "relative", background: checked ? "rgba(0,212,255,0.25)" : "rgba(255,255,255,0.08)", border: "1px solid " + (checked ? "rgba(0,212,255,0.4)" : "rgba(255,255,255,0.06)"), transition: "all 0.3s", flexShrink: 0 }}>
        <div style={{ width: 18, height: 18, borderRadius: "50%", position: "absolute", top: 2, right: checked ? 20 : 2, transition: "all 0.3s cubic-bezier(0.22,1,0.36,1)", background: checked ? "#00d4ff" : "white", boxShadow: checked ? "0 0 12px rgba(0,212,255,0.4)" : "0 2px 6px rgba(0,0,0,0.3)" }} />
      </div>
      <span>{label}</span>
    </label>
  );
}

function Sel({ value, onChange, options, ph }) {
  return (
    <select value={value} onChange={function(e) { onChange(e.target.value); }} className="sel">
      {ph && <option value="">{ph}</option>}
      {options.map(function(o) { return <option key={o.value || o} value={o.value || o}>{o.label || o}</option>; })}
    </select>
  );
}

function TimeInput({ value, onChange, label }) {
  const [h, setH] = useState(""); const [m, setM] = useState(""); const [ap, setAp] = useState("AM");
  useEffect(function() { if (value) { const p = value.match(/(\d+):(\d+)\s*(AM|PM)/i); if (p) { setH(p[1]); setM(p[2]); setAp(p[3]); } } }, [value]);
  function upd(nh, nm, na) { if (nh && nm) onChange(nh.padStart(2, "0") + ":" + nm.padStart(2, "0") + " " + na); }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {label && <label className="fl">{label}</label>}
      <div className="ti-box">
        <input maxLength={2} placeholder="--" value={h} onChange={function(e) { const v = e.target.value.replace(/\D/g, "").slice(0, 2); setH(v); upd(v, m, ap); }} className="ti-seg" />
        <span style={{ fontSize: "1.1rem", opacity: 0.4 }}>:</span>
        <input maxLength={2} placeholder="--" value={m} onChange={function(e) { const v = e.target.value.replace(/\D/g, "").slice(0, 2); setM(v); upd(h, v, ap); }} className="ti-seg" />
        <button className="ti-ap" onClick={function() { const n = ap === "AM" ? "PM" : "AM"; setAp(n); upd(h, m, n); }}>{ap}</button>
      </div>
    </div>
  );
}

function Stars({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {[1, 2, 3, 4, 5].map(function(i) {
        return <button key={i} onClick={function() { onChange(i); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.2rem", color: i <= value ? "#fbbf24" : "rgba(255,255,255,0.15)", textShadow: i <= value ? "0 0 12px rgba(251,191,36,0.4)" : "none", transition: "all 0.2s" }}>★</button>;
      })}
    </div>
  );
}

function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal-box" onClick={function(e) { e.stopPropagation(); }}>
        <div className="modal-head"><h2 style={{ fontSize: "1.05rem", fontWeight: 700 }}>{title}</h2><button onClick={onClose} className="modal-x">✕</button></div>
        <div className="modal-inner">{children}</div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   POMODORO TIMER COMPONENT
   ═══════════════════════════════════════════════════ */
function PomodoroTimer({ pomos, setPomos, acts, showToast, selDate }) {
  const TBL_TIMER = "perf_live_timer";
  const TIMER_ID = "main";

  const [settings, setSettings] = useState({
    focusDuration: 25, shortBreak: 5, longBreak: 15,
    sessionsBeforeLong: 4, autoBreak: true, autoNext: false, sound: true,
  });

  // Live timer state from DB — single source of truth
  const [liveTimer, setLiveTimer] = useState({
    timer_status: "idle", session_type: "focus", duration_seconds: 1500,
    started_at: null, paused_remaining: null, cycle_number: 1, session_in_cycle: 1,
  });
  const [secondsLeft, setSecondsLeft] = useState(1500);
  const [showReview, setShowReview] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [review, setReview] = useState({
    accomplishment: "", notAccomplished: "", wasUseful: true,
    wasDistracted: false, distractionReason: "", focusLevel: "متوسط",
    energyLevel: "متوسطة", wasDeep: false, rating: 3, notes: "",
    linkedActivityId: "",
  });

  const tickRef = useRef(null);
  const timerColor = POMO_COLORS[liveTimer.session_type] || "#ef4444";

  // Load live timer state from Supabase
  useEffect(function() {
    async function loadTimer() {
      const rows = await sbFetch(TBL_TIMER, "GET", null, "id=eq." + TIMER_ID);
      if (rows && rows.length > 0) {
        setLiveTimer(rows[0]);
        if (rows[0].settings_json) {
          try { const s = JSON.parse(rows[0].settings_json); if (s.focusDuration) setSettings(s); } catch (e) {}
        }
      }
    }
    loadTimer();
  }, []);

  // Realtime subscription for live timer
  useEffect(function() {
    const ch = new RTChannel(SB_URL, SB_KEY, TBL_TIMER, function(payload) {
      const data = payload.data || payload;
      const nr = data.new;
      if (nr && nr.id === TIMER_ID) {
        setLiveTimer(nr);
        if (nr.settings_json) {
          try { const s = JSON.parse(nr.settings_json); if (s.focusDuration) setSettings(s); } catch (e) {}
        }
      }
    });
    ch.connect();
    return function() { ch.disconnect(); };
  }, []);

  // Calculate seconds left from server time — runs every 200ms for precision
  useEffect(function() {
    function calcSeconds() {
      if (liveTimer.timer_status === "running" && liveTimer.started_at) {
        const startedMs = new Date(liveTimer.started_at).getTime();
        const nowMs = Date.now();
        const elapsed = Math.floor((nowMs - startedMs) / 1000);
        const remaining = Math.max(0, liveTimer.duration_seconds - elapsed);
        setSecondsLeft(remaining);
        if (remaining <= 0) {
          handleTimerEndSync();
        }
      } else if (liveTimer.timer_status === "paused" && liveTimer.paused_remaining !== null) {
        setSecondsLeft(liveTimer.paused_remaining);
      } else if (liveTimer.timer_status === "idle") {
        setSecondsLeft(liveTimer.duration_seconds || settings.focusDuration * 60);
      } else if (liveTimer.timer_status === "completed") {
        setSecondsLeft(0);
      }
    }
    calcSeconds();
    tickRef.current = setInterval(calcSeconds, 1000);
    return function() { clearInterval(tickRef.current); };
  }, [liveTimer]);

  // Show review when status changes to completed and type is focus
  useEffect(function() {
    if (liveTimer.timer_status === "completed" && liveTimer.session_type === "focus") {
      setShowReview(true);
      if (settings.sound) {
        try { const ctx = new (window.AudioContext || window.webkitAudioContext)(); const osc = ctx.createOscillator(); osc.connect(ctx.destination); osc.frequency.value = 800; osc.start(); setTimeout(function() { osc.stop(); }, 300); } catch (e) {}
      }
    }
  }, [liveTimer.timer_status]);

  // Update live timer in Supabase — central state
  // Optimistic update: change local state FIRST, then sync to DB in background
  function updateTimer(fields) {
    var updated = Object.assign({}, liveTimer, fields, { updated_at: new Date().toISOString() });
    setLiveTimer(updated); // instant local update
    sbFetch(TBL_TIMER, "PATCH", fields, "id=eq." + TIMER_ID); // fire-and-forget to DB
  }

  function handleTimerEndSync() {
    if (liveTimer.timer_status !== "running") return;
    updateTimer({ timer_status: "completed" });
  }

  function startFocus() {
    var dur = settings.focusDuration * 60;
    updateTimer({
      timer_status: "running", session_type: "focus", duration_seconds: dur,
      started_at: new Date().toISOString(), paused_remaining: null,
      settings_json: JSON.stringify(settings),
    });
    setShowReview(false);
  }

  function startBreak(type) {
    var dur = type === "long_break" ? settings.longBreak * 60 : settings.shortBreak * 60;
    updateTimer({
      timer_status: "running", session_type: type, duration_seconds: dur,
      started_at: new Date().toISOString(), paused_remaining: null,
    });
  }

  function handleStart() {
    if (liveTimer.timer_status === "idle" || liveTimer.timer_status === "completed") {
      startFocus();
    } else if (liveTimer.timer_status === "paused") {
      var remaining = liveTimer.paused_remaining || secondsLeft;
      updateTimer({
        timer_status: "running",
        started_at: new Date(Date.now() - (liveTimer.duration_seconds - remaining) * 1000).toISOString(),
        paused_remaining: null,
      });
    }
  }

  function handlePause() {
    updateTimer({ timer_status: "paused", paused_remaining: secondsLeft });
  }

  function handleStop() {
    updateTimer({
      timer_status: "idle", session_type: "focus",
      duration_seconds: settings.focusDuration * 60,
      started_at: null, paused_remaining: null,
    });
  }

  function handleReset() {
    updateTimer({
      timer_status: "idle", session_type: "focus",
      duration_seconds: settings.focusDuration * 60,
      started_at: null, paused_remaining: null,
      cycle_number: 1, session_in_cycle: 1,
    });
  }

  function saveReview() {
    var pomo = {
      id: genId(), sessionType: "focus", date: selDate,
      startTime: liveTimer.started_at ? fmt12(new Date(liveTimer.started_at).getHours(), new Date(liveTimer.started_at).getMinutes()) : now12(),
      endTime: now12(),
      duration: settings.focusDuration, completed: true,
      linkedActivityId: review.linkedActivityId,
      accomplishment: review.accomplishment, notAccomplished: review.notAccomplished,
      wasUseful: review.wasUseful, wasDistracted: review.wasDistracted,
      distractionReason: review.distractionReason, focusLevel: review.focusLevel,
      energyLevel: review.energyLevel, wasDeep: review.wasDeep,
      rating: review.rating, notes: review.notes,
      cycleNumber: liveTimer.cycle_number || 1, sessionInCycle: liveTimer.session_in_cycle || 1,
    };

    setPomos(function(prev) { return prev.concat([pomo]); });
    sbFetch(TBL_POMO, "POST", pomoToDb(pomo));

    // Advance cycle
    var newSIC = (liveTimer.session_in_cycle || 1);
    var newCN = (liveTimer.cycle_number || 1);
    if (newSIC >= settings.sessionsBeforeLong) {
      newSIC = 1; newCN += 1;
      updateTimer({ cycle_number: newCN, session_in_cycle: newSIC });
      if (settings.autoBreak) startBreak("long_break");
      else updateTimer({ timer_status: "idle", session_type: "long_break", duration_seconds: settings.longBreak * 60, started_at: null, paused_remaining: null });
    } else {
      newSIC += 1;
      updateTimer({ cycle_number: newCN, session_in_cycle: newSIC });
      if (settings.autoBreak) startBreak("short_break");
      else updateTimer({ timer_status: "idle", session_type: "short_break", duration_seconds: settings.shortBreak * 60, started_at: null, paused_remaining: null });
    }

    setShowReview(false);
    setReview({ accomplishment: "", notAccomplished: "", wasUseful: true, wasDistracted: false, distractionReason: "", focusLevel: "متوسط", energyLevel: "متوسطة", wasDeep: false, rating: 3, notes: "", linkedActivityId: "" });
    showToast("تم حفظ جلسة التركيز ✅");
  }

  function skipReview() {
    const pomo = {
      id: genId(), sessionType: "focus", date: selDate,
      startTime: now12(), endTime: now12(), duration: settings.focusDuration, completed: true,
      cycleNumber: liveTimer.cycle_number || 1, sessionInCycle: liveTimer.session_in_cycle || 1,
      linkedActivityId: "", accomplishment: "", notAccomplished: "",
      wasUseful: true, wasDistracted: false, distractionReason: "",
      focusLevel: "متوسط", energyLevel: "متوسطة", wasDeep: false, rating: 3, notes: "",
    };
    setPomos(function(prev) { return prev.concat([pomo]); });
    sbFetch(TBL_POMO, "POST", pomoToDb(pomo));
    setShowReview(false);
    handleStop();
    showToast("تم حفظ الجلسة ✅");
  }

  // Today's stats
  var todayPomos = pomos.filter(function(p) { return p.date === selDate; });
  var todayFocus = todayPomos.filter(function(p) { return p.sessionType === "focus"; });
  var todayCompleted = todayFocus.filter(function(p) { return p.completed; });
  var todayFocusMin = todayFocus.reduce(function(s, p) { return s + (p.duration || 0); }, 0);

  var totalSeconds = liveTimer.duration_seconds || settings.focusDuration * 60;
  var progress = totalSeconds > 0 ? ((totalSeconds - secondsLeft) / totalSeconds) * 100 : 0;
  var minutes = Math.floor(secondsLeft / 60);
  var seconds = secondsLeft % 60;
  var ringSize = 260;
  var ringR = (ringSize - 20) / 2;
  var ringC = 2 * Math.PI * ringR;
  var status = liveTimer.timer_status;

  return (
    <div className="anim-in">
      {/* Live status indicator */}
      {status === "running" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px 20px", background: timerColor + "15", borderRadius: 14, border: "1px solid " + timerColor + "30", marginBottom: 16, fontSize: "0.85rem" }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: timerColor, animation: "pulse 1s infinite" }} />
          <span style={{ color: timerColor, fontWeight: 700 }}>{POMO_LABELS[liveTimer.session_type] || "جلسة"} شغالة الآن — متزامنة لجميع الأجهزة</span>
        </div>
      )}

      <div className="pomo-main">
        <div className="pomo-timer-zone">
          <div style={{ position: "relative", width: ringSize, height: ringSize }}>
            <svg width={ringSize} height={ringSize} style={{ transform: "rotate(-90deg)" }}>
              <circle cx={ringSize / 2} cy={ringSize / 2} r={ringR} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="8" />
              <circle cx={ringSize / 2} cy={ringSize / 2} r={ringR} fill="none" stroke={timerColor} strokeWidth="8"
                strokeDasharray={ringC} strokeDashoffset={ringC - (progress / 100) * ringC} strokeLinecap="round"
                style={{ transition: "stroke-dashoffset 0.3s linear", filter: "drop-shadow(0 0 12px " + timerColor + "50)" }} />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontSize: "3.5rem", fontWeight: 900, fontFamily: "monospace", color: timerColor, lineHeight: 1, letterSpacing: "0.05em" }}>
                {padZ(minutes)}:{padZ(seconds)}
              </div>
              <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.5)", marginTop: 8 }}>
                {POMO_LABELS[liveTimer.session_type]}
              </div>
              <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.3)", marginTop: 4 }}>
                الدورة {liveTimer.cycle_number || 1} • الجلسة {liveTimer.session_in_cycle || 1}/{settings.sessionsBeforeLong}
              </div>
              {status === "paused" && <div style={{ fontSize: "0.75rem", color: "#fbbf24", marginTop: 6, fontWeight: 700 }}>⏸ متوقف مؤقتًا</div>}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap", justifyContent: "center" }}>
            {status === "idle" && <button className="btn-prime" onClick={handleStart}>▶ ابدأ التركيز</button>}
            {status === "running" && <button className="btn-ghost" onClick={handlePause}>⏸ إيقاف مؤقت</button>}
            {status === "paused" && <button className="btn-prime" onClick={handleStart}>▶ استئناف</button>}
            {status === "paused" && <button className="btn-ghost" style={{ borderColor: "#ef4444", color: "#ef4444" }} onClick={handleStop}>⏹ إنهاء</button>}
            {status === "completed" && liveTimer.session_type !== "focus" && <button className="btn-prime" onClick={startFocus}>▶ جلسة جديدة</button>}
            <button className="btn-ghost" onClick={function() { setShowSettings(!showSettings); }} style={{ fontSize: "0.8rem" }}>⚙️</button>
            {status !== "idle" && <button className="btn-ghost" onClick={handleReset} style={{ fontSize: "0.8rem" }}>🔄</button>}
          </div>
        </div>

        <div className="pomo-stats">
          <h3 className="panel-t">📊 إحصائيات اليوم</h3>
          <div className="pomo-stats-grid">
            <div className="pomo-stat"><span className="pomo-stat-v" style={{ color: "#00e5a0" }}>{todayCompleted.length}</span><span className="pomo-stat-l">مكتملة</span></div>
            <div className="pomo-stat"><span className="pomo-stat-v" style={{ color: "#00d4ff" }}>{todayFocus.length}</span><span className="pomo-stat-l">إجمالي</span></div>
            <div className="pomo-stat"><span className="pomo-stat-v" style={{ color: "#fbbf24" }}>{mStr(todayFocusMin)}</span><span className="pomo-stat-l">وقت التركيز</span></div>
            <div className="pomo-stat"><span className="pomo-stat-v" style={{ color: "#a78bfa" }}>{todayFocus.filter(function(p) { return p.wasDeep; }).length}</span><span className="pomo-stat-l">عميقة</span></div>
          </div>
          {todayPomos.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h4 style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: 8 }}>📋 سجل الجلسات</h4>
              {todayPomos.filter(function(p) { return p.sessionType === "focus"; }).map(function(p) {
                return (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 10, marginBottom: 6, fontSize: "0.82rem" }}>
                    <span style={{ color: p.completed ? "#00e5a0" : "#ef4444" }}>{p.completed ? "✅" : "❌"}</span>
                    <span style={{ fontFamily: "monospace", color: "rgba(255,255,255,0.5)" }}>{p.startTime} → {p.endTime}</span>
                    <span style={{ color: "#00d4ff" }}>{p.duration}د</span>
                    {p.accomplishment && <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "rgba(255,255,255,0.4)" }}>{p.accomplishment}</span>}
                    <span style={{ color: "#fbbf24" }}>{"★".repeat(p.rating)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showSettings && (
        <div className="glass-panel" style={{ marginTop: 16 }}>
          <h3 className="panel-t">⚙️ إعدادات البومودورو</h3>
          <div className="fgrid">
            <div><label className="fl">مدة التركيز (د)</label><input type="number" className="fi" value={settings.focusDuration} onChange={function(e) { var v = parseInt(e.target.value) || 25; setSettings(function(s) { return Object.assign({}, s, { focusDuration: v }); }); if (status === "idle") updateTimer({ duration_seconds: v * 60, settings_json: JSON.stringify(Object.assign({}, settings, { focusDuration: v })) }); }} /></div>
            <div><label className="fl">بريك قصير (د)</label><input type="number" className="fi" value={settings.shortBreak} onChange={function(e) { setSettings(function(s) { return Object.assign({}, s, { shortBreak: parseInt(e.target.value) || 5 }); }); }} /></div>
            <div><label className="fl">بريك طويل (د)</label><input type="number" className="fi" value={settings.longBreak} onChange={function(e) { setSettings(function(s) { return Object.assign({}, s, { longBreak: parseInt(e.target.value) || 15 }); }); }} /></div>
            <div><label className="fl">جلسات قبل البريك الطويل</label><input type="number" className="fi" value={settings.sessionsBeforeLong} onChange={function(e) { setSettings(function(s) { return Object.assign({}, s, { sessionsBeforeLong: parseInt(e.target.value) || 4 }); }); }} /></div>
            <div><Toggle checked={settings.autoBreak} onChange={function(v) { setSettings(function(s) { return Object.assign({}, s, { autoBreak: v }); }); }} label="بريك تلقائي" /></div>
            <div><Toggle checked={settings.autoNext} onChange={function(v) { setSettings(function(s) { return Object.assign({}, s, { autoNext: v }); }); }} label="جلسة تالية تلقائية" /></div>
            <div><Toggle checked={settings.sound} onChange={function(v) { setSettings(function(s) { return Object.assign({}, s, { sound: v }); }); }} label="تنبيه صوتي" /></div>
          </div>
        </div>
      )}

      <Modal open={showReview} onClose={function() {}} title="🎯 تقييم الجلسة">
        <div className="form-s">
          <div className="fsec">
            <div className="fgrid">
              <div className="fc2"><label className="fl">ماذا أنجزت؟</label><input className="fi" value={review.accomplishment} onChange={function(e) { setReview(function(r) { return Object.assign({}, r, { accomplishment: e.target.value }); }); }} placeholder="مثال: أنهيت مراجعة الفصل الأول" /></div>
              <div className="fc2"><label className="fl">ماذا لم تنجز؟</label><input className="fi" value={review.notAccomplished} onChange={function(e) { setReview(function(r) { return Object.assign({}, r, { notAccomplished: e.target.value }); }); }} /></div>
              <div><label className="fl">التركيز</label><Sel value={review.focusLevel} onChange={function(v) { setReview(function(r) { return Object.assign({}, r, { focusLevel: v }); }); }} options={IMPS} /></div>
              <div><label className="fl">الطاقة</label><Sel value={review.energyLevel} onChange={function(v) { setReview(function(r) { return Object.assign({}, r, { energyLevel: v }); }); }} options={LVLS} /></div>
              <div><label className="fl">تقييم الجلسة</label><Stars value={review.rating} onChange={function(v) { setReview(function(r) { return Object.assign({}, r, { rating: v }); }); }} /></div>
              <div><label className="fl">ربط بنشاط</label>
                <Sel value={review.linkedActivityId} onChange={function(v) { setReview(function(r) { return Object.assign({}, r, { linkedActivityId: v }); }); }}
                  options={[{ value: "", label: "-- بدون ربط --" }].concat(acts.filter(function(a) { return a.date === selDate; }).map(function(a) { return { value: a.id, label: a.name }; }))} />
              </div>
              <div><Toggle checked={review.wasUseful} onChange={function(v) { setReview(function(r) { return Object.assign({}, r, { wasUseful: v }); }); }} label="مفيدة" /></div>
              <div><Toggle checked={review.wasDeep} onChange={function(v) { setReview(function(r) { return Object.assign({}, r, { wasDeep: v }); }); }} label="تركيز عميق" /></div>
              <div><Toggle checked={review.wasDistracted} onChange={function(v) { setReview(function(r) { return Object.assign({}, r, { wasDistracted: v }); }); }} label="حصل تشتت" /></div>
              {review.wasDistracted && <div><label className="fl">سبب التشتت</label><input className="fi" value={review.distractionReason} onChange={function(e) { setReview(function(r) { return Object.assign({}, r, { distractionReason: e.target.value }); }); }} /></div>}
              <div className="fc2"><label className="fl">ملاحظات</label><textarea className="fi" rows={2} value={review.notes} onChange={function(e) { setReview(function(r) { return Object.assign({}, r, { notes: e.target.value }); }); }} /></div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button className="btn-ghost" onClick={skipReview}>تخطي</button>
            <button className="btn-prime" onClick={saveReview}>💾 حفظ وابدأ البريك</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   ACTIVITY FORM
   ═══════════════════════════════════════════════════ */
function ActivityForm({ activity, onChange, onSave, onClose, saving }) {
  const a = activity;
  function set(k, v) { onChange(Object.assign({}, a, { [k]: v })); }
  const dur = a.startTime && a.endTime ? diffMin(a.startTime, a.endTime) : 0;
  const exp = parseInt(a.expectedDuration) || 0;
  const td = dur - exp;
  return (
    <div className="form-s">
      <div className="fsec">
        <div className="fsec-t">📝 البيانات الأساسية</div>
        <div className="fgrid">
          <div className="fc2"><label className="fl">اسم النشاط *</label><input className="fi" value={a.name} onChange={function(e) { set("name", e.target.value); }} placeholder="مثال: مراجعة التقرير" autoFocus /></div>
          <div className="fc2"><label className="fl">وصف</label><input className="fi" value={a.description} onChange={function(e) { set("description", e.target.value); }} /></div>
          <div><label className="fl">التصنيف</label><Sel value={a.category} onChange={function(v) { set("category", v); }} options={CATS.map(function(c) { return { value: c.id, label: c.icon + " " + c.label }; })} /></div>
          <div><label className="fl">الحالة</label><Sel value={a.status} onChange={function(v) { set("status", v); }} options={STS.map(function(s) { return { value: s.id, label: s.icon + " " + s.label }; })} /></div>
          <div><label className="fl">التاريخ</label><input type="date" className="fi" value={a.date} onChange={function(e) { set("date", e.target.value); }} /></div>
          <div><label className="fl">المدة المتوقعة (د)</label><input type="number" className="fi" value={a.expectedDuration} onChange={function(e) { set("expectedDuration", e.target.value); }} /></div>
        </div>
        <div className="fgrid" style={{ marginTop: 12 }}>
          <TimeInput label="البداية" value={a.startTime} onChange={function(v) { set("startTime", v); }} />
          <TimeInput label="النهاية" value={a.endTime} onChange={function(v) { set("endTime", v); }} />
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
            <span className="fl">المدة الفعلية</span><span style={{ fontSize: "1.05rem", fontWeight: 800, color: "#00d4ff", fontFamily: "monospace" }}>{mStr(dur)}</span></div>
          {exp > 0 && <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
            <span className="fl">الفرق</span><span style={{ fontSize: "1.05rem", fontWeight: 800, color: td > 0 ? "#ef4444" : "#00e5a0", fontFamily: "monospace" }}>{td > 0 ? "+" : ""}{mStr(Math.abs(td))}</span></div>}
        </div>
      </div>
      <div className="fsec">
        <div className="fsec-t">📊 المؤشرات</div>
        <div className="tgrid">
          {[["planned", "مخطط له"], ["important", "مهم"], ["urgent", "عاجل"], ["useful", "مفيد"], ["highEnergy", "طاقة عالية"], ["deepFocus", "تركيز عميق"], ["realProgress", "تقدم حقيقي"], ["delegatable", "قابل للتفويض"], ["shortenable", "يمكن اختصاره"], ["distracting", "مشتت"], ["goodHabit", "عادة جيدة"], ["wasteSource", "مسبب هدر"]].map(function(pair) {
            return <Toggle key={pair[0]} checked={a[pair[0]]} onChange={function(v) { set(pair[0], v); }} label={pair[1]} />;
          })}
        </div>
      </div>
      <div className="fsec">
        <div className="fsec-t">⭐ التقييمات</div>
        <div className="fgrid">
          <div><label className="fl">الأهمية</label><Sel value={a.importance} onChange={function(v) { set("importance", v); }} options={LVLS} /></div>
          <div><label className="fl">التأثير</label><Sel value={a.impact} onChange={function(v) { set("impact", v); }} options={IMPS} /></div>
          <div><label className="fl">الرضا</label><Sel value={a.satisfaction} onChange={function(v) { set("satisfaction", v); }} options={SATS} /></div>
          <div><label className="fl">التركيز</label><Sel value={a.focusLevel} onChange={function(v) { set("focusLevel", v); }} options={IMPS} /></div>
          <div><label className="fl">جودة الإنجاز</label><Stars value={a.qualityRating} onChange={function(v) { set("qualityRating", v); }} /></div>
          <div><label className="fl">تقييم شخصي</label><Stars value={a.personalRating} onChange={function(v) { set("personalRating", v); }} /></div>
        </div>
      </div>
      <div className="fsec">
        <div className="fsec-t">📝 ملاحظات</div>
        <div className="fgrid">
          <div><label className="fl">لماذا أنجزته؟</label><input className="fi" value={a.whyDone} onChange={function(e) { set("whyDone", e.target.value); }} /></div>
          <div><label className="fl">لماذا لم ينجز؟</label><input className="fi" value={a.whyNotDone} onChange={function(e) { set("whyNotDone", e.target.value); }} /></div>
          <div className="fc2"><label className="fl">ملاحظات</label><textarea className="fi" rows={2} value={a.notes} onChange={function(e) { set("notes", e.target.value); }} /></div>
          <div><Toggle checked={a.repeatWorthy} onChange={function(v) { set("repeatWorthy", v); }} label="يستحق التكرار" /></div>
          <div><Toggle checked={a.shouldReduce} onChange={function(v) { set("shouldReduce", v); }} label="يجب تقليله" /></div>
        </div>
      </div>
      <div className="form-footer">
        <button className="btn-ghost" onClick={onClose}>إلغاء</button>
        <button className="btn-prime" onClick={onSave} disabled={!a.name || !a.startTime || !a.endTime || saving}>{saving ? "⏳ جاري الحفظ..." : "💾 حفظ النشاط"}</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════════════ */
export default function App() {
  const [acts, setActs] = useState([]);
  const [pomos, setPomos] = useState([]);
  const [view, setView] = useState("dash");
  const [selDate, setSelDate] = useState(todayStr());
  const [showForm, setSF] = useState(false);
  const [editAct, setEA] = useState(null);
  const [time, setTime] = useState(now12());
  const [dateRange, setDR] = useState({ start: todayStr(), end: todayStr() });
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sync, setSync] = useState("connecting");

  useEffect(function() { const t = setInterval(function() { setTime(now12()); }, 1000); return function() { clearInterval(t); }; }, []);

  function showToastFn(msg, type) { setToast({ m: msg, t: type || "ok" }); setTimeout(function() { setToast(null); }, 3000); }

  // Load data
  useEffect(function() {
    async function load() {
      setLoading(true);
      const [actRows, pomoRows] = await Promise.all([
        sbFetch(TBL_ACT, "GET", null, "order=date.desc,start_time.asc&limit=5000"),
        sbFetch(TBL_POMO, "GET", null, "order=date.desc,start_time.asc&limit=5000"),
      ]);
      if (actRows && Array.isArray(actRows)) { setActs(actRows.map(toCamel)); setSync("on"); }
      else { try { const r = localStorage.getItem("haz_tracker_v1"); if (r) setActs(JSON.parse(r).activities || []); } catch (e) {} setSync("off"); }
      if (pomoRows && Array.isArray(pomoRows)) { setPomos(pomoRows.map(pomoFromDb)); }
      else { try { const r = localStorage.getItem("haz_pomos"); if (r) setPomos(JSON.parse(r)); } catch (e) {} }
      setLoading(false);
    }
    load();
  }, []);

  // Realtime for activities
  useEffect(function() {
    const ch = new RTChannel(SB_URL, SB_KEY, TBL_ACT, function(payload) {
      const data = payload.data || payload; const et = data.eventType; const nr = data.new; const or = data.old;
      if (et === "INSERT" && nr) setActs(function(p) { if (p.find(function(a) { return a.id === nr.id; })) return p; return p.concat([toCamel(nr)]); });
      else if (et === "UPDATE" && nr) setActs(function(p) { return p.map(function(a) { return a.id === nr.id ? toCamel(nr) : a; }); });
      else if (et === "DELETE" && or) setActs(function(p) { return p.filter(function(a) { return a.id !== or.id; }); });
      setSync("on");
    });
    ch.connect(); return function() { ch.disconnect(); };
  }, []);

  // Realtime for pomodoro
  useEffect(function() {
    const ch = new RTChannel(SB_URL, SB_KEY, TBL_POMO, function(payload) {
      const data = payload.data || payload; const et = data.eventType; const nr = data.new; const or = data.old;
      if (et === "INSERT" && nr) setPomos(function(p) { if (p.find(function(x) { return x.id === nr.id; })) return p; return p.concat([pomoFromDb(nr)]); });
      else if (et === "UPDATE" && nr) setPomos(function(p) { return p.map(function(x) { return x.id === nr.id ? pomoFromDb(nr) : x; }); });
      else if (et === "DELETE" && or) setPomos(function(p) { return p.filter(function(x) { return x.id !== or.id; }); });
    });
    ch.connect(); return function() { ch.disconnect(); };
  }, []);

  // Backup
  useEffect(function() { try { localStorage.setItem("haz_tracker_v1", JSON.stringify({ activities: acts })); } catch (e) {} }, [acts]);
  useEffect(function() { try { localStorage.setItem("haz_pomos", JSON.stringify(pomos)); } catch (e) {} }, [pomos]);

  const dayActs = useMemo(function() { return acts.filter(function(a) { return a.date === selDate; }); }, [acts, selDate]);
  const stats = useMemo(function() { return analyze(acts, selDate); }, [acts, selDate]);
  const pomoStats = useMemo(function() { return analyzePomos(pomos, selDate); }, [pomos, selDate]);
  const insights = useMemo(function() { return getInsights(stats, pomoStats); }, [stats, pomoStats]);

  function handleSave() {
    if (!editAct || !editAct.name || !editAct.startTime || !editAct.endTime) return;
    var exists = acts.find(function(a) { return a.id === editAct.id; });
    if (exists) {
      setActs(function(p) { return p.map(function(a) { return a.id === editAct.id ? editAct : a; }); });
      sbFetch(TBL_ACT, "PATCH", toSnake(editAct), "id=eq." + editAct.id);
    } else {
      setActs(function(p) { return p.concat([editAct]); });
      sbFetch(TBL_ACT, "POST", toSnake(editAct));
    }
    showToastFn("تم الحفظ ✅");
    setSF(false); setEA(null);
  }

  function handleDelete(id) {
    setActs(function(p) { return p.filter(function(a) { return a.id !== id; }); });
    sbFetch(TBL_ACT, "DELETE", null, "id=eq." + id);
    showToastFn("تم الحذف 🗑️", "info");
  }

  function handleDuplicate(act) {
    var dup = Object.assign({}, act, { id: genId(), name: act.name + " (نسخة)" });
    setActs(function(p) { return p.concat([dup]); });
    sbFetch(TBL_ACT, "POST", toSnake(dup));
    showToastFn("تم النسخ 📋");
  }

  const NAV = [
    { id: "dash", l: "لوحة التحكم", i: "📊" },
    { id: "pomo", l: "البومودورو", i: "🍅" },
    { id: "tl", l: "السجل الزمني", i: "⏳" },
    { id: "reps", l: "التقارير", i: "📈" },
    { id: "ai", l: "التحليل الذكي", i: "🧠" },
  ];

  const ttStyle = { background: "rgba(8,10,18,0.9)", border: "1px solid rgba(0,212,255,0.15)", borderRadius: 12, backdropFilter: "blur(20px)", direction: "rtl" };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, background: "#060810", color: "#e8eaf0", fontFamily: "'Segoe UI', Tahoma, sans-serif" }}>
        <div style={{ width: 60, height: 60, border: "3px solid rgba(255,255,255,0.06)", borderTopColor: "#00d4ff", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
        <p style={{ color: "rgba(255,255,255,0.45)" }}>جاري تحميل البيانات</p>
        <style>{STYLES}</style>
      </div>
    );
  }

  return (
    <div className="root" dir="rtl">
      <div className="bg-layer"><div className="bg-orb o1" /><div className="bg-orb o2" /><div className="bg-grid" /></div>

      <header className="hdr">
        <div className="hdr-in">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="logo">⚡</div>
            <div>
              <h1 className="brand">مركز تحليل الأداء</h1>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div className={"sync-dot " + sync} /><span style={{ fontSize: "0.6rem", color: "rgba(255,255,255,0.4)" }}>{sync === "on" ? "متصل" : "جاري الاتصال..."}</span></div>
            </div>
          </div>
          <nav className="nav">
            {NAV.map(function(n) { return <button key={n.id} className={"nav-btn" + (view === n.id ? " active" : "")} onClick={function() { setView(n.id); }}><span>{n.i}</span> <span className="nav-lbl">{n.l}</span></button>; })}
          </nav>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div className="clock">{time}</div>
            <input type="date" className="date-in" value={selDate} onChange={function(e) { setSelDate(e.target.value); }} />
            <button className="btn-add" onClick={function() { setEA(Object.assign({}, newActivity(), { date: selDate })); setSF(true); }}>+ نشاط جديد</button>
          </div>
        </div>
      </header>

      <main className="main">
        {/* ═══ DASHBOARD ═══ */}
        {view === "dash" && (
          <div className="anim-in">
            <div className="hero-zone">
              <ScoreRing score={stats.dailyScore} size={200} color={stats.dayColor} label="تقييم اليوم" sub="من 100" />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: "2rem", fontWeight: 900, color: stats.dayColor }}>{stats.dayRating}</div>
                <div style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.45)" }}>{selDate}</div>
                <div style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.35)" }}>{dayActs.length} نشاط • {mStr(stats.total)} • {pomoStats.completedSessions} جلسات 🍅</div>
                <div style={{ display: "flex", gap: 20, marginTop: 12 }}>
                  <MiniGauge score={stats.productivityScore} color="#00e5a0" label="الإنتاجية" />
                  <MiniGauge score={stats.focusScore} color="#a78bfa" label="التركيز" />
                  <MiniGauge score={stats.commitRate} color="#00d4ff" label="الالتزام" />
                </div>
              </div>
            </div>

            <div className="kpi-row">
              <KPI icon="⏱️" label="الوقت المسجل" value={mStr(stats.total)} color="#00d4ff" />
              <KPI icon="✅" label="المنتج" value={mStr(stats.productive)} color="#00e5a0" />
              <KPI icon="🗑️" label="الضائع" value={mStr(stats.wasted)} color="#ef4444" />
              <KPI icon="🍅" label="جلسات تركيز" value={pomoStats.completedSessions} sub={"من " + pomoStats.totalSessions} color="#ef4444" />
              <KPI icon="📋" label="منجزة" value={stats.done} sub={"من " + dayActs.length} color="#00e5a0" />
              <KPI icon="🔥" label="وقت التركيز" value={mStr(pomoStats.totalFocusMin)} color="#fbbf24" />
              <KPI icon="📅" label="مؤجلة" value={stats.postponed} color="#a78bfa" />
              <KPI icon="⭐" label="تقييم الجلسات" value={pomoStats.avgRating || "—"} color="#fbbf24" />
            </div>

            {Object.keys(stats.catTime).length > 0 && (
              <div className="glass-panel">
                <h3 className="panel-t">📊 توزيع الوقت</h3>
                {Object.entries(stats.catTime).sort(function(a, b) { return b[1] - a[1]; }).map(function(entry) {
                  const cat = CATS.find(function(c) { return c.id === entry[0]; });
                  const pct = stats.total > 0 ? Math.round(entry[1] / stats.total * 100) : 0;
                  return (
                    <div key={entry[0]} style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: 4 }}>
                        <span>{cat ? cat.icon + " " + cat.label : entry[0]}</span>
                        <span style={{ fontFamily: "monospace", color: "rgba(255,255,255,0.45)" }}>{mStr(entry[1])} ({pct}%)</span>
                      </div>
                      <div className="cat-track"><div style={{ height: "100%", borderRadius: 3, width: pct + "%", background: cat ? cat.color + "99" : "#888", transition: "width 1s" }} /></div>
                    </div>
                  );
                })}
              </div>
            )}

            {insights.length > 0 && (
              <div className="glass-panel">
                <h3 className="panel-t">💡 رؤى ذكية</h3>
                {insights.map(function(ins, i) {
                  const ic = ins.t === "ok" ? "✅" : ins.t === "warn" ? "⚠️" : ins.t === "danger" ? "🚨" : "💡";
                  return <div key={i} className={"ins-card " + ins.t}><span>{ic}</span> <span>{ins.x}</span></div>;
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══ POMODORO ═══ */}
        {view === "pomo" && <PomodoroTimer pomos={pomos} setPomos={setPomos} acts={acts} showToast={showToastFn} selDate={selDate} />}

        {/* ═══ TIMELINE ═══ */}
        {view === "tl" && (
          <div className="anim-in">
            <div className="sec-head"><h2>⏳ السجل الزمني — {selDate}</h2><button className="btn-prime" onClick={function() { setEA(Object.assign({}, newActivity(), { date: selDate })); setSF(true); }}>+ إضافة نشاط</button></div>
            <div className="tl">
              {dayActs.slice().sort(function(a, b) { return toMin(a.startTime) - toMin(b.startTime); }).map(function(a, i) {
                const cat = CATS.find(function(c) { return c.id === a.category; }) || CATS[0];
                const st = STS.find(function(s) { return s.id === a.status; }) || STS[0];
                const dur = diffMin(a.startTime, a.endTime);
                return (
                  <div key={a.id} className="tl-item" style={{ animationDelay: (i * 0.08) + "s" }}>
                    <div className="tl-track"><div style={{ width: 12, height: 12, borderRadius: "50%", background: cat.color, boxShadow: "0 0 12px " + cat.color + "60", zIndex: 2 }} /><div className="tl-line" /></div>
                    <div className="tl-card">
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                          <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><span>{cat.icon}</span> {a.name || "بدون اسم"}</div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <Badge color={st.color}>{st.icon} {st.label}</Badge>
                            {!a.planned && <Badge color="#fbbf24">غير مخطط</Badge>}
                            {a.wasteSource && <Badge color="#ef4444">هدر</Badge>}
                          </div>
                          <div style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.45)", fontFamily: "monospace" }}>{a.startTime} → {a.endTime} <span style={{ color: cat.color, fontWeight: 700 }}>{mStr(dur)}</span></div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <button className="tl-btn" onClick={function() { setEA(Object.assign({}, a)); setSF(true); }}>✏️</button>
                          <button className="tl-btn" onClick={function() { handleDuplicate(a); }}>📋</button>
                          <button className="tl-btn" onClick={function() { if (confirm("حذف؟")) handleDelete(a.id); }}>🗑️</button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {dayActs.length === 0 && <div className="empty"><div style={{ fontSize: "4rem", opacity: 0.3 }}>📭</div><p>لا توجد أنشطة</p></div>}
            </div>
          </div>
        )}

        {/* ═══ REPORTS ═══ */}
        {view === "reps" && (
          <div className="anim-in">
            <div className="sec-head">
              <h2>📈 التقارير</h2>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <input type="date" className="date-in" value={dateRange.start} onChange={function(e) { setDR(function(d) { return Object.assign({}, d, { start: e.target.value }); }); }} />
                <span style={{ color: "rgba(255,255,255,0.3)" }}>→</span>
                <input type="date" className="date-in" value={dateRange.end} onChange={function(e) { setDR(function(d) { return Object.assign({}, d, { end: e.target.value }); }); }} />
                <button className="btn-ghost" onClick={function() { setDR({ start: selDate, end: selDate }); }}>اليوم</button>
                <button className="btn-ghost" onClick={function() { const d = new Date(); d.setDate(d.getDate() - 7); setDR({ start: d.toISOString().slice(0, 10), end: todayStr() }); }}>الأسبوع</button>
              </div>
            </div>
            <div className="glass-panel">
              <h3 className="panel-t">🍅 إحصائيات البومودورو</h3>
              <div className="kpi-row">
                <KPI icon="🍅" label="إجمالي الجلسات" value={pomoStats.totalSessions} color="#ef4444" />
                <KPI icon="✅" label="مكتملة" value={pomoStats.completedSessions} color="#00e5a0" />
                <KPI icon="🔥" label="وقت التركيز" value={mStr(pomoStats.totalFocusMin)} color="#fbbf24" />
                <KPI icon="☕" label="وقت البريكات" value={mStr(pomoStats.breakMin)} color="#a78bfa" />
                <KPI icon="📊" label="نسبة النجاح" value={pomoStats.successRate + "%"} color="#00d4ff" />
                <KPI icon="⭐" label="متوسط التقييم" value={pomoStats.avgRating || "—"} color="#fbbf24" />
              </div>
            </div>
            {/* Activity charts would go here - keeping existing report structure */}
            <div className="glass-panel">
              <h3 className="panel-t">📊 توزيع الوقت حسب الفئات</h3>
              {Object.entries(stats.catTime).length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={Object.entries(stats.catTime).map(function(e) { const c = CATS.find(function(x) { return x.id === e[0]; }); return { name: c ? c.label : e[0], value: e[1], color: c ? c.color : "#888" }; })} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={110} paddingAngle={3} strokeWidth={0}>
                      {Object.entries(stats.catTime).map(function(e, i) { const c = CATS.find(function(x) { return x.id === e[0]; }); return <Cell key={i} fill={c ? c.color : "#888"} />; })}
                    </Pie>
                    <Tooltip formatter={function(v) { return mStr(v); }} contentStyle={ttStyle} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <p style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", padding: 40 }}>لا توجد بيانات</p>}
            </div>
          </div>
        )}

        {/* ═══ AI INSIGHTS ═══ */}
        {view === "ai" && (
          <div className="anim-in">
            <h2 style={{ fontSize: "1.3rem", fontWeight: 800, marginBottom: 20 }}>🧠 التحليل الذكي</h2>
            <div className="glass-panel">
              <h3 className="panel-t">📋 الملخص التنفيذي</h3>
              <p style={{ fontSize: "0.92rem", lineHeight: 1.9, color: "rgba(255,255,255,0.75)" }}>
                {stats.dayActs.length === 0 && pomoStats.totalSessions === 0
                  ? "لا توجد بيانات كافية. ابدأ بتسجيل أنشطتك أو استخدم البومودورو."
                  : "تم تسجيل " + stats.dayActs.length + " نشاط و" + pomoStats.completedSessions + " جلسة بومودورو بإجمالي " + mStr(stats.total + pomoStats.totalFocusMin) + ". الأداء: " + stats.dayRating + " (" + stats.dailyScore + "/100). الإنتاجية " + stats.productivityScore + "%, نسبة نجاح الجلسات " + pomoStats.successRate + "%."}
              </p>
            </div>
            <div className="glass-panel">
              <h3 className="panel-t">🎯 التوصيات</h3>
              {insights.map(function(ins, i) {
                const ic = ins.t === "ok" ? "✅" : ins.t === "warn" ? "⚠️" : ins.t === "danger" ? "🚨" : "💡";
                return <div key={i} className={"ins-card " + ins.t}>{ic} {ins.x}</div>;
              })}
              {insights.length === 0 && <p style={{ color: "rgba(255,255,255,0.4)", textAlign: "center", padding: 20 }}>سجّل أنشطتك للحصول على توصيات</p>}
            </div>
            <div className="glass-panel">
              <h3 className="panel-t">🔍 الأنماط السلوكية</h3>
              <div className="pat-grid">
                {[
                  ["📅", "التأجيل", stats.postponed],
                  ["🔀", "انحراف", stats.unplannedCount],
                  ["😵", "تشتت", stats.dayActs.filter(function(a) { return a.distracting; }).length],
                  ["🍅", "جلسات مكتملة", pomoStats.completedSessions],
                  ["🔥", "تركيز عميق", pomoStats.deepCount],
                ].map(function(item) {
                  return <div key={item[1]} className="pat-card"><span style={{ fontSize: "1.5rem" }}>{item[0]}</span><span style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.5)" }}>{item[1]}</span><span style={{ fontSize: "1.4rem", fontWeight: 800, fontFamily: "monospace" }}>{item[2]}</span></div>;
                })}
              </div>
            </div>
          </div>
        )}
      </main>

      <Modal open={showForm} onClose={function() { setSF(false); setEA(null); }}
        title={editAct && acts.find(function(a) { return a.id === editAct.id; }) ? "✏️ تعديل النشاط" : "➕ نشاط جديد"}>
        {editAct && <ActivityForm activity={editAct} onChange={setEA} onSave={handleSave} onClose={function() { setSF(false); setEA(null); }} saving={saving} />}
      </Modal>

      {toast && <div className={"toast " + toast.t}>{toast.m}</div>}
      <style>{STYLES}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   STYLES
   ═══════════════════════════════════════════════════ */
const STYLES = `
* { box-sizing: border-box; margin: 0; padding: 0; }
.root { min-height: 100vh; background: #060810; color: #e8eaf0; font-family: 'Tajawal', 'Segoe UI', Tahoma, sans-serif; direction: rtl; position: relative; overflow-x: hidden; }
.bg-layer { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; will-change: auto; }
.bg-orb { position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0.1; }
.o1 { width: 500px; height: 500px; background: #00d4ff; top: -200px; right: -100px; }
.o2 { width: 400px; height: 400px; background: #a78bfa; bottom: -200px; left: -100px; }
.bg-grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,0.012) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.012) 1px, transparent 1px); background-size: 80px 80px; }
@keyframes spin { to { transform: rotate(360deg); } }
.hdr { position: sticky; top: 0; z-index: 100; background: rgba(6,8,16,0.85); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(255,255,255,0.06); }
.hdr-in { max-width: 1500px; margin: 0 auto; padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.logo { width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #00d4ff, #a78bfa); border-radius: 14px; font-size: 22px; }
.brand { font-size: 1.15rem; font-weight: 800; background: linear-gradient(135deg, #e8eaf0, #00d4ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.sync-dot { width: 7px; height: 7px; border-radius: 50%; }
.sync-dot.on { background: #00e5a0; box-shadow: 0 0 6px #00e5a0; }
.sync-dot.connecting { background: #fbbf24; }
.sync-dot.off { background: #ef4444; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
.nav { display: flex; gap: 4px; background: rgba(20,24,40,0.5); border-radius: 14px; padding: 4px; border: 1px solid rgba(255,255,255,0.06); }
.nav-btn { display: flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 10px; border: none; background: transparent; color: rgba(255,255,255,0.45); font-size: 0.85rem; cursor: pointer; transition: color 0.15s, background 0.15s; white-space: nowrap; font-family: inherit; font-weight: 500; }
.nav-btn:hover { color: #e8eaf0; background: rgba(255,255,255,0.04); }
.nav-btn.active { color: white; background: rgba(0,212,255,0.12); font-weight: 700; }
.nav-lbl { font-size: 0.82rem; }
.clock { font-family: 'Courier New', monospace; font-size: 1rem; font-weight: 600; color: #00d4ff; background: rgba(0,212,255,0.08); padding: 7px 16px; border-radius: 12px; border: 1px solid rgba(0,212,255,0.15); }
.date-in { background: rgba(20,24,40,0.5); border: 1px solid rgba(255,255,255,0.06); color: #e8eaf0; padding: 7px 14px; border-radius: 12px; font-size: 0.85rem; font-family: inherit; cursor: pointer; }
.date-in:focus { outline: none; border-color: #00d4ff; }
.btn-add { padding: 8px 20px; border-radius: 12px; border: none; background: linear-gradient(135deg, #00d4ff, #a78bfa); color: white; font-weight: 700; cursor: pointer; font-size: 0.85rem; font-family: inherit; transition: transform 0.15s, box-shadow 0.15s; }
.btn-add:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,212,255,0.2); }
.main { max-width: 1500px; margin: 0 auto; padding: 24px; position: relative; z-index: 1; }
.anim-in { animation: fadeUp 0.35s ease; }
@keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
.hero-zone { display: flex; align-items: center; gap: 40px; padding: 32px; background: rgba(14,18,30,0.7); border-radius: 24px; border: 1px solid rgba(255,255,255,0.08); margin-bottom: 24px; }
.kpi-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; margin-bottom: 20px; }
.kpi { background: rgba(14,18,30,0.65); border: 1px solid rgba(255,255,255,0.06); border-radius: 20px; padding: 18px; display: flex; align-items: flex-start; gap: 14px; transition: transform 0.15s, border-color 0.15s; }
.kpi:hover { border-color: rgba(255,255,255,0.12); transform: translateY(-2px); }
.kpi-icon { font-size: 1.5rem; width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.04); border-radius: 12px; flex-shrink: 0; }
.glass-panel { background: rgba(14,18,30,0.7); border: 1px solid rgba(255,255,255,0.06); border-radius: 20px; padding: 24px; margin-bottom: 20px; }
.panel-t { font-size: 0.95rem; font-weight: 700; margin-bottom: 18px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.06); }
.cat-track { width: 100%; height: 6px; background: rgba(255,255,255,0.04); border-radius: 3px; overflow: hidden; }
.ins-card { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-radius: 12px; font-size: 0.85rem; margin-bottom: 8px; border: 1px solid transparent; }
.ins-card.ok { background: rgba(0,229,160,0.06); border-color: rgba(0,229,160,0.12); }
.ins-card.warn { background: rgba(251,191,36,0.06); border-color: rgba(251,191,36,0.12); }
.ins-card.danger { background: rgba(239,68,68,0.06); border-color: rgba(239,68,68,0.12); }
.ins-card.info { background: rgba(0,212,255,0.06); border-color: rgba(0,212,255,0.12); }
.tl { display: flex; flex-direction: column; }
.tl-item { display: flex; gap: 0; }
.tl-track { display: flex; flex-direction: column; align-items: center; width: 30px; flex-shrink: 0; padding-top: 18px; }
.tl-line { width: 2px; flex: 1; background: linear-gradient(180deg, rgba(255,255,255,0.08), transparent); margin-top: 4px; }
.tl-item:last-child .tl-line { display: none; }
.tl-card { flex: 1; background: rgba(14,18,30,0.65); border: 1px solid rgba(255,255,255,0.06); border-radius: 20px; padding: 18px; margin-bottom: 12px; transition: border-color 0.15s; }
.tl-card:hover { border-color: rgba(255,255,255,0.12); }
.tl-btn { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 6px 8px; cursor: pointer; font-size: 0.8rem; transition: background 0.15s; }
.tl-btn:hover { background: rgba(255,255,255,0.08); }
.empty { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 80px 20px; gap: 12px; }
.sec-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
.sec-head h2 { font-size: 1.2rem; font-weight: 800; }
.pat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 12px; }
.pat-card { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 20px 12px; background: rgba(255,255,255,0.03); border-radius: 16px; border: 1px solid rgba(255,255,255,0.06); transition: transform 0.15s; }
.pat-card:hover { transform: translateY(-3px); }
.pomo-main { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.pomo-timer-zone { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 24px; background: rgba(14,18,30,0.7); border-radius: 24px; border: 1px solid rgba(255,255,255,0.08); }
.pomo-stats { background: rgba(14,18,30,0.65); border: 1px solid rgba(255,255,255,0.06); border-radius: 24px; padding: 24px; }
.pomo-stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.pomo-stat { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 16px; background: rgba(255,255,255,0.03); border-radius: 14px; }
.pomo-stat-v { font-size: 1.4rem; font-weight: 800; font-family: monospace; }
.pomo-stat-l { font-size: 0.7rem; color: rgba(255,255,255,0.45); }
.modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); z-index: 200; display: flex; align-items: center; justify-content: center; padding: 20px; }
.modal-box { background: #0a0d14; border: 1px solid rgba(255,255,255,0.1); border-radius: 24px; width: 100%; max-width: 820px; max-height: 88vh; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.4); animation: modalUp 0.25s ease; }
@keyframes modalUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
.modal-head { display: flex; align-items: center; justify-content: space-between; padding: 18px 24px; border-bottom: 1px solid rgba(255,255,255,0.06); }
.modal-x { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; width: 36px; height: 36px; cursor: pointer; color: #e8eaf0; font-size: 1rem; display: flex; align-items: center; justify-content: center; transition: background 0.15s; }
.modal-x:hover { background: rgba(239,68,68,0.15); }
.modal-inner { padding: 24px; overflow-y: auto; flex: 1; }
.form-s { display: flex; flex-direction: column; gap: 20px; }
.fsec { background: rgba(255,255,255,0.02); border-radius: 16px; padding: 18px; border: 1px solid rgba(255,255,255,0.06); }
.fsec-t { font-size: 0.88rem; font-weight: 700; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.06); }
.fgrid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.fc2 { grid-column: span 2; }
.fl { display: block; font-size: 0.68rem; color: rgba(255,255,255,0.45); margin-bottom: 4px; font-weight: 500; }
.fi { width: 100%; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 10px 14px; color: #e8eaf0; font-size: 0.88rem; font-family: inherit; transition: border-color 0.15s; }
.fi:focus { outline: none; border-color: #00d4ff; }
textarea.fi { resize: vertical; }
.sel { width: 100%; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 10px 14px; color: #e8eaf0; font-size: 0.88rem; font-family: inherit; cursor: pointer; }
.sel:focus { outline: none; border-color: #00d4ff; }
.tgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(155px, 1fr)); gap: 8px; }
.ti-box { display: flex; align-items: center; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 6px 10px; gap: 4px; }
.ti-box:focus-within { border-color: #00d4ff; }
.ti-seg { width: 32px; background: transparent; border: none; color: #e8eaf0; font-size: 1.05rem; font-weight: 700; text-align: center; font-family: 'Courier New', monospace; }
.ti-seg:focus { outline: none; }
.ti-ap { background: linear-gradient(135deg, #00d4ff, #a78bfa); color: white; border: none; border-radius: 8px; padding: 3px 10px; font-size: 0.72rem; font-weight: 700; cursor: pointer; font-family: inherit; }
.form-footer { display: flex; gap: 12px; justify-content: flex-end; margin-top: 8px; position: sticky; bottom: 0; background: #0a0d14; padding: 14px 0; border-top: 1px solid rgba(255,255,255,0.06); }
.btn-prime { padding: 10px 24px; border-radius: 12px; border: none; background: linear-gradient(135deg, #00d4ff, #a78bfa); color: white; font-weight: 700; cursor: pointer; font-size: 0.88rem; font-family: inherit; transition: transform 0.15s; }
.btn-prime:hover { transform: translateY(-2px); }
.btn-prime:disabled { opacity: 0.3; cursor: not-allowed; transform: none; }
.btn-ghost { padding: 9px 18px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.06); background: transparent; color: #e8eaf0; cursor: pointer; font-size: 0.85rem; font-family: inherit; transition: background 0.15s; }
.btn-ghost:hover { background: rgba(255,255,255,0.05); }
.toast { position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%); padding: 14px 28px; border-radius: 14px; font-weight: 600; font-size: 0.88rem; z-index: 300; font-family: inherit; animation: toastIn 0.3s ease; }
.toast.ok { background: rgba(0,229,160,0.2); border: 1px solid rgba(0,229,160,0.3); color: #00e5a0; }
.toast.info { background: rgba(0,212,255,0.2); border: 1px solid rgba(0,212,255,0.3); color: #00d4ff; }
.toast.danger { background: rgba(239,68,68,0.2); border: 1px solid rgba(239,68,68,0.3); color: #ef4444; }
@keyframes toastIn { from{opacity:0;transform:translateX(-50%) translateY(16px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
@media(max-width:768px){
  .kpi-row{grid-template-columns:repeat(2,1fr)} .fgrid{grid-template-columns:1fr} .fc2{grid-column:span 1}
  .hdr-in{flex-direction:column;align-items:stretch} .nav{overflow-x:auto;width:100%;justify-content:center}
  .hero-zone{flex-direction:column;align-items:center;text-align:center}
  .tgrid{grid-template-columns:repeat(2,1fr)} .modal-box{max-height:95vh}
  .sec-head{flex-direction:column;align-items:flex-start}
  .pomo-main{grid-template-columns:1fr}
}
::-webkit-scrollbar{width:6px} ::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:3px}
.recharts-text{fill:rgba(255,255,255,0.5)!important}
.recharts-cartesian-grid line{stroke:rgba(255,255,255,0.04)!important}
`;
