import { useState } from "react";
import { collection, addDoc, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/config";

const PREDEFINED_TYPES = [
  "Manual Work (Hand Labour)",
  "Forming + conveyor",
  "Automatic gluing",
  "Manual Gluing",
  "UV Printing",
  "Manual Side Pasting",
  "Sorting"
];

export default function MachineModal({ onClose, machines = [], editingMachine = null }) {
  const existingCustomTypes = [...new Set(machines.map(m => m.type))].filter(
    type => type && !PREDEFINED_TYPES.includes(type)
  );
  const ALL_TYPES = [...PREDEFINED_TYPES, ...existingCustomTypes];

  // Pre-fill the form if we are editing!
  const [name, setName] = useState(editingMachine?.name || "");
  const [type, setType] = useState(editingMachine?.type || ALL_TYPES[0] || "");
  const [customType, setCustomType] = useState("");
  const [place, setPlace] = useState(editingMachine?.place || ""); 
  const [status, setStatus] = useState(editingMachine?.status || "Online");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!name.trim()) return alert("Error: Please enter a Machine Name.");
    if (!place.trim()) return alert("Error: Please enter a Machine Place.");
    if (type === "Custom" && !customType.trim()) return alert("Error: Please type your custom machine name.");

    setLoading(true);
    const finalType = type === "Custom" ? customType : type;

    try {
      if (editingMachine) {
        // UPDATE Existing Machine
        const machineRef = doc(db, "machines", editingMachine.id);
        await updateDoc(machineRef, {
          name: name,
          type: finalType,
          place: place,
          status: status,
          updated_at: serverTimestamp(),
        });
      } else {
        // CREATE New Machine
        await addDoc(collection(db, "machines"), {
          name: name,
          type: finalType,
          place: place,
          status: status,
          currentLoad: 0, 
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        });
      }
      
      onClose(); 
    } catch (error) {
      console.error("Full Firebase Error:", error);
      alert(`Firebase Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md p-6 shadow-2xl">
        <h3 className="text-xl font-bold text-white mb-2">
          {editingMachine ? "Edit Machine" : "Add New Machine"}
        </h3>
        <p className="text-sm text-gray-400 mb-6">
          {editingMachine ? "Update the details for this machine." : "Register a new workstation or machine to the factory floor."}
        </p>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Machine Name *</label>
            <input 
              type="text" 
              value={name} 
              onChange={e => setName(e.target.value)} 
              placeholder="e.g. Die Cutter Alpha"
              className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary-500" 
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Machine Place (Factory) *</label>
            <input 
              type="text" 
              value={place} 
              onChange={e => setPlace(e.target.value)} 
              placeholder="e.g. Section A, Floor 1"
              className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary-500" 
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Machine Type</label>
            <select 
              value={type} 
              onChange={e => setType(e.target.value)} 
              className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary-500 mb-2"
            >
              {ALL_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
              <option value="Custom" className="text-primary-400 font-bold">+ Add Custom Type...</option>
            </select>
            
            {type === "Custom" && (
              <input 
                type="text" 
                value={customType} 
                onChange={e => setCustomType(e.target.value)} 
                placeholder="Type your custom machine type here..."
                className="w-full bg-gray-950 border border-primary-500/50 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary-500 animate-fade-in" 
              />
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Status</label>
            <select 
              value={status} 
              onChange={e => setStatus(e.target.value)} 
              className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary-500"
            >
              <option value="Online">Online</option>
              <option value="Maintenance">Maintenance</option>
              <option value="Offline">Offline</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 mt-8">
            <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">Cancel</button>
            <button type="submit" disabled={loading} className="bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg font-medium transition-colors">
              {loading ? "Saving..." : (editingMachine ? "Update Machine" : "Save Machine")}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}