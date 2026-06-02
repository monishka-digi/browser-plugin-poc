const $ = (id) => document.getElementById(id);

const loginBtn = $("loginBtn");
const logoutBtn = $("logoutBtn");
const fetchRecordsBtn = $("fetchRecordsBtn");
const fillFormBtn = $("fillFormBtn");
const submitFormBtn = $("submitFormBtn");
const clearFormBtn = $("clearFormBtn");
const recordsDropdown = $("recordsDropdown");
const navTabs = $("navTabs");
const welcomeNameEl = $("welcomeName");
const providerIdInput = $("providerId");
const providerSecretInput = $("providerSecret");
const apiKeyInput = $("apiKey");
const emailInput = $("email");
const recordJsonPre = $("recordJson");
const fillReportJsonPre = $("fillReportJson");
const statRecords = $("statRecords");
const statPending = $("statPending");
const statSubmitted = $("statSubmitted");
const recentRecordsList = $("recentRecordsList");
const loadedRecordPanel = $("loadedRecordPanel");
const toastContainer = $("toastContainer");
const debugResponseJson = $("debugResponseJson");
const sessionInfo = $("sessionInfo");
const currentStateJson = $("currentStateJson");
const refreshDebugBtn = $("refreshDebugBtn");

let lastLoadedRecordId = null;
let lastLoadedRecordData = null;
let recordsList = [];
let lastApiResponse = null;
let submittedRecordIds = new Set();

const API_BASE_URL = "http://localhost:5000";

