import { createHmac, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { encode } from "next-auth/jwt";
import postgres from "postgres";

config({ path: ".env.local" });
config({ path: ".env", override: false });

test("bundled job preview renders and PDF links enforce scoped authentication", async ({
  request,
  baseURL,
}) => {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  const databaseUrl = process.env.POSTGRES_POOLER_URL ?? process.env.POSTGRES_URL;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !databaseUrl || !supabaseUrl || !serviceKey || !baseURL) {
    throw new Error("Job PDF regression requires database, storage and auth configuration");
  }
  const sign = (payload: Record<string, unknown>) => {
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${encoded}.${createHmac("sha256", secret).update(encoded).digest("base64url")}`;
  };
  const supabase = createClient(supabaseUrl, serviceKey);
  const { data: jobs, error } = await supabase.from("jobs")
    .select("id,source_url,pdf_source_url,pdf_cached_url,description")
    .order("created_at", { ascending: false }).limit(40);
  if (error) throw error;
  const job = jobs?.find((row) => row.pdf_cached_url || row.pdf_source_url ||
    row.source_url?.includes(".pdf") || row.description?.includes("PDF Source:"));
  if (!job) throw new Error("No existing job PDF available for the regression check");

  const expired = sign({ jobId: job.id, type: "job-preview", exp: Date.now() - 60_000 });
  const wrongJob = sign({ jobId: randomUUID(), type: "job-preview", exp: Date.now() + 120_000 });
  const pdfPath = `/api/jobs/${job.id}/pdf`;
  for (const token of ["", expired, wrongJob]) {
    const response = await request.get(`${pdfPath}?token=${encodeURIComponent(token)}`);
    expect(response.status()).toBe(401);
  }

  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    // Jobs may be admin-only. Use an existing authorized account without writes.
    const [user] = await sql`select id, email, role from "User" where role = 'admin' limit 1`;
    if (!user) throw new Error("An admin account is required for the mobile auth regression");
    const headers = { Authorization: `Bearer ${sign({ sub: user.id, exp: Date.now() + 120_000 })}` };
    const detailResponse = await request.get(`/api/mobile/jobs/${job.id}`, { headers });
    expect(detailResponse.status()).toBe(200);
    const details = await detailResponse.json();
    expect(new URL(details.pdfUrl, baseURL).searchParams.get("token")).toBeTruthy();
    const preview = await request.get(details.pdfPreviewImageUrl);
    expect(preview.status()).toBe(200);
    expect(preview.headers()["content-type"]).toBe("image/png");
    const png = await preview.body();
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.readUInt32BE(16)).toBe(960);
    expect(png.readUInt32BE(20)).toBeGreaterThan(100);

    const expiredPreview = await request.get(
      `/api/mobile/jobs/${job.id}/preview-image?token=${encodeURIComponent(expired)}`,
      { headers }
    );
    expect(expiredPreview.status()).toBe(200);
    const signedPdf = await request.get(details.pdfUrl);
    expect(signedPdf.status()).toBe(200);
    expect((await signedPdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
    const bearerPdf = await request.get(pdfPath, { headers });
    expect(bearerPdf.status()).toBe(200);

    const cookieName = "authjs.session-token";
    const webSession = {
      id: user.id, sub: user.id, email: user.email, role: user.role,
      dbRefreshedAt: Date.now(),
    };
    const webToken = await encode({ secret, salt: cookieName, token: webSession });
    const webPdf = await request.get(pdfPath, { headers: { Cookie: `${cookieName}=${webToken}` } });
    expect(webPdf.status()).toBe(200);
  } finally {
    await sql.end();
  }
});
