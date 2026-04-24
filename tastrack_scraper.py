#!/usr/bin/env python3
"""
TasTrack Hansard Speech Scraper
Extracts statements and contradictions from Tasmania Hansard transcripts
and saves them directly to Supabase.

Usage:
  python tastrack_scraper.py --mode speeches --dir ./hansard_transcripts
  python tastrack_scraper.py --mode speeches --file ./hansard_2025_05_06.txt
  python tastrack_scraper.py --mode votes    --dir ./vp_documents

Requirements:
  pip install anthropic supabase python-dotenv

Setup:
  Create a .env file with:
    ANTHROPIC_API_KEY=sk-ant-...
    SUPABASE_URL=https://wdcxrbjzwrijgkjlvdng.supabase.co
    SUPABASE_KEY=eyJ...
"""

import os
import sys
import json
import argparse
import time
import re
from pathlib import Path
from datetime import datetime

try:
    import anthropic
except ImportError:
    print("ERROR: anthropic package not installed. Run: pip install anthropic")
    sys.exit(1)

try:
    from supabase import create_client
except ImportError:
    print("ERROR: supabase package not installed. Run: pip install supabase")
    sys.exit(1)

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # dotenv optional — can use environment variables directly

# ── CONFIG ────────────────────────────────────────────────────
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
SUPABASE_URL      = os.environ.get("SUPABASE_URL", "https://wdcxrbjzwrijgkjlvdng.supabase.co")
SUPABASE_KEY      = os.environ.get("SUPABASE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkY3hyYmp6d3Jpamdramx2ZG5nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4ODQ3ODgsImV4cCI6MjA5MjQ2MDc4OH0.Jx5r9pxl7EYM0vqiNU3au5CjHwNbx8H6Oa_PDtwPKt0")
MODEL             = "claude-sonnet-4-6"

ALL_MEMBERS = [
    {"id":1,  "name":"Janie Finlay",      "party":"Labor",       "electorate":"Bass"},
    {"id":2,  "name":"Jess Greene",       "party":"Labor",       "electorate":"Bass"},
    {"id":3,  "name":"Cecily Rosol",      "party":"Greens",      "electorate":"Bass"},
    {"id":4,  "name":"George Razay",      "party":"Independent", "electorate":"Bass"},
    {"id":5,  "name":"Bridget Archer",    "party":"Liberal",     "electorate":"Bass"},
    {"id":6,  "name":"Michael Ferguson",  "party":"Liberal",     "electorate":"Bass"},
    {"id":7,  "name":"Rob Fairs",         "party":"Liberal",     "electorate":"Bass"},
    {"id":8,  "name":"Anita Dow",         "party":"Labor",       "electorate":"Braddon"},
    {"id":9,  "name":"Shane Broad",       "party":"Labor",       "electorate":"Braddon"},
    {"id":10, "name":"Craig Garland",     "party":"Independent", "electorate":"Braddon"},
    {"id":11, "name":"Jeremy Rockliff",   "party":"Liberal",     "electorate":"Braddon"},
    {"id":12, "name":"Gavin Pearce",      "party":"Liberal",     "electorate":"Braddon"},
    {"id":13, "name":"Felix Ellis",       "party":"Liberal",     "electorate":"Braddon"},
    {"id":14, "name":"Roger Jaensch",     "party":"Liberal",     "electorate":"Braddon"},
    {"id":15, "name":"Ella Haddad",       "party":"Labor",       "electorate":"Clark"},
    {"id":16, "name":"Josh Willie",       "party":"Labor",       "electorate":"Clark"},
    {"id":17, "name":"Vica Bayley",       "party":"Greens",      "electorate":"Clark"},
    {"id":18, "name":"Helen Burnet",      "party":"Greens",      "electorate":"Clark"},
    {"id":19, "name":"Kristie Johnston",  "party":"Independent", "electorate":"Clark"},
    {"id":20, "name":"Marcus Vermey",     "party":"Liberal",     "electorate":"Clark"},
    {"id":21, "name":"Madeleine Ogilvie", "party":"Liberal",     "electorate":"Clark"},
    {"id":22, "name":"Dean Winter",       "party":"Labor",       "electorate":"Franklin"},
    {"id":23, "name":"Meg Brown",         "party":"Labor",       "electorate":"Franklin"},
    {"id":24, "name":"Rosalie Woodruff",  "party":"Greens",      "electorate":"Franklin"},
    {"id":25, "name":"David O'Byrne",     "party":"Independent", "electorate":"Franklin"},
    {"id":26, "name":"Peter George",      "party":"Independent", "electorate":"Franklin"},
    {"id":27, "name":"Eric Abetz",        "party":"Liberal",     "electorate":"Franklin"},
    {"id":28, "name":"Jacquie Petrusma",  "party":"Liberal",     "electorate":"Franklin"},
    {"id":29, "name":"Jen Butler",        "party":"Labor",       "electorate":"Lyons"},
    {"id":30, "name":"Brian Mitchell",    "party":"Labor",       "electorate":"Lyons"},
    {"id":31, "name":"Tabatha Badger",    "party":"Greens",      "electorate":"Lyons"},
    {"id":32, "name":"Carlo Di Falco",    "party":"SFF",         "electorate":"Lyons"},
    {"id":33, "name":"Guy Barnett",       "party":"Liberal",     "electorate":"Lyons"},
    {"id":34, "name":"Jane Howlett",      "party":"Liberal",     "electorate":"Lyons"},
    {"id":35, "name":"Mark Shelton",      "party":"Liberal",     "electorate":"Lyons"},
]
MEMBER_MAP = {m["name"]: m for m in ALL_MEMBERS}
MEMBER_ID_MAP = {m["id"]: m for m in ALL_MEMBERS}

