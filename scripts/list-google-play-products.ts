import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });
config({ path: ".env", override: false });

const TOKENS_PER_CREDIT = 100;

async function main() {
  if (!process.env.POSTGRES_URL) {
    throw new Error("POSTGRES_URL is not defined");
  }

  const sql = postgres(process.env.POSTGRES_URL, {
    max: 1,
    ssl: process.env.POSTGRES_URL.includes("sslmode") ? "require" : undefined,
  });
  const plans = await sql<
    Array<{
      androidProductId: string | null;
      billingCycleDays: number;
      id: string;
      name: string;
      priceInPaise: number;
      tokenAllowance: number;
    }>
  >`
    SELECT
      "androidProductId",
      "billingCycleDays",
      "id",
      "name",
      "priceInPaise",
      "tokenAllowance"
    FROM "PricingPlan"
    WHERE "isActive" = true
      AND "deletedAt" IS NULL
    ORDER BY "priceInPaise" ASC, "tokenAllowance" ASC
  `;
  const paidPlans = plans
    .filter((plan) => plan.priceInPaise > 0)
    .sort((a, b) =>
      a.priceInPaise === b.priceInPaise
        ? a.tokenAllowance - b.tokenAllowance
        : a.priceInPaise - b.priceInPaise
    );

  if (paidPlans.length === 0) {
    console.log("No active paid plans found.");
    return;
  }

  console.log("Create these one-time products in Google Play Console:");
  for (const plan of paidPlans) {
    console.log(
      [
        `- ${plan.name}`,
        `productId=${getAndroidProductIdForPlan(plan)}`,
        `price=${(plan.priceInPaise / 100).toLocaleString("en-IN", {
          currency: "INR",
          style: "currency",
        })}`,
        `credits=${Math.floor(plan.tokenAllowance / TOKENS_PER_CREDIT).toLocaleString("en-IN")}`,
        `validityDays=${plan.billingCycleDays}`,
      ].join(" | ")
    );
  }

  await sql.end();
}

function getAndroidProductIdForPlan(plan: {
  androidProductId: string | null;
  id: string;
  name: string;
}) {
  return plan.androidProductId?.trim() || buildDefaultAndroidProductId(plan);
}

function buildDefaultAndroidProductId(plan: { id: string; name: string }) {
  const slug = plan.name
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .slice(0, 48);
  const suffix = plan.id.replace(/-/g, "").slice(0, 8);
  return `khasigpt_${slug || "plan"}_${suffix}`;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
