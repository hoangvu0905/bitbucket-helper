// Jira and Bitbucket domains
// They have no defaults: the user configures them in the options page, and the extension
// gets access to them at runtime (optional host permissions)

// chrome.storage.local keys of the configured domains
export const DOMAIN_KEYS = ['jiraDomain', 'bitbucketDomain'];

/**
 * Get the configured domains as { jiraDomain, bitbucketDomain } (undefined when not set)
 */
export function getDomains() {
  return chrome.storage.local.get(DOMAIN_KEYS);
}

/**
 * Check that both domains are configured
 */
export function isConfigured({ jiraDomain, bitbucketDomain }) {
  return Boolean(jiraDomain && bitbucketDomain);
}

/**
 * Host permission pattern for a domain
 */
export function originPattern(domain) {
  return `https://${domain}/*`;
}

/**
 * Check if the user has granted host permission for a domain
 */
export function hasHostPermission(domain) {
  return chrome.permissions.contains({ origins: [originPattern(domain)] });
}

/**
 * Normalize user input to a bare host name, e.g. "https://host/browse/X-1" -> "host"
 * Returns null for empty or invalid input
 */
export function normalizeDomain(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return url.hostname || null;
  } catch (error) {
    return null;
  }
}
