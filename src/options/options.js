// Options page script for managing domains, the PR title search repositories and the Bitbucket token
import { getDomains, normalizeDomain, originPattern } from '../shared/domains.js';
import { formatSearchRepositories, getSearchRepositories, parseSearchRepositories } from '../shared/search-repositories.js';
import { showMessage } from '../shared/message.js';

const jiraDomainInput = document.getElementById('jiraDomainInput');
const bitbucketDomainInput = document.getElementById('bitbucketDomainInput');
const searchRepositoriesInput = document.getElementById('searchRepositoriesInput');
const tokenInput = document.getElementById('tokenInput');
const checkTokenButton = document.getElementById('checkTokenButton');
const saveButton = document.getElementById('saveButton');
const messageDiv = document.getElementById('message');

// Load saved values (no defaults)
loadSettings();

// Add event listeners
checkTokenButton.addEventListener('click', checkToken);
saveButton.addEventListener('click', saveSettings);

/**
 * Load saved domains, repositories and token from storage
 */
async function loadSettings() {
  const [domains, repositories, { bitbucketToken }] = await Promise.all([
    getDomains(),
    getSearchRepositories(),
    chrome.storage.local.get(['bitbucketToken'])
  ]);
  jiraDomainInput.value = domains.jiraDomain || '';
  bitbucketDomainInput.value = domains.bitbucketDomain || '';
  searchRepositoriesInput.value = formatSearchRepositories(repositories);
  tokenInput.value = bitbucketToken || '';
}

/**
 * Read and normalize a domain input, showing an error if it is empty or invalid
 */
function readDomain(input, name) {
  const domain = normalizeDomain(input.value);
  if (!domain) {
    showMessage(messageDiv, `Please enter a valid ${name} domain`, 'error');
    input.focus();
    return null;
  }

  input.value = domain;
  return domain;
}

/**
 * Check the entered token against the entered Bitbucket domain, without saving anything
 */
async function checkToken() {
  const bitbucketDomain = readDomain(bitbucketDomainInput, 'Bitbucket');
  if (!bitbucketDomain) {
    return;
  }

  const tokenValue = tokenInput.value.trim();
  if (!tokenValue) {
    showMessage(messageDiv, 'Please enter a token to check. Without a token, the Bitbucket session cookie is used.', 'info');
    return;
  }

  checkTokenButton.disabled = true;
  checkTokenButton.textContent = 'Checking...';

  try {
    // Must be requested straight from the click (user gesture), before any other await
    const granted = await chrome.permissions.request({ origins: [originPattern(bitbucketDomain)] });
    if (!granted) {
      showMessage(messageDiv, 'Access to the Bitbucket site is required to check the token.', 'error');
      return;
    }

    const response = await chrome.runtime.sendMessage({ action: 'validateToken', token: tokenValue, bitbucketDomain });

    if (response.valid) {
      showMessage(messageDiv, 'Token is valid ✓', 'success');
    } else if (response.error === 'INVALID_TOKEN') {
      showMessage(messageDiv, 'Token is invalid or expired. Please get a new one.', 'error');
    } else if (response.error === 'NETWORK_ERROR') {
      showMessage(messageDiv, `Could not reach Bitbucket at ${bitbucketDomain}. Please check the domain and your connection.`, 'error');
    } else {
      showMessage(messageDiv, 'Token validation failed', 'error');
    }
  } catch (error) {
    console.error('Error checking token:', error);
    showMessage(messageDiv, 'Extension error: ' + error.message, 'error');
  } finally {
    checkTokenButton.disabled = false;
    checkTokenButton.textContent = 'Check token';
  }
}

/**
 * Save domains, repositories and token to storage
 * The token is not validated here: without a valid token the Bitbucket session cookie is used as fallback
 */
async function saveSettings() {
  const jiraDomain = readDomain(jiraDomainInput, 'Jira');
  if (!jiraDomain) {
    return;
  }

  const bitbucketDomain = readDomain(bitbucketDomainInput, 'Bitbucket');
  if (!bitbucketDomain) {
    return;
  }

  const { repositories, invalidLine } = parseSearchRepositories(searchRepositoriesInput.value);
  if (invalidLine) {
    showMessage(messageDiv, `Repositories line ${invalidLine} is not in PROJECT/repository format`, 'error');
    searchRepositoriesInput.focus();
    return;
  }
  searchRepositoriesInput.value = formatSearchRepositories(repositories);

  const tokenValue = tokenInput.value.trim();
  const origins = [originPattern(jiraDomain), originPattern(bitbucketDomain)];

  saveButton.disabled = true;
  saveButton.textContent = 'Saving...';

  try {
    // Must be requested straight from the click (user gesture), before any other await
    const granted = await chrome.permissions.request({ origins });
    if (!granted) {
      showMessage(messageDiv, 'Access to the Jira and Bitbucket sites is required. Settings were not saved.', 'error');
      return;
    }

    await chrome.storage.local.set({ jiraDomain, bitbucketDomain, searchRepositories: repositories });
    if (tokenValue) {
      await chrome.storage.local.set({ bitbucketToken: tokenValue });
    } else {
      await chrome.storage.local.remove('bitbucketToken');
    }

    await removeUnusedHostPermissions(origins);

    showMessage(messageDiv, 'Settings saved successfully! ✓ Reload open Jira and Bitbucket tabs to apply them.', 'success');
  } catch (error) {
    console.error('Error saving settings:', error);
    showMessage(messageDiv, 'Failed to save: ' + error.message, 'error');
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = 'Save';
  }
}

/**
 * Revoke access to sites that are no longer configured (e.g. a previous domain)
 */
async function removeUnusedHostPermissions(usedOrigins) {
  try {
    const { origins } = await chrome.permissions.getAll();
    const unusedOrigins = origins.filter(origin => !usedOrigins.includes(origin));
    if (unusedOrigins.length > 0) {
      await chrome.permissions.remove({ origins: unusedOrigins });
    }
  } catch (error) {
    console.error('Error removing unused host permissions:', error);
  }
}
