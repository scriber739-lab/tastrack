"""
TasTrack Hansard Scraper — Layer 2 (v2)
========================================
Two modes:
  --mode votes      Download Votes & Proceedings, extract divisions (default)
  --mode speeches   Download Hansard transcripts, extract statements &
                    detect contradictions across time

SETUP:
    pip install requests anthropic python-docx pypdf2 beautifulsoup4 lxml

USAGE:
    # Extract voting divisions for a year (default mode):
    python tastrack_scraper.py --year 2025

    # Extract speeches and detect contradictions:
    python tastrack_scraper.py --year 2025 --mode speeches

    # Run both modes together:
    python tastrack_scraper.py --year 2025 --mode both

    # Single date test:
    python tastrack_scraper.py --date 2025-06-05 --mode both

    # Run speeches across multiple years (better contradiction detection):
    python tastrack_scraper.py --from 2022-01-01 --to 2025-12-31 --mode speeches

OUTPUT:
    tastrack_data/
        divisions.json          <- voting records per division
        members.json            <- member data ready for TasTrack
        statements.json         <- all extracted statements from speeches
        contradictions.json     <- detected contradictions with evidence
        raw/votes/              <- cached V&P documents
        raw/speeches/           <- cached Hansard transcript documents
        log.txt
"""

import os
import re
import sys
import json
import time
import base64
import logging
import argparse
from pathlib import Path
from datetime import datetime
from typing import Optional

import requests
from bs4 import BeautifulSoup

try:
    import anthropic
except ImportError:
    print("ERROR: anthropic not installed. Run: pip install anthropic")
    sys.exit(1)

# ─────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────
BASE_URL        = "https://search.parliament.tas.gov.au"
SITTING_URL     = BASE_URL + "/search/quicksearch/{year}/sittingdays.html"
OUTPUT_DIR      = Path("tastrack_data")
RAW_VOTES_DIR   = OUTPUT_DIR / "raw" / "votes"
RAW_SPEECH_DIR  = OUTPUT_DIR / "raw" / "speeches"
MODEL           = "claude-sonnet-4-5"
MAX_TOKENS      = 8000
PARL_WAIT       = 2.0
API_WAIT        = 1.5

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()]
)
log = logging.getLogger(__name__)

