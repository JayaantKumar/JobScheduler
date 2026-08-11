import { useState, useEffect } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../firebase/config";

export default function Settings() {
  const [logoUrl, setLogoUrl] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [toast, setToast] = useState({ show: false, msg: "", type: "success" });

  const showToast = (msg, type = "success") => {
    setToast({ show: true, msg, type });
    setTimeout(() => setToast({ show: false, msg: "", type: "success" }), 3000);
  };

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, "settings", "global");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.logoUrl || data.companyLogo) {
            setLogoUrl(data.logoUrl || data.companyLogo);
          }
          if (data.companyName) {
            setCompanyName(data.companyName);
          }
        }
      } catch (error) {
        console.error("Failed to load settings:", error);
      }
    };
    fetchSettings();
  }, []);

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      return showToast("Image must be smaller than 5MB", "error");
    }

    setUploading(true);
    try {
      const storageRef = ref(storage, `settings/company_logo_${Date.now()}`);
      await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(storageRef);

      // Save both logoUrl and companyLogo for cross-compatibility
      await setDoc(doc(db, "settings", "global"), { logoUrl: downloadUrl, companyLogo: downloadUrl }, { merge: true });
      
      setLogoUrl(downloadUrl);
      showToast("Company logo updated successfully!");
    } catch (error) {
      showToast("Failed to upload logo: " + error.message, "error");
    } finally {
      setUploading(false);
    }
  };

  const handleSaveCompanyName = async (e) => {
    e.preventDefault();
    setSavingName(true);
    try {
      await setDoc(doc(db, "settings", "global"), { companyName }, { merge: true });
      showToast("Company name updated successfully!");
    } catch (error) {
      showToast("Failed to save company name: " + error.message, "error");
    } finally {
      setSavingName(false);
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto p-6 h-full flex flex-col relative">
      {toast.show && (
        <div className={`fixed top-6 right-6 px-6 py-4 rounded-xl shadow-2xl z-[100] font-bold animate-fade-in flex items-center gap-3 text-white ${toast.type === 'error' ? 'bg-red-600 border border-red-500' : 'bg-green-600 border border-green-500'}`}>
          {toast.msg}
        </div>
      )}

      <div className="mb-8">
        <h2 className="text-3xl font-bold text-white tracking-tight">System Settings</h2>
        <p className="text-gray-400 mt-1">Manage global application configurations and branding.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Branding & Logo Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-xl">
          <h3 className="text-lg font-bold text-white mb-4 border-b border-gray-800 pb-2">Company Branding & Details</h3>
          
          <div className="space-y-6">
            {/* Company Name Form */}
            <form onSubmit={handleSaveCompanyName} className="space-y-2">
              <label className="block text-sm font-bold text-gray-400">Company Name</label>
              <div className="flex gap-3">
                <input 
                  type="text" 
                  value={companyName} 
                  onChange={(e) => setCompanyName(e.target.value)} 
                  placeholder="e.g. Janus Print" 
                  className="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary-500"
                />
                <button 
                  type="submit" 
                  disabled={savingName}
                  className="bg-primary-600 hover:bg-primary-500 text-white px-5 py-2.5 rounded-lg font-bold text-sm transition-colors shadow-lg disabled:opacity-50"
                >
                  {savingName ? "Saving..." : "Save Name"}
                </button>
              </div>
            </form>

            {/* Logo Upload Section */}
            <div>
              <label className="block text-sm font-bold text-gray-400 mb-2">Printed Job Card Logo</label>
              <div className="flex items-start gap-6">
                <div className="w-48 h-24 bg-gray-950 border-2 border-dashed border-gray-700 rounded-lg flex items-center justify-center overflow-hidden shrink-0">
                  {logoUrl ? (
                    <img src={logoUrl} alt="Company Logo" className="max-w-full max-h-full object-contain p-2" />
                  ) : (
                    <span className="text-gray-600 text-xs font-bold uppercase">No Logo Set</span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <label className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-bold text-sm cursor-pointer transition-colors shadow-lg text-center w-max border border-gray-700">
                    {uploading ? "Uploading..." : "Upload New Logo"}
                    <input type="file" accept="image/png, image/jpeg, image/svg+xml" className="hidden" onChange={handleLogoUpload} disabled={uploading} />
                  </label>
                  <p className="text-xs text-gray-500">Recommended: Transparent PNG or SVG. Max 5MB.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}