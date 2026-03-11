import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer } from "recharts";
import { toPng } from "html-to-image";
import { parseCSV, loadHistory, clearHistory } from "./parser.js";

// ─── DATA ────────────────────────────────────────────────────────────────────
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
const DEFAULT_RAW = Object.fromEntries(METRICS.map(m=>[m.key,m.rawDefault]));
const SC = ["#00F2FF","#00D97E","#7B61FF","#FF6B35","#FF2D78"];

const getBioScore = (raw) => {
  const hrv_n = METRICS[0].toRadar(raw.hrv);
  const rhr_n = METRICS[4].toRadar(raw.rhr);
  return Math.round(hrv_n*0.25 + Math.min(100,raw.sleep)*0.25 + Math.min(100,raw.recovery)*0.30 + rhr_n*0.20);
};
const getGrade = (s) =>
  s>=75 ? {label:"OPTIMAL", color:"#00D97E"} :
  s>=50 ? {label:"BALANCED",color:"#F5A623"} :
          {label:"FATIGUED",color:"#E8003D"};
const effRatio = (raw) => {
  if (!raw.recovery) return {value:"—",label:"—"};
  const v = raw.strain / Math.max(1,raw.recovery);
  return { value:v.toFixed(2), label:v<0.12?"UNDERTRAINED":v<0.20?"EFFICIENT":v<0.30?"LOADED":"OVERREACHED" };
};

const BRAND   = "BIORADAR.IO";
const AUTH_ID = "AUTH-" + Math.random().toString(36).slice(2,6).toUpperCase();
const TODAY   = new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}).toUpperCase();

// ─── CARD A · VOGUE ──────────────────────────────────────────────────────────
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
    <div ref={cardRef} style={{width:540,height:540,flexShrink:0,overflow:"hidden",background:"#FFFFFF",fontFamily:"Georgia,'Times New Roman',serif",display:"flex",flexDirection:"column"}}>
      <div style={{background:"#0D0D0D",padding:"18px 24px 16px",flexShrink:0}}>
        <div style={{fontSize:6,letterSpacing:5,color:"rgba(255,255,255,0.38)",fontFamily:"'Roboto Mono',monospace",fontStyle:"normal",marginBottom:4}}>BIO-PERFORMANCE REPORT</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:nick?18:12,letterSpacing:2,color:"#fff",fontStyle:"italic"}}>{nick||"Performance Report"}{age&&<span style={{fontSize:11,color:"rgba(255,255,255,0.4)",marginLeft:8}}>{age}</span>}</div>
          {isVerified && <div style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 8px",background:"rgba(232,0,90,0.2)",border:"1px solid #E8005A",borderRadius:2}}><span style={{fontSize:6,letterSpacing:2,color:"#fff",fontFamily:"'Roboto Mono',monospace",fontWeight:700}}>◈ VERIFIED</span></div>}
        </div>
      </div>
      <div style={{height:3,background:MAG,flexShrink:0}}/>
      <div style={{padding:"16px 24px 0",flexShrink:0}}>
        <div style={{fontSize:7,letterSpacing:3,color:"#bbb",marginBottom:4,fontFamily:"'Roboto Mono',monospace",fontStyle:"normal"}}>PERFORMANCE INDEX</div>
        <div style={{display:"flex",alignItems:"flex-end",gap:16}}>
          <div style={{fontSize:88,fontWeight:400,lineHeight:0.85,fontStyle:"italic",color:"#0D0D0D",letterSpacing:-5}}>{score}</div>
          <div style={{paddingBottom:6}}>
            <div style={{fontSize:11,letterSpacing:4,color:MAG,fontFamily:"'Roboto Mono',monospace",fontStyle:"normal",fontWeight:700}}>{grade.label}</div>
            <div style={{marginTop:5,width:28,height:2,background:MAG}}/>
            <div style={{marginTop:8,fontSize:8,letterSpacing:1,color:"#aaa",fontFamily:"'Roboto Mono',monospace",fontStyle:"normal"}}>EFF {eff.value} · {eff.label}</div>
          </div>
        </div>
        <div style={{height:1,background:"#ebebeb",marginTop:14}}/>
      </div>
      <div style={{flex:"0 0 240px",padding:"0 12px"}}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData} margin={{top:12,right:22,bottom:12,left:22}}>
            <defs>
              <radialGradient id="rfA" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={MAG} stopOpacity={0.18}/>
                <stop offset="100%" stopColor={MAG} stopOpacity={0.02}/>
              </radialGradient>
            </defs>
            <PolarGrid stroke="#ebebeb"/>
            <PolarAngleAxis dataKey="subject" tick={{fill:"#bbb",fontSize:8,fontFamily:"'Roboto Mono',monospace",letterSpacing:1}}/>
            <Radar dataKey="value" stroke={MAG} strokeWidth={2.5} fill="url(#rfA)" dot={<Dot/>}/>
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div style={{flex:1,padding:"0 24px",overflow:"hidden"}}>
        {METRICS.map(m=>{
          const pct = m.toRadar(rawValues[m.key]);
          const val = m.key==="strain"?Number(rawValues[m.key]).toFixed(1):rawValues[m.key];
          return (
            <div key={m.key} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid #f4f4f4"}}>
              <span style={{fontSize:7,letterSpacing:1,color:"#aaa",fontFamily:"'Roboto Mono',monospace",width:54,flexShrink:0}}>{m.label}</span>
              <div style={{flex:1,height:1,background:"#f0f0f0"}}><div style={{width:`${pct}%`,height:"100%",background:MAG}}/></div>
              <span style={{fontSize:12,fontStyle:"italic",color:"#111",width:44,textAlign:"right",flexShrink:0}}>{val}<span style={{fontSize:7,color:"#bbb",fontStyle:"normal",marginLeft:2,fontFamily:"'Roboto Mono',monospace"}}>{m.unit}</span></span>
            </div>
          );
        })}
      </div>
      <div style={{padding:"10px 24px 16px",borderTop:"1px solid #ebebeb",flexShrink:0,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:8,color:"#222",letterSpacing:3,fontFamily:"'Roboto Mono',monospace",fontWeight:700}}>{BRAND}</span>
        <span style={{fontSize:6,color:"#bbb",letterSpacing:1,fontFamily:"'Roboto Mono',monospace"}}>{isVerified?AUTH_ID:TODAY}</span>
      </div>
    </div>
  );
}

