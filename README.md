# Bitbucket Pull Request for Jira

A Chrome browser extension that displays Bitbucket pull requests associated with Jira issues.

## Features

- 🔍 **Automatic PR Detection**: Automatically finds all pull requests related to a Jira issue
- 🎨 **Visual Indicators**: Button turns green when PRs are found
- 🔐 **Secure Authentication**: Uses Bitbucket token for authentication, with automatic fallback to browser cookies
- ⚡ **Background Processing**: API calls handled via service worker to avoid CORS issues
- ✅ **Token Validation**: Validates Bitbucket token before making API calls
- 🔧 **Easy Configuration**: Options page for the Jira / Bitbucket domains and the Bitbucket token
- 🔗 **Jira Links on Bitbucket**: Optionally rewrites Jira issue links on Bitbucket pages to your Jira site

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked"
5. Select the extension directory (the folder containing `manifest.json`)
6. The options page opens automatically - configure the domains (see below)

## Configuration

All site-specific settings live in the extension **options page**: right-click the extension icon → **Options**, or click the **extension options** link in the popup.

### Setting the Jira and Bitbucket Domains

There are no default domains - the extension does nothing until they are configured.

1. Open the options page
2. Enter the host names only (e.g. `your-company.atlassian.net` and `bitbucket.your-company.com`). A pasted URL is reduced to its host name.
3. Click **Save** and allow Chrome to access the two sites when prompted
   - If access is denied, the settings are not saved
   - Access to previously configured domains is revoked automatically
4. Reload any open Jira and Bitbucket tabs

### Setting up Bitbucket Authentication

The extension uses **token-based authentication** as the primary method. Browser cookies are used only as a fallback when no token is configured.

#### Option 1: Token Authentication (Recommended)

1. Open the options page
2. Get your Bitbucket authorization token:
   - Go to your Bitbucket profile settings → HTTP access tokens
   - Create a new token with appropriate repository read permissions
   - Or contact your Bitbucket administrator to obtain an authorization token
3. Paste the token value into the "Bitbucket token" field
4. Optionally click **Check token** to verify it against the entered Bitbucket domain (nothing is saved by the check)
5. Click **Save** - the token is saved without validation, since the session cookie is used as a fallback anyway

#### Option 2: Browser Cookie (Automatic Fallback)

If no token is configured (leave the token field empty), the extension will automatically use your browser's Bitbucket session cookie:
- This only works when you're logged into Bitbucket in the same browser
- The extension reads the `BITBUCKETSESSIONID` cookie from your browser session
- No manual configuration needed - just stay logged into Bitbucket
- Note: Session cookies may expire frequently, requiring you to log in to Bitbucket again

### Popup Settings

The popup (extension icon) holds the feature toggles: *Include search PR Text*, *Auto-load data* and *Rewrite Jira Links on Bitbucket*. It warns when the domains are not configured yet.

### Configuring the PR Title Search

When *Include search PR Text* is enabled in the popup, the Jira key is also searched in the pull request titles of the repositories listed in the options page (**Pull request title search → Repositories**), one `PROJECT/repository` per line. There is no default list; without repositories only the commit-based lookup is used.

## Usage

### Viewing Pull Requests in Jira

1. Navigate to a Jira issue page (e.g., `https://<your-jira-domain>/browse/PROJECT-123`)
2. Look for the "Bitbucket" button in the issue header
3. Click the button to fetch related pull requests
4. If PRs are found:
   - The button turns green
   - A popup displays all PR links
   - Click any link to open the PR in a new tab

## How It Works

### API Flow

1. **Extract Jira Key**: Gets the issue key from the URL (e.g., `PROJECT-123`)
2. **Fetch Commits**: Calls Bitbucket API to get all commits linked to the Jira issue
   - Endpoint: `https://{bitbucketDomain}/rest/jira/latest/issues/{jiraKey}/commits`
3. **Extract Repository Info**: Parses commit data to get:
   - Commit IDs
   - Repository slugs
   - Project keys
4. **Fetch Pull Requests**: For each unique repository, fetches all PRs
   - Endpoint: `https://{bitbucketDomain}/rest/api/latest/projects/{projectKey}/repos/{repoSlug}/pull-requests`
5. **Deduplicate & Display**: Removes duplicate PR links and displays them in a popup

### Authentication Validation

The extension validates the Bitbucket authentication before making API calls:

- **No Domain Configured**: Shows error message prompting user to configure the domains in the options page
- **No Authentication**: Shows error message prompting user to configure token
- **Token Authentication**: Uses `Authorization` header with the configured token
  - Calls `/rest/api/latest/projects` to verify token validity
  - If validation fails, shows "invalid token" message
- **Cookie Authentication (Fallback)**: Uses browser session cookie when no token is configured
  - Automatically retrieves `BITBUCKETSESSIONID` from browser cookies
  - Calls `/rest/api/latest/projects` to verify authentication
  - If validation fails, shows "invalid cookie" message
- **Valid Authentication**: Proceeds with PR fetching

## File Structure

There is no build step: the folder is loaded as-is with "Load unpacked".

