import { useState } from "react";

export function useProduceMath() {
  const [isProduceModalOpen, setProduceModalOpen] = useState(false);
  const [activeProduceProduct, setActiveProduceProduct] = useState(null);
  const [produceQty, setProduceQty] = useState(""); 
  const [produceDate, setProduceDate] = useState("");
  const [produceParts, setProduceParts] = useState([]);

  // Safely handle empty quantities to pre-render the dialog structure
  const generateProduceParts = (qtyStr, baseParts) => {
    const sets = qtyStr === "" ? "" : Number(qtyStr);
    return baseParts.map(p => {
       const mult = Number(p.qty_per_set) || 1;
       const computedPcs = sets === "" ? "" : sets * mult;
       return {
          id: p.id,
          part_name: p.part_name,
          part_sets: sets,
          original_multiplier: mult,
          active_multiplier: mult,
          is_custom_override: false,
          final_pcs: computedPcs,
          expanded: false,
          sequence: (p.sequence || []).map(s => ({ ...s, input_qty: computedPcs, output_qty: computedPcs }))
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
    // Pre-fill the modal immediately without waiting for user input
    setProduceParts(generateProduceParts("", formattedProd.parts)); 
    
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 14);
    setProduceDate(defaultDate.toISOString().split('T')[0]);
    setProduceModalOpen(true);
  };

  const handleProduceQtyChange = (e) => {
    const val = e.target.value;
    setProduceQty(val);
    if (activeProduceProduct) {
      setProduceParts(generateProduceParts(val, activeProduceProduct.parts));
    }
  };

  const updatePartSets = (pIdx, newSets) => {
    setProduceParts(prev => {
      const copy = [...prev];
      const count = newSets === "" ? "" : Number(newSets);
      copy[pIdx].part_sets = count;
      if (!copy[pIdx].is_custom_override) {
        copy[pIdx].final_pcs = count === "" ? "" : count * copy[pIdx].active_multiplier;
        copy[pIdx].sequence = copy[pIdx].sequence.map(s => ({ ...s, input_qty: copy[pIdx].final_pcs, output_qty: copy[pIdx].final_pcs }));
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
         copy[pIdx].sequence = copy[pIdx].sequence.map(s => ({...s, input_qty: copy[pIdx].final_pcs, output_qty: copy[pIdx].final_pcs}));
       }
       return copy;
    });
  };

  const toggleCustomOverride = (pIdx, checked) => {
    setProduceParts(prev => {
       const copy = [...prev];
       copy[pIdx].is_custom_override = checked;
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
       copy[pIdx].sequence = copy[pIdx].sequence.map(s => ({...s, input_qty: copy[pIdx].final_pcs, output_qty: copy[pIdx].final_pcs}));
       return copy;
    });
  };

  const handleStepQtyChange = (pIdx, sIdx, field, val) => {
    setProduceParts(prev => {
        const copy = [...prev];
        const pCopy = {...copy[pIdx]};
        const seqCopy = [...pCopy.sequence];
        const num = val === "" ? "" : Number(val);
        seqCopy[sIdx] = {...seqCopy[sIdx], [field]: num};
        
        // Cascading output logic
        if (field === 'output_qty') {
            let cascadedOut = num;
            for (let i = sIdx + 1; i < seqCopy.length; i++) {
                seqCopy[i] = {...seqCopy[i], input_qty: cascadedOut, output_qty: cascadedOut};
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