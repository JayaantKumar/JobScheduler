import { useState } from "react";
import { collection, addDoc, updateDoc, doc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/config";
import { useProducts } from "../hooks/useProducts";
import { useCustomers } from "../hooks/useCustomers";
import { useProcesses } from "../hooks/useProcesses"; 
import { useMachines } from "../hooks/useMachines"; 
import { addJob } from "../services/job.service"; 

export default function ProductManagement() {
  const { products, loading: prodLoading } = useProducts();
  const { customers, loading: custLoading } = useCustomers();
  const { processes: dbProcesses, loading: procLoading } = useProcesses(); 
  const { machines, loading: machLoading } = useMachines(); 

  const [isModalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [saving, setSaving] = useState(false);

  // --- QUICK PRODUCE MODAL STATES ---
  const [isProduceModalOpen, setProduceModalOpen] = useState(false);
  const [activeProduceProduct, setActiveProduceProduct] = useState(null);
  const [produceQty, setProduceQty] = useState("");
  const [produceDate, setProduceDate] = useState("");
  const [producing, setProducing] = useState(false);

  // Form States for Product Template
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [size, setSize] = useState("");
  const [paperType, setPaperType] = useState("");
  const [paperGsm, setPaperGsm] = useState("");
  const [sheetSize, setSheetSize] = useState("");
  
  // SEQUENCE STATE: Now includes a 'process_details' object to hold dynamic fields!
  const [sequence, setSequence] = useState([{ id: Date.now(), process_name: "", assigned_machine: "", process_details: {} }]);

  // --- MODAL CONTROLS ---
  const openModal = (prod = null) => {
    if (prod) {
      setEditingProduct(prod);
      setName(prod.name || "");
      setSku(prod.sku || "");
      setCategory(prod.category || prod.type || "");
      setCustomerName(prod.customerName || "");
      setSize(prod.size || "");
      setPaperType(prod.paperType || prod.material || "");
      setPaperGsm(prod.paperGsm || prod.gsm || "");
      setSheetSize(prod.sheet_size || "");
      
      if (prod.default_sequence && prod.default_sequence.length > 0) {
        setSequence(prod.default_sequence.map((s, i) => ({ 
          id: Date.now() + i, 
          process_name: s.process_name || "",
          assigned_machine: s.assigned_machine || "",
          process_details: s.process_details || {} // Load saved dynamic details
        })));
      } else {
        setSequence([{ id: Date.now(), process_name: "", assigned_machine: "", process_details: {} }]);
      }
    } else {
      setEditingProduct(null);
      setName(""); setSku(""); setCategory(""); setCustomerName("");
      setSize(""); setPaperType(""); setPaperGsm(""); setSheetSize("");
      setSequence([{ id: Date.now(), process_name: "", assigned_machine: "", process_details: {} }]);
    }
    setModalOpen(true);
  };

  const openProduceModal = (prod) => {
    setActiveProduceProduct(prod);
    setProduceQty("");
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 14);
    setProduceDate(defaultDate.toISOString().split('T')[0]);
    setProduceModalOpen(true);
  };

  // --- SEQUENCE & DYNAMIC FIELD HANDLERS ---
  const handleSequenceAdd = () => setSequence([...sequence, { id: Date.now(), process_name: "", assigned_machine: "", process_details: {} }]);
  const handleSequenceRemove = (id) => sequence.length > 1 && setSequence(sequence.filter(s => s.id !== id));
  
  const handleSequenceChange = (id, field, val) => {
    setSequence(sequence.map(s => {
      // If they change the process type, clear out the old specific details so data doesn't get tangled
      if (s.id === id && field === 'process_name') {
        return { ...s, [field]: val, process_details: {} };
      }
      return s.id === id ? { ...s, [field]: val } : s;
    }));
  };

  // Dedicated handler for the shape-shifting mini-fields
  const handleSequenceDetailChange = (id, detailField, val) => {
    setSequence(sequence.map(s => {
      if (s.id === id) {
        return { ...s, process_details: { ...s.process_details, [detailField]: val } };
      }
      return s;
    }));
  };

  // --- SAVE PRODUCT TEMPLATE & AUTO-TRIGGER ---
  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    
    // Clean and prepare the sequence, ensuring we save the dynamic details!
    const cleanSequence = sequence.filter(s => s.process_name.trim() !== "").map((s, index) => ({
      step_order: index + 1,
      process_name: s.process_name,
      assigned_machine: s.assigned_machine,
      process_details: s.process_details || {} 
    }));

    const payload = {
      name, sku, category, customerName, size,
      paperType, paperGsm, sheet_size: sheetSize,
      default_sequence: cleanSequence,
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
      
      setModalOpen(false); // 1. Close the Product Builder Modal
      
      // 2. BOOM: Auto-Trigger the Quick Produce Modal using the exact data we just saved!
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

  // --- THE MAGIC "QUICK PRODUCE" GENERATOR ---
  const handleQuickProduce = async (e) => {
    e.preventDefault();
    if (!produceQty || !produceDate) return alert("Please enter quantity and due date.");
    
    if (!activeProduceProduct.default_sequence || activeProduceProduct.default_sequence.length === 0) {
      return alert("This product has no locked machines. Please edit the product and add routing steps first!");
    }

    setProducing(true);
    const targetQtyNum = Number(produceQty);

    // Auto-build the locked sequence and transfer the dynamic process details to the floor
    const final_process_sequence = activeProduceProduct.default_sequence.map((step, index) => {
      const assignedMach = machines.find(m => m.id === step.assigned_machine);
      
      // Format the dynamic details into a readable remarks string for the operator
      let instructions = "";
      if (step.process_details && Object.keys(step.process_details).length > 0) {
        instructions = Object.entries(step.process_details)
          .map(([key, val]) => `${key.replace(/([A-Z])/g, ' $1').toUpperCase()}: ${val}`)
          .join(" | ");
      }

      return {
        step_order: index + 1,
        process_id: `sys_proc_${index}`,
        process_name: step.process_name || "Unassigned Process",
        status: "pending",
        input_qty: targetQtyNum,
        output_qty: targetQtyNum,
        remarks: instructions, // This passes the dynamic fields to the Job Card!
        assigned_machine_id: step.assigned_machine || null,
        assigned_machine_name: assignedMach ? assignedMach.name : "Unassigned Machine",
        process_details: step.process_details || {} 
      };
    });

    const newJobPayload = {
      title: `${activeProduceProduct.name} - Auto Batch`,
      customer: activeProduceProduct.customerName || "Unknown",
      priority: "normal",
      job_date: new Date().toISOString(),
      product: {
        id: activeProduceProduct.id,
        name: activeProduceProduct.name,
        sku: activeProduceProduct.sku || "",
        size: activeProduceProduct.size || "",
        material: activeProduceProduct.paperType || "",
        gsm: activeProduceProduct.paperGsm || "",
        sheet_size: activeProduceProduct.sheet_size || "",
        category: activeProduceProduct.category || ""
      },
      specifications: { colors: "NA", size_before_cut: "", size_after_cut: "", die: "", paper_company: "" },
      quantity_target: targetQtyNum,
      quantity_completed: 0,
      deadline: new Date(produceDate).toISOString(),
      status: "pending",
      process_sequence: final_process_sequence,
      notes: "Auto-generated from Product Management."
    };

    try {
      await addJob(newJobPayload);
      setProduceModalOpen(false);
      alert("Success! Job Cards have been generated and sent to the floor.");
    } catch (error) {
      alert("Failed to generate job: " + error.message);
    } finally {
      setProducing(false);
    }
  };

  const inputClass = "w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary-500";
  const labelClass = "block text-xs font-semibold text-gray-400 mb-1.5";

  const filteredProducts = products.filter(p => p.name?.toLowerCase().includes(searchQuery.toLowerCase()) || p.customerName?.toLowerCase().includes(searchQuery.toLowerCase()));

  // ==========================================
  // DYNAMIC RENDER HELPER FOR SHAPE-SHIFTING FIELDS
  // ==========================================
  const renderDynamicProcessFields = (step) => {
    const pName = step.process_name?.toLowerCase() || "";
    const details = step.process_details || {};
    const miniInputClass = "w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-1.5 text-xs text-white focus:border-primary-500";

    // 1. Sheet Cutting / Corrugation
    if (pName.includes("sheet cutting") || pName.includes("corrugation")) {
      return (
        <div className="mt-2 grid grid-cols-2 gap-3 pl-11">
          <div><span className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Size</span><input type="text" placeholder="e.g. 25x36" value={details.size || ""} onChange={e => handleSequenceDetailChange(step.id, 'size', e.target.value)} className={miniInputClass} /></div>
        </div>
      );
    }
    
    // 2. Printing
    if (pName.includes("printing")) {
      return (
        <div className="mt-2 grid grid-cols-2 gap-3 pl-11">
          <div><span className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">No. of Colours</span><input type="text" placeholder="e.g. 4 (CMYK)" value={details.colors || ""} onChange={e => handleSequenceDetailChange(step.id, 'colors', e.target.value)} className={miniInputClass} /></div>
          <div><span className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Size</span><input type="text" placeholder="e.g. 20x30" value={details.size || ""} onChange={e => handleSequenceDetailChange(step.id, 'size', e.target.value)} className={miniInputClass} /></div>
        </div>
      );
    }

    // 3. Lamination
    if (pName.includes("lamination")) {
      return (
        <div className="mt-2 grid grid-cols-2 gap-3 pl-11">
          <div>
            <span className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Type</span>
            <select value={details.laminationType || ""} onChange={e => handleSequenceDetailChange(step.id, 'laminationType', e.target.value)} className={miniInputClass}>
              <option value="">Select Type</option><option value="Cold">Cold</option><option value="Thermal">Thermal</option>
            </select>
          </div>
          <div>
            <span className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Mode</span>
            <select value={details.mode || ""} onChange={e => handleSequenceDetailChange(step.id, 'mode', e.target.value)} className={miniInputClass}>
              <option value="">Select Mode</option><option value="Manual">Manual</option><option value="Automatic">Automatic</option>
            </select>
          </div>
        </div>
      );
    }

    // 4. Die Cutting (Your custom additions included!)
    if (pName.includes("die cutting")) {
      return (
        <div className="mt-2 grid grid-cols-3 gap-3 pl-11">
          <div><span className="text-[10px] text-purple-400 font-bold uppercase tracking-wider block mb-1">Die Size</span><input type="text" placeholder="Size" value={details.size || ""} onChange={e => handleSequenceDetailChange(step.id, 'size', e.target.value)} className={`${miniInputClass} border-purple-500/30`} /></div>
          <div><span className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Sheet Size</span><input type="text" placeholder="Sheet Size" value={details.sheetSize || ""} onChange={e => handleSequenceDetailChange(step.id, 'sheetSize', e.target.value)} className={miniInputClass} /></div>
          <div><span className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">No. of Colours</span><input type="text" placeholder="Colours" value={details.colors || ""} onChange={e => handleSequenceDetailChange(step.id, 'colors', e.target.value)} className={miniInputClass} /></div>
        </div>
      );
    }

    // 5. Gluing
    if (pName === "gluing") {
      return (
        <div className="mt-2 grid grid-cols-2 gap-3 pl-11">
          <div>
            <span className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Mode</span>
            <select value={details.mode || ""} onChange={e => handleSequenceDetailChange(step.id, 'mode', e.target.value)} className={miniInputClass}>
              <option value="">Select Mode</option><option value="Manual">Manual</option><option value="Automatic">Automatic</option>
            </select>
          </div>
        </div>
      );
    }

    // 6. Side Pasting
    if (pName.includes("side pasting")) {
      return (
        <div className="mt-2 grid grid-cols-2 gap-3 pl-11">
          <div><span className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Min Size</span><input type="text" placeholder="Min Size" value={details.minSize || ""} onChange={e => handleSequenceDetailChange(step.id, 'minSize', e.target.value)} className={miniInputClass} /></div>
          <div><span className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Max Size</span><input type="text" placeholder="Max Size" value={details.maxSize || ""} onChange={e => handleSequenceDetailChange(step.id, 'maxSize', e.target.value)} className={miniInputClass} /></div>
        </div>
      );
    }

    // 7. General Pasting (Catch-all for pasting)
    if (pName.includes("pasting") && !pName.includes("side")) {
      return (
        <div className="mt-2 grid grid-cols-2 gap-3 pl-11">
          <div>
            <span className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Mode</span>
            <select value={details.mode || ""} onChange={e => handleSequenceDetailChange(step.id, 'mode', e.target.value)} className={miniInputClass}>
              <option value="">Select Mode</option><option value="Manual">Manual</option>
            </select>
          </div>
        </div>
      );
    }

    return null; // Return nothing if it's a process that doesn't need extra fields
  };

  if (prodLoading) return <div className="p-8 text-primary-500 animate-pulse font-medium">Loading Products...</div>;

  return (
    <div className="max-w-[1600px] mx-auto p-6 h-full flex flex-col">
      
      {/* HEADER & MAIN TABLE OMITTED FOR BREVITY, IDENTICAL TO PREVIOUS VERSION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">Product Management</h2>
          <p className="text-gray-400 mt-1">Define product templates and permanently assign target machines.</p>
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
                <th className="py-4 px-6">Product & SKU</th>
                <th className="py-4 px-6">Customer</th>
                <th className="py-4 px-6">Material Specs</th>
                <th className="py-4 px-6">Locked Production Route</th>
                <th className="py-4 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredProducts.length === 0 ? (
                <tr><td colSpan="5" className="py-12 text-center text-gray-500">No products found.</td></tr>
              ) : (
                filteredProducts.map((prod) => (
                  <tr key={prod.id} className="hover:bg-gray-800/30 transition-colors">
                    <td className="py-4 px-6">
                      <div className="font-bold text-gray-200">{prod.name}</div>
                      <div className="text-xs text-gray-500 font-mono mt-1">SKU: {prod.sku || "N/A"}</div>
                      <div className="text-[10px] uppercase font-bold text-primary-400 mt-1">{prod.category || prod.type}</div>
                    </td>
                    <td className="py-4 px-6 font-medium text-gray-300">{prod.customerName || "Unassigned"}</td>
                    <td className="py-4 px-6 text-sm text-gray-400">
                      <div>{prod.paperType || prod.material} {prod.paperGsm || prod.gsm ? `(${prod.paperGsm || prod.gsm} GSM)` : ""}</div>
                      <div className="text-xs mt-1">Size: {prod.size || "N/A"}</div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex flex-col gap-1.5">
                        {prod.default_sequence?.length > 0 ? (
                          prod.default_sequence.map((step, i) => {
                            const mach = machines.find(m => m.id === step.assigned_machine);
                            return (
                              <div key={i} className="flex items-center gap-2">
                                <span className="bg-gray-800 border border-gray-700 text-gray-300 text-[10px] px-2 py-0.5 rounded font-medium whitespace-nowrap">
                                  {i+1}. {step.process_name}
                                </span>
                                {mach && (
                                  <span className="text-[10px] text-gray-500 font-mono truncate max-w-[120px]">
                                    👉 {mach.name}
                                  </span>
                                )}
                              </div>
                            );
                          })
                        ) : (
                          <span className="text-gray-500 text-xs italic">No routing saved</span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex justify-end gap-2 items-center">
                        <button onClick={() => openProduceModal(prod)} className="bg-primary-500/20 text-primary-400 hover:bg-primary-500 hover:text-white border border-primary-500/30 px-3 py-1.5 rounded-md text-xs font-bold transition-colors flex items-center gap-1">
                          <span>🚀</span> Produce
                        </button>
                        <button onClick={() => openModal(prod)} className="text-gray-400 hover:text-white border border-gray-700 hover:bg-gray-800 px-3 py-1.5 rounded-md text-xs font-medium transition-colors">Edit</button>
                        <button onClick={() => handleDelete(prod.id)} className="text-gray-500 hover:text-red-400 p-1.5 hover:bg-red-500/10 rounded-md transition-colors">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- 🚀 THE QUICK PRODUCE MODAL --- */}
      {isProduceModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-primary-500/30 rounded-xl w-full max-w-md p-6 shadow-2xl shadow-primary-500/10">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">🚀</span>
              <h3 className="text-xl font-bold text-white">Generate Job Cards</h3>
            </div>
            <p className="text-sm text-gray-400 mb-6">
              Instantly push <strong className="text-white">{activeProduceProduct?.name}</strong> to the factory floor using its locked machine routing.
            </p>
            
            <form onSubmit={handleQuickProduce} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-primary-400 mb-1">Target Production Quantity *</label>
                <input required type="number" value={produceQty} onChange={e => setProduceQty(e.target.value)} placeholder="e.g. 5000" className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 text-lg font-bold text-white focus:outline-none focus:border-primary-500" />
              </div>
              <div>
                <label className={labelClass}>Expected Deadline *</label>
                <input required type="date" value={produceDate} onChange={e => setProduceDate(e.target.value)} className={`${inputClass} [color-scheme:dark]`} />
              </div>

              <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-gray-800">
                <button type="button" onClick={() => setProduceModalOpen(false)} className="px-5 py-2.5 text-gray-400 hover:text-white transition-colors font-medium">Wait, not yet</button>
                <button type="submit" disabled={producing} className="bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-bold transition-colors shadow-lg">
                  {producing ? "Generating..." : "Push to Floor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- ADD / EDIT PRODUCT MODAL --- */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
            
            <div className="flex justify-between items-center p-6 border-b border-gray-800 shrink-0">
              <h2 className="text-xl font-bold text-white">{editingProduct ? "Edit Product Template" : "Add New Product Template"}</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-white"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-8">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className={labelClass}>Product Name *</label><input required type="text" value={name} onChange={e => setName(e.target.value)} className={inputClass} placeholder="e.g., 50ml Perfume Box" /></div>
                <div><label className={labelClass}>SKU / Item Code</label><input type="text" value={sku} onChange={e => setSku(e.target.value)} className={inputClass} placeholder="e.g., BX-PRF-50" /></div>
                <div>
                  <label className={labelClass}>Assigned Customer *</label>
                  <select required value={customerName} onChange={e => setCustomerName(e.target.value)} className={inputClass} disabled={custLoading}>
                    <option value="">-- Select Customer --</option>
                    {customers.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div><label className={labelClass}>Product Category</label><input type="text" value={category} onChange={e => setCategory(e.target.value)} className={inputClass} placeholder="e.g., Rigid Box" /></div>
              </div>

              <div className="bg-gray-950/50 p-5 rounded-lg border border-gray-800">
                <h3 className="text-sm font-bold text-gray-300 mb-4">Material Specifications</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div><label className={labelClass}>Final Product Size</label><input type="text" value={size} onChange={e => setSize(e.target.value)} className={inputClass} placeholder="L x W x H" /></div>
                  <div><label className={labelClass}>Raw Sheet Size</label><input type="text" value={sheetSize} onChange={e => setSheetSize(e.target.value)} className={inputClass} placeholder="e.g., 25 x 36 in" /></div>
                  <div><label className={labelClass}>Paper / Material</label><input type="text" value={paperType} onChange={e => setPaperType(e.target.value)} className={inputClass} placeholder="e.g., Duplex Board" /></div>
                  <div><label className={labelClass}>GSM / Thickness</label><input type="text" value={paperGsm} onChange={e => setPaperGsm(e.target.value)} className={inputClass} placeholder="e.g., 350 GSM" /></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-gray-300">Locked Production Routing</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Assign the exact processes AND machines required to build this product.</p>
                  </div>
                </div>
                <div className="space-y-4">
                  {sequence.map((step, idx) => (
                    <div key={step.id} className="bg-gray-950/50 p-4 rounded-lg border border-gray-800 transition-all">
                      <div className="flex flex-col md:flex-row items-start gap-3">
                        <div className="bg-gray-800 text-gray-400 w-8 h-8 rounded flex items-center justify-center font-bold text-xs shrink-0 mt-1">{idx + 1}</div>
                        
                        <div className="flex-1 w-full space-y-2">
                          <div className="flex flex-col sm:flex-row gap-3">
                            <select required value={step.process_name} onChange={(e) => handleSequenceChange(step.id, 'process_name', e.target.value)} className={inputClass} disabled={procLoading}>
                              <option value="">-- Select Process --</option>
                              {dbProcesses.map(p => <option key={p.id} value={p.processName}>{p.processName}</option>)}
                            </select>

                            <select required value={step.assigned_machine} onChange={(e) => handleSequenceChange(step.id, 'assigned_machine', e.target.value)} className={inputClass} disabled={machLoading}>
                              <option value="">-- Lock Target Machine --</option>
                              {machines.map(m => <option key={m.id} value={m.id}>{m.name} ({m.place})</option>)}
                            </select>
                          </div>

                          {/* DYNAMIC SHAPE-SHIFTING FIELDS RENDER HERE */}
                          {renderDynamicProcessFields(step)}
                        </div>

                        <button onClick={() => handleSequenceRemove(step.id)} type="button" className="text-gray-500 hover:text-red-400 p-2 shrink-0 transition-colors mt-1">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                  <button type="button" onClick={handleSequenceAdd} className="text-primary-400 hover:text-primary-300 text-sm font-bold flex items-center gap-1 mt-2 p-2 transition-colors">
                    <span>+</span> Add Process Step
                  </button>
                </div>
              </div>

            </div>

            <div className="p-6 border-t border-gray-800 shrink-0 flex justify-end gap-3 bg-gray-900">
              <button type="button" onClick={() => setModalOpen(false)} className="px-5 py-2.5 text-gray-400 hover:text-white transition-colors font-medium">Cancel</button>
              
              {/* SAVING NOW TRIGGERS THE PRODUCE MODAL */}
              <button onClick={handleSave} disabled={saving} className="bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-bold transition-colors shadow-lg">
                {saving ? "Saving..." : "Save Product & Generate Jobs"}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}