```
├── manifest.json                  # Extension manifest (Manifest V3)
├── icons/
│   └── icon.png                   # Extension icon
└── src/
    ├── background/                # Service worker (ES modules)
    │   ├── service-worker.js      # Entry point: message routing, install/storage/permission listeners
    │   ├── config.js              # Cookie name, API limits, cache duration
    │   ├── bitbucket-api.js       # Bitbucket REST endpoints, auth headers, API calls
    │   ├── auth.js                # Token/cookie auth and validation (also used by "Check token")
    │   ├── pull-requests.js       # PR lookup for a Jira issue (commits + title search, caching)
    │   └── content-scripts.js     # Registers content scripts for the configured domains
    ├── content/                   # Content scripts (classic scripts, no imports)
    │   ├── jira/
    │   │   ├── jira-content.js    # "Bitbucket" button, PR popup and notifications on Jira issues
    │   │   └── jira.css
    │   └── bitbucket/
    │       └── bitbucket-content.js  # Jira link rewriting on Bitbucket
    ├── popup/                     # Toolbar popup: feature toggles
    │   ├── popup.html
    │   ├── popup.css
    │   └── popup.js
    ├── options/                   # Options page: domains, PR title search repositories, Bitbucket token
    │   ├── options.html
    │   ├── options.css
    │   └── options.js
    └── shared/                    # Used by the service worker and the popup/options pages
        ├── domains.js             # Configured domains, host permission helpers, domain normalization
        ├── search-repositories.js # Repositories for the PR title search (storage, parsing)
        ├── message.js             # Status message on the popup/options pages
        └── form.css               # Styles shared by the popup and options pages
```

## Architecture

### Service Worker (`src/background/`)

Runs as an ES module (`"type": "module"` in `manifest.json`), split by concern:

- **Message Handling** (`service-worker.js`): Routes messages to handlers - `getPullRequests` (Jira content script), `validateToken` (options page)
- **Content Script Registration** (`content-scripts.js`): Registers the Jira/Bitbucket content scripts for the configured domains the user granted access to. The domains are unknown at build time, so the scripts are not declared in `manifest.json`; they are re-registered when the domains or permissions change.
- **Authentication** (`auth.js`): Gets the token from storage, falls back to the browser cookie, and validates either against the Bitbucket API
- **API Helpers** (`bitbucket-api.js`): Endpoints and authenticated API calls
- **Pull Request Fetching** (`pull-requests.js`): Main logic for fetching, deduplicating and caching PRs

### Jira Content Script (`src/content/jira/jira-content.js`)

- Injects the "Bitbucket" button into Jira pages
- Handles user interactions and auto-load
- Displays PR popup and notifications
- Watches for button removal in Jira's SPA

### Bitbucket Content Script (`src/content/bitbucket/bitbucket-content.js`)

- Rewrites Jira issue links to point to the configured Jira domain (when *Rewrite Jira Links on Bitbucket* is enabled)

Content scripts cannot be ES modules, so each one keeps its own constants (e.g. selectors) at the top of the file.

### Options Page (`src/options/`)

- Stores `jiraDomain`, `bitbucketDomain`, `searchRepositories` and `bitbucketToken` in `chrome.storage.local`
- Requests host access for the configured domains (optional host permissions) and revokes access to domains no longer configured
- Checks the entered token against the entered Bitbucket domain on demand

### Popup (`src/popup/`)

- Stores the feature toggles (`includeSearchPRText`, `autoLoadData`, `rewriteJiraLinks`) in `chrome.storage.local`; the checkbox IDs are the storage keys

## Error Handling

The extension handles several error scenarios:

- **No Domain Configured**: Clear message to configure the domains in the options page
- **No Authentication**: Clear message to configure token in the options page
- **Invalid/Expired Token**: Validation detects and shows specific error
- **Invalid/Expired Cookie** (fallback mode): Validation detects and prompts user to log in to Bitbucket
- **No Commits**: Indicates no commits linked to Jira issue
- **No PRs**: Shows message when commits exist but no PRs found
- **API Errors**: Catches and displays network/API errors

## Troubleshooting

### Button doesn't appear

- Check that the Jira and Bitbucket domains are configured in the options page and site access was allowed
- Wait a few seconds for the page to load
- Refresh the Jira page (required after changing the domains)
- Check that you're on a Jira issue page (URL matches `/browse/*`)

### "Invalid token" or "Invalid cookie" error

- **Token mode**: Token may have expired - get a fresh token from your Bitbucket administrator
- **Cookie mode (fallback)**: Cookie may have expired - log in to Bitbucket again in your browser
- Ensure you copied the entire value
- Use **Check token** in the options page to verify the token

### No pull requests found

- Verify the Jira issue has commits linked to it
- Check that commits are pushed to Bitbucket
- Ensure commits have the Jira key in their message

## Development

### Testing Changes

1. Make changes to the code
2. Go to `chrome://extensions/`
3. Click the refresh icon on the extension card
4. Test on a Jira issue page

### Adding New Features

- API changes: `src/background/` (`pull-requests.js`, `bitbucket-api.js`, `auth.js`)
- New message types: add a handler to `MESSAGE_HANDLERS` in `src/background/service-worker.js`
- Jira UI changes: `src/content/jira/`
- Bitbucket UI changes: `src/content/bitbucket/`
- Settings: `src/popup/` (feature toggles) or `src/options/` (domains, repositories, token)
- Configuration: `src/background/config.js`

## Privacy & Security

- Token and domains are stored locally in Chrome's extension storage
- The extension only gets access to the two configured sites, granted by you at runtime
- Browser cookies are only accessed when no token is configured (fallback mode)
- All API calls are made through the background service worker
- No data is sent to third-party servers
- Authentication credentials are only used for Bitbucket API authentication

## License

MIT

## Support

For issues or questions, please open an issue on the GitHub repository.