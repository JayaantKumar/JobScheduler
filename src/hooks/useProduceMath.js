import { useState } from "react";

export function useProduceMath() {
  const [isProduceModalOpen, setProduceModalOpen] = useState(false);
  const [activeProduceProduct, setActiveProduceProduct] = useState(null);
  const [produceQty, setProduceQty] = useState(""); 
  const [produceDate, setProduceDate] = useState("");
  const [produceParts, setProduceParts] = useState([]);
  
  // ⭐️ ROUND 21: Added state to track if we are in Repeat Mode
  const [repeatSourceGroup, setRepeatSourceGroup] = useState(null);

  const [cachedProcesses, setCachedProcesses] = useState([]);

  // ⭐️ ROUND 18.3 FIX: Check if a value is text without modifying the user's keystrokes
  const isText = (val) => {
    if (val === "" || val === null || val === undefined) return true;
    if (typeof val === 'string' && isNaN(Number(val))) return true;
    return false;
  };

  // ⭐️ ROUND 21.1 HOTFIX: Refined sequence engine with strict manual override tracking
  const recalculateSequence = (sequence, dirtyFields, baseSets, basePcs, multiplier, processes = cachedProcesses) => {
    let previousOutput = basePcs; 

    return sequence.map((step, idx) => {
        // 1. Determine Input
        let stepInput = step.input_qty;
        if (!dirtyFields[`input_${idx}`]) {
            stepInput = idx === 0 ? baseSets : previousOutput; 
        }

        // 2. Fetch Default Wastage
        const processDef = processes.find(dp => dp.processName === step.process_name);
        const defWastage = processDef?.defaultWastage || 0;

        // ⭐️ Preserves 0 values strictly
        const wVal = (step.wastage_val !== undefined && step.wastage_val !== null && step.wastage_val !== "") 
          ? step.wastage_val 
          : defWastage;

        const wType = step.wastage_type || '%';

        // 3. Determine Output
        let stepOutput = step.output_qty;

        if (!dirtyFields[`output_${idx}`]) {
            if (isText(stepInput)) {
                stepOutput = stepInput;
            } else {
                const safeMult = Number(multiplier) || 1;
                let numericBase = (idx === 0) ? (Number(stepInput) * safeMult) : Number(stepInput);

                const numericWastage = Number(wVal) || 0;
                let wasteAmt = 0;

                if (wType === '%') {
                    wasteAmt = numericBase * (numericWastage / 100);
                } else {
                    wasteAmt = numericWastage;
                }

                stepOutput = Math.max(0, Math.round(numericBase - wasteAmt));
            }
        }

        // Cascade this output to become the next step's default input
        previousOutput = stepOutput; 

        return {
            ...step,
            input_qty: stepInput,
            output_qty: stepOutput,
            wastage_val: wVal,
            wastage_type: wType
        };
    });
  };

  const generateProduceParts = (qtyStr, baseParts, existingParts = [], processes = cachedProcesses) => {
    return baseParts.map((p, pIdx) => {
       const existing = existingParts[pIdx] || {};
       const dirty = existing.dirtyFields || {};

       const mult = Number(p.qty_per_set) || 1;
       const computedPcs = isText(qtyStr) ? qtyStr : Number(qtyStr) * mult;

       const partSets = dirty.part_sets && existing.part_sets !== undefined ? existing.part_sets : qtyStr;
       const finalPcs = dirty.custom_override || dirty.part_sets ? (existing.final_pcs ?? computedPcs) : computedPcs;

       const baseSequence = (p.sequence || []).map((s, sIdx) => {
          const existingStep = existing.sequence?.[sIdx] || {};
          return { ...s, ...existingStep, id: existingStep.id || s.id || `step-${sIdx}` };
       });

       const activeMult = existing.active_multiplier !== undefined ? existing.active_multiplier : mult;

       return {
          id: existing.id || p.id || `part-${pIdx}`, 
          part_name: p.part_name,
          part_sets: partSets,
          original_multiplier: mult,
          active_multiplier: activeMult,
          is_custom_override: existing.is_custom_override || false,
          final_pcs: finalPcs,
          notes: existing.notes !== undefined ? existing.notes : "", 
          expanded: existing.expanded !== undefined ? existing.expanded : false, 
          dirtyFields: dirty,
          sequence: recalculateSequence(baseSequence, dirty, partSets, finalPcs, activeMult, processes)
       };
    });
  };

  const openProduceModal = (prod, dbProcesses = []) => {
    setCachedProcesses(dbProcesses);
    setRepeatSourceGroup(null); // ⭐️ Clear repeat mode for standard generation
    
    const formattedProd = { ...prod };
    if (!formattedProd.parts) {
      formattedProd.parts = [{ part_name: prod.name, qty_per_set: 1, sequence: prod.default_sequence || [] }];
    }
    setActiveProduceProduct(formattedProd);
    setProduceQty("");
    setProduceParts(generateProduceParts("", formattedProd.parts, [], dbProcesses)); 

    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 14);
    setProduceDate(defaultDate.toISOString().split('T')[0]);
    setProduceModalOpen(true);
  };

  // ⭐️ ROUND 21: New function to open modal pre-filled with past job data
  const openProduceModalForRepeat = (jobGroup, dbProcesses = []) => {
    if (!jobGroup || jobGroup.length === 0) return;
    
    setCachedProcesses(dbProcesses);
    
    // Sort group to ensure Part A, Part B sequence is correct
    const sortedGroup = [...jobGroup].sort((a, b) => (a.part_index || 0) - (b.part_index || 0));
    
    // 1. Reconstruct a "Product Template" from the past jobs
    const mockProduct = {
      id: sortedGroup[0].product?.id || sortedGroup[0].product_snapshot?.id || "custom-repeat",
      name: sortedGroup[0].product?.name || sortedGroup[0].product_snapshot?.name || sortedGroup[0].title,
      sku: sortedGroup[0].product?.sku || sortedGroup[0].product_snapshot?.sku || "",
      category: sortedGroup[0].product?.category || sortedGroup[0].product_snapshot?.category || "",
      customerName: sortedGroup[0].customer || "Unknown",
      parts: sortedGroup.map((j, i) => ({
         id: `repeat-part-${i}`,
         part_name: j.part_name,
         qty_per_set: j.qty_per_set || 1,
         artwork_required: j.artwork_required ?? true,
         materialRows: j.product?.materialRows || [],
         sequence: j.process_sequence || []
      }))
    };

    // 2. Extract historical values and lock them with dirtyFields
    const historyParts = sortedGroup.map((j, i) => {
      const dirty = {};
      if (j.is_custom_override) dirty.custom_override = true;
      if (j.sets_qty !== undefined) dirty.part_sets = true; // Lock global qty for this part

      const mappedSequence = (j.process_sequence || []).map((step, sIdx) => {
         // Freeze the past numbers so the engine doesn't auto-overwrite them on load
         dirty[`input_${sIdx}`] = true;
         dirty[`output_${sIdx}`] = true;
         dirty[`wastage_val_${sIdx}`] = true;
         
         return {
            ...step,
            input_qty: step.input_qty,
            output_qty: step.output_qty,
            wastage_val: step.expected_wastage_val,
            wastage_type: step.expected_wastage_type
         };
      });

      return {
         id: mockProduct.parts[i].id,
         part_sets: j.sets_qty,
         active_multiplier: j.active_multiplier || j.qty_per_set || 1,
         is_custom_override: j.is_custom_override || false,
         final_pcs: j.quantity_target,
         notes: j.notes || "",
         dirtyFields: dirty,
         sequence: mappedSequence
      };
    });

    setActiveProduceProduct(mockProduct);
    setProduceQty(sortedGroup[0].sets_qty || "");
    
    // Inject the historical parts as existing data
    setProduceParts(generateProduceParts(sortedGroup[0].sets_qty || "", mockProduct.parts, historyParts, dbProcesses)); 
    
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 14);
    setProduceDate(defaultDate.toISOString().split('T')[0]);
    
    setRepeatSourceGroup(sortedGroup);
    setProduceModalOpen(true);
  };

  const handleProduceQtyChange = (e) => {
    const val = e.target.value;
    setProduceQty(val);
    if (activeProduceProduct) {
      setProduceParts(prev => generateProduceParts(val, activeProduceProduct.parts, prev));
    }
  };

  const updatePartSets = (pIdx, newSets) => {
    setProduceParts(prev => {
      const copy = [...prev];
      const pCopy = { ...copy[pIdx] }; 

      pCopy.part_sets = newSets;
      pCopy.dirtyFields = { ...(pCopy.dirtyFields || {}), part_sets: true };

      if (!pCopy.is_custom_override) {
        pCopy.final_pcs = isText(newSets) ? newSets : (Number(newSets) * Number(pCopy.active_multiplier || 1));
        pCopy.sequence = recalculateSequence(pCopy.sequence, pCopy.dirtyFields, pCopy.part_sets, pCopy.final_pcs, pCopy.active_multiplier);
      }
      copy[pIdx] = pCopy;
      return copy;
    });
  };

  const updatePartMultiplier = (pIdx, newMult) => {
    setProduceParts(prev => {
       const copy = [...prev];
       const pCopy = { ...copy[pIdx] }; 
       pCopy.active_multiplier = newMult;

       if (!pCopy.is_custom_override) {
         pCopy.final_pcs = isText(pCopy.part_sets) ? pCopy.part_sets : (isText(newMult) ? "" : Number(pCopy.part_sets) * Number(newMult));
         pCopy.sequence = recalculateSequence(pCopy.sequence, pCopy.dirtyFields, pCopy.part_sets, pCopy.final_pcs, pCopy.active_multiplier);
       }
       copy[pIdx] = pCopy;
       return copy;
    });
  };

  const toggleCustomOverride = (pIdx, checked) => {
    setProduceParts(prev => {
       const copy = [...prev];
       const pCopy = { ...copy[pIdx] }; 
       pCopy.is_custom_override = checked;
       pCopy.dirtyFields = { ...(pCopy.dirtyFields || {}), custom_override: checked };

       if (!checked) {
         pCopy.final_pcs = isText(pCopy.part_sets) ? pCopy.part_sets : (Number(pCopy.part_sets) * Number(pCopy.active_multiplier || 1));
         pCopy.sequence = recalculateSequence(pCopy.sequence, pCopy.dirtyFields, pCopy.part_sets, pCopy.final_pcs, pCopy.active_multiplier);
       }
       copy[pIdx] = pCopy;
       return copy;
    });
  };

  const updatePartCustomPcs = (pIdx, newPcs) => {
    setProduceParts(prev => {
       const copy = [...prev];
       const pCopy = { ...copy[pIdx] }; 
       pCopy.final_pcs = newPcs;
       pCopy.dirtyFields = { ...(pCopy.dirtyFields || {}), custom_override: true };
       pCopy.sequence = recalculateSequence(pCopy.sequence, pCopy.dirtyFields, pCopy.part_sets, pCopy.final_pcs, pCopy.active_multiplier);
       copy[pIdx] = pCopy;
       return copy;
    });
  };

  // ⭐️ ROUND 21.1 HOTFIX (BUG 2): Supports clearing dirty locks when passing empty string
  const handleStepQtyChange = (pIdx, sIdx, field, val) => {
    setProduceParts(prev => {
        const copy = [...prev];
        const pCopy = {...copy[pIdx]};
        const seqCopy = [...pCopy.sequence];
        const dirty = { ...(pCopy.dirtyFields || {}) };

        if (val === "") {
          // Passing empty string clears the manual lock
          delete dirty[`${field}_${sIdx}`];
        } else {
          // Non-empty string sets dirty lock
          if (field === 'input_qty') dirty[`input_${sIdx}`] = true;
          if (field === 'output_qty') dirty[`output_${sIdx}`] = true;
          if (field === 'wastage_val') dirty[`wastage_val_${sIdx}`] = true;
        }

        if (field === 'wastage_val' || field === 'wastage_type') {
           // Changing wastage clears output dirty lock so math auto-cascades
           delete dirty[`output_${sIdx}`];
        }

        pCopy.dirtyFields = dirty;
        seqCopy[sIdx] = { ...seqCopy[sIdx], [field]: val };
        pCopy.sequence = seqCopy;

        pCopy.sequence = recalculateSequence(pCopy.sequence, pCopy.dirtyFields, pCopy.part_sets, pCopy.final_pcs, pCopy.active_multiplier);

        copy[pIdx] = pCopy;
        return copy;
    });
  };

  // ⭐️ ROUND 21.1 HOTFIX (BUG 2): Recalculate options support ("untouched only" vs "reset all")
  const handleRecalculateChain = (pIdx, options = { resetAll: false }) => {
    setProduceParts(prev => {
        const copy = [...prev];
        const pCopy = { ...copy[pIdx] };

        let newDirty = {};

        if (!options?.resetAll) {
          // Keep step locks when recalculating untouched fields only
          newDirty = { ...pCopy.dirtyFields };
        } else {
          // Wipes all step locks when resetting everything, preserving only part-level locks
          newDirty = { 
              part_sets: pCopy.dirtyFields?.part_sets,
              custom_override: pCopy.dirtyFields?.custom_override
          };
        }

        pCopy.dirtyFields = newDirty;
        pCopy.sequence = recalculateSequence(pCopy.sequence, newDirty, pCopy.part_sets, pCopy.final_pcs, pCopy.active_multiplier);

        copy[pIdx] = pCopy;
        return copy;
    });
  };

  const updatePartNotes = (pIdx, val) => {
    setProduceParts(prev => {
        const copy = [...prev];
        const pCopy = { ...copy[pIdx] };
        pCopy.notes = val;
        copy[pIdx] = pCopy;
        return copy;
    });
  };

  const togglePartExpanded = (pIdx) => {
    setProduceParts(prev => { 
        const copy = [...prev]; 
        const pCopy = { ...copy[pIdx] }; 
        pCopy.expanded = !pCopy.expanded; 
        copy[pIdx] = pCopy;
        return copy; 
    });
  };

  return {
    isProduceModalOpen,
    setProduceModalOpen,
    activeProduceProduct,
    produceQty,
    produceDate,
    setProduceDate,
    produceParts,
    repeatSourceGroup, // Expose this so the Modal knows it's repeating
    openProduceModal,
    openProduceModalForRepeat, // Expose the new loader
    handleProduceQtyChange,
    updatePartSets,
    updatePartMultiplier,
    toggleCustomOverride,
    updatePartCustomPcs,
    handleStepQtyChange,
    handleRecalculateChain,
    updatePartNotes,
    togglePartExpanded
  };
}