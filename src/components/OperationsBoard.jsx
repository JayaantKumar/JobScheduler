import { useState, useEffect, useMemo } from "react";
import { collection, query, where, getDocs, doc, updateDoc, increment, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/config";
import JobViewModal from "./JobViewModal"; 

export default function OperationsBoard() {
  const [loading, setLoading] = useState(true);
  const [rawJobs, setRawJobs] = useState([]);
  
  const [liveProducts, setLiveProducts] = useState({});
  // ⭐️ ROUND 21: Added live machines state to instantly know if a location is a vendor
  const [liveMachines, setLiveMachines] = useState({});
  
  const [selectedJob, setSelectedJob] = useState(null);
  
  const [filterCustomer, setFilterCustomer] = useState("");
  const [filterPlace, setFilterPlace] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [stuckOnly, setStuckOnly] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchActiveJobs = async () => {
      setLoading(true);
      try {
        const q = query(collection(db, "jobs"), where("status", "==", "in_progress"));
        const pendingQ = query(collection(db, "jobs"), where("status", "==", "pending"));
        
        const [inProgressSnap, pendingSnap] = await Promise.all([getDocs(q), getDocs(pendingQ)]);
        
        if (isMounted) {
          const jobsData = [
            ...inProgressSnap.docs.map(d => ({ id: d.id, ...d.data() })),
            ...pendingSnap.docs.map(d => ({ id: d.id, ...d.data() }))
          ];
          setRawJobs(jobsData);
        }
      } catch (error) {
        console.error("Failed to fetch operations data:", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchActiveJobs();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    const productIds = [...new Set(rawJobs.map(j => j.product?.id).filter(Boolean))];
    if (productIds.length === 0) return;

    const unsub = onSnapshot(collection(db, "products"), (snap) => {
       const pMap = {};
       snap.docs.forEach(doc => {
           pMap[doc.id] = doc.data();
       });
       setLiveProducts(pMap);
    });

    return () => unsub();
  }, [rawJobs]);

  // ⭐️ ROUND 21: Live subscribe to machines to fetch vendor flags
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "machines"), (snap) => {
       const mMap = {};
       snap.docs.forEach(doc => {
           mMap[doc.id] = doc.data();
       });
       setLiveMachines(mMap);
    });
    return () => unsub();
  }, []);

  const getDaysAtStep = (dateString) => {
    if (!dateString) return 0;
    const diff = new Date() - new Date(dateString);
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const processedJobs = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const jobs = rawJobs.map(job => {
      const seq = job.process_sequence || [];
      const currentIdx = seq.findIndex(s => s.status !== 'completed');
      const currentStep = currentIdx !== -1 ? seq[currentIdx] : null;

      const stepName = currentStep ? `${currentIdx + 1}/${seq.length} · ${currentStep.process_name}` : 'Completed';
      const place = currentStep?.assigned_machine_place || 'Unassigned';
      
      // ⭐️ ROUND 21: Check if the currently assigned machine is an external vendor
      const currentMachineData = currentStep?.assigned_machine_id ? liveMachines[currentStep.assigned_machine_id] : null;
      const isVendorStep = currentMachineData?.is_vendor || false;
      const vendorName = currentMachineData?.name || "Unknown Vendor";

      const stepStatus = currentStep?.status || 'pending';
      const statusDate = currentStep?.status_updated_at || currentStep?.started_at || job.job_date;
      const daysAtStep = getDaysAtStep(statusDate);
      
      const deadlineDate = job.deadline ? new Date(job.deadline) : null;
      if (deadlineDate) deadlineDate.setHours(0, 0, 0, 0);
      const isOverdue = deadlineDate ? deadlineDate < today : false;

      const isArtworkRequired = job.artwork_required ?? job.product?.artwork_required ?? true;
      let isLiveArtworkApproved = false;
      
      if (isArtworkRequired && job.product?.id && liveProducts[job.product.id]) {
          const liveProd = liveProducts[job.product.id];
          const prodFiles = (liveProd.files || []).filter(f => String(f.category).trim().toLowerCase() === 'artwork');
          const targetPartId = job.product?.parts?.find(p => p.part_name === job.part_name)?.id;
          
          const applicableLive = prodFiles.filter(f => {
             const scope = f.applies_to || "All Parts";
             return scope === "All Parts" || scope === job.part_name || (targetPartId && scope === targetPartId);
          });

          const latestVersions = new Map();
          applicableLive.forEach(f => {
              const key = f.purpose || f.name;
              const existing = latestVersions.get(key);
              const existingTime = existing?.uploaded_at ? new Date(existing.uploaded_at).getTime() : 0;
              const fTime = f.uploaded_at ? new Date(f.uploaded_at).getTime() : 0;
              if (!existing || fTime > existingTime) latestVersions.set(key, f);
          });

          const latestFiles = Array.from(latestVersions.values());
          if (latestFiles.length > 0) {
             isLiveArtworkApproved = latestFiles.every(f => 
                 String(f.status).trim().toUpperCase() === 'APPROVED'
             );
          }
      } else if (!isArtworkRequired) {
          isLiveArtworkApproved = true; 
      }

      return {
        ...job,
        currentStep,
        stepName,
        place,
        isVendorStep,
        vendorName,
        stepStatus,
        daysAtStep,
        isOverdue,
        isArtworkRequired,
        isLiveArtworkApproved
      };
    });

    return jobs.sort((a, b) => {
      if (!a.isLiveArtworkApproved && b.isLiveArtworkApproved) return -1;
      if (a.isLiveArtworkApproved && !b.isLiveArtworkApproved) return 1;
      
      if (b.daysAtStep !== a.daysAtStep) return b.daysAtStep - a.daysAtStep;
      if (a.set_code && b.set_code && a.set_code !== b.set_code) {
        return a.set_code.localeCompare(b.set_code);
      }
      return Number(a.part_index || 0) - Number(b.part_index || 0);
    });
  }, [rawJobs, liveProducts, liveMachines]);

  const filteredJobs = useMemo(() => {
    return processedJobs.filter(job => {
      if (filterCustomer && job.customer !== filterCustomer) return false;
      if (filterPlace && job.place !== filterPlace) return false;
      if (filterStatus && job.stepStatus !== filterStatus) return false;
      if (stuckOnly && job.daysAtStep < 2) return false;
      if (overdueOnly && !job.isOverdue) return false;
      return true;
    });
  }, [processedJobs, filterCustomer, filterPlace, filterStatus, stuckOnly, overdueOnly]);

  const uniqueCustomers = [...new Set(processedJobs.map(j => j.customer))].filter(Boolean).sort();
  const uniquePlaces = [...new Set(processedJobs.map(j => j.place))].filter(p => p !== 'Unassigned').sort();

  const getStatusBadge = (status) => {
    switch(status) {
      case 'in_progress': return <span className="bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border border-blue-500/30">In Progress</span>;
      case 'on_hold': return <span className="bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border border-orange-500/30">On Hold</span>;
      case 'pending': return <span className="bg-gray-800 text-gray-400 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border border-gray-700">Pending</span>;
      default: return <span className="text-gray-500 uppercase text-[10px]">{status}</span>;
    }
  };

  const getDaysColor = (days) => {
    if (days >= 4) return "text-red-500 font-black";
    if (days >= 2) return "text-orange-400 font-bold";
    return "text-gray-300";
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-gray-400">
        <svg className="animate-spin h-8 w-8 text-primary-500" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0a0f1a] p-4 md:p-6 overflow-hidden relative">
      
      {/* Header & Control Bar */}
      <div className="bg-[#151724] border border-gray-800 rounded-xl p-5 shadow-lg shrink-0 mb-6 flex flex-col xl:flex-row gap-4 xl:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <svg className="w-6 h-6 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
            Operations Status Board
          </h1>
          <p className="text-sm text-gray-400 mt-1">Live tracking of {processedJobs.length} active jobs across the floor.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 bg-gray-950 p-2 rounded-lg border border-gray-800">
          <select value={filterCustomer} onChange={e => setFilterCustomer(e.target.value)} className="bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-xs text-white outline-none focus:border-primary-500 min-w-[140px]">
            <option value="">All Customers</option>
            {uniqueCustomers.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          
          <select value={filterPlace} onChange={e => setFilterPlace(e.target.value)} className="bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-xs text-white outline-none focus:border-primary-500 min-w-[140px]">
            <option value="">All Places</option>
            {uniquePlaces.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-xs text-white outline-none focus:border-primary-500 min-w-[140px]">
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="on_hold">On Hold</option>
          </select>

          <div className="h-6 w-px bg-gray-800 mx-1"></div>

          <label className="flex items-center gap-2 text-xs font-bold text-orange-400 cursor-pointer hover:bg-gray-900 px-2 py-1.5 rounded transition-colors">
            <input type="checkbox" checked={stuckOnly} onChange={e => setStuckOnly(e.target.checked)} className="accent-orange-500" />
            Stuck ({'>'}2 Days)
          </label>
          
          <label className="flex items-center gap-2 text-xs font-bold text-red-400 cursor-pointer hover:bg-gray-900 px-2 py-1.5 rounded transition-colors">
            <input type="checkbox" checked={overdueOnly} onChange={e => setOverdueOnly(e.target.checked)} className="accent-red-500" />
            Overdue Only
          </label>
          
          {(filterCustomer || filterPlace || filterStatus || stuckOnly || overdueOnly) && (
            <button onClick={() => { setFilterCustomer(""); setFilterPlace(""); setFilterStatus(""); setStuckOnly(false); setOverdueOnly(false); }} className="text-[10px] uppercase font-bold text-gray-500 hover:text-white px-2">Clear</button>
          )}
        </div>
      </div>

      {/* Main Board Table */}
      <div className="flex-1 overflow-hidden bg-gray-900 border border-gray-800 rounded-xl shadow-2xl flex flex-col">
        <div className="overflow-auto custom-scrollbar flex-1">
          <table className="w-full text-left whitespace-nowrap">
            <thead className="sticky top-0 z-10 bg-gray-950 shadow-md">
              <tr className="text-[10px] uppercase text-gray-500 tracking-wider border-b border-gray-800">
                <th className="p-4 font-bold">Set / Job ID</th>
                <th className="p-4 font-bold">Customer</th>
                <th className="p-4 font-bold min-w-[200px]">Product / Part</th>
                <th className="p-4 font-bold min-w-[200px]">Current Step</th>
                <th className="p-4 font-bold">Place</th>
                <th className="p-4 font-bold">Status</th>
                <th className="p-4 font-bold text-center">Days at Step</th>
                <th className="p-4 font-bold">Due Date</th>
                <th className="p-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {filteredJobs.length > 0 ? filteredJobs.map(job => (
                <tr 
                  key={job.id} 
                  onClick={() => setSelectedJob(job)} 
                  className="hover:bg-gray-800/40 transition-colors cursor-pointer group"
                >
                  <td className="p-4">
                    <div className="font-bold text-white text-sm flex items-center gap-2">
                       {job.set_code?.includes('-') ? `SET-${job.set_code}` : job.set_code}
                       {job.isArtworkRequired && !job.isLiveArtworkApproved && (
                           <span title="Artwork Pending/Unapproved" className="text-red-500 animate-pulse">⚠️</span>
                       )}
                    </div>
                    <div className="text-[10px] text-gray-500 font-mono mt-0.5">{job.display_id}</div>
                  </td>
                  <td className="p-4 text-xs font-bold text-gray-300">{job.customer}</td>
                  <td className="p-4">
                    <div className="text-xs font-bold text-primary-400 truncate max-w-[250px]" title={job.product?.name || job.title}>{job.product?.name || job.title}</div>
                    {(job.parts_total > 1 || job.part_name !== "Main Part") && (
                      <div className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">Part {job.part_index}/{job.parts_total} — {job.part_name}</div>
                    )}
                  </td>
                  <td className="p-4 text-xs font-bold text-gray-200">
                    {job.stepName}
                    {job.currentStep?.status === 'on_hold' && job.currentStep.hold_reason && (
                       <span className="ml-2 px-1.5 py-0.5 bg-orange-950/40 text-orange-400 text-[9px] rounded border border-orange-900/50">
                         {job.currentStep.hold_reason}
                       </span>
                    )}
                  </td>
                  
                  {/* ⭐️ ROUND 21: Place column renders dynamic external vendor badge */}
                  <td className="p-4">
                    {job.isVendorStep ? (
                       <div className="flex flex-col gap-0.5">
                         <span className="bg-purple-900/40 px-2 py-1 rounded text-[10px] font-bold text-purple-400 border border-purple-500/30 uppercase tracking-wider inline-flex items-center gap-1 w-max">
                           🚚 Job Work (Outbound)
                         </span>
                         <span className="text-[9px] text-gray-500 font-bold ml-1">{job.vendorName}</span>
                       </div>
                    ) : (
                       <span className="bg-gray-950 px-2 py-1 rounded text-[10px] font-bold text-gray-400 border border-gray-800 uppercase tracking-wider">{job.place}</span>
                    )}
                  </td>
                  
                  <td className="p-4">
                    {getStatusBadge(job.stepStatus)}
                  </td>
                  <td className="p-4 text-center">
                    <span className={`text-lg ${getDaysColor(job.daysAtStep)}`}>{job.daysAtStep}</span>
                    <span className="text-[10px] text-gray-500 ml-1">d</span>
                  </td>
                  <td className="p-4 text-xs">
                    <div className={`font-bold flex items-center gap-2 ${job.isOverdue ? 'text-red-400' : 'text-gray-300'}`}>
                      {job.isOverdue && <span title="Overdue">🚨</span>}
                      {job.deadline ? new Date(job.deadline).toLocaleDateString("en-GB", { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}
                    </div>
                  </td>
                  
                  <td className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-2">
                     <button 
  onClick={(e) => {
    e.stopPropagation();
    
    // 1. Instantly open the tab (Synchronous, keeps user gesture)
    const newTab = window.open(`/print/${job.id}?autoprint=1`, '_blank');
if (!newTab || newTab.closed || typeof newTab.closed === 'undefined') {
  window.location.href = `/print/${job.id}?autoprint=1`;
}
    
    // 2. Fallback if Brave/Safari strictly blocks it
    if (!newTab || newTab.closed || typeof newTab.closed === 'undefined') {
      window.location.href = `/print/${job.id}`;
    }

    // 3. Fire the database increment in the background (No awaiting)
    updateDoc(doc(db, "jobs", job.id), { print_count: increment(1) }).catch(err => console.error(err));
  }}
  className="bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white px-3 py-1.5 rounded text-xs font-bold transition-colors flex items-center gap-1 border border-gray-700 shadow-md"
  title="Print Job Card"
>
  🖨️ Print
</button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="9" className="p-8 text-center text-gray-500 text-sm">
                    No active jobs match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ⭐️ JOB VIEW MODAL POPUP */}
      {selectedJob && (
        <JobViewModal job={selectedJob} onClose={() => setSelectedJob(null)} />
      )}
    </div>
  );
}