import { useState, useCallback, useMemo } from "react";

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
    divisions: [
      { id:"d_h1", bill:"Residential Tenancy Amendment (No-Cause Evictions) Bill", date:"2024-09-12", outcome:"defeated", summary:"Would have banned no-cause evictions for renters." },
      { id:"d_h2", bill:"Short-Stay Accommodation Regulation Bill",                 date:"2024-11-20", outcome:"passed",   summary:"Introduced limits on Airbnb-style short-stay rentals in high-demand areas." },
    ]
  },
  {
    key: "environment",
    label: "Environment & Climate",
    icon: "🌿",
    description: "Native forest logging, salmon farming, climate targets, marine parks, land clearing.",
    divisions: [
      { id:"d_e1", bill:"Native Forest Protection Bill",               date:"2023-09-14", outcome:"defeated", summary:"Would have ended all native forest logging in Tasmania." },
      { id:"d_e2", bill:"Salmon Farming Regulation Amendment",         date:"2025-09-01", outcome:"passed",   summary:"Introduced a pause on salmon farming expansion pending independent environmental review." },
      { id:"d_e3", bill:"Marine Park Expansion (Macquarie Harbour)",   date:"2024-03-08", outcome:"defeated", summary:"Would have expanded marine protected zones around Macquarie Harbour." },
    ]
  },
  {
    key: "health",
    label: "Health & Hospitals",
    icon: "🏥",
    description: "Hospital funding, elective surgery wait times, mental health services, ambulance ramping.",
    divisions: [
      { id:"d_h3", bill:"Health System Reform (Additional Funding) Bill", date:"2024-06-18", outcome:"passed",   summary:"Allocated additional state funding for elective surgery and emergency departments." },
      { id:"d_h4", bill:"Mental Health Community Care Amendment",          date:"2023-10-05", outcome:"passed",   summary:"Expanded community-based mental health service funding." },
    ]
  },
  {
    key: "gambling",
    label: "Gambling Reform",
    icon: "🎰",
    description: "Pokies removal from pubs and clubs, gambling harm reduction, casino licensing.",
    divisions: [
      { id:"d_g1", bill:"Gaming Control Amendment (Pokies Removal) Bill", date:"2024-02-14", outcome:"defeated", summary:"Would have removed poker machines from all pubs and clubs by 2026." },
    ]
  },
  {
    key: "stadium",
    label: "Macquarie Point Stadium",
    icon: "🏟️",
    description: "The proposed $700M+ AFL stadium at Macquarie Point in Hobart — a major political flashpoint.",
    divisions: [
      { id:"d_s1", bill:"Macquarie Point Development Corporation Amendment", date:"2024-08-22", outcome:"passed",   summary:"Approved planning and funding framework for the Macquarie Point stadium development." },
      { id:"d_s2", bill:"Stadium Cost Disclosure Motion",                     date:"2025-03-11", outcome:"defeated", summary:"Motion to require full public disclosure of stadium cost projections." },
    ]
  },
  {
    key: "fiscal",
    label: "Fiscal Policy & Debt",
    icon: "💰",
    description: "State budget, debt management, asset privatisation, public service funding.",
    divisions: [
      { id:"d_f1", bill:"Budget 2024-25",                              date:"2024-06-20", outcome:"passed",   summary:"State budget forecasting four consecutive deficits and debt reaching $10.8B by 2028-29." },
      { id:"d_f2", bill:"Asset Privatisation Prevention Motion",        date:"2024-10-15", outcome:"defeated", summary:"Motion to prevent privatisation of state-owned assets." },
    ]
  },
  {
    key: "governance",
    label: "Governance & Accountability",
    icon: "⚖️",
    description: "No-confidence motions, parliamentary transparency, integrity commission, disclosure laws.",
    divisions: [
      { id:"d_gov1", bill:"No-confidence motion in Premier Rockliff", date:"2025-06-05", outcome:"passed",   summary:"Motion of no-confidence passed 18-17 (including Speaker casting vote), triggering a snap election." },
      { id:"d_gov2", bill:"Integrity Commission Funding Amendment",    date:"2024-04-30", outcome:"passed",   summary:"Increased funding and investigative powers for the Tasmanian Integrity Commission." },
    ]
  },
  {
    key: "transport",
    label: "Transport & Infrastructure",
    icon: "🚢",
    description: "Spirit of Tasmania ferry replacement, road infrastructure, public transport.",
    divisions: [
      { id:"d_t1", bill:"TT-Line (Spirit of Tasmania) Funding Bill", date:"2023-08-10", outcome:"passed",   summary:"Allocated funding for Spirit of Tasmania ferry replacement — later plagued by delays." },
    ]
  },
];

