import { useState } from "react";
import { useJobs } from "../hooks/useJobs";
import JobModal from "../components/JobModal";
import JobViewModal from "../components/JobViewModal"; 
import { autoScheduleJob } from "../services/scheduler.service";
// NEW IMPORTS FOR CLEARING SCHEDULE
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/config";

// Helper function to calculate how late a process is
const getOverdueText = (scheduledEnd) => {
  const now = new Date();
  const diffMs = now - scheduledEnd;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  
  if (diffDays > 0) return `${diffDays} days overdue`;
  if (diffHours > 0) return `${diffHours} hours overdue`;
  return `Less than an hour overdue`;
};

export default function Jobs() {
  const { jobs, loading } = useJobs();
  const [isModalOpen, setModalOpen] = useState(false);
  const [viewingJob, setViewingJob] = useState(null); 
  const [schedulingId, setSchedulingId] = useState(null);
  const [activeTab, setActiveTab] = useState("all"); 

  const handleRunScheduler = async (job) => {
    setSchedulingId(job.id);
    try {
      await autoScheduleJob(job);
      setTimeout(() => setSchedulingId(null), 600);
    } catch (error) {
      alert(error.message);
      setSchedulingId(null);
    }
  };

  // --- NEW LOGIC: CLEAR SCHEDULE ---
  const handleClearSchedule = async (job) => {
    if (!window.confirm(`Are you sure you want to clear the schedule for JOB-${job.id.slice(0,8).toUpperCase()}? This will move it back to the pending queue so you can run the AI Scheduler again.`)) {
      return;
    }

    try {
      // 1. Loop through the sequence and reset any step that IS NOT already completed
      const resetSequence = job.process_sequence.map(step => {
        if (step.status === "completed") return step; // Leave finished steps alone
        
        return {
          ...step,
          status: "pending",
          assigned_machine_id: null,
          scheduled_start: null,
          scheduled_end: null
        };
      });

      // 2. Push the reset sequence to Firebase and change overall job status to pending
      const jobRef = doc(db, "jobs", job.id);
      await updateDoc(jobRef, {
        status: "pending",
        process_sequence: resetSequence,
        updated_at: serverTimestamp()
      });

      alert("Schedule cleared! The job is back in the Pending queue.");
    } catch (error) {
      console.error("Error clearing schedule:", error);
      alert("Failed to clear schedule: " + error.message);
    }
  };

  if (loading) return <div className="p-8 text-primary-500 animate-pulse font-medium">Loading production queue...</div>;

  const now = new Date();
  const overdueProcesses = [];
  
  jobs.forEach(job => {
    if (job.status === "completed") return; 
    
    job.process_sequence?.forEach(step => {
      if (step.status === "scheduled" && step.scheduled_end) {
        const endTime = step.scheduled_end.toDate ? step.scheduled_end.toDate() : new Date(step.scheduled_end);
        if (endTime < now) {
          overdueProcesses.push({
            jobId: job.id,
            productName: job.product?.name,
            processId: step.process_id,
            processName: step.process_name,
            scheduledEnd: endTime,
            parentJob: job 
          });
        }
      }
    });
  });

  const filteredJobs = jobs.filter(job => {
    if (activeTab === "all") return true;
    if (activeTab === "pending") return job.status === "pending";
    if (activeTab === "in_progress") return job.status === "scheduled";
    if (activeTab === "completed") return job.status === "completed";
    return true;
  });

  return (
    <div className="max-w-[1600px] mx-auto p-6 h-full flex flex-col">
      
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">Job Management</h2>
          <p className="text-gray-400 mt-1">Create, view, and manage all job cards.</p>
        </div>
        <button 
          onClick={() => setModalOpen(true)}
          className="bg-primary-600 hover:bg-primary-500 text-white px-5 py-2.5 rounded-lg font-medium transition-colors shadow-lg shadow-primary-500/20 flex items-center gap-2 shrink-0"
        >
          <span className="text-lg leading-none">+</span> Create Job
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-6 border-b border-gray-800 mb-6 overflow-x-auto whitespace-nowrap no-scrollbar pb-1">
        {[
          { id: "all", label: "All" },
          { id: "pending", label: "Pending" },
          { id: "in_progress", label: "In Progress" },
          { id: "completed", label: "Completed" }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id 
                ? "border-primary-500 text-white" 
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
        
        {/* Overdue Tab */}
        <button
          onClick={() => setActiveTab("overdue")}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "overdue" 
              ? "border-red-500 text-red-400" 
              : "border-transparent text-gray-400 hover:text-red-400/80"
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          Overdue 
          {overdueProcesses.length > 0 && (
            <span className={`px-2 py-0.5 rounded-full text-xs ${activeTab === "overdue" ? "bg-red-500 text-white" : "bg-red-500/20 text-red-400"}`}>
              {overdueProcesses.length}
            </span>
          )}
        </button>
      </div>

      {/* Overdue Warning Banner */}
      {activeTab === "overdue" && overdueProcesses.length > 0 && (
        <div className="bg-red-950/30 border border-red-900/50 rounded-lg p-4 mb-6 flex items-start gap-3 shrink-0">
          <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <h4 className="text-red-400 font-bold text-sm">{overdueProcesses.length} Overdue Processes</h4>
            <p className="text-red-200/70 text-sm mt-1">These processes were scheduled but not completed on time. You can clear the schedule to reschedule them.</p>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden shadow-xl flex-1 flex flex-col">
        <div className="overflow-x-auto flex-1">
          
          {/* OVERDUE TABLE VIEW */}
          {activeTab === "overdue" ? (
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-gray-950/50 border-b border-gray-800 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  <th className="py-4 px-6">Job</th>
                  <th className="py-4 px-6">Process</th>
                  <th className="py-4 px-6">Scheduled End</th>
                  <th className="py-4 px-6">Overdue By</th>
                  <th className="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {overdueProcesses.length === 0 ? (
                  <tr><td colSpan="5" className="py-12 text-center text-gray-500">No overdue processes. Great job!</td></tr>
                ) : (
                  overdueProcesses.map((proc, idx) => (
                    <tr key={`${proc.jobId}-${proc.processId}-${idx}`} className="hover:bg-gray-800/30 transition-colors group">
                      <td className="py-4 px-6">
                        <div className="font-bold text-gray-200">JOB-{proc.jobId.slice(0, 8).toUpperCase()}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{proc.productName || 'Untitled Job'}</div>
                      </td>
                      <td className="py-4 px-6 text-gray-300 font-medium">{proc.processName}</td>
                      <td className="py-4 px-6 text-gray-400 flex items-center gap-2">
                        <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        {proc.scheduledEnd.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-4 px-6 text-red-400 font-medium text-sm">{getOverdueText(proc.scheduledEnd)}</td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex justify-end gap-3">
                          <button 
                            onClick={() => setViewingJob(proc.parentJob)}
                            className="text-gray-400 hover:text-white text-sm font-medium transition-colors px-3 py-1.5 border border-gray-700 rounded-md hover:bg-gray-800"
                          >
                            View Job
                          </button>
                          
                          {/* THE CLEAR SCHEDULE BUTTON IS NOW HOOKED UP! */}
                          <button 
                            onClick={() => handleClearSchedule(proc.parentJob)}
                            className="text-red-400 hover:text-red-300 text-sm font-medium transition-colors px-3 py-1.5 border border-red-900/50 bg-red-500/10 rounded-md hover:bg-red-500/20 flex items-center gap-1.5"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            Clear Schedule
                          </button>

                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            
            /* STANDARD TABLE VIEW */
            <table className="w-full text-left border-collapse min-w-[1000px]">
              <thead>
                <tr className="bg-gray-950/50 border-b border-gray-800 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  <th className="py-4 px-6">Job ID</th>
                  <th className="py-4 px-6">Product</th>
                  <th className="py-4 px-6">Target Qty</th>
                  <th className="py-4 px-6">Status</th>
                  <th className="py-4 px-6">Processes</th>
                  <th className="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {filteredJobs.length === 0 ? (
                  <tr><td colSpan="6" className="py-12 text-center text-gray-500">No jobs found in this category.</td></tr>
                ) : (
                  filteredJobs.map((job) => {
                    const isFullyScheduled = job.status === 'scheduled' && !job.process_sequence.some(s => s.status === 'pending');

                    return (
                      <tr key={job.id} className="hover:bg-gray-800/30 transition-colors group">
                        <td className="py-4 px-6 font-mono text-sm font-bold text-gray-200">JOB-{job.id.slice(0, 6).toUpperCase()}</td>
                        <td className="py-4 px-6">
                          <div className="font-medium text-gray-300">{job.title || job.product?.name || 'Untitled Job'}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{job.product?.sku}</div>
                        </td>
                        <td className="py-4 px-6 text-gray-400">{job.quantity_target.toLocaleString()}</td>
                        <td className="py-4 px-6">
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase border ${
                            job.status === 'scheduled' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 
                            job.status === 'pending' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' : 
                            'bg-green-500/10 text-green-400 border-green-500/20'
                          }`}>
                            {job.status === 'scheduled' ? 'In Progress' : job.status}
                          </span>
                        </td>
                        
                        <td className="py-4 px-6">
                          <div className="flex gap-1.5">
                            {job.process_sequence?.map(step => (
                              <div key={step.step_order} title={`${step.process_name} (${step.status})`} className={`w-2.5 h-2.5 rounded-full ${step.status === 'completed' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : step.status === 'scheduled' ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)]' : 'bg-gray-700'}`}></div>
                            ))}
                          </div>
                        </td>
                        
                        <td className="py-4 px-6 text-right">
                          <div className="flex justify-end items-center gap-2">
                            <button 
                              onClick={() => setViewingJob(job)}
                              className="text-gray-400 hover:text-white text-sm font-medium transition-colors px-3 py-1.5 border border-gray-700 rounded-md hover:bg-gray-800"
                            >
                              View
                            </button>
                            
                            {job.status !== 'completed' && (
                              <button 
                                onClick={() => handleRunScheduler(job)}
                                disabled={schedulingId === job.id || isFullyScheduled}
                                className={`text-sm font-medium transition-all px-4 py-1.5 rounded-md border ${
                                  isFullyScheduled 
                                    ? 'border-gray-700 text-gray-600 cursor-not-allowed bg-gray-800/50' 
                                    : 'border-primary-500/50 text-primary-400 hover:bg-primary-500/10 hover:border-primary-400'
                                }`}
                              >
                                {schedulingId === job.id ? 'Thinking...' : isFullyScheduled ? 'Assigned' : 'Run AI'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
          
        </div>
      </div>

      {isModalOpen && <JobModal onClose={() => setModalOpen(false)} />}
      
      <JobViewModal job={viewingJob} onClose={() => setViewingJob(null)} />
    </div>
  );
}