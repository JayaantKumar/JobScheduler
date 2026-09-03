import { useState, useEffect } from "react";
import { useJobs } from "../hooks/useJobs";
import { useCustomers } from "../hooks/useCustomers";
import ProduceJobSetModal from "../components/ProduceJobSetModal";
import { useProduceMath } from "../hooks/useProduceMath";
import { useProcesses } from "../hooks/useProcesses";
import { useMachines } from "../hooks/useMachines";
import { useInventory } from "../hooks/useInventory";
import { useDies } from "../hooks/useDies";
import { useLocations } from "../hooks/useLocations";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase/config";

export default function RepeatOrders() {
  const { jobs, loading: jobsLoading } = useJobs();
  const { customers } = useCustomers();
  
  const { processes: dbProcesses } = useProcesses();
  const { machines } = useMachines();
  const { inventoryItems } = useInventory();
  const { dies } = useDies();
  const { locations } = useLocations();

  const {
    isProduceModalOpen, setProduceModalOpen, activeProduceProduct, produceQty, produceDate, setProduceDate, produceParts,
    repeatSourceGroup, openProduceModalForRepeat, handleProduceQtyChange, updatePartSets, updatePartMultiplier,
    toggleCustomOverride, updatePartCustomPcs, handleStepQtyChange, handleRecalculateChain, updatePartNotes, togglePartExpanded
  } = useProduceMath();
  
  const [selectedCustomerFilter, setSelectedCustomerFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState(""); 
  
  const [hiddenIds, setHiddenIds] = useState([]);
  const [showHidden, setShowHidden] = useState(false);
  const [isHiding, setIsHiding] = useState(false);

  useEffect(() => {
    const fetchHidden = async () => {
      try {
        const docRef = doc(db, "settings", "hiddenRepeats");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().ids) {
          setHiddenIds(docSnap.data().ids);
        } else {
           await setDoc(docRef, { ids: [] }, { merge: true });
        }
      } catch (err) {
        console.error("Failed to load hidden repeat IDs", err);
      }
    };
    fetchHidden();
  }, []);

  const handleToggleHide = async (groupId) => {
    const isCurrentlyHidden = hiddenIds.includes(groupId);
    
    if (!isCurrentlyHidden) {
      const confirmMsg = "Remove this order from the Repeat List?\n\nThis ONLY hides the entry from this screen. The original job, its history, ledger entries, and job management records are completely untouched.";
      if (!window.confirm(confirmMsg)) return;
    }

    setIsHiding(true);
    try {
      const newIds = isCurrentlyHidden 
        ? hiddenIds.filter(id => id !== groupId) 
        : [...hiddenIds, groupId];
      
      const docRef = doc(db, "settings", "hiddenRepeats");
      await updateDoc(docRef, { ids: newIds });
      setHiddenIds(newIds);
    } catch (err) {
      alert("Failed to update hidden list: " + err.message);
    } finally {
      setIsHiding(false);
    }
  };

  const groupedJobs = [];
  const setMap = {};

  jobs.forEach(job => {
    const targetQ = job.set_code ? (job.sets_qty || 0) : (job.quantity_target || 0);
    if (targetQ === 0) return;

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

  groupedJobs.sort((a, b) => {
      const dateA = new Date(a[0].job_date || 0).getTime();
      const dateB = new Date(b[0].job_date || 0).getTime();
      return dateB - dateA;
  });

  const filteredGroups = groupedJobs.filter(group => {
    const job = group[0];
    const isSet = group.length > 1 || (job.parts_total > 1 && job.set_code);
    const groupId = isSet ? `SET-${job.set_code}` : job.id;

    // ⭐️ ROUND 25 FIX: Consistent ID check for filtering
    if (!showHidden && hiddenIds.includes(groupId)) return false;
    if (showHidden && !hiddenIds.includes(groupId)) return false;

    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = group.some(j => {
        const displayId = (j.display_id || "").toLowerCase();
        const setId = (j.set_code || "").toLowerCase();
        const prodName = (j.title || j.product_snapshot?.name || j.product?.name || "").toLowerCase();
        const sku = (j.product_snapshot?.sku || j.product?.sku || "").toLowerCase();
        const customerPo = (j.customer_po || j.po_number || "").toLowerCase(); 
        
        return displayId.includes(q) || setId.includes(q) || prodName.includes(q) || sku.includes(q) || customerPo.includes(q);
      });
      if (!matchesSearch) return false;
    }

    if (selectedCustomerFilter) {
      const matchesCustomer = group.some(j => j.customer === selectedCustomerFilter || j.customerId === selectedCustomerFilter);
      if (!matchesCustomer) return false;
    }

    return true;
  });

  const handleRepeatClick = (group) => {
      openProduceModalForRepeat(group, dbProcesses);
  };

  if (jobsLoading) return <div className="p-8 text-primary-500 animate-pulse font-medium">Loading Past Orders...</div>;

  return (
    <div className="max-w-[1600px] mx-auto p-4 sm:p-6 h-full flex flex-col relative">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Repeat Orders</h2>
          <p className="text-sm sm:text-base text-gray-400 mt-1">Browse past production history to quickly generate a repeat job.</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-4 mb-6">
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
          placeholder="Search by Job ID, Product, SKU or PO..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary-500"
        />

        <div className="flex items-center gap-2 text-sm shrink-0">
          <input 
            type="checkbox" 
            id="showHidden" 
            checked={showHidden} 
            onChange={(e) => setShowHidden(e.target.checked)}
            className="w-4 h-4 text-primary-500 bg-gray-900 border-gray-700 rounded focus:ring-primary-500 focus:ring-offset-gray-950"
          />
          <label htmlFor="showHidden" className="text-gray-400 font-medium select-none cursor-pointer">Show removed items ({hiddenIds.length})</label>
        </div>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden shadow-xl flex-1 flex flex-col">
        <div className="overflow-x-auto flex-1 custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-gray-950/50 border-b border-gray-800 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                <th className="py-4 px-6 w-[15%]">Original ID</th>
                <th className="py-4 px-6 w-[20%]">Client</th>
                <th className="py-4 px-6 w-[25%]">Product / Title</th>
                <th className="py-4 px-6 w-[15%]">Target Qty</th>
                <th className="py-4 px-6 w-[15%]">Date Produced</th>
                <th className="py-4 px-6 w-[10%] text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredGroups.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-gray-500">
                    {showHidden ? "No hidden orders found." : "No past orders found."}
                  </td>
                </tr>
              ) : (
                filteredGroups.map((group) => {
                  const job = group[0];
                  const isSet = group.length > 1 || (job.parts_total > 1 && job.set_code);
                  const displayId = isSet ? `SET-${job.set_code}` : (job.display_id || `JOB-${job.id.slice(0,6).toUpperCase()}`);
                  const groupId = isSet ? `SET-${job.set_code}` : job.id;
                  
                  return (
                    <tr key={job.id} className={`hover:bg-gray-800/30 transition-colors ${showHidden ? 'bg-red-950/10' : ''}`}>
                      <td className="py-4 px-6">
                        <span className="font-mono text-sm font-bold text-gray-200">{displayId}</span>
                        {showHidden && <span className="block text-[10px] text-red-400 uppercase font-bold mt-1">Hidden</span>}
                      </td>
                      <td className="py-4 px-6 text-sm font-medium text-gray-300">
                        {job.customer || "Unknown"}
                      </td>
                      <td className="py-4 px-6">
                        <div className="font-bold text-white text-sm">
                          {isSet ? (job.product_snapshot?.name || job.product?.name || "Multi-Part Set") : (job.title || job.product_snapshot?.name || job.product?.name)}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {job.product_snapshot?.sku || job.product?.sku || "N/A"}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-gray-300 text-sm font-medium">
                         {isSet ? `${job.sets_qty?.toLocaleString() || 0} sets` : `${job.quantity_target?.toLocaleString() || 0} pcs`}
                      </td>
                      <td className="py-4 px-6 text-gray-400 text-sm">
                         {new Date(job.job_date).toLocaleDateString()}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {showHidden ? (
                            <button 
                              onClick={() => handleToggleHide(groupId)} 
                              disabled={isHiding}
                              className="text-xs font-bold px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded transition-colors"
                            >
                              Restore
                            </button>
                          ) : (
                            <>
                              <button 
                                onClick={() => handleRepeatClick(group)} 
                                className="bg-primary-600/10 text-primary-400 border border-primary-500/30 hover:bg-primary-600 hover:text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap"
                              >
                                Repeat This Order
                              </button>
                              <button
                                onClick={() => handleToggleHide(groupId)}
                                disabled={isHiding}
                                title="Remove from Repeat List"
                                className="w-8 h-8 flex items-center justify-center rounded bg-gray-800/50 hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-colors shrink-0"
                              >
                                ✕
                              </button>
                            </>
                          )}
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

      <ProduceJobSetModal
        isOpen={isProduceModalOpen}
        onClose={() => setProduceModalOpen(false)}
        activeProduceProduct={activeProduceProduct}
        produceQty={produceQty}
        handleProduceQtyChange={handleProduceQtyChange}
        produceDate={produceDate}
        setProduceDate={setProduceDate}
        produceParts={produceParts}
        repeatSourceGroup={repeatSourceGroup}
        updatePartSets={updatePartSets}
        updatePartMultiplier={updatePartMultiplier}
        toggleCustomOverride={toggleCustomOverride}
        updatePartCustomPcs={updatePartCustomPcs}
        handleStepQtyChange={handleStepQtyChange}
        handleRecalculateChain={handleRecalculateChain}
        togglePartExpanded={togglePartExpanded}
        updatePartNotes={updatePartNotes}
        machines={machines}
        dbProcesses={dbProcesses}
        inventoryItems={inventoryItems}
        dies={dies}
        locations={locations}
        onSuccess={(msg) => {
           alert(msg);
        }}
      />
    </div>
  );
}