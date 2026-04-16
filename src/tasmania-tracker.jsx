import { useState, useCallback, useMemo } from "react";
import ContradictionsTab from "./ContradictionsTab";

// ============================================================
// SCORING ENGINE
// Trust Score: evidence-based only (promises + voting consistency)
// Popularity Score: community up/down votes only
// AI Score: independent Claude assessment
// All three are completely separate — never combined
// ============================================================

function calcTrustScore(statements, votingRecord) {
  let score = 50;
  for (const s of (statements||[])) {
    if (s.followed === true)  score += 10;
    if (s.followed === false) score -= 15;
    if (s.followed === null && s.verified) score += 2;
  }
  for (const v of (votingRecord||[])) {
    if (v.consistency === "consistent")   score += 5;
    if (v.consistency === "inconsistent") score -= 8;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

function calcPopularityScore(upvotes, downvotes) {
  let score = 50;
  score += upvotes * 3;
  score -= downvotes * 4;
  return Math.max(0, Math.min(100, Math.round(score)));
}

// ============================================================
// POLICIES — each policy has a list of divisions (votes)
// Each division links to politicians via their votingRecord
// policy_key must match the policyKey field in votingRecord entries
// ============================================================
const POLICIES = [
  {
    key: "housing",
    label: "Housing & Rent",
    icon: "🏠",
    description: "Affordable housing, public housing investment, rental regulations, short-stay accommodation limits.",
    divisions:[]
  },
  {
    key: "environment",
    label: "Environment & Climate",
    icon: "🌿",
    description: "Native forest logging, salmon farming, climate targets, marine parks, land clearing.",
    divisions:[]
  },
  {
    key: "health",
    label: "Health & Hospitals",
    icon: "🏥",
    description: "Hospital funding, elective surgery wait times, mental health services, ambulance ramping.",
    divisions:[]
  },
  {
    key: "gambling",
    label: "Gambling Reform",
    icon: "🎰",
    description: "Pokies removal from pubs and clubs, gambling harm reduction, casino licensing.",
    divisions:[]
  },
  {
    key: "stadium",
    label: "Macquarie Point Stadium",
    icon: "🏟️",
    description: "The proposed $700M+ AFL stadium at Macquarie Point in Hobart — a major political flashpoint.",
    divisions:[]
  },
  {
    key: "fiscal",
    label: "Fiscal Policy & Debt",
    icon: "💰",
    description: "State budget, debt management, asset privatisation, public service funding.",
    divisions:[]
  },
  {
    key: "governance",
    label: "Governance & Accountability",
    icon: "⚖️",
    description: "No-confidence motions, parliamentary transparency, integrity commission, disclosure laws.",
    divisions:[]
  },
  {
    key: "transport",
    label: "Transport & Infrastructure",
    icon: "🚢",
    description: "Spirit of Tasmania ferry replacement, road infrastructure, public transport.",
    divisions:[]
  },
];

// Flat lookup: divisionId → division object (for inverse flag etc.)
const DIVISION_MAP = Object.fromEntries(
  POLICIES.flatMap(p => p.divisions).map(d => [d.id, d])
);
// votingRecord entries must include policyKey and divisionId
// to link to the policy/division system above
// ============================================================
const SEED = [
  {
    "id": 1,
    "name": "Janie Finlay",
    "party": "Labor",
    "electorate": "Bass",
    "sittingDaysPresent": null,
    "sittingDaysTotal": null,
    "attendancePct": null,
    "votes": [
      {
        "id": "wki2xj_1",
        "bill": "Marine Salmon Farming Industry Motion",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "sub9zy_1",
        "bill": "Reference to Government Administration Committee A - Inquiry into Mass Salmon Mortality Events and Contributing Factors",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "7zfh2x_1",
        "bill": "Leave to Move Motion Without Notice (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ps4j4g_1",
        "bill": "Suspension of Standing Orders (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "d2xi5c_1",
        "bill": "Asset Privatisation Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "mbbgu5_1",
        "bill": "Asset Privatisation Motion - Main Question",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": true
      },
      {
        "id": "ecg9hg_1",
        "bill": "Leave to Make Motion Without Notice (Dr Woodruff)",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "da4ley_1",
        "bill": "Suspension of Standing Orders — Censure Motion against Dean Winter MP",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "ehgqcn_1",
        "bill": "Adjournment Motion",
        "date": "2025-04-08",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 43, Tuesday 8 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "51icp2_1",
        "bill": "Budget Responsibility Motion",
        "date": "2025-04-09",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2t8j78_1",
        "bill": "Renewable Energy Projects Motion - Amendment to remove paragraph (4)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "r3e0ca_1",
        "bill": "Renewable Energy Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p4mu4i_1",
        "bill": "Documents Relating to MinterEllison, Macquarie Point Development Corporation, and Crown Law Motion - Amendment",
        "date": "2025-04-09",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "a1xhwv_1",
        "bill": "Suspension of Standing Orders — Want of Confidence in Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2tt91r_1",
        "bill": "Want of Confidence in the Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "j0jt9w_1",
        "bill": "Suspension of Standing Orders — No Confidence in the Premier Motion",
        "date": "2025-05-06",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "yxgad4_1",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Suspension of Standing Orders for Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "zdie8b_1",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bmx0nl_1",
        "bill": "Macquarie Point Multipurpose Stadium Referendum Motion",
        "date": "2025-05-07",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "37lq1a_1",
        "bill": "Referral of Minister for Business, Industry and Resources to the Privileges and Conduct Committee",
        "date": "2025-05-07",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "wqdh3a_1",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Amendment to withdraw and redraft",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "s8kqkh_1",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p2hs7z_1",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bruf7x_1",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "fhppzp_1",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "6qtg58_1",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "xo1ucy_1",
        "bill": "Macquarie Point Stadium Impacts Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bgi0ky_1",
        "bill": "Proposed Macquarie Point Stadium Bill Scrutiny Committee Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "wezu4j_1",
        "bill": "Charter of Budget Responsibility Amendment Bill 2025 - Amendment to Amendment (Clause 4)",
        "date": "2025-05-28",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "2f8qmf_1",
        "bill": "Macquarie Point Stadium Proposal Concerns Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "727ryo_1",
        "bill": "Want of Confidence in the Premier",
        "date": "2025-06-05",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 54, Thursday 5 June 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "0ndge6_1",
        "bill": "Want of Confidence in Government Motion",
        "date": "2025-08-19",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 1, Tuesday 19 August 2025, First Session of the Fifty-Second Parliament",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9pktvv_1",
        "bill": "Tasmanian Industries Motion",
        "date": "2025-09-10",
        "policyArea": "Agriculture & Fishing",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 3, Wednesday 10 September 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "zcy5k2_1",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "bmb9cd_1",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "1swvft_1",
        "bill": "Public Accounts Committee Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ua2f5g_1",
        "bill": "Dangerous Criminals and High Risk Offenders Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "iuqm9v_1",
        "bill": "Referral to Parliamentary Standing Committee of Public Accounts – Amendment proposed by Mr Bayley",
        "date": "2025-09-24",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "pvbz5v_1",
        "bill": "Justice Miscellaneous (Explosives Offences) Bill 2025 – Amendments proposed by Ms Badger (suspicion to belief)",
        "date": "2025-09-24",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "i99n6n_1",
        "bill": "Parliamentary Salaries and Allowances Determination, Disallowance of",
        "date": "2025-09-25",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 7, Thursday 25 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "btgoen_1",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "0lats0_1",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "u8ojq5_1",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "passed",
        "inverse": false
      }
    ],
    "promises": [],
    "statements": []
  },
  {
    "id": 2,
    "name": "Jess Greene",
    "party": "Labor",
    "electorate": "Bass",
    "sittingDaysPresent": null,
    "sittingDaysTotal": null,
    "attendancePct": null,
    "votes": [
      {
        "id": "0ndge6_2",
        "bill": "Want of Confidence in Government Motion",
        "date": "2025-08-19",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 1, Tuesday 19 August 2025, First Session of the Fifty-Second Parliament",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9pktvv_2",
        "bill": "Tasmanian Industries Motion",
        "date": "2025-09-10",
        "policyArea": "Agriculture & Fishing",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 3, Wednesday 10 September 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "zcy5k2_2",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "bmb9cd_2",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "1swvft_2",
        "bill": "Public Accounts Committee Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ua2f5g_2",
        "bill": "Dangerous Criminals and High Risk Offenders Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "iuqm9v_2",
        "bill": "Referral to Parliamentary Standing Committee of Public Accounts – Amendment proposed by Mr Bayley",
        "date": "2025-09-24",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "pvbz5v_2",
        "bill": "Justice Miscellaneous (Explosives Offences) Bill 2025 – Amendments proposed by Ms Badger (suspicion to belief)",
        "date": "2025-09-24",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "i99n6n_2",
        "bill": "Parliamentary Salaries and Allowances Determination, Disallowance of",
        "date": "2025-09-25",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 7, Thursday 25 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "btgoen_2",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "0lats0_2",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "u8ojq5_2",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "passed",
        "inverse": false
      }
    ],
    "promises": [],
    "statements": []
  },
  {
    "id": 3,
    "name": "Cecily Rosol",
    "party": "Greens",
    "electorate": "Bass",
    "sittingDaysPresent": null,
    "sittingDaysTotal": null,
    "attendancePct": null,
    "votes": [
      {
        "id": "wki2xj_3",
        "bill": "Marine Salmon Farming Industry Motion",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "sub9zy_3",
        "bill": "Reference to Government Administration Committee A - Inquiry into Mass Salmon Mortality Events and Contributing Factors",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "7zfh2x_3",
        "bill": "Leave to Move Motion Without Notice (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ps4j4g_3",
        "bill": "Suspension of Standing Orders (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "glfka0_3",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Garland)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9ql9rt_3",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "iwrkgl_3",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 8 Amendments (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "rg4d9l_3",
        "bill": "Residential Tenancy Amendment Bill 2024 - Clause 4 Amendment (Bayley)",
        "date": "2025-04-01",
        "policyArea": "Housing & Rent",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "d2xi5c_3",
        "bill": "Asset Privatisation Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "mbbgu5_3",
        "bill": "Asset Privatisation Motion - Main Question",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": true
      },
      {
        "id": "nf46s1_3",
        "bill": "Economic Growth, Tourism and Jobs Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ecg9hg_3",
        "bill": "Leave to Make Motion Without Notice (Dr Woodruff)",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "da4ley_3",
        "bill": "Suspension of Standing Orders — Censure Motion against Dean Winter MP",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "ehgqcn_3",
        "bill": "Adjournment Motion",
        "date": "2025-04-08",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 43, Tuesday 8 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "51icp2_3",
        "bill": "Budget Responsibility Motion",
        "date": "2025-04-09",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2t8j78_3",
        "bill": "Renewable Energy Projects Motion - Amendment to remove paragraph (4)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "r3e0ca_3",
        "bill": "Renewable Energy Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p4mu4i_3",
        "bill": "Documents Relating to MinterEllison, Macquarie Point Development Corporation, and Crown Law Motion - Amendment",
        "date": "2025-04-09",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "kio27h_3",
        "bill": "80:20 Co-Contribution Ratio for Regional Road and Bridge Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Transport & Infrastructure",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "a1xhwv_3",
        "bill": "Suspension of Standing Orders — Want of Confidence in Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2tt91r_3",
        "bill": "Want of Confidence in the Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "j0jt9w_3",
        "bill": "Suspension of Standing Orders — No Confidence in the Premier Motion",
        "date": "2025-05-06",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "yxgad4_3",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Suspension of Standing Orders for Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "zdie8b_3",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bmx0nl_3",
        "bill": "Macquarie Point Multipurpose Stadium Referendum Motion",
        "date": "2025-05-07",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "37lq1a_3",
        "bill": "Referral of Minister for Business, Industry and Resources to the Privileges and Conduct Committee",
        "date": "2025-05-07",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "wqdh3a_3",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Amendment to withdraw and redraft",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "pvuwi9_3",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Clause 3 Amendment (definitions of Budget papers and cash surplus)",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "fosxkb_3",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Third Reading",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "s8kqkh_3",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p2hs7z_3",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bruf7x_3",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "fhppzp_3",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "6qtg58_3",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "io8nzb_3",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "xo1ucy_3",
        "bill": "Macquarie Point Stadium Impacts Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bgi0ky_3",
        "bill": "Proposed Macquarie Point Stadium Bill Scrutiny Committee Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "wezu4j_3",
        "bill": "Charter of Budget Responsibility Amendment Bill 2025 - Amendment to Amendment (Clause 4)",
        "date": "2025-05-28",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "2f8qmf_3",
        "bill": "Macquarie Point Stadium Proposal Concerns Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "727ryo_3",
        "bill": "Want of Confidence in the Premier",
        "date": "2025-06-05",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 54, Thursday 5 June 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "0ndge6_3",
        "bill": "Want of Confidence in Government Motion",
        "date": "2025-08-19",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 1, Tuesday 19 August 2025, First Session of the Fifty-Second Parliament",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "zcy5k2_3",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "bmb9cd_3",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "1swvft_3",
        "bill": "Public Accounts Committee Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ua2f5g_3",
        "bill": "Dangerous Criminals and High Risk Offenders Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "iuqm9v_3",
        "bill": "Referral to Parliamentary Standing Committee of Public Accounts – Amendment proposed by Mr Bayley",
        "date": "2025-09-24",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "pvbz5v_3",
        "bill": "Justice Miscellaneous (Explosives Offences) Bill 2025 – Amendments proposed by Ms Badger (suspicion to belief)",
        "date": "2025-09-24",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "i99n6n_3",
        "bill": "Parliamentary Salaries and Allowances Determination, Disallowance of",
        "date": "2025-09-25",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 7, Thursday 25 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "btgoen_3",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "0lats0_3",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "u8ojq5_3",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "passed",
        "inverse": false
      }
    ],
    "promises": [],
    "statements": []
  },
  {
    "id": 4,
    "name": "George Razay",
    "party": "Independent",
    "electorate": "Bass",
    "sittingDaysPresent": null,
    "sittingDaysTotal": null,
    "attendancePct": null,
    "votes": [
      {
        "id": "0ndge6_4",
        "bill": "Want of Confidence in Government Motion",
        "date": "2025-08-19",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 1, Tuesday 19 August 2025, First Session of the Fifty-Second Parliament",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9pktvv_4",
        "bill": "Tasmanian Industries Motion",
        "date": "2025-09-10",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 3, Wednesday 10 September 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "zcy5k2_4",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "bmb9cd_4",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "1swvft_4",
        "bill": "Public Accounts Committee Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "iuqm9v_4",
        "bill": "Referral to Parliamentary Standing Committee of Public Accounts – Amendment proposed by Mr Bayley",
        "date": "2025-09-24",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "i99n6n_4",
        "bill": "Parliamentary Salaries and Allowances Determination, Disallowance of",
        "date": "2025-09-25",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 7, Thursday 25 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "btgoen_4",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "0lats0_4",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "u8ojq5_4",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "passed",
        "inverse": false
      }
    ],
    "promises": [],
    "statements": []
  },
  {
    "id": 5,
    "name": "Bridget Archer",
    "party": "Liberal",
    "electorate": "Bass",
    "sittingDaysPresent": null,
    "sittingDaysTotal": null,
    "attendancePct": null,
    "votes": [
      {
        "id": "0ndge6_5",
        "bill": "Want of Confidence in Government Motion",
        "date": "2025-08-19",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 1, Tuesday 19 August 2025, First Session of the Fifty-Second Parliament",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9pktvv_5",
        "bill": "Tasmanian Industries Motion",
        "date": "2025-09-10",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 3, Wednesday 10 September 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "1swvft_5",
        "bill": "Public Accounts Committee Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ua2f5g_5",
        "bill": "Dangerous Criminals and High Risk Offenders Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "iuqm9v_5",
        "bill": "Referral to Parliamentary Standing Committee of Public Accounts – Amendment proposed by Mr Bayley",
        "date": "2025-09-24",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "pvbz5v_5",
        "bill": "Justice Miscellaneous (Explosives Offences) Bill 2025 – Amendments proposed by Ms Badger (suspicion to belief)",
        "date": "2025-09-24",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "i99n6n_5",
        "bill": "Parliamentary Salaries and Allowances Determination, Disallowance of",
        "date": "2025-09-25",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 7, Thursday 25 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "btgoen_5",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "0lats0_5",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "u8ojq5_5",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "passed",
        "inverse": false
      }
    ],
    "promises": [],
    "statements": []
  },
  {
    "id": 6,
    "name": "Michael Ferguson",
    "party": "Liberal",
    "electorate": "Bass",
    "sittingDaysPresent": null,
    "sittingDaysTotal": null,
    "attendancePct": null,
    "votes": [
      {
        "id": "wki2xj_6",
        "bill": "Marine Salmon Farming Industry Motion",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "sub9zy_6",
        "bill": "Reference to Government Administration Committee A - Inquiry into Mass Salmon Mortality Events and Contributing Factors",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "7zfh2x_6",
        "bill": "Leave to Move Motion Without Notice (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ps4j4g_6",
        "bill": "Suspension of Standing Orders (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "glfka0_6",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Garland)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9ql9rt_6",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "iwrkgl_6",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 8 Amendments (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "rg4d9l_6",
        "bill": "Residential Tenancy Amendment Bill 2024 - Clause 4 Amendment (Bayley)",
        "date": "2025-04-01",
        "policyArea": "Housing & Rent",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "d2xi5c_6",
        "bill": "Asset Privatisation Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "mbbgu5_6",
        "bill": "Asset Privatisation Motion - Main Question",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": true
      },
      {
        "id": "nf46s1_6",
        "bill": "Economic Growth, Tourism and Jobs Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ecg9hg_6",
        "bill": "Leave to Make Motion Without Notice (Dr Woodruff)",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "da4ley_6",
        "bill": "Suspension of Standing Orders — Censure Motion against Dean Winter MP",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "ehgqcn_6",
        "bill": "Adjournment Motion",
        "date": "2025-04-08",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 43, Tuesday 8 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "51icp2_6",
        "bill": "Budget Responsibility Motion",
        "date": "2025-04-09",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2t8j78_6",
        "bill": "Renewable Energy Projects Motion - Amendment to remove paragraph (4)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "r3e0ca_6",
        "bill": "Renewable Energy Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p4mu4i_6",
        "bill": "Documents Relating to MinterEllison, Macquarie Point Development Corporation, and Crown Law Motion - Amendment",
        "date": "2025-04-09",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "kio27h_6",
        "bill": "80:20 Co-Contribution Ratio for Regional Road and Bridge Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Transport & Infrastructure",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2tt91r_6",
        "bill": "Want of Confidence in the Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "j0jt9w_6",
        "bill": "Suspension of Standing Orders — No Confidence in the Premier Motion",
        "date": "2025-05-06",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "yxgad4_6",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Suspension of Standing Orders for Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "zdie8b_6",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bmx0nl_6",
        "bill": "Macquarie Point Multipurpose Stadium Referendum Motion",
        "date": "2025-05-07",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "37lq1a_6",
        "bill": "Referral of Minister for Business, Industry and Resources to the Privileges and Conduct Committee",
        "date": "2025-05-07",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "wqdh3a_6",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Amendment to withdraw and redraft",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "pvuwi9_6",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Clause 3 Amendment (definitions of Budget papers and cash surplus)",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "fosxkb_6",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Third Reading",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "s8kqkh_6",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p2hs7z_6",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bruf7x_6",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "fhppzp_6",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "6qtg58_6",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "io8nzb_6",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "xo1ucy_6",
        "bill": "Macquarie Point Stadium Impacts Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bgi0ky_6",
        "bill": "Proposed Macquarie Point Stadium Bill Scrutiny Committee Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "wezu4j_6",
        "bill": "Charter of Budget Responsibility Amendment Bill 2025 - Amendment to Amendment (Clause 4)",
        "date": "2025-05-28",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "2f8qmf_6",
        "bill": "Macquarie Point Stadium Proposal Concerns Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "727ryo_6",
        "bill": "Want of Confidence in the Premier",
        "date": "2025-06-05",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 54, Thursday 5 June 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "0ndge6_6",
        "bill": "Want of Confidence in Government Motion",
        "date": "2025-08-19",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 1, Tuesday 19 August 2025, First Session of the Fifty-Second Parliament",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9pktvv_6",
        "bill": "Tasmanian Industries Motion",
        "date": "2025-09-10",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 3, Wednesday 10 September 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "zcy5k2_6",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "bmb9cd_6",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "1swvft_6",
        "bill": "Public Accounts Committee Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ua2f5g_6",
        "bill": "Dangerous Criminals and High Risk Offenders Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "iuqm9v_6",
        "bill": "Referral to Parliamentary Standing Committee of Public Accounts – Amendment proposed by Mr Bayley",
        "date": "2025-09-24",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "pvbz5v_6",
        "bill": "Justice Miscellaneous (Explosives Offences) Bill 2025 – Amendments proposed by Ms Badger (suspicion to belief)",
        "date": "2025-09-24",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "i99n6n_6",
        "bill": "Parliamentary Salaries and Allowances Determination, Disallowance of",
        "date": "2025-09-25",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 7, Thursday 25 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "btgoen_6",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "0lats0_6",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "u8ojq5_6",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "passed",
        "inverse": false
      }
    ],
    "promises": [],
    "statements": []
  },
  {
    "id": 7,
    "name": "Rob Fairs",
    "party": "Liberal",
    "electorate": "Bass",
    "sittingDaysPresent": null,
    "sittingDaysTotal": null,
    "attendancePct": null,
    "votes": [
      {
        "id": "wki2xj_7",
        "bill": "Marine Salmon Farming Industry Motion",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "sub9zy_7",
        "bill": "Reference to Government Administration Committee A - Inquiry into Mass Salmon Mortality Events and Contributing Factors",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "7zfh2x_7",
        "bill": "Leave to Move Motion Without Notice (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ps4j4g_7",
        "bill": "Suspension of Standing Orders (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "glfka0_7",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Garland)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9ql9rt_7",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "iwrkgl_7",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 8 Amendments (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "rg4d9l_7",
        "bill": "Residential Tenancy Amendment Bill 2024 - Clause 4 Amendment (Bayley)",
        "date": "2025-04-01",
        "policyArea": "Housing & Rent",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "d2xi5c_7",
        "bill": "Asset Privatisation Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "mbbgu5_7",
        "bill": "Asset Privatisation Motion - Main Question",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": true
      },
      {
        "id": "nf46s1_7",
        "bill": "Economic Growth, Tourism and Jobs Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ecg9hg_7",
        "bill": "Leave to Make Motion Without Notice (Dr Woodruff)",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "da4ley_7",
        "bill": "Suspension of Standing Orders — Censure Motion against Dean Winter MP",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "ehgqcn_7",
        "bill": "Adjournment Motion",
        "date": "2025-04-08",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 43, Tuesday 8 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "51icp2_7",
        "bill": "Budget Responsibility Motion",
        "date": "2025-04-09",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2t8j78_7",
        "bill": "Renewable Energy Projects Motion - Amendment to remove paragraph (4)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "r3e0ca_7",
        "bill": "Renewable Energy Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p4mu4i_7",
        "bill": "Documents Relating to MinterEllison, Macquarie Point Development Corporation, and Crown Law Motion - Amendment",
        "date": "2025-04-09",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "kio27h_7",
        "bill": "80:20 Co-Contribution Ratio for Regional Road and Bridge Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Transport & Infrastructure",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "a1xhwv_7",
        "bill": "Suspension of Standing Orders — Want of Confidence in Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2tt91r_7",
        "bill": "Want of Confidence in the Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "j0jt9w_7",
        "bill": "Suspension of Standing Orders — No Confidence in the Premier Motion",
        "date": "2025-05-06",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "yxgad4_7",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Suspension of Standing Orders for Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "zdie8b_7",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bmx0nl_7",
        "bill": "Macquarie Point Multipurpose Stadium Referendum Motion",
        "date": "2025-05-07",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "37lq1a_7",
        "bill": "Referral of Minister for Business, Industry and Resources to the Privileges and Conduct Committee",
        "date": "2025-05-07",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "wqdh3a_7",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Amendment to withdraw and redraft",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "pvuwi9_7",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Clause 3 Amendment (definitions of Budget papers and cash surplus)",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "fosxkb_7",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Third Reading",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "s8kqkh_7",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p2hs7z_7",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bruf7x_7",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "fhppzp_7",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "6qtg58_7",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "io8nzb_7",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "727ryo_7",
        "bill": "Want of Confidence in the Premier",
        "date": "2025-06-05",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 54, Thursday 5 June 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "0ndge6_7",
        "bill": "Want of Confidence in Government Motion",
        "date": "2025-08-19",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 1, Tuesday 19 August 2025, First Session of the Fifty-Second Parliament",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "1swvft_7",
        "bill": "Public Accounts Committee Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ua2f5g_7",
        "bill": "Dangerous Criminals and High Risk Offenders Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "iuqm9v_7",
        "bill": "Referral to Parliamentary Standing Committee of Public Accounts – Amendment proposed by Mr Bayley",
        "date": "2025-09-24",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "pvbz5v_7",
        "bill": "Justice Miscellaneous (Explosives Offences) Bill 2025 – Amendments proposed by Ms Badger (suspicion to belief)",
        "date": "2025-09-24",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "i99n6n_7",
        "bill": "Parliamentary Salaries and Allowances Determination, Disallowance of",
        "date": "2025-09-25",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 7, Thursday 25 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "btgoen_7",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "0lats0_7",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "u8ojq5_7",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "passed",
        "inverse": false
      }
    ],
    "promises": [],
    "statements": []
  },
  {
    "id": 8,
    "name": "Anita Dow",
    "party": "Labor",
    "electorate": "Braddon",
    "sittingDaysPresent": null,
    "sittingDaysTotal": null,
    "attendancePct": null,
    "votes": [
      {
        "id": "wki2xj_8",
        "bill": "Marine Salmon Farming Industry Motion",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "sub9zy_8",
        "bill": "Reference to Government Administration Committee A - Inquiry into Mass Salmon Mortality Events and Contributing Factors",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "7zfh2x_8",
        "bill": "Leave to Move Motion Without Notice (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ps4j4g_8",
        "bill": "Suspension of Standing Orders (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "glfka0_8",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Garland)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9ql9rt_8",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "iwrkgl_8",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 8 Amendments (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "rg4d9l_8",
        "bill": "Residential Tenancy Amendment Bill 2024 - Clause 4 Amendment (Bayley)",
        "date": "2025-04-01",
        "policyArea": "Housing & Rent",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "d2xi5c_8",
        "bill": "Asset Privatisation Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "mbbgu5_8",
        "bill": "Asset Privatisation Motion - Main Question",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": true
      },
      {
        "id": "nf46s1_8",
        "bill": "Economic Growth, Tourism and Jobs Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ecg9hg_8",
        "bill": "Leave to Make Motion Without Notice (Dr Woodruff)",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "da4ley_8",
        "bill": "Suspension of Standing Orders — Censure Motion against Dean Winter MP",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "ehgqcn_8",
        "bill": "Adjournment Motion",
        "date": "2025-04-08",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 43, Tuesday 8 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "51icp2_8",
        "bill": "Budget Responsibility Motion",
        "date": "2025-04-09",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p4mu4i_8",
        "bill": "Documents Relating to MinterEllison, Macquarie Point Development Corporation, and Crown Law Motion - Amendment",
        "date": "2025-04-09",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "kio27h_8",
        "bill": "80:20 Co-Contribution Ratio for Regional Road and Bridge Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Transport & Infrastructure",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "a1xhwv_8",
        "bill": "Suspension of Standing Orders — Want of Confidence in Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2tt91r_8",
        "bill": "Want of Confidence in the Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "j0jt9w_8",
        "bill": "Suspension of Standing Orders — No Confidence in the Premier Motion",
        "date": "2025-05-06",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "yxgad4_8",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Suspension of Standing Orders for Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "zdie8b_8",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bmx0nl_8",
        "bill": "Macquarie Point Multipurpose Stadium Referendum Motion",
        "date": "2025-05-07",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "37lq1a_8",
        "bill": "Referral of Minister for Business, Industry and Resources to the Privileges and Conduct Committee",
        "date": "2025-05-07",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "pvuwi9_8",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Clause 3 Amendment (definitions of Budget papers and cash surplus)",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "fosxkb_8",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Third Reading",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "s8kqkh_8",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p2hs7z_8",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bruf7x_8",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "fhppzp_8",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "6qtg58_8",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "io8nzb_8",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "xo1ucy_8",
        "bill": "Macquarie Point Stadium Impacts Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bgi0ky_8",
        "bill": "Proposed Macquarie Point Stadium Bill Scrutiny Committee Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "wezu4j_8",
        "bill": "Charter of Budget Responsibility Amendment Bill 2025 - Amendment to Amendment (Clause 4)",
        "date": "2025-05-28",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "2f8qmf_8",
        "bill": "Macquarie Point Stadium Proposal Concerns Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "727ryo_8",
        "bill": "Want of Confidence in the Premier",
        "date": "2025-06-05",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 54, Thursday 5 June 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "0ndge6_8",
        "bill": "Want of Confidence in Government Motion",
        "date": "2025-08-19",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 1, Tuesday 19 August 2025, First Session of the Fifty-Second Parliament",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9pktvv_8",
        "bill": "Tasmanian Industries Motion",
        "date": "2025-09-10",
        "policyArea": "Agriculture & Fishing",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 3, Wednesday 10 September 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "1swvft_8",
        "bill": "Public Accounts Committee Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ua2f5g_8",
        "bill": "Dangerous Criminals and High Risk Offenders Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "iuqm9v_8",
        "bill": "Referral to Parliamentary Standing Committee of Public Accounts – Amendment proposed by Mr Bayley",
        "date": "2025-09-24",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "pvbz5v_8",
        "bill": "Justice Miscellaneous (Explosives Offences) Bill 2025 – Amendments proposed by Ms Badger (suspicion to belief)",
        "date": "2025-09-24",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "i99n6n_8",
        "bill": "Parliamentary Salaries and Allowances Determination, Disallowance of",
        "date": "2025-09-25",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 7, Thursday 25 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "btgoen_8",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "0lats0_8",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "u8ojq5_8",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "passed",
        "inverse": false
      }
    ],
    "promises": [],
    "statements": []
  },
  {
    "id": 9,
    "name": "Shane Broad",
    "party": "Labor",
    "electorate": "Braddon",
    "sittingDaysPresent": null,
    "sittingDaysTotal": null,
    "attendancePct": null,
    "votes": [
      {
        "id": "wki2xj_9",
        "bill": "Marine Salmon Farming Industry Motion",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "sub9zy_9",
        "bill": "Reference to Government Administration Committee A - Inquiry into Mass Salmon Mortality Events and Contributing Factors",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "7zfh2x_9",
        "bill": "Leave to Move Motion Without Notice (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ps4j4g_9",
        "bill": "Suspension of Standing Orders (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "rg4d9l_9",
        "bill": "Residential Tenancy Amendment Bill 2024 - Clause 4 Amendment (Bayley)",
        "date": "2025-04-01",
        "policyArea": "Housing & Rent",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "nf46s1_9",
        "bill": "Economic Growth, Tourism and Jobs Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ehgqcn_9",
        "bill": "Adjournment Motion",
        "date": "2025-04-08",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 43, Tuesday 8 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "51icp2_9",
        "bill": "Budget Responsibility Motion",
        "date": "2025-04-09",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2t8j78_9",
        "bill": "Renewable Energy Projects Motion - Amendment to remove paragraph (4)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "r3e0ca_9",
        "bill": "Renewable Energy Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p4mu4i_9",
        "bill": "Documents Relating to MinterEllison, Macquarie Point Development Corporation, and Crown Law Motion - Amendment",
        "date": "2025-04-09",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "kio27h_9",
        "bill": "80:20 Co-Contribution Ratio for Regional Road and Bridge Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Transport & Infrastructure",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "a1xhwv_9",
        "bill": "Suspension of Standing Orders — Want of Confidence in Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2tt91r_9",
        "bill": "Want of Confidence in the Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "j0jt9w_9",
        "bill": "Suspension of Standing Orders — No Confidence in the Premier Motion",
        "date": "2025-05-06",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "yxgad4_9",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Suspension of Standing Orders for Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "zdie8b_9",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bmx0nl_9",
        "bill": "Macquarie Point Multipurpose Stadium Referendum Motion",
        "date": "2025-05-07",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "37lq1a_9",
        "bill": "Referral of Minister for Business, Industry and Resources to the Privileges and Conduct Committee",
        "date": "2025-05-07",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "wqdh3a_9",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Amendment to withdraw and redraft",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "pvuwi9_9",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Clause 3 Amendment (definitions of Budget papers and cash surplus)",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "fosxkb_9",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Third Reading",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2f8qmf_9",
        "bill": "Macquarie Point Stadium Proposal Concerns Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "727ryo_9",
        "bill": "Want of Confidence in the Premier",
        "date": "2025-06-05",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 54, Thursday 5 June 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "0ndge6_9",
        "bill": "Want of Confidence in Government Motion",
        "date": "2025-08-19",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 1, Tuesday 19 August 2025, First Session of the Fifty-Second Parliament",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9pktvv_9",
        "bill": "Tasmanian Industries Motion",
        "date": "2025-09-10",
        "policyArea": "Agriculture & Fishing",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 3, Wednesday 10 September 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "zcy5k2_9",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "bmb9cd_9",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "1swvft_9",
        "bill": "Public Accounts Committee Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ua2f5g_9",
        "bill": "Dangerous Criminals and High Risk Offenders Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "iuqm9v_9",
        "bill": "Referral to Parliamentary Standing Committee of Public Accounts – Amendment proposed by Mr Bayley",
        "date": "2025-09-24",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "pvbz5v_9",
        "bill": "Justice Miscellaneous (Explosives Offences) Bill 2025 – Amendments proposed by Ms Badger (suspicion to belief)",
        "date": "2025-09-24",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "i99n6n_9",
        "bill": "Parliamentary Salaries and Allowances Determination, Disallowance of",
        "date": "2025-09-25",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 7, Thursday 25 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "btgoen_9",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "0lats0_9",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "u8ojq5_9",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "passed",
        "inverse": false
      }
    ],
    "promises": [],
    "statements": []
  },
  {
    "id": 10,
    "name": "Craig Garland",
    "party": "Independent",
    "electorate": "Braddon",
    "sittingDaysPresent": null,
    "sittingDaysTotal": null,
    "attendancePct": null,
    "votes": [
      {
        "id": "wki2xj_10",
        "bill": "Marine Salmon Farming Industry Motion",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "sub9zy_10",
        "bill": "Reference to Government Administration Committee A - Inquiry into Mass Salmon Mortality Events and Contributing Factors",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "7zfh2x_10",
        "bill": "Leave to Move Motion Without Notice (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ps4j4g_10",
        "bill": "Suspension of Standing Orders (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "glfka0_10",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Garland)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9ql9rt_10",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "iwrkgl_10",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 8 Amendments (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "rg4d9l_10",
        "bill": "Residential Tenancy Amendment Bill 2024 - Clause 4 Amendment (Bayley)",
        "date": "2025-04-01",
        "policyArea": "Housing & Rent",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "d2xi5c_10",
        "bill": "Asset Privatisation Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "mbbgu5_10",
        "bill": "Asset Privatisation Motion - Main Question",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": true
      },
      {
        "id": "nf46s1_10",
        "bill": "Economic Growth, Tourism and Jobs Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ecg9hg_10",
        "bill": "Leave to Make Motion Without Notice (Dr Woodruff)",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "da4ley_10",
        "bill": "Suspension of Standing Orders — Censure Motion against Dean Winter MP",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "ehgqcn_10",
        "bill": "Adjournment Motion",
        "date": "2025-04-08",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 43, Tuesday 8 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "51icp2_10",
        "bill": "Budget Responsibility Motion",
        "date": "2025-04-09",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p4mu4i_10",
        "bill": "Documents Relating to MinterEllison, Macquarie Point Development Corporation, and Crown Law Motion - Amendment",
        "date": "2025-04-09",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "kio27h_10",
        "bill": "80:20 Co-Contribution Ratio for Regional Road and Bridge Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Transport & Infrastructure",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "a1xhwv_10",
        "bill": "Suspension of Standing Orders — Want of Confidence in Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2tt91r_10",
        "bill": "Want of Confidence in the Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "j0jt9w_10",
        "bill": "Suspension of Standing Orders — No Confidence in the Premier Motion",
        "date": "2025-05-06",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "yxgad4_10",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Suspension of Standing Orders for Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "zdie8b_10",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bmx0nl_10",
        "bill": "Macquarie Point Multipurpose Stadium Referendum Motion",
        "date": "2025-05-07",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "37lq1a_10",
        "bill": "Referral of Minister for Business, Industry and Resources to the Privileges and Conduct Committee",
        "date": "2025-05-07",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "wqdh3a_10",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Amendment to withdraw and redraft",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "pvuwi9_10",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Clause 3 Amendment (definitions of Budget papers and cash surplus)",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "fosxkb_10",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Third Reading",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "s8kqkh_10",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p2hs7z_10",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bruf7x_10",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "fhppzp_10",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "6qtg58_10",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "io8nzb_10",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "xo1ucy_10",
        "bill": "Macquarie Point Stadium Impacts Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bgi0ky_10",
        "bill": "Proposed Macquarie Point Stadium Bill Scrutiny Committee Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "wezu4j_10",
        "bill": "Charter of Budget Responsibility Amendment Bill 2025 - Amendment to Amendment (Clause 4)",
        "date": "2025-05-28",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "2f8qmf_10",
        "bill": "Macquarie Point Stadium Proposal Concerns Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "727ryo_10",
        "bill": "Want of Confidence in the Premier",
        "date": "2025-06-05",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 54, Thursday 5 June 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "0ndge6_10",
        "bill": "Want of Confidence in Government Motion",
        "date": "2025-08-19",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 1, Tuesday 19 August 2025, First Session of the Fifty-Second Parliament",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9pktvv_10",
        "bill": "Tasmanian Industries Motion",
        "date": "2025-09-10",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 3, Wednesday 10 September 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "zcy5k2_10",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "bmb9cd_10",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "ua2f5g_10",
        "bill": "Dangerous Criminals and High Risk Offenders Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "iuqm9v_10",
        "bill": "Referral to Parliamentary Standing Committee of Public Accounts – Amendment proposed by Mr Bayley",
        "date": "2025-09-24",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "pvbz5v_10",
        "bill": "Justice Miscellaneous (Explosives Offences) Bill 2025 – Amendments proposed by Ms Badger (suspicion to belief)",
        "date": "2025-09-24",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "i99n6n_10",
        "bill": "Parliamentary Salaries and Allowances Determination, Disallowance of",
        "date": "2025-09-25",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 7, Thursday 25 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "btgoen_10",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "0lats0_10",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "u8ojq5_10",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "passed",
        "inverse": false
      }
    ],
    "promises": [],
    "statements": []
  },
  {
    "id": 11,
    "name": "Jeremy Rockliff",
    "party": "Liberal",
    "electorate": "Braddon",
    "sittingDaysPresent": null,
    "sittingDaysTotal": null,
    "attendancePct": null,
    "votes": [
      {
        "id": "wki2xj_11",
        "bill": "Marine Salmon Farming Industry Motion",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "sub9zy_11",
        "bill": "Reference to Government Administration Committee A - Inquiry into Mass Salmon Mortality Events and Contributing Factors",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "7zfh2x_11",
        "bill": "Leave to Move Motion Without Notice (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ps4j4g_11",
        "bill": "Suspension of Standing Orders (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "glfka0_11",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Garland)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9ql9rt_11",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "iwrkgl_11",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 8 Amendments (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "rg4d9l_11",
        "bill": "Residential Tenancy Amendment Bill 2024 - Clause 4 Amendment (Bayley)",
        "date": "2025-04-01",
        "policyArea": "Housing & Rent",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "d2xi5c_11",
        "bill": "Asset Privatisation Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "mbbgu5_11",
        "bill": "Asset Privatisation Motion - Main Question",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": true
      },
      {
        "id": "nf46s1_11",
        "bill": "Economic Growth, Tourism and Jobs Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ecg9hg_11",
        "bill": "Leave to Make Motion Without Notice (Dr Woodruff)",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "da4ley_11",
        "bill": "Suspension of Standing Orders — Censure Motion against Dean Winter MP",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "ehgqcn_11",
        "bill": "Adjournment Motion",
        "date": "2025-04-08",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 43, Tuesday 8 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "51icp2_11",
        "bill": "Budget Responsibility Motion",
        "date": "2025-04-09",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2t8j78_11",
        "bill": "Renewable Energy Projects Motion - Amendment to remove paragraph (4)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "r3e0ca_11",
        "bill": "Renewable Energy Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p4mu4i_11",
        "bill": "Documents Relating to MinterEllison, Macquarie Point Development Corporation, and Crown Law Motion - Amendment",
        "date": "2025-04-09",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "kio27h_11",
        "bill": "80:20 Co-Contribution Ratio for Regional Road and Bridge Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Transport & Infrastructure",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "a1xhwv_11",
        "bill": "Suspension of Standing Orders — Want of Confidence in Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2tt91r_11",
        "bill": "Want of Confidence in the Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "j0jt9w_11",
        "bill": "Suspension of Standing Orders — No Confidence in the Premier Motion",
        "date": "2025-05-06",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "yxgad4_11",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Suspension of Standing Orders for Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "zdie8b_11",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bmx0nl_11",
        "bill": "Macquarie Point Multipurpose Stadium Referendum Motion",
        "date": "2025-05-07",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "37lq1a_11",
        "bill": "Referral of Minister for Business, Industry and Resources to the Privileges and Conduct Committee",
        "date": "2025-05-07",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "wqdh3a_11",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Amendment to withdraw and redraft",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "pvuwi9_11",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Clause 3 Amendment (definitions of Budget papers and cash surplus)",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "fosxkb_11",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Third Reading",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "s8kqkh_11",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p2hs7z_11",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bruf7x_11",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "fhppzp_11",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "6qtg58_11",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "io8nzb_11",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "xo1ucy_11",
        "bill": "Macquarie Point Stadium Impacts Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bgi0ky_11",
        "bill": "Proposed Macquarie Point Stadium Bill Scrutiny Committee Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "wezu4j_11",
        "bill": "Charter of Budget Responsibility Amendment Bill 2025 - Amendment to Amendment (Clause 4)",
        "date": "2025-05-28",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "2f8qmf_11",
        "bill": "Macquarie Point Stadium Proposal Concerns Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "727ryo_11",
        "bill": "Want of Confidence in the Premier",
        "date": "2025-06-05",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 54, Thursday 5 June 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "0ndge6_11",
        "bill": "Want of Confidence in Government Motion",
        "date": "2025-08-19",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 1, Tuesday 19 August 2025, First Session of the Fifty-Second Parliament",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9pktvv_11",
        "bill": "Tasmanian Industries Motion",
        "date": "2025-09-10",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 3, Wednesday 10 September 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "zcy5k2_11",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "bmb9cd_11",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "1swvft_11",
        "bill": "Public Accounts Committee Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ua2f5g_11",
        "bill": "Dangerous Criminals and High Risk Offenders Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "iuqm9v_11",
        "bill": "Referral to Parliamentary Standing Committee of Public Accounts – Amendment proposed by Mr Bayley",
        "date": "2025-09-24",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "pvbz5v_11",
        "bill": "Justice Miscellaneous (Explosives Offences) Bill 2025 – Amendments proposed by Ms Badger (suspicion to belief)",
        "date": "2025-09-24",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "i99n6n_11",
        "bill": "Parliamentary Salaries and Allowances Determination, Disallowance of",
        "date": "2025-09-25",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 7, Thursday 25 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "btgoen_11",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "0lats0_11",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "u8ojq5_11",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "passed",
        "inverse": false
      }
    ],
    "promises": [],
    "statements": []
  },
  {
    "id": 12,
    "name": "Gavin Pearce",
    "party": "Liberal",
    "electorate": "Braddon",
    "sittingDaysPresent": null,
    "sittingDaysTotal": null,
    "attendancePct": null,
    "votes": [
      {
        "id": "0ndge6_12",
        "bill": "Want of Confidence in Government Motion",
        "date": "2025-08-19",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 1, Tuesday 19 August 2025, First Session of the Fifty-Second Parliament",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9pktvv_12",
        "bill": "Tasmanian Industries Motion",
        "date": "2025-09-10",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 3, Wednesday 10 September 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "zcy5k2_12",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "bmb9cd_12",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "1swvft_12",
        "bill": "Public Accounts Committee Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ua2f5g_12",
        "bill": "Dangerous Criminals and High Risk Offenders Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "iuqm9v_12",
        "bill": "Referral to Parliamentary Standing Committee of Public Accounts – Amendment proposed by Mr Bayley",
        "date": "2025-09-24",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "pvbz5v_12",
        "bill": "Justice Miscellaneous (Explosives Offences) Bill 2025 – Amendments proposed by Ms Badger (suspicion to belief)",
        "date": "2025-09-24",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "i99n6n_12",
        "bill": "Parliamentary Salaries and Allowances Determination, Disallowance of",
        "date": "2025-09-25",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 7, Thursday 25 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "btgoen_12",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "0lats0_12",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "u8ojq5_12",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "passed",
        "inverse": false
      }
    ],
    "promises": [],
    "statements": []
  },
  {
    "id": 13,
    "name": "Felix Ellis",
    "party": "Liberal",
    "electorate": "Braddon",
    "sittingDaysPresent": null,
    "sittingDaysTotal": null,
    "attendancePct": null,
    "votes": [
      {
        "id": "wki2xj_13",
        "bill": "Marine Salmon Farming Industry Motion",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "sub9zy_13",
        "bill": "Reference to Government Administration Committee A - Inquiry into Mass Salmon Mortality Events and Contributing Factors",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "7zfh2x_13",
        "bill": "Leave to Move Motion Without Notice (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ps4j4g_13",
        "bill": "Suspension of Standing Orders (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "glfka0_13",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Garland)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9ql9rt_13",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "iwrkgl_13",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 8 Amendments (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "rg4d9l_13",
        "bill": "Residential Tenancy Amendment Bill 2024 - Clause 4 Amendment (Bayley)",
        "date": "2025-04-01",
        "policyArea": "Housing & Rent",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "d2xi5c_13",
        "bill": "Asset Privatisation Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "mbbgu5_13",
        "bill": "Asset Privatisation Motion - Main Question",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": true
      },
      {
        "id": "nf46s1_13",
        "bill": "Economic Growth, Tourism and Jobs Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ecg9hg_13",
        "bill": "Leave to Make Motion Without Notice (Dr Woodruff)",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "da4ley_13",
        "bill": "Suspension of Standing Orders — Censure Motion against Dean Winter MP",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "ehgqcn_13",
        "bill": "Adjournment Motion",
        "date": "2025-04-08",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 43, Tuesday 8 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "51icp2_13",
        "bill": "Budget Responsibility Motion",
        "date": "2025-04-09",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2t8j78_13",
        "bill": "Renewable Energy Projects Motion - Amendment to remove paragraph (4)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "r3e0ca_13",
        "bill": "Renewable Energy Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p4mu4i_13",
        "bill": "Documents Relating to MinterEllison, Macquarie Point Development Corporation, and Crown Law Motion - Amendment",
        "date": "2025-04-09",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "kio27h_13",
        "bill": "80:20 Co-Contribution Ratio for Regional Road and Bridge Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Transport & Infrastructure",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "a1xhwv_13",
        "bill": "Suspension of Standing Orders — Want of Confidence in Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2tt91r_13",
        "bill": "Want of Confidence in the Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "j0jt9w_13",
        "bill": "Suspension of Standing Orders — No Confidence in the Premier Motion",
        "date": "2025-05-06",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "yxgad4_13",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Suspension of Standing Orders for Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "zdie8b_13",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bmx0nl_13",
        "bill": "Macquarie Point Multipurpose Stadium Referendum Motion",
        "date": "2025-05-07",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "37lq1a_13",
        "bill": "Referral of Minister for Business, Industry and Resources to the Privileges and Conduct Committee",
        "date": "2025-05-07",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "wqdh3a_13",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Amendment to withdraw and redraft",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "pvuwi9_13",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Clause 3 Amendment (definitions of Budget papers and cash surplus)",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "fosxkb_13",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Third Reading",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "s8kqkh_13",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p2hs7z_13",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bruf7x_13",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "fhppzp_13",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "6qtg58_13",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "io8nzb_13",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "xo1ucy_13",
        "bill": "Macquarie Point Stadium Impacts Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bgi0ky_13",
        "bill": "Proposed Macquarie Point Stadium Bill Scrutiny Committee Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "wezu4j_13",
        "bill": "Charter of Budget Responsibility Amendment Bill 2025 - Amendment to Amendment (Clause 4)",
        "date": "2025-05-28",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "2f8qmf_13",
        "bill": "Macquarie Point Stadium Proposal Concerns Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "727ryo_13",
        "bill": "Want of Confidence in the Premier",
        "date": "2025-06-05",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 54, Thursday 5 June 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "0ndge6_13",
        "bill": "Want of Confidence in Government Motion",
        "date": "2025-08-19",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 1, Tuesday 19 August 2025, First Session of the Fifty-Second Parliament",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9pktvv_13",
        "bill": "Tasmanian Industries Motion",
        "date": "2025-09-10",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 3, Wednesday 10 September 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "zcy5k2_13",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "bmb9cd_13",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "1swvft_13",
        "bill": "Public Accounts Committee Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ua2f5g_13",
        "bill": "Dangerous Criminals and High Risk Offenders Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "iuqm9v_13",
        "bill": "Referral to Parliamentary Standing Committee of Public Accounts – Amendment proposed by Mr Bayley",
        "date": "2025-09-24",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "pvbz5v_13",
        "bill": "Justice Miscellaneous (Explosives Offences) Bill 2025 – Amendments proposed by Ms Badger (suspicion to belief)",
        "date": "2025-09-24",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "i99n6n_13",
        "bill": "Parliamentary Salaries and Allowances Determination, Disallowance of",
        "date": "2025-09-25",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 7, Thursday 25 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "btgoen_13",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "0lats0_13",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "u8ojq5_13",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "passed",
        "inverse": false
      }
    ],
    "promises": [],
    "statements": []
  },
  {
    "id": 14,
    "name": "Roger Jaensch",
    "party": "Liberal",
    "electorate": "Braddon",
    "sittingDaysPresent": null,
    "sittingDaysTotal": null,
    "attendancePct": null,
    "votes": [
      {
        "id": "wki2xj_14",
        "bill": "Marine Salmon Farming Industry Motion",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "sub9zy_14",
        "bill": "Reference to Government Administration Committee A - Inquiry into Mass Salmon Mortality Events and Contributing Factors",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "7zfh2x_14",
        "bill": "Leave to Move Motion Without Notice (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ps4j4g_14",
        "bill": "Suspension of Standing Orders (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "glfka0_14",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Garland)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9ql9rt_14",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "iwrkgl_14",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 8 Amendments (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "rg4d9l_14",
        "bill": "Residential Tenancy Amendment Bill 2024 - Clause 4 Amendment (Bayley)",
        "date": "2025-04-01",
        "policyArea": "Housing & Rent",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "d2xi5c_14",
        "bill": "Asset Privatisation Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "mbbgu5_14",
        "bill": "Asset Privatisation Motion - Main Question",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": true
      },
      {
        "id": "nf46s1_14",
        "bill": "Economic Growth, Tourism and Jobs Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ecg9hg_14",
        "bill": "Leave to Make Motion Without Notice (Dr Woodruff)",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "da4ley_14",
        "bill": "Suspension of Standing Orders — Censure Motion against Dean Winter MP",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "ehgqcn_14",
        "bill": "Adjournment Motion",
        "date": "2025-04-08",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 43, Tuesday 8 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "51icp2_14",
        "bill": "Budget Responsibility Motion",
        "date": "2025-04-09",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2t8j78_14",
        "bill": "Renewable Energy Projects Motion - Amendment to remove paragraph (4)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "r3e0ca_14",
        "bill": "Renewable Energy Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p4mu4i_14",
        "bill": "Documents Relating to MinterEllison, Macquarie Point Development Corporation, and Crown Law Motion - Amendment",
        "date": "2025-04-09",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "kio27h_14",
        "bill": "80:20 Co-Contribution Ratio for Regional Road and Bridge Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Transport & Infrastructure",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "a1xhwv_14",
        "bill": "Suspension of Standing Orders — Want of Confidence in Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2tt91r_14",
        "bill": "Want of Confidence in the Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "j0jt9w_14",
        "bill": "Suspension of Standing Orders — No Confidence in the Premier Motion",
        "date": "2025-05-06",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "yxgad4_14",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Suspension of Standing Orders for Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "zdie8b_14",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bmx0nl_14",
        "bill": "Macquarie Point Multipurpose Stadium Referendum Motion",
        "date": "2025-05-07",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "37lq1a_14",
        "bill": "Referral of Minister for Business, Industry and Resources to the Privileges and Conduct Committee",
        "date": "2025-05-07",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "wqdh3a_14",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Amendment to withdraw and redraft",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "pvuwi9_14",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Clause 3 Amendment (definitions of Budget papers and cash surplus)",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "fosxkb_14",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Third Reading",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "s8kqkh_14",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p2hs7z_14",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bruf7x_14",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "fhppzp_14",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "6qtg58_14",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "io8nzb_14",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "xo1ucy_14",
        "bill": "Macquarie Point Stadium Impacts Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bgi0ky_14",
        "bill": "Proposed Macquarie Point Stadium Bill Scrutiny Committee Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "wezu4j_14",
        "bill": "Charter of Budget Responsibility Amendment Bill 2025 - Amendment to Amendment (Clause 4)",
        "date": "2025-05-28",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "2f8qmf_14",
        "bill": "Macquarie Point Stadium Proposal Concerns Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "727ryo_14",
        "bill": "Want of Confidence in the Premier",
        "date": "2025-06-05",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 54, Thursday 5 June 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "0ndge6_14",
        "bill": "Want of Confidence in Government Motion",
        "date": "2025-08-19",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 1, Tuesday 19 August 2025, First Session of the Fifty-Second Parliament",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9pktvv_14",
        "bill": "Tasmanian Industries Motion",
        "date": "2025-09-10",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 3, Wednesday 10 September 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "zcy5k2_14",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "bmb9cd_14",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "1swvft_14",
        "bill": "Public Accounts Committee Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ua2f5g_14",
        "bill": "Dangerous Criminals and High Risk Offenders Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "iuqm9v_14",
        "bill": "Referral to Parliamentary Standing Committee of Public Accounts – Amendment proposed by Mr Bayley",
        "date": "2025-09-24",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "pvbz5v_14",
        "bill": "Justice Miscellaneous (Explosives Offences) Bill 2025 – Amendments proposed by Ms Badger (suspicion to belief)",
        "date": "2025-09-24",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "i99n6n_14",
        "bill": "Parliamentary Salaries and Allowances Determination, Disallowance of",
        "date": "2025-09-25",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 7, Thursday 25 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "btgoen_14",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "0lats0_14",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "u8ojq5_14",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "passed",
        "inverse": false
      }
    ],
    "promises": [],
    "statements": []
  },
  {
    "id": 15,
    "name": "Ella Haddad",
    "party": "Labor",
    "electorate": "Clark",
    "sittingDaysPresent": null,
    "sittingDaysTotal": null,
    "attendancePct": null,
    "votes": [
      {
        "id": "wki2xj_15",
        "bill": "Marine Salmon Farming Industry Motion",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "sub9zy_15",
        "bill": "Reference to Government Administration Committee A - Inquiry into Mass Salmon Mortality Events and Contributing Factors",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "7zfh2x_15",
        "bill": "Leave to Move Motion Without Notice (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ps4j4g_15",
        "bill": "Suspension of Standing Orders (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "glfka0_15",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Garland)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9ql9rt_15",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "iwrkgl_15",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 8 Amendments (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "rg4d9l_15",
        "bill": "Residential Tenancy Amendment Bill 2024 - Clause 4 Amendment (Bayley)",
        "date": "2025-04-01",
        "policyArea": "Housing & Rent",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "d2xi5c_15",
        "bill": "Asset Privatisation Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "mbbgu5_15",
        "bill": "Asset Privatisation Motion - Main Question",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": true
      },
      {
        "id": "nf46s1_15",
        "bill": "Economic Growth, Tourism and Jobs Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ecg9hg_15",
        "bill": "Leave to Make Motion Without Notice (Dr Woodruff)",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "da4ley_15",
        "bill": "Suspension of Standing Orders — Censure Motion against Dean Winter MP",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "ehgqcn_15",
        "bill": "Adjournment Motion",
        "date": "2025-04-08",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 43, Tuesday 8 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2t8j78_15",
        "bill": "Renewable Energy Projects Motion - Amendment to remove paragraph (4)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "r3e0ca_15",
        "bill": "Renewable Energy Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p4mu4i_15",
        "bill": "Documents Relating to MinterEllison, Macquarie Point Development Corporation, and Crown Law Motion - Amendment",
        "date": "2025-04-09",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "kio27h_15",
        "bill": "80:20 Co-Contribution Ratio for Regional Road and Bridge Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Transport & Infrastructure",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "a1xhwv_15",
        "bill": "Suspension of Standing Orders — Want of Confidence in Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2tt91r_15",
        "bill": "Want of Confidence in the Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "j0jt9w_15",
        "bill": "Suspension of Standing Orders — No Confidence in the Premier Motion",
        "date": "2025-05-06",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "yxgad4_15",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Suspension of Standing Orders for Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "zdie8b_15",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bmx0nl_15",
        "bill": "Macquarie Point Multipurpose Stadium Referendum Motion",
        "date": "2025-05-07",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "37lq1a_15",
        "bill": "Referral of Minister for Business, Industry and Resources to the Privileges and Conduct Committee",
        "date": "2025-05-07",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "wqdh3a_15",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Amendment to withdraw and redraft",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "pvuwi9_15",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Clause 3 Amendment (definitions of Budget papers and cash surplus)",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "fosxkb_15",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Third Reading",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "s8kqkh_15",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p2hs7z_15",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bruf7x_15",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "fhppzp_15",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "6qtg58_15",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "io8nzb_15",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "xo1ucy_15",
        "bill": "Macquarie Point Stadium Impacts Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bgi0ky_15",
        "bill": "Proposed Macquarie Point Stadium Bill Scrutiny Committee Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "2f8qmf_15",
        "bill": "Macquarie Point Stadium Proposal Concerns Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "727ryo_15",
        "bill": "Want of Confidence in the Premier",
        "date": "2025-06-05",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 54, Thursday 5 June 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "0ndge6_15",
        "bill": "Want of Confidence in Government Motion",
        "date": "2025-08-19",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 1, Tuesday 19 August 2025, First Session of the Fifty-Second Parliament",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9pktvv_15",
        "bill": "Tasmanian Industries Motion",
        "date": "2025-09-10",
        "policyArea": "Agriculture & Fishing",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 3, Wednesday 10 September 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "zcy5k2_15",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "bmb9cd_15",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "1swvft_15",
        "bill": "Public Accounts Committee Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ua2f5g_15",
        "bill": "Dangerous Criminals and High Risk Offenders Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "iuqm9v_15",
        "bill": "Referral to Parliamentary Standing Committee of Public Accounts – Amendment proposed by Mr Bayley",
        "date": "2025-09-24",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "pvbz5v_15",
        "bill": "Justice Miscellaneous (Explosives Offences) Bill 2025 – Amendments proposed by Ms Badger (suspicion to belief)",
        "date": "2025-09-24",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "i99n6n_15",
        "bill": "Parliamentary Salaries and Allowances Determination, Disallowance of",
        "date": "2025-09-25",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 7, Thursday 25 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "btgoen_15",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "0lats0_15",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "u8ojq5_15",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "passed",
        "inverse": false
      }
    ],
    "promises": [],
    "statements": []
  },
  {
    "id": 16,
    "name": "Josh Willie",
    "party": "Labor",
    "electorate": "Clark",
    "sittingDaysPresent": null,
    "sittingDaysTotal": null,
    "attendancePct": null,
    "votes": [
      {
        "id": "wki2xj_16",
        "bill": "Marine Salmon Farming Industry Motion",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "sub9zy_16",
        "bill": "Reference to Government Administration Committee A - Inquiry into Mass Salmon Mortality Events and Contributing Factors",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "7zfh2x_16",
        "bill": "Leave to Move Motion Without Notice (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ps4j4g_16",
        "bill": "Suspension of Standing Orders (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "glfka0_16",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Garland)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9ql9rt_16",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "iwrkgl_16",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 8 Amendments (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "rg4d9l_16",
        "bill": "Residential Tenancy Amendment Bill 2024 - Clause 4 Amendment (Bayley)",
        "date": "2025-04-01",
        "policyArea": "Housing & Rent",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "d2xi5c_16",
        "bill": "Asset Privatisation Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "mbbgu5_16",
        "bill": "Asset Privatisation Motion - Main Question",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": true
      },
      {
        "id": "nf46s1_16",
        "bill": "Economic Growth, Tourism and Jobs Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ecg9hg_16",
        "bill": "Leave to Make Motion Without Notice (Dr Woodruff)",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ehgqcn_16",
        "bill": "Adjournment Motion",
        "date": "2025-04-08",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 43, Tuesday 8 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "51icp2_16",
        "bill": "Budget Responsibility Motion",
        "date": "2025-04-09",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2t8j78_16",
        "bill": "Renewable Energy Projects Motion - Amendment to remove paragraph (4)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "r3e0ca_16",
        "bill": "Renewable Energy Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p4mu4i_16",
        "bill": "Documents Relating to MinterEllison, Macquarie Point Development Corporation, and Crown Law Motion - Amendment",
        "date": "2025-04-09",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "kio27h_16",
        "bill": "80:20 Co-Contribution Ratio for Regional Road and Bridge Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Transport & Infrastructure",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "a1xhwv_16",
        "bill": "Suspension of Standing Orders — Want of Confidence in Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2tt91r_16",
        "bill": "Want of Confidence in the Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "yxgad4_16",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Suspension of Standing Orders for Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "zdie8b_16",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bmx0nl_16",
        "bill": "Macquarie Point Multipurpose Stadium Referendum Motion",
        "date": "2025-05-07",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "37lq1a_16",
        "bill": "Referral of Minister for Business, Industry and Resources to the Privileges and Conduct Committee",
        "date": "2025-05-07",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "wqdh3a_16",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Amendment to withdraw and redraft",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "pvuwi9_16",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Clause 3 Amendment (definitions of Budget papers and cash surplus)",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "fosxkb_16",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Third Reading",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bruf7x_16",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "fhppzp_16",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "6qtg58_16",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "io8nzb_16",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "xo1ucy_16",
        "bill": "Macquarie Point Stadium Impacts Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bgi0ky_16",
        "bill": "Proposed Macquarie Point Stadium Bill Scrutiny Committee Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "wezu4j_16",
        "bill": "Charter of Budget Responsibility Amendment Bill 2025 - Amendment to Amendment (Clause 4)",
        "date": "2025-05-28",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "2f8qmf_16",
        "bill": "Macquarie Point Stadium Proposal Concerns Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "727ryo_16",
        "bill": "Want of Confidence in the Premier",
        "date": "2025-06-05",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 54, Thursday 5 June 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "0ndge6_16",
        "bill": "Want of Confidence in Government Motion",
        "date": "2025-08-19",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 1, Tuesday 19 August 2025, First Session of the Fifty-Second Parliament",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9pktvv_16",
        "bill": "Tasmanian Industries Motion",
        "date": "2025-09-10",
        "policyArea": "Agriculture & Fishing",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 3, Wednesday 10 September 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "zcy5k2_16",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "bmb9cd_16",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "1swvft_16",
        "bill": "Public Accounts Committee Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ua2f5g_16",
        "bill": "Dangerous Criminals and High Risk Offenders Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "iuqm9v_16",
        "bill": "Referral to Parliamentary Standing Committee of Public Accounts – Amendment proposed by Mr Bayley",
        "date": "2025-09-24",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "pvbz5v_16",
        "bill": "Justice Miscellaneous (Explosives Offences) Bill 2025 – Amendments proposed by Ms Badger (suspicion to belief)",
        "date": "2025-09-24",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "i99n6n_16",
        "bill": "Parliamentary Salaries and Allowances Determination, Disallowance of",
        "date": "2025-09-25",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 7, Thursday 25 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "btgoen_16",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "0lats0_16",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "u8ojq5_16",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "passed",
        "inverse": false
      }
    ],
    "promises": [],
    "statements": []
  },
  {
    "id": 17,
    "name": "Vica Bayley",
    "party": "Greens",
    "electorate": "Clark",
    "sittingDaysPresent": null,
    "sittingDaysTotal": null,
    "attendancePct": null,
    "votes": [
      {
        "id": "wki2xj_17",
        "bill": "Marine Salmon Farming Industry Motion",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "sub9zy_17",
        "bill": "Reference to Government Administration Committee A - Inquiry into Mass Salmon Mortality Events and Contributing Factors",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "7zfh2x_17",
        "bill": "Leave to Move Motion Without Notice (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ps4j4g_17",
        "bill": "Suspension of Standing Orders (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "glfka0_17",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Garland)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9ql9rt_17",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "iwrkgl_17",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 8 Amendments (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "rg4d9l_17",
        "bill": "Residential Tenancy Amendment Bill 2024 - Clause 4 Amendment (Bayley)",
        "date": "2025-04-01",
        "policyArea": "Housing & Rent",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "d2xi5c_17",
        "bill": "Asset Privatisation Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "mbbgu5_17",
        "bill": "Asset Privatisation Motion - Main Question",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": true
      },
      {
        "id": "nf46s1_17",
        "bill": "Economic Growth, Tourism and Jobs Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ecg9hg_17",
        "bill": "Leave to Make Motion Without Notice (Dr Woodruff)",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "da4ley_17",
        "bill": "Suspension of Standing Orders — Censure Motion against Dean Winter MP",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "ehgqcn_17",
        "bill": "Adjournment Motion",
        "date": "2025-04-08",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 43, Tuesday 8 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "51icp2_17",
        "bill": "Budget Responsibility Motion",
        "date": "2025-04-09",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2t8j78_17",
        "bill": "Renewable Energy Projects Motion - Amendment to remove paragraph (4)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "r3e0ca_17",
        "bill": "Renewable Energy Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p4mu4i_17",
        "bill": "Documents Relating to MinterEllison, Macquarie Point Development Corporation, and Crown Law Motion - Amendment",
        "date": "2025-04-09",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "kio27h_17",
        "bill": "80:20 Co-Contribution Ratio for Regional Road and Bridge Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Transport & Infrastructure",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "a1xhwv_17",
        "bill": "Suspension of Standing Orders — Want of Confidence in Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2tt91r_17",
        "bill": "Want of Confidence in the Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "j0jt9w_17",
        "bill": "Suspension of Standing Orders — No Confidence in the Premier Motion",
        "date": "2025-05-06",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "yxgad4_17",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Suspension of Standing Orders for Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "zdie8b_17",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bmx0nl_17",
        "bill": "Macquarie Point Multipurpose Stadium Referendum Motion",
        "date": "2025-05-07",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "37lq1a_17",
        "bill": "Referral of Minister for Business, Industry and Resources to the Privileges and Conduct Committee",
        "date": "2025-05-07",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "wqdh3a_17",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Amendment to withdraw and redraft",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "pvuwi9_17",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Clause 3 Amendment (definitions of Budget papers and cash surplus)",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "fosxkb_17",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Third Reading",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "s8kqkh_17",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p2hs7z_17",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bruf7x_17",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "fhppzp_17",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "6qtg58_17",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "io8nzb_17",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "xo1ucy_17",
        "bill": "Macquarie Point Stadium Impacts Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bgi0ky_17",
        "bill": "Proposed Macquarie Point Stadium Bill Scrutiny Committee Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "wezu4j_17",
        "bill": "Charter of Budget Responsibility Amendment Bill 2025 - Amendment to Amendment (Clause 4)",
        "date": "2025-05-28",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "2f8qmf_17",
        "bill": "Macquarie Point Stadium Proposal Concerns Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "727ryo_17",
        "bill": "Want of Confidence in the Premier",
        "date": "2025-06-05",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 54, Thursday 5 June 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "0ndge6_17",
        "bill": "Want of Confidence in Government Motion",
        "date": "2025-08-19",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 1, Tuesday 19 August 2025, First Session of the Fifty-Second Parliament",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9pktvv_17",
        "bill": "Tasmanian Industries Motion",
        "date": "2025-09-10",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 3, Wednesday 10 September 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "zcy5k2_17",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "bmb9cd_17",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "1swvft_17",
        "bill": "Public Accounts Committee Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ua2f5g_17",
        "bill": "Dangerous Criminals and High Risk Offenders Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "iuqm9v_17",
        "bill": "Referral to Parliamentary Standing Committee of Public Accounts – Amendment proposed by Mr Bayley",
        "date": "2025-09-24",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "pvbz5v_17",
        "bill": "Justice Miscellaneous (Explosives Offences) Bill 2025 – Amendments proposed by Ms Badger (suspicion to belief)",
        "date": "2025-09-24",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "i99n6n_17",
        "bill": "Parliamentary Salaries and Allowances Determination, Disallowance of",
        "date": "2025-09-25",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 7, Thursday 25 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "btgoen_17",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "0lats0_17",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "u8ojq5_17",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "passed",
        "inverse": false
      }
    ],
    "promises": [],
    "statements": []
  },
  {
    "id": 18,
    "name": "Helen Burnet",
    "party": "Greens",
    "electorate": "Clark",
    "sittingDaysPresent": null,
    "sittingDaysTotal": null,
    "attendancePct": null,
    "votes": [
      {
        "id": "wki2xj_18",
        "bill": "Marine Salmon Farming Industry Motion",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "sub9zy_18",
        "bill": "Reference to Government Administration Committee A - Inquiry into Mass Salmon Mortality Events and Contributing Factors",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "7zfh2x_18",
        "bill": "Leave to Move Motion Without Notice (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ps4j4g_18",
        "bill": "Suspension of Standing Orders (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "glfka0_18",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Garland)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9ql9rt_18",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "iwrkgl_18",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 8 Amendments (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "rg4d9l_18",
        "bill": "Residential Tenancy Amendment Bill 2024 - Clause 4 Amendment (Bayley)",
        "date": "2025-04-01",
        "policyArea": "Housing & Rent",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "d2xi5c_18",
        "bill": "Asset Privatisation Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "mbbgu5_18",
        "bill": "Asset Privatisation Motion - Main Question",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": true
      },
      {
        "id": "nf46s1_18",
        "bill": "Economic Growth, Tourism and Jobs Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ecg9hg_18",
        "bill": "Leave to Make Motion Without Notice (Dr Woodruff)",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "da4ley_18",
        "bill": "Suspension of Standing Orders — Censure Motion against Dean Winter MP",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "ehgqcn_18",
        "bill": "Adjournment Motion",
        "date": "2025-04-08",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 43, Tuesday 8 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "51icp2_18",
        "bill": "Budget Responsibility Motion",
        "date": "2025-04-09",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2t8j78_18",
        "bill": "Renewable Energy Projects Motion - Amendment to remove paragraph (4)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "r3e0ca_18",
        "bill": "Renewable Energy Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p4mu4i_18",
        "bill": "Documents Relating to MinterEllison, Macquarie Point Development Corporation, and Crown Law Motion - Amendment",
        "date": "2025-04-09",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "kio27h_18",
        "bill": "80:20 Co-Contribution Ratio for Regional Road and Bridge Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Transport & Infrastructure",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "a1xhwv_18",
        "bill": "Suspension of Standing Orders — Want of Confidence in Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2tt91r_18",
        "bill": "Want of Confidence in the Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "j0jt9w_18",
        "bill": "Suspension of Standing Orders — No Confidence in the Premier Motion",
        "date": "2025-05-06",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "yxgad4_18",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Suspension of Standing Orders for Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "zdie8b_18",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bmx0nl_18",
        "bill": "Macquarie Point Multipurpose Stadium Referendum Motion",
        "date": "2025-05-07",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "37lq1a_18",
        "bill": "Referral of Minister for Business, Industry and Resources to the Privileges and Conduct Committee",
        "date": "2025-05-07",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "wqdh3a_18",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Amendment to withdraw and redraft",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "pvuwi9_18",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Clause 3 Amendment (definitions of Budget papers and cash surplus)",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "fosxkb_18",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Third Reading",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "s8kqkh_18",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p2hs7z_18",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bruf7x_18",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "fhppzp_18",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "6qtg58_18",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "io8nzb_18",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "xo1ucy_18",
        "bill": "Macquarie Point Stadium Impacts Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bgi0ky_18",
        "bill": "Proposed Macquarie Point Stadium Bill Scrutiny Committee Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "wezu4j_18",
        "bill": "Charter of Budget Responsibility Amendment Bill 2025 - Amendment to Amendment (Clause 4)",
        "date": "2025-05-28",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "2f8qmf_18",
        "bill": "Macquarie Point Stadium Proposal Concerns Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "727ryo_18",
        "bill": "Want of Confidence in the Premier",
        "date": "2025-06-05",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 54, Thursday 5 June 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "0ndge6_18",
        "bill": "Want of Confidence in Government Motion",
        "date": "2025-08-19",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 1, Tuesday 19 August 2025, First Session of the Fifty-Second Parliament",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9pktvv_18",
        "bill": "Tasmanian Industries Motion",
        "date": "2025-09-10",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 3, Wednesday 10 September 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "zcy5k2_18",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "bmb9cd_18",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "ua2f5g_18",
        "bill": "Dangerous Criminals and High Risk Offenders Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "btgoen_18",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "0lats0_18",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "u8ojq5_18",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "passed",
        "inverse": false
      }
    ],
    "promises": [],
    "statements": []
  },
  {
    "id": 19,
    "name": "Kristie Johnston",
    "party": "Independent",
    "electorate": "Clark",
    "sittingDaysPresent": null,
    "sittingDaysTotal": null,
    "attendancePct": null,
    "votes": [
      {
        "id": "wki2xj_19",
        "bill": "Marine Salmon Farming Industry Motion",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "sub9zy_19",
        "bill": "Reference to Government Administration Committee A - Inquiry into Mass Salmon Mortality Events and Contributing Factors",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "7zfh2x_19",
        "bill": "Leave to Move Motion Without Notice (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ps4j4g_19",
        "bill": "Suspension of Standing Orders (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "glfka0_19",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Garland)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9ql9rt_19",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "iwrkgl_19",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 8 Amendments (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "rg4d9l_19",
        "bill": "Residential Tenancy Amendment Bill 2024 - Clause 4 Amendment (Bayley)",
        "date": "2025-04-01",
        "policyArea": "Housing & Rent",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "d2xi5c_19",
        "bill": "Asset Privatisation Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "mbbgu5_19",
        "bill": "Asset Privatisation Motion - Main Question",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": true
      },
      {
        "id": "nf46s1_19",
        "bill": "Economic Growth, Tourism and Jobs Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ecg9hg_19",
        "bill": "Leave to Make Motion Without Notice (Dr Woodruff)",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "da4ley_19",
        "bill": "Suspension of Standing Orders — Censure Motion against Dean Winter MP",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "ehgqcn_19",
        "bill": "Adjournment Motion",
        "date": "2025-04-08",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 43, Tuesday 8 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "51icp2_19",
        "bill": "Budget Responsibility Motion",
        "date": "2025-04-09",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2t8j78_19",
        "bill": "Renewable Energy Projects Motion - Amendment to remove paragraph (4)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "r3e0ca_19",
        "bill": "Renewable Energy Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p4mu4i_19",
        "bill": "Documents Relating to MinterEllison, Macquarie Point Development Corporation, and Crown Law Motion - Amendment",
        "date": "2025-04-09",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "kio27h_19",
        "bill": "80:20 Co-Contribution Ratio for Regional Road and Bridge Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Transport & Infrastructure",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "a1xhwv_19",
        "bill": "Suspension of Standing Orders — Want of Confidence in Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2tt91r_19",
        "bill": "Want of Confidence in the Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "j0jt9w_19",
        "bill": "Suspension of Standing Orders — No Confidence in the Premier Motion",
        "date": "2025-05-06",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "yxgad4_19",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Suspension of Standing Orders for Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "zdie8b_19",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bmx0nl_19",
        "bill": "Macquarie Point Multipurpose Stadium Referendum Motion",
        "date": "2025-05-07",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "37lq1a_19",
        "bill": "Referral of Minister for Business, Industry and Resources to the Privileges and Conduct Committee",
        "date": "2025-05-07",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "wqdh3a_19",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Amendment to withdraw and redraft",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "pvuwi9_19",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Clause 3 Amendment (definitions of Budget papers and cash surplus)",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "fosxkb_19",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Third Reading",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "s8kqkh_19",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p2hs7z_19",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bruf7x_19",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "fhppzp_19",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "6qtg58_19",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "io8nzb_19",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "xo1ucy_19",
        "bill": "Macquarie Point Stadium Impacts Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bgi0ky_19",
        "bill": "Proposed Macquarie Point Stadium Bill Scrutiny Committee Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "wezu4j_19",
        "bill": "Charter of Budget Responsibility Amendment Bill 2025 - Amendment to Amendment (Clause 4)",
        "date": "2025-05-28",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "2f8qmf_19",
        "bill": "Macquarie Point Stadium Proposal Concerns Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "727ryo_19",
        "bill": "Want of Confidence in the Premier",
        "date": "2025-06-05",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 54, Thursday 5 June 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "0ndge6_19",
        "bill": "Want of Confidence in Government Motion",
        "date": "2025-08-19",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 1, Tuesday 19 August 2025, First Session of the Fifty-Second Parliament",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9pktvv_19",
        "bill": "Tasmanian Industries Motion",
        "date": "2025-09-10",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 3, Wednesday 10 September 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "zcy5k2_19",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "bmb9cd_19",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "1swvft_19",
        "bill": "Public Accounts Committee Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ua2f5g_19",
        "bill": "Dangerous Criminals and High Risk Offenders Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "iuqm9v_19",
        "bill": "Referral to Parliamentary Standing Committee of Public Accounts – Amendment proposed by Mr Bayley",
        "date": "2025-09-24",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "pvbz5v_19",
        "bill": "Justice Miscellaneous (Explosives Offences) Bill 2025 – Amendments proposed by Ms Badger (suspicion to belief)",
        "date": "2025-09-24",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "i99n6n_19",
        "bill": "Parliamentary Salaries and Allowances Determination, Disallowance of",
        "date": "2025-09-25",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 7, Thursday 25 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "btgoen_19",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "0lats0_19",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "u8ojq5_19",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "passed",
        "inverse": false
      }
    ],
    "promises": [],
    "statements": []
  },
  {
    "id": 20,
    "name": "Marcus Vermey",
    "party": "Liberal",
    "electorate": "Clark",
    "sittingDaysPresent": null,
    "sittingDaysTotal": null,
    "attendancePct": null,
    "votes": [
      {
        "id": "0ndge6_20",
        "bill": "Want of Confidence in Government Motion",
        "date": "2025-08-19",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 1, Tuesday 19 August 2025, First Session of the Fifty-Second Parliament",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9pktvv_20",
        "bill": "Tasmanian Industries Motion",
        "date": "2025-09-10",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 3, Wednesday 10 September 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "zcy5k2_20",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "bmb9cd_20",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "1swvft_20",
        "bill": "Public Accounts Committee Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ua2f5g_20",
        "bill": "Dangerous Criminals and High Risk Offenders Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "iuqm9v_20",
        "bill": "Referral to Parliamentary Standing Committee of Public Accounts – Amendment proposed by Mr Bayley",
        "date": "2025-09-24",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "pvbz5v_20",
        "bill": "Justice Miscellaneous (Explosives Offences) Bill 2025 – Amendments proposed by Ms Badger (suspicion to belief)",
        "date": "2025-09-24",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "i99n6n_20",
        "bill": "Parliamentary Salaries and Allowances Determination, Disallowance of",
        "date": "2025-09-25",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 7, Thursday 25 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "btgoen_20",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "0lats0_20",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "u8ojq5_20",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "passed",
        "inverse": false
      }
    ],
    "promises": [],
    "statements": []
  },
  {
    "id": 21,
    "name": "Madeleine Ogilvie",
    "party": "Liberal",
    "electorate": "Clark",
    "sittingDaysPresent": null,
    "sittingDaysTotal": null,
    "attendancePct": null,
    "votes": [
      {
        "id": "wki2xj_21",
        "bill": "Marine Salmon Farming Industry Motion",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "sub9zy_21",
        "bill": "Reference to Government Administration Committee A - Inquiry into Mass Salmon Mortality Events and Contributing Factors",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "7zfh2x_21",
        "bill": "Leave to Move Motion Without Notice (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ps4j4g_21",
        "bill": "Suspension of Standing Orders (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "glfka0_21",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Garland)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9ql9rt_21",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "iwrkgl_21",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 8 Amendments (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "rg4d9l_21",
        "bill": "Residential Tenancy Amendment Bill 2024 - Clause 4 Amendment (Bayley)",
        "date": "2025-04-01",
        "policyArea": "Housing & Rent",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "d2xi5c_21",
        "bill": "Asset Privatisation Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "mbbgu5_21",
        "bill": "Asset Privatisation Motion - Main Question",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": true
      },
      {
        "id": "nf46s1_21",
        "bill": "Economic Growth, Tourism and Jobs Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ecg9hg_21",
        "bill": "Leave to Make Motion Without Notice (Dr Woodruff)",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "da4ley_21",
        "bill": "Suspension of Standing Orders — Censure Motion against Dean Winter MP",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "ehgqcn_21",
        "bill": "Adjournment Motion",
        "date": "2025-04-08",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 43, Tuesday 8 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "51icp2_21",
        "bill": "Budget Responsibility Motion",
        "date": "2025-04-09",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2t8j78_21",
        "bill": "Renewable Energy Projects Motion - Amendment to remove paragraph (4)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "r3e0ca_21",
        "bill": "Renewable Energy Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p4mu4i_21",
        "bill": "Documents Relating to MinterEllison, Macquarie Point Development Corporation, and Crown Law Motion - Amendment",
        "date": "2025-04-09",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "kio27h_21",
        "bill": "80:20 Co-Contribution Ratio for Regional Road and Bridge Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Transport & Infrastructure",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "a1xhwv_21",
        "bill": "Suspension of Standing Orders — Want of Confidence in Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2tt91r_21",
        "bill": "Want of Confidence in the Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "j0jt9w_21",
        "bill": "Suspension of Standing Orders — No Confidence in the Premier Motion",
        "date": "2025-05-06",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "yxgad4_21",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Suspension of Standing Orders for Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "zdie8b_21",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bmx0nl_21",
        "bill": "Macquarie Point Multipurpose Stadium Referendum Motion",
        "date": "2025-05-07",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "37lq1a_21",
        "bill": "Referral of Minister for Business, Industry and Resources to the Privileges and Conduct Committee",
        "date": "2025-05-07",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "s8kqkh_21",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p2hs7z_21",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bruf7x_21",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "fhppzp_21",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "6qtg58_21",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "io8nzb_21",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "xo1ucy_21",
        "bill": "Macquarie Point Stadium Impacts Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bgi0ky_21",
        "bill": "Proposed Macquarie Point Stadium Bill Scrutiny Committee Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "wezu4j_21",
        "bill": "Charter of Budget Responsibility Amendment Bill 2025 - Amendment to Amendment (Clause 4)",
        "date": "2025-05-28",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "2f8qmf_21",
        "bill": "Macquarie Point Stadium Proposal Concerns Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "727ryo_21",
        "bill": "Want of Confidence in the Premier",
        "date": "2025-06-05",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 54, Thursday 5 June 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "0ndge6_21",
        "bill": "Want of Confidence in Government Motion",
        "date": "2025-08-19",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 1, Tuesday 19 August 2025, First Session of the Fifty-Second Parliament",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9pktvv_21",
        "bill": "Tasmanian Industries Motion",
        "date": "2025-09-10",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 3, Wednesday 10 September 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "zcy5k2_21",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "bmb9cd_21",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "1swvft_21",
        "bill": "Public Accounts Committee Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ua2f5g_21",
        "bill": "Dangerous Criminals and High Risk Offenders Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "iuqm9v_21",
        "bill": "Referral to Parliamentary Standing Committee of Public Accounts – Amendment proposed by Mr Bayley",
        "date": "2025-09-24",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "pvbz5v_21",
        "bill": "Justice Miscellaneous (Explosives Offences) Bill 2025 – Amendments proposed by Ms Badger (suspicion to belief)",
        "date": "2025-09-24",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "i99n6n_21",
        "bill": "Parliamentary Salaries and Allowances Determination, Disallowance of",
        "date": "2025-09-25",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 7, Thursday 25 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "btgoen_21",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "0lats0_21",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "u8ojq5_21",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "passed",
        "inverse": false
      }
    ],
    "promises": [],
    "statements": []
  },
  {
    "id": 22,
    "name": "Dean Winter",
    "party": "Labor",
    "electorate": "Franklin",
    "sittingDaysPresent": null,
    "sittingDaysTotal": null,
    "attendancePct": null,
    "votes": [
      {
        "id": "wki2xj_22",
        "bill": "Marine Salmon Farming Industry Motion",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "sub9zy_22",
        "bill": "Reference to Government Administration Committee A - Inquiry into Mass Salmon Mortality Events and Contributing Factors",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "7zfh2x_22",
        "bill": "Leave to Move Motion Without Notice (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ps4j4g_22",
        "bill": "Suspension of Standing Orders (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "glfka0_22",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Garland)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9ql9rt_22",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "iwrkgl_22",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 8 Amendments (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "rg4d9l_22",
        "bill": "Residential Tenancy Amendment Bill 2024 - Clause 4 Amendment (Bayley)",
        "date": "2025-04-01",
        "policyArea": "Housing & Rent",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "d2xi5c_22",
        "bill": "Asset Privatisation Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "mbbgu5_22",
        "bill": "Asset Privatisation Motion - Main Question",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": true
      },
      {
        "id": "nf46s1_22",
        "bill": "Economic Growth, Tourism and Jobs Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ecg9hg_22",
        "bill": "Leave to Make Motion Without Notice (Dr Woodruff)",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "da4ley_22",
        "bill": "Suspension of Standing Orders — Censure Motion against Dean Winter MP",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "ehgqcn_22",
        "bill": "Adjournment Motion",
        "date": "2025-04-08",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 43, Tuesday 8 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "51icp2_22",
        "bill": "Budget Responsibility Motion",
        "date": "2025-04-09",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2t8j78_22",
        "bill": "Renewable Energy Projects Motion - Amendment to remove paragraph (4)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "r3e0ca_22",
        "bill": "Renewable Energy Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p4mu4i_22",
        "bill": "Documents Relating to MinterEllison, Macquarie Point Development Corporation, and Crown Law Motion - Amendment",
        "date": "2025-04-09",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "kio27h_22",
        "bill": "80:20 Co-Contribution Ratio for Regional Road and Bridge Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Transport & Infrastructure",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "a1xhwv_22",
        "bill": "Suspension of Standing Orders — Want of Confidence in Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2tt91r_22",
        "bill": "Want of Confidence in the Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "j0jt9w_22",
        "bill": "Suspension of Standing Orders — No Confidence in the Premier Motion",
        "date": "2025-05-06",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "yxgad4_22",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Suspension of Standing Orders for Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "zdie8b_22",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bmx0nl_22",
        "bill": "Macquarie Point Multipurpose Stadium Referendum Motion",
        "date": "2025-05-07",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "37lq1a_22",
        "bill": "Referral of Minister for Business, Industry and Resources to the Privileges and Conduct Committee",
        "date": "2025-05-07",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "wqdh3a_22",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Amendment to withdraw and redraft",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "pvuwi9_22",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Clause 3 Amendment (definitions of Budget papers and cash surplus)",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "fosxkb_22",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Third Reading",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "s8kqkh_22",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p2hs7z_22",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bruf7x_22",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "fhppzp_22",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "6qtg58_22",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "io8nzb_22",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "xo1ucy_22",
        "bill": "Macquarie Point Stadium Impacts Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bgi0ky_22",
        "bill": "Proposed Macquarie Point Stadium Bill Scrutiny Committee Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "wezu4j_22",
        "bill": "Charter of Budget Responsibility Amendment Bill 2025 - Amendment to Amendment (Clause 4)",
        "date": "2025-05-28",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "2f8qmf_22",
        "bill": "Macquarie Point Stadium Proposal Concerns Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "727ryo_22",
        "bill": "Want of Confidence in the Premier",
        "date": "2025-06-05",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 54, Thursday 5 June 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "0ndge6_22",
        "bill": "Want of Confidence in Government Motion",
        "date": "2025-08-19",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 1, Tuesday 19 August 2025, First Session of the Fifty-Second Parliament",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "zcy5k2_22",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "bmb9cd_22",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "1swvft_22",
        "bill": "Public Accounts Committee Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ua2f5g_22",
        "bill": "Dangerous Criminals and High Risk Offenders Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "iuqm9v_22",
        "bill": "Referral to Parliamentary Standing Committee of Public Accounts – Amendment proposed by Mr Bayley",
        "date": "2025-09-24",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "pvbz5v_22",
        "bill": "Justice Miscellaneous (Explosives Offences) Bill 2025 – Amendments proposed by Ms Badger (suspicion to belief)",
        "date": "2025-09-24",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "i99n6n_22",
        "bill": "Parliamentary Salaries and Allowances Determination, Disallowance of",
        "date": "2025-09-25",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 7, Thursday 25 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "btgoen_22",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "0lats0_22",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "u8ojq5_22",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "passed",
        "inverse": false
      }
    ],
    "promises": [],
    "statements": []
  },
  {
    "id": 23,
    "name": "Meg Brown",
    "party": "Labor",
    "electorate": "Franklin",
    "sittingDaysPresent": null,
    "sittingDaysTotal": null,
    "attendancePct": null,
    "votes": [
      {
        "id": "wki2xj_23",
        "bill": "Marine Salmon Farming Industry Motion",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "sub9zy_23",
        "bill": "Reference to Government Administration Committee A - Inquiry into Mass Salmon Mortality Events and Contributing Factors",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "7zfh2x_23",
        "bill": "Leave to Move Motion Without Notice (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ps4j4g_23",
        "bill": "Suspension of Standing Orders (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "glfka0_23",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Garland)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9ql9rt_23",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "iwrkgl_23",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 8 Amendments (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "rg4d9l_23",
        "bill": "Residential Tenancy Amendment Bill 2024 - Clause 4 Amendment (Bayley)",
        "date": "2025-04-01",
        "policyArea": "Housing & Rent",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "d2xi5c_23",
        "bill": "Asset Privatisation Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "mbbgu5_23",
        "bill": "Asset Privatisation Motion - Main Question",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": true
      },
      {
        "id": "nf46s1_23",
        "bill": "Economic Growth, Tourism and Jobs Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ecg9hg_23",
        "bill": "Leave to Make Motion Without Notice (Dr Woodruff)",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "da4ley_23",
        "bill": "Suspension of Standing Orders — Censure Motion against Dean Winter MP",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "ehgqcn_23",
        "bill": "Adjournment Motion",
        "date": "2025-04-08",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 43, Tuesday 8 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "51icp2_23",
        "bill": "Budget Responsibility Motion",
        "date": "2025-04-09",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2t8j78_23",
        "bill": "Renewable Energy Projects Motion - Amendment to remove paragraph (4)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "r3e0ca_23",
        "bill": "Renewable Energy Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p4mu4i_23",
        "bill": "Documents Relating to MinterEllison, Macquarie Point Development Corporation, and Crown Law Motion - Amendment",
        "date": "2025-04-09",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "kio27h_23",
        "bill": "80:20 Co-Contribution Ratio for Regional Road and Bridge Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Transport & Infrastructure",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "a1xhwv_23",
        "bill": "Suspension of Standing Orders — Want of Confidence in Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2tt91r_23",
        "bill": "Want of Confidence in the Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "j0jt9w_23",
        "bill": "Suspension of Standing Orders — No Confidence in the Premier Motion",
        "date": "2025-05-06",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "yxgad4_23",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Suspension of Standing Orders for Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "zdie8b_23",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bmx0nl_23",
        "bill": "Macquarie Point Multipurpose Stadium Referendum Motion",
        "date": "2025-05-07",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "37lq1a_23",
        "bill": "Referral of Minister for Business, Industry and Resources to the Privileges and Conduct Committee",
        "date": "2025-05-07",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "wqdh3a_23",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Amendment to withdraw and redraft",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "pvuwi9_23",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Clause 3 Amendment (definitions of Budget papers and cash surplus)",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "fosxkb_23",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Third Reading",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "s8kqkh_23",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p2hs7z_23",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "xo1ucy_23",
        "bill": "Macquarie Point Stadium Impacts Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bgi0ky_23",
        "bill": "Proposed Macquarie Point Stadium Bill Scrutiny Committee Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "wezu4j_23",
        "bill": "Charter of Budget Responsibility Amendment Bill 2025 - Amendment to Amendment (Clause 4)",
        "date": "2025-05-28",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "2f8qmf_23",
        "bill": "Macquarie Point Stadium Proposal Concerns Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "727ryo_23",
        "bill": "Want of Confidence in the Premier",
        "date": "2025-06-05",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 54, Thursday 5 June 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "0ndge6_23",
        "bill": "Want of Confidence in Government Motion",
        "date": "2025-08-19",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 1, Tuesday 19 August 2025, First Session of the Fifty-Second Parliament",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9pktvv_23",
        "bill": "Tasmanian Industries Motion",
        "date": "2025-09-10",
        "policyArea": "Agriculture & Fishing",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 3, Wednesday 10 September 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "zcy5k2_23",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "bmb9cd_23",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "1swvft_23",
        "bill": "Public Accounts Committee Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ua2f5g_23",
        "bill": "Dangerous Criminals and High Risk Offenders Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "iuqm9v_23",
        "bill": "Referral to Parliamentary Standing Committee of Public Accounts – Amendment proposed by Mr Bayley",
        "date": "2025-09-24",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "pvbz5v_23",
        "bill": "Justice Miscellaneous (Explosives Offences) Bill 2025 – Amendments proposed by Ms Badger (suspicion to belief)",
        "date": "2025-09-24",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "i99n6n_23",
        "bill": "Parliamentary Salaries and Allowances Determination, Disallowance of",
        "date": "2025-09-25",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 7, Thursday 25 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "btgoen_23",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "0lats0_23",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "u8ojq5_23",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "passed",
        "inverse": false
      }
    ],
    "promises": [],
    "statements": []
  },
  {
    "id": 24,
    "name": "Rosalie Woodruff",
    "party": "Greens",
    "electorate": "Franklin",
    "sittingDaysPresent": null,
    "sittingDaysTotal": null,
    "attendancePct": null,
    "votes": [
      {
        "id": "wki2xj_24",
        "bill": "Marine Salmon Farming Industry Motion",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "sub9zy_24",
        "bill": "Reference to Government Administration Committee A - Inquiry into Mass Salmon Mortality Events and Contributing Factors",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "7zfh2x_24",
        "bill": "Leave to Move Motion Without Notice (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ps4j4g_24",
        "bill": "Suspension of Standing Orders (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "glfka0_24",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Garland)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9ql9rt_24",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "iwrkgl_24",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 8 Amendments (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "rg4d9l_24",
        "bill": "Residential Tenancy Amendment Bill 2024 - Clause 4 Amendment (Bayley)",
        "date": "2025-04-01",
        "policyArea": "Housing & Rent",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "d2xi5c_24",
        "bill": "Asset Privatisation Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "mbbgu5_24",
        "bill": "Asset Privatisation Motion - Main Question",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": true
      },
      {
        "id": "nf46s1_24",
        "bill": "Economic Growth, Tourism and Jobs Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ecg9hg_24",
        "bill": "Leave to Make Motion Without Notice (Dr Woodruff)",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "da4ley_24",
        "bill": "Suspension of Standing Orders — Censure Motion against Dean Winter MP",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "ehgqcn_24",
        "bill": "Adjournment Motion",
        "date": "2025-04-08",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 43, Tuesday 8 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "51icp2_24",
        "bill": "Budget Responsibility Motion",
        "date": "2025-04-09",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2t8j78_24",
        "bill": "Renewable Energy Projects Motion - Amendment to remove paragraph (4)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "r3e0ca_24",
        "bill": "Renewable Energy Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p4mu4i_24",
        "bill": "Documents Relating to MinterEllison, Macquarie Point Development Corporation, and Crown Law Motion - Amendment",
        "date": "2025-04-09",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "kio27h_24",
        "bill": "80:20 Co-Contribution Ratio for Regional Road and Bridge Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Transport & Infrastructure",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "a1xhwv_24",
        "bill": "Suspension of Standing Orders — Want of Confidence in Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2tt91r_24",
        "bill": "Want of Confidence in the Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "j0jt9w_24",
        "bill": "Suspension of Standing Orders — No Confidence in the Premier Motion",
        "date": "2025-05-06",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "yxgad4_24",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Suspension of Standing Orders for Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "zdie8b_24",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bmx0nl_24",
        "bill": "Macquarie Point Multipurpose Stadium Referendum Motion",
        "date": "2025-05-07",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "37lq1a_24",
        "bill": "Referral of Minister for Business, Industry and Resources to the Privileges and Conduct Committee",
        "date": "2025-05-07",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "wqdh3a_24",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Amendment to withdraw and redraft",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "pvuwi9_24",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Clause 3 Amendment (definitions of Budget papers and cash surplus)",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "fosxkb_24",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Third Reading",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "s8kqkh_24",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p2hs7z_24",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bruf7x_24",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "fhppzp_24",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "6qtg58_24",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "io8nzb_24",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "xo1ucy_24",
        "bill": "Macquarie Point Stadium Impacts Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bgi0ky_24",
        "bill": "Proposed Macquarie Point Stadium Bill Scrutiny Committee Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "wezu4j_24",
        "bill": "Charter of Budget Responsibility Amendment Bill 2025 - Amendment to Amendment (Clause 4)",
        "date": "2025-05-28",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "2f8qmf_24",
        "bill": "Macquarie Point Stadium Proposal Concerns Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "727ryo_24",
        "bill": "Want of Confidence in the Premier",
        "date": "2025-06-05",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 54, Thursday 5 June 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "0ndge6_24",
        "bill": "Want of Confidence in Government Motion",
        "date": "2025-08-19",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 1, Tuesday 19 August 2025, First Session of the Fifty-Second Parliament",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9pktvv_24",
        "bill": "Tasmanian Industries Motion",
        "date": "2025-09-10",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 3, Wednesday 10 September 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "zcy5k2_24",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "bmb9cd_24",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "1swvft_24",
        "bill": "Public Accounts Committee Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ua2f5g_24",
        "bill": "Dangerous Criminals and High Risk Offenders Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "iuqm9v_24",
        "bill": "Referral to Parliamentary Standing Committee of Public Accounts – Amendment proposed by Mr Bayley",
        "date": "2025-09-24",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "pvbz5v_24",
        "bill": "Justice Miscellaneous (Explosives Offences) Bill 2025 – Amendments proposed by Ms Badger (suspicion to belief)",
        "date": "2025-09-24",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "i99n6n_24",
        "bill": "Parliamentary Salaries and Allowances Determination, Disallowance of",
        "date": "2025-09-25",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 7, Thursday 25 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "btgoen_24",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "0lats0_24",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "u8ojq5_24",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "passed",
        "inverse": false
      }
    ],
    "promises": [],
    "statements": []
  },
  {
    "id": 25,
    "name": "David O'Byrne",
    "party": "Independent",
    "electorate": "Franklin",
    "sittingDaysPresent": null,
    "sittingDaysTotal": null,
    "attendancePct": null,
    "votes": [
      {
        "id": "wki2xj_25",
        "bill": "Marine Salmon Farming Industry Motion",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "sub9zy_25",
        "bill": "Reference to Government Administration Committee A - Inquiry into Mass Salmon Mortality Events and Contributing Factors",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "7zfh2x_25",
        "bill": "Leave to Move Motion Without Notice (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ps4j4g_25",
        "bill": "Suspension of Standing Orders (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "glfka0_25",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Garland)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9ql9rt_25",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "iwrkgl_25",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 8 Amendments (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "rg4d9l_25",
        "bill": "Residential Tenancy Amendment Bill 2024 - Clause 4 Amendment (Bayley)",
        "date": "2025-04-01",
        "policyArea": "Housing & Rent",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "d2xi5c_25",
        "bill": "Asset Privatisation Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "mbbgu5_25",
        "bill": "Asset Privatisation Motion - Main Question",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": true
      },
      {
        "id": "nf46s1_25",
        "bill": "Economic Growth, Tourism and Jobs Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ecg9hg_25",
        "bill": "Leave to Make Motion Without Notice (Dr Woodruff)",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "da4ley_25",
        "bill": "Suspension of Standing Orders — Censure Motion against Dean Winter MP",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "ehgqcn_25",
        "bill": "Adjournment Motion",
        "date": "2025-04-08",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 43, Tuesday 8 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "51icp2_25",
        "bill": "Budget Responsibility Motion",
        "date": "2025-04-09",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2t8j78_25",
        "bill": "Renewable Energy Projects Motion - Amendment to remove paragraph (4)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "r3e0ca_25",
        "bill": "Renewable Energy Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p4mu4i_25",
        "bill": "Documents Relating to MinterEllison, Macquarie Point Development Corporation, and Crown Law Motion - Amendment",
        "date": "2025-04-09",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "kio27h_25",
        "bill": "80:20 Co-Contribution Ratio for Regional Road and Bridge Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Transport & Infrastructure",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "a1xhwv_25",
        "bill": "Suspension of Standing Orders — Want of Confidence in Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2tt91r_25",
        "bill": "Want of Confidence in the Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "j0jt9w_25",
        "bill": "Suspension of Standing Orders — No Confidence in the Premier Motion",
        "date": "2025-05-06",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "yxgad4_25",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Suspension of Standing Orders for Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "zdie8b_25",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bmx0nl_25",
        "bill": "Macquarie Point Multipurpose Stadium Referendum Motion",
        "date": "2025-05-07",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "37lq1a_25",
        "bill": "Referral of Minister for Business, Industry and Resources to the Privileges and Conduct Committee",
        "date": "2025-05-07",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "wqdh3a_25",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Amendment to withdraw and redraft",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "pvuwi9_25",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Clause 3 Amendment (definitions of Budget papers and cash surplus)",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "fosxkb_25",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Third Reading",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "s8kqkh_25",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p2hs7z_25",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bruf7x_25",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "fhppzp_25",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "6qtg58_25",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "io8nzb_25",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "xo1ucy_25",
        "bill": "Macquarie Point Stadium Impacts Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bgi0ky_25",
        "bill": "Proposed Macquarie Point Stadium Bill Scrutiny Committee Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "wezu4j_25",
        "bill": "Charter of Budget Responsibility Amendment Bill 2025 - Amendment to Amendment (Clause 4)",
        "date": "2025-05-28",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "2f8qmf_25",
        "bill": "Macquarie Point Stadium Proposal Concerns Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "727ryo_25",
        "bill": "Want of Confidence in the Premier",
        "date": "2025-06-05",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 54, Thursday 5 June 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "0ndge6_25",
        "bill": "Want of Confidence in Government Motion",
        "date": "2025-08-19",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 1, Tuesday 19 August 2025, First Session of the Fifty-Second Parliament",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9pktvv_25",
        "bill": "Tasmanian Industries Motion",
        "date": "2025-09-10",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 3, Wednesday 10 September 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "zcy5k2_25",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "bmb9cd_25",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "1swvft_25",
        "bill": "Public Accounts Committee Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ua2f5g_25",
        "bill": "Dangerous Criminals and High Risk Offenders Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "iuqm9v_25",
        "bill": "Referral to Parliamentary Standing Committee of Public Accounts – Amendment proposed by Mr Bayley",
        "date": "2025-09-24",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "pvbz5v_25",
        "bill": "Justice Miscellaneous (Explosives Offences) Bill 2025 – Amendments proposed by Ms Badger (suspicion to belief)",
        "date": "2025-09-24",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "i99n6n_25",
        "bill": "Parliamentary Salaries and Allowances Determination, Disallowance of",
        "date": "2025-09-25",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 7, Thursday 25 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "btgoen_25",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "0lats0_25",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "u8ojq5_25",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "passed",
        "inverse": false
      }
    ],
    "promises": [],
    "statements": []
  },
  {
    "id": 26,
    "name": "Peter George",
    "party": "Independent",
    "electorate": "Franklin",
    "sittingDaysPresent": null,
    "sittingDaysTotal": null,
    "attendancePct": null,
    "votes": [
      {
        "id": "0ndge6_26",
        "bill": "Want of Confidence in Government Motion",
        "date": "2025-08-19",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 1, Tuesday 19 August 2025, First Session of the Fifty-Second Parliament",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9pktvv_26",
        "bill": "Tasmanian Industries Motion",
        "date": "2025-09-10",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 3, Wednesday 10 September 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "zcy5k2_26",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "bmb9cd_26",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "1swvft_26",
        "bill": "Public Accounts Committee Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ua2f5g_26",
        "bill": "Dangerous Criminals and High Risk Offenders Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "iuqm9v_26",
        "bill": "Referral to Parliamentary Standing Committee of Public Accounts – Amendment proposed by Mr Bayley",
        "date": "2025-09-24",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "pvbz5v_26",
        "bill": "Justice Miscellaneous (Explosives Offences) Bill 2025 – Amendments proposed by Ms Badger (suspicion to belief)",
        "date": "2025-09-24",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "i99n6n_26",
        "bill": "Parliamentary Salaries and Allowances Determination, Disallowance of",
        "date": "2025-09-25",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 7, Thursday 25 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "btgoen_26",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "0lats0_26",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "u8ojq5_26",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "passed",
        "inverse": false
      }
    ],
    "promises": [],
    "statements": []
  },
  {
    "id": 27,
    "name": "Eric Abetz",
    "party": "Liberal",
    "electorate": "Franklin",
    "sittingDaysPresent": null,
    "sittingDaysTotal": null,
    "attendancePct": null,
    "votes": [
      {
        "id": "wki2xj_27",
        "bill": "Marine Salmon Farming Industry Motion",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "sub9zy_27",
        "bill": "Reference to Government Administration Committee A - Inquiry into Mass Salmon Mortality Events and Contributing Factors",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "7zfh2x_27",
        "bill": "Leave to Move Motion Without Notice (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ps4j4g_27",
        "bill": "Suspension of Standing Orders (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "glfka0_27",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Garland)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9ql9rt_27",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "iwrkgl_27",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 8 Amendments (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "rg4d9l_27",
        "bill": "Residential Tenancy Amendment Bill 2024 - Clause 4 Amendment (Bayley)",
        "date": "2025-04-01",
        "policyArea": "Housing & Rent",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "d2xi5c_27",
        "bill": "Asset Privatisation Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "mbbgu5_27",
        "bill": "Asset Privatisation Motion - Main Question",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": true
      },
      {
        "id": "nf46s1_27",
        "bill": "Economic Growth, Tourism and Jobs Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ecg9hg_27",
        "bill": "Leave to Make Motion Without Notice (Dr Woodruff)",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "da4ley_27",
        "bill": "Suspension of Standing Orders — Censure Motion against Dean Winter MP",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "ehgqcn_27",
        "bill": "Adjournment Motion",
        "date": "2025-04-08",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 43, Tuesday 8 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "51icp2_27",
        "bill": "Budget Responsibility Motion",
        "date": "2025-04-09",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2t8j78_27",
        "bill": "Renewable Energy Projects Motion - Amendment to remove paragraph (4)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "r3e0ca_27",
        "bill": "Renewable Energy Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p4mu4i_27",
        "bill": "Documents Relating to MinterEllison, Macquarie Point Development Corporation, and Crown Law Motion - Amendment",
        "date": "2025-04-09",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "kio27h_27",
        "bill": "80:20 Co-Contribution Ratio for Regional Road and Bridge Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Transport & Infrastructure",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "a1xhwv_27",
        "bill": "Suspension of Standing Orders — Want of Confidence in Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2tt91r_27",
        "bill": "Want of Confidence in the Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "j0jt9w_27",
        "bill": "Suspension of Standing Orders — No Confidence in the Premier Motion",
        "date": "2025-05-06",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "yxgad4_27",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Suspension of Standing Orders for Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "zdie8b_27",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bmx0nl_27",
        "bill": "Macquarie Point Multipurpose Stadium Referendum Motion",
        "date": "2025-05-07",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "37lq1a_27",
        "bill": "Referral of Minister for Business, Industry and Resources to the Privileges and Conduct Committee",
        "date": "2025-05-07",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "wqdh3a_27",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Amendment to withdraw and redraft",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "pvuwi9_27",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Clause 3 Amendment (definitions of Budget papers and cash surplus)",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "fosxkb_27",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Third Reading",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "s8kqkh_27",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p2hs7z_27",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bruf7x_27",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "fhppzp_27",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "6qtg58_27",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "io8nzb_27",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "xo1ucy_27",
        "bill": "Macquarie Point Stadium Impacts Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bgi0ky_27",
        "bill": "Proposed Macquarie Point Stadium Bill Scrutiny Committee Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "wezu4j_27",
        "bill": "Charter of Budget Responsibility Amendment Bill 2025 - Amendment to Amendment (Clause 4)",
        "date": "2025-05-28",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "2f8qmf_27",
        "bill": "Macquarie Point Stadium Proposal Concerns Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "727ryo_27",
        "bill": "Want of Confidence in the Premier",
        "date": "2025-06-05",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 54, Thursday 5 June 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "0ndge6_27",
        "bill": "Want of Confidence in Government Motion",
        "date": "2025-08-19",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 1, Tuesday 19 August 2025, First Session of the Fifty-Second Parliament",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9pktvv_27",
        "bill": "Tasmanian Industries Motion",
        "date": "2025-09-10",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 3, Wednesday 10 September 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "zcy5k2_27",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "bmb9cd_27",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "1swvft_27",
        "bill": "Public Accounts Committee Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ua2f5g_27",
        "bill": "Dangerous Criminals and High Risk Offenders Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "iuqm9v_27",
        "bill": "Referral to Parliamentary Standing Committee of Public Accounts – Amendment proposed by Mr Bayley",
        "date": "2025-09-24",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "pvbz5v_27",
        "bill": "Justice Miscellaneous (Explosives Offences) Bill 2025 – Amendments proposed by Ms Badger (suspicion to belief)",
        "date": "2025-09-24",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "i99n6n_27",
        "bill": "Parliamentary Salaries and Allowances Determination, Disallowance of",
        "date": "2025-09-25",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 7, Thursday 25 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "btgoen_27",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "0lats0_27",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "u8ojq5_27",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "passed",
        "inverse": false
      }
    ],
    "promises": [],
    "statements": []
  },
  {
    "id": 28,
    "name": "Jacquie Petrusma",
    "party": "Liberal",
    "electorate": "Franklin",
    "sittingDaysPresent": null,
    "sittingDaysTotal": null,
    "attendancePct": null,
    "votes": [
      {
        "id": "wki2xj_28",
        "bill": "Marine Salmon Farming Industry Motion",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "sub9zy_28",
        "bill": "Reference to Government Administration Committee A - Inquiry into Mass Salmon Mortality Events and Contributing Factors",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "7zfh2x_28",
        "bill": "Leave to Move Motion Without Notice (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ps4j4g_28",
        "bill": "Suspension of Standing Orders (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "glfka0_28",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Garland)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9ql9rt_28",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "iwrkgl_28",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 8 Amendments (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "rg4d9l_28",
        "bill": "Residential Tenancy Amendment Bill 2024 - Clause 4 Amendment (Bayley)",
        "date": "2025-04-01",
        "policyArea": "Housing & Rent",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "d2xi5c_28",
        "bill": "Asset Privatisation Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "mbbgu5_28",
        "bill": "Asset Privatisation Motion - Main Question",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": true
      },
      {
        "id": "nf46s1_28",
        "bill": "Economic Growth, Tourism and Jobs Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ecg9hg_28",
        "bill": "Leave to Make Motion Without Notice (Dr Woodruff)",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "da4ley_28",
        "bill": "Suspension of Standing Orders — Censure Motion against Dean Winter MP",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "ehgqcn_28",
        "bill": "Adjournment Motion",
        "date": "2025-04-08",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 43, Tuesday 8 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "51icp2_28",
        "bill": "Budget Responsibility Motion",
        "date": "2025-04-09",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p4mu4i_28",
        "bill": "Documents Relating to MinterEllison, Macquarie Point Development Corporation, and Crown Law Motion - Amendment",
        "date": "2025-04-09",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "kio27h_28",
        "bill": "80:20 Co-Contribution Ratio for Regional Road and Bridge Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Transport & Infrastructure",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "a1xhwv_28",
        "bill": "Suspension of Standing Orders — Want of Confidence in Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2tt91r_28",
        "bill": "Want of Confidence in the Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "j0jt9w_28",
        "bill": "Suspension of Standing Orders — No Confidence in the Premier Motion",
        "date": "2025-05-06",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "yxgad4_28",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Suspension of Standing Orders for Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "zdie8b_28",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bmx0nl_28",
        "bill": "Macquarie Point Multipurpose Stadium Referendum Motion",
        "date": "2025-05-07",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "37lq1a_28",
        "bill": "Referral of Minister for Business, Industry and Resources to the Privileges and Conduct Committee",
        "date": "2025-05-07",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "wqdh3a_28",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Amendment to withdraw and redraft",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "pvuwi9_28",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Clause 3 Amendment (definitions of Budget papers and cash surplus)",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "fosxkb_28",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Third Reading",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "s8kqkh_28",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p2hs7z_28",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bruf7x_28",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "fhppzp_28",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "6qtg58_28",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "io8nzb_28",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "xo1ucy_28",
        "bill": "Macquarie Point Stadium Impacts Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bgi0ky_28",
        "bill": "Proposed Macquarie Point Stadium Bill Scrutiny Committee Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "wezu4j_28",
        "bill": "Charter of Budget Responsibility Amendment Bill 2025 - Amendment to Amendment (Clause 4)",
        "date": "2025-05-28",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "2f8qmf_28",
        "bill": "Macquarie Point Stadium Proposal Concerns Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "727ryo_28",
        "bill": "Want of Confidence in the Premier",
        "date": "2025-06-05",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 54, Thursday 5 June 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "1swvft_28",
        "bill": "Public Accounts Committee Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ua2f5g_28",
        "bill": "Dangerous Criminals and High Risk Offenders Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "pvbz5v_28",
        "bill": "Justice Miscellaneous (Explosives Offences) Bill 2025 – Amendments proposed by Ms Badger (suspicion to belief)",
        "date": "2025-09-24",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "btgoen_28",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "0lats0_28",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "u8ojq5_28",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "passed",
        "inverse": false
      }
    ],
    "promises": [],
    "statements": []
  },
  {
    "id": 29,
    "name": "Jen Butler",
    "party": "Labor",
    "electorate": "Lyons",
    "sittingDaysPresent": null,
    "sittingDaysTotal": null,
    "attendancePct": null,
    "votes": [
      {
        "id": "glfka0_29",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Garland)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9ql9rt_29",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "iwrkgl_29",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 8 Amendments (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "rg4d9l_29",
        "bill": "Residential Tenancy Amendment Bill 2024 - Clause 4 Amendment (Bayley)",
        "date": "2025-04-01",
        "policyArea": "Housing & Rent",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "nf46s1_29",
        "bill": "Economic Growth, Tourism and Jobs Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ecg9hg_29",
        "bill": "Leave to Make Motion Without Notice (Dr Woodruff)",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "da4ley_29",
        "bill": "Suspension of Standing Orders — Censure Motion against Dean Winter MP",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "51icp2_29",
        "bill": "Budget Responsibility Motion",
        "date": "2025-04-09",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "kio27h_29",
        "bill": "80:20 Co-Contribution Ratio for Regional Road and Bridge Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Transport & Infrastructure",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "j0jt9w_29",
        "bill": "Suspension of Standing Orders — No Confidence in the Premier Motion",
        "date": "2025-05-06",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "yxgad4_29",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Suspension of Standing Orders for Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "zdie8b_29",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bmx0nl_29",
        "bill": "Macquarie Point Multipurpose Stadium Referendum Motion",
        "date": "2025-05-07",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "wqdh3a_29",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Amendment to withdraw and redraft",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "pvuwi9_29",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Clause 3 Amendment (definitions of Budget papers and cash surplus)",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "fosxkb_29",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Third Reading",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "s8kqkh_29",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p2hs7z_29",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bruf7x_29",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "fhppzp_29",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "6qtg58_29",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "io8nzb_29",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "xo1ucy_29",
        "bill": "Macquarie Point Stadium Impacts Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "wezu4j_29",
        "bill": "Charter of Budget Responsibility Amendment Bill 2025 - Amendment to Amendment (Clause 4)",
        "date": "2025-05-28",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "2f8qmf_29",
        "bill": "Macquarie Point Stadium Proposal Concerns Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "727ryo_29",
        "bill": "Want of Confidence in the Premier",
        "date": "2025-06-05",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 54, Thursday 5 June 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "0ndge6_29",
        "bill": "Want of Confidence in Government Motion",
        "date": "2025-08-19",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 1, Tuesday 19 August 2025, First Session of the Fifty-Second Parliament",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9pktvv_29",
        "bill": "Tasmanian Industries Motion",
        "date": "2025-09-10",
        "policyArea": "Agriculture & Fishing",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 3, Wednesday 10 September 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "zcy5k2_29",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "bmb9cd_29",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "1swvft_29",
        "bill": "Public Accounts Committee Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ua2f5g_29",
        "bill": "Dangerous Criminals and High Risk Offenders Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "iuqm9v_29",
        "bill": "Referral to Parliamentary Standing Committee of Public Accounts – Amendment proposed by Mr Bayley",
        "date": "2025-09-24",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "pvbz5v_29",
        "bill": "Justice Miscellaneous (Explosives Offences) Bill 2025 – Amendments proposed by Ms Badger (suspicion to belief)",
        "date": "2025-09-24",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "i99n6n_29",
        "bill": "Parliamentary Salaries and Allowances Determination, Disallowance of",
        "date": "2025-09-25",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 7, Thursday 25 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "btgoen_29",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "0lats0_29",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "u8ojq5_29",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "passed",
        "inverse": false
      }
    ],
    "promises": [],
    "statements": []
  },
  {
    "id": 30,
    "name": "Brian Mitchell",
    "party": "Labor",
    "electorate": "Lyons",
    "sittingDaysPresent": null,
    "sittingDaysTotal": null,
    "attendancePct": null,
    "votes": [
      {
        "id": "0ndge6_30",
        "bill": "Want of Confidence in Government Motion",
        "date": "2025-08-19",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 1, Tuesday 19 August 2025, First Session of the Fifty-Second Parliament",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9pktvv_30",
        "bill": "Tasmanian Industries Motion",
        "date": "2025-09-10",
        "policyArea": "Agriculture & Fishing",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 3, Wednesday 10 September 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "1swvft_30",
        "bill": "Public Accounts Committee Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ua2f5g_30",
        "bill": "Dangerous Criminals and High Risk Offenders Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "iuqm9v_30",
        "bill": "Referral to Parliamentary Standing Committee of Public Accounts – Amendment proposed by Mr Bayley",
        "date": "2025-09-24",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "pvbz5v_30",
        "bill": "Justice Miscellaneous (Explosives Offences) Bill 2025 – Amendments proposed by Ms Badger (suspicion to belief)",
        "date": "2025-09-24",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "i99n6n_30",
        "bill": "Parliamentary Salaries and Allowances Determination, Disallowance of",
        "date": "2025-09-25",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 7, Thursday 25 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      }
    ],
    "promises": [],
    "statements": []
  },
  {
    "id": 31,
    "name": "Tabatha Badger",
    "party": "Greens",
    "electorate": "Lyons",
    "sittingDaysPresent": null,
    "sittingDaysTotal": null,
    "attendancePct": null,
    "votes": [
      {
        "id": "wki2xj_31",
        "bill": "Marine Salmon Farming Industry Motion",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "sub9zy_31",
        "bill": "Reference to Government Administration Committee A - Inquiry into Mass Salmon Mortality Events and Contributing Factors",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "7zfh2x_31",
        "bill": "Leave to Move Motion Without Notice (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ps4j4g_31",
        "bill": "Suspension of Standing Orders (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "glfka0_31",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Garland)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9ql9rt_31",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "iwrkgl_31",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 8 Amendments (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "rg4d9l_31",
        "bill": "Residential Tenancy Amendment Bill 2024 - Clause 4 Amendment (Bayley)",
        "date": "2025-04-01",
        "policyArea": "Housing & Rent",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "d2xi5c_31",
        "bill": "Asset Privatisation Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "mbbgu5_31",
        "bill": "Asset Privatisation Motion - Main Question",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": true
      },
      {
        "id": "nf46s1_31",
        "bill": "Economic Growth, Tourism and Jobs Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ecg9hg_31",
        "bill": "Leave to Make Motion Without Notice (Dr Woodruff)",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "da4ley_31",
        "bill": "Suspension of Standing Orders — Censure Motion against Dean Winter MP",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "ehgqcn_31",
        "bill": "Adjournment Motion",
        "date": "2025-04-08",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 43, Tuesday 8 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "51icp2_31",
        "bill": "Budget Responsibility Motion",
        "date": "2025-04-09",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2t8j78_31",
        "bill": "Renewable Energy Projects Motion - Amendment to remove paragraph (4)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "r3e0ca_31",
        "bill": "Renewable Energy Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p4mu4i_31",
        "bill": "Documents Relating to MinterEllison, Macquarie Point Development Corporation, and Crown Law Motion - Amendment",
        "date": "2025-04-09",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "kio27h_31",
        "bill": "80:20 Co-Contribution Ratio for Regional Road and Bridge Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Transport & Infrastructure",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "a1xhwv_31",
        "bill": "Suspension of Standing Orders — Want of Confidence in Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2tt91r_31",
        "bill": "Want of Confidence in the Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "j0jt9w_31",
        "bill": "Suspension of Standing Orders — No Confidence in the Premier Motion",
        "date": "2025-05-06",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "yxgad4_31",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Suspension of Standing Orders for Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "zdie8b_31",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bmx0nl_31",
        "bill": "Macquarie Point Multipurpose Stadium Referendum Motion",
        "date": "2025-05-07",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "37lq1a_31",
        "bill": "Referral of Minister for Business, Industry and Resources to the Privileges and Conduct Committee",
        "date": "2025-05-07",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "wqdh3a_31",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Amendment to withdraw and redraft",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "pvuwi9_31",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Clause 3 Amendment (definitions of Budget papers and cash surplus)",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "fosxkb_31",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Third Reading",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "s8kqkh_31",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p2hs7z_31",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bruf7x_31",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "fhppzp_31",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "6qtg58_31",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "io8nzb_31",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "xo1ucy_31",
        "bill": "Macquarie Point Stadium Impacts Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bgi0ky_31",
        "bill": "Proposed Macquarie Point Stadium Bill Scrutiny Committee Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "wezu4j_31",
        "bill": "Charter of Budget Responsibility Amendment Bill 2025 - Amendment to Amendment (Clause 4)",
        "date": "2025-05-28",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "2f8qmf_31",
        "bill": "Macquarie Point Stadium Proposal Concerns Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "727ryo_31",
        "bill": "Want of Confidence in the Premier",
        "date": "2025-06-05",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 54, Thursday 5 June 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "0ndge6_31",
        "bill": "Want of Confidence in Government Motion",
        "date": "2025-08-19",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 1, Tuesday 19 August 2025, First Session of the Fifty-Second Parliament",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9pktvv_31",
        "bill": "Tasmanian Industries Motion",
        "date": "2025-09-10",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 3, Wednesday 10 September 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "zcy5k2_31",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "bmb9cd_31",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "1swvft_31",
        "bill": "Public Accounts Committee Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ua2f5g_31",
        "bill": "Dangerous Criminals and High Risk Offenders Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "iuqm9v_31",
        "bill": "Referral to Parliamentary Standing Committee of Public Accounts – Amendment proposed by Mr Bayley",
        "date": "2025-09-24",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "pvbz5v_31",
        "bill": "Justice Miscellaneous (Explosives Offences) Bill 2025 – Amendments proposed by Ms Badger (suspicion to belief)",
        "date": "2025-09-24",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "i99n6n_31",
        "bill": "Parliamentary Salaries and Allowances Determination, Disallowance of",
        "date": "2025-09-25",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 7, Thursday 25 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "btgoen_31",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "0lats0_31",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "u8ojq5_31",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "passed",
        "inverse": false
      }
    ],
    "promises": [],
    "statements": []
  },
  {
    "id": 32,
    "name": "Carlo Di Falco",
    "party": "SFF",
    "electorate": "Lyons",
    "sittingDaysPresent": null,
    "sittingDaysTotal": null,
    "attendancePct": null,
    "votes": [
      {
        "id": "0ndge6_32",
        "bill": "Want of Confidence in Government Motion",
        "date": "2025-08-19",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 1, Tuesday 19 August 2025, First Session of the Fifty-Second Parliament",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9pktvv_32",
        "bill": "Tasmanian Industries Motion",
        "date": "2025-09-10",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 3, Wednesday 10 September 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "zcy5k2_32",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "bmb9cd_32",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "1swvft_32",
        "bill": "Public Accounts Committee Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ua2f5g_32",
        "bill": "Dangerous Criminals and High Risk Offenders Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "iuqm9v_32",
        "bill": "Referral to Parliamentary Standing Committee of Public Accounts – Amendment proposed by Mr Bayley",
        "date": "2025-09-24",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "pvbz5v_32",
        "bill": "Justice Miscellaneous (Explosives Offences) Bill 2025 – Amendments proposed by Ms Badger (suspicion to belief)",
        "date": "2025-09-24",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "i99n6n_32",
        "bill": "Parliamentary Salaries and Allowances Determination, Disallowance of",
        "date": "2025-09-25",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 7, Thursday 25 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "btgoen_32",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "0lats0_32",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "u8ojq5_32",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "passed",
        "inverse": false
      }
    ],
    "promises": [],
    "statements": []
  },
  {
    "id": 33,
    "name": "Guy Barnett",
    "party": "Liberal",
    "electorate": "Lyons",
    "sittingDaysPresent": null,
    "sittingDaysTotal": null,
    "attendancePct": null,
    "votes": [
      {
        "id": "wki2xj_33",
        "bill": "Marine Salmon Farming Industry Motion",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "sub9zy_33",
        "bill": "Reference to Government Administration Committee A - Inquiry into Mass Salmon Mortality Events and Contributing Factors",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "7zfh2x_33",
        "bill": "Leave to Move Motion Without Notice (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ps4j4g_33",
        "bill": "Suspension of Standing Orders (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "glfka0_33",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Garland)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9ql9rt_33",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "iwrkgl_33",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 8 Amendments (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "rg4d9l_33",
        "bill": "Residential Tenancy Amendment Bill 2024 - Clause 4 Amendment (Bayley)",
        "date": "2025-04-01",
        "policyArea": "Housing & Rent",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "d2xi5c_33",
        "bill": "Asset Privatisation Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "mbbgu5_33",
        "bill": "Asset Privatisation Motion - Main Question",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": true
      },
      {
        "id": "nf46s1_33",
        "bill": "Economic Growth, Tourism and Jobs Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ecg9hg_33",
        "bill": "Leave to Make Motion Without Notice (Dr Woodruff)",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "da4ley_33",
        "bill": "Suspension of Standing Orders — Censure Motion against Dean Winter MP",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "ehgqcn_33",
        "bill": "Adjournment Motion",
        "date": "2025-04-08",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 43, Tuesday 8 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "51icp2_33",
        "bill": "Budget Responsibility Motion",
        "date": "2025-04-09",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2t8j78_33",
        "bill": "Renewable Energy Projects Motion - Amendment to remove paragraph (4)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "r3e0ca_33",
        "bill": "Renewable Energy Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p4mu4i_33",
        "bill": "Documents Relating to MinterEllison, Macquarie Point Development Corporation, and Crown Law Motion - Amendment",
        "date": "2025-04-09",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "kio27h_33",
        "bill": "80:20 Co-Contribution Ratio for Regional Road and Bridge Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Transport & Infrastructure",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "a1xhwv_33",
        "bill": "Suspension of Standing Orders — Want of Confidence in Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2tt91r_33",
        "bill": "Want of Confidence in the Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "j0jt9w_33",
        "bill": "Suspension of Standing Orders — No Confidence in the Premier Motion",
        "date": "2025-05-06",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "yxgad4_33",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Suspension of Standing Orders for Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "zdie8b_33",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bmx0nl_33",
        "bill": "Macquarie Point Multipurpose Stadium Referendum Motion",
        "date": "2025-05-07",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "37lq1a_33",
        "bill": "Referral of Minister for Business, Industry and Resources to the Privileges and Conduct Committee",
        "date": "2025-05-07",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "wqdh3a_33",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Amendment to withdraw and redraft",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "pvuwi9_33",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Clause 3 Amendment (definitions of Budget papers and cash surplus)",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "fosxkb_33",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Third Reading",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "s8kqkh_33",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p2hs7z_33",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bruf7x_33",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "fhppzp_33",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "6qtg58_33",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "io8nzb_33",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "xo1ucy_33",
        "bill": "Macquarie Point Stadium Impacts Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bgi0ky_33",
        "bill": "Proposed Macquarie Point Stadium Bill Scrutiny Committee Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "wezu4j_33",
        "bill": "Charter of Budget Responsibility Amendment Bill 2025 - Amendment to Amendment (Clause 4)",
        "date": "2025-05-28",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "2f8qmf_33",
        "bill": "Macquarie Point Stadium Proposal Concerns Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "727ryo_33",
        "bill": "Want of Confidence in the Premier",
        "date": "2025-06-05",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 54, Thursday 5 June 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "0ndge6_33",
        "bill": "Want of Confidence in Government Motion",
        "date": "2025-08-19",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 1, Tuesday 19 August 2025, First Session of the Fifty-Second Parliament",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9pktvv_33",
        "bill": "Tasmanian Industries Motion",
        "date": "2025-09-10",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 3, Wednesday 10 September 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "zcy5k2_33",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "bmb9cd_33",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "1swvft_33",
        "bill": "Public Accounts Committee Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ua2f5g_33",
        "bill": "Dangerous Criminals and High Risk Offenders Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "iuqm9v_33",
        "bill": "Referral to Parliamentary Standing Committee of Public Accounts – Amendment proposed by Mr Bayley",
        "date": "2025-09-24",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "pvbz5v_33",
        "bill": "Justice Miscellaneous (Explosives Offences) Bill 2025 – Amendments proposed by Ms Badger (suspicion to belief)",
        "date": "2025-09-24",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "i99n6n_33",
        "bill": "Parliamentary Salaries and Allowances Determination, Disallowance of",
        "date": "2025-09-25",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 7, Thursday 25 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "btgoen_33",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "0lats0_33",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "u8ojq5_33",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "passed",
        "inverse": false
      }
    ],
    "promises": [],
    "statements": []
  },
  {
    "id": 34,
    "name": "Jane Howlett",
    "party": "Liberal",
    "electorate": "Lyons",
    "sittingDaysPresent": null,
    "sittingDaysTotal": null,
    "attendancePct": null,
    "votes": [
      {
        "id": "wki2xj_34",
        "bill": "Marine Salmon Farming Industry Motion",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "sub9zy_34",
        "bill": "Reference to Government Administration Committee A - Inquiry into Mass Salmon Mortality Events and Contributing Factors",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "7zfh2x_34",
        "bill": "Leave to Move Motion Without Notice (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ps4j4g_34",
        "bill": "Suspension of Standing Orders (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "glfka0_34",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Garland)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9ql9rt_34",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 5 Amendment (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "iwrkgl_34",
        "bill": "Police Offences Amendment (Knives and Other Weapons) Bill 2025 - Clause 8 Amendments (Badger)",
        "date": "2025-04-01",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "rg4d9l_34",
        "bill": "Residential Tenancy Amendment Bill 2024 - Clause 4 Amendment (Bayley)",
        "date": "2025-04-01",
        "policyArea": "Housing & Rent",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 40, Tuesday 1 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "d2xi5c_34",
        "bill": "Asset Privatisation Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "mbbgu5_34",
        "bill": "Asset Privatisation Motion - Main Question",
        "date": "2025-04-02",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": true
      },
      {
        "id": "nf46s1_34",
        "bill": "Economic Growth, Tourism and Jobs Motion - Amendment",
        "date": "2025-04-02",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 41, Wednesday 2 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ecg9hg_34",
        "bill": "Leave to Make Motion Without Notice (Dr Woodruff)",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "da4ley_34",
        "bill": "Suspension of Standing Orders — Censure Motion against Dean Winter MP",
        "date": "2025-04-03",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 42, Thursday 3 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "ehgqcn_34",
        "bill": "Adjournment Motion",
        "date": "2025-04-08",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 43, Tuesday 8 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "51icp2_34",
        "bill": "Budget Responsibility Motion",
        "date": "2025-04-09",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2t8j78_34",
        "bill": "Renewable Energy Projects Motion - Amendment to remove paragraph (4)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "r3e0ca_34",
        "bill": "Renewable Energy Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Environment & Climate",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p4mu4i_34",
        "bill": "Documents Relating to MinterEllison, Macquarie Point Development Corporation, and Crown Law Motion - Amendment",
        "date": "2025-04-09",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "kio27h_34",
        "bill": "80:20 Co-Contribution Ratio for Regional Road and Bridge Projects Motion (as amended)",
        "date": "2025-04-09",
        "policyArea": "Transport & Infrastructure",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 44, Wednesday 9 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "a1xhwv_34",
        "bill": "Suspension of Standing Orders — Want of Confidence in Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "2tt91r_34",
        "bill": "Want of Confidence in the Minister for Energy (Nick Duigan MLC)",
        "date": "2025-04-10",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 45, Thursday 10 April 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "bmx0nl_34",
        "bill": "Macquarie Point Multipurpose Stadium Referendum Motion",
        "date": "2025-05-07",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "37lq1a_34",
        "bill": "Referral of Minister for Business, Industry and Resources to the Privileges and Conduct Committee",
        "date": "2025-05-07",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "wqdh3a_34",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Amendment to withdraw and redraft",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "pvuwi9_34",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Clause 3 Amendment (definitions of Budget papers and cash surplus)",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "fosxkb_34",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Third Reading",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "xo1ucy_34",
        "bill": "Macquarie Point Stadium Impacts Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bgi0ky_34",
        "bill": "Proposed Macquarie Point Stadium Bill Scrutiny Committee Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "wezu4j_34",
        "bill": "Charter of Budget Responsibility Amendment Bill 2025 - Amendment to Amendment (Clause 4)",
        "date": "2025-05-28",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "2f8qmf_34",
        "bill": "Macquarie Point Stadium Proposal Concerns Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "727ryo_34",
        "bill": "Want of Confidence in the Premier",
        "date": "2025-06-05",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 54, Thursday 5 June 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "0ndge6_34",
        "bill": "Want of Confidence in Government Motion",
        "date": "2025-08-19",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 1, Tuesday 19 August 2025, First Session of the Fifty-Second Parliament",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9pktvv_34",
        "bill": "Tasmanian Industries Motion",
        "date": "2025-09-10",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 3, Wednesday 10 September 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "zcy5k2_34",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "bmb9cd_34",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "1swvft_34",
        "bill": "Public Accounts Committee Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ua2f5g_34",
        "bill": "Dangerous Criminals and High Risk Offenders Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "i99n6n_34",
        "bill": "Parliamentary Salaries and Allowances Determination, Disallowance of",
        "date": "2025-09-25",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 7, Thursday 25 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "btgoen_34",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "0lats0_34",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "u8ojq5_34",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "passed",
        "inverse": false
      }
    ],
    "promises": [],
    "statements": []
  },
  {
    "id": 35,
    "name": "Mark Shelton",
    "party": "Liberal",
    "electorate": "Lyons",
    "sittingDaysPresent": null,
    "sittingDaysTotal": null,
    "attendancePct": null,
    "votes": [
      {
        "id": "wki2xj_35",
        "bill": "Marine Salmon Farming Industry Motion",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "sub9zy_35",
        "bill": "Reference to Government Administration Committee A - Inquiry into Mass Salmon Mortality Events and Contributing Factors",
        "date": "2025-03-12",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 38, Wednesday 12 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "7zfh2x_35",
        "bill": "Leave to Move Motion Without Notice (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ps4j4g_35",
        "bill": "Suspension of Standing Orders (Notice of Motion No. 96)",
        "date": "2025-03-13",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 39, Thursday 13 March 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "j0jt9w_35",
        "bill": "Suspension of Standing Orders — No Confidence in the Premier Motion",
        "date": "2025-05-06",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "yxgad4_35",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Suspension of Standing Orders for Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "zdie8b_35",
        "bill": "Tasmanian Community Fund Amendment Bill 2024 — Third Reading",
        "date": "2025-05-06",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 46, Tuesday 6 May 2025, First Session of the Fifty-First Parliament",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bmx0nl_35",
        "bill": "Macquarie Point Multipurpose Stadium Referendum Motion",
        "date": "2025-05-07",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "37lq1a_35",
        "bill": "Referral of Minister for Business, Industry and Resources to the Privileges and Conduct Committee",
        "date": "2025-05-07",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 47, Wednesday 7 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "wqdh3a_35",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Amendment to withdraw and redraft",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "pvuwi9_35",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Clause 3 Amendment (definitions of Budget papers and cash surplus)",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "fosxkb_35",
        "bill": "Superannuation Liability (GST Windfall Fund) Bill 2025 - Third Reading",
        "date": "2025-05-08",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 48, Thursday 8 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "s8kqkh_35",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "p2hs7z_35",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bruf7x_35",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "fhppzp_35",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "6qtg58_35",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "io8nzb_35",
        "bill": "Youth Justice Facility Development Bill 2025 (Bill No. 19)",
        "date": "2025-05-27",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 49, Tuesday 27 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "xo1ucy_35",
        "bill": "Macquarie Point Stadium Impacts Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "bgi0ky_35",
        "bill": "Proposed Macquarie Point Stadium Bill Scrutiny Committee Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "wezu4j_35",
        "bill": "Charter of Budget Responsibility Amendment Bill 2025 - Amendment to Amendment (Clause 4)",
        "date": "2025-05-28",
        "policyArea": "Fiscal Policy & Debt",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "2f8qmf_35",
        "bill": "Macquarie Point Stadium Proposal Concerns Motion",
        "date": "2025-05-28",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 50, Wednesday 28 May 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "727ryo_35",
        "bill": "Want of Confidence in the Premier",
        "date": "2025-06-05",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 54, Thursday 5 June 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "0ndge6_35",
        "bill": "Want of Confidence in Government Motion",
        "date": "2025-08-19",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 1, Tuesday 19 August 2025, First Session of the Fifty-Second Parliament",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "9pktvv_35",
        "bill": "Tasmanian Industries Motion",
        "date": "2025-09-10",
        "policyArea": "Agriculture & Fishing",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 3, Wednesday 10 September 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "zcy5k2_35",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "bmb9cd_35",
        "bill": "Standing Committees Establishment Motion - Amendment to leave out Clause (1) (Joint Standing Committee on Greyhound Racing Transition)",
        "date": "2025-09-11",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 4, Thursday 11 September 2025",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "1swvft_35",
        "bill": "Public Accounts Committee Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "ua2f5g_35",
        "bill": "Dangerous Criminals and High Risk Offenders Amendment Bill 2025",
        "date": "2025-09-23",
        "policyArea": "Other",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 5, Tuesday 23 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "iuqm9v_35",
        "bill": "Referral to Parliamentary Standing Committee of Public Accounts – Amendment proposed by Mr Bayley",
        "date": "2025-09-24",
        "policyArea": "Macquarie Point Stadium",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": true
      },
      {
        "id": "pvbz5v_35",
        "bill": "Justice Miscellaneous (Explosives Offences) Bill 2025 – Amendments proposed by Ms Badger (suspicion to belief)",
        "date": "2025-09-24",
        "policyArea": "Other",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmanian House of Assembly Votes and Proceedings No. 6, Wednesday 24 September 2025 (First Session of the Fifty-Second Parliament)",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "i99n6n_35",
        "bill": "Parliamentary Salaries and Allowances Determination, Disallowance of",
        "date": "2025-09-25",
        "policyArea": "Governance & Accountability",
        "vote": "for",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 7, Thursday 25 September 2025",
        "divisionOutcome": "passed",
        "inverse": false
      },
      {
        "id": "btgoen_35",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "0lats0_35",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "defeated",
        "inverse": false
      },
      {
        "id": "u8ojq5_35",
        "bill": "Terrorism Legislation (Extension) Bill 2025 (No. 52)",
        "date": "2025-11-04",
        "policyArea": "Governance & Accountability",
        "vote": "against",
        "consistency": "unknown",
        "source": "Tasmania House of Assembly Votes and Proceedings No. 8, Tuesday 4 November 2025",
        "divisionOutcome": "passed",
        "inverse": false
      }
    ],
    "promises": [],
    "statements": []
  }
]
  { id:1,  name:"Janie Finlay",      party:"Labor",       role:"Deputy Leader of the Opposition; Member for Bass",                           electorate:"Bass",     bio:"Labor MP for Bass since 2021. Deputy Leader of the Opposition under Josh Willie.",                                                                    upvotes:4,  downvotes:2,  aiScore:50, statements:[], pendingData:[],
    votingRecord:[], contradictions:[]},
  { id:2,  name:"Jess Greene",       party:"Labor",       role:"Member for Bass",                                                            electorate:"Bass",     bio:"Newly elected Labor MP for Bass in 2025, replacing retiring Michelle O'Byrne.",                                                                        upvotes:2,  downvotes:1,  aiScore:50, statements:[], votingRecord:[], pendingData:[], contradictions:[] },
  { id:3,  name:"Cecily Rosol",      party:"Greens",      role:"Member for Bass",                                                            electorate:"Bass",     bio:"Greens MP for Bass, elected 2024.",                                                                                                                        upvotes:5,  downvotes:2,  aiScore:50, statements:[], pendingData:[],
    votingRecord:[], contradictions:[]},
  { id:4,  name:"George Razay",      party:"Independent", role:"Member for Bass",                                                            electorate:"Bass",     bio:"Independent MP for Bass, elected 2025. Anti-stadium position was central to his campaign.",                                                              upvotes:6,  downvotes:3,  aiScore:50, statements:[], pendingData:[],
    votingRecord:[], contradictions:[]},
  { id:5,  name:"Bridget Archer",    party:"Liberal",     role:"Minister for Health; Minister for Ageing; Minister for Aboriginal Affairs",   electorate:"Bass",     bio:"Liberal Minister for Health. Previously a Federal MP.",                                                                                               upvotes:5,  downvotes:3,  aiScore:50, statements:[], pendingData:[],
    votingRecord:[], contradictions:[]},
  { id:6,  name:"Michael Ferguson",  party:"Liberal",     role:"Deputy Premier; Minister for Infrastructure and Transport",                   electorate:"Bass",     bio:"Deputy Premier since 2022. Liberal MP for Bass since 2010. Responsible for the significantly delayed Spirit of Tasmania ferry replacement.",        upvotes:3,  downvotes:6,  aiScore:50, pendingData:[],
    statements:[],
    votingRecord:[], contradictions:[]},
  { id:7,  name:"Rob Fairs",         party:"Liberal",     role:"Member for Bass",                                                            electorate:"Bass",     bio:"Liberal MP for Bass, first elected 2024.",                                                                                                                 upvotes:2,  downvotes:2,  aiScore:50, statements:[], votingRecord:[], pendingData:[], contradictions:[] },
  // BRADDON
  { id:8,  name:"Anita Dow",         party:"Labor",       role:"Member for Braddon",                                                          electorate:"Braddon",  bio:"Labor MP for Braddon since 2018. Former Deputy Leader of the Opposition.",                                                                              upvotes:5,  downvotes:2,  aiScore:50, statements:[], pendingData:[],
    votingRecord:[], contradictions:[]},
  { id:9,  name:"Shane Broad",       party:"Labor",       role:"Member for Braddon",                                                          electorate:"Braddon",  bio:"Labor MP for Braddon since 2017 with a PhD. Strong policy background.",                                                                                  upvotes:6,  downvotes:2,  aiScore:50, statements:[], votingRecord:[], pendingData:[], contradictions:[] },
  { id:10, name:"Craig Garland",     party:"Independent", role:"Member for Braddon",                                                          electorate:"Braddon",  bio:"Independent MP, former commercial fisherman. Supported no-confidence motion then withdrew support for Labor's government bid.",                        upvotes:8,  downvotes:3,  aiScore:50, statements:[], pendingData:[],
    votingRecord:[], contradictions:[]},
  { id:11, name:"Jeremy Rockliff",   party:"Liberal",     role:"Premier of Tasmania",                                                         electorate:"Braddon",  bio:"Premier of Tasmania and Liberal Leader. Governing in minority since 2024. Recommissioned as Premier after surviving the August 2025 no-confidence vote.", upvotes:8, downvotes:12, aiScore:50, pendingData:[],
    statements:[],
    votingRecord:[],
    contradictions:[
      {
        id:"r_con_001", memberId:11, memberName:"Jeremy Rockliff",
        type:"statement_vs_statement", severity:"high",
        topic:"Youth justice approach", policyArea:"Governance & Accountability",
        summary:"Claimed to support a therapeutic youth justice model while simultaneously introducing punitive 'adult crime, adult time' legislation — directly contradictory approaches, stated one day apart.",
        statementA:{ date:"2025-05-06", quote:"That is why it is important that we are investing in the facility at Pontville and that therapeutic model within the youth justice system. That is why this week, I believe, we have the Youth Alcohol and Drug Service (YADS) commencing as well.", source:"Hansard 2025-05-06", context:"Responding to question about addressing causes of youth crime" },
        statementB:{ date:"2025-05-07", quote:"We have introduced knife crime legislation in to this place, 'post and boast' into this place as well. It is our job as a government to respond to community concerns and keep people safe.", source:"Hansard 2025-05-07", context:"Response to criticism of 'adult crime, adult time' policies conflicting with commission of inquiry recommendations" },
        explanation:"These statements represent fundamentally contradictory approaches to youth justice. A therapeutic model focuses on rehabilitation and addressing underlying causes, while 'adult crime, adult time' legislation represents a punitive approach that treats children as adults — approaches recognised as incompatible in youth justice policy. The contradiction occurred within one day and shows the government pursuing conflicting policy directions simultaneously."
      },
      {
        id:"r_con_002", memberId:11, memberName:"Jeremy Rockliff",
        type:"factual_flip", severity:"medium",
        topic:"Daily health spending", policyArea:"Health & Hospitals",
        summary:"Claimed health spending was $8.8 million per day in April 2025, then claimed $10 million per day in September 2025 — a 14% discrepancy in a key funding figure.",
        statementA:{ date:"2025-04-02", quote:"At the moment we are spending $12.9 billion over the forward Estimates. That works out to be $8.8 million a day.", source:"Hansard 2025-04-02", context:"Response to question about health efficiency dividends and ward restrictions" },
        statementB:{ date:"2025-09-11", quote:"We have worked very hard over the course of the last 11 years with increasing investment in our health system to the tune of $10 million every single day.", source:"Hansard 2025-09-11", context:"Response to question about surgery wait lists" },
        explanation:"The Premier provided two different specific figures for daily health spending within five months, with the later figure being 14% higher. This factual inconsistency undermines the credibility of health funding claims, particularly in an area of high public concern."
      },
      {
        id:"r_con_003", memberId:11, memberName:"Jeremy Rockliff",
        type:"factual_flip", severity:"low",
        topic:"Job creation numbers", policyArea:"Fiscal Policy & Debt",
        summary:"Cited 50,000 jobs created in April 2025, then revised the figure down to 49,500 in September 2025 without explanation.",
        statementA:{ date:"2025-04-02", quote:"We have created 50,000 jobs over the course of the last decade.", source:"Hansard 2025-04-02", context:"Response to questions about Liberty Bell Bay and major industrials" },
        statementB:{ date:"2025-09-10", quote:"We've created 49,500 jobs since we've come to government", source:"Hansard 2025-09-10", context:"Defending government's economic record and industry support" },
        explanation:"The Premier claimed 50,000 jobs created in April but revised this down to 49,500 in September — conflicting factual claims about the same achievement with no explanation for the revision. Rated low severity as the difference is small and may reflect updated data."
      },
      {
        id:"r_con_004", memberId:11, memberName:"Jeremy Rockliff",
        type:"promise_broken", severity:"high",
        topic:"Stadium capital funding commitment", policyArea:"Macquarie Point Stadium",
        summary:"Committed to a $460 million total funding cap ($375m + $85m borrowings), then admitted on the same day that borrowings would be 'clearly more than $85 million', breaking the total commitment.",
        statementA:{ date:"2025-05-06", quote:"We remain committed to the $375 million investment in capital. We always said there would be borrowings... The Tasmanian government funding commitment to the stadium development is denoted at $460 million.", source:"Hansard 2025-05-06", context:"Response to question about abandoning stadium project and clarifying stadium funding model" },
        statementB:{ date:"2025-05-06", quote:"It is likely, obviously, that the $85 million is going to be clearly more than $85 million.", source:"Hansard 2025-05-06", context:"Confirming increased borrowing for stadium beyond original $85 million" },
        explanation:"On the same day, Rockliff stated the government's total funding commitment was $460 million ($375m + $85m borrowings), then hours later admitted the borrowing would be 'clearly more', effectively breaking the total commitment he had just reaffirmed. This is a broken promise on the total cost to taxpayers."
      },
      {
        id:"r_con_005", memberId:11, memberName:"Jeremy Rockliff",
        type:"statement_vs_statement", severity:"high",
        topic:"Parliament as final arbiter vs enabling legislation terminating POSS", policyArea:"Macquarie Point Stadium",
        summary:"Promised parliament would be the final arbiter regardless of approval pathway, then stated the POSS process would completely end if enabling legislation failed — removing the parliamentary choice he had promised.",
        statementA:{ date:"2025-04-02", quote:"I made it very clear yesterday that parliament will be the final arbiter of this project... At the end of the day - POSS process or enabling legislation - this parliament will have a say.", source:"Hansard 2025-04-02", context:"Discussion of process for approving Macquarie Point Stadium, confirming parliament will vote regardless of pathway" },
        statementB:{ date:"2025-05-07", quote:"If the legislation is not passed, the stadium will not go ahead, the team will not go ahead and the Project of State Significance (POSS) process will not go ahead... The POSS process will end. It will all end if we do not get this enabling legislation through", source:"Hansard 2025-05-07", context:"Response to questions about enabling legislation and whether POSS process could continue if it fails" },
        explanation:"Rockliff initially promised parliament would have final say whether the project went through POSS or enabling legislation. Five weeks later, he stated that if enabling legislation fails the entire POSS process terminates, making it a take-it-or-leave-it proposition that removes the alternative pathway he had promised."
      },
      {
        id:"r_con_006", memberId:11, memberName:"Jeremy Rockliff",
        type:"statement_vs_statement", severity:"high",
        topic:"Greyhound racing industry future", policyArea:"Gambling Reform",
        summary:"Committed to supporting the longevity and sustainability of the racing industry while simultaneously announcing greyhound racing would cease in 2029 — contradictory statements made on the same day.",
        statementA:{ date:"2025-11-06", quote:"The government is committed to support the longevity and sustainability of the racing industry, which generates $208 million in economic activity for Tasmania and which involves 6400 people.", source:"Hansard 2025-11-06", context:"Statement made in the context of racing industry support" },
        statementB:{ date:"2025-11-06", quote:"We've made the call and in 2029 the greyhound racing industry will cease.", source:"Hansard 2025-11-06", context:"Responding to questions about consultation on greyhound racing shutdown legislation" },
        explanation:"Both statements were made on the same day. Rockliff expressed commitment to the industry's longevity while simultaneously announcing its termination. Shutting down an industry is the opposite of supporting its longevity — a direct contradiction about government intentions toward the sector."
      },
    ]},
  { id:12, name:"Gavin Pearce",      party:"Liberal",     role:"Member for Braddon",                                                          electorate:"Braddon",  bio:"Liberal MP for Braddon, elected 2025. Replaced Miriam Beswick (National).",                                                                            upvotes:2,  downvotes:2,  aiScore:50, statements:[], votingRecord:[], pendingData:[], contradictions:[] },
  { id:13, name:"Felix Ellis",       party:"Liberal",     role:"Member for Braddon",                                                          electorate:"Braddon",  bio:"Liberal MP for Braddon, serving since 2020.",                                                                                                               upvotes:3,  downvotes:2,  aiScore:50, statements:[], votingRecord:[], pendingData:[], contradictions:[] },
  { id:14, name:"Roger Jaensch",     party:"Liberal",     role:"Minister for Education, Children and Youth",                                  electorate:"Braddon",  bio:"Liberal Minister for Education serving since 2014.",                                                                                                       upvotes:4,  downvotes:3,  aiScore:50, statements:[], votingRecord:[], pendingData:[], contradictions:[] },
  // CLARK
  { id:15, name:"Ella Haddad",       party:"Labor",       role:"Member for Clark",                                                            electorate:"Clark",    bio:"Labor MP for Clark since 2018. Strong advocate for housing and social policy.",                                                                          upvotes:7,  downvotes:2,  aiScore:50, statements:[], pendingData:[],
    votingRecord:[], contradictions:[]},
  { id:16, name:"Josh Willie",       party:"Labor",       role:"Leader of the Opposition",                                                    electorate:"Clark",    bio:"Labor Leader since August 2025. Won leadership spill over Dean Winter. Former Legislative Council member for Elwick (2016–2024).",               upvotes:6,  downvotes:3,  aiScore:50, pendingData:[],
    statements:[],
    votingRecord:[], contradictions:[]},
  { id:17, name:"Vica Bayley",       party:"Greens",      role:"Member for Clark",                                                            electorate:"Clark",    bio:"Greens MP for Clark since 2023. Focus on housing and environmental issues.",                                                                             upvotes:8,  downvotes:2,  aiScore:50, statements:[], pendingData:[],
    votingRecord:[], contradictions:[]},
  { id:18, name:"Helen Burnet",      party:"Greens",      role:"Member for Clark",                                                            electorate:"Clark",    bio:"Greens MP for Clark, elected 2024.",                                                                                                                       upvotes:5,  downvotes:2,  aiScore:50, statements:[], pendingData:[],
    votingRecord:[], contradictions:[]},
  { id:19, name:"Kristie Johnston",  party:"Independent", role:"Member for Clark",                                                            electorate:"Clark",    bio:"Independent MP for Clark since 2021. Previously signed confidence and supply with Rockliff government but voted for the 2025 no-confidence motion.", upvotes:7, downvotes:4, aiScore:50, statements:[], pendingData:[],
    votingRecord:[], contradictions:[]},
  { id:20, name:"Marcus Vermey",     party:"Liberal",     role:"Member for Clark",                                                            electorate:"Clark",    bio:"Liberal MP for Clark, newly elected 2025 replacing Simon Behrakis.",                                                                                     upvotes:2,  downvotes:2,  aiScore:50, statements:[], votingRecord:[], pendingData:[], contradictions:[] },
  { id:21, name:"Madeleine Ogilvie", party:"Liberal",     role:"Minister for Justice; Minister for Corrections and Probation",               electorate:"Clark",    bio:"Liberal Minister for Justice. Unique background — served as a Labor MP 2014–2018, then re-entered as Liberal.",                                    upvotes:4,  downvotes:3,  aiScore:50, statements:[], votingRecord:[], pendingData:[], contradictions:[] },
  // FRANKLIN
  { id:22, name:"Dean Winter",       party:"Labor",       role:"Shadow Treasurer; Member for Franklin",                                       electorate:"Franklin", bio:"Former Opposition Leader (Apr 2024–Aug 2025). Lost leadership to Josh Willie after the failed no-confidence motion. Now Shadow Treasurer.",         upvotes:5,  downvotes:6,  aiScore:50, pendingData:[],
    statements:[],
    votingRecord:[], contradictions:[]},
  { id:23, name:"Meg Brown",         party:"Labor",       role:"Member for Franklin",                                                         electorate:"Franklin", bio:"Labor MP for Franklin, elected 2024.",                                                                                                                     upvotes:3,  downvotes:1,  aiScore:50, statements:[], votingRecord:[], pendingData:[], contradictions:[] },
  { id:24, name:"Rosalie Woodruff",  party:"Greens",      role:"Greens Leader; Member for Franklin",                                          electorate:"Franklin", bio:"Leader of the Tasmanian Greens since 2018. Known for salmon farming, native forests and social justice advocacy.",                                    upvotes:14, downvotes:4,  aiScore:50, pendingData:[],
    statements:[],
    votingRecord:[], contradictions:[]},
  { id:25, name:"David O'Byrne",     party:"Independent", role:"Member for Franklin",                                                         electorate:"Franklin", bio:"Former Labor leader turned independent. Voted against the 2025 no-confidence motion, siding with the Liberal government.",                        upvotes:4,  downvotes:5,  aiScore:50, statements:[], pendingData:[],
    votingRecord:[], contradictions:[]},
  { id:26, name:"Peter George",      party:"Independent", role:"Member for Franklin",                                                         electorate:"Franklin", bio:"Independent MP for Franklin, newly elected 2025. Replaced Liberal Nic Street.",                                                                         upvotes:4,  downvotes:2,  aiScore:50, statements:[], votingRecord:[], pendingData:[], contradictions:[] },
  { id:27, name:"Eric Abetz",        party:"Liberal",     role:"Leader of the House; Treasurer; Minister for Macquarie Point Urban Renewal",  electorate:"Franklin", bio:"Senior Liberal MP and Treasurer. Former Federal Senator (1994–2022). Key driver of the Macquarie Point Stadium project.",                          upvotes:5,  downvotes:9,  aiScore:50, statements:[], pendingData:[],
    votingRecord:[],
    contradictions:[
      {
        id:"a_con_001", memberId:27, memberName:"Eric Abetz",
        type:"factual_flip", severity:"medium",
        topic:"Spirit IV departure delay", policyArea:"Transport & Infrastructure",
        summary:"On the same day, attributed Spirit IV's failure to depart to weather — but had already stated it wouldn't depart until technical repairs were completed.",
        statementA:{ date:"2025-05-28", quote:"Spirit IV will not depart for Australia until the work is completed", source:"Hansard 2025-05-28", context:"Answer about technical issues requiring repairs before vessel can depart Scotland" },
        statementB:{ date:"2025-05-28", quote:"Spirit IV was designed, or timetabled, I should say, to leave on 26 May, on Monday. Inclement weather did not allow that to occur", source:"Hansard 2025-05-28", context:"Explanation of why Spirit IV has not departed Scotland" },
        explanation:"Both statements were made on the same day but provide conflicting explanations for why Spirit IV did not depart on May 26. One clearly states the vessel won't depart until technical work is completed; the other attributes the delay solely to weather, making no mention of the ongoing technical repairs that should have prevented departure regardless of conditions."
      },
      {
        id:"a_con_002", memberId:27, memberName:"Eric Abetz",
        type:"factual_flip", severity:"high",
        topic:"Federal funding eligibility for stadium", policyArea:"Macquarie Point Stadium",
        summary:"Claimed federal $240 million could fund the stadium as part of the precinct, despite the Prime Minister's explicit statement that it cannot be used for stadium construction.",
        statementA:{ date:"2025-09-11", quote:"We see the development of the stadium as being fundamental to the development of the precinct. It will be, if you like, the anchor tenant. The stadium will be the anchor development for the totality of the precinct.", source:"Hansard 2025-09-11", context:"Question about whether federal $240 million can be spent on stadium" },
        statementB:{ date:"2025-09-23", quote:"The Prime Minister has been very clear in relation to this... the money federal Labor is making available is for the precinct, and, of course, the stadium is a fundamental part of the precinct.", source:"Hansard 2025-09-23", context:"Responding to questions about whether $240 million federal funding will be available for stadium" },
        explanation:"Abetz suggests the federal money can fund the stadium because it's 'part of the precinct,' but simultaneously invokes the PM being 'very clear' — while the PM's actual position was that stadium construction is excluded. The contradiction lies in claiming clarity while misrepresenting what that clarity means."
      },
      {
        id:"a_con_003", memberId:27, memberName:"Eric Abetz",
        type:"factual_flip", severity:"high",
        topic:"Total external funding for stadium", policyArea:"Macquarie Point Stadium",
        summary:"Claimed $600 million in federal and AFL funding was 'coming our way' for the stadium, despite earlier acknowledging the federal portion was designated for precinct infrastructure, not the stadium itself.",
        statementA:{ date:"2025-11-04", quote:"It is unthinkable that Tasmanians would forgo a $600 million injection into our economy courtesy of the federal Labor government and the AFL. If we don't go ahead with that stadium, $600 million that was coming our way will not be coming our way.", source:"Hansard 2025-11-04", context:"Defending stadium debt when questioned about costs to service stadium debt" },
        statementB:{ date:"2025-09-23", quote:"The Prime Minister has been very clear in relation to this... the money federal Labor is making available is for the precinct, and, of course, the stadium is a fundamental part of the precinct.", source:"Hansard 2025-09-23", context:"Responding to questions about whether $240 million federal funding will be available for stadium" },
        explanation:"Abetz claimed $600 million was coming 'for the stadium' from the federal government and AFL, but had six weeks earlier acknowledged the federal portion was for precinct infrastructure rather than the stadium itself. This inflates the apparent external contribution and misrepresents Tasmania's actual financial burden."
      },
    ]},
  { id:28, name:"Jacquie Petrusma",  party:"Liberal",     role:"Member for Franklin",                                                         electorate:"Franklin", bio:"Liberal MP for Franklin, serving since 2010 with a break from 2022–2024.",                                                                            upvotes:3,  downvotes:3,  aiScore:50, statements:[], votingRecord:[], pendingData:[], contradictions:[] },
  // LYONS
  { id:29, name:"Jen Butler",        party:"Labor",       role:"Member for Lyons",                                                            electorate:"Lyons",    bio:"Labor MP for Lyons since 2018. Former teacher focused on education and regional services.",                                                              upvotes:6,  downvotes:2,  aiScore:50, statements:[], votingRecord:[], pendingData:[], contradictions:[] },
  { id:30, name:"Brian Mitchell",    party:"Labor",       role:"Member for Lyons",                                                            electorate:"Lyons",    bio:"Newly elected Labor state MP for Lyons 2025. Former Federal MP for Lyons (2016–2025).",                                                               upvotes:4,  downvotes:2,  aiScore:50, statements:[], votingRecord:[], pendingData:[], contradictions:[] },
  { id:31, name:"Tabatha Badger",    party:"Greens",      role:"Member for Lyons",                                                            electorate:"Lyons",    bio:"Greens MP for Lyons, elected 2024.",                                                                                                                       upvotes:5,  downvotes:2,  aiScore:50, statements:[], pendingData:[],
    votingRecord:[], contradictions:[]},
  { id:32, name:"Carlo Di Falco",    party:"SFF",         role:"Member for Lyons",                                                            electorate:"Lyons",    bio:"Shooters, Fishers and Farmers MP — first SFF member elected in Tasmania.",                                                                               upvotes:5,  downvotes:4,  aiScore:50, statements:[], pendingData:[],
    votingRecord:[], contradictions:[]},
  { id:33, name:"Guy Barnett",       party:"Liberal",     role:"Minister for Natural Resources and Water; Minister for Mining",               electorate:"Lyons",    bio:"Senior Liberal minister serving since 2014. Responsible for natural resources and mining.",                                                          upvotes:3,  downvotes:4,  aiScore:50, statements:[], pendingData:[],
    votingRecord:[], contradictions:[]},
  { id:34, name:"Jane Howlett",      party:"Liberal",     role:"Minister for Small Business; Minister for Racing",                           electorate:"Lyons",    bio:"Liberal Minister for Small Business since 2024.",                                                                                                         upvotes:4,  downvotes:2,  aiScore:50, statements:[], votingRecord:[], pendingData:[], contradictions:[] },
  { id:35, name:"Mark Shelton",      party:"Liberal",     role:"Member for Lyons",                                                           electorate:"Lyons",    bio:"Liberal MP for Lyons since 2010. Former Speaker of the House of Assembly.",                                                                             upvotes:3,  downvotes:3,  aiScore:50, statements:[], votingRecord:[], pendingData:[], contradictions:[] },
];

const PARTY_COLORS = {
  Liberal:     { bg:"#1a3a6b", accent:"#4a90d9" },
  Labor:       { bg:"#8b1a1a", accent:"#d94a4a" },
  Greens:      { bg:"#1a5c2a", accent:"#4ab84a" },
  Independent: { bg:"#4a4a6b", accent:"#7a7aaa" },
  SFF:         { bg:"#5c3a1a", accent:"#c87830" },
};

function enrich(p) {
  return { ...p, trustScore: calcTrustScore(p.statements, p.votingRecord), popularityScore: calcPopularityScore(p.upvotes, p.downvotes) };
}

const tColor = s => s >= 70 ? "#2d7a5f" : s >= 50 ? "#b07800" : "#b03030";
const pColor = s => s >= 70 ? "#1a5c9e" : s >= 50 ? "#6a6a9e" : "#9e3a3a";
const aColor = s => s >= 70 ? "#5c3a9e" : s >= 50 ? "#7a5a9e" : "#9e4a6a";
const fmtDate = d => new Date(d).toLocaleDateString("en-AU",{year:"numeric",month:"short",day:"numeric"});

// ---- Shared mini components ----
function StanceTag({ type }) {
  const s = { supportive:{bg:"#e8f5e8",color:"#2d7a2d"}, opposed:{bg:"#fbe8e8",color:"#9e2d2d"}, moderate:{bg:"#fff7e0",color:"#8a5f00"} }[type]||{bg:"#f0f0f0",color:"#555"};
  return <span style={{fontSize:10,padding:"2px 8px",borderRadius:20,background:s.bg,color:s.color,fontWeight:700,textTransform:"uppercase",letterSpacing:0.5,whiteSpace:"nowrap"}}>{type}</span>;
}
function VoteTag({ vote }) {
  const s = vote==="for" ? {bg:"#e8f5e8",color:"#2d7a2d",label:"FOR"} : {bg:"#fbe8e8",color:"#9e2d2d",label:"AGAINST"};
  return <span style={{fontSize:10,padding:"2px 8px",borderRadius:20,background:s.bg,color:s.color,fontWeight:700,letterSpacing:0.5}}>{s.label}</span>;
}
function MiniScores({ p, size="sm" }) {
  const big = size==="lg";
  return (
    <div style={{display:"flex",gap:big?16:10,alignItems:"center"}}>
      {[["TRUST",p.trustScore,tColor],["POP",p.popularityScore,pColor],["AI",p.aiScore,aColor]].map(([l,s,c])=>(
        <div key={l} style={{textAlign:"center"}}>
          <div style={{fontSize:big?24:15,fontWeight:900,fontFamily:"monospace",color:c(s),lineHeight:1}}>{s}</div>
          <div style={{fontSize:big?10:8,color:"#999",fontWeight:600,letterSpacing:0.3}}>{l}</div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// POLICY ENGINE VIEWS
// ============================================================
function PolicyHub({ politicians, onSelectPolitician }) {
  const [selectedPolicy, setSelectedPolicy] = useState(null);
  const [view, setView] = useState("grid"); // grid | detail
  const [compareA, setCompareA] = useState(null);
  const [compareB, setCompareB] = useState(null);
  const [compareMode, setCompareMode] = useState(false);
  const [filterStance, setFilterStance] = useState("all"); // all | for | against

  // For each policy, compute how each politician voted (aggregate across all divisions in that policy)
  const getPolicyStance = useCallback((politician, policyKey) => {
    const votes = (politician.votingRecord||[]).filter(v=>v.policyKey===policyKey);
    if (!votes.length) return null;
    let forCount = 0, againstCount = 0;
    for (const v of votes) {
      const div = DIVISION_MAP[v.divisionId];
      const effectiveVote = div?.inverse ? (v.vote==="for" ? "against" : "for") : v.vote;
      if (effectiveVote==="for") forCount++; else againstCount++;
    }
    if (forCount > againstCount) return "for";
    if (againstCount > forCount) return "against";
    return "mixed";
  }, []);

  const getRankedForPolicy = useCallback((policyKey) => {
    return politicians
      .map(p => ({ ...p, stance: getPolicyStance(p, policyKey), votes: (p.votingRecord||[]).filter(v=>v.policyKey===policyKey) }))
      .filter(p => p.stance !== null)
      .sort((a,b) => {
        const order = { for:0, mixed:1, against:2 };
        return (order[a.stance]??3) - (order[b.stance]??3);
      });
  }, [politicians, getPolicyStance]);

  if (compareMode) {
    return <PolicyCompare politicians={politicians} compareA={compareA} compareB={compareB}
      setCompareA={setCompareA} setCompareB={setCompareB}
      onBack={()=>setCompareMode(false)} getPolicyStance={getPolicyStance} />;
  }

  if (selectedPolicy && view==="detail") {
    const policy = POLICIES.find(p=>p.key===selectedPolicy);
    const ranked = getRankedForPolicy(selectedPolicy);
    const filtered = filterStance==="all" ? ranked : ranked.filter(p=>p.stance===filterStance);
    return (
      <div>
        <button onClick={()=>{setView("grid");setSelectedPolicy(null);}} style={{background:"none",border:"none",cursor:"pointer",color:"#1a3a6b",fontWeight:700,fontSize:13,padding:"0 0 14px",display:"flex",alignItems:"center",gap:5}}>← All Policies</button>
        <div style={{background:"#fff",borderRadius:14,padding:"18px 20px",marginBottom:14,border:"1px solid #eee",boxShadow:"0 2px 10px rgba(0,0,0,0.06)"}}>
          <div style={{fontSize:28,marginBottom:6}}>{policy.icon}</div>
          <h2 style={{fontFamily:"Georgia, serif",margin:"0 0 6px",fontSize:20}}>{policy.label}</h2>
          <p style={{margin:"0 0 12px",color:"#666",fontSize:13,lineHeight:1.6}}>{policy.description}</p>
          {/* Divisions / vote history */}
          <div style={{borderTop:"1px solid #f0f0f0",paddingTop:12}}>
            <div style={{fontSize:11,fontWeight:700,color:"#888",marginBottom:8,letterSpacing:0.5}}>VOTE HISTORY — BILLS & DIVISIONS</div>
            {policy.divisions.map((d,i)=>(
              <div key={i} style={{marginBottom:10,paddingBottom:10,borderBottom:i<policy.divisions.length-1?"1px solid #f5f5f5":"none"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:3}}>
                  <div style={{fontWeight:600,fontSize:13,color:"#222"}}>{d.bill}</div>
                  <span style={{fontSize:10,padding:"2px 8px",borderRadius:20,background:d.outcome==="passed"?"#e8f5e8":"#fbe8e8",color:d.outcome==="passed"?"#2d7a2d":"#9e2d2d",fontWeight:700,whiteSpace:"nowrap"}}>{d.outcome.toUpperCase()}</span>
                </div>
                <div style={{fontSize:12,color:"#888",marginBottom:2}}>{fmtDate(d.date)}</div>
                <div style={{fontSize:12,color:"#555"}}>{d.summary}</div>
                {d.inverse && <div style={{fontSize:11,color:"#8a5f00",background:"#fff7e0",borderRadius:6,padding:"2px 8px",marginTop:4,display:"inline-block"}}>⚠️ Inverse division — voting FOR signals opposition to this policy</div>}
                {/* Who voted how on this specific division — always shows actual vote cast */}
                <div style={{marginTop:8,display:"flex",flexWrap:"wrap",gap:4}}>
                  {politicians.filter(p=>(p.votingRecord||[]).some(v=>v.divisionId===d.id)).map(p=>{
                    const vr = (p.votingRecord||[]).find(v=>v.divisionId===d.id);
                    const votedFor = vr.vote==="for";
                    return (
                      <span key={p.id} onClick={()=>onSelectPolitician(p)}
                        style={{fontSize:11,padding:"2px 8px",borderRadius:20,cursor:"pointer",fontWeight:600,
                          background:votedFor?"#e8f5e8":"#fbe8e8",
                          color:votedFor?"#2d7a2d":"#9e2d2d",
                          border:`1px solid ${votedFor?"#b8dfc0":"#f0bcbc"}`}}>
                        {p.name.split(" ")[1]||p.name.split(" ")[0]} {votedFor?"✓":"✗"}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Ranked support */}
        <div style={{background:"#fff",borderRadius:14,padding:"18px 20px",border:"1px solid #eee",boxShadow:"0 2px 10px rgba(0,0,0,0.06)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
            <h3 style={{fontFamily:"Georgia, serif",margin:0,fontSize:16}}>Politicians Ranked by Support</h3>
            <div style={{display:"flex",gap:6}}>
              {["all","for","against"].map(s=>(
                <button key={s} onClick={()=>setFilterStance(s)}
                  style={{padding:"4px 12px",borderRadius:20,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,
                    background:filterStance===s?"#0d1b3e":"#f0f0f0",color:filterStance===s?"#fff":"#555"}}>
                  {s==="all"?"All":s==="for"?"Supportive":"Opposed"}
                </button>
              ))}
            </div>
          </div>
          {filtered.length===0 && <div style={{color:"#aaa",fontSize:13,fontStyle:"italic"}}>No voting records found for this filter.</div>}
          {filtered.map((p,i)=>(
            <div key={p.id} onClick={()=>onSelectPolitician(p)}
              style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:i<filtered.length-1?"1px solid #f5f5f5":"none",cursor:"pointer"}}
              onMouseEnter={e=>e.currentTarget.style.background="#fafafa"}
              onMouseLeave={e=>e.currentTarget.style.background=""}>
              <div style={{width:26,height:26,borderRadius:"50%",background:PARTY_COLORS[p.party]?.bg||"#888",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:"#fff",flexShrink:0}}>
                {p.name.split(" ").map(n=>n[0]).join("").slice(0,2)}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:600,fontSize:13,color:"#222"}}>{p.name}</div>
                <div style={{fontSize:11,color:"#888"}}>{p.party} · {p.votes.length} vote{p.votes.length!==1?"s":""} recorded</div>
              </div>
              <span style={{fontSize:11,padding:"3px 10px",borderRadius:20,fontWeight:700,whiteSpace:"nowrap",
                background:p.stance==="for"?"#e8f5e8":p.stance==="against"?"#fbe8e8":"#fff7e0",
                color:p.stance==="for"?"#2d7a2d":p.stance==="against"?"#9e2d2d":"#8a5f00"}}>
                {p.stance==="for"?"✅ Supportive":p.stance==="against"?"❌ Opposed":"⚖️ Mixed"}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
        <div>
          <h2 style={{fontFamily:"Georgia, serif",margin:"0 0 4px",fontSize:18}}>🗂️ Policy Hub</h2>
          <div style={{fontSize:12,color:"#888"}}>Select a policy to see who supports it, who opposes it, and the full vote history.</div>
        </div>
        <button onClick={()=>setCompareMode(true)}
          style={{padding:"8px 16px",background:"#1a3a6b",color:"#fff",border:"none",borderRadius:20,cursor:"pointer",fontSize:12,fontWeight:700}}>
          ⚖️ Compare Two Politicians
        </button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(200px, 1fr))",gap:10}}>
        {POLICIES.map(policy=>{
          const ranked = getRankedForPolicy(policy.key);
          const forCount = ranked.filter(p=>p.stance==="for").length;
          const againstCount = ranked.filter(p=>p.stance==="against").length;
          return (
            <div key={policy.key} onClick={()=>{setSelectedPolicy(policy.key);setView("detail");}}
              style={{background:"#fff",borderRadius:12,padding:"16px",border:"1px solid #eee",cursor:"pointer",boxShadow:"0 2px 8px rgba(0,0,0,0.06)",transition:"transform 0.15s, box-shadow 0.15s"}}
              onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 6px 20px rgba(0,0,0,0.1)";}}
              onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,0.06)";}}>
              <div style={{fontSize:26,marginBottom:8}}>{policy.icon}</div>
              <div style={{fontWeight:700,fontSize:14,color:"#1a1a2e",marginBottom:4}}>{policy.label}</div>
              <div style={{fontSize:11,color:"#888",marginBottom:10,lineHeight:1.4}}>{policy.divisions.length} division{policy.divisions.length!==1?"s":""} recorded</div>
              <div style={{display:"flex",gap:6}}>
                <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:"#e8f5e8",color:"#2d7a2d",fontWeight:700}}>✅ {forCount}</span>
                <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:"#fbe8e8",color:"#9e2d2d",fontWeight:700}}>❌ {againstCount}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PolicyCompare({ politicians, compareA, compareB, setCompareA, setCompareB, onBack, getPolicyStance }) {
  const pA = politicians.find(p=>p.id===compareA);
  const pB = politicians.find(p=>p.id===compareB);

  const agreements = pA && pB ? POLICIES.filter(policy=>{
    const sA = getPolicyStance(pA,policy.key);
    const sB = getPolicyStance(pB,policy.key);
    return sA&&sB&&sA===sB;
  }).length : 0;
  const disagreements = pA && pB ? POLICIES.filter(policy=>{
    const sA = getPolicyStance(pA,policy.key);
    const sB = getPolicyStance(pB,policy.key);
    return sA&&sB&&sA!==sB;
  }).length : 0;

  return (
    <div>
      <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",color:"#1a3a6b",fontWeight:700,fontSize:13,padding:"0 0 14px",display:"flex",alignItems:"center",gap:5}}>← Back to Policies</button>
      <h2 style={{fontFamily:"Georgia, serif",margin:"0 0 14px",fontSize:18}}>⚖️ Head-to-Head Comparison</h2>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        {[["A",compareA,setCompareA],[" B",compareB,setCompareB]].map(([label,val,setter])=>(
          <div key={label}>
            <div style={{fontSize:11,fontWeight:700,color:"#888",marginBottom:4}}>POLITICIAN {label}</div>
            <select value={val||""} onChange={e=>setter(Number(e.target.value)||null)}
              style={{width:"100%",padding:"8px 12px",border:"1px solid #ddd",borderRadius:8,fontSize:13,boxSizing:"border-box"}}>
              <option value="">Select a politician…</option>
              {politicians.map(p=><option key={p.id} value={p.id}>{p.name} ({p.party})</option>)}
            </select>
          </div>
        ))}
      </div>

      {pA && pB && (
        <>
          {/* Score comparison */}
          <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:0,marginBottom:14,background:"#fff",borderRadius:12,overflow:"hidden",border:"1px solid #eee",boxShadow:"0 2px 10px rgba(0,0,0,0.06)"}}>
            {[pA,null,pB].map((p,i)=>{
              if (!p) return <div key="vs" style={{display:"flex",alignItems:"center",justifyContent:"center",background:"#f5f5f5",fontWeight:900,color:"#888",fontSize:16,padding:"0 8px"}}>VS</div>;
              const pc = PARTY_COLORS[p.party]||PARTY_COLORS.Independent;
              return (
                <div key={p.id} style={{padding:"16px",textAlign:i===2?"right":"left"}}>
                  <div style={{fontSize:11,fontWeight:700,color:pc.bg,marginBottom:4}}>{p.party}</div>
                  <div style={{fontFamily:"Georgia, serif",fontWeight:700,fontSize:15,marginBottom:8}}>{p.name}</div>
                  <div style={{display:"flex",gap:8,justifyContent:i===2?"flex-end":"flex-start",flexWrap:"wrap"}}>
                    {[["T",p.trustScore,tColor],["P",p.popularityScore,pColor],["AI",p.aiScore,aColor]].map(([l,s,c])=>(
                      <div key={l} style={{textAlign:"center"}}>
                        <div style={{fontSize:16,fontWeight:900,fontFamily:"monospace",color:c(s)}}>{s}</div>
                        <div style={{fontSize:9,color:"#aaa",fontWeight:600}}>{l}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Agreement summary */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
            <div style={{background:"#e8f5e8",borderRadius:10,padding:"12px",textAlign:"center"}}>
              <div style={{fontSize:24,fontWeight:900,color:"#2d7a2d"}}>{agreements}</div>
              <div style={{fontSize:11,color:"#2d7a2d",fontWeight:600}}>POLICY AGREEMENTS</div>
            </div>
            <div style={{background:"#fbe8e8",borderRadius:10,padding:"12px",textAlign:"center"}}>
              <div style={{fontSize:24,fontWeight:900,color:"#9e2d2d"}}>{disagreements}</div>
              <div style={{fontSize:11,color:"#9e2d2d",fontWeight:600}}>POLICY DISAGREEMENTS</div>
            </div>
          </div>

          {/* Policy by policy */}
          <div style={{background:"#fff",borderRadius:12,border:"1px solid #eee",overflow:"hidden",boxShadow:"0 2px 10px rgba(0,0,0,0.06)"}}>
            {POLICIES.map((policy,i)=>{
              const sA = getPolicyStance(pA,policy.key);
              const sB = getPolicyStance(pB,policy.key);
              const both = sA && sB;
              const agree = both && sA===sB;
              const stanceStyle = s => s==="for" ? {color:"#2d7a2d",label:"✅ Supportive"} : s==="against" ? {color:"#9e2d2d",label:"❌ Opposed"} : s==="mixed" ? {color:"#8a5f00",label:"⚖️ Mixed"} : {color:"#aaa",label:"— No record"};
              return (
                <div key={policy.key} style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",borderBottom:i<POLICIES.length-1?"1px solid #f0f0f0":"none",background:both?(agree?"#f8fff8":"#fff8f8"):"#fff"}}>
                  <div style={{padding:"10px 14px",fontSize:12,fontWeight:600,color:stanceStyle(sA).color}}>{stanceStyle(sA).label}</div>
                  <div style={{padding:"10px 6px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minWidth:80}}>
                    <span style={{fontSize:13}}>{policy.icon}</span>
                    <span style={{fontSize:10,color:"#888",fontWeight:600,textAlign:"center",lineHeight:1.2}}>{policy.label}</span>
                    {both && <span style={{fontSize:10,marginTop:2}}>{agree?"🤝":"⚡"}</span>}
                  </div>
                  <div style={{padding:"10px 14px",fontSize:12,fontWeight:600,color:stanceStyle(sB).color,textAlign:"right"}}>{stanceStyle(sB).label}</div>
                </div>
              );
            })}
          </div>
        </>
      )}
      {(!pA||!pB) && <div style={{textAlign:"center",padding:"30px",color:"#aaa",fontSize:13}}>Select two politicians above to compare their policy positions.</div>}
    </div>
  );
}

// ============================================================
// POLITICIAN DETAIL VIEW
// ============================================================
function DetailView({ politician, onBack, onVote, onSubmit, onAiScore, onGoPolicy, politicians }) {
  const [tab, setTab] = useState("overview");
  const [showModal, setShowModal] = useState(false);
  const [expandedPolicy, setExpandedPolicy] = useState(null);
  const [aiInsight, setAiInsight] = useState(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const party = PARTY_COLORS[politician.party]||PARTY_COLORS.Independent;
  const initials = politician.name.split(" ").map(n=>n[0]).join("").slice(0,2);

  // Group voting record by policy
  const votesByPolicy = useMemo(()=>{
    const grouped = {};
    for (const v of (politician.votingRecord||[])) {
      if (!grouped[v.policyKey]) grouped[v.policyKey]=[];
      grouped[v.policyKey].push(v);
    }
    return grouped;
  }, [politician.votingRecord]);

  const fetchAi = async () => {
    setLoadingAi(true);
    try {
      const prompt = `You are a neutral Australian political analyst. Analyse this Tasmanian politician and return ONLY valid JSON:
{"score": <integer 0-100, 50=neutral>, "analysis": "<exactly 3 sentences, factual, balanced>"}

Base the score on: promise follow-through, voting consistency with stated positions, and transparency. Do NOT factor in popularity.

Name: ${politician.name} | Party: ${politician.party} | Role: ${politician.role}
Promises: ${(politician.statements||[]).map(s=>`"${s.text}" → ${s.followed===true?"KEPT":s.followed===false?"BROKEN":"pending"}`).join("; ")||"None"}
Voting: ${(politician.votingRecord||[]).map(v=>`${v.bill} (${v.vote}, ${v.consistency})`).join("; ")||"None"}
Return ONLY JSON, no markdown.`;
      const resp = await fetch("/api/claude",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,messages:[{role:"user",content:prompt}]})});
      const data = await resp.json();
      const raw = data.content?.filter(b=>b.type==="text").map(b=>b.text).join("")||"{}";
      const parsed = JSON.parse(raw.replace(/```json|```/g,"").trim());
      setAiInsight(parsed.analysis||"Analysis unavailable.");
      if (typeof parsed.score==="number") onAiScore(politician.id,parsed.score);
    } catch { setAiInsight("AI analysis temporarily unavailable."); }
    setLoadingAi(false);
  };

  return (
    <div style={{maxWidth:720,margin:"0 auto"}}>
      {showModal && <SubmitModal politician={politician} onClose={()=>setShowModal(false)} onSubmit={d=>onSubmit(politician.id,d)} />}
      <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",color:"#1a3a6b",fontWeight:700,fontSize:13,padding:"0 0 14px",display:"flex",alignItems:"center",gap:5}}>← All politicians</button>

      <div style={{background:party.bg,borderRadius:14,padding:"20px 22px",marginBottom:14,color:"#fff"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
          <div style={{flex:1}}>
            <div style={{width:46,height:46,borderRadius:"50%",background:party.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:700,color:"#fff",marginBottom:10}}>{initials}</div>
            <h2 style={{margin:0,fontFamily:"Georgia, serif",fontSize:20}}>{politician.name}</h2>
            <div style={{opacity:0.75,fontSize:12,marginTop:3,lineHeight:1.4}}>{politician.role}</div>
            <div style={{opacity:0.55,fontSize:11,marginTop:3}}>{politician.party} · {politician.electorate}</div>
          </div>
          <MiniScores p={politician} size="lg" />
        </div>
        <p style={{margin:"12px 0 0",opacity:0.8,fontSize:13,lineHeight:1.55}}>{politician.bio}</p>
        <div style={{marginTop:12,background:"rgba(255,255,255,0.08)",borderRadius:10,padding:"10px 14px"}}>
          <div style={{fontSize:10,color:"rgba(255,255,255,0.55)",marginBottom:6,fontWeight:700,letterSpacing:0.5}}>👥 POPULARITY VOTE — does not affect Trust Score</div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>onVote(politician.id,"up")}   style={{flex:1,padding:"6px 0",background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.3)",borderRadius:8,color:"#fff",cursor:"pointer",fontSize:12,fontWeight:600}}>👍 Approve ({politician.upvotes})</button>
            <button onClick={()=>onVote(politician.id,"down")} style={{flex:1,padding:"6px 0",background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:8,color:"rgba(255,255,255,0.65)",cursor:"pointer",fontSize:12,fontWeight:600}}>👎 Disapprove ({politician.downvotes})</button>
          </div>
        </div>
      </div>

      <div style={{display:"flex",gap:4,marginBottom:14,overflowX:"auto",paddingBottom:2}}>
        {["overview","voting","statements","contradictions","submit"].map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{padding:"7px 13px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:tab===t?"#0d1b3e":"#f0f0f0",color:tab===t?"#fff":"#555",whiteSpace:"nowrap"}}>
            {t==="submit"?"➕ Submit":t==="contradictions"?`⚡ Contradictions${(politician.contradictions||[]).length>0?" ("+politician.contradictions.length+")":""}`:t.charAt(0).toUpperCase()+t.slice(1)}
          </button>
        ))}
      </div>

      <div style={{background:"#fff",borderRadius:12,padding:"18px 20px",boxShadow:"0 2px 10px rgba(0,0,0,0.06)",border:"1px solid #eee"}}>
        {tab==="overview" && (
          <div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:10,marginBottom:18}}>
              {[[`✅ Trust Score`,politician.trustScore,tColor,"#f0faf4","Verified evidence only — promises, voting consistency. No popularity influence."],[`👥 Popularity`,politician.popularityScore,pColor,"#f0f4ff","Community sentiment. Not a trustworthiness measure."],[`🤖 AI Score`,politician.aiScore,aColor,"#f5f0ff","Independent AI assessment of public record."]].map(([label,score,c,bg,note])=>(
                <div key={label} style={{background:bg,borderRadius:10,padding:"14px",borderLeft:`4px solid ${c(score)}`}}>
                  <div style={{fontSize:10,fontWeight:700,color:c(score),marginBottom:4}}>{label}</div>
                  <div style={{fontSize:28,fontWeight:900,fontFamily:"monospace",color:c(score)}}>{score}</div>
                  <div style={{fontSize:11,color:"#666",marginTop:4,lineHeight:1.4}}>{note}</div>
                </div>
              ))}
            </div>
            <div style={{background:"#fffbf0",borderRadius:10,padding:"10px 14px",marginBottom:18,fontSize:12,color:"#7a5500",borderLeft:"3px solid #e0a020",lineHeight:1.6}}>
              <strong>How to read these together:</strong> High Trust + Low Popularity may mean principled but unpopular decisions. High Popularity + Low Trust may mean saying what people want to hear without following through.
            </div>
            <div style={{borderTop:"1px solid #f0f0f0",paddingTop:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <h3 style={{fontFamily:"Georgia, serif",margin:0,fontSize:15}}>🤖 AI Analysis</h3>
                {!aiInsight&&<button onClick={fetchAi} disabled={loadingAi} style={{padding:"5px 14px",background:"#5c3a9e",color:"#fff",border:"none",borderRadius:20,cursor:"pointer",fontSize:12,fontWeight:600}}>{loadingAi?"Analysing…":"Generate AI Score"}</button>}
              </div>
              {aiInsight ? <div style={{background:"#f5f0ff",borderRadius:10,padding:"12px 14px",fontSize:13,lineHeight:1.65,color:"#333",borderLeft:"3px solid #5c3a9e"}}><div style={{fontSize:10,color:"#5c3a9e",fontWeight:700,marginBottom:5}}>NEUTRAL AI ASSESSMENT · Score: {politician.aiScore}/100</div>{aiInsight}</div>
               : loadingAi ? <div style={{color:"#888",fontSize:13}}>Analysing…</div>
               : <div style={{color:"#bbb",fontSize:13,fontStyle:"italic"}}>Click Generate for independent AI analysis of this politician's public record.</div>}
            </div>
          </div>
        )}

        {tab==="voting" && (
          <div>
            <h3 style={{fontFamily:"Georgia, serif",marginBottom:4,marginTop:0,fontSize:16}}>Voting Record by Policy</h3>
            <div style={{fontSize:12,color:"#888",marginBottom:14,lineHeight:1.6}}>
              Grouped by policy area. Click a policy to expand individual votes. Consistency with stated positions affects the <strong>Trust Score</strong> only.
              <br /><a href="https://www.parliament.tas.gov.au/hansard" target="_blank" rel="noreferrer" style={{color:"#4a90d9"}}>Tasmania Hansard</a> · <a href="https://theyvoteforyou.org.au" target="_blank" rel="noreferrer" style={{color:"#4a90d9"}}>They Vote For You</a>
            </div>
            {Object.keys(votesByPolicy).length===0 ? (
              <div style={{textAlign:"center",padding:"24px 0",color:"#aaa"}}>
                <div style={{fontSize:28,marginBottom:8}}>🗳️</div>
                <div style={{fontSize:13}}>No voting records submitted yet.</div>
                <button onClick={()=>setTab("submit")} style={{marginTop:8,padding:"6px 16px",background:"#1a3a6b",color:"#fff",border:"none",borderRadius:20,cursor:"pointer",fontSize:12,fontWeight:600}}>Submit voting data</button>
              </div>
            ) : POLICIES.filter(p=>votesByPolicy[p.key]).map(policy=>{
              const votes = votesByPolicy[policy.key];
              const forCount = votes.filter(v=>{ const d=DIVISION_MAP[v.divisionId]; return d?.inverse ? v.vote!=="for" : v.vote==="for"; }).length;
              const againstCount = votes.filter(v=>{ const d=DIVISION_MAP[v.divisionId]; return d?.inverse ? v.vote==="for" : v.vote!=="for"; }).length;
              const isExpanded = expandedPolicy===policy.key;
              return (
                <div key={policy.key} style={{marginBottom:8,borderRadius:10,border:"1px solid #eee",overflow:"hidden"}}>
                  <div onClick={()=>setExpandedPolicy(isExpanded?null:policy.key)}
                    style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",cursor:"pointer",background:isExpanded?"#f8f9ff":"#fff"}}
                    onMouseEnter={e=>e.currentTarget.style.background="#f8f9ff"}
                    onMouseLeave={e=>!isExpanded&&(e.currentTarget.style.background="")}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:18}}>{policy.icon}</span>
                      <div>
                        <div style={{fontWeight:700,fontSize:13,color:"#1a1a2e"}}>{policy.label}</div>
                        <div style={{fontSize:11,color:"#888"}}>{votes.length} vote{votes.length!==1?"s":""}</div>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:6,alignItems:"center"}}>
                      {forCount>0&&<span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:"#e8f5e8",color:"#2d7a2d",fontWeight:700}}>✅ {forCount}</span>}
                      {againstCount>0&&<span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:"#fbe8e8",color:"#9e2d2d",fontWeight:700}}>❌ {againstCount}</span>}
                      <span style={{color:"#aaa",fontSize:12}}>{isExpanded?"▲":"▼"}</span>
                    </div>
                  </div>
                  {isExpanded && (
                    <div style={{borderTop:"1px solid #eee"}}>
                      {votes.map((v,i)=>{
                        const div = DIVISION_MAP[v.divisionId];
                        const effectiveFor = div?.inverse ? v.vote!=="for" : v.vote==="for";
                        return (
                        <div key={v.id} style={{padding:"10px 14px",borderBottom:i<votes.length-1?"1px solid #f5f5f5":"none",background:"#fafbff"}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:3}}>
                            <div style={{fontWeight:600,fontSize:12,color:"#222"}}>{v.bill}</div>
                            <div style={{display:"flex",gap:4,flexShrink:0}}>
                              <VoteTag vote={v.vote} />
                              {div?.inverse && <span style={{fontSize:10,padding:"1px 6px",borderRadius:20,background:"#fff7e0",color:"#8a5f00",fontWeight:700}}>inverse</span>}
                              <span style={{fontSize:10}}>{v.consistency==="consistent"?"✅":"❌"}</span>
                            </div>
                          </div>
                          <div style={{fontSize:11,color:"#888"}}>{fmtDate(v.date)}</div>
                          {div?.inverse && <div style={{fontSize:11,color:"#8a5f00",marginTop:2}}>Effective stance: {effectiveFor?"✅ Supportive":"❌ Opposed"} (inverse division)</div>}
                          <div style={{fontSize:11,marginTop:2,color:v.consistency==="consistent"?"#2d7a2d":"#b03030",fontWeight:600}}>
                            {v.consistency==="consistent"?"Consistent with stated position (+5 Trust)":"Inconsistent with stated position (−8 Trust)"}
                          </div>
                          <div style={{fontSize:10,color:"#aaa",marginTop:2}}>Source: {v.source}</div>
                        </div>
                        );
                      })}
                      <div style={{padding:"8px 14px",background:"#f5f8ff"}}>
                        <button onClick={()=>onGoPolicy(policy.key)} style={{fontSize:11,color:"#4a90d9",background:"none",border:"none",cursor:"pointer",padding:0,fontWeight:600}}>
                          → See all politicians on {policy.label}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab==="statements" && (
          <div>
            <h3 style={{fontFamily:"Georgia, serif",marginBottom:4,marginTop:0,fontSize:16}}>Statements & Promises</h3>
            <div style={{fontSize:12,color:"#888",marginBottom:14}}>Affect <strong>Trust Score only</strong>. Kept +10 · Broken −15 · Pending verified +2</div>
            {(!politician.statements||politician.statements.length===0)&&!politician.pendingData?.length
              ? <div style={{color:"#aaa",fontStyle:"italic",fontSize:13}}>No statements recorded yet.</div>
              : (politician.statements||[]).map((s,i)=>(
                <div key={i} style={{marginBottom:12,paddingBottom:12,borderBottom:i<(politician.statements||[]).length-1?"1px solid #f0f0f0":"none"}}>
                  <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
                    <div style={{fontSize:13,color:"#333",lineHeight:1.5,fontStyle:"italic"}}>"{s.text}"</div>
                    <div style={{fontSize:16,minWidth:20}}>{s.followed===true?"✅":s.followed===false?"❌":"⏳"}</div>
                  </div>
                  <div style={{fontSize:11,color:"#aaa",marginTop:4}}>
                    {fmtDate(s.date)} ·{" "}
                    {s.followed===true?<span style={{color:"#2d9e5f",fontWeight:700}}>Kept (+10 Trust)</span>:s.followed===false?<span style={{color:"#c0392b",fontWeight:700}}>Broken (−15 Trust)</span>:"Outcome pending (+2 Trust)"}
                  </div>
                </div>
              ))}
            {politician.pendingData?.length>0&&(
              <div style={{background:"#fffbf0",borderRadius:8,padding:"10px 12px",marginTop:8,borderLeft:"3px solid #e0a020"}}>
                <div style={{fontSize:11,fontWeight:700,color:"#b07800",marginBottom:5}}>⏳ PENDING REVIEW ({politician.pendingData.length})</div>
                {politician.pendingData.map((d,i)=><div key={i} style={{fontSize:12,color:"#777",marginBottom:3}}>{d.content} — <span style={{color:"#aaa"}}>{d.source}</span></div>)}
              </div>
            )}
          </div>
        )}

        {tab==="contradictions" && (
          <div>
            {(politician.contradictions||[]).length === 0 ? (
              <div style={{textAlign:"center",padding:"32px 20px",color:"#aaa"}}>
                <div style={{fontSize:32,marginBottom:10}}>⚡</div>
                <div style={{fontSize:14,marginBottom:4}}>No contradictions recorded yet.</div>
                <div style={{fontSize:12,lineHeight:1.6}}>
                  Run <code style={{background:"#f0f0f0",padding:"1px 6px",borderRadius:4}}>python tastrack_scraper.py --mode speeches</code> to detect contradictions from Hansard transcripts.
                </div>
              </div>
            ) : (
              <ContradictionsTab
                politicians={[politician]}
                singleMemberMode={true}
              />
            )}
          </div>
        )}

        {tab==="submit" && (
          <div>
            <h3 style={{fontFamily:"Georgia, serif",marginBottom:8,marginTop:0,fontSize:16}}>Submit Verified Data</h3>
            <div style={{display:"grid",gap:8,marginBottom:14}}>
              <div style={{background:"#f0faf4",borderRadius:8,padding:"10px 12px",fontSize:12,color:"#2d5a3d"}}><strong>Affects Trust Score:</strong> verified statements, kept/broken promises, voting consistency</div>
              <div style={{background:"#f0f4ff",borderRadius:8,padding:"10px 12px",fontSize:12,color:"#2d3a7a"}}><strong>Does NOT affect Trust Score:</strong> up/down votes — those only move Popularity Score</div>
            </div>
            <p style={{fontSize:13,color:"#666",marginBottom:14,lineHeight:1.6}}>Submissions go to a moderation queue. Nothing goes live without review. Voting records: <a href="https://www.parliament.tas.gov.au/hansard" target="_blank" rel="noreferrer" style={{color:"#4a90d9"}}>Tasmania Hansard</a></p>
            <button onClick={()=>setShowModal(true)} style={{background:"#1a3a6b",color:"#fff",border:"none",borderRadius:10,padding:"12px 20px",fontSize:14,fontWeight:700,cursor:"pointer",width:"100%"}}>➕ Submit New Data</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// SUBMIT MODAL
// ============================================================
function SubmitModal({ politician, onClose, onSubmit }) {
  const [type,setType]=useState("statement");
  const [content,setContent]=useState("");
  const [source,setSource]=useState("");
  const [outcome,setOutcome]=useState("pending");
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"#fff",borderRadius:16,padding:24,maxWidth:480,width:"100%",boxShadow:"0 10px 40px rgba(0,0,0,0.25)",maxHeight:"90vh",overflowY:"auto"}}>
        <h3 style={{margin:"0 0 4px",fontFamily:"Georgia, serif",fontSize:17}}>Submit Data for {politician.name}</h3>
        <div style={{background:"#fffbf0",borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:12,color:"#7a5500",borderLeft:"3px solid #e0a020"}}>⚠️ Reviewed by moderators before going live. Source required.</div>
        <label style={{fontSize:12,fontWeight:700,color:"#555",display:"block",marginBottom:4}}>TYPE</label>
        <select value={type} onChange={e=>setType(e.target.value)} style={{width:"100%",padding:"8px 12px",border:"1px solid #ddd",borderRadius:8,fontSize:14,marginBottom:12}}>
          <option value="statement">Public Statement</option>
          <option value="promise">Promise (with outcome)</option>
          <option value="vote">Voting Record</option>
          <option value="action">Policy Action</option>
          <option value="position">Position on Issue</option>
        </select>
        <label style={{fontSize:12,fontWeight:700,color:"#555",display:"block",marginBottom:4}}>CONTENT</label>
        <textarea value={content} onChange={e=>setContent(e.target.value)} rows={3} placeholder={type==="vote"?"e.g. Voted FOR the Housing Bill on 3 Feb 2025":type==="promise"?"e.g. Promised to reduce hospital wait times":"Describe the statement, action or position..."} style={{width:"100%",padding:"8px 12px",border:"1px solid #ddd",borderRadius:8,fontSize:14,resize:"vertical",boxSizing:"border-box",marginBottom:12}} />
        {(type==="promise"||type==="vote")&&(
          <>
            <label style={{fontSize:12,fontWeight:700,color:"#555",display:"block",marginBottom:4}}>{type==="promise"?"OUTCOME":"CONSISTENCY WITH STATED POSITION"}</label>
            <select value={outcome} onChange={e=>setOutcome(e.target.value)} style={{width:"100%",padding:"8px 12px",border:"1px solid #ddd",borderRadius:8,fontSize:14,marginBottom:12}}>
              {type==="promise"?<><option value="pending">Outcome pending</option><option value="kept">✅ Promise kept</option><option value="broken">❌ Promise broken</option></>
                :<><option value="pending">Not assessed</option><option value="consistent">✅ Consistent with stated position</option><option value="inconsistent">❌ Contradicts stated position</option></>}
            </select>
          </>
        )}
        <label style={{fontSize:12,fontWeight:700,color:"#555",display:"block",marginBottom:4}}>SOURCE (required)</label>
        <input value={source} onChange={e=>setSource(e.target.value)} placeholder="e.g. Tasmania Hansard, The Mercury 12 Jan 2025, or https://..." style={{width:"100%",padding:"8px 12px",border:"1px solid #ddd",borderRadius:8,fontSize:14,boxSizing:"border-box",marginBottom:6}} />
        <div style={{fontSize:11,color:"#aaa",marginBottom:16}}>
          Find voting records at <a href="https://www.parliament.tas.gov.au/hansard" target="_blank" rel="noreferrer" style={{color:"#4a90d9"}}>Tasmania Hansard</a> · <a href="https://theyvoteforyou.org.au" target="_blank" rel="noreferrer" style={{color:"#4a90d9"}}>They Vote For You</a>
        </div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onClose} style={{flex:1,padding:10,border:"1px solid #ddd",borderRadius:8,background:"#fff",cursor:"pointer",fontSize:14}}>Cancel</button>
          <button onClick={()=>{if(content&&source){onSubmit({type,content,source,outcome});onClose();}}} style={{flex:2,padding:10,border:"none",borderRadius:8,background:content&&source?"#1a3a6b":"#ccc",color:"#fff",cursor:content&&source?"pointer":"not-allowed",fontSize:14,fontWeight:700}}>Submit for Review</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// POLITICIAN LIST CARD
// ============================================================
function PoliticianCard({ politician, onClick, policyFilter, getPolicyStance }) {
  const party = PARTY_COLORS[politician.party]||PARTY_COLORS.Independent;
  const initials = politician.name.split(" ").map(n=>n[0]).join("").slice(0,2);
  const stance = policyFilter ? getPolicyStance(politician, policyFilter) : null;
  const stanceInfo = stance==="for"?{bg:"#e8f5e8",color:"#2d7a2d",label:"✅ Supportive"}:stance==="against"?{bg:"#fbe8e8",color:"#9e2d2d",label:"❌ Opposed"}:stance==="mixed"?{bg:"#fff7e0",color:"#8a5f00",label:"⚖️ Mixed"}:null;
  return (
    <div onClick={onClick} style={{background:"#fff",borderRadius:12,overflow:"hidden",boxShadow:"0 2px 10px rgba(0,0,0,0.07)",cursor:"pointer",border:"1px solid #eee",transition:"transform 0.15s, box-shadow 0.15s"}}
      onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 6px 20px rgba(0,0,0,0.12)";}}
      onMouseLeave={e=>{e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="0 2px 10px rgba(0,0,0,0.07)";}}>
      <div style={{background:party.bg,padding:"12px 14px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div style={{width:32,height:32,borderRadius:"50%",background:party.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff"}}>{initials}</div>
          <span style={{background:"rgba(255,255,255,0.2)",color:"#fff",borderRadius:20,padding:"2px 8px",fontSize:10,fontWeight:600}}>{politician.party}</span>
        </div>
        <div style={{color:"#fff",fontFamily:"Georgia, serif",fontSize:13,fontWeight:700,marginTop:7}}>{politician.name}</div>
        <div style={{color:"rgba(255,255,255,0.6)",fontSize:10,marginTop:2,lineHeight:1.3}}>{politician.role.length>50?politician.role.slice(0,50)+"…":politician.role}</div>
      </div>
      <div style={{padding:"10px 14px"}}>
        <MiniScores p={politician} />
        {stanceInfo && <div style={{marginTop:8,padding:"4px 10px",borderRadius:20,background:stanceInfo.bg,display:"inline-block",fontSize:11,fontWeight:700,color:stanceInfo.color}}>{stanceInfo.label}</div>}
        <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#ccc",marginTop:stanceInfo?6:8}}>
          <span>📍 {politician.electorate}</span>
          <span>👍{politician.upvotes} 👎{politician.downvotes}</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================
export default function App() {
  const [politicians, setPoliticians] = useState(()=>SEED.map(enrich));
  const [selected,    setSelected]    = useState(null);
  const [activeTab,   setActiveTab]   = useState("politicians"); // politicians | policies | contradictions
  const [search,      setSearch]      = useState("");
  const [filterParty, setFilterParty] = useState("All");
  const [filterElec,  setFilterElec]  = useState("All");
  const [filterPolicy,setFilterPolicy]= useState(null);
  const [sortBy,      setSortBy]      = useState("name");
  const [toast,       setToast]       = useState(null);
  const [gotoPolicy,  setGotoPolicy]  = useState(null);

  const showToast = msg => { setToast(msg); setTimeout(()=>setToast(null),3200); };

  const getPolicyStance = useCallback((politician, policyKey) => {
    const votes = (politician.votingRecord||[]).filter(v=>v.policyKey===policyKey);
    if (!votes.length) return null;
    let f = 0, a = 0;
    for (const v of votes) {
      const div = DIVISION_MAP[v.divisionId];
      const effectiveVote = div?.inverse ? (v.vote==="for" ? "against" : "for") : v.vote;
      if (effectiveVote==="for") f++; else a++;
    }
    if (f>a) return "for"; if (a>f) return "against"; return "mixed";
  }, []);

  const recompute = useCallback((id,updater)=>{
    const reEnrich = p => {const p2=updater(p); return {...p2,trustScore:calcTrustScore(p2.statements,p2.votingRecord),popularityScore:calcPopularityScore(p2.upvotes,p2.downvotes)};};
    setPoliticians(prev=>prev.map(p=>p.id===id?reEnrich(p):p));
    setSelected(prev=>prev?.id===id?reEnrich(prev):prev);
  },[]);

  const handleVote    = useCallback((id,dir)  =>{recompute(id,p=>({...p,upvotes:p.upvotes+(dir==="up"?1:0),downvotes:p.downvotes+(dir==="down"?1:0)}));showToast(dir==="up"?"👍 Approval recorded":"👎 Disapproval recorded");},[recompute]);
  const handleSubmit  = useCallback((id,data) =>{recompute(id,p=>({...p,pendingData:[...(p.pendingData||[]),{...data,status:"pending"}]}));showToast("✅ Submitted! Awaiting review.");},[recompute]);
  const handleAiScore = useCallback((id,score)=>{setPoliticians(p=>p.map(q=>q.id===id?{...q,aiScore:score}:q));setSelected(p=>p?.id===id?{...p,aiScore:score}:p);showToast(`🤖 AI Score: ${score}/100`);},[]);

  const handleGoPolicy = useCallback((policyKey)=>{
    setSelected(null);
    setActiveTab("policies");
    setGotoPolicy(policyKey);
  },[]);

  const parties     = ["All","Liberal","Labor","Greens","Independent","SFF"];
  const electorates = ["All","Bass","Braddon","Clark","Franklin","Lyons"];

  let filtered = politicians.filter(p=>
    (filterParty==="All"||p.party===filterParty)&&
    (filterElec==="All"||p.electorate===filterElec)&&
    (!filterPolicy||getPolicyStance(p,filterPolicy)!==null)&&
    (p.name.toLowerCase().includes(search.toLowerCase())||p.party.toLowerCase().includes(search.toLowerCase()))
  );
  if (sortBy==="trust_desc")   filtered=[...filtered].sort((a,b)=>b.trustScore-a.trustScore);
  if (sortBy==="trust_asc")    filtered=[...filtered].sort((a,b)=>a.trustScore-b.trustScore);
  if (sortBy==="popular_desc") filtered=[...filtered].sort((a,b)=>b.popularityScore-a.popularityScore);
  if (sortBy==="name")         filtered=[...filtered].sort((a,b)=>a.name.localeCompare(b.name));
  if (filterPolicy) filtered=[...filtered].sort((a,b)=>{const order={for:0,mixed:1,against:2};return (order[getPolicyStance(a,filterPolicy)]??3)-(order[getPolicyStance(b,filterPolicy)]??3);});

  const avgTrust   = Math.round(politicians.reduce((a,p)=>a+p.trustScore,0)/politicians.length);
  const avgPopular = Math.round(politicians.reduce((a,p)=>a+p.popularityScore,0)/politicians.length);
  const seatCounts = ["Liberal","Labor","Greens","Independent","SFF"].map(p=>({party:p,seats:politicians.filter(m=>m.party===p).length,color:PARTY_COLORS[p]?.accent||"#888"}));

  return (
    <div style={{minHeight:"100vh",background:"#f2f4f8",fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
      <div style={{background:"#0d1b3e",padding:"14px 18px",position:"sticky",top:0,zIndex:50,boxShadow:"0 2px 12px rgba(0,0,0,0.25)"}}>
        <div style={{maxWidth:740,margin:"0 auto",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{color:"#fff",fontFamily:"Georgia, serif",fontSize:17,fontWeight:700}}>🗳️ TasTrack</div>
            <div style={{color:"rgba(255,255,255,0.35)",fontSize:9,letterSpacing:1.5}}>TASMANIA POLITICIAN ACCOUNTABILITY</div>
          </div>
          {!selected && (
            <div style={{display:"flex",gap:4}}>
              {[["politicians","👤 Politicians"],["policies","🗂️ Policies"],["contradictions","⚡ Contradictions"]].map(([t,l])=>(
                <button key={t} onClick={()=>{setActiveTab(t);if(t==="politicians")setGotoPolicy(null);}} style={{padding:"6px 12px",borderRadius:20,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,background:activeTab===t?"rgba(255,255,255,0.25)":"rgba(255,255,255,0.08)",color:"#fff"}}>{l}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {toast&&<div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:"#1a3a6b",color:"#fff",borderRadius:10,padding:"10px 20px",fontSize:13,fontWeight:600,zIndex:999,boxShadow:"0 4px 20px rgba(0,0,0,0.3)",whiteSpace:"nowrap"}}>{toast}</div>}

      <div style={{maxWidth:740,margin:"0 auto",padding:"16px 12px"}}>
        {selected ? (
          <DetailView politician={selected} onBack={()=>setSelected(null)} onVote={handleVote} onSubmit={handleSubmit} onAiScore={handleAiScore} onGoPolicy={handleGoPolicy} politicians={politicians} />
        ) : activeTab==="contradictions" ? (
          <ContradictionsTab politicians={politicians} onSelectPolitician={p=>{setSelected(p);}} />
        ) : activeTab==="policies" ? (
          <PolicyHub politicians={politicians} onSelectPolitician={p=>{setSelected(p);}} gotoPolicy={gotoPolicy} />
        ) : (
          <>
            {/* Search + filters */}
            <div style={{marginBottom:14}}>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name or party…"
                style={{width:"100%",padding:"10px 14px",borderRadius:10,border:"1px solid #ddd",fontSize:14,boxSizing:"border-box",marginBottom:8}} />
              <div style={{display:"flex",gap:5,overflowX:"auto",paddingBottom:4,marginBottom:5}}>
                {parties.map(p=><button key={p} onClick={()=>setFilterParty(p)} style={{padding:"5px 11px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:filterParty===p?(PARTY_COLORS[p]?.bg||"#0d1b3e"):"#e8eaf0",color:filterParty===p?"#fff":"#555",whiteSpace:"nowrap"}}>{p}</button>)}
              </div>
              <div style={{display:"flex",gap:5,overflowX:"auto",paddingBottom:4,alignItems:"center",marginBottom:5}}>
                {electorates.map(e=><button key={e} onClick={()=>setFilterElec(e)} style={{padding:"5px 10px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:filterElec===e?"#4a5568":"#e8eaf0",color:filterElec===e?"#fff":"#555",whiteSpace:"nowrap"}}>{e}</button>)}
              </div>
              {/* Policy filter row */}
              <div style={{display:"flex",gap:5,overflowX:"auto",paddingBottom:4,alignItems:"center"}}>
                <span style={{fontSize:11,color:"#888",fontWeight:600,whiteSpace:"nowrap"}}>Filter by policy:</span>
                <button onClick={()=>setFilterPolicy(null)} style={{padding:"4px 10px",borderRadius:20,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,background:!filterPolicy?"#1a3a6b":"#e8eaf0",color:!filterPolicy?"#fff":"#555",whiteSpace:"nowrap"}}>All</button>
                {POLICIES.map(p=><button key={p.key} onClick={()=>setFilterPolicy(filterPolicy===p.key?null:p.key)} style={{padding:"4px 10px",borderRadius:20,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,background:filterPolicy===p.key?"#1a3a6b":"#e8eaf0",color:filterPolicy===p.key?"#fff":"#555",whiteSpace:"nowrap"}}>{p.icon} {p.label}</button>)}
                <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{marginLeft:"auto",padding:"5px 10px",borderRadius:20,border:"1px solid #ddd",fontSize:11,cursor:"pointer",background:"#fff",flexShrink:0}}>
                  <option value="name">A–Z</option>
                  <option value="trust_desc">Highest Trust</option>
                  <option value="trust_asc">Lowest Trust</option>
                  <option value="popular_desc">Most Popular</option>
                </select>
              </div>
            </div>

            {/* Summary */}
            <div style={{background:"#fff",borderRadius:12,padding:"12px 16px",marginBottom:14,boxShadow:"0 1px 6px rgba(0,0,0,0.06)",border:"1px solid #eee"}}>
              <div style={{display:"flex",gap:16,flexWrap:"wrap",marginBottom:8}}>
                <div><div style={{fontSize:20,fontWeight:800,color:"#0d1b3e"}}>35</div><div style={{fontSize:10,color:"#999"}}>MEMBERS</div></div>
                <div><div style={{fontSize:20,fontWeight:800,color:tColor(avgTrust)}}>{avgTrust}</div><div style={{fontSize:10,color:"#999"}}>AVG TRUST</div></div>
                <div><div style={{fontSize:20,fontWeight:800,color:pColor(avgPopular)}}>{avgPopular}</div><div style={{fontSize:10,color:"#999"}}>AVG POPULARITY</div></div>
                <div><div style={{fontSize:20,fontWeight:800,color:"#888"}}>{filtered.length}</div><div style={{fontSize:10,color:"#999"}}>SHOWING</div></div>
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:6}}>
                {seatCounts.map(s=><div key={s.party} style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:"#666"}}><div style={{width:8,height:8,borderRadius:"50%",background:s.color}}/>{s.party} {s.seats}</div>)}
              </div>
              <div style={{fontSize:10,color:"#bbb",borderTop:"1px solid #f5f5f5",paddingTop:6}}>Trust = evidence only · Popularity = community sentiment · AI = independent · All three are separate</div>
            </div>

            {filterPolicy && (
              <div style={{background:"#e8f0ff",borderRadius:10,padding:"10px 14px",marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{fontSize:12,color:"#1a3a6b",fontWeight:600}}>
                  {POLICIES.find(p=>p.key===filterPolicy)?.icon} Filtering by: <strong>{POLICIES.find(p=>p.key===filterPolicy)?.label}</strong> — showing politicians with voting records on this policy, ranked by stance
                </div>
                <button onClick={()=>setFilterPolicy(null)} style={{fontSize:11,background:"none",border:"none",cursor:"pointer",color:"#888"}}>✕ Clear</button>
              </div>
            )}

            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(265px, 1fr))",gap:10}}>
              {filtered.map(p=><PoliticianCard key={p.id} politician={p} onClick={()=>setSelected(p)} policyFilter={filterPolicy} getPolicyStance={getPolicyStance} />)}
            </div>
            {filtered.length===0&&<div style={{textAlign:"center",padding:40,color:"#aaa"}}>No politicians match your filter.</div>}

            <div style={{marginTop:18,textAlign:"center",fontSize:10,color:"#ccc",lineHeight:1.9}}>
              All 35 members · 52nd Parliament · July 2025 · Voting data: <a href="https://www.parliament.tas.gov.au/hansard" target="_blank" rel="noreferrer" style={{color:"#bbb"}}>Tasmania Hansard</a> · <a href="https://theyvoteforyou.org.au" target="_blank" rel="noreferrer" style={{color:"#bbb"}}>They Vote For You</a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
