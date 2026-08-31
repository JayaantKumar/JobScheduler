import { useState, useEffect } from "react";
import { collection, doc, onSnapshot, query, writeBatch, serverTimestamp, orderBy } from "firebase/firestore";
import { db } from "../firebase/config";
import { formatInventoryLabel } from "../utils/helpers";

export default function JobWork() {
  const [activeTab, setActiveTab] = useState("active");
  const [challans, setChallans] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // ⭐️ Added state for company settings
  const [companySettings, setCompanySettings] = useState(null);

  const [isOutwardOpen, setIsOutwardOpen] = useState(false);
  const [isInwardOpen, setIsInwardOpen] = useState(false);
  const [activeChallan, setActiveChallan] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const [outwardForm, setOutwardForm] = useState({
    vendorId: "", challanDate: new Date().toISOString().split("T")[0], expectedReturn: "",
    vehicleNo: "", sentBy: "", notes: "", items: []
  });
  
  const [inwardForm, setInwardForm] = useState({
    receivedDate: new Date().toISOString().split("T")[0], receivedBy: "", vehicleNo: "", notes: "", lines: []
  });

  useEffect(() => {
    const unsubChallans = onSnapshot(query(collection(db, "challans"), orderBy("created_at", "desc")), snap => {
      setChallans(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    const unsubVendors = onSnapshot(collection(db, "vendors"), snap => setVendors(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubInv = onSnapshot(collection(db, "inventoryItems"), snap => setInventory(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubJobs = onSnapshot(query(collection(db, "jobs"), orderBy("job_date", "desc")), snap => setJobs(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubLocs = onSnapshot(collection(db, "locations"), snap => setLocations(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    
    // ⭐️ Fetch global settings for the print view
    const unsubSettings = onSnapshot(doc(db, "settings", "global"), (docSnap) => {
      if (docSnap.exists()) setCompanySettings(docSnap.data());
    });

    return () => { unsubChallans(); unsubVendors(); unsubInv(); unsubJobs(); unsubLocs(); unsubSettings(); };
  }, []);

  const handleAddOutwardLine = () => {
    setOutwardForm(prev => ({
      ...prev,
      items: [...prev.items, { id: Date.now(), type: "job", referenceId: "", itemName: "", qty: "", unit: "pcs", sourceLocation: "" }]
    }));
  };

  const handleOutwardLineChange = (id, field, val) => {
    setOutwardForm(prev => ({
      ...prev,
      items: prev.items.map(item => {
        if (item.id !== id) return item;
        let updates = { [field]: val };
        
        if (field === "referenceId" && item.type === "raw") {
          const invItem = inventory.find(i => i.id === val);
          if (invItem) updates.itemName = formatInventoryLabel(invItem);
        } else if (field === "referenceId" && item.type === "job") {
          const jobItem = jobs.find(j => j.id === val);
          if (jobItem) updates.itemName = `${jobItem.display_id || jobItem.set_code} - ${jobItem.title}`;
        }
        return { ...item, ...updates };
      })
    }));
  };

  const submitOutwardChallan = async (e) => {
    e.preventDefault();
    if (!outwardForm.vendorId || outwardForm.items.length === 0) return alert("Select a vendor and add at least one item.");
    
    setIsSaving(true);
    try {
      const vendor = vendors.find(v => v.id === outwardForm.vendorId);
      const challanNo = `CH-${Date.now().toString().slice(-6)}`;
      const batch = writeBatch(db);

      const challanPayload = {
        challan_no: challanNo,
        type: "outward",
        status: "open", 
        vendor_id: vendor.id,
        vendor_name: vendor.name,
        vendor_code: vendor.code,
        challan_date: outwardForm.challanDate,
        expected_return: outwardForm.expectedReturn,
        vehicle_no: outwardForm.vehicleNo,
        sent_by: outwardForm.sentBy,
        notes: outwardForm.notes,
        items: outwardForm.items.map(item => ({
          ...item, sent_qty: Number(item.qty), received_qty: 0
        })),
        inward_history: [],
        created_at: serverTimestamp(),
      };

      const challanRef = doc(collection(db, "challans"));
      batch.set(challanRef, challanPayload);

      for (const line of outwardForm.items) {
        if (line.type === "raw" && line.referenceId) {
          const invData = inventory.find(i => i.id === line.referenceId);
          if (invData) {
            const itemRef = doc(db, "inventoryItems", line.referenceId);
            const newBalances = { ...(invData.balances || {}) };
            const vendorVirtualLoc = `VENDOR_${vendor.id}`;
            
            if (line.sourceLocation) {
              newBalances[line.sourceLocation] = (newBalances[line.sourceLocation] || 0) - Number(line.qty);
            } else {
               const firstKey = Object.keys(newBalances)[0];
               if (firstKey) newBalances[firstKey] = (newBalances[firstKey] || 0) - Number(line.qty);
            }
            
            newBalances[vendorVirtualLoc] = (newBalances[vendorVirtualLoc] || 0) + Number(line.qty);
            batch.update(itemRef, { balances: newBalances });

            const ledgerRef = doc(collection(db, "inventoryLedger"));
            batch.set(ledgerRef, {
              itemId: line.referenceId, date: serverTimestamp(), type: "OUTWARD_JOBWORK",
              qty: -Number(line.qty), unit: line.unit, location: line.sourceLocation || "Factory",
              referenceId: challanNo, remarks: `Sent to vendor: ${vendor.name}`
            });
            
            const ledgerRef2 = doc(collection(db, "inventoryLedger"));
            batch.set(ledgerRef2, {
              itemId: line.referenceId, date: serverTimestamp(), type: "INWARD_JOBWORK_VIRTUAL",
              qty: Number(line.qty), unit: line.unit, location: vendorVirtualLoc,
              referenceId: challanNo, remarks: `Virtual receipt at vendor: ${vendor.name}`
            });
          }
        }
      }

      await batch.commit();
      setIsOutwardOpen(false);
      setOutwardForm({ vendorId: "", challanDate: new Date().toISOString().split("T")[0], expectedReturn: "", vehicleNo: "", sentBy: "", notes: "", items: [] });
    } catch (err) {
      alert("Error saving outward challan: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const openInwardModal = (challan) => {
    setActiveChallan(challan);
    setInwardForm({
      receivedDate: new Date().toISOString().split("T")[0],
      receivedBy: "", vehicleNo: "", notes: "",
      lines: challan.items.map(item => ({
        id: item.id, itemName: item.itemName, type: item.type, referenceId: item.referenceId,
        sent_qty: item.sent_qty, previously_received: item.received_qty || 0,
        balance_qty: item.sent_qty - (item.received_qty || 0),
        receiving_now: "", target_location: ""
      }))
    });
    setIsInwardOpen(true);
  };

  const submitInwardChallan = async (e) => {
    e.preventDefault();
    const receivingLines = inwardForm.lines.filter(l => Number(l.receiving_now) > 0);
    if (receivingLines.length === 0) return alert("Enter receiving quantities for at least one item.");

    setIsSaving(true);
    try {
      const batch = writeBatch(db);
      const challanRef = doc(db, "challans", activeChallan.id);
      
      const newHistoryEntry = {
        id: Date.now(), date: inwardForm.receivedDate, received_by: inwardForm.receivedBy,
        vehicle_no: inwardForm.vehicleNo, notes: inwardForm.notes,
        items_received: receivingLines.map(l => ({
          item_id: l.id, itemName: l.itemName, qty: Number(l.receiving_now), location: l.target_location
        }))
      };

      const updatedItems = activeChallan.items.map(item => {
        const line = receivingLines.find(l => l.id === item.id);
        if (line) return { ...item, received_qty: (item.received_qty || 0) + Number(line.receiving_now) };
        return item;
      });

      const allCompleted = updatedItems.every(i => i.received_qty >= i.sent_qty);

      batch.update(challanRef, {
        status: allCompleted ? "closed" : "partial",
        items: updatedItems,
        inward_history: [...(activeChallan.inward_history || []), newHistoryEntry],
        updated_at: serverTimestamp()
      });

      for (const line of receivingLines) {
        if (line.type === "raw" && line.referenceId) {
           const invData = inventory.find(i => i.id === line.referenceId);
           if (invData) {
             const itemRef = doc(db, "inventoryItems", line.referenceId);
             const newBalances = { ...(invData.balances || {}) };
             const vendorVirtualLoc = `VENDOR_${activeChallan.vendor_id}`;
             
             newBalances[vendorVirtualLoc] = Math.max(0, (newBalances[vendorVirtualLoc] || 0) - Number(line.receiving_now));
             const targetLoc = line.target_location || "Factory Floor";
             newBalances[targetLoc] = (newBalances[targetLoc] || 0) + Number(line.receiving_now);
             
             batch.update(itemRef, { balances: newBalances });

             const ledgerRef = doc(collection(db, "inventoryLedger"));
             batch.set(ledgerRef, {
               itemId: line.referenceId, date: serverTimestamp(), type: "INWARD_JOBWORK_RETURN",
               qty: Number(line.receiving_now), unit: "pcs", location: targetLoc,
               referenceId: activeChallan.challan_no, remarks: `Returned from vendor: ${activeChallan.vendor_name}`
             });
           }
        }
      }

      await batch.commit();
      setIsInwardOpen(false);
      setActiveChallan(null);
    } catch (err) {
      alert("Error saving inward receipt: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const activeList = challans.filter(c => c.status !== "closed");
  const closedList = challans.filter(c => c.status === "closed");
  const displayList = activeTab === "active" ? activeList : closedList;

  const calculateDaysOut = (dateStr) => {
    if (!dateStr) return 0;
    const diff = new Date() - new Date(dateStr);
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const inputClass = "w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-primary-500 transition-colors";
  const labelClass = "block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider";

  return (
    <>
      <div className="h-full flex flex-col print:hidden">
        <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-[#0a0f1a] shrink-0">
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight">Job Work & Outsourcing</h2>
            <p className="text-sm text-gray-400 mt-1">Manage outward challans and track materials at vendor locations.</p>
          </div>
          <button onClick={() => setIsOutwardOpen(true)} className="bg-primary-600 hover:bg-primary-500 text-white font-bold px-5 py-2.5 rounded-lg shadow-lg transition-colors flex items-center gap-2">
            <span>+ Create Outward Challan</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
          </button>
        </div>

        <div className="flex px-6 pt-4 border-b border-gray-800 gap-6 shrink-0 bg-[#0a0f1a]">
          <button onClick={() => setActiveTab('active')} className={`pb-3 text-sm font-bold transition-colors ${activeTab === 'active' ? 'text-primary-400 border-b-2 border-primary-500' : 'text-gray-500 hover:text-gray-300'}`}>
            Active At Vendors ({activeList.length})
          </button>
          <button onClick={() => setActiveTab('closed')} className={`pb-3 text-sm font-bold transition-colors ${activeTab === 'closed' ? 'text-white border-b-2 border-gray-500' : 'text-gray-500 hover:text-gray-300'}`}>
            Closed / Reconciled ({closedList.length})
          </button>
        </div>

        <div className="flex-1 p-6 overflow-y-auto custom-scrollbar bg-[#0a0f1a]">
          {loading ? (
            <div className="text-center text-primary-500 font-medium py-12 animate-pulse">Loading Challans...</div>
          ) : displayList.length === 0 ? (
            <div className="text-center text-gray-600 font-medium py-12 italic border border-gray-800 border-dashed rounded-xl">No {activeTab} job work challans found.</div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {displayList.map(challan => (
                <div key={challan.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-gray-700 transition-colors shadow-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-white font-black font-mono text-lg">{challan.challan_no}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${challan.status === 'open' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : challan.status === 'partial' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' : 'bg-gray-800 text-gray-500'}`}>
                        {challan.status}
                      </span>
                      {challan.status !== 'closed' && (
                         <span className="text-xs font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                           🕒 {calculateDaysOut(challan.challan_date)} days out
                         </span>
                      )}
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase text-gray-500 font-bold">Vendor</span>
                        <span className="text-gray-300 font-medium">{challan.vendor_name} <span className="text-gray-600">({challan.vendor_code})</span></span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase text-gray-500 font-bold">Sent On</span>
                        <span className="text-gray-300 font-medium">{new Date(challan.challan_date).toLocaleDateString('en-GB')}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase text-gray-500 font-bold">Items Outstanding</span>
                        <span className="text-gray-300 font-medium">
                          {challan.items.map(i => i.sent_qty - (i.received_qty || 0)).reduce((a, b) => a + b, 0).toLocaleString()} pcs
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <button onClick={() => { setActiveChallan(challan); setTimeout(() => window.print(), 200); }} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold text-xs rounded-lg transition-colors border border-gray-700">
                      🖨️ Print View
                    </button>
                    {challan.status !== 'closed' && (
                      <button onClick={() => openInwardModal(challan)} className="px-5 py-2 bg-primary-600 hover:bg-primary-500 text-white font-bold text-xs rounded-lg shadow-lg transition-colors border border-primary-500/50">
                        Receive Goods (Inward)
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* OUTWARD MODAL */}
        {isOutwardOpen && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-fade-in">
              <div className="p-6 border-b border-gray-800 bg-[#151724] shrink-0">
                <h3 className="text-xl font-bold text-white">Create Outward Challan (Job Work)</h3>
                <p className="text-xs text-gray-400 mt-1">Send raw materials or semi-finished jobs to an external vendor.</p>
              </div>
              
              <form onSubmit={submitOutwardChallan} className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 bg-[#0a0f1a]">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="md:col-span-1">
                    <label className={labelClass}>Select Vendor *</label>
                    <select required value={outwardForm.vendorId} onChange={e => setOutwardForm({...outwardForm, vendorId: e.target.value})} className={inputClass}>
                      <option value="">-- Choose Vendor --</option>
                      {vendors.map(v => <option key={v.id} value={v.id}>{v.name} ({v.code})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Challan Date *</label>
                    <input required type="date" value={outwardForm.challanDate} onChange={e => setOutwardForm({...outwardForm, challanDate: e.target.value})} className={`${inputClass} [color-scheme:dark]`} />
                  </div>
                  <div>
                    <label className={labelClass}>Expected Return Date</label>
                    <input type="date" value={outwardForm.expectedReturn} onChange={e => setOutwardForm({...outwardForm, expectedReturn: e.target.value})} className={`${inputClass} [color-scheme:dark]`} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div><label className={labelClass}>Sent By (Employee)</label><input type="text" value={outwardForm.sentBy} onChange={e => setOutwardForm({...outwardForm, sentBy: e.target.value})} className={inputClass} placeholder="Staff Name" /></div>
                  <div><label className={labelClass}>Vehicle / Driver Info</label><input type="text" value={outwardForm.vehicleNo} onChange={e => setOutwardForm({...outwardForm, vehicleNo: e.target.value})} className={inputClass} placeholder="Auto / Truck No." /></div>
                  <div><label className={labelClass}>General Notes</label><input type="text" value={outwardForm.notes} onChange={e => setOutwardForm({...outwardForm, notes: e.target.value})} className={inputClass} placeholder="Special instructions..." /></div>
                </div>

                <div className="border border-gray-800 rounded-xl overflow-hidden shadow-lg">
                  <div className="bg-[#151724] border-b border-gray-800 px-4 py-3 flex justify-between items-center">
                    <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider">Line Items Being Sent</h4>
                    <button type="button" onClick={handleAddOutwardLine} className="bg-primary-900/30 text-primary-400 hover:text-white px-3 py-1.5 rounded text-xs font-bold transition-colors border border-primary-500/20">
                      + Add Row
                    </button>
                  </div>
                  <div className="p-0 overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-gray-950 text-[10px] uppercase font-bold text-gray-500 border-b border-gray-800">
                          <th className="p-3 w-40">Item Type</th>
                          <th className="p-3">Reference (Inventory / Job)</th>
                          <th className="p-3 w-32">Source Rack</th>
                          <th className="p-3 w-28">Quantity</th>
                          <th className="p-3 w-24">UoM</th>
                          <th className="p-3 w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800">
                        {outwardForm.items.length === 0 ? (
                          <tr><td colSpan="6" className="p-8 text-center text-gray-500 italic text-sm">Add items you are sending out.</td></tr>
                        ) : (
                          outwardForm.items.map((item) => (
                            <tr key={item.id} className="bg-[#0a0f1a]">
                              <td className="p-2">
                                <select value={item.type} onChange={e => handleOutwardLineChange(item.id, 'type', e.target.value)} className={`${inputClass} py-1.5 text-xs`}>
                                  <option value="job">Job (Semi-Finished)</option>
                                  <option value="raw">Raw Material</option>
                                </select>
                              </td>
                              <td className="p-2">
                                {item.type === 'raw' ? (
                                  <select value={item.referenceId} onChange={e => handleOutwardLineChange(item.id, 'referenceId', e.target.value)} className={`${inputClass} py-1.5 text-xs`}>
                                    <option value="">-- Select Material --</option>
                                    {inventory.map(inv => <option key={inv.id} value={inv.id}>{formatInventoryLabel(inv)}</option>)}
                                  </select>
                                ) : (
                                  <select value={item.referenceId} onChange={e => handleOutwardLineChange(item.id, 'referenceId', e.target.value)} className={`${inputClass} py-1.5 text-xs`}>
                                    <option value="">-- Select Active Job --</option>
                                    {jobs.filter(j => j.status !== 'completed').map(j => (
                                      <option key={j.id} value={j.id}>{j.display_id || j.set_code} - {j.title}</option>
                                    ))}
                                  </select>
                                )}
                              </td>
                              <td className="p-2">
                                {item.type === 'raw' ? (
                                  <select value={item.sourceLocation} onChange={e => handleOutwardLineChange(item.id, 'sourceLocation', e.target.value)} className={`${inputClass} py-1.5 text-xs`}>
                                    <option value="">Any</option>
                                    {locations.map(l => <option key={l.id} value={l.id}>{l.code}</option>)}
                                  </select>
                                ) : (
                                  <span className="text-xs text-gray-600 block text-center">—</span>
                                )}
                              </td>
                              <td className="p-2">
                                <input type="number" required min="1" value={item.qty} onChange={e => handleOutwardLineChange(item.id, 'qty', e.target.value)} className={`${inputClass} py-1.5 text-xs`} placeholder="Qty" />
                              </td>
                              <td className="p-2">
                                <select value={item.unit} onChange={e => handleOutwardLineChange(item.id, 'unit', e.target.value)} className={`${inputClass} py-1.5 text-xs`}>
                                  <option value="pcs">pcs</option><option value="sheets">sheets</option><option value="kg">kg</option>
                                </select>
                              </td>
                              <td className="p-2 text-center">
                                <button type="button" onClick={() => setOutwardForm(p => ({ ...p, items: p.items.filter(i => i.id !== item.id) }))} className="text-gray-600 hover:text-red-400 font-bold">✕</button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="pt-4 flex justify-end gap-3 sticky bottom-0 bg-[#0a0f1a] py-2">
                  <button type="button" onClick={() => setIsOutwardOpen(false)} className="px-5 py-2 text-gray-400 bg-gray-900 rounded-lg hover:text-white transition-colors">Cancel</button>
                  <button type="submit" disabled={isSaving} className="bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white font-bold px-6 py-2 rounded-lg shadow-lg transition-colors">
                    {isSaving ? "Saving..." : "Generate Challan"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* INWARD MODAL */}
        {isInwardOpen && activeChallan && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-fade-in">
               <div className="p-6 border-b border-gray-800 bg-[#151724] shrink-0 flex justify-between items-center">
                 <div>
                    <h3 className="text-xl font-bold text-white">Receive Goods (Inward)</h3>
                    <p className="text-xs text-gray-400 mt-1">Challan: <strong className="text-primary-400">{activeChallan.challan_no}</strong> | Vendor: {activeChallan.vendor_name}</p>
                 </div>
                 <div className="text-right">
                    <div className="text-[10px] text-gray-500 uppercase font-bold">Date Sent</div>
                    <div className="text-sm font-medium text-white">{new Date(activeChallan.challan_date).toLocaleDateString()}</div>
                 </div>
              </div>

              <form onSubmit={submitInwardChallan} className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 bg-[#0a0f1a]">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-gray-950 p-4 border border-gray-800 rounded-lg">
                  <div><label className={labelClass}>Received Date *</label><input required type="date" value={inwardForm.receivedDate} onChange={e => setInwardForm({...inwardForm, receivedDate: e.target.value})} className={`${inputClass} py-1.5`} /></div>
                  <div><label className={labelClass}>Received By</label><input type="text" value={inwardForm.receivedBy} onChange={e => setInwardForm({...inwardForm, receivedBy: e.target.value})} className={`${inputClass} py-1.5`} placeholder="Name" /></div>
                  <div><label className={labelClass}>Vehicle Info</label><input type="text" value={inwardForm.vehicleNo} onChange={e => setInwardForm({...inwardForm, vehicleNo: e.target.value})} className={`${inputClass} py-1.5`} placeholder="Truck/Auto" /></div>
                  <div><label className={labelClass}>Inward Notes</label><input type="text" value={inwardForm.notes} onChange={e => setInwardForm({...inwardForm, notes: e.target.value})} className={`${inputClass} py-1.5`} placeholder="Condition, issues..." /></div>
                </div>

                <div className="border border-gray-800 rounded-xl overflow-hidden shadow-lg">
                  <div className="bg-[#151724] border-b border-gray-800 px-4 py-3">
                    <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider">Line Items Reconciliation</h4>
                  </div>
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-gray-950 text-[10px] uppercase font-bold text-gray-500 border-b border-gray-800">
                        <th className="p-3 w-64">Item Description</th>
                        <th className="p-3 w-20 text-center">Total Sent</th>
                        <th className="p-3 w-24 text-center">Prev Rec'd</th>
                        <th className="p-3 w-20 text-center">Balance</th>
                        <th className="p-3 w-32 border-l border-gray-800">Receiving Now</th>
                        <th className="p-3 w-40">Target Location</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {inwardForm.lines.map((line) => (
                        <tr key={line.id} className="bg-[#0a0f1a]">
                          <td className="p-3">
                            <div className="text-xs text-white font-medium truncate w-64" title={line.itemName}>{line.itemName}</div>
                            <div className="text-[9px] text-primary-400 font-bold uppercase mt-1">{line.type === 'raw' ? 'Raw Material' : 'Job Set'}</div>
                          </td>
                          <td className="p-3 text-center text-xs text-gray-400 font-medium">{line.sent_qty}</td>
                          <td className="p-3 text-center text-xs text-gray-500">{line.previously_received}</td>
                          <td className="p-3 text-center text-xs font-bold text-white">
                             {line.balance_qty > 0 ? (
                               <span className="text-orange-400">{line.balance_qty}</span>
                             ) : (
                               <span className="text-green-500">Done</span>
                             )}
                          </td>
                          <td className="p-3 border-l border-gray-800 bg-gray-950/30">
                            <input 
                              type="number" min="0" max={line.balance_qty} 
                              value={line.receiving_now} 
                              onChange={e => {
                                 const v = e.target.value;
                                 setInwardForm(p => ({ ...p, lines: p.lines.map(l => l.id === line.id ? {...l, receiving_now: v} : l) }));
                              }} 
                              disabled={line.balance_qty <= 0}
                              className={`w-full bg-gray-900 border ${line.balance_qty <= 0 ? 'border-gray-800 opacity-50' : 'border-primary-500/50 focus:border-primary-500'} rounded px-2 py-1.5 text-xs text-white text-center font-bold outline-none`} 
                              placeholder={line.balance_qty > 0 ? line.balance_qty : ""}
                            />
                          </td>
                          <td className="p-3 bg-gray-950/30">
                            {line.type === 'raw' ? (
                              <select 
                                value={line.target_location} 
                                onChange={e => setInwardForm(p => ({ ...p, lines: p.lines.map(l => l.id === line.id ? {...l, target_location: e.target.value} : l) }))} 
                                disabled={line.balance_qty <= 0}
                                className={`w-full bg-gray-900 border ${line.balance_qty <= 0 ? 'border-gray-800 opacity-50' : 'border-gray-700'} rounded px-2 py-1.5 text-xs text-white outline-none`}
                              >
                                <option value="">Factory Floor</option>
                                {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.code}</option>)}
                              </select>
                            ) : (
                              <span className="text-[10px] text-gray-600 uppercase font-bold text-center block">Assigned to Job</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="pt-4 flex justify-end gap-3 sticky bottom-0 bg-[#0a0f1a] py-2">
                  <button type="button" onClick={() => { setIsInwardOpen(false); setActiveChallan(null); }} className="px-5 py-2 text-gray-400 bg-gray-900 rounded-lg hover:text-white transition-colors">Cancel</button>
                  <button type="submit" disabled={isSaving} className="bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white font-bold px-6 py-2 rounded-lg shadow-lg transition-colors">
                    {isSaving ? "Saving..." : "Log Receipt"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* ⭐️ Print Layout with Dynamic Settings */}
      {activeChallan && (
        <div className="hidden print:block w-full bg-white text-black print:p-8">
          
          <div className="border-b-2 border-black pb-6 mb-6 flex justify-between items-start">
             <div>
               <h1 className="text-4xl font-black tracking-tighter uppercase mb-2">DELIVERY CHALLAN</h1>
               
               {/* ⭐️ Dynamic Logo & Text from Firebase */}
               {companySettings?.logoUrl && (
                  <img src={companySettings.logoUrl} alt="Company Logo" className="h-16 object-contain mb-3" />
               )}
               <div className="text-sm">
                 <p className="font-bold text-lg">{companySettings?.companyName || "Your Company Name Here"}</p>
                 <p className="whitespace-pre-wrap">{companySettings?.companyAddress || "123 Factory Street, Industrial Area"}</p>
                 {companySettings?.companyPhone && <p>Phone: {companySettings.companyPhone}</p>}
                 {companySettings?.companyGst && <p>GSTIN: {companySettings.companyGst}</p>}
               </div>
             </div>
             <div className="text-right">
               <div className="text-sm font-bold uppercase text-gray-500 mb-1">Challan No.</div>
               <div className="text-2xl font-mono font-bold">{activeChallan.challan_no}</div>
               <div className="text-sm mt-4">
                 <span className="font-bold">Date:</span> {new Date(activeChallan.challan_date).toLocaleDateString()}
               </div>
             </div>
          </div>

          <div className="grid grid-cols-2 gap-8 mb-8 text-sm border-b pb-6">
            <div>
              <h3 className="font-bold text-gray-500 uppercase tracking-wider mb-2 text-xs">To Vendor (Consignee)</h3>
              <p className="font-bold text-lg">{activeChallan.vendor_name}</p>
              <p className="text-gray-600 uppercase font-bold text-xs mt-1">ID: {activeChallan.vendor_code}</p>
            </div>
            <div>
              <h3 className="font-bold text-gray-500 uppercase tracking-wider mb-2 text-xs">Dispatch Details</h3>
              <p><span className="font-bold w-32 inline-block">Expected Return:</span> {activeChallan.expected_return ? new Date(activeChallan.expected_return).toLocaleDateString() : 'N/A'}</p>
              <p><span className="font-bold w-32 inline-block">Vehicle / Trans:</span> {activeChallan.vehicle_no || 'N/A'}</p>
              <p><span className="font-bold w-32 inline-block">Dispatched By:</span> {activeChallan.sent_by || 'N/A'}</p>
            </div>
          </div>

          <table className="w-full text-left border-collapse mb-8 text-sm">
            <thead>
              <tr className="bg-gray-100 border-y-2 border-black">
                <th className="p-3 font-bold uppercase text-xs">Sr.</th>
                <th className="p-3 font-bold uppercase text-xs">Description of Goods</th>
                <th className="p-3 font-bold uppercase text-xs text-center w-24">Type</th>
                <th className="p-3 font-bold uppercase text-xs text-right w-32">Quantity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-300">
              {activeChallan.items.map((item, idx) => (
                <tr key={item.id}>
                  <td className="p-3 font-mono">{idx + 1}</td>
                  <td className="p-3 font-medium">{item.itemName}</td>
                  <td className="p-3 text-center text-xs uppercase text-gray-600">{item.type}</td>
                  <td className="p-3 text-right font-bold">{item.sent_qty.toLocaleString()} {item.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {activeChallan.notes && (
            <div className="mb-12">
              <h4 className="font-bold text-xs uppercase text-gray-500 mb-1">Special Instructions</h4>
              <p className="border border-gray-300 p-3 rounded text-sm italic">{activeChallan.notes}</p>
            </div>
          )}

          <div className="mt-24 pt-8 border-t flex justify-between px-12 text-sm font-bold uppercase text-gray-600">
            <div className="text-center w-48 border-t-2 border-black pt-2">Authorized Signatory<br/>(Sender)</div>
            <div className="text-center w-48 border-t-2 border-black pt-2">Receiver's Seal & Signature<br/>(Vendor)</div>
          </div>
          
        </div>
      )}
    </>
  );
}