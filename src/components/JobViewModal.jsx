import { useState, useEffect, Fragment } from "react";
import { collection, query, where, doc, updateDoc, onSnapshot, increment } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../firebase/config";

export default function JobViewModal({ job, onClose }) {
  const [localJob, setLocalJob] = useState(job);
  const [siblings, setSiblings] = useState([]);
  const [issuedMaterials, setIssuedMaterials] = useState([]); 
  
  const [completingStepIdx, setCompletingStepIdx] = useState(null);
  const [qtyOk, setQtyOk] = useState("");
  const [qtyReject, setQtyReject] = useState("");
  
  const [activeHoldIdx, setActiveHoldIdx] = useState(null);
  const [holdReason, setHoldReason] = useState("");
  const [holdNote, setHoldNote] = useState("");
  
  const [updating, setUpdating] = useState(false);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [dies, setDies] = useState([]);
  const [locations, setLocations] = useState([]);
  const [companyLogo, setCompanyLogo] = useState(""); 

  const [liveProductFiles, setLiveProductFiles] = useState([]);
  const [files, setFiles] = useState(job.files || []); 
  const [savingFiles, setSavingFiles] = useState(false);

  const [toast, setToast] = useState({ show: false, msg: "", type: "info" });
  const showToast = (msg, type = "info") => {
    setToast({ show: true, msg, type });
    setTimeout(() => setToast({ show: false, msg: "", type: "info" }), 4000);
  };

  const [printNode] = useState(() => document.createElement('div'));

  useEffect(() => {
    document.body.appendChild(printNode);
    return () => {
      if (printNode.parentNode) {
        printNode.parentNode.removeChild(printNode);
      }
    };
  }, [printNode]);

  // 1. Live Global Dependencies & Settings
  useEffect(() => {
    const unsubInv = onSnapshot(collection(db, "inventoryItems"), (snap) => setInventoryItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubDies = onSnapshot(collection(db, "dies"), (snap) => setDies(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubLocs = onSnapshot(collection(db, "locations"), (snap) => setLocations(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    
    const unsubSettings = onSnapshot(doc(db, "settings", "global"), (docSnap) => {
      if (docSnap.exists() && docSnap.data().companyLogo) {
        setCompanyLogo(docSnap.data().companyLogo);
      }
    });

    return () => { unsubInv(); unsubDies(); unsubLocs(); unsubSettings(); };
  }, []);

  // 2. Live Product Files Sync
  useEffect(() => {
    if (!localJob?.product?.id) {
      setLiveProductFiles([]);
      return;
    }
    const unsubProduct = onSnapshot(doc(db, "products", localJob.product.id), (pDoc) => {
      if (pDoc.exists()) setLiveProductFiles(pDoc.data().files || []);
      else setLiveProductFiles([]);
    });
    return () => unsubProduct();
  }, [localJob?.product?.id]);

  // 3. Live Sibling Job Sync
  useEffect(() => {
    if (!localJob?.set_code) return;
    const q = query(collection(db, "jobs"), where("set_code", "==", localJob.set_code));
    const unsubSiblings = onSnapshot(q, (snap) => {
      const sibs = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => Number(a.part_index || 0) - Number(b.part_index || 0));
      setSiblings(sibs);
    });
    return () => unsubSiblings();
  }, [localJob?.set_code]);

  // 4. Live Issued Materials Ledger Sync
  useEffect(() => {
    if (!localJob?.id) return;
    const q = query(collection(db, "inventoryTransactions"), where("job_ref_id", "==", localJob.id), where("type", "==", "out"));
    const unsubMaterials = onSnapshot(q, (snap) => {
      const materials = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setIssuedMaterials(materials);
    });
    return () => unsubMaterials();
  }, [localJob?.id]);

  if (!localJob) return null;

  const handlePrint = async () => {
    try {
      await updateDoc(doc(db, "jobs", localJob.id), { print_count: increment(1) });
    } catch (err) {
      console.error("Failed to increment print count:", err);
    }

    const newTab = window.open(`/print/${localJob.id}?autoprint=1`, '_blank');
    
    if (!newTab || newTab.closed || typeof newTab.closed === 'undefined') {
      window.location.href = `/print/${localJob.id}?autoprint=1`;
    }
  };

  const updateStepStatus = async (idx, newStatus, extraStepData = {}, extraJobData = {}) => {
    setUpdating(true);
    try {
      const updatedSequence = [...localJob.process_sequence];
      const currentStep = updatedSequence[idx];
      const now = new Date().toISOString();
      const actor = "Ops Coordinator"; 

      updatedSequence[idx] = {
        ...currentStep,
        status: newStatus,
        status_updated_at: now,
        ...extraStepData
      };

      if (newStatus === 'in_progress' && !currentStep.started_at) updatedSequence[idx].started_at = now;
      if (newStatus === 'completed') updatedSequence[idx].completed_at = now;

      const logEntry = {
        id: Date.now().toString(),
        step_index: idx,
        process_name: currentStep.process_name,
        old_status: currentStep.status || 'pending',
        new_status: newStatus,
        timestamp: now,
        actor: actor,
        reason: extraStepData.hold_reason || null,
        note: extraStepData.hold_note || null
      };

      const newLog = [logEntry, ...(localJob.activity_log || [])]; 
      const allCompleted = updatedSequence.every(s => s.status === "completed");
      
      const newJobStatus = extraJobData.status || (allCompleted ? "completed" : "in_progress");

      const updatePayload = {
        process_sequence: updatedSequence, 
        status: newJobStatus,
        activity_log: newLog,
        ...extraJobData
      };

      await updateDoc(doc(db, "jobs", localJob.id), updatePayload);

      setLocalJob(prev => ({ ...prev, ...updatePayload }));
      setCompletingStepIdx(null);
      setActiveHoldIdx(null);
      setHoldReason("");
      setHoldNote("");
    } catch (error) { 
      showToast("Error updating step status: " + error.message, "error"); 
    } finally { 
      setUpdating(false); 
    }
  };

  const handleCompleteStep = (idx) => {
    const isFinalStep = idx === (localJob.process_sequence?.length || 0) - 1;
    const okQty = Number(qtyOk) || 0;
    const rejQty = Number(qtyReject) || 0;
    
    const extraJobData = {};
    if (isFinalStep) {
      extraJobData.quantity_completed = okQty;
      extraJobData.status = 'completed';
    }

    updateStepStatus(idx, 'completed', { 
      qty_ok: okQty, 
      qty_rejected: rejQty 
    }, extraJobData);

    if (isFinalStep) {
      showToast(`Job Completed! ${okQty.toLocaleString()} pcs finalized for analytics.`, "success");
    }
  };

  const handleFileSelect = (e) => {
    const selected = Array.from(e.target.files);
    const validFiles = [];
    selected.forEach(f => {
      if (f.size > 25 * 1024 * 1024) return showToast(`File ${f.name} exceeds the 25MB limit.`, "error");
      validFiles.push({
        id: Date.now() + Math.random(),
        rawFile: f, name: f.name, category: "Client PO", applies_to: "All Parts", purpose: "", version: "v1", status: "APPROVED", notes: "", url: null, uploaded_at: new Date().toISOString()
      });
    });
    if (validFiles.length > 0) setFiles([...files, ...validFiles]);
    e.target.value = null;
  };

  const handleFileChange = (fileId, field, val) => {
    setFiles(prev => {
      let updated = prev.map(f => f.id === fileId ? { ...f, [field]: val } : f);
      const modifiedFile = updated.find(f => f.id === fileId);
      if (modifiedFile && modifiedFile.status === "APPROVED") {
        updated = updated.map(f => {
          const fAppliesTo = f.applies_to || "All Parts";
          const modAppliesTo = modifiedFile.applies_to || "All Parts";
          const fPurpose = (f.purpose || "").toLowerCase().trim();
          const modPurpose = (modifiedFile.purpose || "").toLowerCase().trim();
          if (f.id !== fileId && f.category === modifiedFile.category && f.status === "APPROVED" && fAppliesTo === modAppliesTo && fPurpose === modPurpose) {
            return { ...f, status: "Superseded" };
          }
          return f;
        });
      }
      return updated;
    });
  };

  const handleRemoveFile = (fileId) => setFiles(files.filter(f => f.id !== fileId));

  const saveJobFiles = async () => {
    setSavingFiles(true);
    try {
      const processedFiles = await Promise.all(files.map(async (fileObj) => {
        if (fileObj.rawFile) {
          const fileExt = fileObj.name.split('.').pop();
          const cleanName = fileObj.name.replace(`.${fileExt}`, '').replace(/[^a-zA-Z0-9]/g, '_');
          const storagePath = `jobs/${localJob.id}/${Date.now()}_${cleanName}.${fileExt}`;
          const storageRef = ref(storage, storagePath);
          await uploadBytes(storageRef, fileObj.rawFile);
          const downloadUrl = await getDownloadURL(storageRef);
          const { rawFile: _rawFile, ...rest } = fileObj; 
          return { ...rest, url: downloadUrl };
        }
        return fileObj; 
      }));
      await updateDoc(doc(db, "jobs", localJob.id), { files: processedFiles });
      setLocalJob(prev => ({ ...prev, files: processedFiles }));
      setFiles(processedFiles);
      showToast("Job files saved successfully!", "success");
    } catch (error) { 
      showToast("Error saving files: " + error.message, "error"); 
    } finally { 
      setSavingFiles(false); 
    }
  };

  const generateClientUpdate = () => {
    const completedNames = localJob.process_sequence.filter(s => s.status === 'completed').map(s => s.process_name.toLowerCase()).join(" and ");
    const currentStep = localJob.process_sequence.find(s => s.status !== 'completed');
    const currentName = currentStep ? currentStep.process_name.toLowerCase() : "final packing";
    const qty = localJob.quantity_target?.toLocaleString() || 0;
    
    const dueDateObj = localJob.deadline ? new Date(localJob.deadline) : null;
    const dateStr = dueDateObj ? dueDateObj.toLocaleDateString("en-GB", { day: 'numeric', month: 'short' }) : 'TBD';
    
    const today = new Date();
    today.setHours(0,0,0,0);
    const isOverdue = dueDateObj && dueDateObj < today;
    const isOnHold = currentStep?.status === 'on_hold';

    const prodName = localJob.product_snapshot?.name || localJob.product?.name || localJob.title;
    let msg = `${localJob.customer} / ${prodName} (${qty} pcs): `;
    if (completedNames) msg += `${completedNames} complete, `;

    if (isOnHold) msg += `currently paused at ${currentName}; revised timeline to follow.`;
    else if (isOverdue) msg += `currently at ${currentName}, dispatch pending (re-evaluating timeline).`;
    else msg += `currently at ${currentName}, on track for dispatch ${dateStr}.`;

    navigator.clipboard.writeText(msg);
    showToast("Client update copied to clipboard!", "success");
  };

  const getApplicableFiles = (category) => {
    const jobFiles = (localJob.files || []).filter(f => f.category === category && f.status === 'APPROVED');
    const prodFiles = liveProductFiles.filter(f => f.category === category && f.status === 'APPROVED');
    const targetPartId = localJob.product?.parts?.find(p => p.part_name === localJob.part_name)?.id;
    const isApplicable = (f) => {
       const scope = f.applies_to || "All Parts";
       return scope === "All Parts" || scope === localJob.part_name || (targetPartId && scope === targetPartId);
    };
    const map = new Map();
    prodFiles.filter(isApplicable).forEach(f => map.set(f.purpose || f.name, f));
    jobFiles.filter(isApplicable).forEach(f => map.set(f.purpose || f.name, f));
    return Array.from(map.values());
  };

  const approvedArtworks = getApplicableFiles('Artwork');
  const approvedDielines = getApplicableFiles('Dieline');

  const copyApprovedFiles = () => {
    const finalFiles = [...approvedArtworks, ...approvedDielines].filter(f => f.url);
    if (finalFiles.length === 0) return showToast("No approved files found for this part to share.", "error");
    const links = finalFiles.map(f => {
       const purposeStr = f.purpose ? `[${f.purpose.toUpperCase()}] ` : '';
       return `${purposeStr}${f.name} (${f.category} - ${f.version}): ${f.url}`;
    }).join("\n\n");
    navigator.clipboard.writeText(`Approved Files for ${localJob.display_id}:\n\n${links}`);
    showToast("File share links copied to clipboard!", "success");
  };

  const totalSteps = localJob.process_sequence?.length || 0;
  const currentActiveIdx = localJob.process_sequence?.findIndex(s => s.status !== 'completed');

  const dueDate = localJob.deadline ? new Date(localJob.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "N/A";
  const jobDate = localJob.job_date ? new Date(localJob.job_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "N/A";
  
  const isMultiPart = localJob.parts_total > 1 || siblings.length > 1;

  const renderQtyMath = () => {
    if (localJob.is_custom_override) return `(${localJob.quantity_target?.toLocaleString()} custom override)`;
    return `(${localJob.active_multiplier || localJob.qty_per_set} per set × ${(localJob.sets_qty || 0).toLocaleString()} sets)`;
  };

  const placeChain = localJob.process_sequence?.map(s => s.assigned_machine_place).filter(p => p && p.trim() !== "").filter((p, i, arr) => i === 0 || p !== arr[i-1]);
  const routeText = placeChain?.length > 0 ? `Route: ${placeChain.join(" → ")}` : "Route: Unassigned";
  const targetPlace = localJob.process_sequence?.find(s => s.assigned_machine_place && s.assigned_machine_place.trim() !== "")?.assigned_machine_place || "Unassigned";

  let preProdChecklist = localJob.product?.materialRows?.length > 0 
    ? [...localJob.product.materialRows]
    : [{ id: 'legacy-1', material_name: localJob.product?.material || "N/A", piece_purpose: localJob.part_name || "Main", size: localJob.specifications?.size_after_cut || localJob.product?.size || "N/A", qty_per_unit: 1, unit: "pcs", gsm: localJob.product?.gsm || "", notes: `Raw: ${localJob.specifications?.size_before_cut || localJob.product?.sheet_size || "N/A"}` }];

  preProdChecklist = preProdChecklist.filter(row => row.isDie || (row.material_name && row.material_name.trim() !== ""));

  const activeDieIds = new Set();
  localJob.process_sequence?.forEach(step => {
     Object.values(step.process_details || {}).forEach(val => {
         const foundDie = dies.find(d => d.dieNumber === val);
         if (foundDie) activeDieIds.add(foundDie.id);
     });
  });
  Array.from(activeDieIds).forEach(id => {
     const d = dies.find(die => die.id === id);
     preProdChecklist.push({ isDie: true, material_name: d.dieName, piece_purpose: d.dieNumber, category: 'Die / Tooling', qty_per_unit: 1, unit: 'pcs', notes: 'Auto-included from routing' });
  });

  const getDaysAtStep = (dateString) => {
    if (!dateString) return 0;
    const diff = new Date() - new Date(dateString);
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const productName = localJob.product_snapshot?.name || localJob.product?.name || "N/A";
  const productSku = localJob.product_snapshot?.sku || localJob.product?.sku || "N/A";
  const isArtworkRequired = localJob.artwork_required ?? localJob.product?.artwork_required ?? true;

  // ⭐️ ROUND 18.1 FIX: Typography and contrast synced for embedded PrintView fallback
  const PrintView = (
    <div id="print-card" className="hidden print:block w-full bg-white text-black font-sans relative text-sm">
      
      {/* HEADER SECTION */}
      <div className="flex justify-between items-start border-b-2 border-black pb-3 mb-2 gap-4">
        
        <div className="w-40 shrink-0 flex items-center">
          {companyLogo ? (
            <img src={companyLogo} alt="Company Logo" className="max-w-full max-h-16 object-contain" />
          ) : (
            <div className="text-xl font-black uppercase tracking-tighter text-black">FACTORY</div>
          )}
        </div>
        
        <div className="flex-1 flex flex-col justify-center border-l-2 border-black pl-4">
          <div className="flex items-center gap-2 mb-0.5">
            <div className="text-[10px] uppercase font-bold bg-black text-white px-2 py-0.5">
              {!localJob.print_count || localJob.print_count <= 1 ? "ORIGINAL" : `REPRINT #${localJob.print_count}`}
            </div>
            <h1 className="text-xl font-black uppercase tracking-tight whitespace-nowrap text-black">
              {isMultiPart ? `SET-${localJob.set_code}` : 'JOB CARD'}
            </h1>
          </div>
          <div className="text-xs font-bold font-mono text-black tracking-tight whitespace-nowrap">
            {localJob.display_id || `JOB-${localJob.id.slice(0, 8).toUpperCase()}`} 
            <span className="mx-2 text-gray-400">|</span> 
            PART {localJob.part_index || 1} OF {localJob.parts_total || siblings.length || 1}: {localJob.part_name || "Main"}
            <span className="mx-2 text-gray-400">|</span> 
            {routeText}
          </div>
        </div>

        <div className="w-[20%] shrink-0 text-right text-xs flex flex-col justify-center space-y-0.5 text-black">
          <div className="whitespace-nowrap"><span className="text-gray-800 uppercase font-bold">Job Date:</span> <span className="font-bold">{jobDate}</span></div>
          <div className="whitespace-nowrap"><span className="text-gray-800 uppercase font-bold">Due Date:</span> <span className="font-bold text-[13px]">{dueDate}</span></div>
          <div className="whitespace-nowrap pt-0.5"><span className="text-gray-800 uppercase font-bold">Priority:</span> <span className="font-bold uppercase border border-black px-1.5 py-0.5 ml-1">{localJob.priority}</span></div>
        </div>
      </div>

      {/* COMPACT METADATA GRID */}
      <div className="flex justify-between items-center bg-gray-100 border-b-2 border-black py-1.5 px-2 mb-3 text-xs uppercase">
        <div><span className="text-gray-800 font-bold">Customer:</span> <span className="font-bold text-black ml-1">{localJob.customer}</span></div>
        <div><span className="text-gray-800 font-bold">Product:</span> <span className="font-bold text-black ml-1">{productName}</span></div>
        <div><span className="text-gray-800 font-bold">SKU:</span> <span className="font-bold text-black ml-1">{productSku}</span></div>
        <div className="flex items-center gap-2">
          <span className="text-gray-800 font-bold">Target Qty:</span> 
          <span className="font-black text-black text-sm">{localJob.quantity_target?.toLocaleString()}</span>
          {isMultiPart && <span className="text-xs text-black font-black normal-case leading-none mt-0.5 ml-2">{renderQtyMath()}</span>}
        </div>
      </div>

      {/* ARTWORK BLOCK */}
      <div className="mb-4 border-2 border-black flex">
        <div className="flex-1 p-2">
          <div className="text-[10px] font-bold uppercase text-gray-800 tracking-wider mb-1">Master Files & Assets</div>
          
          {!isArtworkRequired ? (
            <div className="text-black font-black text-base uppercase tracking-wider mt-1 bg-gray-100 p-2 border border-black inline-block">
              ✓ ARTWORK: NOT REQUIRED (PLAIN / UNPRINTED)
            </div>
          ) : approvedArtworks.length === 0 ? (
            <div className="text-red-600 font-black text-xl uppercase tracking-widest mt-1">
              ⚠️ ARTWORK: NOT APPROVED (DO NOT START)
            </div>
          ) : (
            <div className="space-y-1 mt-2">
              {approvedArtworks.map((art, i) => (
                <div key={`art-${i}`} className="text-sm font-bold text-black">
                  ARTWORK {art.purpose ? `[${art.purpose.toUpperCase()}]` : ''}: {art.name} <span className="text-xs bg-black text-white px-1 ml-1">{art.version}</span>
                </div>
              ))}
              {approvedDielines.map((die, i) => (
                <div key={`die-${i}`} className="text-sm font-bold mt-1 text-black">
                  DIELINE {die.purpose ? `[${die.purpose.toUpperCase()}]` : ''}: {die.name} <span className="text-xs bg-gray-200 px-1 ml-1 border border-black">{die.version}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="w-24 border-l-2 border-black flex flex-col items-center justify-center p-1 bg-gray-50 shrink-0">
          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent('Job-' + localJob.display_id)}&margin=0`} alt="Job QR" className="w-16 h-16" />
          <span className="text-[7px] uppercase font-bold mt-1 text-center leading-tight text-black">Scan for Files<br/>& Updates</span>
        </div>
      </div>

      {/* CHECKLIST TABLE */}
      <div className="font-bold uppercase mb-1 text-xs text-black">Pre-Production Checklist</div>
      <table className="w-full text-left border-collapse border-2 border-black text-xs mb-4">
        <thead>
          <tr className="bg-gray-100 border-b-2 border-black uppercase text-black text-[10px]">
            <th className="border-r-2 border-black p-1.5 w-6 text-center">☐</th>
            <th className="border-r-2 border-black p-1.5">Item / Material Specification</th>
            <th className="border-r-2 border-black p-1.5 w-28">Piece / Purpose</th>
            <th className="border-r-2 border-black p-1.5 w-28">Size</th>
            <th className="border-r-2 border-black p-1.5 w-24 text-center bg-gray-200">Required</th>
            <th className="p-1.5 w-32">Notes</th>
          </tr>
        </thead>
        <tbody className="text-black">
          {preProdChecklist.map((row, i) => {
             let calculatedTotal = 0;
             if (row.isDie) calculatedTotal = 1;
             else {
               const effBasis = row.basis || 'per_piece';
               if (effBasis === 'fixed') calculatedTotal = Number(row.qty_per_unit) || 1;
               else if (effBasis === 'per_step') {
                 const sIdx = row.basis_step_index || 0;
                 const stepQty = localJob.process_sequence?.[sIdx] ? (Number(localJob.process_sequence[sIdx].input_qty) || 0) : (localJob.quantity_target || 0);
                 calculatedTotal = (Number(row.qty_per_unit) || 1) * stepQty;
               } else calculatedTotal = (Number(row.qty_per_unit) || 1) * (localJob.quantity_target || 0);
             }

             let stockFlag = null;
             let displaySpec = row.material_name;
             let displaySize = row.size || "—";
             
             if (!row.isDie) {
                const invItem = inventoryItems.find(inv => {
                  const displayLabel = inv.name || inv.itemName || inv.label || "Unnamed Material";
                  return displayLabel === row.material_name;
                });
                
                if (invItem) {
                   const totalBal = Number(invItem.balance || 0);
                   const resolvedTargetLoc = locations.find(l => l.code === targetPlace);
                   const targetLocId = resolvedTargetLoc ? resolvedTargetLoc.id : targetPlace; 
                   const localBal = Number(invItem.balances?.[targetLocId] || invItem.balances?.[targetPlace] || 0);
                   
                   if (calculatedTotal > totalBal) stockFlag = <span className="ml-1 bg-red-600 text-white px-1.5 py-0.5 rounded text-[8px] font-black tracking-wider">SHORT {calculatedTotal - totalBal}</span>;
                   else if (calculatedTotal > localBal) {
                       const holding = Object.entries(invItem.balances || {}).filter(([, q]) => q > 0).map(([locKey]) => {
                           const matchedLoc = locations.find(l => l.id === locKey || l.code === locKey);
                           return matchedLoc ? matchedLoc.code : locKey;
                       }).join(', ');
                       stockFlag = <span className="ml-1 bg-purple-200 border border-purple-800 text-purple-900 px-1.5 py-0.5 rounded text-[8px] font-black tracking-wider uppercase">TRANSFER TO {targetPlace} (FROM {holding || 'UNASSIGNED'})</span>;
                   } else stockFlag = <span className="ml-1 text-gray-800 text-[8px] font-bold">[OK - {targetPlace}]</span>;

                   const rawName = row.material_name.split('·')[0].trim();
                   const isBoard = row.category === 'board' || row.category === 'rigid';
                   const gsmThick = isBoard ? `${row.thickness_mm || '?'} mm` : `${row.gsm || '?'} GSM`;
                   const brand = invItem.details?.Brand || invItem.details?.Mill;
                   
                   displaySpec = brand ? `${rawName} (${brand}) · ${gsmThick}` : `${rawName} · ${gsmThick}`;
                   if (!row.size && invItem.details?.Size) displaySize = invItem.details.Size;
                }
             }

             return (
               <tr key={i} className="border-b border-black">
                 <td className="border-r-2 border-black p-1.5 text-center text-lg font-bold text-black">☐</td>
                 <td className="border-r-2 border-black p-1.5 font-bold text-[13px] text-black">{displaySpec} {stockFlag}</td>
                 <td className="border-r-2 border-black p-1.5 font-bold uppercase text-black">{row.piece_purpose}</td>
                 <td className="border-r-2 border-black p-1.5 font-mono text-[11px] text-black">{displaySize}</td>
                 <td className="border-r-2 border-black p-1.5 text-center font-bold text-sm bg-gray-50 text-black">{row.isDie ? '—' : `${calculatedTotal.toLocaleString()} ${row.unit || 'pcs'}`}</td>
                 <td className="p-1.5 text-[10px] leading-tight text-black">{row.notes || '—'}</td>
               </tr>
             );
          })}
        </tbody>
      </table>

      {issuedMaterials.length > 0 && (
        <div className="mb-4 text-xs">
          <span className="font-bold uppercase border-b border-black pb-0.5 mr-3 text-black">Materials Issued (Inventory):</span>
          {issuedMaterials.map(mat => (
            <span key={mat.id} className="mr-4 inline-block font-medium text-black">
              {mat.itemName} — <span className="font-bold">{Math.abs(mat.qty).toLocaleString()}</span> <span className="text-[9px] text-gray-800">({mat.date})</span>
            </span>
          ))}
        </div>
      )}

      {/* ROUTING TABLE */}
      <div className="font-bold uppercase mb-1 text-xs text-black">Process Routing & Sign-offs</div>
      <table id="routing-table" className="w-full text-left border-collapse border-2 border-black text-xs mb-4">
        <thead>
          <tr className="bg-gray-100 border-b-2 border-black text-[10px] uppercase text-black">
            <th className="border-r-2 border-black p-1.5 w-6 text-center">#</th>
            <th className="border-r-2 border-black p-1.5">Process & Specifications</th>
            <th className="border-r-2 border-black p-1.5 w-24">Machine/Loc</th>
            <th className="border-r-2 border-black p-1.5 w-14 text-center leading-tight">Qty<br/>In</th>
            <th className="border-r-2 border-black p-1.5 w-14 text-center leading-tight">Exp.<br/>Out</th>
            <th className="border-r-2 border-black p-1.5 w-16 text-center leading-tight">Act.<br/>Out</th>
            <th className="border-r-2 border-black p-1 w-14 text-center leading-tight text-[8px] bg-gray-200">1st<br/>Piece<br/>OK</th>
            <th className="p-1.5 w-32 text-center">Operator Sign / Date</th>
          </tr>
        </thead>
        <tbody className="text-black">
          {localJob.process_sequence?.map((step, idx, arr) => {
            const prevStep = idx > 0 ? arr[idx-1] : null;
            const prevPlace = prevStep?.assigned_machine_place;
            const currPlace = step.assigned_machine_place;
            const isTransfer = prevPlace && currPlace && prevPlace !== currPlace;
            
            const expectedFromPrev = prevStep ? (prevStep.output_qty ?? localJob.quantity_target) : null;
            const currentIn = step.input_qty ?? localJob.quantity_target;
            const isChainBreak = prevStep && expectedFromPrev !== currentIn;

            return (
              <Fragment key={idx}>
                {isTransfer && (
                  <tr className="bg-gray-200 border-b border-black print:table-row">
                    <td colSpan="9" className="p-0.5 text-center text-[9px] font-black uppercase tracking-widest text-black">
                      ↓ TRANSFER TO {currPlace} ↓
                    </td>
                  </tr>
                )}
                {isChainBreak && (
                  <tr className="bg-red-100 border-b border-black print:table-row">
                    <td colSpan="9" className="p-1 text-center text-[10px] font-black uppercase tracking-widest text-red-700">
                      ⚠️ WARNING: Step {idx} expected {expectedFromPrev?.toLocaleString()} out, but Step {idx+1} is receiving {currentIn?.toLocaleString()} in.
                    </td>
                  </tr>
                )}
                <tr className="border-b border-black">
                  <td className="border-r-2 border-black p-1.5 text-center font-bold align-top text-black">{idx + 1}</td>
                  <td className="border-r-2 border-black p-1.5 align-top">
                    <span className="font-bold text-[13px] uppercase text-black">{step.process_name}</span>
                    {step.remarks && (
                      <div className="mt-1.5 bg-gray-200 p-1.5 border border-black text-[11px] font-bold text-black whitespace-pre-wrap leading-tight">
                        <span className="text-[9px] uppercase font-black mr-1 text-gray-800 block mb-0.5">Remarks:</span>
                        {step.remarks.replace(/ \| /g, '\n')}
                      </div>
                    )}
                  </td>
                  <td className="border-r-2 border-black p-1.5 align-top">
                    <div className="font-bold text-[10px] leading-tight text-black">{step.assigned_machine_name || "Any"}</div>
                    {currPlace && <div className="text-[9px] text-black font-mono font-bold mt-0.5">{currPlace}</div>}
                  </td>
                  <td className="border-r-2 border-black p-1.5 text-center align-top font-bold text-black">{step.input_qty?.toLocaleString() || localJob.quantity_target?.toLocaleString()}</td>
                  <td className="border-r-2 border-black p-1.5 text-center align-top font-bold text-black">{step.output_qty?.toLocaleString() || localJob.quantity_target?.toLocaleString()}</td>
                  <td className="border-r-2 border-black p-1.5 text-center align-bottom border-b border-dashed border-gray-400 pb-2"></td>
                  <td className="border-r-2 border-black p-1.5 text-center align-bottom bg-gray-50 border-b border-dashed border-gray-400"></td>
                  <td className="p-1.5 align-bottom border-b border-dashed border-gray-400"></td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>

      {localJob.notes && (
        <div className="border border-black p-3 mb-4 bg-gray-50 text-black">
          <h3 className="text-[10px] font-bold text-gray-800 uppercase mb-1">Special Instructions / Notes</h3>
          <p className="text-sm whitespace-pre-wrap font-bold">{localJob.notes}</p>
        </div>
      )}

      {/* FOOTER */}
      <div className="flex justify-between items-stretch border-2 border-black mt-auto text-black">
        <div className="p-2 flex-1 border-r-2 border-black bg-gray-50">
          <div className="text-[10px] font-bold uppercase mb-1">Linked Cards in Set {isMultiPart ? `(SET-${localJob.set_code})` : ''}</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {siblings.map(sib => (
              <div key={sib.id} className="text-[9px] font-bold uppercase flex justify-between">
                <span>Part {sib.part_index}: {sib.part_name} - {sib.quantity_target?.toLocaleString()} pcs</span>
                <span className={sib.id === localJob.id ? 'text-black' : 'text-gray-800'}>{sib.id === localJob.id ? '[THIS CARD]' : sib.status}</span>
              </div>
            ))}
            {!isMultiPart && <div className="text-[9px] text-gray-800 italic font-bold">Single job card. No siblings.</div>}
          </div>
        </div>
        <div className="w-64 p-2 flex flex-col shrink-0">
          <div className="text-[10px] font-bold uppercase mb-4 text-center text-black">Supervisor Sign / Date</div>
          <div className="mt-auto border-b border-black w-full"></div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <style type="text/css" media="print">
        {`
          @page { size: A4 portrait; margin: 12mm; }
          #root { display: none !important; }
          body *:not(#print-card):not(#print-card *) { display: none !important; }
          #print-card { display: block !important; position: static !important; height: auto !important; overflow: visible !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; padding: 0; background: white; color: black; }
          * { box-sizing: border-box; }
          tr { page-break-inside: avoid !important; }
          thead { display: table-header-group !important; }
          #routing-table td { min-height: 16mm; height: 16mm; }
          h1, h2, h3 { page-break-after: avoid !important; }
        `}
      </style>

      {toast.show && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-full shadow-2xl font-bold text-sm flex items-center gap-2 animate-fade-in ${toast.type === "error" ? "bg-red-600 text-white border border-red-500" : "bg-gray-800 text-white border border-gray-700"}`}>
          {toast.type === "error" ? "⚠️" : "✓"} {toast.msg}
        </div>
      )}

      {PrintView}

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm print:hidden">
        <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-6xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
          
          <div className="bg-[#151724] p-6 border-b border-gray-800 shrink-0">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="bg-primary-500/20 text-primary-400 px-2 py-0.5 rounded text-xs font-mono font-bold uppercase tracking-wider">
                    {localJob.display_id || `JOB-${localJob.id.slice(0, 8).toUpperCase()}`}
                  </span>
                  <span className="bg-gray-800 text-gray-300 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border border-gray-700">
                    {routeText}
                  </span>
                  {isMultiPart && <span className="bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ml-1">Part {localJob.part_index} of {localJob.parts_total || siblings.length}</span>}
                  
                  {/* Print Indicator Badge */}
                  {localJob.print_count > 0 && (
                    <span className="bg-blue-900/40 text-blue-400 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ml-2 border border-blue-500/30">
                      Printed {localJob.print_count}x
                    </span>
                  )}
                </div>
                <h2 className="text-2xl font-bold text-white">{localJob.title || productName}</h2>
                <p className="text-gray-400 text-sm mt-1">{localJob.customer || "No Customer"} | {productSku} {isMultiPart ? `| ${localJob.part_name}` : ""}</p>
              </div>
              
              <div className="flex gap-2">
                <button onClick={generateClientUpdate} className="text-[10px] uppercase font-bold text-green-400 hover:text-white bg-green-900/20 px-3 py-2 rounded-lg border border-green-500/30 transition-colors">
                  Copy Client Update
                </button>
                <button onClick={copyApprovedFiles} className="text-[10px] uppercase font-bold text-blue-400 hover:text-white bg-blue-900/20 px-3 py-2 rounded-lg border border-blue-500/30 transition-colors">
                  Copy Files Link
                </button>
                <button onClick={handlePrint} className="text-gray-400 hover:text-white p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors ml-2" title="Print / Download PDF">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                </button>
                <button onClick={onClose} className="text-gray-400 hover:text-white p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            <div className="mt-6">
              <div className="flex justify-between items-end mb-2">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Production Routing</span>
                {currentActiveIdx !== -1 && currentActiveIdx < totalSteps && (
                   <span className="text-[10px] text-primary-400 font-mono bg-primary-900/20 px-2 py-0.5 rounded border border-primary-500/30">
                     At current step since: {getDaysAtStep(localJob.process_sequence[currentActiveIdx].status_updated_at || localJob.process_sequence[currentActiveIdx].started_at)} days
                   </span>
                )}
              </div>
              <div className="flex items-center gap-1 overflow-x-auto pb-2 custom-scrollbar">
                {localJob.process_sequence?.map((step, idx) => {
                  const isCurrent = idx === currentActiveIdx;
                  let colorClass = "bg-gray-800 text-gray-500 border-gray-700"; 
                  let dot = "·";
                  if (step.status === 'completed') { colorClass = "bg-green-500/20 text-green-400 border-green-500/30"; dot = "✓"; }
                  else if (step.status === 'in_progress') { colorClass = "bg-blue-500/20 text-blue-400 border-blue-500/30"; dot = "▶"; }
                  else if (step.status === 'on_hold') { colorClass = "bg-orange-500/20 text-orange-400 border-orange-500/30"; dot = "⏸"; }

                  return (
                    <Fragment key={idx}>
                      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-bold uppercase whitespace-nowrap ${colorClass} ${isCurrent ? 'ring-1 ring-white/20' : 'opacity-70'}`}>
                        <span>{dot}</span> {step.process_name}
                      </div>
                      {idx < totalSteps - 1 && <div className="h-px w-4 bg-gray-700 shrink-0"></div>}
                    </Fragment>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-[#0a0f1a] space-y-6">
            
            {/* ⭐️ ROUND 10 ITEM B1: Show Special Instructions prominently on UI */}
            {localJob.notes && (
               <div className="bg-gray-950 p-4 border-l-4 border-primary-500 rounded-r-lg shadow-lg">
                  <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Special Instructions / Notes</h3>
                  <p className="text-sm text-gray-200 whitespace-pre-wrap font-medium">{localJob.notes}</p>
               </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider flex justify-between">
                  <span>Pre-Production Checklist</span>
                  <span className="text-primary-500">Target: {localJob.quantity_target?.toLocaleString()} Sets</span>
                </h3>
                <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-gray-950 text-gray-500 border-b border-gray-800 uppercase">
                        <th className="p-3 font-bold">Material / Item</th>
                        <th className="p-3 font-bold">Piece</th>
                        <th className="p-3 font-bold text-center">Req.</th>
                        <th className="p-3 font-bold text-center">Stock Check</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {preProdChecklist.map((row, i) => {
                         let calculatedTotal = 0;
                         if (row.isDie) calculatedTotal = 1;
                         else {
                           const effBasis = row.basis || 'per_piece';
                           if (effBasis === 'fixed') calculatedTotal = Number(row.qty_per_unit) || 1;
                           else if (effBasis === 'per_step') {
                             const sIdx = row.basis_step_index || 0;
                             const stepQty = localJob.process_sequence?.[sIdx] ? (Number(localJob.process_sequence[sIdx].input_qty) || 0) : (localJob.quantity_target || 0);
                             calculatedTotal = (Number(row.qty_per_unit) || 1) * stepQty;
                           } else calculatedTotal = (Number(row.qty_per_unit) || 1) * (localJob.quantity_target || 0);
                         }

                         let stockDisplay = <span className="text-gray-500">—</span>;
                         
                         if (!row.isDie) {
                            const invItem = inventoryItems.find(inv => {
                              const displayLabel = inv.name || inv.itemName || inv.label || "Unnamed Material";
                              return displayLabel === row.material_name;
                            });
                            
                            if (invItem) {
                               const totalBal = Number(invItem.balance || 0);
                               const resolvedTargetLoc = locations.find(l => l.code === targetPlace);
                               const targetLocId = resolvedTargetLoc ? resolvedTargetLoc.id : targetPlace; 
                               const localBal = Number(invItem.balances?.[targetLocId] || invItem.balances?.[targetPlace] || 0);
                               
                               if (calculatedTotal > totalBal) {
                                   stockDisplay = (
                                     <div className="flex flex-col items-center gap-1">
                                       <span className="px-2 py-0.5 rounded font-bold uppercase bg-red-500/20 text-red-400 text-[10px]">SHORT {calculatedTotal - totalBal}</span>
                                       <span className="text-[9px] text-gray-500">Total: {totalBal}</span>
                                     </div>
                                   );
                               } else if (calculatedTotal > localBal) {
                                   const holding = Object.entries(invItem.balances || {}).filter(([, q]) => q > 0).map(([locKey]) => {
                                        const matchedLoc = locations.find(l => l.id === locKey || l.code === locKey);
                                        return matchedLoc ? matchedLoc.code : locKey;
                                     }).join(', ');

                                   stockDisplay = (
                                     <div className="flex flex-col items-center gap-1 text-center">
                                       <span className="px-2 py-0.5 rounded font-bold uppercase bg-purple-500/20 text-purple-400 text-[9px] leading-tight border border-purple-500/30 shadow-lg shadow-purple-900/20">TRANSFER REQ</span>
                                       <span className="text-[9px] text-gray-400">Need at {targetPlace}</span>
                                       <span className="text-[8px] text-gray-500">Stock at: {holding || 'Unassigned'}</span>
                                     </div>
                                   );
                               } else {
                                   stockDisplay = <span className="px-2 py-0.5 rounded font-bold uppercase bg-green-500/10 text-green-400 text-[10px]">OK ({localBal} at {targetPlace})</span>;
                               }
                            }
                         } else stockDisplay = <span className="text-purple-400 font-bold uppercase text-[10px]">Tooling</span>;

                         return (
                           <tr key={i} className="hover:bg-gray-800/50">
                             <td className="p-3 font-bold text-white truncate max-w-[120px]" title={row.material_name}>{row.material_name}</td>
                             <td className="p-3 text-gray-300 font-medium uppercase truncate max-w-[80px]" title={row.piece_purpose}>{row.piece_purpose}</td>
                             <td className="p-3 text-center font-bold text-primary-400">{row.isDie ? '—' : `${calculatedTotal.toLocaleString()}`}</td>
                             <td className="p-3 text-center align-middle">{stockDisplay}</td>
                           </tr>
                         );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">Job Activity Log</h3>
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 h-[220px] overflow-y-auto custom-scrollbar space-y-3">
                  {localJob.activity_log?.length > 0 ? localJob.activity_log.map((log) => (
                    <div key={log.id || log.timestamp} className="flex gap-3 text-xs border-l-2 border-gray-700 pl-3 py-1">
                      <div className="w-12 shrink-0 text-gray-500 font-mono mt-0.5">
                         {new Date(log.timestamp).toLocaleDateString("en-GB", { day: 'numeric', month: 'short' })}
                      </div>
                      <div>
                        <div className="font-bold text-white mb-0.5">{log.process_name}: {log.new_status.replace('_', ' ').toUpperCase()}</div>
                        <div className="text-[10px] text-gray-400">By {log.actor || 'System'}</div>
                        {log.reason && <div className="text-orange-400 font-bold mt-1 bg-orange-950/20 px-2 py-1 rounded inline-block border border-orange-900/30">Reason: {log.reason}</div>}
                        {log.note && <div className="text-gray-300 mt-1 italic">"{log.note}"</div>}
                      </div>
                    </div>
                  )) : (
                    <div className="text-center text-gray-500 text-xs py-8">No activity logged yet.</div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-lg">
              <div className="bg-[#151724] border-b border-gray-800 p-4 flex justify-between items-center">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <svg className="w-4 h-4 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                  Job-Specific Files & Run Assets
                </h3>
                <div className="flex gap-3">
                  <label className="bg-gray-800 hover:bg-gray-700 text-white text-xs font-bold px-4 py-2 rounded cursor-pointer border border-gray-700 transition-colors">
                    + Attach File
                    <input type="file" multiple accept=".pdf,.ai,.cdr,.eps,.psd,.jpg,.jpeg,.png,.xlsx,.docx" className="hidden" onChange={handleFileSelect} />
                  </label>
                  <button onClick={saveJobFiles} disabled={savingFiles} className="bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded transition-colors shadow-lg">
                    {savingFiles ? "Saving..." : "Save Job Files"}
                  </button>
                </div>
              </div>
              {files.length > 0 ? (
                <div className="p-4 overflow-x-auto">
                  <table className="w-full text-left min-w-[800px]">
                    <thead>
                      <tr className="bg-gray-950 text-[10px] uppercase text-gray-500 border-b border-gray-800">
                        <th className="p-2 font-bold min-w-[150px]">File Name</th>
                        <th className="p-2 font-bold w-36">Category</th>
                        <th className="p-2 font-bold w-32">Applies To</th>
                        <th className="p-2 font-bold w-28">Purpose Label</th>
                        <th className="p-2 font-bold w-20">Version</th>
                        <th className="p-2 font-bold w-36">Status</th>
                        <th className="p-2 font-bold">Notes</th>
                        <th className="p-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800 bg-gray-950/50">
                      {files.map((file) => {
                        const isSuperseded = file.status === "Superseded";
                        return (
                          <tr key={file.id} className={isSuperseded ? "opacity-50" : ""}>
                            <td className="p-2 text-xs text-white truncate max-w-[150px]" title={file.name}>
                              <span className={isSuperseded ? "line-through text-gray-500" : ""}>{file.name}</span>
                              {file.rawFile && <span className="ml-2 text-[9px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded uppercase font-bold">Unsaved</span>}
                            </td>
                            <td className="p-2">
                              <select value={file.category} onChange={e => handleFileChange(file.id, 'category', e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white">
                                <option value="Client PO">Client PO</option>
                                <option value="Artwork">Artwork</option>
                                <option value="Dieline">Dieline</option>
                                <option value="Sample Photo">Sample Photo</option>
                                <option value="Quality Reference">Quality Reference</option>
                                <option value="Other">Other</option>
                              </select>
                            </td>
                            <td className="p-2">
                              <select value={file.applies_to || "All Parts"} onChange={e => handleFileChange(file.id, 'applies_to', e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white">
                                <option value="All Parts">All Parts</option>
                                {localJob.product?.parts?.map((p, idx) => (
                                  <option key={p.id || idx} value={p.id || p.part_name}>Part {String.fromCharCode(65 + idx)}: {p.part_name}</option>
                                ))}
                              </select>
                            </td>
                            <td className="p-2">
                              <input type="text" placeholder="e.g. Inner" value={file.purpose || ""} onChange={e => handleFileChange(file.id, 'purpose', e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white" />
                            </td>
                            <td className="p-2">
                              <input type="text" placeholder="v1" value={file.version} onChange={e => handleFileChange(file.id, 'version', e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white" />
                            </td>
                            <td className="p-2">
                              <select value={file.status} onChange={e => handleFileChange(file.id, 'status', e.target.value)} className={`w-full bg-gray-900 border rounded px-2 py-1 text-xs font-bold ${file.status === 'APPROVED' ? 'border-green-500/50 text-green-400' : 'border-gray-700 text-white'}`}>
                                <option value="APPROVED">APPROVED</option>
                                <option value="Draft">Draft</option>
                                <option value="Superseded">Superseded</option>
                              </select>
                            </td>
                            <td className="p-2">
                              <input type="text" placeholder="Optional notes..." value={file.notes} onChange={e => handleFileChange(file.id, 'notes', e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-white" />
                            </td>
                            <td className="p-2 text-center">
                              <button type="button" onClick={() => handleRemoveFile(file.id)} className="text-gray-600 hover:text-red-400 font-bold text-xs">✕</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-6 text-center text-sm text-gray-500">
                  No job-specific files. (Master product artwork is linked automatically).
                </div>
              )}
            </div>

            <div>
              <h3 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">Process Routing & Status Control</h3>
              <div className="space-y-3">
                {localJob.process_sequence?.map((step, idx, arr) => {
                  const status = step.status || 'pending';
                  const isCompleted = status === 'completed';
                  const isInProgress = status === 'in_progress';
                  const isOnHold = status === 'on_hold';
                  
                  const isFinalStep = idx === arr.length - 1;

                  const prevStep = idx > 0 ? arr[idx-1] : null;
                  const prevPlace = prevStep?.assigned_machine_place;
                  const currPlace = step.assigned_machine_place;
                  const isTransfer = prevPlace && currPlace && prevPlace !== currPlace;

                  const expectedFromPrev = prevStep ? (prevStep.output_qty ?? localJob.quantity_target) : null;
                  const currentIn = step.input_qty ?? localJob.quantity_target;
                  const isChainBreak = prevStep && expectedFromPrev !== currentIn;

                  return (
                    <Fragment key={idx}>
                      {isTransfer && (
                        <div className="flex items-center justify-center my-1.5">
                          <div className="bg-gray-800 border border-gray-700 text-gray-300 text-[10px] font-bold uppercase tracking-widest px-4 py-1.5 rounded-full shadow-lg">
                            → SEND OUT: {prevPlace} → {currPlace}
                          </div>
                        </div>
                      )}
                      {isChainBreak && (
                        <div className="flex items-center justify-center my-1.5">
                          <div className="bg-red-900/30 border border-red-500/50 text-red-400 text-[10px] font-bold uppercase tracking-widest px-4 py-1.5 rounded shadow-lg">
                            ⚠️ QTY MISMATCH: Received {currentIn?.toLocaleString()} (Expected {expectedFromPrev?.toLocaleString()})
                          </div>
                        </div>
                      )}
                      <div className={`p-4 rounded-lg border flex flex-col gap-3 transition-colors ${
                        isCompleted ? 'bg-green-950/20 border-green-900/30' : 
                        isInProgress ? 'bg-blue-950/20 border-blue-900/40' : 
                        isOnHold ? 'bg-orange-950/20 border-orange-900/40' : 
                        'bg-gray-900 border-gray-800'
                      }`}>
                        <div className="flex items-center gap-4 w-full">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                            isCompleted ? 'bg-green-500/20 text-green-400' : 
                            isInProgress ? 'bg-blue-500/20 text-blue-400' : 
                            isOnHold ? 'bg-orange-500/20 text-orange-400' : 
                            'bg-gray-800 text-gray-500'
                          }`}>
                            {idx + 1}
                          </div>
                          
                          <div className="flex-1">
                            <div className="text-white font-bold">{step.process_name}</div>
                            <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                              {step.assigned_machine_name || 'Unassigned Machine'}
                              {currPlace && <span className="px-1.5 py-0.5 bg-gray-800 rounded font-mono text-[9px] text-gray-400 border border-gray-700">Place: {currPlace}</span>}
                            </div>
                            <div className="text-[11px] text-gray-400 font-mono mt-1">
                              In: {step.input_qty?.toLocaleString() || localJob.quantity_target} → Out: {step.output_qty?.toLocaleString() || localJob.quantity_target}
                            </div>
                          </div>
                          
                          <div className="text-right flex flex-wrap justify-end gap-2 max-w-[200px]">
                            {status === 'pending' && (
                              <button onClick={() => updateStepStatus(idx, 'in_progress')} disabled={updating} className="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded shadow-lg transition-colors disabled:opacity-50">
                                Start Step
                              </button>
                            )}

                            {isInProgress && completingStepIdx !== idx && activeHoldIdx !== idx && (
                              <>
                                <button onClick={() => setActiveHoldIdx(idx)} className="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors">
                                  Hold
                                </button>
                                <button onClick={() => { setCompletingStepIdx(idx); setQtyOk(step.output_qty || localJob.quantity_target || ""); setQtyReject("0"); }} className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 text-white rounded shadow-lg transition-colors ${isFinalStep ? 'bg-purple-600 hover:bg-purple-500' : 'bg-green-600 hover:bg-green-500'}`}>
                                  {isFinalStep ? 'Final Reconcile' : 'Complete'}
                                </button>
                              </>
                            )}

                            {isOnHold && (
                              <button onClick={() => updateStepStatus(idx, 'in_progress')} disabled={updating} className="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded shadow-lg transition-colors disabled:opacity-50">
                                Resume Step
                              </button>
                            )}

                            {isCompleted && <span className="inline-block px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-green-500/20 text-green-400">Completed</span>}
                          </div>
                        </div>

                        {activeHoldIdx === idx && (
                          <div className="mt-2 bg-gray-950 p-4 rounded-lg border border-orange-500/30 ml-12 animate-fade-in">
                            <h4 className="text-xs font-bold text-orange-400 mb-3 uppercase tracking-wider">Put Step On Hold</h4>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">Reason</label>
                                <select value={holdReason} onChange={e => setHoldReason(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-orange-500 outline-none">
                                  <option value="">-- Select Reason --</option>
                                  <option value="Material short">Material short</option>
                                  <option value="Machine breakdown">Machine breakdown</option>
                                  <option value="Awaiting approval">Awaiting approval</option>
                                  <option value="Awaiting client">Awaiting client</option>
                                  <option value="Quality issue">Quality issue</option>
                                  <option value="Other">Other</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">Details (Optional)</label>
                                <input type="text" value={holdNote} onChange={e => setHoldNote(e.target.value)} placeholder="Elaborate..." className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-orange-500 outline-none" />
                              </div>
                            </div>
                            <div className="flex gap-2 mt-4 justify-end">
                              <button onClick={() => {setActiveHoldIdx(null); setHoldReason("");}} className="px-4 py-2 text-xs font-bold text-gray-400 hover:text-white bg-gray-800 rounded transition-colors">Cancel</button>
                              <button onClick={() => updateStepStatus(idx, 'on_hold', { hold_reason: holdReason, hold_note: holdNote })} disabled={updating || !holdReason} className="px-4 py-2 text-xs font-bold text-white bg-orange-600 hover:bg-orange-500 rounded transition-colors disabled:opacity-50">Confirm Hold</button>
                            </div>
                          </div>
                        )}

                        {completingStepIdx === idx && (
                          <div className={`mt-2 bg-gray-950 p-4 rounded-lg border ${isFinalStep ? 'border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.15)]' : 'border-green-500/30'} ml-12 animate-fade-in`}>
                            <h4 className={`text-xs font-bold uppercase tracking-wider mb-2 ${isFinalStep ? 'text-purple-400' : 'text-green-400'}`}>
                              {isFinalStep ? `🎉 Final Step Reconciliation: ${step.process_name}` : `Complete Process: ${step.process_name}`}
                            </h4>
                            {isFinalStep && (
                              <p className="text-[10px] text-gray-400 mb-4 leading-relaxed max-w-2xl">
                                This is the final process route. Submitting these numbers will permanently lock the active job card and log the "Qty OK" directly into your Analytics performance charts as completed product.
                              </p>
                            )}
                            <div className="flex items-end gap-4">
                              <div className="flex-1"><label className={`block text-[10px] uppercase font-bold mb-1 ${isFinalStep ? 'text-purple-300' : 'text-gray-500'}`}>Qty OK (Usable)</label><input type="number" value={qtyOk} onChange={e => setQtyOk(e.target.value)} className={`w-full bg-gray-900 border rounded px-3 py-2 text-sm text-white outline-none ${isFinalStep ? 'border-purple-500/50 focus:border-purple-400' : 'border-gray-700'}`} /></div>
                              <div className="flex-1"><label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">Qty Rejected (Wastage)</label><input type="number" value={qtyReject} onChange={e => setQtyReject(e.target.value)} className="w-full bg-gray-900 border border-red-900/50 rounded px-3 py-2 text-sm text-white focus:border-red-500 outline-none" /></div>
                              <div className="flex gap-2">
                                <button onClick={() => setCompletingStepIdx(null)} className="px-4 py-2 text-xs font-bold text-gray-400 hover:text-white bg-gray-800 rounded transition-colors">Cancel</button>
                                <button onClick={() => handleCompleteStep(idx)} disabled={updating} className={`px-4 py-2 text-xs font-bold text-white rounded transition-colors disabled:opacity-50 ${isFinalStep ? 'bg-purple-600 hover:bg-purple-500 shadow-lg shadow-purple-900/20' : 'bg-green-600 hover:bg-green-500'}`}>{updating ? "Saving..." : (isFinalStep ? "Finalize & Log" : "Confirm")}</button>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {isCompleted && (
                          <div className="ml-12 mt-1 flex gap-4 text-xs font-mono">
                            <span className="text-green-400 bg-green-400/10 px-2 py-0.5 rounded">OK: {step.qty_ok?.toLocaleString() || 0}</span>
                            {step.qty_rejected > 0 && <span className="text-red-400 bg-red-400/10 px-2 py-0.5 rounded">REJECT: {step.qty_rejected?.toLocaleString()}</span>}
                            {step.completed_at && <span className="text-gray-500">Done: {new Date(step.completed_at).toLocaleDateString("en-GB", { day: 'numeric', month: 'short' })}</span>}
                          </div>
                        )}
                      </div>
                    </Fragment>
                  );
                })}
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}