import { useState, useEffect } from "react";
import { collection, addDoc, updateDoc, doc, deleteDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/config";
import { useProducts } from "../hooks/useProducts";
import { useCustomers } from "../hooks/useCustomers";
import { useProcesses } from "../hooks/useProcesses"; 
import { useMachines } from "../hooks/useMachines"; 
import { useDies } from "../hooks/useDies"; 
import { addJob } from "../services/job.service"; 

export default function ProductManagement() {
  const { products, loading: prodLoading } = useProducts();
  const { customers, loading: custLoading } = useCustomers();
  const { processes: dbProcesses, loading: procLoading } = useProcesses(); 
  const { machines, loading: machLoading } = useMachines(); 
  const { dies } = useDies(); 

  const [isModalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [saving, setSaving] = useState(false);

  const [categories, setCategories] = useState([]);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "productCategories"), (snapshot) => {
      const cats = [];
      snapshot.forEach(doc => cats.push({ id: doc.id, ...doc.data() }));
      setCategories(cats);
    });
    return () => unsub();
  }, []);

  const [isProduceModalOpen, setProduceModalOpen] = useState(false);
  const [activeProduceProduct, setActiveProduceProduct] = useState(null);
  const [produceQty, setProduceQty] = useState(""); // This is now SETS qty
  const [produceDate, setProduceDate] = useState("");
  const [producing, setProducing] = useState(false);

  // --- FORM STATES FOR MULTI-PART TEMPLATE ---
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("");
  const [customerName, setCustomerName] = useState("");
  
  // ⭐️ NEW: Master Parts Array replaces flat material/routing fields
  const defaultSequence = () => ({ id: Date.now(), process_name: "", assigned_machine: "", process_details: {}, remarks: "" });
  const defaultPart = (partName = "Main Product") => ({
    id: Date.now() + Math.random(),
    part_name: partName,
    qty_per_set: 1,
    size: "", paperType: "", paperGsm: "", sheet_size: "", customMaterial: "",
    sequence: [defaultSequence()]
  });

  const [parts, setParts] = useState([defaultPart()]);

  const getFilteredMachines = (processName) => {
    if (!processName) return machines; 
    const processObj = dbProcesses.find(p => p.processName === processName);
    const defaultMachId = processObj?.defaultMachineId;
    const filtered = machines.filter(m => {
      if (defaultMachId && m.id === defaultMachId) return true;
      const mType = (m.type || "").toLowerCase();
      const pName = processName.toLowerCase();
      return mType === pName || pName.includes(mType) || mType.includes(pName);
    });
    return filtered.length > 0 ? filtered : machines;
  };

  const openModal = (prod = null) => {
    if (prod) {
      setEditingProduct(prod);
      setName(prod.name || "");
      setSku(prod.sku || "");
      setCategory(prod.category || prod.type || "");
      setCustomerName(prod.customerName || "");
      
      // ⭐️ MIGRATION: Load existing parts, or auto-convert old v1 products to multi-part format
      if (prod.parts && prod.parts.length > 0) {
        setParts(prod.parts.map(p => ({
          ...p,
          id: p.id || Date.now() + Math.random(),
          sequence: p.sequence?.length > 0 ? p.sequence : [defaultSequence()]
        })));
      } else {
        setParts([{
          id: Date.now(),
          part_name: prod.name || "Main Product",
          qty_per_set: 1,
          size: prod.size || "",
          paperType: prod.paperType || prod.material || "",
          paperGsm: prod.paperGsm || prod.gsm || "",
          sheet_size: prod.sheet_size || "",
          customMaterial: prod.customMaterial || "",
          sequence: prod.default_sequence?.length > 0 ? prod.default_sequence : [defaultSequence()]
        }]);
      }
    } else {
      setEditingProduct(null);
      setName(""); setSku(""); setCategory(""); setCustomerName("");
      setParts([defaultPart()]);
    }
    setModalOpen(true);
  };

  const openProduceModal = (prod) => {
    // Ensure product has parts formatted correctly for the preview
    const formattedProd = { ...prod };
    if (!formattedProd.parts) {
      formattedProd.parts = [{
        part_name: prod.name,
        qty_per_set: 1,
        sequence: prod.default_sequence || []
      }];
    }
    
    setActiveProduceProduct(formattedProd);
    setProduceQty("");
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 14);
    setProduceDate(defaultDate.toISOString().split('T')[0]);
    setProduceModalOpen(true);
  };

  // --- MULTI-PART STATE HANDLERS ---
  const handleAddPart = () => setParts([...parts, defaultPart(`Part ${parts.length + 1}`)]);
  const handleRemovePart = (id) => parts.length > 1 && setParts(parts.filter(p => p.id !== id));
  
  const updatePartField = (partId, field, val) => {
    setParts(parts.map(p => p.id === partId ? { ...p, [field]: val } : p));
  };

  const handleSequenceAdd = (partId) => {
    setParts(parts.map(p => p.id === partId ? { ...p, sequence: [...p.sequence, defaultSequence()] } : p));
  };
  const handleSequenceRemove = (partId, stepId) => {
    setParts(parts.map(p => p.id === partId ? { ...p, sequence: p.sequence.filter(s => s.id !== stepId) } : p));
  };
  const handleSequenceChange = (partId, stepId, field, val) => {
    setParts(parts.map(p => {
      if (p.id === partId) {
        const newSeq = p.sequence.map(s => {
          if (s.id === stepId && field === 'process_name') return { ...s, [field]: val, assigned_machine: "", process_details: {}, remarks: "" };
          return s.id === stepId ? { ...s, [field]: val } : s;
        });
        return { ...p, sequence: newSeq };
      }
      return p;
    }));
  };
  const handleSequenceDetailChange = (partId, stepId, detailField, val) => {
    setParts(parts.map(p => {
      if (p.id === partId) {
        const newSeq = p.sequence.map(s => s.id === stepId ? { ...s, process_details: { ...s.process_details, [detailField]: val } } : s);
        return { ...p, sequence: newSeq };
      }
      return p;
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    
    // Clean up empty sequences before saving
    const cleanParts = parts.map(part => ({
      ...part,
      sequence: part.sequence.filter(s => s.process_name.trim() !== "").map((s, idx) => ({
        ...s,
        step_order: idx + 1
      }))
    }));

    const payload = {
      name, sku, category, customerName,
      parts: cleanParts,
      updated_at: serverTimestamp()
    };

    try {
      let savedProdData = { ...payload };

      if (editingProduct) {
        await updateDoc(doc(db, "products", editingProduct.id), payload);
        savedProdData.id = editingProduct.id;
      } else {
        const docRef = await addDoc(collection(db, "products"), { ...payload, created_at: serverTimestamp() });
        savedProdData.id = docRef.id; 
      }
      
      setModalOpen(false); 
      openProduceModal(savedProdData); 

    } catch (error) { alert("Error saving product: " + error.message); } 
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this product template?")) {
      try { await deleteDoc(doc(db, "products", id)); } 
      catch (error) { alert("Failed to delete: " + error.message); }
    }
  };

  // --- ⭐️ THE MULTI-PART JOB ENGINE ---
  const handleQuickProduce = async (e) => {
    e.preventDefault();
    if (!produceQty || !produceDate) return alert("Please enter sets quantity and due date.");

    setProducing(true);
    const targetSetsQty = Number(produceQty);
    
    // 1. Generate the linking Set Code (e.g. 8F3K2)
    const set_code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    try {
      // 2. Loop through every part in the product and generate an independent Job Card
      for (let i = 0; i < activeProduceProduct.parts.length; i++) {
        const part = activeProduceProduct.parts[i];
        
        // Safety check
        if (!part.sequence || part.sequence.length === 0) continue;

        const cardQty = targetSetsQty * (Number(part.qty_per_set) || 1);
        const partLetter = letters[i] || `P${i+1}`;
        const display_id = `JOB-${set_code}-${partLetter}`;

        const final_process_sequence = part.sequence.map((step, index) => {
          const assignedMach = machines.find(m => m.id === step.assigned_machine);
          const processData = dbProcesses.find(p => p.processName === step.process_name);
          let instructionsArray = [];

          if (step.process_details && processData && processData.attributes) {
            processData.attributes.forEach(attr => {
              if (attr.prints && step.process_details[attr.name]) {
                instructionsArray.push(`${attr.name.toUpperCase()}: ${step.process_details[attr.name]}`);
              }
            });
          }

          let instructions = instructionsArray.join(" | ");
          if (step.remarks && step.remarks.trim() !== "") {
            instructions = instructions ? `${instructions} | REMARKS: ${step.remarks}` : `REMARKS: ${step.remarks}`;
          }

          return {
            step_order: index + 1,
            process_id: `sys_proc_${index}`,
            process_name: step.process_name || "Unassigned Process",
            status: "pending",
            input_qty: cardQty,
            output_qty: cardQty,
            remarks: instructions, 
            process_details: step.process_details || {}, 
            assigned_machine_id: step.assigned_machine || null,
            assigned_machine_name: assignedMach ? assignedMach.name : "Unassigned Machine"
          };
        });

        const newJobPayload = {
          title: `${activeProduceProduct.name} - ${part.part_name || "Part"}`,
          customer: activeProduceProduct.customerName || "Unknown",
          priority: "normal",
          job_date: new Date().toISOString(),
          
          // ⭐️ NEW LINKING DATA
          set_code: set_code,
          display_id: display_id,
          part_name: part.part_name || "Main Part",
          part_index: i + 1,
          parts_total: activeProduceProduct.parts.length,
          sets_qty: targetSetsQty,
          qty_per_set: Number(part.qty_per_set) || 1,
          
          product: {
            id: activeProduceProduct.id, 
            name: activeProduceProduct.name, 
            sku: activeProduceProduct.sku || "",
            category: activeProduceProduct.category || "", 
            // Save part-specific material specs to the card
            size: part.size || "", 
            material: part.paperType || part.material || "", 
            gsm: part.paperGsm || part.gsm || "",
            sheet_size: part.sheet_size || "", 
            customMaterial: part.customMaterial || ""
          },
          specifications: { size_before_cut: "", size_after_cut: "", paper_company: "" },
          quantity_target: cardQty, 
          quantity_completed: 0, 
          deadline: new Date(produceDate).toISOString(),
          status: "pending", 
          process_sequence: final_process_sequence, 
          notes: "Auto-generated multi-part set."
        };

        await addJob(newJobPayload);
      }

      setProduceModalOpen(false);
      alert("Success! Multi-part job cards have been generated and pushed to the floor.");
    } catch (error) { 
      alert("Failed to generate multi-part jobs: " + error.message); 
    } finally { 
      setProducing(false); 
    }
  };

  const inputClass = "w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary-500";
  const labelClass = "block text-xs font-semibold text-gray-400 mb-1.5";

  const filteredProducts = products.filter(p => p.name?.toLowerCase().includes(searchQuery.toLowerCase()) || p.customerName?.toLowerCase().includes(searchQuery.toLowerCase()));

  const renderDynamicProcessFields = (partId, step) => {
    const processData = dbProcesses.find(p => p.processName === step.process_name);
    if (!processData || !processData.attributes || processData.attributes.length === 0) return null;

    const miniInputClass = "w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-1.5 text-xs text-white focus:border-primary-500";

    return (
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pl-11">
        {processData.attributes.map((attr, index) => {
          const val = step.process_details[attr.name] || "";

          if (attr.type === "reference" && attr.options === "dies") {
            return (
              <div key={index}>
                <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider block mb-1">{attr.name}</span>
                <select value={val} onChange={e => handleSequenceDetailChange(partId, step.id, attr.name, e.target.value)} className={`${miniInputClass} border-purple-500/30`}>
                  <option value="">-- Select Die --</option>
                  {dies && dies.map(die => <option key={die.id} value={die.dieNumber}>{die.dieNumber} - {die.dieName}</option>)}
                </select>
              </div>
            );
          }

          if (attr.type === "dropdown" || attr.type === "multi-select") {
            return (
              <div key={index}>
                <span className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">{attr.name}</span>
                <select value={val} onChange={e => handleSequenceDetailChange(partId, step.id, attr.name, e.target.value)} className={miniInputClass}>
                  <option value="">-- Select --</option>
                  {attr.options?.split(",").map(opt => <option key={opt} value={opt.trim()}>{opt.trim()}</option>)}
                </select>
              </div>
            );
          }

          return (
            <div key={index}>
              <span className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">{attr.name}</span>
              <input type={attr.type === 'number' ? 'number' : 'text'} placeholder={attr.name} value={val} onChange={e => handleSequenceDetailChange(partId, step.id, attr.name, e.target.value)} className={miniInputClass} />
            </div>
          );
        })}
      </div>
    );
  };

  const isMultiPart = parts.length > 1;

  if (prodLoading) return <div className="p-8 text-primary-500 animate-pulse font-medium">Loading Products...</div>;

  return (
    <div className="max-w-[1600px] mx-auto p-6 h-full flex flex-col">
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">Product Management</h2>
          <p className="text-gray-400 mt-1">Define multi-part product templates and link target machines.</p>
        </div>
        <button onClick={() => openModal()} className="bg-primary-600 hover:bg-primary-500 text-white px-5 py-2.5 rounded-lg font-medium transition-colors shadow-lg shadow-primary-500/20 flex items-center gap-2">
          <span>+</span> Add Product Template
        </button>
      </div>

      <div className="mb-6 relative w-full max-w-md">
        <input type="text" placeholder="Search products or customers..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className={inputClass} />
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden shadow-xl flex-1 flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-gray-950/50 border-b border-gray-800 text-xs font-bold text-gray-400 uppercase tracking-wider">
                <th className="py-4 px-6 w-[20%]">Product & SKU</th>
                <th className="py-4 px-6 w-[15%]">Customer</th>
                <th className="py-4 px-6 w-[50%]">Linked Parts & Routing</th>
                <th className="py-4 px-6 text-right w-[15%]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredProducts.length === 0 ? (
                <tr><td colSpan="4" className="py-12 text-center text-gray-500">No products found.</td></tr>
              ) : (
                filteredProducts.map((prod) => {
                  // Fallback for visual render of older products without the 'parts' array
                  const displayParts = prod.parts?.length > 0 ? prod.parts : [{
                    part_name: prod.name,
                    qty_per_set: 1,
                    paperType: prod.paperType || prod.material,
                    paperGsm: prod.paperGsm || prod.gsm,
                    sequence: prod.default_sequence || []
                  }];

                  return (
                    <tr key={prod.id} className="hover:bg-gray-800/30 transition-colors align-top">
                      <td className="py-4 px-6">
                        <div className="font-bold text-gray-200">{prod.name}</div>
                        <div className="text-xs text-gray-500 font-mono mt-1">SKU: {prod.sku || "N/A"}</div>
                        <div className="text-[10px] uppercase font-bold text-primary-400 mt-1">{prod.category || prod.type}</div>
                      </td>
                      <td className="py-4 px-6 font-medium text-gray-300">{prod.customerName || "Unassigned"}</td>
                      
                      <td className="py-4 px-6">
                        <div className="flex flex-col gap-4">
                          {displayParts.map((part, pIdx) => (
                            <div key={pIdx} className="bg-gray-950/40 p-3 rounded border border-gray-800">
                              {displayParts.length > 1 && (
                                <div className="text-xs font-bold text-primary-400 uppercase tracking-wider mb-2 border-b border-gray-800/50 pb-1 flex justify-between">
                                  <span>Part {String.fromCharCode(65 + pIdx)}: {part.part_name}</span>
                                  <span className="text-gray-500">x{part.qty_per_set} per set</span>
                                </div>
                              )}
                              <div className="text-xs text-gray-400 mb-2 font-medium">
                                {part.paperType || 'No Material Info'} {part.paperGsm ? `(${part.paperGsm} GSM)` : ""}
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {part.sequence?.length > 0 ? (
                                  part.sequence.map((step, i) => {
                                    const mach = machines.find(m => m.id === step.assigned_machine);
                                    return (
                                      <div key={i} className="flex items-center gap-1.5 bg-gray-800 border border-gray-700 px-2 py-1 rounded">
                                        <span className="text-gray-300 text-[10px] font-bold">{i+1}. {step.process_name}</span>
                                        {mach && <span className="text-[9px] text-gray-500 font-mono">({mach.name})</span>}
                                      </div>
                                    );
                                  })
                                ) : (
                                  <span className="text-gray-500 text-xs italic">No routing saved</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>

                      <td className="py-4 px-6 text-right">
                        <div className="flex justify-end gap-2 items-center h-full pt-2">
                          <button onClick={() => openProduceModal(prod)} className="bg-primary-500/20 text-primary-400 hover:bg-primary-500 hover:text-white border border-primary-500/30 px-3 py-1.5 rounded-md text-xs font-bold transition-colors flex items-center gap-1 shadow-lg">
                            <span>🚀</span> Produce Set
                          </button>
                          <button onClick={() => openModal(prod)} className="text-gray-400 hover:text-white border border-gray-700 hover:bg-gray-800 px-3 py-1.5 rounded-md text-xs font-medium transition-colors">Edit</button>
                          <button onClick={() => handleDelete(prod.id)} className="text-gray-500 hover:text-red-400 p-1.5 hover:bg-red-500/10 rounded-md transition-colors">Delete</button>
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

      {/* --- 🚀 THE QUICK PRODUCE MODAL (MULTI-PART ENABLED) --- */}
      {isProduceModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-primary-500/30 rounded-xl w-full max-w-md p-6 shadow-2xl shadow-primary-500/10">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">🚀</span>
              <h3 className="text-xl font-bold text-white">Generate Multi-Part Job</h3>
            </div>
            <p className="text-sm text-gray-400 mb-6">Instantly push <strong className="text-white">{activeProduceProduct?.name}</strong> to the factory floor.</p>
            
            <form onSubmit={handleQuickProduce} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-primary-400 mb-1">Target SETS to Manufacture *</label>
                <input required type="number" value={produceQty} onChange={e => setProduceQty(e.target.value)} placeholder="e.g. 5000 sets" className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 text-lg font-bold text-white focus:outline-none focus:border-primary-500" />
              </div>
              
              {/* ⭐️ PREVIEW MATH GENERATOR */}
              {produceQty > 0 && activeProduceProduct?.parts && (
                <div className="bg-black/50 border border-gray-800 p-4 rounded-lg">
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 border-b border-gray-800 pb-1">Job Cards to be generated:</h4>
                  <ul className="space-y-2">
                    {activeProduceProduct.parts.map((p, i) => {
                      const computedQty = (Number(produceQty) || 0) * (Number(p.qty_per_set) || 1);
                      return (
                        <li key={i} className="text-sm text-gray-300 flex justify-between items-center bg-gray-900 p-2 rounded">
                          <div>
                            <span className="font-mono text-primary-500 font-bold mr-2">Part {String.fromCharCode(65 + i)}</span> 
                            {p.part_name || "Main"}
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-white">{computedQty.toLocaleString()} pcs</span>
                            <div className="text-[10px] text-gray-500">({p.qty_per_set} x {produceQty} sets)</div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              <div>
                <label className={labelClass}>Expected Deadline (For Entire Set) *</label>
                <input required type="date" value={produceDate} onChange={e => setProduceDate(e.target.value)} className={`${inputClass} [color-scheme:dark]`} />
              </div>
              
              <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-gray-800">
                <button type="button" onClick={() => setProduceModalOpen(false)} className="px-5 py-2.5 text-gray-400 hover:text-white transition-colors font-medium">Wait, not yet</button>
                <button type="submit" disabled={producing} className="bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-bold transition-colors shadow-lg">
                  {producing ? "Generating..." : `Push ${activeProduceProduct?.parts?.length || 1} Cards to Floor`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- ADD / EDIT PRODUCT MODAL --- */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
            
            <div className="flex justify-between items-center p-6 border-b border-gray-800 shrink-0 bg-[#151724]">
              <div>
                <h2 className="text-xl font-bold text-white">{editingProduct ? "Edit Product Template" : "Add New Product Template"}</h2>
                <p className="text-xs text-gray-400 mt-1">Multi-part templates generate linked sets of job cards automatically.</p>
              </div>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-white bg-gray-800 p-2 rounded-lg transition-colors"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-8 bg-[#0a0f1a]">
              
              {/* Product Root Level Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-5 bg-gray-950/40 rounded-xl border border-gray-800">
                <div><label className={labelClass}>Product Master Name *</label><input required type="text" value={name} onChange={e => setName(e.target.value)} className={inputClass} placeholder="e.g., Thermometer Master Box" /></div>
                <div><label className={labelClass}>SKU / Item Code</label><input type="text" value={sku} onChange={e => setSku(e.target.value)} className={inputClass} placeholder="e.g., TH-10" /></div>
                <div>
                  <label className={labelClass}>Assigned Customer *</label>
                  <select required value={customerName} onChange={e => setCustomerName(e.target.value)} className={inputClass} disabled={custLoading}>
                    <option value="">-- Select Customer --</option>
                    {customers.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Product Category</label>
                  <select value={category} onChange={e => setCategory(e.target.value)} className={inputClass}>
                    <option value="">-- Select Category --</option>
                    {categories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
                  </select>
                </div>
              </div>

              {/* ⭐️ MULTI-PART RENDER LOOP */}
              <div className="space-y-6">
                <div className="flex justify-between items-end border-b-2 border-gray-800 pb-2">
                  <h3 className="text-lg font-bold text-white uppercase tracking-wider">Product Parts & Routing</h3>
                  <button type="button" onClick={handleAddPart} className="bg-primary-600 hover:bg-primary-500 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors shadow-lg flex items-center gap-2">
                    <span>+</span> Add Another Part
                  </button>
                </div>

                {parts.map((part, pIndex) => (
                  <div key={part.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden relative shadow-lg">
                    
                    {/* Part Header (Only visible if multi-part) */}
                    <div className="bg-[#151724] border-b border-gray-800 p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                      <div className="flex items-center gap-3 w-full sm:w-auto">
                        <div className="bg-primary-500/20 text-primary-400 font-bold w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border border-primary-500/30">
                          {String.fromCharCode(65 + pIndex)}
                        </div>
                        <div className="flex-1 w-full flex gap-3">
                          <input 
                            required 
                            type="text" 
                            value={part.part_name} 
                            onChange={e => updatePartField(part.id, 'part_name', e.target.value)} 
                            className="bg-gray-950 border border-gray-800 rounded px-3 py-1.5 text-sm font-bold text-white w-full sm:w-48 focus:border-primary-500 outline-none placeholder-gray-600" 
                            placeholder="Part Name (e.g. Inner Tray)"
                          />
                          <div className="relative flex items-center">
                            <span className="text-xs text-gray-500 mr-2 uppercase font-bold tracking-wider hidden sm:inline-block">Qty per set:</span>
                            <input 
                              required 
                              type="number" 
                              min="1"
                              value={part.qty_per_set} 
                              onChange={e => updatePartField(part.id, 'qty_per_set', e.target.value)} 
                              className="bg-gray-950 border border-gray-800 rounded px-3 py-1.5 text-sm font-bold text-white w-16 text-center focus:border-primary-500 outline-none" 
                            />
                          </div>
                        </div>
                      </div>
                      
                      {isMultiPart && (
                        <button type="button" onClick={() => handleRemovePart(part.id)} className="text-red-500 hover:text-red-400 text-xs font-bold uppercase px-3 py-1.5 bg-red-500/10 rounded hover:bg-red-500/20 transition-colors shrink-0">
                          Remove Part
                        </button>
                      )}
                    </div>

                    <div className="p-5 space-y-6">
                      {/* Part Material Specs */}
                      <div>
                        <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-3">Part Material Specifications</h4>
                        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                          <div><label className="block text-[10px] text-gray-500 uppercase mb-1">Final Size</label><input type="text" value={part.size} onChange={e => updatePartField(part.id, 'size', e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-xs text-white" placeholder="L x W x H" /></div>
                          <div><label className="block text-[10px] text-gray-500 uppercase mb-1">Raw Sheet</label><input type="text" value={part.sheet_size} onChange={e => updatePartField(part.id, 'sheet_size', e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-xs text-white" placeholder="25 x 36 in" /></div>
                          <div><label className="block text-[10px] text-gray-500 uppercase mb-1">Material</label><input type="text" value={part.paperType} onChange={e => updatePartField(part.id, 'paperType', e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-xs text-white" placeholder="Duplex" /></div>
                          <div><label className="block text-[10px] text-gray-500 uppercase mb-1">GSM</label><input type="text" value={part.paperGsm} onChange={e => updatePartField(part.id, 'paperGsm', e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-xs text-white" placeholder="350 GSM" /></div>
                          <div><label className="block text-[10px] text-primary-500 uppercase mb-1">Custom / Extras</label><input type="text" value={part.customMaterial} onChange={e => updatePartField(part.id, 'customMaterial', e.target.value)} className="w-full bg-primary-950/20 border border-primary-500/30 rounded px-3 py-2 text-xs text-white" placeholder="Extra specs" /></div>
                        </div>
                      </div>

                      {/* Part Locked Routing */}
                      <div className="bg-gray-950 border border-gray-800 rounded-lg p-4">
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Locked Production Routing</h4>
                        </div>
                        <div className="space-y-3">
                          {part.sequence.map((step, idx) => (
                            <div key={step.id} className="flex gap-3 items-start border-l-2 border-gray-800 pl-3 py-1">
                              <div className="text-xs font-bold text-gray-600 mt-2 shrink-0 w-4 text-center">{idx + 1}.</div>
                              
                              <div className="flex-1 w-full space-y-2">
                                <div className="flex flex-col sm:flex-row gap-3">
                                  <select required value={step.process_name} onChange={(e) => handleSequenceChange(part.id, step.id, 'process_name', e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-1.5 text-xs text-white focus:border-primary-500" disabled={procLoading}>
                                    <option value="">-- Select Process --</option>
                                    {dbProcesses.map(p => <option key={p.id} value={p.processName}>{p.processName}</option>)}
                                  </select>

                                  <select required value={step.assigned_machine} onChange={(e) => handleSequenceChange(part.id, step.id, 'assigned_machine', e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-1.5 text-xs text-white focus:border-primary-500" disabled={machLoading}>
                                    <option value="">-- Lock Target Machine --</option>
                                    {getFilteredMachines(step.process_name).map(m => <option key={m.id} value={m.id}>{m.name} ({m.place})</option>)}
                                  </select>
                                  
                                  <button onClick={() => handleSequenceRemove(part.id, step.id)} type="button" className="text-gray-600 hover:text-red-500 transition-colors shrink-0 mt-1" title="Remove Step">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                  </button>
                                </div>
                                
                                {/* Dynamic Attributes rendered specific to THIS part and step */}
                                {renderDynamicProcessFields(part.id, step)}
                                
                                <div>
                                  <input 
                                    type="text" 
                                    placeholder="Remarks for operator (Optional) e.g., Run at half speed" 
                                    value={step.remarks || ""} 
                                    onChange={(e) => handleSequenceChange(part.id, step.id, 'remarks', e.target.value)} 
                                    className="w-full bg-gray-900 border border-gray-700 border-dashed rounded-md px-3 py-1.5 text-xs text-white focus:border-solid focus:border-primary-500" 
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                          <button type="button" onClick={() => handleSequenceAdd(part.id)} className="text-primary-500 hover:text-primary-400 text-xs font-bold flex items-center gap-1 mt-2 p-1 pl-3 transition-colors">
                            <span>+</span> Add Process Step
                          </button>
                        </div>
                      </div>

                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6 border-t border-gray-800 shrink-0 flex justify-end gap-3 bg-[#151724]">
              <button type="button" onClick={() => setModalOpen(false)} className="px-5 py-2.5 text-gray-400 hover:text-white bg-gray-900 rounded-lg transition-colors font-medium">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white px-8 py-2.5 rounded-lg font-bold transition-colors shadow-lg shadow-primary-500/20">
                {saving ? "Saving..." : "Save Product Template"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}