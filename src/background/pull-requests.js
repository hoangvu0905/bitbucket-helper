// Pull requests of a Jira issue: found via the commits linked to the issue,
// and optionally by searching the Jira key in PR titles
import { CACHE_DURATION, COMMITS_LIMIT, MAX_PARALLEL_REQUESTS } from './config.js';
import { apiCall, commitsApi, projectsApi } from './bitbucket-api.js';
import { getBitbucketAuth, validateAuth } from './auth.js';
import { getDomains } from '../shared/domains.js';
import { getSearchRepositories } from '../shared/search-repositories.js';

// ==================== CACHING ====================

// In-memory cache for pull requests by Jira key
const prCache = new Map();

/**
 * Get cached pull requests for a Jira key
 */
function getCachedPullRequests(jiraKey) {
  const cached = prCache.get(jiraKey);
  if (!cached) return null;

  // Check if cache is still valid
  const now = Date.now();
  if (now - cached.timestamp > CACHE_DURATION) {
    // Cache expired, remove it
    prCache.delete(jiraKey);
    return null;
  }

  return cached.data;
}

/**
 * Cache pull requests for a Jira key
 */
function cachePullRequests(jiraKey, data) {
  prCache.set(jiraKey, {
    data: data,
    timestamp: Date.now()
  });
}

// ==================== DATA HELPERS ====================

/**
 * Process promises in batches to limit parallel execution
 */
async function processBatches(items, batchSize, processFn) {
  const results = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchPromises = batch.map(item => processFn(item));
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }

  return results;
}

/**
 * Extract commit information from commits response
 */
function extractCommitInfo(commitsData) {
  if (!commitsData.values || commitsData.values.length === 0) {
    return [];
  }

  return commitsData.values.map(commit => ({
    commitId: commit.toCommit.id,
    repositorySlug: commit.repository.slug,
    projectKey: commit.repository.project.key
  }));
}

/**
 * Extract PR data from PR response
 */
function extractPRData(prData) {
  if (!prData.values || prData.values.length === 0) {
    return [];
  }

  return prData.values.map(pr => ({
    id: pr.id,
    title: pr.title,
    state: pr.state,
    author: pr.author?.user?.name || 'Unknown',
    targetBranch: pr.toRef?.displayId || 'Unknown',
    url: pr.links?.self?.[0]?.href || null
  })).filter(pr => pr.url !== null);
}

/**
 * Deduplicate pull requests by URL
 */
function uniqueByUrl(pullRequests) {
  return Array.from(
    new Map(pullRequests.map(pr => [pr.url, pr])).values()
  );
}

// ==================== FETCHING ====================

/**
 * Fetch commits for a Jira issue
 */
async function fetchCommits(jiraKey, auth, bitbucketDomain) {
  const url = `${commitsApi(bitbucketDomain)}/${jiraKey}/commits?limit=${COMMITS_LIMIT}`;
  return apiCall(url, auth);
}

/**
 * Fetch pull requests for a specific commit
 */
async function fetchPullRequestsForCommit(projectKey, repositorySlug, commitId, auth, bitbucketDomain) {
  const url = `${projectsApi(bitbucketDomain)}/${projectKey}/repos/${repositorySlug}/commits/${commitId}/pull-requests`;
  try {
    return await apiCall(url, auth);
  } catch (error) {
    console.error(`Error fetching PRs for ${projectKey}/${repositorySlug}/commits/${commitId}:`, error);
    return { values: [] };
  }
}

/**
 * Fetch pull requests by searching title for a specific project and repo
 */
async function fetchPullRequestsByTitle(projectKey, repoSlug, jiraKey, auth, bitbucketDomain) {
  const encodedJiraKey = encodeURIComponent(jiraKey);
  // Project and repo come from the options page, so encode them
  const repoPath = `${encodeURIComponent(projectKey)}/repos/${encodeURIComponent(repoSlug)}`;
  const url = `${projectsApi(bitbucketDomain)}/${repoPath}/pull-requests?avatarSize=64&order=newest&state=ALL&filterText=${encodedJiraKey}&start=0`;
  try {
    return await apiCall(url, auth);
  } catch (error) {
    console.error(`Error fetching PRs by title for ${projectKey}/${repoSlug} with filter ${jiraKey}:`, error);
    return { values: [] };
  }
}

