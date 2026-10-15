
// services/product.service.js

import api from "./api";

export const submitQRLead = async ({
  mobile,
  customerName,
  storeId,
  storeName,
  salesmanId,
  salesmanName,
  salesmanEmail,
  products,
  remarks,
}) => {
  try {
    if (!products || products.length === 0) {
      throw new Error("At least one product must be scanned");
    }

    const payload = {
      mobile,
      customerName,
      storeId,
      storeName,
      salesmanId,
      salesmanName,
      salesmanEmail,
      products,
      remarks,
      submittedAt: new Date().toISOString(),
      status: "SUBMITTED",
      // Lead source — always sent
      origin: "QR_WALKIN",
    };

    console.log("Submitting QR Lead:", payload);

    const response = await api.post("/qrleads", payload);

    console.log("QR Lead Response:", response);

    return response;
  } catch (error) {
    console.error(
      "submitQRLead error:",
      error?.message || error
    );

    throw error;
  }
};