# ─────────────────────────────────────────────
# MEMBERS
# ─────────────────────────────────────────────
ALL_MEMBERS = [
    {"id":1,  "name":"Janie Finlay",      "party":"Labor",       "electorate":"Bass",     "surnames":["finlay"]},
    {"id":2,  "name":"Jess Greene",       "party":"Labor",       "electorate":"Bass",     "surnames":["greene","jess greene"]},
    {"id":3,  "name":"Cecily Rosol",      "party":"Greens",      "electorate":"Bass",     "surnames":["rosol"]},
    {"id":4,  "name":"George Razay",      "party":"Independent", "electorate":"Bass",     "surnames":["razay"]},
    {"id":5,  "name":"Bridget Archer",    "party":"Liberal",     "electorate":"Bass",     "surnames":["archer"]},
    {"id":6,  "name":"Michael Ferguson",  "party":"Liberal",     "electorate":"Bass",     "surnames":["ferguson"]},
    {"id":7,  "name":"Rob Fairs",         "party":"Liberal",     "electorate":"Bass",     "surnames":["fairs"]},
    {"id":8,  "name":"Anita Dow",         "party":"Labor",       "electorate":"Braddon",  "surnames":["dow"]},
    {"id":9,  "name":"Shane Broad",       "party":"Labor",       "electorate":"Braddon",  "surnames":["broad"]},
    {"id":10, "name":"Craig Garland",     "party":"Independent", "electorate":"Braddon",  "surnames":["garland"]},
    {"id":11, "name":"Jeremy Rockliff",   "party":"Liberal",     "electorate":"Braddon",  "surnames":["rockliff"]},
    {"id":12, "name":"Gavin Pearce",      "party":"Liberal",     "electorate":"Braddon",  "surnames":["pearce"]},
    {"id":13, "name":"Felix Ellis",       "party":"Liberal",     "electorate":"Braddon",  "surnames":["ellis"]},
    {"id":14, "name":"Roger Jaensch",     "party":"Liberal",     "electorate":"Braddon",  "surnames":["jaensch"]},
    {"id":15, "name":"Ella Haddad",       "party":"Labor",       "electorate":"Clark",    "surnames":["haddad"]},
    {"id":16, "name":"Josh Willie",       "party":"Labor",       "electorate":"Clark",    "surnames":["willie"]},
    {"id":17, "name":"Vica Bayley",       "party":"Greens",      "electorate":"Clark",    "surnames":["bayley"]},
    {"id":18, "name":"Helen Burnet",      "party":"Greens",      "electorate":"Clark",    "surnames":["burnet"]},
    {"id":19, "name":"Kristie Johnston",  "party":"Independent", "electorate":"Clark",    "surnames":["johnston"]},
    {"id":20, "name":"Marcus Vermey",     "party":"Liberal",     "electorate":"Clark",    "surnames":["vermey"]},
    {"id":21, "name":"Madeleine Ogilvie", "party":"Liberal",     "electorate":"Clark",    "surnames":["ogilvie"]},
    {"id":22, "name":"Dean Winter",       "party":"Labor",       "electorate":"Franklin", "surnames":["winter"]},
    {"id":23, "name":"Meg Brown",         "party":"Labor",       "electorate":"Franklin", "surnames":["meg brown","m. brown"]},
    {"id":24, "name":"Rosalie Woodruff",  "party":"Greens",      "electorate":"Franklin", "surnames":["woodruff"]},
    {"id":25, "name":"David O'Byrne",     "party":"Independent", "electorate":"Franklin", "surnames":["o'byrne","obyrne"]},
    {"id":26, "name":"Peter George",      "party":"Independent", "electorate":"Franklin", "surnames":["george"]},
    {"id":27, "name":"Eric Abetz",        "party":"Liberal",     "electorate":"Franklin", "surnames":["abetz"]},
    {"id":28, "name":"Jacquie Petrusma",  "party":"Liberal",     "electorate":"Franklin", "surnames":["petrusma"]},
    {"id":29, "name":"Jen Butler",        "party":"Labor",       "electorate":"Lyons",    "surnames":["butler"]},
    {"id":30, "name":"Brian Mitchell",    "party":"Labor",       "electorate":"Lyons",    "surnames":["mitchell","brian mitchell"]},
    {"id":31, "name":"Tabatha Badger",    "party":"Greens",      "electorate":"Lyons",    "surnames":["badger"]},
    {"id":32, "name":"Carlo Di Falco",    "party":"SFF",         "electorate":"Lyons",    "surnames":["di falco","difalco"]},
    {"id":33, "name":"Guy Barnett",       "party":"Liberal",     "electorate":"Lyons",    "surnames":["barnett"]},
    {"id":34, "name":"Jane Howlett",      "party":"Liberal",     "electorate":"Lyons",    "surnames":["howlett"]},
    {"id":35, "name":"Mark Shelton",      "party":"Liberal",     "electorate":"Lyons",    "surnames":["shelton"]},
]

MEMBER_LIST_STR = "\n".join(
    f"{m['id']}. {m['name']} ({m['party']}, {m['electorate']}) -- surnames: {', '.join(m['surnames'])}"
    for m in ALL_MEMBERS
)

POLICY_AREAS = [
    "Housing & Rent", "Environment & Climate", "Health & Hospitals",
    "Gambling Reform", "Macquarie Point Stadium", "Fiscal Policy & Debt",
    "Governance & Accountability", "Transport & Infrastructure",
    "Education", "Agriculture & Fishing", "Other"
]

POLICY_LIST = ", ".join(POLICY_AREAS)

