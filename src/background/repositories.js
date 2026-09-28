// Repositories the user can access in Bitbucket, listed in the options page to choose
// the repositories of the PR title search
import { apiCall, reposApi } from './bitbucket-api.js';
import { getCookieAuth, validateAuth } from './auth.js';

// Repositories per request, and a safety limit on the number of pages
const PAGE_LIMIT = 1000;
const MAX_PAGES = 20;

/**
 * List all repositories as [{ projectKey, projectName, repoSlug, repoName }]
 * Uses the token entered in the options page (possibly not saved yet), or the session cookie without one
 */
export async function listRepositories(token, bitbucketDomain) {
  if (!bitbucketDomain) {
    return { success: false, error: 'NOT_CONFIGURED' };
  }

  const auth = token ? { value: token, type: 'token' } : await getCookieAuth(bitbucketDomain);
  const validation = await validateAuth(auth, bitbucketDomain);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  try {
    const repositories = [];
    let start = 0;

    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await apiCall(`${reposApi(bitbucketDomain)}?limit=${PAGE_LIMIT}&start=${start}`, auth);

      repositories.push(...(data.values || []).map(repo => ({
        projectKey: repo.project.key,
        projectName: repo.project.name,
        repoSlug: repo.slug,
        repoName: repo.name
      })));

      if (data.isLastPage !== false || data.nextPageStart == null) {
        break;
      }
      start = data.nextPageStart;
    }

    return { success: true, repositories };
  } catch (error) {
    console.error('Error listing repositories:', error);
    return { success: false, error: 'API_ERROR', message: error.message };
  }
}
