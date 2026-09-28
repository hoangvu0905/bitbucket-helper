// Repositories where the Jira key is searched in PR titles (popup toggle "Include search PR Text")
// They have no defaults: the user picks them in the options page from the repositories loaded
// from Bitbucket, and they are stored in chrome.storage.local as [{ projectKey, repoSlug }]

/**
 * Get the configured repositories ([] when not configured)
 */
export async function getSearchRepositories() {
  const { searchRepositories } = await chrome.storage.local.get(['searchRepositories']);
  return searchRepositories || [];
}