# ─────────────────────────────────────────────
# SHARED UTILITIES
# ─────────────────────────────────────────────
def parse_hansard_date(phrase):
    months = {"january":1,"february":2,"march":3,"april":4,"may":5,"june":6,
               "july":7,"august":8,"september":9,"october":10,"november":11,"december":12}
    parts = phrase.lower().split()
    try:
        if len(parts) == 4 and parts[0] in ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]:
            day, month, year = int(parts[1]), months.get(parts[2],0), int(parts[3])
            if month and 1 <= day <= 31:
                return f"{year}-{month:02d}-{day:02d}"
    except (ValueError, IndexError):
        pass
    return None


def get_sitting_days(year):
    url = SITTING_URL.format(year=year)
    log.info(f"Fetching sitting days for {year}")
    try:
        resp = requests.get(url, timeout=15, headers={"User-Agent":"TasTrack/2.0"})
        resp.raise_for_status()
    except requests.RequestException as e:
        log.error(f"Failed: {e}")
        return []
    soup = BeautifulSoup(resp.text, "lxml")
    dates = []
    for a in soup.find_all("a", href=True):
        m = re.search(r"ADVANCE_PHRASE=([^&]+)", a["href"])
        if m:
            parsed = parse_hansard_date(requests.utils.unquote(m.group(1)).replace("+", " "))
            if parsed:
                dates.append(parsed)
    dates = sorted(set(dates))
    log.info(f"Found {len(dates)} sitting days in {year}")
    return dates


def docx_to_text(path):
    try:
        from docx import Document
        doc = Document(str(path))
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    except Exception:
        return path.read_text(errors="replace")


def download_file(url, local_path):
    if local_path.exists():
        log.info(f"  Cached: {local_path.name}")
        return True
    try:
        time.sleep(PARL_WAIT)
        r = requests.get(url, timeout=60, headers={"User-Agent":"TasTrack/2.0"})
        r.raise_for_status()
        local_path.write_bytes(r.content)
        log.info(f"  Downloaded: {local_path.name} ({len(r.content)//1024}KB)")
        return True
    except Exception as e:
        log.error(f"  Download failed {local_path.name}: {e}")
        return False


def call_claude(client, system, user_content, max_tokens=MAX_TOKENS):
    time.sleep(API_WAIT)
    try:
        if isinstance(user_content, str):
            messages = [{"role":"user","content":user_content}]
        else:
            messages = [{"role":"user","content":user_content}]
        resp = client.messages.create(model=MODEL, max_tokens=max_tokens, system=system, messages=messages)
        return "".join(b.text for b in resp.content if b.type == "text")
    except anthropic.APIError as e:
        log.error(f"Claude error: {e}")
        return None


def parse_json(raw):
    if not raw:
        return None
    try:
        return json.loads(raw.replace("```json","").replace("```","").strip())
    except json.JSONDecodeError as e:
        log.error(f"JSON error: {e} — raw: {raw[:200]}")
        return None


def find_documents(sitting_dates, database, raw_dir):
    """Find documents for a list of dates in the given Hansard database."""
    raw_dir.mkdir(parents=True, exist_ok=True)
    docs = []
    for date_str in sitting_dates:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        phrase = f"{dt.strftime('%A')} {dt.day} {dt.strftime('%B')} {dt.year}"
        url = f"{BASE_URL}/Search/search/search?IW_FIELD_ADVANCE_PHRASE={requests.utils.quote(phrase)}&IW_DATABASE={requests.utils.quote(database)}&IW_SORT=-9"
        time.sleep(PARL_WAIT)
        try:
            resp = requests.get(url, timeout=15, headers={"User-Agent":"TasTrack/2.0"})
            soup = BeautifulSoup(resp.text, "lxml")
            for a in soup.find_all("a", href=True):
                href = a["href"]
                if (".docx" in href or ".pdf" in href.lower()) and "Download" in a.text:
                    full_url = href if href.startswith("http") else BASE_URL + href
                    filename = href.split("/")[-1]
                    docs.append({"date":date_str,"url":full_url,"filename":filename})
                    log.info(f"  Found ({database}): {filename} for {date_str}")
                    break
        except Exception as e:
            log.warning(f"  Search failed {date_str}: {e}")
    return docs