// ─── CARD B · ROSÉ LUXURY ────────────────────────────────────────────────────
function CardB({ radarData, rawValues, score, grade, nick, age, isVerified, cardRef }) {
  const GOLD="#C9956A", ROSE="#E8B4A0", CREAM="#F5EDE6", BG="#1A1008";
  const eff = effRatio(rawValues);
  const Dot = ({ cx, cy }) => (
    <g>
      <circle cx={cx} cy={cy} r={8} fill="none" stroke={GOLD} strokeWidth={1} opacity={0.4}/>
      <circle cx={cx} cy={cy} r={4} fill={BG} stroke={GOLD} strokeWidth={1.5}/>
      <circle cx={cx} cy={cy} r={1.5} fill={GOLD}/>
    </g>
  );
  return (
    <div ref={cardRef} style={{width:540,height:540,flexShrink:0,overflow:"hidden",background:"linear-gradient(160deg,#1A1008 0%,#120D07 55%,#1E1208 100%)",fontFamily:"Georgia,'Times New Roman',serif",display:"flex",flexDirection:"column",position:"relative"}}>
      <div style={{position:"absolute",inset:0,opacity:0.022,backgroundImage:"repeating-linear-gradient(45deg,#C9956A 0,#C9956A 1px,transparent 0,transparent 50%)",backgroundSize:"8px 8px",pointerEvents:"none"}}/>
      <div style={{position:"absolute",inset:12,border:`1px solid ${GOLD}35`,pointerEvents:"none"}}/>
      {[[false,false],[true,false],[false,true],[true,true]].map(([r,b],i)=>(
        <div key={i} style={{position:"absolute",width:20,height:20,top:b?undefined:10,bottom:b?10:undefined,left:r?undefined:10,right:r?10:undefined,borderTop:!b?`2px solid ${GOLD}60`:"none",borderBottom:b?`2px solid ${GOLD}60`:"none",borderLeft:!r?`2px solid ${GOLD}60`:"none",borderRight:r?`2px solid ${GOLD}60`:"none"}}/>
      ))}
      <div style={{position:"relative",zIndex:2,display:"flex",flexDirection:"column",height:"100%",padding:"24px 26px 18px"}}>
        <div style={{textAlign:"center",flexShrink:0,marginBottom:8}}>
          <div style={{fontSize:7,letterSpacing:6,color:`${GOLD}75`,marginBottom:4,fontFamily:"'Roboto Mono',monospace",fontStyle:"normal"}}>✦ {BRAND} ✦</div>
          <div style={{fontSize:nick?18:13,letterSpacing:2,color:CREAM,fontStyle:"italic"}}>{nick||"Your Name"}</div>
          {age&&<div style={{fontSize:8,letterSpacing:2,color:`${ROSE}80`,marginTop:2,fontFamily:"'Roboto Mono',monospace",fontStyle:"normal"}}>{age} years</div>}
        </div>
        <div style={{textAlign:"center",flexShrink:0,marginBottom:4}}>
          <div style={{fontSize:7,letterSpacing:3,color:`${GOLD}55`,marginBottom:2,fontFamily:"'Roboto Mono',monospace",fontStyle:"normal"}}>PERFORMANCE INDEX</div>
          <div style={{fontSize:72,fontWeight:400,lineHeight:1,color:GOLD,letterSpacing:-2,fontStyle:"italic"}}>{score}</div>
          <div style={{fontSize:9,letterSpacing:5,color:ROSE,marginTop:4,fontFamily:"'Roboto Mono',monospace",fontStyle:"normal"}}>{grade.label}</div>
          <div style={{width:32,height:1,background:GOLD,margin:"6px auto 0",opacity:0.5}}/>
        </div>
        <div style={{flex:"0 0 220px"}}>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} margin={{top:8,right:22,bottom:8,left:22}}>
              <defs>
                <radialGradient id="rfB" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor={GOLD} stopOpacity={0.40}/>
                  <stop offset="55%" stopColor={ROSE} stopOpacity={0.18}/>
                  <stop offset="100%" stopColor={GOLD} stopOpacity={0.04}/>
                </radialGradient>
              </defs>
              <PolarGrid stroke={`${GOLD}18`}/>
              <PolarAngleAxis dataKey="subject" tick={{fill:ROSE,fontSize:8,fontFamily:"'Roboto Mono',monospace",letterSpacing:1}}/>
              <Radar dataKey="value" stroke={GOLD} strokeWidth={1.5} fill="url(#rfB)" dot={<Dot/>}/>
            </RadarChart>
          </ResponsiveContainer>
        </div>
        <div style={{flex:1,overflow:"hidden"}}>
          {METRICS.map(m=>(
            <div key={m.key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:`1px solid ${GOLD}20`}}>
              <span style={{fontSize:7,letterSpacing:1,color:`${ROSE}90`,fontFamily:"'Roboto Mono',monospace"}}>{m.label}</span>
              <span style={{fontSize:12,color:CREAM,fontStyle:"italic"}}>
                {m.key==="strain"?Number(rawValues[m.key]).toFixed(1):rawValues[m.key]}
                <span style={{fontSize:7,color:`${ROSE}70`,fontStyle:"normal",marginLeft:2,fontFamily:"'Roboto Mono',monospace"}}>{m.unit}</span>
              </span>
            </div>
          ))}
        </div>
        <div style={{flexShrink:0,marginTop:8,paddingTop:8,borderTop:`1px solid ${GOLD}28`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:7,color:GOLD,letterSpacing:3,fontFamily:"'Roboto Mono',monospace",fontWeight:700}}>{BRAND}</span>
          <div style={{textAlign:"right"}}>
            {isVerified&&<div style={{fontSize:6,color:GOLD,letterSpacing:2,fontFamily:"'Roboto Mono',monospace"}}>◈ VERIFIED · {AUTH_ID}</div>}
            <div style={{fontSize:6,color:`${GOLD}55`,letterSpacing:1,fontFamily:"'Roboto Mono',monospace"}}>{isVerified?eff.value+" · "+eff.label:TODAY}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CARD C · CYBERPUNK ──────────────────────────────────────────────────────
