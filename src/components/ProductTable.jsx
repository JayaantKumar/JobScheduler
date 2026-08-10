import React, { memo, useState, useCallback } from 'react';
import { cleanGsm } from "../utils/helpers";

// ⭐️ ROUND 7.1 & 9.9: Memoized row with isExpanded dependency to fix render freezes while allowing toggles
const ProductRow = memo(({ prod, machines, isExpanded, toggleExpand, onProduce, onEdit, onDelete }) => {
  const displayParts = prod.parts?.length > 0 
    ? prod.parts 
    : [{ part_name: prod.name, qty_per_set: 1, materialRows: [], paperType: prod.paperType || prod.material, paperGsm: prod.paperGsm || prod.gsm, sequence: prod.default_sequence || [] }];
  
  const partCount = displayParts.length;
  const stepCount = displayParts.reduce((acc, part) => acc + (part.sequence?.length || 0), 0);

  const getMaterialDisplay = (part) => {
    if (part.materialRows?.length > 1) return `${part.materialRows.length} materials configured`;
    if (part.materialRows?.length === 1) {
      const row = part.materialRows[0];
      if (row.material_name && row.material_name.trim() !== "") {
         return `${row.material_name} ${row.gsm ? `(${row.gsm} GSM)` : row.thickness_mm ? `(${row.thickness_mm} mm)` : ''}`;
      }
    }
    if (part.paperType) return `${part.paperType} ${part.paperGsm ? `(${cleanGsm(part.paperGsm)} GSM)` : ""}`;
    return <span className="text-gray-600 italic">No Material Info</span>;
  };

  return (
    <tr className="hover:bg-gray-800/30 transition-colors align-top">
      <td className="py-4 px-6">
        <div className="font-bold text-gray-200">{prod.name}</div>
        <div className="text-xs text-gray-500 font-mono mt-1">SKU: {prod.sku || "N/A"}</div>
        <div className="text-[10px] uppercase font-bold text-primary-400 mt-1">{prod.category || prod.type}</div>
      </td>
      <td className="py-4 px-6 font-medium text-gray-300">{prod.customerName || "Unassigned"}</td>
      
      <td className="py-4 px-6">
        {/* ⭐️ ROUND 9.9 ITEM 3: Compact Summary Row & Chevron */}
        <div 
          className="flex items-center gap-2 cursor-pointer group w-max select-none" 
          onClick={() => toggleExpand(prod.id)}
        >
          <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${isExpanded ? 'bg-primary-900/30 border-primary-500/50 text-primary-400' : 'bg-gray-800 border-gray-700 text-gray-500 group-hover:border-gray-500 group-hover:text-white'}`}>
             <svg className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7" /></svg>
          </div>
          <span className="text-xs font-bold text-gray-300 group-hover:text-white transition-colors">
            {partCount} part{partCount !== 1 ? 's' : ''} · {stepCount} step{stepCount !== 1 ? 's' : ''}
          </span>
        </div>

        {/* ⭐️ ROUND 9.9 ITEM 3: Expandable Detailed View */}
        {isExpanded && (
          <div className="flex flex-col gap-4 mt-4 border-t border-gray-800/50 pt-4 animate-fade-in">
            {displayParts.map((part, pIdx) => (
              <div key={pIdx} className="bg-gray-950/40 p-3 rounded border border-gray-800">
                {displayParts.length > 1 && (
                  <div className="text-xs font-bold text-primary-400 uppercase tracking-wider mb-2 border-b border-gray-800/50 pb-1 flex justify-between">
                    <span>Part {String.fromCharCode(65 + pIdx)}: {part.part_name}</span>
                    <span className="text-gray-500">x{part.qty_per_set} per set</span>
                  </div>
                )}
                
                <div className="text-xs text-gray-400 mb-2 font-medium">
                  {getMaterialDisplay(part)}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {part.sequence?.length > 0 ? (
                    part.sequence.map((step, i) => {
                      const mach = machines.find(m => m.id === step.assigned_machine);
                      return (
                        <div key={i} className="flex items-center gap-1.5 bg-gray-800 border border-gray-700 px-2 py-1 rounded">
                          <span className="text-gray-300 text-[10px] font-bold">{i+1}. {step.process_name}</span>
                          {mach && <span className="text-[9px] text-gray-500 font-mono">({mach.name})</span>}
                        </div>
                      );
                    })
                  ) : (
                    <span className="text-gray-500 text-xs italic">No routing saved</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </td>

      <td className="py-4 px-6 text-right">
        <div className="flex justify-end gap-2 items-center h-full pt-2">
          <button onClick={() => onProduce(prod)} className="bg-primary-500/20 text-primary-400 hover:bg-primary-500 hover:text-white border border-primary-500/30 px-3 py-1.5 rounded-md text-xs font-bold transition-colors flex items-center gap-1 shadow-lg">
            <span>🚀</span> Produce Set
          </button>
          <button onClick={() => onEdit(prod)} className="text-gray-400 hover:text-white border border-gray-700 hover:bg-gray-800 px-3 py-1.5 rounded-md text-xs font-medium transition-colors">Edit</button>
          <button onClick={() => onDelete(prod.id)} className="text-gray-500 hover:text-red-400 p-1.5 hover:bg-red-500/10 rounded-md transition-colors">Delete</button>
        </div>
      </td>
    </tr>
  );
}, (prev, next) => 
  prev.prod.updated_at?.toMillis() === next.prod.updated_at?.toMillis() && 
  prev.prod.id === next.prod.id &&
  prev.isExpanded === next.isExpanded
);

export default function ProductTable({ products, machines, onProduce, onEdit, onDelete }) {
  // ⭐️ ROUND 9.9 ITEM 3: Global Expand/Collapse State
  const [expandedIds, setExpandedIds] = useState(new Set());

  const toggleExpand = useCallback((id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const isAllExpanded = products.length > 0 && expandedIds.size === products.length;

  const toggleAll = () => {
    if (isAllExpanded) {
      setExpandedIds(new Set());
    } else {
      setExpandedIds(new Set(products.map(p => p.id)));
    }
  };

  if (products.length === 0) {
    return (
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-12 text-center text-gray-500 shadow-xl flex-1 flex items-center justify-center">
        No products found matching your search.
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden shadow-xl flex-1 flex flex-col">
      <div className="overflow-x-auto flex-1">
        <table className="w-full text-left border-collapse min-w-[900px]">
          <thead>
            <tr className="bg-gray-950/50 border-b border-gray-800 text-xs font-bold text-gray-400 uppercase tracking-wider">
              <th className="py-4 px-6 w-[20%]">Product & SKU</th>
              <th className="py-4 px-6 w-[15%]">Customer</th>
              <th className="py-4 px-6 w-[50%]">
                <div className="flex items-center justify-between pr-4">
                  <span>Linked Parts & Routing</span>
                  <button 
                    onClick={toggleAll} 
                    className="text-[9px] text-primary-400 hover:text-white bg-primary-900/20 px-2 py-1 rounded border border-primary-500/30 transition-colors uppercase tracking-widest"
                  >
                    {isAllExpanded ? "Collapse All" : "Expand All"}
                  </button>
                </div>
              </th>
              <th className="py-4 px-6 text-right w-[15%]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {products.map((prod) => (
              <ProductRow 
                key={prod.id} 
                prod={prod} 
                machines={machines}
                isExpanded={expandedIds.has(prod.id)}
                toggleExpand={toggleExpand}
                onProduce={onProduce} 
                onEdit={onEdit} 
                onDelete={onDelete} 
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}