import { useState, useEffect, Fragment } from "react";
import { createPortal } from "react-dom";
import { collection, query, where, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase/config";

export default function JobViewModal({ job, onClose }) {
  const [localJob, setLocalJob] = useState(job);
  const [siblings, setSiblings] = useState([]);
  const [issuedMaterials, setIssuedMaterials] = useState([]); 
  
  const [completingStepIdx, setCompletingStepIdx] = useState(null);
  const [qtyOk, setQtyOk] = useState("");
  const [qtyReject, setQtyReject] = useState("");
  
  // ⭐️ ROUND 8: Hold Status States
  const [activeHoldIdx, setActiveHoldIdx] = useState(null);
  const [holdReason, setHoldReason] = useState("");
  const [holdNote, setHoldNote] = useState("");
  
  const [updating, setUpdating] = useState(false);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [dies, setDies] = useState([]);

  useEffect(() => {
    const fetchDependencies = async () => {
      try {
        const invSnap = await getDocs(collection(db, "inventoryItems"));
        setInventoryItems(invSnap.docs.map(d => ({id: d.id, ...d.data()})));
        const dieSnap = await getDocs(collection(db, "dies"));
        setDies(dieSnap.docs.map(d => ({id: d.id, ...d.data()})));
      } catch (err) { console.error("Failed to fetch dependencies", err); }
    };
    fetchDependencies();
  }, []);

  useEffect(() => {
    if (localJob?.set_code) {
      const fetchSiblings = async () => {
        try {
          const q = query(collection(db, "jobs"), where("set_code", "==", localJob.set_code));
          const snap = await getDocs(q);
          const sibs = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.part_index - b.part_index);
          setSiblings(sibs);
        } catch (error) { console.error("Failed to fetch sibling cards:", error); }
      };
      fetchSiblings();
    }
  }, [localJob]);

  useEffect(() => {
    if (!localJob?.id) return;
    const fetchMaterials = async () => {
      try {
        const q = query(collection(db, "inventoryTransactions"), where("job_ref_id", "==", localJob.id), where("type", "==", "out"));
        const snap = await getDocs(q);
        const materials = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setIssuedMaterials(materials);
      } catch (err) { console.error("Failed to fetch issued materials:", err); }
    };
    fetchMaterials();
  }, [localJob?.id]);

  if (!localJob) return null;

  const handlePrint = () => window.print();

  // ⭐️ ROUND 8: Centralized Step Status Logic (Ready for WhatsApp Automation Phase)
  const updateStepStatus = async (idx, newStatus, extraData = {}) => {
    setUpdating(true);
    try {
      const updatedSequence = [...localJob.process_sequence];
      const currentStep = updatedSequence[idx];
      const now = new Date().toISOString();
      const actor = "Ops Coordinator"; // Will be dynamic when user roles are added

      updatedSequence[idx] = {
        ...currentStep,
        status: newStatus,
        status_updated_at: now,
        ...extraData
      };

      if (newStatus === 'in_progress' && !currentStep.started_at) {
        updatedSequence[idx].started_at = now;
      }
      if (newStatus === 'completed') {
        updatedSequence[idx].completed_at = now;
      }

      const logEntry = {
        id: Date.now().toString(),
        step_index: idx,
        process_name: currentStep.process_name,
        old_status: currentStep.status || 'pending',
        new_status: newStatus,
        timestamp: now,
        actor: actor,
        reason: extraData.hold_reason || null,
        note: extraData.hold_note || null
      };

      const newLog = [logEntry, ...(localJob.activity_log || [])]; // Newest first
      const allCompleted = updatedSequence.every(s => s.status === "completed");
      const newJobStatus = allCompleted ? "completed" : "in_progress";

      await updateDoc(doc(db, "jobs", localJob.id), { 
        process_sequence: updatedSequence, 
        status: newJobStatus,
        activity_log: newLog
      });

      setLocalJob(prev => ({ ...prev, process_sequence: updatedSequence, status: newJobStatus, activity_log: newLog }));
      setCompletingStepIdx(null);
      setActiveHoldIdx(null);
      setHoldReason("");
      setHoldNote("");
    } catch (error) { 
      alert("Error updating step status: " + error.message); 
    } finally { 
      setUpdating(false); 
    }
  };

  const handleCompleteStep = (idx) => {
    updateStepStatus(idx, 'completed', { 
      qty_ok: Number(qtyOk) || 0, 
      qty_rejected: Number(qtyReject) || 0 
    });
  };

  // ⭐️ ROUND 8: Copy Client Update Generator
  const generateClientUpdate = () => {
    const completedNames = localJob.process_sequence
      .filter(s => s.status === 'completed')
      .map(s => s.process_name.toLowerCase())
      .join(" and ");
      
    const currentStep = localJob.process_sequence.find(s => s.status !== 'completed');
    const currentName = currentStep ? currentStep.process_name.toLowerCase() : "final packing";
    const qty = localJob.quantity_target?.toLocaleString() || 0;
    const dateStr = localJob.deadline ? new Date(localJob.deadline).toLocaleDateString("en-GB", { day: 'numeric', month: 'short' }) : 'TBD';

    let msg = `${localJob.customer} / ${localJob.product?.name || localJob.title} (${qty} pcs): `;
    if (completedNames) msg += `${completedNames} complete, `;
    msg += `currently at ${currentName}, on track for dispatch ${dateStr}.`;

    navigator.clipboard.writeText(msg);
    alert("Client update copied to clipboard!\n\n" + msg);
  };

  // ⭐️ ROUND 8: Copy Approved Files Generator
  const copyApprovedFiles = () => {
    const approvedFiles = (localJob.product?.files || []).filter(f => f.status === "APPROVED" && f.url);
    if (approvedFiles.length === 0) return alert("No approved files found to share.");
    
    const links = approvedFiles.map(f => `${f.name} (${f.category} - ${f.version}): ${f.url}`).join("\n\n");
    const msg = `Approved Files for ${localJob.display_id}:\n\n${links}`;
    
    navigator.clipboard.writeText(msg);
    alert("File share links copied to clipboard!");
  };

  // ⭐️ ROUND 8: Extract active artwork for print checks
  const productFiles = localJob.product?.files || [];
  const approvedArtwork = productFiles.find(f => f.category === 'Artwork' && f.status === 'APPROVED');
  const approvedDieline = productFiles.find(f => f.category === 'Dieline' && f.status === 'APPROVED');

  const totalSteps = localJob.process_sequence?.length || 0;
  const completedSteps = localJob.process_sequence?.filter(p => p.status === "completed").length || 0;
  const _progressPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
  const currentActiveIdx = localJob.process_sequence?.findIndex(s => s.status !== 'completed');

  const dueDate = localJob.deadline ? new Date(localJob.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "N/A";
  const jobDate = localJob.job_date ? new Date(localJob.job_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "N/A";
  
  const isMultiPart = localJob.parts_total > 1 || siblings.length > 1;

  const renderQtyMath = () => {
    if (localJob.is_custom_override) return `(${localJob.quantity_target?.toLocaleString()} custom for this job — standard ${localJob.qty_per_set}/set)`;
    return `(${localJob.active_multiplier || localJob.qty_per_set} per set × ${(localJob.sets_qty || 0).toLocaleString()} sets)`;
  };

  const placeChain = localJob.process_sequence?.map(s => s.assigned_machine_place).filter(p => p && p.trim() !== "").filter((p, i, arr) => i === 0 || p !== arr[i-1]);
  const routeText = placeChain?.length > 0 ? `Route: ${placeChain.join(" → ")}` : "Route: Unassigned";

  let preProdChecklist = localJob.product?.materialRows?.length > 0 
    ? [...localJob.product.materialRows]
    : [{ id: 'legacy-1', material_name: localJob.product?.material || "N/A", piece_purpose: localJob.part_name || "Main", size: localJob.specifications?.size_after_cut || localJob.product?.size || "N/A", qty_per_unit: 1, unit: "pcs", gsm: localJob.product?.gsm || "", notes: `Raw: ${localJob.specifications?.size_before_cut || localJob.product?.sheet_size || "N/A"}` }];

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

  const PrintView = (
    <div id="print-card" className="hidden print:block w-full bg-white text-black font-sans relative text-sm">
      
      <div className="flex justify-between items-start border-b-2 border-black pb-3 mb-3">
        <div className="flex-1">
          {isMultiPart ? (
            <>
              <h1 className="text-4xl font-black uppercase tracking-tighter mb-1">{localJob.set_code?.includes('-') ? `SET-${localJob.set_code}` : localJob.set_code}</h1>
              <div className="border border-black px-2 py-0.5 inline-block text-xs font-bold uppercase tracking-wider mb-1">PART {localJob.part_index} OF {localJob.parts_total || siblings.length} — {localJob.part_name}</div>
              <div className="flex items-center gap-2">
                <div className="text-xs font-bold font-mono text-gray-700">{localJob.display_id}</div>
                <div className="text-[10px] font-bold text-gray-800 uppercase border border-gray-400 inline-block px-1.5 py-0.5">{routeText}</div>
              </div>
            </>
          ) : (
            <>
              <h1 className="text-3xl font-black uppercase tracking-tight mb-1">FACTORY JOB CARD</h1>
              <div className="flex items-center gap-2">
                <div className="text-xs font-bold font-mono text-gray-700">{localJob.display_id || `JOB-${localJob.id.slice(0, 8).toUpperCase()}`}</div>
                <div className="text-[10px] font-bold text-gray-800 uppercase border border-gray-400 inline-block px-1.5 py-0.5">{routeText}</div>
              </div>
            </>
          )}
        </div>
        
        <div className="flex-1 flex flex-col items-center justify-center border-x-2 border-black px-4 mx-4">
          <span className="text-[10px] font-bold uppercase text-gray-600 tracking-wider">Target Quantity</span>
          <span className="text-3xl font-black">{localJob.quantity_target?.toLocaleString()} pcs</span>
          {isMultiPart && <span className="text-[10px] font-bold mt-0.5 text-gray-600 tracking-wide">{renderQtyMath()}</span>}
        </div>

        <div className="flex-1 text-right text-xs flex flex-col justify-center space-y-1">
          <div><span className="text-gray-500 uppercase">Job Date:</span> <span className="font-bold">{jobDate}</span></div>
          <div><span className="text-gray-500 uppercase">Due Date:</span> <span className="font-bold">{dueDate}</span></div>
          <div><span className="text-gray-500 uppercase">Priority:</span> <span className="font-bold uppercase border border-black px-1.5 py-0.5 ml-1">{localJob.priority}</span></div>
        </div>
      </div>

      <div className="flex justify-between items-center bg-gray-100 border-b-2 border-black py-1.5 px-2 mb-3 text-xs uppercase">
        <div><span className="text-gray-500 font-bold">Customer:</span> <span className="font-bold text-black ml-1">{localJob.customer}</span></div>
        <div><span className="text-gray-500 font-bold">Product:</span> <span className="font-bold text-black ml-1">{localJob.product?.name || "N/A"}</span></div>
        <div><span className="text-gray-500 font-bold">Part:</span> <span className="font-bold text-black ml-1">{isMultiPart ? localJob.part_name : "Main"}</span></div>
        <div><span className="text-gray-500 font-bold">SKU:</span> <span className="font-bold text-black ml-1">{localJob.product?.sku || "N/A"}</span></div>
      </div>

      {/* ⭐️ ROUND 8: File Version Warnings & Print Display */}
      <div className="mb-4 border-2 border-black flex">
        <div className="flex-1 p-2">
          <div className="text-[10px] font-bold uppercase text-gray-600 tracking-wider mb-1">Master Files & Assets</div>
          {!approvedArtwork ? (
            <div className="text-red-600 font-black text-xl uppercase tracking-widest mt-1">
              ⚠️ ARTWORK: NOT APPROVED (DO NOT START)
            </div>
          ) : (
            <div className="space-y-1 mt-2">
              <div className="text-sm font-bold">ARTWORK: {approvedArtwork.name} <span className="text-xs bg-black text-white px-1 ml-1">{approvedArtwork.version}</span></div>
              {approvedDieline && <div className="text-sm font-bold">DIELINE: {approvedDieline.name} <span className="text-xs bg-gray-200 px-1 ml-1 border border-black">{approvedDieline.version}</span></div>}
            </div>
          )}
        </div>
        <div className="w-24 border-l-2 border-black flex flex-col items-center justify-center p-1 bg-gray-50">
          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent('Job-' + localJob.display_id)}&margin=0`} alt="Job QR" className="w-16 h-16" />
          <span className="text-[7px] uppercase font-bold mt-1 text-center leading-tight">Scan for Files<br/>& Updates</span>
        </div>
      </div>

      <div className="font-bold uppercase mb-1 text-xs">Pre-Production Checklist</div>
      <table className="w-full text-left border-collapse border-2 border-black text-[10px] mb-4">
        <thead>
          <tr className="bg-gray-100 border-b-2 border-black uppercase text-gray-700">
            <th className="border-r-2 border-black p-1.5 w-6 text-center">☐</th>
            <th className="border-r-2 border-black p-1.5">Item / Material</th>
            <th className="border-r-2 border-black p-1.5 w-32">Piece / Purpose</th>
            <th className="border-r-2 border-black p-1.5 w-32">Size</th>
            <th className="border-r-2 border-black p-1.5 w-24 text-center bg-gray-200">Total Required</th>
            <th className="p-1.5 w-32">Notes</th>
          </tr>
        </thead>
        <tbody>
          {preProdChecklist.map((row, i) => {
             const calculatedTotal = row.isDie ? 1 : (Number(row.qty_per_unit) || 1) * (localJob.quantity_target || 0);
             let stockFlag = null;
             if (!row.isDie) {
                const invItem = inventoryItems.find(inv => {
                  const displayLabel = inv.name || inv.itemName || inv.label || "Unnamed Material";
                  return displayLabel === row.material_name;
                });
                if (invItem) {
                   const bal = Number(invItem.qty || invItem.balance || 0);
                   if (calculatedTotal > bal) stockFlag = <span className="ml-1 bg-red-600 text-white px-1 py-0.5 rounded text-[8px] font-black tracking-wider">SHORT {calculatedTotal - bal}</span>;
                }
             }

             return (
               <tr key={i} className="border-b border-black">
                 <td className="border-r-2 border-black p-1.5 text-center text-lg font-bold">☐</td>
                 <td className="border-r-2 border-black p-1.5 font-bold text-sm">
                   {row.material_name}
                   {row.category === 'board' && row.thickness_mm ? <span className="text-[10px] font-normal text-gray-600 ml-1">({row.thickness_mm}mm)</span> : ''}
                   {row.category === 'paper' && row.gsm ? <span className="text-[10px] font-normal text-gray-600 ml-1">({row.gsm} GSM)</span> : ''}
                   {stockFlag}
                 </td>
                 <td className="border-r-2 border-black p-1.5 font-bold uppercase">{row.piece_purpose}</td>
                 <td className="border-r-2 border-black p-1.5">{row.size || '—'}</td>
                 <td className="border-r-2 border-black p-1.5 text-center font-bold text-sm bg-gray-50">{row.isDie ? '—' : `${calculatedTotal.toLocaleString()} ${row.unit}`}</td>
                 <td className="p-1.5 text-[9px]">{row.notes || '—'}</td>
               </tr>
             );
          })}
        </tbody>
      </table>

      {issuedMaterials.length > 0 && (
        <div className="mb-4 text-xs">
          <span className="font-bold uppercase border-b border-black pb-0.5 mr-3">Materials Issued (Inventory):</span>
          {issuedMaterials.map(mat => (
            <span key={mat.id} className="mr-4 inline-block font-medium">
              {mat.itemName} — <span className="font-bold">{Math.abs(mat.qty).toLocaleString()}</span> <span className="text-[9px] text-gray-500">({mat.date})</span>
            </span>
          ))}
        </div>
      )}

      <div className="font-bold uppercase mb-1 text-xs">Process Routing & Operator Sign-off</div>
      <table id="routing-table" className="w-full text-left border-collapse border-2 border-black text-xs mb-4">
        <thead>
          <tr className="bg-gray-100 border-b-2 border-black">
            <th className="border-r-2 border-black p-2 w-8 text-center">#</th>
            <th className="border-r-2 border-black p-2">Process & Specifications</th>
            <th className="border-r-2 border-black p-2 w-28">Machine</th>
            <th className="border-r-2 border-black p-2 w-16">Place</th>
            <th className="border-r-2 border-black p-2 w-16 text-center">Qty In</th>
            <th className="border-r-2 border-black p-2 w-16 text-center">Exp. Out</th>
            <th className="border-r-2 border-black p-2 w-20 text-center">Actual Out</th>
            <th className="p-2 w-32 text-center">Operator Sign / Date</th>
          </tr>
        </thead>
        <tbody>
          {localJob.process_sequence?.map((step, idx, arr) => {
            const prevStep = idx > 0 ? arr[idx-1] : null;
            const prevPlace = prevStep?.assigned_machine_place;
            const currPlace = step.assigned_machine_place;
            const isTransfer = prevPlace && currPlace && prevPlace !== currPlace;

            return (
              <Fragment key={idx}>
                {isTransfer && (
                  <tr className="bg-gray-200 border-b border-black">
                    <td colSpan="8" className="p-1.5 text-center text-[10px] font-black uppercase tracking-widest text-black">
                      → SEND OUT: {prevPlace} → {currPlace}
                    </td>
                  </tr>
                )}
                <tr className="border-b border-black">
                  <td className="border-r-2 border-black p-2 text-center font-bold align-top">{idx + 1}</td>
                  <td className="border-r-2 border-black p-2 align-top">
                    <span className="font-bold text-sm">{step.process_name}</span>
                    {step.remarks && (
                      <div className="text-[10px] font-medium text-gray-800 mt-1 whitespace-pre-wrap leading-tight">{step.remarks.replace(/ \| /g, '\n')}</div>
                    )}
                  </td>
                  <td className="border-r-2 border-black p-2 align-top text-gray-800 text-[10px] font-bold">{step.assigned_machine_name || "Any Available"}</td>
                  <td className="border-r-2 border-black p-2 align-top text-gray-800 text-[10px] font-bold">{currPlace || "—"}</td>
                  <td className="border-r-2 border-black p-2 text-center align-top font-bold">{step.input_qty?.toLocaleString() || localJob.quantity_target?.toLocaleString()}</td>
                  <td className="border-r-2 border-black p-2 text-center align-top font-bold text-gray-600">{step.output_qty?.toLocaleString() || localJob.quantity_target?.toLocaleString()}</td>
                  <td className="border-r-2 border-black p-2 text-center align-top"></td>
                  <td className="p-2 align-top"></td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>

      {localJob.notes && (
        <div className="border border-black p-3 mb-4">
          <h3 className="text-[10px] font-bold text-gray-600 uppercase mb-1">Special Instructions / Notes</h3>
          <p className="text-xs whitespace-pre-wrap font-medium">{localJob.notes}</p>
        </div>
      )}

      <div className="flex justify-between items-stretch border-2 border-black mt-auto">
        <div className="p-2 flex-1 border-r-2 border-black bg-gray-50">
          <div className="text-[10px] font-bold uppercase mb-1">Linked Cards in Set {isMultiPart ? `(SET-${localJob.set_code})` : ''}</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {siblings.map(sib => (
              <div key={sib.id} className="text-[9px] font-bold uppercase flex justify-between">
                <span>Part {sib.part_index}: {sib.part_name} - {sib.quantity_target?.toLocaleString()} pcs</span>
                <span className={sib.id === localJob.id ? 'text-black' : 'text-gray-500'}>{sib.id === localJob.id ? '[THIS CARD]' : sib.status}</span>
              </div>
            ))}
            {!isMultiPart && <div className="text-[9px] text-gray-500 italic">Single job card. No siblings.</div>}
          </div>
        </div>
        <div className="w-64 p-2 flex flex-col">
          <div className="text-[10px] font-bold uppercase mb-4 text-center">Supervisor Sign / Date</div>
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

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm print:hidden">
        <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
          
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
                </div>
                <h2 className="text-2xl font-bold text-white">{localJob.title || localJob.product?.name || "Untitled Job"}</h2>
                <p className="text-gray-400 text-sm mt-1">{localJob.customer || "No Customer"} | {localJob.product?.sku || "No SKU"} {isMultiPart ? `| ${localJob.part_name}` : ""}</p>
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

            {/* ⭐️ ROUND 8: Visual Stepper UI */}
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
                  let colorClass = "bg-gray-800 text-gray-500 border-gray-700"; // pending
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
                        <th className="p-3 font-bold text-center">Stock</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {preProdChecklist.map((row, i) => {
                         const calculatedTotal = row.isDie ? 1 : (Number(row.qty_per_unit) || 1) * (localJob.quantity_target || 0);
                         let stockDisplay = <span className="text-gray-500">—</span>;
                         if (!row.isDie) {
                            const invItem = inventoryItems.find(inv => {
                              const displayLabel = inv.name || inv.itemName || inv.label || "Unnamed Material";
                              return displayLabel === row.material_name;
                            });
                            if (invItem) {
                               const bal = Number(invItem.qty || invItem.balance || 0);
                               const isShort = calculatedTotal > bal;
                               stockDisplay = <span className={`px-2 py-0.5 rounded font-bold uppercase ${isShort ? 'bg-red-500/20 text-red-400' : 'bg-gray-800 text-gray-400'}`}>{bal.toLocaleString()} {isShort && `(SHORT)`}</span>;
                            }
                         } else {
                           stockDisplay = <span className="text-purple-400 font-bold uppercase text-[10px]">Tooling</span>;
                         }

                         return (
                           <tr key={i} className="hover:bg-gray-800/50">
                             <td className="p-3 font-bold text-white truncate max-w-[120px]" title={row.material_name}>{row.material_name}</td>
                             <td className="p-3 text-gray-300 font-medium uppercase truncate max-w-[80px]" title={row.piece_purpose}>{row.piece_purpose}</td>
                             <td className="p-3 text-center font-bold text-primary-400">{row.isDie ? '—' : `${calculatedTotal.toLocaleString()}`}</td>
                             <td className="p-3 text-center">{stockDisplay}</td>
                           </tr>
                         );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ⭐️ ROUND 8: Activity Log Panel */}
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

            <div>
              <h3 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">Process Routing & Status Control</h3>
              <div className="space-y-3">
                {localJob.process_sequence?.map((step, idx, arr) => {
                  const status = step.status || 'pending';
                  const isCompleted = status === 'completed';
                  const isInProgress = status === 'in_progress';
                  const isOnHold = status === 'on_hold';

                  const prevStep = idx > 0 ? arr[idx-1] : null;
                  const prevPlace = prevStep?.assigned_machine_place;
                  const currPlace = step.assigned_machine_place;
                  const isTransfer = prevPlace && currPlace && prevPlace !== currPlace;

                  return (
                    <Fragment key={idx}>
                      {isTransfer && (
                        <div className="flex items-center justify-center my-1.5">
                          <div className="bg-gray-800 border border-gray-700 text-gray-300 text-[10px] font-bold uppercase tracking-widest px-4 py-1.5 rounded-full shadow-lg">
                            → SEND OUT: {prevPlace} → {currPlace}
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
                          
                          {/* ⭐️ ROUND 8: Step Action Controls */}
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
                                <button onClick={() => { setCompletingStepIdx(idx); setQtyOk(step.output_qty || localJob.quantity_target || ""); setQtyReject("0"); }} className="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded shadow-lg transition-colors">
                                  Complete
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

                        {/* ⭐️ ROUND 8: Put On Hold UI */}
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

                        {/* Existing Complete Step UI */}
                        {completingStepIdx === idx && (
                          <div className="mt-2 bg-gray-950 p-4 rounded-lg border border-green-500/30 ml-12 animate-fade-in">
                            <h4 className="text-xs font-bold text-green-400 mb-3 uppercase tracking-wider">Complete Process: {step.process_name}</h4>
                            <div className="flex items-end gap-4">
                              <div className="flex-1"><label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">Qty OK (Usable)</label><input type="number" value={qtyOk} onChange={e => setQtyOk(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white outline-none" /></div>
                              <div className="flex-1"><label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">Qty Rejected (Wastage)</label><input type="number" value={qtyReject} onChange={e => setQtyReject(e.target.value)} className="w-full bg-gray-900 border border-red-900/50 rounded px-3 py-2 text-sm text-white focus:border-red-500 outline-none" /></div>
                              <div className="flex gap-2">
                                <button onClick={() => setCompletingStepIdx(null)} className="px-4 py-2 text-xs font-bold text-gray-400 hover:text-white bg-gray-800 rounded transition-colors">Cancel</button>
                                <button onClick={() => handleCompleteStep(idx)} disabled={updating} className="px-4 py-2 text-xs font-bold text-white bg-green-600 hover:bg-green-500 rounded transition-colors disabled:opacity-50">{updating ? "Saving..." : "Confirm"}</button>
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
      
      {createPortal(PrintView, document.body)}
    </>
  );
}