// Bitbucket authentication: the token from the options page, or the browser session cookie as fallback
import { COOKIE_NAME } from './config.js';
import { buildAuthHeaders, projectsApi } from './bitbucket-api.js';

const AUTH_REQUIRED_EXCEPTION = 'com.atlassian.plugins.rest.api.security.exception.AuthenticationRequiredException';

/**
 * Get Bitbucket auth from storage or browser cookies
 * Returns an object with { value, type } where type is 'cookie' or 'token'
 */
export async function getBitbucketAuth(bitbucketDomain) {
  // First, try to get token from storage
  const stored = await chrome.storage.local.get(['bitbucketToken']);
  if (stored.bitbucketToken) {
    return {
      value: stored.bitbucketToken,
      type: 'token'
    };
  }

  // If not in storage, try to get from browser cookies
  return getCookieAuth(bitbucketDomain);
}

/**
 * Get Bitbucket auth from the browser session cookie, or null when not logged in
 */
export async function getCookieAuth(bitbucketDomain) {
  try {
    const cookies = await chrome.cookies.getAll({
      domain: bitbucketDomain,
      name: COOKIE_NAME
    });

    if (cookies && cookies.length > 0) {
      return { value: cookies[0].value, type: 'cookie' };
    }
  } catch (error) {
    console.error('Error getting cookie:', error);
  }

  return null;
}

/**
 * Validate if the auth is valid by calling the projects API
 */
export async function validateAuth(auth, bitbucketDomain) {
  if (!auth || !auth.value) {
    return { valid: false, error: 'NO_AUTH' };
  }

  const invalid = { valid: false, error: auth.type === 'token' ? 'INVALID_TOKEN' : 'INVALID_COOKIE' };

  try {
    const response = await fetch(projectsApi(bitbucketDomain), {
      headers: buildAuthHeaders(auth)
    });

    // Rejected credentials (e.g. a wrong or expired token)
    if (response.status === 401) {
      return invalid;
    }

    const data = await response.json();

    // Check if response contains authentication error
    if (data.errors && data.errors.some(err => err.exceptionName === AUTH_REQUIRED_EXCEPTION)) {
      return invalid;
    }

    // If we got here and there's no error, auth is valid
    return { valid: true };
  } catch (error) {
    console.error('Error validating auth:', error);
    return { valid: false, error: 'NETWORK_ERROR' };
  }
}

/**
 * Validate a token against a Bitbucket domain (values entered in the options page, not yet saved)
 */
export async function validateToken(token, bitbucketDomain) {
  if (!bitbucketDomain) {
    return { valid: false, error: 'NOT_CONFIGURED' };
  }

  return validateAuth({ value: token, type: 'token' }, bitbucketDomain);
}
