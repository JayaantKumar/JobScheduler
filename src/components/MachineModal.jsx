import { useState, useEffect } from "react";
import { collection, addDoc, updateDoc, doc, serverTimestamp, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/config";
import { useProcesses } from "../hooks/useProcesses";

// 1. MASTER HARDCODED LIST 
const PREDEFINED_TYPES = [
  "Manual Work (Hand Labour)", 
  "Forming + conveyor", 
  "Automatic gluing", 
  "Manual Gluing", 
  "UV Printing", 
  "Manual Side Pasting", 
  "Sorting",
  "Sheet Cutting", 
  "Corrugation", 
  "Printing", 
  "Lamination", 
  "Die Cutting", 
  "Pasting", 
  "Gluing", 
  "Side Pasting"
];

export default function MachineModal({ onClose, machines = [], editingMachine = null }) {
  
  // Fetch dynamic processes from the database
  const { processes: dbProcesses, loading: procLoading } = useProcesses();

  // Locations state for the dropdown
  const [locations, setLocations] = useState([]);
  const [locLoading, setLocLoading] = useState(true);

  // Combine Hardcoded + Database Processes + Existing Custom Types into one master dropdown
  const dbProcessNames = dbProcesses.map(p => p.processName);
  const existingCustomTypes = [...new Set(machines.map(m => m.type))].filter(
    type => type && !dbProcessNames.includes(type) && !PREDEFINED_TYPES.includes(type)
  );
  
  // Sort alphabetically to make it easy for the client to read
  const ALL_TYPES = [...new Set([...PREDEFINED_TYPES, ...dbProcessNames, ...existingCustomTypes])].sort();

  // Form States
  const [isVendor, setIsVendor] = useState(editingMachine?.is_vendor || false); // ⭐️ ROUND 21: Vendor Toggle
  const [name, setName] = useState(editingMachine?.name || "");
  const [machineCode, setMachineCode] = useState(editingMachine?.machineCode || ""); 
  const [company, setCompany] = useState(editingMachine?.company || ""); 
  const [type, setType] = useState(editingMachine?.type || ""); 
  const [customType, setCustomType] = useState("");
  const [place, setPlace] = useState(editingMachine?.place || ""); 
  const [status, setStatus] = useState(editingMachine?.status || "Online");
  
  const [specs, setSpecs] = useState(editingMachine?.specs || { dimUnit: "in" });
  const [loading, setLoading] = useState(false);

  // Fetch Locations from Master Data
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "locations"), (snap) => {
      setLocations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLocLoading(false);
    });
    return () => unsub();
  }, []);

  // AUTO-GENERATE ID
  useEffect(() => {
    if (!editingMachine && (name || place)) {
      const cleanName = name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const cleanPlace = place.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      setMachineCode(`${cleanName}${cleanPlace}`);
    }
  }, [name, place, editingMachine]);

  const handleSpecChange = (field, value) => setSpecs(prev => ({ ...prev, [field]: value }));

  // Calculates Length x Width for the Size fields
  const handleDimChange = (field, value) => {
    const newSpecs = { ...specs, [field]: value };
    const unit = newSpecs.dimUnit || "in";
    const multiplier = unit === "in" ? 2.54 : 0.393701;
    const otherUnit = unit === "in" ? "cm" : "in";

    const parts = [];
    const partsConverted = [];

    if (newSpecs.dimL) { parts.push(newSpecs.dimL); partsConverted.push((newSpecs.dimL * multiplier).toFixed(1)); }
    if (newSpecs.dimW) { parts.push(newSpecs.dimW); partsConverted.push((newSpecs.dimW * multiplier).toFixed(1)); }

    if (parts.length > 0) {
      newSpecs.size = `${parts.join(" x ")} ${unit} (${partsConverted.join(" x ")} ${otherUnit})`;
    } else {
      newSpecs.size = "";
    }
    setSpecs(newSpecs);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return alert(`Error: Please enter a ${isVendor ? 'Vendor' : 'Machine'} Name.`);
    
    // ⭐️ ROUND 21: Location is strictly required for internal machines, but optional for external vendors
    if (!isVendor && !place.trim()) return alert("Error: Please select a Machine Place/Location.");

    const finalType = type === "Custom" ? customType : type;
    if (!finalType || !finalType.trim()) return alert(`Error: Please select a ${isVendor ? 'Service' : 'Machine'} Type.`);

    setLoading(true);

    const machineData = {
      name: name,
      machineCode: machineCode || name.replace(/\s+/g, '').toLowerCase(), 
      company: company,
      type: finalType,
      place: isVendor ? (place || "External") : place, // Ensure vendors at least get an "External" string if left blank
      status: status,
      specs: specs,
      is_vendor: isVendor, // ⭐️ ROUND 21: Saves the vendor flag to the database
      updated_at: serverTimestamp(),
    };

    try {
      if (editingMachine) {
        await updateDoc(doc(db, "machines", editingMachine.id), machineData);
      } else {
        await addDoc(collection(db, "machines"), { ...machineData, currentLoad: 0, created_at: serverTimestamp() });
      }
      onClose(); 
    } catch (error) {
      alert(`Firebase Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary-500";

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md p-6 shadow-2xl overflow-y-auto max-h-[90vh] custom-scrollbar">
        <h3 className="text-xl font-bold text-white mb-4">
          {editingMachine 
            ? (isVendor ? "Edit Vendor Details" : "Edit Machine") 
            : "Add New Resource"}
        </h3>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* ⭐️ ROUND 21: External Vendor Toggle */}
          <div className="flex items-center gap-3 p-3 bg-purple-900/10 border border-purple-500/20 rounded-lg transition-colors hover:bg-purple-900/20 cursor-pointer" onClick={() => setIsVendor(!isVendor)}>
            <label className="relative inline-flex items-center cursor-pointer pointer-events-none">
              <input type="checkbox" className="sr-only peer" checked={isVendor} readOnly />
              <div className="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-500"></div>
            </label>
            <div>
              <div className="text-sm font-bold text-purple-400">External Vendor (Job Work)</div>
              <div className="text-xs text-gray-500">Toggle if this is an outside contractor.</div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">{isVendor ? 'Vendor / Contractor Name' : 'Machine Name'} *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder={isVendor ? "e.g. ABC Packaging" : "e.g. Die Cutter Alpha"} className={inputClass} />
          </div>

          {/* ⭐️ ROUND 21: Conditional Location Field */}
          {isVendor ? (
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Vendor City / Location (Optional)</label>
              <input type="text" value={place} onChange={e => setPlace(e.target.value)} placeholder="e.g. Mumbai, Maharashtra" className={inputClass} />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Machine Place (Factory) *</label>
              <select 
                value={place} 
                onChange={e => setPlace(e.target.value)} 
                className={inputClass}
              >
                <option value="">{locLoading ? "Loading Locations..." : "-- Select Location --"}</option>
                {locations.filter(l => l.active).map(loc => (
                  <option key={loc.id} value={loc.code}>{loc.name} ({loc.code})</option>
                ))}
                {/* Fallback for legacy text values not yet mapped */}
                {place && !locations.find(l => l.code === place) && (
                  <option value={place}>{place} (Legacy Unmapped)</option>
                )}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Custom {isVendor ? 'Vendor' : 'Machine'} ID / Code</label>
            <input type="text" value={machineCode} onChange={e => setMachineCode(e.target.value)} placeholder="Auto-generated if left blank" className={`${inputClass} border-primary-500/50 text-primary-400 font-mono`} />
          </div>

          {!isVendor && (
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Machine Company / Brand</label>
              <input type="text" value={company} onChange={e => setCompany(e.target.value)} placeholder="e.g. Bobst (Optional)" className={inputClass} />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Primary {isVendor ? 'Service' : 'Machine'} Type *</label>
            <select 
              value={type} 
              onChange={e => { setType(e.target.value); setSpecs({ dimUnit: "in" }); }} 
              className={inputClass}
            >
              <option value="">{procLoading ? "Loading..." : "-- Select Type --"}</option>
              {ALL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              <option value="Custom" className="text-primary-400 font-bold">+ Add Custom Type...</option>
            </select>
            {type === "Custom" && <input type="text" value={customType} onChange={e => setCustomType(e.target.value)} placeholder="Type custom type..." className={`${inputClass} mt-2`} />}
          </div>

          <div className="bg-gray-950/50 p-4 rounded-lg border border-gray-800">
            <h4 className="text-xs font-bold text-primary-400 uppercase tracking-wider mb-3">{isVendor ? 'Vendor Capabilities' : 'Capabilities & Specs'}</h4>
            
            {/* A, B, E: Size (L x W) */}
            {["Sheet Cutting", "Corrugation", "Die Cutting"].includes(type) && (
              <div>
                <label className="block text-sm text-gray-400 mb-2">Max Size (L x W)</label>
                <div className="flex items-center gap-2 mb-2">
                  <input type="number" placeholder="L" value={specs.dimL || ""} onChange={e => handleDimChange('dimL', e.target.value)} className={`${inputClass} px-2 text-center`} />
                  <span className="text-gray-500 text-xs">x</span>
                  <input type="number" placeholder="W" value={specs.dimW || ""} onChange={e => handleDimChange('dimW', e.target.value)} className={`${inputClass} px-2 text-center`} />
                  <select value={specs.dimUnit || "in"} onChange={e => handleDimChange('dimUnit', e.target.value)} className={`${inputClass} px-2 w-auto`}>
                    <option value="in">in</option>
                    <option value="cm">cm</option>
                  </select>
                </div>
                {specs.size && (
                  <div className="text-xs text-primary-300 font-mono bg-primary-900/30 p-2 rounded border border-primary-500/20">
                    <span className="text-gray-500">Calculated:</span><br/>{specs.size}
                  </div>
                )}
              </div>
            )}

            {/* C: Printing -> Colours & Size (L x W) */}
            {type === "Printing" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">No. of Colours</label>
                  <select value={specs.colors || "1"} onChange={e => handleSpecChange('colors', e.target.value)} className={inputClass}>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(num => <option key={num} value={num}>{num} Color{num > 1 ? 's' : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Max Print Size (L x W)</label>
                  <div className="flex items-center gap-2 mb-2">
                    <input type="number" placeholder="L" value={specs.dimL || ""} onChange={e => handleDimChange('dimL', e.target.value)} className={`${inputClass} px-2 text-center`} />
                    <span className="text-gray-500 text-xs">x</span>
                    <input type="number" placeholder="W" value={specs.dimW || ""} onChange={e => handleDimChange('dimW', e.target.value)} className={`${inputClass} px-2 text-center`} />
                    <select value={specs.dimUnit || "in"} onChange={e => handleDimChange('dimUnit', e.target.value)} className={`${inputClass} px-2 w-auto`}>
                      <option value="in">in</option><option value="cm">cm</option>
                    </select>
                  </div>
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
                    <option value="Automatic">Automatic</option>
                  </select>
                </div>
              </div>
            )}

            {/* F: Pasting -> Mode (Manual Only) */}
            {type === "Pasting" && (
              <div>
                <label className="block text-sm text-gray-400 mb-1">Mode</label>
                <select value={specs.mode || "Manual"} onChange={e => handleSpecChange('mode', e.target.value)} className={inputClass}>
                  <option value="Manual">Manual</option>
                </select>
              </div>
            )}

            {/* G: Gluing -> Mode (Manual or Automatic) */}
            {type === "Gluing" && (
              <div>
                <label className="block text-sm text-gray-400 mb-1">Mode</label>
                <select value={specs.mode || "Manual"} onChange={e => handleSpecChange('mode', e.target.value)} className={inputClass}>
                  <option value="Manual">Manual</option>
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

            {/* Fallback Message */}
            {!["Sheet Cutting", "Corrugation", "Die Cutting", "Printing", "Lamination", "Pasting", "Gluing", "Side Pasting"].includes(type) && (
              <p className="text-xs text-gray-500 italic mt-1">No additional specifications required for this process type.</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1 mt-4">{isVendor ? 'Vendor Status' : 'Operational Status'}</label>
            <select value={status} onChange={e => setStatus(e.target.value)} className={inputClass}>
              <option value="Online">Online / Available</option>
              <option value="Maintenance">Maintenance / Busy</option>
              <option value="Offline">Offline / Unavailable</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 mt-8">
            <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-lg text-gray-400 hover:bg-gray-800 transition-colors">Cancel</button>
            <button type="submit" disabled={loading} className="bg-primary-600 hover:bg-primary-500 text-white px-5 py-2.5 rounded-lg font-medium shadow-lg">
              {loading ? "Saving..." : (isVendor ? "Save Vendor" : "Save Machine")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}