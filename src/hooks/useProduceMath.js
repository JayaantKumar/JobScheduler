import { useState } from "react";

export function useProduceMath() {
  const [isProduceModalOpen, setProduceModalOpen] = useState(false);
  const [activeProduceProduct, setActiveProduceProduct] = useState(null);
  const [produceQty, setProduceQty] = useState(""); 
  const [produceDate, setProduceDate] = useState("");
  const [produceParts, setProduceParts] = useState([]);
  
  const [cachedProcesses, setCachedProcesses] = useState([]);

  // ⭐️ ROUND 18.3 FIX: Check if a value is text without modifying the user's keystrokes
  const isText = (val) => {
    if (val === "" || val === null || val === undefined) return true;
    if (typeof val === 'string' && isNaN(Number(val))) return true;
    return false;
  };

  // ⭐️ ROUND 18.3 FIX: Refined sequence engine that allows smooth text typing 
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
        const wVal = (step.wastage_val !== undefined && step.wastage_val !== "") ? step.wastage_val : defWastage;
        const wType = step.wastage_type || '%';

        // 3. Determine Output
        let stepOutput = step.output_qty;
        
        if (!dirtyFields[`output_${idx}`]) {
            // If the input is Text (like "TBD" or empty), pass the text straight through safely
            if (isText(stepInput)) {
                stepOutput = stepInput;
            } else {
                // Otherwise, it's a valid number so we do the math
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

  const handleStepQtyChange = (pIdx, sIdx, field, val) => {
    setProduceParts(prev => {
        const copy = [...prev];
        const pCopy = {...copy[pIdx]};
        const seqCopy = [...pCopy.sequence];
        
        // Only mark fields as dirty if the user edits the In/Out directly
        if (field === 'input_qty') pCopy.dirtyFields = { ...(pCopy.dirtyFields || {}), [`input_${sIdx}`]: true };
        if (field === 'output_qty') pCopy.dirtyFields = { ...(pCopy.dirtyFields || {}), [`output_${sIdx}`]: true };
        
        // If they change wastage, un-dirty the output so the math can recalculate automatically
        if (field === 'wastage_val' || field === 'wastage_type') {
           if (pCopy.dirtyFields) delete pCopy.dirtyFields[`output_${sIdx}`];
        }

        seqCopy[sIdx] = { ...seqCopy[sIdx], [field]: val };
        pCopy.sequence = seqCopy;

        pCopy.sequence = recalculateSequence(pCopy.sequence, pCopy.dirtyFields, pCopy.part_sets, pCopy.final_pcs, pCopy.active_multiplier);
        
        copy[pIdx] = pCopy;
        return copy;
    });
  };

  const handleRecalculateChain = (pIdx) => {
    setProduceParts(prev => {
        const copy = [...prev];
        const pCopy = { ...copy[pIdx] };
        
        // Wipe all step dirty locks, but keep global part locks
        const newDirty = { 
            part_sets: pCopy.dirtyFields?.part_sets,
            custom_override: pCopy.dirtyFields?.custom_override
        };
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
    openProduceModal,
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