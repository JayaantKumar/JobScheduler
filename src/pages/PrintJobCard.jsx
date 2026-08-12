import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { collection, doc, query, where, getDocs, onSnapshot, updateDoc, increment } from "firebase/firestore";
import { db } from "../firebase/config";
import QRCode from "react-qr-code";

export default function PrintJobCard() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  
  const isAutoprint = new URLSearchParams(location.search).get("autoprint") === "1";
  const autoPrintTriggered = useRef(false);

  const [job, setJob] = useState(null);
  const [siblings, setSiblings] = useState([]);
  const [inventoryItems, setInventoryItems] = useState({});
  const [logoUrl, setLogoUrl] = useState("");
  const [companyName, setCompanyName] = useState("Janus Print");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const formatDate = (isoString) => {
    if (!isoString) return "N/A";
    return new Date(isoString).toLocaleDateString("en-GB", { day: 'numeric', month: 'short', year: 'numeric' });
  };

  useEffect(() => {
    const fetchGlobals = async () => {
      const settingsSnap = await getDocs(query(collection(db, "settings")));
      settingsSnap.forEach(d => { 
        if (d.id === "global") {
          const data = d.data();
          if (data.logoUrl || data.companyLogo) setLogoUrl(data.logoUrl || data.companyLogo);
          if (data.companyName) setCompanyName(data.companyName);
        }
      });

      const invSnap = await getDocs(collection(db, "inventory"));
      const invMap = {};
      invSnap.forEach(d => invMap[d.id] = d.data());
      setInventoryItems(invMap);
    };
    fetchGlobals();

    const unsub = onSnapshot(doc(db, "jobs", jobId), async (docSnap) => {
      if (docSnap.exists()) {
        const jobData = docSnap.data();
        setJob(jobData);
        
        if (jobData.set_code) {
          const q = query(collection(db, "jobs"), where("set_code", "==", jobData.set_code));
          const sibSnap = await getDocs(q);
          const sibs = sibSnap.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => a.part_index - b.part_index);
          setSiblings(sibs);
        }
        
        setLoading(false);
        
        // ⭐️ ROUND 15 FIX (POINT 4): Increment strictly on auto-print, then clean the URL to prevent refresh loops
        if (isAutoprint && !autoPrintTriggered.current) {
          autoPrintTriggered.current = true;
          
          // Increment the counter since this is a valid print routing
          updateDoc(doc(db, "jobs", jobId), { print_count: increment(1) }).catch(err => console.error("Counter err:", err));
          
          // Strip the ?autoprint=1 flag from the URL entirely so hitting Refresh does nothing
          navigate(`/print/${jobId}`, { replace: true });
          
          setTimeout(() => window.print(), 800);
        }
      } else {
        setError("Job not found.");
        setLoading(false);
      }
    });

    return () => unsub();
  }, [jobId, isAutoprint, navigate]);

  const handleManualPrint = async () => {
    try {
      await updateDoc(doc(db, "jobs", jobId), { print_count: increment(1) });
    } catch (err) {
      console.error("Failed to increment counter:", err);
    }
    window.print();
  };

  if (loading) return <div className="p-12 text-center font-bold text-gray-500 animate-pulse bg-gray-900 min-h-screen">Loading Print Layout...</div>;
  if (error) return <div className="p-12 text-center font-bold text-red-500 bg-gray-900 min-h-screen">{error}</div>;
  if (!job) return null;

  const routeString = job.process_sequence?.map(s => s.process_name).join(" → ");
  const displayNotes = job.notes && job.notes !== "Auto-generated multi-part set." ? job.notes : null;

  return (
    <div className="min-h-screen bg-[#0a0f1a] print:bg-white flex flex-col items-center">
      
      <div className="print:hidden w-full bg-[#151724] p-4 flex justify-between items-center border-b border-gray-800 shadow-xl z-10 sticky top-0">
        <button 
          onClick={() => navigate('/dashboard/jobs')} 
          className="text-gray-400 hover:text-white font-bold flex items-center gap-2 text-sm transition-colors"
        >
          ← Back to Jobs
        </button>
        <button 
          onClick={handleManualPrint} 
          className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded font-bold text-sm shadow-lg transition-colors flex items-center gap-2"
        >
          🖨️ Print Job Card
        </button>
      </div>

      <div className="p-8 print:p-0 w-full flex justify-center overflow-auto">
        <div className="bg-white text-black font-sans p-6 w-[210mm] min-h-[297mm] shadow-2xl print:shadow-none print:w-full print:h-auto">
          
          <div className="flex justify-between items-start border-b-2 border-black pb-2 mb-2">
            <div className="flex items-center gap-3">
              {logoUrl ? (
                <img src={logoUrl} alt={companyName} className="h-10 object-contain" />
              ) : (
                <div className="h-10 w-10 bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-500 border border-black">LOGO</div>
              )}
              <h1 className="text-2xl font-black uppercase tracking-tight">{companyName}</h1>
            </div>
            <div className="text-right flex flex-col justify-end">
              {!job.print_count || job.print_count <= 1 ? (
                <span className="bg-black text-white px-3 py-1 font-bold text-sm uppercase tracking-widest inline-block border-2 border-black">Original</span>
              ) : (
                <span className="text-xs font-bold text-gray-800">
                  Printed: {formatDate(new Date().toISOString())} · <strong>Reprint #{job.print_count - 1}</strong>
                </span>
              )}
            </div>
          </div>

          <div className="bg-black text-white py-1.5 px-2 mb-2 flex flex-wrap items-center gap-2 text-sm font-black uppercase tracking-tight">
            <span>{job.set_code?.includes('-') ? `SET-${job.set_code}` : job.set_code}</span>
            <span className="text-gray-400">|</span>
            <span className="text-yellow-400">PART {job.part_index} OF {job.parts_total} — {job.part_name}</span>
            <span className="text-gray-400">|</span>
            <span>{job.display_id}</span>
            <span className="text-gray-400">|</span>
            <span className="text-[10px] text-gray-300 font-bold tracking-normal">{routeString}</span>
          </div>

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

          {displayNotes && (
            <div className="mb-3 p-2 border-2 border-dashed border-black bg-gray-50">
              <div className="text-[10px] font-black uppercase tracking-widest text-gray-600">Special Instructions / Notes</div>
              <div className="text-sm font-bold mt-0.5">{displayNotes}</div>
            </div>
          )}

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
                   const invItem = inventoryItems[row.material_id] || {};
                   const cat = (row.category || invItem.category || '').toLowerCase();
                   const isPaper = cat === 'paper' || cat === 'board' || cat === 'rigid' || cat.includes('kraft') || cat.includes('kappa');
                   
                   const gsm = row.gsm || invItem.gsm || invItem.thickness;
                   const size = row.size || invItem.size;
                   let specStr = '—';
                   if (gsm) {
                     specStr = `${gsm} ${cat.includes('rigid') || cat.includes('board') || cat.includes('kappa') ? 'mm' : 'GSM'}`;
                   }

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
                       <td className="p-1.5 border-r border-black font-bold">
                         {row.material_name}
                         {row.is_substituted && (
                           <span className="ml-1 text-[9px] font-black uppercase tracking-widest text-gray-500 italic block mt-0.5">
                             (Substituted)
                           </span>
                         )}
                       </td>
                       <td className="p-1.5 border-r border-black text-gray-700">{row.piece_purpose || '—'}</td>
                       <td className="p-1.5 border-r border-black text-gray-700">{specStr}</td>
                       <td className="p-1.5 border-r border-black text-gray-700">{size || '—'}</td>
                       <td className="p-1.5 border-r border-black text-right font-bold">{req.toLocaleString()} {row.unit || (isPaper ? 'sheets' : 'pcs')}</td>
                       <td className="p-1.5 border-l border-black"></td>
                     </tr>
                   )
                })}
              </tbody>
            </table>
          </div>

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

        </div>
      </div>
    </div>
  );
}