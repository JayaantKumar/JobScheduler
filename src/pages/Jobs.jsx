import { useState, Fragment } from "react";
import { useJobs } from "../hooks/useJobs";
import { useCustomers } from "../hooks/useCustomers";
import JobViewModal from "../components/JobViewModal";
import { doc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase/config";

export default function Jobs() {
  const { jobs, loading } = useJobs();
  const { customers } = useCustomers();
  
  const [activeTab, setActiveTab] = useState("All");
  const [selectedCustomerFilter, setSelectedCustomerFilter] = useState(""); // ⭐️ ROUND 9.8: Customer Filter
  const [searchQuery, setSearchQuery] = useState(""); // ⭐️ ROUND 9.8: Search Query (ID, Set Code, Product, SKU, PO)
  const [viewingJob, setViewingJob] = useState(null);
  const [confirmConfig, setConfirmConfig] = useState(null); // ⭐️ ROUND 9.7: Inline Confirm

  // ⭐️ ROUND 9.7 ITEM 4: Replaced native window.confirm and alert
  const handleDelete = (id) => {
    setConfirmConfig({
      isOpen: true,
      title: "Delete Job Card",
      message: "Are you sure you want to delete this job card? This action cannot be undone.",
      confirmText: "Delete Job",
      isDanger: true,
      onConfirm: async () => {
        setConfirmConfig(null);
        try {
          await deleteDoc(doc(db, "jobs", id));
        } catch (error) {
          alert("Failed to delete: " + error.message);
        }
      },
      onCancel: () => setConfirmConfig(null)
    });
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

  Object.values(setMap).forEach(group => {
    group.sort((a, b) => Number(a.part_index || 0) - Number(b.part_index || 0));
    groupedJobs.push(group);
  });

  const isJobOnHold = (job) => {
    const activeStep = job.process_sequence?.find(s => s.status !== 'completed');
    return activeStep?.status === 'on_hold';
  };

  const isJobInProgress = (job) => {
    const activeStep = job.process_sequence?.find(s => s.status !== 'completed');
    return activeStep?.status === 'in_progress' || activeStep?.status === 'scheduled';
  };

  // ⭐️ ROUND 9.8: Combined Tabs + Customer Filter + Advanced Search
  const filteredGroups = groupedJobs.filter(group => {
    // 1. Search Query Filter (Matches Job ID, Set Code, Product Name, SKU, Customer PO)
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase().trim();
      const matchesAnyJob = group.some(j => {
        const displayId = (j.display_id || "").toLowerCase();
        const setId = (j.set_code || "").toLowerCase();
        const prodName = (j.title || j.product_snapshot?.name || j.product?.name || "").toLowerCase();
        const sku = (j.product_snapshot?.sku || j.product?.sku || "").toLowerCase();
        const customerPo = (j.customer_po || j.po_number || "").toLowerCase(); // Future-proof PO field support
        
        return displayId.includes(q) || setId.includes(q) || prodName.includes(q) || sku.includes(q) || customerPo.includes(q);
      });
      if (!matchesAnyJob) return false;
    }

    // 2. Customer Filter
    if (selectedCustomerFilter) {
      const matchesCustomer = group.some(j => j.customer === selectedCustomerFilter || j.customerId === selectedCustomerFilter);
      if (!matchesCustomer) return false;
    }

    // 3. Status Tab Filter
    if (activeTab === "All") return true;

    const hasPending = group.some(j => j.status === "pending");
    const hasOnHold = group.some(isJobOnHold);
    const hasInProgress = group.some(isJobInProgress);
    const allCompleted = group.every(j => j.status === "completed");
    const hasOverdue = group.some(j => j.status !== "completed" && new Date(j.deadline) < new Date());

    if (activeTab === "Completed") return allCompleted;
    if (activeTab === "Overdue") return hasOverdue;
    if (activeTab === "On Hold") return hasOnHold;
    if (activeTab === "In Progress") return hasInProgress && !hasOnHold; 
    if (activeTab === "Pending") return hasPending && !allCompleted && !hasOnHold && !hasInProgress;

    return true;
  });

  if (loading) return <div className="p-8 text-primary-500 animate-pulse font-medium">Loading Job Data...</div>;

  const tabs = ["All", "Pending", "In Progress", "On Hold", "Completed", "Overdue"];

  const getStepStatusUI = (job) => {
    const seq = job.process_sequence || [];
    const currentIdx = seq.findIndex(s => s.status !== 'completed');
    
    if (currentIdx === -1) {
      return (
        <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border bg-green-500/10 text-green-400 border-green-500/20">
          COMPLETED
        </span>
      );
    }

    const currentStep = seq[currentIdx];
    const statusDate = currentStep.status_updated_at || currentStep.started_at || job.job_date;
    const diffDays = statusDate ? Math.floor((new Date() - new Date(statusDate)) / (1000 * 60 * 60 * 24)) : 0;
    
    if (currentStep.status === 'on_hold') {
      const reasonStr = currentStep.hold_reason ? ` - ${currentStep.hold_reason}` : '';
      return (
        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[9px] font-bold tracking-wider bg-orange-500/10 text-orange-400 border-orange-500/30">
          <span className="uppercase">⏸ ON HOLD{reasonStr}</span>
          {diffDays >= 0 && <span className="ml-1 border-l border-orange-500/50 pl-1.5 opacity-80">{diffDays}d</span>}
        </div>
      );
    }
    
    let colorClass = "bg-gray-800 text-gray-400 border-gray-700";
    if (diffDays >= 4) colorClass = "bg-red-500/10 text-red-400 border-red-500/30";
    else if (diffDays >= 2) colorClass = "bg-orange-500/10 text-orange-400 border-orange-500/30";
    else if (currentStep.status === 'in_progress') colorClass = "bg-blue-500/10 text-blue-400 border-blue-500/30";

    return (
      <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[9px] font-bold tracking-wider ${colorClass}`}>
        <span className="uppercase">{currentIdx + 1}/{seq.length} · {currentStep.process_name}</span>
        {diffDays >= 0 && (
           <span className="ml-1 border-l border-current pl-1.5 opacity-80">{diffDays}d</span>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-[1600px] mx-auto p-4 sm:p-6 h-full flex flex-col">
      
      {/* Inline Confirmation Modal */}
      {confirmConfig && confirmConfig.isOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-fade-in">
            <div className="p-6">
              <h3 className="text-xl font-bold text-white mb-2">{confirmConfig.title}</h3>
              <p className="text-sm text-gray-300 leading-relaxed mb-8">{confirmConfig.message}</p>
              <div className="flex justify-end gap-3">
                <button onClick={confirmConfig.onCancel} className="px-5 py-2.5 text-gray-400 hover:text-white transition-colors font-medium bg-gray-800 rounded-lg">Cancel</button>
                <button onClick={confirmConfig.onConfirm} className={`px-6 py-2.5 rounded-lg font-bold text-white transition-colors shadow-lg ${confirmConfig.isDanger ? 'bg-red-600 hover:bg-red-500' : 'bg-primary-600 hover:bg-primary-500'}`}>
                  {confirmConfig.confirmText || "Confirm"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Job Management</h2>
          <p className="text-sm sm:text-base text-gray-400 mt-1">View, print, and manage all active factory job cards and linked sets.</p>
        </div>
      </div>

      {/* Filters Bar: Customer Dropdown + Advanced Search Box */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <select
          value={selectedCustomerFilter}
          onChange={(e) => setSelectedCustomerFilter(e.target.value)}
          className="w-full sm:w-64 bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary-500"
        >
          <option value="">All Customers</option>
          {customers.map(c => (
            <option key={c.id} value={c.name}>{c.name}</option>
          ))}
        </select>

        <input 
          type="text" 
          placeholder="Search by Job ID, Set Code (SET-...), Product, SKU or PO..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 max-w-lg bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary-500"
        />
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
                <th className="py-4 px-6 w-[15%]">Current Step / Status</th>
                <th className="py-4 px-6 w-[15%]">Processes / Rollup</th>
                <th className="py-4 px-6 w-[15%] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              
              {filteredGroups.length === 0 ? (
                <tr><td colSpan="6" className="py-12 text-center text-gray-500">No jobs found matching your filters.</td></tr>
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
                    else if (group.some(isJobOnHold)) setStatus = "on_hold";
                    else if (group.some(isJobInProgress)) setStatus = "in_progress";

                    return (
                      <Fragment key={`set-${setCode}`}>
                        <tr className="bg-[#151724] border-t-2 border-gray-800">
                          <td className="py-4 px-6">
                            <span className="font-mono text-sm font-bold text-primary-400">
                              SET-{setCode}
                            </span>
                          </td>
                          <td className="py-4 px-6">
                            <div className="font-bold text-white text-sm">
                              {group[0].product_snapshot?.name || group[0].product?.name || "Multi-Part Set"}
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">{group[0].customer || "Unknown Customer"}</div>
                          </td>
                          <td className="py-4 px-6"></td>
                          <td className="py-4 px-6">
                            <span className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider border ${
                              setStatus === 'completed' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 
                              setStatus === 'overdue' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                              setStatus === 'on_hold' ? 'bg-orange-500/10 text-orange-400 border-orange-500/30' :
                              setStatus === 'in_progress' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 
                              'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                            }`}>
                              {setStatus === 'overdue' ? 'OVERDUE' : setStatus === 'on_hold' ? 'ON HOLD' : setStatus === 'in_progress' ? 'IN PROGRESS' : setStatus}
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
                              <div className="flex items-center gap-2">
                                <div className="font-bold text-gray-300 text-xs">Part {job.part_index}: {job.part_name || "Component"}</div>
                                {job.artwork_required === false && (
                                  <span className="bg-gray-800 text-gray-500 border border-gray-700 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase">Plain</span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-6 text-gray-400 text-xs font-medium">
                              {job.quantity_target?.toLocaleString()} pcs
                            </td>
                            <td className="py-3 px-6">
                              {getStepStatusUI(job)}
                            </td>
                            <td className="py-3 px-6">
                              <div className="flex gap-1.5 items-center">
                                {job.process_sequence?.map((step, i) => (
                                  <div key={i} title={step.process_name} className={`w-2 h-2 rounded-full ${step.status === 'completed' ? 'bg-green-500' : step.status === 'in_progress' ? 'bg-blue-500' : step.status === 'on_hold' ? 'bg-orange-500' : 'bg-gray-700'}`} />
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
                        <div className="flex items-center gap-2">
                          <div className="font-bold text-white text-sm">
                            {job.title || job.product_snapshot?.name || job.product?.name}
                          </div>
                          {job.artwork_required === false && (
                            <span className="bg-gray-800 text-gray-500 border border-gray-700 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase">Plain</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {job.product_snapshot?.sku || job.product?.sku || "N/A"}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-gray-300 text-sm">
                        {job.quantity_target?.toLocaleString() || 0} pcs
                      </td>
                      <td className="py-4 px-6">
                         {getStepStatusUI(job)}
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex gap-1.5 items-center">
                          {job.process_sequence?.map((step, i) => (
                            <div key={i} title={step.process_name} className={`w-2.5 h-2.5 rounded-full ${step.status === 'completed' ? 'bg-green-500' : step.status === 'in_progress' ? 'bg-blue-500' : step.status === 'on_hold' ? 'bg-orange-500' : 'bg-gray-700'}`} />
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

      {viewingJob && <JobViewModal job={viewingJob} onClose={() => {
        setViewingJob(null);
        window.dispatchEvent(new Event("focus")); 
      }} />}

      {!viewingJob && (
        <style type="text/css" media="print">
          {`
            #root { display: block !important; }
            .print\\:hidden { display: block !important; }
            body, html { background-color: white !important; color: black !important; }
            * { color: black !important; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border-bottom: 1px solid #ccc !important; padding: 12px 8px !important; text-align: left; }
            th { background-color: #f3f4f6 !important; font-weight: bold; }
            button { display: none !important; }
            .bg-gray-900, .bg-gray-950, .bg-\\[\\#151724\\] { background-color: transparent !important; border: none !important; }
            .border-gray-800, .border-gray-700 { border-color: #ccc !important; }
          `}
        </style>
      )}
    </div>
  );
}