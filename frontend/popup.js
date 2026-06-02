const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const fetchRecordsBtn = document.getElementById("fetchRecordsBtn");
const fillFormBtn = document.getElementById("fillFormBtn");
const submitFormBtn = document.getElementById("submitFormBtn");
const recordsDropdown = document.getElementById("recordsDropdown");

const authFields = document.getElementById("authFields");
const welcomePanel = document.getElementById("welcomePanel");
const welcomeNameEl = document.getElementById("welcomeName");

const providerIdInput = document.getElementById("providerId");
const providerSecretInput = document.getElementById("providerSecret");
const apiKeyInput = document.getElementById("apiKey");
const emailInput = document.getElementById("email");

const recordJsonPre = document.getElementById("recordJson");
const fillReportJsonPre = document.getElementById("fillReportJson");

let lastLoadedRecordId = null;
let lastLoadedRecordData = null;

const setJsonViewer = (el, value) => {
  if (!el) return;
  if (value == null) {
    el.textContent = "";
    return;
  }
  try {
    el.textContent = JSON.stringify(value, null, 2);
  } catch {
    el.textContent = String(value);
  }
};

const parseExpiresInToMs = (expiresIn) => {
  if (!expiresIn) return null;
  if (typeof expiresIn === "number" && Number.isFinite(expiresIn)) {
    // treat as seconds if it looks like seconds; otherwise ms
    return expiresIn > 1000 ? expiresIn : expiresIn * 1000;
  }

  const s = String(expiresIn).trim().toLowerCase();
  const m = s.match(/^(\d+)\s*(ms|s|m|h|d)$/);
  if (!m) return null;
  const value = Number(m[1]);
  const unit = m[2];
  const mult =
    unit === "ms"
      ? 1
      : unit === "s"
        ? 1000
        : unit === "m"
          ? 60_000
          : unit === "h"
            ? 3_600_000
            : 86_400_000;
  return value * mult;
};

const getJwtExpMs = (jwtToken) => {
  if (!jwtToken || typeof jwtToken !== "string") return null;
  const parts = jwtToken.split(".");
  if (parts.length < 2) return null;
  try {
    const payloadJson = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (!payloadJson || typeof payloadJson !== "object") return null;
    if (typeof payloadJson.exp !== "number") return null;
    return payloadJson.exp * 1000;
  } catch {
    return null;
  }
};

const getWelcomeName = (credentials) => {
  if (!credentials || typeof credentials !== "object") return "User";
  const user = credentials.user && typeof credentials.user === "object" ? credentials.user : null;
  return (
    user?.name ||
    user?.email ||
    credentials.email ||
    "User"
  );
};

const setLoggedInUi = (isLoggedIn, credentials = null) => {
  if (authFields) authFields.style.display = isLoggedIn ? "none" : "flex";
  if (welcomePanel) welcomePanel.style.display = isLoggedIn ? "flex" : "none";
  if (welcomeNameEl) welcomeNameEl.textContent = isLoggedIn ? getWelcomeName(credentials) : "User";
};

const clearSession = async () => {
  await chrome.storage.local.remove("grace_credentials");
  lastLoadedRecordId = null;
  lastLoadedRecordData = null;

  [providerIdInput, providerSecretInput, apiKeyInput, emailInput].forEach(
    (el) => {
      if (el) el.value = "";
    },
  );

  if (recordsDropdown) {
    recordsDropdown.innerHTML = `<option value="">Select Record</option>`;
  }

  setJsonViewer(recordJsonPre, null);
  setJsonViewer(fillReportJsonPre, null);

  setLoggedInUi(false);
};

const readJsonSafely = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const getStoredCredentials = async () => {
  const result = await chrome.storage.local.get("grace_credentials");
  return result.grace_credentials || null;
};

const isSessionExpired = (credentials) => {
  if (!credentials || typeof credentials !== "object") return true;
  const now = Date.now();

  if (credentials.token_expires_at) {
    const expiresAtMs =
      typeof credentials.token_expires_at === "number"
        ? credentials.token_expires_at
        : Date.parse(String(credentials.token_expires_at));
    if (Number.isFinite(expiresAtMs)) {
      return now >= expiresAtMs;
    }
  }

  const token = getAccessTokenFromCredentials(credentials);
  const tokenExp = getJwtExpMs(token);
  if (Number.isFinite(tokenExp)) {
    return now >= tokenExp;
  }

  // Can't determine expiry -> treat as expired so user re-auths
  return true;
};

const ensureActiveSession = async () => {
  const credentials = await getStoredCredentials();
  if (!credentials) {
    setLoggedInUi(false);
    throw new Error("Please login first.");
  }

  if (isSessionExpired(credentials)) {
    await clearSession();
    throw new Error("Session expired. Please login again.");
  }

  setLoggedInUi(true, credentials);
  return credentials;
};

const getAccessTokenFromCredentials = (credentials) => {
  if (!credentials || typeof credentials !== "object") return null;
  return (
    credentials.access_token ||
    credentials.accessToken ||
    (credentials.tokens &&
      (credentials.tokens.access_token || credentials.tokens.accessToken)) ||
    null
  );
};

