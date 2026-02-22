import { useState } from "react";
import { useJobs } from "../hooks/useJobs";
import JobModal from "../components/JobModal";
import { autoScheduleJob } from "../services/scheduler.service"; // Add this import!

export default function Jobs() {
  const { jobs, loading } = useJobs();
  const [isModalOpen, setModalOpen] = useState(false);
  const [schedulingId, setSchedulingId] = useState(null); // Tracks which job is processing

  const handleRunScheduler = async (job) => {
    setSchedulingId(job.id);
    try {
      await autoScheduleJob(job);
      // Wait a split second to make the UI feel smooth
      setTimeout(() => setSchedulingId(null), 600);
    } catch (error) {
      alert(error.message);
      setSchedulingId(null);
    }
  };

  if (loading) return <div className="p-8 text-primary-500 animate-pulse font-medium">Loading production queue...</div>;

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* ... (Keep your existing Header and Create Job button) ... */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white">Job Management</h2>
          <p className="text-gray-400 mt-1">Production queue and scheduling status.</p>
        </div>
        <button 
          onClick={() => setModalOpen(true)}
          className="bg-primary-600 hover:bg-primary-500 text-white px-5 py-2.5 rounded-lg font-medium transition-colors shadow-lg shadow-primary-500/20"
        >
          + Create Job
        </button>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden shadow-xl">
        <table className="w-full text-left border-collapse">
          {/* ... (Keep your existing table headers) ... */}
          <thead>
            <tr className="bg-gray-950/50 border-b border-gray-800 text-sm font-medium text-gray-400">
              <th className="py-4 px-6">Job ID</th>
              <th className="py-4 px-6">Product (Denormalized)</th>
              <th className="py-4 px-6">Target Qty</th>
              <th className="py-4 px-6">Status</th>
              <th className="py-4 px-6">Processes</th>
              <th className="py-4 px-6 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {jobs.length === 0 ? (
              <tr><td colSpan="6" className="py-8 text-center text-gray-500">No active jobs in queue.</td></tr>
            ) : (
              jobs.map((job) => {
                // Determine if there are still steps left to schedule
                const isFullyScheduled = job.status === 'scheduled' && !job.process_sequence.some(s => s.status === 'pending');

                return (
                  <tr key={job.id} className="hover:bg-gray-800/50 transition-colors group">
                    <td className="py-4 px-6 font-mono text-xs text-gray-400">{job.id.slice(0, 8)}...</td>
                    <td className="py-4 px-6">
                      <div className="font-medium text-gray-200">{job.product?.name}</div>
                      <div className="text-xs text-gray-500">{job.product?.sku}</div>
                    </td>
                    <td className="py-4 px-6 text-gray-300">{job.quantity_target.toLocaleString()}</td>
                    <td className="py-4 px-6">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium border ${
                        job.status === 'scheduled' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 
                        job.status === 'pending' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' : 
                        'bg-green-500/10 text-green-400 border-green-500/20'
                      }`}>
                        {job.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex gap-1">
                        {job.process_sequence?.map(step => (
                          <div key={step.step_order} title={step.process_name} className={`w-3 h-3 rounded-full ${step.status === 'completed' ? 'bg-green-500' : step.status === 'scheduled' ? 'bg-blue-500' : 'bg-gray-700'}`}></div>
                        ))}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right">
                      {/* THE MAGIC BUTTON */}
                      <button 
                        onClick={() => handleRunScheduler(job)}
                        disabled={schedulingId === job.id || isFullyScheduled}
                        className={`text-sm font-medium transition-all ${
                          isFullyScheduled 
                            ? 'text-gray-600 cursor-not-allowed' 
                            : 'text-primary-400 hover:text-primary-300 opacity-0 group-hover:opacity-100'
                        }`}
                      >
                        {schedulingId === job.id ? 'Thinking...' : isFullyScheduled ? 'Assigned' : 'Run Scheduler'}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && <JobModal onClose={() => setModalOpen(false)} />}
    </div>
  );
}