// Allowed domains configuration
const ALLOWED_DOMAINS = [
  "static-app.runasp.net",
  "localhost",
  "127.0.0.1",
];

// Subdomain patterns that are allowed
const ALLOWED_SUBDOMAIN_PATTERNS = [];

function isAllowedDomain(url) {
  if (!url) return false;

  if (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:") ||
    url.startsWith("chrome-native://")
  ) {
    return false;
  }

  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    for (const domain of ALLOWED_DOMAINS) {
      if (hostname === domain) return true;
    }

    for (const pattern of ALLOWED_SUBDOMAIN_PATTERNS) {
      if (hostname.endsWith("." + pattern) || hostname === pattern) return true;
    }

    return false;
  } catch {
    return false;
  }
}

function updateExtensionState(tabId, url) {
  if (!url) {
    chrome.action.disable(tabId);
    return;
  }

  if (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:") ||
    url.startsWith("chrome-native://")
  ) {
    chrome.action.disable(tabId);
    return;
  }

  if (isAllowedDomain(url)) {
    chrome.action.enable(tabId);
  } else {
    chrome.action.disable(tabId);
  }
}

function checkCurrentTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0) {
      chrome.action.disable();
      return;
    }
    const tab = tabs[0];
    updateExtensionState(tab.id, tab.url);
  });
}

// Tab event listeners
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    updateExtensionState(tabId, tab.url);
  }
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    updateExtensionState(tab.id, tab.url);
  });
});

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.url) {
    updateExtensionState(tab.id, tab.url);
  }
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    chrome.action.disable();
    return;
  }
  checkCurrentTab();
});

chrome.tabs.onReplaced.addListener((addedTabId) => {
  chrome.tabs.get(addedTabId, (tab) => {
    updateExtensionState(tab.id, tab.url);
  });
});

// Init
chrome.runtime.onInstalled.addListener(() => {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => updateExtensionState(tab.id, tab.url));
  });
  checkCurrentTab();
});

chrome.runtime.onStartup.addListener(() => {
  checkCurrentTab();
});

// Messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CHECK_DOMAIN") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) {
        sendResponse({ allowed: false });
        return;
      }
      sendResponse({
        allowed: isAllowedDomain(tabs[0].url),
        url: tabs[0].url,
      });
    });
    return true;
  }
  else if (message.type === "GET_ACTIVE_TAB") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) {
        sendResponse({ error: "No active tab", allowed: false });
        return;
      }

      const tab = tabs[0];
      const allowed = isAllowedDomain(tab.url);

      sendResponse({
        tabId: tab.id,
        url: tab.url,
        allowed: allowed,
        domain: tab.url ? new URL(tab.url).hostname : null,
      });
    });
    return true;
  }
});

checkCurrentTab();
