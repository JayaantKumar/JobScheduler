import { useState } from "react";
import { addJob } from "../services/job.service";
import { useCustomers } from "../hooks/useCustomers";
import { useProducts } from "../hooks/useProducts";
import { useMachines } from "../hooks/useMachines";
import { useProcesses } from "../hooks/useProcesses"; 

const calculate14WorkingDays = () => {
  let count = 0;
  let date = new Date();
  while (count < 14) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() !== 0 && date.getDay() !== 6) count++;
  }
  return date.toISOString().split('T')[0];
};

export default function JobModal({ onClose }) {
  const [loading, setLoading] = useState(false);
  
  const { customers, loading: custLoading } = useCustomers();
  const { products, loading: prodLoading } = useProducts();
  const { machines, loading: machLoading } = useMachines();
  const { processes: dbProcesses, loading: procLoading } = useProcesses(); 

  // Job Info
  const [jobDate, setJobDate] = useState(new Date().toISOString().split('T')[0]);
  const [jobTitle, setJobTitle] = useState("");
  const [customer, setCustomer] = useState("");
  const [selectedProductId, setSelectedProductId] = useState(""); 
  const [productName, setProductName] = useState("");
  const [productCode, setProductCode] = useState("");
  const [quantity, setQuantity] = useState("");
  const [productSize, setProductSize] = useState("");
  const [dueDate, setDueDate] = useState(calculate14WorkingDays()); 
  const [template, setTemplate] = useState("");

  // Material Specs
  const [sheetSize, setSheetSize] = useState("");
  const [sheetGsm, setSheetGsm] = useState("");
  const [materialType, setMaterialType] = useState("");
  const [paperCompany, setPaperCompany] = useState("");
  const [sizeBeforeCut, setSizeBeforeCut] = useState("");
  const [sizeAfterCut, setSizeAfterCut] = useState("");
  const [dieSelect, setDieSelect] = useState("");

  const [priority, setPriority] = useState("normal");
  const [jobNotes, setJobNotes] = useState("");

  // MANUAL PROCESS ROUTING STATE
  const [processes, setProcesses] = useState([
    { id: Date.now(), process_name: "", assigned_machine: "", inputQty: "", outputQty: "", remarks: "" }
  ]);

  // Pull defaults from the Product Template, but keep them editable!
  const handleProductChange = (e) => {
    const prodId = e.target.value;
    setSelectedProductId(prodId);

    if (!prodId) {
      setProcesses([{ id: Date.now(), process_name: "", assigned_machine: "", inputQty: "", outputQty: "", remarks: "" }]);
      return;
    }

    const prod = products.find(p => p.id === prodId);
    if (!prod) return;

    setJobTitle(`${prod.name} - Batch Run`);
    setProductName(prod.name || "");
    setProductCode(prod.sku || "");
    setTemplate(prod.category || prod.type || ""); 
    setProductSize(prod.size || "");
    setMaterialType(prod.paperType || prod.material || "");
    setSheetGsm(prod.paperGsm || prod.gsm || "");
    setSheetSize(prod.sheet_size || "");

    // Load template sequence into the MANUAL builder
    if (prod.default_sequence && prod.default_sequence.length > 0) {
      const manualProcesses = prod.default_sequence.map((step, index) => ({
        id: Date.now() + index,
        process_name: step.process_name || "",
        assigned_machine: step.assigned_machine || "", 
        inputQty: quantity, // Suggests the target quantity
        outputQty: quantity,
        remarks: ""
      }));
      setProcesses(manualProcesses);
    } else {
      setProcesses([{ id: Date.now(), process_name: "", assigned_machine: "", inputQty: quantity, outputQty: quantity, remarks: "" }]);
    }
  };

  // Update target quantity and automatically suggest it to all process steps to save typing
  const handleQuantityChange = (e) => {
    const newQty = e.target.value;
    setQuantity(newQty);
    setProcesses(processes.map(p => ({ ...p, inputQty: newQty, outputQty: newQty })));
  };

  const handleAddProcess = () => setProcesses([...processes, { id: Date.now(), process_name: "", assigned_machine: "", inputQty: quantity, outputQty: quantity, remarks: "" }]);
  const handleRemoveProcess = (id) => processes.length > 1 && setProcesses(processes.filter(p => p.id !== id));
  const updateProcess = (id, field, value) => setProcesses(processes.map(p => p.id === id ? { ...p, [field]: value } : p));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedProductId) return alert("Please select a Product Template.");
    setLoading(true);

    const final_process_sequence = processes.map((proc, index) => {
      const assignedMach = machines.find(m => m.id === proc.assigned_machine);

      return {
        step_order: index + 1,
        process_id: `manual_proc_${index}`,
        process_name: proc.process_name || "Unassigned Process",
        status: "pending",
        input_qty: Number(proc.inputQty) || 0,
        output_qty: Number(proc.outputQty) || 0,
        remarks: proc.remarks || "",
        assigned_machine_id: proc.assigned_machine || null,          
        assigned_machine_name: assignedMach ? assignedMach.name : "Unassigned Machine", 
      };
    });

    const newJobPayload = {
      title: jobTitle,
      customer: customer,
      priority: priority,
      job_date: new Date(jobDate).toISOString(),
      product: {
        id: selectedProductId, 
        name: productName,
        sku: productCode,
        size: productSize,
        material: materialType,
        gsm: sheetGsm,
        sheet_size: sheetSize,
        category: template 
      },
      specifications: {
        colors: "NA", 
        size_before_cut: sizeBeforeCut,
        size_after_cut: sizeAfterCut,
        die: dieSelect,
        paper_company: paperCompany, 
      },
      quantity_target: Number(quantity) || 0,
      quantity_completed: 0,
      deadline: dueDate ? new Date(dueDate).toISOString() : new Date().toISOString(),
      status: "pending",
      process_sequence: final_process_sequence,
      notes: jobNotes
    };

    try {
      await addJob(newJobPayload);
      onClose();
    } catch (error) {
      alert("Failed to create job. Check console.");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500 placeholder-gray-600";
  const labelClass = "block text-xs font-semibold text-gray-400 mb-1.5";

  const safeCustomer = customer?.trim()?.toLowerCase() || "";
  const customerProducts = products ? products.filter(p => p.customerName?.trim()?.toLowerCase() === safeCustomer) : [];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        <div className="flex justify-between items-center p-6 border-b border-gray-800 bg-[#151724] shrink-0">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              Create Job Card (Manual Setup)
            </h2>
            <p className="text-xs text-gray-400 mt-1">Assign product defaults, then manually adjust machines and targets.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-[#0a0f1a]">
          <form id="jobForm" onSubmit={handleSubmit} className="space-y-8">
            
            {/* 1. SELECTION & TARGETS */}
            <div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Select Customer *</label>
                  <select required value={customer} onChange={e => { setCustomer(e.target.value); setSelectedProductId(""); setProcesses([{ id: Date.now(), process_name: "", assigned_machine: "", inputQty: "", outputQty: "", remarks: "" }]); }} className={inputClass}>
                    <option value="">{custLoading ? "Loading..." : "-- Select Customer --"}</option>
                    {customers.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Select Product Blueprint *</label>
                  <select required value={selectedProductId} onChange={handleProductChange} disabled={!customer || customerProducts.length === 0} className={`${inputClass} ${(!customer || customerProducts.length === 0) ? 'opacity-50 cursor-not-allowed' : 'border-primary-500/50'}`}>
                    <option value="">
                      {!customer ? "Select a customer first" : prodLoading ? "Loading products..." : customerProducts.length === 0 ? "⚠️ No products found" : "-- Load Defaults from Product --"}
                    </option>
                    {customerProducts.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku || "No SKU"})</option>)}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className={labelClass}>Job Title (Internal)</label>
                  <input required type="text" value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="e.g., Luxury Box - Q1 Run" className={inputClass} />
                </div>

                <div className="md:col-span-2 bg-primary-900/10 border border-primary-500/30 p-4 rounded-lg flex items-center gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-bold text-primary-400 mb-1">Target Production Quantity *</label>
                    <input required type="number" value={quantity} onChange={handleQuantityChange} placeholder="e.g. 10000" className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 text-lg font-bold text-white focus:outline-none focus:border-primary-500" />
                  </div>
                </div>

                <div><label className={labelClass}>Job Date</label><input required type="date" value={jobDate} onChange={e => setJobDate(e.target.value)} className={`${inputClass} [color-scheme:dark]`} /></div>
                <div><label className={labelClass}>Deadline</label><input required type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={`${inputClass} [color-scheme:dark]`} /></div>
              </div>
            </div>

            {/* 2. MANUAL ROUTING (Fully Editable) */}
            <div className="mt-8">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-white">Manual Process Routing & Machine Assignment</h3>
              </div>

              <div className="space-y-4">
                {processes.map((proc, index) => (
                  <div key={proc.id} className="bg-[#111827] border border-gray-800 rounded-lg p-5 flex gap-4">
                    <div className="flex flex-col items-center pt-2 text-gray-600 gap-2 shrink-0">
                      <svg className="w-5 h-5 cursor-grab" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8h16M4 16h16" /></svg>
                      <span className="text-primary-500 font-bold text-sm">{index + 1}</span>
                    </div>

                    <div className="flex-1 space-y-4">
                      
                      <div className="flex flex-col md:flex-row items-start gap-4">
                        <div className="flex-1 w-full">
                          <label className={labelClass}>Process Name</label>
                          <select required value={proc.process_name} onChange={(e) => updateProcess(proc.id, "process_name", e.target.value)} className={inputClass} disabled={procLoading}>
                            <option value="">{procLoading ? "Loading..." : "-- Select Process --"}</option>
                            {dbProcesses.map(p => <option key={p.id} value={p.processName}>{p.processName}</option>)}
                          </select>
                        </div>
                        
                        <div className="flex-1 w-full">
                          <label className={labelClass}>Target Machine</label>
                          <select required value={proc.assigned_machine} onChange={(e) => updateProcess(proc.id, "assigned_machine", e.target.value)} className={inputClass} disabled={machLoading}>
                            <option value="">-- Assign Machine --</option>
                            {machines.map(m => <option key={m.id} value={m.id}>{m.name} ({m.place})</option>)}
                          </select>
                        </div>

                        <button type="button" onClick={() => handleRemoveProcess(proc.id)} className="mt-7 text-red-500 hover:text-red-400 transition-colors shrink-0">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div><label className={labelClass}>Input Qty</label><input type="number" value={proc.inputQty} onChange={(e) => updateProcess(proc.id, "inputQty", e.target.value)} className={inputClass} /></div>
                        <div><label className={labelClass}>Output Qty</label><input type="number" value={proc.outputQty} onChange={(e) => updateProcess(proc.id, "outputQty", e.target.value)} className={inputClass} /></div>
                      </div>

                    </div>
                  </div>
                ))}
              </div>

              <button type="button" onClick={handleAddProcess} className="w-full mt-4 bg-gray-900 border border-gray-700 border-dashed hover:border-gray-500 text-gray-400 hover:text-white py-3 rounded-lg text-sm font-medium transition-colors flex justify-center gap-2">
                <span>+</span> Add Custom Process Step
              </button>
            </div>

            {/* 3. MATERIAL OVERRIDES */}
            <div className="pt-6 border-t border-gray-800">
              <h3 className="text-sm font-bold text-gray-300 mb-4">Batch Material Overrides (Optional)</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div><label className={labelClass}>Material</label><input type="text" value={materialType} onChange={e => setMaterialType(e.target.value)} className={inputClass} /></div>
                <div><label className={labelClass}>GSM</label><input type="text" value={sheetGsm} onChange={e => setSheetGsm(e.target.value)} className={inputClass} /></div>
                <div><label className={labelClass}>Paper Company</label><input type="text" value={paperCompany} onChange={e => setPaperCompany(e.target.value)} className={inputClass} /></div>
                <div><label className={labelClass}>Die # (If needed)</label><input type="text" value={dieSelect} onChange={e => setDieSelect(e.target.value)} className={inputClass} /></div>
                <div><label className={labelClass}>Raw Sheet Size</label><input type="text" value={sizeBeforeCut} onChange={e => setSizeBeforeCut(e.target.value)} className={inputClass} /></div>
                <div><label className={labelClass}>Cut Sheet Size</label><input type="text" value={sizeAfterCut} onChange={e => setSizeAfterCut(e.target.value)} className={inputClass} /></div>
                <div>
                  <label className={labelClass}>Priority</label>
                  <select value={priority} onChange={e => setPriority(e.target.value)} className={inputClass}>
                    <option value="normal">Normal</option><option value="high">High</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label className={labelClass}>Specific Batch Instructions</label>
              <textarea rows="2" value={jobNotes} onChange={e => setJobNotes(e.target.value)} className={`${inputClass} resize-none`} placeholder="Enter notes for operators running this specific batch..."></textarea>
            </div>

          </form>
        </div>

        <div className="p-4 border-t border-gray-800 bg-[#151724] shrink-0 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-lg text-gray-400 hover:text-white transition-colors font-medium">Cancel</button>
          <button type="submit" form="jobForm" disabled={loading || processes.length === 0} className="bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white px-8 py-2.5 rounded-lg font-bold transition-colors">
            {loading ? "Generating..." : "Generate Job Cards"}
          </button>
        </div>
      </div>
    </div>
  );
}