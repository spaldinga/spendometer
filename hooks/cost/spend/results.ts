// Results of a conversation: the git commits and pull requests its shell commands made.
// Like guard.ts this reads the command's text, so it is a count, not proof: `echo git commit`
// counts, and a commit made inside a script or `bash -c` is seen only when its text is in the line.

/** `git commit` with any `-c k=v` / `-C dir` options in front. Not `commit-tree`, not `--amend`, not `--dry-run`. */
const COMMIT = /\bgit(\s+-[cC]\s+\S+)*\s+commit\b(?!-)/
const PR = /\bgh\s+pr\s+create\b|\baz\s+repos\s+pr\s+create\b/

/** True when the command line makes a commit (once, however many times it is chained). */
export const isCommit = (command: string): boolean => COMMIT.test(command) && !/--amend\b|--dry-run\b/.test(command)

/** True when the command line opens a pull request. */
export const isPr = (command: string): boolean => PR.test(command)

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** "4 commits · 1 PR", leaving out a zero part; '' when there are none. */
export const resultsText = (commits: number, prs: number): string =>
  [commits > 0 ? plural(commits, 'commit', 'commits') : '', prs > 0 ? plural(prs, 'PR', 'PRs') : ''].filter(Boolean).join(' · ')

/** The sentence for the alt text and the /spendometer cost answer; '' when there are no results. */
export const resultsSentence = (commits: number, prs: number, cost: string | null): string => {
  if (commits <= 0 && prs <= 0) return ''
  const parts = [commits > 0 ? plural(commits, 'commit', 'commits') : '', prs > 0 ? plural(prs, 'pull request', 'pull requests') : ''].filter(Boolean).join(' and ')
  return ` This conversation made ${parts}${cost ? `, about ${cost} a result` : ''}.`
}
