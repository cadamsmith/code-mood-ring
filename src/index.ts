import * as core from "@actions/core";
import * as github from "@actions/github";
import Sentiment from "sentiment";

const MOOD_RING_MARKER = "<!-- code-mood-ring -->";
const sentiment = new Sentiment();

const COMMIT_EXTRAS = {
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

// Comment prefixes to strip before analysis
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
  // Strip trailing */ or -->
  text = text
    .replace(/\*\/\s*$/, "")
    .replace(/-->\s*$/, "")
    .trim();
  return text;
}

function parseCommentsFromDiff(diff: string): string[] {
  const comments: string[] = [];
  for (const line of diff.split("\n")) {
    // Only look at added lines, skip diff metadata
    if (!line.startsWith("+") || line.startsWith("+++")) continue;
    if (isCommentLine(line)) {
      const text = extractCommentText(line);
      if (text.length > 2) comments.push(text); // skip empty/trivial comments
    }
  }
  return comments;
}

function avgSentiment(texts: string[]): number | null {
  if (texts.length === 0) return null;
  const total = texts.reduce(
    (sum, t) => sum + sentiment.analyze(t, COMMIT_EXTRAS).score,
    0,
  );
  return total / texts.length;
}

function getMostTelling(texts: string[]): string {
  return texts.reduce((prev, msg) => {
    const a = Math.abs(sentiment.analyze(msg, COMMIT_EXTRAS).score);
    const b = Math.abs(sentiment.analyze(prev, COMMIT_EXTRAS).score);
    return a > b ? msg : prev;
  });
}

interface MoodTier {
  minScore: number;
  label: string;
  emoji: string;
  summary: string;
  stability: number;
}

const MOOD_TIERS: MoodTier[] = [
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

function getMood(score: number): MoodTier {
  return (
    [...MOOD_TIERS].reverse().find((t) => score >= t.minScore) ?? MOOD_TIERS[0]
  );
}

function buildComment(
  mood: MoodTier,
  commitHighlight: string,
  commentHighlight: string | null,
  commitCount: number,
  codeCommentCount: number,
  commitScore: number,
  commentScore: number | null,
): string {
  const filled = "█".repeat(mood.stability);
  const empty = "░".repeat(10 - mood.stability);

  const sources = [
    `**Commits:** \`${commitScore.toFixed(1)}\` sentiment avg across ${commitCount} message${commitCount === 1 ? "" : "s"}`,
    commentScore !== null
      ? `**Code comments:** \`${commentScore.toFixed(1)}\` sentiment avg across ${codeCommentCount} comment${codeCommentCount === 1 ? "" : "s"}`
      : `**Code comments:** none found in diff`,
  ].join("\n");

  const highlights = [
    `> 💬 Most telling commit: *"${commitHighlight}"*`,
    commentHighlight
      ? `> 🔍 Most telling comment: *"${commentHighlight}"*`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `${MOOD_RING_MARKER}
## 🌡️ Code Mood Ring

**Mood:** ${mood.emoji} ${mood.label}

${mood.summary}

**Stability Score:** \`${filled}${empty}\` ${mood.stability}/10

${sources}

${highlights}

---
*[code-mood-ring](https://github.com/cadamsmith/code-mood-ring) · completely useless · highly accurate*`;
}

async function run(): Promise<void> {
  const githubToken = core.getInput("github-token", { required: true });
  const octokit = github.getOctokit(githubToken);
  const context = github.context;

  if (!context.payload.pull_request) {
    core.info("Not a pull request event, skipping.");
    return;
  }

  const pr = context.payload.pull_request;
  const { owner, repo } = context.repo;

  // Fetch commits
  const { data: commits } = await octokit.rest.pulls.listCommits({
    owner,
    repo,
    pull_number: pr.number,
    per_page: 100,
  });
  const commitMessages = commits.map((c) =>
    c.commit.message.split("\n")[0].trim(),
  );

  // Fetch diff and extract code comments
  const { data: diffData } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: pr.number,
    mediaType: { format: "diff" },
  });
  const diff = diffData as unknown as string;
  const codeComments = parseCommentsFromDiff(diff);

  core.info(
    `Found ${commitMessages.length} commits and ${codeComments.length} code comment(s) in diff`,
  );

  // Score each source
  const commitScore = avgSentiment(commitMessages) ?? 0;
  const commentScore = avgSentiment(codeComments);

  // Blend: commits weighted 60%, code comments 40% (if present)
  const blendedScore =
    commentScore !== null
      ? commitScore * 0.6 + commentScore * 0.4
      : commitScore;

  const mood = getMood(blendedScore);
  const commitHighlight = getMostTelling(commitMessages);
  const commentHighlight =
    codeComments.length > 0 ? getMostTelling(codeComments) : null;

  core.info(
    `Blended score: ${blendedScore.toFixed(2)} → ${mood.emoji} ${mood.label}`,
  );

  const commentBody = buildComment(
    mood,
    commitHighlight,
    commentHighlight,
    commitMessages.length,
    codeComments.length,
    commitScore,
    commentScore,
  );

  const { data: prComments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: pr.number,
  });
  const existing = prComments.find((c) => c.body?.includes(MOOD_RING_MARKER));

  if (existing) {
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body: commentBody,
    });
  } else {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: pr.number,
      body: commentBody,
    });
  }
}

run().catch(core.setFailed);
