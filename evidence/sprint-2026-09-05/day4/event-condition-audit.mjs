// How many analysis-event-condition diagnostics come from conditions that never
// mention an event at all (no github.event_name, no github.event.*)?
import fs from "node:fs"; import path from "node:path";
import YAML from "yaml";
import { narrowEvents } from "../../../dist/index.js";
const manifest = JSON.parse(fs.readFileSync("benchmark/manifest.json","utf8"));
let total=0, noEventRef=0, cases=new Set(), casesNoEventOnly=new Set(); const samples=new Map();
const mentionsEvent = (c) => /github\.event_name|github\.event\b|github\.event\./i.test(c) || /fromJSON/i.test(c);
for (const entry of manifest.cases) {
  const dir=`benchmark/snapshots/${entry.case_id}/.github/workflows`; if(!fs.existsSync(dir)) continue;
  let anyDiag=false, anyEventDiag=false;
  for (const f of fs.readdirSync(dir)) {
    let doc; try { doc=YAML.parse(fs.readFileSync(path.join(dir,f),"utf8")); } catch { continue; }
    if (!doc || typeof doc!=="object" || !doc.jobs) continue;
    const events=["push","pull_request","issues","issue_comment","pull_request_target","workflow_dispatch"];
    for (const job of Object.values(doc.jobs)) {
      if (!job || typeof job!=="object") continue;
      const conds=[job.if, ...(Array.isArray(job.steps)?job.steps.map(s=>s&&s.if):[])].filter(c=>c!==undefined&&c!==null);
      for (const c of conds) {
        const r=narrowEvents(events,c); if (r.complete) continue;
        total++; anyDiag=true;
        const cs=String(c);
        if (!mentionsEvent(cs)) { noEventRef++; const k=cs.replace(/\s+/g," ").slice(0,70); samples.set(k,(samples.get(k)??0)+1); } else anyEventDiag=true;
      }
    }
  }
  if (anyDiag) cases.add(entry.case_id);
  if (anyDiag && !anyEventDiag) casesNoEventOnly.add(entry.case_id);
}
console.log(`uninterpretable conditions: ${total}; of which reference no event at all: ${noEventRef} (${(100*noEventRef/total).toFixed(0)}%)`);
console.log(`cases with any such diagnostic: ${cases.size}; cases whose ONLY such diagnostics are event-free conditions: ${casesNoEventOnly.size}`);
console.log("most common event-free conditions:");
for (const [k,v] of [...samples].sort((a,b)=>b[1]-a[1]).slice(0,8)) console.log(`  ${v}x  ${k}`);
