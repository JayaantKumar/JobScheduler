import { useState } from "react";
import { collection, addDoc, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/config";

const PREDEFINED_TYPES = [
  "Sheet Cutting", "Folding", "Corrugation", "Printing", "Lamination",
  "Die Cutting", "Punching", "Creasing", "Gluing", "Side Pasting",
  "Bottom Pasting", "Window Pasting", "Embossing", "Debossing",
  "Foil Stamping", "UV Coating", "Varnishing", "Stripping",
  "Bundling", "Stitching", "Quality Check", "Packing"
];

export default function MachineModal({ onClose, machines = [], editingMachine = null }) {
  const existingCustomTypes = [...new Set(machines.map(m => m.type))].filter(
    type => type && !PREDEFINED_TYPES.includes(type)
  );
  const ALL_TYPES = [...PREDEFINED_TYPES, ...existingCustomTypes];

  // Form States
  const [name, setName] = useState(editingMachine?.name || "");
  const [company, setCompany] = useState(editingMachine?.company || ""); 
  const [type, setType] = useState(editingMachine?.type || ALL_TYPES[0] || "");
  const [customType, setCustomType] = useState("");
  const [place, setPlace] = useState(editingMachine?.place || ""); 
  const [status, setStatus] = useState(editingMachine?.status || "Online");
  
  const [specs, setSpecs] = useState(editingMachine?.specs || { dimUnit: "in" });
  const [loading, setLoading] = useState(false);

  // Helper to update simple spec fields
  const handleSpecChange = (field, value) => {
    setSpecs(prev => ({ ...prev, [field]: value }));
  };

  // 🧠 SMART DIMENSION CALCULATOR (Inches <-> Centimeters)
  const handleDimChange = (field, value) => {
    const newSpecs = { ...specs, [field]: value };
    
    // Default to inches if unit is somehow cleared
    const unit = newSpecs.dimUnit || "in";
    const multiplier = unit === "in" ? 2.54 : 0.393701;
    const otherUnit = unit === "in" ? "cm" : "in";

    const parts = [];
    const partsConverted = [];

    // Only add dimensions that the user actually typed in (Supports LxB, or LxBxH, or just L)
    if (newSpecs.dimL) { 
      parts.push(newSpecs.dimL); 
      partsConverted.push((newSpecs.dimL * multiplier).toFixed(1)); 
    }
    if (newSpecs.dimB) { 
      parts.push(newSpecs.dimB); 
      partsConverted.push((newSpecs.dimB * multiplier).toFixed(1)); 
    }
    if (newSpecs.dimH) { 
      parts.push(newSpecs.dimH); 
      partsConverted.push((newSpecs.dimH * multiplier).toFixed(1)); 
    }

    // Combine them into a single smart string to save to the database!
    if (parts.length > 0) {
      newSpecs.size = `${parts.join(" x ")} ${unit} (${partsConverted.join(" x ")} ${otherUnit})`;
    } else {
      newSpecs.size = "";
    }

    setSpecs(newSpecs);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!name.trim()) return alert("Error: Please enter a Machine Name.");
    if (!place.trim()) return alert("Error: Please enter a Machine Place.");
    if (type === "Custom" && !customType.trim()) return alert("Error: Please type your custom machine name.");

    setLoading(true);
    const finalType = type === "Custom" ? customType : type;

    const machineData = {
      name: name,
      company: company,
      type: finalType,
      place: place,
      status: status,
      specs: specs,
      updated_at: serverTimestamp(),
    };

    try {
      if (editingMachine) {
        await updateDoc(doc(db, "machines", editingMachine.id), machineData);
      } else {
        await addDoc(collection(db, "machines"), {
          ...machineData,
          currentLoad: 0, 
          created_at: serverTimestamp(),
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

  const inputClass = "w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary-500";

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md p-6 shadow-2xl overflow-y-auto max-h-[90vh] custom-scrollbar">
        <h3 className="text-xl font-bold text-white mb-2">
          {editingMachine ? "Edit Machine" : "Add New Machine"}
        </h3>
        <p className="text-sm text-gray-400 mb-6">
          {editingMachine ? "Update the details for this machine." : "Register a new workstation or machine to the factory floor."}
        </p>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Machine Name *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Die Cutter Alpha" className={inputClass} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Machine Company / Brand</label>
            <input type="text" value={company} onChange={e => setCompany(e.target.value)} placeholder="e.g. Bobst, Heidelberg (Optional)" className={inputClass} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Machine Place (Factory) *</label>
            <input type="text" value={place} onChange={e => setPlace(e.target.value)} placeholder="e.g. Section A, Floor 1" className={inputClass} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Machine Type</label>
            <select 
              value={type} 
              onChange={e => {
                setType(e.target.value);
                setSpecs({ dimUnit: "in" }); // Reset specs but keep default unit as inches
              }} 
              className={inputClass}
            >
              {ALL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              <option value="Custom" className="text-primary-400 font-bold">+ Add Custom Type...</option>
            </select>
            
            {type === "Custom" && (
              <input type="text" value={customType} onChange={e => setCustomType(e.target.value)} placeholder="Type custom machine type..." className={`${inputClass} mt-2 animate-fade-in`} />
            )}
          </div>

          {/* ========================================== */}
          {/* DYNAMIC SPECIFICATION FIELDS */}
          {/* ========================================== */}
          <div className="bg-gray-950/50 p-4 rounded-lg border border-gray-800">
            <h4 className="text-xs font-bold text-primary-400 uppercase tracking-wider mb-3">Capabilities & Specs</h4>
            
            {/* A, B, E: Sheet Cutting, Corrugation, Die Cutting -> Size (L x B x H) */}
            {["Sheet Cutting", "Corrugation", "Die Cutting"].includes(type) && (
              <div>
                <label className="block text-sm text-gray-400 mb-2">Max Size / Format (L x B x H)</label>
                <div className="flex items-center gap-2 mb-2">
                  <input type="number" placeholder="L" value={specs.dimL || ""} onChange={e => handleDimChange('dimL', e.target.value)} className={`${inputClass} px-2 text-center`} />
                  <span className="text-gray-500 text-xs">x</span>
                  <input type="number" placeholder="B" value={specs.dimB || ""} onChange={e => handleDimChange('dimB', e.target.value)} className={`${inputClass} px-2 text-center`} />
                  <span className="text-gray-500 text-xs">x</span>
                  <input type="number" placeholder="H" value={specs.dimH || ""} onChange={e => handleDimChange('dimH', e.target.value)} className={`${inputClass} px-2 text-center`} />
                  
                  <select value={specs.dimUnit || "in"} onChange={e => handleDimChange('dimUnit', e.target.value)} className={`${inputClass} px-2 w-auto`}>
                    <option value="in">in</option>
                    <option value="cm">cm</option>
                  </select>
                </div>
                {specs.size && (
                  <div className="text-xs text-primary-300 font-mono bg-primary-900/30 p-2 rounded border border-primary-500/20">
                    <span className="text-gray-500">Auto-calculated:</span><br/>{specs.size}
                  </div>
                )}
              </div>
            )}

            {/* C: Printing -> Colours & Size (L x B) */}
            {type === "Printing" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">No. of Colours</label>
                  <select value={specs.colors || "1"} onChange={e => handleSpecChange('colors', e.target.value)} className={inputClass}>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(num => <option key={num} value={num}>{num} Color{num > 1 ? 's' : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Max Print Size (L x B)</label>
                  <div className="flex items-center gap-2 mb-2">
                    <input type="number" placeholder="L" value={specs.dimL || ""} onChange={e => handleDimChange('dimL', e.target.value)} className={`${inputClass} px-2 text-center`} />
                    <span className="text-gray-500 text-xs">x</span>
                    <input type="number" placeholder="B" value={specs.dimB || ""} onChange={e => handleDimChange('dimB', e.target.value)} className={`${inputClass} px-2 text-center`} />
                    <select value={specs.dimUnit || "in"} onChange={e => handleDimChange('dimUnit', e.target.value)} className={`${inputClass} px-2 w-auto`}>
                      <option value="in">in</option>
                      <option value="cm">cm</option>
                    </select>
                  </div>
                  {specs.size && (
                    <div className="text-xs text-primary-300 font-mono bg-primary-900/30 p-2 rounded border border-primary-500/20">
                      <span className="text-gray-500">Auto-calculated:</span><br/>{specs.size}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* D: Lamination -> Type & Mode */}
            {type === "Lamination" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Type</label>
                  <select value={specs.laminationType || "Cold"} onChange={e => handleSpecChange('laminationType', e.target.value)} className={inputClass}>
                    <option value="Cold">Cold</option>
                    <option value="Thermal">Thermal</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Mode</label>
                  <select value={specs.mode || "Manual"} onChange={e => handleSpecChange('mode', e.target.value)} className={inputClass}>
                    <option value="Manual">Manual</option>
                    <option value="Semi-automatic">Semi-automatic</option>
                    <option value="Automatic">Automatic</option>
                  </select>
                </div>
              </div>
            )}

            {/* G: Gluing -> Mode */}
            {type === "Gluing" && (
              <div>
                <label className="block text-sm text-gray-400 mb-1">Mode</label>
                <select value={specs.mode || "Manual"} onChange={e => handleSpecChange('mode', e.target.value)} className={inputClass}>
                  <option value="Manual">Manual</option>
                  <option value="Semi-automatic">Semi-automatic</option>
                  <option value="Automatic">Automatic</option>
                </select>
              </div>
            )}

            {/* H: Side Pasting -> Min & Max Size */}
            {type === "Side Pasting" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Min Size</label>
                  <input type="text" value={specs.minSize || ""} onChange={e => handleSpecChange('minSize', e.target.value)} placeholder="e.g. 100mm" className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Max Size</label>
                  <input type="text" value={specs.maxSize || ""} onChange={e => handleSpecChange('maxSize', e.target.value)} placeholder="e.g. 800mm" className={inputClass} />
                </div>
              </div>
            )}

            {/* F: Pasting (Other) -> Manual Only */}
            {["Bottom Pasting", "Window Pasting", "Pasting"].includes(type) && (
              <div>
                <label className="block text-sm text-gray-400 mb-1">Mode</label>
                <select value={specs.mode || "Manual"} onChange={e => handleSpecChange('mode', e.target.value)} className={inputClass}>
                  <option value="Manual">Manual</option>
                </select>
              </div>
            )}

            {/* Fallback for other processes */}
            {!["Sheet Cutting", "Corrugation", "Die Cutting", "Printing", "Lamination", "Gluing", "Side Pasting", "Bottom Pasting", "Window Pasting", "Pasting"].includes(type) && (
              <p className="text-xs text-gray-500 italic mt-1">No additional specifications required for this process type.</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1 mt-4">Operational Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)} className={inputClass}>
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