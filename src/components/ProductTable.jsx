import React, { memo } from 'react';
import { cleanGsm } from "../utils/helpers";

// ⭐️ ROUND 7.1: Wrap row in React.memo to permanently fix the Write/Delete Render Freeze
const ProductRow = memo(({ prod, machines, onProduce, onEdit, onDelete }) => {
  const displayParts = prod.parts?.length > 0 
    ? prod.parts 
    : [{ part_name: prod.name, qty_per_set: 1, materialRows: [], paperType: prod.paperType || prod.material, paperGsm: prod.paperGsm || prod.gsm, sequence: prod.default_sequence || [] }];
  
  return (
    <tr className="hover:bg-gray-800/30 transition-colors align-top">
      <td className="py-4 px-6">
        <div className="font-bold text-gray-200">{prod.name}</div>
        <div className="text-xs text-gray-500 font-mono mt-1">SKU: {prod.sku || "N/A"}</div>
        <div className="text-[10px] uppercase font-bold text-primary-400 mt-1">{prod.category || prod.type}</div>
      </td>
      <td className="py-4 px-6 font-medium text-gray-300">{prod.customerName || "Unassigned"}</td>
      
      <td className="py-4 px-6">
        <div className="flex flex-col gap-4">
          {displayParts.map((part, pIdx) => (
            <div key={pIdx} className="bg-gray-950/40 p-3 rounded border border-gray-800">
              {displayParts.length > 1 && (
                <div className="text-xs font-bold text-primary-400 uppercase tracking-wider mb-2 border-b border-gray-800/50 pb-1 flex justify-between">
                  <span>Part {String.fromCharCode(65 + pIdx)}: {part.part_name}</span>
                  <span className="text-gray-500">x{part.qty_per_set} per set</span>
                </div>
              )}
              
              <div className="text-xs text-gray-400 mb-2 font-medium">
                {part.materialRows?.length > 1 
                  ? `${part.materialRows.length} materials configured` 
                  : part.materialRows?.length === 1 
                    ? `${part.materialRows[0].material_name} ${part.materialRows[0].gsm ? `(${part.materialRows[0].gsm} GSM)` : ''}`
                    : `${part.paperType || 'No Material Info'} ${part.paperGsm ? `(${cleanGsm(part.paperGsm)} GSM)` : ""}`
                }
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
}, (prev, next) => prev.prod.updated_at?.toMillis() === next.prod.updated_at?.toMillis() && prev.prod.id === next.prod.id);


export default function ProductTable({ products, machines, onProduce, onEdit, onDelete }) {
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
              <th className="py-4 px-6 w-[50%]">Linked Parts & Routing</th>
              <th className="py-4 px-6 text-right w-[15%]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {products.map((prod) => (
              <ProductRow 
                key={prod.id} 
                prod={prod} 
                machines={machines} 
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