import { useState } from "react";
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/config";
import { useProcesses } from "../hooks/useProcesses";
import { useMachines } from "../hooks/useMachines"; 

// Master list of processes that are typically locked
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
  const [attributes, setAttributes] = useState([]); 
  
  // ⭐️ ROUND 18: Default Wastage State
  const [defaultWastage, setDefaultWastage] = useState(0);

  const openModal = (proc = null) => {
    if (proc) {
      setEditingProcess(proc);
      setProcessName(proc.processName || "");
      setDefaultMachineId(proc.defaultMachineId || "");
      setInputUnit(proc.inputUnit || "");
      setOutputUnit(proc.outputUnit || "");
      setAttributes(proc.attributes || []); 
      setDefaultWastage(proc.defaultWastage || 0); // Load existing wastage
    } else {
      setEditingProcess(null);
      setProcessName(""); 
      setDefaultMachineId("");
      setInputUnit(""); 
      setOutputUnit("");
      setAttributes([]);
      setDefaultWastage(0); // Reset for new
    }
    setIsModalOpen(true);
  };

  // --- ATTRIBUTE BUILDER FUNCTIONS ---
  const addAttribute = () => {
    setAttributes([...attributes, { id: Date.now(), name: "", type: "text", options: "", prints: true }]);
  };

  const updateAttribute = (id, field, value) => {
    setAttributes(attributes.map(attr => attr.id === id ? { ...attr, [field]: value } : attr));
  };

  const removeAttribute = (id) => {
    setAttributes(attributes.filter(attr => attr.id !== id));
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
      attributes, 
      defaultWastage: Number(defaultWastage) || 0, // ⭐️ Save default wastage to the database
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
    const isLocked = name && LOCKED_PROCESS_NAMES.includes(name.toLowerCase().trim());

    if (isLocked) {
      const confirmForce = window.prompt(`SECURITY ALERT: "${name}" is a core process. To force delete and unlock it, type 'UNLOCK' below.`);
      if (confirmForce !== 'UNLOCK') return;
    } else {
      if (!window.confirm(`Are you sure you want to delete ${name}?`)) return;
    }

    try { 
      await deleteDoc(doc(db, "processes", id)); 
    } catch (error) { 
      alert("Failed to delete: " + error.message); 
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
          <p className="text-sm sm:text-base text-gray-400 mt-1">Define standard factory processes, link machines, and build dynamic attributes.</p>
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
                <th className="py-4 px-6">Configured Attributes</th>
                <th className="py-4 px-6">Default Wastage</th>
                <th className="py-4 px-6">Default Assigned Machine</th>
                <th className="py-4 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {processes.length === 0 ? (
                <tr><td colSpan="5" className="py-12 text-center text-gray-500">No processes defined yet. Start building your custom list!</td></tr>
              ) : (
                processes.map((proc) => {
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
                      <td className="py-4 px-6 text-gray-400 text-sm">
                        {proc.attributes?.length > 0 ? (
                          <span className="bg-primary-500/20 text-primary-400 px-2.5 py-1 rounded-md font-bold text-xs border border-primary-500/20">
                            {proc.attributes.length} Fields
                          </span>
                        ) : (
                          <span className="text-gray-600 italic text-xs">No attributes</span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-gray-400 font-medium">
                        {/* ⭐️ ROUND 18: Display default wastage */}
                        {proc.defaultWastage ? <span className="text-orange-400">{proc.defaultWastage}%</span> : "0%"}
                      </td>
                      <td className="py-4 px-6 text-primary-400 font-medium">
                        {proc.defaultMachineName || proc.machineType || <span className="text-gray-500 italic">Unassigned</span>}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex justify-end gap-3 items-center">
                          <button onClick={() => openModal(proc)} className="text-yellow-500 hover:text-yellow-400 p-1.5 transition-colors">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          
                          <button 
                            onClick={() => handleDelete(proc.id, proc.processName)} 
                            className={`${isLocked ? 'text-red-500/50 hover:text-red-400' : 'text-red-500 hover:text-red-400'} p-1.5 transition-colors`}
                            title={isLocked ? "Click to force unlock and delete" : "Delete process"}
                          >
                            {isLocked ? (
                               <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
                            ) : (
                               <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            )}
                          </button>
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
          <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex justify-between items-center p-6 border-b border-gray-800 shrink-0">
              <h3 className="text-xl font-bold text-white tracking-tight">{editingProcess ? "Edit Process & Attributes" : "Add Process"}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
              
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider border-b border-gray-800 pb-2">Basic Info</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Process Name *</label>
                    <input 
                      type="text" 
                      required 
                      value={processName} 
                      onChange={e => setProcessName(e.target.value)} 
                      placeholder="e.g., Lamination" 
                      className={inputClass} 
                    />
                  </div>
                  <div>
                    {/* ⭐️ ROUND 18: Default Wastage Input */}
                    <label className={labelClass}>Default Expected Wastage (%)</label>
                    <input 
                      type="number" 
                      min="0"
                      step="0.1"
                      value={defaultWastage} 
                      onChange={e => setDefaultWastage(e.target.value)} 
                      placeholder="e.g. 5 for 5%" 
                      className={inputClass} 
                    />
                  </div>
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
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                  <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Custom Attributes</h4>
                  <button type="button" onClick={addAttribute} className="text-primary-400 hover:text-primary-300 text-xs font-bold transition-colors">
                    + ADD FIELD
                  </button>
                </div>
                
                {attributes.length === 0 && <p className="text-xs text-gray-500 italic">No custom attributes defined. Click '+ ADD FIELD' to add options like Foil Colour, Die No, etc.</p>}
                
                {attributes.map((attr) => (
                  <div key={attr.id} className="bg-gray-950/50 p-4 rounded-lg border border-gray-800 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>Attribute Name</label>
                        <input required placeholder="e.g. Finish, Film type" value={attr.name} onChange={e => updateAttribute(attr.id, 'name', e.target.value)} className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Input Type</label>
                        <select value={attr.type} onChange={e => updateAttribute(attr.id, 'type', e.target.value)} className={inputClass}>
                          <option value="text">Text Input</option>
                          <option value="number">Number</option>
                          <option value="dropdown">Dropdown Options</option>
                          <option value="multi-select">Multi-Select</option>
                          <option value="reference">Database Reference</option>
                        </select>
                      </div>
                    </div>
                    
                    {['dropdown', 'multi-select'].includes(attr.type) && (
                      <div>
                        <label className={labelClass}>Options (Comma separated)</label>
                        <input required placeholder="e.g. BOPP, Thermal, PET" value={attr.options} onChange={e => updateAttribute(attr.id, 'options', e.target.value)} className={inputClass} />
                      </div>
                    )}

                    {attr.type === 'reference' && (
                      <div>
                        <label className={labelClass}>Database Target</label>
                        <select value={attr.options} onChange={e => updateAttribute(attr.id, 'options', e.target.value)} className={inputClass}>
                          <option value="">-- Select Data Source --</option>
                          <option value="dies">Master Data: Dies</option>
                        </select>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2">
                      <label className="flex items-center gap-2 text-xs font-medium text-gray-300 cursor-pointer">
                        <input type="checkbox" checked={attr.prints} onChange={e => updateAttribute(attr.id, 'prints', e.target.checked)} className="w-4 h-4 rounded border-gray-700 text-primary-600 focus:ring-primary-600 bg-gray-900" /> 
                        Prints on Final Job Card
                      </label>
                      <button type="button" onClick={() => removeAttribute(attr.id)} className="text-red-500 hover:text-red-400 text-xs font-bold px-2 py-1 transition-colors">
                        REMOVE
                      </button>
                    </div>
                  </div>
                ))}
              </div>

            </form>

            <div className="p-6 border-t border-gray-800 shrink-0 bg-[#151724] flex justify-end gap-3">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 rounded-lg text-gray-400 hover:text-white transition-colors font-medium">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-bold shadow-lg shadow-primary-500/20">{saving ? "Saving..." : "Save Configuration"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}