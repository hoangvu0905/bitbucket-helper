// Background configuration
// The Jira and Bitbucket domains and the repositories for the PR title search are not configured here
// but in the options page (see shared/domains.js and shared/search-repositories.js)

// Bitbucket session cookie, used when no token is configured
export const COOKIE_NAME = 'BITBUCKETSESSIONID';

// API limits
export const COMMITS_LIMIT = 100;
export const MAX_PARALLEL_REQUESTS = 5;

// Cache configuration
// Note: Reduced from 5 minutes to 5 seconds to avoid stale data on background script
// Content script (sessionStorage) cache has no expiration - users refresh browser for new data
export const CACHE_DURATION = 5 * 1000; // 5 seconds in milliseconds
