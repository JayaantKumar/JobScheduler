export default function JobViewModal({ job, onClose }) {
  if (!job) return null;

  // Triggers the browser's native Print / Save as PDF dialogue
  const handlePrint = () => {
    window.print();
  };

  const totalSteps = job.process_sequence?.length || 0;
  const completedSteps = job.process_sequence?.filter(p => p.status === "completed").length || 0;
  const progressPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  const dueDate = job.deadline ? new Date(job.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "N/A";
  const jobDate = job.job_date ? new Date(job.job_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "N/A";

  // SMART LOGIC: Check if Die Cutting is in the sequence or if a Die was selected
  const hasDieCutting = job.process_sequence?.some(p => p.process_name?.toLowerCase().includes("die")) || !!job.specifications?.die;

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
                  JOB-{job.id.slice(0, 8)}
                </span>
                {job.priority && job.priority !== "normal" && (
                  <span className="bg-red-500/20 text-red-400 px-2 py-0.5 rounded text-xs font-bold uppercase">
                    {job.priority} Priority
                  </span>
                )}
              </div>
              <h2 className="text-2xl font-bold text-white">{job.title || job.product?.name || "Untitled Job"}</h2>
              <p className="text-gray-400 text-sm mt-1">{job.customer || "No Customer"} | {job.product?.sku || "No SKU"}</p>
            </div>
            
            <div className="flex gap-3">
              {/* PRINT BUTTON */}
              <button 
                onClick={handlePrint} 
                className="text-gray-400 hover:text-white p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors" 
                title="Print / Download PDF"
              >
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
          
          {/* CLIENT SPECS GRID (H, I, J, K) */}
          <div>
            <h3 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">Production Specifications</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-900 border border-gray-800 p-4 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">Target Quantity</div>
                <div className="text-lg font-bold text-white">{job.quantity_target?.toLocaleString() || 0}</div>
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
                <div className="text-sm font-bold text-white">{job.product?.material || 'N/A'} {job.product?.gsm ? `(${job.product.gsm} GSM)` : ''}</div>
              </div>
              <div className="bg-gray-900 border border-gray-800 p-4 rounded-lg">
                <div className="text-xs text-gray-500 mb-1">Print Colors</div>
                <div className="text-sm font-bold text-white">{job.specifications?.colors || 'NA'}</div>
              </div>
              
              {/* Highlight Die Name if Die Cutting is involved */}
              {hasDieCutting && (
                <div className="bg-primary-900/20 border border-primary-500/30 p-4 rounded-lg md:col-span-2">
                  <div className="text-xs text-primary-400 mb-1 font-bold flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" /></svg>
                    Assigned Die (For Die Cutting)
                  </div>
                  <div className="text-lg font-bold text-white">{job.specifications?.die || '⚠️ No Die Selected'}</div>
                </div>
              )}
            </div>
          </div>

          {/* Process Routing Timeline */}
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
      <div className="hidden print:block w-full bg-white text-black p-8 font-sans h-screen">
        
        {/* Print Header */}
        <div className="flex justify-between items-end border-b-4 border-black pb-4 mb-6">
          <div>
            <h1 className="text-4xl font-black uppercase tracking-tight">FACTORY JOB CARD</h1>
            <p className="text-gray-800 font-bold mt-1 text-lg">ID: JOB-{job.id.slice(0, 8).toUpperCase()}</p>
          </div>
          <div className="text-right text-sm">
            <p><strong>Job Date:</strong> {jobDate}</p>
            <p><strong>Due Date:</strong> {dueDate}</p>
            <p><strong>Priority:</strong> <span className="uppercase font-bold border px-1">{job.priority}</span></p>
          </div>
        </div>

        {/* Client & Product Details */}
        <div className="grid grid-cols-2 gap-8 mb-6 border-2 border-black p-4">
          <div>
            <h2 className="text-xs font-bold text-gray-500 uppercase mb-1">Customer Details</h2>
            <p className="text-xl font-bold">{job.customer}</p>
            <p className="mt-2 text-sm"><strong>Job Title:</strong> {job.title}</p>
          </div>
          <div>
            <h2 className="text-xs font-bold text-gray-500 uppercase mb-1">Product Details</h2>
            <p className="text-xl font-bold">{job.product?.name || "N/A"}</p>
            <p className="mt-2 text-sm"><strong>SKU/Code:</strong> {job.product?.sku || "N/A"}</p>
          </div>
        </div>

        {/* Production Specifications */}
        <h2 className="text-lg font-bold uppercase border-b-2 border-black mb-4 pb-1">Production Specifications</h2>
        <div className="grid grid-cols-3 gap-4 mb-6 text-sm">
          <div className="flex flex-col border border-black p-3 bg-gray-100">
            <span className="text-xs text-gray-600 font-bold uppercase">Target Quantity</span>
            <span className="text-2xl font-black">{job.quantity_target?.toLocaleString() || 0}</span>
          </div>
          <div className="flex flex-col border border-black p-3">
            <span className="text-xs text-gray-600 font-bold uppercase">Product Size</span>
            <span className="text-lg font-bold">{job.product?.size || "N/A"}</span>
          </div>
          <div className="flex flex-col border border-black p-3">
            <span className="text-xs text-gray-600 font-bold uppercase">Paper / Material</span>
            <span className="text-lg font-bold">{job.product?.material || "N/A"} {job.product?.gsm ? `(${job.product.gsm} GSM)` : ""}</span>
          </div>
          <div className="flex flex-col border border-black p-3">
            <span className="text-xs text-gray-600 font-bold uppercase">Raw Sheet Size</span>
            <span className="text-lg font-bold">{job.specifications?.size_before_cut || job.product?.sheet_size || "N/A"}</span>
          </div>
          <div className="flex flex-col border border-black p-3">
            <span className="text-xs text-gray-600 font-bold uppercase">Cut Size (Guillotine)</span>
            <span className="text-lg font-bold">{job.specifications?.size_after_cut || "N/A"}</span>
          </div>
          <div className="flex flex-col border border-black p-3">
            <span className="text-xs text-gray-600 font-bold uppercase">Colors</span>
            <span className="text-lg font-bold">{job.specifications?.colors || "NA"}</span>
          </div>
        </div>

        {/* Highlighted Die Box (Only shows if required) */}
        {hasDieCutting && (
          <div className="border-4 border-black p-4 mb-8 flex justify-between items-center bg-gray-100">
            <div>
              <h3 className="text-sm font-bold uppercase">Required Die for Cutting</h3>
              <p className="text-2xl font-black">{job.specifications?.die || "⚠️ NO DIE SPECIFIED"}</p>
            </div>
            <div className="w-16 h-16 border-2 border-black flex items-center justify-center text-xs font-bold text-gray-400">
              Verify
            </div>
          </div>
        )}

        {/* Routing Table for Operator Sign-off */}
        <h2 className="text-lg font-bold uppercase border-b-2 border-black mb-4 pb-1">Process Routing & Operator Sign-off</h2>
        <table className="w-full text-left border-collapse border border-black text-sm mb-6">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-black p-3 w-12 text-center">#</th>
              <th className="border border-black p-3">Process</th>
              <th className="border border-black p-3">Target Machine</th>
              <th className="border border-black p-3 w-24 text-center">Qty In</th>
              <th className="border border-black p-3 w-24 text-center">Qty Out</th>
              <th className="border border-black p-3 w-40 text-center">Operator Sign</th>
            </tr>
          </thead>
          <tbody>
            {job.process_sequence?.map((step, idx) => (
              <tr key={idx}>
                <td className="border border-black p-4 text-center font-bold">{idx + 1}</td>
                <td className="border border-black p-4 font-bold">{step.process_name}</td>
                <td className="border border-black p-4">{step.assigned_machine_name || "Any Available"}</td>
                <td className="border border-black p-4 text-center">{step.input_qty || ""}</td>
                <td className="border border-black p-4 text-center"></td>
                <td className="border border-black p-4"></td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Notes Section */}
        {job.notes && (
          <div className="border border-black p-4">
            <h3 className="text-xs font-bold text-gray-600 uppercase mb-2">Special Instructions / Notes</h3>
            <p className="text-sm whitespace-pre-wrap font-medium">{job.notes}</p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-gray-500 font-mono">
          Generated by Factory Control System • Printed on: {new Date().toLocaleString()}
        </div>
      </div>

    </div>
  );
}