import { useState, useCallback, useRef } from "react";

// ============================================================
// TASTRACK ADMIN — DATA ENTRY + AI EXTRACTION TOOL
//
// LAYER 1: Upload a Votes & Proceedings PDF/DOCX here.
//          Claude reads it and extracts all divisions automatically.
//
// SOURCES:
//   Votes & Proceedings: https://search.parliament.tas.gov.au/adv/havotes
//   Sitting Days:        https://search.parliament.tas.gov.au/search/quicksearch/2025/sittingdays.html
//   Hansard Transcripts: https://search.parliament.tas.gov.au/adv/hahansard
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

const PARTY_COLORS = {
  Liberal:"#1a3a6b", Labor:"#8b1a1a", Greens:"#1a5c2a",
  Independent:"#4a4a6b", SFF:"#5c3a1a",
};

const uid = () => Math.random().toString(36).slice(2,8);
const today = () => new Date().toISOString().slice(0,10);

const initData = () => {
  const d = {};
  for (const m of ALL_MEMBERS) d[m.id] = { sittingDaysPresent:"", sittingDaysTotal:"", votes:[], promises:[], statements:[] };
  return d;
};

// ---- UI helpers ----
function Inp({ label, value, onChange, placeholder, type="text", hint }) {
  return (
    <div style={{marginBottom:10}}>
      {label && <label style={{display:"block",fontSize:11,fontWeight:700,color:"#555",marginBottom:3,letterSpacing:0.3}}>{label}</label>}
      <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder||""}
        style={{width:"100%",padding:"7px 10px",border:"1px solid #ddd",borderRadius:7,fontSize:13,boxSizing:"border-box",fontFamily:"inherit"}} />
      {hint && <div style={{fontSize:11,color:"#aaa",marginTop:2}}>{hint}</div>}
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
// LAYER 1: AI DOCUMENT EXTRACTOR
// Upload a Votes & Proceedings PDF/DOCX → Claude extracts
// all divisions with member-by-member vote records
// ============================================================
function AIExtractor({ onImport }) {
  const [stage,       setStage]       = useState("idle"); // idle|reading|extracting|review|done
  const [fileInfo,    setFileInfo]    = useState(null);
  const [rawText,     setRawText]     = useState("");
  const [extracted,   setExtracted]   = useState(null); // { divisions:[], sittingDate, source }
  const [error,       setError]       = useState(null);
  const [progress,    setProgress]    = useState("");
  const [selected,    setSelected]    = useState({}); // divisionId -> bool
  const fileRef = useRef();

  const readFileAsBase64 = (file) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });

  const readFileAsText = (file) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsText(file);
  });

  const readFileAsArrayBuffer = (file) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsArrayBuffer(file);
  });

  const extractDocxText = async (file) => {
    // DOCX files are ZIP archives containing word/document.xml
    // We use JSZip (available via CDN) to unzip and extract the XML text
    const JSZip = (await import("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js")).default;
    const arrayBuffer = await readFileAsArrayBuffer(file);
    const zip = await JSZip.loadAsync(arrayBuffer);
    const xmlFile = zip.file("word/document.xml");
    if (!xmlFile) throw new Error("Could not find document.xml inside the DOCX file.");
    const xml = await xmlFile.async("string");
    // Strip XML tags, decode common entities, clean up whitespace
    const text = xml
      .replace(/<w:p[ >][^>]*>/g, "\n")   // paragraph breaks
      .replace(/<w:tab\/>/g, "\t")          // tabs
      .replace(/<[^>]+>/g, "")             // all other tags
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return text;
  };

  const handleFile = async (file) => {
    setError(null);
    setStage("reading");
    setFileInfo({ name: file.name, size: (file.size/1024).toFixed(1)+"KB", type: file.type });
    setProgress("Reading document...");

    try {
      let content, mediaType;
      const ext = file.name.split(".").pop().toLowerCase();
      const isPdf = ext === "pdf" || file.type === "application/pdf";

      if (isPdf) {
        // PDF — send as base64, Claude reads it natively
        content = await readFileAsBase64(file);
        mediaType = "application/pdf";
      } else if (ext === "docx" || ext === "doc") {
        // DOCX — extract text using mammoth, then send as plain text
        // (Claude API only accepts PDF for document type, not docx)
        setProgress("Extracting text from DOCX...");
        content = await extractDocxText(file);
        mediaType = null; // will be sent as plain text
        if (!content || content.trim().length < 100) {
          throw new Error("Could not extract text from this DOCX file. Try saving it as PDF first.");
        }
      } else {
        // Plain text fallback
        content = await readFileAsText(file);
        mediaType = null;
      }

      setStage("extracting");
      setProgress("Sending to Claude for extraction...");

      const memberList = ALL_MEMBERS.map(m => `${m.id}. ${m.name} (${m.party}, ${m.electorate})`).join("\n");

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

Return ONLY a valid JSON object in this exact structure, no markdown:
{
  "documentDate": "YYYY-MM-DD",
  "documentSource": "string describing which V&P document this is",
  "divisions": [
    {
      "id": "generated short id",
      "bill": "exact bill or motion name",
      "summary": "one sentence describing what was voted on",
      "outcome": "passed|defeated|tied",
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
- Prevention or prohibition motions (e.g. "Privatisation Prevention Motion", "Logging Ban Motion") — voting FOR = opposed to the activity
- No-confidence motions — treat as inverse:false (FOR = pro-accountability, which is the natural reading)
- Funding or approval bills — always inverse:false (FOR = supportive of the project)
- Amendment bills that strengthen or expand something — inverse:false

When in doubt, ask: "If a politician voted FOR this, would a reasonable person say they SUPPORT the policy area?" If no, set inverse:true.`;

      let messages;
      if (mediaType) {
        // PDF or DOCX — send as base64 document so Claude reads the binary correctly
        messages = [{
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: mediaType, data: content } },
            { type: "text", text: "Extract all divisions from this Votes and Proceedings document. Return only a valid JSON object. No explanation, no preamble, just JSON." }
          ]
        }];
      } else {
        // Plain text fallback
        messages = [{
          role: "user",
          content: `Extract all divisions from this Votes and Proceedings document. Return only a valid JSON object, no preamble.\n\nDOCUMENT TEXT:\n${content.slice(0, 40000)}`
        }];
      }

      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 8000,
          system: systemPrompt,
          messages
        })
      });

      setProgress("Parsing extraction results...");
      const data = await resp.json();

      if (!resp.ok || data.error) throw new Error(`API error ${resp.status}: ${data.error?.message || JSON.stringify(data).slice(0,200)}`);

      const raw = data.content?.filter(b=>b.type==="text").map(b=>b.text).join("") || "{}";
      // Robust JSON extraction - find the outermost { } block in case Claude adds preamble
      let clean = raw.replace(/```json|```/g,"").trim();
      const firstBrace = clean.indexOf("{");
      const lastBrace  = clean.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        clean = clean.slice(firstBrace, lastBrace + 1);
      }
      let parsed;
      try {
        parsed = JSON.parse(clean);
      } catch(parseErr) {
        throw new Error("Claude returned a response that could not be parsed as JSON. Raw response: " + raw.slice(0, 200));
      }

      if (!parsed.divisions || parsed.divisions.length === 0) {
        throw new Error("No divisions found in document. Make sure this is a Votes and Proceedings document (not a Hansard transcript).");
      }

      // Pre-select all divisions
      const sel = {};
      parsed.divisions.forEach(d => sel[d.id] = true);
      setSelected(sel);
      setExtracted(parsed);
      setStage("review");
      setProgress("");

    } catch (e) {
      setError(e.message);
      setStage("idle");
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleImport = () => {
    if (!extracted) return;
    const toImport = extracted.divisions.filter(d => selected[d.id]);
    onImport(toImport, extracted);
    setStage("done");
  };

  const reset = () => {
    setStage("idle"); setFileInfo(null); setExtracted(null);
    setError(null); setProgress(""); setSelected({});
  };

  // ---- REVIEW SCREEN ----
  if (stage === "review" && extracted) {
    const selectedCount = Object.values(selected).filter(Boolean).length;
    return (
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div>
            <div style={{fontWeight:700,fontSize:15,color:"#1a1a2e"}}>
              ✅ Extracted {extracted.divisions.length} division{extracted.divisions.length!==1?"s":""} from {fileInfo?.name}
            </div>
            <div style={{fontSize:12,color:"#888",marginTop:2}}>
              {extracted.documentDate && `Date: ${extracted.documentDate} · `}
              Review and deselect any you don't want to import
            </div>
          </div>
          <Btn onClick={reset} outline color="#888" small>← New file</Btn>
        </div>

        {extracted.divisions.map((div, i) => {
          const forVotes = div.votes?.filter(v=>v.vote==="for") || [];
          const againstVotes = div.votes?.filter(v=>v.vote==="against") || [];
          const unmatched = div.votes?.filter(v=>v.memberId===null) || [];
          const isSelected = selected[div.id];
          return (
            <div key={div.id||i}
              style={{marginBottom:10,borderRadius:10,border:`2px solid ${isSelected?"#1a3a6b":"#ddd"}`,
                background:isSelected?"#f8f9ff":"#fafafa",overflow:"hidden",transition:"border-color 0.15s"}}>
              <div style={{display:"flex",alignItems:"flex-start",gap:10,padding:"12px 14px",cursor:"pointer"}}
                onClick={()=>setSelected(prev=>({...prev,[div.id]:!prev[div.id]}))}>
                <div style={{width:20,height:20,borderRadius:5,border:`2px solid ${isSelected?"#1a3a6b":"#ccc"}`,
                  background:isSelected?"#1a3a6b":"#fff",display:"flex",alignItems:"center",justifyContent:"center",
                  flexShrink:0,marginTop:1}}>
                  {isSelected && <span style={{color:"#fff",fontSize:12,fontWeight:900}}>✓</span>}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:13,color:"#222",marginBottom:3}}>{div.bill}</div>
                  <div style={{fontSize:12,color:"#666",marginBottom:5}}>{div.summary}</div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,fontWeight:700,
                      background:div.outcome==="passed"?"#e8f5e8":"#fbe8e8",
                      color:div.outcome==="passed"?"#2d7a2d":"#9e2d2d"}}>
                      {div.outcome?.toUpperCase()}
                    </span>
                    <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:"#e8f0ff",color:"#1a3a6b",fontWeight:700}}>
                      ✅ {forVotes.length} for
                    </span>
                    <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:"#fbe8e8",color:"#9e2d2d",fontWeight:700}}>
                      ❌ {againstVotes.length} against
                    </span>
                    <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:"#f5f0ff",color:"#5c3a9e",fontWeight:700}}>
                      🗂️ {div.policyArea}
                    </span>
                    {div.inverse && (
                      <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:"#fff7e0",color:"#8a5f00",fontWeight:700}}>
                        ⚠️ Inverse division
                      </span>
                    )}
                    {unmatched.length > 0 && (
                      <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:"#fff3cd",color:"#856404",fontWeight:700}}>
                        ⚠️ {unmatched.length} unmatched names
                      </span>
                    )}
                  </div>
                  {unmatched.length > 0 && (
                    <div style={{marginTop:6,fontSize:11,color:"#856404",background:"#fff3cd",borderRadius:6,padding:"4px 8px"}}>
                      Could not match: {unmatched.map(v=>v.memberName||v.unmatched).join(", ")}
                    </div>
                  )}
                  {/* Vote detail collapsible */}
                  <details style={{marginTop:6}}>
                    <summary style={{fontSize:11,color:"#4a90d9",cursor:"pointer",fontWeight:600}}>
                      Show all {div.votes?.length||0} votes
                    </summary>
                    <div style={{marginTop:6,display:"flex",flexWrap:"wrap",gap:4}}>
                      {(div.votes||[]).map((v,j)=>(
                        <span key={j} style={{fontSize:10,padding:"2px 7px",borderRadius:20,fontWeight:600,
                          background:v.vote==="for"?"#e8f5e8":v.vote==="against"?"#fbe8e8":"#f0f0f0",
                          color:v.vote==="for"?"#2d7a2d":v.vote==="against"?"#9e2d2d":"#888",
                          border:v.memberId===null?"2px solid #ffc107":"none"}}>
                          {v.memberName} {v.vote==="for"?"✓":v.vote==="against"?"✗":"—"}
                        </span>
                      ))}
                    </div>
                  </details>
                </div>
              </div>
            </div>
          );
        })}

        <div style={{display:"flex",gap:10,marginTop:4}}>
          <Btn onClick={handleImport} disabled={selectedCount===0} color="#2d7a5f">
            ✅ Import {selectedCount} division{selectedCount!==1?"s":""} into Admin
          </Btn>
          <Btn onClick={reset} outline color="#888">Cancel</Btn>
        </div>
      </div>
    );
  }

  if (stage === "done") {
    return (
      <div style={{textAlign:"center",padding:"30px 0"}}>
        <div style={{fontSize:40,marginBottom:10}}>✅</div>
        <div style={{fontWeight:700,fontSize:16,color:"#2d7a5f",marginBottom:6}}>Divisions imported successfully</div>
        <div style={{fontSize:13,color:"#888",marginBottom:20}}>Go to the Member Data tab to review, or export when ready.</div>
        <Btn onClick={reset}>Extract another document</Btn>
      </div>
    );
  }

  // ---- UPLOAD SCREEN ----
  return (
    <div>
      <div style={{background:"#f0faf4",borderRadius:10,padding:"12px 14px",marginBottom:16,fontSize:12,color:"#2d5a3d",lineHeight:1.7,borderLeft:"3px solid #2d9e5f"}}>
        <strong>How this works:</strong> Download a Votes and Proceedings document from{" "}
        <a href="https://search.parliament.tas.gov.au/adv/havotes" target="_blank" rel="noreferrer" style={{color:"#2d7a5f"}}>
          Tasmania Hansard
        </a>, then upload it here. Claude reads the document and automatically extracts every division, matching each member's vote to our 35-member list. Works with PDF and plain text files.
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={e=>e.preventDefault()}
        onClick={()=>fileRef.current?.click()}
        style={{border:"2px dashed #c0d0e8",borderRadius:12,padding:"40px 20px",textAlign:"center",
          cursor:"pointer",background:"#f8f9ff",transition:"border-color 0.15s, background 0.15s"}}
        onMouseEnter={e=>{e.currentTarget.style.borderColor="#1a3a6b";e.currentTarget.style.background="#f0f4ff";}}
        onMouseLeave={e=>{e.currentTarget.style.borderColor="#c0d0e8";e.currentTarget.style.background="#f8f9ff";}}>
        <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.doc" style={{display:"none"}}
          onChange={e=>e.target.files[0]&&handleFile(e.target.files[0])} />
        <div style={{fontSize:40,marginBottom:10}}>📄</div>
        <div style={{fontWeight:700,fontSize:15,color:"#1a3a6b",marginBottom:4}}>
          Drop a Votes & Proceedings document here
        </div>
        <div style={{fontSize:12,color:"#888",marginBottom:12}}>or click to browse · PDF, DOCX or TXT</div>
        <div style={{display:"inline-block",padding:"8px 20px",background:"#1a3a6b",color:"#fff",borderRadius:8,fontSize:13,fontWeight:700}}>
          Choose File
        </div>
      </div>

      {/* Loading state */}
      {(stage==="reading"||stage==="extracting") && (
        <div style={{marginTop:16,background:"#fff",borderRadius:10,padding:"16px",border:"1px solid #eee",textAlign:"center"}}>
          <div style={{display:"inline-block",width:24,height:24,border:"3px solid #e0e8ff",borderTopColor:"#1a3a6b",
            borderRadius:"50%",animation:"spin 0.8s linear infinite",marginBottom:8}} />
          <div style={{fontSize:13,color:"#1a3a6b",fontWeight:700}}>{progress}</div>
          {fileInfo && <div style={{fontSize:11,color:"#aaa",marginTop:4}}>{fileInfo.name} · {fileInfo.size}</div>}
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {error && (
        <div style={{marginTop:14,background:"#fbe8e8",borderRadius:10,padding:"12px 14px",borderLeft:"3px solid #c0392b",fontSize:13,color:"#c0392b"}}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Quick start guide */}
      <div style={{marginTop:16,background:"#fff",borderRadius:10,border:"1px solid #eee",padding:"14px 16px"}}>
        <div style={{fontWeight:700,fontSize:12,color:"#555",marginBottom:10,letterSpacing:0.3}}>QUICK START — HOW TO GET THE DOCUMENTS</div>
        {[
          ["1","Go to Tasmania Hansard Votes & Proceedings","https://search.parliament.tas.gov.au/adv/havotes","Open link →"],
          ["2","Select year (e.g. 2025) and search for a date or bill name",null,null],
          ["3","Click the result, then click 'Download Document' to get the PDF",null,null],
          ["4","Drop that PDF here — Claude extracts all divisions automatically",null,null],
        ].map(([n,text,url,cta])=>(
          <div key={n} style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:10}}>
            <div style={{width:22,height:22,borderRadius:"50%",background:"#1a3a6b",color:"#fff",fontSize:11,fontWeight:700,
              display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{n}</div>
            <div style={{fontSize:12,color:"#555",lineHeight:1.5,flex:1}}>
              {text}
              {url && <><br/><a href={url} target="_blank" rel="noreferrer" style={{color:"#4a90d9",fontWeight:600}}>{cta}</a></>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// MANUAL DIVISION ENTRY (fallback)
// ============================================================
function ManualDivisionEntry({ onSave }) {
  const [bill,       setBill]       = useState("");
  const [date,       setDate]       = useState(today());
  const [policy,     setPolicy]     = useState(POLICY_AREAS[0]);
  const [source,     setSource]     = useState("");
  const [outcome,    setOutcome]    = useState("passed");
  const [summary,    setSummary]    = useState("");
  const [votes,      setVotes]      = useState({});
  const [consistency,setConsistency]= useState({});
  const [inverse,    setInverse]    = useState(false);

  const setVote = (id, v) => setVotes(p=>({...p,[id]:v}));
  const setCons = (id, v) => setConsistency(p=>({...p,[id]:v}));
  const fillParty = (party, val) => { const n={...votes}; ALL_MEMBERS.forEach(m=>m.party===party&&(n[m.id]=val)); setVotes(n); };
  const fillAll   = (val)        => { const n={}; ALL_MEMBERS.forEach(m=>n[m.id]=val); setVotes(n); };

  const forCount     = Object.values(votes).filter(v=>v==="for").length;
  const againstCount = Object.values(votes).filter(v=>v==="against").length;
  const canSave      = bill && date && source && (forCount + againstCount) > 0;

  const handleSave = () => {
    const entries = [];
    for (const m of ALL_MEMBERS) {
      const v = votes[m.id];
      if (v && v !== "absent") {
        entries.push({ memberId: m.id, entry: { id:uid(), bill, date, policyArea:policy, vote:v, consistency:consistency[m.id]||"unknown", source, divisionOutcome:outcome }});
      }
    }
    onSave(entries, { bill, date, policy, source, outcome, summary, inverse });
    setBill(""); setDate(today()); setSource(""); setSummary(""); setVotes({}); setConsistency({}); setInverse(false);
  };

  const electorates = [...new Set(ALL_MEMBERS.map(m=>m.electorate))];
  const vBtn = (id, label, val, color) => (
    <button onClick={()=>setVote(id,val)}
      style={{padding:"3px 8px",fontSize:10,fontWeight:700,border:"none",borderRadius:20,cursor:"pointer",
        background:votes[id]===val?color:"#f0f0f0",color:votes[id]===val?"#fff":"#999"}}>
      {label}
    </button>
  );

  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div style={{gridColumn:"1/-1"}}><Inp label="BILL / MOTION NAME" value={bill} onChange={setBill} placeholder="e.g. Housing Affordability Amendment Bill 2024" /></div>
        <Inp label="DATE" value={date} onChange={setDate} type="date" />
        <Sel label="POLICY AREA" value={policy} onChange={setPolicy} options={POLICY_AREAS} />
        <Sel label="OUTCOME" value={outcome} onChange={setOutcome} options={[{value:"passed",label:"✅ Passed"},{value:"defeated",label:"❌ Defeated"},{value:"tied",label:"⚖️ Tied"}]} />
        <Inp label="SOURCE" value={source} onChange={setSource} placeholder="e.g. V&P No.23, 14 Jun 2024" />
        <div style={{gridColumn:"1/-1"}}>
          <label style={{display:"block",fontSize:11,fontWeight:700,color:"#555",marginBottom:3}}>SUMMARY</label>
          <textarea value={summary} onChange={e=>setSummary(e.target.value)} rows={2} placeholder="One sentence describing what this vote was about..."
            style={{width:"100%",padding:"7px 10px",border:"1px solid #ddd",borderRadius:7,fontSize:13,resize:"vertical",boxSizing:"border-box",fontFamily:"inherit"}} />
        </div>
        <div style={{gridColumn:"1/-1"}}>
          <div onClick={()=>setInverse(v=>!v)}
            style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 12px",borderRadius:8,cursor:"pointer",
              background:inverse?"#fff7e0":"#f8f9ff",border:`1px solid ${inverse?"#e0a020":"#dde4f0"}`}}>
            <div style={{width:18,height:18,borderRadius:4,border:`2px solid ${inverse?"#e0a020":"#ccc"}`,
              background:inverse?"#e0a020":"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>
              {inverse && <span style={{color:"#fff",fontSize:11,fontWeight:900}}>✓</span>}
            </div>
            <div>
              <div style={{fontSize:12,fontWeight:700,color:inverse?"#8a5f00":"#444"}}>⚠️ Inverse division</div>
              <div style={{fontSize:11,color:"#888",marginTop:1,lineHeight:1.5}}>
                Check this if voting FOR this bill signals <em>opposition</em> to the policy area — e.g. scrutiny motions, prevention motions, cost disclosure motions.
              </div>
            </div>
          </div>
        </div>
      </div>
      <div style={{background:"#f8f9ff",borderRadius:8,padding:"10px 12px",marginBottom:10}}>
        <div style={{fontSize:11,fontWeight:700,color:"#555",marginBottom:6}}>QUICK FILL BY PARTY</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6}}>
          {["Liberal","Labor","Greens","Independent","SFF"].map(p=>(
            <div key={p} style={{display:"flex",gap:3,alignItems:"center"}}>
              <span style={{fontSize:10,color:PARTY_COLORS[p],fontWeight:700}}>{p}:</span>
              <button onClick={()=>fillParty(p,"for")}     style={{padding:"2px 6px",fontSize:10,fontWeight:700,border:"none",borderRadius:20,cursor:"pointer",background:"#2d9e5f22",color:"#2d7a2d"}}>FOR</button>
              <button onClick={()=>fillParty(p,"against")} style={{padding:"2px 6px",fontSize:10,fontWeight:700,border:"none",borderRadius:20,cursor:"pointer",background:"#c0392b22",color:"#c0392b"}}>AGAINST</button>
              <button onClick={()=>fillParty(p,"absent")}  style={{padding:"2px 6px",fontSize:10,fontWeight:700,border:"none",borderRadius:20,cursor:"pointer",background:"#88888822",color:"#888"}}>ABSENT</button>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:5}}>
          <button onClick={()=>fillAll("for")}     style={{padding:"3px 10px",fontSize:11,fontWeight:700,border:"none",borderRadius:20,cursor:"pointer",background:"#2d9e5f",color:"#fff"}}>All FOR</button>
          <button onClick={()=>fillAll("against")} style={{padding:"3px 10px",fontSize:11,fontWeight:700,border:"none",borderRadius:20,cursor:"pointer",background:"#c0392b",color:"#fff"}}>All AGAINST</button>
          <button onClick={()=>setVotes({})}       style={{padding:"3px 10px",fontSize:11,fontWeight:700,border:"1px solid #ddd",borderRadius:20,cursor:"pointer",background:"#fff",color:"#888"}}>Clear</button>
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
                    <button key={v} onClick={()=>setCons(m.id,v)}
                      style={{padding:"2px 5px",fontSize:10,fontWeight:700,border:"none",borderRadius:20,cursor:"pointer",
                        background:consistency[m.id]===v?c+"33":"#f0f0f0",color:consistency[m.id]===v?c:"#ccc"}}>{l}</button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
      <button onClick={handleSave} disabled={!canSave}
        style={{marginTop:8,width:"100%",padding:"11px",border:"none",borderRadius:10,fontSize:14,fontWeight:700,
          background:canSave?"#1a3a6b":"#ccc",color:"#fff",cursor:canSave?"pointer":"not-allowed"}}>
        ✅ Save Division ({forCount}–{againstCount})
      </button>
    </div>
  );
}

// ============================================================
// MEMBER PANEL, EXPORT, MAIN APP (same as before, streamlined)
// ============================================================
function ExportPanel({ data, divisions }) {
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState("members");

  const membersJson = ALL_MEMBERS.map(m => {
    const d = data[m.id]||{};
    const pct = d.sittingDaysPresent && d.sittingDaysTotal
      ? Math.round((parseInt(d.sittingDaysPresent)/parseInt(d.sittingDaysTotal))*100) : null;
    return { id:m.id, name:m.name, party:m.party, electorate:m.electorate,
      sittingDaysPresent:parseInt(d.sittingDaysPresent)||null, sittingDaysTotal:parseInt(d.sittingDaysTotal)||null,
      attendancePct:pct, votes:d.votes||[], promises:d.promises||[], statements:d.statements||[] };
  });

  const stats = {
    totalVotes:      membersJson.reduce((a,m)=>a+m.votes.length,0),
    withAttendance:  membersJson.filter(m=>m.attendancePct!==null).length,
    withPromises:    membersJson.filter(m=>m.promises.length>0).length,
    divisions:       divisions.length,
  };

  const output = tab==="members" ? JSON.stringify(membersJson,null,2) : JSON.stringify(divisions,null,2);
  const copy = () => { navigator.clipboard.writeText(output); setCopied(true); setTimeout(()=>setCopied(false),2000); };
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([output],{type:"application/json"}));
    a.download = `tastrack-${tab}-${today()}.json`;
    a.click();
  };

  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:16}}>
        {[["🗳️",stats.totalVotes,"vote records"],["📋",stats.withPromises,"with promises"],["📅",stats.withAttendance,"with attendance"],["🏛️",stats.divisions,"divisions"]].map(([icon,val,label])=>(
          <div key={label} style={{background:"#fff",borderRadius:10,padding:"12px",border:"1px solid #eee",textAlign:"center"}}>
            <div style={{fontSize:13,marginBottom:2}}>{icon}</div>
            <div style={{fontSize:22,fontWeight:800,color:"#1a3a6b"}}>{val}</div>
            <div style={{fontSize:10,color:"#aaa"}}>{label}</div>
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:6,marginBottom:10}}>
        {[["members","Member Data"],["divisions","Division Index"]].map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)} style={{padding:"7px 16px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,background:tab===t?"#1a3a6b":"#f0f0f0",color:tab===t?"#fff":"#555"}}>{l}</button>
        ))}
      </div>
      <div style={{background:"#0d1b3e",borderRadius:10,padding:"12px",marginBottom:10}}>
        <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",marginBottom:6,fontWeight:700,letterSpacing:0.5}}>
          {tab==="members"?"REPLACE const SEED = [ IN tasmania-tracker.jsx":"REPLACE POLICIES DIVISIONS IN tasmania-tracker.jsx"}
        </div>
        <pre style={{color:"#7dd3fc",fontSize:11,margin:0,maxHeight:260,overflow:"auto",lineHeight:1.5,whiteSpace:"pre-wrap",wordBreak:"break-all"}}>
          {output.slice(0,2500)}{output.length>2500?"\n\n... (truncated — use Copy or Download for full data)":""}
        </pre>
      </div>
      <div style={{display:"flex",gap:8}}>
        <button onClick={copy} style={{flex:2,padding:"11px",border:"none",borderRadius:10,fontSize:14,fontWeight:700,background:copied?"#2d9e5f":"#1a3a6b",color:"#fff",cursor:"pointer"}}>
          {copied?"✅ Copied!":"📋 Copy Full JSON"}
        </button>
        <button onClick={download} style={{flex:1,padding:"11px",border:"1px solid #ddd",borderRadius:10,fontSize:13,fontWeight:700,background:"#fff",cursor:"pointer",color:"#555"}}>
          ⬇️ Download
        </button>
      </div>
      <div style={{marginTop:14,background:"#f8f9ff",borderRadius:10,padding:"12px 14px",fontSize:12,color:"#555",lineHeight:1.8}}>
        <strong>To use in TasTrack:</strong> Copy Member Data JSON → open <code>tasmania-tracker.jsx</code> → find <code>const SEED = [</code> → replace with this data. Scores recalculate automatically.<br/>
        <strong>Inverse divisions:</strong> Any division with <code>"inverse": true</code> in the Division Index must also be added to <code>POLICIES</code> with <code>inverse:true</code> so the Policy Hub stance logic is correct.
      </div>
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================
export default function AdminApp() {
  const [data,      setData]      = useState(initData);
  const [divisions, setDivisions] = useState([]);
  const [tab,       setTab]       = useState("extract");
  const [toast,     setToast]     = useState(null);
  const [manualMode,setManualMode]= useState(false);

  const showToast = msg => { setToast(msg); setTimeout(()=>setToast(null),3000); };

  // Handle AI extraction results
  const handleAIImport = useCallback((extractedDivisions, meta) => {
    let totalVotes = 0;
    const newDivisions = [];

    setData(prev => {
      const next = { ...prev };
      for (const div of extractedDivisions) {
        const divId = uid();
        newDivisions.push({ id:divId, bill:div.bill, date:div.date||meta.documentDate, policy:div.policyArea, source:meta.documentSource||"Tasmania Hansard", outcome:div.outcome, summary:div.summary, inverse:div.inverse||false, entryCount:div.votes?.length||0 });
        for (const v of (div.votes||[])) {
          if (!v.memberId || v.vote === "absent") continue;
          if (!next[v.memberId]) continue;
          next[v.memberId] = {
            ...next[v.memberId],
            votes: [...next[v.memberId].votes, { id:divId+"_"+v.memberId, bill:div.bill, date:div.date||meta.documentDate, policyArea:div.policyArea, vote:v.vote, consistency:"unknown", source:meta.documentSource||"Tasmania Hansard", divisionOutcome:div.outcome, inverse:div.inverse||false }]
          };
          totalVotes++;
        }
      }
      return next;
    });

    setDivisions(prev => [...prev, ...newDivisions]);
    showToast(`✅ Imported ${extractedDivisions.length} divisions · ${totalVotes} vote records added`);
    setTab("members");
  }, []);

  // Handle manual division save
  const handleManualSave = useCallback((entries, meta) => {
    setDivisions(prev => [...prev, { id:uid(), ...meta, entryCount:entries.length }]);
    setData(prev => {
      const next = { ...prev };
      for (const { memberId, entry } of entries) {
        if (!next[memberId]) continue;
        next[memberId] = { ...next[memberId], votes: [...next[memberId].votes, { ...entry, inverse:meta.inverse||false }] };
      }
      return next;
    });
    showToast(`✅ Division saved — ${entries.length} votes recorded`);
  }, []);

  const handleDataChange = useCallback((memberId, field, value) => {
    setData(prev => ({ ...prev, [memberId]: { ...prev[memberId], [field]: value } }));
  }, []);

  const tabs = [
    { id:"extract", label:"🤖 AI Extract", desc:"Upload a Votes & Proceedings document — Claude extracts all divisions automatically" },
    { id:"manual",  label:"✏️ Manual Entry", desc:"Enter a division by hand from a Hansard document" },
    { id:"members", label:"👤 Members",     desc:"Review data, enter attendance & promises per member" },
    { id:"export",  label:"📦 Export",      desc:"Export JSON to paste into TasTrack" },
  ];

  const electorates = [...new Set(ALL_MEMBERS.map(m=>m.electorate))];
  const [memberFilter, setMemberFilter] = useState("all");
  const [selectedMember, setSelectedMember] = useState(null);

  return (
    <div style={{minHeight:"100vh",background:"#f0f2f7",fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
      <div style={{background:"#0d1b3e"}}>
        <div style={{maxWidth:900,margin:"0 auto",padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
          <div>
            <div style={{color:"#fff",fontFamily:"Georgia, serif",fontSize:17,fontWeight:700}}>🗳️ TasTrack Admin</div>
            <div style={{color:"rgba(255,255,255,0.38)",fontSize:9,letterSpacing:1.5}}>HANSARD DATA ENTRY TOOL</div>
          </div>
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            {tabs.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)}
                style={{padding:"6px 12px",borderRadius:20,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,
                  background:tab===t.id?"rgba(255,255,255,0.25)":"rgba(255,255,255,0.08)",color:"#fff"}}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{background:"rgba(255,255,255,0.05)",padding:"7px 18px"}}>
          <div style={{maxWidth:900,margin:"0 auto",fontSize:12,color:"rgba(255,255,255,0.45)"}}>
            {tabs.find(t=>t.id===tab)?.desc}
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
                <div style={{fontWeight:700,fontSize:13,color:"#1a1a2e",marginBottom:10}}>📊 Progress</div>
                {[["🏛️",divisions.length,"divisions"],["🗳️",Object.values(data).reduce((a,d)=>a+(d.votes||[]).length,0),"votes"],["📅",Object.values(data).filter(d=>d.sittingDaysPresent&&d.sittingDaysTotal).length,"w/attendance"]].map(([icon,val,label])=>(
                  <div key={label} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #f5f5f5",fontSize:13}}>
                    <span>{icon} {label}</span><span style={{fontWeight:700,color:"#1a3a6b"}}>{val}</span>
                  </div>
                ))}
              </div>
              <div style={{background:"#f5f0ff",borderRadius:12,border:"1px solid #e8e0ff",padding:"14px 16px"}}>
                <div style={{fontWeight:700,fontSize:12,color:"#5c3a9e",marginBottom:8}}>📌 Start here</div>
                <div style={{fontSize:12,color:"#555",lineHeight:1.8}}>
                  <strong>1.</strong> <a href="https://search.parliament.tas.gov.au/adv/havotes" target="_blank" rel="noreferrer" style={{color:"#5c3a9e"}}>Open Votes & Proceedings</a><br/>
                  <strong>2.</strong> Select year 2025, search for "division"<br/>
                  <strong>3.</strong> Download the PDF<br/>
                  <strong>4.</strong> Drop it in the upload box<br/>
                  <strong>5.</strong> Review & import<br/>
                  <strong>6.</strong> Repeat for each sitting week
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

        {tab==="members" && (
          <div>
            {!selectedMember ? (
              <>
                <div style={{display:"flex",gap:5,marginBottom:14,flexWrap:"wrap"}}>
                  <button onClick={()=>setMemberFilter("all")} style={{padding:"5px 12px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:memberFilter==="all"?"#0d1b3e":"#e8eaf0",color:memberFilter==="all"?"#fff":"#555"}}>All</button>
                  {electorates.map(e=><button key={e} onClick={()=>setMemberFilter(e)} style={{padding:"5px 12px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:memberFilter===e?"#4a5568":"#e8eaf0",color:memberFilter===e?"#fff":"#555"}}>{e}</button>)}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(250px,1fr))",gap:10}}>
                  {ALL_MEMBERS.filter(m=>memberFilter==="all"||m.electorate===memberFilter).map(m=>{
                    const d = data[m.id]||{};
                    const vc = (d.votes||[]).length;
                    const pc = (d.promises||[]).length;
                    const pct = d.sittingDaysPresent&&d.sittingDaysTotal ? Math.round((parseInt(d.sittingDaysPresent)/parseInt(d.sittingDaysTotal))*100) : null;
                    return (
                      <div key={m.id} onClick={()=>setSelectedMember(m)}
                        style={{background:"#fff",borderRadius:12,border:"1px solid #eee",cursor:"pointer",overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,0.06)",transition:"transform 0.1s"}}
                        onMouseEnter={e=>e.currentTarget.style.transform="translateY(-2px)"}
                        onMouseLeave={e=>e.currentTarget.style.transform=""}>
                        <div style={{background:PARTY_COLORS[m.party]||"#555",padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <div>
                            <div style={{color:"#fff",fontWeight:700,fontSize:13}}>{m.name}</div>
                            <div style={{color:"rgba(255,255,255,0.6)",fontSize:10,marginTop:1}}>{m.party} · {m.electorate}</div>
                          </div>
                          {pct!==null&&<div style={{fontSize:16,fontWeight:900,fontFamily:"monospace",color:pct>=90?"#4ab84a":pct>=75?"#f0c040":"#ff6b6b"}}>{pct}%</div>}
                        </div>
                        <div style={{padding:"10px 14px",display:"flex",gap:8}}>
                          <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:vc>0?"#e8f0ff":"#f5f5f5",color:vc>0?"#1a3a6b":"#aaa",fontWeight:700}}>🗳️ {vc}</span>
                          <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:pc>0?"#fff0e8":"#f5f5f5",color:pc>0?"#8b3a1a":"#aaa",fontWeight:700}}>📋 {pc}</span>
                          {pct!==null&&<span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:"#e8f5e8",color:"#2d7a2d",fontWeight:700}}>📅 ✓</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div>
                <button onClick={()=>setSelectedMember(null)}
                  style={{background:"none",border:"none",cursor:"pointer",color:"#1a3a6b",fontWeight:700,fontSize:13,padding:"0 0 14px",display:"flex",alignItems:"center",gap:5}}>
                  ← All members
                </button>
                <div style={{background:"#fff",borderRadius:14,border:"1px solid #eee",overflow:"hidden",boxShadow:"0 2px 10px rgba(0,0,0,0.07)"}}>
                  <div style={{background:PARTY_COLORS[selectedMember.party]||"#333",padding:"14px 18px"}}>
                    <div style={{color:"#fff",fontFamily:"Georgia, serif",fontSize:16,fontWeight:700}}>{selectedMember.name}</div>
                    <div style={{color:"rgba(255,255,255,0.65)",fontSize:11,marginTop:2}}>{selectedMember.party} · {selectedMember.electorate}</div>
                  </div>
                  <div style={{padding:"16px"}}>
                    {/* Attendance */}
                    <div style={{marginBottom:16}}>
                      <div style={{fontWeight:700,fontSize:12,color:"#555",marginBottom:8,letterSpacing:0.3}}>📅 ATTENDANCE</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 80px",gap:8,alignItems:"end"}}>
                        <Inp label="Days Present" value={data[selectedMember.id]?.sittingDaysPresent||""} onChange={v=>handleDataChange(selectedMember.id,"sittingDaysPresent",v)} type="number" placeholder="e.g. 42" />
                        <Inp label="Total Sitting Days" value={data[selectedMember.id]?.sittingDaysTotal||""} onChange={v=>handleDataChange(selectedMember.id,"sittingDaysTotal",v)} type="number" placeholder="e.g. 45" />
                        <div style={{paddingBottom:10,textAlign:"center"}}>
                          {data[selectedMember.id]?.sittingDaysPresent&&data[selectedMember.id]?.sittingDaysTotal&&(
                            <div style={{fontSize:22,fontWeight:900,fontFamily:"monospace",color:"#2d9e5f"}}>
                              {Math.round((parseInt(data[selectedMember.id].sittingDaysPresent)/parseInt(data[selectedMember.id].sittingDaysTotal))*100)}%
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* Votes summary */}
                    <div style={{marginBottom:16}}>
                      <div style={{fontWeight:700,fontSize:12,color:"#555",marginBottom:8,letterSpacing:0.3}}>🗳️ VOTES ({(data[selectedMember.id]?.votes||[]).length})</div>
                      {(data[selectedMember.id]?.votes||[]).length===0
                        ? <div style={{color:"#aaa",fontSize:12,fontStyle:"italic"}}>No votes yet. Use AI Extract or Manual Entry to add.</div>
                        : (data[selectedMember.id]?.votes||[]).map((v,i)=>(
                          <div key={i} style={{display:"flex",justifyContent:"space-between",gap:8,padding:"6px 0",borderBottom:"1px solid #f5f5f5",fontSize:12}}>
                            <div>
                              <div style={{fontWeight:600,color:"#222"}}>{v.bill}</div>
                              <div style={{color:"#aaa",fontSize:11}}>{v.date} · {v.policyArea}</div>
                            </div>
                            <div style={{display:"flex",gap:4,alignItems:"center"}}>
                              <span style={{fontSize:10,padding:"2px 7px",borderRadius:20,fontWeight:700,background:v.vote==="for"?"#e8f5e8":"#fbe8e8",color:v.vote==="for"?"#2d7a2d":"#9e2d2d"}}>{v.vote.toUpperCase()}</span>
                              <button onClick={()=>handleDataChange(selectedMember.id,"votes",(data[selectedMember.id]?.votes||[]).filter((_,j)=>j!==i))}
                                style={{background:"none",border:"none",color:"#ddd",cursor:"pointer",fontSize:16,padding:0}}>×</button>
                            </div>
                          </div>
                        ))}
                    </div>
                    {/* Promise entry */}
                    <div>
                      <div style={{fontWeight:700,fontSize:12,color:"#555",marginBottom:8,letterSpacing:0.3}}>📋 PROMISES / STATEMENTS ({(data[selectedMember.id]?.promises||[]).length})</div>
                      {(data[selectedMember.id]?.promises||[]).map((p,i)=>(
                        <div key={i} style={{display:"flex",gap:8,padding:"6px 0",borderBottom:"1px solid #f5f5f5",fontSize:12}}>
                          <span style={{fontSize:14}}>{p.outcome==="kept"?"✅":p.outcome==="broken"?"❌":"⏳"}</span>
                          <div style={{flex:1}}>
                            <div style={{fontStyle:"italic",color:"#333"}}>"{p.text}"</div>
                            <div style={{color:"#aaa",fontSize:11,marginTop:1}}>{p.date} · {p.source}</div>
                          </div>
                          <button onClick={()=>handleDataChange(selectedMember.id,"promises",(data[selectedMember.id]?.promises||[]).filter((_,j)=>j!==i))}
                            style={{background:"none",border:"none",color:"#ddd",cursor:"pointer",fontSize:16,padding:0}}>×</button>
                        </div>
                      ))}
                      <AddPromise memberId={selectedMember.id} promises={data[selectedMember.id]?.promises||[]} onChange={handleDataChange} />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab==="export" && (
          <div style={{background:"#fff",borderRadius:14,border:"1px solid #eee",padding:"18px",boxShadow:"0 2px 10px rgba(0,0,0,0.06)"}}>
            <h3 style={{fontFamily:"Georgia, serif",marginTop:0,marginBottom:14,fontSize:16}}>📦 Export Data for TasTrack</h3>
            <ExportPanel data={data} divisions={divisions} />
          </div>
        )}

        <div style={{marginTop:20,textAlign:"center",fontSize:11,color:"#bbb",lineHeight:1.8}}>
          TasTrack Admin · Layer 1 AI Extraction + Manual Entry · Data lives in browser until exported<br/>
          <a href="https://search.parliament.tas.gov.au/adv/havotes" target="_blank" rel="noreferrer" style={{color:"#bbb"}}>Tasmania V&P</a> ·{" "}
          <a href="https://theyvoteforyou.org.au" target="_blank" rel="noreferrer" style={{color:"#bbb"}}>They Vote For You</a>
        </div>
      </div>
    </div>
  );
}

function AddPromise({ memberId, promises, onChange }) {
  const [text,setText]=useState(""); const [date,setDate]=useState(today()); const [outcome,setOutcome]=useState("pending"); const [source,setSource]=useState("");
  const add = () => { if(!text||!source)return; onChange(memberId,"promises",[...promises,{id:uid(),text,date,outcome,source}]); setText("");setDate(today());setOutcome("pending");setSource(""); };
  return (
    <div style={{background:"#f8f9ff",borderRadius:8,padding:"12px",marginTop:8}}>
      <div style={{fontSize:11,fontWeight:700,color:"#888",marginBottom:8}}>ADD PROMISE</div>
      <textarea value={text} onChange={e=>setText(e.target.value)} rows={2} placeholder="Quote or describe the promise..."
        style={{width:"100%",padding:"7px 10px",border:"1px solid #ddd",borderRadius:7,fontSize:13,resize:"vertical",boxSizing:"border-box",fontFamily:"inherit",marginBottom:8}} />
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
        <Inp label="" value={date} onChange={setDate} type="date" />
        <Sel label="" value={outcome} onChange={setOutcome} options={[{value:"pending",label:"⏳ Pending"},{value:"kept",label:"✅ Kept"},{value:"broken",label:"❌ Broken"}]} />
      </div>
      <Inp label="" value={source} onChange={setSource} placeholder="Source (required)" />
      <button onClick={add} disabled={!text||!source}
        style={{width:"100%",padding:"8px",border:"none",borderRadius:8,fontSize:13,fontWeight:700,background:text&&source?"#1a3a6b":"#ccc",color:"#fff",cursor:text&&source?"pointer":"not-allowed"}}>
        + Add Promise
      </button>
    </div>
  );
}
