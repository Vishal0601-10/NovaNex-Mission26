# GitHub Submission Checklist

Repository target: `payguard-intent-protection`

## 1. Verify local tools in PowerShell

```powershell
git --version
node --version
npm --version
```

## 2. Verify the project before publishing

From the extracted project directory:

```powershell
npm install
npm test
npm run build
```

Expected result:

- all automated tests pass;
- Vite reports a successful production build;
- a `dist` directory is created;
- `package-lock.json` is created by `npm install`.

Do not commit `dist` or `node_modules`; both are excluded by `.gitignore`.

## 3. Create the public GitHub repository

In GitHub, create a new **public** repository named exactly:

```text
payguard-intent-protection
```

Do not initialise it with a README, `.gitignore`, or licence because those files already exist locally.

## 4. Inspect Git state before changing anything

```powershell
git status
git remote -v
```

If Git says the directory is not a repository, initialise it:

```powershell
git init
```

If `git remote -v` already shows an `origin`, do not add another one. Verify that it is the repository you intend to submit.

## 5. Preserve the problem statement as the first commit

If this is a new repository with no commits:

```powershell
git add PROBLEM_STATEMENT.md
git commit -m "chore: add approved finance problem statement"
git branch -M main
```

Then commit the complete tested application:

```powershell
git add .
git commit -m "feat: build PayGuard intent-aware UPI protection prototype"
```

## 6. Connect the actual repository

Copy the HTTPS repository URL from GitHub. It should correspond to the repository you just created.

Only if `origin` does not already exist:

```powershell
git remote add origin YOUR_ACTUAL_REPOSITORY_URL
```

If `origin` exists but is wrong, inspect it before changing it:

```powershell
git remote -v
```

Then, only when you have confirmed the correct URL:

```powershell
git remote set-url origin YOUR_ACTUAL_REPOSITORY_URL
```

## 7. Push

```powershell
git push -u origin main
```

If GitHub opens a browser authentication flow, complete it in the browser. Do not paste passwords, personal access tokens, or credentials into chat.

## 8. Verify the submission

Open the repository in your browser and confirm that `main` contains at least:

```text
PROBLEM_STATEMENT.md
README.md
package.json
package-lock.json
vite.config.js
src/
tests/
docs/
```

Open `README.md` on GitHub and verify that it renders correctly. Open `docs/ARCHITECTURE.md` and confirm the Mermaid diagram renders.

The repository link is ready for hackathon submission only after these files are visibly present on the public `main` branch.
