import * as core from "@actions/core";
import * as github from "@actions/github";
import {
  MoodTier,
  avgSentiment,
  getMood,
  getMostTelling,
  parseCommentsFromDiff,
} from "./mood";

const MOOD_RING_MARKER = "<!-- code-mood-ring -->";

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

  const { data: commits } = await octokit.rest.pulls.listCommits({
    owner,
    repo,
    pull_number: pr.number,
    per_page: 100,
  });
  const commitMessages = commits.map((c) =>
    c.commit.message.split("\n")[0].trim(),
  );

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

  const commitScore = avgSentiment(commitMessages) ?? 0;
  const commentScore = avgSentiment(codeComments);

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
