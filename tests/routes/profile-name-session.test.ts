import { createHmac, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { config } from "dotenv";
import { encode } from "next-auth/jwt";
import postgres from "postgres";

config({ path: ".env.local" });
config({ path: ".env", override: false });

test("web session refreshes a changed profile name from the database", async ({
  baseURL,
  request,
}) => {
  const origin = baseURL;
  const databaseUrl = process.env.POSTGRES_POOLER_URL ?? process.env.POSTGRES_URL;
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!origin || !databaseUrl || !secret) {
    throw new Error("Profile session test requires origin, database and auth configuration");
  }

  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  const id = randomUUID();
  const email = `profile-name-${id.slice(0, 8)}@example.invalid`;
  try {
    await sql`insert into "User" (id, email, "firstName", "lastName", "dateOfBirth")
      values (${id}, ${email}, 'Current', 'Person', '1986-07-16')`;

    const cookieName = origin.startsWith("https:")
      ? "__Secure-authjs.session-token"
      : "authjs.session-token";
    const staleSession = {
      id,
      sub: id,
      email,
      role: "regular",
      firstName: "Old",
      lastName: "Name",
      dateOfBirth: "1986-07-16",
      imageVersion: null,
      allowPersonalKnowledge: false,
      dbRefreshedAt: Date.now() - 6 * 60 * 1000,
    };
    const webToken = await encode({
      secret,
      salt: cookieName,
      token: staleSession,
    });
    const webResponse = await request.get(`${origin}/api/auth/session`, {
      headers: { Cookie: `${cookieName}=${webToken}` },
    });
    expect(webResponse.status()).toBe(200);
    const webSession = await webResponse.json();
    expect(webSession.user.firstName).toBe("Current");
    expect(webSession.user.lastName).toBe("Person");
    expect(webSession.user.name).toBe("Current Person");

    const mobilePayload = Buffer.from(
      JSON.stringify({ sub: id, exp: Date.now() + 120_000 })
    ).toString("base64url");
    const mobileToken = `${mobilePayload}.${createHmac("sha256", secret)
      .update(mobilePayload)
      .digest("base64url")}`;
    const mobileResponse = await request.get(
      `${origin}/api/mobile/auth/session`,
      { headers: { Authorization: `Bearer ${mobileToken}` } }
    );
    expect(mobileResponse.status()).toBe(200);
    const mobileSession = (await mobileResponse.json()).session;
    expect(mobileSession.user.firstName).toBe("Current");
    expect(mobileSession.user.lastName).toBe("Person");
  } finally {
    await sql`delete from "AuditLog" where "actorId" = ${id}`;
    await sql`delete from "User" where id = ${id} and email = ${email}`;
    await sql.end();
  }
});
