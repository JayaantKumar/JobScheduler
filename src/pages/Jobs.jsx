import { useState, Fragment } from "react";
import { useJobs } from "../hooks/useJobs";
import JobViewModal from "../components/JobViewModal";
import { doc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase/config";

export default function Jobs() {
  const { jobs, loading } = useJobs();
  const [activeTab, setActiveTab] = useState("All");
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

  const groupedJobs = [];
  const setMap = {};

  jobs.forEach(job => {
    if (job.set_code && job.parts_total > 1) {
      if (!setMap[job.set_code]) setMap[job.set_code] = [];
      setMap[job.set_code].push(job);
    } else {
      groupedJobs.push([job]); 
    }
  });

  Object.values(setMap).forEach(group => groupedJobs.push(group));

  const filteredGroups = groupedJobs.filter(group => {
    if (activeTab === "All") return true;

    const hasPending = group.some(j => j.status === "pending");
    const hasInProgress = group.some(j => j.status === "in_progress" || j.status === "scheduled");
    const allCompleted = group.every(j => j.status === "completed");
    const hasOverdue = group.some(j => j.status !== "completed" && new Date(j.deadline) < new Date());

    if (activeTab === "Completed") return allCompleted;
    if (activeTab === "Overdue") return hasOverdue;
    if (activeTab === "Pending") return hasPending && !allCompleted;
    if (activeTab === "In Progress") return hasInProgress;

    return true;
  });

  if (loading) return <div className="p-8 text-primary-500 animate-pulse font-medium">Loading Job Data...</div>;

  const tabs = ["All", "Pending", "In Progress", "Completed", "Overdue"];

  return (
    <div className="max-w-[1600px] mx-auto p-4 sm:p-6 h-full flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Job Management</h2>
          <p className="text-sm sm:text-base text-gray-400 mt-1">View, print, and manage all active factory job cards and linked sets.</p>
        </div>
      </div>

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

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden shadow-xl flex-1 flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-gray-950/50 border-b border-gray-800 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                <th className="py-4 px-6 w-[15%]">Job / Set ID</th>
                <th className="py-4 px-6 w-[25%]">Product / Part Name</th>
                <th className="py-4 px-6 w-[15%]">Target Qty</th>
                <th className="py-4 px-6 w-[15%]">Status</th>
                <th className="py-4 px-6 w-[15%]">Processes / Rollup</th>
                <th className="py-4 px-6 w-[15%] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              
              {filteredGroups.length === 0 ? (
                <tr><td colSpan="6" className="py-12 text-center text-gray-500">No jobs found in this category.</td></tr>
              ) : (
                filteredGroups.map((group) => {
                  const isSet = group.length > 1 || (group[0].parts_total > 1 && group[0].set_code);

                  if (isSet) {
                    const setCode = group[0].set_code;
                    const completedCount = group.filter(j => j.status === 'completed').length;
                    const isSetCompleted = completedCount === group.length;
                    const isSetOverdue = group.some(j => j.status !== "completed" && new Date(j.deadline) < new Date());
                    
                    let setStatus = "pending";
                    if (isSetCompleted) setStatus = "completed";
                    else if (isSetOverdue) setStatus = "overdue";
                    else if (group.some(j => j.status === "in_progress" || j.status === "scheduled")) setStatus = "in_progress";

                    return (
                      <Fragment key={`set-${setCode}`}>
                        <tr className="bg-[#151724] border-t-2 border-gray-800">
                          <td className="py-4 px-6">
                            {/* ⭐️ FIXED: Correctly prepends SET- to both old legacy codes and new sequential codes */}
                            <span className="font-mono text-sm font-bold text-primary-400">
                              SET-{setCode}
                            </span>
                          </td>
                          <td className="py-4 px-6">
                            <div className="font-bold text-white text-sm">{group[0].product?.name || "Multi-Part Set"}</div>
                            <div className="text-xs text-gray-500 mt-0.5">{group[0].customer || "Unknown Customer"}</div>
                          </td>
                          <td className="py-4 px-6"></td>
                          <td className="py-4 px-6">
                            <span className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${
                              setStatus === 'completed' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 
                              setStatus === 'overdue' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                              setStatus === 'in_progress' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 
                              'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                            }`}>
                              {setStatus === 'overdue' ? 'OVERDUE' : setStatus === 'in_progress' ? 'IN PROGRESS' : setStatus}
                            </span>
                          </td>
                          <td className="py-4 px-6">
                            <div className="text-xs font-bold text-gray-300">{completedCount} / {group.length} Parts Complete</div>
                            <div className="text-[10px] text-gray-500 mt-0.5 font-medium">Due: {new Date(group[0].deadline).toLocaleDateString()}</div>
                          </td>
                          <td className="py-4 px-6 text-right"></td>
                        </tr>

                        {group.map(job => (
                          <tr key={job.id} className="hover:bg-gray-800/30 transition-colors bg-gray-900/40">
                            <td className="py-3 px-6 pl-10 border-l-2 border-gray-800">
                              <div className="flex items-center gap-2">
                                <span className="text-gray-600">↳</span>
                                <span className="font-mono text-xs font-bold text-gray-400">{job.display_id || `JOB-${job.id.slice(0,6).toUpperCase()}`}</span>
                              </div>
                            </td>
                            <td className="py-3 px-6">
                              <div className="font-bold text-gray-300 text-xs">Part {job.part_index}: {job.part_name || "Component"}</div>
                            </td>
                            <td className="py-3 px-6 text-gray-400 text-xs font-medium">
                              {job.quantity_target?.toLocaleString()} pcs
                            </td>
                            <td className="py-3 px-6">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                                job.status === 'completed' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 
                                job.status === 'in_progress' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 
                                'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                              }`}>
                                {job.status}
                              </span>
                            </td>
                            <td className="py-3 px-6">
                              <div className="flex gap-1.5 items-center">
                                {job.process_sequence?.map((step, i) => (
                                  <div key={i} title={step.process_name} className={`w-2 h-2 rounded-full ${step.status === 'completed' ? 'bg-green-500' : step.status === 'in_progress' ? 'bg-blue-500' : 'bg-gray-700'}`} />
                                ))}
                              </div>
                            </td>
                            <td className="py-3 px-6 text-right">
                              <div className="flex justify-end gap-2">
                                <button onClick={() => setViewingJob(job)} className="text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 px-3 py-1 rounded text-[10px] font-bold transition-colors">View Card</button>
                                <button onClick={() => handleDelete(job.id)} className="text-gray-500 hover:text-red-400 border border-transparent hover:border-red-900/50 hover:bg-red-500/10 px-2 py-1 rounded text-[10px] font-bold transition-colors">Delete</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    );
                  }

                  const job = group[0];
                  return (
                    <tr key={job.id} className="hover:bg-gray-800/30 transition-colors">
                      <td className="py-4 px-6">
                        <span className="font-mono text-sm font-bold text-gray-200">{job.display_id || `JOB-${job.id.slice(0,6).toUpperCase()}`}</span>
                      </td>
                      <td className="py-4 px-6">
                        <div className="font-bold text-white text-sm">{job.title || job.product?.name}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{job.product?.sku || "N/A"}</div>
                      </td>
                      <td className="py-4 px-6 text-gray-300 text-sm">
                        {job.quantity_target?.toLocaleString() || 0} pcs
                      </td>
                      <td className="py-4 px-6">
                         <span className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${
                            job.status === 'completed' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 
                            job.status === 'in_progress' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 
                            'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                          }`}>
                            {job.status}
                          </span>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex gap-1.5 items-center">
                          {job.process_sequence?.map((step, i) => (
                            <div key={i} title={step.process_name} className={`w-2.5 h-2.5 rounded-full ${step.status === 'completed' ? 'bg-green-500' : step.status === 'in_progress' ? 'bg-blue-500' : 'bg-gray-700'}`} />
                          ))}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setViewingJob(job)} className="text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 px-4 py-1.5 rounded text-xs font-medium transition-colors">View</button>
                          <button onClick={() => handleDelete(job.id)} className="text-gray-500 hover:text-red-400 border border-transparent hover:border-red-900/50 hover:bg-red-500/10 px-3 py-1.5 rounded text-xs font-medium transition-colors">Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {viewingJob && <JobViewModal job={viewingJob} onClose={() => setViewingJob(null)} />}
    </div>
  );
}