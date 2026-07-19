import { useState } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/config";

export default function InlineAddModal({ isOpen, type, onClose, onSuccess }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    
    const collectionName = type === "Customer" ? "customers" : "productCategories";
    try {
      await addDoc(collection(db, collectionName), {
        name: name.trim(),
        created_at: serverTimestamp()
      });
      // Pass the success back up to select the newly created item
      onSuccess(type, name.trim());
      setName(""); 
    } catch (err) {
      console.error("Failed to add inline item:", err);
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary-500";
  const labelClass = "block text-xs font-semibold text-gray-400 mb-1.5";

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-gray-900 border border-primary-500/30 rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-fade-in">
        <div className="p-6 border-b border-gray-800 bg-[#151724]">
          <h3 className="text-lg font-bold text-white">Add New {type}</h3>
        </div>
        <form onSubmit={handleSave} className="p-6 space-y-4 bg-[#0a0f1a]">
          <div>
            <label className={labelClass}>{type} Name *</label>
            <input required type="text" value={name} onChange={e => setName(e.target.value)} className={inputClass} placeholder={`Enter ${type?.toLowerCase()} name`} />
          </div>
          <div className="pt-4 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-950 hover:bg-gray-800 text-xs text-gray-400 hover:text-white rounded transition-colors font-medium">Cancel</button>
            <button type="submit" disabled={saving} className="bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-xs font-bold text-white px-5 py-2 rounded transition-colors shadow-lg">
              {saving ? "Saving..." : "Save & Select"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}