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

export const formatInventoryLabel = (invItem) => {
  if (!invItem) return "";
  const rawName = invItem.name || invItem.itemName || invItem.label || "Unnamed Material";
  const details = invItem.details || {};
  
  const brand = details.Brand || details.Mill || "";
  const gsm = details.GSM || "";
  const thickness = details.Thickness || details['Thickness (mm)'] || "";
  const size = details.Size || "";

  const baseCategory = rawName.split('·')[0].trim();
  
  let parts = [baseCategory];
  if (brand) parts.push(brand);
  if (gsm) parts.push(`${gsm} GSM`);
  else if (thickness) parts.push(`${thickness} mm`);
  if (size) parts.push(size);
  
  if (parts.length > 1) return parts.join(' · ');
  return rawName;
};