# ─────────────────────────────────────────────
# VOTES MODE
# ─────────────────────────────────────────────
VOTES_SYSTEM = f"""You extract voting data from Tasmanian House of Assembly Votes and Proceedings documents.

Members:
{MEMBER_LIST_STR}

RULES:
- Match surnames to member IDs. Use null if unsure.
- Ayes/For = "for", Noes/Against = "against", not listed = "absent"
- Divisions appear under "DIVISION" headings or "The House divided"
- Policy areas: {POLICY_LIST}

Return ONLY valid JSON:
{{
  "documentDate": "YYYY-MM-DD",
  "documentSource": "descriptive string",
  "sittingDays": ["YYYY-MM-DD"],
  "divisions": [
    {{
      "id": "div_001",
      "bill": "exact bill/motion name",
      "summary": "one sentence plain English",
      "outcome": "passed|defeated|tied",
      "ayes": 0,
      "noes": 0,
      "policyArea": "from list above",
      "votes": [{{"memberId": 11, "memberName": "Jeremy Rockliff", "vote": "for|against|absent"}}]
    }}
  ]
}}
If no formal divisions: {{"documentDate":"YYYY-MM-DD","documentSource":"...","sittingDays":[],"divisions":[]}}"""


def extract_votes_doc(path, client):
    log.info(f"  Extracting votes: {path.name}")
    if path.suffix.lower() == ".pdf":
        data = base64.standard_b64encode(path.read_bytes()).decode()
        user = [
            {"type":"document","source":{"type":"base64","media_type":"application/pdf","data":data}},
            {"type":"text","text":"Extract all divisions. Return only JSON."}
        ]
    else:
        text = docx_to_text(path)
        user = f"Extract all divisions. Return only JSON.\n\nDOCUMENT:\n{text[:40000]}"
    raw = call_claude(client, VOTES_SYSTEM, user)
    result = parse_json(raw)
    if result:
        log.info(f"    -> {len(result.get('divisions',[]))} divisions")
    return result


def run_votes(sitting_dates, client, dry_run):
    log.info("=== MODE: VOTES ===")
    docs = find_documents(sitting_dates, "Votes and Proceedings", RAW_VOTES_DIR)
    if dry_run:
        print(f"\nDRY RUN (votes) -- {len(docs)} documents:")
        for d in docs: print(f"  {d['date']} -- {d['filename']}")
        return []
    extractions = []
    for doc in docs:
        local = RAW_VOTES_DIR / doc["filename"]
        if download_file(doc["url"], local):
            result = extract_votes_doc(local, client)
            if result:
                extractions.append(result)
        with open(OUTPUT_DIR / "votes_progress.json","w") as f:
            json.dump(extractions, f, indent=2)
    return extractions


# ─────────────────────────────────────────────
# SPEECHES MODE
# ─────────────────────────────────────────────
SPEECH_SYSTEM = f"""You extract significant statements from Tasmanian parliamentary Hansard transcripts.

Members:
{MEMBER_LIST_STR}

Extract ONLY statements that are:
1. A clear factual claim ("Hospital wait times have fallen by X%")
2. A commitment or promise ("We will deliver X by Y date")
3. A strong policy position ("I am firmly opposed to X / I strongly support Y")
4. A stated reason for a vote ("I support this bill because...")
5. A direct accusation about policy ("The government has failed to...")

Do NOT extract: procedural statements, greetings, general filler, questions without clear answers.

Policy areas: {POLICY_LIST}

Return ONLY valid JSON:
{{
  "documentDate": "YYYY-MM-DD",
  "documentSource": "string",
  "statements": [
    {{
      "id": "stmt_001",
      "memberId": 11,
      "memberName": "Jeremy Rockliff",
      "date": "YYYY-MM-DD",
      "type": "commitment|factual_claim|policy_position|vote_reason|accusation",
      "topic": "brief topic label",
      "policyArea": "from list above",
      "quote": "exact or near-exact quote under 80 words",
      "context": "one sentence describing what was being debated",
      "significance": "high|medium|low"
    }}
  ]
}}"""


