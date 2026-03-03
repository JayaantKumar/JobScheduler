import { useState } from "react";
import { addJob } from "../services/job.service";
import { useCustomers } from "../hooks/useCustomers";
import { useProducts } from "../hooks/useProducts";

// Master list of processes
const PROCESS_LIST = [
  { id: "proc_cutting", name: "Sheet Cutting" },
  { id: "proc_printing_uv", name: "UV Printing" },
  { id: "proc_printing_offset", name: "Offset Printing" },
  { id: "proc_die_cut", name: "Die Cutting" },
  { id: "proc_gluing_auto", name: "Automatic Gluing" },
  { id: "proc_gluing_manual", name: "Manual Gluing" },
  { id: "proc_pasting", name: "Side Pasting" },
  { id: "proc_sorting", name: "Sorting" },
  { id: "proc_packing", name: "Packing" }
];

export default function JobModal({ onClose }) {
  const [loading, setLoading] = useState(false);
  
  // Fetch Master Data
  const { customers, loading: custLoading } = useCustomers();
  const { products, loading: prodLoading } = useProducts();

  // --- SECTION 1: Job Information ---
  const [jobTitle, setJobTitle] = useState("");
  const [customer, setCustomer] = useState("");
  const [selectedProductId, setSelectedProductId] = useState(""); 
  const [productName, setProductName] = useState("");
  const [productCode, setProductCode] = useState("");
  const [quantity, setQuantity] = useState("");
  const [productSize, setProductSize] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [template, setTemplate] = useState(""); // Captures the product category

  // --- SECTION 2: Sheet & Material ---
  const [sheetSize, setSheetSize] = useState("");
  const [sheetGsm, setSheetGsm] = useState("");
  const [materialType, setMaterialType] = useState("");
  const [printColors, setPrintColors] = useState("NA");
  const [sizeBeforeCut, setSizeBeforeCut] = useState("");
  const [sizeAfterCut, setSizeAfterCut] = useState("");
  const [dieSelect, setDieSelect] = useState("");

  // --- SECTION 3: Prerequisites & Status ---
  const [priority, setPriority] = useState("Normal");
  const [materialStatus, setMaterialStatus] = useState("Pending");
  const [artworkStatus, setArtworkStatus] = useState("Pending");
  const [artworkVersion, setArtworkVersion] = useState("v1.0");

  // --- PROCESS ROUTING & NOTES ---
  const [processes, setProcesses] = useState([
    { id: Date.now(), process_id: "", setup: "15", run: "120", hold: "0", inputQty: "", outputQty: "", remarks: "" }
  ]);
  const [jobNotes, setJobNotes] = useState("");

  // --- BULLETPROOF AUTO-FILL LOGIC ---
  const handleProductChange = (e) => {
    const prodId = e.target.value;
    setSelectedProductId(prodId);

    if (!prodId) return;

    const prod = products.find(p => p.id === prodId);
    if (prod) {
      setJobTitle(`${prod.name} - Run`);
      setProductName(prod.name || "");
      setProductCode(prod.sku || "");
      setTemplate(prod.type || ""); 
      setProductSize(prod.size || "");
      setMaterialType(prod.paperType || "");
      setSheetGsm(prod.paperGsm || "");

      if (prod.default_sequence && prod.default_sequence.length > 0) {
        const autoBuiltProcesses = prod.default_sequence.map((step, index) => {
          const matchedProcess = PROCESS_LIST.find(pl => pl.name === step.process_name);
          return {
            id: Date.now() + index,
            process_id: matchedProcess ? matchedProcess.id : "",
            setup: "15", 
            run: "120", 
            hold: "0",
            inputQty: quantity || "",
            outputQty: quantity || "",
            remarks: ""
          };
        });
        setProcesses(autoBuiltProcesses);
      } else {
        setProcesses([{ id: Date.now(), process_id: "", setup: "15", run: "120", hold: "0", inputQty: quantity || "", outputQty: quantity || "", remarks: "No routing saved in template" }]);
      }
    }
  };

  const handleAddProcess = () => setProcesses([...processes, { id: Date.now(), process_id: "", setup: "15", run: "120", hold: "0", inputQty: quantity || "", outputQty: quantity || "", remarks: "" }]);
  const handleRemoveProcess = (id) => processes.length > 1 && setProcesses(processes.filter(p => p.id !== id));
  const updateProcess = (id, field, value) => setProcesses(processes.map(p => p.id === id ? { ...p, [field]: value } : p));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const process_sequence = processes.map((proc, index) => {
      const matchedProcess = PROCESS_LIST.find(pl => pl.id === proc.process_id);
      return {
        step_order: index + 1,
        process_id: proc.process_id || `custom_proc_${index}`,
        process_name: matchedProcess ? matchedProcess.name : "Unassigned Process",
        status: "pending",
        setup_mins: proc.setup || "15",
        run_mins: proc.run || "120",
        input_qty: proc.inputQty,
        output_qty: proc.outputQty,
        remarks: proc.remarks,
        assigned_machine_id: null,
        scheduled_start: null,
        scheduled_end: null
      };
    });

    const newJobPayload = {
      title: jobTitle,
      customer: customer,
      priority: priority,
      product: {
        name: productName,
        sku: productCode,
        size: productSize,
        material: materialType,
        gsm: sheetGsm,
        sheet_size: sheetSize,
        category: template // Saving the template type here
      },
      specifications: {
        colors: printColors,
        size_before_cut: sizeBeforeCut,
        size_after_cut: sizeAfterCut,
        die: dieSelect,
        material_status: materialStatus,
        artwork_status: artworkStatus,
        artwork_version: artworkVersion
      },
      quantity_target: Number(quantity) || 0,
      quantity_completed: 0,
      deadline: dueDate ? new Date(dueDate).toISOString() : new Date().toISOString(),
      status: "pending",
      process_sequence: process_sequence,
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
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        <div className="flex justify-between items-center p-6 border-b border-gray-800 bg-gray-900 shrink-0">
          <h2 className="text-xl font-bold text-white tracking-tight">Create New Job</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-[#0a0f1a]">
          <form id="jobForm" onSubmit={handleSubmit} className="space-y-8">
            
            {/* 1. Job Information */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-6 h-6 rounded-full bg-primary-600 flex items-center justify-center text-white text-xs font-bold shadow-lg shadow-primary-500/30">1</div>
                <h3 className="text-lg font-bold text-white">Job Information</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                <div>
                  <label className={labelClass}>Customer *</label>
                  <select 
                    required 
                    value={customer} 
                    onChange={e => {
                      setCustomer(e.target.value);
                      setSelectedProductId(""); 
                    }} 
                    className={inputClass}
                  >
                    <option value="">{custLoading ? "Loading customers..." : "-- Select Customer --"}</option>
                    {customers.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className={labelClass}>Saved Product Template (Auto-fill)</label>
                  <select 
                    value={selectedProductId} 
                    onChange={handleProductChange} 
                    disabled={!customer || customerProducts.length === 0}
                    className={`${inputClass} ${(!customer || customerProducts.length === 0) ? 'opacity-50 cursor-not-allowed' : 'border-primary-500/50'}`}
                  >
                    <option value="">
                      {!customer 
                        ? "Select a customer first" 
                        : prodLoading 
                          ? "Loading products..." 
                          : customerProducts.length === 0 
                            ? "⚠️ No products found for this customer" 
                            : "-- Select a product to auto-fill details --"}
                    </option>
                    {customerProducts.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku || "No SKU"})</option>)}
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Job Title *</label>
                  <input required type="text" value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="e.g., Luxury Perfume Box" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Client's Product Name</label>
                  <input type="text" value={productName} onChange={e => setProductName(e.target.value)} placeholder="Auto-filled" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Client's Product Code</label>
                  <input type="text" value={productCode} onChange={e => setProductCode(e.target.value)} placeholder="Auto-filled" className={inputClass} />
                </div>
                
                <div>
                  <label className={labelClass}>Final Job Quantity *</label>
                  <input required type="number" value={quantity} onChange={e => {
                    setQuantity(e.target.value);
                    setProcesses(processes.map(p => ({ ...p, inputQty: e.target.value, outputQty: e.target.value })));
                  }} placeholder="1000" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Product Size (L x W x H)</label>
                  <input type="text" value={productSize} onChange={e => setProductSize(e.target.value)} placeholder="Auto-filled" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Due Date *</label>
                  <input required type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={`${inputClass} [color-scheme:dark]`} />
                </div>
                
                {/* Fixed template assignment display */}
                <div className="md:col-span-3">
                  <label className={labelClass}>Product Category / Type</label>
                  <input type="text" value={template} readOnly placeholder="Auto-filled category" className={`${inputClass} bg-gray-900/50 cursor-not-allowed`} />
                </div>
                
              </div>
            </div>

            {/* 2. Sheet & Material Specifications */}
            <div className="bg-gray-900/50 p-5 rounded-xl border border-gray-800/60">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-6 h-6 rounded-full bg-primary-600 flex items-center justify-center text-white text-xs font-bold shadow-lg shadow-primary-500/30">2</div>
                <h3 className="text-lg font-bold text-white">Sheet & Material Specifications</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div>
                  <label className={labelClass}>Sheet Size</label>
                  <input type="text" value={sheetSize} onChange={e => setSheetSize(e.target.value)} placeholder="e.g., 25 x 36 inches" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Sheet GSM</label>
                  <input type="text" value={sheetGsm} onChange={e => setSheetGsm(e.target.value)} placeholder="Auto-filled" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Material Type *</label>
                  <input required type="text" value={materialType} onChange={e => setMaterialType(e.target.value)} placeholder="Auto-filled" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Number of Colors</label>
                  <select value={printColors} onChange={e => setPrintColors(e.target.value)} className={inputClass}>
                    <option value="NA">NA</option>
                    <option value="1 Color">1 Color</option>
                    <option value="2 Colors">2 Colors</option>
                    <option value="4 Colors">4 Colors (CMYK)</option>
                  </select>
                </div>
              </div>

              {/* Restored Guillotine Sub-section */}
              <h4 className="text-sm font-bold text-gray-300 mb-3 flex items-center gap-2 mt-6">
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" /></svg>
                Guillotine Cutting Specifications
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className={labelClass}>Sheet Size Before Cutting</label>
                  <input type="text" value={sizeBeforeCut} onChange={e => setSizeBeforeCut(e.target.value)} placeholder="e.g., 25 x 36 inches" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Sheet Size After Cutting</label>
                  <input type="text" value={sizeAfterCut} onChange={e => setSizeAfterCut(e.target.value)} placeholder="e.g., 12.5 x 18 inches" className={inputClass} />
                </div>
              </div>

              {/* Restored Die Cutting Sub-section */}
              <h4 className="text-sm font-bold text-gray-300 mb-3 flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" /></svg>
                Die Cutting Specifications
              </h4>
              <div>
                <label className={labelClass}>Die (Die Cutting)</label>
                <input type="text" value={dieSelect} onChange={e => setDieSelect(e.target.value)} placeholder="e.g., Die #001" className={inputClass} />
              </div>

            </div>

            {/* 3. Prerequisites & Status */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-6 h-6 rounded-full bg-primary-600 flex items-center justify-center text-white text-xs font-bold shadow-lg shadow-primary-500/30">3</div>
                <h3 className="text-lg font-bold text-white">Prerequisites & Status</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className={labelClass}>Priority</label>
                  <select value={priority} onChange={e => setPriority(e.target.value)} className={inputClass}>
                    <option value="Normal">Normal</option>
                    <option value="High">High</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Material Status</label>
                  <select value={materialStatus} onChange={e => setMaterialStatus(e.target.value)} className={inputClass}>
                    <option value="Pending">Pending</option>
                    <option value="Ready">Ready</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Artwork Status</label>
                  <select value={artworkStatus} onChange={e => setArtworkStatus(e.target.value)} className={inputClass}>
                    <option value="Pending">Pending</option>
                    <option value="Approved">Approved</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Artwork Version</label>
                  <input type="text" value={artworkVersion} onChange={e => setArtworkVersion(e.target.value)} placeholder="v1.0" className={inputClass} />
                </div>
              </div>
            </div>

            {/* PROCESS ROUTING */}
            <div className="mt-8">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-white">Process Routing</h3>
                <span className="text-xs text-primary-400 italic">Automatically populated from Product Template</span>
              </div>

              <div className="space-y-4">
                {processes.map((proc, index) => (
                  <div key={proc.id} className="bg-[#111827] border border-gray-800 rounded-lg p-5 flex gap-4">
                    <div className="flex flex-col items-center pt-2 text-gray-600 gap-2 shrink-0">
                      <svg className="w-5 h-5 cursor-grab" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8h16M4 16h16" /></svg>
                      <span className="text-primary-500 font-bold text-sm">{index + 1}</span>
                    </div>

                    <div className="flex-1 space-y-4">
                      <div className="flex items-start gap-4">
                        <div className="flex-1">
                          <label className={labelClass}>Process Name</label>
                          <select required value={proc.process_id} onChange={(e) => updateProcess(proc.id, "process_id", e.target.value)} className={inputClass}>
                            <option value="">-- Select Process --</option>
                            {PROCESS_LIST.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </div>
                        <button type="button" onClick={() => handleRemoveProcess(proc.id)} className="mt-7 text-red-500 hover:text-red-400 transition-colors shrink-0">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>

                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className={labelClass}>Setup (Mins)</label>
                          <input type="number" value={proc.setup} onChange={(e) => updateProcess(proc.id, "setup", e.target.value)} className={inputClass} />
                        </div>
                        <div>
                          <label className={labelClass}>Run (Mins)</label>
                          <input type="number" value={proc.run} onChange={(e) => updateProcess(proc.id, "run", e.target.value)} className={inputClass} />
                        </div>
                        <div>
                          <label className={labelClass}>Hold (Mins)</label>
                          <input type="number" value={proc.hold} onChange={(e) => updateProcess(proc.id, "hold", e.target.value)} className={inputClass} />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className={labelClass}>Input Qty</label>
                          <input type="number" value={proc.inputQty} onChange={(e) => updateProcess(proc.id, "inputQty", e.target.value)} className={inputClass} />
                        </div>
                        <div>
                          <label className={labelClass}>Output Qty</label>
                          <input type="number" value={proc.outputQty} onChange={(e) => updateProcess(proc.id, "outputQty", e.target.value)} className={inputClass} />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button type="button" onClick={handleAddProcess} className="w-full mt-4 bg-gray-900 border border-gray-700 border-dashed hover:border-gray-500 text-gray-400 hover:text-white py-3 rounded-lg text-sm font-medium transition-colors flex justify-center gap-2">
                <span>+</span> Add Extra Process Step
              </button>
            </div>

            {/* Restored Job Notes Section */}
            <div className="mt-8 border-t border-gray-800 pt-8">
              <label className={labelClass}>Job Notes / Instructions</label>
              <textarea 
                rows="3" 
                value={jobNotes}
                onChange={e => setJobNotes(e.target.value)}
                className={`${inputClass} resize-none`} 
                placeholder="Enter any general notes for the factory floor..."
              ></textarea>
            </div>

          </form>
        </div>

        <div className="p-4 border-t border-gray-800 bg-gray-900 shrink-0 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-lg text-gray-400 hover:text-white transition-colors font-medium">Cancel</button>
          <button type="submit" form="jobForm" disabled={loading} className="bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white px-8 py-2.5 rounded-lg font-bold transition-colors">
            {loading ? "Creating..." : "Create Job"}
          </button>
        </div>
      </div>
    </div>
  );
}