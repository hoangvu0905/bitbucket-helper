// Content scripts are registered at runtime for the configured domains,
// because the domains are not known when the extension is built (so not declared in manifest.json)
import { getDomains, hasHostPermission } from '../shared/domains.js';

// Content scripts, each injected on its configured domain (paths are relative to the extension root)
const CONTENT_SCRIPTS = [
  {
    id: 'jira-content',
    domainKey: 'jiraDomain',
    path: '/browse/*',
    js: ['src/content/jira/jira-content.js'],
    css: ['src/content/jira/jira.css']
  },
  {
    id: 'bitbucket-content',
    domainKey: 'bitbucketDomain',
    path: '/*',
    js: ['src/content/bitbucket/bitbucket-content.js']
  }
];

let contentScriptSync = Promise.resolve();

/**
 * Re-register content scripts for the configured domains (serialized to avoid duplicate IDs)
 */
export function syncContentScripts() {
  contentScriptSync = contentScriptSync
    .then(registerContentScripts)
    .catch(error => console.error('Error registering content scripts:', error));
  return contentScriptSync;
}

/**
 * Register content scripts for each configured domain the user has granted access to
 */
async function registerContentScripts() {
  const domains = await getDomains();

  await chrome.scripting.unregisterContentScripts();

  const scripts = [];
  for (const { domainKey, path, ...script } of CONTENT_SCRIPTS) {
    const domain = domains[domainKey];
    if (domain && await hasHostPermission(domain)) {
      scripts.push({ ...script, matches: [`https://${domain}${path}`] });
    }
  }

  if (scripts.length > 0) {
    await chrome.scripting.registerContentScripts(scripts);
  }
}