CONTRADICTION_SYSTEM = """You are a neutral political fact-checker analysing Tasmanian parliamentary statements for contradictions.

You will receive statements from ONE politician on ONE policy area, sorted by date.

Identify GENUINE contradictions where:
1. The politician said X at one point, then said the clear opposite later
2. A stated position directly conflicts with how they voted
3. A factual claim conflicts with a later factual claim on the same specific topic
4. A firm commitment was made but evidence shows it was clearly not honoured

DO NOT flag:
- Normal policy evolution that is explained
- Nuanced positions that are not truly opposite
- Different contexts that reasonably explain the difference

For each genuine contradiction return:
{
  "contradictions": [
    {
      "id": "con_001",
      "memberId": 11,
      "memberName": "Jeremy Rockliff",
      "type": "statement_vs_statement|statement_vs_vote|promise_broken|factual_flip",
      "severity": "high|medium|low",
      "topic": "brief topic",
      "policyArea": "policy area",
      "summary": "One sentence plain English description of the contradiction",
      "statementA": {
        "date": "YYYY-MM-DD",
        "quote": "what they said",
        "source": "Hansard reference",
        "context": "what was being debated"
      },
      "statementB": {
        "date": "YYYY-MM-DD",
        "quote": "what they said or did that contradicts A",
        "source": "Hansard reference",
        "context": "what was being debated"
      },
      "explanation": "Two sentences explaining why this is a genuine contradiction and why it matters"
    }
  ]
}
Return ONLY valid JSON. If no genuine contradictions: {"contradictions": []}"""


def extract_speech_doc(path, client):
    log.info(f"  Extracting speeches: {path.name}")
    if path.suffix.lower() == ".pdf":
        data = base64.standard_b64encode(path.read_bytes()).decode()
        user = [
            {"type":"document","source":{"type":"base64","media_type":"application/pdf","data":data}},
            {"type":"text","text":"Extract significant statements. Return only JSON."}
        ]
    else:
        text = docx_to_text(path)
        if len(text) > 50000:
            log.info(f"    Large doc ({len(text)} chars) -- truncating to 50000")
            text = text[:50000]
        user = f"Extract significant statements. Return only JSON.\n\nHANSARD:\n{text}"
    raw = call_claude(client, SPEECH_SYSTEM, user)
    result = parse_json(raw)
    if result:
        log.info(f"    -> {len(result.get('statements',[]))} statements")
    return result


def detect_contradictions(all_statements, client):
    if not all_statements:
        return []
    log.info("=== DETECTING CONTRADICTIONS ===")

    # Group by member
    by_member = {}
    for s in all_statements:
        mid = s.get("memberId")
        if mid:
            by_member.setdefault(mid, []).append(s)

    all_contradictions = []

    for member_id, stmts in by_member.items():
        if len(stmts) < 2:
            continue
        member = next((m for m in ALL_MEMBERS if m["id"] == member_id), None)
        if not member:
            continue
        log.info(f"  Checking {member['name']} ({len(stmts)} statements)")

        # Group by policy area
        by_policy = {}
        for s in stmts:
            by_policy.setdefault(s.get("policyArea","Other"), []).append(s)

        for policy_area, policy_stmts in by_policy.items():
            if len(policy_stmts) < 2:
                continue
            policy_stmts.sort(key=lambda s: s.get("date",""))
            user = f"""Check these statements by {member['name']} ({member['party']}) on {policy_area} for genuine contradictions.

STATEMENTS:
{json.dumps(policy_stmts, indent=2)[:12000]}

Return only JSON."""
            raw = call_claude(client, CONTRADICTION_SYSTEM, user, max_tokens=4000)
            result = parse_json(raw)
            if result and result.get("contradictions"):
                found = result["contradictions"]
                log.info(f"    -> {len(found)} contradiction(s) on {policy_area}")
                all_contradictions.extend(found)

        with open(OUTPUT_DIR / "contradiction_progress.json","w") as f:
            json.dump(all_contradictions, f, indent=2)

    log.info(f"Total contradictions: {len(all_contradictions)}")
    return all_contradictions


