// Bitbucket REST API: endpoints and authenticated calls
import { COOKIE_NAME } from './config.js';

/**
 * Endpoint listing the commits linked to Jira issues
 */
export function commitsApi(bitbucketDomain) {
  return `https://${bitbucketDomain}/rest/jira/latest/issues`;
}

/**
 * Endpoint for projects, and (below it) their repositories and pull requests
 */
export function projectsApi(bitbucketDomain) {
  return `https://${bitbucketDomain}/rest/api/latest/projects`;
}

/**
 * Endpoint listing the repositories the user can access, across all projects
 */
export function reposApi(bitbucketDomain) {
  return `https://${bitbucketDomain}/rest/api/latest/repos`;
}

/**
 * Build authentication headers based on auth type
 */
export function buildAuthHeaders(auth) {
  if (auth.type === 'token') {
    return { 'Authorization': `Bearer ${auth.value}` };
  } else {
    // Cookie authentication
    return { 'Cookie': `${COOKIE_NAME}=${auth.value}` };
  }
}

/**
 * Make API call with auth
 */
export async function apiCall(url, auth) {
  const response = await fetch(url, {
    headers: buildAuthHeaders(auth)
  });

  if (!response.ok) {
    throw new Error(`API call failed: ${response.status}`);
  }

  return response.json();
}
