import { useState } from "react";
import { collection, addDoc, updateDoc, doc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/config";
import { useProducts } from "../hooks/useProducts";
import { useCustomers } from "../hooks/useCustomers";
import { useProcesses } from "../hooks/useProcesses"; 
import { useMachines } from "../hooks/useMachines"; // <-- NEW: Fetch machines!

export default function ProductManagement() {
  const { products, loading: prodLoading } = useProducts();
  const { customers, loading: custLoading } = useCustomers();
  const { processes: dbProcesses, loading: procLoading } = useProcesses(); 
  const { machines, loading: machLoading } = useMachines(); // <-- NEW: Load machines!

  const [isModalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [saving, setSaving] = useState(false);

  // Form States
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [size, setSize] = useState("");
  const [paperType, setPaperType] = useState("");
  const [paperGsm, setPaperGsm] = useState("");
  const [sheetSize, setSheetSize] = useState("");
  
  // Sequence State now holds both Process Name AND Assigned Machine
  const [sequence, setSequence] = useState([{ id: Date.now(), process_name: "", assigned_machine: "" }]);

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
          assigned_machine: s.assigned_machine || "" 
        })));
      } else {
        setSequence([{ id: Date.now(), process_name: "", assigned_machine: "" }]);
      }
    } else {
      setEditingProduct(null);
      setName(""); setSku(""); setCategory(""); setCustomerName("");
      setSize(""); setPaperType(""); setPaperGsm(""); setSheetSize("");
      setSequence([{ id: Date.now(), process_name: "", assigned_machine: "" }]);
    }
    setModalOpen(true);
  };

  const handleSequenceAdd = () => setSequence([...sequence, { id: Date.now(), process_name: "", assigned_machine: "" }]);
  const handleSequenceRemove = (id) => sequence.length > 1 && setSequence(sequence.filter(s => s.id !== id));
  
  // Updated to handle specific fields (Process OR Machine)
  const handleSequenceChange = (id, field, val) => {
    setSequence(sequence.map(s => s.id === id ? { ...s, [field]: val } : s));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);

    // Save both the process and the permanently assigned machine
    const cleanSequence = sequence.filter(s => s.process_name.trim() !== "").map((s, index) => ({
      step_order: index + 1,
      process_name: s.process_name,
      assigned_machine: s.assigned_machine
    }));

    const payload = {
      name, sku, category, customerName, size,
      paperType, paperGsm, sheet_size: sheetSize,
      default_sequence: cleanSequence,
      updated_at: serverTimestamp()
    };

    try {
      if (editingProduct) {
        await updateDoc(doc(db, "products", editingProduct.id), payload);
      } else {
        await addDoc(collection(db, "products"), { ...payload, created_at: serverTimestamp() });
      }
      setModalOpen(false);
    } catch (error) {
      alert("Error saving product: " + error.message);
    } finally {
      setSaving(false);
    }
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

  const inputClass = "w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary-500";
  const labelClass = "block text-xs font-semibold text-gray-400 mb-1.5";

  const filteredProducts = products.filter(p => p.name?.toLowerCase().includes(searchQuery.toLowerCase()) || p.customerName?.toLowerCase().includes(searchQuery.toLowerCase()));

  if (prodLoading) return <div className="p-8 text-primary-500 animate-pulse font-medium">Loading Products...</div>;

  return (
    <div className="max-w-[1600px] mx-auto p-6 h-full flex flex-col">
      
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
                      <div className="flex justify-end gap-3">
                        <button onClick={() => openModal(prod)} className="text-gray-400 hover:text-white border border-gray-700 hover:bg-gray-800 px-3 py-1.5 rounded-md text-sm transition-colors">Edit</button>
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

              {/* DYNAMIC PROCESS & MACHINE ROUTING BUILDER */}
              <div>
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-gray-300">Locked Production Routing</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Assign the exact processes AND machines required to build this product.</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {sequence.map((step, idx) => (
                    <div key={step.id} className="flex flex-col md:flex-row items-center gap-3 bg-gray-950/50 p-3 rounded-lg border border-gray-800">
                      <div className="bg-gray-800 text-gray-400 w-8 h-8 rounded flex items-center justify-center font-bold text-xs shrink-0">{idx + 1}</div>
                      
                      <select 
                        required
                        value={step.process_name} 
                        onChange={(e) => handleSequenceChange(step.id, 'process_name', e.target.value)} 
                        className={inputClass}
                        disabled={procLoading}
                      >
                        <option value="">-- Select Process --</option>
                        {dbProcesses.map(p => (
                          <option key={p.id} value={p.processName}>{p.processName}</option>
                        ))}
                      </select>

                      <select 
                        required
                        value={step.assigned_machine} 
                        onChange={(e) => handleSequenceChange(step.id, 'assigned_machine', e.target.value)} 
                        className={inputClass}
                        disabled={machLoading}
                      >
                        <option value="">-- Lock Target Machine --</option>
                        {machines.map(m => (
                          <option key={m.id} value={m.id}>{m.name} ({m.place})</option>
                        ))}
                      </select>

                      <button onClick={() => handleSequenceRemove(step.id)} type="button" className="text-gray-500 hover:text-red-400 p-2 shrink-0 transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
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
              <button onClick={handleSave} disabled={saving} className="bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-bold transition-colors shadow-lg">
                {saving ? "Saving..." : "Save Product Template"}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}