import { useState, useRef, useMemo, useCallback } from "react";
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer } from "recharts";
import { toPng } from "html-to-image";
import { parseCSV, loadHistory, clearHistory } from "./parser.js";

// ═══════════════════════════════════════════════════════════════════════════════
//  CONSTANTS  — card is 540×960 CSS px → exported at pixelRatio:2 → 1080×1920
// ═══════════════════════════════════════════════════════════════════════════════
const CARD_W = 540;
const CARD_H = 960;

// ═══════════════════════════════════════════════════════════════════════════════
//  DATA & SCORING
// ═══════════════════════════════════════════════════════════════════════════════
const METRICS = [
  { key:"hrv",      label:"HRV",      icon:"◈", unit:"ms",  rawMin:0,  rawMax:150, rawDefault:65,   rawStep:1,
    toRadar:(v)=>Math.min(100,Math.max(0,Math.round((v/150)*100))) },
  { key:"recovery", label:"RECOVERY", icon:"⟳", unit:"%",   rawMin:0,  rawMax:100, rawDefault:81,   rawStep:1,
    toRadar:(v)=>Math.min(100,Math.max(0,Math.round(v))) },
  { key:"sleep",    label:"SLEEP",    icon:"◐", unit:"%",   rawMin:0,  rawMax:100, rawDefault:74,   rawStep:1,
    toRadar:(v)=>Math.min(100,Math.max(0,Math.round(v))) },
  { key:"strain",   label:"STRAIN",   icon:"◉", unit:"",    rawMin:0,  rawMax:21,  rawDefault:12.0, rawStep:0.1,
    toRadar:(v)=>Math.min(100,Math.max(0,Math.round((v/21)*100))) },
  { key:"rhr",      label:"RHR",      icon:"♥", unit:"bpm", rawMin:35, rawMax:100, rawDefault:52,   rawStep:1,
    toRadar:(v)=>Math.min(100,Math.max(0,Math.round(((100-v)/65)*100))) },
];

const DEFAULT_RAW = Object.fromEntries(METRICS.map(m=>[m.key, m.rawDefault]));

const getBioScore = (raw) => {
  const hrv_n = METRICS[0].toRadar(raw.hrv);
  const rhr_n = METRICS[4].toRadar(raw.rhr);
  const rec   = Math.min(100, Math.max(0, raw.recovery));
  const slp   = Math.min(100, Math.max(0, raw.sleep));
  return Math.round(hrv_n*0.25 + slp*0.25 + rec*0.30 + rhr_n*0.20);
};

const getGrade = (s) =>
  s >= 75 ? { label:"OPTIMAL",  color:"#00D97E" } :
  s >= 50 ? { label:"BALANCED", color:"#F5A623" } :
            { label:"FATIGUED", color:"#E8003D" };

const effRatio = (raw) => {
  if (!raw.recovery) return { value:"—", label:"—" };
  const v = raw.strain / Math.max(1, raw.recovery);
  return {
    value: v.toFixed(2),
    label: v<0.12?"UNDERTRAINED":v<0.20?"EFFICIENT":v<0.30?"LOADED":"OVERREACHED",
  };
};

const BRAND   = "BIORADAR.IO";
const AUTH_ID = "AUTH-" + Math.random().toString(36).slice(2,6).toUpperCase();
const TODAY   = new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}).toUpperCase();

