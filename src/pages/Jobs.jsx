import { useState } from "react";
import { useJobs } from "../hooks/useJobs";
import JobModal from "../components/JobModal";
import JobViewModal from "../components/JobViewModal";
import { doc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase/config";

export default function Jobs() {
  const { jobs, loading } = useJobs();
  const [activeTab, setActiveTab] = useState("All");
  
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  const [viewingJob, setViewingJob] = useState(null);

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this job card?")) {
      try {
        await deleteDoc(doc(db, "jobs", id));
      } catch (error) {
        alert("Failed to delete: " + error.message);
      }
    }
  };

  // Filter logic based purely on tabs now
  const filteredJobs = jobs.filter(job => {
    if (activeTab === "All") return true;
    if (activeTab === "Pending") return job.status === "pending";
    if (activeTab === "In Progress") return job.status === "in_progress" || job.status === "scheduled";
    if (activeTab === "Completed") return job.status === "completed";
    if (activeTab === "Overdue") {
      return job.status !== "completed" && new Date(job.deadline) < new Date();
    }
    return true;
  });

  if (loading) return <div className="p-8 text-primary-500 animate-pulse font-medium">Loading Job Data...</div>;

  const tabs = ["All", "Pending", "In Progress", "Completed", "Overdue"];

  return (
    <div className="max-w-[1600px] mx-auto p-4 sm:p-6 h-full flex flex-col">
      
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Job Management</h2>
          <p className="text-sm sm:text-base text-gray-400 mt-1">Create, view, and manage all manual job cards.</p>
        </div>
        <button 
          onClick={() => setCreateModalOpen(true)} 
          className="w-full sm:w-auto justify-center bg-primary-600 hover:bg-primary-500 text-white px-5 py-2.5 rounded-lg font-medium transition-colors shadow-lg flex items-center gap-2 shrink-0"
        >
          <span>+</span> Create Job
        </button>
      </div>

      {/* TABS */}
      <div className="flex items-center gap-6 border-b border-gray-800 mb-6 overflow-x-auto no-scrollbar">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 text-sm font-bold whitespace-nowrap transition-colors ${
              activeTab === tab 
                ? "text-white border-b-2 border-primary-500" 
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* DATA TABLE */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden shadow-xl flex-1 flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-gray-950/50 border-b border-gray-800 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
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
                filteredJobs.map(job => (
                  <tr key={job.id} className="hover:bg-gray-800/30 transition-colors">
                    
                    {/* ID */}
                    <td className="py-4 px-6">
                      <span className="font-mono text-sm font-bold text-gray-200">JOB-{job.id.slice(0,6).toUpperCase()}</span>
                    </td>
                    
                    {/* PRODUCT */}
                    <td className="py-4 px-6">
                      <div className="font-bold text-white text-sm">{job.title || job.product?.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{job.product?.sku || "N/A"}</div>
                    </td>
                    
                    {/* TARGET QTY */}
                    <td className="py-4 px-6 text-gray-300 text-sm">
                      {job.quantity_target?.toLocaleString() || 0}
                    </td>
                    
                    {/* STATUS */}
                    <td className="py-4 px-6">
                       <span className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${
                          job.status === 'completed' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 
                          job.status === 'in_progress' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 
                          'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                        }`}>
                          {job.status}
                        </span>
                    </td>
                    
                    {/* PROCESS DOTS */}
                    <td className="py-4 px-6">
                      <div className="flex gap-1.5 items-center">
                        {job.process_sequence?.map((step, i) => (
                          <div 
                            key={i} 
                            title={step.process_name}
                            className={`w-2.5 h-2.5 rounded-full ${
                              step.status === 'completed' ? 'bg-green-500' :
                              step.status === 'in_progress' ? 'bg-blue-500' :
                              'bg-gray-700'
                            }`}
                          />
                        ))}
                      </div>
                    </td>
                    
                    {/* ACTIONS */}
                    <td className="py-4 px-6 text-right">
                      <div className="flex justify-end gap-2">
                        <button 
                          onClick={() => setViewingJob(job)}
                          className="text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 px-4 py-1.5 rounded text-xs font-medium transition-colors"
                        >
                          View
                        </button>
                        <button 
                          onClick={() => handleDelete(job.id)}
                          className="text-gray-500 hover:text-red-400 border border-transparent hover:border-red-900/50 hover:bg-red-500/10 px-3 py-1.5 rounded text-xs font-medium transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isCreateModalOpen && <JobModal onClose={() => setCreateModalOpen(false)} />}
      {viewingJob && <JobViewModal job={viewingJob} onClose={() => setViewingJob(null)} />}
    </div>
  );
}