POLICY_AREAS = [
    "Housing & Rent", "Environment & Climate", "Health & Hospitals",
    "Gambling Reform", "Macquarie Point Stadium", "Fiscal Policy & Debt",
    "Governance & Accountability", "Transport & Infrastructure",
    "Education", "Agriculture & Fishing", "Other"
]

def uid():
    import random, string
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))

# ── SUPABASE CLIENT ───────────────────────────────────────────
def get_supabase():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: SUPABASE_URL and SUPABASE_KEY must be set")
        sys.exit(1)
    return create_client(SUPABASE_URL, SUPABASE_KEY)

# ── ANTHROPIC CLIENT ──────────────────────────────────────────
def get_claude():
    if not ANTHROPIC_API_KEY:
        print("ERROR: ANTHROPIC_API_KEY must be set")
        sys.exit(1)
    return anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

# ── LOAD ALL EXISTING STATEMENTS FROM SUPABASE ───────────────
def load_existing_statements(sb):
    """Load all existing statements from Supabase for cross-transcript contradiction detection."""
    result = sb.table("statements").select("*").execute()
    stmts = result.data or []
    print(f"  Loaded {len(stmts)} existing statements from Supabase")
    return stmts

# ── EXTRACT SPEECHES FROM A SINGLE TRANSCRIPT ────────────────
def extract_speeches(claude, text, source_name, existing_statements):
    member_list = "\n".join(f"id:{m['id']} — {m['name']} ({m['party']}, {m['electorate']})" for m in ALL_MEMBERS)
    existing_summary = ""
    if existing_statements:
        by_member = {}
        for s in existing_statements:
            mid = s.get("member_id")
            if mid not in by_member:
                by_member[mid] = []
            by_member[mid].append(f"[{s.get('date','?')}] {s.get('text','')[:100]}")
        lines = []
        for mid, stmts in list(by_member.items())[:20]:  # limit context
            m = MEMBER_ID_MAP.get(mid)
            if m:
                lines.append(f"{m['name']}: {'; '.join(stmts[:3])}")
        existing_summary = "\n".join(lines)

    system_prompt = f"""You are extracting parliamentary speech data from a Tasmanian House of Assembly Hansard transcript.

Member list:
{member_list}

{f"Existing statements already in the database (for cross-transcript contradiction detection):{chr(10)}{existing_summary}" if existing_summary else ""}

YOUR TASK: Extract significant statements, promises, and policy positions. Also detect contradictions — both within this transcript AND against the existing statements listed above.

Return ONLY valid JSON, no markdown:
{{
  "documentDate": "YYYY-MM-DD",
  "documentSource": "brief description of this Hansard document",
  "statements": [
    {{
      "id": "unique 6-char id",
      "memberId": 11,
      "memberName": "Jeremy Rockliff",
      "type": "promise|policy_position|factual_claim|commitment",
      "policyArea": "one of: {', '.join(POLICY_AREAS)}",
      "quote": "exact quote max 150 words",
      "summary": "one sentence summary",
      "significance": "high|medium|low",
      "context": "brief context"
    }}
  ],
  "contradictions": [
    {{
      "id": "unique 6-char id",
      "memberId": 11,
      "memberName": "Jeremy Rockliff",
      "type": "statement_vs_statement|promise_broken|factual_flip",
      "severity": "high|medium|low",
      "topic": "short topic",
      "policyArea": "policy area",
      "summary": "one sentence describing the contradiction",
      "statementA": {{
        "date": "YYYY-MM-DD",
        "quote": "statement from this transcript",
        "source": "Hansard reference",
        "context": "context"
      }},
      "statementB": {{
        "date": "YYYY-MM-DD or unknown",
        "quote": "conflicting earlier statement",
        "source": "source if known",
        "context": "context"
      }},
      "explanation": "why this is a contradiction"
    }}
  ]
}}

Only include statements that are substantive policy positions or commitments worth tracking.
Only flag contradictions where there is clear evidence — do not speculate."""

    print(f"  Sending to Claude ({len(text):,} chars)...")
    response = claude.messages.create(
        model=MODEL,
        max_tokens=8000,
        system=system_prompt,
        messages=[{"role": "user", "content": f"Extract statements and contradictions from this Hansard transcript:\n\n{text[:40000]}"}]
    )

    raw = response.content[0].text if response.content else "{}"
    clean = raw.replace("```json", "").replace("```", "").strip()
    # Find outermost JSON object
    start = clean.find("{")
    end   = clean.rfind("}")
    if start != -1 and end != -1:
        clean = clean[start:end+1]

    return json.loads(clean)

