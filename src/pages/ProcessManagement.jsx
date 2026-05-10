import { useState } from "react";
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/config";
import { useProcesses } from "../hooks/useProcesses";
import { useMachines } from "../hooks/useMachines"; 

// ⭐️ NEW: Master list of processes that cannot be deleted
const LOCKED_PROCESS_NAMES = [
  "die cutting", 
  "lamination", 
  "corrugation pasting", 
  "side pasting", 
  "side pasting (machine)"
];

export default function ProcessManagement() {
  const { processes, loading: procLoading } = useProcesses();
  const { machines, loading: machLoading } = useMachines(); 
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProcess, setEditingProcess] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form States
  const [processName, setProcessName] = useState("");
  const [defaultMachineId, setDefaultMachineId] = useState("");
  const [inputUnit, setInputUnit] = useState("");
  const [outputUnit, setOutputUnit] = useState("");

  const openModal = (proc = null) => {
    if (proc) {
      setEditingProcess(proc);
      setProcessName(proc.processName || "");
      setDefaultMachineId(proc.defaultMachineId || "");
      setInputUnit(proc.inputUnit || "");
      setOutputUnit(proc.outputUnit || "");
    } else {
      setEditingProcess(null);
      setProcessName(""); 
      setDefaultMachineId("");
      setInputUnit(""); 
      setOutputUnit("");
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!processName.trim()) return alert("Please enter a Process Name.");
    
    setSaving(true);

    const selectedMach = machines.find(m => m.id === defaultMachineId);
    const defaultMachineName = selectedMach ? selectedMach.name : "";

    const payload = { 
      processName: processName.trim(), 
      defaultMachineId: defaultMachineId,
      defaultMachineName: defaultMachineName,
      machineType: defaultMachineName, 
      inputUnit, 
      outputUnit, 
      updated_at: serverTimestamp() 
    };

    try {
      if (editingProcess) {
        await updateDoc(doc(db, "processes", editingProcess.id), payload);
      } else {
        await addDoc(collection(db, "processes"), { ...payload, created_at: serverTimestamp() });
      }
      setIsModalOpen(false);
    } catch (error) {
      alert("Failed to save: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, name) => {
    // ⭐️ NEW: Double-layer security to prevent deletion
    if (name && LOCKED_PROCESS_NAMES.includes(name.toLowerCase().trim())) {
      return alert("SECURITY ALERT: This is a core factory process and cannot be deleted.");
    }

    if (window.confirm("Are you sure you want to delete this process?")) {
      try { 
        await deleteDoc(doc(db, "processes", id)); 
      } catch (error) { 
        alert("Failed to delete: " + error.message); 
      }
    }
  };

  if (procLoading) return <div className="p-8 text-primary-500 animate-pulse font-medium">Loading Processes...</div>;

  const inputClass = "w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary-500 placeholder-gray-600";
  const labelClass = "block text-xs font-semibold text-gray-400 mb-1.5";

  return (
    <div className="max-w-[1600px] mx-auto p-4 sm:p-6 h-full flex flex-col">
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Process Management</h2>
          <p className="text-sm sm:text-base text-gray-400 mt-1">Define standard factory processes and link them to physical machines.</p>
        </div>
        <button 
          onClick={() => openModal()} 
          className="w-full sm:w-auto justify-center bg-primary-600 hover:bg-primary-500 text-white px-5 py-2.5 rounded-lg font-medium transition-colors shadow-lg shadow-primary-500/20 flex items-center gap-2 shrink-0"
        >
          <span>+</span> Add Process
        </button>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden shadow-xl flex-1 flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-gray-950/50 border-b border-gray-800 text-xs font-bold text-gray-400 uppercase tracking-wider">
                <th className="py-4 px-6">Process Name</th>
                <th className="py-4 px-6">Default Assigned Machine</th>
                <th className="py-4 px-6">Input Unit</th>
                <th className="py-4 px-6">Output Unit</th>
                <th className="py-4 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {processes.length === 0 ? (
                <tr><td colSpan="5" className="py-12 text-center text-gray-500">No processes defined yet. Start building your custom list!</td></tr>
              ) : (
                processes.map((proc) => {
                  // ⭐️ NEW: Check if this row is a locked process
                  const isLocked = proc.processName && LOCKED_PROCESS_NAMES.includes(proc.processName.toLowerCase().trim());

                  return (
                    <tr key={proc.id} className={`hover:bg-gray-800/30 transition-colors group ${isLocked ? 'bg-red-900/5' : ''}`}>
                      
                      <td className={`py-4 px-6 font-bold flex items-center gap-2 ${isLocked ? 'text-red-400' : 'text-gray-200'}`}>
                        {proc.processName}
                        {isLocked && (
                          <span className="text-[9px] bg-red-500/10 text-red-400 px-2 py-0.5 rounded border border-red-500/20 uppercase tracking-widest font-bold">
                            Locked
                          </span>
                        )}
                      </td>

                      <td className="py-4 px-6 text-primary-400 font-medium">
                        {proc.defaultMachineName || proc.machineType || <span className="text-gray-500 italic">Unassigned</span>}
                      </td>
                      <td className="py-4 px-6 text-gray-400">{proc.inputUnit || "-"}</td>
                      <td className="py-4 px-6 text-gray-400">{proc.outputUnit || "-"}</td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex justify-end gap-3 items-center">
                          <button onClick={() => openModal(proc)} className="text-yellow-500 hover:text-yellow-400 p-1.5 transition-colors">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          
                          {/* ⭐️ NEW: Show Padlock if locked, Trash Can if unlocked */}
                          {isLocked ? (
                            <div className="p-1.5 text-gray-600/50 cursor-not-allowed" title="System Locked Process - Cannot be deleted">
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                            </div>
                          ) : (
                            <button onClick={() => handleDelete(proc.id, proc.processName)} className="text-red-500 hover:text-red-400 p-1.5 transition-colors">
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          )}

                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white tracking-tight">{editingProcess ? "Edit Process" : "Add Process"}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            
            <form onSubmit={handleSave} className="space-y-5">
              
              <div>
                <label className={labelClass}>Process Name *</label>
                <input 
                  type="text" 
                  required 
                  value={processName} 
                  onChange={e => setProcessName(e.target.value)} 
                  placeholder="e.g., Premium Foiling" 
                  className={inputClass} 
                  disabled={editingProcess && LOCKED_PROCESS_NAMES.includes(processName.toLowerCase().trim())}
                  title={editingProcess && LOCKED_PROCESS_NAMES.includes(processName.toLowerCase().trim()) ? "Locked Process names cannot be edited" : ""}
                />
              </div>

              <div>
                <label className={labelClass}>Default Assigned Machine (Optional)</label>
                <select value={defaultMachineId} onChange={e => setDefaultMachineId(e.target.value)} className={inputClass} disabled={machLoading}>
                  <option value="">-- Leave Unassigned --</option>
                  {machines.map(m => (
                    <option key={m.id} value={m.id}>{m.name} ({m.place})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div><label className={labelClass}>Default Input Unit</label><input type="text" value={inputUnit} onChange={e => setInputUnit(e.target.value)} placeholder="e.g., sheets" className={inputClass} /></div>
                <div><label className={labelClass}>Default Output Unit</label><input type="text" value={outputUnit} onChange={e => setOutputUnit(e.target.value)} placeholder="e.g., pieces" className={inputClass} /></div>
              </div>
              <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-gray-800">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors font-medium">Cancel</button>
                <button type="submit" disabled={saving} className="bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-bold">{saving ? "Saving..." : "Save Process"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}