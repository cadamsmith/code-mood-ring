import { describe, expect, test } from "vitest";
import {
  avgSentiment,
  getMood,
  getMostTelling,
  parseCommentsFromDiff,
} from "../src/mood";

describe("parseCommentsFromDiff", () => {
  test("extracts // line comments", () => {
    const diff = "+// this is great";
    expect(parseCommentsFromDiff(diff)).toEqual(["this is great"]);
  });

  test("extracts # comments (Python/Ruby/shell)", () => {
    const diff = "+# what a mess";
    expect(parseCommentsFromDiff(diff)).toEqual(["what a mess"]);
  });

  test("extracts /* */ block comment markers and trims trailing */", () => {
    const diff = "+/* hopefully this works */";
    expect(parseCommentsFromDiff(diff)).toEqual(["hopefully this works"]);
  });

  test("extracts <!-- --> HTML comments and trims trailing -->", () => {
    const diff = "+<!-- broken again -->";
    expect(parseCommentsFromDiff(diff)).toEqual(["broken again"]);
  });

  test("extracts -- SQL/Lua comments", () => {
    const diff = "+-- finally fixed this query";
    expect(parseCommentsFromDiff(diff)).toEqual(["finally fixed this query"]);
  });

  test("ignores removed and unchanged lines", () => {
    const diff = ["-// removed comment", " // unchanged comment", "+// added comment"].join("\n");
    expect(parseCommentsFromDiff(diff)).toEqual(["added comment"]);
  });

  test("ignores +++ diff file headers", () => {
    const diff = ["+++ b/file.ts", "+// real comment"].join("\n");
    expect(parseCommentsFromDiff(diff)).toEqual(["real comment"]);
  });

  test("skips trivial comments (≤ 2 chars after stripping)", () => {
    const diff = ["+// x", "+// hi", "+// hello"].join("\n");
    expect(parseCommentsFromDiff(diff)).toEqual(["hello"]);
  });

  test("handles indented comments", () => {
    const diff = "+    // nested comment";
    expect(parseCommentsFromDiff(diff)).toEqual(["nested comment"]);
  });

  test("returns empty array when no added comments", () => {
    const diff = ["+const x = 1;", "+function foo() {}"].join("\n");
    expect(parseCommentsFromDiff(diff)).toEqual([]);
  });

  test("extracts multiple comments across mixed languages", () => {
    const diff = [
      "+++ b/foo.ts",
      "+// js comment here",
      "+++ b/bar.py",
      "+# python comment here",
      "+const ok = true;",
    ].join("\n");
    expect(parseCommentsFromDiff(diff)).toEqual([
      "js comment here",
      "python comment here",
    ]);
  });
});

describe("avgSentiment", () => {
  test("returns null for empty array", () => {
    expect(avgSentiment([])).toBeNull();
  });

  test("applies COMMIT_EXTRAS override (wtf = -4)", () => {
    expect(avgSentiment(["wtf"])).toBe(-4);
  });

  test("applies COMMIT_EXTRAS override (release = +3)", () => {
    expect(avgSentiment(["release"])).toBe(3);
  });

  test("averages across multiple messages", () => {
    // wtf (-4) + release (+3) = -1, /2 = -0.5
    expect(avgSentiment(["wtf", "release"])).toBeCloseTo(-0.5);
  });

  test("neutral text scores zero", () => {
    expect(avgSentiment(["the the the"])).toBe(0);
  });
});

describe("getMostTelling", () => {
  test("returns the only message when given one", () => {
    expect(getMostTelling(["hello world"])).toBe("hello world");
  });

  test("picks message with highest absolute sentiment score", () => {
    // wtf (|−4|) beats fix (|−1|) and a neutral string
    expect(getMostTelling(["just a normal commit", "fix", "wtf"])).toBe("wtf");
  });

  test("extreme negative beats moderate positive", () => {
    // wtf (|−4|) beats release (|+3|)
    expect(getMostTelling(["release", "wtf"])).toBe("wtf");
  });
});

describe("getMood", () => {
  test("score >= 3 → Zen", () => {
    expect(getMood(3).label).toBe("Zen");
    expect(getMood(10).label).toBe("Zen");
  });

  test("score < -4 → Fine. Everything Is Fine.", () => {
    expect(getMood(-5).label).toBe("Fine. Everything Is Fine.");
    expect(getMood(-100).label).toBe("Fine. Everything Is Fine.");
  });

  test("tier boundaries are inclusive (score === minScore lands in that tier)", () => {
    expect(getMood(-4).label).toBe("Spiraling");
    expect(getMood(-2).label).toBe("Defeated");
    expect(getMood(-1).label).toBe("Touch Grass Immediately");
    expect(getMood(0).label).toBe("Meh");
    expect(getMood(1).label).toBe("Caffeinated");
    expect(getMood(2).label).toBe("In The Zone");
  });

  test("mid-range scores fall into the correct tier", () => {
    expect(getMood(-3).label).toBe("Spiraling");
    expect(getMood(-1.5).label).toBe("Defeated");
    expect(getMood(0.5).label).toBe("Meh");
    expect(getMood(1.5).label).toBe("Caffeinated");
    expect(getMood(2.5).label).toBe("In The Zone");
  });
});
