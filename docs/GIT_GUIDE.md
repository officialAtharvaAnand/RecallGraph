# GitHub workflow and contribution evidence

The private repository is [officialAtharvaAnand/RecallGraph](https://github.com/officialAtharvaAnand/RecallGraph). The first commit, `c53d773`, imports the supplied ZIP under Atharva Anand's Git identity. Importing an archive does not prove individual authorship of the archived files. Atharva Ashish Vyas was invited as a write-access collaborator on 12 November 2026; he must accept the invitation from his own GitHub account.

Each member should commit only work they actually perform or review. Both should contribute to database and application work and be able to explain both sides during the demonstration. The [contribution record](CONTRIBUTIONS.md) distinguishes user-reported joint work from authenticated repository evidence.

After accepting the invitation, the second member can clone the repository and use a feature branch for a real change:

```bash
git clone https://github.com/officialAtharvaAnand/RecallGraph.git
cd RecallGraph
git config user.name "Atharva Ashish Vyas"
git config user.email "HIS_GITHUB_EMAIL"
git switch -c feature/reviewed-change
# Make and test an actual database or application change.
git add PATHS_OF_CHANGED_FILES
git commit -m "Describe the actual change"
git push -u origin feature/reviewed-change
```

Open a pull request on GitHub. The other member should review the actual diff and tests. Repeat with a change in the other part of the stack so that each student has database and application evidence. Do not rewrite the import commit, backdate commits, use the other student's identity, or manufacture changes solely to alter contribution statistics.

For the demonstration, show `git shortlog -sn --all`, relevant `git log --author=...` entries, pull request reviews, and the actual files each member can explain. Commit counts alone do not establish contributions.