// ═══════════════════════════════════════════════════════════════════════════════
//  SHARED — Metric bar row used by several themes
// ═══════════════════════════════════════════════════════════════════════════════
function MetricRow({ m, raw, accentColor, textColor, subColor, borderColor }) {
  const pct = m.toRadar(raw[m.key]);
  const val = m.key==="strain" ? Number(raw[m.key]).toFixed(1) : raw[m.key];
  return (
    <div style={{ display:"flex",alignItems:"center",gap:12,padding:"10px 0",
      borderBottom:`1px solid ${borderColor}` }}>
      <span style={{ fontSize:11,color:accentColor,width:16,flexShrink:0 }}>{m.icon}</span>
      <span style={{ fontSize:10,letterSpacing:2,color:subColor,width:72,flexShrink:0,fontFamily:"'Roboto Mono',monospace" }}>
        {m.label}
      </span>
      <div style={{ flex:1,height:2,background:`${accentColor}18`,borderRadius:1 }}>
        <div style={{ width:`${pct}%`,height:"100%",background:accentColor,borderRadius:1,
          opacity: m.key==="rhr" ? (100-pct)/100+0.3 : pct/100+0.2 }}/>
      </div>
      <span style={{ fontSize:14,fontWeight:700,color:textColor,
        fontFamily:"'Oswald',sans-serif",width:52,textAlign:"right",flexShrink:0 }}>
        {val}<span style={{ fontSize:9,fontWeight:400,color:subColor,marginLeft:2 }}>{m.unit}</span>
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  A · VOGUE   White × Black × Magenta  —  Authority
//  Layout: Masthead → giant score (left-align) → full-width radar → metrics table → footer
// ═══════════════════════════════════════════════════════════════════════════════
function CardA({ radarData, rawValues, score, grade, nick, age, isVerified, cardRef }) {
  const MAG = "#E8005A";
  const eff = effRatio(rawValues);
  const Dot = ({ cx, cy }) => (
    <g>
      <circle cx={cx} cy={cy} r={7} fill="#fff" stroke="#111" strokeWidth={2}/>
      <circle cx={cx} cy={cy} r={3} fill={MAG}/>
    </g>
  );
  return (
    <div ref={cardRef} style={{ width:CARD_W, height:CARD_H, flexShrink:0, overflow:"hidden",
      background:"#FFFFFF", fontFamily:"Georgia,'Times New Roman',serif",
      display:"flex", flexDirection:"column" }}>

      {/* ── TOP: Black masthead ── */}
      <div style={{ background:"#0D0D0D", padding:"24px 28px 20px", flexShrink:0 }}>
        <div style={{ fontSize:8,letterSpacing:6,color:"rgba(255,255,255,0.38)",
          fontFamily:"'Roboto Mono',monospace",fontStyle:"normal",marginBottom:6 }}>
          BIO-PERFORMANCE REPORT
        </div>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-end" }}>
          <div style={{ fontSize:nick?22:15,letterSpacing:2,color:"#fff",fontStyle:"italic" }}>
            {nick||"Performance Report"}
            {age && <span style={{ fontSize:12,color:"rgba(255,255,255,0.4)",marginLeft:8 }}>{age}</span>}
          </div>
          {isVerified && (
            <div style={{ display:"inline-flex",alignItems:"center",gap:5,
              padding:"4px 10px",background:`${MAG}28`,border:`1px solid ${MAG}`,borderRadius:2 }}>
              <span style={{ fontSize:7,letterSpacing:2,color:"#fff",
                fontFamily:"'Roboto Mono',monospace",fontWeight:700 }}>◈ VERIFIED DATA</span>
            </div>
          )}
        </div>
      </div>

      {/* Magenta rule */}
      <div style={{ height:4, background:MAG, flexShrink:0 }}/>

      {/* ── SCORE BLOCK ── */}
      <div style={{ padding:"28px 28px 0", flexShrink:0 }}>
        <div style={{ fontSize:9,letterSpacing:4,color:"#bbb",marginBottom:6,
          fontFamily:"'Roboto Mono',monospace",fontStyle:"normal" }}>PERFORMANCE INDEX</div>
        <div style={{ display:"flex",alignItems:"flex-end",gap:20 }}>
          <div style={{ fontSize:110,fontWeight:400,lineHeight:0.85,fontStyle:"italic",
            color:"#0D0D0D",letterSpacing:-6 }}>{score}</div>
          <div style={{ paddingBottom:8 }}>
            <div style={{ fontSize:13,letterSpacing:4,color:MAG,
              fontFamily:"'Roboto Mono',monospace",fontStyle:"normal",fontWeight:700 }}>
              {grade.label}
            </div>
            <div style={{ marginTop:6,width:36,height:3,background:MAG }}/>
            <div style={{ marginTop:10,fontSize:9,letterSpacing:2,color:"#aaa",
              fontFamily:"'Roboto Mono',monospace",fontStyle:"normal" }}>
              EFF {eff.value} · {eff.label}
            </div>
          </div>
        </div>
        {/* Thin divider */}
        <div style={{ height:1,background:"#ebebeb",marginTop:20 }}/>
      </div>

      {/* ── RADAR — full width, dominant ── */}
      <div style={{ flex:"0 0 320px", padding:"0 16px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData} margin={{ top:16,right:28,bottom:16,left:28 }}>
            <defs>
              <radialGradient id="rfA" cx="50%" cy="50%" r="50%">
                <stop offset="0%"   stopColor={MAG} stopOpacity={0.20}/>
                <stop offset="60%"  stopColor={MAG} stopOpacity={0.10}/>
                <stop offset="100%" stopColor={MAG} stopOpacity={0.02}/>
              </radialGradient>
            </defs>
            <PolarGrid stroke="#ebebeb"/>
            <PolarAngleAxis dataKey="subject"
              tick={{ fill:"#bbb",fontSize:10,fontFamily:"'Roboto Mono',monospace",letterSpacing:1 }}/>
            <Radar dataKey="value" stroke={MAG} strokeWidth={2.5} fill="url(#rfA)" dot={<Dot/>}/>
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* ── METRICS TABLE ── */}
      <div style={{ flex:1,padding:"0 28px",overflow:"hidden" }}>
        <div style={{ height:1,background:"#ebebeb",marginBottom:4 }}/>
        {METRICS.map(m=>(
          <MetricRow key={m.key} m={m} raw={rawValues}
            accentColor={MAG} textColor="#111" subColor="#aaa" borderColor="#f0f0f0"/>
        ))}
      </div>

      {/* ── FOOTER ── */}
      <div style={{ padding:"14px 28px 22px",borderTop:"1px solid #e8e8e8",flexShrink:0,
        display:"flex",justifyContent:"space-between",alignItems:"center" }}>
        <span style={{ fontSize:10,color:"#222",letterSpacing:4,
          fontFamily:"'Roboto Mono',monospace",fontWeight:700 }}>{BRAND}</span>
        <span style={{ fontSize:8,color:"#bbb",letterSpacing:2,
          fontFamily:"'Roboto Mono',monospace" }}>
          {isVerified ? AUTH_ID : TODAY}
        </span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  B · ROSÉ LUXURY   Chocolate × Rose Gold  —  Status
//  Layout: Brand header → Score circle centered → Radar → metric rows → footer
// ═══════════════════════════════════════════════════════════════════════════════
function CardB({ radarData, rawValues, score, grade, nick, age, isVerified, cardRef }) {
  const GOLD="#C9956A", ROSE="#E8B4A0", CREAM="#F5EDE6", BG="#1A1008";
  const eff = effRatio(rawValues);
  const Dot = ({ cx, cy }) => (
    <g>
      <circle cx={cx} cy={cy} r={9}  fill="none" stroke={GOLD} strokeWidth={1} opacity={0.4}/>
      <circle cx={cx} cy={cy} r={5}  fill={BG} stroke={GOLD} strokeWidth={1.5}/>
      <circle cx={cx} cy={cy} r={2}  fill={GOLD}/>
    </g>
  );
  return (
    <div ref={cardRef} style={{ width:CARD_W, height:CARD_H, flexShrink:0, overflow:"hidden",
      background:`linear-gradient(165deg,#1A1008 0%,#120D07 50%,#1E1208 100%)`,
      fontFamily:"Georgia,'Times New Roman',serif",
      display:"flex", flexDirection:"column", position:"relative" }}>

      {/* Texture */}
      <div style={{ position:"absolute",inset:0,opacity:0.02,pointerEvents:"none",
        backgroundImage:"repeating-linear-gradient(45deg,#C9956A 0,#C9956A 1px,transparent 0,transparent 50%)",
        backgroundSize:"8px 8px" }}/>

      {/* Double frame */}
      <div style={{ position:"absolute",inset:14,border:`1px solid ${GOLD}35`,pointerEvents:"none",zIndex:1 }}/>
      <div style={{ position:"absolute",inset:17,border:`1px solid ${GOLD}14`,pointerEvents:"none",zIndex:1 }}/>

      {/* Corner ornaments */}
      {[[false,false],[true,false],[false,true],[true,true]].map(([r,b],i)=>(
        <div key={i} style={{ position:"absolute",width:24,height:24,zIndex:2,
          top:b?undefined:12, bottom:b?12:undefined,
          left:r?undefined:12, right:r?12:undefined,
          borderTop:   !b?`2px solid ${GOLD}65`:"none",
          borderBottom: b?`2px solid ${GOLD}65`:"none",
          borderLeft:  !r?`2px solid ${GOLD}65`:"none",
          borderRight:  r?`2px solid ${GOLD}65`:"none" }}/>
      ))}

      <div style={{ position:"relative",zIndex:3,display:"flex",flexDirection:"column",height:"100%",
        padding:"32px 28px 24px" }}>

        {/* Brand + identity */}
        <div style={{ textAlign:"center",flexShrink:0,marginBottom:20 }}>
          <div style={{ fontSize:9,letterSpacing:7,color:`${GOLD}75`,marginBottom:8,
            fontFamily:"'Roboto Mono',monospace",fontStyle:"normal" }}>✦ {BRAND} ✦</div>
          <div style={{ fontSize:nick?24:16,letterSpacing:3,color:CREAM,fontStyle:"italic" }}>
            {nick||"Your Name"}
          </div>
          {age&&<div style={{ fontSize:10,letterSpacing:3,color:`${ROSE}80`,marginTop:4,
            fontFamily:"'Roboto Mono',monospace",fontStyle:"normal" }}>{age} years</div>}
        </div>

        {/* Score — large centered number */}
        <div style={{ textAlign:"center",flexShrink:0,marginBottom:16 }}>
          <div style={{ fontSize:9,letterSpacing:4,color:`${GOLD}55`,marginBottom:6,
            fontFamily:"'Roboto Mono',monospace",fontStyle:"normal" }}>PERFORMANCE INDEX</div>
          <div style={{ fontSize:96,fontWeight:400,lineHeight:1,color:GOLD,
            letterSpacing:-4,fontStyle:"italic" }}>{score}</div>
          <div style={{ fontSize:11,letterSpacing:6,color:ROSE,marginTop:8,
            fontFamily:"'Roboto Mono',monospace",fontStyle:"normal" }}>{grade.label}</div>
          <div style={{ width:40,height:1,background:GOLD,margin:"10px auto 0",opacity:0.5 }}/>
        </div>

        {/* Radar — full width, tall */}
        <div style={{ flex:"0 0 300px" }}>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} margin={{ top:12,right:28,bottom:12,left:28 }}>
              <defs>
                <radialGradient id="rfB" cx="50%" cy="50%" r="50%">
                  <stop offset="0%"   stopColor={GOLD} stopOpacity={0.42}/>
                  <stop offset="55%"  stopColor={ROSE} stopOpacity={0.20}/>
                  <stop offset="100%" stopColor={GOLD} stopOpacity={0.04}/>
                </radialGradient>
              </defs>
              <PolarGrid stroke={`${GOLD}18`}/>
              <PolarAngleAxis dataKey="subject"
                tick={{ fill:ROSE,fontSize:10,fontFamily:"'Roboto Mono',monospace",letterSpacing:1 }}/>
              <Radar dataKey="value" stroke={GOLD} strokeWidth={1.5} fill="url(#rfB)" dot={<Dot/>}/>
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Metrics */}
        <div style={{ flex:1,overflow:"hidden" }}>
          {METRICS.map(m=>(
            <MetricRow key={m.key} m={m} raw={rawValues}
              accentColor={GOLD} textColor={CREAM} subColor={`${ROSE}90`} borderColor={`${GOLD}22`}/>
          ))}
        </div>

        {/* Efficiency + footer */}
        <div style={{ flexShrink:0,marginTop:12,paddingTop:12,
          borderTop:`1px solid ${GOLD}30`,
          display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <div>
            <div style={{ fontSize:8,letterSpacing:3,color:`${GOLD}70`,
              fontFamily:"'Roboto Mono',monospace",marginBottom:2 }}>EFF RATIO</div>
            <div style={{ fontSize:12,color:GOLD,fontStyle:"italic" }}>
              {eff.value} <span style={{ fontSize:8,color:`${ROSE}80`,
                fontFamily:"'Roboto Mono',monospace",fontStyle:"normal",letterSpacing:2 }}>{eff.label}</span>
            </div>
          </div>
          <div style={{ textAlign:"right" }}>
            {isVerified&&<div style={{ fontSize:7,color:GOLD,letterSpacing:2,marginBottom:3,
              fontFamily:"'Roboto Mono',monospace" }}>◈ VERIFIED DATA</div>}
            <div style={{ fontSize:8,color:`${GOLD}55`,letterSpacing:2,
              fontFamily:"'Roboto Mono',monospace" }}>{isVerified?AUTH_ID:TODAY}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  C · CYBERPUNK   Black × Cyan × Purple  —  Tactical
//  Layout: Corner UI chrome → score with glow → radar large → metric pills grid → footer
// ═══════════════════════════════════════════════════════════════════════════════
function CardC({ radarData, rawValues, score, grade, nick, age, isVerified, cardRef }) {
  const CYAN="#00F2FF", PUR="#7B61FF";
  const eff = effRatio(rawValues);
  const Dot = ({ cx, cy }) => (
    <g filter="url(#glowC)">
      <circle cx={cx} cy={cy} r={11} fill={`${CYAN}10`}/>
      <circle cx={cx} cy={cy} r={6}  fill="#000" stroke={CYAN} strokeWidth={1.5}/>
      <circle cx={cx} cy={cy} r={2.5} fill={CYAN}/>
    </g>
  );
  return (
    <div ref={cardRef} style={{ width:CARD_W, height:CARD_H, flexShrink:0, overflow:"hidden",
      background:"linear-gradient(145deg,#000 0%,#06040e 100%)",
      fontFamily:"'Roboto Mono',monospace", display:"flex", flexDirection:"column",
      border:`1px solid ${CYAN}20`, position:"relative" }}>

      {/* Scanlines */}
      <div style={{ position:"absolute",inset:0,pointerEvents:"none",zIndex:0,
        background:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,242,255,0.012) 2px,rgba(0,242,255,0.013) 4px)" }}/>

      {/* SVG glow filter */}
      <svg style={{ position:"absolute",width:0,height:0 }}>
        <defs>
          <filter id="glowC" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
      </svg>

      {/* Corner brackets */}
      {[[{top:0,left:0},{borderTop:`1px solid ${CYAN}70`,borderLeft:`1px solid ${CYAN}70`}],
        [{top:0,right:0},{borderTop:`1px solid ${CYAN}70`,borderRight:`1px solid ${CYAN}70`}],
        [{bottom:0,left:0},{borderBottom:`1px solid ${CYAN}70`,borderLeft:`1px solid ${CYAN}70`}],
        [{bottom:0,right:0},{borderBottom:`1px solid ${CYAN}70`,borderRight:`1px solid ${CYAN}70`}]
      ].map(([pos,border],i)=>(
        <div key={i} style={{ position:"absolute",width:22,height:22,zIndex:2,...pos,...border }}/>
      ))}

      <div style={{ position:"relative",zIndex:1,display:"flex",flexDirection:"column",
        height:"100%",padding:"28px 26px 24px" }}>

        {/* Header row */}
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",
          flexShrink:0,marginBottom:24 }}>
          <div>
            <div style={{ fontSize:7,letterSpacing:4,color:`${CYAN}65`,marginBottom:6 }}>
              BIO-PERFORMANCE RADAR
            </div>
            <div style={{ fontFamily:"'Oswald',sans-serif",fontSize:nick?22:14,
              letterSpacing:2,fontWeight:700,color:nick?"#fff":"rgba(255,255,255,0.2)" }}>
              {nick||"YOUR_HANDLE"}
            </div>
            {age&&<div style={{ fontSize:10,color:"rgba(255,255,255,0.3)",letterSpacing:2,marginTop:3 }}>
              {age} YRS
            </div>}
          </div>
          {isVerified&&(
            <div style={{ display:"inline-flex",alignItems:"center",gap:5,
              padding:"5px 10px",border:`1px solid ${CYAN}50`,background:`${CYAN}0e` }}>
              <span style={{ fontSize:7,letterSpacing:2,color:CYAN,fontWeight:700 }}>◈ VERIFIED DATA</span>
            </div>
          )}
        </div>

        {/* Score — hero size */}
        <div style={{ flexShrink:0,marginBottom:8 }}>
          <div style={{ fontFamily:"'Oswald',sans-serif",fontSize:120,fontWeight:700,lineHeight:0.85,
            color:grade.color,letterSpacing:-6,
            textShadow:`0 0 40px ${grade.color}70, 0 0 80px ${grade.color}30` }}>
            {score}
          </div>
          <div style={{ display:"flex",alignItems:"center",gap:14,marginTop:12 }}>
            <div style={{ fontSize:11,letterSpacing:5,color:grade.color }}>{grade.label}</div>
            <div style={{ flex:1,height:1,background:`${CYAN}20` }}/>
            <div style={{ fontSize:9,color:`${CYAN}60`,letterSpacing:2 }}>
              EFF {eff.value} · {eff.label}
            </div>
          </div>
        </div>

        {/* Radar — tall center piece */}
        <div style={{ flex:"0 0 300px" }}>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} margin={{ top:12,right:30,bottom:12,left:30 }}>
              <defs>
                <radialGradient id="rfC" cx="50%" cy="50%" r="50%">
                  <stop offset="0%"   stopColor={CYAN} stopOpacity={0.30}/>
                  <stop offset="55%"  stopColor={PUR}  stopOpacity={0.15}/>
                  <stop offset="100%" stopColor={CYAN} stopOpacity={0.03}/>
                </radialGradient>
              </defs>
              <PolarGrid stroke={`${CYAN}14`}/>
              <PolarAngleAxis dataKey="subject"
                tick={{ fill:`${CYAN}60`,fontSize:10,fontFamily:"'Roboto Mono',monospace",letterSpacing:1 }}/>
              <Radar dataKey="value" stroke={CYAN} strokeWidth={1.5} fill="url(#rfC)" dot={<Dot/>}/>
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Metric grid — 2 columns */}
        <div style={{ flex:1,display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,overflow:"hidden" }}>
          {METRICS.map(m=>{
            const pct = m.toRadar(rawValues[m.key]);
            const val = m.key==="strain"?Number(rawValues[m.key]).toFixed(1):rawValues[m.key];
            return (
              <div key={m.key} style={{ padding:"10px 10px",
                background:`${CYAN}06`,border:`1px solid ${CYAN}18`,
                display:"flex",flexDirection:"column",gap:4 }}>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                  <span style={{ fontSize:9,letterSpacing:1,color:`${CYAN}60` }}>{m.label}</span>
                  <span style={{ fontSize:9,color:CYAN }}>{m.icon}</span>
                </div>
                <div style={{ fontFamily:"'Oswald',sans-serif",fontSize:20,fontWeight:700,
                  color:"#fff",lineHeight:1 }}>
                  {val}<span style={{ fontSize:10,color:"rgba(255,255,255,0.3)",marginLeft:2 }}>{m.unit}</span>
                </div>
                <div style={{ height:2,background:`${CYAN}15`,borderRadius:1 }}>
                  <div style={{ width:`${pct}%`,height:"100%",background:CYAN,borderRadius:1 }}/>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ flexShrink:0,marginTop:16,paddingTop:12,
          borderTop:`1px solid ${CYAN}15`,
          display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <span style={{ fontSize:10,color:`${CYAN}60`,letterSpacing:4,fontWeight:700 }}>{BRAND}</span>
          <span style={{ fontSize:8,color:"rgba(255,255,255,0.22)",letterSpacing:2 }}>
            {isVerified?AUTH_ID:TODAY}
          </span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  D · BAUHAUS   Dark × Bold accent  —  Executive
//  Layout: Top thick accent bar → Identity → Giant score → radar → metric rows → footer
// ═══════════════════════════════════════════════════════════════════════════════
function CardD({ radarData, rawValues, score, grade, nick, age, isVerified, cardRef }) {
  const GC  = grade.label==="OPTIMAL"?"#D4FF00":grade.label==="BALANCED"?"#FF9500":"#FF2D55";
  const eff = effRatio(rawValues);
  const Dot = ({ cx, cy }) => <circle cx={cx} cy={cy} r={5} fill="#fff"/>;

  return (
    <div ref={cardRef} style={{ width:CARD_W, height:CARD_H, flexShrink:0, overflow:"hidden",
      background:"#080808", fontFamily:"'Oswald','Arial Black',sans-serif",
      display:"flex", flexDirection:"column" }}>

      {/* Accent top bar */}
      <div style={{ height:8, background:GC, flexShrink:0 }}/>

      {/* Identity header */}
      <div style={{ padding:"24px 28px 20px",flexShrink:0,
        background:`linear-gradient(170deg,${GC}14 0%,transparent 60%)`,
        borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ fontSize:8,letterSpacing:5,color:"rgba(255,255,255,0.28)",
          fontFamily:"'Roboto Mono',monospace",marginBottom:6 }}>PERFORMANCE INDEX</div>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-end" }}>
          <div>
            <div style={{ fontSize:nick?24:15,fontWeight:700,letterSpacing:1,color:"#fff",lineHeight:1 }}>
              {nick||"—"}
            </div>
            {age&&<div style={{ fontSize:10,letterSpacing:3,color:"rgba(255,255,255,0.32)",
              fontFamily:"'Roboto Mono',monospace",marginTop:4 }}>{age} YRS</div>}
          </div>
          {isVerified&&(
            <div style={{ fontSize:7,letterSpacing:2,color:GC,
              fontFamily:"'Roboto Mono',monospace",textAlign:"right" }}>
              ◈ VERIFIED DATA<br/>
              <span style={{ opacity:0.6 }}>{AUTH_ID}</span>
            </div>
          )}
        </div>
      </div>

      {/* Giant score */}
      <div style={{ padding:"20px 28px 0",flexShrink:0 }}>
        <div style={{ fontSize:128,fontWeight:700,lineHeight:0.82,color:GC,
          letterSpacing:-7,textShadow:`4px 4px 0 rgba(0,0,0,0.7)` }}>{score}</div>
        <div style={{ display:"flex",alignItems:"center",gap:16,marginTop:10 }}>
          <div style={{ fontSize:14,letterSpacing:5,color:"rgba(255,255,255,0.80)",fontWeight:700 }}>
            {grade.label}
          </div>
          <div style={{ width:36,height:4,background:GC }}/>
          <div style={{ fontSize:9,letterSpacing:2,color:"rgba(255,255,255,0.3)",
            fontFamily:"'Roboto Mono',monospace" }}>
            EFF {eff.value} · {eff.label}
          </div>
        </div>
      </div>

      {/* Radar */}
      <div style={{ flex:"0 0 290px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData} margin={{ top:8,right:28,bottom:8,left:28 }}>
            <defs>
              <linearGradient id="rfD" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%"   stopColor={GC} stopOpacity={0.28}/>
                <stop offset="100%" stopColor={GC} stopOpacity={0.06}/>
              </linearGradient>
            </defs>
            <PolarGrid stroke="rgba(255,255,255,0.08)"/>
            <PolarAngleAxis dataKey="subject"
              tick={{ fill:"rgba(255,255,255,0.40)",fontSize:10,fontFamily:"'Roboto Mono',monospace",letterSpacing:1 }}/>
            <Radar dataKey="value" stroke={GC} strokeWidth={2} fill="url(#rfD)" dot={<Dot/>}/>
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Metric rows */}
      <div style={{ flex:1,padding:"0 28px",overflow:"hidden" }}>
        <div style={{ height:1,background:"rgba(255,255,255,0.06)",marginBottom:4 }}/>
        {METRICS.map(m=>(
          <MetricRow key={m.key} m={m} raw={rawValues}
            accentColor={GC} textColor="#fff" subColor="rgba(255,255,255,0.32)"
            borderColor="rgba(255,255,255,0.06)"/>
        ))}
      </div>

      {/* Footer */}
      <div style={{ padding:"14px 28px 20px",borderTop:"1px solid rgba(255,255,255,0.06)",
        flexShrink:0,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
        <span style={{ fontSize:10,color:GC,letterSpacing:4,fontWeight:700,
          fontFamily:"'Roboto Mono',monospace" }}>{BRAND}</span>
        <span style={{ fontSize:8,color:"rgba(255,255,255,0.22)",letterSpacing:2,
          fontFamily:"'Roboto Mono',monospace" }}>{TODAY}</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  E · NEON TOKYO   Film grain × Magenta block × Kanji  —  Viral
//  Layout: Big magenta hero (40% height) with score + kanji → dark lower half with radar + metrics
// ═══════════════════════════════════════════════════════════════════════════════
function CardE({ radarData, rawValues, score, grade, nick, age, isVerified, cardRef }) {
  const MAG  = "#E8005A";
  const YELL = "#F5E800";
  const KANJI = { OPTIMAL:"最適", BALANCED:"均衡", FATIGUED:"疲労" };
  const eff  = effRatio(rawValues);
  const Dot  = ({ cx, cy }) => (
    <g>
      <circle cx={cx} cy={cy} r={7} fill={YELL} opacity={0.92}/>
      <circle cx={cx} cy={cy} r={3} fill="#0D0D0D"/>
    </g>
  );

  return (
    <div ref={cardRef} style={{ width:CARD_W, height:CARD_H, flexShrink:0, overflow:"hidden",
      background:"#0D0D0D", fontFamily:"'Roboto Mono',monospace",
      display:"flex", flexDirection:"column", position:"relative" }}>

      {/* Film grain overlay */}
      <div style={{ position:"absolute",inset:0,pointerEvents:"none",zIndex:0,opacity:0.045,
        backgroundImage:`url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        backgroundSize:"200px 200px" }}/>

      {/* ── TOP HERO — Magenta 40% of card ── */}
      <div style={{ flex:"0 0 384px", background:MAG, position:"relative", overflow:"hidden",
        display:"flex",flexDirection:"column",justifyContent:"space-between",padding:"28px 24px 20px",
        zIndex:1 }}>

        {/* Kanji watermark */}
        <div style={{ position:"absolute",right:-8,top:-8,
          fontFamily:"serif",fontSize:200,fontWeight:900,
          color:"rgba(0,0,0,0.08)",lineHeight:1,pointerEvents:"none",userSelect:"none",letterSpacing:-8 }}>
          {KANJI[grade.label]||"最適"}
        </div>

        {/* Top row: brand + verified */}
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",position:"relative" }}>
          <span style={{ fontSize:11,letterSpacing:4,color:"rgba(255,255,255,0.88)",fontWeight:700 }}>
            {BRAND}
          </span>
          {isVerified&&(
            <span style={{ fontSize:7,letterSpacing:2,color:"rgba(255,255,255,0.85)",textAlign:"right" }}>
              ◈ VERIFIED<br/>{AUTH_ID}
            </span>
          )}
        </div>

        {/* Score — giant */}
        <div style={{ position:"relative" }}>
          <div style={{ fontSize:8,letterSpacing:5,color:"rgba(255,255,255,0.58)",marginBottom:6 }}>
            BIO-PERFORMANCE RADAR
          </div>
          <div style={{ fontFamily:"'Oswald',sans-serif",fontSize:136,fontWeight:700,lineHeight:0.82,
            color:"#fff",letterSpacing:-7,textShadow:"3px 3px 0 rgba(0,0,0,0.18)" }}>
            {score}
          </div>
          <div style={{ display:"flex",alignItems:"center",gap:14,marginTop:10 }}>
            <div style={{ fontFamily:"'Oswald',sans-serif",fontSize:18,letterSpacing:4,
              color:"rgba(255,255,255,0.90)",fontWeight:700 }}>{grade.label}</div>
            <div style={{ width:30,height:3,background:"rgba(255,255,255,0.5)" }}/>
            {nick&&<div style={{ fontSize:11,color:"rgba(255,255,255,0.70)",letterSpacing:2 }}>
              {nick}{age&&<span style={{ opacity:0.6 }}> · {age}</span>}
            </div>}
          </div>
        </div>
      </div>

      {/* Diagonal cut */}
      <div style={{ height:40,background:"#0D0D0D",marginTop:-2,flexShrink:0,
        clipPath:"polygon(0 38px,100% 0,100% 38px,0 38px)",position:"relative",zIndex:2 }}/>

      {/* ── LOWER HALF — dark ── */}
      <div style={{ flex:1,display:"flex",flexDirection:"column",padding:"0 22px 22px",
        position:"relative",zIndex:1,overflow:"hidden" }}>

        {/* Radar */}
        <div style={{ flex:"0 0 270px" }}>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} margin={{ top:8,right:24,bottom:8,left:24 }}>
              <defs>
                <radialGradient id="rfE" cx="50%" cy="50%" r="50%">
                  <stop offset="0%"   stopColor={YELL} stopOpacity={0.55}/>
                  <stop offset="100%" stopColor={YELL} stopOpacity={0.10}/>
                </radialGradient>
              </defs>
              <PolarGrid stroke="rgba(255,255,255,0.08)"/>
              <PolarAngleAxis dataKey="subject"
                tick={{ fill:"rgba(255,255,255,0.36)",fontSize:10,fontFamily:"'Roboto Mono',monospace",letterSpacing:0 }}/>
              <Radar dataKey="value" stroke={YELL} strokeWidth={2} fill="url(#rfE)" dot={<Dot/>}/>
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Efficiency inline */}
        <div style={{ fontSize:9,letterSpacing:2,color:"rgba(255,255,255,0.28)",
          marginBottom:10,flexShrink:0 }}>
          <span style={{ color:YELL }}>EFF </span>{eff.value} · {eff.label}
        </div>

        {/* Metric rows */}
        <div style={{ flex:1,overflow:"hidden" }}>
          {METRICS.map(m=>{
            const pct = m.toRadar(rawValues[m.key]);
            const val = m.key==="strain"?Number(rawValues[m.key]).toFixed(1):rawValues[m.key];
            return (
              <div key={m.key} style={{ display:"flex",alignItems:"stretch",overflow:"hidden",
                marginBottom:5,background:"rgba(255,255,255,0.03)" }}>
                <div style={{ width:3,background:MAG,opacity:Math.max(0.25,pct/100) }}/>
                <div style={{ flex:1,padding:"7px 10px",display:"flex",
                  justifyContent:"space-between",alignItems:"center" }}>
                  <span style={{ fontSize:9,letterSpacing:2,color:"rgba(255,255,255,0.38)" }}>{m.label}</span>
                  <div style={{ display:"flex",alignItems:"baseline",gap:8 }}>
                    <div style={{ width:60,height:2,background:"rgba(255,255,255,0.08)",borderRadius:1 }}>
                      <div style={{ width:`${pct}%`,height:"100%",background:YELL,borderRadius:1 }}/>
                    </div>
                    <span style={{ fontFamily:"'Oswald',sans-serif",fontSize:14,fontWeight:700,color:"#fff",
                      width:44,textAlign:"right" }}>
                      {val}<span style={{ fontSize:8,color:"rgba(255,255,255,0.3)",marginLeft:2 }}>{m.unit}</span>
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ flexShrink:0,marginTop:10,paddingTop:8,
          borderTop:"1px solid rgba(255,255,255,0.06)",
          display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <span style={{ fontSize:9,letterSpacing:3,color:MAG,fontWeight:700 }}>{BRAND}</span>
          <span style={{ fontSize:8,letterSpacing:2,color:"rgba(255,255,255,0.22)" }}>{TODAY}</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  THEME REGISTRY  — order: CyberPunk · Vogue · Bauhaus · Rosé · Neon
// ═══════════════════════════════════════════════════════════════════════════════
const THEMES = [
  { id:"C", name:"CyberPunk",   tagline:"Black · Cyan · Tactical",       Component:CardC },
  { id:"A", name:"Vogue",       tagline:"White · Magenta · Authority",   Component:CardA },
  { id:"D", name:"Bauhaus",     tagline:"Dark · Bold · Executive",       Component:CardD },
  { id:"B", name:"Rosé Luxury", tagline:"Chocolate · Gold · Status",     Component:CardB },
  { id:"E", name:"Neon Tokyo",  tagline:"Film · Magenta · Viral",        Component:CardE },
];

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [rawValues,  setRawValues]  = useState(DEFAULT_RAW);
  const [nick,       setNick]       = useState("");
  const [age,        setAge]        = useState("");
  const [isVerified, setIsVerified] = useState(false);
  const [activeId,   setActiveId]   = useState("C");
  const [mode,       setMode]       = useState("manual");
  const [dragOver,   setDragOver]   = useState(false);
  const [parseError, setParseError] = useState(null);
  const [history,    setHistory]    = useState(()=>loadHistory());
  const [exportSt,   setExportSt]   = useState({});
  const cardRefs = useRef({});

  const radarData = useMemo(()=>
    METRICS.map(m=>({ subject:m.label, value:m.toRadar(rawValues[m.key]), fullMark:100 })),
    [rawValues]);
  const score = useMemo(()=>getBioScore(rawValues),[rawValues]);
  const grade = getGrade(score);
  const eff   = effRatio(rawValues);

  // ── File handling ──────────────────────────────────────────────────────────
  const processFile = useCallback((file)=>{
    setParseError(null);
    if(!file) return;
    const r = new FileReader();
    r.onload = e=>{
      const res = parseCSV(e.target.result);
      if(res.error){ setParseError(res.error); return; }
      const { history:h, source:_s, error:_e, ...vals } = res;
      setRawValues({ hrv:vals.hrv, recovery:vals.recovery, sleep:vals.sleep, strain:vals.strain, rhr:vals.rhr });
      setIsVerified(true);
      if(h) setHistory(h);
      setMode("manual");
    };
    r.readAsText(file);
  },[]);

  const handleDrop = useCallback(e=>{ e.preventDefault(); setDragOver(false); processFile(e.dataTransfer.files[0]); },[processFile]);
  const openPicker = ()=>{ const i=document.createElement("input"); i.type="file"; i.accept=".csv"; i.onchange=e=>processFile(e.target.files[0]); i.click(); };
  const handleSlider = (key,val)=>{ setRawValues(v=>({...v,[key]:Number(val)})); setIsVerified(false); };

  // ── Export: capture card at pixelRatio 2 → exact 1080×1920 ───────────────
  const doExport = async (themeId)=>{
    const el = cardRefs.current[themeId];
    if(!el || exportSt[themeId]==="loading") return;
    setExportSt(s=>({...s,[themeId]:"loading"}));
    try {
      const isLight = themeId==="A";
      // The card is already 540×960 CSS px — pixelRatio:2 → 1080×1920 native
      const png = await toPng(el, {
        width:  CARD_W,
        height: CARD_H,
        pixelRatio: 2,
        backgroundColor: isLight?"#ffffff":"#000000",
        style:{ transform:"none", position:"relative", top:"0", left:"0" },
      });
      const a = document.createElement("a");
      a.download = `bioradar-story-${themeId}-${(nick||"export").toLowerCase().replace(/\s+/g,"-")}.png`;
      a.href = png;
      a.click();
      setExportSt(s=>({...s,[themeId]:"done"}));
      setTimeout(()=>setExportSt(s=>({...s,[themeId]:"idle"})),2500);
    } catch(err){
      console.error(err);
      setExportSt(s=>({...s,[themeId]:"idle"}));
      alert(`Export error: ${err.message}`);
    }
  };

  const activeTheme = THEMES.find(t=>t.id===activeId);
  const ActiveCard  = activeTheme.Component;
  const cardProps   = (id,ref)=>({ radarData, rawValues, score, grade, nick, age, isVerified, cardRef:ref });
  const SC = ["#00F2FF","#00D97E","#7B61FF","#FF6B35","#FF2D78"];

  return (
    <div style={{ minHeight:"100vh", background:"#040404", color:"#fff",
      fontFamily:"'Roboto Mono','Courier New',monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@300;400;700&family=Oswald:wght@700&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px;height:3px}
        ::-webkit-scrollbar-thumb{background:rgba(0,242,255,0.22);border-radius:2px}
        input[type=range]{-webkit-appearance:none;height:2px;border-radius:1px;outline:none;cursor:pointer;width:100%;display:block}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;border:2px solid currentColor;background:#040404;cursor:pointer;transition:transform .15s}
        input[type=range]::-webkit-slider-thumb:active{transform:scale(1.3)}
        button{cursor:pointer}
        input::placeholder{color:rgba(255,255,255,0.18)}
        input:focus{outline:none}
        .tab{transition:all .18s}
        .thumb{transition:transform .2s;cursor:pointer}
        .xbtn{transition:opacity .2s}.xbtn:hover:not(:disabled){opacity:.8}

        /* ── MOBILE RESPONSIVE ── */
        .app-grid { display:grid; grid-template-columns:280px 1fr; gap:36px; align-items:start; }
        .left-panel { position:sticky; top:24px; }
        .preview-wrap { display:flex; justify-content:center; }
        .thumbs-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; }
        .export-bar { display:flex; align-items:center; gap:14px; margin-bottom:14px; flex-wrap:wrap; }
        .export-btn-wrap { margin-left:auto; }

        @media (max-width: 700px) {
          .app-grid { grid-template-columns:1fr; gap:0; }
          .left-panel { position:static; padding:0 16px; }
          .right-panel { padding:0 16px 40px; }
          .thumbs-grid { grid-template-columns:repeat(4,1fr); gap:6px; }
          .export-bar { flex-direction:column; align-items:stretch; gap:10px; }
          .export-btn-wrap { margin-left:0; }
          .header-sub { display:none; }
        }
      `}</style>

      <div style={{ maxWidth:1300,margin:"0 auto",padding:"24px 0 70px" }}>

        {/* HEADER */}
        <header style={{ borderBottom:"1px solid rgba(255,255,255,0.07)",paddingBottom:16,
          marginBottom:24, paddingLeft:20, paddingRight:20 }}>
          <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:6 }}>
            <div style={{ width:5,height:5,borderRadius:"50%",background:"#00F2FF",boxShadow:"0 0 8px #00F2FF" }}/>
            <span className="header-sub" style={{ fontSize:9,letterSpacing:4,color:"rgba(0,242,255,0.65)" }}>
              5 THEMES · EXPORT 1080×1080
            </span>
          </div>
          <h1 style={{ fontFamily:"'Oswald',sans-serif",fontSize:"clamp(26px,5vw,38px)",
            fontWeight:700,letterSpacing:4,lineHeight:1.05 }}>
            {BRAND}
          </h1>
          <p style={{ fontSize:"clamp(9px,2.5vw,11px)",color:"rgba(255,255,255,0.25)",
            letterSpacing:2,marginTop:4 }}>
            BIO-PERFORMANCE RADAR
          </p>
        </header>

        <div className="app-grid">

          {/* ════ LEFT PANEL — controls ════ */}
          <div className="left-panel">

            {/* Mode toggle */}
            <div style={{ display:"flex",marginBottom:18,paddingTop:4 }}>
              {["manual","upload"].map((m,i)=>(
                <button key={m} className="tab"
                  onClick={()=>setMode(m)}
                  style={{ flex:1,background:"transparent",fontFamily:"inherit",
                    fontSize:11,letterSpacing:2,padding:"10px 0",
                    border:`1px solid ${mode===m?"rgba(0,242,255,0.55)":"rgba(255,255,255,0.1)"}`,
                    color:mode===m?"#00F2FF":"rgba(255,255,255,0.32)",
                    borderRight:i===0?"none":undefined }}>
                  {m==="manual"?"◈ MANUAL":"↑ CSV"}
                </button>
              ))}
            </div>

            {mode==="upload" ? (
              <div>
                <div style={{ display:"flex",gap:8,padding:"10px 12px",background:"rgba(0,255,157,0.04)",
                  border:"1px solid rgba(0,255,157,0.12)",marginBottom:14,fontSize:11,
                  color:"rgba(255,255,255,0.35)",letterSpacing:1,lineHeight:1.7 }}>
                  <span style={{ color:"#00FF9D",flexShrink:0 }}>⬡</span>
                  <span>Parsed locally. No data leaves your device.</span>
                </div>
                <div style={{ border:`1px dashed ${dragOver?"rgba(0,242,255,0.7)":"rgba(0,242,255,0.22)"}`,
                  padding:"36px 20px",textAlign:"center",cursor:"pointer",borderRadius:2,
                  background:dragOver?"rgba(0,242,255,0.04)":"transparent",marginBottom:14,transition:"all .25s" }}
                  onDragOver={e=>{e.preventDefault();setDragOver(true)}}
                  onDragLeave={()=>setDragOver(false)}
                  onDrop={handleDrop} onClick={openPicker}>
                  <div style={{ fontSize:32,color:"rgba(0,242,255,0.32)",marginBottom:10 }}>⬡</div>
                  <p style={{ fontSize:13,letterSpacing:2,color:"rgba(255,255,255,0.5)",marginBottom:6 }}>TAP TO UPLOAD CSV</p>
                  <p style={{ fontSize:11,color:"rgba(255,255,255,0.22)",letterSpacing:1 }}>WHOOP · OURA · APPLE HEALTH</p>
                </div>
                {parseError&&<p style={{ fontSize:11,color:"#FF6B35",letterSpacing:1,marginBottom:12,lineHeight:1.5 }}>⚠ {parseError}</p>}
                {history.length>0&&(
                  <div style={{ padding:"12px 14px",background:"rgba(0,242,255,0.04)",
                    border:"1px solid rgba(0,242,255,0.12)",fontSize:11,letterSpacing:1,lineHeight:1.9 }}>
                    <div style={{ color:"rgba(0,242,255,0.65)",marginBottom:6 }}>LAST {history.length} DAYS</div>
                    {history.slice(-3).reverse().map((d,i)=>(
                      <div key={i} style={{ display:"flex",justifyContent:"space-between",
                        color:"rgba(255,255,255,0.36)" }}>
                        <span>{d.date||"—"}</span>
                        <span style={{ color:"rgba(255,255,255,0.55)" }}>REC {d.recovery}% HRV {d.hrv}ms</span>
                      </div>
                    ))}
                    <button onClick={()=>{clearHistory();setHistory([]);}}
                      style={{ marginTop:8,background:"none",border:"none",color:"rgba(255,100,100,0.5)",
                        fontSize:11,letterSpacing:2,cursor:"pointer",fontFamily:"inherit",padding:0 }}>
                      ✕ CLEAR
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <p style={{ fontSize:9,letterSpacing:3,color:"rgba(255,255,255,0.24)",marginBottom:16 }}>YOUR METRICS</p>
                {METRICS.map((m,i)=>{
                  const raw=rawValues[m.key], pct=m.toRadar(raw), isF=m.rawStep<1, sc=SC[i];
                  return (
                    <div key={m.key} style={{ marginBottom:22 }}>
                      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:8 }}>
                        <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                          <span style={{ color:sc,fontSize:14 }}>{m.icon}</span>
                          <span style={{ fontSize:12,letterSpacing:2,color:"rgba(255,255,255,0.65)" }}>{m.label}</span>
                        </div>
                        <div style={{ display:"flex",alignItems:"baseline",gap:3 }}>
                          <span style={{ fontFamily:"'Oswald',sans-serif",fontSize:22,fontWeight:700,color:sc }}>
                            {isF?Number(raw).toFixed(1):raw}
                          </span>
                          <span style={{ fontSize:10,color:"rgba(255,255,255,0.28)" }}>{m.unit}</span>
                        </div>
                      </div>
                      <input type="range" min={m.rawMin} max={m.rawMax} step={m.rawStep} value={raw}
                        onChange={e=>handleSlider(m.key,e.target.value)}
                        style={{ color:sc, background:m.key==="rhr"
                          ?`linear-gradient(to left,${sc} ${pct}%,rgba(255,255,255,0.08) ${pct}%)`
                          :`linear-gradient(to right,${sc} ${pct}%,rgba(255,255,255,0.08) ${pct}%)` }}/>
                      {m.key==="rhr"&&<p style={{ fontSize:9,color:"rgba(255,45,120,0.4)",letterSpacing:1,marginTop:4 }}>↓ lower = better</p>}
                      {m.key==="strain"&&<p style={{ fontSize:9,color:"rgba(255,107,53,0.4)",letterSpacing:1,marginTop:4 }}>Whoop 0.0–21.0</p>}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Identity */}
            <div style={{ borderTop:"1px solid rgba(255,255,255,0.06)",paddingTop:18,marginTop:4,
              display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
              {[["NAME / HANDLE","text",nick,v=>setNick(v)],
                ["AGE","number",age,v=>setAge(v)]].map(([l,t,v,fn])=>(
                <div key={l}>
                  <label style={{ fontSize:9,letterSpacing:2,color:"rgba(255,255,255,0.24)",
                    display:"block",marginBottom:6 }}>{l}</label>
                  <input value={v} onChange={e=>fn(e.target.value)} type={t}
                    style={{ background:"transparent",border:"none",
                      borderBottom:"1px solid rgba(255,255,255,0.12)",
                      color:"#fff",fontFamily:"inherit",fontSize:14,width:"100%",
                      padding:"4px 0",letterSpacing:1 }}/>
                </div>
              ))}
            </div>

            {/* Bio-Score dashboard */}
            <div style={{ marginTop:20,padding:"16px",background:"rgba(255,255,255,0.02)",
              border:`1px solid ${grade.color}22` }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
                <div>
                  <p style={{ fontSize:8,letterSpacing:3,color:"rgba(255,255,255,0.2)",marginBottom:4 }}>BIO-SCORE</p>
                  <div style={{ fontFamily:"'Oswald',sans-serif",fontSize:42,fontWeight:700,
                    color:grade.color,textShadow:`0 0 18px ${grade.color}55` }}>{score}</div>
                  <p style={{ fontSize:9,letterSpacing:3,color:grade.color,marginTop:3 }}>{grade.label}</p>
                </div>
                <div style={{ textAlign:"right" }}>
                  <p style={{ fontSize:8,letterSpacing:2,color:"rgba(255,255,255,0.2)",marginBottom:4 }}>EFFICIENCY</p>
                  <div style={{ fontFamily:"'Oswald',sans-serif",fontSize:26,fontWeight:700,
                    color:"rgba(255,255,255,0.65)" }}>{eff.value}</div>
                  <p style={{ fontSize:9,letterSpacing:1,color:"rgba(255,255,255,0.3)",marginTop:3 }}>{eff.label}</p>
                </div>
              </div>
              <p style={{ fontSize:7,color:"rgba(255,255,255,0.14)",letterSpacing:1,marginTop:12,lineHeight:2 }}>
                HRV 25% · SLEEP 25% · REC 30% · RHR 20% · STRAIN EXCLUDED
              </p>
            </div>

          </div>{/* end left panel */}

          {/* ════ RIGHT PANEL — preview + export ════ */}
          <div className="right-panel" style={{ paddingTop:4 }}>

            {/* Theme tabs — horizontal scroll on mobile */}
            <div style={{ display:"flex",gap:6,marginBottom:18,
              overflowX:"auto",paddingBottom:4,
              WebkitOverflowScrolling:"touch" }}>
              {THEMES.map(t=>(
                <button key={t.id} className="tab"
                  onClick={()=>setActiveId(t.id)}
                  style={{ background:activeId===t.id?"rgba(255,255,255,0.08)":"transparent",
                    border:`1px solid ${activeId===t.id?"rgba(255,255,255,0.45)":"rgba(255,255,255,0.1)"}`,
                    color:activeId===t.id?"#fff":"rgba(255,255,255,0.32)",
                    padding:"8px 16px",fontFamily:"inherit",fontSize:10,letterSpacing:2,
                    whiteSpace:"nowrap",flexShrink:0 }}>
                  {t.name.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Export bar */}
            <div className="export-bar">
              <div>
                <p style={{ fontFamily:"'Oswald',sans-serif",fontSize:15,letterSpacing:3,color:"#fff" }}>
                  {activeTheme.name.toUpperCase()}
                </p>
                <p style={{ fontSize:9,color:"rgba(255,255,255,0.26)",letterSpacing:2,marginTop:2 }}>
                  {activeTheme.tagline}
                </p>
              </div>
              <div className="export-btn-wrap">
                <button className="xbtn"
                  onClick={()=>doExport(activeId)}
                  disabled={exportSt[activeId]==="loading"}
                  style={{ background:"transparent",width:"100%",
                    border:"1px solid rgba(255,255,255,0.38)",color:"#fff",
                    padding:"12px 24px",fontFamily:"inherit",fontSize:10,letterSpacing:3 }}>
                  {exportSt[activeId]==="done"    ? "✓ SAVED · 1080×1080" :
                   exportSt[activeId]==="loading" ? "⟳ RENDERING…"        :
                   "↓ EXPORT 1080×1080 PNG"}
                </button>
              </div>
            </div>

            {/* Card preview — centered, scales to screen */}
            <div className="preview-wrap" style={{ marginBottom:20 }}>
              <div style={{ width:"100%",maxWidth:540,aspectRatio:"1/1",
                border:"1px solid rgba(255,255,255,0.08)",overflow:"hidden",
                position:"relative" }}>
                {/* Render card at full 540×540, scale down via CSS if needed */}
                <div style={{ position:"absolute",top:0,left:0,
                  width:540,height:540,
                  transform:"scale(var(--preview-scale,1))",
                  transformOrigin:"top left" }}>
                  <ActiveCard {...cardProps(activeId, el=>{ cardRefs.current[activeId]=el; })} />
                </div>
                <style>{`
                  .preview-wrap { container-type: inline-size; }
                  @container (max-width: 539px) {
                    .preview-wrap > div > div {
                      transform: scale(calc(100cqw / 540));
                    }
                  }
                `}</style>
              </div>
            </div>

            {/* Other themes thumbnails */}
            <p style={{ fontSize:8,letterSpacing:3,color:"rgba(255,255,255,0.16)",marginBottom:10 }}>
              OTHER THEMES
            </p>
            <div className="thumbs-grid">
              {THEMES.filter(t=>t.id!==activeId).map(t=>{
                const TC=t.Component;
                const THUMB_SCALE = 1/4;
                return (
                  <div key={t.id} className="thumb"
                    onClick={()=>setActiveId(t.id)}
                    style={{ border:"1px solid rgba(255,255,255,0.07)",overflow:"hidden",
                      position:"relative",aspectRatio:"1/1",width:"100%" }}>
                    <div style={{ position:"absolute",top:0,left:0,
                      transformOrigin:"top left",transform:`scale(${THUMB_SCALE})`,
                      width:540,height:540,pointerEvents:"none" }}>
                      <TC {...cardProps(t.id,null)}/>
                    </div>
                    <div style={{ position:"absolute",inset:0 }}/>
                    <div style={{ position:"absolute",bottom:0,left:0,right:0,padding:"4px 5px",
                      background:"rgba(0,0,0,0.88)",fontSize:7,letterSpacing:1,
                      color:"rgba(255,255,255,0.4)",display:"flex",
                      justifyContent:"space-between",alignItems:"center" }}>
                      <span style={{ fontSize:"clamp(6px,1.5vw,8px)" }}>{t.name.toUpperCase()}</span>
                      <span style={{ color:"rgba(255,255,255,0.2)",fontSize:8 }}>↗</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Privacy note */}
            <div style={{ marginTop:16,display:"flex",alignItems:"center",gap:8,
              padding:"10px 12px",background:"rgba(0,255,157,0.03)",
              border:"1px solid rgba(0,255,157,0.1)" }}>
              <span style={{ color:"#00FF9D",fontSize:12 }}>⬡</span>
              <p style={{ fontSize:9,color:"rgba(255,255,255,0.2)",letterSpacing:1 }}>
                CLIENT-SIDE ONLY · YOUR DATA NEVER LEAVES YOUR BROWSER
              </p>
            </div>

          </div>{/* end right panel */}
        </div>
      </div>
    </div>
  );
}
