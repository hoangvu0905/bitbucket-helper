// Popup script for the feature toggles
// Domains and the Bitbucket token are managed in the options page
import { getDomains, isConfigured } from '../shared/domains.js';
import { showMessage } from '../shared/message.js';

// chrome.storage.local keys of the feature toggles (also the IDs of their checkboxes)
const TOGGLE_KEYS = ['includeSearchPRText', 'autoLoadData', 'rewriteJiraLinks'];

const saveButton = document.getElementById('saveButton');
const messageDiv = document.getElementById('message');
const configWarning = document.getElementById('configWarning');

// Load saved settings
loadSettings();

// Add event listeners
saveButton.addEventListener('click', saveSettings);
document.querySelectorAll('.open-options-link').forEach(link => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    chrome.runtime.openOptionsPage();
  });
});

/**
 * Load saved settings from storage
 */
async function loadSettings() {
  const [domains, toggles] = await Promise.all([getDomains(), chrome.storage.local.get(TOGGLE_KEYS)]);

  // Warn if the domains have not been configured in the options page yet
  configWarning.style.display = isConfigured(domains) ? 'none' : 'block';

  // Load checkbox state (default to false if not set)
  TOGGLE_KEYS.forEach(key => {
    document.getElementById(key).checked = toggles[key] === true;
  });
}

/**
 * Save settings to storage
 * No token validation needed: the token lives in the options page, and the session cookie is the fallback
 */
async function saveSettings() {
  saveButton.disabled = true;

  try {
    const toggles = Object.fromEntries(TOGGLE_KEYS.map(key => [key, document.getElementById(key).checked]));
    await chrome.storage.local.set(toggles);
    showMessage(messageDiv, 'Settings saved successfully! ✓', 'success');
  } catch (error) {
    console.error('Error saving settings:', error);
    showMessage(messageDiv, 'Failed to save: ' + error.message, 'error');
  } finally {
    saveButton.disabled = false;
  }
}