const sendMessageToTab = (tabId, message) =>
  new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) return reject(err);
      resolve(response);
    });
  });

const executeScriptInTab = (tabId, files) =>
  new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        files,
      },
      (result) => {
        const err = chrome.runtime.lastError;
        if (err) return reject(err);
        resolve(result);
      },
    );
  });

const executeFunctionInTab = (tabId, func, args = []) =>
  new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        target: { tabId, allFrames: true },
        world: "MAIN",
        func,
        args,
      },
      (result) => {
        const err = chrome.runtime.lastError;
        if (err) return reject(err);
        resolve(result);
      },
    );
  });

const clickApplicationSubmitButton = async () => {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tab?.id) {
    throw new Error("Active tab not found.");
  }

  const results = await executeFunctionInTab(tab.id, () => {
    const isUsable = (el) => {
      if (!el || el.disabled || el.getAttribute("aria-disabled") === "true") {
        return false;
      }

      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0
      );
    };

    const submitButton =
      document.querySelector("#btnSubmit") ||
      document.querySelector("input[name='btnSubmit']") ||
      document.querySelector("input[type='submit'][value='Submit']") ||
      document.querySelector("button[type='submit']");

    if (!isUsable(submitButton)) {
      return {
        ok: false,
        reason: "submit_button_not_found",
      };
    }

    submitButton.scrollIntoView({
      block: "center",
      inline: "center",
    });
    submitButton.focus();

    submitButton.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    );
    submitButton.dispatchEvent(
      new MouseEvent("mouseup", {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    );
    submitButton.click();

    return {
      ok: true,
      id: submitButton.id || null,
      name: submitButton.name || null,
      value: submitButton.value || submitButton.textContent?.trim() || null,
    };
  });

  const clicked = results?.find((entry) => entry.result?.ok);
  if (clicked) {
    console.log("Application Submit Response:", clicked.result);
    return clicked.result;
  }

  const firstResult = results?.find((entry) => entry.result)?.result;
  throw new Error(
    firstResult?.reason ||
      "Application submit button was not found on the active page.",
  );
};

// =====================
// LOGIN
// =====================
const API_BASE_URL = "http://localhost:5000";

// Initialize UI state on popup open
(async () => {
  const credentials = await getStoredCredentials();
  if (credentials && !isSessionExpired(credentials)) {
    if (providerIdInput) providerIdInput.value = credentials.providerId || "";
    if (providerSecretInput) providerSecretInput.value = credentials.providerSecret || "";
    if (apiKeyInput) apiKeyInput.value = credentials.apiKey || "";
    if (emailInput) emailInput.value = credentials.email || "";
    setLoggedInUi(true, credentials);
  } else if (credentials) {
    await clearSession();
  } else {
    setLoggedInUi(false);
  }
})();

logoutBtn?.addEventListener("click", async () => {
  try {
    await clearSession();
    alert("Logged out");
  } catch (error) {
    console.error("Logout Error:", error);
    alert(error.message || "Logout failed");
  }
});

loginBtn.addEventListener("click", async () => {
  try {
    const providerId = providerIdInput.value.trim();

    const providerSecret = providerSecretInput.value.trim();

    const apiKey = apiKeyInput.value.trim();

    const email = emailInput.value.trim();

    if (!providerId || !providerSecret || !apiKey || !email) {
      alert("Please fill all fields");
      return;
    }

    const payload = {
      providerId,
      providerSecret,
      apiKey,
      email,
    };

    console.log("Login Request:", payload);

    const response = await fetch(`${API_BASE_URL}/account-me`, {
      method: "GET",
      headers: {
        "provider-id": providerId,
        "provider-secret": providerSecret,
        "api-key": apiKey,
        email: email,
      },
    });

    const data = (await readJsonSafely(response)) || {};

    console.log("Login Response:", data);

    if (!response.ok) {
      throw new Error(
        data.message || `Request failed with status ${response.status}`,
      );
    }

    const accessToken = getAccessTokenFromCredentials(data);
    const expiresInMs = parseExpiresInToMs(data.expires_in);
    const tokenExpMs = getJwtExpMs(accessToken);

    const tokenExpiresAtMs =
      (expiresInMs ? Date.now() + expiresInMs : null) ||
      tokenExpMs ||
      null;

    const toStore = {
      ...data,
      providerId,
      providerSecret,
      apiKey,
      email,
      saved_at: new Date().toISOString(),
      token_expires_at: tokenExpiresAtMs,
    };

    await chrome.storage.local.set({ grace_credentials: toStore });

    const stored = await getStoredCredentials();
    const storedToken = getAccessTokenFromCredentials(stored);
    if (!storedToken) {
      throw new Error("Login succeeded but access token was not stored.");
    }

    console.log("Credentials Stored");
    setLoggedInUi(true, toStore);

    alert("Login Successful");
  } catch (error) {
    console.error("Login Error:", error);
    alert(error.message || "Login Failed");
  }
});

