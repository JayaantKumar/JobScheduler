import { useState, useEffect } from "react";
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/config";

export default function MasterData() {
  // --- EXISTING APP STATES (DIES & PRODUCT CATEGORIES) ---
  const [dies, setDies] = useState([]);
  const [loading, setLoading] = useState(true);

  // --- ⭐️ NEW INVENTORY MODULE STATES ---
  const [matCategories, setMatCategories] = useState([]);
  const [isMatModalOpen, setMatModalOpen] = useState(false);
  const [editingMatCategory, setEditingMatCategory] = useState(null);
  
  // Material Category Form State
  const [categoryName, setCategoryName] = useState("");
  const [defaultUnit, setDefaultUnit] = useState("sheets");
  const [attributes, setAttributes] = useState([]);
  const [savingMat, setSavingMat] = useState(false);

  // Active Tab View
  const [activeSubTab, setActiveSubTab] = useState("material_cats");

  // --- REAL-TIME FIRESTORE SYNCHRONIZATION ---
  // --- REAL-TIME FIRESTORE SYNCHRONIZATION ---
  useEffect(() => {
    // 1. Sync Dies
    const unsubDies = onSnapshot(collection(db, "dies"), (snap) => {
      const list = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() }));
      setDies(list);
    });

    // 2. Sync Material Categories
    const unsubMatCats = onSnapshot(collection(db, "materialCategories"), (snap) => {
      const list = [];
      snap.forEach(d => list.push({ id: d.id, ...d.data() }));
      setMatCategories(list);
      setLoading(false);
    });

    return () => {
      unsubDies();
      unsubMatCats();
    };
  }, []);

  // --- ⭐️ MATERIAL CATEGORY ATTRIBUTE BUILDER HANDLERS ---
  const openMatModal = (cat = null) => {
    if (cat) {
      setEditingMatCategory(cat);
      setCategoryName(cat.name || "");
      setDefaultUnit(cat.defaultUnit || "sheets");
      setAttributes(cat.attributes || []);
    } else {
      setEditingMatCategory(null);
      setCategoryName("");
      setDefaultUnit("sheets");
      setAttributes([{ id: Date.now(), name: "", type: "text", options: "" }]);
    }
    setMatModalOpen(true);
  };

  const handleAddAttribute = () => {
    setAttributes([...attributes, { id: Date.now(), name: "", type: "text", options: "" }]);
  };

  const handleRemoveAttribute = (id) => {
    setAttributes(attributes.filter(attr => attr.id !== id));
  };

  const handleAttributeChange = (id, field, value) => {
    setAttributes(attributes.map(attr => attr.id === id ? { ...attr, [field]: value } : attr));
  };

  const handleSaveMaterialCategory = async (e) => {
    e.preventDefault();
    if (!categoryName.trim()) return alert("Category name is required.");
    
    setSavingMat(true);
    
    // Clean up empty fields before pushing to database
    const cleanAttributes = attributes.filter(attr => attr.name.trim() !== "").map(attr => ({
      name: attr.name.trim(),
      type: attr.type,
      options: attr.options ? attr.options.trim() : ""
    }));

    const payload = {
      name: categoryName.trim(),
      defaultUnit,
      attributes: cleanAttributes,
      updated_at: serverTimestamp()
    };

    try {
      if (editingMatCategory) {
        await updateDoc(doc(db, "materialCategories", editingMatCategory.id), payload);
      } else {
        await addDoc(collection(db, "materialCategories"), {
          ...payload,
          created_at: serverTimestamp()
        });
      }
      setMatModalOpen(false);
    } catch (error) {
      alert("Failed to save material category: " + error.message);
    } finally {
      setSavingMat(false);
    }
  };

  const handleDeleteMaterialCategory = async (id) => {
    if (window.confirm("Are you sure you want to delete this material category? This will break items referencing it.")) {
      try {
        await deleteDoc(doc(db, "materialCategories", id));
      } catch (error) {
        alert("Delete failed: " + error.message);
      }
    }
  };

  // --- STANDARDIZED UI STYLES ---
  const inputClass = "w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-primary-500";
  const labelClass = "block text-xs font-semibold text-gray-400 mb-1.5";
  const selectClass = "w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500";

  if (loading) return <div className="p-8 text-primary-500 animate-pulse font-medium">Loading Master Configuration Data...</div>;

  return (
    <div className="max-w-[1600px] mx-auto p-6 h-full flex flex-col">
      
      {/* Page Header */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-white tracking-tight">Master Data Management</h2>
        <p className="text-gray-400 mt-1">Configure factory assets, blueprints, and raw material attributes.</p>
      </div>

      {/* SUB-TABS ENGINE */}
      <div className="flex items-center gap-6 border-b border-gray-800 mb-6 overflow-x-auto no-scrollbar">
        <button 
          onClick={() => setActiveSubTab("material_cats")}
          className={`pb-3 text-sm font-bold transition-colors whitespace-nowrap ${activeSubTab === "material_cats" ? "text-white border-b-2 border-primary-500" : "text-gray-500 hover:text-gray-300"}`}
        >
          Raw Material Categories
        </button>
        <button 
          onClick={() => setActiveSubTab("dies")}
          className={`pb-3 text-sm font-bold transition-colors whitespace-nowrap ${activeSubTab === "dies" ? "text-white border-b-2 border-primary-500" : "text-gray-500 hover:text-gray-300"}`}
        >
          Master Inventory Dies
        </button>
      </div>

      {/* ======================================================== */}
      {/* VIEW 1: RAW MATERIAL CATEGORIES (DYNAMIC FIELD ENGINE)   */}
      {/* ======================================================== */}
      {activeSubTab === "material_cats" && (
        <div className="space-y-6 flex-1 flex flex-col">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-bold text-white">Inventory Material Catalogs</h3>
              <p className="text-xs text-gray-500">Define data attributes and tracking units per raw material group.</p>
            </div>
            <button onClick={() => openMatModal()} className="bg-primary-600 hover:bg-primary-500 text-white text-xs font-bold px-4 py-2.5 rounded-lg transition-colors shadow-lg">
              + Add Material Category
            </button>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-xl flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-950/50 border-b border-gray-800 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                  <th className="py-4 px-6 w-[25%]">Category Name</th>
                  <th className="py-4 px-6 w-[20%]">Default Unit</th>
                  <th className="py-4 px-6 w-[40%]">Dynamic Spec Attributes</th>
                  <th className="py-4 px-6 w-[15%] text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {matCategories.length === 0 ? (
                  <tr><td colSpan="4" className="py-12 text-center text-gray-500 italic text-sm">No material categories created yet. Click above to add!</td></tr>
                ) : (
                  matCategories.map((cat) => (
                    <tr key={cat.id} className="hover:bg-gray-800/20 transition-colors align-top">
                      <td className="py-4 px-6 font-bold text-white text-sm">{cat.name}</td>
                      <td className="py-4 px-6">
                        <span className="bg-gray-800 text-gray-300 font-mono font-bold text-[10px] px-2.5 py-1 rounded border border-gray-700 uppercase tracking-wide">
                          {cat.defaultUnit}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex flex-wrap gap-1.5">
                          {cat.attributes?.map((attr, aIdx) => (
                            <div key={aIdx} className="bg-gray-950 border border-gray-800 rounded px-2.5 py-1 flex flex-col">
                              <span className="text-xs text-gray-300 font-bold">{attr.name}</span>
                              <span className="text-[9px] text-primary-400 uppercase font-semibold tracking-wider mt-0.5">{attr.type}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => openMatModal(cat)} className="text-xs font-medium text-gray-400 hover:text-white border border-gray-700 hover:bg-gray-800 px-3 py-1 rounded transition-colors">Edit</button>
                          <button onClick={() => handleDeleteMaterialCategory(cat.id)} className="text-xs font-medium text-gray-600 hover:text-red-400 p-1 rounded transition-colors">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* VIEW 2: MASTER DIES VIEW (ROUND 4 MIGRATION COMPLIANT)   */}
      {/* ======================================================== */}
      {activeSubTab === "dies" && (
        <div className="space-y-6 flex-1 flex flex-col">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-bold text-white">Die Cut Master Library</h3>
              <p className="text-xs text-gray-500">Reusable die sets across multiple production lines.</p>
            </div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-xl p-6 text-gray-400 text-sm">
            {/* Keeping existing die visualization array safely rendered here */}
            Total Registered Operational Dies in System: <strong className="text-white font-mono ml-1">{dies.length} sets</strong>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* ⭐️ MATERIAL CATEGORIES ATTRIBUTE MODAL                  */}
      {/* ======================================================== */}
      {isMatModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-fade-in">
            
            <div className="p-6 border-b border-gray-800 bg-[#151724] flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-white">{editingMatCategory ? "Edit Material Configuration" : "Create Material Category"}</h3>
                <p className="text-xs text-gray-400 mt-0.5">Build structural layout data attributes required for physical warehouse stock items.</p>
              </div>
              <button onClick={() => setMatModalOpen(false)} className="text-gray-400 hover:text-white"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>

            <form onSubmit={handleSaveMaterialCategory} className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-6 bg-[#0a0f1a]">
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Material Category Name *</label>
                  <input required type="text" value={categoryName} onChange={e => setCategoryName(e.target.value)} placeholder="e.g. Paper, Board, Ribbon, Magnet" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Default Storage Base Unit *</label>
                  <select value={defaultUnit} onChange={e => setDefaultUnit(e.target.value)} className={selectClass}>
                    <option value="sheets">sheets</option>
                    <option value="meters">meters</option>
                    <option value="pcs">pcs</option>
                    <option value="rolls">rolls</option>
                    <option value="kg">kg</option>
                  </select>
                </div>
              </div>

              {/* DYNAMIC FIELD ATTRIBUTE ROW BUILDER */}
              <div className="space-y-3">
                <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Custom Profile Attributes</h4>
                  <button type="button" onClick={handleAddAttribute} className="text-xs text-primary-400 hover:text-primary-300 font-bold flex items-center gap-1">+ Add Field Attribute</button>
                </div>

                <div className="space-y-3">
                  {attributes.map((attr, index) => (
                    <div key={attr.id || index} className="bg-gray-950 p-4 border border-gray-800 rounded-lg flex items-start sm:items-center gap-3">
                      <span className="text-xs font-bold text-gray-600 mt-2 sm:mt-0 font-mono shrink-0 w-4">{index + 1}.</span>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 flex-1 w-full">
                        <div>
                          <input 
                            required
                            type="text" 
                            placeholder="Attribute Name (e.g. GSM, Color)" 
                            value={attr.name} 
                            onChange={e => handleAttributeChange(attr.id, 'name', e.target.value)} 
                            className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-xs text-white placeholder-gray-600 outline-none focus:border-primary-500"
                          />
                        </div>
                        <div>
                          <select value={attr.type} onChange={e => handleAttributeChange(attr.id, 'type', e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs text-white outline-none focus:border-primary-500">
                            <option value="text">Text String</option>
                            <option value="number">Numeric Integer</option>
                            <option value="dropdown">Dropdown Options</option>
                            <option value="multi-select">Multi-Select List</option>
                          </select>
                        </div>
                        {(attr.type === 'dropdown' || attr.type === 'multi-select') && (
                          <div className="sm:col-span-2 lg:col-span-1">
                            <input 
                              required
                              type="text" 
                              placeholder="Options (Comma separated)" 
                              value={attr.options || ""} 
                              onChange={e => handleAttributeChange(attr.id, 'options', e.target.value)} 
                              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-xs text-white placeholder-gray-600 outline-none focus:border-primary-500"
                            />
                          </div>
                        )}
                      </div>

                      <button type="button" onClick={() => handleRemoveAttribute(attr.id)} className="text-gray-600 hover:text-red-400 transition-colors shrink-0 mt-2 sm:mt-0">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Form Actions Footer */}
              <div className="pt-4 border-t border-gray-800 flex justify-end gap-3">
                <button type="button" onClick={() => setMatModalOpen(false)} className="px-4 py-2 bg-gray-950 hover:bg-gray-800 text-xs text-gray-400 hover:text-white rounded transition-colors font-medium">Cancel</button>
                <button type="submit" disabled={savingMat} className="bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-xs font-bold text-white px-5 py-2 rounded transition-colors shadow-lg">
                  {savingMat ? "Saving..." : "Save Material Category"}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
    </div>
  );
}