import { describe, it, expect } from "vitest";
import { ExplanationSchema } from "../src/types/index.js";
import { extractReferences } from "../src/git/history.js";

describe("ExplanationSchema", () => {
  it("accepts a valid minimal explanation", () => {
    expect(() =>
      ExplanationSchema.parse({
        headline: "Switched from MD5 to bcrypt for password hashing",
        why: "MD5 was considered insecure for new applications by 2010. Migrated in commit a3f9c21 to align with OWASP guidance.",
        timeline: [
          { when: "Mar 2018", what: "Initial MD5 impl", sha: "a1b2c3d" },
          { when: "Sep 2021", what: "Migrated to bcrypt", sha: "e4f5g6h", prNumber: 1234 },
        ],
        notable: ["Kept MD5 valid until next login"],
        unknown: [],
        confidence: 0.85,
      })
    ).not.toThrow();
  });

  it("accepts empty notable/unknown arrays", () => {
    expect(() =>
      ExplanationSchema.parse({
        headline: "Validates user email on signup",
        why: "Added to prevent malformed entries from causing downstream send failures.",
        timeline: [{ when: "2 years ago", what: "Initial commit" }],
        notable: [],
        unknown: ["Whether stricter validation was considered"],
        confidence: 0.4,
      })
    ).not.toThrow();
  });

  it("rejects confidence > 1", () => {
    expect(() =>
      ExplanationSchema.parse({
        headline: "x", why: "y", timeline: [], notable: [], unknown: [], confidence: 1.5,
      })
    ).toThrow();
  });

  it("rejects too-short headline", () => {
    expect(() =>
      ExplanationSchema.parse({
        headline: "short", why: "longer than ten chars here",
        timeline: [], confidence: 0.5,
      })
    ).toThrow();
  });
});

describe("extractReferences", () => {
  it("finds GitHub PR numbers", () => {
    const refs = extractReferences("Fix bug in auth flow (#1234)");
    expect(refs).toContainEqual({ kind: "github_pr", value: "1234" });
  });

  it("finds full GitHub PR URLs", () => {
    const refs = extractReferences("See https://github.com/acme/api/pull/567");
    expect(refs).toContainEqual({ kind: "github_pr", value: "567" });
  });

  it("finds JIRA tickets", () => {
    const refs = extractReferences("PROJ-1234: implement feature X");
    expect(refs).toContainEqual({ kind: "jira", value: "PROJ-1234" });
  });

  it("dedupes mentions of the same PR", () => {
    const refs = extractReferences("Fixes #100. See #100 also.");
    expect(refs.filter((r) => r.kind === "github_pr" && r.value === "100")).toHaveLength(1);
  });

  it("doesn't false-positive on text without refs", () => {
    expect(extractReferences("Important comment text without refs")).toEqual([]);
  });

  it("caps URLs to avoid prompt bloat", () => {
    const text = Array(20).fill("see https://example.com/page").join(" ");
    expect(extractReferences(text).filter((r) => r.kind === "url").length).toBeLessThanOrEqual(6);
  });
});
