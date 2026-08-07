import "dotenv/config";
import postgres from "postgres";
import { resolveJobLocation } from "@/lib/jobs/location";
import { NO_SALARY_LABEL, resolveJobSalaryInfo } from "@/lib/jobs/salary";
import { extractDocumentText } from "@/lib/uploads/document-parser";

type RepairableJobRow = {
  id: string;
  title: string;
  location: string | null;
  salary: string | null;
  description: string | null;
  pdf_source_url: string | null;
  pdf_content: string | null;
};

const DEFAULT_MAX_TEXT_CHARS = 140_000;
const DEFAULT_TIMEOUT_MS = 45_000;

async function main() {
  const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("POSTGRES_URL or DATABASE_URL is required.");
  }

  const sql = postgres(connectionString, {
    ssl: connectionString.includes("sslmode") ? "require" : undefined,
  });

  try {
    const rows = await sql<RepairableJobRow[]>`
      select id, title, location, salary, description, pdf_source_url, pdf_content
      from jobs
      where pdf_source_url is not null
        and (
          coalesce(pdf_content, '') = ''
          or coalesce(salary, '') = ''
          or coalesce(location, '') = ''
          or lower(coalesce(location, '')) = 'unknown'
        )
      order by created_at desc
    `;

    let repairedCount = 0;

    for (const row of rows) {
      const pdfSourceUrl = row.pdf_source_url?.trim() ?? "";
      if (!pdfSourceUrl) {
        continue;
      }

      try {
        const parsed = await extractDocumentText(
          {
            name: "job-notification.pdf",
            url: pdfSourceUrl,
            mediaType: "application/pdf",
          },
          {
            maxTextChars: DEFAULT_MAX_TEXT_CHARS,
            downloadTimeoutMs: DEFAULT_TIMEOUT_MS,
          }
        );

        const salaryInfo = resolveJobSalaryInfo({
          salary: row.salary,
          pdfContent: parsed.text,
          content: row.description,
        });

        const nextSalary =
          salaryInfo.summary === NO_SALARY_LABEL ? null : salaryInfo.summary;
        const nextLocation = resolveJobLocation({
          location: row.location,
          pdfContent: parsed.text,
          content: row.description,
        });

        await sql`
          update jobs
          set pdf_content = ${parsed.text},
              salary = ${nextSalary},
              location = ${nextLocation}
          where id = ${row.id}
        `;

        repairedCount += 1;
        console.log(
          `Repaired: ${row.title} -> salary=${nextSalary ?? NO_SALARY_LABEL}, location=${nextLocation}`
        );
      } catch (error) {
        console.warn(`Failed to repair ${row.title}`, error);
      }
    }

    console.log(`PDF compensation repair completed. Repaired ${repairedCount} job(s).`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error("Failed to repair job PDF compensation fields.");
  console.error(error);
  process.exit(1);
});
