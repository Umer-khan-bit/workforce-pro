import { describe, expect, it } from "vitest";
import { crossSiteBlocks } from "./originGuard";

const base = { method: "POST", pathname: "/api/account/profile", host: "app.example.com" };

describe("cross-site request guard", () => {
  it("blocks a change made from a page of another site", () => {
    expect(crossSiteBlocks({ ...base, origin: "https://evil.example" })).toBe(true);
    expect(crossSiteBlocks({ ...base, method: "DELETE", origin: "https://evil.example" })).toBe(true);
  });

  it("lets our own pages, requests without an Origin, and reads through", () => {
    expect(crossSiteBlocks({ ...base, origin: "https://app.example.com" })).toBe(false);
    expect(crossSiteBlocks({ ...base, origin: null })).toBe(false);
    expect(crossSiteBlocks({ ...base, method: "GET", origin: "https://evil.example" })).toBe(false);
  });

  it("allows the configured public host, and blocks an Origin it cannot read", () => {
    expect(crossSiteBlocks({ ...base, origin: "https://public.example.com", allowedHosts: ["public.example.com"] })).toBe(false);
    expect(crossSiteBlocks({ ...base, origin: "not a url" })).toBe(true);
  });

  it("leaves routes that do not use the browser session alone", () => {
    for (const pathname of ["/api/v1/shortlist", "/api/jobs/run", "/api/auth/callback/credentials", "/api/mock-ats/receive"]) {
      expect(crossSiteBlocks({ ...base, pathname, origin: "https://evil.example" })).toBe(false);
    }
  });

  it("only cares about API paths", () => {
    expect(crossSiteBlocks({ ...base, pathname: "/login", origin: "https://evil.example" })).toBe(false);
  });
});
