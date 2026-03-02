export default function JobViewModal({ job, onClose }) {
  if (!job) return null;

  // Calculate Progress
  const totalSteps = job.process_sequence?.length || 0;
  const completedSteps = job.process_sequence?.filter(p => p.status === "completed").length || 0;
  const progressPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  // Safely format the Due Date
  const dueDate = new Date(job.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header Section */}
        <div className="bg-[#151724] p-6 border-b border-gray-800 shrink-0">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex gap-2 mb-2">
                <span className="bg-primary-500/20 text-primary-400 px-2 py-0.5 rounded text-xs font-mono font-bold uppercase tracking-wider">
                  JOB-{job.id.slice(0, 8)}
                </span>
                {job.priority && job.priority !== "Normal" && (
                  <span className="bg-red-500/20 text-red-400 px-2 py-0.5 rounded text-xs font-bold">
                    {job.priority} Priority
                  </span>
                )}
              </div>
              <h2 className="text-2xl font-bold text-white">{job.title || job.product?.name || "Untitled Job"}</h2>
              <p className="text-gray-400 text-sm mt-1">{job.customer || "No Customer"} | {job.product?.sku || "No SKU"}</p>
            </div>
            
            <div className="flex gap-3">
              <button className="text-gray-400 hover:text-white p-1 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              </button>
              <button onClick={onClose} className="text-gray-400 hover:text-white p-1 transition-colors">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>

          {/* Progress Bar */}
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

        {/* Scrollable Body Section */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-[#0a0f1a]">
          
          {/* Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-gray-900 border border-gray-800 p-4 rounded-lg flex flex-col justify-center">
              <div className="text-xs text-gray-500 mb-1">Quantity</div>
              <div className="text-xl font-bold text-white">{job.quantity_target?.toLocaleString() || 0}</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 p-4 rounded-lg flex flex-col justify-center">
              <div className="text-xs text-gray-500 mb-1">Due Date</div>
              <div className="text-lg font-bold text-white flex items-center gap-2">
                <svg className="w-4 h-4 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                {dueDate}
              </div>
            </div>
            <div className="bg-gray-900 border border-gray-800 p-4 rounded-lg flex flex-col justify-center">
              <div className="text-xs text-gray-500 mb-1">Material</div>
              <div className="text-sm font-bold text-white truncate">{job.product?.material || 'Standard'}</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 p-4 rounded-lg flex flex-col justify-center">
              <div className="text-xs text-gray-500 mb-1">Artwork</div>
              <div className="text-sm font-bold text-white truncate">{job.specifications?.artwork_status || 'Pending'}</div>
            </div>
          </div>

          {/* Process Routing Timeline */}
          <h3 className="text-sm font-bold text-primary-400 mb-4 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-500"></span>
            Process Routing ({totalSteps} steps)
          </h3>

          <div className="space-y-3">
            {job.process_sequence?.map((step, idx) => {
              const isCompleted = step.status === 'completed';
              const isScheduled = step.status === 'scheduled';
              
              // Safely format the scheduled time if it exists
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
                      {step.assigned_machine_name || 'Unassigned'} • {step.run_mins || 0} min
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
  );
}