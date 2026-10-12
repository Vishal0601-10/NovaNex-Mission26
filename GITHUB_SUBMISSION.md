# GitHub delivery target

Repository: `Vishal0601-10/NovaNex-Mission26`

Requested branch: `b1`

Recommended commit message:

```text
feat: build production account-aware MSME liquidity engine
```

## Safe push sequence

```bash
git status
git branch --show-current
git fetch origin
git switch -c b1 origin/main   # use only if b1 does not already exist
npm run verify
git diff --check
git add .
git status
git commit -m "feat: build production account-aware MSME liquidity engine"
git push -u origin b1
```

If `b1` already exists remotely, fetch it and reconcile it instead of recreating or force-pushing it.

Never commit `.env`, real account data, credentials, access tokens, `node_modules`, or runtime ledger files. Do not use `git push --force`.
