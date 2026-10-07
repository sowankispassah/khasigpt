// Run with node --conditions=react-server --import dotenv/config --import tsx.
// The default is a dry run; pass --apply only to save the reviewed additions.
import { jobSources } from "@/config/jobSources";
import {
  listManagedJobSources,
  type ManagedJobSource,
  saveManagedJobSources,
} from "@/lib/jobs/source-registry";

const governmentSources = [
  ["Meghalaya Government Recruitment", "https://www.meghalaya.gov.in/recruitment"],
  ["Meghalaya Public Service Commission", "https://mpsc.meghalaya.gov.in/"],
  ["RPA Meghalaya Recruitment Portal", "https://rpa.meghalaya.gov.in/"],
  ["Personnel and Administrative Reforms", "https://personnel.meghalaya.gov.in/"],
  ["Meghalaya Government Announcements", "https://www.meghalaya.gov.in/whats-new/announcements"],
  ["East Khasi Hills Recruitment", "https://eastkhasihills.gov.in/recruitment-advertisements/"],
  ["West Khasi Hills Recruitment", "https://westkhasihills.gov.in/notice_category/recruitment/"],
  ["South West Khasi Hills Recruitment", "https://southwestkhasihills.gov.in/notice_category/recruitment/"],
  ["Eastern West Khasi Hills Recruitment", "https://easternwestkhasihills.meghalaya.gov.in/notice_category/recruitment/"],
  ["Ri Bhoi Recruitment", "https://ribhoi.gov.in/notice_category/recruitment/"],
  ["West Jaintia Hills Recruitment", "https://westjaintiahills.gov.in/notice_category/recruitment/"],
  ["East Jaintia Hills DSC", "https://eastjaintiahills.gov.in/notice_category/district-selection-committee/"],
  ["West Garo Hills Recruitment", "https://westgarohills.gov.in/notice_category/recruitment/"],
  ["East Garo Hills Recruitment", "https://eastgarohills.gov.in/notice_category/recruitment/"],
  ["North Garo Hills Recruitment", "https://northgarohills.gov.in/notice_category/recruitment/"],
  ["South Garo Hills Recruitment", "https://southgarohills.gov.in/notice_category/recruitment/"],
  ["South West Garo Hills Recruitment", "https://southwestgarohills.gov.in/notice_category/recruitment/"],
  ["Meghalaya Police Recruitment", "https://megpolice.gov.in/recruitment"],
  ["High Court of Meghalaya Recruitment", "https://meghalayahighcourt.nic.in/recruitment"],
  ["Meghalaya State Legal Services Authority", "https://meghalaya.nalsa.gov.in/recruitments/"],
  ["National Health Mission Meghalaya", "https://nhmmeghalaya.nic.in/recruitment.html"],
  ["Meghalaya Education Department", "https://www.megeducation.gov.in/"],
  ["Meghalaya Education Recruitment Board", "https://megeducation.gov.in/edu_dept/pages/merb.html"],
  ["DERT Education Application Portal", "https://dert.megeducation.gov.in/forms/home"],
  ["Meghalaya State Rural Livelihoods Society", "https://msrls.nic.in/recruitments"],
  ["State Rural Employment Society", "https://megsres.nic.in/recruitment"],
  ["Meghalaya State Skill Development Society", "https://mssds.nic.in/noticeboard/home.html"],
  ["Meghalaya Basin Development Authority", "https://mbda.gov.in/recruitment/"],
  ["Meghalaya Energy Corporation", "https://meecl.nic.in/index.php/recruitment/"],
  ["Meghalaya Industrial Development Corporation Advertisements", "https://midc.megindustry.gov.in/advertisements.html"],
  ["Meghalaya Cooperative Apex Bank", "https://megcab.bank.in/index.php/misc-information/recruitment"],
  ["Meghalaya Administrative Training Institute Vacancies", "https://mati.gov.in/vacancies"],
  ["MATI Recruitment Management System", "https://mati.gov.in/rms"],
  ["Meghalaya Biodiversity Board", "https://megbiodiversity.nic.in/recruitment"],
  ["Bio-Resources Development Centre", "https://megbrdc.nic.in/"],
  ["Meghalaya Industrial Development Corporation", "https://meghidc.com/"],
] as const;

async function main() {
  const current = await listManagedJobSources({ uncached: true });
  const now = new Date().toISOString();
  const existingUrls = new Set(current.map((source) => source.url));
  const additions: ManagedJobSource[] = [];

  // Keep the built-in LinkedIn searches active when the managed list takes over.
  if (current.length === 0) {
    for (const source of jobSources) {
      additions.push({
        id: crypto.randomUUID(), name: source.name, url: source.url,
        type: "linkedin", locationScope: "meghalaya_only", enabled: true,
        createdAt: now, updatedAt: now,
      });
      existingUrls.add(source.url);
    }
  }

  for (const [name, url] of governmentSources) {
    if (existingUrls.has(url)) continue;
    additions.push({
      id: crypto.randomUUID(), name, url, type: "auto",
      locationScope: "all_locations", enabled: false,
      createdAt: now, updatedAt: now,
    });
    existingUrls.add(url);
  }

  const apply = process.argv.includes("--apply");
  if (apply && additions.length > 0) await saveManagedJobSources([...current, ...additions]);
  console.log(JSON.stringify({ dryRun: !apply, proposed: additions.length,
    added: apply ? additions.length : 0, total: current.length + (apply ? additions.length : 0),
    governmentSourcesEnabled: 0 }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