def run_speeches(sitting_dates, client, dry_run):
    log.info("=== MODE: SPEECHES ===")
    docs = find_documents(sitting_dates, "Hansard", RAW_SPEECH_DIR)
    if dry_run:
        print(f"\nDRY RUN (speeches) -- {len(docs)} documents:")
        for d in docs: print(f"  {d['date']} -- {d['filename']}")
        return [], []
    all_statements = []
    for doc in docs:
        local = RAW_SPEECH_DIR / doc["filename"]
        if download_file(doc["url"], local):
            result = extract_speech_doc(local, client)
            if result and result.get("statements"):
                all_statements.extend(result["statements"])
        with open(OUTPUT_DIR / "speech_progress.json","w") as f:
            json.dump(all_statements, f, indent=2)
    log.info(f"Total statements: {len(all_statements)}")
    contradictions = detect_contradictions(all_statements, client)
    return all_statements, contradictions


# ─────────────────────────────────────────────
# MERGE AND SAVE
# ─────────────────────────────────────────────
def merge_votes_data(extractions):
    divisions, member_votes, sitting_days = [], {m["id"]:[] for m in ALL_MEMBERS}, set()
    for ext in extractions:
        if not ext:
            continue
        source = ext.get("documentSource","Tasmania Hansard")
        doc_date = ext.get("documentDate","")
        [sitting_days.add(d) for d in ext.get("sittingDays",[])]
        if doc_date:
            sitting_days.add(doc_date)
        for div in ext.get("divisions",[]):
            div_id = div.get("id") or f"div_{len(divisions)+1:04d}"
            div["source"] = source
            div["date"] = div.get("date") or doc_date
            divisions.append(div)
            for vote in div.get("votes",[]):
                mid = vote.get("memberId")
                if mid and vote.get("vote") != "absent":
                    member_votes[mid].append({
                        "id": f"{div_id}_{mid}",
                        "bill": div.get("bill",""),
                        "date": div.get("date",""),
                        "policyArea": div.get("policyArea","Other"),
                        "vote": vote.get("vote",""),
                        "consistency": "unknown",
                        "source": source,
                        "divisionOutcome": div.get("outcome",""),
                    })
    return {"divisions":divisions, "memberVotes":member_votes, "sittingDays":sorted(sitting_days)}


