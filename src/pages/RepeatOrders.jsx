import { useState } from "react";
import { useJobs } from "../hooks/useJobs";
import { useCustomers } from "../hooks/useCustomers";
import ProduceJobSetModal from "../components/ProduceJobSetModal";
import { useProduceMath } from "../hooks/useProduceMath";
import { useProcesses } from "../hooks/useProcesses";
import { useMachines } from "../hooks/useMachines";
import { useInventory } from "../hooks/useInventory";
import { useDies } from "../hooks/useDies";
import { useLocations } from "../hooks/useLocations";

export default function RepeatOrders() {
  const { jobs, loading: jobsLoading } = useJobs();
  const { customers } = useCustomers();
  
  // ⭐️ Initialize Modal Dependencies
  const { processes: dbProcesses } = useProcesses();
  const { machines } = useMachines();
  const { inventoryItems } = useInventory();
  const { dies } = useDies();
  const { locations } = useLocations();

  // ⭐️ Initialize Math Engine
  const {
    isProduceModalOpen,
    setProduceModalOpen,
    activeProduceProduct,
    produceQty,
    produceDate,
    setProduceDate,
    produceParts,
    repeatSourceGroup,
    openProduceModalForRepeat,
    handleProduceQtyChange,
    updatePartSets,
    updatePartMultiplier,
    toggleCustomOverride,
    updatePartCustomPcs,
    handleStepQtyChange,
    handleRecalculateChain,
    updatePartNotes,
    togglePartExpanded
  } = useProduceMath();
  
  const [selectedCustomerFilter, setSelectedCustomerFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState(""); 

  // Group jobs into sets just like the main board
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

  // Sort groups by newest first (job_date)
  groupedJobs.sort((a, b) => {
      const dateA = new Date(a[0].job_date || 0).getTime();
      const dateB = new Date(b[0].job_date || 0).getTime();
      return dateB - dateA;
  });

  const filteredGroups = groupedJobs.filter(group => {
    // 1. Search Filter (Product, SKU, PO, Job ID)
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

    // 2. Customer Filter
    if (selectedCustomerFilter) {
      const matchesCustomer = group.some(j => j.customer === selectedCustomerFilter || j.customerId === selectedCustomerFilter);
      if (!matchesCustomer) return false;
    }

    return true;
  });

  // ⭐️ Triggers the repeat modal load
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
          placeholder="Search by Job ID, Product, SKU or PO..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 max-w-lg bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary-500"
        />
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden shadow-xl flex-1 flex flex-col">
        <div className="overflow-x-auto flex-1">
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
                <tr><td colSpan="6" className="py-12 text-center text-gray-500">No past orders found.</td></tr>
              ) : (
                filteredGroups.map((group) => {
                  const job = group[0];
                  const isSet = group.length > 1 || (job.parts_total > 1 && job.set_code);
                  const displayId = isSet ? `SET-${job.set_code}` : (job.display_id || `JOB-${job.id.slice(0,6).toUpperCase()}`);
                  
                  return (
                    <tr key={job.id} className="hover:bg-gray-800/30 transition-colors">
                      <td className="py-4 px-6">
                        <span className="font-mono text-sm font-bold text-gray-200">{displayId}</span>
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
                        <button 
                          onClick={() => handleRepeatClick(group)} 
                          className="bg-primary-600/10 text-primary-400 border border-primary-500/30 hover:bg-primary-600 hover:text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap"
                        >
                          Repeat This Order
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ⭐️ Render the Modal Component */}
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
           alert(msg); // You can replace this with a nice toast notification later!
        }}
      />
    </div>
  );
}