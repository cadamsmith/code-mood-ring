# code-mood-ring

A GitHub Action that analyzes commit messages and code comments in a PR diff and posts the developer's emotional state as a PR comment. Completely useless. Highly accurate.

## what it does

On every `pull_request` (opened or pushed to):

1. Fetches all commits in the PR via GitHub API
2. Fetches the raw PR diff and parses out added comment lines
3. Runs sentiment analysis on both using the `sentiment` package (AFINN word list + custom commit/code extras)
4. Blends the two scores (commits 60%, code comments 40%)
5. Maps the blended score to a mood tier and posts (or updates) a single PR comment

No external API calls. No secrets needed beyond the standard `GITHUB_TOKEN`.

## project structure

```
.github/workflows/ci.yml        # typecheck + test + build + dist freshness check
.github/workflows/self-test.yml # runs the action on its own PRs against the local checkout
src/mood.ts                     # pure scoring logic (sentiment, comment parsing, mood tiers)
src/index.ts                    # action entrypoint — Octokit calls, comment rendering, posting
tests/mood.test.ts              # vitest suite covering src/mood.ts
dist/index.js                   # compiled bundle — must be committed, GitHub runs this directly
action.yml                      # action metadata and input definitions
.husky/pre-commit                # rebuilds dist when src/ changes, runs `npm test`
package.json                    # deps: sentiment, @actions/core, @actions/github; dev: vitest, husky, ncc
```

## dev workflow

```bash
npm install          # also installs husky pre-commit hook via `prepare`
# edit src/mood.ts or src/index.ts
npm test             # runs vitest once
npm run typecheck    # tsc --noEmit
npm run build        # bundles src/index.ts → dist/index.js via ncc
```

The husky `pre-commit` hook auto-rebuilds `dist/` and re-stages it whenever `src/`, `package.json`, `package-lock.json`, or `tsconfig.json` is staged, then runs `npm test`. CI also enforces this — `.github/workflows/ci.yml` fails the build if the committed `dist/` is stale.

## key files

### src/mood.ts

Pure functions, no I/O — this is what the test suite covers. Key exports:

- `COMMIT_EXTRAS` — custom sentiment overrides tuned for commit/code language (`wtf: -4`, `release: 3`, etc.). add more here freely.
- `MOOD_TIERS` — array of mood buckets ordered by `minScore`. each has a label, emoji, summary line, and stability score (1–10). add new tiers or tweak thresholds here.
- `parseCommentsFromDiff(diff)` — extracts added comment lines from a raw git diff. supports `//`, `#`, `/*`, `*`, `<!--`, `--`, `%%`, `;`. extend `COMMENT_PATTERNS` for new languages.
- `avgSentiment(texts)` — average AFINN+extras score, or `null` for an empty array.
- `getMostTelling(texts)` — picks the single message with the highest absolute sentiment score to quote in the comment.
- `getMood(score)` — maps a blended score to a `MoodTier`.

### src/index.ts

Action entrypoint. Wires Octokit calls (`pulls.listCommits`, `pulls.get` with diff media type, `issues.{list,create,update}Comment`) to the pure helpers in `mood.ts`, renders the markdown comment, and posts or updates it (deduped via the `<!-- code-mood-ring -->` HTML marker).

Scoring blend: commits weighted 60%, code comments 40%. if no code comments are found, falls back to commits only. tweak the weights in `run()`.

### tests/mood.test.ts

Vitest covers the pure logic in `src/mood.ts`: diff parsing across comment syntaxes, `COMMIT_EXTRAS` overrides, `getMostTelling` selection, and `getMood` tier boundaries. When adding new mood tiers or comment patterns, add a test here too.

### action.yml

Defines the single input: `github-token` (defaults to `${{ github.token }}`). If you add new inputs, define them here and read them with `core.getInput()` in `src/index.ts`.

## mood tiers

Tiers are matched by average blended sentiment score (higher = calmer):

| score range | mood                         |
| ----------- | ---------------------------- |
| < -4        | 🔥 Fine. Everything Is Fine. |
| -4 to -2    | 🌀 Spiraling                 |
| -2 to -1    | 😤 Defeated                  |
| -1 to 0     | 🌿 Touch Grass Immediately   |
| 0 to 1      | 😐 Meh                       |
| 1 to 2      | ☕ Caffeinated               |
| 2 to 3      | 🎯 In The Zone               |
| 3+          | 😌 Zen                       |

## publishing to the GitHub Actions marketplace

1. Bump version in `package.json`
2. Run `npm run build`, commit everything including `dist/index.js`
3. Create a release tag (e.g. `v1.0.0`) and also update the major version tag (`v1`) to point to it:
   ```bash
   git tag v1.0.0
   git tag -f v1
   git push origin v1.0.0
   git push origin v1 --force
   ```
4. The marketplace listing uses the `name`, `description`, and `branding` fields from `action.yml`

Consumers reference the action as `cadamsmith/code-mood-ring@v1`.