def save_all(votes_data, statements, contradictions, existing_members=None):
    OUTPUT_DIR.mkdir(exist_ok=True)

    with open(OUTPUT_DIR/"divisions.json","w") as f: json.dump(votes_data.get("divisions",[]),f,indent=2)
    with open(OUTPUT_DIR/"statements.json","w") as f: json.dump(statements,f,indent=2)
    with open(OUTPUT_DIR/"contradictions.json","w") as f: json.dump(contradictions,f,indent=2)

    mv = votes_data.get("memberVotes",{})
    sitting_total = len(votes_data.get("sittingDays",[]))

    contras_by = {}
    for c in contradictions:
        mid = c.get("memberId")
        if mid: contras_by.setdefault(mid,[]).append(c)

    stmts_by = {}
    for s in statements:
        mid = s.get("memberId")
        if mid: stmts_by.setdefault(mid,[]).append(s)

    members_out = []
    for m in ALL_MEMBERS:
        ex = (existing_members or {}).get(str(m["id"]),{})
        members_out.append({
            "id":                 m["id"],
            "name":               m["name"],
            "party":              m["party"],
            "electorate":         m["electorate"],
            "sittingDaysTotal":   sitting_total or ex.get("sittingDaysTotal"),
            "sittingDaysPresent": ex.get("sittingDaysPresent"),
            "attendancePct":      None,
            "votes":              mv.get(m["id"],[]),
            "promises":           ex.get("promises",[]),
            "statements":         stmts_by.get(m["id"],[]) + ex.get("statements",[]),
            "contradictions":     contras_by.get(m["id"],[]),
        })

    with open(OUTPUT_DIR/"members.json","w") as f: json.dump(members_out,f,indent=2)

    total_votes  = sum(len(m["votes"]) for m in members_out)
    total_stmts  = len(statements)
    total_contras = len(contradictions)
    high_contras  = sum(1 for c in contradictions if c.get("severity")=="high")

    print("\n" + "="*60)
    print("  TASTRACK SCRAPER v2 -- COMPLETE")
    print("="*60)
    print(f"  Sitting days:         {sitting_total}")
    print(f"  Divisions extracted:  {len(votes_data.get('divisions',[]))}")
    print(f"  Vote records:         {total_votes}")
    print(f"  Statements extracted: {total_stmts}")
    print(f"  Contradictions found: {total_contras}  ({high_contras} high severity)")
    print(f"\n  Output files in: {OUTPUT_DIR}/")
    print(f"    members.json         <- paste into TasTrack SEED array")
    print(f"    contradictions.json  <- paste into TasTrack contradictions tab")
    print("="*60 + "\n")


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="TasTrack Hansard Scraper v2")
    parser.add_argument("--year",     type=int)
    parser.add_argument("--from",     dest="from_date")
    parser.add_argument("--to",       dest="to_date")
    parser.add_argument("--date")
    parser.add_argument("--mode",     choices=["votes","speeches","both"], default="votes")
    parser.add_argument("--dry-run",  action="store_true")
    parser.add_argument("--existing", help="Path to existing members.json to merge with")
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(exist_ok=True)
    RAW_VOTES_DIR.mkdir(parents=True, exist_ok=True)
    RAW_SPEECH_DIR.mkdir(parents=True, exist_ok=True)

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key and not args.dry_run:
        print("ERROR: Set ANTHROPIC_API_KEY environment variable")
        sys.exit(1)
    client = anthropic.Anthropic(api_key=api_key) if api_key else None

    if args.date:
        sitting_dates = [args.date]
    elif args.year:
        sitting_dates = get_sitting_days(args.year)
    elif args.from_date and args.to_date:
        all_dates = []
        for yr in range(int(args.from_date[:4]), int(args.to_date[:4])+1):
            all_dates.extend(get_sitting_days(yr))
        sitting_dates = [d for d in all_dates if args.from_date <= d <= args.to_date]
    else:
        sitting_dates = get_sitting_days(datetime.now().year)

    if not sitting_dates:
        log.warning("No sitting dates found.")
        return

    log.info(f"Processing {len(sitting_dates)} dates: {sitting_dates[0]} to {sitting_dates[-1]}")
    log.info(f"Mode: {args.mode}")

    votes_data     = {"divisions":[], "memberVotes":{m["id"]:[] for m in ALL_MEMBERS}, "sittingDays":[]}
    statements     = []
    contradictions = []

    if args.mode in ("votes","both"):
        extractions = run_votes(sitting_dates, client, args.dry_run)
        if extractions:
            votes_data = merge_votes_data(extractions)

    if args.mode in ("speeches","both"):
        statements, contradictions = run_speeches(sitting_dates, client, args.dry_run)

    if args.dry_run:
        return

    existing_members = None
    if args.existing and Path(args.existing).exists():
        with open(args.existing) as f:
            existing_members = {str(m["id"]):m for m in json.load(f)}

    save_all(votes_data, statements, contradictions, existing_members)


if __name__ == "__main__":
    main()
