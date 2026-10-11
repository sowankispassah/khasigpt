import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";
import { z } from "zod";
import { supportConversationUrl, supportHistorySchema } from "@/lib/admin/user-details";

const id = "875f2bd9-7020-41d3-a253-a72cab386e64";
function loadModule(file: string, mocks: Record<string, unknown>) {
  const exports: Record<string, any> = {};
  const code = ts.transpileModule(readFileSync(path.join(process.cwd(), file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    require: (name: string) => {
      if (!(name in mocks)) throw new Error(`Unexpected dependency: ${name}`);
      return mocks[name];
    },
    console: { error() {}, warn() {} },
    Date,
  });
  return exports;
}
function routeHarness(
  admin: { id: string } | null,
  details = async (): Promise<unknown> => ({}),
  support = async (_id: string, _offset: number): Promise<unknown> => ({}),
) {
  return loadModule("app/api/admin/users/[id]/details/route.ts", {
    "next/server": {
      NextResponse: { json: (data: unknown, init?: ResponseInit) => Response.json(data, init) },
    },
    zod: { z },
    "@/lib/security/admin-api-auth": { requireAdminApiUser: async () => admin },
    "@/lib/db/admin-user-details": {
      getAdminUserDetails: details,
      getAdminUserSupportHistory: support,
    },
  }).GET;
}
const context = { params: Promise.resolve({ id }) };
function request(query = "") {
  return { nextUrl: new URL(`https://example.com/api/admin/users/${id}/details${query}`) };
}

test("user details rejects non-admin access before reading data", async () => {
  let reads = 0;
  const response = await routeHarness(null, async () => {
    reads++;
    return {};
  })(request(), context);
  expect(response.status).toBe(403);
  expect(reads).toBe(0);
  expect(response.headers.get("cache-control")).toBe("no-store");
});
test("details validates IDs, section and bounded support pagination", async () => {
  let reads = 0;
  const get = routeHarness({ id }, async () => {
    reads++;
    return {};
  });
  for (const query of [
    "?section=invalid",
    "?section=support&offset=-1",
    "?offset=1.5",
    "?offset=100001",
  ])
    expect((await get(request(query), context)).status).toBe(400);
  expect((await get(request(), { params: Promise.resolve({ id: "invalid" }) })).status).toBe(400);
  expect(reads).toBe(0);
});
test("support loads separately from account data and carries pagination", async () => {
  let accountReads = 0;
  const calls: unknown[] = [];
  const get = routeHarness(
    { id },
    async () => {
      accountReads++;
      throw new Error("optional account failure");
    },
    async (...args) => {
      calls.push(args);
      return { items: [], total: 0, offset: 10 };
    },
  );
  const response = await get(request("?section=support&offset=10"), context);
  expect(response.status).toBe(200);
  expect(accountReads).toBe(0);
  expect(calls).toEqual([[id, 10]]);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toMatchObject({ total: 0, currentAdminId: id });
});
test("missing and failed accounts have terminal non-cacheable responses", async () => {
  for (const [read, status] of [
    [async () => null, 404],
    [
      async () => {
        throw new Error("DB unavailable");
      },
      503,
    ],
  ] as const) {
    const response = await routeHarness({ id }, read)(request(), context);
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
  }
});

function dbHarness(options: { failActivity?: boolean; failSupport?: boolean } = {}) {
  const queries: any[] = [];
  const fields = (table: string, names: string[]) =>
    Object.fromEntries(names.map((name) => [name, `${table}.${name}`]));
  const schema = {
    user: fields("user", [
      "id",
      "email",
      "dateOfBirth",
      "updatedAt",
      "locationConsent",
      "locationLatitude",
      "locationLongitude",
      "locationAccuracy",
      "locationUpdatedAt",
    ]),
    userPresence: fields("presence", [
      "userId",
      "lastSeenAt",
      "lastPath",
      "device",
      "locale",
      "timezone",
      "city",
      "region",
      "country",
    ]),
    auditLog: fields("audit", ["createdAt", "subjectUserId", "action"]),
    contactMessage: fields("contact", [
      "id",
      "email",
      "kind",
      "subject",
      "status",
      "isViewed",
      "createdAt",
      "updatedAt",
      "lastInboundAt",
    ]),
  };
  const account = {
    id,
    email: "  Customer@EXAMPLE.COM ",
    createdAt: new Date(),
    dateOfBirth: null,
    updatedAt: new Date(),
    locationConsent: false,
    latitude: 25,
    longitude: 91,
    accuracy: 10,
    locationUpdatedAt: new Date(),
  };
  const db = {
    select: (columns: unknown) => {
      const query: any = { columns };
      const chain: any = {
        from: (table: unknown) => {
          query.table = table;
          queries.push(query);
          return chain;
        },
        where: (filter: unknown) => {
          query.filter = filter;
          return chain;
        },
        orderBy: (...sort: unknown[]) => {
          query.sort = sort;
          return chain;
        },
        limit: (limit: number) => {
          query.limit = limit;
          return chain;
        },
        offset: (offset: number) => {
          query.offset = offset;
          return chain;
        },
        // biome-ignore lint/suspicious/noThenProperty: Drizzle query builders are awaitable; the mock must reproduce that contract.
        then: (resolve: any, reject: any) => {
          if (query.table === schema.user) return Promise.resolve([account]).then(resolve, reject);
          if (query.table === schema.contactMessage)
            return (
              options.failSupport
                ? Promise.reject(new Error("DB failed"))
                : Promise.resolve(query.columns?.value ? [{ value: 0 }] : [])
            ).then(resolve, reject);
          return (
            options.failActivity
              ? Promise.reject(new Error("activity failed"))
              : Promise.resolve([])
          ).then(resolve, reject);
        },
      };
      return chain;
    },
  };
  const service = loadModule("lib/db/admin-user-details.ts", {
    "server-only": {},
    "drizzle-orm": {
      and: (...all: unknown[]) => ({ all }),
      eq: (field: unknown, value: unknown) => ({ field, value }),
      inArray: (field: unknown, values: unknown) => ({ field, values }),
      count: () => "count",
      desc: (field: unknown) => ({ desc: field }),
      sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
        strings: [...strings],
        values,
      }),
    },
    "@/lib/admin/user-details": { supportPageSize: 10 },
    "@/lib/db/schema": schema,
    "@/lib/db/admin-database": {
      withAdminDatabase: (_name: string, work: (db: unknown) => unknown) => work(db),
    },
    "@/lib/db/contact-account": {
      accountColumns: { id: "user.id", email: "user.email" },
      hydrateAccountSummary: async () => ({ id }),
    },
  });
  return { service, queries, schema };
}
test("optional activity failure preserves account details and masks unconsented coordinates", async () => {
  const { service, queries } = dbHarness({ failActivity: true });
  const details = await service.getAdminUserDetails(id);
  expect(details).toMatchObject({
    account: { id },
    activity: null,
    activityUnavailable: true,
    profile: { latitude: null, longitude: null, accuracy: null, locationUpdatedAt: null },
  });
  expect(Object.keys(queries[0].columns)).not.toContain("password");
});
test("support history matches normalized email, excludes reports and bounds ordered rows", async () => {
  const { service, queries, schema } = dbHarness();
  expect(await service.getAdminUserSupportHistory(id, 10)).toMatchObject({
    items: [],
    total: 0,
    offset: 10,
  });
  const rows = queries.find((query) => query.table === schema.contactMessage && query.limit);
  expect(rows).toMatchObject({
    limit: 10,
    offset: 10,
    filter: {
      all: [
        { field: "contact.kind", value: "contact" },
        { values: ["contact.email", "customer@example.com"] },
      ],
    },
    sort: [{ desc: "contact.createdAt" }, { desc: "contact.id" }],
  });
  const unavailable = dbHarness({ failSupport: true });
  await expect(unavailable.service.getAdminUserSupportHistory(id, 0)).rejects.toThrow("DB failed");
});
test("support conversation lookup uses its ID and contact kind independently of pagination", async () => {
  const { service, queries } = dbHarness();
  await service.getAdminContactById(id);
  expect(queries[0]).toMatchObject({
    limit: 1,
    filter: {
      all: [
        { field: "contact.id", value: id },
        { field: "contact.kind", value: "contact" },
      ],
    },
  });
  expect(supportConversationUrl(id)).toBe(`/admin/contacts?contact=${id}`);
  expect(supportHistorySchema.safeParse({ items: [], total: -1, offset: 0 }).success).toBe(false);
});
