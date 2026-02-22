import { useState } from "react";
import { addJob } from "../services/job.service";

// Dummy Master Data: Represents your 'Product Mgmt' and 'Process Mgmt' modules
const PRODUCT_TEMPLATES = [
  {
    id: "prod_77",
    name: "Premium Corrugated Box - 12x12x12",
    sku: "BOX-PREM-12",
    required_processes: [
      { id: "proc_corrugation", name: "Corrugation" },
      { id: "proc_printing", name: "Offset Printing" },
      { id: "proc_cutting", name: "Die Cutting" }
    ]
  },
  {
    id: "prod_88",
    name: "Standard Glossy Flyer - A4",
    sku: "FLY-GLS-A4",
    required_processes: [
      { id: "proc_printing", name: "Digital Printing" },
      { id: "proc_cutting", name: "Guillotine Cutting" }
    ]
  }
];

export default function JobModal({ onClose }) {
  const [selectedProductId, setSelectedProductId] = useState(PRODUCT_TEMPLATES[0].id);
  const [quantity, setQuantity] = useState(1000);
  const [deadline, setDeadline] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    // 1. Find the selected product template
    const product = PRODUCT_TEMPLATES.find(p => p.id === selectedProductId);

    // 2. Construct the exact denormalized schema you architected
    const process_sequence = product.required_processes.map((proc, index) => ({
      step_order: index + 1,
      process_id: proc.id,
      process_name: proc.name,
      status: "pending", // Starts as pending until Live Scheduler picks it up
      assigned_machine_id: null,
      assigned_operator_id: null,
      scheduled_start: null,
      scheduled_end: null
    }));

    const newJobPayload = {
      customer_id: "cust_" + Math.floor(Math.random() * 1000), // Dummy customer
      product: {
        id: product.id,
        name: product.name,
        sku: product.sku
      },
      quantity_target: Number(quantity),
      quantity_completed: 0,
      deadline: new Date(deadline).toISOString(), // Convert HTML date to standard ISO
      status: "pending",
      process_sequence: process_sequence
    };

    try {
      await addJob(newJobPayload);
      onClose(); // Close modal on success
    } catch (error) {
      console.error("Error creating job:", error); // <-- Fix is right here!
      alert("Failed to create job. Check console.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md p-6 shadow-2xl">
        <h3 className="text-xl font-bold text-white mb-2">Create Production Job</h3>
        <p className="text-sm text-gray-400 mb-6">Inject a new job into the Core Engine queue.</p>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Product Template</label>
            <select 
              value={selectedProductId} 
              onChange={e => setSelectedProductId(e.target.value)} 
              className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary-500"
            >
              {PRODUCT_TEMPLATES.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Target Quantity</label>
              <input 
                required 
                type="number" 
                min="1" 
                value={quantity} 
                onChange={e => setQuantity(e.target.value)} 
                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary-500" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Deadline</label>
              <input 
                required 
                type="date" 
                value={deadline} 
                onChange={e => setDeadline(e.target.value)} 
                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary-500 [color-scheme:dark]" 
              />
            </div>
          </div>

          {/* Preview the generated processes */}
          <div className="mt-4 p-4 rounded-lg bg-gray-950/50 border border-gray-800">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">Generated Process Sequence</span>
            <div className="flex flex-wrap gap-2">
              {PRODUCT_TEMPLATES.find(p => p.id === selectedProductId)?.required_processes.map((proc, i) => (
                <span key={proc.id} className="text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded">
                  {i + 1}. {proc.name}
                </span>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-8">
            <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">Cancel</button>
            <button type="submit" disabled={loading} className="bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg font-medium transition-colors">
              {loading ? "Injecting..." : "Inject Job to Queue"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}