// Status message shown on the popup and options pages

// How long success messages stay visible
const SUCCESS_MESSAGE_DURATION = 5000;

// Pending auto-hide timers, so an old success message cannot hide a newer message
const hideTimers = new WeakMap();

/**
 * Show a message in the given element; success messages hide automatically
 */
export function showMessage(element, text, type = 'info') {
  clearTimeout(hideTimers.get(element));

  element.textContent = text;
  element.className = `message ${type}`;
  element.style.display = 'block';

  if (type === 'success') {
    hideTimers.set(element, setTimeout(() => {
      element.style.display = 'none';
    }, SUCCESS_MESSAGE_DURATION));
  }
}
