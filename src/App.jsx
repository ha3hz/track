import { useState, useEffect, useMemo, useRef } from "react";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

/* ═══ SUPABASE ═══ */
const SB_URL = "https://jthfqynavqpzvkgwznzy.supabase.co";
const SB_KEY = "sb_publishable_uI_kw2bzlXrAG6qf6jgvkA_I8bjZsBL";
const SB_H = { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "Content-Type": "application/json", Prefer: "return=representation" };

function sb(table, method, body, query) {
  var url = SB_URL + "/rest/v1/" + table + (query ? "?" + query : "");
  var opts = { method: method || "GET", headers: Object.assign({}, SB_H) };
  if (body) opts.body = JSON.stringify(body);
  return fetch(url, opts).then(function(r) { return r.ok ? r.json().catch(function() { return true; }) : null; }).catch(function() { return null; });
}

/* ═══ HELPERS ═══ */
function gId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function today() { return new Date().toISOString().slice(0, 10); }
function pad(n) { return String(n).padStart(2, "0"); }
function now12() { var d = new Date(); var h = d.getHours(); var m = d.getMinutes(); var hh = h % 12 || 12; return pad(hh) + ":" + pad(m) + " " + (h < 12 ? "AM" : "PM"); }
function minStr(m) { if (!m || m <= 0) return "0د"; var h = Math.floor(m / 60); var mm = m % 60; if (!h) return mm + "د"; if (!mm) return h + "س"; return h + "س " + mm + "د"; }
function toMin(t) { if (!t) return 0; var p = t.match(/(\d+):(\d+)\s*(AM|PM)/i); if (!p) return 0; var h = parseInt(p[1]); var m = parseInt(p[2]); var a = p[3].toUpperCase(); if (a === "PM" && h !== 12) h += 12; if (a === "AM" && h === 12) h = 0; return h * 60 + m; }
function diffM(s, e) { var a = toMin(s), b = toMin(e); return b >= a ? b - a : (1440 - a) + b; }

/* ═══ TABLES ═══ */
var T_LOG = "perf_activities";
var T_POMO = "perf_pomodoro";
var T_TIMER = "perf_live_timer";

