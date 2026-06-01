const loginBtn = document.getElementById("loginBtn");
const fetchRecordsBtn = document.getElementById("fetchRecordsBtn");
const fillFormBtn = document.getElementById("fillFormBtn");
const submitFormBtn = document.getElementById("submitFormBtn");
const recordsDropdown = document.getElementById("recordsDropdown");

let lastLoadedRecordId = null;
let lastLoadedRecordData = null;

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

// =====================
// LOGIN
// =====================
const API_BASE_URL = "http://localhost:5000";

loginBtn.addEventListener("click", async () => {
  try {
    const providerId = document.getElementById("providerId").value.trim();

    const providerSecret = document
      .getElementById("providerSecret")
      .value.trim();

    const apiKey = document.getElementById("apiKey").value.trim();

    const email = document.getElementById("email").value.trim();

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

    const toStore = {
      ...data,
      providerId,
      providerSecret,
      apiKey,
      email,
      saved_at: new Date().toISOString(),
    };

    await chrome.storage.local.set({ grace_credentials: toStore });

    const stored = await getStoredCredentials();
    const storedToken = getAccessTokenFromCredentials(stored);
    if (!storedToken) {
      throw new Error("Login succeeded but access token was not stored.");
    }

    console.log("Credentials Stored");

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
    const credentials = await getStoredCredentials();

    if (!credentials) {
      alert("Please save credentials first");
      return;
    }

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

    const credentials = await getStoredCredentials();

    if (!credentials) {
      alert("Credentials not found");
      return;
    }

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

    const credentials = await getStoredCredentials();
    if (!credentials) {
      alert("Credentials not found");
      return;
    }

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

    alert(data.message || "Submitted successfully");
  } catch (error) {
    console.error("Submit Form Error:", error);
    alert(error.message || "Failed to submit form");
  }
});
