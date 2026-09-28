// Content script for Jira issue pages (registered for the configured Jira domain)
// Adds a "Bitbucket" button that shows the pull requests of the issue

// Container the button is added to
const JIRA_STATUS_SELECTOR = 'div[data-testid="issue.views.issue-base.context.status-and-approvals-wrapper.status-and-approval"]>div';

const BUTTON_ID = 'bitbucket-pr-button';
const BUTTON_LABEL = 'Bitbucket';

// Prefix of the sessionStorage keys caching the table data per Jira key
const STORED_TABLE_KEY = 'bitbucket-pr-table';

// Jira keys auto-load has already fetched, so a re-added button does not fetch again
const autoLoadedKeys = new Set();

// Wait for the page to load
function init() {
  // Wait a bit for Jira to render
  setTimeout(addBitbucketButton, 2000);
}

/**
 * Check if auto-load is enabled and fetch data
 * Runs whenever the button is added, since Jira may render the button container late or re-render it
 */
async function checkAndAutoLoad() {
  const settings = await chrome.storage.local.get(['autoLoadData']);
  if (settings.autoLoadData !== true) {
    return;
  }

  const jiraKey = getJiraKeyFromUrl();
  if (!jiraKey) {
    return;
  }

  // Check if we already have stored table for this Jira key
  const storedTable = getStoredTable(jiraKey);
  if (storedTable) {
    // Display stored table immediately
    displayStoredTable(storedTable);
    return;
  }

  if (autoLoadedKeys.has(jiraKey)) {
    return;
  }

  const button = document.getElementById(BUTTON_ID);
  if (button) {
    autoLoadedKeys.add(jiraKey);
    loadPullRequests(button, jiraKey, true);
  }
}

/**
 * Add Bitbucket button to Jira page
 */
function addBitbucketButton() {
  // Find the target container
  const container = document.querySelector(JIRA_STATUS_SELECTOR);

  if (!container) {
    console.log('Jira status container not found, retrying...');
    setTimeout(addBitbucketButton, 1000);
    return;
  }

  // Check if button already exists
  if (document.getElementById(BUTTON_ID)) {
    return;
  }

  // Create button
  const button = document.createElement('button');
  button.id = BUTTON_ID;
  button.className = 'bitbucket-pr-button';
  button.textContent = BUTTON_LABEL;
  button.title = 'View Bitbucket Pull Requests';

  // Add click handler
  button.addEventListener('click', handleButtonClick);

  // Insert button
  container.appendChild(button);

  // Check if auto-load is enabled
  checkAndAutoLoad();
}

/**
 * Handle button click
 */
function handleButtonClick(event) {
  const button = event.target;

  // Get Jira key from URL
  const jiraKey = getJiraKeyFromUrl();

  if (!jiraKey) {
    showError('Could not extract Jira issue key from URL');
    return;
  }

  // Check if we have stored table data
  const storedTable = getStoredTable(jiraKey);
  if (storedTable) {
    // Just show the popup with stored data if we have PRs
    if (storedTable.pullRequests.length > 0) {
      showPRPopup(storedTable.pullRequests);
    } else {
      showMessage('No pull requests found');
    }
    return;
  }

  loadPullRequests(button, jiraKey, false);
}

/**
 * Request pull requests from the background script and update the button
 * Auto-load only updates the button: it shows no popup, and stays silent on errors and empty results
 */
async function loadPullRequests(button, jiraKey, isAutoLoad) {
  setLoading(button);

  let response;
  try {
    response = await chrome.runtime.sendMessage({ action: 'getPullRequests', jiraKey });
  } catch (error) {
    console.error('Runtime error:', error);
    handleError(currentButton(button), 'Extension error: ' + error.message);
    return;
  }

  button = currentButton(button);

  if (isAutoLoad) {
    if (response.success && response.pullRequests.length > 0) {
      handleSuccess(button, response.pullRequests, response.message, jiraKey, true);
    } else {
      resetButton(button);
    }
  } else if (response.success) {
    handleSuccess(button, response.pullRequests, response.message, jiraKey);
  } else {
    handleError(button, response.message);
  }
}

/**
 * Get the button currently on the page (Jira may re-render it while a request is pending)
 */
function currentButton(fallback) {
  return document.getElementById(BUTTON_ID) || fallback;
}

/**
 * Get Jira key from current URL
 */
function getJiraKeyFromUrl() {
  const match = window.location.pathname.match(/\/browse\/([A-Z\d]+-\d+)/);
  return match ? match[1] : null;
}

/**
 * Handle successful PR fetch
 */
function handleSuccess(button, pullRequests, message, jiraKey, isAutoLoad = false) {
  resetButton(button);

  if (pullRequests.length > 0) {
    // Change button to green
    button.classList.add('has-prs');
    button.textContent = `${BUTTON_LABEL} (${pullRequests.length})`;

    // Show popup with PRs only if not from auto-load
    if (!isAutoLoad) {
      showPRPopup(pullRequests);
    }

    // Store the table data
    storeTable(jiraKey, pullRequests);
  } else {
    // No PRs found
    button.classList.remove('has-prs');
    if (!isAutoLoad) {
      showMessage(message || 'No pull requests found');
    }
  }
}

/**
 * Handle error
 */
function handleError(button, message) {
  resetButton(button);
  showError(message);
}

/**
 * Set button loading state
 */
function setLoading(button) {
  button.classList.add('loading');
  button.textContent = 'Loading...';
  button.disabled = true;
}

/**
 * Reset button state
 */
function resetButton(button) {
  button.disabled = false;
  button.classList.remove('loading');
  if (!button.classList.contains('has-prs')) {
    button.textContent = BUTTON_LABEL;
  }
}

