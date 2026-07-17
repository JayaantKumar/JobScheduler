import { useState, useEffect } from "react";
import { collection, addDoc, updateDoc, doc, deleteDoc, serverTimestamp, onSnapshot, query, where, getDocs, writeBatch } from "firebase/firestore";
import { db } from "../firebase/config";
import { useProducts } from "../hooks/useProducts";
import { useCustomers } from "../hooks/useCustomers";
import { useProcesses } from "../hooks/useProcesses"; 
import { useMachines } from "../hooks/useMachines"; 
import { useDies } from "../hooks/useDies"; 

const cleanGsm = (val) => val ? String(val).replace(/gsm/gi, "").trim() : "";

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

  const [toastMessage, setToastMessage] = useState("");
  const [showToast, setShowToast] = useState(false);

  const triggerToast = (msg) => {
    setToastMessage(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

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
  const [produceQty, setProduceQty] = useState(""); 
  const [produceDate, setProduceDate] = useState("");
  const [producing, setProducing] = useState(false);
  
  const [produceParts, setProduceParts] = useState([]);

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("");
  const [customerName, setCustomerName] = useState("");
  
  const defaultSequence = () => ({ id: Date.now(), process_name: "", assigned_machine: "", process_details: {}, remarks: "" });
  const defaultPart = (partName = "Main Product") => ({
    id: Date.now() + Math.random(),
    part_name: partName,
    qty_per_set: 1,
    size: "", paperType: "", paperGsm: "", sheet_size: "", cut_size: "", customMaterial: "",
    sequence: [defaultSequence()]
  });

  const [parts, setParts] = useState([defaultPart()]);

  const [inlineAddModal, setInlineAddModal] = useState({ isOpen: false, type: "", name: "" });
  const [savingInline, setSavingInline] = useState(false);

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
      
      if (prod.parts && prod.parts.length > 0) {
        setParts(prod.parts.map(p => ({
          ...p,
          id: p.id || Date.now() + Math.random(),
          paperGsm: cleanGsm(p.paperGsm),
          sequence: p.sequence?.length > 0 ? p.sequence : [defaultSequence()]
        })));
      } else {
        setParts([{
          id: Date.now(),
          part_name: prod.name || "Main Product",
          qty_per_set: 1,
          size: prod.size || "",
          paperType: prod.paperType || prod.material || "",
          paperGsm: cleanGsm(prod.paperGsm || prod.gsm || ""),
          sheet_size: prod.sheet_size || "",
          cut_size: prod.cut_size || "",
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

  // ⭐️ ROUND 6.5: Safely handle empty quantities to pre-render the dialog structure
  const generateProduceParts = (qtyStr, baseParts) => {
    const sets = qtyStr === "" ? "" : Number(qtyStr);
    return baseParts.map(p => {
       const mult = Number(p.qty_per_set) || 1;
       const computedPcs = sets === "" ? "" : sets * mult;
       return {
          id: p.id,
          part_name: p.part_name,
          part_sets: sets,
          original_multiplier: mult,
          active_multiplier: mult,
          is_custom_override: false,
          final_pcs: computedPcs,
          expanded: false,
          sequence: (p.sequence || []).map(s => ({ ...s, input_qty: computedPcs, output_qty: computedPcs }))
       };
    });
  };

  const openProduceModal = (prod) => {
    const formattedProd = { ...prod };
    if (!formattedProd.parts) {
      formattedProd.parts = [{ part_name: prod.name, qty_per_set: 1, sequence: prod.default_sequence || [] }];
    }
    setActiveProduceProduct(formattedProd);
    setProduceQty("");
    // ⭐️ ROUND 6.5: Pre-fill the modal immediately without waiting for user input
    setProduceParts(generateProduceParts("", formattedProd.parts)); 
    
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 14);
    setProduceDate(defaultDate.toISOString().split('T')[0]);
    setProduceModalOpen(true);
  };

  const handleProduceQtyChange = (e) => {
    const val = e.target.value;
    setProduceQty(val);
    if (activeProduceProduct) {
      setProduceParts(generateProduceParts(val, activeProduceProduct.parts));
    }
  };

  const updatePartSets = (pIdx, newSets) => {
    setProduceParts(prev => {
      const copy = [...prev];
      const count = newSets === "" ? "" : Number(newSets);
      copy[pIdx].part_sets = count;
      if (!copy[pIdx].is_custom_override) {
        copy[pIdx].final_pcs = count === "" ? "" : count * copy[pIdx].active_multiplier;
        copy[pIdx].sequence = copy[pIdx].sequence.map(s => ({ ...s, input_qty: copy[pIdx].final_pcs, output_qty: copy[pIdx].final_pcs }));
      }
      return copy;
    });
  };

  const updatePartMultiplier = (pIdx, newMult) => {
    setProduceParts(prev => {
       const copy = [...prev];
       const mult = newMult === "" ? "" : Number(newMult);
       copy[pIdx].active_multiplier = mult;
       if (!copy[pIdx].is_custom_override) {
         copy[pIdx].final_pcs = (copy[pIdx].part_sets === "" || mult === "") ? "" : copy[pIdx].part_sets * mult;
         copy[pIdx].sequence = copy[pIdx].sequence.map(s => ({...s, input_qty: copy[pIdx].final_pcs, output_qty: copy[pIdx].final_pcs}));
       }
       return copy;
    });
  };

  const toggleCustomOverride = (pIdx, checked) => {
    setProduceParts(prev => {
       const copy = [...prev];
       copy[pIdx].is_custom_override = checked;
       if (!checked) {
         copy[pIdx].final_pcs = (copy[pIdx].part_sets === "" || copy[pIdx].active_multiplier === "") ? "" : copy[pIdx].part_sets * copy[pIdx].active_multiplier;
         copy[pIdx].sequence = copy[pIdx].sequence.map(s => ({...s, input_qty: copy[pIdx].final_pcs, output_qty: copy[pIdx].final_pcs}));
       }
       return copy;
    });
  };

  const updatePartCustomPcs = (pIdx, newPcs) => {
    setProduceParts(prev => {
       const copy = [...prev];
       copy[pIdx].final_pcs = newPcs === "" ? "" : Number(newPcs);
       copy[pIdx].sequence = copy[pIdx].sequence.map(s => ({...s, input_qty: copy[pIdx].final_pcs, output_qty: copy[pIdx].final_pcs}));
       return copy;
    });
  };

  const handleStepQtyChange = (pIdx, sIdx, field, val) => {
    setProduceParts(prev => {
        const copy = [...prev];
        const pCopy = {...copy[pIdx]};
        const seqCopy = [...pCopy.sequence];
        const num = val === "" ? "" : Number(val);
        seqCopy[sIdx] = {...seqCopy[sIdx], [field]: num};
        if (field === 'output_qty') {
            let cascadedOut = num;
            for (let i = sIdx + 1; i < seqCopy.length; i++) {
                seqCopy[i] = {...seqCopy[i], input_qty: cascadedOut, output_qty: cascadedOut};
            }
        }
        pCopy.sequence = seqCopy;
        copy[pIdx] = pCopy;
        return copy;
    });
  };

  const handleAddPart = () => setParts([...parts, defaultPart(`Part ${parts.length + 1}`)]);
  const handleRemovePart = (id) => parts.length > 1 && setParts(parts.filter(p => p.id !== id));
  const updatePartField = (partId, field, val) => setParts(parts.map(p => p.id === partId ? { ...p, [field]: val } : p));
  const handleSequenceAdd = (partId) => setParts(parts.map(p => p.id === partId ? { ...p, sequence: [...p.sequence, defaultSequence()] } : p));
  const handleSequenceRemove = (partId, stepId) => setParts(parts.map(p => p.id === partId ? { ...p, sequence: p.sequence.filter(s => s.id !== stepId) } : p));
  
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

  const handleCustomerSelect = (e) => {
    if (e.target.value === "ADD_NEW") setInlineAddModal({ isOpen: true, type: "Customer", name: "" });
    else setCustomerName(e.target.value);
  };

  const handleCategorySelect = (e) => {
    if (e.target.value === "ADD_NEW") setInlineAddModal({ isOpen: true, type: "Product Category", name: "" });
    else setCategory(e.target.value);
  };

  const handleSaveInlineModal = async (e) => {
    e.preventDefault();
    if (!inlineAddModal.name.trim()) return;
    setSavingInline(true);
    const collectionName = inlineAddModal.type === "Customer" ? "customers" : "productCategories";
    try {
      await addDoc(collection(db, collectionName), {
        name: inlineAddModal.name.trim(),
        created_at: serverTimestamp()
      });
      if (inlineAddModal.type === "Customer") setCustomerName(inlineAddModal.name.trim());
      if (inlineAddModal.type === "Product Category") setCategory(inlineAddModal.name.trim());
      setInlineAddModal({ isOpen: false, type: "", name: "" });
    } catch (err) {
      console.error("Failed to add inline item:", err);
    } finally {
      setSavingInline(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    
    const cleanParts = parts.map(part => ({
      ...part,
      paperGsm: cleanGsm(part.paperGsm),
      sequence: part.sequence.filter(s => s.process_name.trim() !== "").map((s, idx) => ({ ...s, step_order: idx + 1 }))
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
      try { 
        await deleteDoc(doc(db, "products", id)); 
      } catch (error) { 
        alert("Failed to delete: " + error.message); 
      }
    }
  };

  const handleQuickProduce = async (e) => {
    e.preventDefault();
    
    if (producing) return; 
    if (!produceQty || !produceDate) return alert("Please enter sets quantity and due date.");
    
    setProducing(true);
    
    // ⭐️ ROUND 6.5: Force React to paint the "Generating..." spinner before freezing the thread with Firebase
    await new Promise(resolve => setTimeout(resolve, 50)); 

    try {
      const today = new Date();
      const dd = String(today.getDate()).padStart(2, '0');
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const yy = String(today.getFullYear()).slice(-2);
      const datePrefix = `${dd}${mm}${yy}`; 

      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
      const q = query(collection(db, "jobs"), where("job_date", ">=", startOfDay));
      const snap = await getDocs(q);

      let maxNN = 0;
      snap.forEach(d => {
        const data = d.data();
        if (data.set_code && data.set_code.startsWith(datePrefix)) {
          const splitCode = data.set_code.split('-');
          if (splitCode.length === 2) {
            const nn = parseInt(splitCode[1], 10);
            if (!isNaN(nn) && nn > maxNN) maxNN = nn;
          }
        }
      });

      const nextNN = String(maxNN + 1).padStart(2, '0');
      const set_code = `${datePrefix}-${nextNN}`;
      const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

      const batch = writeBatch(db);

      for (let i = 0; i < produceParts.length; i++) {
        const pState = produceParts[i];
        const masterPart = activeProduceProduct.parts.find(p => p.id === pState.id) || activeProduceProduct.parts[i];
        
        if (!pState.sequence || pState.sequence.length === 0) continue;

        const partLetter = letters[i] || `P${i+1}`;
        const display_id = `JOB-${set_code}-${partLetter}`;

        const final_process_sequence = pState.sequence.map((step, index) => {
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
            input_qty: step.input_qty || pState.final_pcs, 
            output_qty: step.output_qty || pState.final_pcs, 
            remarks: instructions, 
            process_details: step.process_details || {}, 
            assigned_machine_id: step.assigned_machine || null,
            assigned_machine_name: assignedMach ? assignedMach.name : "Unassigned Machine",
            // ⭐️ ROUND 6.5: Snapshot Machine Place
            assigned_machine_place: assignedMach ? (assignedMach.place || "") : "" 
          };
        });

        const newJobPayload = {
          title: `${activeProduceProduct.name} - ${masterPart.part_name || "Part"}`,
          customer: activeProduceProduct.customerName || "Unknown",
          priority: "normal",
          job_date: new Date().toISOString(),
          
          set_code: set_code,
          display_id: display_id,
          part_name: masterPart.part_name || "Main Part",
          part_index: i + 1,
          parts_total: activeProduceProduct.parts.length,
          sets_qty: Number(pState.part_sets),
          
          qty_per_set: pState.original_multiplier,
          active_multiplier: pState.active_multiplier,
          is_custom_override: pState.is_custom_override,
          quantity_target: pState.final_pcs,
          
          product: {
            id: activeProduceProduct.id, 
            name: activeProduceProduct.name, 
            sku: activeProduceProduct.sku || "",
            category: activeProduceProduct.category || "", 
            size: masterPart.size || "", 
            material: masterPart.paperType || masterPart.material || "", 
            gsm: cleanGsm(masterPart.paperGsm || masterPart.gsm || ""),
            sheet_size: masterPart.sheet_size || "", 
            customMaterial: masterPart.customMaterial || ""
          },
          specifications: { 
             size_before_cut: masterPart.sheet_size || "", 
             size_after_cut: masterPart.cut_size || "", 
             paper_company: "" 
          },
          quantity_completed: 0, 
          deadline: new Date(produceDate).toISOString(),
          status: "pending", 
          process_sequence: final_process_sequence, 
          notes: "Auto-generated multi-part set."
        };

        const newJobRef = doc(collection(db, "jobs"));
        batch.set(newJobRef, newJobPayload);
      }

      await batch.commit();

      setProduceModalOpen(false);
      triggerToast("Success! Multi-part job cards have been generated.");
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
    <div className="max-w-[1600px] mx-auto p-6 h-full flex flex-col relative">
      
      {showToast && (
        <div className="fixed top-6 right-6 bg-green-600/90 backdrop-blur-sm border border-green-500 text-white px-6 py-4 rounded-xl shadow-2xl z-[100] font-bold animate-fade-in flex items-center gap-3">
          <svg className="w-6 h-6 text-green-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
          </svg>
          {toastMessage}
        </div>
      )}

      {inlineAddModal.isOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-gray-900 border border-primary-500/30 rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-fade-in">
            <div className="p-6 border-b border-gray-800 bg-[#151724]">
              <h3 className="text-lg font-bold text-white">Add New {inlineAddModal.type}</h3>
            </div>
            <form onSubmit={handleSaveInlineModal} className="p-6 space-y-4 bg-[#0a0f1a]">
              <div>
                <label className={labelClass}>{inlineAddModal.type} Name *</label>
                <input required type="text" value={inlineAddModal.name} onChange={e => setInlineAddModal({...inlineAddModal, name: e.target.value})} className={inputClass} placeholder={`Enter ${inlineAddModal.type.toLowerCase()} name`} />
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setInlineAddModal({isOpen: false, type: "", name: ""})} className="px-4 py-2 bg-gray-950 hover:bg-gray-800 text-xs text-gray-400 hover:text-white rounded transition-colors font-medium">Cancel</button>
                <button type="submit" disabled={savingInline} className="bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-xs font-bold text-white px-5 py-2 rounded transition-colors shadow-lg">
                  {savingInline ? "Saving..." : "Save & Select"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                  const displayParts = prod.parts?.length > 0 ? prod.parts : [{ part_name: prod.name, qty_per_set: 1, paperType: prod.paperType || prod.material, paperGsm: prod.paperGsm || prod.gsm, sequence: prod.default_sequence || [] }];
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
                                {part.paperType || 'No Material Info'} {part.paperGsm ? `(${cleanGsm(part.paperGsm)} GSM)` : ""}
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

      {isProduceModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-primary-500/30 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="p-6 border-b border-gray-800 bg-[#151724] shrink-0">
              <h3 className="text-xl font-bold text-white">🚀 Generate Job Set</h3>
              <p className="text-xs text-gray-400 mt-1">Specify counts per material item below to configure overs for waste-prone layers.</p>
            </div>
            
            <form onSubmit={handleQuickProduce} className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6 bg-[#0a0f1a]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-primary-400 mb-1">Global Base Order Quantity (SETS) *</label>
                  {/* ⭐️ ROUND 6.5: autofocus added to immediately jump cursor into input */}
                  <input autoFocus required type="number" value={produceQty} onChange={handleProduceQtyChange} placeholder="e.g. 340" className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 text-lg font-bold text-white focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-400 mb-1">Production Due Date *</label>
                  <input required type="date" value={produceDate} onChange={e => setProduceDate(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 text-lg text-white [color-scheme:dark]" />
                </div>
              </div>
              
              {produceParts.length > 0 && (
                <div className="space-y-4">
                  {produceParts.map((p, pIdx) => (
                    <div key={p.id} className="bg-gray-900 border border-gray-800 p-4 rounded-lg">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-white font-bold text-sm">Part {String.fromCharCode(65 + pIdx)}: {p.part_name}</span>
                        <button type="button" onClick={() => setProduceParts(prev => { const copy = [...prev]; copy[pIdx].expanded = !copy[pIdx].expanded; return copy; })} className="text-xs text-gray-400 hover:text-white bg-gray-950 px-3 py-1 rounded border border-gray-700">
                          {p.expanded ? 'Hide Chained Routings' : 'Review Step-by-Step Chained Qtys'}
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-4 items-end bg-gray-950 p-3 rounded border border-gray-800">
                        <div>
                          <label className="block text-[10px] uppercase text-primary-400 font-bold mb-1">Target Sets for Part</label>
                          <input type="number" value={p.part_sets} onChange={e => updatePartSets(pIdx, e.target.value)} className="w-24 bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-xs text-white font-bold focus:border-primary-500 outline-none" />
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase text-gray-500 font-bold mb-1">Multiplier</label>
                          <input type="number" step="any" value={p.active_multiplier} onChange={e => updatePartMultiplier(pIdx, e.target.value)} className="w-20 bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-xs text-white" disabled={p.is_custom_override} />
                        </div>
                        <div className="text-gray-600 font-bold mb-1.5 text-xs">OR</div>
                        <div>
                          <label className="block text-[10px] uppercase text-gray-500 font-bold mb-1">Direct Pieces Override</label>
                          <div className="flex items-center gap-2">
                            <input type="checkbox" checked={p.is_custom_override} onChange={e => toggleCustomOverride(pIdx, e.target.checked)} />
                            <input type="number" value={p.is_custom_override ? p.final_pcs : ""} onChange={e => updatePartCustomPcs(pIdx, e.target.value)} disabled={!p.is_custom_override} className="w-28 bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-xs text-white disabled:opacity-50" placeholder="Custom Pcs" />
                          </div>
                        </div>
                        <div className="ml-auto text-right">
                          <span className="text-[10px] text-gray-500 uppercase font-bold block">Calculated Blanks</span>
                          {/* ⭐️ ROUND 6.5: Empty calculations show "—" */}
                          <span className="text-xl font-black text-white">{p.final_pcs === "" ? "—" : `${p.final_pcs.toLocaleString()} pcs`}</span>
                        </div>
                      </div>

                      {p.expanded && (
                        <div className="mt-4 border-t border-gray-800 pt-4 space-y-2">
                          {p.sequence.map((step, sIdx) => (
                            <div key={sIdx} className="flex items-center gap-3 bg-gray-950 p-2.5 rounded border border-gray-800 text-xs">
                              <span className="text-gray-500 font-bold w-4">{sIdx+1}.</span>
                              <span className="text-gray-300 w-48 truncate">{step.process_name}</span>
                              <div className="flex items-center gap-2">
                                <div className="bg-gray-900 px-2 py-1 rounded border border-gray-700 text-gray-400">In: <input type="number" value={step.input_qty} onChange={e => handleStepQtyChange(pIdx, sIdx, 'input_qty', e.target.value)} className="w-20 bg-transparent text-white font-mono outline-none" /></div>
                                <span className="text-primary-500 font-bold">→</span>
                                <div className="bg-gray-900 px-2 py-1 rounded border border-gray-700 text-gray-400">Out: <input type="number" value={step.output_qty} onChange={e => handleStepQtyChange(pIdx, sIdx, 'output_qty', e.target.value)} className="w-20 bg-transparent text-white font-mono outline-none" /></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-6 border-t border-gray-800 shrink-0 flex justify-end gap-3 sticky bottom-0 bg-[#0a0f1a] pb-2">
                <button type="button" onClick={() => setProduceModalOpen(false)} className="px-5 py-2.5 text-gray-400 bg-gray-900 rounded-lg">Cancel</button>
                <button 
                  type="submit" 
                  disabled={producing || produceParts.length === 0} 
                  className="bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-bold shadow-lg flex items-center justify-center min-w-[220px]"
                >
                  {producing ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Generating...
                    </span>
                  ) : (
                    "Generate and Send to Floor"
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Product Management Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex justify-between items-center p-6 border-b border-gray-800 shrink-0 bg-[#151724]">
              <h2 className="text-xl font-bold text-white">{editingProduct ? "Edit Product Template" : "Add New Product Template"}</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-white bg-gray-800 p-2 rounded-lg"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>

            <form onSubmit={handleSave} className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6 bg-[#0a0f1a]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-5 bg-gray-950/40 rounded-xl border border-gray-800">
                <div><label className={labelClass}>Product Master Name *</label><input required type="text" value={name} onChange={e => setName(e.target.value)} className={inputClass} /></div>
                <div><label className={labelClass}>SKU / Item Code</label><input type="text" value={sku} onChange={e => setSku(e.target.value)} className={inputClass} /></div>
                <div>
                  <label className={labelClass}>Assigned Customer *</label>
                  <select required value={customerName} onChange={handleCustomerSelect} className={inputClass} disabled={custLoading}>
                    <option value="">-- Select Customer --</option>
                    {customers.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    <option value="ADD_NEW" className="font-bold text-primary-400 bg-primary-900/20">+ Add New Customer...</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Product Category</label>
                  <select value={category} onChange={handleCategorySelect} className={inputClass}>
                    <option value="">-- Select Category --</option>
                    {categories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
                    <option value="ADD_NEW" className="font-bold text-primary-400 bg-primary-900/20">+ Add New Category...</option>
                  </select>
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex justify-between items-end border-b-2 border-gray-800 pb-2">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Product Parts Specs</h3>
                  <button type="button" onClick={handleAddPart} className="bg-primary-600 hover:bg-primary-500 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-lg">+ Add Another Part</button>
                </div>

                {parts.map((part, pIndex) => (
                  <div key={part.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-lg">
                    <div className="bg-[#151724] border-b border-gray-800 p-4 flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <span className="bg-primary-500/20 text-primary-400 font-bold w-8 h-8 rounded flex items-center justify-center border border-primary-500/30">{String.fromCharCode(65 + pIndex)}</span>
                        <input required type="text" value={part.part_name} onChange={e => updatePartField(part.id, 'part_name', e.target.value)} className="bg-gray-950 border border-gray-800 rounded px-3 py-1 text-sm font-bold text-white focus:border-primary-500 outline-none" placeholder="Part Label" />
                        <span className="text-xs text-gray-500 ml-2 font-bold uppercase">Mult per set:</span>
                        <input required type="number" min="1" value={part.qty_per_set} onChange={e => updatePartField(part.id, 'qty_per_set', e.target.value)} className="bg-gray-950 border border-gray-800 rounded px-2 py-1 text-sm text-center text-white w-12 outline-none" />
                      </div>
                      {isMultiPart && <button type="button" onClick={() => handleRemovePart(part.id)} className="text-red-500 hover:text-red-400 text-xs font-bold uppercase">Remove</button>}
                    </div>

                    <div className="p-4 space-y-4">
                      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
                        <div><label className="block text-[10px] text-gray-500 uppercase mb-1">Final Size</label><input type="text" value={part.size} onChange={e => updatePartField(part.id, 'size', e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-1.5 text-xs text-white" /></div>
                        <div><label className="block text-[10px] text-gray-500 uppercase mb-1">Raw Sheet</label><input type="text" value={part.sheet_size} onChange={e => updatePartField(part.id, 'sheet_size', e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-1.5 text-xs text-white" /></div>
                        <div><label className="block text-[10px] text-primary-400 uppercase mb-1">Cut Size</label><input type="text" value={part.cut_size} onChange={e => updatePartField(part.id, 'cut_size', e.target.value)} className="w-full bg-primary-950/20 border border-primary-500/30 rounded px-3 py-1.5 text-xs text-white" /></div>
                        <div><label className="block text-[10px] text-gray-500 uppercase mb-1">Material</label><input type="text" value={part.paperType} onChange={e => updatePartField(part.id, 'paperType', e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-1.5 text-xs text-white" /></div>
                        <div><label className="block text-[10px] text-gray-500 uppercase mb-1">GSM (Number Only)</label><input type="text" value={part.paperGsm} onChange={e => updatePartField(part.id, 'paperGsm', e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-1.5 text-xs text-white" placeholder="e.g. 300" /></div>
                        <div><label className="block text-[10px] text-gray-500 uppercase mb-1">Extras</label><input type="text" value={part.customMaterial} onChange={e => updatePartField(part.id, 'customMaterial', e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-1.5 text-xs text-white" /></div>
                      </div>

                      <div className="bg-gray-950 p-4 rounded border border-gray-800 space-y-3">
                        {part.sequence.map((step, idx) => (
                          <div key={step.id} className="flex flex-col gap-2 border-l-2 border-gray-800 pl-3 py-1">
                            <div className="flex gap-3 items-center">
                              <span className="text-xs font-bold text-gray-600 w-4 font-mono">{idx+1}.</span>
                              <select required value={step.process_name} onChange={(e) => handleSequenceChange(part.id, step.id, 'process_name', e.target.value)} disabled={procLoading} className="bg-gray-900 border border-gray-700 rounded p-1.5 text-xs text-white flex-1">
                                <option value="">-- Select Process --</option>
                                {dbProcesses.map(p => <option key={p.id} value={p.processName}>{p.processName}</option>)}
                              </select>
                              <select required value={step.assigned_machine} onChange={(e) => handleSequenceChange(part.id, step.id, 'assigned_machine', e.target.value)} disabled={machLoading} className="bg-gray-900 border border-gray-700 rounded p-1.5 text-xs text-white flex-1">
                                <option value="">-- Lock Target Machine --</option>
                                {getFilteredMachines(step.process_name).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                              </select>
                              <button onClick={() => handleSequenceRemove(part.id, step.id)} type="button" className="text-gray-500 hover:text-red-400 font-mono font-bold text-xs px-2">✕</button>
                            </div>
                            
                            {renderDynamicProcessFields(part.id, step)}
                            
                            <div className="pl-7 mt-1">
                              <input type="text" placeholder="Remarks for operator (Optional) e.g., Run at half speed" value={step.remarks || ""} onChange={(e) => handleSequenceChange(part.id, step.id, 'remarks', e.target.value)} className="w-full bg-gray-900 border border-gray-700 border-dashed rounded-md px-3 py-1.5 text-xs text-white focus:border-solid focus:border-primary-500" />
                            </div>
                          </div>
                        ))}
                        <button type="button" onClick={() => handleSequenceAdd(part.id)} className="text-xs text-primary-500 font-bold">+ Add Process Step</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="pt-4 flex justify-end gap-3 border-t border-gray-800">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-gray-400 bg-gray-950 rounded">Cancel</button>
                <button type="submit" disabled={saving} className="bg-primary-600 hover:bg-primary-500 text-white font-bold px-6 py-2 rounded shadow-lg">Save Template</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}