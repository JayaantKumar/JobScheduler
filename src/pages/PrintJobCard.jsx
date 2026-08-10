import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { doc, getDoc, updateDoc, increment } from "firebase/firestore";
import { db } from "../firebase/config";

export default function PrintJobCard() {
  const { jobId } = useParams();
  const [job, setJob] = useState(null);
  const [logoUrl, setLogoUrl] = useState("");
  const [printCount, setPrintCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchPrintData = async () => {
      try {
        // 1. Fetch Company Settings for Logo
        const settingsSnap = await getDoc(doc(db, "settings", "global"));
        if (settingsSnap.exists() && settingsSnap.data().logoUrl) {
          setLogoUrl(settingsSnap.data().logoUrl);
        }

        // 2. Fetch the specific Job
        const jobRef = doc(db, "jobs", jobId);
        const jobSnap = await getDoc(jobRef);
        
        if (jobSnap.exists()) {
          const jobData = jobSnap.data();
          setJob(jobData);
          
          // Capture current count before incrementing
          const currentCount = jobData.print_count || 0;
          setPrintCount(currentCount);

          // Increment the ledger invisibly
          await updateDoc(jobRef, { print_count: increment(1) });

          setLoading(false);
          
          // Trigger native print dialog automatically after render
          setTimeout(() => {
            window.print();
          }, 600);
        } else {
          setError("Job not found.");
          setLoading(false);
        }
      } catch (err) {
        setError("Error loading print data: " + err.message);
        setLoading(false);
      }
    };
    fetchPrintData();
  }, [jobId]);

  if (loading) return <div className="p-12 text-center font-bold text-gray-500 animate-pulse">Generating Print Layout...</div>;
  if (error) return <div className="p-12 text-center font-bold text-red-500">{error}</div>;
  if (!job) return null;

  const routeString = job.process_sequence?.map(s => s.process_name).join(" → ");

  return (
    <div className="bg-white text-black font-sans min-h-screen p-8 max-w-5xl mx-auto print:p-0 print:m-0">
      
      {/* ⭐️ ROUND 10 FIX: Logo and Reprint Counter */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-4">
          {logoUrl ? (
            <img src={logoUrl} alt="Janus Print" className="h-12 object-contain" />
          ) : (
            <div className="h-12 w-12 bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500 border border-black">LOGO</div>
          )}
          <h1 className="text-2xl font-black uppercase tracking-tight">Janus Print</h1>
        </div>
        <div className="text-right flex flex-col justify-end">
          {printCount === 0 ? (
            <span className="bg-black text-white px-3 py-1 font-bold text-sm uppercase tracking-widest inline-block border-2 border-black">Original</span>
          ) : (
            <span className="text-xs font-bold text-gray-800 border-b border-black pb-0.5">
              Printed: {new Date().toLocaleDateString()} · <strong>Reprint #{printCount}</strong>
            </span>
          )}
        </div>
      </div>

      {/* ⭐️ ROUND 10 FIX: One-line compact header */}
      <div className="border-y-2 border-black py-2 mb-4">
        <h2 className="text-lg font-black uppercase tracking-tight">
          {job.part_name || "PART"} <span className="mx-2 font-normal text-gray-400">|</span> 
          {job.display_id} <span className="mx-2 font-normal text-gray-400">|</span> 
          <span className="text-sm font-bold text-gray-700">{routeString}</span>
        </h2>
      </div>

      <div className="flex justify-between items-start mb-6">
        <div>
          <div className="font-bold text-sm uppercase text-gray-500">Product</div>
          <div className="text-lg font-black">{job.title || job.product?.name}</div>
        </div>
        <div className="text-right">
          <div className="font-bold text-sm uppercase text-gray-500">Production Target</div>
          {/* ⭐️ ROUND 10 FIX: Specific "ups" wording */}
          <div className="text-2xl font-black">
            {Number(job.quantity_target).toLocaleString()} pcs 
            <span className="text-sm font-bold text-gray-600 ml-2">({job.qty_per_set || 1} ups × {Number(job.sets_qty || 0).toLocaleString()} sets)</span>
          </div>
        </div>
      </div>

      {/* ⭐️ ROUND 10 FIX: Enterable Special Instructions rendered properly */}
      {job.notes && (
        <div className="mb-6 p-3 border-2 border-black bg-gray-50">
          <div className="text-[10px] font-black uppercase tracking-widest mb-1 text-gray-600">Special Instructions / Notes</div>
          <div className="text-sm font-bold">{job.notes}</div>
        </div>
      )}

      {/* Pre-Production Checklist */}
      <div className="mb-6">
        <h3 className="font-black uppercase tracking-widest text-xs border-b border-black mb-2 pb-1">Pre-Production Issue Checklist</h3>
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-300 text-xs">
              <th className="py-1">Material / Tooling</th>
              <th className="py-1">Spec</th>
              <th className="py-1 text-right">Target Issue Qty</th>
              <th className="py-1 text-center w-24">Issued ✓</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {job.product?.materialRows?.map((row, i) => {
               const cat = row.category?.toLowerCase() || '';
               const isPaper = cat === 'paper' || cat === 'board' || cat === 'rigid';
               const effBasis = row.basis || (isPaper ? 'per_step' : 'per_piece');
               let req = 0;
               if (effBasis === 'fixed') { req = Number(row.qty_per_unit) || 1; } 
               else if (effBasis === 'per_step') {
                 const sIdx = row.basis_step_index || 0;
                 const stepQty = job.process_sequence[sIdx] ? Number(job.process_sequence[sIdx].input_qty) : Number(job.quantity_target);
                 req = (Number(row.qty_per_unit) || 1) * stepQty;
               } else { req = (Number(row.qty_per_unit) || 1) * Number(job.quantity_target); }

               return (
                 <tr key={i}>
                   <td className="py-1.5 font-bold">{row.material_name}</td>
                   <td className="py-1.5 text-xs text-gray-600">{row.piece_purpose}</td>
                   <td className="py-1.5 text-right font-mono">{req.toLocaleString()} {row.unit || (isPaper ? 'sheets' : 'pcs')}</td>
                   <td className="py-1.5 text-center border-l border-gray-300"></td>
                 </tr>
               )
            })}
          </tbody>
        </table>
      </div>

      {/* Routing Table */}
      <div>
        <h3 className="font-black uppercase tracking-widest text-xs border-b border-black mb-2 pb-1">Process Routing & Sign-off</h3>
        <table className="w-full text-left text-sm border-collapse border-2 border-black">
          <thead>
            <tr className="border-b-2 border-black bg-gray-100 text-xs uppercase tracking-wider">
              <th className="p-2 border-r border-black w-8 text-center">#</th>
              <th className="p-2 border-r border-black">Process</th>
              <th className="p-2 border-r border-black text-right w-24">Input Qty</th>
              {/* ⭐️ ROUND 10 FIX: "Expected Out" fully written */}
              <th className="p-2 border-r border-black text-right w-24">Expected Out</th>
              {/* ⭐️ ROUND 10 FIX: 1st Piece OK Column */}
              <th className="p-2 border-r border-black text-center w-20">1st Piece OK</th>
              <th className="p-2">Operator Remarks / Specs</th>
            </tr>
          </thead>
          <tbody>
            {job.process_sequence?.map((step, index) => {
              const currentPlace = step.assigned_machine_place;
              const nextStep = job.process_sequence[index + 1];
              const showTransfer = nextStep && nextStep.assigned_machine_place !== currentPlace && currentPlace && nextStep.assigned_machine_place;

              return (
                <div key={index} className="contents">
                  <tr className="border-b border-black">
                    <td className="p-2 border-r border-black text-center font-bold">{index + 1}</td>
                    <td className="p-2 border-r border-black font-bold uppercase">{step.process_name}</td>
                    <td className="p-2 border-r border-black text-right font-mono">{Number(step.input_qty).toLocaleString()}</td>
                    <td className="p-2 border-r border-black text-right font-mono">{Number(step.output_qty).toLocaleString()}</td>
                    <td className="p-2 border-r border-black text-center bg-gray-50"></td>
                    <td className="p-2 text-xs">{step.remarks || "—"}</td>
                  </tr>
                  
                  {/* ⭐️ ROUND 10 FIX: Compact Transfer Divider */}
                  {showTransfer && (
                    <tr className="bg-gray-100 text-center font-black uppercase text-xs tracking-widest border-b-2 border-gray-400">
                      <td colSpan="6" className="py-1">
                        ↓ TRANSFER TO {nextStep.assigned_machine_place} ↓
                      </td>
                    </tr>
                  )}
                </div>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ⭐️ ROUND 10 FIX: Final Reconciliation Box */}
      <div className="mt-8 border-2 border-black p-4 flex justify-between items-end bg-gray-50 break-inside-avoid">
        <div>
          <div className="font-black uppercase tracking-widest text-lg">Final Reconciliation</div>
          <div className="text-xs text-gray-500 mt-1 uppercase font-bold">To be completed at final packing step</div>
        </div>
        <div className="flex gap-10 text-center">
          <div>
            <div className="text-[10px] font-bold text-gray-500 uppercase mb-1">Target Qty</div>
            <div className="font-black text-xl">{Number(job.quantity_target).toLocaleString()}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-gray-500 uppercase mb-1">Good Output</div>
            <div className="border-b-2 border-black w-24 h-6"></div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-gray-500 uppercase mb-1">Rejected Qty</div>
            <div className="border-b-2 border-black w-24 h-6"></div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-gray-500 uppercase mb-1">Variance / Bal</div>
            <div className="border-b-2 border-black w-24 h-6"></div>
          </div>
        </div>
      </div>

    </div>
  );
}