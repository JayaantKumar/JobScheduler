// Strips text from GSM inputs (e.g., "300gsm" -> "300")
export const cleanGsm = (val) => val ? String(val).replace(/gsm/gi, "").trim() : "";

// Generates the DDMMYY string for the trackable Set IDs
export const generateJobDatePrefix = () => {
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const yy = String(today.getFullYear()).slice(-2);
  return `${dd}${mm}${yy}`;
};