# ── SAVE STATEMENTS TO SUPABASE ───────────────────────────────
def save_statements(sb, statements, doc_date, doc_source):
    if not statements:
        return 0
    rows = []
    for s in statements:
        rows.append({
            "id":        f"{s['id']}_{s['memberId']}",
            "member_id": s["memberId"],
            "text":      s["summary"],
            "date":      doc_date or s.get("date"),
            "verified":  True,
            "followed":  None,
        })
    result = sb.table("statements").upsert(rows, on_conflict="id", ignore_duplicates=True).execute()
    return len(rows)

# ── SAVE CONTRADICTIONS TO SUPABASE ──────────────────────────
def save_contradictions(sb, contradictions, doc_date):
    if not contradictions:
        return 0
    rows = []
    for c in contradictions:
        rows.append({
            "id":          f"{c['id']}_{c['memberId']}",
            "member_id":   c["memberId"],
            "member_name": c["memberName"],
            "type":        c["type"],
            "severity":    c["severity"],
            "topic":       c["topic"],
            "policy_area": c["policyArea"],
            "summary":     c["summary"],
            "statement_a": c["statementA"],
            "statement_b": c["statementB"],
            "explanation": c["explanation"],
        })
    result = sb.table("contradictions").upsert(rows, on_conflict="id", ignore_duplicates=True).execute()
    return len(rows)

