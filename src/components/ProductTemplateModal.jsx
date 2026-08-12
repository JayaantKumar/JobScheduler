import { useState, useEffect } from "react";
import { collection, addDoc, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../firebase/config";
import { cleanGsm, formatInventoryLabel } from "../utils/helpers";

const defaultSequence = () => ({ id: Date.now(), process_name: "", assigned_machine: "", process_details: {}, remarks: "" });

const defaultMaterialRow = () => ({
  id: Date.now() + Math.random(),
  material_name: "",
  category: "paper",
  piece_purpose: "",
  size: "",
  qty_per_unit: 1,
  unit: "sheets",
  basis: "per_step", 
  basis_step_index: 0,
  thickness_mm: "",
  gsm: "",
  notes: ""
});

const defaultPart = (partName = "Main Product") => ({
  id: Date.now() + Math.random(),
  part_name: partName,
  qty_per_set: 1,
  artwork_required: true, 
  materialRows: [defaultMaterialRow()],
  sequence: [defaultSequence()]
});

export default function ProductTemplateModal({
  isOpen,
  onClose,
  editingProduct,
  customers,
  categories,
  machines,
  dbProcesses,
  dies,
  inventoryItems,
  onSaveSuccess,
  openInlineModal
}) {
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [parts, setParts] = useState([defaultPart()]);
  
  const [files, setFiles] = useState([]); 
  const [saving, setSaving] = useState(false);

  const [pickerState, setPickerState] = useState({ openId: null, search: "", includeOutOfStock: false });

  useEffect(() => {
    if (isOpen) {
      if (editingProduct) {
        setName(editingProduct.name || "");
        setSku(editingProduct.sku || "");
        setCategory(editingProduct.category || editingProduct.type || "");
        setCustomerName(editingProduct.customerName || "");
        setFiles(editingProduct.files || []); 
        
        if (editingProduct.parts && editingProduct.parts.length > 0) {
          setParts(editingProduct.parts.map(p => {
            const matRows = p.materialRows?.length > 0 ? p.materialRows : [{
              id: Date.now() + Math.random(),
              material_name: p.paperType || p.material || "",
              category: "paper",
              piece_purpose: p.part_name || "Main",
              size: p.cut_size || p.size || "",
              qty_per_unit: 1,
              unit: "pcs",
              basis: "per_piece",
              basis_step_index: 0,
              thickness_mm: "",
              gsm: cleanGsm(p.paperGsm || p.gsm || ""),
              notes: p.sheet_size ? `Raw Sheet: ${p.sheet_size} | ${p.customMaterial || ""}` : (p.customMaterial || "")
            }];

            return {
              ...p,
              id: p.id || Date.now() + Math.random(),
              artwork_required: p.artwork_required ?? true, 
              materialRows: matRows,
              sequence: p.sequence?.length > 0 ? p.sequence : [defaultSequence()]
            };
          }));
        } else {
          setParts([{
            id: Date.now(),
            part_name: editingProduct.name || "Main Product",
            qty_per_set: 1,
            artwork_required: editingProduct.artwork_required ?? true,
            materialRows: [{
              id: Date.now() + Math.random(),
              material_name: editingProduct.paperType || editingProduct.material || "",
              category: "paper",
              piece_purpose: "Main",
              size: editingProduct.cut_size || editingProduct.size || "",
              qty_per_unit: 1,
              unit: "pcs",
              basis: "per_piece",
              basis_step_index: 0,
              thickness_mm: "",
              gsm: cleanGsm(editingProduct.paperGsm || editingProduct.gsm || ""),
              notes: editingProduct.sheet_size ? `Raw Sheet: ${editingProduct.sheet_size}` : ""
            }],
            sequence: editingProduct.default_sequence?.length > 0 ? editingProduct.default_sequence : [defaultSequence()]
          }]);
        }
      } else {
        setName(""); setSku(""); setCategory(""); setCustomerName("");
        setParts([defaultPart()]);
        setFiles([]);
      }
    }
  }, [isOpen, editingProduct]);

  if (!isOpen) return null;

  const handleCustomerSelect = (e) => {
    if (e.target.value === "ADD_NEW") openInlineModal("Customer");
    else setCustomerName(e.target.value);
  };

  const handleCategorySelect = (e) => {
    if (e.target.value === "ADD_NEW") openInlineModal("Product Category");
    else setCategory(e.target.value);
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

  const handleMaterialRowAdd = (partId) => {
    setParts(parts.map(p => p.id === partId ? { ...p, materialRows: [...(p.materialRows || []), defaultMaterialRow()] } : p));
  };
  
  const handleMaterialRowRemove = (partId, rowId) => {
    setParts(parts.map(p => p.id === partId ? { ...p, materialRows: p.materialRows.filter(r => r.id !== rowId) } : p));
  };

  const handleMaterialRowChange = (partId, rowId, field, val) => {
    setParts(prevParts => prevParts.map(p => {
      if (p.id === partId) {
        const newRows = p.materialRows.map(r => {
          if (r.id === rowId) {
            let updates = { [field]: val };
            if (field === 'category') {
               if (val === 'paper' || val === 'board' || val === 'rigid') {
                  updates.basis = 'per_step';
                  updates.unit = 'sheets';
               } else {
                  updates.basis = 'per_piece';
                  updates.unit = 'pcs';
               }
            }
            return { ...r, ...updates };
          }
          return r;
        });
        return { ...p, materialRows: newRows };
      }
      return p;
    }));
  };

  // ⭐️ ROUND 14 FIX: Handle Bulk Update for Material Picker
  const handleMaterialItemSelect = (partId, rowId, item) => {
    setParts(prevParts => prevParts.map(p => {
      if (p.id === partId) {
        const newRows = p.materialRows.map(r => {
          if (r.id === rowId) {
            const catL = item.baseCategory.toLowerCase();
            let newCategory = 'other';
            if (catL.includes('board') || catL.includes('kappa') || catL.includes('rigid')) newCategory = 'board';
            else if (catL.includes('paper') || catL.includes('art') || catL.includes('kraft')) newCategory = 'paper';

            return {
              ...r,
              material_name: item.formattedLabel,
              material_id: item.id, // Store ID to link with inventory snapshot on Jobs
              category: newCategory,
              basis: (newCategory === 'paper' || newCategory === 'board' || newCategory === 'rigid') ? 'per_step' : 'per_piece',
              unit: item.unit || ((newCategory === 'paper' || newCategory === 'board' || newCategory === 'rigid') ? 'sheets' : 'pcs'),
              gsm: item.gsm || "",
              thickness_mm: item.thickness || item.thickness_mm || "",
              size: item.size || ""
            };
          }
          return r;
        });
        return { ...p, materialRows: newRows };
      }
      return p;
    }));
  };

  const handleMaterialRowMove = (partId, index, direction) => {
    setParts(parts.map(p => {
      if (p.id === partId) {
        const newRows = [...p.materialRows];
        if (direction === 'up' && index > 0) {
          [newRows[index - 1], newRows[index]] = [newRows[index], newRows[index - 1]];
        } else if (direction === 'down' && index < newRows.length - 1) {
          [newRows[index + 1], newRows[index]] = [newRows[index], newRows[index + 1]];
        }
        return { ...p, materialRows: newRows };
      }
      return p;
    }));
  };

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

  const handleFileSelect = (e) => {
    const selected = Array.from(e.target.files);
    const validFiles = [];
    selected.forEach(f => {
      if (f.size > 25 * 1024 * 1024) {
        alert(`File ${f.name} exceeds the 25MB limit.`);
        return;
      }
      validFiles.push({
        id: Date.now() + Math.random(),
        rawFile: f, 
        name: f.name,
        category: "Artwork",
        applies_to: "All Parts", 
        purpose: "",             
        version: "v1",
        status: "Draft",
        notes: "",
        url: null, 
        uploaded_at: new Date().toISOString()
      });
    });
    if (validFiles.length > 0) setFiles([...files, ...validFiles]);
    e.target.value = null; 
  };

  const handleFileChange = (fileId, field, val) => {
    setFiles(prev => {
      let updated = prev.map(f => f.id === fileId ? { ...f, [field]: val } : f);
      
      const modifiedFile = updated.find(f => f.id === fileId);
      if (modifiedFile && modifiedFile.status === "APPROVED") {
        updated = updated.map(f => {
          const fAppliesTo = f.applies_to || "All Parts";
          const modAppliesTo = modifiedFile.applies_to || "All Parts";
          const fPurpose = (f.purpose || "").toLowerCase().trim();
          const modPurpose = (modifiedFile.purpose || "").toLowerCase().trim();

          if (
            f.id !== fileId && 
            f.category === modifiedFile.category && 
            f.status === "APPROVED" &&
            fAppliesTo === modAppliesTo &&
            fPurpose === modPurpose
          ) {
            return { ...f, status: "Superseded" };
          }
          return f;
        });
      }
      return updated;
    });
  };

  const handleRemoveFile = (fileId) => {
    setFiles(files.filter(f => f.id !== fileId));
  };

  const copyShareLink = (url) => {
    if (!url) return alert("Save the product first to generate a live link.");
    navigator.clipboard.writeText(url);
    alert("Share link copied to clipboard!");
  };

  const handleSave = async (e) => {
    e.preventDefault();

    // ⭐️ ROUND 14 FIX: Strict Validation - Block empty material names with quantities
    for (const part of parts) {
      const invalidRow = part.materialRows?.find(r => 
        (!r.material_name || r.material_name.trim() === "") && Number(r.qty_per_unit) > 0
      );
      if (invalidRow) {
        alert(`Validation Error in ${part.part_name}: You have a material row with a quantity (${invalidRow.qty_per_unit}) but no material selected.\n\nPlease select a material from the dropdown or remove the row before saving.`);
        return; // Halt save completely
      }
    }

    setSaving(true);
    
    try {
      const processedFiles = await Promise.all(files.map(async (fileObj) => {
        if (fileObj.rawFile) {
          const fileExt = fileObj.name.split('.').pop();
          const cleanName = fileObj.name.replace(`.${fileExt}`, '').replace(/[^a-zA-Z0-9]/g, '_');
          const storagePath = `products/${Date.now()}_${cleanName}.${fileExt}`;
          const storageRef = ref(storage, storagePath);
          
          await uploadBytes(storageRef, fileObj.rawFile);
          const downloadUrl = await getDownloadURL(storageRef);
          
          const { rawFile: _rawFile, ...rest } = fileObj;
          return { ...rest, url: downloadUrl };
        }
        return fileObj; 
      }));

      const cleanParts = parts.map(part => ({
        ...part,
        materialRows: part.materialRows
          .filter(r => r.material_name && r.material_name.trim() !== "")
          .map(r => ({
            ...r, 
            gsm: r.category === 'board' ? "" : cleanGsm(r.gsm),
            thickness_mm: r.category === 'paper' ? "" : r.thickness_mm
        })),
        sequence: part.sequence.filter(s => s.process_name.trim() !== "").map((s, idx) => ({ ...s, step_order: idx + 1 }))
      }));

      const payload = {
        name, sku, category, customerName,
        parts: cleanParts,
        files: processedFiles,
        updated_at: serverTimestamp()
      };

      let savedProdData = { ...payload };
      if (editingProduct) {
        await updateDoc(doc(db, "products", editingProduct.id), payload);
        savedProdData.id = editingProduct.id;
      } else {
        const docRef = await addDoc(collection(db, "products"), { ...payload, created_at: serverTimestamp() });
        savedProdData.id = docRef.id; 
      }
      onSaveSuccess(savedProdData);
    } catch (error) { 
      alert("Error saving product: " + error.message); 
    } finally { 
      setSaving(false); 
    }
  };

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

  const renderMaterialPicker = (partId, row) => {
    const isOpen = pickerState.openId === row.id;
    const query = (pickerState.search || "").toLowerCase();
    
    let filteredItems = [];
    if (isOpen) {
        filteredItems = inventoryItems.map(item => {
            const formattedLabel = formatInventoryLabel(item);
            const baseCategory = formattedLabel.split('·')[0].trim();
            return {
                ...item,
                formattedLabel,
                baseCategory,
                stock: Number(item.qty || item.balance || 0)
            };
        }).filter(item => {
            if (!pickerState.includeOutOfStock && item.stock <= 0) return false;
            if (query) return item.formattedLabel.toLowerCase().includes(query);
            return true;
        });
    }

    const grouped = {};
    filteredItems.forEach(item => {
        if (!grouped[item.baseCategory]) grouped[item.baseCategory] = [];
        grouped[item.baseCategory].push(item);
    });
    
    const sortedCategories = Object.keys(grouped).sort();
    sortedCategories.forEach(cat => grouped[cat].sort((a, b) => a.formattedLabel.localeCompare(b.formattedLabel)));

    return (
      <td className="p-1.5 relative">
         <input 
           type="text" 
           placeholder="Search or type custom..." 
           value={isOpen ? pickerState.search : row.material_name} 
           onChange={e => setPickerState(prev => ({ ...prev, search: e.target.value }))}
           onFocus={() => setPickerState({ openId: row.id, search: row.material_name, includeOutOfStock: pickerState.includeOutOfStock })}
           onBlur={() => {
             setTimeout(() => {
               if (pickerState.openId === row.id) {
                  handleMaterialRowChange(partId, row.id, 'material_name', pickerState.search || row.material_name);
                  setPickerState(prev => ({ ...prev, openId: null }));
               }
             }, 250);
           }}
           className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white focus:border-primary-500 outline-none" 
         />
         
         {isOpen && (
           <div className="absolute top-full left-0 mt-1 w-[400px] max-h-72 overflow-y-auto bg-gray-800 border border-gray-700 rounded-lg shadow-2xl z-[99999] custom-scrollbar flex flex-col">
              <div className="p-2 border-b border-gray-700 sticky top-0 bg-gray-900 z-10 flex justify-between items-center shrink-0">
                 <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Select Material</span>
                 <label className="flex items-center gap-1.5 text-[10px] font-bold text-gray-300 cursor-pointer bg-gray-800 px-2 py-1 rounded hover:bg-gray-700 transition-colors">
                    <input 
                      type="checkbox" 
                      checked={pickerState.includeOutOfStock} 
                      onChange={(e) => setPickerState(prev => ({ ...prev, includeOutOfStock: e.target.checked }))} 
                      className="rounded bg-gray-900 border-gray-600 focus:ring-primary-500"
                    />
                    Include out-of-stock
                 </label>
              </div>
              
              <div className="flex-1 overflow-y-auto">
                  {sortedCategories.length === 0 ? (
                     <div className="p-4 text-xs text-gray-500 text-center italic">No materials found. Type to use a custom material.</div>
                  ) : (
                     sortedCategories.map(cat => (
                       <div key={cat} className="border-b border-gray-700/50 last:border-0">
                         <div className="px-3 py-1.5 bg-gray-900 text-[10px] font-black text-primary-400 uppercase tracking-widest sticky top-0 border-b border-gray-800">{cat}</div>
                         {grouped[cat].map(item => (
                           <div 
                             key={item.id} 
                             className="px-3 py-2 cursor-pointer hover:bg-primary-900/40 flex justify-between items-center transition-colors border-l-2 border-transparent hover:border-primary-500"
                             onMouseDown={(e) => { 
                                e.preventDefault();
                                // ⭐️ ROUND 14 FIX: Using the bulk update function here
                                handleMaterialItemSelect(partId, row.id, item);
                                setPickerState(prev => ({ ...prev, openId: null }));
                             }}
                           >
                             <span className="text-xs text-white font-medium truncate pr-4">{item.formattedLabel}</span>
                             <span className={`text-[10px] font-mono whitespace-nowrap px-1.5 py-0.5 rounded ${item.stock > 0 ? 'bg-green-500/10 text-green-500/60' : 'bg-red-500/10 text-red-500/60'}`}>
                                (Stock: {item.stock})
                             </span>
                           </div>
                         ))}
                       </div>
                     ))
                  )}
              </div>
           </div>
         )}
      </td>
    );
  };

  const inputClass = "w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary-500";
  const labelClass = "block text-xs font-semibold text-gray-400 mb-1.5";
  const isMultiPart = parts.length > 1;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex justify-between items-center p-6 border-b border-gray-800 shrink-0 bg-[#151724]">
          <h2 className="text-xl font-bold text-white">{editingProduct ? "Edit Product Template" : "Add New Product Template"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white bg-gray-800 p-2 rounded-lg"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>

        <form onSubmit={handleSave} className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6 bg-[#0a0f1a]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-5 bg-gray-950/40 rounded-xl border border-gray-800">
            <div><label className={labelClass}>Product Master Name *</label><input required type="text" value={name} onChange={e => setName(e.target.value)} className={inputClass} /></div>
            <div><label className={labelClass}>SKU / Item Code</label><input type="text" value={sku} onChange={e => setSku(e.target.value)} className={inputClass} /></div>
            <div>
              <label className={labelClass}>Assigned Customer *</label>
              <select required value={customerName} onChange={handleCustomerSelect} className={inputClass}>
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

          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-lg">
            <div className="bg-[#151724] border-b border-gray-800 p-4 flex justify-between items-center">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <svg className="w-4 h-4 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                Master Files & Assets
              </h3>
              <label className="bg-gray-800 hover:bg-gray-700 text-white text-xs font-bold px-4 py-2 rounded-lg cursor-pointer border border-gray-700 transition-colors">
                + Upload File
                <input type="file" multiple accept=".pdf,.ai,.cdr,.eps,.psd,.jpg,.jpeg,.png,.xlsx,.docx" className="hidden" onChange={handleFileSelect} />
              </label>
            </div>
            {files.length > 0 ? (
              <div className="p-4 overflow-x-auto">
                <table className="w-full text-left min-w-[800px]">
                  <thead>
                    <tr className="bg-gray-950 text-[10px] uppercase text-gray-500 border-b border-gray-800">
                      <th className="p-2 font-bold min-w-[120px]">File Name</th>
                      <th className="p-2 font-bold w-28">Category</th>
                      <th className="p-2 font-bold w-32">Applies To</th>
                      <th className="p-2 font-bold w-28">Purpose Label</th>
                      <th className="p-2 font-bold w-16">Version</th>
                      <th className="p-2 font-bold w-32">Status</th>
                      <th className="p-2 font-bold">Notes</th>
                      <th className="p-2 w-20 text-center">Share</th>
                      <th className="p-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800 bg-gray-950/50">
                    {files.map((file) => {
                      const isSuperseded = file.status === "Superseded";
                      return (
                        <tr key={file.id} className={isSuperseded ? "opacity-50" : ""}>
                          <td className="p-2 text-xs text-white truncate max-w-[120px]" title={file.name}>
                            <span className={isSuperseded ? "line-through text-gray-500" : ""}>{file.name}</span>
                            {file.rawFile && <span className="ml-2 text-[9px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded uppercase font-bold">Pending Save</span>}
                          </td>
                          <td className="p-2">
                            <select value={file.category} onChange={e => handleFileChange(file.id, 'category', e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white">
                              <option value="Artwork">Artwork</option>
                              <option value="Dieline">Dieline</option>
                              <option value="Mockup / 3D">Mockup / 3D</option>
                              <option value="Client PO">Client PO</option>
                              <option value="Sample Photo">Sample Photo</option>
                              <option value="Quality Reference">Quality Reference</option>
                              <option value="Other">Other</option>
                            </select>
                          </td>
                          <td className="p-2">
                            <select value={file.applies_to || "All Parts"} onChange={e => handleFileChange(file.id, 'applies_to', e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white">
                              <option value="All Parts">All Parts</option>
                              {parts.map((p, idx) => (
                                <option key={p.id} value={p.id}>Part {String.fromCharCode(65 + idx)}: {p.part_name}</option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2">
                            <input type="text" placeholder="e.g. Outer surface" value={file.purpose || ""} onChange={e => handleFileChange(file.id, 'purpose', e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white" />
                          </td>
                          <td className="p-2">
                            <input type="text" placeholder="v1" value={file.version} onChange={e => handleFileChange(file.id, 'version', e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white" />
                          </td>
                          <td className="p-2">
                            <select value={file.status} onChange={e => handleFileChange(file.id, 'status', e.target.value)} className={`w-full bg-gray-900 border rounded px-2 py-1 text-xs font-bold ${file.status === 'APPROVED' ? 'border-green-500/50 text-green-400' : 'border-gray-700 text-white'}`}>
                              <option value="Draft">Draft</option>
                              <option value="Sent for Approval">Sent for Approval</option>
                              <option value="APPROVED">APPROVED</option>
                              <option value="Superseded">Superseded</option>
                              <option value="Rejected">Rejected</option>
                            </select>
                          </td>
                          <td className="p-2">
                            <input type="text" placeholder="Optional notes..." value={file.notes} onChange={e => handleFileChange(file.id, 'notes', e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white" />
                          </td>
                          <td className="p-2 text-center">
                            <button type="button" onClick={() => copyShareLink(file.url)} disabled={!file.url} className="text-[10px] uppercase font-bold text-primary-400 hover:text-white disabled:opacity-30 disabled:hover:text-primary-400 bg-primary-900/20 px-2 py-1 rounded">
                              Copy Link
                            </button>
                          </td>
                          <td className="p-2 text-center">
                            <button type="button" onClick={() => handleRemoveFile(file.id)} className="text-gray-600 hover:text-red-400 font-bold text-xs">✕</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-6 text-center text-sm text-gray-500">
                No files attached. Upload artwork, dielines, and client POs here.
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="flex justify-between items-end border-b-2 border-gray-800 pb-2">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Product Parts Specs</h3>
              <button type="button" onClick={handleAddPart} className="bg-primary-600 hover:bg-primary-500 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-lg">+ Add Another Part</button>
            </div>

            {parts.map((part, pIndex) => (
              <div key={part.id} className="bg-gray-900 border border-gray-800 rounded-xl shadow-lg">
                <div className="bg-[#151724] border-b border-gray-800 p-4 rounded-t-xl flex justify-between items-center flex-wrap gap-4">
                  <div className="flex items-center gap-3">
                    <span className="bg-primary-500/20 text-primary-400 font-bold w-8 h-8 rounded flex items-center justify-center border border-primary-500/30">{String.fromCharCode(65 + pIndex)}</span>
                    <input required type="text" value={part.part_name} onChange={e => updatePartField(part.id, 'part_name', e.target.value)} className="bg-gray-950 border border-gray-800 rounded px-3 py-1 text-sm font-bold text-white focus:border-primary-500 outline-none" placeholder="Part Label (e.g. Lid)" />
                    <span className="text-xs text-gray-500 ml-2 font-bold uppercase">Mult per set:</span>
                    <input required type="number" min="1" value={part.qty_per_set} onChange={e => updatePartField(part.id, 'qty_per_set', e.target.value)} className="bg-gray-950 border border-gray-800 rounded px-2 py-1 text-sm text-center text-white w-12 outline-none" />
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <label className={`flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg border transition-colors ${part.artwork_required ? 'bg-primary-900/10 border-primary-500/30' : 'bg-gray-950 border-gray-800'}`}>
                      <input 
                        type="checkbox" 
                        checked={part.artwork_required} 
                        onChange={e => updatePartField(part.id, 'artwork_required', e.target.checked)} 
                        className="w-4 h-4 rounded bg-gray-900 border-gray-700 text-primary-600 focus:ring-primary-500" 
                      />
                      <span className={`text-xs font-bold uppercase tracking-wider ${part.artwork_required ? 'text-primary-400' : 'text-gray-500'}`}>
                        {part.artwork_required ? "🎨 Artwork Required" : "Plain / Unprinted"}
                      </span>
                    </label>

                    {isMultiPart && <button type="button" onClick={() => handleRemovePart(part.id)} className="text-red-500 hover:text-red-400 text-xs font-bold uppercase">Remove Part</button>}
                  </div>
                </div>

                <div className="p-4 space-y-4">
                  <div className="border border-gray-800 rounded-lg overflow-visible relative">
                    <div className="bg-gray-950 px-4 py-2 border-b border-gray-800 flex justify-between items-center rounded-t-lg">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Materials & Cutting List</span>
                      <button type="button" onClick={() => handleMaterialRowAdd(part.id)} className="text-[10px] bg-primary-900/30 text-primary-400 px-2 py-1 rounded hover:bg-primary-500 hover:text-white transition-colors">+ Add Material</button>
                    </div>
                    
                    <div className="w-full relative">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-gray-900 text-[10px] uppercase text-gray-500 border-b border-gray-800">
                            <th className="p-2 font-bold w-6 text-center">⇅</th>
                            <th className="p-2 font-bold min-w-[200px]">Material (Inventory/Text)</th>
                            <th className="p-2 font-bold w-24">Type</th>
                            <th className="p-2 font-bold w-20">Thk / GSM</th>
                            <th className="p-2 font-bold w-32">Piece / Purpose</th>
                            <th className="p-2 font-bold w-24">Size (L×W)</th>
                            <th className="p-2 font-bold w-16">Qty/Unit</th>
                            <th className="p-2 font-bold w-24">Unit</th>
                            <th className="p-2 font-bold w-28">Basis Calc</th>
                            <th className="p-2 font-bold min-w-[120px]">Notes</th>
                            <th className="p-2 w-8"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800 bg-gray-950/50">
                          {part.materialRows?.map((row, rIdx) => (
                            <tr key={row.id}>
                              <td className="p-1.5 text-center">
                                <div className="flex flex-col gap-1 items-center justify-center">
                                  <button type="button" onClick={() => handleMaterialRowMove(part.id, rIdx, 'up')} className="text-gray-600 hover:text-white" disabled={rIdx === 0}>▲</button>
                                  <button type="button" onClick={() => handleMaterialRowMove(part.id, rIdx, 'down')} className="text-gray-600 hover:text-white" disabled={rIdx === part.materialRows.length - 1}>▼</button>
                                </div>
                              </td>
                              
                              {renderMaterialPicker(part.id, row)}

                              <td className="p-1.5">
                                <select value={row.category} onChange={e => handleMaterialRowChange(part.id, row.id, 'category', e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white">
                                  <option value="paper">Paper/Art</option>
                                  <option value="board">Board/Rigid</option>
                                  <option value="other">Other/Acc</option>
                                </select>
                              </td>
                              <td className="p-1.5">
                                {row.category === 'board' ? (
                                  <input type="number" step="any" placeholder="mm" value={row.thickness_mm} onChange={e => handleMaterialRowChange(part.id, row.id, 'thickness_mm', e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white" />
                                ) : row.category === 'paper' ? (
                                  <input type="number" placeholder="GSM" value={row.gsm} onChange={e => handleMaterialRowChange(part.id, row.id, 'gsm', e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white" />
                                ) : (
                                  <span className="text-gray-600 text-xs px-2">—</span>
                                )}
                              </td>
                              <td className="p-1.5"><input type="text" placeholder="e.g. Side Long" value={row.piece_purpose} onChange={e => handleMaterialRowChange(part.id, row.id, 'piece_purpose', e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white" /></td>
                              <td className="p-1.5"><input type="text" placeholder="10x2 in" value={row.size} onChange={e => handleMaterialRowChange(part.id, row.id, 'size', e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white" /></td>
                              <td className="p-1.5"><input type="number" min="0" step="any" value={row.qty_per_unit} onChange={e => handleMaterialRowChange(part.id, row.id, 'qty_per_unit', e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white" /></td>
                              <td className="p-1.5">
                                <select value={row.unit} onChange={e => handleMaterialRowChange(part.id, row.id, 'unit', e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white">
                                  <option value="pcs">pcs</option>
                                  <option value="sheets">sheets</option>
                                  <option value="meters">meters</option>
                                  <option value="grams">grams</option>
                                </select>
                              </td>
                              <td className="p-1.5 text-center bg-gray-950">
                                <select value={row.basis || 'per_piece'} onChange={e => handleMaterialRowChange(part.id, row.id, 'basis', e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-[9px] text-white font-bold uppercase tracking-wider mb-1">
                                  <option value="per_piece">Per Fin. Piece</option>
                                  <option value="per_step">Per Step In</option>
                                  <option value="fixed">Fixed Total</option>
                                </select>
                                {row.basis === 'per_step' && (
                                   <select value={row.basis_step_index || 0} onChange={e => handleMaterialRowChange(part.id, row.id, 'basis_step_index', Number(e.target.value))} className="w-full bg-gray-800 border border-gray-600 rounded px-1 py-1 text-[9px] text-gray-300 outline-none">
                                     {part.sequence.map((s, sIdx) => (
                                       <option key={s.id} value={sIdx}>Step {sIdx + 1}</option>
                                     ))}
                                   </select>
                                )}
                              </td>
                              <td className="p-1.5"><input type="text" placeholder="Notes" value={row.notes} onChange={e => handleMaterialRowChange(part.id, row.id, 'notes', e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white" /></td>
                              <td className="p-1.5 text-center">
                                {part.materialRows.length > 1 && (
                                  <button type="button" onClick={() => handleMaterialRowRemove(part.id, row.id)} className="text-gray-600 hover:text-red-400 font-bold text-xs">✕</button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="bg-gray-950 p-4 rounded border border-gray-800 space-y-3 relative z-0">
                    {part.sequence.map((step, idx) => (
                      <div key={step.id} className="flex flex-col gap-2 border-l-2 border-gray-800 pl-3 py-1">
                        <div className="flex gap-3 items-center">
                          <span className="text-xs font-bold text-gray-600 w-4 font-mono">{idx+1}.</span>
                          <select required value={step.process_name} className="bg-gray-900 border border-gray-700 rounded p-1.5 text-xs text-white flex-1" onChange={(e) => handleSequenceChange(part.id, step.id, 'process_name', e.target.value)}>
                            <option value="">-- Select Process --</option>
                            {dbProcesses.map(p => <option key={p.id} value={p.processName}>{p.processName}</option>)}
                          </select>
                          <select required value={step.assigned_machine} className="bg-gray-900 border border-gray-700 rounded p-1.5 text-xs text-white flex-1" onChange={(e) => handleSequenceChange(part.id, step.id, 'assigned_machine', e.target.value)}>
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
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-400 bg-gray-950 rounded hover:text-white transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="bg-primary-600 hover:bg-primary-500 text-white font-bold px-6 py-2 rounded shadow-lg flex items-center gap-2 transition-colors disabled:opacity-50">
              {saving ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Saving & Uploading...
                </>
              ) : "Save Template"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}