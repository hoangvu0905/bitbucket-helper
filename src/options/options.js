// Options page script for managing domains, the Bitbucket token and the PR title search repositories
import { getDomains, hasHostPermission, normalizeDomain, originPattern } from '../shared/domains.js';
import { getSearchRepositories } from '../shared/search-repositories.js';
import { showMessage } from '../shared/message.js';
import { createRepositoryPicker } from './repository-picker.js';

const jiraDomainInput = document.getElementById('jiraDomainInput');
const bitbucketDomainInput = document.getElementById('bitbucketDomainInput');
const tokenInput = document.getElementById('tokenInput');
const checkTokenButton = document.getElementById('checkTokenButton');
const loadRepositoriesButton = document.getElementById('loadRepositoriesButton');
const repositoriesStatus = document.getElementById('repositoriesStatus');
const saveButton = document.getElementById('saveButton');
const messageDiv = document.getElementById('message');
const repositoryPicker = createRepositoryPicker(
  document.getElementById('repositoryList'),
  document.getElementById('repositoryFilterInput')
);

// Load saved values (no defaults)
loadSettings();

// Add event listeners
checkTokenButton.addEventListener('click', checkToken);
loadRepositoriesButton.addEventListener('click', () => loadRepositories(true));
saveButton.addEventListener('click', saveSettings);

/**
 * Load saved domains, token and repositories from storage
 */
async function loadSettings() {
  const [domains, repositories, { bitbucketToken }] = await Promise.all([
    getDomains(),
    getSearchRepositories(),
    chrome.storage.local.get(['bitbucketToken'])
  ]);
  jiraDomainInput.value = domains.jiraDomain || '';
  bitbucketDomainInput.value = domains.bitbucketDomain || '';
  tokenInput.value = bitbucketToken || '';
  repositoryPicker.setSelected(repositories);

  // Load the repositories to choose from right away when Bitbucket access is already set up
  if (domains.bitbucketDomain && await hasHostPermission(domains.bitbucketDomain)) {
    loadRepositories(false);
  }
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
 * Describe a failed Bitbucket call (token check or repository listing)
 */
function describeError(response, bitbucketDomain, fallback) {
  switch (response.error) {
    case 'INVALID_TOKEN':
      return 'Token is invalid or expired. Please get a new one.';
    case 'INVALID_COOKIE':
      return 'Your Bitbucket session is invalid. Log in to Bitbucket in this browser, or enter a token.';
    case 'NO_AUTH':
      return 'Enter a token, or log in to Bitbucket in this browser.';
    case 'NETWORK_ERROR':
      return `Could not reach Bitbucket at ${bitbucketDomain}. Please check the domain and your connection.`;
    default:
      return response.message ? `${fallback}: ${response.message}` : fallback;
  }
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
    } else {
      showMessage(messageDiv, describeError(response, bitbucketDomain, 'Token validation failed'), 'error');
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
 * Show the status of the repository list
 */
function showRepositoriesStatus(text, type = 'info') {
  repositoriesStatus.textContent = text;
  repositoriesStatus.classList.toggle('error', type === 'error');
}

/**
 * Load the repositories of the entered Bitbucket domain, with the entered token or the session cookie
 * From the button, site access is requested first; on page load it is already granted
 */
async function loadRepositories(fromClick) {
  const bitbucketDomain = fromClick ? readDomain(bitbucketDomainInput, 'Bitbucket') : normalizeDomain(bitbucketDomainInput.value);
  if (!bitbucketDomain) {
    return;
  }

  loadRepositoriesButton.disabled = true;
  showRepositoriesStatus('Loading repositories...');

  try {
    if (fromClick) {
      // Must be requested straight from the click (user gesture), before any other await
      const granted = await chrome.permissions.request({ origins: [originPattern(bitbucketDomain)] });
      if (!granted) {
        showRepositoriesStatus('Access to the Bitbucket site is required to load the repositories.', 'error');
        return;
      }
    }

    const response = await chrome.runtime.sendMessage({ action: 'listRepositories', token: tokenInput.value.trim(), bitbucketDomain });

    if (response.success) {
      repositoryPicker.setAvailable(response.repositories);
      showRepositoriesStatus(`${response.repositories.length} repositories loaded from ${bitbucketDomain}. Select the ones to search, then save.`);
    } else {
      showRepositoriesStatus(describeError(response, bitbucketDomain, 'Could not load the repositories'), 'error');
    }
  } catch (error) {
    console.error('Error loading repositories:', error);
    showRepositoriesStatus('Extension error: ' + error.message, 'error');
  } finally {
    loadRepositoriesButton.disabled = false;
  }
}

/**
 * Save domains, token and repositories to storage
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

  const tokenValue = tokenInput.value.trim();
  const searchRepositories = repositoryPicker.getSelected();
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

    await chrome.storage.local.set({ jiraDomain, bitbucketDomain, searchRepositories });
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
