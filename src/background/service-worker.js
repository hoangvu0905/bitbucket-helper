// Service worker entry point: routes messages and keeps content scripts in sync with the configured domains
import { getPullRequests } from './pull-requests.js';
import { validateToken } from './auth.js';
import { syncContentScripts } from './content-scripts.js';
import { DOMAIN_KEYS, getDomains, isConfigured } from '../shared/domains.js';

// ==================== MESSAGE HANDLING ====================

// Handlers by message action; each resolves to the response
const MESSAGE_HANDLERS = {
  // From the Jira content script
  getPullRequests: async (request) => getPullRequests(request.jiraKey),
  // From the options page
  validateToken: async (request) => validateToken(request.token, request.bitbucketDomain)
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const handler = MESSAGE_HANDLERS[request.action];
  if (!handler) {
    return false;
  }

  handler(request, sender)
    .then(sendResponse)
    .catch(error => {
      console.error(`Error handling ${request.action}:`, error);
      sendResponse({ success: false, error: 'UNEXPECTED_ERROR', message: error.message });
    });
  return true; // Will respond asynchronously
});

// ==================== CONTENT SCRIPT REGISTRATION ====================

chrome.runtime.onInstalled.addListener(async (details) => {
  await syncContentScripts();

  // Nothing works until the domains are configured, so point the user to the options page
  if (details.reason === 'install' || details.reason === 'update') {
    if (!isConfigured(await getDomains())) {
      chrome.runtime.openOptionsPage();
    }
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && DOMAIN_KEYS.some(key => key in changes)) {
    syncContentScripts();
  }
});

chrome.permissions.onAdded.addListener(syncContentScripts);
chrome.permissions.onRemoved.addListener(syncContentScripts);
