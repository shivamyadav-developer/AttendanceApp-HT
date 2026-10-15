// services/lead.js

import api from "./api";

const PAGE_SIZE = 100;
const MAX_PAGES = 20; // safety cap: 2,000 leads per store

// QR leads for ONE store only (GET /qrleads?storeId=…).
// Never calls without a storeId — that would return every store's leads.
// The API pages its results (default 50), so all pages are fetched.
export const getQRLeads = async ({ storeId } = {}) => {
  const hasStoreId =
    storeId !== null && storeId !== undefined && String(storeId).trim() !== "";

  if (!hasStoreId) {
    throw new Error(
      "Your store is not set on your profile, so leads can't be loaded. Please contact HR."
    );
  }

  const store = encodeURIComponent(String(storeId).trim());

  try {
    const all = [];
    let page = 1;
    let totalPages = 1;

    do {
      const response = await api.get(
        `/qrleads?storeId=${store}&limit=${PAGE_SIZE}&page=${page}`
      );

      // Response shape: { success, data: { data: [...], pagination: {...} } }
      const list = response?.data?.data ?? response?.data;
      if (Array.isArray(list)) all.push(...list);

      totalPages = Number(response?.data?.pagination?.totalPages) || 1;
      page += 1;
    } while (page <= totalPages && page <= MAX_PAGES);

    // Extra guard: keep only this store's leads
    return all.filter((lead) => String(lead?.storeId) === String(storeId).trim());
  } catch (error) {
    console.warn("getQRLeads error:", error?.message || error);

    throw error;
  }
};

// Backend CRM_LEAD_STATUS — the only values PATCH /qrleads/:id accepts.
// `stage` drives the 3 badges in the app: new | progress | closed
export const CRM_LEAD_STATUSES = [
  { value: "NEW", label: "New", stage: "new" },
  { value: "CONTACTED", label: "Contacted", stage: "progress" },
  { value: "INTERESTED", label: "Interested", stage: "progress" },
  { value: "FOLLOW_UP", label: "Follow Up", stage: "progress" },
  { value: "CALL_BACK", label: "Call Back", stage: "progress" },
  { value: "NOT_REACHABLE", label: "Not Reachable", stage: "progress" },
  { value: "STORE_VISIT_SCHEDULED", label: "Store Visit Scheduled", stage: "progress" },
  { value: "NOT_INTERESTED", label: "Not Interested", stage: "closed" },
  { value: "WRONG_NUMBER", label: "Wrong Number", stage: "closed" },
  { value: "CONVERTED", label: "Converted", stage: "closed" },
  { value: "LOST", label: "Lost", stage: "closed" },
];

// Statuses offered after a call (NEW makes no sense once you've called)
export const CALL_OUTCOME_STATUSES = CRM_LEAD_STATUSES.filter(
  (s) => s.value !== "NEW"
);

export const getCrmStatusInfo = (value) =>
  CRM_LEAD_STATUSES.find((s) => s.value === String(value || "").toUpperCase()) ||
  null;

// Default choice after a call: NEW → CONTACTED, otherwise keep the current
// status (so a converted / scheduled lead is never moved backwards by default)
export const crmStatusAfterCall = (lead) => {
  if (lead?.isConverted) return "CONVERTED";
  const current = getCrmStatusInfo(lead?.crmStatus);
  return current && current.value !== "NEW" ? current.value : "CONTACTED";
};

// Change only the CRM status (PATCH /qrleads/:id) — from the status
// dropdown on the lead details page. Returns the updated lead.
export const updateLeadStatus = async (lead, crmStatus, comment) => {
  const id = lead?._id;
  if (!id) throw new Error("Lead id is missing.");

  const status = getCrmStatusInfo(crmStatus)?.value;
  if (!status) throw new Error("Please choose a valid status.");

  const response = await api.patch(`/qrleads/${encodeURIComponent(id)}`, {
    crmStatus: status,
    comment,
  });

  if (!response?.success || !response?.data) {
    throw new Error(response?.message || "Could not update the status.");
  }

  return response.data;
};

// Record a call on the lead (PATCH /qrleads/:id).
// `crmStatus` is the status the user picked; falls back to the default.
// Returns the updated lead from the server.
export const markLeadCalled = async (lead, comment, crmStatus) => {
  const id = lead?._id;
  if (!id) throw new Error("Lead id is missing.");

  const status = getCrmStatusInfo(crmStatus)?.value || crmStatusAfterCall(lead);

  const response = await api.patch(`/qrleads/${encodeURIComponent(id)}`, {
    mobileCall: { called: true },
    crmStatus: status,
    comment,
  });

  if (!response?.success || !response?.data) {
    throw new Error(response?.message || "Could not update the lead.");
  }

  return response.data;
};