// ============================================================
// POLITICIAN DATA
// votingRecord entries must include policyKey and divisionId
// to link to the policy/division system above
// ============================================================
const SEED = [
  { id:1,  name:"Janie Finlay",      party:"Labor",       role:"Deputy Leader of the Opposition; Member for Bass",                           electorate:"Bass",     bio:"Labor MP for Bass since 2021. Deputy Leader of the Opposition under Josh Willie.",                                                                    upvotes:4,  downvotes:2,  aiScore:50, statements:[], pendingData:[],
    votingRecord:[
      { id:"v1a", bill:"Housing System Reform (Additional Funding) Bill", date:"2024-06-18", vote:"for",     policyKey:"health",      divisionId:"d_h3", consistency:"consistent",   source:"Tasmania Hansard" },
    ]},
  { id:2,  name:"Jess Greene",       party:"Labor",       role:"Member for Bass",                                                            electorate:"Bass",     bio:"Newly elected Labor MP for Bass in 2025, replacing retiring Michelle O'Byrne.",                                                                        upvotes:2,  downvotes:1,  aiScore:50, statements:[], votingRecord:[], pendingData:[] },
  { id:3,  name:"Cecily Rosol",      party:"Greens",      role:"Member for Bass",                                                            electorate:"Bass",     bio:"Greens MP for Bass, elected 2024.",                                                                                                                        upvotes:5,  downvotes:2,  aiScore:50, statements:[], pendingData:[],
    votingRecord:[
      { id:"v3a", bill:"Gaming Control Amendment (Pokies Removal) Bill",  date:"2024-02-14", vote:"for",     policyKey:"gambling",    divisionId:"d_g1", consistency:"consistent",   source:"Tasmania Hansard" },
      { id:"v3b", bill:"Native Forest Protection Bill",                    date:"2023-09-14", vote:"for",     policyKey:"environment", divisionId:"d_e1", consistency:"consistent",   source:"Tasmania Hansard" },
    ]},
  { id:4,  name:"George Razay",      party:"Independent", role:"Member for Bass",                                                            electorate:"Bass",     bio:"Independent MP for Bass, elected 2025. Anti-stadium position was central to his campaign.",                                                              upvotes:6,  downvotes:3,  aiScore:50, statements:[], pendingData:[],
    votingRecord:[
      { id:"v4a", bill:"Macquarie Point Development Corporation Amendment", date:"2024-08-22", vote:"against", policyKey:"stadium",    divisionId:"d_s1", consistency:"consistent",   source:"Tasmania Hansard" },
      { id:"v4b", bill:"Stadium Cost Disclosure Motion",                    date:"2025-03-11", vote:"for",     policyKey:"stadium",    divisionId:"d_s2", consistency:"consistent",   source:"Tasmania Hansard" },
    ]},
  { id:5,  name:"Bridget Archer",    party:"Liberal",     role:"Minister for Health; Minister for Ageing; Minister for Aboriginal Affairs",   electorate:"Bass",     bio:"Liberal Minister for Health. Previously a Federal MP.",                                                                                               upvotes:5,  downvotes:3,  aiScore:50, statements:[], pendingData:[],
    votingRecord:[
      { id:"v5a", bill:"Health System Reform (Additional Funding) Bill",    date:"2024-06-18", vote:"for",     policyKey:"health",      divisionId:"d_h3", consistency:"consistent",   source:"Tasmania Hansard" },
      { id:"v5b", bill:"Mental Health Community Care Amendment",            date:"2023-10-05", vote:"for",     policyKey:"health",      divisionId:"d_h4", consistency:"consistent",   source:"Tasmania Hansard" },
    ]},
  { id:6,  name:"Michael Ferguson",  party:"Liberal",     role:"Deputy Premier; Minister for Infrastructure and Transport",                   electorate:"Bass",     bio:"Deputy Premier since 2022. Liberal MP for Bass since 2010. Responsible for the significantly delayed Spirit of Tasmania ferry replacement.",        upvotes:3,  downvotes:6,  aiScore:50, pendingData:[],
    statements:[
      { id:"s6a", text:"The Spirit of Tasmania replacement ferries will be delivered on schedule.", date:"2022-11-01", verified:true, followed:false },
    ],
    votingRecord:[
      { id:"v6a", bill:"TT-Line (Spirit of Tasmania) Funding Bill",         date:"2023-08-10", vote:"for",     policyKey:"transport",   divisionId:"d_t1", consistency:"consistent",   source:"Tasmania Hansard" },
      { id:"v6b", bill:"Asset Privatisation Prevention Motion",             date:"2024-10-15", vote:"against", policyKey:"fiscal",      divisionId:"d_f2", consistency:"consistent",   source:"Tasmania Hansard" },
    ]},
  { id:7,  name:"Rob Fairs",         party:"Liberal",     role:"Member for Bass",                                                            electorate:"Bass",     bio:"Liberal MP for Bass, first elected 2024.",                                                                                                                 upvotes:2,  downvotes:2,  aiScore:50, statements:[], votingRecord:[], pendingData:[] },
  // BRADDON
  { id:8,  name:"Anita Dow",         party:"Labor",       role:"Member for Braddon",                                                          electorate:"Braddon",  bio:"Labor MP for Braddon since 2018. Former Deputy Leader of the Opposition.",                                                                              upvotes:5,  downvotes:2,  aiScore:50, statements:[], pendingData:[],
    votingRecord:[
      { id:"v8a", bill:"Residential Tenancy Amendment (No-Cause Evictions) Bill", date:"2024-09-12", vote:"for", policyKey:"housing", divisionId:"d_h1", consistency:"consistent", source:"Tasmania Hansard" },
      { id:"v8b", bill:"Gaming Control Amendment (Pokies Removal) Bill",          date:"2024-02-14", vote:"for", policyKey:"gambling", divisionId:"d_g1", consistency:"consistent", source:"Tasmania Hansard" },
    ]},
  { id:9,  name:"Shane Broad",       party:"Labor",       role:"Member for Braddon",                                                          electorate:"Braddon",  bio:"Labor MP for Braddon since 2017 with a PhD. Strong policy background.",                                                                                  upvotes:6,  downvotes:2,  aiScore:50, statements:[], votingRecord:[], pendingData:[] },
  { id:10, name:"Craig Garland",     party:"Independent", role:"Member for Braddon",                                                          electorate:"Braddon",  bio:"Independent MP, former commercial fisherman. Supported no-confidence motion then withdrew support for Labor's government bid.",                        upvotes:8,  downvotes:3,  aiScore:50, statements:[], pendingData:[],
    votingRecord:[
      { id:"v10a", bill:"Salmon Farming Regulation Amendment",               date:"2025-09-01", vote:"for",     policyKey:"environment", divisionId:"d_e2", consistency:"consistent",   source:"Tasmania Hansard" },
      { id:"v10b", bill:"Marine Park Expansion (Macquarie Harbour)",         date:"2024-03-08", vote:"for",     policyKey:"environment", divisionId:"d_e3", consistency:"consistent",   source:"Tasmania Hansard" },
      { id:"v10c", bill:"No-confidence motion in Premier Rockliff",          date:"2025-06-05", vote:"for",     policyKey:"governance",  divisionId:"d_gov1", consistency:"consistent", source:"Tasmania Hansard" },
    ]},
  { id:11, name:"Jeremy Rockliff",   party:"Liberal",     role:"Premier of Tasmania",                                                         electorate:"Braddon",  bio:"Premier of Tasmania and Liberal Leader. Governing in minority since 2024. Recommissioned as Premier after surviving the August 2025 no-confidence vote.", upvotes:8, downvotes:12, aiScore:50, pendingData:[],
    statements:[
      { id:"s11a", text:"We will deliver a balanced budget and reduce the state's debt.",          date:"2023-06-01", verified:true, followed:false },
      { id:"s11b", text:"Salmon farming expansions will be paused pending an independent review.", date:"2025-08-17", verified:true, followed:true  },
      { id:"s11c", text:"We will reduce elective surgery wait times within 12 months.",            date:"2023-03-15", verified:true, followed:false },
    ],
    votingRecord:[
      { id:"v11a", bill:"Budget 2024-25",                                    date:"2024-06-20", vote:"for",     policyKey:"fiscal",      divisionId:"d_f1", consistency:"inconsistent", source:"Tasmania Hansard — contradicts stated commitment to debt reduction" },
      { id:"v11b", bill:"Salmon Farming Regulation Amendment",               date:"2025-09-01", vote:"for",     policyKey:"environment", divisionId:"d_e2", consistency:"consistent",   source:"Tasmania Hansard" },
      { id:"v11c", bill:"Macquarie Point Development Corporation Amendment", date:"2024-08-22", vote:"for",     policyKey:"stadium",     divisionId:"d_s1", consistency:"consistent",   source:"Tasmania Hansard" },
      { id:"v11d", bill:"Asset Privatisation Prevention Motion",             date:"2024-10-15", vote:"against", policyKey:"fiscal",      divisionId:"d_f2", consistency:"consistent",   source:"Tasmania Hansard" },
    ]},
  { id:12, name:"Gavin Pearce",      party:"Liberal",     role:"Member for Braddon",                                                          electorate:"Braddon",  bio:"Liberal MP for Braddon, elected 2025. Replaced Miriam Beswick (National).",                                                                            upvotes:2,  downvotes:2,  aiScore:50, statements:[], votingRecord:[], pendingData:[] },
  { id:13, name:"Felix Ellis",       party:"Liberal",     role:"Member for Braddon",                                                          electorate:"Braddon",  bio:"Liberal MP for Braddon, serving since 2020.",                                                                                                               upvotes:3,  downvotes:2,  aiScore:50, statements:[], votingRecord:[], pendingData:[] },
  { id:14, name:"Roger Jaensch",     party:"Liberal",     role:"Minister for Education, Children and Youth",                                  electorate:"Braddon",  bio:"Liberal Minister for Education serving since 2014.",                                                                                                       upvotes:4,  downvotes:3,  aiScore:50, statements:[], votingRecord:[], pendingData:[] },
  // CLARK
  { id:15, name:"Ella Haddad",       party:"Labor",       role:"Member for Clark",                                                            electorate:"Clark",    bio:"Labor MP for Clark since 2018. Strong advocate for housing and social policy.",                                                                          upvotes:7,  downvotes:2,  aiScore:50, statements:[], pendingData:[],
    votingRecord:[
      { id:"v15a", bill:"Residential Tenancy Amendment (No-Cause Evictions) Bill", date:"2024-09-12", vote:"for",  policyKey:"housing",   divisionId:"d_h1", consistency:"consistent",   source:"Tasmania Hansard" },
      { id:"v15b", bill:"Short-Stay Accommodation Regulation Bill",                date:"2024-11-20", vote:"for",  policyKey:"housing",   divisionId:"d_h2", consistency:"consistent",   source:"Tasmania Hansard" },
      { id:"v15c", bill:"Gaming Control Amendment (Pokies Removal) Bill",          date:"2024-02-14", vote:"for",  policyKey:"gambling",  divisionId:"d_g1", consistency:"consistent",   source:"Tasmania Hansard" },
    ]},
  { id:16, name:"Josh Willie",       party:"Labor",       role:"Leader of the Opposition",                                                    electorate:"Clark",    bio:"Labor Leader since August 2025. Won leadership spill over Dean Winter. Former Legislative Council member for Elwick (2016–2024).",               upvotes:6,  downvotes:3,  aiScore:50, pendingData:[],
    statements:[
      { id:"s16a", text:"A Labor Party I lead will stand first and foremost for creating good, well-paid, safe and secure jobs.", date:"2025-08-20", verified:true, followed:null },
    ],
    votingRecord:[
      { id:"v16a", bill:"No-confidence motion in Premier Rockliff",          date:"2025-06-05", vote:"for",  policyKey:"governance", divisionId:"d_gov1", consistency:"consistent",   source:"Tasmania Hansard" },
      { id:"v16b", bill:"Asset Privatisation Prevention Motion",             date:"2024-10-15", vote:"for",  policyKey:"fiscal",     divisionId:"d_f2",   consistency:"consistent",   source:"Tasmania Hansard" },
    ]},
  { id:17, name:"Vica Bayley",       party:"Greens",      role:"Member for Clark",                                                            electorate:"Clark",    bio:"Greens MP for Clark since 2023. Focus on housing and environmental issues.",                                                                             upvotes:8,  downvotes:2,  aiScore:50, statements:[], pendingData:[],
    votingRecord:[
      { id:"v17a", bill:"Residential Tenancy Amendment (No-Cause Evictions) Bill", date:"2024-09-12", vote:"for",  policyKey:"housing",     divisionId:"d_h1", consistency:"consistent",   source:"Tasmania Hansard" },
      { id:"v17b", bill:"Native Forest Protection Bill",                           date:"2023-09-14", vote:"for",  policyKey:"environment", divisionId:"d_e1", consistency:"consistent",   source:"Tasmania Hansard" },
      { id:"v17c", bill:"Gaming Control Amendment (Pokies Removal) Bill",          date:"2024-02-14", vote:"for",  policyKey:"gambling",    divisionId:"d_g1", consistency:"consistent",   source:"Tasmania Hansard" },
      { id:"v17d", bill:"Stadium Cost Disclosure Motion",                          date:"2025-03-11", vote:"for",  policyKey:"stadium",     divisionId:"d_s2", consistency:"consistent",   source:"Tasmania Hansard" },
      { id:"v17e", bill:"No-confidence motion in Premier Rockliff",               date:"2025-06-05", vote:"for",  policyKey:"governance",  divisionId:"d_gov1", consistency:"consistent", source:"Tasmania Hansard" },
    ]},
  { id:18, name:"Helen Burnet",      party:"Greens",      role:"Member for Clark",                                                            electorate:"Clark",    bio:"Greens MP for Clark, elected 2024.",                                                                                                                       upvotes:5,  downvotes:2,  aiScore:50, statements:[], pendingData:[],
    votingRecord:[
      { id:"v18a", bill:"Native Forest Protection Bill",                     date:"2023-09-14", vote:"for",  policyKey:"environment", divisionId:"d_e1", consistency:"consistent",   source:"Tasmania Hansard" },
      { id:"v18b", bill:"Mental Health Community Care Amendment",            date:"2023-10-05", vote:"for",  policyKey:"health",      divisionId:"d_h4", consistency:"consistent",   source:"Tasmania Hansard" },
    ]},
  { id:19, name:"Kristie Johnston",  party:"Independent", role:"Member for Clark",                                                            electorate:"Clark",    bio:"Independent MP for Clark since 2021. Previously signed confidence and supply with Rockliff government but voted for the 2025 no-confidence motion.", upvotes:7, downvotes:4, aiScore:50, statements:[], pendingData:[],
    votingRecord:[
      { id:"v19a", bill:"No-confidence motion in Premier Rockliff",          date:"2025-06-05", vote:"for",     policyKey:"governance", divisionId:"d_gov1", consistency:"consistent",   source:"Tasmania Hansard" },
      { id:"v19b", bill:"Integrity Commission Funding Amendment",            date:"2024-04-30", vote:"for",     policyKey:"governance", divisionId:"d_gov2", consistency:"consistent",   source:"Tasmania Hansard" },
    ]},
  { id:20, name:"Marcus Vermey",     party:"Liberal",     role:"Member for Clark",                                                            electorate:"Clark",    bio:"Liberal MP for Clark, newly elected 2025 replacing Simon Behrakis.",                                                                                     upvotes:2,  downvotes:2,  aiScore:50, statements:[], votingRecord:[], pendingData:[] },
  { id:21, name:"Madeleine Ogilvie", party:"Liberal",     role:"Minister for Justice; Minister for Corrections and Probation",               electorate:"Clark",    bio:"Liberal Minister for Justice. Unique background — served as a Labor MP 2014–2018, then re-entered as Liberal.",                                    upvotes:4,  downvotes:3,  aiScore:50, statements:[], votingRecord:[], pendingData:[] },
  // FRANKLIN
  { id:22, name:"Dean Winter",       party:"Labor",       role:"Shadow Treasurer; Member for Franklin",                                       electorate:"Franklin", bio:"Former Opposition Leader (Apr 2024–Aug 2025). Lost leadership to Josh Willie after the failed no-confidence motion. Now Shadow Treasurer.",         upvotes:5,  downvotes:6,  aiScore:50, pendingData:[],
    statements:[
      { id:"s22a", text:"A Labor government will focus on creating and protecting good, well-paid jobs.", date:"2024-04-10", verified:true, followed:null },
    ],
    votingRecord:[
      { id:"v22a", bill:"No-confidence motion in Premier Rockliff",          date:"2025-06-05", vote:"for",     policyKey:"governance", divisionId:"d_gov1", consistency:"consistent",   source:"Tasmania Hansard" },
      { id:"v22b", bill:"Macquarie Point Development Corporation Amendment", date:"2024-08-22", vote:"for",     policyKey:"stadium",    divisionId:"d_s1",   consistency:"inconsistent", source:"Tasmania Hansard — reversed prior anti-stadium position" },
    ]},
  { id:23, name:"Meg Brown",         party:"Labor",       role:"Member for Franklin",                                                         electorate:"Franklin", bio:"Labor MP for Franklin, elected 2024.",                                                                                                                     upvotes:3,  downvotes:1,  aiScore:50, statements:[], votingRecord:[], pendingData:[] },
  { id:24, name:"Rosalie Woodruff",  party:"Greens",      role:"Greens Leader; Member for Franklin",                                          electorate:"Franklin", bio:"Leader of the Tasmanian Greens since 2018. Known for salmon farming, native forests and social justice advocacy.",                                    upvotes:14, downvotes:4,  aiScore:50, pendingData:[],
    statements:[
      { id:"s24a", text:"We will end native forest logging within this parliamentary term.", date:"2023-02-14", verified:true, followed:null  },
      { id:"s24b", text:"Salmon farms must be removed from Macquarie Harbour.",             date:"2022-09-01", verified:true, followed:false },
    ],
    votingRecord:[
      { id:"v24a", bill:"Native Forest Protection Bill",                     date:"2023-09-14", vote:"for",     policyKey:"environment", divisionId:"d_e1",   consistency:"consistent",   source:"Tasmania Hansard" },
      { id:"v24b", bill:"Salmon Farming Regulation Amendment",               date:"2025-09-01", vote:"for",     policyKey:"environment", divisionId:"d_e2",   consistency:"consistent",   source:"Tasmania Hansard" },
      { id:"v24c", bill:"Marine Park Expansion (Macquarie Harbour)",         date:"2024-03-08", vote:"for",     policyKey:"environment", divisionId:"d_e3",   consistency:"consistent",   source:"Tasmania Hansard" },
      { id:"v24d", bill:"Gaming Control Amendment (Pokies Removal) Bill",    date:"2024-02-14", vote:"for",     policyKey:"gambling",    divisionId:"d_g1",   consistency:"consistent",   source:"Tasmania Hansard" },
      { id:"v24e", bill:"Stadium Cost Disclosure Motion",                    date:"2025-03-11", vote:"for",     policyKey:"stadium",     divisionId:"d_s2",   consistency:"consistent",   source:"Tasmania Hansard" },
      { id:"v24f", bill:"No-confidence motion in Premier Rockliff",          date:"2025-06-05", vote:"for",     policyKey:"governance",  divisionId:"d_gov1", consistency:"consistent",   source:"Tasmania Hansard" },
    ]},
  { id:25, name:"David O'Byrne",     party:"Independent", role:"Member for Franklin",                                                         electorate:"Franklin", bio:"Former Labor leader turned independent. Voted against the 2025 no-confidence motion, siding with the Liberal government.",                        upvotes:4,  downvotes:5,  aiScore:50, statements:[], pendingData:[],
    votingRecord:[
      { id:"v25a", bill:"No-confidence motion in Premier Rockliff",          date:"2025-06-05", vote:"against", policyKey:"governance", divisionId:"d_gov1", consistency:"consistent",   source:"Tasmania Hansard" },
    ]},
  { id:26, name:"Peter George",      party:"Independent", role:"Member for Franklin",                                                         electorate:"Franklin", bio:"Independent MP for Franklin, newly elected 2025. Replaced Liberal Nic Street.",                                                                         upvotes:4,  downvotes:2,  aiScore:50, statements:[], votingRecord:[], pendingData:[] },
  { id:27, name:"Eric Abetz",        party:"Liberal",     role:"Leader of the House; Treasurer; Minister for Macquarie Point Urban Renewal",  electorate:"Franklin", bio:"Senior Liberal MP and Treasurer. Former Federal Senator (1994–2022). Key driver of the Macquarie Point Stadium project.",                          upvotes:5,  downvotes:9,  aiScore:50, statements:[], pendingData:[],
    votingRecord:[
      { id:"v27a", bill:"Macquarie Point Development Corporation Amendment", date:"2024-08-22", vote:"for",     policyKey:"stadium",    divisionId:"d_s1",   consistency:"consistent",   source:"Tasmania Hansard" },
      { id:"v27b", bill:"Budget 2024-25",                                    date:"2024-06-20", vote:"for",     policyKey:"fiscal",     divisionId:"d_f1",   consistency:"consistent",   source:"Tasmania Hansard" },
      { id:"v27c", bill:"Asset Privatisation Prevention Motion",             date:"2024-10-15", vote:"against", policyKey:"fiscal",     divisionId:"d_f2",   consistency:"consistent",   source:"Tasmania Hansard" },
    ]},
  { id:28, name:"Jacquie Petrusma",  party:"Liberal",     role:"Member for Franklin",                                                         electorate:"Franklin", bio:"Liberal MP for Franklin, serving since 2010 with a break from 2022–2024.",                                                                            upvotes:3,  downvotes:3,  aiScore:50, statements:[], votingRecord:[], pendingData:[] },
  // LYONS
  { id:29, name:"Jen Butler",        party:"Labor",       role:"Member for Lyons",                                                            electorate:"Lyons",    bio:"Labor MP for Lyons since 2018. Former teacher focused on education and regional services.",                                                              upvotes:6,  downvotes:2,  aiScore:50, statements:[], votingRecord:[], pendingData:[] },
  { id:30, name:"Brian Mitchell",    party:"Labor",       role:"Member for Lyons",                                                            electorate:"Lyons",    bio:"Newly elected Labor state MP for Lyons 2025. Former Federal MP for Lyons (2016–2025).",                                                               upvotes:4,  downvotes:2,  aiScore:50, statements:[], votingRecord:[], pendingData:[] },
  { id:31, name:"Tabatha Badger",    party:"Greens",      role:"Member for Lyons",                                                            electorate:"Lyons",    bio:"Greens MP for Lyons, elected 2024.",                                                                                                                       upvotes:5,  downvotes:2,  aiScore:50, statements:[], pendingData:[],
    votingRecord:[
      { id:"v31a", bill:"Native Forest Protection Bill",                     date:"2023-09-14", vote:"for",  policyKey:"environment", divisionId:"d_e1", consistency:"consistent",   source:"Tasmania Hansard" },
      { id:"v31b", bill:"Gaming Control Amendment (Pokies Removal) Bill",    date:"2024-02-14", vote:"for",  policyKey:"gambling",   divisionId:"d_g1", consistency:"consistent",   source:"Tasmania Hansard" },
    ]},
  { id:32, name:"Carlo Di Falco",    party:"SFF",         role:"Member for Lyons",                                                            electorate:"Lyons",    bio:"Shooters, Fishers and Farmers MP — first SFF member elected in Tasmania.",                                                                               upvotes:5,  downvotes:4,  aiScore:50, statements:[], pendingData:[],
    votingRecord:[
      { id:"v32a", bill:"Salmon Farming Regulation Amendment",               date:"2025-09-01", vote:"against", policyKey:"environment", divisionId:"d_e2", consistency:"consistent",   source:"Tasmania Hansard — SFF generally supports primary industries" },
      { id:"v32b", bill:"Native Forest Protection Bill",                     date:"2023-09-14", vote:"against", policyKey:"environment", divisionId:"d_e1", consistency:"consistent",   source:"Tasmania Hansard" },
    ]},
  { id:33, name:"Guy Barnett",       party:"Liberal",     role:"Minister for Natural Resources and Water; Minister for Mining",               electorate:"Lyons",    bio:"Senior Liberal minister serving since 2014. Responsible for natural resources and mining.",                                                          upvotes:3,  downvotes:4,  aiScore:50, statements:[], pendingData:[],
    votingRecord:[
      { id:"v33a", bill:"Native Forest Protection Bill",                     date:"2023-09-14", vote:"against", policyKey:"environment", divisionId:"d_e1", consistency:"consistent",   source:"Tasmania Hansard" },
      { id:"v33b", bill:"Marine Park Expansion (Macquarie Harbour)",         date:"2024-03-08", vote:"against", policyKey:"environment", divisionId:"d_e3", consistency:"consistent",   source:"Tasmania Hansard" },
    ]},
  { id:34, name:"Jane Howlett",      party:"Liberal",     role:"Minister for Small Business; Minister for Racing",                           electorate:"Lyons",    bio:"Liberal Minister for Small Business since 2024.",                                                                                                         upvotes:4,  downvotes:2,  aiScore:50, statements:[], votingRecord:[], pendingData:[] },
  { id:35, name:"Mark Shelton",      party:"Liberal",     role:"Member for Lyons",                                                           electorate:"Lyons",    bio:"Liberal MP for Lyons since 2010. Former Speaker of the House of Assembly.",                                                                             upvotes:3,  downvotes:3,  aiScore:50, statements:[], votingRecord:[], pendingData:[] },
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
// eslint-disable-next-line no-unused-vars
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
    const forCount = votes.filter(v=>v.vote==="for").length;
    const againstCount = votes.filter(v=>v.vote==="against").length;
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
                {/* Who voted how on this specific division */}
                <div style={{marginTop:8,display:"flex",flexWrap:"wrap",gap:4}}>
                  {politicians.filter(p=>(p.votingRecord||[]).some(v=>v.divisionId===d.id)).map(p=>{
                    const vr = (p.votingRecord||[]).find(v=>v.divisionId===d.id);
                    return (
                      <span key={p.id} onClick={()=>onSelectPolitician(p)}
                        style={{fontSize:11,padding:"2px 8px",borderRadius:20,cursor:"pointer",fontWeight:600,
                          background:vr.vote==="for"?"#e8f5e8":"#fbe8e8",
                          color:vr.vote==="for"?"#2d7a2d":"#9e2d2d",
                          border:`1px solid ${vr.vote==="for"?"#b8dfc0":"#f0bcbc"}`}}>
                        {p.name.split(" ")[1]||p.name.split(" ")[0]} {vr.vote==="for"?"✓":"✗"}
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
      const resp = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,messages:[{role:"user",content:prompt}]})});
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
        {["overview","voting","statements","submit"].map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{padding:"7px 13px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:tab===t?"#0d1b3e":"#f0f0f0",color:tab===t?"#fff":"#555",whiteSpace:"nowrap"}}>
            {t==="submit"?"➕ Submit":t.charAt(0).toUpperCase()+t.slice(1)}
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
              const forCount = votes.filter(v=>v.vote==="for").length;
              const againstCount = votes.filter(v=>v.vote==="against").length;
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
                      {votes.map((v,i)=>(
                        <div key={v.id} style={{padding:"10px 14px",borderBottom:i<votes.length-1?"1px solid #f5f5f5":"none",background:"#fafbff"}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:3}}>
                            <div style={{fontWeight:600,fontSize:12,color:"#222"}}>{v.bill}</div>
                            <div style={{display:"flex",gap:4,flexShrink:0}}>
                              <VoteTag vote={v.vote} />
                              <span style={{fontSize:10}}>{v.consistency==="consistent"?"✅":"❌"}</span>
                            </div>
                          </div>
                          <div style={{fontSize:11,color:"#888"}}>{fmtDate(v.date)}</div>
                          <div style={{fontSize:11,marginTop:2,color:v.consistency==="consistent"?"#2d7a2d":"#b03030",fontWeight:600}}>
                            {v.consistency==="consistent"?"Consistent with stated position (+5 Trust)":"Inconsistent with stated position (−8 Trust)"}
                          </div>
                          <div style={{fontSize:10,color:"#aaa",marginTop:2}}>Source: {v.source}</div>
                        </div>
                      ))}
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
  const [activeTab,   setActiveTab]   = useState("politicians"); // politicians | policies
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
    const f = votes.filter(v=>v.vote==="for").length;
    const a = votes.filter(v=>v.vote==="against").length;
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
              {[["politicians","👤 Politicians"],["policies","🗂️ Policies"]].map(([t,l])=>(
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
