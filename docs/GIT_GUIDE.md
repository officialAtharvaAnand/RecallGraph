# Genuine two-person Git workflow

Run these commands **after** both members have agreed on the real work split. The commands are instructions for the team; no Git history was created by this project update.

~~~powershell
cd path\to\recallgraph
git init
git add .
git status
git commit -m "chore: import reviewed RecallGraph baseline"
~~~

Only the person who actually prepares and reviews that baseline commit should make it, under their own Git identity. Each member sets their own identity locally on their own machine:

~~~powershell
git config user.name "YOUR REAL NAME"
git config user.email "YOUR REAL EMAIL"
~~~

Create a private GitHub repository in the browser, then add it as the remote using the actual URL shown by GitHub:

~~~powershell
git branch -M main
git remote add origin https://github.com/YOUR-ACCOUNT/YOUR-REPO.git
git push -u origin main
~~~

Alternatively, if GitHub CLI is installed and authenticated, run <code>gh repo create YOUR-REPO --private --source . --remote origin --push</code>. In the GitHub repository settings, invite the second member as a collaborator using their real GitHub username. Do not put account passwords or tokens in this repository.

Each member creates a branch for work they actually perform, commits small changes, pushes, and opens a pull request:

~~~powershell
git switch -c feature/sql-migrations
git add db/migrations tests/sql.test.mjs
git commit -m "feat(sql): explain and verify integrity rules"
git push -u origin feature/sql-migrations
gh pr create --base main --head feature/sql-migrations --title "SQL integrity work" --body "Describe real changes and tests."
~~~

The other member reviews the diff, runs relevant tests, requests fixes if needed, and approves before merge. Repeat for graph, API, UI, and docs branches. If GitHub CLI is unavailable, open the pull request in the browser. Never manufacture commits just to alter contribution statistics.

After both members have reviewed the final report and tests, tag the actual final commit:

~~~powershell
git switch main
git pull --ff-only
git tag -a v1.0.0 -m "RecallGraph course submission"
git push origin v1.0.0
~~~

For the demonstration, show real individual work with <code>git shortlog -sn --all</code>, <code>git log --author="REAL NAME" --oneline</code>, the PR review history, and GitHub's Contributors graph. Explain specific database and application changes by each member; raw commit counts alone do not prove understanding.