# ── PROCESS A SINGLE FILE ────────────────────────────────────
def process_file(claude, sb, filepath, existing_statements, dry_run=False):
    print(f"\n{'='*60}")
    print(f"Processing: {filepath.name}")

    text = filepath.read_text(encoding="utf-8", errors="replace")
    if len(text.strip()) < 200:
        print(f"  SKIP — file too short ({len(text)} chars)")
        return {"statements": 0, "contradictions": 0}

    try:
        result = extract_speeches(claude, text, filepath.name, existing_statements)
    except json.JSONDecodeError as e:
        print(f"  ERROR parsing JSON: {e}")
        return {"statements": 0, "contradictions": 0}
    except Exception as e:
        print(f"  ERROR: {e}")
        return {"statements": 0, "contradictions": 0}

    doc_date   = result.get("documentDate")
    doc_source = result.get("documentSource", filepath.name)
    statements = result.get("statements", [])
    contradictions = result.get("contradictions", [])

    print(f"  Found: {len(statements)} statements, {len(contradictions)} contradictions")
    print(f"  Date: {doc_date} | Source: {doc_source}")

    if dry_run:
        print("  DRY RUN — not saving to Supabase")
        if statements:
            print("  Statements:")
            for s in statements:
                print(f"    [{s['memberName']}] {s['summary'][:80]}")
        if contradictions:
            print("  Contradictions:")
            for c in contradictions:
                print(f"    [{c['memberName']}] {c['severity'].upper()} — {c['topic']}")
        return {"statements": len(statements), "contradictions": len(contradictions)}

    saved_s = save_statements(sb, statements, doc_date, doc_source)
    saved_c = save_contradictions(sb, contradictions, doc_date)
    print(f"  Saved: {saved_s} statements, {saved_c} contradictions to Supabase")

    # Add new statements to existing_statements for subsequent files
    for s in statements:
        existing_statements.append({
            "member_id": s["memberId"],
            "date":      doc_date,
            "text":      s["summary"],
        })

    return {"statements": saved_s, "contradictions": saved_c}

# ── MAIN ──────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="TasTrack Hansard Scraper")
    parser.add_argument("--mode", choices=["speeches", "votes"], default="speeches",
                        help="speeches: extract statements from Hansard transcripts\n"
                             "votes: extract divisions from V&P documents (use admin tool instead)")
    parser.add_argument("--dir",  help="Directory containing transcript files (.txt or .pdf)")
    parser.add_argument("--file", help="Single transcript file to process")
    parser.add_argument("--dry-run", action="store_true", help="Extract but don't save to Supabase")
    parser.add_argument("--delay", type=float, default=2.0, help="Seconds between API calls (default: 2)")
    args = parser.parse_args()

    if args.mode == "votes":
        print("For votes/divisions, use the AI Extract tab in the TasTrack admin tool.")
        print("URL: tastrack-834z.vercel.app/admin")
        sys.exit(0)

    if not args.dir and not args.file:
        print("ERROR: Provide --dir or --file")
        parser.print_help()
        sys.exit(1)

    print("TasTrack Speech Scraper")
    print(f"Mode: {args.mode} | Dry run: {args.dry_run}")

    claude = get_claude()
    sb     = get_supabase() if not args.dry_run else None

    # Load existing statements for cross-transcript contradiction detection
    existing_statements = []
    if sb:
        print("\nLoading existing statements from Supabase...")
        existing_statements = load_existing_statements(sb)

    # Collect files
    if args.file:
        files = [Path(args.file)]
    else:
        d = Path(args.dir)
        files = sorted(d.glob("*.txt")) + sorted(d.glob("*.pdf"))
        print(f"\nFound {len(files)} files in {d}")

    if not files:
        print("No .txt or .pdf files found")
        sys.exit(1)

    totals = {"statements": 0, "contradictions": 0}
    for i, f in enumerate(files):
        counts = process_file(claude, sb, f, existing_statements, dry_run=args.dry_run)
        totals["statements"]    += counts["statements"]
        totals["contradictions"] += counts["contradictions"]
        if i < len(files) - 1:
            time.sleep(args.delay)

    print(f"\n{'='*60}")
    print(f"DONE — Processed {len(files)} files")
    print(f"Total saved: {totals['statements']} statements, {totals['contradictions']} contradictions")
    if not args.dry_run:
        print("All data is live in TasTrack immediately.")

if __name__ == "__main__":
    main()
