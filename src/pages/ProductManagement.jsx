import { useState } from "react";
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/config";
import { useProducts } from "../hooks/useProducts";
import { useCustomers } from "../hooks/useCustomers"; // Needed to assign products to customers

const PROCESS_LIST = [
  "Sheet Cutting", "UV Printing", "Offset Printing", "Die Cutting", 
  "Automatic Gluing", "Manual Gluing", "Side Pasting", "Sorting", "Packing"
];

export default function ProductManagement() {
  const { products, loading: prodLoading } = useProducts();
  const { customers, loading: custLoading } = useCustomers();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    name: "", sku: "", customerName: "", type: "", size: "", paperType: "", paperGsm: ""
  });
  
  // Default Process Sequence State
  const [processes, setProcesses] = useState([{ id: Date.now(), process_name: "" }]);

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // Process Sequence Handlers
  const addProcess = () => setProcesses([...processes, { id: Date.now(), process_name: "" }]);
  const removeProcess = (id) => setProcesses(processes.filter(p => p.id !== id));
  const updateProcess = (id, value) => {
    setProcesses(processes.map(p => p.id === id ? { ...p, process_name: value } : p));
  };

  const openModal = (product = null) => {
    if (product) {
      setFormData({
        name: product.name || "", sku: product.sku || "", customerName: product.customerName || "",
        type: product.type || "", size: product.size || "", paperType: product.paperType || "", paperGsm: product.paperGsm || ""
      });
      setProcesses(product.default_sequence || [{ id: Date.now(), process_name: "" }]);
      setEditingId(product.id);
    } else {
      setFormData({ name: "", sku: "", customerName: "", type: "", size: "", paperType: "", paperGsm: "" });
      setProcesses([{ id: Date.now(), process_name: "" }]);
      setEditingId(null);
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);

    // Clean up empty processes
    const cleanedSequence = processes.filter(p => p.process_name.trim() !== "");

    const payload = {
      ...formData,
      default_sequence: cleanedSequence,
      updated_at: serverTimestamp()
    };

    try {
      if (editingId) {
        await updateDoc(doc(db, "products", editingId), payload);
      } else {
        await addDoc(collection(db, "products"), { ...payload, created_at: serverTimestamp() });
      }
      setIsModalOpen(false);
    } catch (error) {
      alert("Error saving product: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Delete this product? It may affect linked rates.")) {
      try { await deleteDoc(doc(db, "products", id)); } 
      catch (error) { alert("Error deleting: " + error.message); }
    }
  };

  if (prodLoading || custLoading) return <div className="p-8 text-primary-500 animate-pulse font-medium">Loading Product Master...</div>;

  return (
    <div className="max-w-[1600px] mx-auto p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">Product Management</h2>
          <p className="text-gray-400 mt-1">Define product templates, specifications, and default process routings.</p>
        </div>
        <button onClick={() => openModal()} className="bg-primary-600 hover:bg-primary-500 text-white px-5 py-2.5 rounded-lg font-medium transition-colors shadow-lg shadow-primary-500/20">
          + Add Product
        </button>
      </div>

      {/* Table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden shadow-xl flex-1 flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-gray-950/50 border-b border-gray-800 text-xs font-bold text-gray-400 uppercase tracking-wider">
                <th className="py-4 px-6">Product & SKU</th>
                <th className="py-4 px-6">Customer</th>
                <th className="py-4 px-6">Specs (Type / Material)</th>
                <th className="py-4 px-6">Default Routing</th>
                <th className="py-4 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {products.length === 0 && <tr><td colSpan="5" className="py-12 text-center text-gray-500">No products defined yet.</td></tr>}
              {products.map((prod) => (
                <tr key={prod.id} className="hover:bg-gray-800/30 transition-colors group">
                  <td className="py-4 px-6">
                    <div className="font-bold text-white">{prod.name}</div>
                    <div className="text-xs text-gray-500 font-mono mt-0.5">{prod.sku || "No SKU"}</div>
                  </td>
                  <td className="py-4 px-6 text-gray-300">{prod.customerName || "Unassigned"}</td>
                  <td className="py-4 px-6">
                    <div className="text-sm text-gray-300">{prod.type || "-"} • {prod.size || "-"}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{prod.paperType || "-"} ({prod.paperGsm ? `${prod.paperGsm} GSM` : "-"})</div>
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex flex-wrap gap-1">
                      {prod.default_sequence?.length > 0 ? prod.default_sequence.map((step, i) => (
                        <span key={i} className="text-[10px] bg-gray-800 text-gray-300 px-2 py-1 rounded border border-gray-700">
                          {i+1}. {step.process_name}
                        </span>
                      )) : <span className="text-xs text-gray-500 italic">No routing</span>}
                    </div>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className="flex justify-end gap-3">
                      <button onClick={() => openModal(prod)} className="text-gray-400 hover:text-white px-3 py-1.5 border border-gray-700 rounded-md text-sm transition-colors">Edit</button>
                      <button onClick={() => handleDelete(prod.id)} className="text-red-400 hover:text-red-300 px-3 py-1.5 border border-red-900/50 bg-red-500/10 rounded-md text-sm transition-colors">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="p-6 border-b border-gray-800 shrink-0">
              <h3 className="text-xl font-bold text-white">{editingId ? "Edit Product" : "Create Product Template"}</h3>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
              <form id="prodForm" onSubmit={handleSave} className="space-y-6">
                
                {/* Specs Section */}
                <div>
                  <h4 className="text-sm font-bold text-primary-400 mb-3 border-b border-gray-800 pb-2">Product Details</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-1">Product Name *</label>
                      <input required name="name" value={formData.name} onChange={handleInputChange} className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-1">SKU / Code</label>
                      <input name="sku" value={formData.sku} onChange={handleInputChange} className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-1">Customer *</label>
                      <select required name="customerName" value={formData.customerName} onChange={handleInputChange} className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm">
                        <option value="">-- Select Customer --</option>
                        {customers.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-1">Category / Type</label>
                      <input name="type" value={formData.type} onChange={handleInputChange} placeholder="e.g. Rigid Box" className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm" />
                    </div>
                  </div>
                </div>

                {/* Material Section */}
                <div>
                  <h4 className="text-sm font-bold text-primary-400 mb-3 border-b border-gray-800 pb-2">Material Specifications</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-1">Size (L x W x H)</label>
                      <input name="size" value={formData.size} onChange={handleInputChange} className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-1">Paper Type</label>
                      <input name="paperType" value={formData.paperType} onChange={handleInputChange} placeholder="e.g. Gloss" className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-1">Paper GSM</label>
                      <input name="paperGsm" value={formData.paperGsm} onChange={handleInputChange} placeholder="e.g. 300" className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm" />
                    </div>
                  </div>
                </div>

                {/* Default Process Sequence Builder */}
                <div>
                  <h4 className="text-sm font-bold text-primary-400 mb-3 border-b border-gray-800 pb-2 flex justify-between">
                    Default Process Sequence
                    <span className="text-xs text-gray-500 font-normal">Pre-loads when creating jobs</span>
                  </h4>
                  
                  <div className="space-y-2">
                    {processes.map((proc, idx) => (
                      <div key={proc.id} className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-gray-800 flex items-center justify-center text-xs text-gray-400 font-bold shrink-0">{idx + 1}</div>
                        <select value={proc.process_name} onChange={(e) => updateProcess(proc.id, e.target.value)} className="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white text-sm">
                          <option value="">-- Select Process Step --</option>
                          {PROCESS_LIST.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <button type="button" onClick={() => removeProcess(proc.id)} className="text-red-500 hover:text-red-400 p-2"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={addProcess} className="mt-3 text-sm text-primary-400 hover:text-primary-300 font-medium flex items-center gap-1">+ Add Next Step</button>
                </div>

              </form>
            </div>
            
            {/* Footer */}
            <div className="p-4 border-t border-gray-800 shrink-0 flex justify-end gap-3">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-gray-400 hover:text-white transition-colors">Cancel</button>
              <button type="submit" form="prodForm" disabled={saving} className="bg-primary-600 hover:bg-primary-500 text-white px-6 py-2.5 rounded-lg transition-colors font-medium shadow-lg shadow-primary-500/20">
                {saving ? "Saving..." : "Save Product Template"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}