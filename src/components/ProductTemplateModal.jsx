import { useState, useEffect } from "react";
import { collection, addDoc, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/config";
import { cleanGsm } from "../utils/helpers";

const defaultSequence = () => ({ id: Date.now(), process_name: "", assigned_machine: "", process_details: {}, remarks: "" });

const defaultMaterialRow = () => ({
  id: Date.now() + Math.random(),
  material_name: "",
  category: "paper",
  piece_purpose: "",
  size: "",
  qty_per_unit: 1,
  unit: "pcs",
  thickness_mm: "",
  gsm: "",
  notes: ""
});

const defaultPart = (partName = "Main Product") => ({
  id: Date.now() + Math.random(),
  part_name: partName,
  qty_per_set: 1,
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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (editingProduct) {
        setName(editingProduct.name || "");
        setSku(editingProduct.sku || "");
        setCategory(editingProduct.category || editingProduct.type || "");
        setCustomerName(editingProduct.customerName || "");
        
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
              thickness_mm: "",
              gsm: cleanGsm(p.paperGsm || p.gsm || ""),
              notes: p.sheet_size ? `Raw Sheet: ${p.sheet_size} | ${p.customMaterial || ""}` : (p.customMaterial || "")
            }];

            return {
              ...p,
              id: p.id || Date.now() + Math.random(),
              materialRows: matRows,
              sequence: p.sequence?.length > 0 ? p.sequence : [defaultSequence()]
            };
          }));
        } else {
          setParts([{
            id: Date.now(),
            part_name: editingProduct.name || "Main Product",
            qty_per_set: 1,
            materialRows: [{
              id: Date.now() + Math.random(),
              material_name: editingProduct.paperType || editingProduct.material || "",
              category: "paper",
              piece_purpose: "Main",
              size: editingProduct.cut_size || editingProduct.size || "",
              qty_per_unit: 1,
              unit: "pcs",
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
    setParts(parts.map(p => {
      if (p.id === partId) {
        const newRows = p.materialRows.map(r => r.id === rowId ? { ...r, [field]: val } : r);
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

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    
    const cleanParts = parts.map(part => ({
      ...part,
      materialRows: part.materialRows.map(r => ({
        ...r, 
        gsm: r.category === 'board' ? "" : cleanGsm(r.gsm),
        thickness_mm: r.category === 'paper' ? "" : r.thickness_mm
      })),
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

  const inputClass = "w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary-500";
  const labelClass = "block text-xs font-semibold text-gray-400 mb-1.5";
  const isMultiPart = parts.length > 1;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl">
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
                    <input required type="text" value={part.part_name} onChange={e => updatePartField(part.id, 'part_name', e.target.value)} className="bg-gray-950 border border-gray-800 rounded px-3 py-1 text-sm font-bold text-white focus:border-primary-500 outline-none" placeholder="Part Label (e.g. Lid)" />
                    <span className="text-xs text-gray-500 ml-2 font-bold uppercase">Mult per set:</span>
                    <input required type="number" min="1" value={part.qty_per_set} onChange={e => updatePartField(part.id, 'qty_per_set', e.target.value)} className="bg-gray-950 border border-gray-800 rounded px-2 py-1 text-sm text-center text-white w-12 outline-none" />
                  </div>
                  {isMultiPart && <button type="button" onClick={() => handleRemovePart(part.id)} className="text-red-500 hover:text-red-400 text-xs font-bold uppercase">Remove Part</button>}
                </div>

                <div className="p-4 space-y-4">
                  
                  <div className="border border-gray-800 rounded-lg overflow-hidden">
                    <div className="bg-gray-950 px-4 py-2 border-b border-gray-800 flex justify-between items-center">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Materials & Cutting List</span>
                      <button type="button" onClick={() => handleMaterialRowAdd(part.id)} className="text-[10px] bg-primary-900/30 text-primary-400 px-2 py-1 rounded hover:bg-primary-500 hover:text-white transition-colors">+ Add Material</button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-gray-900 text-[10px] uppercase text-gray-500 border-b border-gray-800">
                            <th className="p-2 font-bold w-6 text-center">⇅</th>
                            <th className="p-2 font-bold min-w-[140px]">Material (Inventory/Text)</th>
                            <th className="p-2 font-bold w-24">Type</th>
                            <th className="p-2 font-bold w-20">Thk / GSM</th>
                            <th className="p-2 font-bold w-32">Piece / Purpose</th>
                            <th className="p-2 font-bold w-24">Size (L×W)</th>
                            <th className="p-2 font-bold w-20">Qty/Unit</th>
                            <th className="p-2 font-bold w-24">Unit</th>
                            <th className="p-2 font-bold">Notes</th>
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
                              <td className="p-1.5">
                                {/* ⭐️ ROUND 7.2 FIX: Reads the correct inventory label field for the autocomplete options */}
                                <input 
                                  type="text" 
                                  list={`inv-list-${row.id}`}
                                  placeholder="e.g. Kappa 2mm" 
                                  value={row.material_name} 
                                  onChange={e => handleMaterialRowChange(part.id, row.id, 'material_name', e.target.value)} 
                                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white" 
                                />
                                <datalist id={`inv-list-${row.id}`}>
                                  {inventoryItems?.map(i => {
                                    const displayLabel = i.name || i.itemName || i.label || "Unnamed Material";
                                    return (
                                      <option key={i.id} value={displayLabel}>
                                        {displayLabel} (Stock: {i.qty || i.balance || 0})
                                      </option>
                                    );
                                  })}
                                </datalist>
                              </td>
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

                  <div className="bg-gray-950 p-4 rounded border border-gray-800 space-y-3">
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
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-400 bg-gray-950 rounded">Cancel</button>
            <button type="submit" disabled={saving} className="bg-primary-600 hover:bg-primary-500 text-white font-bold px-6 py-2 rounded shadow-lg">
              {saving ? "Saving..." : "Save Template"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}