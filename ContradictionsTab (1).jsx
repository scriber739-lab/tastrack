import { useState, useMemo } from "react";

const PARTY_COLORS = {
  Liberal:"#1a3a6b", Labor:"#8b1a1a", Greens:"#1a5c2a",
  Independent:"#4a4a6b", SFF:"#5c3a1a",
};

const SEV = {
  high:   { bg:"#fbe8e8", color:"#9e2d2d", border:"#f0bcbc", label:"🔴 High" },
  medium: { bg:"#fff7e0", color:"#8a5f00", border:"#f0d880", label:"🟡 Medium" },
  low:    { bg:"#f0f4ff", color:"#3a5a9e", border:"#c0d0f0", label:"🔵 Low" },
};

const TYPE_LABELS = {
  statement_vs_statement: "Said vs Said",
  statement_vs_vote:      "Said vs Voted",
  promise_broken:         "Broken Promise",
  factual_flip:           "Factual Flip",
};

// ─────────────────────────────────────────────
// CONTRADICTION CARD
// ─────────────────────────────────────────────
function ContradictionCard({ c, onSelectPolitician, politician }) {
  const [expanded, setExpanded] = useState(false);
  const sev = SEV[c.severity] || SEV.low;
  const partyColor = PARTY_COLORS[politician?.party] || "#555";

  return (
    <div style={{ background:"#fff", borderRadius:12, border:`1px solid ${sev.border}`,
      marginBottom:12, overflow:"hidden", boxShadow:"0 2px 8px rgba(0,0,0,0.06)" }}>

      <div style={{ background:sev.bg, padding:"12px 16px", cursor:"pointer",
        display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10 }}
        onClick={() => setExpanded(!expanded)}>
        <div style={{ flex:1 }}>
          <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:6, flexWrap:"wrap" }}>
            <span style={{ fontSize:10, padding:"2px 8px", borderRadius:20, background:sev.bg,
              color:sev.color, border:`1px solid ${sev.border}`, fontWeight:700 }}>{sev.label}</span>
            <span style={{ fontSize:10, padding:"2px 8px", borderRadius:20, background:"#f0f0f0",
              color:"#555", fontWeight:700 }}>{TYPE_LABELS[c.type] || c.type}</span>
            <span style={{ fontSize:10, padding:"2px 8px", borderRadius:20, background:"#f5f0ff",
              color:"#5c3a9e", fontWeight:700 }}>🗂️ {c.policyArea}</span>
          </div>
          <div style={{ fontWeight:700, fontSize:14, color:"#1a1a2e", marginBottom:4 }}>{c.summary}</div>
          <div style={{ fontSize:12, color:"#777" }}>
            <span onClick={e => { e.stopPropagation(); if (politician) onSelectPolitician(politician); }}
              style={{ color:partyColor, fontWeight:700, cursor:"pointer", textDecoration:"underline" }}>
              {c.memberName}
            </span>
            {" "}· {c.statementA?.date} vs {c.statementB?.date}
          </div>
        </div>
        <span style={{ color:"#aaa", fontSize:14, flexShrink:0 }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div style={{ padding:"16px" }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
            {[
              ["📅 Statement A — what they said", c.statementA, "#e8f0ff", "#1a3a6b"],
              ["📅 Statement B — what contradicts it", c.statementB, "#fbe8e8", "#9e2d2d"],
            ].map(([label, stmt, bg, color]) => (
              <div key={label} style={{ background:bg, borderRadius:10, padding:"12px 14px" }}>
                <div style={{ fontSize:10, fontWeight:700, color, marginBottom:5, letterSpacing:0.3 }}>{label}</div>
                <div style={{ fontSize:11, color:"#888", marginBottom:6 }}>{stmt?.date}</div>
                <div style={{ fontSize:13, color:"#222", fontStyle:"italic", lineHeight:1.6, marginBottom:8 }}>
                  "{stmt?.quote}"
                </div>
                <div style={{ fontSize:11, color:"#777", lineHeight:1.5 }}>
                  <strong>Context:</strong> {stmt?.context}
                </div>
                <div style={{ fontSize:10, color:"#aaa", marginTop:4 }}>📄 {stmt?.source}</div>
              </div>
            ))}
          </div>

          <div style={{ background:"#f8f9ff", borderRadius:10, padding:"12px 14px",
            borderLeft:"3px solid #1a3a6b", marginBottom:10 }}>
            <div style={{ fontSize:10, fontWeight:700, color:"#1a3a6b", marginBottom:5, letterSpacing:0.3 }}>
              🔍 ANALYST ASSESSMENT
            </div>
            <div style={{ fontSize:13, color:"#333", lineHeight:1.65 }}>{c.explanation}</div>
          </div>

          <div style={{ display:"flex", gap:8, fontSize:11 }}>
            <span style={{ padding:"3px 10px", borderRadius:20, background:"#fbe8e8",
              color:"#9e2d2d", fontWeight:700 }}>
              {c.severity === "high" ? "−15 Trust Score" : c.severity === "medium" ? "−8 Trust Score" : "−3 Trust Score"}
            </span>
            <span style={{ padding:"3px 10px", borderRadius:20, background:"#f0f0f0",
              color:"#666", fontWeight:600 }}>Sourced from Hansard</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN EXPORTED COMPONENT
// props:
//   politicians     — array of politician objects (each with contradictions:[])
//   singleMemberMode — true when rendered inside a politician's DetailView tab
//   onSelectPolitician — called when user clicks a politician name (for cross-nav)
// ─────────────────────────────────────────────
export default function ContradictionsTab({ politicians = [], singleMemberMode = false, onSelectPolitician }) {
  const [selected,       setSelected]       = useState(null);
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [filterType,     setFilterType]     = useState("all");
  const [filterPolicy,   setFilterPolicy]   = useState("all");
  const [viewMode,       setViewMode]       = useState("feed");
  const [sortBy,         setSortBy]         = useState("severity");

  const handleSelectPolitician = (p) => {
    // In single-member mode, bubble up to the parent (DetailView) instead of internal nav
    if (singleMemberMode && onSelectPolitician) {
      onSelectPolitician(p);
    } else {
      setSelected(p);
    }
  };

  const allContradictions = useMemo(() => {
    const flat = [];
    for (const p of politicians) {
      for (const c of (p.contradictions || [])) {
        flat.push({ ...c, party: p.party });
      }
    }
    return flat;
  }, [politicians]);

  const policyAreas = [...new Set(allContradictions.map(c => c.policyArea))].sort();

  const filtered = useMemo(() => {
    let list = allContradictions;
    if (filterSeverity !== "all") list = list.filter(c => c.severity === filterSeverity);
    if (filterType     !== "all") list = list.filter(c => c.type === filterType);
    if (filterPolicy   !== "all") list = list.filter(c => c.policyArea === filterPolicy);
    const order = { high:0, medium:1, low:2 };
    if (sortBy === "severity") list = [...list].sort((a,b) => (order[a.severity]??3)-(order[b.severity]??3));
    else if (sortBy === "date") list = [...list].sort((a,b) => (b.statementB?.date||"").localeCompare(a.statementB?.date||""));
    else if (sortBy === "member") list = [...list].sort((a,b) => a.memberName.localeCompare(b.memberName));
    return list;
  }, [allContradictions, filterSeverity, filterType, filterPolicy, sortBy]);

  const byMember = useMemo(() =>
    politicians
      .map(p => ({ ...p, filtered: (p.contradictions||[]).filter(c => {
        if (filterSeverity !== "all" && c.severity !== filterSeverity) return false;
        if (filterType     !== "all" && c.type !== filterType) return false;
        if (filterPolicy   !== "all" && c.policyArea !== filterPolicy) return false;
        return true;
      })}))
      .filter(p => p.filtered.length > 0)
      .sort((a,b) => b.filtered.length - a.filtered.length)
  , [politicians, filterSeverity, filterType, filterPolicy]);

  const stats = {
    total:   allContradictions.length,
    high:    allContradictions.filter(c => c.severity === "high").length,
    medium:  allContradictions.filter(c => c.severity === "medium").length,
    low:     allContradictions.filter(c => c.severity === "low").length,
    members: new Set(allContradictions.map(c => c.memberId)).size,
  };

  // ---- POLITICIAN DRILL-DOWN (only in global tab view, not singleMemberMode) ----
  if (selected && !singleMemberMode) {
    return (
      <div>
        <button onClick={() => setSelected(null)}
          style={{ background:"none", border:"none", cursor:"pointer", color:"#1a3a6b",
            fontWeight:700, fontSize:13, padding:"0 0 14px", display:"flex", alignItems:"center", gap:5 }}>
          ← All contradictions
        </button>
        <div style={{ background:PARTY_COLORS[selected.party]||"#555", borderRadius:14,
          padding:"18px 20px", color:"#fff", marginBottom:14 }}>
          <div style={{ fontFamily:"Georgia, serif", fontSize:20, fontWeight:700 }}>{selected.name}</div>
          <div style={{ opacity:0.7, fontSize:12, marginTop:3 }}>{selected.party} · {selected.electorate}</div>
          <div style={{ marginTop:10, display:"flex", gap:10 }}>
            <div style={{ background:"rgba(255,255,255,0.15)", borderRadius:10, padding:"8px 14px", textAlign:"center" }}>
              <div style={{ fontSize:22, fontWeight:900, fontFamily:"monospace" }}>{(selected.contradictions||[]).length}</div>
              <div style={{ fontSize:10, opacity:0.7 }}>contradictions</div>
            </div>
            <div style={{ background:"rgba(255,255,255,0.15)", borderRadius:10, padding:"8px 14px", textAlign:"center" }}>
              <div style={{ fontSize:22, fontWeight:900, fontFamily:"monospace" }}>{selected.trustScore}</div>
              <div style={{ fontSize:10, opacity:0.7 }}>trust score</div>
            </div>
          </div>
        </div>
        {(selected.contradictions||[]).map((c,i) => (
          <ContradictionCard key={`${c.id}_${i}`} c={c} politician={selected} onSelectPolitician={setSelected} />
        ))}
      </div>
    );
  }

  // ---- MAIN HUB ----
  return (
    <>
      {/* Stats row — hidden in single-member mode (only 1 person, stats are obvious) */}
      {!singleMemberMode && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:8, marginBottom:14 }}>
          {[
            ["⚡", stats.total,   "total",         "#1a1a2e"],
            ["🔴", stats.high,    "high severity", "#9e2d2d"],
            ["🟡", stats.medium,  "medium",        "#8a5f00"],
            ["🔵", stats.low,     "low",           "#3a5a9e"],
            ["👤", stats.members, "politicians",   "#1a3a6b"],
          ].map(([icon,val,label,color]) => (
            <div key={label} style={{ background:"#fff", borderRadius:10, padding:"10px 6px",
              border:"1px solid #eee", textAlign:"center", boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}>
              <div style={{ fontSize:13, marginBottom:2 }}>{icon}</div>
              <div style={{ fontSize:20, fontWeight:800, color }}>{val}</div>
              <div style={{ fontSize:9, color:"#aaa" }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ background:"#fff", borderRadius:12, padding:"14px 16px", marginBottom:14,
        border:"1px solid #eee", boxShadow:"0 1px 6px rgba(0,0,0,0.05)" }}>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"flex-end" }}>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:"#888", marginBottom:4 }}>SEVERITY</div>
            <div style={{ display:"flex", gap:4 }}>
              {["all","high","medium","low"].map(s => (
                <button key={s} onClick={() => setFilterSeverity(s)}
                  style={{ padding:"4px 10px", borderRadius:20, border:"none", cursor:"pointer",
                    fontSize:11, fontWeight:700,
                    background:filterSeverity===s?"#1a1a2e":"#f0f0f0",
                    color:filterSeverity===s?"#fff":"#666" }}>
                  {s === "all" ? "All" : s.charAt(0).toUpperCase()+s.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:"#888", marginBottom:4 }}>TYPE</div>
            <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
              {[["all","All"],["promise_broken","Broken Promise"],["statement_vs_vote","Said vs Voted"],["statement_vs_statement","Said vs Said"],["factual_flip","Factual Flip"]].map(([v,l]) => (
                <button key={v} onClick={() => setFilterType(v)}
                  style={{ padding:"4px 10px", borderRadius:20, border:"none", cursor:"pointer",
                    fontSize:11, fontWeight:700, whiteSpace:"nowrap",
                    background:filterType===v?"#1a1a2e":"#f0f0f0",
                    color:filterType===v?"#fff":"#666" }}>{l}</button>
              ))}
            </div>
          </div>
          {/* Policy area filter — only useful in global view */}
          {!singleMemberMode && policyAreas.length > 0 && (
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:"#888", marginBottom:4 }}>POLICY AREA</div>
              <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                <button onClick={() => setFilterPolicy("all")}
                  style={{ padding:"4px 10px", borderRadius:20, border:"none", cursor:"pointer",
                    fontSize:11, fontWeight:700,
                    background:filterPolicy==="all"?"#1a1a2e":"#f0f0f0",
                    color:filterPolicy==="all"?"#fff":"#666" }}>All</button>
                {policyAreas.map(a => (
                  <button key={a} onClick={() => setFilterPolicy(a)}
                    style={{ padding:"4px 10px", borderRadius:20, border:"none", cursor:"pointer",
                      fontSize:11, fontWeight:700, whiteSpace:"nowrap",
                      background:filterPolicy===a?"#5c3a9e":"#f0f0f0",
                      color:filterPolicy===a?"#fff":"#666" }}>{a}</button>
                ))}
              </div>
            </div>
          )}
          <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"flex-end" }}>
            {/* View toggle — only in global view */}
            {!singleMemberMode && (
              <div>
                <div style={{ fontSize:10, fontWeight:700, color:"#888", marginBottom:4 }}>VIEW</div>
                <div style={{ display:"flex", gap:4 }}>
                  {[["feed","📋 Feed"],["by_member","👤 By Member"]].map(([v,l]) => (
                    <button key={v} onClick={() => setViewMode(v)}
                      style={{ padding:"5px 12px", borderRadius:20, border:"none", cursor:"pointer",
                        fontSize:11, fontWeight:700,
                        background:viewMode===v?"#1a3a6b":"#f0f0f0",
                        color:viewMode===v?"#fff":"#666" }}>{l}</button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:"#888", marginBottom:4 }}>SORT</div>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                style={{ padding:"5px 10px", borderRadius:20, border:"1px solid #ddd",
                  fontSize:11, cursor:"pointer", background:"#fff", fontFamily:"inherit" }}>
                <option value="severity">Severity</option>
                <option value="date">Most Recent</option>
                <option value="member">Member Name</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Info banner */}
      <div style={{ background:"#fffbf0", borderRadius:10, padding:"10px 14px", marginBottom:14,
        borderLeft:"3px solid #e0a020", fontSize:12, color:"#7a5500", lineHeight:1.6 }}>
        <strong>About these contradictions:</strong> Detected automatically by AI reading Hansard transcripts.
        Each is sourced directly from the parliamentary record. Verify at{" "}
        <a href="https://search.parliament.tas.gov.au/adv/hahansard" target="_blank" rel="noreferrer"
          style={{ color:"#8a5f00" }}>search.parliament.tas.gov.au</a>.
        Populated by running: <code style={{ background:"#fdefc0", padding:"1px 5px", borderRadius:4 }}>
          python tastrack_scraper.py --mode speeches
        </code>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div style={{ textAlign:"center", padding:"40px 20px", color:"#aaa" }}>
          <div style={{ fontSize:32, marginBottom:10 }}>⚡</div>
          <div style={{ fontSize:14, marginBottom:4 }}>No contradictions match your filter.</div>
          <div style={{ fontSize:12 }}>Try clearing filters or run the speech scraper to populate more data.</div>
        </div>
      )}

      {/* Feed view */}
      {(viewMode === "feed" || singleMemberMode) && filtered.length > 0 && (
        <div>
          {!singleMemberMode && (
            <div style={{ fontSize:12, color:"#888", marginBottom:10 }}>
              Showing {filtered.length} of {allContradictions.length} contradictions
            </div>
          )}
          {filtered.map((c,i) => (
            <ContradictionCard
              key={`${c.id}_${i}`} c={c}
              politician={politicians.find(p => p.id === c.memberId)}
              onSelectPolitician={handleSelectPolitician}
            />
          ))}
        </div>
      )}

      {/* By member view — global only */}
      {viewMode === "by_member" && !singleMemberMode && filtered.length > 0 && (
        <div>
          {byMember.map(p => (
            <div key={p.id} style={{ marginBottom:20 }}>
              <div onClick={() => setSelected(p)}
                style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10,
                  padding:"12px 16px", background:PARTY_COLORS[p.party]||"#555",
                  borderRadius:12, cursor:"pointer" }}>
                <div style={{ width:36, height:36, borderRadius:"50%",
                  background:"rgba(255,255,255,0.25)", display:"flex", alignItems:"center",
                  justifyContent:"center", fontSize:12, fontWeight:700, color:"#fff" }}>
                  {p.name.split(" ").map(n=>n[0]).join("").slice(0,2)}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ color:"#fff", fontWeight:700, fontSize:14 }}>{p.name}</div>
                  <div style={{ color:"rgba(255,255,255,0.65)", fontSize:11 }}>{p.party} · {p.electorate}</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:20, fontWeight:900, fontFamily:"monospace",
                    color:p.filtered.some(c=>c.severity==="high")?"#ff9999":
                          p.filtered.some(c=>c.severity==="medium")?"#ffd166":"#aef0d1" }}>
                    {p.filtered.length}
                  </div>
                  <div style={{ fontSize:10, color:"rgba(255,255,255,0.5)" }}>contradictions</div>
                </div>
              </div>
              {p.filtered.map((c,i) => (
                <ContradictionCard key={`${c.id}_${i}`} c={c} politician={p} onSelectPolitician={handleSelectPolitician} />
              ))}
            </div>
          ))}
        </div>
      )}

      {!singleMemberMode && (
        <div style={{ marginTop:16, textAlign:"center", fontSize:11, color:"#ccc", lineHeight:1.8 }}>
          All 35 members · 52nd Parliament · July 2025<br/>
          Contradictions sourced from Tasmania Hansard via AI analysis · Always verify primary sources
        </div>
      )}
    </>
  );
}
