import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { collection, doc, query, where, getDocs, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/config";
import QRCode from "react-qr-code";

export default function PrintJobCard() {
  const { jobId } = useParams();
  const [job, setJob] = useState(null);
  const [siblings, setSiblings] = useState([]);
  const [logoUrl, setLogoUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const formatDate = (isoString) => {
    if (!isoString) return "N/A";
    return new Date(isoString).toLocaleDateString("en-GB", { day: 'numeric', month: 'short', year: 'numeric' });
  };

  useEffect(() => {
    // Fetch Company Logo
    const fetchLogo = async () => {
      const settingsSnap = await getDocs(query(collection(db, "settings")));
      settingsSnap.forEach(d => { if (d.id === "global" && d.data().logoUrl) setLogoUrl(d.data().logoUrl); });
    };
    fetchLogo();

    // Live Snapshot of the Job
    const unsub = onSnapshot(doc(db, "jobs", jobId), async (docSnap) => {
      if (docSnap.exists()) {
        const jobData = docSnap.data();
        setJob(jobData);
        
        // Fetch sibling parts for the Linked Cards footer
        if (jobData.set_code) {
          const q = query(collection(db, "jobs"), where("set_code", "==", jobData.set_code));
          const sibSnap = await getDocs(q);
          const sibs = sibSnap.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => a.part_index - b.part_index);
          setSiblings(sibs);
        }
        
        setLoading(false);
        // Trigger native print dialog safely after data loads
        setTimeout(() => window.print(), 800);
      } else {
        setError("Job not found.");
        setLoading(false);
      }
    });

    return () => unsub();
  }, [jobId]);

  if (loading) return <div className="p-12 text-center font-bold text-gray-500 animate-pulse">Generating Restored Print Layout...</div>;
  if (error) return <div className="p-12 text-center font-bold text-red-500">{error}</div>;
  if (!job) return null;

  const routeString = job.process_sequence?.map(s => s.process_name).join(" → ");
  // Filter out the hardcoded default string if it exists
  const displayNotes = job.notes && job.notes !== "Auto-generated multi-part set." ? job.notes : null;

  return (
    <div className="bg-white text-black font-sans min-h-screen p-6 max-w-[210mm] mx-auto print:p-0 print:m-0">
      
      {/* 1. Header */}
      <div className="flex justify-between items-start border-b-2 border-black pb-2 mb-2">
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <img src={logoUrl} alt="Janus Print" className="h-10 object-contain" />
          ) : (
            <div className="h-10 w-10 bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-500 border border-black">LOGO</div>
          )}
          <h1 className="text-2xl font-black uppercase tracking-tight">Janus Print</h1>
        </div>
        <div className="text-right flex flex-col justify-end">
          {!job.print_count || job.print_count === 0 ? (
            <span className="bg-black text-white px-3 py-1 font-bold text-sm uppercase tracking-widest inline-block border-2 border-black">Original</span>
          ) : (
            <span className="text-xs font-bold text-gray-800">
              Printed: {formatDate(new Date().toISOString())} · <strong>Reprint #{job.print_count}</strong>
            </span>
          )}
        </div>
      </div>

      {/* 2. Identity Row */}
      <div className="bg-black text-white py-1.5 px-2 mb-2 flex flex-wrap items-center gap-2 text-sm font-black uppercase tracking-tight">
        <span>{job.set_code?.includes('-') ? `SET-${job.set_code}` : job.set_code}</span>
        <span className="text-gray-400">|</span>
        <span className="text-yellow-400">PART {job.part_index} OF {job.parts_total} — {job.part_name}</span>
        <span className="text-gray-400">|</span>
        <span>{job.display_id}</span>
        <span className="text-gray-400">|</span>
        <span className="text-[10px] text-gray-300 font-bold tracking-normal">{routeString}</span>
      </div>

      {/* 3. Detail Row */}
      <div className="grid grid-cols-4 gap-4 mb-3 border-b-2 border-black pb-2 text-sm">
        <div className="col-span-2">
          <div className="font-bold text-[10px] uppercase text-gray-500">Customer & Product</div>
          <div className="font-black text-lg truncate">{job.customer}</div>
          <div className="font-bold text-gray-800">{job.product?.name || job.title} <span className="text-xs text-gray-500 ml-1">(SKU: {job.product?.sku || 'N/A'})</span></div>
        </div>
        <div>
          <div className="font-bold text-[10px] uppercase text-gray-500">Timeline</div>
          <div className="font-bold text-xs">Job: {formatDate(job.job_date)}</div>
          <div className="font-bold text-xs text-red-600">Due: {formatDate(job.deadline)}</div>
          <div className="font-bold text-[10px] uppercase mt-0.5">Priority: {job.priority}</div>
        </div>
        <div className="text-right">
          <div className="font-bold text-[10px] uppercase text-gray-500">Production Target</div>
          <div className="text-xl font-black">{Number(job.quantity_target).toLocaleString()} pcs</div>
          <div className="text-[10px] font-bold text-gray-600">({job.qty_per_set || 1} ups × {Number(job.sets_qty || 0).toLocaleString()} sets)</div>
        </div>
      </div>

      {/* 4. Artwork Line & QR Code */}
      <div className="flex items-center gap-4 border-2 border-black p-1.5 mb-3">
        <div className="h-12 w-12 border border-gray-300 bg-white p-0.5 flex-shrink-0">
          <QRCode 
            value={window.location.origin + '/jobs/' + job.id} 
            size={256}
            style={{ height: "100%", width: "100%" }}
            viewBox={`0 0 256 256`}
          />
        </div>
        <div>
          <div className="text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-0.5">Master Files & Assets</div>
          { !job.artwork_required ? (
             <div className="text-sm font-black tracking-widest text-gray-800">ARTWORK: NOT REQUIRED (PLAIN / UNPRINTED)</div>
          ) : (!job.product?.files || job.product.files.length === 0) ? (
             <div className="text-sm font-black tracking-widest text-red-600">ARTWORK: NOT APPROVED (DO NOT START)</div>
          ) : (
             <div className="text-sm font-black tracking-widest text-gray-800">ARTWORK: APPROVED ({job.product.files[0].name})</div>
          )}
        </div>
      </div>

      {/* 5. Special Instructions */}
      {displayNotes && (
        <div className="mb-3 p-2 border-2 border-dashed border-black bg-gray-50">
          <div className="text-[10px] font-black uppercase tracking-widest text-gray-600">Special Instructions / Notes</div>
          <div className="text-sm font-bold mt-0.5">{displayNotes}</div>
        </div>
      )}

      {/* 6. Pre-Production Issue Checklist */}
      <div className="mb-4">
        <h3 className="font-black uppercase tracking-widest text-xs bg-gray-200 border-2 border-black border-b-0 px-2 py-1">Pre-Production Issue Checklist</h3>
        <table className="w-full text-left text-xs border-collapse border-2 border-black">
          <thead>
            <tr className="border-b-2 border-black bg-gray-50 uppercase text-[9px] tracking-wider">
              <th className="p-1.5 border-r border-black">Material / Tooling</th>
              <th className="p-1.5 border-r border-black">Piece / Purpose</th>
              <th className="p-1.5 border-r border-black">Spec (GSM/mm)</th>
              <th className="p-1.5 border-r border-black">Size</th>
              <th className="p-1.5 border-r border-black text-right">Target Issue Qty</th>
              <th className="p-1.5 text-center w-16">Issued ✓</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black font-medium">
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
                   <td className="p-1.5 border-r border-black font-bold">{row.material_name}</td>
                   <td className="p-1.5 border-r border-black text-gray-700">{row.piece_purpose || '—'}</td>
                   <td className="p-1.5 border-r border-black text-gray-700">{row.gsm ? `${row.gsm} ${cat.includes('rigid') || cat.includes('board') ? 'mm' : 'GSM'}` : '—'}</td>
                   <td className="p-1.5 border-r border-black text-gray-700">{row.size || '—'}</td>
                   <td className="p-1.5 border-r border-black text-right font-bold">{req.toLocaleString()} {row.unit || (isPaper ? 'sheets' : 'pcs')}</td>
                   <td className="p-1.5 border-l border-black"></td>
                 </tr>
               )
            })}
          </tbody>
        </table>
      </div>

      {/* 7. Process Routing & Sign-off */}
      <div className="mb-4">
        <h3 className="font-black uppercase tracking-widest text-xs bg-gray-200 border-2 border-black border-b-0 px-2 py-1">Process Routing & Sign-off</h3>
        <table className="w-full text-left text-xs border-collapse border-2 border-black">
          <thead>
            <tr className="border-b-2 border-black bg-gray-50 text-[9px] uppercase tracking-wider">
              <th className="p-1 border-r border-black text-center w-6">#</th>
              <th className="p-1 border-r border-black">Process & Specs</th>
              <th className="p-1 border-r border-black">Machine</th>
              <th className="p-1 border-r border-black">Place</th>
              <th className="p-1 border-r border-black text-right w-16">Input Qty</th>
              <th className="p-1 border-r border-black text-right w-16">Expected Out</th>
              <th className="p-1 border-r border-black text-right w-16">Actual Out</th>
              <th className="p-1 border-r border-black text-center w-12">1st Piece OK</th>
              <th className="p-1 w-32">Operator Sign / Date</th>
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
                    <td className="p-1 border-r border-black text-center font-bold">{index + 1}</td>
                    <td className="p-1 border-r border-black">
                      <div className="font-bold uppercase">{step.process_name}</div>
                      <div className="text-[9px] text-gray-600 mt-0.5">{step.remarks || "—"}</div>
                    </td>
                    <td className="p-1 border-r border-black font-medium">{step.assigned_machine_name || '—'}</td>
                    <td className="p-1 border-r border-black font-bold text-center">{step.assigned_machine_place || '—'}</td>
                    <td className="p-1 border-r border-black text-right font-mono font-bold">{Number(step.input_qty).toLocaleString()}</td>
                    <td className="p-1 border-r border-black text-right font-mono font-bold">{Number(step.output_qty).toLocaleString()}</td>
                    <td className="p-1 border-r border-black bg-gray-50"></td>
                    <td className="p-1 border-r border-black text-center bg-gray-50"></td>
                    <td className="p-1 h-12 bg-gray-50"></td>
                  </tr>
                  
                  {/* Compact Transfer Divider */}
                  {showTransfer && (
                    <tr className="bg-gray-100 text-center font-black uppercase text-[10px] tracking-widest border-b-[3px] border-gray-400">
                      <td colSpan="9" className="py-1">
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

      {/* 8. Final Reconciliation Box */}
      <div className="border-2 border-black p-3 flex justify-between items-end bg-gray-100 break-inside-avoid mb-4">
        <div>
          <div className="font-black uppercase tracking-widest text-lg">Final Reconciliation</div>
          <div className="text-[10px] text-gray-600 uppercase font-bold">To be completed at final packing step</div>
        </div>
        <div className="flex gap-8 text-center">
          <div>
            <div className="text-[9px] font-bold text-gray-600 uppercase mb-1">Target Qty</div>
            <div className="font-black text-lg">{Number(job.quantity_target).toLocaleString()}</div>
          </div>
          <div>
            <div className="text-[9px] font-bold text-gray-600 uppercase mb-1">Good Output</div>
            <div className="border-b-2 border-black w-20 h-6"></div>
          </div>
          <div>
            <div className="text-[9px] font-bold text-gray-600 uppercase mb-1">Rejected Qty</div>
            <div className="border-b-2 border-black w-20 h-6"></div>
          </div>
          <div>
            <div className="text-[9px] font-bold text-gray-600 uppercase mb-1">Variance / Bal</div>
            <div className="border-b-2 border-black w-20 h-6"></div>
          </div>
        </div>
      </div>

      {/* 9. Footer: Linked Cards & Supervisor Sign */}
      <div className="flex justify-between items-end border-t-2 border-black pt-2 break-inside-avoid">
        <div className="text-xs">
          <div className="font-black uppercase text-[10px] text-gray-500 mb-1">Linked Cards in Set ({job.set_code})</div>
          {siblings.length > 0 ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              {siblings.map(sib => (
                <div key={sib.id} className={`font-bold ${sib.id === job.id ? 'text-black' : 'text-gray-500'}`}>
                  {sib.part_index}. {sib.part_name} <span className="font-mono text-[9px]">({sib.display_id})</span>
                  {sib.id === job.id && " ★"}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-gray-400 italic">No linked parts found.</div>
          )}
        </div>
        
        <div className="text-right">
          <div className="border-b border-black w-48 h-8 mb-1"></div>
          <div className="font-bold text-[10px] uppercase">Supervisor Sign / Date</div>
        </div>
      </div>

      <button 
        onClick={() => window.print()} 
        className="fixed bottom-8 right-8 bg-blue-600 text-white p-4 rounded-full shadow-2xl print:hidden hover:bg-blue-500 transition-colors"
        title="Print Document"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
      </button>

    </div>
  );
}