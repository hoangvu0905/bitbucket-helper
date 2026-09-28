// Content script for Bitbucket pages (registered for the configured Bitbucket domain)
// This script rewrites Jira issue links to point to the configured Jira domain

(async function () {
    "use strict";

    // Check if the feature is enabled (popup toggle) and the Jira domain is configured
    const settings = await chrome.storage.local.get(['rewriteJiraLinks', 'jiraDomain']);
    if (settings.rewriteJiraLinks !== true || !settings.jiraDomain) {
        return;
    }

    const BASE_URL = `https://${settings.jiraDomain}/browse/`;

    function rewriteLinks() {
        document.querySelectorAll('a.jira-issue-link').forEach(a => {
            const key = a.getAttribute("data-issuekey");
            // prevent repeated rewriting
            if (key && !a.dataset.rewritten) {
                a.href = BASE_URL + key;
                a.addEventListener("click", function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    window.open(BASE_URL + key);
                }, true);
                a.dataset.rewritten = "true";
            }
        });
    }

    // Run once at start
    rewriteLinks();

    // Observe for dynamically loaded content (AJAX, SPA, infinite scroll, etc.)
    const observer = new MutationObserver(rewriteLinks);
    observer.observe(document.body, { childList: true, subtree: true });

})();
