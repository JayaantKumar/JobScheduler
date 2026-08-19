import { useState, Fragment } from "react";
import { useJobs } from "../hooks/useJobs";
import { useCustomers } from "../hooks/useCustomers";
import JobViewModal from "../components/JobViewModal";
import { doc, deleteDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase/config";

// ⭐️ ROUND 20: Configurable Auto-Archive Window
const AUTO_ARCHIVE_DAYS = 7;

// ⭐️ ROUND 20 BUG 2 FIX: Bulletproof status normalizer
const normalizeStatus = (statusStr) => String(statusStr || "").replace(/[-_ ]/g, "").toLowerCase();

export default function Jobs() {
  const { jobs, loading } = useJobs();
  const { customers } = useCustomers();
  
  const [activeTab, setActiveTab] = useState("All");
  const [selectedCustomerFilter, setSelectedCustomerFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState(""); 
  const [viewingJob, setViewingJob] = useState(null);
  const [confirmConfig, setConfirmConfig] = useState(null); 

  const [expandedSets, setExpandedSets] = useState({});

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

  // ⭐️ ROUND 20 NEW: Manual Archive / Restore action for an entire group/set
  const handleToggleArchive = async (group, archiveStatus) => {
    setConfirmConfig({
      isOpen: true,
      title: archiveStatus ? "Archive Job" : "Restore Job",
      message: archiveStatus 
        ? "This will hide the job from the active board. It will remain fully accessible under the Archived tab." 
        : "This will move the job back to the active production board.",
      confirmText: archiveStatus ? "Archive Now" : "Restore",
      isDanger: false,
      onConfirm: async () => {
        setConfirmConfig(null);
        try {
          const promises = group.map(j => updateDoc(doc(db, "jobs", j.id), { is_archived: archiveStatus }));
          await Promise.all(promises);
        } catch (error) {
          alert("Failed to update archive status: " + error.message);
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

  // ⭐️ ROUND 20: Pre-process groups to inject Archive metadata & timestamps
  const groupsWithMeta = groupedJobs.map(group => {
    const isGroupManualArchived = group.some(j => j.is_archived);
    const allCompleted = group.every(j => normalizeStatus(j.status) === 'completed' || j.process_sequence?.every(s => normalizeStatus(s.status) === 'completed'));
    
    let isGroupAutoArchived = false;
    let latestCompletionDate = 0;

    if (allCompleted) {
      group.forEach(j => {
         const finalStep = j.process_sequence?.[j.process_sequence?.length - 1];
         const dtStr = finalStep?.completed_at || finalStep?.status_updated_at || j.job_date;
         if (dtStr) {
           const ts = new Date(dtStr).getTime();
           if (ts > latestCompletionDate) latestCompletionDate = ts;
         }
      });
      if (latestCompletionDate > 0 && !isGroupManualArchived) {
         const daysSince = (new Date().getTime() - latestCompletionDate) / (1000 * 60 * 60 * 24);
         if (daysSince >= AUTO_ARCHIVE_DAYS) isGroupAutoArchived = true;
      }
    }
    
    const isEffectivelyArchived = isGroupManualArchived || isGroupAutoArchived;
    
    // Determine timestamps for newest-first sorting
    const sortDate = latestCompletionDate > 0 ? latestCompletionDate : new Date(group[0].job_date || 0).getTime();

    return { group, isEffectivelyArchived, allCompleted, sortDate };
  });

  // Sort groups: Newest activity first (critical for Archived tab readability)
  groupsWithMeta.sort((a, b) => b.sortDate - a.sortDate);

  // ⭐️ ROUND 20 BUG 2 FIX: Bulletproof filter normalizations
  const filteredGroups = groupsWithMeta.filter(({ group, isEffectivelyArchived, allCompleted }) => {
    // 1. Search Query Filter
    let matchesSearch = false;
    const q = searchQuery.toLowerCase().trim();
    if (q !== "") {
      matchesSearch = group.some(j => {
        const displayId = (j.display_id || "").toLowerCase();
        const setId = (j.set_code || "").toLowerCase();
        const prodName = (j.title || j.product_snapshot?.name || j.product?.name || "").toLowerCase();
        const sku = (j.product_snapshot?.sku || j.product?.sku || "").toLowerCase();
        const customerPo = (j.customer_po || j.po_number || "").toLowerCase(); 
        
        return displayId.includes(q) || setId.includes(q) || prodName.includes(q) || sku.includes(q) || customerPo.includes(q);
      });
      if (!matchesSearch) return false;
    }

    // 2. Customer Filter
    if (selectedCustomerFilter) {
      const matchesCustomer = group.some(j => j.customer === selectedCustomerFilter || j.customerId === selectedCustomerFilter);
      if (!matchesCustomer) return false;
    }

    // 3. Tab Filter Logic
    if (activeTab === "Archived") {
      return isEffectivelyArchived;
    }

    // ⭐️ If archived, ONLY show on active tabs if actively searched for
    if (isEffectivelyArchived && q === "") {
      return false; 
    }

    if (activeTab === "All") return true;

    // Mutually exclusive flags based on normalized step/job states
    const hasOnHold = group.some(j => 
        normalizeStatus(j.status) === "onhold" || 
        j.process_sequence?.some(s => normalizeStatus(s.status) === "onhold")
    );

    const hasInProgress = group.some(j => {
        const seq = j.process_sequence || [];
        const hasCompletedStep = seq.some(s => normalizeStatus(s.status) === 'completed');
        const hasRemainingStep = seq.some(s => normalizeStatus(s.status) !== 'completed');
        const hasInProgressStep = seq.some(s => normalizeStatus(s.status) === 'inprogress');
        const storedAsInProgress = normalizeStatus(j.status) === "inprogress";
        
        return (hasCompletedStep && hasRemainingStep) || hasInProgressStep || storedAsInProgress;
    });

    const hasPending = group.some(j => {
        const storedAsPending = normalizeStatus(j.status) === "pending" || !j.status;
        const seq = j.process_sequence || [];
        const allPending = seq.every(s => normalizeStatus(s.status) === 'pending' || !s.status);
        return storedAsPending || allPending;
    });

    const hasOverdue = group.some(j => !allCompleted && j.deadline && new Date(j.deadline).setHours(0,0,0,0) < new Date().setHours(0,0,0,0));

    if (activeTab === "Completed") return allCompleted && !isEffectivelyArchived; 
    if (activeTab === "Overdue") return hasOverdue && !allCompleted;
    if (activeTab === "On Hold") return hasOnHold && !allCompleted;
    if (activeTab === "In Progress") return hasInProgress && !hasOnHold && !allCompleted;
    if (activeTab === "Pending") return hasPending && !hasInProgress && !hasOnHold && !allCompleted;

    return true;
  });

  const toggleSet = (setCode) => {
    setExpandedSets(prev => ({ ...prev, [setCode]: !prev[setCode] }));
  };

  const handleToggleAllSets = () => {
    const anyExpanded = Object.values(expandedSets).some(Boolean);
    if (anyExpanded) {
      setExpandedSets({}); 
    } else {
      const all = {};
      filteredGroups.forEach(({group}) => {
        const isSet = group.length > 1 || (group[0].parts_total > 1 && group[0].set_code);
        if (isSet) all[group[0].set_code] = true;
      });
      setExpandedSets(all);
    }
  };

  if (loading) return <div className="p-8 text-primary-500 animate-pulse font-medium">Loading Job Data...</div>;

  // ⭐️ ROUND 20: Appended Archive Tab
  const tabs = ["All", "Pending", "In Progress", "On Hold", "Completed", "Overdue", "Archived"];

  const getStepStatusUI = (job) => {
    const seq = job.process_sequence || [];
    const currentIdx = seq.findIndex(s => normalizeStatus(s.status) !== 'completed');
    
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
    
    if (normalizeStatus(currentStep.status) === 'onhold') {
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
    else if (normalizeStatus(currentStep.status) === 'inprogress') colorClass = "bg-blue-500/10 text-blue-400 border-blue-500/30";

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

        <button 
          onClick={handleToggleAllSets} 
          className="bg-gray-900 border border-gray-700 text-gray-300 px-4 py-2.5 rounded-lg text-sm font-bold hover:text-white hover:bg-gray-800 transition-colors whitespace-nowrap flex items-center justify-center gap-2"
        >
          {Object.values(expandedSets).some(Boolean) ? (
            <>Collapse All Sets <svg className="w-4 h-4 rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg></>
          ) : (
            <>Expand All Sets <svg className="w-4 h-4 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg></>
          )}
        </button>
      </div>

      <div className="flex items-center gap-6 border-b border-gray-800 mb-6 overflow-x-auto no-scrollbar">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 text-sm font-bold whitespace-nowrap transition-colors flex items-center gap-2 ${
              activeTab === tab 
                ? "text-white border-b-2 border-primary-500" 
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {tab === "Archived" && <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>}
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
                filteredGroups.map(({ group, isEffectivelyArchived, allCompleted }) => {
                  const isSet = group.length > 1 || (group[0].parts_total > 1 && group[0].set_code);

                  if (isSet) {
                    const setCode = group[0].set_code;
                    const completedCount = group.filter(j => normalizeStatus(j.status) === 'completed').length;
                    const isSetOverdue = group.some(j => normalizeStatus(j.status) !== "completed" && new Date(j.deadline) < new Date());
                    
                    let setStatus = "pending";
                    if (isEffectivelyArchived) setStatus = "archived";
                    else if (allCompleted) setStatus = "completed";
                    else if (isSetOverdue) setStatus = "overdue";
                    else if (group.some(j => normalizeStatus(j.status) === "onhold" || j.process_sequence?.some(s => normalizeStatus(s.status) === "onhold"))) setStatus = "on_hold";
                    else if (group.some(j => normalizeStatus(j.status) === "inprogress" || j.process_sequence?.some(s => normalizeStatus(s.status) === "inprogress"))) setStatus = "in_progress";

                    const isExpanded = expandedSets[setCode];

                    return (
                      <Fragment key={`set-${setCode}`}>
                        <tr 
                          onClick={() => toggleSet(setCode)}
                          className={`border-t-2 border-gray-800 cursor-pointer hover:bg-gray-800/60 transition-colors group ${isEffectivelyArchived ? 'bg-gray-950 opacity-80' : 'bg-[#151724]'}`}
                        >
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-2">
                              <button className="text-gray-500 group-hover:text-white transition-colors focus:outline-none">
                                <svg className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180 text-primary-400' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                              <span className="font-mono text-sm font-bold text-primary-400">
                                SET-{setCode}
                              </span>
                              {isEffectivelyArchived && (
                                <span className="ml-2 bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border border-gray-700">ARCHIVED</span>
                              )}
                            </div>
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
                              setStatus === 'archived' ? 'bg-gray-800/80 text-gray-400 border-gray-700' :
                              setStatus === 'completed' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 
                              setStatus === 'overdue' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                              setStatus === 'on_hold' ? 'bg-orange-500/10 text-orange-400 border-orange-500/30' :
                              setStatus === 'in_progress' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 
                              'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                            }`}>
                              {setStatus.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-4 px-6">
                            <div className="text-xs font-bold text-gray-300">{completedCount} / {group.length} Parts Complete</div>
                            <div className="text-[10px] text-gray-500 mt-0.5 font-medium">Due: {new Date(group[0].deadline).toLocaleDateString()}</div>
                          </td>
                          <td className="py-4 px-6 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-end gap-2">
                              {allCompleted && !isEffectivelyArchived && (
                                <button onClick={() => handleToggleArchive(group, true)} className="text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 px-3 py-1 rounded text-[10px] font-bold transition-colors">Archive</button>
                              )}
                              {isEffectivelyArchived && (
                                <button onClick={() => handleToggleArchive(group, false)} className="text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 px-3 py-1 rounded text-[10px] font-bold transition-colors">Restore</button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {isExpanded && group.map(job => (
                          <tr key={job.id} className={`hover:bg-gray-800/30 transition-colors ${isEffectivelyArchived ? 'bg-gray-900/20' : 'bg-gray-900/40'}`}>
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
                                  <div key={i} title={step.process_name} className={`w-2 h-2 rounded-full ${normalizeStatus(step.status) === 'completed' ? 'bg-green-500' : normalizeStatus(step.status) === 'inprogress' ? 'bg-blue-500' : normalizeStatus(step.status) === 'onhold' ? 'bg-orange-500' : 'bg-gray-700'}`} />
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
                    <tr key={job.id} className={`hover:bg-gray-800/30 transition-colors ${isEffectivelyArchived ? 'bg-gray-950 opacity-80' : ''}`}>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-bold text-gray-200">{job.display_id || `JOB-${job.id.slice(0,6).toUpperCase()}`}</span>
                          {isEffectivelyArchived && (
                            <span className="bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border border-gray-700">ARCHIVED</span>
                          )}
                        </div>
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
                            <div key={i} title={step.process_name} className={`w-2.5 h-2.5 rounded-full ${normalizeStatus(step.status) === 'completed' ? 'bg-green-500' : normalizeStatus(step.status) === 'inprogress' ? 'bg-blue-500' : normalizeStatus(step.status) === 'onhold' ? 'bg-orange-500' : 'bg-gray-700'}`} />
                          ))}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex justify-end gap-2">
                          {allCompleted && !isEffectivelyArchived && (
                              <button onClick={() => handleToggleArchive(group, true)} className="text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 px-3 py-1 rounded text-xs font-medium transition-colors">Archive</button>
                          )}
                          {isEffectivelyArchived && (
                              <button onClick={() => handleToggleArchive(group, false)} className="text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 px-3 py-1 rounded text-xs font-medium transition-colors">Restore</button>
                          )}
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