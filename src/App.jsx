import { useState, useRef, useMemo, useCallback } from "react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer,
} from "recharts";
import { toPng } from "html-to-image";
import { parseCSV, loadHistory, clearHistory } from "./parser.js";

// ═══════════════════════════════════════════════════════════════════════════════
//  DATA & SCORING LOGIC
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

// Bio-Score formula: HRV 25% | Sleep 25% | Recovery 30% | RHR-inverted 20%
// Strain is tracked but excluded from score (it's load, not readiness)
const getBioScore = (raw) => {
  const hrv_n  = METRICS[0].toRadar(raw.hrv);
  const rec_n  = Math.min(100, Math.max(0, raw.recovery));
  const slp_n  = Math.min(100, Math.max(0, raw.sleep));
  const rhr_n  = METRICS[4].toRadar(raw.rhr);
  return Math.round(hrv_n*0.25 + slp_n*0.25 + rec_n*0.30 + rhr_n*0.20);
};

// Dynamic grade — 0-50 FATIGUED | 50-75 BALANCED | 75-100 OPTIMAL
const getGrade = (s) =>
  s >= 75 ? { label:"OPTIMAL",  color:"#00D97E" } :
  s >= 50 ? { label:"BALANCED", color:"#F5A623" } :
            { label:"FATIGUED", color:"#E8003D" };

// Efficiency Ratio: Strain/Recovery. <0.12 Undertrained, <0.20 Efficient, <0.30 Loaded, else Overreached
const effRatio = (raw) => {
  const r = raw.recovery;
  if (!r) return { value:"—", label:"—" };
  const v = raw.strain / Math.max(1, r);
  const label =
    v < 0.12 ? "UNDERTRAINED" :
    v < 0.20 ? "EFFICIENT"    :
    v < 0.30 ? "LOADED"       : "OVERREACHED";
  return { value: v.toFixed(2), label };
};

// ─── BRANDING ─────────────────────────────────────────────────────────────────
const BRAND   = "BIORADAR.IO";
const AUTH_ID = "AUTH-" + Math.random().toString(36).slice(2,6).toUpperCase();
const TODAY   = new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}).toUpperCase();

