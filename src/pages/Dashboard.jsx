/**
 * @file Dashboard.jsx
 * @description Nexus — Strategic Feature Intelligence Dashboard
 * Redesigned: Light enterprise SaaS, animated, production-grade.
 * Person A — Layer 5
 */

import React, { useState, useEffect, useRef } from "react";
import { useTelemetry } from "../context/TelemetryContext.jsx";

// ─── Design Tokens ────────────────────────────────────────────────────────────
const T = {
  bg: "#F8F9FB",
  surface: "#FFFFFF",
  border: "#E8EBF0",
  borderStrong: "#C9CDD6",
  text: "#0F1117",
  textSub: "#5C6370",
  textMute: "#9CA3AF",
  accent: "#6366F1",
  accentLight: "#EEF2FF",
  accentDark: "#4F46E5",
  green: "#10B981",
  greenLight: "#F0FDF4",
  amber: "#F59E0B",
  amberLight: "#FFFBEB",
  red: "#EF4444",
  redLight: "#FEF2F2",
  sidebar: "#FFFFFF",
  sidebarBorder: "#E8EBF0",
  sidebarText: "#0F1117",
  sidebarTextMute: "#9CA3AF",
  gradient1: "linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)",
  gradient2: "linear-gradient(135deg, #10B981 0%, #06B6D4 100%)",
  gradient3: "linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)",
  greenBright: "#34D399",
  redBright: "#F87171",
  amberBright: "#FCD34D",
};

// ─── Data ─────────────────────────────────────────────────────────────────────
const ADOPTION_DATA = [
  { id: "compliance", label: "Compliance Check",    rate: 91, events: 5100, trend: +8,  status: "high"    },
  { id: "loan",       label: "Loan Origination",    rate: 87, events: 4320, trend: +12, status: "high"    },
  { id: "docs",       label: "Document Management", rate: 72, events: 3100, trend: +3,  status: "healthy" },
  { id: "risk",       label: "Risk Assessment",     rate: 65, events: 2800, trend: -2,  status: "healthy" },
  { id: "reporting",  label: "Reporting Dashboard", rate: 58, events: 2100, trend: +5,  status: "healthy" },
  { id: "repayment",  label: "Repayment Schedule",  rate: 44, events: 1200, trend: -6,  status: "low"     },
  { id: "tenant",     label: "Tenant Management",   rate: 22, events: 430,  trend: -1,  status: "low"     },
  { id: "upsell",     label: "Upsell Engine",       rate: 3,  events: 80,   trend: -14, status: "zombie"  },
];

const FUNNEL_DATA = [
  { step: "Personal Details",   entry: 1000, drop: 80  },
  { step: "Income Details",     entry: 920,  drop: 150 },
  { step: "Employment Details", entry: 770,  drop: 210 },
  { step: "Document Upload",    entry: 560,  drop: 180 },
  { step: "Review & Submit",    entry: 380,  drop: 40  },
];

const METRICS = [
  { label: "Total Events",     value: "19,130", delta: "+23%", up: true  },
  { label: "Active Tenants",   value: "47",     delta: "+4",   up: true  },
  { label: "Zombie Features",  value: "1",      delta: "Risk", up: false },
  { label: "Journey Rate",     value: "68%",    delta: "+7%",  up: true  },
];

const STATUS = {
  high:    { bar: "#1A56DB", bg: "#EBF0FF", label: "High",    dot: "#1A56DB" },
  healthy: { bar: "#0D9E6E", bg: "#ECFDF5", label: "Healthy", dot: "#0D9E6E" },
  low:     { bar: "#D97706", bg: "#FFFBEB", label: "Low",     dot: "#D97706" },
  zombie:  { bar: "#DC2626", bg: "#FEF2F2", label: "Zombie",  dot: "#DC2626" },
};

// ─── Animated Bar ─────────────────────────────────────────────────────────────
function AnimatedBar({ width, color, delay = 0, height = 8 }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setW(width), 120 + delay);
    return () => clearTimeout(t);
  }, [width, delay]);
  return (
    <div style={{ background: "linear-gradient(90deg, #F0F2F5 0%, #E5E7EB 100%)", borderRadius: 999, height, overflow: "hidden", position: "relative" }}>
      <div style={{
        height: "100%", borderRadius: 999, background: color,
        width: `${w}%`,
        transition: `width 1.1s cubic-bezier(0.4,0,0.2,1) ${delay}ms`,
        boxShadow: `0 0 20px ${color}40, inset 0 1px 2px rgba(255,255,255,0.5)`,
      }} />
    </div>
  );
}

