const coerceDateValueForInput = (inputEl, rawValue) => {
  if (!inputEl || typeof rawValue !== "string") return rawValue;

  if (inputEl instanceof HTMLInputElement && inputEl.type === "date") {
    const m = rawValue.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (m) {
      const [, dd, mm, yyyy] = m;
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  return rawValue;
};

const setNativeValue = (el, value) => {
  if (el instanceof HTMLInputElement) {
    const { set } = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value") || {};
    set?.call(el, value);
    return;
  }

  if (el instanceof HTMLTextAreaElement) {
    const { set } = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value") || {};
    set?.call(el, value);
    return;
  }

  // eslint-disable-next-line no-param-reassign
  el.value = value;
};

const triggerFieldEvents = (el) => {
  try {
    el.focus?.();
  } catch {
    // ignore
  }
  ["input", "change", "blur"].forEach((type) => {
    el.dispatchEvent(new Event(type, { bubbles: true }));
  });
};

const findFirst = (selectors) => {
  const list = Array.isArray(selectors) ? selectors : [selectors];
  for (const selector of list) {
    const el = document.querySelector(selector);
    if (el) return el;
  }

  // Try same-origin iframes (some apps render the form inside frames).
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
      // ignore cross-origin frames
    }
  }

  return null;
};

const waitForFirst = async (selectors, timeoutMs = 3000) => {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const el = findFirst(selectors);
    if (el) return el;
    if (Date.now() - start >= timeoutMs) return null;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 100));
  }
};

const setValue = (selectors, value) => {
  const el = findFirst(selectors);
  if (!el) return false;

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    setNativeValue(el, coerceDateValueForInput(el, value ?? ""));
    triggerFieldEvents(el);
    return true;
  }

 if (el instanceof HTMLSelectElement) {
  const desired = String(value ?? "").trim().toLowerCase();

  const option = Array.from(el.options).find(
    (opt) =>
      opt.textContent?.trim().toLowerCase() === desired ||
      opt.value?.trim().toLowerCase() === desired
  );

  if (option) {
    el.value = option.value;
    triggerFieldEvents(el);
    console.log("Selected:", option.text, option.value);
    return true;
  }

  console.warn(
    "No matching option found",
    desired,
    [...el.options].map(o => ({
      text: o.text,
      value: o.value
    }))
  );

  return false;
}

  if ("value" in el) {
    // eslint-disable-next-line no-param-reassign
    el.value = value ?? "";
    triggerFieldEvents(el);
    return true;
  }

  return false;
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "FILL_FORM") return;

  (async () => {
    // Accept both shapes: { data: recordData } or accidental nesting { data: { data: recordData } }
    const root = message.data && message.data.data ? message.data.data : message.data;
    const data = root || {};
    const general = data.general_data || {};
    const tax = data.tax_data || {};

    if (document.readyState === "loading") {
      await new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, { once: true }));
    }

    const report = {};

    const fields = [
      { key: "full_name", selectors: ["#txtFullName", "[name='FullName']", "[name='full_name']"], value: general.full_name },
      { key: "birth_date", selectors: ["#txtDOB", "[name='BirthDate']", "[name='birth_date']"], value: general.birth_date },
      { key: "rfc", selectors: ["#txtRFC", "[name='RFC']", "[name='rfc']"], value: general.rfc },
      { key: "curp", selectors: ["#txtCURP", "[name='CURP']", "[name='curp']"], value: general.curp },
      {
        key: "fiscal_registration_number",
        selectors: ["#txtFiscalReg", "[name='FiscalRegistrationNumber']", "[name='fiscal_registration_number']"],
        value: tax.fiscal_registration_number
      },
      { key: "company_name", selectors: ["#txtCompanyName", "[name='CompanyName']", "[name='company_name']"], value: tax.company_name }
    ];

    for (const f of fields) {
      // eslint-disable-next-line no-await-in-loop
      const el = await waitForFirst(f.selectors, 3000);
      if (!el) {
        report[f.key] = { ok: false, reason: "field_not_found" };
        console.warn("Grace: field not found", f.selectors);
        continue;
      }
      report[f.key] = { ok: setValue(f.selectors, f.value) };
    }

    if (Array.isArray(data.official_identification) && data.official_identification.length) {
      const first = data.official_identification[0] || {};
      report.document_type = { ok: setValue(["#ddlIDType", "[name='IDType']", "[name='document_type']"], first.document_type) };
      report.identification_number = {
        ok: setValue(["#txtIDNumber", "[name='IDNumber']", "[name='identification_number']"], first.identification_number)
      };
    }

    console.log("Grace fill report:", report);
    sendResponse({ ok: true, report });
  })().catch((err) => {
    console.error("Grace: fill failed", err);
    sendResponse({ ok: false, error: err?.message || String(err) });
  });

  return true;
});
