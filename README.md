# code-mood-ring

A GitHub Action that analyzes commit messages and code comments in a PR diff and posts the developer's emotional state as a PR comment.

Completely useless. Highly accurate.

## usage

Add this to your workflow:

```yaml
name: Code Mood Ring

on:
  pull_request:
    types: [opened, synchronize]

permissions:
  pull-requests: write

jobs:
  mood-ring:
    runs-on: ubuntu-latest
    steps:
      - uses: cadamsmith/code-mood-ring@v1
```

That's it. No secrets. No configuration required. The standard `GITHUB_TOKEN` is used automatically.

## what it does

On every PR open or push:

1. Fetches all commit messages in the PR
2. Fetches the raw diff and extracts added comment lines
3. Runs sentiment analysis on both (AFINN word list + custom commit/code vocabulary)
4. Blends the scores — commits weighted 60%, code comments 40%
5. Posts (or updates) a single PR comment with the diagnosis

## mood tiers

| score | mood |
|-------|------|
| < -4 | 🔥 Fine. Everything Is Fine. |
| -4 to -2 | 🌀 Spiraling |
| -2 to -1 | 😤 Defeated |
| -1 to 0 | 🌿 Touch Grass Immediately |
| 0 to 1 | 😐 Meh |
| 1 to 2 | ☕ Caffeinated |
| 2 to 3 | 🎯 In The Zone |
| 3+ | 😌 Zen |

## example output

> ## 🌡️ Code Mood Ring
>
> **Mood:** 🌀 Spiraling
>
> The code is crying out for help in multiple formats. Both the commits and the inline comments are in a bad place.
>
> **Stability Score:** `██░░░░░░░░` 2/10
>
> **Commits:** `-2.3` sentiment avg across 4 messages  
> **Code comments:** `-3.1` sentiment avg across 7 comments
>
> > 💬 Most telling commit: *"why does this still not work"*  
> > 🔍 Most telling comment: *"TODO: figure out why this is broken"*

## inputs

| input | description | default |
|-------|-------------|---------|
| `github-token` | Token for posting PR comments | `${{ github.token }}` |

## how it works

Sentiment scoring uses the [sentiment](https://www.npmjs.com/package/sentiment) package (AFINN-165 word list) extended with commit-specific vocabulary:

- `wtf: -4`, `hotfix: -3`, `revert: -3`, `hack: -2`, `hopefully: -2`
- `release: +3`, `implement: +2`, `optimize: +2`, `improve: +2`

Code comments are extracted from added lines (`+`) in the diff across languages: `//`, `#`, `/*`, `*`, `<!--`, `--`, `%%`, `;`.

No external API calls are made. Everything runs in the GitHub Actions runner.

## development

```bash
npm install          # installs deps + the husky pre-commit hook
npm test             # vitest — covers src/mood.ts
npm run typecheck    # tsc --noEmit
npm run build        # bundles src/index.ts → dist/index.js via ncc
```

The pre-commit hook rebuilds `dist/` whenever `src/` changes and runs the test suite. CI runs typecheck, tests, build, and verifies the committed `dist/` matches what `npm run build` produces.

## license

MIT
