import { useState, useEffect, Fragment } from "react";
import { createPortal } from "react-dom";
import { collection, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, query, getDocs, where, writeBatch, deleteDoc } from "firebase/firestore";
import { db } from "../firebase/config";

export default function InventoryManagement() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeJobs, setActiveJobs] = useState([]);
  
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCatFilter, setSelectedCatFilter] = useState("");

  // Modals & Inline UI States
  const [isItemModalOpen, setItemModalOpen] = useState(false);
  const [isTransModalOpen, setTransModalOpen] = useState(false);
  const [isHistoryModalOpen, setHistoryModalOpen] = useState(false);
  const [activeItem, setActiveItem] = useState(null);
  
  // Custom Alerts & Confirms
  const [errorMsg, setErrorMsg] = useState("");
  const [confirmConfig, setConfirmConfig] = useState(null); 

  const [isMigrateModalOpen, setMigrateModalOpen] = useState(false);
  const [migrateLoc, setMigrateLoc] = useState(""); 

  // --- ITEM FORM STATES ---
  const [itemCatId, setItemCatId] = useState("");
  const [itemName, setItemName] = useState("");
  const [isAutoLabel, setIsAutoLabel] = useState(true);
  const [itemUnit, setItemUnit] = useState("sheets");
  const [minStock, setMinStock] = useState("");
  const [itemDetails, setItemDetails] = useState({});
  const [savingItem, setSavingItem] = useState(false);

  // --- TRANSACTION FORM STATES ---
  const [transType, setTransType] = useState("in"); 
  const [transDate, setTransDate] = useState(new Date().toISOString().split('T')[0]);
  const [transQty, setTransQty] = useState("");
  const [transNotes, setTransNotes] = useState("");
  
  const [transLoc, setTransLoc] = useState(""); 
  const [transToLoc, setTransToLoc] = useState(""); 
  
  const [supplier, setSupplier] = useState("");
  const [rate, setRate] = useState("");
  const [linkedJobId, setLinkedJobId] = useState("");
  const [freeTextPurpose, setFreeTextPurpose] = useState("");
  
  const [person, setPerson] = useState(""); 
  const [receivedBy, setReceivedBy] = useState(""); 
  const [vehicle, setVehicle] = useState("");

  const [adjReason, setAdjReason] = useState("Physical Count");
  const [adjDirection, setAdjDirection] = useState("deduct"); 
  const [processingTrans, setProcessingTrans] = useState(false);

  // --- HISTORY & PRINTING STATES ---
  const [itemHistory, setItemHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [printData, setPrintData] = useState(null);

  // --- DATA SYNC ---
  useEffect(() => {
    const unsubCats = onSnapshot(collection(db, "materialCategories"), snap => setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubLocs = onSnapshot(collection(db, "locations"), snap => setLocations(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubItems = onSnapshot(collection(db, "inventoryItems"), snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    const fetchJobs = async () => {
      const q = query(collection(db, "jobs"));
      const snap = await getDocs(q);
      const jobsList = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(j => j.status !== "completed");
      // ⭐️ ROUND 9.5 ITEM 8: Sort jobs alphabetically by display_id to group sets
      jobsList.sort((a, b) => (a.display_id || "").localeCompare(b.display_id || ""));
      setActiveJobs(jobsList);
    };
    fetchJobs();

    return () => { unsubCats(); unsubLocs(); unsubItems(); };
  }, []);

  // ⭐️ ROUND 9.3: Robust Legacy Balance Migration (Replacing entire balances map)
  useEffect(() => {
    if (loading || locations.length === 0 || items.length === 0) return;

    const migrateLegacyBalances = async () => {
      for (const item of items) {
        if (!item.balances) continue;
        let needsUpdate = false;
        const newBalances = { ...item.balances };

        for (const [key, qty] of Object.entries(item.balances)) {
          if (qty === 0) continue;
          
          const matchingLoc = locations.find(l => l.code === key || l.id === key || l.code === "11/14");
          
          if (matchingLoc && key !== matchingLoc.id) {
            newBalances[matchingLoc.id] = (newBalances[matchingLoc.id] || 0) + qty;
            delete newBalances[key];
            needsUpdate = true;
          }
        }

        if (needsUpdate) {
          try {
            await updateDoc(doc(db, "inventoryItems", item.id), { balances: newBalances });
          } catch (err) {
            console.error(`Failed to migrate balance for item ${item.name}:`, err);
          }
        }
      }
    };

    migrateLegacyBalances();
  }, [loading, locations, items]);

  // --- AUTO LABEL ENGINE ---
  useEffect(() => {
    if (!isAutoLabel || !itemCatId) return;
    const cat = categories.find(c => c.id === itemCatId);
    if (!cat) return;
    const vals = Object.values(itemDetails).filter(v => v.trim() !== "");
    const generated = vals.length > 0 ? `${cat.name} · ${vals.join(" ")}` : cat.name;
    setItemName(generated);
  }, [itemDetails, itemCatId, isAutoLabel, categories]);

  // --- JOB LOCATION AUTO-DETECT ---
  useEffect(() => {
    if (transType === 'out' && linkedJobId) {
      const job = activeJobs.find(j => j.id === linkedJobId);
      const jobPlaceCode = job?.process_sequence?.find(s => s.assigned_machine_place)?.assigned_machine_place;
      if (jobPlaceCode) {
        const foundLoc = locations.find(l => l.code === jobPlaceCode);
        if (foundLoc) setTransLoc(foundLoc.id);
      }
    }
  }, [linkedJobId, transType, activeJobs, locations]);

  // --- ITEM HANDLERS ---
  const openItemModal = (item = null) => {
    setErrorMsg("");
    if (item) {
      setActiveItem(item);
      setItemCatId(item.categoryId);
      setItemName(item.name);
      setIsAutoLabel(false);
      setItemUnit(item.unit || "sheets");
      setMinStock(item.minStock || "");
      setItemDetails(item.details || {});
    } else {
      setActiveItem(null);
      setItemCatId("");
      setItemName("");
      setIsAutoLabel(true);
      setItemUnit("sheets");
      setMinStock("");
      setItemDetails({});
    }
    setItemModalOpen(true);
  };

  const handleCatChange = (catId) => {
    setItemCatId(catId);
    const cat = categories.find(c => c.id === catId);
    if (cat) {
      setItemUnit(cat.defaultUnit || "sheets");
      const emptyDetails = {};
      cat.attributes?.forEach(a => emptyDetails[a.name] = "");
      setItemDetails(emptyDetails);
    }
  };

  const saveItem = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setSavingItem(true);
    const payload = {
      categoryId: itemCatId,
      categoryName: categories.find(c => c.id === itemCatId)?.name || "",
      name: itemName,
      unit: itemUnit,
      minStock: Number(minStock) || 0,
      details: itemDetails,
      isActive: true,
      updated_at: serverTimestamp()
    };

    try {
      if (activeItem) {
        await updateDoc(doc(db, "inventoryItems", activeItem.id), payload);
      } else {
        await addDoc(collection(db, "inventoryItems"), {
          ...payload,
          balance: 0, 
          balances: {}, 
          created_at: serverTimestamp()
        });
      }
      setItemModalOpen(false);
    } catch (err) { setErrorMsg("Failed to save item: " + err.message); }
    finally { setSavingItem(false); }
  };

  const handleDeleteItemClick = async (item) => {
    try {
      const q = query(collection(db, "inventoryTransactions"), where("itemId", "==", item.id));
      const snap = await getDocs(q);
      const txCount = snap.size;

      setConfirmConfig({
        isOpen: true,
        title: "Delete Inventory Item",
        message: `Delete ${item.name}? Total Balance ${item.balance || 0} ${item.unit} and ${txCount} ledger entries will be permanently removed.`,
        confirmText: "Permanently Delete",
        isDanger: true,
        onConfirm: async () => {
          setConfirmConfig(null);
          setLoading(true);
          try {
            const batch = writeBatch(db);
            batch.delete(doc(db, "inventoryItems", item.id));
            snap.docs.forEach(d => {
              const txData = d.data();
              if (txData.job_ref_id) {
                batch.update(d.ref, { itemId: "DELETED", itemName: `${txData.itemName} (item deleted)` });
              } else {
                batch.delete(d.ref);
              }
            });
            await batch.commit();
          } catch(e) { setErrorMsg("Failed to delete: " + e.message); }
          finally { setLoading(false); }
        },
        onCancel: () => setConfirmConfig(null)
      });
    } catch (err) { setErrorMsg("Error preparing delete: " + err.message); }
  };

  const handleMigrateSubmit = async (e) => {
    e.preventDefault();
    if (!migrateLoc) return setErrorMsg("Please select a location.");
    
    try {
      const updateData = {
        balances: { [migrateLoc]: activeItem.balance || 0 },
        location: null, 
        updated_at: serverTimestamp()
      };
      await updateDoc(doc(db, "inventoryItems", activeItem.id), updateData);
      setMigrateModalOpen(false);
      setActiveItem(null);
    } catch (err) {
      setErrorMsg("Migration failed: " + err.message);
    }
  };

  // --- TRANSACTION HANDLERS ---
  const openTransModal = (item, type = "in") => {
    setErrorMsg("");
    setActiveItem(item);
    setTransType(type);
    setTransDate(new Date().toISOString().split('T')[0]);
    setTransQty("");
    setTransNotes("");
    
    setTransLoc("");
    setTransToLoc("");
    
    setAdjDirection("deduct");
    setSupplier(""); setRate(""); setLinkedJobId(""); setFreeTextPurpose(""); setPerson(""); setReceivedBy(""); setVehicle(""); setAdjReason("Physical Count");
    
    setTransModalOpen(true);
  };

  const processTransactionSubmit = async (isConfirmedNegative = false) => {
    setErrorMsg("");
    const qtyNum = Number(transQty);
    
    // ⭐️ ROUND 9.5 ITEM 8: Strict Manual Validation (HTML5 'required' removed from selects to prevent silent failures)
    if (!transQty || qtyNum <= 0) return setErrorMsg("Quantity must be greater than 0.");
    if (!transLoc) return setErrorMsg(`Please select a ${transType === 'in' ? 'receiving' : 'source'} location.`);
    if (transType === 'transfer' && !transToLoc) return setErrorMsg("Please select a destination location for the transfer.");
    if (transType === 'transfer' && transLoc === transToLoc) return setErrorMsg("Source and Destination locations must be different.");

    const sourceLocObj = locations.find(l => l.id === transLoc);
    const sourceLocDisplay = sourceLocObj ? sourceLocObj.code : transLoc;
    
    // Construct entirely new balances object to avoid any dot notation weirdness
    const updatedBalances = { ...(activeItem.balances || {}) };
    
    let locBalance = updatedBalances[transLoc] || 0;
    let newLocBalance = locBalance;
    let newTotalBalance = activeItem.balance || 0;

    if (transType === 'in') {
      newLocBalance += qtyNum;
      newTotalBalance += qtyNum;
    } else if (transType === 'out' || (transType === 'adj' && adjDirection === 'deduct')) {
      newLocBalance -= qtyNum;
      newTotalBalance -= qtyNum;
    } else if (transType === 'adj' && adjDirection === 'add') {
      newLocBalance += qtyNum;
      newTotalBalance += qtyNum;
    } else if (transType === 'transfer') {
      newLocBalance -= qtyNum; 
    }

    if (newLocBalance < 0 && !isConfirmedNegative && (transType === 'out' || transType === 'transfer' || (transType === 'adj' && adjDirection === 'deduct'))) {
      setConfirmConfig({
        isOpen: true,
        title: "Negative Location Balance",
        message: `This action will drop the stock at ${sourceLocDisplay} to ${newLocBalance} ${activeItem.unit}. Proceed anyway?`,
        confirmText: "Proceed",
        isDanger: false,
        onConfirm: () => {
          setConfirmConfig(null);
          processTransactionSubmit(true); 
        },
        onCancel: () => setConfirmConfig(null)
      });
      return;
    }

    setProcessingTrans(true);
    try {
      // ⭐️ ROUND 9.5 ITEM 1 & 3: ATOMIC BATCH FOR EVERYTHING
      const batch = writeBatch(db);

      let linkedJobDisplay = "";
      if (linkedJobId) {
        const j = activeJobs.find(x => x.id === linkedJobId);
        linkedJobDisplay = j ? `${j.display_id || `JOB-${j.id.slice(0,6).toUpperCase()}`} (${j.part_name || 'Main'})` : "";
      }

      // ⭐️ ROUND 9.5 ITEM 5: Slip date exactly matches transaction string
      const [yy, mm, dd] = transDate.split('-');
      const generatedId = `TR-${dd}${mm}${yy}-${Math.floor(1000 + Math.random() * 9000)}`;

      const destLocObj = transToLoc ? locations.find(l => l.id === transToLoc) : null;
      const destLocDisplay = destLocObj ? destLocObj.code : transToLoc;

      // LEDGER ROW 1: (Source for out/adj/transfer, Dest for in)
      const txRef1 = doc(collection(db, "inventoryTransactions"));
      const transPayload = {
        itemId: activeItem.id,
        itemName: activeItem.name,
        type: transType === 'transfer' ? 'transfer_out' : transType, // ⭐️ ROUND 9.5 ITEM 4: Specific types
        date: transDate,
        qty: transType === 'out' || (transType === 'adj' && adjDirection === 'deduct') || transType === 'transfer' ? -qtyNum : qtyNum,
        location: sourceLocDisplay, 
        previous_balance: locBalance,
        new_balance: newLocBalance,
        total_balance: newTotalBalance,
        notes: transNotes,
        created_at: serverTimestamp(),
      };

      if (transType === 'in') {
        transPayload.supplier = supplier;
        transPayload.rate = rate;
      } else if (transType === 'out') {
        transPayload.job_ref_id = linkedJobId;
        transPayload.job_display = linkedJobDisplay;
        transPayload.purpose = freeTextPurpose;
        transPayload.person = person; 
      } else if (transType === 'adj') {
        transPayload.reason = adjReason;
      } else if (transType === 'transfer') {
        transPayload.toLocation = destLocDisplay;
        transPayload.transfer_id = generatedId;
        transPayload.person = person;
        transPayload.receivedBy = receivedBy;
        transPayload.vehicle = vehicle;
      }

      batch.set(txRef1, transPayload);

      // Update Source Balance in Map
      updatedBalances[transLoc] = newLocBalance;

      // LEDGER ROW 2 & DEST BALANCE: (Only for transfers)
      if (transType === 'transfer') {
        const destLocBalance = updatedBalances[transToLoc] || 0;
        updatedBalances[transToLoc] = destLocBalance + qtyNum;

        const txRef2 = doc(collection(db, "inventoryTransactions"));
        const transPayloadIn = {
          itemId: activeItem.id,
          itemName: activeItem.name,
          type: 'transfer_in', // ⭐️ ROUND 9.5 ITEM 4
          date: transDate,
          qty: qtyNum,
          location: destLocDisplay, 
          fromLocation: sourceLocDisplay,
          transfer_id: generatedId,
          person: person,
          receivedBy: receivedBy,
          vehicle: vehicle,
          previous_balance: destLocBalance,
          new_balance: updatedBalances[transToLoc],
          total_balance: newTotalBalance,
          notes: transNotes,
          created_at: serverTimestamp(),
        };
        batch.set(txRef2, transPayloadIn);
      }

      // Update Item Balances Map
      const itemUpdate = {
        balance: newTotalBalance,
        balances: updatedBalances,
        updated_at: serverTimestamp()
      };

      const itemRef = doc(db, "inventoryItems", activeItem.id);
      batch.update(itemRef, itemUpdate);

      // COMMIT BATCH ATOMICALLY
      await batch.commit();

      setTransModalOpen(false);
    } catch (err) { setErrorMsg("Transaction failed: " + err.message); }
    finally { setProcessingTrans(false); }
  };

  const executeTransaction = (e) => {
    e.preventDefault();
    processTransactionSubmit(false);
  };

  const viewHistory = async (item) => {
    setActiveItem(item);
    setHistoryModalOpen(true);
    setLoadingHistory(true);
    try {
      const q = query(collection(db, "inventoryTransactions"), where("itemId", "==", item.id));
      const snap = await getDocs(q);
      const allHist = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.created_at?.toMillis() - a.created_at?.toMillis());
      setItemHistory(allHist);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // ⭐️ ROUND 9.5 ITEM 3 CLEANUP: Empower client to delete phantom rows directly from the UI
  const deleteLedgerRow = async (entryId) => {
    if (window.confirm("Delete this specific ledger entry permanently? (This DOES NOT reverse balances, it only purges the row).")) {
       try {
         await deleteDoc(doc(db, "inventoryTransactions", entryId));
         setItemHistory(prev => prev.filter(r => r.id !== entryId));
       } catch (err) { alert("Failed to delete row: " + err.message); }
    }
  };

  const handlePrintSlip = (entry) => {
    setPrintData({ item: activeItem, tx: entry });
    setTimeout(() => window.print(), 100);
  };

  const inputClass = "w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-primary-500 placeholder-gray-600";
  const labelClass = "block text-xs font-semibold text-gray-400 mb-1.5";

  const getDisplayStock = (item, loc) => {
    return (item?.balances?.[loc.id] || 0) + (item?.balances?.[loc.code] || 0);
  };

  const filteredItems = items.filter(item => {
    if (selectedCatFilter && item.categoryId !== selectedCatFilter) return false;
    if (searchQuery && !item.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  if (loading) return <div className="p-8 text-primary-500 animate-pulse font-medium">Loading Inventory Engine...</div>;

  const PrintSlip = printData && (
    <div className="hidden print:block absolute inset-0 bg-white text-black font-sans text-sm p-8">
      <div className="flex justify-between items-start border-b-2 border-black pb-4 mb-6">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tight">MATERIAL TRANSFER SLIP</h1>
          <div className="text-gray-600 font-bold mt-1">Ref: {printData.tx.transfer_id}</div>
        </div>
        <div className="text-right flex flex-col justify-end">
          <div className="font-bold text-lg">{new Date(printData.tx.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
          <div className="text-sm font-bold uppercase mt-2 border border-black px-2 py-1 inline-block">
            {printData.tx.type === 'transfer_in' ? `${printData.tx.fromLocation} → ${printData.tx.location}` : `${printData.tx.location} → ${printData.tx.toLocation}`}
          </div>
        </div>
      </div>

      <div className="mb-8 border-2 border-black">
        <div className="bg-gray-100 font-bold uppercase text-xs p-2 border-b-2 border-black">Item Details</div>
        <div className="p-4 flex justify-between items-center">
          <div>
            <div className="text-xl font-bold">{printData.tx.itemName}</div>
            <div className="text-xs text-gray-500 mt-1 uppercase">Item ID: {printData.tx.itemId}</div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-black">{Math.abs(printData.tx.qty).toLocaleString()} <span className="text-lg">{printData.item.unit}</span></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8 mb-8 text-sm">
        <div className="border border-black p-4">
          <div className="font-bold uppercase text-xs mb-2">Transport / Notes</div>
          <div>Vehicle: {printData.tx.vehicle || "N/A"}</div>
          <div className="mt-2 text-gray-600">Notes: {printData.tx.notes || "None"}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8 mt-24">
        <div className="text-center">
          <div className="border-b border-black mb-2 mx-12"></div>
          <div className="font-bold uppercase text-xs">Sent By: {printData.tx.person || "__________________"}</div>
          <div className="text-[10px] text-gray-500">{printData.tx.type === 'transfer_in' ? printData.tx.fromLocation : printData.tx.location}</div>
        </div>
        <div className="text-center">
          <div className="border-b border-black mb-2 mx-12"></div>
          <div className="font-bold uppercase text-xs">Received By: {printData.tx.receivedBy || "__________________"}</div>
          <div className="text-[10px] text-gray-500">{printData.tx.type === 'transfer_in' ? printData.tx.location : printData.tx.toLocation}</div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-[1600px] mx-auto p-6 h-full flex flex-col relative">
      
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

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">Inventory Management</h2>
          <p className="text-gray-400 mt-1">Track multi-location factory material, route transfers, and issue stock.</p>
        </div>
        <button onClick={() => openItemModal()} className="bg-primary-600 hover:bg-primary-500 text-white px-5 py-2.5 rounded-lg font-medium transition-colors shadow-lg flex items-center gap-2">
          <span>+</span> Add Inventory Item
        </button>
      </div>

      <div className="flex gap-4 mb-6">
        <input type="text" placeholder="Search item label or specs..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className={`${inputClass} max-w-md`} />
        <select value={selectedCatFilter} onChange={e => setSelectedCatFilter(e.target.value)} className={`${inputClass} max-w-xs`}>
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden shadow-xl flex-1 flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse min-w-[1050px]">
            <thead>
              <tr className="bg-gray-950/50 border-b border-gray-800 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                <th className="py-4 px-6">Item Details & Specs</th>
                <th className="py-4 px-6">Location Breakdown</th>
                <th className="py-4 px-6 text-right">Total Stock</th>
                <th className="py-4 px-6 text-right w-[420px]">Ledger Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredItems.length === 0 ? (
                <tr><td colSpan="4" className="py-12 text-center text-gray-500 italic">No inventory items found. Add one above!</td></tr>
              ) : (
                filteredItems.map(item => {
                  const isLow = item.minStock > 0 && (item.balance || 0) <= item.minStock;
                  const needsMigration = (item.balance > 0) && (!item.balances || Object.keys(item.balances).length === 0);
                  
                  const resolvedBalances = {};
                  Object.entries(item.balances || {}).forEach(([key, qty]) => {
                    if (qty === 0) return;
                    const loc = locations.find(l => l.id === key) || locations.find(l => l.code === key);
                    const disp = loc ? loc.code : key;
                    resolvedBalances[disp] = (resolvedBalances[disp] || 0) + qty;
                  });

                  const breakdown = Object.entries(resolvedBalances).map(([locCode, qty]) => (
                      <span key={locCode} className="inline-block bg-gray-800 text-gray-300 px-2 py-0.5 rounded text-[10px] mr-1 mb-1 border border-gray-700">
                        <span className="font-bold text-primary-400">{locCode}:</span> {qty.toLocaleString()}
                      </span>
                  ));

                  return (
                    <tr key={item.id} className="hover:bg-gray-800/30 transition-colors">
                      <td className="py-4 px-6">
                        <div className="font-bold text-white text-sm">{item.name}</div>
                        <div className="text-[10px] text-primary-400 font-bold uppercase tracking-wider mt-1">{item.categoryName}</div>
                      </td>
                      <td className="py-4 px-6">
                        {needsMigration ? (
                          <span className="text-orange-400 text-xs font-bold bg-orange-500/10 px-2 py-1 rounded">⚠️ Legacy Data</span>
                        ) : breakdown.length > 0 ? (
                          <div className="flex flex-wrap">{breakdown}</div>
                        ) : (
                          <span className="text-gray-600 text-xs font-mono">0 in all locations</span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className={`text-xl font-black ${isLow ? 'text-red-400' : 'text-gray-200'}`}>
                          {(item.balance || 0).toLocaleString()}
                        </div>
                        <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{item.unit}</div>
                        {isLow && <div className="text-[10px] text-red-500 font-bold mt-1 uppercase bg-red-500/10 inline-block px-1.5 py-0.5 rounded">Low Stock (Min: {item.minStock})</div>}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex justify-end gap-2 items-center">
                          {needsMigration ? (
                            <button onClick={() => {setActiveItem(item); setMigrateModalOpen(true);}} className="text-white bg-orange-600 hover:bg-orange-500 px-3 py-1.5 rounded text-xs font-bold transition-colors shadow-lg animate-pulse">
                              Migrate Legacy Stock
                            </button>
                          ) : (
                            <>
                              <button onClick={() => openTransModal(item, 'in')} className="text-green-400 bg-green-400/10 hover:bg-green-400 hover:text-white px-3 py-1.5 rounded text-xs font-bold transition-colors">Stock In</button>
                              <button onClick={() => openTransModal(item, 'out')} className="text-blue-400 bg-blue-400/10 hover:bg-blue-400 hover:text-white px-3 py-1.5 rounded text-xs font-bold transition-colors">Issue Out</button>
                              <button onClick={() => openTransModal(item, 'transfer')} className="text-purple-400 bg-purple-400/10 hover:bg-purple-400 hover:text-white px-3 py-1.5 rounded text-xs font-bold transition-colors">Transfer</button>
                              <button onClick={() => openTransModal(item, 'adj')} className="text-yellow-400 hover:text-white px-3 py-1.5 rounded text-xs font-bold transition-colors border border-yellow-400/30 hover:bg-yellow-500/20">Adjust</button>
                            </>
                          )}
                          <button onClick={() => viewHistory(item)} className="text-gray-400 hover:text-white border border-gray-700 hover:bg-gray-800 px-3 py-1.5 rounded text-xs font-medium transition-colors ml-2">History</button>
                          <button onClick={() => handleDeleteItemClick(item)} className="text-gray-600 hover:text-red-400 hover:bg-red-500/10 p-1.5 rounded transition-colors ml-1" title="Delete Item">
                             <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
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

      {isItemModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-gray-800 bg-[#151724]">
              <h2 className="text-xl font-bold text-white">{activeItem ? "Edit Inventory Item" : "Create Master Inventory Item"}</h2>
            </div>
            
            <form onSubmit={saveItem} className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6 bg-[#0a0f1a]">
              
              {errorMsg && <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded text-sm font-bold">{errorMsg}</div>}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Material Category *</label>
                  <select required value={itemCatId} onChange={e => handleCatChange(e.target.value)} disabled={activeItem != null} className={inputClass}>
                    <option value="">-- Select Category --</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              {itemCatId && (
                <div className="bg-gray-950 p-5 rounded-xl border border-gray-800 space-y-4">
                  <h3 className="text-xs font-bold text-primary-400 uppercase tracking-wider mb-2">Dynamic Material Attributes</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {categories.find(c => c.id === itemCatId)?.attributes?.map(attr => (
                      <div key={attr.name}>
                        <label className="block text-[10px] text-gray-500 font-bold uppercase mb-1">{attr.name}</label>
                        {attr.type === 'dropdown' || attr.type === 'multi-select' ? (
                          <select required value={itemDetails[attr.name] || ""} onChange={e => setItemDetails({...itemDetails, [attr.name]: e.target.value})} className={inputClass}>
                            <option value="">-- Select --</option>
                            {attr.options?.split(",").map(opt => <option key={opt} value={opt.trim()}>{opt.trim()}</option>)}
                          </select>
                        ) : (
                          <input required type={attr.type === 'number' ? 'number' : 'text'} value={itemDetails[attr.name] || ""} onChange={e => setItemDetails({...itemDetails, [attr.name]: e.target.value})} className={inputClass} placeholder={attr.name} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-2">
                <div className="flex justify-between items-end mb-1">
                  <label className={labelClass}>Generated Display Label *</label>
                  {!activeItem && (
                    <label className="flex items-center gap-1.5 text-[10px] text-gray-400 mb-1 cursor-pointer">
                      <input type="checkbox" checked={isAutoLabel} onChange={e => setIsAutoLabel(e.target.checked)} className="rounded bg-gray-900 border-gray-700" />
                      Auto-Generate Label
                    </label>
                  )}
                </div>
                <input required type="text" value={itemName} onChange={e => {setItemName(e.target.value); setIsAutoLabel(false);}} className={inputClass} placeholder="e.g. FBB 300gsm 25x36 White" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className={labelClass}>Base Unit *</label><input required type="text" value={itemUnit} onChange={e => setItemUnit(e.target.value)} className={inputClass} /></div>
                <div><label className={labelClass}>Total Min Stock Level Warning</label><input type="number" value={minStock} onChange={e => setMinStock(e.target.value)} className={inputClass} placeholder="e.g. 500" /></div>
              </div>
              <div className="text-xs text-gray-500 italic mt-2">Note: Initial locations and stock levels are set via the "Stock In" transaction after item creation.</div>

              <div className="pt-4 flex justify-end gap-3 border-t border-gray-800">
                <button type="button" onClick={() => setItemModalOpen(false)} className="px-5 py-2 text-gray-400 hover:text-white transition-colors font-medium">Cancel</button>
                <button type="submit" disabled={savingItem} className="bg-primary-600 hover:bg-primary-500 text-white px-6 py-2 rounded-lg font-bold transition-colors">
                  {savingItem ? "Saving..." : "Save Item"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isMigrateModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-orange-500/50 rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-fade-in">
            <div className="p-6">
              <h3 className="text-xl font-bold text-white mb-2">Assign Legacy Stock</h3>
              <p className="text-sm text-gray-300 mb-4">
                The item <strong>{activeItem?.name}</strong> has a total balance of <strong>{activeItem?.balance} {activeItem?.unit}</strong> but it is not assigned to a master location. Where is this stock currently sitting?
              </p>
              
              {locations.filter(l => l.active).length === 0 ? (
                <div className="bg-orange-500/10 border border-orange-500/40 p-4 rounded-lg mb-6 text-orange-300 text-xs space-y-2">
                  <div className="font-bold uppercase tracking-wider">⚠️ No Locations Defined</div>
                  <p>You must configure at least one active storage location before legacy items can be migrated.</p>
                  <div>
                    Please navigate to <span className="font-bold underline text-white">Master Data → Storage Locations</span> to add locations.
                  </div>
                </div>
              ) : null}

              {errorMsg && <div className="bg-red-500/10 text-red-400 p-3 rounded text-sm mb-4">{errorMsg}</div>}

              <div className="mb-8">
                <label className={labelClass}>Default Storage Location *</label>
                <select 
                  value={migrateLoc} 
                  onChange={e => setMigrateLoc(e.target.value)} 
                  className={inputClass}
                  disabled={locations.filter(l => l.active).length === 0}
                >
                  <option value="">{locations.filter(l => l.active).length === 0 ? "-- No Locations Available --" : "-- Select Master Location --"}</option>
                  {locations.filter(l => l.active).map(l => (
                    <option key={l.id} value={l.id}>{l.name} ({l.code})</option> 
                  ))}
                </select>
              </div>
              
              <div className="flex justify-end gap-3">
                <button onClick={() => setMigrateModalOpen(false)} className="px-5 py-2 text-gray-400 hover:text-white bg-gray-800 rounded-lg">Cancel</button>
                <button 
                  onClick={handleMigrateSubmit} 
                  disabled={locations.filter(l => l.active).length === 0} 
                  className="bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white px-6 py-2 rounded-lg font-bold transition-colors shadow-lg"
                >
                  Migrate Stock
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isTransModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            
            <div className={`p-6 border-b border-gray-800 flex items-center justify-between ${
              transType === 'in' ? 'bg-green-950/30' : 
              transType === 'out' ? 'bg-blue-950/30' : 
              transType === 'transfer' ? 'bg-purple-950/30' :
              'bg-yellow-950/30'
            }`}>
              <div>
                <h2 className="text-xl font-bold text-white">
                  {transType === 'in' ? '📦 Register Stock In' : 
                   transType === 'out' ? '📤 Issue Stock Out' : 
                   transType === 'transfer' ? '🚚 Multi-Site Transfer' : 
                   '⚖️ Adjust Stock'}
                </h2>
                <p className="text-xs text-gray-400 mt-1 font-mono">Item: {activeItem?.name}</p>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-0.5">Total Factory Balance</div>
                <div className="text-2xl font-black text-white">{activeItem?.balance?.toLocaleString()} <span className="text-sm font-bold text-gray-500">{activeItem?.unit}</span></div>
              </div>
            </div>

            <form onSubmit={executeTransaction} className="p-6 space-y-6 bg-[#0a0f1a] flex-1 overflow-y-auto custom-scrollbar">
              
              {errorMsg && <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded text-sm font-bold">{errorMsg}</div>}

              <div className="bg-gray-950 border border-gray-800 p-4 rounded-lg">
                <div className="grid grid-cols-2 gap-4">
                  
                  {transType === 'transfer' ? (
                    <>
                      <div>
                        <label className={labelClass}>From Location *</label>
                        <select value={transLoc} onChange={e => setTransLoc(e.target.value)} className={inputClass}>
                          <option value="">-- Select Source --</option>
                          {locations.filter(l => l.active).map(l => (
                             <option key={l.id} value={l.id}>{l.name} (Stk: {getDisplayStock(activeItem, l)})</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>To Location *</label>
                        <select value={transToLoc} onChange={e => setTransToLoc(e.target.value)} className={inputClass}>
                          <option value="">-- Select Destination --</option>
                          {locations.filter(l => l.active && l.id !== transLoc).map(l => (
                             <option key={l.id} value={l.id}>{l.name} (Stk: {getDisplayStock(activeItem, l)})</option>
                          ))}
                        </select>
                      </div>
                    </>
                  ) : (
                    <div className="col-span-2">
                      <label className={labelClass}>
                        {transType === 'in' ? 'Receiving Location *' : transType === 'out' ? 'Source Location *' : 'Location Being Adjusted *'}
                      </label>
                      <select value={transLoc} onChange={e => setTransLoc(e.target.value)} className={inputClass}>
                        <option value="">-- Select Location --</option>
                        {locations.filter(l => l.active).map(l => (
                           <option key={l.id} value={l.id}>{l.name} ({l.code}) — {transType !== 'in' ? `Stk: ${getDisplayStock(activeItem, l)}` : ''}</option>
                        ))}
                      </select>
                    </div>
                  )}

                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-b border-gray-800 pb-6">
                <div>
                  <label className={labelClass}>Transaction Date *</label>
                  <input type="date" value={transDate} onChange={e => setTransDate(e.target.value)} className={`${inputClass} [color-scheme:dark]`} />
                </div>
                <div>
                  <label className={labelClass}>
                    {transType === 'adj' ? 'Adjustment Quantity (Positive Number) *' : 'Quantity *'}
                  </label>
                  <div className="flex gap-2">
                    {transType === 'adj' && (
                      <div className="flex bg-gray-950 border border-gray-800 rounded-lg p-1">
                        <button type="button" onClick={() => setAdjDirection('add')} className={`px-3 py-1 rounded text-xs font-bold uppercase transition-colors ${adjDirection === 'add' ? 'bg-green-600 text-white' : 'text-gray-500 hover:text-white'}`}>Add</button>
                        <button type="button" onClick={() => setAdjDirection('deduct')} className={`px-3 py-1 rounded text-xs font-bold uppercase transition-colors ${adjDirection === 'deduct' ? 'bg-red-600 text-white' : 'text-gray-500 hover:text-white'}`}>Deduct</button>
                      </div>
                    )}
                    <input 
                      type="number" 
                      step="any" 
                      min="0.001" 
                      value={transQty} 
                      onChange={e => setTransQty(e.target.value)} 
                      className={`${inputClass} text-lg font-bold flex-1 ${transType === 'in' || (transType === 'adj' && adjDirection === 'add') ? 'text-green-400 focus:border-green-500' : transType === 'out' || (transType === 'adj' && adjDirection === 'deduct') ? 'text-red-400 focus:border-red-500' : 'text-purple-400 focus:border-purple-500'}`} 
                      placeholder="e.g. 500" 
                    />
                  </div>
                </div>
              </div>

              {transType === 'in' && (
                <div className="grid grid-cols-2 gap-4 animate-fade-in">
                  <div><label className={labelClass}>Supplier (Optional)</label><input type="text" value={supplier} onChange={e => setSupplier(e.target.value)} className={inputClass} placeholder="Supplier Name" /></div>
                  <div><label className={labelClass}>Rate / Cost (Optional)</label><input type="number" step="any" value={rate} onChange={e => setRate(e.target.value)} className={inputClass} placeholder="0.00" /></div>
                </div>
              )}

              {transType === 'out' && (
                <div className="space-y-4 animate-fade-in">
                  <div>
                    <label className={labelClass}>Link to Factory Job (Optional)</label>
                    <select value={linkedJobId} onChange={e => setLinkedJobId(e.target.value)} className={inputClass}>
                      <option value="">-- No linked job (Free Issue) --</option>
                      {activeJobs.map(j => (
                        <option key={j.id} value={j.id}>
                          {j.display_id || `JOB-${j.id.slice(0,6).toUpperCase()}`} - {j.title} {j.part_name ? `(${j.part_name})` : ''}
                        </option>
                      ))}
                    </select>
                    {linkedJobId && transLoc && <div className="text-[10px] text-green-400 mt-1 italic">Location automatically set based on job route.</div>}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className={labelClass}>Purpose (If not linked)</label><input type="text" value={freeTextPurpose} onChange={e => setFreeTextPurpose(e.target.value)} className={inputClass} placeholder="e.g. R&D Prototype" disabled={linkedJobId !== ""} /></div>
                    <div><label className={labelClass}>Issued To (Person)</label><input type="text" value={person} onChange={e => setPerson(e.target.value)} className={inputClass} placeholder="Operator Name" /></div>
                  </div>
                </div>
              )}

              {transType === 'transfer' && (
                <div className="grid grid-cols-3 gap-4 animate-fade-in">
                  <div><label className={labelClass}>Sent By (Person)</label><input type="text" value={person} onChange={e => setPerson(e.target.value)} className={inputClass} /></div>
                  <div><label className={labelClass}>Received By (Person)</label><input type="text" value={receivedBy} onChange={e => setReceivedBy(e.target.value)} className={inputClass} /></div>
                  <div><label className={labelClass}>Transport / Vehicle</label><input type="text" value={vehicle} onChange={e => setVehicle(e.target.value)} className={inputClass} placeholder="e.g. Forklift 2" /></div>
                </div>
              )}

              {transType === 'adj' && (
                <div className="animate-fade-in">
                  <label className={labelClass}>Adjustment Reason *</label>
                  <select value={adjReason} onChange={e => setAdjReason(e.target.value)} className={inputClass}>
                    <option value="Physical Count">Physical Audit / Count Correction</option>
                    <option value="Damage">Damage in Storage</option>
                    <option value="Wastage">Excess Production Wastage</option>
                  </select>
                </div>
              )}

              <div>
                <label className={labelClass}>Additional Notes</label>
                <input type="text" value={transNotes} onChange={e => setTransNotes(e.target.value)} className={inputClass} placeholder="Any details..." />
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setTransModalOpen(false)} className="px-5 py-2 text-gray-400 hover:text-white transition-colors font-medium">Cancel</button>
                <button type="submit" disabled={processingTrans} className={`px-6 py-2 rounded-lg font-bold text-white transition-colors shadow-lg ${
                  transType === 'in' ? 'bg-green-600 hover:bg-green-500' : 
                  transType === 'out' ? 'bg-blue-600 hover:bg-blue-500' : 
                  transType === 'transfer' ? 'bg-purple-600 hover:bg-purple-500' :
                  'bg-yellow-600 hover:bg-yellow-500'
                }`}>
                  {processingTrans ? "Processing..." : transType === 'in' ? "Confirm Stock In" : transType === 'out' ? "Confirm Issue Out" : transType === 'transfer' ? "Process Transfer" : "Confirm Adjustment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isHistoryModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            
            <div className="p-6 border-b border-gray-800 bg-[#151724] flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <svg className="w-5 h-5 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  Item Ledger History
                </h2>
                <div className="text-gray-400 mt-2 font-mono bg-gray-950 px-3 py-1.5 rounded inline-block border border-gray-800">
                  <span className="font-bold text-white">{activeItem?.name}</span> • Current Balance: <span className="text-primary-400 font-bold">{activeItem?.balance} {activeItem?.unit}</span>
                </div>
              </div>
              <button onClick={() => setHistoryModalOpen(false)} className="text-gray-400 hover:text-white bg-gray-800 p-1.5 rounded transition-colors"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-[#0a0f1a]">
              {loadingHistory ? (
                <div className="text-center text-primary-500 animate-pulse py-8">Fetching ledger transactions...</div>
              ) : itemHistory.length === 0 ? (
                <div className="text-center text-gray-500 py-8 italic border border-gray-800 rounded bg-gray-900/50">No transactions recorded for this item yet.</div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-800 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                      <th className="py-3 px-4 w-12 text-center">Del</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Location</th>
                      <th className="py-3 px-4">Reference / Details</th>
                      <th className="py-3 px-4 text-right">Loc Qty Chg</th>
                      <th className="py-3 px-4 text-right">Loc Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/50">
                    {itemHistory.map(entry => (
                      <tr key={entry.id} className="hover:bg-gray-800/20 transition-colors">
                        <td className="py-3 px-4 text-center">
                          <button onClick={() => deleteLedgerRow(entry.id)} className="text-gray-600 hover:text-red-400 p-1 rounded transition-colors" title="Delete Ledger Entry">
                            <svg className="w-4 h-4 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </td>
                        <td className="py-3 px-4 text-xs text-gray-400 font-mono">{entry.date}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            entry.type === 'in' || entry.type === 'transfer_in' ? 'bg-green-500/10 text-green-400' : 
                            entry.type === 'out' || entry.type === 'transfer_out' ? 'bg-blue-500/10 text-blue-400' : 
                            entry.type === 'transfer' ? 'bg-purple-500/10 text-purple-400' :
                            'bg-yellow-500/10 text-yellow-400'
                          }`}>
                            {entry.type === 'in' ? 'Stock In' : entry.type === 'out' ? 'Issue Out' : entry.type === 'transfer_out' ? 'Transfer Out' : entry.type === 'transfer_in' ? 'Transfer In' : entry.type === 'transfer' ? 'Transfer (Legacy)' : 'Adjust'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs font-bold text-gray-300">
                          {entry.type === 'transfer' || entry.type === 'transfer_out' ? (
                            <span className="text-blue-400">{entry.location} → {entry.toLocation}</span>
                          ) : entry.type === 'transfer_in' ? (
                            <span className="text-green-400">{entry.fromLocation} → {entry.location}</span>
                          ) : (
                            entry.location || "N/A"
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs text-gray-300">
                          {entry.type === 'in' && <div className="font-medium text-gray-400">Supplier: <span className="text-gray-200">{entry.supplier || "N/A"}</span></div>}
                          {entry.type === 'out' && entry.job_ref_id && <div className="font-bold text-primary-400 cursor-pointer">{entry.job_display}</div>}
                          {entry.type === 'out' && !entry.job_ref_id && <div className="font-medium">Purpose: {entry.purpose || "N/A"}</div>}
                          {entry.type === 'adj' && <div className="font-medium text-yellow-400">Reason: {entry.reason}</div>}
                          {(entry.type === 'transfer' || entry.type === 'transfer_out' || entry.type === 'transfer_in') && (
                             <div className="flex gap-2 items-center">
                               <span className="font-mono text-gray-500 bg-gray-900 px-1.5 py-0.5 rounded">{entry.transfer_id}</span>
                               <button onClick={() => handlePrintSlip(entry)} className="text-[10px] bg-gray-800 hover:bg-gray-700 text-white px-2 py-1 rounded transition-colors uppercase font-bold tracking-wider">Print Slip</button>
                             </div>
                          )}
                          {entry.notes && <div className="text-[10px] text-gray-500 mt-0.5 italic">{entry.notes}</div>}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className={`font-bold font-mono ${entry.qty > 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {entry.qty > 0 ? '+' : ''}{entry.qty}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className="font-black text-gray-200 text-sm">{entry.new_balance}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {createPortal(PrintSlip, document.body)}

    </div>
  );
}