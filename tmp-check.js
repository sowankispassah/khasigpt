const { drizzle } = require("drizzle-orm/postgres-js");
const postgres = require("postgres");

(async () => {
  const client = postgres(process.env.POSTGRES_URL, { max: 1 });
  const db = drizzle(client);
  try {
    const result = await db.execute(`SELECT table_schema, table_name FROM information_schema.tables WHERE table_name = 'ContactMessage'`);
    console.log(result);
  } catch (error) {
    console.error('query failed:', error);
  } finally {
    await client.end();
  }
})();
