import { useState } from "react";
import { useMachines } from "../hooks/useMachines";
import { toggleMachineStatus, deleteMachine } from "../services/machine.service";
import MachineModal from "../components/MachineModal";

export default function Machines() {
  const { machines, loading } = useMachines();
  const [isModalOpen, setModalOpen] = useState(false);
  const [editingMachine, setEditingMachine] = useState(null);

  const handleEdit = (machine) => {
    setEditingMachine(machine);
    setModalOpen(true);
  };

  if (loading) return <div className="text-gray-400 animate-pulse">Loading infrastructure data...</div>;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white">Machine Fleet</h2>
          <p className="text-gray-400 mt-1">Manage and monitor your industrial equipment in real-time.</p>
        </div>
        <button 
          onClick={() => { setEditingMachine(null); setModalOpen(true); }}
          className="bg-primary-600 hover:bg-primary-500 text-white px-5 py-2.5 rounded-lg font-medium transition-colors shadow-lg shadow-primary-500/20"
        >
          + Add Machine
        </button>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        {machines.length === 0 ? (
          <div className="p-12 text-center text-gray-500">No machines found. Add one to get started.</div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-950/50 border-b border-gray-800 text-sm font-medium text-gray-400">
                <th className="py-4 px-6">Name</th>
                <th className="py-4 px-6">Type</th>
                <th className="py-4 px-6">Status</th>
                <th className="py-4 px-6">Current Load</th>
                <th className="py-4 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {machines.map((m) => (
                <tr key={m.id} className="hover:bg-gray-800/50 transition-colors group">
                  <td className="py-4 px-6 font-medium text-gray-200">{m.name}</td>
                  <td className="py-4 px-6 text-gray-400">{m.type}</td>
                  <td className="py-4 px-6">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${m.status === 'Online' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${m.status === 'Online' ? 'bg-green-400' : 'bg-red-400'}`}></span>
                      {m.status}
                    </span>
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                        <div 
                          className={`h-2 rounded-full transition-all duration-500 ${m.currentLoad > 80 ? 'bg-red-500' : 'bg-primary-500'}`} 
                          style={{ width: `${m.currentLoad}%` }}
                        ></div>
                      </div>
                      <span className="text-sm text-gray-400 w-8">{m.currentLoad}%</span>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-right space-x-3">
                    <button onClick={() => toggleMachineStatus(m.id, m.status)} className="text-gray-400 hover:text-white text-sm">Toggle</button>
                    <button onClick={() => handleEdit(m)} className="text-primary-400 hover:text-primary-300 text-sm">Edit</button>
                    <button onClick={() => { if(window.confirm('Delete machine?')) deleteMachine(m.id) }} className="text-red-400 hover:text-red-300 text-sm">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {isModalOpen && (
        <MachineModal 
          onClose={() => setModalOpen(false)} 
          existingData={editingMachine} 
        />
      )}
    </div>
  );
}