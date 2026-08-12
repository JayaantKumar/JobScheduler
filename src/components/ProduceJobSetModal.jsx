import { useState, useEffect } from "react";
import { collection, doc, query, where, getDocs, writeBatch } from "firebase/firestore";
import { db } from "../firebase/config";
import { cleanGsm, formatInventoryLabel } from "../utils/helpers";

export default function ProduceJobSetModal({
  isOpen,
  onClose,
  activeProduceProduct,
  produceQty,
  handleProduceQtyChange,
  produceDate,
  setProduceDate,
  produceParts,
  updatePartSets,
  updatePartMultiplier,
  toggleCustomOverride,
  updatePartCustomPcs,
  handleStepQtyChange,
  togglePartExpanded,
  updatePartNotes, 
  machines,
  dbProcesses,
  inventoryItems,
  dies,
  locations,
  onSuccess
}) {
  const [producing, setProducing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [localMaterials, setLocalMaterials] = useState([]);
  const [pickerState, setPickerState] = useState({ openId: null, search: "", includeOutOfStock: false });

  // Initialize local materials from the master product template when modal opens
  useEffect(() => {
    if (isOpen && activeProduceProduct && produceParts.length > 0) {
      const initialMats = produceParts.map((p, i) => {
        const masterPart = activeProduceProduct.parts.find(mp => mp.id === p.id) || activeProduceProduct.parts[i];
        const rows = masterPart?.materialRows || [];
        
        // Fallback: If template has no rows, provide a default empty row so the table is never blank
        if (rows.length === 0) {
          return [{
            id: Date.now() + Math.random(),
            material_name: "",
            category: "paper",
            piece_purpose: "Main",
            size: "",
            qty_per_unit: 1,
            unit: "sheets",
            basis: "per_step",
            basis_step_index: 0,
            is_substituted: false
          }];
        }
        
        // ⭐️ ROUND 16 FIX (POINT 2): Strictly inherit template Basis Calc settings
        return rows.map(r => {
           const cat = (r.category || '').toLowerCase();
           const isBoardOrPaper = cat === 'paper' || cat === 'board' || cat === 'rigid' || cat.includes('kraft') || cat.includes('kappa');
           return {
             ...r,
             basis: r.basis || (isBoardOrPaper ? 'per_step' : 'per_piece'),
             basis_step_index: r.basis_step_index !== undefined ? Number(r.basis_step_index) : 0,
             is_substituted: false
           };
        });
      });
      setLocalMaterials(initialMats);
    }
  }, [isOpen, activeProduceProduct, produceParts]);

  if (!isOpen) return null;

  // -- Material Override Handlers --
  const handleLocalMaterialItemSelect = (pIdx, rowId, item) => {
    setLocalMaterials(prev => {
      const newMats = [...prev];
      newMats[pIdx] = newMats[pIdx].map(r => {
        if (r.id === rowId) {
          const rawCat = (item.category || item.baseCategory || "").toLowerCase();
          let newCategory = 'other';
          
          if (rawCat.includes('paper') || rawCat.includes('art') || rawCat.includes('kraft')) newCategory = 'paper';
          else if (rawCat.includes('board') || rawCat.includes('kappa') || rawCat.includes('rigid')) newCategory = 'board';

          const labelParts = (item.formattedLabel || "").split('·').map(s => s.trim());
          let extractedGsm = item.gsm || item.thickness || item.thickness_mm || "";
          let extractedSize = item.size || "";

          if (labelParts.length >= 2) {
             const specPart = labelParts.find(part => part.toLowerCase().includes('gsm') || part.toLowerCase().includes('mm'));
             if (!extractedGsm && specPart) {
                 extractedGsm = specPart.replace(/[^\d.]/g, ''); 
             }
             
             const sizePart = labelParts.find(part => part.includes('x') || part.includes('*') || part.includes('in'));
             if (!extractedSize && sizePart) {
                 extractedSize = sizePart;
             } else if (!extractedSize && labelParts.length >= 3) {
                 extractedSize = labelParts[2];
             }
          }

          return {
            ...r,
            material_name: item.formattedLabel,
            material_id: item.id, 
            category: newCategory,
            basis: (newCategory === 'paper' || newCategory === 'board' || newCategory === 'rigid') ? 'per_step' : 'per_piece',
            unit: item.unit || ((newCategory === 'paper' || newCategory === 'board' || newCategory === 'rigid') ? 'sheets' : 'pcs'),
            gsm: newCategory === 'paper' ? extractedGsm : "",
            thickness_mm: newCategory === 'board' ? extractedGsm : "",
            size: extractedSize,
            is_substituted: true 
          };
        }
        return r;
      });
      return newMats;
    });
  };

  const updateLocalMaterial = (pIdx, rowId, field, val) => {
    setLocalMaterials(prev => {
      const newMats = [...prev];
      newMats[pIdx] = newMats[pIdx].map(r => {
        if (r.id === rowId) return { ...r, [field]: val, is_substituted: true };
        return r;
      });
      return newMats;
    });
  };

  const addLocalMaterial = (pIdx) => {
    setLocalMaterials(prev => {
      const newMats = [...prev];
      newMats[pIdx] = [
        ...(newMats[pIdx] || []), 
        { 
          id: Date.now() + Math.random(), 
          material_name: "", category: "paper", piece_purpose: "Extra Consumable", 
          size: "", qty_per_unit: 1, unit: "pcs", basis: "fixed", 
          basis_step_index: 0, is_substituted: true 
        }
      ];
      return newMats;
    });
  };

  const removeLocalMaterial = (pIdx, rowId) => {
     setLocalMaterials(prev => {
      const newMats = [...prev];
      newMats[pIdx] = newMats[pIdx].filter(r => r.id !== rowId);
      return newMats;
    });
  };

  const renderMaterialPicker = (pIdx, row) => {
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
      <td className="py-1.5 pr-2 relative">
         <div className="relative">
           <input 
             type="text" 
             placeholder="Search material override..." 
             value={isOpen ? pickerState.search : row.material_name} 
             onChange={e => setPickerState(prev => ({ ...prev, search: e.target.value }))}
             onFocus={() => setPickerState({ openId: row.id, search: row.material_name, includeOutOfStock: pickerState.includeOutOfStock })}
             onBlur={() => {
               setTimeout(() => {
                 if (pickerState.openId === row.id) {
                    updateLocalMaterial(pIdx, row.id, 'material_name', pickerState.search || row.material_name);
                    setPickerState(prev => ({ ...prev, openId: null }));
                 }
               }, 250);
             }}
             className={`w-full bg-gray-900 border ${row.is_substituted ? 'border-orange-500/50 text-orange-100' : 'border-gray-700 text-white'} rounded px-2 py-1.5 text-xs focus:border-primary-500 outline-none transition-colors`} 
           />
           {row.is_substituted && <span className="absolute -top-1 -right-1 w-2 h-2 bg-orange-500 rounded-full shadow-[0_0_4px_#f97316]" title="Material Substituted for this run"></span>}
         </div>
         
         {isOpen && (
           <div className="absolute top-full left-0 mt-1 w-[400px] max-h-72 overflow-y-auto bg-gray-800 border border-gray-700 rounded-lg shadow-2xl z-[99999] custom-scrollbar flex flex-col">
              <div className="p-2 border-b border-gray-700 sticky top-0 bg-gray-900 z-10 flex justify-between items-center shrink-0">
                 <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Select Override Material</span>
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
                                handleLocalMaterialItemSelect(pIdx, row.id, item);
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
  // -- End Material Override Logic --

  const handleQuickProduce = async (e) => {
    e.preventDefault();
    setErrorMsg(""); 
    
    if (producing) return; 
    
    if (!produceQty || !produceDate) {
      setErrorMsg("Please enter sets quantity and due date.");
      return;
    }
    
    const zeroQtyParts = produceParts.filter(p => !p.final_pcs || p.final_pcs <= 0);
    if (zeroQtyParts.length > 0) {
      const affectedNames = zeroQtyParts.map((p, i) => {
        const mp = activeProduceProduct.parts.find(master => master.id === p.id) || activeProduceProduct.parts[i];
        return mp?.part_name || `Part ${i+1}`;
      }).join(", ");
      
      setErrorMsg(`Cannot generate jobs with zero quantity. Please check Target Sets or Custom Overrides for: ${affectedNames}`);
      return;
    }

    for (let i = 0; i < localMaterials.length; i++) {
       const invalidRow = localMaterials[i]?.find(r => 
         (!r.material_name || r.material_name.trim() === "") && Number(r.qty_per_unit) > 0
       );
       if (invalidRow) {
         setErrorMsg(`Validation Error: Part ${String.fromCharCode(65 + i)} has a material override row with a quantity but no material name. Please select a material or remove the extra row.`);
         return;
       }
    }

    setProducing(true);
    
    await new Promise(resolve => setTimeout(resolve, 50)); 

    try {
      const today = new Date();
      const dd = String(today.getDate()).padStart(2, '0');
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const yy = String(today.getFullYear()).slice(-2);
      const datePrefix = `${dd}${mm}${yy}`; 
      const creationTimestamp = new Date().toISOString();

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
            status_updated_at: creationTimestamp, 
            input_qty: step.input_qty || pState.final_pcs, 
            output_qty: step.output_qty || pState.final_pcs, 
            remarks: instructions, 
            process_details: step.process_details || {}, 
            assigned_machine_id: step.assigned_machine || null,
            assigned_machine_name: assignedMach ? assignedMach.name : "Unassigned Machine",
            assigned_machine_place: assignedMach ? (assignedMach.place || "") : "" 
          };
        });

        const processedMaterialRows = (localMaterials[i] || [])
          .filter(row => row.isDie || (row.material_name && row.material_name.trim() !== ""))
          .map(row => {
            const cat = row.category?.toLowerCase() || '';
            const isBoardOrPaper = cat === 'paper' || cat === 'board' || cat === 'rigid';
            return {
              ...row,
              basis: row.basis || (isBoardOrPaper ? 'per_step' : 'per_piece'),
              basis_step_index: row.basis_step_index || 0,
              unit: row.unit || (isBoardOrPaper ? 'sheets' : 'pcs')
            };
          });

        const newJobPayload = {
          title: `${activeProduceProduct.name} - ${masterPart.part_name || "Part"}`,
          customer: activeProduceProduct.customerName || "Unknown",
          priority: "normal",
          job_date: creationTimestamp,
          
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
          
          artwork_required: masterPart.artwork_required ?? true,

          product_snapshot: {
            id: activeProduceProduct.id,
            name: activeProduceProduct.name,
            sku: activeProduceProduct.sku || "",
            category: activeProduceProduct.category || ""
          },

          product: {
            id: activeProduceProduct.id, 
            name: activeProduceProduct.name, 
            sku: activeProduceProduct.sku || "",
            category: activeProduceProduct.category || "", 
            artwork_required: masterPart.artwork_required ?? true,
            materialRows: processedMaterialRows, 
            files: activeProduceProduct.files || [], 
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
          
          notes: pState.notes || "",
          
          activity_log: [{
            id: Date.now().toString() + i,
            timestamp: creationTimestamp,
            actor: "System",
            process_name: "Job Generation",
            old_status: "none",
            new_status: "created",
            note: "Job card created and sent to floor."
          }]
        };

        const newJobRef = doc(collection(db, "jobs"));
        batch.set(newJobRef, newJobPayload);
      }

      await batch.commit();

      onClose();
      onSuccess("Success! Multi-part job cards have been generated.");
    } catch (error) { 
      setErrorMsg("Failed to generate multi-part jobs: " + error.message); 
    } finally { 
      setProducing(false); 
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-primary-500/30 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="p-6 border-b border-gray-800 bg-[#151724] shrink-0">
          <h3 className="text-xl font-bold text-white">🚀 Generate Job Set</h3>
          <p className="text-xs text-gray-400 mt-1">Review Pre-Production requirements and set counts.</p>
        </div>
        
        {errorMsg && (
          <div className="mx-6 mt-6 bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded flex items-start gap-3 shadow-lg">
            <span className="text-lg leading-none">🚨</span>
            <div className="font-bold text-sm leading-tight">{errorMsg}</div>
          </div>
        )}
        
        <form onSubmit={handleQuickProduce} className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6 bg-[#0a0f1a]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-primary-400 mb-1">Global Base Order Quantity (SETS) *</label>
              <input autoFocus required type="number" value={produceQty} onChange={handleProduceQtyChange} placeholder="e.g. 340" className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 text-lg font-bold text-white focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-bold text-primary-400 mb-1">Production Due Date *</label>
              <input required type="date" value={produceDate} onChange={e => setProduceDate(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 text-lg text-white [color-scheme:dark]" />
            </div>
          </div>
          
          {produceParts.length > 0 && (
            <div className="space-y-4">
              {produceParts.map((p, pIdx) => {
                const masterPart = activeProduceProduct.parts.find(mp => mp.id === p.id) || activeProduceProduct.parts[pIdx];
                const activeMats = localMaterials[pIdx] || [];
                
                const firstStepWithMachine = p.sequence?.find(step => step.assigned_machine);
                const assignedMach = firstStepWithMachine ? machines?.find(m => m.id === firstStepWithMachine.assigned_machine) : null;
                const targetPlace = assignedMach?.place || "Unassigned";

                const activeDieIds = new Set();
                p.sequence?.forEach(step => {
                   Object.values(step.process_details || {}).forEach(val => {
                       const foundDie = dies?.find(d => d.dieNumber === val);
                       if (foundDie) activeDieIds.add(foundDie.id);
                   });
                });

                return (
                <div key={p.id} className="bg-gray-900 border border-gray-800 p-4 rounded-lg">
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-bold text-sm">Part {String.fromCharCode(65 + pIdx)}: {p.part_name}</span>
                      {!masterPart.artwork_required && (
                        <span className="bg-gray-800 text-gray-400 border border-gray-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase">Plain / Unprinted</span>
                      )}
                    </div>
                    <button type="button" onClick={() => togglePartExpanded(pIdx)} className="text-xs text-gray-400 hover:text-white bg-gray-950 px-3 py-1 rounded border border-gray-700">
                      {p.expanded ? 'Hide Details & Checklists' : 'Review Pre-Production Details'}
                    </button>
                  </div>

                  <div className="flex flex-col gap-3 bg-gray-950 p-3 rounded border border-gray-800">
                    <div className="flex flex-wrap gap-4 items-end">
                      <div className="relative">
                        <label className="block text-[10px] uppercase text-primary-400 font-bold mb-1">
                          Target Sets for Part
                          {p.dirtyFields?.part_sets && <span className="absolute -top-1 -right-2 w-2 h-2 bg-orange-500 rounded-full shadow-[0_0_4px_#f97316]" title="Manually edited (Locked)"></span>}
                        </label>
                        <input type="number" value={p.part_sets} onChange={e => updatePartSets(pIdx, e.target.value)} className="w-24 bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-xs text-white font-bold focus:border-primary-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase text-gray-500 font-bold mb-1">Multiplier</label>
                        <input type="number" step="any" value={p.active_multiplier} onChange={e => updatePartMultiplier(pIdx, e.target.value)} className="w-20 bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-xs text-white" disabled={p.is_custom_override} />
                      </div>
                      <div className="text-gray-600 font-bold mb-1.5 text-xs">OR</div>
                      <div className="relative">
                        <label className="block text-[10px] uppercase text-gray-500 font-bold mb-1">
                          Direct Pieces Override
                          {p.dirtyFields?.custom_override && <span className="absolute -top-1 -right-2 w-2 h-2 bg-orange-500 rounded-full shadow-[0_0_4px_#f97316]" title="Manually edited (Locked)"></span>}
                        </label>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" checked={p.is_custom_override} onChange={e => toggleCustomOverride(pIdx, e.target.checked)} />
                          <input type="number" value={p.is_custom_override ? p.final_pcs : ""} onChange={e => updatePartCustomPcs(pIdx, e.target.value)} disabled={!p.is_custom_override} className="w-28 bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-xs text-white disabled:opacity-50" placeholder="Custom Pcs" />
                        </div>
                      </div>
                      <div className="ml-auto text-right">
                        <span className="text-[10px] text-gray-500 uppercase font-bold block">Calculated Blanks</span>
                        <span className={`text-xl font-black ${!p.final_pcs || p.final_pcs <= 0 ? 'text-red-500' : 'text-white'}`}>
                          {p.final_pcs === "" ? "—" : `${p.final_pcs.toLocaleString()} pcs`}
                        </span>
                      </div>
                    </div>
                    
                    <div className="border-t border-gray-800/50 pt-3 mt-1">
                      <label className="block text-[10px] uppercase text-gray-500 font-bold mb-1.5">Special Instructions / Notes (Optional)</label>
                      <input 
                        type="text" 
                        value={p.notes || ""} 
                        onChange={e => updatePartNotes(pIdx, e.target.value)} 
                        placeholder="e.g. Ensure grain direction is parallel to the longer side..." 
                        className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-xs text-white focus:border-primary-500 outline-none" 
                      />
                    </div>
                  </div>

                  {p.expanded && (
                    <div className="mt-4 border-t border-gray-800 pt-4 space-y-4">
                      
                      <div className="bg-gray-950 rounded border border-gray-800 p-3 overflow-visible relative">
                        <div className="flex justify-between items-center mb-2 border-b border-gray-800 pb-2">
                          <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Job Material List (Location: {targetPlace})</h4>
                          <button type="button" onClick={() => addLocalMaterial(pIdx)} className="text-[10px] bg-primary-900/30 text-primary-400 px-2 py-1 rounded hover:bg-primary-500 hover:text-white transition-colors">+ Add Extra Material</button>
                        </div>
                        
                        <div className="w-full relative overflow-visible">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="border-b border-gray-800/50 text-[10px] text-gray-500 uppercase tracking-wider">
                                <th className="py-2 w-1/3">Material Setup / Override</th>
                                <th className="py-2 px-2">Purpose / Area</th>
                                <th className="py-2 px-2 w-20">Qty/Unit</th>
                                <th className="py-2 px-2 w-28">Basis Calc</th>
                                <th className="py-2 text-right">Target Req & Live Stock</th>
                                <th className="py-2 w-8"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {activeMats.map((row) => {
                                const cat = row.category?.toLowerCase() || '';
                                const isBoardOrPaper = cat === 'paper' || cat === 'board' || cat === 'rigid';
                                const effBasis = row.basis || (isBoardOrPaper ? 'per_step' : 'per_piece');
                                
                                let req = 0;
                                if (effBasis === 'fixed') {
                                  req = Number(row.qty_per_unit) || 1;
                                } else if (effBasis === 'per_step') {
                                  const sIdx = row.basis_step_index || 0;
                                  const stepQty = p.sequence[sIdx] ? Number(p.sequence[sIdx].input_qty) : Number(p.final_pcs);
                                  req = (Number(row.qty_per_unit) || 1) * stepQty;
                                } else {
                                  req = (Number(row.qty_per_unit) || 1) * Number(p.final_pcs);
                                }
                                
                                const invItem = inventoryItems?.find(inv => {
                                  if (row.material_id && inv.id === row.material_id) return true;
                                  return formatInventoryLabel(inv) === row.material_name;
                                });
                                
                                let stockDisplay = <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-gray-800 text-gray-600">Free Text (—)</span>;

                                if (invItem) {
                                  const totalBal = Number(invItem.balance ?? invItem.qty ?? 0);
                                  const localBalances = invItem.balances || {};
                                  const resolvedTargetLoc = locations?.find(l => l.code === targetPlace);
                                  const targetLocId = resolvedTargetLoc ? resolvedTargetLoc.id : targetPlace; 
                                  const localBal = targetPlace !== "Unassigned" ? Number(localBalances[targetLocId] || localBalances[targetPlace] || 0) : totalBal;

                                  if (req > totalBal) {
                                    stockDisplay = <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-red-500/20 text-red-400">SHORT {req - totalBal}</span>;
                                  } else if (req > localBal) {
                                    // ⭐️ ROUND 16 FIX (POINT 3): Ensure location IDs are resolved via string matching so they don't break
                                    const holding = Object.entries(localBalances).filter(([, q]) => q > 0).map(([locKey]) => {
                                      const matchedLoc = locations?.find(l => String(l.id) === String(locKey) || String(l.code) === String(locKey));
                                      return matchedLoc ? (matchedLoc.code || matchedLoc.name) : locKey;
                                    }).join(', ');
                                    
                                    stockDisplay = (
                                       <div className="flex flex-col items-end gap-0.5">
                                         <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-purple-500/20 text-purple-400 border border-purple-500/30">TRANSFER REQ</span>
                                         <span className="text-[8px] text-gray-500">From: {holding || 'Unassigned'}</span>
                                       </div>
                                    );
                                  } else {
                                    stockDisplay = <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-green-500/10 text-green-400">OK ({localBal})</span>;
                                  }
                                }
                                
                                return (
                                  <tr key={row.id} className="border-b border-gray-800/50">
                                    {renderMaterialPicker(pIdx, row)}
                                    <td className="py-2 px-2">
                                      <input type="text" value={row.piece_purpose || ""} onChange={e => updateLocalMaterial(pIdx, row.id, 'piece_purpose', e.target.value)} className={`w-full bg-gray-900 border ${row.is_substituted ? 'border-orange-500/50 text-orange-100' : 'border-gray-700 text-white'} rounded px-2 py-1.5 text-xs focus:border-primary-500 outline-none transition-colors`} placeholder="Purpose" />
                                    </td>
                                    <td className="py-2 px-2">
                                      <input type="number" step="any" value={row.qty_per_unit || ""} onChange={e => updateLocalMaterial(pIdx, row.id, 'qty_per_unit', e.target.value)} className={`w-full bg-gray-900 border ${row.is_substituted ? 'border-orange-500/50 text-orange-100' : 'border-gray-700 text-white'} rounded px-2 py-1.5 text-xs focus:border-primary-500 outline-none transition-colors`} />
                                    </td>
                                    
                                    <td className="py-2 px-2">
                                      <select value={row.basis || 'per_piece'} onChange={e => updateLocalMaterial(pIdx, row.id, 'basis', e.target.value)} className={`w-full bg-gray-900 border ${row.is_substituted ? 'border-orange-500/50 text-orange-100' : 'border-gray-700 text-white'} rounded px-2 py-1 text-[9px] font-bold uppercase tracking-wider mb-1 outline-none transition-colors`}>
                                        <option value="per_piece">Per Fin. Piece</option>
                                        <option value="per_step">Per Step In</option>
                                        <option value="fixed">Fixed Total</option>
                                      </select>
                                      {row.basis === 'per_step' && (
                                         <select value={row.basis_step_index || 0} onChange={e => updateLocalMaterial(pIdx, row.id, 'basis_step_index', Number(e.target.value))} className="w-full bg-gray-800 border border-gray-600 rounded px-1 py-1 text-[9px] text-gray-300 outline-none mt-1">
                                           {p.sequence.map((s, sIdx) => (
                                             <option key={s.id} value={sIdx}>Step {sIdx + 1}</option>
                                           ))}
                                         </select>
                                      )}
                                    </td>

                                    <td className="py-2 text-right">
                                      <div className="flex flex-col items-end gap-1">
                                        <span className="text-gray-400">
                                          Req: <strong className="text-white">{req.toLocaleString()}</strong> <span className="text-[9px] uppercase">{row.unit || (isBoardOrPaper ? 'sheets' : 'pcs')}</span>
                                        </span>
                                        {stockDisplay}
                                      </div>
                                    </td>
                                    <td className="py-2 text-center">
                                      <button type="button" onClick={() => removeLocalMaterial(pIdx, row.id)} className="text-gray-600 hover:text-red-400 font-bold text-xs ml-2">✕</button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          
                          {Array.from(activeDieIds).length > 0 && (
                            <div className="mt-3 border-t border-gray-800 pt-3">
                              {Array.from(activeDieIds).map(id => {
                                const d = dies.find(die => die.id === id);
                                return (
                                  <div key={`die-${id}`} className="flex justify-between items-center py-1">
                                    <div>
                                      <span className="text-purple-400 font-bold text-xs">{d.dieName}</span>
                                      <span className="text-gray-500 ml-2 text-[10px]">({d.dieNumber})</span>
                                    </div>
                                    <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-purple-500/10 text-purple-400 border border-purple-500/20">Die / Tooling Locked</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        {p.sequence.map((step, sIdx) => (
                          <div key={sIdx} className="flex items-center gap-3 bg-gray-950 p-2.5 rounded border border-gray-800 text-xs">
                            <span className="text-gray-500 font-bold w-4">{sIdx+1}.</span>
                            <span className="text-gray-300 w-48 truncate">{step.process_name}</span>
                            <div className="flex items-center gap-2">
                              <div className="bg-gray-900 px-2 py-1 rounded border border-gray-700 text-gray-400 relative">
                                In: <input type="number" value={step.input_qty} onChange={e => handleStepQtyChange(pIdx, sIdx, 'input_qty', e.target.value)} className="w-20 bg-transparent text-white font-mono outline-none" />
                                {p.dirtyFields?.[`input_${sIdx}`] && <span className="absolute -top-1 -right-1 w-2 h-2 bg-orange-500 rounded-full shadow-[0_0_4px_#f97316]" title="Manually edited (Locked)"></span>}
                              </div>
                              <span className="text-primary-500 font-bold">→</span>
                              <div className="bg-gray-900 px-2 py-1 rounded border border-gray-700 text-gray-400 relative">
                                Out: <input type="number" value={step.output_qty} onChange={e => handleStepQtyChange(pIdx, sIdx, 'output_qty', e.target.value)} className="w-20 bg-transparent text-white font-mono outline-none" />
                                {p.dirtyFields?.[`output_${sIdx}`] && <span className="absolute -top-1 -right-1 w-2 h-2 bg-orange-500 rounded-full shadow-[0_0_4px_#f97316]" title="Manually edited (Locked)"></span>}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )})}
            </div>
          )}

          <div className="pt-6 border-t border-gray-800 shrink-0 flex justify-end gap-3 sticky bottom-0 bg-[#0a0f1a] pb-2 z-10">
            <button type="button" onClick={onClose} className="px-5 py-2.5 text-gray-400 bg-gray-900 rounded-lg hover:text-white transition-colors">Cancel</button>
            <button 
              type="submit" 
              disabled={producing || produceParts.length === 0} 
              className="bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-bold shadow-lg flex items-center justify-center min-w-[220px] transition-colors"
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
  );
}