// =====================
// FETCH RECORDS
// =====================
fetchRecordsBtn.addEventListener("click", async () => {
  try {
    const credentials = await ensureActiveSession();

    const accessToken = getAccessTokenFromCredentials(credentials);
    if (!accessToken) {
      alert("Access token not found. Please login again.");
      return;
    }

    console.log("Fetching records...");

    const response = await fetch(`${API_BASE_URL}/records`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const data = (await readJsonSafely(response)) || {};

    if (!response.ok) {
      throw new Error(data.message || `API Error: ${response.status}`);
    }

    if (!data.success || !Array.isArray(data.records)) {
      throw new Error("Unexpected /records response format.");
    }

    const records = data.records;

    console.log("Records:", records);

    recordsDropdown.innerHTML = `
      <option value="">
        Select Record
      </option>
    `;

    records.forEach((record) => {
      const option = document.createElement("option");

      option.value = record.record_id;
      option.textContent = `${record.record_id} - ${record.full_name}`;

      recordsDropdown.appendChild(option);
    });

    alert(`${records.length} records loaded`);
  } catch (error) {
    console.error("Fetch Records Error:", error);
    alert(error.message || "Failed to fetch records");
  }
});

// =====================
// FILL FORM
// =====================
fillFormBtn.addEventListener("click", async () => {
  try {
    const selectedRecordId = recordsDropdown.value;

    if (!selectedRecordId) {
      alert("Please select a record");
      return;
    }

    const credentials = await ensureActiveSession();

    const accessToken = getAccessTokenFromCredentials(credentials);
    if (!accessToken) {
      alert("Access token not found. Please login again.");
      return;
    }

    console.log("Fetching data for record:", selectedRecordId);

    const response = await fetch(
      `${API_BASE_URL}/records/${selectedRecordId}/data`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!response.ok) {
      const data = (await readJsonSafely(response)) || {};
      throw new Error(data.message || `API Error: ${response.status}`);
    }

    const recordResponse = (await readJsonSafely(response)) || {};

    if (!response.ok) {
      throw new Error(
        recordResponse.message || `API Error: ${response.status}`,
      );
    }

    if (!recordResponse.success || !recordResponse.data) {
      throw new Error("Unexpected record data response format.");
    }

    const recordData = recordResponse.data;

    console.log("Record Data:", recordData);

    lastLoadedRecordId = selectedRecordId;
    lastLoadedRecordData = recordData;

    setJsonViewer(recordJsonPre, recordData);
    setJsonViewer(fillReportJsonPre, null);

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    const msg = { type: "FILL_FORM", data: recordData };

    let fillResponse;
    try {
      fillResponse = await sendMessageToTab(tab.id, msg);
    } catch (err) {
      // If the content script isn't injected (or the page just reloaded), inject and retry.
      console.warn(
        "sendMessage failed; injecting content script and retrying:",
        err?.message || err,
      );
      await executeScriptInTab(tab.id, ["content/content.js"]);
      fillResponse = await sendMessageToTab(tab.id, msg);
    }

    console.log("Content Script Response:", fillResponse);
    setJsonViewer(fillReportJsonPre, fillResponse);

    if (fillResponse && fillResponse.ok === false) {
      throw new Error(
        fillResponse.error || "Form fill failed in content script.",
      );
    }

    alert("Form fill triggered");
  } catch (error) {
    console.error("Fill Form Error:", error);

    alert(error.message || "Failed to fill form");
  }
});

// =====================
// SUBMIT FORM DATA
// =====================
submitFormBtn?.addEventListener("click", async () => {
  try {
    const selectedRecordId = recordsDropdown.value;

    if (!selectedRecordId) {
      alert("Please select a record");
      return;
    }

    const credentials = await ensureActiveSession();

    const accessToken = getAccessTokenFromCredentials(credentials);
    if (!accessToken) {
      alert("Access token not found. Please login again.");
      return;
    }

    let payload = lastLoadedRecordData;

    if (!payload || lastLoadedRecordId !== selectedRecordId) {
      console.log(
        "No cached record payload; fetching record data:",
        selectedRecordId,
      );

      const recordRes = await fetch(
        `${API_BASE_URL}/records/${selectedRecordId}/data`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      const recordJson = (await readJsonSafely(recordRes)) || {};
      if (!recordRes.ok) {
        throw new Error(recordJson.message || `API Error: ${recordRes.status}`);
      }

      if (!recordJson.success || !recordJson.data) {
        throw new Error("Unexpected record data response format.");
      }

      payload = recordJson.data;
      lastLoadedRecordId = selectedRecordId;
      lastLoadedRecordData = payload;
    }

    console.log("Submitting payload:", payload);

    const response = await fetch(`${API_BASE_URL}/records/record-data`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = (await readJsonSafely(response)) || {};

    if (!response.ok) {
      throw new Error(data.message || `API Error: ${response.status}`);
    }

    if (data.success === false) {
      throw new Error(data.message || "Submit failed");
    }

    await clickApplicationSubmitButton();

    setTimeout(() => {
      alert(data.message || "Submitted successfully");
    }, 500);
  } catch (error) {
    console.error("Submit Form Error:", error);
    alert(error.message || "Failed to submit form");
  }
});
