import { useState } from "react";

export function useProduceMath() {
  const [isProduceModalOpen, setProduceModalOpen] = useState(false);
  const [activeProduceProduct, setActiveProduceProduct] = useState(null);
  const [produceQty, setProduceQty] = useState(""); 
  const [produceDate, setProduceDate] = useState("");
  const [produceParts, setProduceParts] = useState([]);

  // ⭐️ ROUND 9.2: BUG 4 FIX - Strict preservation of existing state and IDs to prevent panel collapse
  const generateProduceParts = (qtyStr, baseParts, existingParts = []) => {
    const sets = qtyStr === "" ? "" : Number(qtyStr);
    return baseParts.map((p, pIdx) => {
       const existing = existingParts[pIdx] || {};
       const dirty = existing.dirtyFields || {};
       
       const mult = Number(p.qty_per_set) || 1;
       const computedPcs = sets === "" ? "" : sets * mult;

       const partSets = dirty.part_sets && existing.part_sets !== undefined ? existing.part_sets : sets;
       const finalPcs = dirty.custom_override || dirty.part_sets ? (existing.final_pcs ?? computedPcs) : computedPcs;

       return {
          id: existing.id || p.id || `part-${pIdx}`, 
          part_name: p.part_name,
          part_sets: partSets,
          original_multiplier: mult,
          active_multiplier: existing.active_multiplier !== undefined ? existing.active_multiplier : mult,
          is_custom_override: existing.is_custom_override || false,
          final_pcs: finalPcs,
          notes: existing.notes !== undefined ? existing.notes : "", 
          expanded: existing.expanded !== undefined ? existing.expanded : false, 
          dirtyFields: dirty,
          sequence: (p.sequence || []).map((s, sIdx) => {
             const existingStep = existing.sequence?.[sIdx] || {};
             const stepDirty = dirty;
             
             // ⭐️ ROUND 15 FIX: Step 1 input defaults to raw sets/sheets, subsequent steps default to final pieces
             const defaultStepInput = sIdx === 0 ? partSets : finalPcs;
             const defaultStepOutput = finalPcs;

             return {
               ...s,
               id: existingStep.id || s.id || `step-${sIdx}`, 
               input_qty: stepDirty[`input_${sIdx}`] && existingStep.input_qty !== undefined ? existingStep.input_qty : defaultStepInput,
               output_qty: stepDirty[`output_${sIdx}`] && existingStep.output_qty !== undefined ? existingStep.output_qty : defaultStepOutput
             };
          })
       };
    });
  };

  const openProduceModal = (prod) => {
    const formattedProd = { ...prod };
    if (!formattedProd.parts) {
      formattedProd.parts = [{ part_name: prod.name, qty_per_set: 1, sequence: prod.default_sequence || [] }];
    }
    setActiveProduceProduct(formattedProd);
    setProduceQty("");
    setProduceParts(generateProduceParts("", formattedProd.parts, [])); 
    
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
      const count = newSets === "" ? "" : Number(newSets);
      pCopy.part_sets = count;
      pCopy.dirtyFields = { ...(pCopy.dirtyFields || {}), part_sets: true };
      
      if (!pCopy.is_custom_override) {
        pCopy.final_pcs = count === "" ? "" : count * pCopy.active_multiplier;
        pCopy.sequence = pCopy.sequence.map((s, sIdx) => {
          const stepDirty = pCopy.dirtyFields;
          const defaultStepInput = sIdx === 0 ? count : pCopy.final_pcs;
          return {
            ...s,
            input_qty: stepDirty[`input_${sIdx}`] ? s.input_qty : defaultStepInput,
            output_qty: stepDirty[`output_${sIdx}`] ? s.output_qty : pCopy.final_pcs
          };
        });
      }
      copy[pIdx] = pCopy;
      return copy;
    });
  };

  const updatePartMultiplier = (pIdx, newMult) => {
    setProduceParts(prev => {
       const copy = [...prev];
       const pCopy = { ...copy[pIdx] }; 
       const mult = newMult === "" ? "" : Number(newMult);
       pCopy.active_multiplier = mult;
       if (!pCopy.is_custom_override) {
         pCopy.final_pcs = (pCopy.part_sets === "" || mult === "") ? "" : pCopy.part_sets * mult;
         pCopy.sequence = pCopy.sequence.map((s, sIdx) => {
           const stepDirty = pCopy.dirtyFields || {};
           const defaultStepInput = sIdx === 0 ? pCopy.part_sets : pCopy.final_pcs;
           return {
             ...s,
             input_qty: stepDirty[`input_${sIdx}`] ? s.input_qty : defaultStepInput,
             output_qty: stepDirty[`output_${sIdx}`] ? s.output_qty : pCopy.final_pcs
           };
         });
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
         pCopy.final_pcs = (pCopy.part_sets === "" || pCopy.active_multiplier === "") ? "" : pCopy.part_sets * pCopy.active_multiplier;
         pCopy.sequence = pCopy.sequence.map((s, sIdx) => {
           const defaultStepInput = sIdx === 0 ? pCopy.part_sets : pCopy.final_pcs;
           return {...s, input_qty: defaultStepInput, output_qty: pCopy.final_pcs};
         });
       }
       copy[pIdx] = pCopy;
       return copy;
    });
  };

  const updatePartCustomPcs = (pIdx, newPcs) => {
    setProduceParts(prev => {
       const copy = [...prev];
       const pCopy = { ...copy[pIdx] }; 
       pCopy.final_pcs = newPcs === "" ? "" : Number(newPcs);
       pCopy.dirtyFields = { ...(pCopy.dirtyFields || {}), custom_override: true };
       pCopy.sequence = pCopy.sequence.map((s, sIdx) => {
         const stepDirty = pCopy.dirtyFields || {};
         return {
           ...s,
           input_qty: stepDirty[`input_${sIdx}`] ? s.input_qty : pCopy.final_pcs,
           output_qty: stepDirty[`output_${sIdx}`] ? s.output_qty : pCopy.final_pcs
         };
       });
       copy[pIdx] = pCopy;
       return copy;
    });
  };

  const handleStepQtyChange = (pIdx, sIdx, field, val) => {
    setProduceParts(prev => {
        const copy = [...prev];
        const pCopy = {...copy[pIdx]};
        const seqCopy = [...pCopy.sequence];
        const num = val === "" ? "" : Number(val);
        
        pCopy.dirtyFields = { ...(pCopy.dirtyFields || {}), [`${field === 'input_qty' ? 'input' : 'output'}_${sIdx}`]: true };
        
        seqCopy[sIdx] = {...seqCopy[sIdx], [field]: num};
        
        if (field === 'output_qty') {
            let cascadedOut = num;
            for (let i = sIdx + 1; i < seqCopy.length; i++) {
                const stepDirty = pCopy.dirtyFields || {};
                if (!stepDirty[`input_${i}`]) seqCopy[i].input_qty = cascadedOut;
                if (!stepDirty[`output_${i}`]) seqCopy[i].output_qty = cascadedOut;
                cascadedOut = seqCopy[i].output_qty;
            }
        }
        pCopy.sequence = seqCopy;
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
    updatePartNotes,
    togglePartExpanded
  };
}