/* ═══ MAIN APP ═══ */
export default function App() {
  var [view, setView] = useState("pomo");
  var [logs, setLogs] = useState([]);
  var [pomos, setPomos] = useState([]);
  var [timer, setTimer] = useState({ timer_status: "idle", session_type: "focus", duration_seconds: 1500, started_at: null, paused_remaining: null, cycle_number: 1, session_in_cycle: 1 });
  var [secs, setSecs] = useState(1500);
  var [clock, setClock] = useState(now12());
  var [selDate, setSelDate] = useState(today());
  var [toast, setToast] = useState(null);
  var [loading, setLoading] = useState(true);
  var [showAdd, setShowAdd] = useState(false);
  var [showReview, setShowReview] = useState(false);
  var [repRange, setRepRange] = useState("day");

  // Pomo settings
  var [focusDur, setFocusDur] = useState(25);
  var [shortBrk, setShortBrk] = useState(5);
  var [longBrk, setLongBrk] = useState(15);
  var [brkAfter, setBrkAfter] = useState(4);

  // Review state
  var [rv, setRv] = useState({ accomplishment: "", focus: "متوسط", energy: "متوسطة", rating: 3, distracted: false, notes: "" });

  // Manual entry state
  var [manual, setManual] = useState({ name: "", category: "عمل", startTime: "", endTime: "", date: today(), notes: "" });

  var tickRef = useRef(null);

  // Toast
  function sToast(msg) { setToast(msg); setTimeout(function() { setToast(null); }, 2500); }

  // ─── LOAD DATA ───
  useEffect(function() {
    Promise.all([
      sb(T_LOG, "GET", null, "order=date.desc,start_time.asc&limit=5000"),
      sb(T_POMO, "GET", null, "order=date.desc,start_time.asc&limit=5000"),
      sb(T_TIMER, "GET", null, "id=eq.main"),
    ]).then(function(res) {
      if (res[0] && Array.isArray(res[0])) setLogs(res[0]);
      if (res[1] && Array.isArray(res[1])) setPomos(res[1]);
      if (res[2] && res[2].length > 0) setTimer(res[2][0]);
      setLoading(false);
    });
  }, []);

  // ─── CLOCK ───
  useEffect(function() { var t = setInterval(function() { setClock(now12()); }, 1000); return function() { clearInterval(t); }; }, []);

  // ─── POLLING SYNC (every 3s for timer, 8s for data) ───
  useEffect(function() {
    var t1 = setInterval(function() {
      sb(T_TIMER, "GET", null, "id=eq.main").then(function(r) {
        if (r && r.length > 0) setTimer(function(prev) {
          if (prev.timer_status !== r[0].timer_status || prev.started_at !== r[0].started_at || prev.paused_remaining !== r[0].paused_remaining) return r[0];
          return prev;
        });
      });
    }, 3000);
    var t2 = setInterval(function() {
      sb(T_LOG, "GET", null, "order=date.desc,start_time.asc&limit=5000").then(function(r) { if (r && Array.isArray(r)) setLogs(r); });
      sb(T_POMO, "GET", null, "order=date.desc,start_time.asc&limit=5000").then(function(r) { if (r && Array.isArray(r)) setPomos(r); });
    }, 8000);
    return function() { clearInterval(t1); clearInterval(t2); };
  }, []);

  // ─── TIMER TICK ───
  useEffect(function() {
    function calc() {
      if (timer.timer_status === "running" && timer.started_at) {
        var elapsed = Math.floor((Date.now() - new Date(timer.started_at).getTime()) / 1000);
        var rem = Math.max(0, timer.duration_seconds - elapsed);
        setSecs(rem);
        if (rem <= 0) onTimerDone();
      } else if (timer.timer_status === "paused" && timer.paused_remaining != null) {
        setSecs(timer.paused_remaining);
      } else if (timer.timer_status === "idle") {
        setSecs(timer.duration_seconds || focusDur * 60);
      } else if (timer.timer_status === "completed") {
        setSecs(0);
      }
    }
    calc();
    tickRef.current = setInterval(calc, 1000);
    return function() { clearInterval(tickRef.current); };
  }, [timer]);

  // ─── SHOW REVIEW ON COMPLETE ───
  useEffect(function() {
    if (timer.timer_status === "completed" && timer.session_type === "focus") {
      setShowReview(true);
      try { var ctx = new (window.AudioContext || window.webkitAudioContext)(); var o = ctx.createOscillator(); o.connect(ctx.destination); o.frequency.value = 800; o.start(); setTimeout(function() { o.stop(); }, 200); } catch (e) {}
    }
  }, [timer.timer_status]);

  // ─── TIMER CONTROLS ───
  function updateTimer(fields) {
    var updated = Object.assign({}, timer, fields, { updated_at: new Date().toISOString() });
    setTimer(updated);
    sb(T_TIMER, "PATCH", fields, "id=eq.main");
  }

  function onTimerDone() {
    if (timer.timer_status !== "running") return;
    updateTimer({ timer_status: "completed" });
  }

  function startFocus() {
    var startTime = now12();
    // AUTO-LOG: record session start immediately in timeline
    var logEntry = {
      id: gId(), name: "🎯 جلسة تركيز", description: "بومودورو", category: "work",
      start_time: startTime, end_time: startTime, date: today(), status: "in_progress",
      planned: true, useful: true, deep_focus: true, importance: "عالية",
      focus_level: "عال", quality_rating: 3, notes: "جلسة بومودورو جارية...",
    };
    setLogs(function(p) { return [logEntry].concat(p); });
    sb(T_LOG, "POST", logEntry);

    updateTimer({
      timer_status: "running", session_type: "focus", duration_seconds: focusDur * 60,
      started_at: new Date().toISOString(), paused_remaining: null,
    });
    setShowReview(false);
  }

  function startBreak(type) {
    var dur = type === "long_break" ? longBrk * 60 : shortBrk * 60;
    updateTimer({ timer_status: "running", session_type: type, duration_seconds: dur, started_at: new Date().toISOString(), paused_remaining: null });
  }

  function onStart() {
    if (timer.timer_status === "idle" || timer.timer_status === "completed") startFocus();
    else if (timer.timer_status === "paused") {
      var rem = timer.paused_remaining || secs;
      updateTimer({ timer_status: "running", started_at: new Date(Date.now() - (timer.duration_seconds - rem) * 1000).toISOString(), paused_remaining: null });
    }
  }
  function onPause() { updateTimer({ timer_status: "paused", paused_remaining: secs }); }
  function onStop() { updateTimer({ timer_status: "idle", session_type: "focus", duration_seconds: focusDur * 60, started_at: null, paused_remaining: null }); }
  function onReset() { updateTimer({ timer_status: "idle", session_type: "focus", duration_seconds: focusDur * 60, started_at: null, paused_remaining: null, cycle_number: 1, session_in_cycle: 1 }); }

  function saveReview() {
    var endTime = now12();
    var startTime = timer.started_at ? (function() { var d = new Date(timer.started_at); var h = d.getHours(); var m = d.getMinutes(); var hh = h % 12 || 12; return pad(hh) + ":" + pad(m) + " " + (h < 12 ? "AM" : "PM"); })() : endTime;

    // Save pomo record
    var pomo = {
      id: gId(), session_type: "focus", date: today(), start_time: startTime, end_time: endTime,
      duration: focusDur, completed: true, accomplishment: rv.accomplishment,
      focus_level: rv.focus, energy_level: rv.energy, rating: rv.rating,
      was_distracted: rv.distracted, notes: rv.notes, was_deep: rv.focus === "عال",
      cycle_number: timer.cycle_number || 1, session_in_cycle: timer.session_in_cycle || 1,
    };
    setPomos(function(p) { return [pomo].concat(p); });
    sb(T_POMO, "POST", pomo);

    // Update the auto-logged timeline entry with end time
    var recentLog = logs.find(function(l) { return l.status === "in_progress" && l.name === "🎯 جلسة تركيز" && l.date === today(); });
    if (recentLog) {
      var updatedLog = Object.assign({}, recentLog, { end_time: endTime, status: "done", notes: rv.accomplishment || "جلسة مكتملة", quality_rating: rv.rating });
      setLogs(function(p) { return p.map(function(l) { return l.id === recentLog.id ? updatedLog : l; }); });
      sb(T_LOG, "PATCH", updatedLog, "id=eq." + recentLog.id);
    }

    // Advance cycle
    var sic = timer.session_in_cycle || 1;
    var cn = timer.cycle_number || 1;
    if (sic >= brkAfter) { updateTimer({ cycle_number: cn + 1, session_in_cycle: 1 }); startBreak("long_break"); }
    else { updateTimer({ session_in_cycle: sic + 1 }); startBreak("short_break"); }

    setShowReview(false);
    setRv({ accomplishment: "", focus: "متوسط", energy: "متوسطة", rating: 3, distracted: false, notes: "" });
    sToast("تم حفظ الجلسة ✅");
  }

  function skipReview() {
    var endTime = now12();
    var recentLog = logs.find(function(l) { return l.status === "in_progress" && l.name === "🎯 جلسة تركيز" && l.date === today(); });
    if (recentLog) {
      var updated = Object.assign({}, recentLog, { end_time: endTime, status: "done", notes: "مكتملة" });
      setLogs(function(p) { return p.map(function(l) { return l.id === recentLog.id ? updated : l; }); });
      sb(T_LOG, "PATCH", updated, "id=eq." + recentLog.id);
    }
    setShowReview(false);
    onStop();
    sToast("تم ✅");
  }

  // ─── MANUAL ENTRY ───
  function saveManual() {
    if (!manual.name || !manual.startTime || !manual.endTime) return;
    var entry = {
      id: gId(), name: manual.name, description: "", category: manual.category || "work",
      start_time: manual.startTime, end_time: manual.endTime, date: manual.date || today(),
      status: "done", planned: true, useful: true, notes: manual.notes || "",
      importance: "متوسطة", focus_level: "متوسط", quality_rating: 3,
    };
    setLogs(function(p) { return [entry].concat(p); });
    sb(T_LOG, "POST", entry);
    setManual({ name: "", category: "عمل", startTime: "", endTime: "", date: today(), notes: "" });
    setShowAdd(false);
    sToast("تم الإضافة ✅");
  }

  function deleteLog(id) {
    setLogs(function(p) { return p.filter(function(l) { return l.id !== id; }); });
    sb(T_LOG, "DELETE", null, "id=eq." + id);
    sToast("تم الحذف 🗑️");
  }

  // ─── DERIVED DATA ───
  var todayLogs = useMemo(function() { return logs.filter(function(l) { return l.date === selDate; }); }, [logs, selDate]);
  var todayPomos = useMemo(function() { return pomos.filter(function(p) { return p.date === selDate; }); }, [pomos, selDate]);

  var totalMin = useMemo(function() { return todayLogs.reduce(function(s, l) { return s + diffM(l.start_time || "", l.end_time || ""); }, 0); }, [todayLogs]);
  var focusMin = useMemo(function() { return todayPomos.filter(function(p) { return p.completed; }).reduce(function(s, p) { return s + (p.duration || 0); }, 0); }, [todayPomos]);
  var completedPomos = useMemo(function() { return todayPomos.filter(function(p) { return p.session_type === "focus" && p.completed; }).length; }, [todayPomos]);

  // Reports data
  var reportLogs = useMemo(function() {
    var now = new Date();
    var startDate;
    if (repRange === "day") startDate = selDate;
    else if (repRange === "week") { var d = new Date(); d.setDate(d.getDate() - 7); startDate = d.toISOString().slice(0, 10); }
    else if (repRange === "month") { var d2 = new Date(); d2.setMonth(d2.getMonth() - 1); startDate = d2.toISOString().slice(0, 10); }
    else { var d3 = new Date(); d3.setFullYear(d3.getFullYear() - 1); startDate = d3.toISOString().slice(0, 10); }
    return logs.filter(function(l) { return l.date >= startDate; });
  }, [logs, repRange, selDate]);

  var reportPomos = useMemo(function() {
    var now = new Date();
    var startDate;
    if (repRange === "day") startDate = selDate;
    else if (repRange === "week") { var d = new Date(); d.setDate(d.getDate() - 7); startDate = d.toISOString().slice(0, 10); }
    else if (repRange === "month") { var d2 = new Date(); d2.setMonth(d2.getMonth() - 1); startDate = d2.toISOString().slice(0, 10); }
    else { var d3 = new Date(); d3.setFullYear(d3.getFullYear() - 1); startDate = d3.toISOString().slice(0, 10); }
    return pomos.filter(function(p) { return p.date >= startDate; });
  }, [pomos, repRange, selDate]);

  // Timer display
  var st = timer.timer_status;
  var minutes = Math.floor(secs / 60);
  var seconds = secs % 60;
  var totalSecs = timer.duration_seconds || focusDur * 60;
  var progress = totalSecs > 0 ? ((totalSecs - secs) / totalSecs) * 100 : 0;
  var timerColor = timer.session_type === "focus" ? "#ef4444" : timer.session_type === "short_break" ? "#10b981" : "#a78bfa";
  var timerLabel = timer.session_type === "focus" ? "🎯 تركيز" : timer.session_type === "short_break" ? "☕ بريك" : "🌴 بريك طويل";

  var ringSize = 240;
  var ringR = (ringSize - 16) / 2;
  var ringC = 2 * Math.PI * ringR;

  // Chart data for reports
  var catData = useMemo(function() {
    var cats = {};
    reportLogs.forEach(function(l) {
      var cat = l.category || "أخرى";
      var dur = diffM(l.start_time || "", l.end_time || "");
      cats[cat] = (cats[cat] || 0) + dur;
    });
    var colors = { work: "#3b82f6", "عمل": "#3b82f6", study: "#a78bfa", project: "#10b981", rest: "#94a3b8", entertainment: "#f472b6" };
    return Object.entries(cats).map(function(e) { return { name: e[0], value: e[1], color: colors[e[0]] || "#64748b" }; }).sort(function(a, b) { return b.value - a.value; });
  }, [reportLogs]);

  var dailyData = useMemo(function() {
    var days = {};
    reportLogs.forEach(function(l) {
      days[l.date] = (days[l.date] || 0) + diffM(l.start_time || "", l.end_time || "");
    });
    return Object.entries(days).sort(function(a, b) { return a[0].localeCompare(b[0]); }).slice(-14).map(function(e) { return { d: e[0].slice(5), v: e[1] }; });
  }, [reportLogs]);

  var ttStyle = { background: "rgba(10,12,20,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, direction: "rtl" };

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0c14", color: "#e0e0e8", fontFamily: "Segoe UI, Tahoma, sans-serif" }}>
      <div style={{ width: 50, height: 50, border: "3px solid rgba(255,255,255,0.06)", borderTopColor: "#3b82f6", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
      <style>{CSS}</style>
    </div>
  );

  return (
    <div className="root" dir="rtl">
      {/* ═══ HEADER ═══ */}
      <header className="hdr">
        <div className="hdr-in">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: "1.4rem" }}>⚡</span>
            <span style={{ fontWeight: 800, fontSize: "1.1rem" }}>مركز تحليل الأداء</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="clock-display">{clock}</span>
            <input type="date" className="inp" value={selDate} onChange={function(e) { setSelDate(e.target.value); }} style={{ width: 140 }} />
          </div>
        </div>
      </header>

      {/* ═══ NAV — 3 BOXES ═══ */}
      <div className="nav-grid">
        {[
          { id: "pomo", icon: "🍅", label: "البومودورو", sub: completedPomos + " جلسات • " + minStr(focusMin) },
          { id: "log", icon: "📋", label: "السجل الزمني", sub: todayLogs.length + " نشاط • " + minStr(totalMin) },
          { id: "rep", icon: "📊", label: "التقارير", sub: "يومي • أسبوعي • شهري • سنوي" },
        ].map(function(n) {
          return (
            <button key={n.id} className={"nav-box" + (view === n.id ? " active" : "")} onClick={function() { setView(n.id); }}>
              <span style={{ fontSize: "2rem" }}>{n.icon}</span>
              <span style={{ fontWeight: 700, fontSize: "1rem" }}>{n.label}</span>
              <span style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.4)" }}>{n.sub}</span>
            </button>
          );
        })}
      </div>

      {/* ═══ CONTENT ═══ */}
      <main className="main">

        {/* ────── POMODORO ────── */}
        {view === "pomo" && (
          <div className="fade-in">
            {st === "running" && (
              <div className="live-bar" style={{ borderColor: timerColor + "40", background: timerColor + "10" }}>
                <div className="live-dot" style={{ background: timerColor }} />
                <span style={{ color: timerColor, fontWeight: 700 }}>{timerLabel} شغالة — متزامنة لكل الأجهزة</span>
              </div>
            )}

            <div className="pomo-layout">
              {/* Timer */}
              <div className="pomo-timer">
                <svg width={ringSize} height={ringSize} style={{ transform: "rotate(-90deg)" }}>
                  <circle cx={ringSize / 2} cy={ringSize / 2} r={ringR} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                  <circle cx={ringSize / 2} cy={ringSize / 2} r={ringR} fill="none" stroke={timerColor} strokeWidth="8"
                    strokeDasharray={ringC} strokeDashoffset={ringC - (progress / 100) * ringC} strokeLinecap="round"
                    style={{ transition: "stroke-dashoffset 0.8s linear" }} />
                </svg>
                <div className="pomo-center">
                  <div style={{ fontSize: "3.2rem", fontWeight: 900, fontFamily: "monospace", color: timerColor }}>{pad(minutes)}:{pad(seconds)}</div>
                  <div style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.5)", marginTop: 4 }}>{timerLabel}</div>
                  <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.3)" }}>الدورة {timer.cycle_number || 1} • {timer.session_in_cycle || 1}/{brkAfter}</div>
                  {st === "paused" && <div style={{ color: "#fbbf24", fontWeight: 700, marginTop: 4 }}>⏸ متوقف</div>}
                </div>
              </div>

              {/* Controls */}
              <div className="pomo-btns">
                {st === "idle" && <button className="btn-main" onClick={onStart}>▶ ابدأ التركيز</button>}
                {st === "running" && <button className="btn-sec" onClick={onPause}>⏸ إيقاف مؤقت</button>}
                {st === "paused" && <button className="btn-main" onClick={onStart}>▶ استئناف</button>}
                {st === "paused" && <button className="btn-danger" onClick={onStop}>⏹ إنهاء</button>}
                {st === "completed" && timer.session_type !== "focus" && <button className="btn-main" onClick={startFocus}>▶ جلسة جديدة</button>}
                {st !== "idle" && <button className="btn-sec" onClick={onReset}>🔄</button>}
              </div>

              {/* Quick Stats */}
              <div className="pomo-quick">
                <div className="qs"><span className="qs-v" style={{ color: "#10b981" }}>{completedPomos}</span><span className="qs-l">مكتملة</span></div>
                <div className="qs"><span className="qs-v" style={{ color: "#3b82f6" }}>{minStr(focusMin)}</span><span className="qs-l">وقت التركيز</span></div>
                <div className="qs"><span className="qs-v" style={{ color: "#fbbf24" }}>{todayLogs.length}</span><span className="qs-l">أنشطة اليوم</span></div>
                <div className="qs"><span className="qs-v" style={{ color: "#a78bfa" }}>{minStr(totalMin)}</span><span className="qs-l">إجمالي مسجل</span></div>
              </div>

              {/* Pomo Settings */}
              <details className="settings-details">
                <summary>⚙️ إعدادات المؤقت</summary>
                <div className="settings-grid">
                  <div><label className="lbl">تركيز (د)</label><input type="number" className="inp" value={focusDur} onChange={function(e) { setFocusDur(parseInt(e.target.value) || 25); }} /></div>
                  <div><label className="lbl">بريك قصير (د)</label><input type="number" className="inp" value={shortBrk} onChange={function(e) { setShortBrk(parseInt(e.target.value) || 5); }} /></div>
                  <div><label className="lbl">بريك طويل (د)</label><input type="number" className="inp" value={longBrk} onChange={function(e) { setLongBrk(parseInt(e.target.value) || 15); }} /></div>
                  <div><label className="lbl">جلسات قبل البريك الطويل</label><input type="number" className="inp" value={brkAfter} onChange={function(e) { setBrkAfter(parseInt(e.target.value) || 4); }} /></div>
                </div>
              </details>
            </div>
          </div>
        )}

        {/* ────── TIMELINE ────── */}
        {view === "log" && (
          <div className="fade-in">
            <div className="sec-bar">
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800 }}>📋 السجل الزمني — {selDate}</h2>
              <button className="btn-main" onClick={function() { setShowAdd(true); }}>+ إضافة يدوية</button>
            </div>

            {todayLogs.length === 0 && <div className="empty-state">📭 لا توجد أنشطة مسجلة</div>}

            {todayLogs.sort(function(a, b) { return toMin(b.start_time || "") - toMin(a.start_time || ""); }).map(function(l) {
              var dur = diffM(l.start_time || "", l.end_time || "");
              var isActive = l.status === "in_progress";
              return (
                <div key={l.id} className={"log-card" + (isActive ? " active-log" : "")}>
                  <div className="log-top">
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{l.name || "بدون اسم"}</div>
                      <div style={{ fontSize: "0.78rem", color: "rgba(255,255,255,0.4)", fontFamily: "monospace", marginTop: 4 }}>
                        {l.start_time || "?"} → {l.end_time || "?"} <span style={{ color: "#3b82f6", fontWeight: 700 }}>{minStr(dur)}</span>
                        {isActive && <span style={{ color: "#10b981", marginRight: 8 }}>● جارية</span>}
                      </div>
                      {l.notes && <div style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.3)", marginTop: 2 }}>{l.notes}</div>}
                    </div>
                    <button className="del-btn" onClick={function() { if (confirm("حذف؟")) deleteLog(l.id); }}>🗑️</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ────── REPORTS ────── */}
        {view === "rep" && (
          <div className="fade-in">
            <div className="sec-bar">
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800 }}>📊 التقارير</h2>
              <div style={{ display: "flex", gap: 6 }}>
                {[["day", "يومي"], ["week", "أسبوعي"], ["month", "شهري"], ["year", "سنوي"]].map(function(r) {
                  return <button key={r[0]} className={"btn-tab" + (repRange === r[0] ? " tab-active" : "")} onClick={function() { setRepRange(r[0]); }}>{r[1]}</button>;
                })}
              </div>
            </div>

            {/* Summary KPIs */}
            <div className="kpi-grid">
              <div className="kpi"><span className="kpi-v" style={{ color: "#3b82f6" }}>{reportLogs.length}</span><span className="kpi-l">أنشطة</span></div>
              <div className="kpi"><span className="kpi-v" style={{ color: "#10b981" }}>{minStr(reportLogs.reduce(function(s, l) { return s + diffM(l.start_time || "", l.end_time || ""); }, 0))}</span><span className="kpi-l">وقت مسجل</span></div>
              <div className="kpi"><span className="kpi-v" style={{ color: "#ef4444" }}>{reportPomos.filter(function(p) { return p.completed && p.session_type === "focus"; }).length}</span><span className="kpi-l">جلسات بومودورو</span></div>
              <div className="kpi"><span className="kpi-v" style={{ color: "#fbbf24" }}>{minStr(reportPomos.filter(function(p) { return p.completed; }).reduce(function(s, p) { return s + (p.duration || 0); }, 0))}</span><span className="kpi-l">وقت تركيز</span></div>
              <div className="kpi"><span className="kpi-v" style={{ color: "#a78bfa" }}>
                {reportPomos.length > 0 ? (reportPomos.reduce(function(s, p) { return s + (p.rating || 3); }, 0) / reportPomos.length).toFixed(1) : "—"}
              </span><span className="kpi-l">متوسط التقييم</span></div>
              <div className="kpi"><span className="kpi-v" style={{ color: "#f472b6" }}>
                {(function() { var f = reportPomos.filter(function(p) { return p.session_type === "focus"; }); var c = f.filter(function(p) { return p.completed; }); return f.length > 0 ? Math.round(c.length / f.length * 100) + "%" : "—"; })()}
              </span><span className="kpi-l">نسبة النجاح</span></div>
            </div>

            {/* Charts */}
            {catData.length > 0 && (
              <div className="chart-box">
                <h3 style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: 12 }}>توزيع الوقت حسب الفئة</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={catData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={100} paddingAngle={3} strokeWidth={0}>
                      {catData.map(function(d, i) { return <Cell key={i} fill={d.color} />; })}
                    </Pie>
                    <Tooltip formatter={function(v) { return minStr(v); }} contentStyle={ttStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 8 }}>
                  {catData.map(function(d) {
                    return <span key={d.name} style={{ fontSize: "0.75rem", display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: d.color, display: "inline-block" }} />{d.name} {minStr(d.value)}</span>;
                  })}
                </div>
              </div>
            )}

            {dailyData.length > 1 && (
              <div className="chart-box">
                <h3 style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: 12 }}>الوقت المسجل يوميًا</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="d" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} />
                    <YAxis tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} />
                    <Tooltip contentStyle={ttStyle} formatter={function(v) { return minStr(v); }} />
                    <Bar dataKey="v" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {reportLogs.length === 0 && <div className="empty-state">📭 لا توجد بيانات في هذه الفترة</div>}
          </div>
        )}
      </main>

      {/* ═══ MANUAL ADD MODAL ═══ */}
      {showAdd && (
        <div className="modal-bg" onClick={function() { setShowAdd(false); }}>
          <div className="modal-box" onClick={function(e) { e.stopPropagation(); }}>
            <div className="modal-head"><h2>+ إضافة يدوية</h2><button className="modal-x" onClick={function() { setShowAdd(false); }}>✕</button></div>
            <div className="modal-body">
              <label className="lbl">اسم النشاط *</label>
              <input className="inp full" value={manual.name} onChange={function(e) { setManual(Object.assign({}, manual, { name: e.target.value })); }} placeholder="مثال: مراجعة الدرس" />
              <div className="row-2">
                <div><label className="lbl">البداية *</label><input className="inp full" value={manual.startTime} onChange={function(e) { setManual(Object.assign({}, manual, { startTime: e.target.value })); }} placeholder="09:30 AM" /></div>
                <div><label className="lbl">النهاية *</label><input className="inp full" value={manual.endTime} onChange={function(e) { setManual(Object.assign({}, manual, { endTime: e.target.value })); }} placeholder="10:15 AM" /></div>
              </div>
              <label className="lbl">التاريخ</label>
              <input type="date" className="inp full" value={manual.date} onChange={function(e) { setManual(Object.assign({}, manual, { date: e.target.value })); }} />
              <label className="lbl">الفئة</label>
              <select className="inp full" value={manual.category} onChange={function(e) { setManual(Object.assign({}, manual, { category: e.target.value })); }}>
                <option value="عمل">💼 عمل</option><option value="دراسة">📚 دراسة</option><option value="مشروع">🚀 مشروع</option>
                <option value="رياضة">🏃 رياضة</option><option value="قراءة">📖 قراءة</option><option value="راحة">😴 راحة</option>
                <option value="ترفيه">🎮 ترفيه</option><option value="أخرى">📌 أخرى</option>
              </select>
              <label className="lbl">ملاحظات</label>
              <textarea className="inp full" rows={2} value={manual.notes} onChange={function(e) { setManual(Object.assign({}, manual, { notes: e.target.value })); }} />
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
                <button className="btn-sec" onClick={function() { setShowAdd(false); }}>إلغاء</button>
                <button className="btn-main" onClick={saveManual} disabled={!manual.name || !manual.startTime || !manual.endTime}>💾 حفظ</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ REVIEW MODAL ═══ */}
      {showReview && (
        <div className="modal-bg">
          <div className="modal-box">
            <div className="modal-head"><h2>🎯 تقييم الجلسة</h2></div>
            <div className="modal-body">
              <label className="lbl">ماذا أنجزت؟</label>
              <input className="inp full" value={rv.accomplishment} onChange={function(e) { setRv(Object.assign({}, rv, { accomplishment: e.target.value })); }} placeholder="مثال: أنهيت مراجعة الفصل" />
              <div className="row-2">
                <div><label className="lbl">التركيز</label>
                  <select className="inp full" value={rv.focus} onChange={function(e) { setRv(Object.assign({}, rv, { focus: e.target.value })); }}>
                    <option value="عال">عال</option><option value="متوسط">متوسط</option><option value="منخفض">منخفض</option>
                  </select></div>
                <div><label className="lbl">الطاقة</label>
                  <select className="inp full" value={rv.energy} onChange={function(e) { setRv(Object.assign({}, rv, { energy: e.target.value })); }}>
                    <option value="عالية">عالية</option><option value="متوسطة">متوسطة</option><option value="منخفضة">منخفضة</option>
                  </select></div>
              </div>
              <label className="lbl">تقييم الجلسة</label>
              <div style={{ display: "flex", gap: 6 }}>
                {[1, 2, 3, 4, 5].map(function(i) {
                  return <button key={i} onClick={function() { setRv(Object.assign({}, rv, { rating: i })); }}
                    style={{ fontSize: "1.3rem", background: "none", border: "none", cursor: "pointer", color: i <= rv.rating ? "#fbbf24" : "rgba(255,255,255,0.15)" }}>★</button>;
                })}
              </div>
              <label className="lbl">ملاحظات</label>
              <textarea className="inp full" rows={2} value={rv.notes} onChange={function(e) { setRv(Object.assign({}, rv, { notes: e.target.value })); }} />
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
                <button className="btn-sec" onClick={skipReview}>تخطي</button>
                <button className="btn-main" onClick={saveReview}>💾 حفظ وابدأ البريك</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
      <style>{CSS}</style>
    </div>
  );
}

var CSS = `
*{box-sizing:border-box;margin:0;padding:0}
.root{min-height:100vh;background:#0a0c14;color:#e0e0e8;font-family:'Segoe UI',Tahoma,sans-serif;direction:rtl}
.hdr{position:sticky;top:0;z-index:50;background:rgba(10,12,20,0.92);border-bottom:1px solid rgba(255,255,255,0.06);backdrop-filter:blur(10px)}
.hdr-in{max-width:900px;margin:0 auto;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}
.clock-display{font-family:monospace;font-size:0.95rem;font-weight:700;color:#3b82f6;background:rgba(59,130,246,0.08);padding:6px 14px;border-radius:10px}
.nav-grid{max-width:900px;margin:16px auto 0;padding:0 20px;display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.nav-box{display:flex;flex-direction:column;align-items:center;gap:6px;padding:20px 12px;border-radius:16px;border:1px solid rgba(255,255,255,0.06);background:rgba(255,255,255,0.02);cursor:pointer;transition:border-color 0.15s,transform 0.15s;font-family:inherit;color:inherit}
.nav-box:hover{border-color:rgba(255,255,255,0.12);transform:translateY(-2px)}
.nav-box.active{border-color:rgba(59,130,246,0.4);background:rgba(59,130,246,0.06)}
.main{max-width:900px;margin:0 auto;padding:20px}
.fade-in{animation:fadeUp 0.3s ease}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes spin{to{transform:rotate(360deg)}}
.pomo-layout{display:flex;flex-direction:column;align-items:center;gap:20px}
.pomo-timer{position:relative;width:240px;height:240px}
.pomo-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.pomo-btns{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
.pomo-quick{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;width:100%}
.qs{display:flex;flex-direction:column;align-items:center;gap:4px;padding:14px 8px;background:rgba(255,255,255,0.02);border-radius:12px;border:1px solid rgba(255,255,255,0.06)}
.qs-v{font-size:1.2rem;font-weight:800;font-family:monospace}
.qs-l{font-size:0.65rem;color:rgba(255,255,255,0.4)}
.settings-details{width:100%;margin-top:8px}
.settings-details summary{cursor:pointer;font-size:0.85rem;color:rgba(255,255,255,0.5);padding:8px 0}
.settings-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;padding:12px 0}
.sec-bar{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px}
.log-card{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:14px;margin-bottom:10px;transition:border-color 0.15s}
.log-card:hover{border-color:rgba(255,255,255,0.12)}
.log-card.active-log{border-color:rgba(16,185,129,0.3);background:rgba(16,185,129,0.04)}
.log-top{display:flex;align-items:flex-start;gap:10px}
.del-btn{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:4px 8px;cursor:pointer;font-size:0.8rem;transition:background 0.15s}
.del-btn:hover{background:rgba(239,68,68,0.1)}
.empty-state{text-align:center;padding:60px 20px;color:rgba(255,255,255,0.3);font-size:0.95rem}
.live-bar{display:flex;align-items:center;justify-content:center;gap:8px;padding:10px 16px;border-radius:12px;border:1px solid;margin-bottom:16px;font-size:0.82rem}
.live-dot{width:8px;height:8px;border-radius:50%;animation:pulse 1.5s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
.kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px}
.kpi{display:flex;flex-direction:column;align-items:center;gap:4px;padding:16px 10px;background:rgba(255,255,255,0.02);border-radius:14px;border:1px solid rgba(255,255,255,0.06)}
.kpi-v{font-size:1.3rem;font-weight:800;font-family:monospace}
.kpi-l{font-size:0.68rem;color:rgba(255,255,255,0.4)}
.chart-box{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:20px;margin-bottom:16px}
.btn-tab{padding:6px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.06);background:transparent;color:rgba(255,255,255,0.5);cursor:pointer;font-size:0.8rem;font-family:inherit;transition:background 0.15s}
.btn-tab.tab-active{background:rgba(59,130,246,0.12);color:#3b82f6;border-color:rgba(59,130,246,0.3)}
.btn-main{padding:10px 22px;border-radius:12px;border:none;background:#3b82f6;color:white;font-weight:700;cursor:pointer;font-size:0.88rem;font-family:inherit;transition:transform 0.12s}
.btn-main:hover{transform:translateY(-1px)}
.btn-main:disabled{opacity:0.3;cursor:not-allowed;transform:none}
.btn-sec{padding:9px 18px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);background:transparent;color:#e0e0e8;cursor:pointer;font-size:0.85rem;font-family:inherit}
.btn-danger{padding:9px 18px;border-radius:12px;border:1px solid rgba(239,68,68,0.3);background:transparent;color:#ef4444;cursor:pointer;font-size:0.85rem;font-family:inherit}
.modal-bg{position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(6px);z-index:100;display:flex;align-items:center;justify-content:center;padding:16px}
.modal-box{background:#0d0f18;border:1px solid rgba(255,255,255,0.08);border-radius:20px;width:100%;max-width:500px;max-height:90vh;overflow:hidden;display:flex;flex-direction:column;animation:mUp 0.25s ease}
@keyframes mUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
.modal-head{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.06)}
.modal-head h2{font-size:1rem;font-weight:700}
.modal-x{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.06);border-radius:8px;width:32px;height:32px;cursor:pointer;color:#e0e0e8;display:flex;align-items:center;justify-content:center}
.modal-body{padding:20px;overflow-y:auto;display:flex;flex-direction:column;gap:10px}
.lbl{font-size:0.7rem;color:rgba(255,255,255,0.4);margin-bottom:2px;display:block}
.inp{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:9px 12px;color:#e0e0e8;font-size:0.88rem;font-family:inherit;transition:border-color 0.15s}
.inp:focus{outline:none;border-color:#3b82f6}
.inp.full{width:100%}
textarea.inp{resize:vertical}
.row-2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:12px 24px;border-radius:12px;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.3);color:#10b981;font-weight:600;font-size:0.88rem;z-index:200;animation:toastIn 0.3s ease}
@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(12px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
@media(max-width:640px){
  .nav-grid{grid-template-columns:1fr}
  .pomo-quick{grid-template-columns:repeat(2,1fr)}
  .kpi-grid{grid-template-columns:repeat(2,1fr)}
  .row-2{grid-template-columns:1fr}
  .sec-bar{flex-direction:column;align-items:flex-start}
}
::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.06);border-radius:3px}
.recharts-text{fill:rgba(255,255,255,0.4)!important}
`;
