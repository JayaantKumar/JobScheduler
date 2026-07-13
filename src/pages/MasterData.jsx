import { useState, useEffect } from "react";
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, serverTimestamp, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase/config";

export default function MasterData() {
  const [loading, setLoading] = useState(true);

  // --- EXISTING APP STATES ---
  const [dies, setDies] = useState([]);
  
  // RESTORED MASTER DATA STATES
  const [customers, setCustomers] = useState([]);
  const [productCategories, setProductCategories] = useState([]);
  const [rates, setRates] = useState([]);
  const [machines, setMachines] = useState([]); // Needed for Die assignments

  // --- INVENTORY MODULE STATES ---
  const [matCategories, setMatCategories] = useState([]);
  const [isMatModalOpen, setMatModalOpen] = useState(false);
  const [editingMatCategory, setEditingMatCategory] = useState(null);
  const [categoryName, setCategoryName] = useState("");
  const [defaultUnit, setDefaultUnit] = useState("sheets");
  const [attributes, setAttributes] = useState([]);
  const [savingMat, setSavingMat] = useState(false);

  // --- GENERIC MODAL FOR RESTORED TABS ---
  const [genericModal, setGenericModal] = useState({ isOpen: false, type: "", editId: null, name: "", extraValue: "" });
  const [savingGeneric, setSavingGeneric] = useState(false);

  // --- ⭐️ ROUND 6.2: DIE REGISTER MODAL STATE ---
  const [isDieModalOpen, setDieModalOpen] = useState(false);
  const [editingDie, setEditingDie] = useState(null);
  const [dieForm, setDieForm] = useState({
    dieNumber: "", dieName: "", dieSize: "", dieUps: "", dieCustomer: "", dieMachine: "", dieNotes: "", dieActive: true
  });

  // --- INLINE CONFIRM/ALERT UI ---
  const [confirmConfig, setConfirmConfig] = useState(null);

  // Active Tab View
  const [activeSubTab, setActiveSubTab] = useState("material_cats");

  // --- REAL-TIME FIRESTORE SYNCHRONIZATION ---
  useEffect(() => {
    const unsubDies = onSnapshot(collection(db, "dies"), snap => setDies(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubMatCats = onSnapshot(collection(db, "materialCategories"), snap => setMatCategories(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubCust = onSnapshot(collection(db, "customers"), snap => setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubProdCats = onSnapshot(collection(db, "productCategories"), snap => setProductCategories(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubMachines = onSnapshot(collection(db, "machines"), snap => setMachines(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    
    const unsubRates = onSnapshot(collection(db, "rates"), snap => {
      setRates(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    return () => {
      unsubDies(); unsubMatCats(); unsubCust(); unsubProdCats(); unsubMachines(); unsubRates();
    };
  }, []);

  // --- MATERIAL CATEGORY HANDLERS ---
  const openMatModal = (cat = null) => {
    if (cat) {
      setEditingMatCategory(cat); setCategoryName(cat.name || ""); setDefaultUnit(cat.defaultUnit || "sheets"); setAttributes(cat.attributes || []);
    } else {
      setEditingMatCategory(null); setCategoryName(""); setDefaultUnit("sheets"); setAttributes([{ id: Date.now(), name: "", type: "text", options: "" }]);
    }
    setMatModalOpen(true);
  };

  const handleAddAttribute = () => setAttributes([...attributes, { id: Date.now(), name: "", type: "text", options: "" }]);
  const handleRemoveAttribute = (id) => setAttributes(attributes.filter(attr => attr.id !== id));
  const handleAttributeChange = (id, field, value) => setAttributes(attributes.map(attr => attr.id === id ? { ...attr, [field]: value } : attr));

  const handleSaveMaterialCategory = async (e) => {
    e.preventDefault();
    if (!categoryName.trim()) return;
    setSavingMat(true);
    const cleanAttributes = attributes.filter(attr => attr.name.trim() !== "").map(attr => ({ name: attr.name.trim(), type: attr.type, options: attr.options ? attr.options.trim() : "" }));
    const payload = { name: categoryName.trim(), defaultUnit, attributes: cleanAttributes, updated_at: serverTimestamp() };

    try {
      if (editingMatCategory) await updateDoc(doc(db, "materialCategories", editingMatCategory.id), payload);
      else await addDoc(collection(db, "materialCategories"), { ...payload, created_at: serverTimestamp() });
      setMatModalOpen(false);
    } catch (error) { alert("Failed to save: " + error.message); } 
    finally { setSavingMat(false); }
  };

  const handleDeleteMaterialCategory = async (cat) => {
    try {
      const q = query(collection(db, "inventoryItems"), where("categoryId", "==", cat.id));
      const snap = await getDocs(q);

      if (!snap.empty) {
        setConfirmConfig({
          isOpen: true,
          title: "Cannot Delete Category",
          message: `This category is currently in use. Please delete or move its ${snap.size} items first before deleting the category.`,
          isAlertOnly: true,
          onConfirm: () => setConfirmConfig(null)
        });
        return;
      }

      setConfirmConfig({
        isOpen: true,
        title: "Delete Material Category",
        message: `Are you sure you want to permanently delete the "${cat.name}" category?`,
        isDanger: true,
        confirmText: "Delete",
        onConfirm: async () => {
          setConfirmConfig(null);
          await deleteDoc(doc(db, "materialCategories", cat.id));
        },
        onCancel: () => setConfirmConfig(null)
      });
    } catch (error) {
      console.error("Error checking category usage:", error);
    }
  };

  // --- ⭐️ ROUND 6.2: MASTER DIES HANDLERS ---
  const openDieModal = (die = null) => {
    if (die) {
      setEditingDie(die);
      setDieForm({
        dieNumber: die.dieNumber || "", dieName: die.dieName || "", dieSize: die.dieSize || "", 
        dieUps: die.dieUps || "", dieCustomer: die.dieCustomer || "", dieMachine: die.dieMachine || "", 
        dieNotes: die.dieNotes || "", dieActive: die.dieActive ?? true
      });
    } else {
      setEditingDie(null);
      setDieForm({
        dieNumber: "", dieName: "", dieSize: "", dieUps: "", dieCustomer: "", dieMachine: "", dieNotes: "", dieActive: true
      });
    }
    setDieModalOpen(true);
  };

  const handleSaveDie = async (e) => {
    e.preventDefault();
    if (!dieForm.dieNumber.trim()) return;
    setSavingGeneric(true);
    try {
      const payload = { ...dieForm, updated_at: serverTimestamp() };
      if (editingDie) {
        await updateDoc(doc(db, "dies", editingDie.id), payload);
      } else {
        await addDoc(collection(db, "dies"), { ...payload, created_at: serverTimestamp() });
      }
      setDieModalOpen(false);
    } catch (err) { alert("Failed to save die: " + err.message); }
    finally { setSavingGeneric(false); }
  };

  const handleDeleteDie = async (die) => {
    try {
      // 1. Deep scan the products collection to see if this die number is referenced in any routing
      const prodSnap = await getDocs(collection(db, "products"));
      let isUsed = false;
      prodSnap.forEach(d => {
        const p = d.data();
        p.parts?.forEach(part => {
          part.sequence?.forEach(seq => {
            if (seq.process_details) {
              Object.values(seq.process_details).forEach(val => {
                if (val === die.dieNumber) isUsed = true;
              });
            }
          });
        });
      });

      if (isUsed) {
        setConfirmConfig({
          isOpen: true,
          title: "Cannot Delete Die",
          message: `The die "${die.dieNumber}" is currently referenced in one or more Product Templates. You must remove it from the product routing before it can be deleted.`,
          isAlertOnly: true,
          onConfirm: () => setConfirmConfig(null)
        });
        return;
      }

      // 2. If safe, confirm deletion
      setConfirmConfig({
        isOpen: true,
        title: "Delete Master Die",
        message: `Are you sure you want to permanently delete Die ${die.dieNumber}?`,
        isDanger: true,
        confirmText: "Delete Die",
        onConfirm: async () => {
          setConfirmConfig(null);
          await deleteDoc(doc(db, "dies", die.id));
        },
        onCancel: () => setConfirmConfig(null)
      });
    } catch (error) {
      console.error("Error checking die usage:", error);
    }
  };

  // --- GENERIC HANDLERS FOR RESTORED TABS ---
  const openGenericModal = (type, item = null) => {
    setGenericModal({
      isOpen: true, type: type, editId: item ? item.id : null, name: item ? item.name : "", extraValue: item && item.value ? item.value : ""
    });
  };

  const handleSaveGeneric = async (e) => {
    e.preventDefault();
    setSavingGeneric(true);
    const { type, editId, name, extraValue } = genericModal;
    
    let collectionName = "";
    if (type === "Customer") collectionName = "customers";
    else if (type === "Product Category") collectionName = "productCategories";
    else if (type === "Rate") collectionName = "rates";

    const payload = { name: name.trim(), updated_at: serverTimestamp() };
    if (type === "Rate") payload.value = extraValue.trim();

    try {
      if (editId) await updateDoc(doc(db, collectionName, editId), payload);
      else await addDoc(collection(db, collectionName), { ...payload, created_at: serverTimestamp() });
      setGenericModal({ ...genericModal, isOpen: false });
    } catch (err) { alert("Failed to save: " + err.message); }
    finally { setSavingGeneric(false); }
  };

  const handleDeleteGeneric = (type, id, itemName) => {
    let collectionName = "";
    if (type === "Customer") collectionName = "customers";
    else if (type === "Product Category") collectionName = "productCategories";
    else if (type === "Rate") collectionName = "rates";

    setConfirmConfig({
      isOpen: true, title: `Delete ${type}`, message: `Are you sure you want to delete ${itemName}?`, isDanger: true, confirmText: "Delete",
      onConfirm: async () => { setConfirmConfig(null); await deleteDoc(doc(db, collectionName, id)); },
      onCancel: () => setConfirmConfig(null)
    });
  };

  // --- UI STYLES ---
  const inputClass = "w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-primary-500";
  const labelClass = "block text-xs font-semibold text-gray-400 mb-1.5";
  const selectClass = "w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500";

  if (loading) return <div className="p-8 text-primary-500 animate-pulse font-medium">Loading Master Configuration Data...</div>;

  return (
    <div className="max-w-[1600px] mx-auto p-6 h-full flex flex-col relative">
      
      {/* INLINE CONFIRM/ALERT MODAL */}
      {confirmConfig && confirmConfig.isOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-fade-in">
            <div className="p-6">
              <h3 className="text-xl font-bold text-white mb-2">{confirmConfig.title}</h3>
              <p className="text-sm text-gray-300 leading-relaxed mb-8">{confirmConfig.message}</p>
              <div className="flex justify-end gap-3">
                {!confirmConfig.isAlertOnly && (
                  <button onClick={confirmConfig.onCancel} className="px-5 py-2.5 text-gray-400 hover:text-white transition-colors font-medium bg-gray-800 rounded-lg">Cancel</button>
                )}
                <button onClick={confirmConfig.onConfirm} className={`px-6 py-2.5 rounded-lg font-bold text-white transition-colors shadow-lg ${confirmConfig.isDanger ? 'bg-red-600 hover:bg-red-500' : 'bg-primary-600 hover:bg-primary-500'}`}>
                  {confirmConfig.confirmText || "OK"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-white tracking-tight">Master Data Management</h2>
        <p className="text-gray-400 mt-1">Configure factory assets, blueprints, categories, and raw material attributes.</p>
      </div>

      {/* SUB-TABS ENGINE */}
      <div className="flex items-center gap-6 border-b border-gray-800 mb-6 overflow-x-auto no-scrollbar">
        {["material_cats", "dies", "customers", "product_cats", "rates"].map(tab => {
          const labels = {
            material_cats: "Raw Material Categories",
            dies: "Master Inventory Dies",
            customers: "Customers",
            product_cats: "Product Categories",
            rates: "Machine Rates"
          };
          return (
            <button 
              key={tab}
              onClick={() => setActiveSubTab(tab)}
              className={`pb-3 text-sm font-bold transition-colors whitespace-nowrap ${activeSubTab === tab ? "text-white border-b-2 border-primary-500" : "text-gray-500 hover:text-gray-300"}`}
            >
              {labels[tab]}
            </button>
          );
        })}
      </div>

      {/* ======================================================== */}
      {/* VIEW 1: RAW MATERIAL CATEGORIES */}
      {/* ======================================================== */}
      {activeSubTab === "material_cats" && (
        <div className="space-y-6 flex-1 flex flex-col">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-bold text-white">Inventory Material Catalogs</h3>
            </div>
            <button onClick={() => openMatModal()} className="bg-primary-600 hover:bg-primary-500 text-white text-xs font-bold px-4 py-2.5 rounded-lg transition-colors shadow-lg">+ Add Material Category</button>
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
                      <td className="py-4 px-6"><span className="bg-gray-800 text-gray-300 font-mono font-bold text-[10px] px-2.5 py-1 rounded border border-gray-700 uppercase tracking-wide">{cat.defaultUnit}</span></td>
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
                          <button onClick={() => handleDeleteMaterialCategory(cat)} className="text-xs font-medium text-gray-600 hover:text-red-400 p-1 rounded transition-colors">Delete</button>
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
      {/* ⭐️ ROUND 6.2: RESTORED MASTER DIES VIEW */}
      {/* ======================================================== */}
      {activeSubTab === "dies" && (
        <div className="space-y-6 flex-1 flex flex-col">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-bold text-white">Die Cut Master Library</h3>
              <p className="text-xs text-gray-500">Reusable die sets across multiple production lines.</p>
            </div>
            <button onClick={() => openDieModal()} className="bg-primary-600 hover:bg-primary-500 text-white text-xs font-bold px-4 py-2.5 rounded-lg transition-colors shadow-lg">+ Add Master Die</button>
          </div>
          
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-xl flex-1">
            <div className="bg-gray-950/40 p-4 border-b border-gray-800 text-sm text-gray-400">
              Total Registered Operational Dies in System: <strong className="text-white font-mono ml-1">{dies.length} sets</strong>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[900px]">
                <thead>
                  <tr className="bg-gray-950/50 border-b border-gray-800 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                    <th className="py-4 px-6 w-[20%]">Die Number & Name</th>
                    <th className="py-4 px-6 w-[20%]">Specs (Size / Ups)</th>
                    <th className="py-4 px-6 w-[25%]">Assignments (Cust / Mach)</th>
                    <th className="py-4 px-6 w-[10%] text-center">Status</th>
                    <th className="py-4 px-6 w-[25%] text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {dies.length === 0 ? (
                    <tr><td colSpan="5" className="py-12 text-center text-gray-500 italic text-sm">No dies registered in the system.</td></tr>
                  ) : (
                    dies.map((die) => (
                      <tr key={die.id} className={`hover:bg-gray-800/20 transition-colors ${!die.dieActive ? 'opacity-50' : ''}`}>
                        <td className="py-4 px-6">
                          <div className="font-bold text-primary-400 text-sm font-mono">{die.dieNumber}</div>
                          <div className="text-xs text-gray-300 mt-1">{die.dieName || "Unnamed Die"}</div>
                        </td>
                        <td className="py-4 px-6">
                          <div className="text-xs text-gray-300 font-medium">{die.dieSize || "N/A"}</div>
                          {die.dieUps && <div className="text-[10px] text-gray-500 uppercase font-bold mt-1">{die.dieUps} Ups</div>}
                        </td>
                        <td className="py-4 px-6">
                          <div className="text-xs text-gray-400">{die.dieCustomer || "No Customer Linked"}</div>
                          <div className="text-[10px] text-gray-500 mt-1">{machines.find(m => m.id === die.dieMachine)?.name || "Any Machine"}</div>
                        </td>
                        <td className="py-4 px-6 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${die.dieActive ? 'bg-green-500/10 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
                            {die.dieActive ? 'Active' : 'Archived'}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-right">
                          <div className="flex justify-end gap-2 items-center">
                            <button onClick={() => openDieModal(die)} className="text-xs font-medium text-gray-400 hover:text-white border border-gray-700 hover:bg-gray-800 px-3 py-1 rounded transition-colors">Edit</button>
                            <button onClick={() => handleDeleteDie(die)} className="text-xs font-medium text-gray-600 hover:text-red-400 p-1 rounded transition-colors">Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* RESTORED VIEWS: CUSTOMERS, PRODUCT CATS, RATES */}
      {/* ======================================================== */}
      {["customers", "product_cats", "rates"].includes(activeSubTab) && (() => {
        let type = "";
        let dataList = [];
        let hasExtra = false;
        
        if (activeSubTab === "customers") { type = "Customer"; dataList = customers; }
        if (activeSubTab === "product_cats") { type = "Product Category"; dataList = productCategories; }
        if (activeSubTab === "rates") { type = "Rate"; dataList = rates; hasExtra = true; }

        return (
          <div className="space-y-6 flex-1 flex flex-col">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-white">
                Manage {type === "Product Category" ? "Product Categories" : `${type}s`}
              </h3>
              <button onClick={() => openGenericModal(type)} className="bg-primary-600 hover:bg-primary-500 text-white text-xs font-bold px-4 py-2.5 rounded-lg transition-colors shadow-lg">+ Add {type}</button>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-xl flex-1">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-950/50 border-b border-gray-800 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                    <th className="py-4 px-6">{type} Name</th>
                    {hasExtra && <th className="py-4 px-6">Value / Details</th>}
                    <th className="py-4 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {dataList.length === 0 ? (
                    <tr>
                      <td colSpan="3" className="py-12 text-center text-gray-500 italic text-sm">
                        No {type === "Product Category" ? "product categories" : `${type.toLowerCase()}s`} found.
                      </td>
                    </tr>
                  ) : (
                    dataList.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-800/20 transition-colors">
                        <td className="py-4 px-6 font-bold text-white text-sm">{item.name}</td>
                        {hasExtra && <td className="py-4 px-6 text-sm text-gray-300">{item.value}</td>}
                        <td className="py-4 px-6 text-right">
                          <div className="flex justify-end gap-2">
                            <button onClick={() => openGenericModal(type, item)} className="text-xs font-medium text-gray-400 hover:text-white border border-gray-700 hover:bg-gray-800 px-3 py-1 rounded transition-colors">Edit</button>
                            <button onClick={() => handleDeleteGeneric(type, item.id, item.name)} className="text-xs font-medium text-gray-600 hover:text-red-400 p-1 rounded transition-colors">Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* ======================================================== */}
      {/* ⭐️ ROUND 6.2: DIE CRUD MODAL */}
      {/* ======================================================== */}
      {isDieModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-fade-in">
            <div className="p-6 border-b border-gray-800 bg-[#151724]">
              <h3 className="text-lg font-bold text-white">{editingDie ? "Edit Master Die" : "Register New Die"}</h3>
            </div>
            <form onSubmit={handleSaveDie} className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-5 bg-[#0a0f1a]">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className={labelClass}>Die Number / ID *</label><input required type="text" value={dieForm.dieNumber} onChange={e => setDieForm({...dieForm, dieNumber: e.target.value})} className={`${inputClass} font-mono`} placeholder="e.g. DIE-102A" /></div>
                <div><label className={labelClass}>Die Name / Description</label><input type="text" value={dieForm.dieName} onChange={e => setDieForm({...dieForm, dieName: e.target.value})} className={inputClass} placeholder="e.g. Master Carton Outer" /></div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className={labelClass}>Die Size Specs</label><input type="text" value={dieForm.dieSize} onChange={e => setDieForm({...dieForm, dieSize: e.target.value})} className={inputClass} placeholder="L x W x H" /></div>
                <div><label className={labelClass}>Ups on Die (Optional)</label><input type="number" value={dieForm.dieUps} onChange={e => setDieForm({...dieForm, dieUps: e.target.value})} className={inputClass} placeholder="e.g. 4" /></div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-gray-800 pt-4">
                <div>
                  <label className={labelClass}>Customer Specific (Optional)</label>
                  <select value={dieForm.dieCustomer} onChange={e => setDieForm({...dieForm, dieCustomer: e.target.value})} className={selectClass}>
                    <option value="">-- No specific customer --</option>
                    {customers.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Default Target Machine (Optional)</label>
                  <select value={dieForm.dieMachine} onChange={e => setDieForm({...dieForm, dieMachine: e.target.value})} className={selectClass}>
                    <option value="">-- Any compatible machine --</option>
                    {machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="border-t border-gray-800 pt-4">
                <label className={labelClass}>Additional Notes</label>
                <textarea rows="2" value={dieForm.dieNotes} onChange={e => setDieForm({...dieForm, dieNotes: e.target.value})} className={`${inputClass} resize-none`} placeholder="Tooling details, location, condition..."></textarea>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={dieForm.dieActive} onChange={e => setDieForm({...dieForm, dieActive: e.target.checked})} className="rounded bg-gray-900 border-gray-700 w-4 h-4 text-primary-600 focus:ring-primary-500" />
                  <span className="text-sm font-medium text-gray-300">Die is Active and operational</span>
                </label>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-gray-800">
                <button type="button" onClick={() => setDieModalOpen(false)} className="px-4 py-2 bg-gray-950 hover:bg-gray-800 text-xs text-gray-400 hover:text-white rounded transition-colors font-medium">Cancel</button>
                <button type="submit" disabled={savingGeneric} className="bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-xs font-bold text-white px-5 py-2 rounded transition-colors shadow-lg">
                  {savingGeneric ? "Saving..." : "Save Master Die"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GENERIC ADD/EDIT MODAL (Customers, Product Cats, Rates) */}
      {genericModal.isOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md flex flex-col shadow-2xl overflow-hidden animate-fade-in">
            <div className="p-6 border-b border-gray-800 bg-[#151724]">
              <h3 className="text-lg font-bold text-white">{genericModal.editId ? "Edit" : "Add"} {genericModal.type}</h3>
            </div>
            <form onSubmit={handleSaveGeneric} className="p-6 space-y-4 bg-[#0a0f1a]">
              <div>
                <label className={labelClass}>{genericModal.type} Name *</label>
                <input required type="text" value={genericModal.name} onChange={e => setGenericModal({...genericModal, name: e.target.value})} className={inputClass} placeholder={`Enter ${genericModal.type.toLowerCase()} name`} />
              </div>
              {genericModal.type === "Rate" && (
                <div>
                  <label className={labelClass}>Value / Rate Details</label>
                  <input type="text" value={genericModal.extraValue} onChange={e => setGenericModal({...genericModal, extraValue: e.target.value})} className={inputClass} placeholder="e.g. 500 per 1000" />
                </div>
              )}
              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setGenericModal({...genericModal, isOpen: false})} className="px-4 py-2 bg-gray-950 hover:bg-gray-800 text-xs text-gray-400 hover:text-white rounded transition-colors font-medium">Cancel</button>
                <button type="submit" disabled={savingGeneric} className="bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-xs font-bold text-white px-5 py-2 rounded transition-colors shadow-lg">
                  {savingGeneric ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MATERIAL CATEGORIES ATTRIBUTE MODAL */}
      {isMatModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-fade-in">
            <div className="p-6 border-b border-gray-800 bg-[#151724] flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-white">{editingMatCategory ? "Edit Material Configuration" : "Create Material Category"}</h3>
              </div>
            </div>
            <form onSubmit={handleSaveMaterialCategory} className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-6 bg-[#0a0f1a]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className={labelClass}>Material Category Name *</label><input required type="text" value={categoryName} onChange={e => setCategoryName(e.target.value)} className={inputClass} /></div>
                <div>
                  <label className={labelClass}>Default Storage Base Unit *</label>
                  <select value={defaultUnit} onChange={e => setDefaultUnit(e.target.value)} className={selectClass}>
                    <option value="sheets">sheets</option><option value="meters">meters</option><option value="pcs">pcs</option><option value="rolls">rolls</option><option value="kg">kg</option>
                  </select>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Custom Profile Attributes</h4>
                  <button type="button" onClick={handleAddAttribute} className="text-xs text-primary-400 hover:text-primary-300 font-bold flex items-center gap-1">+ Add Field</button>
                </div>
                <div className="space-y-3">
                  {attributes.map((attr, index) => (
                    <div key={attr.id || index} className="bg-gray-950 p-4 border border-gray-800 rounded-lg flex items-start sm:items-center gap-3">
                      <span className="text-xs font-bold text-gray-600 mt-2 sm:mt-0 font-mono shrink-0 w-4">{index + 1}.</span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 flex-1 w-full">
                        <div><input required type="text" placeholder="Name" value={attr.name} onChange={e => handleAttributeChange(attr.id, 'name', e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-xs text-white outline-none focus:border-primary-500" /></div>
                        <div>
                          <select value={attr.type} onChange={e => handleAttributeChange(attr.id, 'type', e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs text-white outline-none focus:border-primary-500">
                            <option value="text">Text String</option><option value="number">Numeric Integer</option><option value="dropdown">Dropdown</option><option value="multi-select">Multi-Select</option>
                          </select>
                        </div>
                        {(attr.type === 'dropdown' || attr.type === 'multi-select') && (
                          <div className="sm:col-span-2 lg:col-span-1"><input required type="text" placeholder="Options (Comma separated)" value={attr.options || ""} onChange={e => handleAttributeChange(attr.id, 'options', e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-xs text-white outline-none focus:border-primary-500" /></div>
                        )}
                      </div>
                      <button type="button" onClick={() => handleRemoveAttribute(attr.id)} className="text-gray-600 hover:text-red-400 transition-colors shrink-0 mt-2 sm:mt-0"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="pt-4 flex justify-end gap-3 border-t border-gray-800">
                <button type="button" onClick={() => setMatModalOpen(false)} className="px-4 py-2 bg-gray-950 hover:bg-gray-800 text-xs text-gray-400 hover:text-white rounded transition-colors font-medium">Cancel</button>
                <button type="submit" disabled={savingMat} className="bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-xs font-bold text-white px-5 py-2 rounded transition-colors shadow-lg">{savingMat ? "Saving..." : "Save Category"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}