import { existsSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  ADMIN_NAV_GROUPS,
  findAdminNavEntry,
  isActiveAdminRoute,
} from "@/lib/admin/navigation";

const items = ADMIN_NAV_GROUPS.flatMap((group) => group.items);

test("every admin nav entry points at a real admin page", () => {
  for (const item of items) {
    const segment = item.href.replace(/^\/admin\/?/, "");
    const page = path.join("app/(admin)/admin", segment, "page.tsx");
    expect(existsSync(page), `${item.href} -> ${page}`).toBe(true);
  }
  expect(new Set(items.map((item) => item.href)).size).toBe(items.length);
});

test("the shared nav covers sections that were missing from the sidebar", () => {
  const hrefs = items.map((item) => item.href);
  for (const href of ["/admin/live-users", "/admin/explore", "/admin/storage", "/admin/coupons"]) {
    expect(hrefs).toContain(href);
  }
});

test("breadcrumbs resolve sections, nested pages and unknown paths", () => {
  expect(findAdminNavEntry("/admin")?.item.label).toBe("Overview");
  expect(findAdminNavEntry("/admin/users")?.item.label).toBe("Users");
  expect(findAdminNavEntry("/admin/users/abc/logs")?.item.label).toBe("Users");
  expect(findAdminNavEntry("/admin/account-deletion")?.item.label).toBe("Deletion Requests");
  expect(findAdminNavEntry("/admin/not-a-section")).toBeNull();
  // "/admin" only matches exactly, so it never claims every admin page.
  expect(isActiveAdminRoute("/admin/users", "/admin")).toBe(false);
  // Prefix matching respects path boundaries.
  expect(isActiveAdminRoute("/admin/account-deletion", "/admin/account")).toBe(false);
});
