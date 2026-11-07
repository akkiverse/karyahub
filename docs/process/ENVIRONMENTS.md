# Environments: dev first, then production

Every change is seen working on **dev** by the testers (UAT) before it reaches **production**. Nothing goes to production in one step from a task branch.

| | Dev | Production |
|---|---|---|
| Git branch | `dev` | `main` |
| Who uses it | Founder, testers (UAT) | Real businesses |
| Address | `https://karyahub-git-dev-akkiverse.vercel.app` (stable; a shorter alias may be added in Vercel) | `https://karyahub-akkiverse.vercel.app` |
| Data | Its own database with test businesses only | The live database |
| Changes arrive by | Pull request from a `cr/*` branch into `dev` | One release pull request from `dev` into `main` |
| Gets a version tag | No | Yes (`vX.Y.Z` on the release merge, plus a GitHub Release) |

## The flow

```
cr/0020-some-change  ──PR──▶  dev  ──(testers check, phase analysis)──▶  release PR  ──▶  main  ──▶  tag + GitHub Release
      (private preview)      (dev address)                                              (production)
```

1. **Start from `dev`.** `git fetch`, `git checkout dev`, `git pull --ff-only`, then `git checkout -b cr/NNNN-<short-name>`. A task branch never starts from `main` any more.
2. **Open the pull request into `dev`** (the base branch is `dev`, not `main`). CI (`test-and-build`) must be green.
3. **Merge into `dev`.** Vercel builds the dev address from the new `dev` head. Testers check it there.
4. **Phase analysis.** When a set of changes on `dev` is ready, review what is on `dev` and not on `main` (`git log --oneline origin/main..origin/dev`), the test report and the spec. Fix anything found with a new `cr/*` branch into `dev`, not on `main`.
5. **Release.** Open one pull request `dev` → `main` titled `Release vX.Y.Z`. Its description lists every issue it finishes as `Closes #N`. The founder merges it. Then: tag `vX.Y.Z` on the merge commit, GitHub Release from the CHANGELOG, close the milestone, and update the hub registry.
6. **Urgent fix on production** (hotfix): branch `cr/NNNN-<name>` from `main`, pull request into `main`, then merge `main` back into `dev` straight away so `dev` never lacks a fix that is live.

## Rules

- **Dev never uses the production database.** Dev has its own database. A tester can create, edit and delete freely on dev without touching a real business.
- **Dev holds no real customer data.** Use made-up businesses, names and phone numbers. Do not copy production rows into dev.
- **Dev can be rebuilt.** If dev's data or code is in a bad state, it can be reset from `main` (see below). Production is never reset.
- **Same code path, different settings.** Dev and production run the same code; only settings (database, secrets) differ. A setting that differs must come from a Vercel variable, never from an `if dev` in the code.
- **A green `dev` is the entry ticket to `main`.** Do not open a release pull request while `dev` CI is red or while testers have open blockers.

## Keeping dev in step with main

`dev` must always contain everything on `main`. After a release or a hotfix, `dev` is the same as, or ahead of, `main`:

```bash
git fetch origin
git checkout dev && git pull --ff-only
git merge origin/main        # normally already contained; needed only after a hotfix
git push
```

To rebuild dev from scratch (the founder's call, it throws away what is only on `dev`): reset `dev` to `main` and reset the dev database.

## What is automatic

- CI runs on every pull request and on every push to `dev` and `main`.
- The issue status workflow works for pull requests into any branch. `status: merged` therefore means "merged into `dev`". The issue itself closes when the release pull request, which lists `Closes #N`, merges into `main`.