// ─── Animated Number ──────────────────────────────────────────────────────────
function AnimNum({ target, duration = 1400 }) {
  const [val, setVal] = useState(0);
  const t0 = useRef(null);
  useEffect(() => {
    t0.current = null;
    const num = parseFloat(String(target).replace(/[^0-9.]/g, "")) || 0;
    const run = (ts) => {
      if (!t0.current) t0.current = ts;
      const p = Math.min((ts - t0.current) / duration, 1);
      setVal(Math.round((1 - Math.pow(1 - p, 3)) * num));
      if (p < 1) requestAnimationFrame(run);
    };
    requestAnimationFrame(run);
  }, [target]);
  const prefix = String(target).match(/^[^0-9]*/)?.[0] || "";
  const suffix = String(target).match(/[^0-9.]+$/)?.[0] || "";
  return <>{prefix}{val.toLocaleString()}{suffix}</>;
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ active, setActive }) {
  const nav = [
    { id: "overview",   label: "Overview" },
    { id: "adoption",   label: "Adoption" },
    { id: "journeys",   label: "Journeys" },
    { id: "governance", label: "Governance" },
  ];
  return (
    <aside style={{
      width: 220, minHeight: "100vh", background: T.sidebar,
      position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 100,
      display: "flex", flexDirection: "column",
      borderRight: `1px solid ${T.sidebarBorder}`,
      boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
    }}>
      {/* Logo */}
      <div style={{ padding: "24px 18px 20px", borderBottom: `1px solid ${T.sidebarBorder}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: T.gradient1,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 15, color: "#fff", fontWeight: 800, letterSpacing: "-0.5px",
          }}>N</div>
          <div>
            <div style={{ color: T.sidebarText, fontSize: 14, fontWeight: 700, letterSpacing: "-0.3px" }}>Nexus</div>
            <div style={{ color: T.textMute, fontSize: 10, letterSpacing: "0.05em" }}>INTELLIGENCE</div>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav style={{ padding: "16px 10px", flex: 1 }}>
        <div style={{ fontSize: 9, color: T.textMute, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 10, paddingLeft: 12 }}>
          NAVIGATION
        </div>
        {nav.map(item => {
          const isActive = active === item.id;
          return (
            <button key={item.id} onClick={() => setActive(item.id)} style={{
              display: "flex", alignItems: "center",
              width: "100%", padding: "10px 12px", borderRadius: 8, marginBottom: 4,
              background: isActive ? T.accentLight : "transparent",
              border: "none", cursor: "pointer",
              borderLeft: `3px solid ${isActive ? T.accent : "transparent"}`,
              color: isActive ? T.accent : T.textMute,
              fontSize: 13, fontWeight: isActive ? 600 : 400,
              textAlign: "left", transition: "all 0.2s",
            }}
            onMouseEnter={(e) => !isActive && (e.target.style.background = "#F3F4F6", e.target.style.color = T.text)}
            onMouseLeave={(e) => !isActive && (e.target.style.background = "transparent", e.target.style.color = T.textMute)}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* SDK status badge */}
      <div style={{ padding: "14px", borderTop: `1px solid ${T.sidebarBorder}` }}>
        <div style={{
          background: T.greenLight, border: `1px solid ${T.green}30`,
          borderRadius: 8, padding: "10px 12px",
        }}>
          <div style={{ color: T.green, fontSize: 11, fontWeight: 700, marginBottom: 2 }}>SDK ACTIVE</div>
          <div style={{ color: T.textMute, fontSize: 10 }}>v1.0.0 - PII Masked</div>
        </div>
      </div>
    </aside>
  );
}

// ─── Top Bar ──────────────────────────────────────────────────────────────────
function TopBar({ page }) {
  const labels = { overview: "Overview", adoption: "Feature Adoption", journeys: "Journey Analytics", governance: "Governance" };
  return (
    <div style={{
      height: 54, background: T.surface, borderBottom: `1px solid ${T.border}`,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 28px", position: "sticky", top: 0, zIndex: 50,
      boxShadow: "0 1px 4px rgba(0,0,0,0.03)",
    }}>
      <div style={{ fontSize: 13, color: T.textMute }}>
        Nexus <span style={{ margin: "0 6px", color: T.border }}>›</span>
        <span style={{ color: T.text, fontWeight: 600 }}>{labels[page]}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: T.green,
          background: T.greenLight, padding: "4px 12px", borderRadius: 999,
          border: `1px solid ${T.green}25`,
        }}>LIVE</div>
        <div style={{
          width: 32, height: 32, borderRadius: "50%",
          background: T.accentLight, color: T.accent,
          fontSize: 12, fontWeight: 800,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>PM</div>
      </div>
    </div>
  );
}

// ─── Shared: Section Card ─────────────────────────────────────────────────────
function Card({ title, subtitle, children, style = {} }) {
  const [hover, setHover] = useState(false);
  return (
    <div 
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: T.surface, border: `1px solid ${hover ? T.accent + "20" : T.border}`,
        borderRadius: 16, padding: "24px",
        boxShadow: hover ? "0 20px 40px rgba(99, 102, 241, 0.12), 0 0 1px rgba(99, 102, 241, 0.3)" : "0 1px 4px rgba(0,0,0,0.04)", 
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        transform: hover ? "translateY(-4px) scale(1.01)" : "translateY(0)",
        position: "relative",
        overflow: "hidden",
        ...style,
      }}>
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
        background: "radial-gradient(600px at 50% -50%, rgba(99, 102, 241, 0.02), transparent)",
        pointerEvents: "none",
      }} />
      {(title || subtitle) && (
        <div style={{ marginBottom: 20, position: "relative", zIndex: 1 }}>
          {title && <div style={{ fontSize: 15, fontWeight: 800, background: T.gradient1, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", marginBottom: 4, letterSpacing: "-0.3px" }}>{title}</div>}
          {subtitle && <div style={{ fontSize: 12, color: T.textMute, lineHeight: 1.5 }}>{subtitle}</div>}
        </div>
      )}
      <div style={{ position: "relative", zIndex: 2 }}>{children}</div>
    </div>
  );
}

// ─── Page Header ──────────────────────────────────────────────────────────────
function PageHeader({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h1 style={{ 
        fontSize: 32, fontWeight: 900, margin: "0 0 8px", 
        letterSpacing: "-0.8px",
        background: T.gradient1,
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
      }}>{title}</h1>
      <p style={{ fontSize: 14, color: T.textSub, margin: 0, lineHeight: 1.6 }}>{subtitle}</p>
    </div>
  );
}

// ─── Overview Page ────────────────────────────────────────────────────────────
function OverviewPage() {
  const [vis, setVis] = useState(false);
  useEffect(() => { setTimeout(() => setVis(true), 50); }, []);

  return (
    <div>
      <PageHeader title="Strategic Overview" subtitle="Real-time feature intelligence across all tenants" />

      {/* Metric cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
        {METRICS.map((m, i) => (
          <div key={m.label} style={{
            background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: 14, padding: "22px",
            opacity: vis ? 1 : 0, transform: vis ? "none" : "translateY(12px)",
            transition: `opacity 0.5s ${i * 80}ms, transform 0.5s ${i * 80}ms`,
            animation: vis ? `float 3s ease-in-out ${i * 100}ms infinite` : "none",
            boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
            cursor: "pointer",
            position: "relative",
            overflow: "hidden",
          }}
          onMouseEnter={(e) => e.currentTarget.style.boxShadow = "0 12px 28px rgba(99, 102, 241, 0.1)"}
          onMouseLeave={(e) => e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.04)"}
          >
            <div style={{ 
              position: "absolute", top: -50, right: -50, width: 120, height: 120,
              borderRadius: "50%", background: T.gradient1, opacity: 0.05,
            }} />
            <div style={{ fontSize: 11, color: T.textMute, fontWeight: 600, letterSpacing: "0.06em", marginBottom: 10, position: "relative", zIndex: 1 }}>
              {m.label.toUpperCase()}
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, color: T.text, letterSpacing: "-1px", marginBottom: 8, position: "relative", zIndex: 1 }}>
              <AnimNum target={m.value} />
            </div>
            <span style={{
              fontSize: 11, fontWeight: 700,
              color: m.up ? T.green : T.red,
              background: m.up ? T.greenLight : T.redLight,
              padding: "4px 10px", borderRadius: 6,
              display: "inline-block",
              position: "relative",
              zIndex: 1,
            }}>
              {m.up ? "+" : "-"} {m.delta}
            </span>
          </div>
        ))}
      </div>

      {/* Two column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 14 }}>
        <Card title="Feature Health Snapshot" subtitle="Adoption rate by module — all tenants">
          {ADOPTION_DATA.map((item, i) => {
            const s = STATUS[item.status];
            return (
              <div key={item.id} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>{item.label}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: s.dot, background: s.bg, padding: "2px 8px", borderRadius: 999 }}>
                      {s.label}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: T.text, width: 36, textAlign: "right" }}>
                      {item.rate}%
                    </span>
                  </div>
                </div>
                <AnimatedBar width={item.rate} color={s.bar} delay={i * 55} height={7} />
              </div>
            );
          })}
        </Card>

        <Card title="Loan Journey Funnel" subtitle="1,000 journeys initiated this period">
          <Minifunnel />
          <div style={{
            marginTop: 18, padding: "14px", borderRadius: 10,
            background: T.redLight, border: `1px solid ${T.red}25`,
            fontSize: 12, color: T.red,
          }}>
            <strong>Employment Details Alert:</strong> 210 drop-offs. Highest friction point in pipeline.
          </div>
        </Card>
      </div>
    </div>
  );
}

function Minifunnel() {
  const max = FUNNEL_DATA[0].entry;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {FUNNEL_DATA.map((s, i) => {
        const pct = Math.round((s.entry / max) * 100);
        const isWorst = s.drop === 210;
        return (
          <div key={s.step}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: isWorst ? T.red : T.textSub, fontWeight: isWorst ? 600 : 400 }}>{s.step}</span>
              <span style={{ color: T.text, fontWeight: 700 }}>{s.entry.toLocaleString()}</span>
            </div>
            <AnimatedBar width={pct} color={isWorst ? T.red : T.accent} delay={i * 70} height={8} />
          </div>
        );
      })}
    </div>
  );
}

// ─── Adoption Page ────────────────────────────────────────────────────────────
function AdoptionPage() {
  const [selected, setSelected] = useState(null);
  const zombies = ADOPTION_DATA.filter(d => d.status === "zombie").length;
  const low = ADOPTION_DATA.filter(d => d.status === "low").length;

  return (
    <div>
      <PageHeader title="Feature Adoption" subtitle="License vs usage intelligence — identify zombie features instantly" />

      {/* Status summary */}
      <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
        {Object.entries(STATUS).map(([key, s]) => {
          const count = ADOPTION_DATA.filter(d => d.status === key).length;
          return (
            <div key={key} style={{
              background: s.bg, border: `1px solid ${s.dot}30`,
              borderRadius: 999, padding: "6px 16px",
              fontSize: 12, fontWeight: 700, color: s.dot,
            }}>
              {count} {s.label}
            </div>
          );
        })}
        {zombies > 0 && (
          <div style={{
            marginLeft: "auto", background: T.redLight,
            border: `1px solid ${T.red}30`, borderRadius: 999,
            padding: "6px 16px", fontSize: 12, fontWeight: 700, color: T.red,
          }}>
            {zombies} Zombie Feature - Action Required
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12 }}>
        {ADOPTION_DATA.map((item, i) => {
          const s = STATUS[item.status];
          const on = selected === item.id;
          return (
            <div key={item.id} onClick={() => setSelected(on ? null : item.id)} style={{
              background: T.surface, borderRadius: 14,
              border: `1.5px solid ${on ? s.bar : T.border}`,
              padding: "22px", cursor: "pointer",
              boxShadow: on ? `0 0 0 4px ${s.bar}18, 0 8px 25px rgba(99, 102, 241, 0.1)` : "0 1px 4px rgba(0,0,0,0.04)",
              transform: on ? "translateY(-4px) scale(1.01)" : "translateY(0)",
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              position: "relative",
              overflow: "hidden",
            }}>
              <div style={{
                position: "absolute", top: 0, right: 0, width: 100, height: 100,
                borderRadius: "50%", background: s.bar, opacity: 0.03,
              }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, position: "relative", zIndex: 1 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 11, color: T.textMute }}>{item.events.toLocaleString()} events recorded</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 30, fontWeight: 800, color: s.bar, letterSpacing: "-1px", lineHeight: 1 }}>
                    {item.rate}%
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: item.trend >= 0 ? T.green : T.red, marginTop: 2 }}>
                    {item.trend >= 0 ? "+" : "-"} {Math.abs(item.trend)}% MoM
                  </div>
                </div>
              </div>
              <AnimatedBar width={item.rate} color={s.bar} delay={i * 45} height={7} />

          {item.status === "zombie" && (
                <div style={{
                  marginTop: 12, padding: "10px 14px", borderRadius: 8,
                  background: T.redLight, border: `1px solid ${T.red}25`,
                  fontSize: 11, color: T.red, fontWeight: 600,
                }}>
                  Licensed but unused - Consider offboarding or upsell review
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Journeys Page ────────────────────────────────────────────────────────────
function JourneysPage() {
  const max = FUNNEL_DATA[0].entry;
  return (
    <div>
      <PageHeader title="Journey Analytics" subtitle="End-to-end funnel intelligence — pinpoint where users drop off" />
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 14 }}>
        <Card title="Loan Application Funnel" subtitle="Detailed step-by-step drop-off analysis">
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {FUNNEL_DATA.map((step, i) => {
              const pct = Math.round((step.entry / max) * 100);
              const dropPct = Math.round((step.drop / step.entry) * 100);
              const isWorst = step.drop === 210;
              return (
                <div key={step.step}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <div style={{
                        width: 24, height: 24, borderRadius: "50%",
                        background: isWorst ? T.redLight : T.accentLight,
                        color: isWorst ? T.red : T.accent,
                        fontSize: 11, fontWeight: 800,
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                      }}>{i + 1}</div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: isWorst ? T.red : T.text }}>
                        {step.step}
                      </span>
                      {isWorst && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: T.red, background: T.redLight, padding: "3px 8px", borderRadius: 6 }}>
                          Critical Drop-off
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: T.text }}>
                      <strong>{step.entry.toLocaleString()}</strong>
                      <span style={{ color: T.red, marginLeft: 8, fontSize: 12 }}>−{step.drop} ({dropPct}%)</span>
                    </div>
                  </div>
                  <AnimatedBar width={pct} color={isWorst ? T.red : T.accent} delay={i * 80} height={10} />
                </div>
              );
            })}
          </div>
          <div style={{
            marginTop: 22, padding: "14px 16px", borderRadius: 10,
            background: T.redLight, border: `1px solid ${T.red}25`,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.red, marginBottom: 4 }}>Critical Drop-off Detected</div>
            <div style={{ fontSize: 12, color: T.textSub }}>
              210 users (27%) abandon at Employment Details. Recommend simplifying this step or adding guidance.
            </div>
          </div>
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Card title="Journey Summary" subtitle="This period">
            {[
              { label: "Total Started",   val: "1,000", color: T.accent },
              { label: "Completed",       val: "340",   color: T.green  },
              { label: "Dropped",         val: "660",   color: T.red    },
              { label: "Completion Rate", val: "34%",   color: T.amber  },
            ].map(r => (
              <div key={r.label} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "11px 0", borderBottom: `1px solid ${T.border}`,
              }}>
                <span style={{ fontSize: 13, color: T.textSub }}>{r.label}</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: r.color }}>{r.val}</span>
              </div>
            ))}
          </Card>
          <Card title="Step Completion" subtitle="Rate per step">
            {FUNNEL_DATA.map((step, i) => {
              const rate = Math.round(((step.entry - step.drop) / step.entry) * 100);
              const color = rate > 80 ? T.green : rate > 60 ? T.amber : T.red;
              return (
                <div key={step.step} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 12, color: T.textSub, width: 80, flexShrink: 0 }}>
                    {step.step.split(" ")[0]}
                  </span>
                  <div style={{ flex: 1 }}>
                    <AnimatedBar width={rate} color={color} delay={i * 60} height={7} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 800, color, width: 36, textAlign: "right" }}>{rate}%</span>
                </div>
              );
            })}
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── Governance Page ──────────────────────────────────────────────────────────
function GovernancePage({ sdkStatus }) {
  const [consent, setConsent] = useState(true);
  const rows = [
    { label: "SDK Initialized",  value: "Yes",                                        ok: true           },
    { label: "Consent Granted",  value: consent ? "Granted" : "Revoked",              ok: consent        },
    { label: "Masked Tenant ID", value: sdkStatus?.maskedTenantId || "Pending...",   ok: true           },
    { label: "Buffered Events",  value: String(sdkStatus?.bufferedEvents ?? 0),       ok: true           },
    { label: "Circuit Breaker",  value: sdkStatus?.circuitBreakerOpen ? "OPEN" : "Closed", ok: !sdkStatus?.circuitBreakerOpen },
    { label: "PII Masking",      value: "SHA-256 Active",                             ok: true           },
    { label: "Data Residency",   value: "In-browser to Masked Sync",                 ok: true           },
  ];

  return (
    <div>
      <PageHeader title="Governance & Compliance" subtitle="Telemetry controls, audit log, and consent management" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Card title="SDK Runtime Status" subtitle="Live telemetry system health">
          {rows.map(row => (
            <div key={row.label} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "11px 0", borderBottom: `1px solid ${T.border}`,
            }}>
              <span style={{ fontSize: 13, color: T.textSub }}>{row.label}</span>
              <span style={{
                fontSize: 11, fontWeight: 700, fontFamily: "monospace",
                color: row.ok ? T.green : T.red,
                background: row.ok ? T.greenLight : T.redLight,
                padding: "3px 10px", borderRadius: 999,
              }}>{row.value}</span>
            </div>
          ))}
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Card title="Telemetry Consent Control" subtitle="GDPR / RBI compliant per-tenant toggle">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 3 }}>Telemetry Collection</div>
                <div style={{ fontSize: 12, color: T.textMute }}>All data is masked before transmission</div>
              </div>
              <button onClick={() => setConsent(!consent)} style={{
                width: 52, height: 28, borderRadius: 999,
                background: consent ? T.green : "#D1D5DB",
                border: "none", cursor: "pointer", position: "relative",
                transition: "background 0.3s", flexShrink: 0,
              }}>
                <div style={{
                  position: "absolute", top: 3, left: consent ? 26 : 3,
                  width: 22, height: 22, borderRadius: "50%", background: "#fff",
                  transition: "left 0.3s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                }} />
              </button>
            </div>
            <div style={{
              padding: "12px 14px", borderRadius: 10,
              background: consent ? T.greenLight : T.redLight,
              border: `1px solid ${consent ? T.green : T.red}30`,
              fontSize: 12, color: consent ? T.green : T.red, fontWeight: 600,
            }}>
              {consent
                ? "Events are being captured and forwarded to analytics pipeline"
                : "Telemetry paused - Event buffer cleared"}
            </div>
          </Card>

          <Card title="Compliance Standards" subtitle="Frameworks satisfied by this SDK">
            {[
              { name: "PII Masking at Source",  desc: "SHA-256 hashing before memory exit"  },
              { name: "Tenant Isolation",        desc: "Masked IDs, no cross-tenant leakage" },
              { name: "Configurable Consent",    desc: "Per-tenant opt-in / opt-out"         },
              { name: "Circuit Breaker",         desc: "Auto-pause at CPU threshold"         },
              { name: "Audit Trail Ready",       desc: "All config changes logged"           },
            ].map(c => (
              <div key={c.name} style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 13 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.green, marginTop: 4, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: T.textMute }}>{c.desc}</div>
                </div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { sdkStatus } = useTelemetry();
  const [page, setPage] = useState("overview");

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: T.bg, fontFamily: "'Inter', 'DM Sans', 'Segoe UI', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400;14..32,500;14..32,600;14..32,700;14..32,800;14..32,900&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { 
          background: #F8F9FB; 
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
        ::selection { background: #6366F126; }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        @keyframes shimmer {
          0% { background-position: -1000px 0; }
          100% { background-position: 1000px 0; }
        }
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 20px rgba(99, 102, 241, 0.2); }
          50% { box-shadow: 0 0 30px rgba(99, 102, 241, 0.4); }
        }
        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        ::-webkit-scrollbar-track {
          background: #F8F9FB;
          border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, #6366F1, #818CF8);
          border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, #818CF8, #6366F1);
        }
      `}</style>
      <Sidebar active={page} setActive={setPage} />
      <div style={{ marginLeft: 220, flex: 1, display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <TopBar page={page} />
        <main style={{ flex: 1, padding: "28px 30px" }}>
          {page === "overview"   && <OverviewPage />}
          {page === "adoption"   && <AdoptionPage />}
          {page === "journeys"   && <JourneysPage />}
          {page === "governance" && <GovernancePage sdkStatus={sdkStatus} />}
        </main>
      </div>
    </div>
  );
}