// Toast system
function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${message}</span><button class="toast-close">&times;</button>`;
  toastContainer.appendChild(toast);
  const closeBtn = toast.querySelector(".toast-close");
  const removeToast = () => toast.remove();
  closeBtn.addEventListener("click", removeToast);
  setTimeout(removeToast, 3000);
}

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
  if (typeof expiresIn === "number" && Number.isFinite(expiresIn))
    return expiresIn > 1000 ? expiresIn : expiresIn * 1000;
  const s = String(expiresIn).trim().toLowerCase();
  const m = s.match(/^(\d+)\s*(ms|s|m|h|d)$/);
  if (!m) return null;
  const value = Number(m[1]),
    unit = m[2];
  const mult =
    unit === "ms"
      ? 1
      : unit === "s"
        ? 1000
        : unit === "m"
          ? 60000
          : unit === "h"
            ? 3600000
            : 86400000;
  return value * mult;
};

const getJwtExpMs = (jwtToken) => {
  if (!jwtToken || typeof jwtToken !== "string") return null;
  const parts = jwtToken.split(".");
  if (parts.length < 2) return null;
  try {
    const payloadJson = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    if (!payloadJson || typeof payloadJson !== "object") return null;
    if (typeof payloadJson.exp !== "number") return null;
    return payloadJson.exp * 1000;
  } catch {
    return null;
  }
};

const getWelcomeName = (credentials) => {
  if (!credentials || typeof credentials !== "object") return "User";
  const user =
    credentials.user && typeof credentials.user === "object"
      ? credentials.user
      : null;
  return user?.name || user?.email || credentials.email || "User";
};

const getRecordStatus = (record) =>
  submittedRecordIds.has(record.record_id) ? "submitted" : "pending";

const saveRecordsToStorage = async () => {
  await chrome.storage.local.set({
    grace_records: recordsList,
    grace_loaded_record_id: lastLoadedRecordId,
    grace_loaded_record_data: lastLoadedRecordData,
    grace_submitted_ids: Array.from(submittedRecordIds),
  });
};

const loadRecordsFromStorage = async () => {
  const result = await chrome.storage.local.get([
    "grace_records",
    "grace_loaded_record_id",
    "grace_loaded_record_data",
    "grace_submitted_ids",
  ]);
  return {
    records: result.grace_records || [],
    loadedRecordId: result.grace_loaded_record_id || null,
    loadedRecordData: result.grace_loaded_record_data || null,
    submittedIds: new Set(result.grace_submitted_ids || []),
  };
};

const updateDebugInfo = async () => {
  const credentials = await getStoredCredentials();
  if (debugResponseJson)
    setJsonViewer(debugResponseJson, lastApiResponse || "No API calls yet");
  if (sessionInfo) {
    const info = credentials
      ? {
          email: credentials.email || "Unknown",
          providerId: credentials.providerId || "Unknown",
          hasToken: !!getAccessTokenFromCredentials(credentials),
          savedAt: credentials.saved_at || "Unknown",
          expiresAt: credentials.token_expires_at
            ? new Date(credentials.token_expires_at).toISOString()
            : "Unknown",
          isExpired: credentials ? isSessionExpired(credentials) : true,
        }
      : "Not logged in";
    setJsonViewer(sessionInfo, info);
  }
  if (currentStateJson) {
    const state = {
      totalRecords: recordsList.length,
      loadedRecordId: lastLoadedRecordId,
      hasLoadedData: !!lastLoadedRecordData,
      submittedCount: submittedRecordIds.size,
      pendingCount: recordsList.length - submittedRecordIds.size,
      recordsList: recordsList.map((r) => ({
        id: r.record_id,
        name: r.full_name,
        status: getRecordStatus(r),
      })),
    };
    setJsonViewer(currentStateJson, state);
  }
};

const updateLoadedRecordPanel = () => {
  if (!loadedRecordPanel) return;
  if (!lastLoadedRecordId || !lastLoadedRecordData) {
    loadedRecordPanel.innerHTML = '<p class="empty-state">No record loaded</p>';
    return;
  }
  const record = recordsList.find((r) => r.record_id === lastLoadedRecordId);
  const recordName = record ? record.full_name : "Unknown";
  const status = getRecordStatus({ record_id: lastLoadedRecordId });
  const statusClass =
    status === "submitted" ? "status-submitted" : "status-pending";

  loadedRecordPanel.innerHTML = `
    <div class="loaded-record-card">
      <div class="loaded-record-info">
        <div class="loaded-record-details">
          <div class="loaded-record-id">${lastLoadedRecordId}</div>
          <div class="loaded-record-name">${recordName}</div>
          <span class="loaded-record-status ${statusClass}">${status.toUpperCase()}</span>
        </div>
      </div>
      <div class="loaded-record-actions">
        <button id="dashboardSubmitBtn" class="btn btn-primary btn-sm">🚀 Submit</button>
        <button id="dashboardClearBtn" class="btn btn-outline btn-sm">🗑️ Clear</button>
      </div>
    </div>
  `;

  const dashboardSubmitBtn = $("dashboardSubmitBtn");
  const dashboardClearBtn = $("dashboardClearBtn");

  dashboardSubmitBtn?.addEventListener("click", async () => {
    try {
      await handleSubmitWithFormData();
    } catch (error) {
      showToast(error.message || "Failed to submit", "error");
    }
  });

  dashboardClearBtn?.addEventListener("click", () => {
    lastLoadedRecordId = null;
    lastLoadedRecordData = null;
    saveRecordsToStorage();
    setJsonViewer(recordJsonPre, null);
    setJsonViewer(fillReportJsonPre, null);
    if (recordsDropdown) recordsDropdown.value = "";
    updateDashboardStats();
    updateLoadedRecordPanel();
    showToast("Record cleared");
  });
};

const updateDashboardStats = () => {
  const totalRecords = recordsList.length;
  const pendingCount = totalRecords - submittedRecordIds.size;
  const submittedCount = submittedRecordIds.size;

  if (statRecords) statRecords.textContent = totalRecords;
  if (statPending) statPending.textContent = pendingCount;
  if (statSubmitted) statSubmitted.textContent = submittedCount;

  if (recentRecordsList) {
    if (recordsList.length === 0) {
      recentRecordsList.innerHTML =
        '<p class="empty-state">No records fetched yet</p>';
    } else {
      recentRecordsList.innerHTML = recordsList
        .slice(0, 5)
        .map((r) => {
          const status = getRecordStatus(r);
          const statusClass =
            status === "submitted" ? "status-submitted" : "status-pending";
          const isActive = r.record_id === lastLoadedRecordId;
          return `
          <div class="record-item ${isActive ? "active-record" : ""}" data-id="${r.record_id}">
            <div class="record-info">
              <span class="record-id">${r.record_id} ${isActive ? '<span class="loaded-badge">LOADED</span>' : ""}</span>
              <span class="record-name">${r.full_name}</span>
              <span class="record-status ${statusClass}">${status.toUpperCase()}</span>
            </div>
            <button class="load-record-btn" data-id="${r.record_id}">📥 Load</button>
          </div>
        `;
        })
        .join("");
    }
  }

  if (recordsDropdown && recordsList.length > 0) {
    recordsDropdown.innerHTML = '<option value="">— Select a record —</option>';
    recordsList.forEach((record) => {
      const option = document.createElement("option");
      option.value = record.record_id;
      const status = getRecordStatus(record);
      option.textContent = `${record.record_id} - ${record.full_name} [${status.toUpperCase()}]${record.record_id === lastLoadedRecordId ? " ✓" : ""}`;
      if (record.record_id === lastLoadedRecordId) option.selected = true;
      recordsDropdown.appendChild(option);
    });
  }

  if (lastLoadedRecordId && lastLoadedRecordData) {
    setJsonViewer(recordJsonPre, lastLoadedRecordData);
  }

  updateLoadedRecordPanel();
};

const setLoggedInUi = (isLoggedIn, credentials = null) => {
  if (welcomeNameEl)
    welcomeNameEl.textContent = isLoggedIn
      ? getWelcomeName(credentials)
      : "User";
  if (navTabs) navTabs.classList.toggle("hidden", !isLoggedIn);
};

const clearSession = async () => {
  await chrome.storage.local.remove("grace_credentials");
  await chrome.storage.local.remove("grace_records");
  await chrome.storage.local.remove("grace_loaded_record_id");
  await chrome.storage.local.remove("grace_loaded_record_data");
  await chrome.storage.local.remove("grace_submitted_ids");
  lastLoadedRecordId = null;
  lastLoadedRecordData = null;
  recordsList = [];
  lastApiResponse = null;
  submittedRecordIds = new Set();
  updateDashboardStats();
  [providerIdInput, providerSecretInput, apiKeyInput, emailInput].forEach(
    (el) => {
      if (el) el.value = "";
    },
  );
  if (recordsDropdown)
    recordsDropdown.innerHTML = '<option value="">— Select a record —</option>';
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
    if (Number.isFinite(expiresAtMs)) return now >= expiresAtMs;
  }
  const token = getAccessTokenFromCredentials(credentials);
  const tokenExp = getJwtExpMs(token);
  if (Number.isFinite(tokenExp)) return now >= tokenExp;
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
    chrome.scripting.executeScript({ target: { tabId }, files }, (result) => {
      const err = chrome.runtime.lastError;
      if (err) return reject(err);
      resolve(result);
    });
  });

const executeFunctionInTab = (tabId, func, args = []) =>
  new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      { target: { tabId, allFrames: true }, world: "MAIN", func, args },
      (result) => {
        const err = chrome.runtime.lastError;
        if (err) return reject(err);
        resolve(result);
      },
    );
  });

// Fetch records function (reusable)
const fetchRecordsFromApi = async (silent = false) => {
  const credentials = await ensureActiveSession();
  const accessToken = getAccessTokenFromCredentials(credentials);
  if (!accessToken) {
    if (!silent)
      showToast("Access token not found. Please login again.", "error");
    return;
  }
  const response = await fetch(`${API_BASE_URL}/records`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await readJsonSafely(response)) || {};
  lastApiResponse = data;
  if (!response.ok)
    throw new Error(data.message || `API Error: ${response.status}`);
  if (!data.success || !Array.isArray(data.records))
    throw new Error("Unexpected /records response format.");
  recordsList = data.records;
  await saveRecordsToStorage();
  updateDashboardStats();
  updateDebugInfo();
  if (!silent) showToast(`${recordsList.length} records loaded`);
};

const collectFormDataFromTab = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("Active tab not found.");
  const results = await executeFunctionInTab(tab.id, () => {
    const findFirst = (selectors) => {
      const list = Array.isArray(selectors) ? selectors : [selectors];
      for (const selector of list) {
        const el = document.querySelector(selector);
        if (el) return el;
      }
      const frames = Array.from(document.querySelectorAll("iframe"));
      for (const frame of frames) {
        try {
          const doc = frame.contentDocument;
          if (!doc) continue;
          for (const selector of list) {
            const el = doc.querySelector(selector);
            if (el) return el;
          }
        } catch {
          /* ignore */
        }
      }
      return null;
    };
    const getValue = (selectors) => {
      const el = findFirst(selectors);
      if (!el) return null;
      return el.value || el.textContent || null;
    };
    return {
      full_name: getValue([
        "#txtFullName",
        "[name='FullName']",
        "[name='full_name']",
      ]),
      birth_date: getValue([
        "#txtDOB",
        "[name='BirthDate']",
        "[name='birth_date']",
      ]),
      rfc: getValue(["#txtRFC", "[name='RFC']", "[name='rfc']"]),
      curp: getValue(["#txtCURP", "[name='CURP']", "[name='curp']"]),
      fiscal_registration_number: getValue([
        "#txtFiscalReg",
        "[name='FiscalRegistrationNumber']",
        "[name='fiscal_registration_number']",
      ]),
      company_name: getValue([
        "#txtCompanyName",
        "[name='CompanyName']",
        "[name='company_name']",
      ]),
      document_type: getValue([
        "#ddlIDType",
        "[name='IDType']",
        "[name='document_type']",
      ]),
      identification_number: getValue([
        "#txtIDNumber",
        "[name='IDNumber']",
        "[name='identification_number']",
      ]),
    };
  });
  return results?.[0]?.result || {};
};

const submitToApiWithFormData = async (recordId) => {
  const credentials = await ensureActiveSession();
  const accessToken = getAccessTokenFromCredentials(credentials);
  if (!accessToken)
    throw new Error("Access token not found. Please login again.");
  const formData = await collectFormDataFromTab();
  const payload = { record_id: recordId, ...formData };
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
  lastApiResponse = data;
  if (!response.ok)
    throw new Error(data.message || `API Error: ${response.status}`);
  if (data.success === false) throw new Error(data.message || "Submit failed");
  return data;
};

const handleSubmitWithFormData = async () => {
  if (!lastLoadedRecordId) {
    showToast("No record loaded", "error");
    return;
  }

  const apiResult = await submitToApiWithFormData(lastLoadedRecordId);
  submittedRecordIds.add(lastLoadedRecordId);
  await saveRecordsToStorage();

  try {
    await fetchRecordsFromApi(true);
    showToast("Submitted & records refreshed");
  } catch (e) {
    console.warn("Auto-fetch after submit failed:", e);
    updateDashboardStats();
    updateDebugInfo();
    showToast("Submitted successfully");
  }

  await clickWebsiteSubmitButton();
  return apiResult;
};

const injectSubmitInterceptor = async (recordId) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  const accessToken = getAccessTokenFromCredentials(
    await getStoredCredentials(),
  );
  await executeFunctionInTab(
    tab.id,
    (apiBaseUrl, token, recordIdValue) => {
      const findFirst = (selectors) => {
        const list = Array.isArray(selectors) ? selectors : [selectors];
        for (const selector of list) {
          const el = document.querySelector(selector);
          if (el) return el;
        }
        const frames = Array.from(document.querySelectorAll("iframe"));
        for (const frame of frames) {
          try {
            const doc = frame.contentDocument;
            if (!doc) continue;
            for (const selector of list) {
              const el = doc.querySelector(selector);
              if (el) return el;
            }
          } catch {
            /* ignore */
          }
        }
        return null;
      };
      const getValue = (selectors) => {
        const el = findFirst(selectors);
        if (!el) return null;
        return el.value || el.textContent || null;
      };
      const collectFormData = () => ({
        full_name: getValue([
          "#txtFullName",
          "[name='FullName']",
          "[name='full_name']",
        ]),
        birth_date: getValue([
          "#txtDOB",
          "[name='BirthDate']",
          "[name='birth_date']",
        ]),
        rfc: getValue(["#txtRFC", "[name='RFC']", "[name='rfc']"]),
        curp: getValue(["#txtCURP", "[name='CURP']", "[name='curp']"]),
        fiscal_registration_number: getValue([
          "#txtFiscalReg",
          "[name='FiscalRegistrationNumber']",
          "[name='fiscal_registration_number']",
        ]),
        company_name: getValue([
          "#txtCompanyName",
          "[name='CompanyName']",
          "[name='company_name']",
        ]),
        document_type: getValue([
          "#ddlIDType",
          "[name='IDType']",
          "[name='document_type']",
        ]),
        identification_number: getValue([
          "#txtIDNumber",
          "[name='IDNumber']",
          "[name='identification_number']",
        ]),
      });
      const existingHandler = window.__graceSubmitHandler;
      if (existingHandler) {
        const btn =
          document.querySelector("#btnSubmit") ||
          document.querySelector("input[name='btnSubmit']") ||
          document.querySelector("input[type='submit'][value='Submit']") ||
          document.querySelector("button[type='submit']");
        if (btn) {
          btn.removeEventListener("click", existingHandler);
          if (btn.form) btn.form.removeEventListener("submit", existingHandler);
        }
      }
      const handleGraceSubmit = async (e) => {
        console.log("Grace: Submit intercepted, collecting form data");
        try {
          const formData = collectFormData();
          const payload = { record_id: recordIdValue, ...formData };
          console.log("Grace submit payload:", payload);
          const response = await fetch(`${apiBaseUrl}/records/record-data`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          });
          const result = await response.json();
          console.log("Grace API submit result:", result);
          window.dispatchEvent(
            new CustomEvent("graceSubmitComplete", {
              detail: { success: true, data: result },
            }),
          );
        } catch (error) {
          console.error("Grace API submit error:", error);
          window.dispatchEvent(
            new CustomEvent("graceSubmitComplete", {
              detail: { success: false, error: error.message },
            }),
          );
        }
      };
      window.__graceSubmitHandler = handleGraceSubmit;
      const submitButton =
        document.querySelector("#btnSubmit") ||
        document.querySelector("input[name='btnSubmit']") ||
        document.querySelector("input[type='submit'][value='Submit']") ||
        document.querySelector("button[type='submit']");
      if (submitButton) {
        submitButton.addEventListener("click", handleGraceSubmit, {
          once: false,
        });
        if (submitButton.form)
          submitButton.form.addEventListener("submit", handleGraceSubmit, {
            once: false,
          });
        console.log(
          "Grace: Submit interceptor attached with form data collection",
        );
      }
    },
    [API_BASE_URL, accessToken, lastLoadedRecordId],
  );
};

const clickWebsiteSubmitButton = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("Active tab not found.");
  const results = await executeFunctionInTab(tab.id, () => {
    const isUsable = (el) => {
      if (!el || el.disabled || el.getAttribute("aria-disabled") === "true")
        return false;
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const btn =
      document.querySelector("#btnSubmit") ||
      document.querySelector("input[name='btnSubmit']") ||
      document.querySelector("input[type='submit'][value='Submit']") ||
      document.querySelector("button[type='submit']");
    if (!isUsable(btn)) return { ok: false, reason: "submit_button_not_found" };
    btn.scrollIntoView({ block: "center", inline: "center" });
    btn.focus();
    btn.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    );
    btn.dispatchEvent(
      new MouseEvent("mouseup", {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    );
    btn.click();
    return { ok: true, id: btn.id || null, name: btn.name || null };
  });
  const clicked = results?.find((entry) => entry.result?.ok);
  if (clicked) return clicked.result;
  const firstResult = results?.find((entry) => entry.result)?.result;
  throw new Error(firstResult?.reason || "Submit button not found.");
};

async function loadRecordById(recordId) {
  const credentials = await ensureActiveSession();
  const accessToken = getAccessTokenFromCredentials(credentials);
  if (!accessToken) {
    showToast("Access token not found. Please login again.", "error");
    return;
  }
  const response = await fetch(`${API_BASE_URL}/records/${recordId}/data`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const recordResponse = (await readJsonSafely(response)) || {};
  lastApiResponse = recordResponse;
  if (!response.ok)
    throw new Error(recordResponse.message || `API Error: ${response.status}`);
  if (!recordResponse.success || !recordResponse.data)
    throw new Error("Unexpected record data response format.");
  const recordData = recordResponse.data;
  lastLoadedRecordId = recordId;
  lastLoadedRecordData = recordData;
  await saveRecordsToStorage();
  setJsonViewer(recordJsonPre, recordData);
  setJsonViewer(fillReportJsonPre, null);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let fillResponse;
  try {
    fillResponse = await sendMessageToTab(tab.id, {
      type: "FILL_FORM",
      data: recordData,
    });
  } catch (err) {
    console.warn(
      "sendMessage failed; injecting content script and retrying:",
      err?.message || err,
    );
    await executeScriptInTab(tab.id, ["content/content.js"]);
    fillResponse = await sendMessageToTab(tab.id, {
      type: "FILL_FORM",
      data: recordData,
    });
  }
  setJsonViewer(fillReportJsonPre, fillResponse);
  if (fillResponse && fillResponse.ok === false)
    throw new Error(
      fillResponse.error || "Form fill failed in content script.",
    );
  await injectSubmitInterceptor(recordId);
  updateDashboardStats();
  updateDebugInfo();
  showToast("Record loaded & submit interceptor attached");
}

const switchScreen = (screenId) => {
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.add("hidden"));
  const target = $(screenId);
  if (target) target.classList.remove("hidden");
  document
    .querySelectorAll(".nav-tab")
    .forEach((tab) =>
      tab.classList.toggle("active", tab.dataset.screen === screenId),
    );
  if (screenId === "dashboardScreen") updateDashboardStats();
  if (screenId === "debugScreen") updateDebugInfo();
};

document
  .querySelectorAll(".nav-tab")
  .forEach((tab) =>
    tab.addEventListener("click", () => switchScreen(tab.dataset.screen)),
  );

// Load button on recent records - stays on dashboard
recentRecordsList.addEventListener("click", async (e) => {
  const loadBtn = e.target.closest(".load-record-btn");
  if (!loadBtn) return;
  const recordId = loadBtn.dataset.id;
  if (recordId) {
    try {
      await loadRecordById(recordId);
      if (recordsDropdown) recordsDropdown.value = recordId;
    } catch (error) {
      showToast(error.message || "Failed to load record", "error");
    }
  }
});

refreshDebugBtn?.addEventListener("click", () => {
  updateDebugInfo();
  showToast("Debug info refreshed");
});

// Initialize
(async () => {
  const credentials = await getStoredCredentials();
  if (credentials && !isSessionExpired(credentials)) {
    if (providerIdInput) providerIdInput.value = credentials.providerId || "";
    if (providerSecretInput)
      providerSecretInput.value = credentials.providerSecret || "";
    if (apiKeyInput) apiKeyInput.value = credentials.apiKey || "";
    if (emailInput) emailInput.value = credentials.email || "";
    setLoggedInUi(true, credentials);
    const persisted = await loadRecordsFromStorage();
    recordsList = persisted.records;
    lastLoadedRecordId = persisted.loadedRecordId;
    lastLoadedRecordData = persisted.loadedRecordData;
    submittedRecordIds = persisted.submittedIds;
    updateDashboardStats();
    updateDebugInfo();

    console.log("Fetching records from API...");

    try {
      await fetchRecordsFromApi(true);
    } catch (e) {
      console.warn("Auto-fetch on init failed:", e);
    }

    if (lastLoadedRecordId) {
      try {
        await injectSubmitInterceptor(lastLoadedRecordId);
      } catch (e) {
        console.warn("Could not re-inject submit interceptor:", e);
      }
    }
    switchScreen("dashboardScreen");
  } else {
    if (credentials) await clearSession();
    setLoggedInUi(false);
    switchScreen("loginScreen");
  }
})();

// Login
loginBtn.addEventListener("click", async () => {
  try {
    const providerId = providerIdInput.value.trim(),
      providerSecret = providerSecretInput.value.trim(),
      apiKey = apiKeyInput.value.trim(),
      email = emailInput.value.trim();
    if (!providerId || !providerSecret || !apiKey || !email) {
      showToast("Please fill all fields", "error");
      return;
    }
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
    lastApiResponse = data;
    if (!response.ok)
      throw new Error(
        data.message || `Request failed with status ${response.status}`,
      );
    const accessToken = getAccessTokenFromCredentials(data);
    const expiresInMs = parseExpiresInToMs(data.expires_in);
    const tokenExpMs = getJwtExpMs(accessToken);
    const tokenExpiresAtMs =
      (expiresInMs ? Date.now() + expiresInMs : null) || tokenExpMs || null;
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
    if (!storedToken)
      throw new Error("Login succeeded but access token was not stored.");
    setLoggedInUi(true, toStore);
    updateDebugInfo();
    switchScreen("dashboardScreen");
    showToast("Login Successful");
    try {
      await fetchRecordsFromApi(true);
    } catch (e) {
      console.warn("Auto-fetch after login failed:", e);
    }
  } catch (error) {
    console.error("Login Error:", error);
    showToast(error.message || "Login Failed", "error");
  }
});

// Logout
logoutBtn?.addEventListener("click", async () => {
  try {
    await clearSession();
    switchScreen("loginScreen");
    showToast("Logged out");
  } catch (error) {
    console.error("Logout Error:", error);
    showToast(error.message || "Logout failed", "error");
  }
});

// Fetch Records button - stays on current screen
fetchRecordsBtn.addEventListener("click", async () => {
  try {
    await fetchRecordsFromApi(false);
  } catch (error) {
    console.error("Fetch Records Error:", error);
    showToast(error.message || "Failed to fetch records", "error");
  }
});

// Fill Form
fillFormBtn.addEventListener("click", async () => {
  try {
    const selectedRecordId = recordsDropdown.value;
    if (!selectedRecordId) {
      showToast("Please select a record", "error");
      return;
    }
    await loadRecordById(selectedRecordId);
  } catch (error) {
    showToast(error.message || "Failed to fill form", "error");
  }
});

// Submit Form
submitFormBtn?.addEventListener("click", async () => {
  try {
    await handleSubmitWithFormData();
  } catch (error) {
    console.error("Submit Form Error:", error);
    showToast(error.message || "Failed to submit form", "error");
  }
});

// Clear Form
clearFormBtn?.addEventListener("click", () => {
  lastLoadedRecordId = null;
  lastLoadedRecordData = null;
  saveRecordsToStorage();
  setJsonViewer(recordJsonPre, null);
  setJsonViewer(fillReportJsonPre, null);
  if (recordsDropdown) recordsDropdown.value = "";
  updateDashboardStats();
  showToast("Form cleared");
});
