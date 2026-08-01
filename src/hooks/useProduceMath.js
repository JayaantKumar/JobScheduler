import { useState } from "react";

export function useProduceMath() {
  const [isProduceModalOpen, setProduceModalOpen] = useState(false);
  const [activeProduceProduct, setActiveProduceProduct] = useState(null);
  const [produceQty, setProduceQty] = useState(""); 
  const [produceDate, setProduceDate] = useState("");
  const [produceParts, setProduceParts] = useState([]);

  // ⭐️ ROUND 9.1: BUG 3 FIX - Respect dirty/locked fields during global generation/recalculation
  const generateProduceParts = (qtyStr, baseParts, existingParts = []) => {
    const sets = qtyStr === "" ? "" : Number(qtyStr);
    return baseParts.map((p, pIdx) => {
       const existing = existingParts[pIdx] || {};
       const dirty = existing.dirtyFields || {};
       
       const mult = Number(p.qty_per_set) || 1;
       const computedPcs = sets === "" ? "" : sets * mult;

       // If part sets is dirty, keep existing part_sets and final_pcs
       const partSets = dirty.part_sets && existing.part_sets !== undefined ? existing.part_sets : sets;
       const finalPcs = dirty.custom_override || dirty.part_sets ? (existing.final_pcs ?? computedPcs) : computedPcs;

       return {
          id: p.id,
          part_name: p.part_name,
          part_sets: partSets,
          original_multiplier: mult,
          active_multiplier: existing.active_multiplier !== undefined ? existing.active_multiplier : mult,
          is_custom_override: existing.is_custom_override || false,
          final_pcs: finalPcs,
          expanded: existing.expanded || false,
          dirtyFields: dirty,
          sequence: (p.sequence || []).map((s, sIdx) => {
             const existingStep = existing.sequence?.[sIdx] || {};
             const stepDirty = dirty;
             return {
               ...s,
               input_qty: stepDirty[`input_${sIdx}`] && existingStep.input_qty !== undefined ? existingStep.input_qty : finalPcs,
               output_qty: stepDirty[`output_${sIdx}`] && existingStep.output_qty !== undefined ? existingStep.output_qty : finalPcs
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
      const count = newSets === "" ? "" : Number(newSets);
      copy[pIdx].part_sets = count;
      copy[pIdx].dirtyFields = { ...(copy[pIdx].dirtyFields || {}), part_sets: true };
      
      if (!copy[pIdx].is_custom_override) {
        copy[pIdx].final_pcs = count === "" ? "" : count * copy[pIdx].active_multiplier;
        copy[pIdx].sequence = copy[pIdx].sequence.map((s, sIdx) => {
          const stepDirty = copy[pIdx].dirtyFields;
          return {
            ...s,
            input_qty: stepDirty[`input_${sIdx}`] ? s.input_qty : copy[pIdx].final_pcs,
            output_qty: stepDirty[`output_${sIdx}`] ? s.output_qty : copy[pIdx].final_pcs
          };
        });
      }
      return copy;
    });
  };

  const updatePartMultiplier = (pIdx, newMult) => {
    setProduceParts(prev => {
       const copy = [...prev];
       const mult = newMult === "" ? "" : Number(newMult);
       copy[pIdx].active_multiplier = mult;
       if (!copy[pIdx].is_custom_override) {
         copy[pIdx].final_pcs = (copy[pIdx].part_sets === "" || mult === "") ? "" : copy[pIdx].part_sets * mult;
         copy[pIdx].sequence = copy[pIdx].sequence.map((s, sIdx) => {
           const stepDirty = copy[pIdx].dirtyFields || {};
           return {
             ...s,
             input_qty: stepDirty[`input_${sIdx}`] ? s.input_qty : copy[pIdx].final_pcs,
             output_qty: stepDirty[`output_${sIdx}`] ? s.output_qty : copy[pIdx].final_pcs
           };
         });
       }
       return copy;
    });
  };

  const toggleCustomOverride = (pIdx, checked) => {
    setProduceParts(prev => {
       const copy = [...prev];
       copy[pIdx].is_custom_override = checked;
       copy[pIdx].dirtyFields = { ...(copy[pIdx].dirtyFields || {}), custom_override: checked };
       if (!checked) {
         copy[pIdx].final_pcs = (copy[pIdx].part_sets === "" || copy[pIdx].active_multiplier === "") ? "" : copy[pIdx].part_sets * copy[pIdx].active_multiplier;
         copy[pIdx].sequence = copy[pIdx].sequence.map(s => ({...s, input_qty: copy[pIdx].final_pcs, output_qty: copy[pIdx].final_pcs}));
       }
       return copy;
    });
  };

  const updatePartCustomPcs = (pIdx, newPcs) => {
    setProduceParts(prev => {
       const copy = [...prev];
       copy[pIdx].final_pcs = newPcs === "" ? "" : Number(newPcs);
       copy[pIdx].dirtyFields = { ...(copy[pIdx].dirtyFields || {}), custom_override: true };
       copy[pIdx].sequence = copy[pIdx].sequence.map((s, sIdx) => {
         const stepDirty = copy[pIdx].dirtyFields || {};
         return {
           ...s,
           input_qty: stepDirty[`input_${sIdx}`] ? s.input_qty : copy[pIdx].final_pcs,
           output_qty: stepDirty[`output_${sIdx}`] ? s.output_qty : copy[pIdx].final_pcs
         };
       });
       return copy;
    });
  };

  const handleStepQtyChange = (pIdx, sIdx, field, val) => {
    setProduceParts(prev => {
        const copy = [...prev];
        const pCopy = {...copy[pIdx]};
        const seqCopy = [...pCopy.sequence];
        const num = val === "" ? "" : Number(val);
        
        // Mark specific step field as dirty/locked
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

  const togglePartExpanded = (pIdx) => {
    setProduceParts(prev => { 
        const copy = [...prev]; 
        copy[pIdx].expanded = !copy[pIdx].expanded; 
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
    togglePartExpanded
  };
}