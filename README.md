# 🗳️ TasTrack — Tasmania Politician Accountability

Track all 35 members of the Tasmanian House of Assembly with three independent scores:
- **Trust Score** — based on verified promises, statements and voting consistency
- **Popularity Score** — community up/down votes
- **AI Score** — independent Claude AI assessment

## Files

| File | Purpose |
|------|---------|
| `src/tasmania-tracker.jsx` | Main public-facing app |
| `src/tastrack-admin.jsx` | Admin data entry + AI Hansard extraction tool |
| `src/ContradictionsTab.jsx` | Contradictions tab component |
| `tastrack_scraper.py` | Python scraper for Tasmania Hansard |

## Running locally

```bash
npm install
npm start
```

## Switching between main app and admin tool

Edit `src/App.js` and change the import:

```js
// Main app (default):
import TasTrack from './tasmania-tracker';

// Admin data entry tool:
import TasTrack from './tastrack-admin';
```

## Scraper

```bash
pip install requests anthropic python-docx beautifulsoup4 lxml
export ANTHROPIC_API_KEY="sk-ant-..."

# Extract voting divisions:
python tastrack_scraper.py --year 2025

# Extract speeches + detect contradictions:
python tastrack_scraper.py --year 2025 --mode speeches

# Both:
python tastrack_scraper.py --year 2025 --mode both
```

## Data sources
- [Tasmania Hansard](https://search.parliament.tas.gov.au/adv/havotes)
- [They Vote For You](https://theyvoteforyou.org.au) (federal records)

## Built with
- React 18
- Claude AI (Anthropic)
- Tasmania Parliament Hansard
