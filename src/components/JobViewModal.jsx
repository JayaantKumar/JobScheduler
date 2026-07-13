import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { collection, query, where, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase/config";

export default function JobViewModal({ job, onClose }) {
  const [localJob, setLocalJob] = useState(job);
  const [siblings, setSiblings] = useState([]);
  const [issuedMaterials, setIssuedMaterials] = useState([]); 
  
  const [completingStepIdx, setCompletingStepIdx] = useState(null);
  const [qtyOk, setQtyOk] = useState("");
  const [qtyReject, setQtyReject] = useState("");
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (localJob?.set_code) {
      const fetchSiblings = async () => {
        try {
          const q = query(collection(db, "jobs"), where("set_code", "==", localJob.set_code));
          const snap = await getDocs(q);
          const sibs = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.part_index - b.part_index);
          setSiblings(sibs);
        } catch (error) { console.error("Failed to fetch sibling cards:", error); }
      };
      fetchSiblings();
    }
  }, [localJob]);

  useEffect(() => {
    if (!localJob?.id) return;
    const fetchMaterials = async () => {
      try {
        const q = query(collection(db, "inventoryTransactions"), where("job_ref_id", "==", localJob.id), where("type", "==", "out"));
        const snap = await getDocs(q);
        const materials = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setIssuedMaterials(materials);
      } catch (err) { console.error("Failed to fetch issued materials:", err); }
    };
    fetchMaterials();
  }, [localJob?.id]);

  if (!localJob) return null;

  const handlePrint = () => window.print();

  const handleCompleteStep = async (idx) => {
    setUpdating(true);
    try {
      const updatedSequence = [...localJob.process_sequence];
      updatedSequence[idx] = {
        ...updatedSequence[idx],
        status: "completed",
        qty_ok: Number(qtyOk) || 0,
        qty_rejected: Number(qtyReject) || 0,
        completed_at: new Date().toISOString()
      };

      const allCompleted = updatedSequence.every(s => s.status === "completed");
      const newJobStatus = allCompleted ? "completed" : "in_progress";

      await updateDoc(doc(db, "jobs", localJob.id), { process_sequence: updatedSequence, status: newJobStatus });
      setLocalJob(prev => ({ ...prev, process_sequence: updatedSequence, status: newJobStatus }));
      setCompletingStepIdx(null);
      setQtyOk("");
      setQtyReject("");
    } catch (error) { alert("Error updating step: " + error.message); } 
    finally { setUpdating(false); }
  };

  const totalSteps = localJob.process_sequence?.length || 0;
  const completedSteps = localJob.process_sequence?.filter(p => p.status === "completed").length || 0;
  const progressPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  const dueDate = localJob.deadline ? new Date(localJob.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "N/A";
  const jobDate = localJob.job_date ? new Date(localJob.job_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "N/A";
  
  const formatGsm = (gsm) => {
    if (!gsm) return "";
    const cleaned = String(gsm).replace(/gsm/gi, "").trim();
    return `(${cleaned} GSM)`;
  };
  
  const isMultiPart = localJob.parts_total > 1 || siblings.length > 1;

  const renderQtyMath = () => {
    if (localJob.is_custom_override) return `(${localJob.quantity_target?.toLocaleString()} custom for this job — standard ${localJob.qty_per_set}/set)`;
    return `(${localJob.active_multiplier || localJob.qty_per_set} per set × ${(localJob.sets_qty || 0).toLocaleString()} sets)`;
  };

  // ============================================================================
  // 🖨️ THE PRINT PORTAL VIEW (A4 Mockup Redesign)
  // ============================================================================
  const PrintView = (
    <div id="print-card" className="hidden print:block w-full bg-white text-black font-sans relative text-sm">
      
      {/* HEADER BAND */}
      <div className="flex justify-between items-start border-b-2 border-black pb-3 mb-3">
        <div className="flex-1">
          {isMultiPart ? (
            <>
              <h1 className="text-4xl font-black uppercase tracking-tighter mb-1">
                {localJob.set_code?.includes('-') ? `SET-${localJob.set_code}` : localJob.set_code}
              </h1>
              <div className="border border-black px-2 py-0.5 inline-block text-xs font-bold uppercase tracking-wider mb-1">
                PART {localJob.part_index} OF {localJob.parts_total || siblings.length} — {localJob.part_name}
              </div>
              <div className="text-xs font-bold font-mono text-gray-700">{localJob.display_id}</div>
            </>
          ) : (
            <>
              <h1 className="text-3xl font-black uppercase tracking-tight mb-1">FACTORY JOB CARD</h1>
              <div className="text-xs font-bold font-mono text-gray-700">{localJob.display_id || `JOB-${localJob.id.slice(0, 8).toUpperCase()}`}</div>
            </>
          )}
        </div>
        
        <div className="flex-1 flex flex-col items-center justify-center border-x-2 border-black px-4 mx-4">
          <span className="text-[10px] font-bold uppercase text-gray-600 tracking-wider">Target Quantity</span>
          <span className="text-3xl font-black">{localJob.quantity_target?.toLocaleString()} pcs</span>
          {isMultiPart && (
            <span className="text-[10px] font-bold mt-0.5 text-gray-600 tracking-wide">
              {renderQtyMath()}
            </span>
          )}
        </div>

        <div className="flex-1 text-right text-xs flex flex-col justify-center space-y-1">
          <div><span className="text-gray-500 uppercase">Job Date:</span> <span className="font-bold">{jobDate}</span></div>
          <div><span className="text-gray-500 uppercase">Due Date:</span> <span className="font-bold">{dueDate}</span></div>
          <div><span className="text-gray-500 uppercase">Priority:</span> <span className="font-bold uppercase border border-black px-1.5 py-0.5 ml-1">{localJob.priority}</span></div>
        </div>
      </div>

      {/* INFO STRIP */}
      <div className="flex justify-between items-center bg-gray-100 border-b-2 border-black py-1.5 px-2 mb-3 text-xs uppercase">
        <div><span className="text-gray-500 font-bold">Customer:</span> <span className="font-bold text-black ml-1">{localJob.customer}</span></div>
        <div><span className="text-gray-500 font-bold">Product:</span> <span className="font-bold text-black ml-1">{localJob.product?.name || "N/A"}</span></div>
        <div><span className="text-gray-500 font-bold">Part:</span> <span className="font-bold text-black ml-1">{isMultiPart ? localJob.part_name : "Main"}</span></div>
        <div><span className="text-gray-500 font-bold">SKU:</span> <span className="font-bold text-black ml-1">{localJob.product?.sku || "N/A"}</span></div>
      </div>

      {/* SPECS STRIP */}
      <div className="grid grid-cols-6 border-2 border-black divide-x-2 divide-black text-[10px] mb-4">
        <div className="p-1.5 flex flex-col"><span className="text-gray-500 font-bold uppercase">Part Size</span><span className="font-bold text-sm mt-0.5">{localJob.product?.size || "N/A"}</span></div>
        <div className="p-1.5 flex flex-col"><span className="text-gray-500 font-bold uppercase">Raw Sheet</span><span className="font-bold text-sm mt-0.5">{localJob.specifications?.size_before_cut || localJob.product?.sheet_size || "N/A"}</span></div>
        <div className="p-1.5 flex flex-col"><span className="text-gray-500 font-bold uppercase">Cut Size</span><span className="font-bold text-sm mt-0.5">{localJob.specifications?.size_after_cut || "N/A"}</span></div>
        <div className="p-1.5 flex flex-col"><span className="text-gray-500 font-bold uppercase">Material/GSM</span><span className="font-bold text-sm mt-0.5 leading-tight">{localJob.product?.material || "N/A"}<br/>{formatGsm(localJob.product?.gsm)}</span></div>
        <div className="p-1.5 flex flex-col"><span className="text-gray-500 font-bold uppercase">Die No.</span><span className="font-bold text-sm mt-0.5">N/A</span></div>
        <div className="p-1.5 flex flex-col"><span className="text-gray-500 font-bold uppercase">Colours/Finish</span><span className="font-bold text-sm mt-0.5">N/A</span></div>
      </div>

      {/* MATERIALS STRIP */}
      {issuedMaterials.length > 0 && (
        <div className="mb-4 text-xs">
          <span className="font-bold uppercase border-b border-black pb-0.5 mr-3">Materials Issued:</span>
          {issuedMaterials.map(mat => (
            <span key={mat.id} className="mr-4 inline-block font-medium">
              {mat.itemName} — <span className="font-bold">{Math.abs(mat.qty).toLocaleString()}</span> <span className="text-[9px] text-gray-500">({mat.date})</span>
            </span>
          ))}
        </div>
      )}

      {/* ROUTING TABLE */}
      <div className="font-bold uppercase mb-1 text-xs">Process Routing & Operator Sign-off</div>
      <table id="routing-table" className="w-full text-left border-collapse border-2 border-black text-xs mb-4">
        <thead>
          <tr className="bg-gray-100 border-b-2 border-black">
            <th className="border-r-2 border-black p-2 w-8 text-center">#</th>
            <th className="border-r-2 border-black p-2">Process & Specifications</th>
            <th className="border-r-2 border-black p-2 w-32">Machine</th>
            <th className="border-r-2 border-black p-2 w-16 text-center">Qty In</th>
            <th className="border-r-2 border-black p-2 w-16 text-center">Exp. Out</th>
            <th className="border-r-2 border-black p-2 w-20 text-center">Actual Out</th>
            <th className="p-2 w-32 text-center">Operator Sign / Date</th>
          </tr>
        </thead>
        <tbody>
          {localJob.process_sequence?.map((step, idx) => (
            <tr key={idx} className="border-b border-black">
              <td className="border-r-2 border-black p-2 text-center font-bold align-top">{idx + 1}</td>
              <td className="border-r-2 border-black p-2 align-top">
                <span className="font-bold text-sm">{step.process_name}</span>
                {step.remarks && (
                  <div className="text-[10px] font-medium text-gray-800 mt-1 whitespace-pre-wrap leading-tight">
                    {step.remarks.replace(/ \| /g, '\n')}
                  </div>
                )}
              </td>
              <td className="border-r-2 border-black p-2 align-top text-gray-800 text-[10px] font-bold">{step.assigned_machine_name || "Any Available"}</td>
              <td className="border-r-2 border-black p-2 text-center align-top font-bold">{step.input_qty?.toLocaleString() || localJob.quantity_target?.toLocaleString()}</td>
              <td className="border-r-2 border-black p-2 text-center align-top font-bold text-gray-600">{step.output_qty?.toLocaleString() || localJob.quantity_target?.toLocaleString()}</td>
              <td className="border-r-2 border-black p-2 text-center align-top"></td>
              <td className="p-2 align-top"></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* SPECIAL INSTRUCTIONS */}
      {localJob.notes && (
        <div className="border border-black p-3 mb-4">
          <h3 className="text-[10px] font-bold text-gray-600 uppercase mb-1">Special Instructions / Notes</h3>
          <p className="text-xs whitespace-pre-wrap font-medium">{localJob.notes}</p>
        </div>
      )}

      {/* FOOTER */}
      <div className="flex justify-between items-stretch border-2 border-black mt-auto">
        <div className="p-2 flex-1 border-r-2 border-black bg-gray-50">
          <div className="text-[10px] font-bold uppercase mb-1">Linked Cards in Set {isMultiPart ? `(SET-${localJob.set_code})` : ''}</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {siblings.map(sib => (
              <div key={sib.id} className="text-[9px] font-bold uppercase flex justify-between">
                <span>Part {sib.part_index}: {sib.part_name} - {sib.quantity_target?.toLocaleString()} pcs</span>
                <span className={sib.id === localJob.id ? 'text-black' : 'text-gray-500'}>
                  {sib.id === localJob.id ? '[THIS CARD]' : sib.status}
                </span>
              </div>
            ))}
            {!isMultiPart && <div className="text-[9px] text-gray-500 italic">Single job card. No siblings.</div>}
          </div>
        </div>
        <div className="w-64 p-2 flex flex-col">
          <div className="text-[10px] font-bold uppercase mb-4 text-center">Supervisor Sign / Date</div>
          <div className="mt-auto border-b border-black w-full"></div>
        </div>
      </div>

    </div>
  );

  // ============================================================================
  // 💻 THE DIGITAL SCREEN VIEW 
  // ============================================================================
  return (
    <>
      <style type="text/css" media="print">
        {`
          @page { size: A4 portrait; margin: 12mm; }
          #root { display: none !important; }
          body *:not(#print-card):not(#print-card *) { display: none !important; }
          #print-card { display: block !important; position: static !important; height: auto !important; overflow: visible !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; padding: 0; background: white; color: black; }
          * { box-sizing: border-box; }
          tr { page-break-inside: avoid !important; }
          thead { display: table-header-group !important; }
          #routing-table td { min-height: 16mm; height: 16mm; }
          h1, h2, h3 { page-break-after: avoid !important; }
        `}
      </style>

      {/* Screen Render */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm print:hidden">
        <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
          
          <div className="bg-[#151724] p-6 border-b border-gray-800 shrink-0">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex gap-2 mb-2">
                  <span className="bg-primary-500/20 text-primary-400 px-2 py-0.5 rounded text-xs font-mono font-bold uppercase tracking-wider">
                    {localJob.display_id || `JOB-${localJob.id.slice(0, 8).toUpperCase()}`}
                  </span>
                  {isMultiPart && <span className="bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider">Part {localJob.part_index} of {localJob.parts_total || siblings.length}</span>}
                </div>
                <h2 className="text-2xl font-bold text-white">{localJob.title || localJob.product?.name || "Untitled Job"}</h2>
                <p className="text-gray-400 text-sm mt-1">{localJob.customer || "No Customer"} | {localJob.product?.sku || "No SKU"} {isMultiPart ? `| ${localJob.part_name}` : ""}</p>
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

          <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-[#0a0f1a] space-y-6">
            <div>
              <h3 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">Production Specifications</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="bg-gray-900 border border-gray-800 p-4 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">Target Quantity</div>
                  <div className="text-lg font-bold text-white">{localJob.quantity_target?.toLocaleString() || 0}</div>
                  {isMultiPart && (
                    <div className="text-[10px] text-primary-500/80 mt-0.5">{renderQtyMath()}</div>
                  )}
                </div>
                <div className="bg-gray-900 border border-gray-800 p-4 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">Product Size</div>
                  <div className="text-sm font-bold text-white">{localJob.product?.size || 'N/A'}</div>
                </div>
                <div className="bg-gray-900 border border-gray-800 p-4 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">Raw Sheet Size</div>
                  <div className="text-sm font-bold text-white">{localJob.specifications?.size_before_cut || localJob.product?.sheet_size || 'N/A'}</div>
                </div>
                <div className="bg-gray-900 border border-gray-800 p-4 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">Cut Size (Guillotine)</div>
                  <div className="text-sm font-bold text-white">{localJob.specifications?.size_after_cut || 'N/A'}</div>
                </div>
                <div className="bg-gray-900 border border-gray-800 p-4 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">Material / Paper</div>
                  <div className="text-sm font-bold text-white">{localJob.product?.material || 'N/A'} {formatGsm(localJob.product?.gsm)}</div>
                </div>
              </div>
            </div>

            {issuedMaterials.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-blue-400 mb-3 uppercase tracking-wider">Materials Issued to this Job</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {issuedMaterials.map(mat => (
                    <div key={mat.id} className="bg-blue-950/20 border border-blue-900/30 p-4 rounded-lg flex flex-col">
                      <span className="text-xs font-bold text-blue-300 truncate" title={mat.itemName}>{mat.itemName}</span>
                      <div className="flex justify-between items-end mt-3">
                        <span className="text-2xl font-black text-white">{Math.abs(mat.qty).toLocaleString()}</span>
                        <span className="text-[10px] text-gray-500 font-mono">{mat.date}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">Process Routing & Status</h3>
              <div className="space-y-3">
                {localJob.process_sequence?.map((step, idx) => {
                  const isCompleted = step.status === 'completed';
                  const isScheduled = step.status === 'scheduled';
                  let timeString = 'Unscheduled';
                  if (isScheduled && step.scheduled_start) {
                    const dateObj = step.scheduled_start.toDate ? step.scheduled_start.toDate() : new Date(step.scheduled_start);
                    timeString = dateObj.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                  }

                  return (
                    <div key={idx} className={`p-4 rounded-lg border flex flex-col gap-3 transition-colors ${
                      isCompleted ? 'bg-green-950/20 border-green-900/30' : 
                      isScheduled ? 'bg-yellow-950/20 border-yellow-900/40' : 
                      'bg-gray-900 border-gray-800'
                    }`}>
                      <div className="flex items-center gap-4 w-full">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                          isCompleted ? 'bg-green-500/20 text-green-400' : 
                          isScheduled ? 'bg-yellow-500/20 text-yellow-400' : 
                          'bg-gray-800 text-gray-500'
                        }`}>
                          {idx + 1}
                        </div>
                        
                        <div className="flex-1">
                          <div className="text-white font-bold">{step.process_name}</div>
                          <div className="text-xs text-gray-500 mt-1">{step.assigned_machine_name || 'Unassigned Machine'}</div>
                          
                          <div className="text-[11px] text-gray-400 font-mono mt-1">
                            In: {step.input_qty?.toLocaleString() || localJob.quantity_target} → Out: {step.output_qty?.toLocaleString() || localJob.quantity_target}
                          </div>
                          
                          {step.remarks && (
                            <div className="text-[11px] text-primary-300 font-mono mt-2 bg-gray-950 p-2.5 rounded border border-gray-800 whitespace-pre-wrap leading-relaxed">
                              {step.remarks}
                            </div>
                          )}
                        </div>
                        
                        <div className="text-right flex flex-col items-end gap-2">
                          {isScheduled && (
                            <div className="text-[10px] text-gray-400 flex items-center gap-1 font-mono">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                              {timeString}
                            </div>
                          )}
                          <span className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            isCompleted ? 'bg-green-500/20 text-green-400' : 
                            isScheduled ? 'bg-yellow-500/20 text-yellow-400' : 'bg-gray-800 text-gray-400'
                          }`}>
                            {isCompleted ? 'Completed' : isScheduled ? 'In Queue' : 'Pending'}
                          </span>
                          
                          {!isCompleted && completingStepIdx !== idx && (
                            <button onClick={() => { setCompletingStepIdx(idx); setQtyOk(step.output_qty || localJob.quantity_target || ""); setQtyReject("0"); }} className="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white rounded transition-colors shadow-lg">
                              Mark Complete
                            </button>
                          )}
                        </div>
                      </div>

                      {completingStepIdx === idx && (
                        <div className="mt-2 bg-gray-950 p-4 rounded-lg border border-primary-500/30 ml-12 animate-fade-in">
                          <h4 className="text-xs font-bold text-primary-400 mb-3 uppercase tracking-wider">Complete Process: {step.process_name}</h4>
                          <div className="flex items-end gap-4">
                            <div className="flex-1"><label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">Qty OK (Usable)</label><input type="number" value={qtyOk} onChange={e => setQtyOk(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-primary-500 outline-none" /></div>
                            <div className="flex-1"><label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">Qty Rejected (Wastage)</label><input type="number" value={qtyReject} onChange={e => setQtyReject(e.target.value)} className="w-full bg-gray-900 border border-red-900/50 rounded px-3 py-2 text-sm text-white focus:border-red-500 outline-none" /></div>
                            <div className="flex gap-2">
                              <button onClick={() => setCompletingStepIdx(null)} className="px-4 py-2 text-xs font-bold text-gray-400 hover:text-white bg-gray-800 rounded transition-colors">Cancel</button>
                              <button onClick={() => handleCompleteStep(idx)} disabled={updating} className="px-4 py-2 text-xs font-bold text-white bg-green-600 hover:bg-green-500 rounded transition-colors disabled:opacity-50">{updating ? "Saving..." : "Confirm"}</button>
                            </div>
                          </div>
                        </div>
                      )}
                      {isCompleted && (
                        <div className="ml-12 mt-1 flex gap-4 text-xs font-mono">
                          <span className="text-green-400 bg-green-400/10 px-2 py-0.5 rounded">OK: {step.qty_ok?.toLocaleString() || 0}</span>
                          {step.qty_rejected > 0 && <span className="text-red-400 bg-red-400/10 px-2 py-0.5 rounded">REJECT: {step.qty_rejected?.toLocaleString()}</span>}
                          {step.completed_at && <span className="text-gray-500">Done: {new Date(step.completed_at).toLocaleDateString()}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            
            {isMultiPart && siblings.length > 0 && (
              <div className="mt-4 pt-6 border-t border-gray-800">
                <h3 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">Linked Cards in Set (SET-{localJob.set_code})</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {siblings.map(sib => (
                    <div key={sib.id} className={`p-4 rounded-lg border flex flex-col justify-between ${sib.id === localJob.id ? 'bg-primary-900/20 border-primary-500/50' : 'bg-gray-950 border-gray-800'}`}>
                      <div>
                        <div className={`text-xs font-bold mb-1 ${sib.id === localJob.id ? 'text-primary-400' : 'text-gray-300'}`}>Part {sib.part_index}: {sib.part_name}</div>
                        <div className="text-[10px] uppercase font-mono text-gray-500">{sib.quantity_target?.toLocaleString()} pcs</div>
                      </div>
                      <div className={`mt-3 text-[10px] font-bold uppercase tracking-wider inline-block px-2 py-1 rounded w-max ${sib.id === localJob.id ? 'bg-primary-500/20 text-primary-400' : sib.status === 'completed' ? 'bg-green-500/10 text-green-400' : sib.status === 'in_progress' ? 'bg-blue-500/10 text-blue-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                        {sib.id === localJob.id ? 'THIS CARD' : sib.status}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
      
      {createPortal(PrintView, document.body)}
    </>
  );
}