function CardC({ radarData, rawValues, score, grade, nick, age, isVerified, cardRef }) {
  const CYAN="#00F2FF", PUR="#7B61FF";
  const eff = effRatio(rawValues);
  const Dot = ({ cx, cy }) => (
    <g>
      <circle cx={cx} cy={cy} r={10} fill={`${CYAN}10`}/>
      <circle cx={cx} cy={cy} r={5} fill="#000" stroke={CYAN} strokeWidth={1.5}/>
      <circle cx={cx} cy={cy} r={2} fill={CYAN}/>
    </g>
  );
  return (
    <div ref={cardRef} style={{width:540,height:540,flexShrink:0,overflow:"hidden",background:"linear-gradient(135deg,#000 0%,#06040e 100%)",fontFamily:"'Roboto Mono',monospace",display:"flex",flexDirection:"column",border:`1px solid ${CYAN}22`,position:"relative"}}>
      <div style={{position:"absolute",inset:0,pointerEvents:"none",background:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,242,255,0.012) 2px,rgba(0,242,255,0.013) 4px)"}}/>
      {[[{top:0,left:0},{borderTop:`1px solid ${CYAN}70`,borderLeft:`1px solid ${CYAN}70`}],[{top:0,right:0},{borderTop:`1px solid ${CYAN}70`,borderRight:`1px solid ${CYAN}70`}],[{bottom:0,left:0},{borderBottom:`1px solid ${CYAN}70`,borderLeft:`1px solid ${CYAN}70`}],[{bottom:0,right:0},{borderBottom:`1px solid ${CYAN}70`,borderRight:`1px solid ${CYAN}70`}]].map(([pos,bdr],i)=>(
        <div key={i} style={{position:"absolute",width:18,height:18,zIndex:2,...pos,...bdr}}/>
      ))}
      <div style={{position:"relative",zIndex:1,display:"flex",flexDirection:"column",height:"100%",padding:"20px 22px 14px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexShrink:0,marginBottom:6}}>
          <div>
            <div style={{fontSize:6,letterSpacing:4,color:`${CYAN}65`,marginBottom:4}}>BIO-PERFORMANCE RADAR</div>
            <div style={{fontFamily:"'Oswald',sans-serif",fontSize:nick?18:12,letterSpacing:2,fontWeight:700,color:nick?"#fff":"rgba(255,255,255,0.2)"}}>{nick||"YOUR_HANDLE"}{age&&<span style={{fontSize:10,color:"rgba(255,255,255,0.3)",marginLeft:6}}>{age}Y</span>}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontFamily:"'Oswald',sans-serif",fontSize:48,fontWeight:700,lineHeight:1,color:grade.color,textShadow:`0 0 24px ${grade.color}80`}}>{score}</div>
            <div style={{fontSize:8,letterSpacing:3,color:grade.color,marginTop:2}}>{grade.label}</div>
          </div>
        </div>
        <div style={{flex:"0 0 250px"}}>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} margin={{top:8,right:22,bottom:8,left:22}}>
              <defs>
                <radialGradient id="rfC" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor={CYAN} stopOpacity={0.28}/>
                  <stop offset="55%" stopColor={PUR} stopOpacity={0.14}/>
                  <stop offset="100%" stopColor={CYAN} stopOpacity={0.03}/>
                </radialGradient>
              </defs>
              <PolarGrid stroke={`${CYAN}13`}/>
              <PolarAngleAxis dataKey="subject" tick={{fill:`${CYAN}58`,fontSize:8,fontFamily:"'Roboto Mono',monospace",letterSpacing:1}}/>
              <Radar dataKey="value" stroke={CYAN} strokeWidth={1.5} fill="url(#rfC)" dot={<Dot/>}/>
            </RadarChart>
          </ResponsiveContainer>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:4,marginTop:4,flexShrink:0}}>
          {METRICS.map(m=>{
            const pct=m.toRadar(rawValues[m.key]);
            const val=m.key==="strain"?Number(rawValues[m.key]).toFixed(1):rawValues[m.key];
            return (
              <div key={m.key} style={{textAlign:"center",padding:"6px 2px",background:`${CYAN}07`,border:`1px solid ${CYAN}20`,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                <span style={{fontSize:9,color:CYAN}}>{m.icon}</span>
                <span style={{fontFamily:"'Oswald',sans-serif",fontSize:13,fontWeight:700,color:"#fff",lineHeight:1}}>{val}</span>
                <span style={{fontSize:5,color:"rgba(255,255,255,0.35)"}}>{m.unit||"idx"}</span>
                <div style={{width:"80%",height:1,background:`${CYAN}20`}}><div style={{width:`${pct}%`,height:"100%",background:CYAN}}/></div>
              </div>
            );
          })}
        </div>
        <div style={{marginTop:8,display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderTop:`1px solid ${CYAN}14`,flexShrink:0}}>
          <span style={{fontSize:7,color:`${CYAN}70`,letterSpacing:2}}>EFF {eff.value} · {eff.label}</span>
          {isVerified&&<span style={{fontSize:6,color:CYAN,letterSpacing:2}}>◈ VERIFIED · {AUTH_ID}</span>}
        </div>
        <div style={{display:"flex",justifyContent:"space-between",flexShrink:0}}>
          <span style={{fontSize:8,color:`${CYAN}55`,letterSpacing:3,fontWeight:700}}>{BRAND}</span>
          <span style={{fontSize:6,color:"rgba(255,255,255,0.18)",letterSpacing:2}}>{TODAY}</span>
        </div>
      </div>
    </div>
  );
}

