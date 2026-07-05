import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase/config";

export default function JobViewModal({ job, onClose }) {
  const [siblings, setSiblings] = useState([]);

  // Fetch sibling cards if this job is part of a multi-part set
  useEffect(() => {
    if (job?.set_code && job?.parts_total > 1) {
      const fetchSiblings = async () => {
        try {
          const q = query(collection(db, "jobs"), where("set_code", "==", job.set_code));
          const snap = await getDocs(q);
          const sibs = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.part_index - b.part_index);
          setSiblings(sibs);
        } catch (error) {
          console.error("Failed to fetch sibling cards:", error);
        }
      };
      fetchSiblings();
    }
  }, [job]);

  if (!job) return null;

  const handlePrint = () => window.print();

  const totalSteps = job.process_sequence?.length || 0;
  const completedSteps = job.process_sequence?.filter(p => p.status === "completed").length || 0;
  const progressPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  const dueDate = job.deadline ? new Date(job.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "N/A";
  const jobDate = job.job_date ? new Date(job.job_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "N/A";

  const formatGsm = (gsm) => {
    if (!gsm) return "";
    return String(gsm).toUpperCase().includes("GSM") ? `(${gsm})` : `(${gsm} GSM)`;
  };

  const isMultiPart = job.parts_total > 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm print:bg-white print:backdrop-blur-none print:absolute print:inset-0 print:p-0">
      
      {/* ========================================== */}
      {/* 💻 SCREEN UI (DARK MODE DIGITAL VIEW) */}
      {/* ========================================== */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] print:hidden">
        
        {/* Header */}
        <div className="bg-[#151724] p-6 border-b border-gray-800 shrink-0">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex gap-2 mb-2">
                <span className="bg-primary-500/20 text-primary-400 px-2 py-0.5 rounded text-xs font-mono font-bold uppercase tracking-wider">
                  {job.display_id || `JOB-${job.id.slice(0, 8).toUpperCase()}`}
                </span>
                {isMultiPart && (
                  <span className="bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider">
                    Part {job.part_index} of {job.parts_total}
                  </span>
                )}
                {job.priority && job.priority !== "normal" && (
                  <span className="bg-red-500/20 text-red-400 px-2 py-0.5 rounded text-xs font-bold uppercase">
                    {job.priority} Priority
                  </span>
                )}
              </div>
              <h2 className="text-2xl font-bold text-white">
                {job.title || job.product?.name || "Untitled Job"}
              </h2>
              <p className="text-gray-400 text-sm mt-1">
                {job.customer || "No Customer"} | {job.product?.sku || "No SKU"} {isMultiPart ? `| ${job.part_name}` : ""}
              </p>
            </div>
            
            <div className="flex gap-3">
              <button onClick={handlePrint} className="text-gray-400 hover:text-white p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors" title="Print / Download PDF">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              </button>
              <button onClick={onClose} className="text-gray-400 hover:text-white p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>

          <div className="mt-6">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-400">Overall Progress</span>
              <span className="text-gray-300 font-medium">{completedSteps}/{totalSteps} processes ({progressPercent}%)</span>
            </div>
            <div className="h-2 w-full bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-primary-500 rounded-full transition-all duration-500" style={{ width: `${progressPercent}%` }}></div>
            </div>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-[#0a0f1a] space-y-6">
          
          <div>
            <h3 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">Production Specifications</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-gray-900 border border-gray-800 p-4 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">Target Quantity</div>
                <div className="text-lg font-bold text-white">{job.quantity_target?.toLocaleString() || 0}</div>
                {isMultiPart && (
                  <div className="text-[10px] text-gray-500 mt-0.5">({job.qty_per_set} per set x {job.sets_qty?.toLocaleString()} sets)</div>
                )}
              </div>
              <div className="bg-gray-900 border border-gray-800 p-4 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">Product Size</div>
                <div className="text-sm font-bold text-white">{job.product?.size || 'N/A'}</div>
              </div>
              <div className="bg-gray-900 border border-gray-800 p-4 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">Raw Sheet Size</div>
                <div className="text-sm font-bold text-white">{job.specifications?.size_before_cut || job.product?.sheet_size || 'N/A'}</div>
              </div>
              <div className="bg-gray-900 border border-gray-800 p-4 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">Cut Size (Guillotine)</div>
                <div className="text-sm font-bold text-white">{job.specifications?.size_after_cut || 'N/A'}</div>
              </div>
              <div className="bg-gray-900 border border-gray-800 p-4 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">Material / Paper</div>
                <div className="text-sm font-bold text-white">{job.product?.material || 'N/A'} {formatGsm(job.product?.gsm)}</div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">Process Routing</h3>
            <div className="space-y-3">
              {job.process_sequence?.map((step, idx) => {
                const isCompleted = step.status === 'completed';
                const isScheduled = step.status === 'scheduled';
                let timeString = 'Unscheduled';
                if (isScheduled && step.scheduled_start) {
                  const dateObj = step.scheduled_start.toDate ? step.scheduled_start.toDate() : new Date(step.scheduled_start);
                  timeString = dateObj.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                }

                return (
                  <div key={idx} className={`p-4 rounded-lg border flex items-center gap-4 transition-colors ${
                    isCompleted ? 'bg-green-950/20 border-green-900/30' : 
                    isScheduled ? 'bg-yellow-950/20 border-yellow-900/40' : 
                    'bg-gray-900 border-gray-800'
                  }`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                      isCompleted ? 'bg-green-500/20 text-green-400' : 
                      isScheduled ? 'bg-yellow-500/20 text-yellow-400' : 
                      'bg-gray-800 text-gray-500'
                    }`}>
                      {idx + 1}
                    </div>
                    
                    <div className="flex-1">
                      <div className="text-white font-bold">{step.process_name}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {step.assigned_machine_name || 'Unassigned Machine'}
                      </div>
                      
                      {step.remarks && (
                        <div className="text-[11px] text-primary-300 font-mono mt-2 bg-gray-950 p-2.5 rounded border border-gray-800 whitespace-pre-wrap leading-relaxed">
                          {step.remarks}
                        </div>
                      )}
                    </div>
                    
                    <div className="text-right">
                      <div className="text-xs text-gray-400 mb-1.5 flex items-center justify-end gap-1">
                        {isScheduled && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                        {timeString}
                      </div>
                      <span className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        isCompleted ? 'bg-green-500/20 text-green-400' : 
                        isScheduled ? 'bg-yellow-500/20 text-yellow-400' : 
                        'bg-gray-800 text-gray-400'
                      }`}>
                        {isCompleted ? 'Completed' : isScheduled ? 'In Queue' : 'Pending'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>

      {/* ========================================== */}
      {/* 🖨️ PRINT UI (WHITE PAPER MODE FOR FACTORY) */}
      {/* ========================================== */}
      <div className="hidden print:block w-full bg-white text-black p-8 font-sans h-screen relative">
        
        {/* Print Header */}
        <div className="flex justify-between items-start border-b-4 border-black pb-4 mb-6">
          <div>
            {isMultiPart ? (
              <>
                <h1 className="text-6xl font-black uppercase tracking-tighter">SET-{job.set_code}</h1>
                <h2 className="text-2xl font-bold mt-3 text-gray-800 uppercase bg-gray-200 inline-block px-3 py-1 border-2 border-black">
                  Part {job.part_index} of {job.parts_total} — {job.part_name}
                </h2>
                <p className="text-sm font-bold mt-2 text-gray-600 font-mono">ID: {job.display_id}</p>
              </>
            ) : (
              <>
                <h1 className="text-4xl font-black uppercase tracking-tight">FACTORY JOB CARD</h1>
                <p className="text-gray-800 font-bold mt-1 text-lg font-mono">ID: {job.display_id || `JOB-${job.id.slice(0, 8).toUpperCase()}`}</p>
              </>
            )}
          </div>
          <div className="text-right text-sm">
            <p><strong>Job Date:</strong> {jobDate}</p>
            <p><strong>Due Date:</strong> {dueDate}</p>
            <p className="mt-2"><strong>Priority:</strong> <span className="uppercase font-bold border-2 border-black px-2 py-0.5">{job.priority}</span></p>
          </div>
        </div>

        {/* Client & Product Details */}
        <div className="grid grid-cols-2 gap-8 mb-6 border-2 border-black p-4">
          <div>
            <h2 className="text-xs font-bold text-gray-500 uppercase mb-1">Customer Details</h2>
            <p className="text-xl font-bold">{job.customer}</p>
            <p className="mt-2 text-sm"><strong>Product Master:</strong> {job.product?.name || "N/A"}</p>
          </div>
          <div>
            <h2 className="text-xs font-bold text-gray-500 uppercase mb-1">Product Details</h2>
            <p className="text-xl font-bold">{isMultiPart ? job.part_name : (job.product?.name || "N/A")}</p>
            <p className="mt-2 text-sm"><strong>SKU/Code:</strong> {job.product?.sku || "N/A"}</p>
          </div>
        </div>

        {/* Production Specifications */}
        <h2 className="text-lg font-bold uppercase border-b-2 border-black mb-4 pb-1">Part Specifications</h2>
        <div className="grid grid-cols-3 gap-4 mb-8 text-sm">
          <div className="flex flex-col border-2 border-black p-3 bg-gray-100">
            <span className="text-xs text-gray-600 font-bold uppercase">Target Quantity</span>
            <span className="text-2xl font-black">{job.quantity_target?.toLocaleString() || 0} pcs</span>
            {isMultiPart && (
              <span className="text-[10px] font-bold mt-1 text-gray-600 tracking-wide">
                ({job.qty_per_set} per set × {job.sets_qty?.toLocaleString()} sets)
              </span>
            )}
          </div>
          <div className="flex flex-col border border-black p-3">
            <span className="text-xs text-gray-600 font-bold uppercase">Part Size</span>
            <span className="text-lg font-bold">{job.product?.size || "N/A"}</span>
          </div>
          <div className="flex flex-col border border-black p-3">
            <span className="text-xs text-gray-600 font-bold uppercase">Paper / Material</span>
            <span className="text-lg font-bold">{job.product?.material || "N/A"} {formatGsm(job.product?.gsm)}</span>
          </div>
          <div className="flex flex-col border border-black p-3">
            <span className="text-xs text-gray-600 font-bold uppercase">Raw Sheet Size</span>
            <span className="text-lg font-bold">{job.specifications?.size_before_cut || job.product?.sheet_size || "N/A"}</span>
          </div>
          <div className="flex flex-col border border-black p-3">
            <span className="text-xs text-gray-600 font-bold uppercase">Cut Size (Guillotine)</span>
            <span className="text-lg font-bold">{job.specifications?.size_after_cut || "N/A"}</span>
          </div>
        </div>

        {/* Routing Table for Operator Sign-off */}
        <h2 className="text-lg font-bold uppercase border-b-2 border-black mb-4 pb-1">Process Routing & Operator Sign-off</h2>
        <table className="w-full text-left border-collapse border border-black text-sm mb-6">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-black p-3 w-12 text-center">#</th>
              <th className="border border-black p-3">Process</th>
              <th className="border border-black p-3 w-40">Target Machine</th>
              <th className="border border-black p-3 w-24 text-center">Qty In</th>
              <th className="border border-black p-3 w-24 text-center">Qty Out</th>
              <th className="border border-black p-3 w-40 text-center">Operator Sign</th>
            </tr>
          </thead>
          <tbody>
            {job.process_sequence?.map((step, idx) => (
              <tr key={idx}>
                <td className="border border-black p-4 text-center font-bold align-top">{idx + 1}</td>
                <td className="border border-black p-4 align-top">
                  <span className="font-bold text-base">{step.process_name}</span>
                  {step.remarks && (
                    <div className="text-[11px] font-bold text-gray-800 mt-2 whitespace-pre-wrap leading-relaxed border-t border-gray-300 pt-2 font-mono">
                      {step.remarks}
                    </div>
                  )}
                </td>
                <td className="border border-black p-4 align-top text-gray-700">{step.assigned_machine_name || "Any Available"}</td>
                <td className="border border-black p-4 text-center align-top font-bold">{step.input_qty || ""}</td>
                <td className="border border-black p-4 text-center align-top"></td>
                <td className="border border-black p-4 align-top"></td>
              </tr>
            ))}
          </tbody>
        </table>

        {job.notes && (
          <div className="border border-black p-4 mt-6">
            <h3 className="text-xs font-bold text-gray-600 uppercase mb-2">Special Instructions / Notes</h3>
            <p className="text-sm whitespace-pre-wrap font-medium">{job.notes}</p>
          </div>
        )}

        {/* ⭐️ ROUND 3: SIBLING CARDS FOOTER */}
        {isMultiPart && siblings.length > 0 && (
          <div className="mt-8 border-2 border-black bg-gray-50 p-4">
            <h3 className="text-sm font-bold uppercase mb-3">Linked Cards in Set (SET-{job.set_code})</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {siblings.map(sib => (
                <div key={sib.id} className={`p-3 border-2 border-black flex flex-col justify-between ${sib.id === job.id ? 'bg-black text-white' : 'bg-white'}`}>
                  <div>
                    <div className="text-xs font-bold mb-1">Part {sib.part_index}: {sib.part_name}</div>
                    <div className="text-[10px] uppercase font-mono">{sib.quantity_target?.toLocaleString()} pcs</div>
                  </div>
                  <div className={`mt-2 text-[10px] font-bold uppercase tracking-wider ${sib.id === job.id ? 'text-gray-400' : 'text-gray-500'}`}>
                    {sib.id === job.id ? 'THIS CARD' : sib.status}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 text-center text-[10px] text-gray-500 font-mono">
          Generated by Newresolutionstudio Engine • Printed on: {new Date().toLocaleString()}
        </div>
      </div>

    </div>
  );
}