/**
 * Create a link opening in a new tab
 */
function createLink(url, className, text) {
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.className = className;
  link.textContent = text;
  return link;
}

/**
 * Show PR popup
 */
function showPRPopup(pullRequests) {
  // Remove existing popup if any
  const existingPopup = document.getElementById('bitbucket-pr-popup');
  if (existingPopup) {
    existingPopup.remove();
  }

  // Create popup overlay
  const popup = document.createElement('div');
  popup.id = 'bitbucket-pr-popup';
  popup.className = 'bitbucket-pr-popup';

  // Create popup container
  const container = document.createElement('div');

  // Create header
  const header = document.createElement('div');
  header.className = 'popup-header';
  header.innerHTML = `
    <h3>Pull Requests (${pullRequests.length})</h3>
    <button class="close-button">×</button>
  `;

  // Create content
  const content = document.createElement('div');
  content.className = 'popup-content';

  // Create table
  const table = document.createElement('table');
  table.className = 'pr-table';

  // Create table header
  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th>PR ID</th>
      <th>Title</th>
      <th>Author</th>
      <th>Target Branch</th>
      <th>State</th>
    </tr>
  `;
  table.appendChild(thead);

  // Create table body
  const tbody = document.createElement('tbody');
  pullRequests.forEach(pr => {
    const row = document.createElement('tr');

    // PR ID (clickable link)
    const idCell = document.createElement('td');
    idCell.appendChild(createLink(pr.url, 'pr-id-link', `#${pr.id}`));
    row.appendChild(idCell);

    // Title (clickable link)
    const titleCell = document.createElement('td');
    titleCell.className = 'pr-title';
    const titleLink = createLink(pr.url, 'pr-title-link', pr.title);
    titleLink.title = pr.title; // Show full title on hover
    titleCell.appendChild(titleLink);
    row.appendChild(titleCell);

    // Author
    const authorCell = document.createElement('td');
    authorCell.textContent = pr.author;
    row.appendChild(authorCell);

    // Target Branch
    const branchCell = document.createElement('td');
    branchCell.className = 'pr-branch';
    branchCell.textContent = pr.targetBranch;
    row.appendChild(branchCell);

    // State
    const stateCell = document.createElement('td');
    const stateBadge = document.createElement('span');
    stateBadge.className = `pr-state pr-state-${pr.state.toLowerCase()}`;
    stateBadge.textContent = pr.state;
    stateCell.appendChild(stateBadge);
    row.appendChild(stateCell);

    tbody.appendChild(row);
  });
  table.appendChild(tbody);

  content.appendChild(table);
  container.appendChild(header);
  container.appendChild(content);
  popup.appendChild(container);

  // Add close handler
  const closeButton = popup.querySelector('.close-button');
  closeButton.addEventListener('click', () => popup.remove());

  // Close on outside click
  popup.addEventListener('click', (e) => {
    if (e.target === popup) {
      popup.remove();
    }
  });

  // Add to page
  document.body.appendChild(popup);
}

/**
 * Show error message
 */
function showError(message) {
  showNotification(message, 'error');
}

/**
 * Show info message
 */
function showMessage(message) {
  showNotification(message, 'info');
}

/**
 * Show notification
 */
function showNotification(message, type = 'info') {
  // Remove existing notification
  const existing = document.getElementById('bitbucket-notification');
  if (existing) {
    existing.remove();
  }

  // Create notification
  const notification = document.createElement('div');
  notification.id = 'bitbucket-notification';
  notification.className = `bitbucket-notification ${type}`;
  notification.textContent = message;

  document.body.appendChild(notification);

  // Auto-remove after 5 seconds
  setTimeout(() => {
    notification.remove();
  }, 5000);
}

/**
 * Store table data for a Jira key in the page
 * Note: Data persists indefinitely in sessionStorage until browser/tab is closed or refreshed
 * Users must refresh the page to fetch new data
 */
function storeTable(jiraKey, pullRequests) {
  try {
    const tableData = {
      pullRequests: pullRequests
    };
    // Store in sessionStorage for the current page session
    sessionStorage.setItem(STORED_TABLE_KEY + '-' + jiraKey, JSON.stringify(tableData));
  } catch (error) {
    console.error('Error storing table data:', error);
  }
}

/**
 * Get stored table data for a Jira key
 * Note: Returns cached data without expiration check - refresh browser to get new data
 * Handles backward compatibility with old cache format that included timestamp
 */
function getStoredTable(jiraKey) {
  try {
    const stored = sessionStorage.getItem(STORED_TABLE_KEY + '-' + jiraKey);
    if (!stored) return null;

    const tableData = JSON.parse(stored);
    // Backward compatibility: old cache format had timestamp field, just return pullRequests
    return tableData;
  } catch (error) {
    console.error('Error getting stored table data:', error);
    return null;
  }
}

/**
 * Display stored table data
 */
function displayStoredTable(tableData) {
  const button = document.getElementById(BUTTON_ID);
  if (button) {
    if (tableData.pullRequests.length > 0) {
      button.classList.add('has-prs');
      button.textContent = `${BUTTON_LABEL} (${tableData.pullRequests.length})`;
    } else {
      button.classList.remove('has-prs');
      button.textContent = BUTTON_LABEL;
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Watch for button removal in single-page app
const observer = new MutationObserver(() => {
  // Check if button exists
  const button = document.getElementById(BUTTON_ID);
  const container = document.querySelector(JIRA_STATUS_SELECTOR);

  if (!button && container) {
    // Button doesn't exist but container exists, add it
    console.log('Bitbucket button not found, adding...');
    addBitbucketButton();
  }
});

observer.observe(document, { subtree: true, childList: true });
