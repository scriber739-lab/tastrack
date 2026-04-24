import { useState, useCallback, useRef, useEffect } from "react";

// ============================================================
// SUPABASE CONFIG
// ============================================================
const SUPABASE_URL  = "https://wdcxrbjzwrijgkjlvdng.supabase.co";
const SUPABASE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkY3hyYmp6d3Jpamdramx2ZG5nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4ODQ3ODgsImV4cCI6MjA5MjQ2MDc4OH0.Jx5r9pxl7EYM0vqiNU3au5CjHwNbx8H6Oa_PDtwPKt0";

const sb = async (path, opts={}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Prefer": opts.prefer || "return=representation",
      ...(opts.headers||{}),
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase ${path}: ${res.status} ${err.slice(0,200)}`);
  }
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
};

// ============================================================
// CONSTANTS
// ============================================================
const ALL_MEMBERS = [
  { id:1,  name:"Janie Finlay",      party:"Labor",       electorate:"Bass" },
  { id:2,  name:"Jess Greene",       party:"Labor",       electorate:"Bass" },
  { id:3,  name:"Cecily Rosol",      party:"Greens",      electorate:"Bass" },
  { id:4,  name:"George Razay",      party:"Independent", electorate:"Bass" },
  { id:5,  name:"Bridget Archer",    party:"Liberal",     electorate:"Bass" },
  { id:6,  name:"Michael Ferguson",  party:"Liberal",     electorate:"Bass" },
  { id:7,  name:"Rob Fairs",         party:"Liberal",     electorate:"Bass" },
  { id:8,  name:"Anita Dow",         party:"Labor",       electorate:"Braddon" },
  { id:9,  name:"Shane Broad",       party:"Labor",       electorate:"Braddon" },
  { id:10, name:"Craig Garland",     party:"Independent", electorate:"Braddon" },
  { id:11, name:"Jeremy Rockliff",   party:"Liberal",     electorate:"Braddon" },
  { id:12, name:"Gavin Pearce",      party:"Liberal",     electorate:"Braddon" },
  { id:13, name:"Felix Ellis",       party:"Liberal",     electorate:"Braddon" },
  { id:14, name:"Roger Jaensch",     party:"Liberal",     electorate:"Braddon" },
  { id:15, name:"Ella Haddad",       party:"Labor",       electorate:"Clark" },
  { id:16, name:"Josh Willie",       party:"Labor",       electorate:"Clark" },
  { id:17, name:"Vica Bayley",       party:"Greens",      electorate:"Clark" },
  { id:18, name:"Helen Burnet",      party:"Greens",      electorate:"Clark" },
  { id:19, name:"Kristie Johnston",  party:"Independent", electorate:"Clark" },
  { id:20, name:"Marcus Vermey",     party:"Liberal",     electorate:"Clark" },
  { id:21, name:"Madeleine Ogilvie", party:"Liberal",     electorate:"Clark" },
  { id:22, name:"Dean Winter",       party:"Labor",       electorate:"Franklin" },
  { id:23, name:"Meg Brown",         party:"Labor",       electorate:"Franklin" },
  { id:24, name:"Rosalie Woodruff",  party:"Greens",      electorate:"Franklin" },
  { id:25, name:"David O'Byrne",     party:"Independent", electorate:"Franklin" },
  { id:26, name:"Peter George",      party:"Independent", electorate:"Franklin" },
  { id:27, name:"Eric Abetz",        party:"Liberal",     electorate:"Franklin" },
  { id:28, name:"Jacquie Petrusma",  party:"Liberal",     electorate:"Franklin" },
  { id:29, name:"Jen Butler",        party:"Labor",       electorate:"Lyons" },
  { id:30, name:"Brian Mitchell",    party:"Labor",       electorate:"Lyons" },
  { id:31, name:"Tabatha Badger",    party:"Greens",      electorate:"Lyons" },
  { id:32, name:"Carlo Di Falco",    party:"SFF",         electorate:"Lyons" },
  { id:33, name:"Guy Barnett",       party:"Liberal",     electorate:"Lyons" },
  { id:34, name:"Jane Howlett",      party:"Liberal",     electorate:"Lyons" },
  { id:35, name:"Mark Shelton",      party:"Liberal",     electorate:"Lyons" },
];

const POLICY_AREAS = [
  "Housing & Rent","Environment & Climate","Health & Hospitals",
  "Gambling Reform","Macquarie Point Stadium","Fiscal Policy & Debt",
  "Governance & Accountability","Transport & Infrastructure",
  "Education","Agriculture & Fishing","Other"
];

const POLICY_KEY_MAP = {
  "Housing & Rent":"housing","Environment & Climate":"environment",
  "Health & Hospitals":"health","Gambling Reform":"gambling",
  "Macquarie Point Stadium":"stadium","Fiscal Policy & Debt":"fiscal",
  "Governance & Accountability":"governance","Transport & Infrastructure":"transport",
  "Education":"education","Agriculture & Fishing":"agriculture","Other":"other",
};

const PARTY_COLORS = {
  Liberal:"#1a3a6b", Labor:"#8b1a1a", Greens:"#1a5c2a",
  Independent:"#4a4a6b", SFF:"#5c3a1a",
};

const uid = () => Math.random().toString(36).slice(2,8);
const today = () => new Date().toISOString().slice(0,10);

// ============================================================
// UI HELPERS
// ============================================================
function Inp({ label, value, onChange, placeholder, type="text" }) {
  return (
    <div style={{marginBottom:10}}>
      {label && <label style={{display:"block",fontSize:11,fontWeight:700,color:"#555",marginBottom:3,letterSpacing:0.3}}>{label}</label>}
      <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder||""}
        style={{width:"100%",padding:"7px 10px",border:"1px solid #ddd",borderRadius:7,fontSize:13,boxSizing:"border-box",fontFamily:"inherit"}} />
    </div>
  );
}
function Sel({ label, value, onChange, options }) {
  return (
    <div style={{marginBottom:10}}>
      {label && <label style={{display:"block",fontSize:11,fontWeight:700,color:"#555",marginBottom:3,letterSpacing:0.3}}>{label}</label>}
      <select value={value} onChange={e=>onChange(e.target.value)}
        style={{width:"100%",padding:"7px 10px",border:"1px solid #ddd",borderRadius:7,fontSize:13,boxSizing:"border-box",background:"#fff",fontFamily:"inherit"}}>
        {options.map(o=><option key={o.value||o} value={o.value||o}>{o.label||o}</option>)}
      </select>
    </div>
  );
}
function Btn({ children, onClick, disabled, color="#1a3a6b", outline, small }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{padding:small?"5px 12px":"10px 18px",border:outline?`1px solid ${color}`:"none",borderRadius:8,
        fontSize:small?11:13,fontWeight:700,cursor:disabled?"not-allowed":"pointer",fontFamily:"inherit",
        background:disabled?"#ccc":outline?"#fff":color,color:disabled?"#fff":outline?color:"#fff"}}>
      {children}
    </button>
  );
}

// ============================================================
// AI EXTRACTOR
// ============================================================
function AIExtractor({ onImport }) {
  const [stage,     setStage]     = useState("idle");
  const [fileInfo,  setFileInfo]  = useState(null);
  const [extracted, setExtracted] = useState(null);
  const [error,     setError]     = useState(null);
  const [progress,  setProgress]  = useState("");
  const [selected,  setSelected]  = useState({});
  const fileRef = useRef();

  const readFileAsBase64 = f => new Promise((res,rej) => { const r=new FileReader(); r.onload=()=>res(r.result.split(",")[1]); r.onerror=rej; r.readAsDataURL(f); });
  const readFileAsText   = f => new Promise((res,rej) => { const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsText(f); });

  const handleFile = async (file) => {
    setError(null); setStage("reading");
    setFileInfo({ name:file.name, size:(file.size/1024).toFixed(1)+"KB" });
    setProgress("Reading document...");
    try {
      let content, mediaType;
      const ext = file.name.split(".").pop().toLowerCase();
      if (ext==="pdf" || file.type==="application/pdf") {
        content = await readFileAsBase64(file); mediaType = "application/pdf";
      } else {
        content = await readFileAsText(file); mediaType = null;
      }
      setStage("extracting"); setProgress("Sending to Claude for extraction...");

      const memberList = ALL_MEMBERS.map(m=>`id:${m.id} — ${m.name} (${m.party}, ${m.electorate})`).join("\n");
      const systemPrompt = `You are extracting parliamentary voting data from a Tasmanian House of Assembly Votes and Proceedings document.

The full member list you must match against is:
${memberList}

IMPORTANT MATCHING RULES:
- Members are referred to by surname only (e.g. "Ms Haddad", "Mr Rockliff", "Dr Broad")
- Match each name to the correct member ID from the list above
- If you cannot confidently match a name, use id: null and put the raw name in an "unmatched" field
- "Ayes" or "For" = vote: "for"
- "Noes" or "Against" = vote: "against"
- Members listed as "Pairs" or not appearing = vote: "absent"

CRITICAL — TWO TYPES OF VOTES TO EXTRACT:

TYPE 1 — FORMAL DIVISIONS (The Committee/House divided):
These have named Ayes and Noes lists. Extract all votes for each named member.
Set "divisionType": "formal" and populate the "votes" array with every named member.

TYPE 2 — VOICE VOTES (passed/defeated on the voices, no division called):
These say "It was resolved in the Affirmative/Negative" with NO names listed.
Still extract these. Set "divisionType": "voice" and leave "votes" as an empty array [].
Examples: second readings, third readings, bill passages that say "resolved in the Affirmative" without a division.

WHAT TO EXTRACT:
- ALL divisions (formal and voice) for significant bills and motions
- For bills with BOTH amendments (formal divisions) AND a final passage (voice vote), extract BOTH separately
- The final third reading or passage of a bill is always worth extracting even if it passed on the voices
- Do NOT extract procedural motions like "leave to extend speaking time", "suspension of sitting", or "papers tabled"
- DO extract: bill readings, motions, amendments that were formally divided on, and significant voice-vote passages

Return ONLY a valid JSON object in this exact structure, no markdown, no preamble:
{
  "documentDate": "YYYY-MM-DD",
  "documentSource": "string describing which V&P document this is",
  "divisions": [
    {
      "id": "generated short id",
      "bill": "exact bill or motion name",
      "summary": "one sentence describing what was voted on",
      "outcome": "passed|defeated|tied",
      "divisionType": "formal|voice",
      "ayes": 0,
      "noes": 0,
      "policyArea": "best matching policy area from: Housing & Rent, Environment & Climate, Health & Hospitals, Gambling Reform, Macquarie Point Stadium, Fiscal Policy & Debt, Governance & Accountability, Transport & Infrastructure, Education, Agriculture & Fishing, Other",
      "inverse": false,
      "votes": [
        { "memberId": 11, "memberName": "Jeremy Rockliff", "vote": "for|against|absent" }
      ]
    }
  ],
  "sittingDays": ["YYYY-MM-DD"],
  "membersPresent": [1, 2, 3]
}

INVERSE FIELD RULES — this is critical for correct stance scoring:
Set "inverse": true when voting FOR the bill/motion would actually indicate OPPOSITION to the policy area it belongs to.

Common inverse cases:
- Scrutiny or transparency motions (e.g. "Cost Disclosure Motion", "Audit Motion") — voting FOR = sceptic/opponent of the project
- Prevention or prohibition motions (e.g. "Privatisation Prevention Motion") — voting FOR = opposed to the activity
- No-confidence motions — inverse:false (FOR = pro-accountability, which is the natural reading)
- Funding or approval bills — always inverse:false

When in doubt, ask: "If a politician voted FOR this, would a reasonable person say they SUPPORT the policy area?" If no, set inverse:true.`;

      let messages;
      if (mediaType) {
        messages = [{ role:"user", content:[
          { type:"document", source:{ type:"base64", media_type:mediaType, data:content } },
          { type:"text", text:"Extract all divisions from this Votes and Proceedings document. Return only a valid JSON object. No explanation, no preamble, just JSON." }
        ]}];
      } else {
        messages = [{ role:"user", content:`Extract all divisions from this Votes and Proceedings document. Return only a valid JSON object, no preamble.\n\nDOCUMENT TEXT:\n${content.slice(0,40000)}` }];
      }

      const resp = await fetch("/api/claude", { method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:8000, system:systemPrompt, messages }) });

      setProgress("Parsing extraction results...");
      const rawResp = await resp.text();
      if (!rawResp || rawResp.trim()==="") throw new Error(`Empty response from proxy (HTTP ${resp.status}).`);
      let data;
      try { data = JSON.parse(rawResp); } catch(e) { throw new Error(`Proxy returned non-JSON (HTTP ${resp.status}): ${rawResp.slice(0,300)}`); }
      if (!resp.ok || data.error) throw new Error(`API error ${resp.status}: ${data.error?.message || JSON.stringify(data).slice(0,300)}`);

      const raw = data.content?.filter(b=>b.type==="text").map(b=>b.text).join("") || "{}";
      let clean = raw.replace(/```json|```/g,"").trim();
      const fb = clean.indexOf("{"); const lb = clean.lastIndexOf("}");
      if (fb!==-1 && lb!==-1 && lb>fb) clean = clean.slice(fb, lb+1);
      let parsed;
      try { parsed = JSON.parse(clean); } catch(e) { throw new Error("Claude returned unparseable JSON: "+raw.slice(0,200)); }
      if (!parsed.divisions || parsed.divisions.length===0) throw new Error("No divisions found. Make sure this is a Votes and Proceedings document.");

      const sel = {}; parsed.divisions.forEach(d=>sel[d.id]=true);
      setSelected(sel); setExtracted(parsed); setStage("review"); setProgress("");
    } catch(e) { setError(e.message); setStage("idle"); }
  };

  const reset = () => { setStage("idle"); setFileInfo(null); setExtracted(null); setError(null); setProgress(""); setSelected({}); };

  const handleImport = () => {
    if (!extracted) return;
    onImport(extracted.divisions.filter(d=>selected[d.id]), extracted);
    setStage("done");
  };

  if (stage==="review" && extracted) {
    const selectedCount = Object.values(selected).filter(Boolean).length;
    return (
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div>
            <div style={{fontWeight:700,fontSize:15,color:"#1a1a2e"}}>✅ Extracted {extracted.divisions.length} divisions from {fileInfo?.name}</div>
            <div style={{fontSize:12,color:"#888",marginTop:2}}>Review and deselect any you don't want to import</div>
          </div>
          <Btn onClick={reset} outline color="#888" small>← New file</Btn>
        </div>
        {extracted.divisions.map((div,i) => {
          const forVotes = div.votes?.filter(v=>v.vote==="for")||[];
          const againstVotes = div.votes?.filter(v=>v.vote==="against")||[];
          const unmatched = div.votes?.filter(v=>v.memberId===null)||[];
          const isSel = selected[div.id];
          return (
            <div key={div.id||i} style={{marginBottom:10,borderRadius:10,border:`2px solid ${isSel?"#1a3a6b":"#ddd"}`,background:isSel?"#f8f9ff":"#fafafa",overflow:"hidden"}}>
              <div style={{display:"flex",alignItems:"flex-start",gap:10,padding:"12px 14px",cursor:"pointer"}}
                onClick={()=>setSelected(prev=>({...prev,[div.id]:!prev[div.id]}))}>
                <div style={{width:20,height:20,borderRadius:5,border:`2px solid ${isSel?"#1a3a6b":"#ccc"}`,background:isSel?"#1a3a6b":"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>
                  {isSel && <span style={{color:"#fff",fontSize:12,fontWeight:900}}>✓</span>}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:13,color:"#222",marginBottom:3}}>{div.bill}</div>
                  <div style={{fontSize:12,color:"#666",marginBottom:5}}>{div.summary}</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,fontWeight:700,background:div.outcome==="passed"?"#e8f5e8":"#fbe8e8",color:div.outcome==="passed"?"#2d7a2d":"#9e2d2d"}}>{div.outcome?.toUpperCase()}</span>
                    {div.divisionType==="voice" ? (
                      <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:"#f0f4ff",color:"#1a3a6b",fontWeight:700}}>🗣️ Voice vote</span>
                    ) : (
                      <>
                        <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:"#e8f0ff",color:"#1a3a6b",fontWeight:700}}>✅ {forVotes.length} for</span>
                        <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:"#fbe8e8",color:"#9e2d2d",fontWeight:700}}>❌ {againstVotes.length} against</span>
                      </>
                    )}
                    <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:"#f5f0ff",color:"#5c3a9e",fontWeight:700}}>🗂️ {div.policyArea}</span>
                    {div.inverse && <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:"#fff7e0",color:"#8a5f00",fontWeight:700}}>⚠️ Inverse</span>}
                    {unmatched.length>0 && <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:"#fff3cd",color:"#856404",fontWeight:700}}>⚠️ {unmatched.length} unmatched</span>}
                  </div>
                  {unmatched.length>0 && <div style={{marginTop:4,fontSize:11,color:"#856404",background:"#fff3cd",borderRadius:6,padding:"3px 8px"}}>Could not match: {unmatched.map(v=>v.memberName||v.unmatched).join(", ")}</div>}
                  <details style={{marginTop:6}}><summary style={{fontSize:11,color:"#4a90d9",cursor:"pointer",fontWeight:600}}>Show all {div.votes?.length||0} votes</summary>
                    <div style={{marginTop:6,display:"flex",flexWrap:"wrap",gap:4}}>
                      {(div.votes||[]).map((v,j)=>(
                        <span key={j} style={{fontSize:10,padding:"2px 7px",borderRadius:20,fontWeight:600,background:v.vote==="for"?"#e8f5e8":v.vote==="against"?"#fbe8e8":"#f0f0f0",color:v.vote==="for"?"#2d7a2d":v.vote==="against"?"#9e2d2d":"#888",border:v.memberId===null?"2px solid #ffc107":"none"}}>{v.memberName} {v.vote==="for"?"✓":v.vote==="against"?"✗":"—"}</span>
                      ))}
                    </div>
                  </details>
                </div>
              </div>
            </div>
          );
        })}
        <div style={{display:"flex",gap:10,marginTop:4}}>
          <Btn onClick={handleImport} disabled={selectedCount===0} color="#2d7a5f">✅ Import {selectedCount} division{selectedCount!==1?"s":""} to Supabase</Btn>
          <Btn onClick={reset} outline color="#888">Cancel</Btn>
        </div>
      </div>
    );
  }

  if (stage==="done") return (
    <div style={{textAlign:"center",padding:"30px 0"}}>
      <div style={{fontSize:40,marginBottom:10}}>✅</div>
      <div style={{fontWeight:700,fontSize:16,color:"#2d7a5f",marginBottom:6}}>Saved to Supabase</div>
      <div style={{fontSize:13,color:"#888",marginBottom:20}}>Data is live in the app immediately.</div>
      <Btn onClick={reset}>Extract another document</Btn>
    </div>
  );

  return (
    <div>
      <div style={{background:"#f0faf4",borderRadius:10,padding:"12px 14px",marginBottom:16,fontSize:12,color:"#2d5a3d",lineHeight:1.7,borderLeft:"3px solid #2d9e5f"}}>
        <strong>How this works:</strong> Download a V&P PDF from <a href="https://search.parliament.tas.gov.au/adv/havotes" target="_blank" rel="noreferrer" style={{color:"#2d7a5f"}}>Tasmania Hansard</a>, drop it here. Claude extracts every division and saves directly to Supabase — live in the app instantly.
      </div>
      <div onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)handleFile(f);}} onDragOver={e=>e.preventDefault()} onClick={()=>fileRef.current?.click()}
        style={{border:"2px dashed #c0d0e8",borderRadius:12,padding:"40px 20px",textAlign:"center",cursor:"pointer",background:"#f8f9ff"}}
        onMouseEnter={e=>{e.currentTarget.style.borderColor="#1a3a6b";e.currentTarget.style.background="#f0f4ff";}}
        onMouseLeave={e=>{e.currentTarget.style.borderColor="#c0d0e8";e.currentTarget.style.background="#f8f9ff";}}>
        <input ref={fileRef} type="file" accept=".pdf,.txt" style={{display:"none"}} onChange={e=>e.target.files[0]&&handleFile(e.target.files[0])} />
        <div style={{fontSize:40,marginBottom:10}}>📄</div>
        <div style={{fontWeight:700,fontSize:15,color:"#1a3a6b",marginBottom:4}}>Drop a Votes & Proceedings document here</div>
        <div style={{fontSize:12,color:"#888",marginBottom:12}}>or click to browse · PDF or TXT</div>
        <div style={{display:"inline-block",padding:"8px 20px",background:"#1a3a6b",color:"#fff",borderRadius:8,fontSize:13,fontWeight:700}}>Choose File</div>
      </div>
      {(stage==="reading"||stage==="extracting") && (
        <div style={{marginTop:16,background:"#fff",borderRadius:10,padding:"16px",border:"1px solid #eee",textAlign:"center"}}>
          <div style={{display:"inline-block",width:24,height:24,border:"3px solid #e0e8ff",borderTopColor:"#1a3a6b",borderRadius:"50%",animation:"spin 0.8s linear infinite",marginBottom:8}}/>
          <div style={{fontSize:13,color:"#1a3a6b",fontWeight:700}}>{progress}</div>
          {fileInfo && <div style={{fontSize:11,color:"#aaa",marginTop:4}}>{fileInfo.name} · {fileInfo.size}</div>}
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}
      {error && <div style={{marginTop:14,background:"#fbe8e8",borderRadius:10,padding:"12px 14px",borderLeft:"3px solid #c0392b",fontSize:13,color:"#c0392b"}}><strong>Error:</strong> {error}</div>}
    </div>
  );
}

// ============================================================
// MANUAL DIVISION ENTRY
// ============================================================
function ManualDivisionEntry({ onSave }) {
  const [bill,setbill]=useState(""); const [date,setDate]=useState(today());
  const [policy,setPolicy]=useState(POLICY_AREAS[0]); const [source,setSource]=useState("");
  const [outcome,setOutcome]=useState("passed"); const [summary,setSummary]=useState("");
  const [votes,setVotes]=useState({}); const [consistency,setConsistency]=useState({});
  const [inverse,setInverse]=useState(false);

  const setVote=(id,v)=>setVotes(p=>({...p,[id]:v}));
  const setCons=(id,v)=>setConsistency(p=>({...p,[id]:v}));
  const fillParty=(party,val)=>{const n={...votes};ALL_MEMBERS.forEach(m=>m.party===party&&(n[m.id]=val));setVotes(n);};
  const fillAll=(val)=>{const n={};ALL_MEMBERS.forEach(m=>n[m.id]=val);setVotes(n);};

  const forCount=Object.values(votes).filter(v=>v==="for").length;
  const againstCount=Object.values(votes).filter(v=>v==="against").length;
  const canSave=bill&&date&&source&&(forCount+againstCount)>0;

  const handleSave=()=>{
    const entries=[];
    for(const m of ALL_MEMBERS){const v=votes[m.id];if(v&&v!=="absent")entries.push({memberId:m.id,entry:{id:uid(),bill,date,policyArea:policy,vote:v,consistency:consistency[m.id]||"unknown",source,divisionOutcome:outcome}});}
    onSave(entries,{bill,date,policy,source,outcome,summary,inverse});
    setbill("");setDate(today());setSource("");setSummary("");setVotes({});setConsistency({});setInverse(false);
  };

  const electorates=[...new Set(ALL_MEMBERS.map(m=>m.electorate))];
  const vBtn=(id,label,val,color)=>(
    <button onClick={()=>setVote(id,val)} style={{padding:"3px 8px",fontSize:10,fontWeight:700,border:"none",borderRadius:20,cursor:"pointer",background:votes[id]===val?color:"#f0f0f0",color:votes[id]===val?"#fff":"#999"}}>{label}</button>
  );

  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div style={{gridColumn:"1/-1"}}><Inp label="BILL / MOTION NAME" value={bill} onChange={setbill} placeholder="e.g. Housing Affordability Amendment Bill 2024"/></div>
        <Inp label="DATE" value={date} onChange={setDate} type="date"/>
        <Sel label="POLICY AREA" value={policy} onChange={setPolicy} options={POLICY_AREAS}/>
        <Sel label="OUTCOME" value={outcome} onChange={setOutcome} options={[{value:"passed",label:"✅ Passed"},{value:"defeated",label:"❌ Defeated"},{value:"tied",label:"⚖️ Tied"}]}/>
        <Inp label="SOURCE" value={source} onChange={setSource} placeholder="e.g. V&P No.23, 14 Jun 2024"/>
        <div style={{gridColumn:"1/-1"}}>
          <label style={{display:"block",fontSize:11,fontWeight:700,color:"#555",marginBottom:3}}>SUMMARY</label>
          <textarea value={summary} onChange={e=>setSummary(e.target.value)} rows={2} placeholder="One sentence describing what this vote was about..." style={{width:"100%",padding:"7px 10px",border:"1px solid #ddd",borderRadius:7,fontSize:13,resize:"vertical",boxSizing:"border-box",fontFamily:"inherit"}}/>
        </div>
        <div style={{gridColumn:"1/-1"}}>
          <div onClick={()=>setInverse(v=>!v)} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 12px",borderRadius:8,cursor:"pointer",background:inverse?"#fff7e0":"#f8f9ff",border:`1px solid ${inverse?"#e0a020":"#dde4f0"}`}}>
            <div style={{width:18,height:18,borderRadius:4,border:`2px solid ${inverse?"#e0a020":"#ccc"}`,background:inverse?"#e0a020":"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>{inverse&&<span style={{color:"#fff",fontSize:11,fontWeight:900}}>✓</span>}</div>
            <div><div style={{fontSize:12,fontWeight:700,color:inverse?"#8a5f00":"#444"}}>⚠️ Inverse division</div><div style={{fontSize:11,color:"#888",marginTop:1,lineHeight:1.5}}>Check this if voting FOR signals <em>opposition</em> to the policy — e.g. scrutiny motions, prevention motions.</div></div>
          </div>
        </div>
      </div>
      <div style={{background:"#f8f9ff",borderRadius:8,padding:"10px 12px",marginBottom:10}}>
        <div style={{fontSize:11,fontWeight:700,color:"#555",marginBottom:6}}>QUICK FILL BY PARTY</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6}}>
          {["Liberal","Labor","Greens","Independent","SFF"].map(p=>(
            <div key={p} style={{display:"flex",gap:3,alignItems:"center"}}>
              <span style={{fontSize:10,color:PARTY_COLORS[p],fontWeight:700}}>{p}:</span>
              <button onClick={()=>fillParty(p,"for")} style={{padding:"2px 6px",fontSize:10,fontWeight:700,border:"none",borderRadius:20,cursor:"pointer",background:"#2d9e5f22",color:"#2d7a2d"}}>FOR</button>
              <button onClick={()=>fillParty(p,"against")} style={{padding:"2px 6px",fontSize:10,fontWeight:700,border:"none",borderRadius:20,cursor:"pointer",background:"#c0392b22",color:"#c0392b"}}>AGAINST</button>
              <button onClick={()=>fillParty(p,"absent")} style={{padding:"2px 6px",fontSize:10,fontWeight:700,border:"none",borderRadius:20,cursor:"pointer",background:"#88888822",color:"#888"}}>ABSENT</button>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:5}}>
          <button onClick={()=>fillAll("for")} style={{padding:"3px 10px",fontSize:11,fontWeight:700,border:"none",borderRadius:20,cursor:"pointer",background:"#2d9e5f",color:"#fff"}}>All FOR</button>
          <button onClick={()=>fillAll("against")} style={{padding:"3px 10px",fontSize:11,fontWeight:700,border:"none",borderRadius:20,cursor:"pointer",background:"#c0392b",color:"#fff"}}>All AGAINST</button>
          <button onClick={()=>setVotes({})} style={{padding:"3px 10px",fontSize:11,fontWeight:700,border:"1px solid #ddd",borderRadius:20,cursor:"pointer",background:"#fff",color:"#888"}}>Clear</button>
        </div>
      </div>
      <div style={{fontSize:11,fontWeight:700,color:"#555",marginBottom:6}}>{forCount} for · {againstCount} against</div>
      {electorates.map(elec=>(
        <div key={elec} style={{marginBottom:8}}>
          <div style={{fontSize:10,fontWeight:700,color:"#bbb",letterSpacing:1,marginBottom:4,textTransform:"uppercase"}}>{elec}</div>
          {ALL_MEMBERS.filter(m=>m.electorate===elec).map(m=>(
            <div key={m.id} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0",borderBottom:"1px solid #f5f5f5"}}>
              <div style={{width:7,height:7,borderRadius:"50%",background:PARTY_COLORS[m.party]||"#888",flexShrink:0}}/>
              <div style={{width:155,fontSize:12,fontWeight:600,color:"#222"}}>{m.name}</div>
              <div style={{display:"flex",gap:3}}>{vBtn(m.id,"FOR","for","#2d9e5f")}{vBtn(m.id,"AGAINST","against","#c0392b")}{vBtn(m.id,"ABSENT","absent","#aaa")}</div>
              {(votes[m.id]==="for"||votes[m.id]==="against")&&(
                <div style={{display:"flex",gap:3,marginLeft:4}}>
                  {[["✅","consistent","#2d9e5f"],["❌","inconsistent","#c0392b"],["?","unknown","#aaa"]].map(([l,v,c])=>(
                    <button key={v} onClick={()=>setCons(m.id,v)} style={{padding:"2px 5px",fontSize:10,fontWeight:700,border:"none",borderRadius:20,cursor:"pointer",background:consistency[m.id]===v?c+"33":"#f0f0f0",color:consistency[m.id]===v?c:"#ccc"}}>{l}</button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
      <button onClick={handleSave} disabled={!canSave} style={{marginTop:8,width:"100%",padding:"11px",border:"none",borderRadius:10,fontSize:14,fontWeight:700,background:canSave?"#1a3a6b":"#ccc",color:"#fff",cursor:canSave?"pointer":"not-allowed"}}>✅ Save Division ({forCount}–{againstCount})</button>
    </div>
  );
}

// ============================================================
// DATABASE TAB — view and delete records
// ============================================================
function DatabaseTab({ showToast }) {
  const [view,       setView]       = useState("divisions"); // divisions | votes
  const [divisions,  setDivisions]  = useState([]);
  const [votes,      setVotes]      = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [filterMember, setFilterMember] = useState("");
  const [filterPolicy, setFilterPolicy] = useState("");
  const [deleting,   setDeleting]   = useState({});

  const loadDivisions = async () => {
    setLoading(true);
    try {
      const data = await sb("divisions?order=date.desc&limit=200", { prefer:"" });
      setDivisions(data||[]);
    } catch(e) { showToast("❌ "+e.message); }
    setLoading(false);
  };

  const loadVotes = async () => {
    setLoading(true);
    try {
      let url = "votes?order=date.desc&limit=500";
      if (filterMember) url += `&member_id=eq.${filterMember}`;
      if (filterPolicy) url += `&policy_key=eq.${filterPolicy}`;
      const data = await sb(url, { prefer:"" });
      setVotes(data||[]);
    } catch(e) { showToast("❌ "+e.message); }
    setLoading(false);
  };

  useEffect(() => { if(view==="divisions") loadDivisions(); else loadVotes(); }, [view, filterMember, filterPolicy]);

  const deleteDivision = async (id) => {
    if (!window.confirm("Delete this division AND all its votes? This cannot be undone.")) return;
    setDeleting(p=>({...p,[id]:true}));
    try {
      // Votes are deleted by cascade in Supabase (on delete cascade)
      await sb(`divisions?id=eq.${id}`, { method:"DELETE", prefer:"" });
      setDivisions(prev=>prev.filter(d=>d.id!==id));
      showToast("✅ Division deleted");
    } catch(e) { showToast("❌ "+e.message); }
    setDeleting(p=>({...p,[id]:false}));
  };

  const deleteVote = async (id) => {
    if (!window.confirm("Delete this individual vote record?")) return;
    setDeleting(p=>({...p,[id]:true}));
    try {
      await sb(`votes?id=eq.${id}`, { method:"DELETE", prefer:"" });
      setVotes(prev=>prev.filter(v=>v.id!==id));
      showToast("✅ Vote deleted");
    } catch(e) { showToast("❌ "+e.message); }
    setDeleting(p=>({...p,[id]:false}));
  };

  return (
    <div>
      <div style={{display:"flex",gap:8,marginBottom:14,alignItems:"center",flexWrap:"wrap"}}>
        {[["divisions","🏛️ Divisions"],["votes","🗳️ Votes"]].map(([v,l])=>(
          <button key={v} onClick={()=>setView(v)} style={{padding:"7px 16px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,background:view===v?"#1a3a6b":"#f0f0f0",color:view===v?"#fff":"#555"}}>{l}</button>
        ))}
        {view==="votes" && (
          <>
            <select value={filterMember} onChange={e=>setFilterMember(e.target.value)} style={{padding:"6px 10px",borderRadius:20,border:"1px solid #ddd",fontSize:12,background:"#fff"}}>
              <option value="">All members</option>
              {ALL_MEMBERS.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <select value={filterPolicy} onChange={e=>setFilterPolicy(e.target.value)} style={{padding:"6px 10px",borderRadius:20,border:"1px solid #ddd",fontSize:12,background:"#fff"}}>
              <option value="">All policies</option>
              {Object.entries(POLICY_KEY_MAP).map(([l,k])=><option key={k} value={k}>{l}</option>)}
            </select>
          </>
        )}
        <button onClick={()=>view==="divisions"?loadDivisions():loadVotes()} style={{padding:"6px 12px",borderRadius:20,border:"1px solid #ddd",fontSize:12,background:"#fff",cursor:"pointer"}}>🔄 Refresh</button>
        <span style={{fontSize:12,color:"#888",marginLeft:"auto"}}>{view==="divisions"?`${divisions.length} divisions`:`${votes.length} votes`}</span>
      </div>

      {loading && <div style={{textAlign:"center",padding:"30px",color:"#888"}}>Loading from Supabase…</div>}

      {view==="divisions" && !loading && (
        <div>
          {divisions.length===0 && <div style={{textAlign:"center",padding:"30px",color:"#aaa"}}>No divisions in database yet.</div>}
          {divisions.map(d=>(
            <div key={d.id} style={{background:"#fff",borderRadius:10,border:"1px solid #eee",padding:"12px 14px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:13,color:"#222",marginBottom:3}}>{d.bill}</div>
                <div style={{fontSize:11,color:"#888",marginBottom:4}}>{d.date} · {d.policy} · {d.entry_count} votes recorded</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  <span style={{fontSize:10,padding:"1px 7px",borderRadius:20,fontWeight:700,background:d.outcome==="passed"?"#e8f5e8":"#fbe8e8",color:d.outcome==="passed"?"#2d7a2d":"#9e2d2d"}}>{d.outcome?.toUpperCase()}</span>
                  {d.division_type==="voice" && <span style={{fontSize:10,padding:"1px 7px",borderRadius:20,background:"#f0f4ff",color:"#1a3a6b",fontWeight:700}}>🗣️ Voice</span>}
                  {d.inverse && <span style={{fontSize:10,padding:"1px 7px",borderRadius:20,background:"#fff7e0",color:"#8a5f00",fontWeight:700}}>⚠️ Inverse</span>}
                </div>
                {d.summary && <div style={{fontSize:11,color:"#666",marginTop:4}}>{d.summary}</div>}
              </div>
              <button onClick={()=>deleteDivision(d.id)} disabled={deleting[d.id]}
                style={{padding:"5px 10px",borderRadius:8,border:"1px solid #f0bcbc",background:"#fbe8e8",color:"#9e2d2d",fontSize:11,fontWeight:700,cursor:"pointer",flexShrink:0,whiteSpace:"nowrap"}}>
                {deleting[d.id]?"…":"🗑️ Delete"}
              </button>
            </div>
          ))}
        </div>
      )}

      {view==="votes" && !loading && (
        <div>
          {votes.length===0 && <div style={{textAlign:"center",padding:"30px",color:"#aaa"}}>No votes found with these filters.</div>}
          {votes.map(v=>{
            const member = ALL_MEMBERS.find(m=>m.id===v.member_id);
            return (
              <div key={v.id} style={{background:"#fff",borderRadius:8,border:"1px solid #eee",padding:"10px 12px",marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:2}}>
                    <span style={{fontSize:11,fontWeight:700,color:PARTY_COLORS[member?.party]||"#555"}}>{member?.name||`Member ${v.member_id}`}</span>
                    <span style={{fontSize:11,padding:"1px 7px",borderRadius:20,fontWeight:700,background:v.vote==="for"?"#e8f5e8":"#fbe8e8",color:v.vote==="for"?"#2d7a2d":"#9e2d2d"}}>{v.vote?.toUpperCase()}</span>
                  </div>
                  <div style={{fontSize:11,color:"#555"}}>{v.bill}</div>
                  <div style={{fontSize:10,color:"#aaa"}}>{v.date} · {v.policy_area}</div>
                </div>
                <button onClick={()=>deleteVote(v.id)} disabled={deleting[v.id]}
                  style={{padding:"4px 8px",borderRadius:8,border:"1px solid #f0bcbc",background:"#fbe8e8",color:"#9e2d2d",fontSize:11,fontWeight:700,cursor:"pointer",flexShrink:0}}>
                  {deleting[v.id]?"…":"🗑️"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// IMPORT JSON TAB — restore a previous session
// ============================================================
function ImportJsonTab({ showToast, onImportComplete }) {
  const [jsonText, setJsonText] = useState("");
  const [type,     setType]     = useState("members"); // members | divisions
  const [status,   setStatus]   = useState(null);
  const [loading,  setLoading]  = useState(false);
  const fileRef = useRef();

  const handleFile = (file) => {
    const r = new FileReader();
    r.onload = e => setJsonText(e.target.result);
    r.readAsText(file);
  };

  const handleImport = async () => {
    setLoading(true); setStatus(null);
    try {
      const parsed = JSON.parse(jsonText);
      const arr = Array.isArray(parsed) ? parsed : [parsed];

      if (type==="members") {
        // Import member data: upsert votes for each member
        let totalVotes = 0;
        for (const m of arr) {
          if (!m.id || !m.votes) continue;
          // Upsert member attendance with proper WHERE clause
          if (m.sittingDaysPresent || m.sittingDaysTotal) {
            await sb(`members?id=eq.${m.id}`, {
              method:"PATCH",
              body:JSON.stringify({
                sitting_days_present: m.sittingDaysPresent||0,
                sitting_days_total:   m.sittingDaysTotal||0,
              }),
              headers:{ "Prefer":"return=minimal" }, prefer:""
            }).catch(()=>{});
          }
          // Insert votes (ignore conflicts)
          if (m.votes.length > 0) {
            const rows = m.votes.map(v => ({
              id:          v.id || uid()+"_"+m.id,
              member_id:   m.id,
              division_id: v.divisionId || null,
              bill:        v.bill,
              date:        v.date,
              policy_area: v.policyArea,
              policy_key:  POLICY_KEY_MAP[v.policyArea]||"other",
              vote:        v.vote,
              consistency: v.consistency||"unknown",
              source:      v.source,
              division_outcome: v.divisionOutcome,
              inverse:     v.inverse||false,
            }));
            await sb("votes?on_conflict=id", { method:"POST", body:JSON.stringify(rows), headers:{"Prefer":"resolution=ignore-duplicates,return=minimal"}, prefer:"" });
            totalVotes += rows.length;
          }
        }
        setStatus({ ok:true, msg:`✅ Imported votes for ${arr.length} members · ${totalVotes} vote records` });

      } else {
        // Import divisions
        const rows = arr.map(d => ({
          id:            d.id,
          bill:          d.bill,
          date:          d.date,
          policy:        d.policy,
          policy_key:    POLICY_KEY_MAP[d.policy]||"other",
          source:        d.source,
          outcome:       d.outcome,
          summary:       d.summary,
          inverse:       d.inverse||false,
          division_type: d.divisionType||d.division_type||"formal",
          entry_count:   d.entryCount||d.entry_count||0,
        }));
        await sb("divisions?on_conflict=id", { method:"POST", body:JSON.stringify(rows), headers:{"Prefer":"resolution=ignore-duplicates,return=minimal"}, prefer:"" });
        setStatus({ ok:true, msg:`✅ Imported ${rows.length} divisions` });
      }
      onImportComplete();
    } catch(e) {
      setStatus({ ok:false, msg:"❌ "+e.message });
    }
    setLoading(false);
  };

  return (
    <div>
      <div style={{background:"#f0f4ff",borderRadius:10,padding:"12px 14px",marginBottom:16,fontSize:12,color:"#1a3a6b",lineHeight:1.7,borderLeft:"3px solid #1a3a6b"}}>
        <strong>Import a previous export</strong> — paste or upload a JSON file exported from the admin tool. Duplicates are automatically ignored so it's safe to re-import.
      </div>
      <div style={{display:"flex",gap:8,marginBottom:12}}>
        {[["members","Member Data (votes)"],["divisions","Division Index"]].map(([v,l])=>(
          <button key={v} onClick={()=>setType(v)} style={{padding:"7px 16px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,background:type===v?"#1a3a6b":"#f0f0f0",color:type===v?"#fff":"#555"}}>{l}</button>
        ))}
      </div>
      <div style={{marginBottom:10}}>
        <input ref={fileRef} type="file" accept=".json" style={{display:"none"}} onChange={e=>e.target.files[0]&&handleFile(e.target.files[0])}/>
        <button onClick={()=>fileRef.current?.click()} style={{padding:"8px 16px",borderRadius:8,border:"1px dashed #1a3a6b",background:"#f8f9ff",color:"#1a3a6b",fontSize:12,fontWeight:700,cursor:"pointer",marginBottom:8}}>📁 Upload JSON file</button>
        <div style={{fontSize:11,color:"#888",marginBottom:6}}>or paste JSON directly:</div>
        <textarea value={jsonText} onChange={e=>setJsonText(e.target.value)} rows={8} placeholder={`Paste your ${type==="members"?"tastrack-members-*.json":"tastrack-divisions-*.json"} content here...`}
          style={{width:"100%",padding:"10px",border:"1px solid #ddd",borderRadius:8,fontSize:11,boxSizing:"border-box",fontFamily:"monospace",resize:"vertical"}}/>
      </div>
      {status && <div style={{marginBottom:10,padding:"10px 14px",borderRadius:8,background:status.ok?"#e8f5e8":"#fbe8e8",color:status.ok?"#2d7a2d":"#9e2d2d",fontSize:13,fontWeight:600}}>{status.msg}</div>}
      <button onClick={handleImport} disabled={!jsonText.trim()||loading} style={{width:"100%",padding:"11px",border:"none",borderRadius:10,fontSize:14,fontWeight:700,background:!jsonText.trim()||loading?"#ccc":"#1a3a6b",color:"#fff",cursor:!jsonText.trim()||loading?"not-allowed":"pointer"}}>
        {loading?"⏳ Importing…":"⬆️ Import to Supabase"}
      </button>
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================
export default function AdminApp() {
  const [tab,     setTab]     = useState("extract");
  const [toast,   setToast]   = useState(null);
  const [dbStats, setDbStats] = useState({ divisions:0, votes:0 });

  const showToast = msg => { setToast(msg); setTimeout(()=>setToast(null),3500); };

  const loadStats = async () => {
    try {
      const [divs, vts] = await Promise.all([
        sb("divisions?select=id", { prefer:"" }),
        sb("votes?select=id", { prefer:"" }),
      ]);
      setDbStats({ divisions:(divs||[]).length, votes:(vts||[]).length });
    } catch(e) { /* silently fail */ }
  };

  useEffect(() => { loadStats(); }, []);

  // Save AI-extracted divisions to Supabase
  const handleAIImport = useCallback(async (extractedDivisions, meta) => {
    showToast("⏳ Saving to Supabase…");
    try {
      let totalVotes = 0;

      for (const div of extractedDivisions) {
        const divId = uid();

        // Insert division
        await sb("divisions", {
          method: "POST",
          body: JSON.stringify({
            id:           divId,
            bill:         div.bill,
            date:         div.date || meta.documentDate,
            policy:       div.policyArea,
            policy_key:   POLICY_KEY_MAP[div.policyArea]||"other",
            source:       meta.documentSource||"Tasmania Hansard",
            outcome:      div.outcome,
            summary:      div.summary,
            inverse:      div.inverse||false,
            division_type: div.divisionType||"formal",
            entry_count:  div.votes?.length||0,
          }),
          headers:{ "Prefer":"resolution=ignore-duplicates,return=minimal" },
          prefer: "",
        });

        // Insert votes
        const voteRows = (div.votes||[])
          .filter(v => v.memberId && v.vote !== "absent")
          .map(v => ({
            id:           divId+"_"+v.memberId,
            member_id:    v.memberId,
            division_id:  divId,
            bill:         div.bill,
            date:         div.date||meta.documentDate,
            policy_area:  div.policyArea,
            policy_key:   POLICY_KEY_MAP[div.policyArea]||"other",
            vote:         v.vote,
            consistency:  "unknown",
            source:       meta.documentSource||"Tasmania Hansard",
            division_outcome: div.outcome,
            inverse:      div.inverse||false,
          }));

        if (voteRows.length > 0) {
          await sb("votes", {
            method: "POST",
            body: JSON.stringify(voteRows),
            headers:{ "Prefer":"resolution=ignore-duplicates,return=minimal" },
            prefer: "",
          });
          totalVotes += voteRows.length;
        }
      }

      // Attendance — fetch current values then increment per member
      if (meta.membersPresent?.length > 0) {
        try {
          // Get current values for all present members in one query
          const memberIds = meta.membersPresent.join(",");
          const current = await sb(`members?id=in.(${memberIds})&select=id,sitting_days_present,sitting_days_total`, { prefer:"" });
          // Increment each one individually with a proper WHERE clause
          for (const m of (current||[])) {
            await sb(`members?id=eq.${m.id}`, {
              method: "PATCH",
              body: JSON.stringify({
                sitting_days_present: (m.sitting_days_present||0) + 1,
                sitting_days_total:   (m.sitting_days_total||0)   + 1,
              }),
              prefer: "",
            });
          }
          // Members NOT present still accumulate total sitting days
          const absentIds = ALL_MEMBERS.map(m=>m.id).filter(id=>!meta.membersPresent.includes(id));
          if (absentIds.length > 0) {
            const absentCurrent = await sb(`members?id=in.(${absentIds.join(",")})&select=id,sitting_days_total`, { prefer:"" });
            for (const m of (absentCurrent||[])) {
              await sb(`members?id=eq.${m.id}`, {
                method: "PATCH",
                body: JSON.stringify({ sitting_days_total: (m.sitting_days_total||0) + 1 }),
                prefer: "",
              });
            }
          }
        } catch(e) {
          console.warn("Attendance update failed:", e.message);
        }
      }

      showToast(`✅ Saved ${extractedDivisions.length} divisions · ${totalVotes} votes to Supabase`);
      loadStats();
    } catch(e) {
      showToast("❌ Supabase error: "+e.message);
    }
  }, []);

  const handleManualSave = useCallback(async (entries, meta) => {
    showToast("⏳ Saving to Supabase…");
    try {
      const divId = uid();
      const policyKey = POLICY_KEY_MAP[meta.policy]||"other";

      await sb("divisions", {
        method: "POST",
        body: JSON.stringify({
          id:divId, bill:meta.bill, date:meta.date, policy:meta.policy,
          policy_key:policyKey, source:meta.source, outcome:meta.outcome,
          summary:meta.summary, inverse:meta.inverse||false,
          division_type:"formal", entry_count:entries.length,
        }),
        prefer: "",
      });

      const voteRows = entries.map(({ memberId, entry }) => ({
        id: divId+"_"+memberId,
        member_id: memberId, division_id: divId,
        bill: entry.bill, date: entry.date,
        policy_area: meta.policy, policy_key: policyKey,
        vote: entry.vote, consistency: entry.consistency||"unknown",
        source: entry.source, division_outcome: meta.outcome,
        inverse: meta.inverse||false,
      }));

      if (voteRows.length > 0) {
        await sb("votes", { method:"POST", body:JSON.stringify(voteRows), prefer:"" });
      }

      showToast(`✅ Division saved · ${voteRows.length} votes to Supabase`);
      loadStats();
    } catch(e) {
      showToast("❌ "+e.message);
    }
  }, []);

  const tabs = [
    { id:"extract", label:"🤖 AI Extract" },
    { id:"manual",  label:"✏️ Manual Entry" },
    { id:"database",label:"🗄️ Database" },
    { id:"import",  label:"⬆️ Import JSON" },
  ];

  return (
    <div style={{minHeight:"100vh",background:"#f0f2f7",fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
      <div style={{background:"#0d1b3e"}}>
        <div style={{maxWidth:900,margin:"0 auto",padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
          <div>
            <div style={{color:"#fff",fontFamily:"Georgia, serif",fontSize:17,fontWeight:700}}>🗳️ TasTrack Admin</div>
            <div style={{color:"rgba(255,255,255,0.38)",fontSize:9,letterSpacing:1.5}}>SUPABASE-BACKED DATA ENTRY</div>
          </div>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <div style={{display:"flex",gap:6}}>
              <span style={{fontSize:11,color:"rgba(255,255,255,0.5)",background:"rgba(255,255,255,0.1)",padding:"3px 10px",borderRadius:20}}>🏛️ {dbStats.divisions} divisions</span>
              <span style={{fontSize:11,color:"rgba(255,255,255,0.5)",background:"rgba(255,255,255,0.1)",padding:"3px 10px",borderRadius:20}}>🗳️ {dbStats.votes} votes</span>
            </div>
            <div style={{display:"flex",gap:4}}>
              {tabs.map(t=>(
                <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"6px 12px",borderRadius:20,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,background:tab===t.id?"rgba(255,255,255,0.25)":"rgba(255,255,255,0.08)",color:"#fff"}}>{t.label}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {toast && <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:"#1a3a6b",color:"#fff",borderRadius:10,padding:"10px 20px",fontSize:13,fontWeight:600,zIndex:999,boxShadow:"0 4px 20px rgba(0,0,0,0.3)",whiteSpace:"nowrap"}}>{toast}</div>}

      <div style={{maxWidth:900,margin:"0 auto",padding:"18px 14px"}}>

        {tab==="extract" && (
          <div style={{display:"grid",gridTemplateColumns:"1fr 300px",gap:14}}>
            <div style={{background:"#fff",borderRadius:14,border:"1px solid #eee",padding:"18px",boxShadow:"0 2px 10px rgba(0,0,0,0.06)"}}>
              <h3 style={{fontFamily:"Georgia, serif",marginTop:0,marginBottom:14,fontSize:16}}>🤖 AI Document Extraction</h3>
              <AIExtractor onImport={handleAIImport} />
            </div>
            <div>
              <div style={{background:"#fff",borderRadius:14,border:"1px solid #eee",padding:"16px",boxShadow:"0 2px 10px rgba(0,0,0,0.06)",marginBottom:12}}>
                <div style={{fontWeight:700,fontSize:13,color:"#1a1a2e",marginBottom:10}}>📊 Database</div>
                {[["🏛️",dbStats.divisions,"divisions"],["🗳️",dbStats.votes,"vote records"]].map(([icon,val,label])=>(
                  <div key={label} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #f5f5f5",fontSize:13}}>
                    <span>{icon} {label}</span><span style={{fontWeight:700,color:"#1a3a6b"}}>{val}</span>
                  </div>
                ))}
                <div style={{marginTop:10,fontSize:11,color:"#888",lineHeight:1.6}}>Data saves directly to Supabase.<br/>Live in the public app immediately.<br/>Manage records in the 🗄️ Database tab.</div>
              </div>
              <div style={{background:"#f5f0ff",borderRadius:12,border:"1px solid #e8e0ff",padding:"14px 16px"}}>
                <div style={{fontWeight:700,fontSize:12,color:"#5c3a9e",marginBottom:8}}>📌 Start here</div>
                <div style={{fontSize:12,color:"#555",lineHeight:1.8}}>
                  <strong>1.</strong> <a href="https://search.parliament.tas.gov.au/adv/havotes" target="_blank" rel="noreferrer" style={{color:"#5c3a9e"}}>Open Votes & Proceedings</a><br/>
                  <strong>2.</strong> Select 2025, download the PDF<br/>
                  <strong>3.</strong> Drop it in the upload box<br/>
                  <strong>4.</strong> Review &amp; import<br/>
                  <strong>5.</strong> Repeat for each sitting day
                </div>
              </div>
            </div>
          </div>
        )}

        {tab==="manual" && (
          <div style={{background:"#fff",borderRadius:14,border:"1px solid #eee",padding:"18px",boxShadow:"0 2px 10px rgba(0,0,0,0.06)"}}>
            <h3 style={{fontFamily:"Georgia, serif",marginTop:0,marginBottom:14,fontSize:16}}>✏️ Manual Division Entry</h3>
            <ManualDivisionEntry onSave={handleManualSave} />
          </div>
        )}

        {tab==="database" && (
          <div style={{background:"#fff",borderRadius:14,border:"1px solid #eee",padding:"18px",boxShadow:"0 2px 10px rgba(0,0,0,0.06)"}}>
            <h3 style={{fontFamily:"Georgia, serif",marginTop:0,marginBottom:14,fontSize:16}}>🗄️ Database — View &amp; Delete Records</h3>
            <DatabaseTab showToast={showToast} />
          </div>
        )}

        {tab==="import" && (
          <div style={{background:"#fff",borderRadius:14,border:"1px solid #eee",padding:"18px",boxShadow:"0 2px 10px rgba(0,0,0,0.06)"}}>
            <h3 style={{fontFamily:"Georgia, serif",marginTop:0,marginBottom:14,fontSize:16}}>⬆️ Import Previous JSON Export</h3>
            <ImportJsonTab showToast={showToast} onImportComplete={loadStats} />
          </div>
        )}

      </div>
    </div>
  );
}
