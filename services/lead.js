// services/lead.js

import api from "./api";

export const getQRLeads = async ({ storeId } = {}) => {
  try {
    const hasStoreId =
      storeId !== null && storeId !== undefined && String(storeId) !== "";

    const query = hasStoreId
      ? `?storeId=${encodeURIComponent(String(storeId))}`
      : "";

    const response = await api.get(`/qrleads${query}`);

    // Response shape: { success, statusCode, message, data: { data: [...] } }
    const list = response?.data?.data ?? response?.data;

    return Array.isArray(list) ? list : [];
  } catch (error) {
    console.error("getQRLeads error:", error?.message || error);

    throw error;
  }
};
