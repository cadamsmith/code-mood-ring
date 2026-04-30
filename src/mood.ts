import Sentiment from "sentiment";

const sentiment = new Sentiment();

export const COMMIT_EXTRAS = {
  extras: {
    fix: -1,
    fixes: -1,
    fixed: -1,
    hotfix: -3,
    revert: -3,
    reverted: -3,
    broken: -3,
    hack: -2,
    temp: -1,
    wip: -1,
    why: -2,
    wtf: -4,
    ugh: -3,
    finally: -2,
    again: -2,
    still: -1,
    hopefully: -2,
    trying: -1,
    attempt: -1,
    refactor: 1,
    cleanup: 1,
    improve: 2,
    optimize: 2,
    implement: 2,
    release: 3,
    docs: 1,
    tests: 1,
  },
};

const COMMENT_PATTERNS = [
  /^\s*\/\/+\s*/, // // or ///
  /^\s*#+\s*/, // # or ##
  /^\s*\/\*+\s*/, // /* or /**
  /^\s*\*+\/?\s*/, // * or */
  /^\s*<!--\s*/, // <!-- (html/xml)
  /^\s*--\s*/, // -- (sql/lua)
  /^\s*%%\s*/, // %% (matlab)
  /^\s*;+\s*/, // ; (assembly/lisp)
];

function isCommentLine(line: string): boolean {
  const trimmed = line.replace(/^\+/, "").trimStart();
  return COMMENT_PATTERNS.some((p) => p.test(trimmed));
}

function extractCommentText(line: string): string {
  let text = line.replace(/^\+/, "").trim();
  for (const pattern of COMMENT_PATTERNS) {
    text = text.replace(pattern, "");
  }
  text = text
    .replace(/\*\/\s*$/, "")
    .replace(/-->\s*$/, "")
    .trim();
  return text;
}

export function parseCommentsFromDiff(diff: string): string[] {
  const comments: string[] = [];
  for (const line of diff.split("\n")) {
    if (!line.startsWith("+") || line.startsWith("+++")) continue;
    if (isCommentLine(line)) {
      const text = extractCommentText(line);
      if (text.length > 2) comments.push(text);
    }
  }
  return comments;
}

export function avgSentiment(texts: string[]): number | null {
  if (texts.length === 0) return null;
  const total = texts.reduce(
    (sum, t) => sum + sentiment.analyze(t, COMMIT_EXTRAS).score,
    0,
  );
  return total / texts.length;
}

export function getMostTelling(texts: string[]): string {
  return texts.reduce((prev, msg) => {
    const a = Math.abs(sentiment.analyze(msg, COMMIT_EXTRAS).score);
    const b = Math.abs(sentiment.analyze(prev, COMMIT_EXTRAS).score);
    return a > b ? msg : prev;
  });
}

export interface MoodTier {
  minScore: number;
  label: string;
  emoji: string;
  summary: string;
  stability: number;
}

export const MOOD_TIERS: MoodTier[] = [
  {
    minScore: -Infinity,
    label: "Fine. Everything Is Fine.",
    emoji: "🔥",
    stability: 1,
    summary:
      "The commits and comments tell the story of someone who has fully dissociated. They are no longer debugging. They are surviving.",
  },
  {
    minScore: -4,
    label: "Spiraling",
    emoji: "🌀",
    stability: 2,
    summary:
      "The code is crying out for help in multiple formats. Both the commits and the inline comments are in a bad place.",
  },
  {
    minScore: -2,
    label: "Defeated",
    emoji: "😤",
    stability: 4,
    summary:
      "They came in confident. They are leaving changed. The bug won a few rounds.",
  },
  {
    minScore: -1,
    label: "Touch Grass Immediately",
    emoji: "🌿",
    stability: 5,
    summary:
      "Not in crisis, but trending that direction. Recommend sunlight and a snack.",
  },
  {
    minScore: 0,
    label: "Meh",
    emoji: "😐",
    stability: 6,
    summary:
      "Perfectly adequate output from someone who has made peace with adequate. Respect.",
  },
  {
    minScore: 1,
    label: "Caffeinated",
    emoji: "☕",
    stability: 7,
    summary:
      "Productive, slightly unhinged, definitely on their second cup. Getting things done.",
  },
  {
    minScore: 2,
    label: "In The Zone",
    emoji: "🎯",
    stability: 8,
    summary:
      "Clean commits, thoughtful comments, suspicious levels of productivity. Are they okay? They seem okay.",
  },
  {
    minScore: 3,
    label: "Zen",
    emoji: "😌",
    stability: 10,
    summary:
      "Conventional commits, good descriptions, helpful inline comments. This person has achieved something.",
  },
];

export function getMood(score: number): MoodTier {
  return (
    [...MOOD_TIERS].reverse().find((t) => score >= t.minScore) ?? MOOD_TIERS[0]
  );
}
