// Repositories where the Jira key is searched in PR titles (popup toggle "Include search PR Text")
// They have no defaults: the user enters them in the options page as "PROJECT/repo" lines,
// and they are stored in chrome.storage.local as [{ projectKey, repoSlug }]

/**
 * Get the configured repositories ([] when not configured)
 */
export async function getSearchRepositories() {
  const { searchRepositories } = await chrome.storage.local.get(['searchRepositories']);
  return searchRepositories || [];
}

/**
 * Parse "PROJECT/repo" lines; blank lines are ignored and duplicates removed
 * Returns { repositories }, or { invalidLine } with the number of the first line not in that format
 */
export function parseSearchRepositories(text) {
  const repositories = [];
  const lines = text.split('\n').map(line => line.trim());

  for (const [index, line] of lines.entries()) {
    if (!line) {
      continue;
    }

    const match = line.match(/^([^\s/]+)\/([^\s/]+)$/);
    if (!match) {
      return { invalidLine: index + 1 };
    }

    const [, projectKey, repoSlug] = match;
    if (!repositories.some(repo => repo.projectKey === projectKey && repo.repoSlug === repoSlug)) {
      repositories.push({ projectKey, repoSlug });
    }
  }

  return { repositories };
}

/**
 * Format repositories as "PROJECT/repo" lines
 */
export function formatSearchRepositories(repositories) {
  return repositories.map(repo => `${repo.projectKey}/${repo.repoSlug}`).join('\n');
}