/**
 * Get all pull requests for commits
 */
async function getPullRequestsForCommits(commits, auth, bitbucketDomain) {
  // Fetch PRs for each commit in batches to limit parallel requests
  const prResults = await processBatches(
    commits,
    MAX_PARALLEL_REQUESTS,
    (commit) => fetchPullRequestsForCommit(commit.projectKey, commit.repositorySlug, commit.commitId, auth, bitbucketDomain)
  );

  return uniqueByUrl(prResults.flatMap(extractPRData));
}

/**
 * Search pull requests by title across the repositories configured in the options page
 */
async function searchPullRequestsByTitle(jiraKey, auth, bitbucketDomain) {
  const allPRData = [];

  for (const { projectKey, repoSlug } of await getSearchRepositories()) {
    const prData = await fetchPullRequestsByTitle(projectKey, repoSlug, jiraKey, auth, bitbucketDomain);
    allPRData.push(...extractPRData(prData));
  }

  return allPRData;
}

// ==================== PULL REQUEST LOOKUP ====================

/**
 * Main function to get pull requests for a Jira issue
 */
export async function getPullRequests(jiraKey) {
  // Check cache first
  const cachedResult = getCachedPullRequests(jiraKey);
  if (cachedResult) {
    console.log(`Returning cached results for ${jiraKey}`);
    return cachedResult;
  }

  // Get configured Bitbucket domain
  const { bitbucketDomain } = await getDomains();

  if (!bitbucketDomain) {
    return {
      success: false,
      error: 'NOT_CONFIGURED',
      message: 'Bitbucket domain is not configured. Please set it in the extension options.'
    };
  }

  // Get auth
  const auth = await getBitbucketAuth(bitbucketDomain);

  if (!auth) {
    return {
      success: false,
      error: 'NO_AUTH',
      message: 'No Bitbucket authentication found. Please add a token in the extension options or log in to Bitbucket.'
    };
  }

  // Validate auth
  const validation = await validateAuth(auth, bitbucketDomain);
  if (!validation.valid) {
    let message = 'Authentication validation failed.';
    if (validation.error === 'INVALID_TOKEN') {
      message = 'Bitbucket token is invalid. Please update it in the extension options.';
    } else if (validation.error === 'INVALID_COOKIE') {
      message = 'Bitbucket session cookie is invalid. Please log in to Bitbucket again.';
    }
    return {
      success: false,
      error: validation.error,
      message
    };
  }

  try {
    // Fetch commits
    const commitsData = await fetchCommits(jiraKey, auth, bitbucketDomain);

    let pullRequestsFromCommits = [];

    // Check if commits found
    if (commitsData.values && commitsData.values.length > 0) {
      // Extract commit information
      const commits = extractCommitInfo(commitsData);

      // Get pull requests from commits
      pullRequestsFromCommits = await getPullRequestsForCommits(commits, auth, bitbucketDomain);
    }

    // Check if we should also search by PR title
    const settings = await chrome.storage.local.get(['includeSearchPRText']);
    const includeSearchPRText = settings.includeSearchPRText === true;

    let pullRequestsFromTitle = [];
    if (includeSearchPRText) {
      // Search PRs by title
      pullRequestsFromTitle = await searchPullRequestsByTitle(jiraKey, auth, bitbucketDomain);
    }

    // Combine and deduplicate results
    const uniquePRs = uniqueByUrl([...pullRequestsFromCommits, ...pullRequestsFromTitle]);

    const result = {
      success: true,
      pullRequests: uniquePRs,
      message: uniquePRs.length > 0
        ? `Found ${uniquePRs.length} pull request(s)`
        : 'No pull requests found.'
    };

    // Cache the result
    cachePullRequests(jiraKey, result);

    return result;
  } catch (error) {
    console.error('Error getting pull requests:', error);
    return {
      success: false,
      error: 'API_ERROR',
      message: `Error fetching pull requests: ${error.message}`
    };
  }
}