// ═══════════════════════════════════════════════════════════════════════════════
//  A · EDITORIAL VOGUE   White × Black × Magenta — Authority
// ═══════════════════════════════════════════════════════════════════════════════
function CardA({ radarData, rawValues, score, grade, nick, age, isVerified, cardRef }) {
  const MAG = "#E8005A";
  const eff = effRatio(rawValues);

  const Dot = ({ cx, cy }) => (
    <g>
      <circle cx={cx} cy={cy} r={6}  fill="#fff" stroke="#1a1a1a" strokeWidth={1.5}/>
      <circle cx={cx} cy={cy} r={2.5} fill={MAG}/>
    </g>
  );

  return (
    <div ref={cardRef} style={{
      width:540, height:540, flexShrink:0, position:"relative", overflow:"hidden",
      background:"#FFFFFF", fontFamily:"Georgia,'Times New Roman',serif",
    }}>
      {/* ── Black masthead ── */}
      <div style={{ position:"absolute",top:0,left:0,right:0,height:56,background:"#0D0D0D" }}/>
      {/* ── Magenta rule ── */}
      <div style={{ position:"absolute",top:56,left:0,right:0,height:4,background:MAG }}/>

      {/* Masthead text */}
      <div style={{ position:"absolute",top:0,left:0,right:0,height:56,
        display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 24px",zIndex:3 }}>
        <div>
          <div style={{ fontSize:6,letterSpacing:5,color:"rgba(255,255,255,0.45)",fontFamily:"'Roboto Mono',monospace",fontStyle:"normal",marginBottom:3 }}>
            BIO-PERFORMANCE REPORT
          </div>
          <div style={{ fontSize:14,letterSpacing:2,color:"#fff",fontStyle:"italic",fontWeight:400 }}>
            {nick||"Performance Report"}
          </div>
        </div>
        <div style={{ textAlign:"right",display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4 }}>
          {isVerified && (
            <div style={{ display:"inline-flex",alignItems:"center",gap:5,
              padding:"3px 8px",background:"rgba(232,0,90,0.18)",border:`1px solid ${MAG}`,borderRadius:2 }}>
              <span style={{ fontSize:6,letterSpacing:2,color:"#fff",fontFamily:"'Roboto Mono',monospace",fontWeight:700 }}>◈ VERIFIED DATA</span>
            </div>
          )}
          <div style={{ fontSize:6,color:"rgba(255,255,255,0.38)",letterSpacing:1,fontFamily:"'Roboto Mono',monospace",fontStyle:"normal" }}>{TODAY}</div>
        </div>
      </div>

      {/* Body */}
      <div style={{ position:"relative",zIndex:1,padding:"70px 24px 16px",height:"100%",display:"flex",flexDirection:"column" }}>
        {/* Two-column layout */}
        <div style={{ display:"grid",gridTemplateColumns:"160px 1fr",gap:20,flex:1,minHeight:0 }}>

          {/* LEFT — score + metrics table */}
          <div style={{ display:"flex",flexDirection:"column",justifyContent:"space-between",
            borderRight:"1px solid #e4e4e4",paddingRight:18 }}>
            <div>
              <div style={{ fontSize:7,letterSpacing:3,color:"#bbb",marginBottom:5,fontFamily:"'Roboto Mono',monospace",fontStyle:"normal" }}>
                PERFORMANCE INDEX
              </div>
              <div style={{ fontSize:88,fontWeight:400,lineHeight:0.82,fontStyle:"italic",
                color:"#0D0D0D",letterSpacing:-5 }}>{score}</div>
              <div style={{ marginTop:12,fontSize:10,letterSpacing:4,color:MAG,
                fontFamily:"'Roboto Mono',monospace",fontStyle:"normal",fontWeight:700 }}>
                {grade.label}
              </div>
              <div style={{ marginTop:6,width:32,height:3,background:MAG }}/>
              {age && (
                <div style={{ marginTop:8,fontSize:8,color:"#bbb",letterSpacing:2,
                  fontFamily:"'Roboto Mono',monospace",fontStyle:"normal" }}>{age} yrs</div>
              )}
              {/* Efficiency */}
              <div style={{ marginTop:16,padding:"8px 0",borderTop:"1px solid #eee" }}>
                <div style={{ fontSize:6,letterSpacing:2,color:"#bbb",marginBottom:3,fontFamily:"'Roboto Mono',monospace" }}>EFFICIENCY RATIO</div>
                <div style={{ fontSize:18,fontStyle:"italic",color:"#222",letterSpacing:-1 }}>{eff.value}</div>
                <div style={{ fontSize:7,color:MAG,letterSpacing:2,fontFamily:"'Roboto Mono',monospace" }}>{eff.label}</div>
              </div>
            </div>

            {/* Metrics editorial table */}
            <div style={{ borderTop:"1px solid #eee",paddingTop:10 }}>
              {METRICS.map(m=>(
                <div key={m.key} style={{ display:"flex",justifyContent:"space-between",
                  alignItems:"baseline",marginBottom:7,borderBottom:"1px solid #f5f5f5",paddingBottom:6 }}>
                  <span style={{ fontSize:7,letterSpacing:1,color:"#aaa",fontFamily:"'Roboto Mono',monospace",fontStyle:"normal" }}>
                    {m.label}
                  </span>
                  <span style={{ fontSize:13,fontStyle:"italic",color:"#111" }}>
                    {m.key==="strain"?Number(rawValues[m.key]).toFixed(1):rawValues[m.key]}
                    <span style={{ fontSize:7,color:"#bbb",fontStyle:"normal",marginLeft:2,fontFamily:"'Roboto Mono',monospace" }}>{m.unit}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT — radar only */}
          <div style={{ display:"flex",flexDirection:"column" }}>
            <div style={{ flex:1,minHeight:0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} margin={{ top:8,right:16,bottom:8,left:16 }}>
                  <defs>
                    <radialGradient id="radarFillA" cx="50%" cy="50%" r="50%">
                      <stop offset="0%"   stopColor={MAG} stopOpacity={0.18}/>
                      <stop offset="55%"  stopColor={MAG} stopOpacity={0.10}/>
                      <stop offset="100%" stopColor={MAG} stopOpacity={0.02}/>
                    </radialGradient>
                  </defs>
                  <PolarGrid stroke="#ebebeb"/>
                  <PolarAngleAxis dataKey="subject"
                    tick={{ fill:"#bbb",fontSize:8,fontFamily:"'Roboto Mono',monospace",letterSpacing:1 }}/>
                  <Radar dataKey="value" stroke={MAG} strokeWidth={2.5}
                    fill="url(#radarFillA)" dot={<Dot/>}/>
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop:10,paddingTop:8,borderTop:"1px solid #ebebeb",
          display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <span style={{ fontSize:8,color:"#222",letterSpacing:3,fontFamily:"'Roboto Mono',monospace",fontWeight:700 }}>{BRAND}</span>
          <span style={{ fontSize:6,color:"#ccc",letterSpacing:1,fontFamily:"'Roboto Mono',monospace" }}>
            {isVerified ? AUTH_ID : ""}
          </span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  B · ROSÉ LUXURY   Chocolate × Rose Gold — Status
// ═══════════════════════════════════════════════════════════════════════════════
function CardB({ radarData, rawValues, score, grade, nick, age, isVerified, cardRef }) {
  const GOLD  = "#C9956A";
  const ROSE  = "#E8B4A0";
  const CREAM = "#F5EDE6";
  const BG    = "#1A1008";
  const eff   = effRatio(rawValues);

  const Dot = ({ cx, cy }) => (
    <g>
      <circle cx={cx} cy={cy} r={8}  fill="none" stroke={GOLD} strokeWidth={1} opacity={0.4}/>
      <circle cx={cx} cy={cy} r={4}  fill={BG}   stroke={GOLD} strokeWidth={1.5}/>
      <circle cx={cx} cy={cy} r={1.5} fill={GOLD}/>
    </g>
  );

  return (
    <div ref={cardRef} style={{
      width:540, height:540, flexShrink:0, position:"relative", overflow:"hidden",
      background:`linear-gradient(160deg,#1A1008 0%,#120D07 55%,#1E1208 100%)`,
      fontFamily:"Georgia,'Times New Roman',serif",
    }}>
      {/* Subtle diagonal weave */}
      <div style={{ position:"absolute",inset:0,opacity:0.022,
        backgroundImage:"repeating-linear-gradient(45deg,#C9956A 0,#C9956A 1px,transparent 0,transparent 50%)",
        backgroundSize:"8px 8px" }}/>

      {/* Double frame */}
      <div style={{ position:"absolute",inset:12,border:`1px solid ${GOLD}38`,pointerEvents:"none" }}/>
      <div style={{ position:"absolute",inset:15,border:`1px solid ${GOLD}14`,pointerEvents:"none" }}/>

      {/* Corner ornaments */}
      {[[false,false],[true,false],[false,true],[true,true]].map(([r,b],i)=>(
        <div key={i} style={{ position:"absolute",width:22,height:22,
          top:b?undefined:10, bottom:b?10:undefined,
          left:r?undefined:10, right:r?10:undefined,
          borderTop:    !b?`2px solid ${GOLD}68`:"none",
          borderBottom:  b?`2px solid ${GOLD}68`:"none",
          borderLeft:   !r?`2px solid ${GOLD}68`:"none",
          borderRight:   r?`2px solid ${GOLD}68`:"none",
        }}/>
      ))}

      <div style={{ position:"relative",zIndex:2,padding:"30px 28px 18px",height:"100%",display:"flex",flexDirection:"column" }}>

        {/* Header */}
        <div style={{ textAlign:"center",marginBottom:10 }}>
          <div style={{ fontSize:8,letterSpacing:6,color:`${GOLD}78`,marginBottom:5,
            fontFamily:"'Roboto Mono',monospace",fontStyle:"normal" }}>✦ {BRAND} ✦</div>
          <div style={{ fontSize:nick?20:13,letterSpacing:3,color:CREAM,fontStyle:"italic",fontWeight:400 }}>
            {nick||"Your Name"}
          </div>
          {age && (
            <div style={{ fontSize:8,letterSpacing:3,color:`${ROSE}88`,marginTop:3,
              fontFamily:"'Roboto Mono',monospace",fontStyle:"normal" }}>{age} years</div>
          )}
        </div>

        {/* Score */}
        <div style={{ textAlign:"center",marginBottom:4 }}>
          <div style={{ fontSize:7,letterSpacing:4,color:`${GOLD}60`,marginBottom:3,
            fontFamily:"'Roboto Mono',monospace",fontStyle:"normal" }}>PERFORMANCE INDEX</div>
          <div style={{ fontSize:72,fontWeight:400,lineHeight:1,color:GOLD,letterSpacing:-2,fontStyle:"italic" }}>
            {score}
          </div>
          <div style={{ fontSize:10,letterSpacing:5,color:ROSE,marginTop:4,
            fontFamily:"'Roboto Mono',monospace",fontStyle:"normal" }}>{grade.label}</div>
          <div style={{ width:36,height:1,background:GOLD,margin:"7px auto 0",opacity:0.5 }}/>
        </div>

        {/* Radar */}
        <div style={{ flex:1,minHeight:0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} margin={{ top:4,right:22,bottom:4,left:22 }}>
              <defs>
                <radialGradient id="radarFillB" cx="50%" cy="50%" r="50%">
                  <stop offset="0%"   stopColor={GOLD} stopOpacity={0.40}/>
                  <stop offset="50%"  stopColor={ROSE} stopOpacity={0.18}/>
                  <stop offset="100%" stopColor={GOLD} stopOpacity={0.04}/>
                </radialGradient>
              </defs>
              <PolarGrid stroke={`${GOLD}18`}/>
              <PolarAngleAxis dataKey="subject"
                tick={{ fill:ROSE, fontSize:8,fontFamily:"'Roboto Mono',monospace",letterSpacing:1 }}/>
              <Radar dataKey="value" stroke={GOLD} strokeWidth={1.5}
                fill="url(#radarFillB)" dot={<Dot/>}/>
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Metrics — high-contrast readable */}
        <div style={{ display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:5,marginTop:8 }}>
          {METRICS.map(m=>(
            <div key={m.key} style={{ textAlign:"center",padding:"7px 3px",
              borderTop:`1px solid ${GOLD}45` }}>
              <div style={{ fontSize:13,fontWeight:400,color:CREAM,fontStyle:"italic",lineHeight:1 }}>
                {m.key==="strain"?Number(rawValues[m.key]).toFixed(1):rawValues[m.key]}
              </div>
              <div style={{ fontSize:7,color:ROSE,letterSpacing:1,marginTop:3,
                fontFamily:"'Roboto Mono',monospace",fontStyle:"normal" }}>{m.unit||"—"}</div>
              <div style={{ fontSize:7,color:GOLD,letterSpacing:1,marginTop:1,
                fontFamily:"'Roboto Mono',monospace",fontStyle:"normal" }}>{m.label}</div>
            </div>
          ))}
        </div>

        {/* Efficiency + Verified row */}
        <div style={{ marginTop:8,display:"flex",justifyContent:"space-between",alignItems:"center",
          padding:"5px 0",borderTop:`1px solid ${GOLD}28` }}>
          <span style={{ fontSize:7,color:GOLD,letterSpacing:2,fontFamily:"'Roboto Mono',monospace",fontStyle:"normal" }}>
            EFF {eff.value} · {eff.label}
          </span>
          {isVerified && (
            <div style={{ display:"inline-flex",alignItems:"center",gap:4,
              padding:"2px 7px",border:`1px solid ${GOLD}60`,
              background:`${GOLD}12` }}>
              <span style={{ fontSize:6,letterSpacing:2,color:GOLD,fontFamily:"'Roboto Mono',monospace",fontWeight:700 }}>
                ◈ VERIFIED DATA
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ marginTop:7,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <span style={{ fontSize:8,color:GOLD,letterSpacing:3,fontFamily:"'Roboto Mono',monospace",
            fontStyle:"normal",fontWeight:700 }}>{BRAND}</span>
          <span style={{ fontSize:7,color:`${GOLD}70`,letterSpacing:1,
            fontFamily:"'Roboto Mono',monospace",fontStyle:"normal" }}>
            {isVerified?AUTH_ID:TODAY}
          </span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  C · CYBERPUNK ELITE   Black × Cyan × Purple — Tactical
// ═══════════════════════════════════════════════════════════════════════════════
function CardC({ radarData, rawValues, score, grade, nick, age, isVerified, cardRef }) {
  const CYAN   = "#00F2FF";
  const PURPLE = "#7B61FF";
  const eff    = effRatio(rawValues);

  const Dot = ({ cx, cy }) => (
    <g filter="url(#glowC)">
      <circle cx={cx} cy={cy} r={10} fill={`${CYAN}10`}/>
      <circle cx={cx} cy={cy} r={5}  fill="#000" stroke={CYAN} strokeWidth={1.5}/>
      <circle cx={cx} cy={cy} r={2}  fill={CYAN}/>
    </g>
  );

  const corners = [
    { top:0,left:0,   borderTop:`1px solid ${CYAN}70`,borderLeft:`1px solid ${CYAN}70` },
    { top:0,right:0,  borderTop:`1px solid ${CYAN}70`,borderRight:`1px solid ${CYAN}70` },
    { bottom:0,left:0,  borderBottom:`1px solid ${CYAN}70`,borderLeft:`1px solid ${CYAN}70` },
    { bottom:0,right:0, borderBottom:`1px solid ${CYAN}70`,borderRight:`1px solid ${CYAN}70` },
  ];

  return (
    <div ref={cardRef} style={{
      width:540, height:540, flexShrink:0, position:"relative", overflow:"hidden",
      background:"linear-gradient(135deg,#000000 0%,#06040e 100%)",
      border:`1px solid ${CYAN}22`, fontFamily:"'Roboto Mono',monospace",
    }}>
      {/* Scan-line overlay */}
      <div style={{ position:"absolute",inset:0,pointerEvents:"none",
        background:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,242,255,0.013) 2px,rgba(0,242,255,0.013) 4px)" }}/>

      {/* SVG defs for glow */}
      <svg style={{ position:"absolute",width:0,height:0 }}>
        <defs>
          <filter id="glowC" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
      </svg>

      {/* Corner accents */}
      {corners.map((s,i)=>(
        <div key={i} style={{ position:"absolute",width:18,height:18,...s }}/>
      ))}

      <div style={{ position:"relative",zIndex:2,padding:"24px 24px 16px",height:"100%",display:"flex",flexDirection:"column" }}>

        {/* Header */}
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10 }}>
          <div>
            <div style={{ fontSize:7,letterSpacing:4,color:`${CYAN}68`,marginBottom:4 }}>BIO-PERFORMANCE RADAR</div>
            <div style={{ fontFamily:"'Oswald',sans-serif",fontSize:nick?18:12,letterSpacing:2,fontWeight:700,
              color:nick?"#fff":"rgba(255,255,255,0.2)" }}>
              {nick||"YOUR_HANDLE"}
              {age&&<span style={{ fontSize:10,color:"rgba(255,255,255,0.32)",marginLeft:6 }}>{age}Y</span>}
            </div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontFamily:"'Oswald',sans-serif",fontSize:48,fontWeight:700,lineHeight:1,
              color:grade.color,textShadow:`0 0 24px ${grade.color}80` }}>{score}</div>
            <div style={{ fontSize:8,letterSpacing:3,color:grade.color,marginTop:2 }}>{grade.label}</div>
            <div style={{ fontSize:6,color:"rgba(255,255,255,0.2)",letterSpacing:1,marginTop:1 }}>BIO-SCORE</div>
          </div>
        </div>

        {/* Radar */}
        <div style={{ flex:1,minHeight:0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} margin={{ top:8,right:24,bottom:8,left:24 }}>
              <defs>
                <radialGradient id="radarFillC" cx="50%" cy="50%" r="50%">
                  <stop offset="0%"   stopColor={CYAN}   stopOpacity={0.28}/>
                  <stop offset="55%"  stopColor={PURPLE} stopOpacity={0.14}/>
                  <stop offset="100%" stopColor={CYAN}   stopOpacity={0.03}/>
                </radialGradient>
              </defs>
              <PolarGrid stroke={`${CYAN}13`}/>
              <PolarAngleAxis dataKey="subject"
                tick={{ fill:`${CYAN}58`,fontSize:8,fontFamily:"'Roboto Mono',monospace",letterSpacing:1 }}/>
              <Radar dataKey="value" stroke={CYAN} strokeWidth={1.5}
                fill="url(#radarFillC)" dot={<Dot/>}/>
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Pills */}
        <div style={{ display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:4,marginTop:8 }}>
          {METRICS.map(m=>(
            <div key={m.key} style={{ textAlign:"center",padding:"6px 2px",
              background:`${CYAN}07`,border:`1px solid ${CYAN}20`,
              display:"flex",flexDirection:"column",alignItems:"center",gap:2 }}>
              <span style={{ fontSize:9,color:CYAN }}>{m.icon}</span>
              <span style={{ fontFamily:"'Oswald',sans-serif",fontSize:13,fontWeight:700,color:"#fff",lineHeight:1 }}>
                {m.key==="strain"?Number(rawValues[m.key]).toFixed(1):rawValues[m.key]}
              </span>
              <span style={{ fontSize:5,color:"rgba(255,255,255,0.36)",letterSpacing:0.5 }}>{m.unit||"idx"}</span>
              <span style={{ fontSize:5,color:"rgba(255,255,255,0.28)",letterSpacing:0.8 }}>{m.label}</span>
            </div>
          ))}
        </div>

        {/* Efficiency */}
        <div style={{ marginTop:8,display:"flex",justifyContent:"space-between",alignItems:"center",
          padding:"5px 0",borderTop:`1px solid ${CYAN}14` }}>
          <span style={{ fontSize:7,color:`${CYAN}70`,letterSpacing:2 }}>
            EFFICIENCY {eff.value} · {eff.label}
          </span>
          {isVerified && (
            <div style={{ display:"inline-flex",alignItems:"center",gap:4,
              padding:"2px 7px",border:`1px solid ${CYAN}50`,background:`${CYAN}0e` }}>
              <span style={{ fontSize:6,letterSpacing:2,color:CYAN,fontWeight:700 }}>◈ VERIFIED DATA</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ marginTop:7,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <span style={{ fontSize:8,color:`${CYAN}55`,letterSpacing:3,fontWeight:700 }}>{BRAND}</span>
          <span style={{ fontSize:6,color:"rgba(255,255,255,0.18)",letterSpacing:2 }}>
            {isVerified?AUTH_ID:TODAY}
          </span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  D · BAUHAUS SPORT   Asymmetric split — Executive
// ═══════════════════════════════════════════════════════════════════════════════
function CardD({ radarData, rawValues, score, grade, nick, age, isVerified, cardRef }) {
  // Grade accent drives the whole card palette
  const GC  = grade.label==="OPTIMAL"?"#D4FF00":grade.label==="BALANCED"?"#FF9500":"#FF2D55";
  const eff = effRatio(rawValues);

  const Dot = ({ cx, cy }) => <circle cx={cx} cy={cy} r={3.5} fill="#fff"/>;

  return (
    <div ref={cardRef} style={{
      width:540, height:540, flexShrink:0, position:"relative", overflow:"hidden",
      background:"#080808", fontFamily:"'Oswald','Arial Black',sans-serif",
    }}>
      {/* Top rule */}
      <div style={{ position:"absolute",top:0,left:0,right:0,height:5,background:GC }}/>

      {/* LEFT block — score (40% width) */}
      <div style={{ position:"absolute",top:0,left:0,bottom:0,width:216,
        background:`linear-gradient(170deg,${GC}18 0%,transparent 50%)`,
        borderRight:`1px solid rgba(255,255,255,0.06)`,
        display:"flex",flexDirection:"column",justifyContent:"space-between",
        padding:"28px 18px 18px" }}>

        <div>
          <div style={{ fontSize:7,letterSpacing:4,color:"rgba(255,255,255,0.28)",
            fontFamily:"'Roboto Mono',monospace",marginBottom:3 }}>PERFORMANCE</div>
          <div style={{ fontSize:7,letterSpacing:4,color:"rgba(255,255,255,0.28)",
            fontFamily:"'Roboto Mono',monospace" }}>INDEX</div>
        </div>

        {/* Giant score */}
        <div>
          <div style={{ fontSize:112,fontWeight:700,lineHeight:0.83,color:GC,letterSpacing:-5,
            textShadow:`3px 3px 0 rgba(0,0,0,0.6)` }}>{score}</div>
          <div style={{ marginTop:12,fontSize:13,letterSpacing:5,color:"rgba(255,255,255,0.85)",
            fontWeight:700 }}>{grade.label}</div>
          <div style={{ marginTop:5,width:36,height:4,background:GC }}/>
        </div>

        {/* Identity + branding */}
        <div>
          <div style={{ fontSize:14,letterSpacing:1,color:"#fff",fontWeight:700,marginBottom:2 }}>
            {nick||"—"}
          </div>
          {age && (
            <div style={{ fontSize:9,letterSpacing:2,color:"rgba(255,255,255,0.32)",
              fontFamily:"'Roboto Mono',monospace" }}>{age} YRS</div>
          )}
          <div style={{ marginTop:12,fontSize:8,color:GC,letterSpacing:3,
            fontFamily:"'Roboto Mono',monospace",fontWeight:700 }}>{BRAND}</div>
          {isVerified && (
            <div style={{ marginTop:4,fontSize:6,letterSpacing:2,color:`${GC}90`,
              fontFamily:"'Roboto Mono',monospace" }}>◈ VERIFIED DATA · {AUTH_ID}</div>
          )}
          <div style={{ marginTop:6,fontSize:6,letterSpacing:2,color:"rgba(255,255,255,0.16)",
            fontFamily:"'Roboto Mono',monospace" }}>{TODAY}</div>
        </div>
      </div>

      {/* RIGHT block — radar + bars */}
      <div style={{ position:"absolute",top:0,right:0,bottom:0,left:216,
        display:"flex",flexDirection:"column",padding:"22px 16px 16px 14px" }}>

        {/* Radar — ultra-crisp with solid mid-grey fill */}
        <div style={{ flex:1,minHeight:0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} margin={{ top:4,right:10,bottom:4,left:10 }}>
              <defs>
                <linearGradient id="radarFillD" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%"   stopColor={GC}  stopOpacity={0.25}/>
                  <stop offset="100%" stopColor={GC}  stopOpacity={0.07}/>
                </linearGradient>
              </defs>
              <PolarGrid stroke="rgba(255,255,255,0.09)"/>
              <PolarAngleAxis dataKey="subject"
                tick={{ fill:"rgba(255,255,255,0.38)",fontSize:7,fontFamily:"'Roboto Mono',monospace",letterSpacing:1 }}/>
              <Radar dataKey="value" stroke={GC} strokeWidth={2}
                fill="url(#radarFillD)" dot={<Dot/>}/>
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Metric progress bars */}
        <div style={{ display:"flex",flexDirection:"column",gap:7,marginTop:6 }}>
          {METRICS.map(m=>{
            const pct = m.toRadar(rawValues[m.key]);
            return (
              <div key={m.key} style={{ display:"flex",alignItems:"center",gap:8 }}>
                <span style={{ fontSize:8,letterSpacing:1,color:"rgba(255,255,255,0.3)",
                  fontFamily:"'Roboto Mono',monospace",width:54,flexShrink:0 }}>{m.label}</span>
                <div style={{ flex:1,height:2,background:"rgba(255,255,255,0.08)",borderRadius:1 }}>
                  <div style={{ width:`${pct}%`,height:"100%",background:GC,borderRadius:1 }}/>
                </div>
                <span style={{ fontSize:9,fontWeight:700,color:"#fff",
                  fontFamily:"'Roboto Mono',monospace",width:36,textAlign:"right",flexShrink:0 }}>
                  {m.key==="strain"?Number(rawValues[m.key]).toFixed(1):rawValues[m.key]}
                  <span style={{ fontSize:6,color:"rgba(255,255,255,0.28)",marginLeft:1 }}>{m.unit}</span>
                </span>
              </div>
            );
          })}
        </div>

        {/* Efficiency */}
        <div style={{ marginTop:10,padding:"5px 0",borderTop:`1px solid rgba(255,255,255,0.07)` }}>
          <span style={{ fontSize:7,letterSpacing:2,color:"rgba(255,255,255,0.28)",
            fontFamily:"'Roboto Mono',monospace" }}>
            EFF. {eff.value} · {eff.label}
          </span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  E · NEON TOKYO   Film grain × Magenta block × Kanji — Viral
// ═══════════════════════════════════════════════════════════════════════════════
function CardE({ radarData, rawValues, score, grade, nick, age, isVerified, cardRef }) {
  const MAG  = "#E8005A";
  const YELL = "#F5E800";
  const KANJI = { OPTIMAL:"最適", BALANCED:"均衡", FATIGUED:"疲労" };
  const eff  = effRatio(rawValues);

  const Dot = ({ cx, cy }) => (
    <g>
      <circle cx={cx} cy={cy} r={6} fill={YELL} opacity={0.92}/>
      <circle cx={cx} cy={cy} r={2.5} fill="#0D0D0D"/>
    </g>
  );

  return (
    <div ref={cardRef} style={{
      width:540, height:540, flexShrink:0, position:"relative", overflow:"hidden",
      background:"#0D0D0D", fontFamily:"'Roboto Mono',monospace",
    }}>
      {/* Film grain */}
      <div style={{ position:"absolute",inset:0,pointerEvents:"none",opacity:0.045,
        backgroundImage:`url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        backgroundSize:"200px 200px" }}/>

      {/* MAGENTA TOP BLOCK */}
      <div style={{ position:"absolute",top:0,left:0,right:0,height:172,background:MAG }}>
        {/* Kanji watermark */}
        <div style={{ position:"absolute",right:10,top:2,fontFamily:"serif",fontSize:96,fontWeight:900,
          color:"rgba(0,0,0,0.10)",lineHeight:1,pointerEvents:"none",userSelect:"none",letterSpacing:-4 }}>
          {KANJI[grade.label]||"最適"}
        </div>

        {/* BRAND inside magenta — white, max visibility */}
        <div style={{ position:"absolute",bottom:0,left:0,right:0,
          display:"flex",justifyContent:"space-between",alignItems:"center",
          padding:"8px 20px 12px" }}>
          <span style={{ fontSize:10,letterSpacing:4,color:"rgba(255,255,255,0.92)",fontWeight:700 }}>{BRAND}</span>
          {isVerified && (
            <span style={{ fontSize:7,letterSpacing:2,color:"rgba(255,255,255,0.85)" }}>
              ◈ VERIFIED DATA · {AUTH_ID}
            </span>
          )}
        </div>

        {/* Score content */}
        <div style={{ padding:"14px 20px 0" }}>
          <div style={{ fontSize:7,letterSpacing:4,color:"rgba(255,255,255,0.62)",marginBottom:4 }}>
            BIO-PERFORMANCE RADAR
          </div>
          <div style={{ display:"flex",alignItems:"flex-end",gap:14 }}>
            <div style={{ fontFamily:"'Oswald',sans-serif",fontSize:88,fontWeight:700,lineHeight:0.85,
              color:"#fff",letterSpacing:-5,textShadow:"2px 2px 0 rgba(0,0,0,0.20)" }}>{score}</div>
            <div style={{ paddingBottom:8 }}>
              <div style={{ fontFamily:"'Oswald',sans-serif",fontSize:16,letterSpacing:4,
                color:"rgba(255,255,255,0.90)",fontWeight:700 }}>{grade.label}</div>
              <div style={{ fontSize:9,color:"rgba(255,255,255,0.68)",letterSpacing:2,marginTop:2 }}>
                {nick||"YOUR_HANDLE"}{age&&<span style={{ opacity:0.7 }}> · {age}</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Diagonal cut */}
      <div style={{ position:"absolute",top:150,left:0,right:0,height:44,
        background:"#0D0D0D",clipPath:"polygon(0 44px,100% 0,100% 44px,0 44px)",zIndex:1 }}/>

      {/* BODY */}
      <div style={{ position:"absolute",top:172,left:0,right:0,bottom:0,zIndex:2,padding:"8px 18px 16px" }}>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,height:"100%" }}>

          {/* Radar — neon yellow fill */}
          <div style={{ display:"flex",flexDirection:"column" }}>
            <div style={{ flex:1 }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} margin={{ top:4,right:14,bottom:4,left:14 }}>
                  <defs>
                    <radialGradient id="radarFillE" cx="50%" cy="50%" r="50%">
                      <stop offset="0%"   stopColor={YELL} stopOpacity={0.55}/>
                      <stop offset="100%" stopColor={YELL} stopOpacity={0.12}/>
                    </radialGradient>
                  </defs>
                  <PolarGrid stroke="rgba(255,255,255,0.08)"/>
                  <PolarAngleAxis dataKey="subject"
                    tick={{ fill:"rgba(255,255,255,0.34)",fontSize:7,fontFamily:"'Roboto Mono',monospace",letterSpacing:0 }}/>
                  <Radar dataKey="value" stroke={YELL} strokeWidth={2}
                    fill="url(#radarFillE)" dot={<Dot/>}/>
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ fontSize:7,letterSpacing:1,color:"rgba(255,255,255,0.28)",marginTop:4,lineHeight:1.6 }}>
              <span style={{ color:YELL }}>EFF </span>{eff.value} · {eff.label}
            </div>
          </div>

          {/* Metric stack */}
          <div style={{ display:"flex",flexDirection:"column",gap:5,justifyContent:"center" }}>
            {METRICS.map(m=>{
              const pct = m.toRadar(rawValues[m.key]);
              return (
                <div key={m.key} style={{ display:"flex",alignItems:"stretch",overflow:"hidden",
                  background:"rgba(255,255,255,0.035)" }}>
                  <div style={{ width:3,background:MAG,opacity:Math.max(0.25, pct/100) }}/>
                  <div style={{ flex:1,padding:"5px 9px",display:"flex",
                    justifyContent:"space-between",alignItems:"center" }}>
                    <span style={{ fontSize:7,letterSpacing:2,color:"rgba(255,255,255,0.36)" }}>{m.label}</span>
                    <span style={{ fontFamily:"'Oswald',sans-serif",fontSize:13,fontWeight:700,color:"#fff" }}>
                      {m.key==="strain"?Number(rawValues[m.key]).toFixed(1):rawValues[m.key]}
                      <span style={{ fontSize:6,color:"rgba(255,255,255,0.28)",marginLeft:2 }}>{m.unit}</span>
                    </span>
                  </div>
                </div>
              );
            })}
            <div style={{ marginTop:5,fontSize:6,letterSpacing:2,color:"rgba(255,255,255,0.15)",textAlign:"right" }}>
              {TODAY}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  THEME REGISTRY — Order: CyberPunk · Vogue · Bauhaus · Rosé Luxury · Neon
// ═══════════════════════════════════════════════════════════════════════════════
const THEMES = [
  { id:"C", name:"CyberPunk",   tagline:"Black · Cyan Neon · Tactical",     Component:CardC },
  { id:"A", name:"Vogue",       tagline:"White · Magenta · Authority",       Component:CardA },
  { id:"D", name:"Bauhaus",     tagline:"Asymmetric · Bold · Executive",     Component:CardD },
  { id:"B", name:"Rosé Luxury", tagline:"Chocolate · Gold · Status",         Component:CardB },
  { id:"E", name:"Neon Tokyo",  tagline:"Film · Magenta Block · Viral",      Component:CardE },
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
  const [mode,       setMode]       = useState("manual"); // "manual" | "upload"
  const [dragOver,   setDragOver]   = useState(false);
  const [parseError, setParseError] = useState(null);
  const [history,    setHistory]    = useState(() => loadHistory());
  const [exportSt,   setExportSt]   = useState({});
  const cardRefs = useRef({});

  const radarData = useMemo(()=>
    METRICS.map(m=>({ subject:m.label, value:m.toRadar(rawValues[m.key]), fullMark:100 })),
    [rawValues]
  );
  const score = useMemo(()=>getBioScore(rawValues), [rawValues]);
  const grade = getGrade(score);
  const eff   = effRatio(rawValues);

  // ── CSV handling ────────────────────────────────────────────────────────────
  const processFile = useCallback((file) => {
    setParseError(null);
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = parseCSV(e.target.result);
      if (result.error) { setParseError(result.error); return; }
      const { history:hist, source:_s, error:_e, ...vals } = result;
      setRawValues({ hrv:vals.hrv, recovery:vals.recovery, sleep:vals.sleep, strain:vals.strain, rhr:vals.rhr });
      setIsVerified(true);
      if (hist) setHistory(hist);
      setMode("manual");
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback((e)=>{
    e.preventDefault(); setDragOver(false);
    processFile(e.dataTransfer.files[0]);
  },[processFile]);

  const openPicker = ()=>{
    const inp = document.createElement("input");
    inp.type="file"; inp.accept=".csv";
    inp.onchange = e=>processFile(e.target.files[0]);
    inp.click();
  };

  const handleSlider = (key, val)=>{
    setRawValues(v=>({...v,[key]:Number(val)}));
    setIsVerified(false);
  };

  // ── Export ──────────────────────────────────────────────────────────────────
  const doExport = async (themeId) => {
    const el = cardRefs.current[themeId];
    if (!el || exportSt[themeId]==="loading") return;
    setExportSt(s=>({...s,[themeId]:"loading"}));
    try {
      const isLight = themeId==="A";
      const png = await toPng(el, {
        width:540, height:540, pixelRatio:2,
        backgroundColor: isLight?"#ffffff":"#000000",
      });
      const a = document.createElement("a");
      a.download = `bioradar-${themeId}-${(nick||"export").toLowerCase().replace(/\s+/g,"-")}.png`;
      a.href = png;
      a.click();
      setExportSt(s=>({...s,[themeId]:"done"}));
      setTimeout(()=>setExportSt(s=>({...s,[themeId]:"idle"})),2500);
    } catch(err) {
      console.error(err);
      setExportSt(s=>({...s,[themeId]:"idle"}));
    }
  };

  const activeTheme = THEMES.find(t=>t.id===activeId);
  const ActiveCard  = activeTheme.Component;
  const cardProps   = (id, ref) => ({ radarData, rawValues, score, grade, nick, age, isVerified, cardRef:ref });

  const SLIDER_COLORS = ["#00F2FF","#00D97E","#7B61FF","#FF6B35","#FF2D78"];

  return (
    <div style={{ minHeight:"100vh", background:"#040404", color:"#fff",
      fontFamily:"'Roboto Mono','Courier New',monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@300;400;700&family=Oswald:wght@700&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px;height:3px}
        ::-webkit-scrollbar-thumb{background:rgba(0,242,255,0.22);border-radius:2px}
        input[type=range]{-webkit-appearance:none;height:2px;border-radius:1px;outline:none;cursor:pointer;width:100%;display:block}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;border:2px solid currentColor;background:#040404;cursor:pointer;transition:transform .15s}
        input[type=range]::-webkit-slider-thumb:hover{transform:scale(1.3)}
        input[type=range]::-moz-range-thumb{width:14px;height:14px;border-radius:50%;border:2px solid currentColor;background:#040404;cursor:pointer}
        button{cursor:pointer}
        input::placeholder{color:rgba(255,255,255,0.18)}
        input:focus{outline:none}
        .tab{transition:all .18s}.tab:hover{border-color:rgba(255,255,255,0.35)!important;color:rgba(255,255,255,0.7)!important}
        .thumb{transition:transform .2s;cursor:pointer}.thumb:hover{transform:translateY(-3px)}
        .xbtn{transition:opacity .2s}.xbtn:hover:not(:disabled){opacity:.8}
      `}</style>

      <div style={{ maxWidth:1260,margin:"0 auto",padding:"28px 20px 70px" }}>

        {/* ── HEADER ── */}
        <header style={{ borderBottom:"1px solid rgba(255,255,255,0.07)",paddingBottom:20,marginBottom:28 }}>
          <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:8 }}>
            <div style={{ width:5,height:5,borderRadius:"50%",background:"#00F2FF",boxShadow:"0 0 8px #00F2FF" }}/>
            <span style={{ fontSize:9,letterSpacing:4,color:"rgba(0,242,255,0.65)" }}>FINAL BUILD · 5 THEMES</span>
          </div>
          <h1 style={{ fontFamily:"'Oswald',sans-serif",fontSize:"clamp(22px,3.4vw,40px)",fontWeight:700,letterSpacing:4,lineHeight:1.05 }}>
            {BRAND}
            <span style={{ fontSize:"0.42em",color:"rgba(255,255,255,0.22)",letterSpacing:3,
              verticalAlign:"middle",marginLeft:12,fontFamily:"'Roboto Mono',monospace" }}>
              BIO-PERFORMANCE RADAR
            </span>
          </h1>
          <p style={{ fontSize:9,color:"rgba(255,255,255,0.22)",letterSpacing:3,marginTop:6 }}>
            CYBERPUNK · VOGUE · BAUHAUS · ROSÉ LUXURY · NEON TOKYO
          </p>
        </header>

        <div style={{ display:"grid",gridTemplateColumns:"282px 1fr",gap:36,alignItems:"start" }}>

          {/* ════ LEFT PANEL ════ */}
          <div style={{ position:"sticky",top:24 }}>

            {/* Mode toggle */}
            <div style={{ display:"flex",marginBottom:18 }}>
              {["manual","upload"].map((m,i)=>(
                <button key={m} className="tab"
                  onClick={()=>setMode(m)}
                  style={{ flex:1,background:"transparent",fontFamily:"inherit",fontSize:9,letterSpacing:2,padding:"8px 0",
                    border:`1px solid ${mode===m?"rgba(0,242,255,0.55)":"rgba(255,255,255,0.1)"}`,
                    color:mode===m?"#00F2FF":"rgba(255,255,255,0.32)",
                    borderRight:i===0?"none":undefined }}>
                  {m==="manual"?"◈ MANUAL":"↑ CSV UPLOAD"}
                </button>
              ))}
            </div>

            {mode==="upload" ? (
              <div>
                <div style={{ display:"flex",gap:8,padding:"8px 10px",
                  background:"rgba(0,255,157,0.04)",border:"1px solid rgba(0,255,157,0.12)",
                  marginBottom:12,fontSize:8,color:"rgba(255,255,255,0.28)",letterSpacing:1,lineHeight:1.7 }}>
                  <span style={{ color:"#00FF9D",flexShrink:0 }}>⬡</span>
                  <span>Your file is parsed locally in-browser. No data leaves your device.</span>
                </div>
                {/* Drop zone */}
                <div
                  style={{ border:`1px dashed ${dragOver?"rgba(0,242,255,0.7)":"rgba(0,242,255,0.22)"}`,
                    padding:"34px 20px",textAlign:"center",cursor:"pointer",borderRadius:2,
                    background:dragOver?"rgba(0,242,255,0.04)":"transparent",
                    marginBottom:12,transition:"all .25s" }}
                  onDragOver={e=>{e.preventDefault();setDragOver(true)}}
                  onDragLeave={()=>setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={openPicker}>
                  <div style={{ fontSize:30,color:"rgba(0,242,255,0.32)",marginBottom:10 }}>⬡</div>
                  <p style={{ fontSize:11,letterSpacing:2,color:"rgba(255,255,255,0.48)",marginBottom:5 }}>DROP WEARABLE EXPORT</p>
                  <p style={{ fontSize:9,color:"rgba(255,255,255,0.22)",letterSpacing:1 }}>WHOOP · OURA · APPLE HEALTH</p>
                  <p style={{ fontSize:8,color:"rgba(255,255,255,0.14)",marginTop:6 }}>CSV accepted · click to browse</p>
                </div>
                {parseError && (
                  <p style={{ fontSize:9,color:"#FF6B35",letterSpacing:1,marginBottom:10,lineHeight:1.5 }}>⚠ {parseError}</p>
                )}
                {history.length>0 && (
                  <div style={{ padding:"10px 12px",background:"rgba(0,242,255,0.04)",
                    border:"1px solid rgba(0,242,255,0.12)",fontSize:8,letterSpacing:1,lineHeight:1.9 }}>
                    <div style={{ color:"rgba(0,242,255,0.65)",marginBottom:4 }}>
                      LAST {history.length} DAYS IN MEMORY
                    </div>
                    {history.slice(-3).reverse().map((d,i)=>(
                      <div key={i} style={{ display:"flex",justifyContent:"space-between",color:"rgba(255,255,255,0.36)" }}>
                        <span>{d.date||"—"}</span>
                        <span style={{ color:"rgba(255,255,255,0.58)" }}>REC {d.recovery}% HRV {d.hrv}ms</span>
                      </div>
                    ))}
                    <button onClick={()=>{clearHistory();setHistory([]);}}
                      style={{ marginTop:8,background:"none",border:"none",color:"rgba(255,100,100,0.5)",
                        fontSize:7,letterSpacing:2,cursor:"pointer",fontFamily:"inherit",padding:0 }}>
                      ✕ CLEAR HISTORY
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <p style={{ fontSize:8,letterSpacing:3,color:"rgba(255,255,255,0.24)",marginBottom:14 }}>YOUR METRICS</p>
                {METRICS.map((m,i)=>{
                  const raw   = rawValues[m.key];
                  const pct   = m.toRadar(raw);
                  const isF   = m.rawStep < 1;
                  const sc    = SLIDER_COLORS[i];
                  return (
                    <div key={m.key} style={{ marginBottom:20 }}>
                      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:6 }}>
                        <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                          <span style={{ color:sc,fontSize:12 }}>{m.icon}</span>
                          <span style={{ fontSize:10,letterSpacing:2,color:"rgba(255,255,255,0.62)" }}>{m.label}</span>
                        </div>
                        <div style={{ display:"flex",alignItems:"baseline",gap:3 }}>
                          <span style={{ fontFamily:"'Oswald',sans-serif",fontSize:20,fontWeight:700,color:sc }}>
                            {isF?Number(raw).toFixed(1):raw}
                          </span>
                          <span style={{ fontSize:8,color:"rgba(255,255,255,0.28)" }}>{m.unit}</span>
                        </div>
                      </div>
                      <input type="range" min={m.rawMin} max={m.rawMax} step={m.rawStep} value={raw}
                        onChange={e=>handleSlider(m.key,e.target.value)}
                        style={{ color:sc,
                          background:m.key==="rhr"
                            ?`linear-gradient(to left,${sc} ${pct}%,rgba(255,255,255,0.08) ${pct}%)`
                            :`linear-gradient(to right,${sc} ${pct}%,rgba(255,255,255,0.08) ${pct}%)` }}/>
                      {m.key==="rhr"    && <p style={{ fontSize:7,color:"rgba(255,45,120,0.4)",letterSpacing:1,marginTop:3 }}>↓ lower is better · 40 bpm = peak</p>}
                      {m.key==="strain" && <p style={{ fontSize:7,color:"rgba(255,107,53,0.4)",letterSpacing:1,marginTop:3 }}>Whoop scale 0.0 – 21.0</p>}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Identity */}
            <div style={{ borderTop:"1px solid rgba(255,255,255,0.06)",paddingTop:16,marginTop:4,
              display:"grid",gridTemplateColumns:"1fr 1fr",gap:14 }}>
              {[["NAME / HANDLE","YOUR_HANDLE","text",nick,v=>setNick(v)],
                ["AGE","—","number",age,v=>setAge(v)]].map(([lbl,ph,tp,val,fn])=>(
                <div key={lbl}>
                  <label style={{ fontSize:7,letterSpacing:2,color:"rgba(255,255,255,0.24)",display:"block",marginBottom:4 }}>{lbl}</label>
                  <input value={val} onChange={e=>fn(e.target.value)} placeholder={ph} type={tp}
                    style={{ background:"transparent",border:"none",borderBottom:"1px solid rgba(255,255,255,0.1)",
                      color:"#fff",fontFamily:"inherit",fontSize:11,width:"100%",padding:"3px 0",letterSpacing:1 }}/>
                </div>
              ))}
            </div>

            {/* Score card */}
            <div style={{ marginTop:18,padding:"14px",background:"rgba(255,255,255,0.02)",
              border:`1px solid ${grade.color}20` }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
                <div>
                  <p style={{ fontSize:7,letterSpacing:3,color:"rgba(255,255,255,0.2)",marginBottom:3 }}>BIO-SCORE</p>
                  <div style={{ fontFamily:"'Oswald',sans-serif",fontSize:38,fontWeight:700,
                    color:grade.color,textShadow:`0 0 16px ${grade.color}55` }}>{score}</div>
                  <p style={{ fontSize:8,letterSpacing:3,color:grade.color,marginTop:2 }}>{grade.label}</p>
                </div>
                <div style={{ textAlign:"right" }}>
                  <p style={{ fontSize:7,letterSpacing:2,color:"rgba(255,255,255,0.2)",marginBottom:3 }}>EFF. RATIO</p>
                  <div style={{ fontFamily:"'Oswald',sans-serif",fontSize:22,fontWeight:700,
                    color:"rgba(255,255,255,0.65)" }}>{eff.value}</div>
                  <p style={{ fontSize:7,letterSpacing:1,color:"rgba(255,255,255,0.3)",marginTop:2 }}>{eff.label}</p>
                </div>
              </div>
              <p style={{ fontSize:6,color:"rgba(255,255,255,0.14)",letterSpacing:1,marginTop:10,lineHeight:2 }}>
                HRV 25% · SLEEP 25% · RECOVERY 30% · RHR 20%<br/>STRAIN TRACKED — EXCLUDED FROM SCORE
              </p>
            </div>
          </div>

          {/* ════ RIGHT PANEL ════ */}
          <div>
            {/* Tab bar */}
            <div style={{ display:"flex",gap:5,marginBottom:18,flexWrap:"wrap" }}>
              {THEMES.map(t=>(
                <button key={t.id} className="tab"
                  onClick={()=>setActiveId(t.id)}
                  style={{ background:activeId===t.id?"rgba(255,255,255,0.07)":"transparent",
                    border:`1px solid ${activeId===t.id?"rgba(255,255,255,0.45)":"rgba(255,255,255,0.1)"}`,
                    color:activeId===t.id?"#fff":"rgba(255,255,255,0.32)",
                    padding:"6px 20px",fontFamily:"inherit",fontSize:9,letterSpacing:2 }}>
                  {t.name.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Active card preview */}
            <div style={{ marginBottom:22 }}>
              <div style={{ display:"flex",alignItems:"center",gap:14,marginBottom:12 }}>
                <div>
                  <p style={{ fontFamily:"'Oswald',sans-serif",fontSize:15,letterSpacing:3,color:"#fff" }}>
                    {activeTheme.name.toUpperCase()}
                  </p>
                  <p style={{ fontSize:8,color:"rgba(255,255,255,0.26)",letterSpacing:2,marginTop:2 }}>
                    {activeTheme.tagline}
                  </p>
                </div>
                <button className="xbtn"
                  onClick={()=>doExport(activeId)}
                  disabled={exportSt[activeId]==="loading"}
                  style={{ marginLeft:"auto",background:"transparent",
                    border:"1px solid rgba(255,255,255,0.38)",color:"#fff",
                    padding:"9px 24px",fontFamily:"inherit",fontSize:9,letterSpacing:3 }}>
                  {exportSt[activeId]==="done"    ? "✓ SAVED · 1080×1080" :
                   exportSt[activeId]==="loading" ? "⟳ RENDERING…"        :
                   "↓ EXPORT 1080×1080 PNG"}
                </button>
              </div>

              <div style={{ overflowX:"auto" }}>
                <ActiveCard {...cardProps(activeId, el=>{ cardRefs.current[activeId]=el; })} />
              </div>
            </div>

            {/* Thumbnails */}
            <p style={{ fontSize:7,letterSpacing:3,color:"rgba(255,255,255,0.16)",marginBottom:10 }}>
              OTHER THEMES · CLICK TO SWITCH
            </p>
            <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8 }}>
              {THEMES.filter(t=>t.id!==activeId).map(t=>{
                const TC = t.Component;
                return (
                  <div key={t.id} className="thumb"
                    onClick={()=>setActiveId(t.id)}
                    style={{ border:"1px solid rgba(255,255,255,0.07)",overflow:"hidden",
                      position:"relative",aspectRatio:"1/1" }}>
                    <div style={{ transform:"scale(0.215)",transformOrigin:"top left",
                      width:540,height:540,pointerEvents:"none" }}>
                      <TC {...cardProps(t.id, null)} />
                    </div>
                    <div style={{ position:"absolute",inset:0 }}/>
                    <div style={{ position:"absolute",bottom:0,left:0,right:0,padding:"4px 6px",
                      background:"rgba(0,0,0,0.88)",fontSize:7,letterSpacing:1,
                      color:"rgba(255,255,255,0.4)",
                      display:"flex",justifyContent:"space-between" }}>
                      <span>{t.name.toUpperCase()}</span>
                      <span style={{ color:"rgba(255,255,255,0.2)" }}>↗</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Privacy */}
            <div style={{ marginTop:16,display:"flex",alignItems:"center",gap:8,padding:"8px 12px",
              background:"rgba(0,255,157,0.03)",border:"1px solid rgba(0,255,157,0.1)" }}>
              <span style={{ color:"#00FF9D",fontSize:10 }}>⬡</span>
              <p style={{ fontSize:8,color:"rgba(255,255,255,0.2)",letterSpacing:1 }}>
                CLIENT-SIDE ONLY · YOUR HEALTH DATA NEVER LEAVES YOUR BROWSER · {BRAND}
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
