import { expect, test } from "@playwright/test";
import { resolveAuditClientSource } from "@/lib/audit/client-source";

test.describe("audit client source classification", () => {
  test("treats native OAuth metadata as authoritative over the Chrome handoff user agent", () => {
    expect(
      resolveAuditClientSource({
        metadata: { client: "native" },
        userAgent:
          "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/149.0.0.0 Mobile Safari/537.36",
      })
    ).toBe("android_native");
  });

  test("recognizes direct Android native API traffic", () => {
    expect(
      resolveAuditClientSource({
        userAgent: "okhttp/4.12.0",
      })
    ).toBe("android_native");
  });

  test("keeps ordinary mobile and desktop browsers distinct", () => {
    expect(
      resolveAuditClientSource({
        userAgent:
          "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/149 Mobile Safari/537.36",
      })
    ).toBe("mobile_browser");
    expect(
      resolveAuditClientSource({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/149 Safari/537.36",
      })
    ).toBe("desktop_browser");
  });

  test("honors the explicit native client header value", () => {
    expect(
      resolveAuditClientSource({
        clientSource: "android-native",
        userAgent: "Mozilla/5.0",
      })
    ).toBe("android_native");
  });
});