// ─── CARD D · BAUHAUS ────────────────────────────────────────────────────────
function CardD({ radarData, rawValues, score, grade, nick, age, isVerified, cardRef }) {
  const GC = grade.label==="OPTIMAL"?"#D4FF00":grade.label==="BALANCED"?"#FF9500":"#FF2D55";
  const eff = effRatio(rawValues);
  const Dot = ({ cx, cy }) => <circle cx={cx} cy={cy} r={3.5} fill="#fff"/>;
  return (
    <div ref={cardRef} style={{width:540,height:540,flexShrink:0,overflow:"hidden",background:"#080808",fontFamily:"'Oswald','Arial Black',sans-serif",position:"relative"}}>
      <div style={{position:"absolute",top:0,left:0,right:0,height:5,background:GC}}/>
      <div style={{position:"absolute",top:0,left:0,bottom:0,width:214,background:`linear-gradient(175deg,${GC}16 0%,transparent 55%)`,borderRight:"1px solid rgba(255,255,255,0.06)",display:"flex",flexDirection:"column",justifyContent:"space-between",padding:"24px 16px 16px"}}>
        <div>
          <div style={{fontSize:7,letterSpacing:4,color:"rgba(255,255,255,0.28)",fontFamily:"'Roboto Mono',monospace",marginBottom:2}}>PERFORMANCE</div>
          <div style={{fontSize:7,letterSpacing:4,color:"rgba(255,255,255,0.28)",fontFamily:"'Roboto Mono',monospace"}}>INDEX</div>
        </div>
        <div>
          <div style={{fontSize:108,fontWeight:700,lineHeight:0.83,color:GC,letterSpacing:-5,textShadow:"3px 3px 0 rgba(0,0,0,0.6)"}}>{score}</div>
          <div style={{marginTop:10,fontSize:12,letterSpacing:5,color:"rgba(255,255,255,0.85)",fontWeight:700}}>{grade.label}</div>
          <div style={{marginTop:4,width:32,height:3,background:GC}}/>
        </div>
        <div>
          <div style={{fontSize:13,letterSpacing:1,color:"#fff",fontWeight:700,marginBottom:2}}>{nick||"—"}</div>
          {age&&<div style={{fontSize:9,letterSpacing:2,color:"rgba(255,255,255,0.3)",fontFamily:"'Roboto Mono',monospace"}}>{age} YRS</div>}
          <div style={{marginTop:10,fontSize:7,color:GC,letterSpacing:3,fontFamily:"'Roboto Mono',monospace",fontWeight:700}}>{BRAND}</div>
          {isVerified&&<div style={{marginTop:3,fontSize:6,letterSpacing:1,color:`${GC}80`,fontFamily:"'Roboto Mono',monospace"}}>◈ VERIFIED · {AUTH_ID}</div>}
          <div style={{marginTop:6,fontSize:6,color:"rgba(255,255,255,0.15)",letterSpacing:1,fontFamily:"'Roboto Mono',monospace"}}>{TODAY}</div>
        </div>
      </div>
      <div style={{position:"absolute",top:0,right:0,bottom:0,left:214,display:"flex",flexDirection:"column",padding:"20px 14px 14px 12px"}}>
        <div style={{flex:1}}>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} margin={{top:4,right:10,bottom:4,left:10}}>
              <defs>
                <linearGradient id="rfD" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor={GC} stopOpacity={0.25}/>
                  <stop offset="100%" stopColor={GC} stopOpacity={0.06}/>
                </linearGradient>
              </defs>
              <PolarGrid stroke="rgba(255,255,255,0.08)"/>
              <PolarAngleAxis dataKey="subject" tick={{fill:"rgba(255,255,255,0.38)",fontSize:7,fontFamily:"'Roboto Mono',monospace",letterSpacing:1}}/>
              <Radar dataKey="value" stroke={GC} strokeWidth={2} fill="url(#rfD)" dot={<Dot/>}/>
            </RadarChart>
          </ResponsiveContainer>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {METRICS.map(m=>{
            const pct=m.toRadar(rawValues[m.key]);
            const val=m.key==="strain"?Number(rawValues[m.key]).toFixed(1):rawValues[m.key];
            return (
              <div key={m.key} style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:8,letterSpacing:1,color:"rgba(255,255,255,0.3)",fontFamily:"'Roboto Mono',monospace",width:52,flexShrink:0}}>{m.label}</span>
                <div style={{flex:1,height:2,background:"rgba(255,255,255,0.08)",borderRadius:1}}><div style={{width:`${pct}%`,height:"100%",background:GC,borderRadius:1}}/></div>
                <span style={{fontSize:9,fontWeight:700,color:"#fff",fontFamily:"'Roboto Mono',monospace",width:34,textAlign:"right",flexShrink:0}}>{val}<span style={{fontSize:6,color:"rgba(255,255,255,0.28)",marginLeft:1}}>{m.unit}</span></span>
              </div>
            );
          })}
        </div>
        <div style={{marginTop:8,padding:"5px 0",borderTop:"1px solid rgba(255,255,255,0.07)"}}>
          <span style={{fontSize:7,letterSpacing:2,color:"rgba(255,255,255,0.28)",fontFamily:"'Roboto Mono',monospace"}}>EFF {eff.value} · {eff.label}</span>
        </div>
      </div>
    </div>
  );
}

