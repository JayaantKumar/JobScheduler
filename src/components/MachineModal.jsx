import { useState } from "react";
import { addMachine, updateMachine } from "../services/machine.service";

export default function MachineModal({ onClose, existingData }) {
  const [formData, setFormData] = useState({
    name: existingData?.name || "",
    type: existingData?.type || "",
    status: existingData?.status || "Offline",
    currentLoad: existingData?.currentLoad || 0,
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (existingData) {
        await updateMachine(existingData.id, formData);
      } else {
        await addMachine(formData);
      }
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md p-6 shadow-2xl">
        <h3 className="text-xl font-bold text-white mb-6">{existingData ? "Edit Machine" : "Add New Machine"}</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Machine Name</label>
            <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Type</label>
            <input required type="text" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary-500" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Status</label>
              <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary-500">
                <option value="Online">Online</option>
                <option value="Offline">Offline</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Load (%)</label>
              <input required type="number" min="0" max="100" value={formData.currentLoad} onChange={e => setFormData({...formData, currentLoad: Number(e.target.value)})} className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary-500" />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-8">
            <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">Cancel</button>
            <button type="submit" disabled={loading} className="bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg font-medium transition-colors">
              {loading ? "Saving..." : "Save Machine"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}