import { useState } from "react";
import { useMachines } from "../hooks/useMachines";
import MachineModal from "../components/MachineModal";
import { doc, deleteDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/config";

// Quick helper to format the specs object into readable tags
const formatSpecs = (specs) => {
  if (!specs) return [];
  const parts = [];
  if (specs.size) parts.push(`Size: ${specs.size}`);
  if (specs.colors) parts.push(`${specs.colors} Colors`);
  if (specs.laminationType) parts.push(`Type: ${specs.laminationType}`);
  if (specs.mode) parts.push(`Mode: ${specs.mode}`);
  if (specs.minSize) parts.push(`Min: ${specs.minSize}`);
  if (specs.maxSize) parts.push(`Max: ${specs.maxSize}`);
  return parts;
};

export default function Machines() {
  const { machines, loading } = useMachines();
  const [isModalOpen, setModalOpen] = useState(false);
  const [editingMachine, setEditingMachine] = useState(null);

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this machine? This action cannot be undone.")) {
      try {
        await deleteDoc(doc(db, "machines", id));
      } catch (error) {
        console.error("Error deleting machine:", error);
        alert("Failed to delete machine: " + error.message);
      }
    }
  };

  const handleBreakdown = async (machine) => {
    const confirmed = window.confirm(
      `Are you sure you want to report ${machine.name} for breakdown? This will unschedule all its current jobs.`
    );

    if (confirmed) {
      try {
        await updateDoc(doc(db, "machines", machine.id), {
          status: "Offline",
          updated_at: serverTimestamp()
        });
        alert(`${machine.name} is now Offline.`);
      } catch (error) {
        console.error("Error reporting breakdown:", error);
        alert("Failed to report breakdown: " + error.message);
      }
    }
  };

  if (loading) return <div className="p-8 text-primary-500 animate-pulse font-medium">Loading fleet data...</div>;

  return (
    <div className="max-w-[1600px] mx-auto p-6 h-full flex flex-col">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">Machine Management</h2>
          <p className="text-gray-400 mt-1">Manage factory equipment, specific capabilities, and operational status.</p>
        </div>
        <button 
          onClick={() => {
            setEditingMachine(null); 
            setModalOpen(true);
          }}
          className="bg-primary-600 hover:bg-primary-500 text-white px-5 py-2.5 rounded-lg font-medium transition-colors shadow-lg shadow-primary-500/20 flex items-center gap-2 shrink-0"
        >
          <span className="text-lg leading-none">+</span> Add Machine
        </button>
      </div>

      {/* Main Content Area */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden shadow-xl flex-1 flex flex-col">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-gray-950/50 border-b border-gray-800 text-xs font-bold text-gray-400 uppercase tracking-wider">
                <th className="py-4 px-6">Machine Details</th>
                <th className="py-4 px-6">Type & Capabilities</th>
                <th className="py-4 px-6">Machine Place</th>
                <th className="py-4 px-6">Status</th>
                <th className="py-4 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {machines.length === 0 ? (
                <tr><td colSpan="5" className="py-12 text-center text-gray-500">No machines configured. Add your first machine to begin.</td></tr>
              ) : (
                machines.map((machine) => {
                  const specTags = formatSpecs(machine.specs);

                  return (
                    <tr key={machine.id} className="hover:bg-gray-800/30 transition-colors group">
                      
                      <td className="py-4 px-6">
                        <div className="font-bold text-gray-200">{machine.name}</div>
                        {machine.company && (
                          <div className="text-xs text-primary-400 font-medium mt-0.5">{machine.company}</div>
                        )}
                        <div className="text-[10px] text-gray-500 font-mono mt-0.5">ID: {machine.id.slice(0, 8)}</div>
                      </td>
                      
                      {/* TYPE & DYNAMIC CAPABILITIES */}
                      <td className="py-4 px-6 text-gray-300">
                        <span className="bg-gray-800 text-gray-300 px-2.5 py-1 rounded text-xs font-bold border border-gray-700">
                          {machine.type}
                        </span>
                        
                        {/* Display the dynamically collected specs as tags */}
                        {specTags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {specTags.map((tag, i) => (
                              <span key={i} className="text-[10px] bg-gray-900 text-gray-400 border border-gray-800 px-1.5 py-0.5 rounded">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      
                      <td className="py-4 px-6">
                        <div className="text-gray-300 font-medium flex items-center gap-2">
                          <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          {machine.place || "Unassigned"}
                        </div>
                      </td>

                      <td className="py-4 px-6">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase border ${
                          machine.status === 'Online' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 
                          machine.status === 'Maintenance' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' : 
                          'bg-red-500/10 text-red-400 border-red-500/20'
                        }`}>
                          {machine.status}
                        </span>
                      </td>

                      <td className="py-4 px-6 text-right">
                        <div className="flex justify-end items-center gap-3">
                          <button onClick={() => handleBreakdown(machine)} title="Report Breakdown" className="text-orange-400 hover:text-orange-300 text-xs font-medium transition-colors px-2.5 py-1.5 border border-orange-900/50 bg-orange-500/10 rounded-md hover:bg-orange-500/20 flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                            Breakdown
                          </button>
                          <button onClick={() => { setEditingMachine(machine); setModalOpen(true); }} className="text-gray-400 hover:text-white text-sm font-medium transition-colors px-3 py-1.5 border border-gray-700 rounded-md hover:bg-gray-800">
                            Edit
                          </button>
                          <button onClick={() => handleDelete(machine.id)} title="Delete Machine" className="text-gray-500 hover:text-red-400 p-1.5 rounded-md hover:bg-red-500/10 transition-colors">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
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

      {isModalOpen && (
        <MachineModal 
          onClose={() => { setModalOpen(false); setEditingMachine(null); }} 
          machines={machines} 
          editingMachine={editingMachine} 
        />
      )}
    </div>
  );
}