// ─── CARD E · NEON TOKYO ─────────────────────────────────────────────────────
function CardE({ radarData, rawValues, score, grade, nick, age, isVerified, cardRef }) {
  const MAG="#E8005A", YELL="#F5E800";
  const KANJI={OPTIMAL:"最適",BALANCED:"均衡",FATIGUED:"疲労"};
  const eff = effRatio(rawValues);
  const Dot = ({ cx, cy }) => (
    <g>
      <circle cx={cx} cy={cy} r={6} fill={YELL} opacity={0.92}/>
      <circle cx={cx} cy={cy} r={2.5} fill="#0D0D0D"/>
    </g>
  );
  return (
    <div ref={cardRef} style={{width:540,height:540,flexShrink:0,overflow:"hidden",background:"#0D0D0D",fontFamily:"'Roboto Mono',monospace",display:"flex",flexDirection:"column",position:"relative"}}>
      <div style={{position:"absolute",inset:0,pointerEvents:"none",opacity:0.04,backgroundImage:`url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,backgroundSize:"200px 200px"}}/>
      <div style={{flex:"0 0 170px",background:MAG,position:"relative",overflow:"hidden",display:"flex",flexDirection:"column",justifyContent:"space-between",padding:"16px 20px 14px",zIndex:1}}>
        <div style={{position:"absolute",right:-8,top:-8,fontFamily:"serif",fontSize:130,fontWeight:900,color:"rgba(0,0,0,0.09)",lineHeight:1,pointerEvents:"none",userSelect:"none",letterSpacing:-6}}>{KANJI[grade.label]||"最適"}</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",position:"relative"}}>
          <span style={{fontSize:9,letterSpacing:4,color:"rgba(255,255,255,0.88)",fontWeight:700}}>{BRAND}</span>
          {isVerified&&<span style={{fontSize:6,letterSpacing:2,color:"rgba(255,255,255,0.85)",textAlign:"right"}}>◈ VERIFIED<br/>{AUTH_ID}</span>}
        </div>
        <div style={{position:"relative"}}>
          <div style={{fontSize:7,letterSpacing:4,color:"rgba(255,255,255,0.58)",marginBottom:3}}>BIO-PERFORMANCE RADAR</div>
          <div style={{display:"flex",alignItems:"flex-end",gap:12}}>
            <div style={{fontFamily:"'Oswald',sans-serif",fontSize:88,fontWeight:700,lineHeight:0.85,color:"#fff",letterSpacing:-5,textShadow:"2px 2px 0 rgba(0,0,0,0.18)"}}>{score}</div>
            <div style={{paddingBottom:6}}>
              <div style={{fontFamily:"'Oswald',sans-serif",fontSize:14,letterSpacing:4,color:"rgba(255,255,255,0.90)",fontWeight:700}}>{grade.label}</div>
              <div style={{fontSize:9,color:"rgba(255,255,255,0.68)",letterSpacing:2,marginTop:2}}>{nick||"YOUR_HANDLE"}{age&&<span style={{opacity:0.7}}> · {age}</span>}</div>
            </div>
          </div>
        </div>
      </div>
      <div style={{height:32,background:"#0D0D0D",marginTop:-2,flexShrink:0,clipPath:"polygon(0 30px,100% 0,100% 30px,0 30px)",position:"relative",zIndex:2}}/>
      <div style={{flex:1,display:"flex",flexDirection:"column",padding:"0 18px 16px",position:"relative",zIndex:1,overflow:"hidden"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,flex:1,minHeight:0}}>
          <div style={{display:"flex",flexDirection:"column"}}>
            <div style={{flex:1}}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} margin={{top:4,right:14,bottom:4,left:14}}>
                  <defs>
                    <radialGradient id="rfE" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor={YELL} stopOpacity={0.55}/>
                      <stop offset="100%" stopColor={YELL} stopOpacity={0.10}/>
                    </radialGradient>
                  </defs>
                  <PolarGrid stroke="rgba(255,255,255,0.08)"/>
                  <PolarAngleAxis dataKey="subject" tick={{fill:"rgba(255,255,255,0.34)",fontSize:7,fontFamily:"'Roboto Mono',monospace"}}/>
                  <Radar dataKey="value" stroke={YELL} strokeWidth={2} fill="url(#rfE)" dot={<Dot/>}/>
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div style={{fontSize:7,letterSpacing:1,color:"rgba(255,255,255,0.28)",marginTop:4}}><span style={{color:YELL}}>EFF </span>{eff.value} · {eff.label}</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:5,justifyContent:"center"}}>
            {METRICS.map(m=>{
              const pct=m.toRadar(rawValues[m.key]);
              const val=m.key==="strain"?Number(rawValues[m.key]).toFixed(1):rawValues[m.key];
              return (
                <div key={m.key} style={{display:"flex",alignItems:"stretch",overflow:"hidden",background:"rgba(255,255,255,0.03)"}}>
                  <div style={{width:3,background:MAG,opacity:Math.max(0.25,pct/100)}}/>
                  <div style={{flex:1,padding:"5px 9px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:7,letterSpacing:2,color:"rgba(255,255,255,0.36)"}}>{m.label}</span>
                    <span style={{fontFamily:"'Oswald',sans-serif",fontSize:13,fontWeight:700,color:"#fff"}}>{val}<span style={{fontSize:6,color:"rgba(255,255,255,0.28)",marginLeft:2}}>{m.unit}</span></span>
                  </div>
                </div>
              );
            })}
            <div style={{marginTop:4,fontSize:6,letterSpacing:2,color:"rgba(255,255,255,0.15)",textAlign:"right"}}>{TODAY}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── THEMES ──────────────────────────────────────────────────────────────────
const THEMES = [
  {id:"C",name:"CyberPunk",  tagline:"Black · Cyan · Tactical",   Component:CardC},
  {id:"A",name:"Vogue",      tagline:"White · Magenta · Authority",Component:CardA},
  {id:"D",name:"Bauhaus",    tagline:"Dark · Bold · Executive",    Component:CardD},
  {id:"B",name:"Rosé Luxury",tagline:"Chocolate · Gold · Status", Component:CardB},
  {id:"E",name:"Neon Tokyo", tagline:"Film · Magenta · Viral",     Component:CardE},
];

// ─── APP ─────────────────────────────────────────────────────────────────────
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
  const [isMobile,   setIsMobile]   = useState(()=>window.innerWidth<700);
  const cardRefs = useRef({});

  useEffect(()=>{
    const fn = ()=>setIsMobile(window.innerWidth<700);
    window.addEventListener("resize",fn);
    return ()=>window.removeEventListener("resize",fn);
  },[]);

  const radarData = useMemo(()=>METRICS.map(m=>({subject:m.label,value:m.toRadar(rawValues[m.key]),fullMark:100})),[rawValues]);
  const score = useMemo(()=>getBioScore(rawValues),[rawValues]);
  const grade = getGrade(score);
  const eff   = effRatio(rawValues);

  const processFile = useCallback((file)=>{
    setParseError(null);
    if(!file) return;
    const r=new FileReader();
    r.onload=e=>{
      const res=parseCSV(e.target.result);
      if(res.error){setParseError(res.error);return;}
      const {history:h,...vals}=res;
      setRawValues({hrv:vals.hrv,recovery:vals.recovery,sleep:vals.sleep,strain:vals.strain,rhr:vals.rhr});
      setIsVerified(true);
      if(h) setHistory(h);
      setMode("manual");
    };
    r.readAsText(file);
  },[]);

  const handleDrop=useCallback(e=>{e.preventDefault();setDragOver(false);processFile(e.dataTransfer.files[0]);},[processFile]);
  const openPicker=()=>{const i=document.createElement("input");i.type="file";i.accept=".csv";i.onchange=e=>processFile(e.target.files[0]);i.click();};
  const handleSlider=(key,val)=>{setRawValues(v=>({...v,[key]:Number(val)}));setIsVerified(false);};

  const doExport=async(themeId)=>{
    const el=cardRefs.current[themeId];
    if(!el||exportSt[themeId]==="loading") return;
    setExportSt(s=>({...s,[themeId]:"loading"}));
    try {
      const png=await toPng(el,{width:540,height:540,pixelRatio:2,backgroundColor:themeId==="A"?"#ffffff":"#000000",style:{transform:"none",position:"relative",top:"0",left:"0"}});
      const a=document.createElement("a");
      a.download=`bioradar-${themeId}-${(nick||"export").toLowerCase().replace(/\s+/g,"-")}.png`;
      a.href=png;a.click();
      setExportSt(s=>({...s,[themeId]:"done"}));
      setTimeout(()=>setExportSt(s=>({...s,[themeId]:"idle"})),2500);
    } catch(err){
      console.error(err);
      setExportSt(s=>({...s,[themeId]:"idle"}));
    }
  };

  const activeTheme=THEMES.find(t=>t.id===activeId);
  const ActiveCard=activeTheme.Component;
  const cardProps=(id,ref)=>({radarData,rawValues,score,grade,nick,age,isVerified,cardRef:ref});

  // ── Shared UI pieces ───────────────────────────────────────────────────────
  const ModeToggle = (
    <div style={{display:"flex",marginBottom:isMobile?16:18}}>
      {["manual","upload"].map((m,i)=>(
        <button key={m} onClick={()=>setMode(m)} style={{flex:1,background:"transparent",fontFamily:"inherit",fontSize:isMobile?12:9,letterSpacing:2,padding:isMobile?"12px 0":"9px 0",border:`1px solid ${mode===m?"rgba(0,242,255,0.55)":"rgba(255,255,255,0.1)"}`,color:mode===m?"#00F2FF":"rgba(255,255,255,0.32)",borderRight:i===0?"none":undefined}}>
          {m==="manual"?"◈ MANUAL":"↑ CSV"}
        </button>
      ))}
    </div>
  );

  const UploadPanel = (
    <div>
      <div style={{border:`1px dashed ${dragOver?"rgba(0,242,255,0.7)":"rgba(0,242,255,0.25)"}`,padding:isMobile?"36px 20px":"30px 20px",textAlign:"center",cursor:"pointer",borderRadius:2,background:dragOver?"rgba(0,242,255,0.04)":"transparent",marginBottom:12,transition:"all .25s"}} onDragOver={e=>{e.preventDefault();setDragOver(true)}} onDragLeave={()=>setDragOver(false)} onDrop={handleDrop} onClick={openPicker}>
        <div style={{fontSize:30,color:"rgba(0,242,255,0.32)",marginBottom:10}}>⬡</div>
        <p style={{fontSize:isMobile?14:11,letterSpacing:2,color:"rgba(255,255,255,0.5)",marginBottom:5}}>TAP TO UPLOAD CSV</p>
        <p style={{fontSize:isMobile?11:9,color:"rgba(255,255,255,0.22)"}}>WHOOP · OURA · APPLE HEALTH</p>
      </div>
      {parseError&&<p style={{fontSize:11,color:"#FF6B35",marginBottom:10,lineHeight:1.5}}>⚠ {parseError}</p>}
      {history.length>0&&(
        <div style={{padding:"10px 12px",background:"rgba(0,242,255,0.04)",border:"1px solid rgba(0,242,255,0.12)",fontSize:10,lineHeight:1.9}}>
          <div style={{color:"rgba(0,242,255,0.65)",marginBottom:4,letterSpacing:1}}>LAST {history.length} DAYS</div>
          {history.slice(-3).reverse().map((d,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",color:"rgba(255,255,255,0.4)"}}><span>{d.date||"—"}</span><span>REC {d.recovery}% HRV {d.hrv}ms</span></div>
          ))}
          <button onClick={()=>{clearHistory();setHistory([]);}} style={{marginTop:8,background:"none",border:"none",color:"rgba(255,100,100,0.5)",fontSize:10,cursor:"pointer",fontFamily:"inherit",padding:0}}>✕ CLEAR</button>
        </div>
      )}
    </div>
  );

  const SlidersPanel = (
    <div>
      {!isMobile&&<p style={{fontSize:8,letterSpacing:3,color:"rgba(255,255,255,0.24)",marginBottom:14}}>YOUR METRICS</p>}
      {METRICS.map((m,i)=>{
        const raw=rawValues[m.key],pct=m.toRadar(raw),isF=m.rawStep<1,sc=SC[i];
        return (
          <div key={m.key} style={{marginBottom:isMobile?24:20,paddingBottom:isMobile?20:0,borderBottom:isMobile?"1px solid rgba(255,255,255,0.05)":"none"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:isMobile?10:6}}>
              <div style={{display:"flex",alignItems:"center",gap:isMobile?10:6}}>
                <span style={{color:sc,fontSize:isMobile?18:13}}>{m.icon}</span>
                <span style={{fontSize:isMobile?13:10,letterSpacing:2,color:"rgba(255,255,255,0.65)"}}>{m.label}</span>
              </div>
              <div style={{display:"flex",alignItems:"baseline",gap:3}}>
                <span style={{fontFamily:"'Oswald',sans-serif",fontSize:isMobile?28:20,fontWeight:700,color:sc}}>{isF?Number(raw).toFixed(1):raw}</span>
                <span style={{fontSize:isMobile?11:9,color:"rgba(255,255,255,0.28)"}}>{m.unit}</span>
              </div>
            </div>
            <input type="range" min={m.rawMin} max={m.rawMax} step={m.rawStep} value={raw} onChange={e=>handleSlider(m.key,e.target.value)} style={{color:sc,background:m.key==="rhr"?`linear-gradient(to left,${sc} ${pct}%,rgba(255,255,255,0.1) ${pct}%)`:`linear-gradient(to right,${sc} ${pct}%,rgba(255,255,255,0.1) ${pct}%)`}}/>
            {m.key==="rhr"&&<p style={{fontSize:isMobile?10:8,color:"rgba(255,45,120,0.4)",marginTop:4}}>↓ lower = better</p>}
            {m.key==="strain"&&<p style={{fontSize:isMobile?10:8,color:"rgba(255,107,53,0.4)",marginTop:4}}>Whoop 0.0–21.0</p>}
          </div>
        );
      })}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:isMobile?16:14,borderTop:"1px solid rgba(255,255,255,0.06)",paddingTop:16,marginTop:isMobile?0:4}}>
        {[["NAME","text",nick,v=>setNick(v)],["AGE","number",age,v=>setAge(v)]].map(([l,t,v,fn])=>(
          <div key={l}>
            <label style={{fontSize:8,letterSpacing:2,color:"rgba(255,255,255,0.24)",display:"block",marginBottom:5}}>{l}</label>
            <input value={v} onChange={e=>fn(e.target.value)} type={t} style={{background:"transparent",border:"none",borderBottom:"1px solid rgba(255,255,255,0.12)",color:"#fff",fontFamily:"inherit",fontSize:isMobile?16:12,width:"100%",padding:"4px 0",letterSpacing:1}}/>
          </div>
        ))}
      </div>
      <div style={{marginTop:16,padding:"12px 14px",background:"rgba(255,255,255,0.02)",border:`1px solid ${grade.color}20`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <p style={{fontSize:7,letterSpacing:3,color:"rgba(255,255,255,0.2)",marginBottom:3}}>BIO-SCORE</p>
            <div style={{fontFamily:"'Oswald',sans-serif",fontSize:38,fontWeight:700,color:grade.color,textShadow:`0 0 16px ${grade.color}55`}}>{score}</div>
            <p style={{fontSize:9,letterSpacing:3,color:grade.color,marginTop:2}}>{grade.label}</p>
          </div>
          <div style={{textAlign:"right"}}>
            <p style={{fontSize:7,letterSpacing:2,color:"rgba(255,255,255,0.2)",marginBottom:3}}>EFFICIENCY</p>
            <div style={{fontFamily:"'Oswald',sans-serif",fontSize:22,fontWeight:700,color:"rgba(255,255,255,0.65)"}}>{eff.value}</div>
            <p style={{fontSize:8,letterSpacing:1,color:"rgba(255,255,255,0.3)",marginTop:2}}>{eff.label}</p>
          </div>
        </div>
      </div>
    </div>
  );

  const ThemeTabs = (
    <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:4,WebkitOverflowScrolling:"touch",marginBottom:isMobile?14:16}}>
      {THEMES.map(t=>(
        <button key={t.id} onClick={()=>setActiveId(t.id)} style={{background:activeId===t.id?"rgba(255,255,255,0.08)":"transparent",border:`1px solid ${activeId===t.id?"rgba(255,255,255,0.45)":"rgba(255,255,255,0.1)"}`,color:activeId===t.id?"#fff":"rgba(255,255,255,0.32)",padding:isMobile?"10px 18px":"6px 18px",fontFamily:"inherit",fontSize:isMobile?11:9,letterSpacing:2,whiteSpace:"nowrap",flexShrink:0}}>
          {t.name.toUpperCase()}
        </button>
      ))}
    </div>
  );

  const ExportBtn = (
    <button onClick={()=>doExport(activeId)} disabled={exportSt[activeId]==="loading"} style={{background:"transparent",border:"1px solid rgba(255,255,255,0.38)",color:"#fff",padding:isMobile?"14px":"9px 24px",fontFamily:"inherit",fontSize:isMobile?12:9,letterSpacing:3,width:isMobile?"100%":undefined,display:"block"}}>
      {exportSt[activeId]==="done"?"✓ SAVED · 1080×1080":exportSt[activeId]==="loading"?"⟳ RENDERING…":"↓ EXPORT 1080×1080 PNG"}
    </button>
  );

  // Hidden card for export (always rendered at full 540×540)
  const HiddenCards = (
    <div style={{position:"fixed",top:0,left:"-9999px",zIndex:-1,pointerEvents:"none"}}>
      {THEMES.map(t=>{
        const TC=t.Component;
        return <TC key={t.id} {...cardProps(t.id, el=>{cardRefs.current[t.id]=el;})}/>;
      })}
    </div>
  );

  const Thumbnails = (
    <div>
      <p style={{fontSize:8,letterSpacing:3,color:"rgba(255,255,255,0.16)",marginBottom:10}}>OTHER THEMES</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
        {THEMES.filter(t=>t.id!==activeId).map(t=>{
          const TC=t.Component;
          return (
            <div key={t.id} onClick={()=>setActiveId(t.id)} style={{border:"1px solid rgba(255,255,255,0.07)",overflow:"hidden",position:"relative",aspectRatio:"1/1",cursor:"pointer"}}>
              <div style={{position:"absolute",top:0,left:0,transformOrigin:"top left",transform:`scale(${1/4})`,width:540,height:540,pointerEvents:"none"}}>
                <TC {...cardProps(t.id,null)}/>
              </div>
              <div style={{position:"absolute",inset:0}}/>
              <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"3px 5px",background:"rgba(0,0,0,0.88)",fontSize:7,letterSpacing:1,color:"rgba(255,255,255,0.4)",display:"flex",justifyContent:"space-between"}}>
                <span>{t.name.toUpperCase()}</span>
                <span style={{color:"rgba(255,255,255,0.2)"}}>↗</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:"#040404",color:"#fff",fontFamily:"'Roboto Mono','Courier New',monospace"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@300;400;700&family=Oswald:wght@700&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html,body{overflow-x:hidden}
        ::-webkit-scrollbar{width:3px;height:3px}
        ::-webkit-scrollbar-thumb{background:rgba(0,242,255,0.22);border-radius:2px}
        input[type=range]{-webkit-appearance:none;height:3px;border-radius:2px;outline:none;cursor:pointer;width:100%;display:block}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:50%;border:2px solid currentColor;background:#040404;cursor:pointer}
        input[type=range]::-moz-range-thumb{width:22px;height:22px;border-radius:50%;border:2px solid currentColor;background:#040404;cursor:pointer;border-style:solid}
        button{cursor:pointer;-webkit-tap-highlight-color:transparent}
        input::placeholder{color:rgba(255,255,255,0.18)}
        input:focus{outline:none}
      `}</style>

      {HiddenCards}

      {/* HEADER */}
      <header style={{borderBottom:"1px solid rgba(255,255,255,0.07)",padding:isMobile?"14px 16px":"20px 28px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <h1 style={{fontFamily:"'Oswald',sans-serif",fontSize:isMobile?26:34,fontWeight:700,letterSpacing:3,lineHeight:1}}>{BRAND}</h1>
            <p style={{fontSize:isMobile?9:10,color:"rgba(255,255,255,0.25)",letterSpacing:2,marginTop:3}}>BIO-PERFORMANCE RADAR · 5 THEMES</p>
          </div>
          {isMobile&&(
            <div style={{textAlign:"right"}}>
              <div style={{fontFamily:"'Oswald',sans-serif",fontSize:34,fontWeight:700,color:grade.color,textShadow:`0 0 14px ${grade.color}55`,lineHeight:1}}>{score}</div>
              <div style={{fontSize:9,letterSpacing:2,color:grade.color,marginTop:2}}>{grade.label}</div>
            </div>
          )}
        </div>
      </header>

      {isMobile ? (
        /* ══ MOBILE ══ */
        <div style={{padding:"0 0 60px"}}>
          <div style={{padding:"16px 16px 0"}}>
            {ModeToggle}
            {mode==="upload" ? UploadPanel : SlidersPanel}
          </div>
          <div style={{borderTop:"1px solid rgba(255,255,255,0.06)",padding:"16px 16px 0",marginTop:8}}>
            <p style={{fontSize:9,letterSpacing:3,color:"rgba(255,255,255,0.22)",marginBottom:12}}>SELECT THEME</p>
            {ThemeTabs}
          </div>
          <div style={{padding:"0 16px"}}>
            <p style={{fontSize:9,color:"rgba(255,255,255,0.22)",letterSpacing:2,marginBottom:10}}>{activeTheme.name.toUpperCase()} · {activeTheme.tagline}</p>
            {/* Card preview scaled to screen width */}
            <div style={{width:"100%",aspectRatio:"1/1",position:"relative",overflow:"hidden",border:"1px solid rgba(255,255,255,0.08)",marginBottom:12}}>
              <div style={{position:"absolute",top:0,left:0,width:540,height:540,transformOrigin:"top left",transform:`scale(${(window.innerWidth-32)/540})`,pointerEvents:"none"}}>
                <ActiveCard {...cardProps(activeId,null)}/>
              </div>
            </div>
            {ExportBtn}
          </div>
          <div style={{padding:"16px 16px 0",borderTop:"1px solid rgba(255,255,255,0.06)",marginTop:16}}>
            {Thumbnails}
          </div>
        </div>
      ) : (
        /* ══ DESKTOP ══ */
        <div style={{display:"grid",gridTemplateColumns:"280px 1fr",gap:36,alignItems:"start",maxWidth:1300,margin:"0 auto",padding:"28px 28px 70px"}}>
          <div style={{position:"sticky",top:24}}>
            {ModeToggle}
            {mode==="upload" ? UploadPanel : SlidersPanel}
          </div>
          <div>
            {ThemeTabs}
            <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:14,flexWrap:"wrap"}}>
              <div>
                <p style={{fontFamily:"'Oswald',sans-serif",fontSize:15,letterSpacing:3,color:"#fff"}}>{activeTheme.name.toUpperCase()}</p>
                <p style={{fontSize:8,color:"rgba(255,255,255,0.26)",letterSpacing:2,marginTop:2}}>{activeTheme.tagline}</p>
              </div>
              <div style={{marginLeft:"auto"}}>{ExportBtn}</div>
            </div>
            <div style={{marginBottom:20}}>
              <ActiveCard {...cardProps(activeId,el=>{cardRefs.current[activeId]=el;})}/>
            </div>
            {Thumbnails}
          </div>
        </div>
      )}
    </div>
  );
}
