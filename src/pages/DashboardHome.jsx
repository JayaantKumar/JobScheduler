import { useMachines } from "../hooks/useMachines";
import { useJobs } from "../hooks/useJobs";
import { useScheduleBlocks } from "../hooks/useScheduleBlocks";

export default function DashboardHome() {
  const { machines, loading: mLoading } = useMachines();
  const { jobs, loading: jLoading } = useJobs();
  const { blocks, loading: bLoading } = useScheduleBlocks();

  if (mLoading || jLoading || bLoading) {
    return <div className="p-8 text-primary-500 animate-pulse font-medium">Loading command center...</div>;
  }

  // --- KPI Calculations ---
  
  // Machine Stats
  const onlineMachines = machines.filter(m => m.status === 'Online').length;
  const avgLoad = machines.length > 0 
    ? Math.round(machines.reduce((acc, m) => acc + (m.currentLoad || 0), 0) / machines.length) 
    : 0;

  // Job Stats
  const activeJobs = jobs.filter(j => j.status === 'pending' || j.status === 'scheduled').length;
  // (Removed the unused completedJobs variable here)
  
  // Process Stats (Blocks)
  const completedBlocks = blocks.filter(b => b.status === 'completed').length;
  const completionRate = blocks.length > 0 ? Math.round((completedBlocks / blocks.length) * 100) : 0;

  // Recent Activity (Last 5 completed blocks)
  const recentActivity = [...blocks]
    .filter(b => b.status === 'completed')
    // Assuming we have updated_at, but we'll sort by start_time for the Gantt logic we used
    .sort((a, b) => b.start_time?.toMillis() - a.start_time?.toMillis()) 
    .slice(0, 5);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white">Factory Overview</h2>
        <p className="text-gray-400 mt-1">Real-time telemetry and production analytics.</p>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg">
          <div className="text-gray-500 text-sm font-medium mb-1">Fleet Status</div>
          <div className="text-3xl font-bold text-white flex items-end gap-2">
            {onlineMachines} <span className="text-base font-normal text-gray-500 mb-1">/ {machines.length} Online</span>
          </div>
          <div className="mt-4 h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full" style={{ width: `${(onlineMachines/machines.length)*100}%` }}></div>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg">
          <div className="text-gray-500 text-sm font-medium mb-1">Active Production</div>
          <div className="text-3xl font-bold text-white flex items-end gap-2">
            {activeJobs} <span className="text-base font-normal text-gray-500 mb-1">Jobs</span>
          </div>
          <div className="mt-4 flex gap-1">
            <span className="text-xs font-medium text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
              {jobs.filter(j=>j.status === 'scheduled').length} Scheduled
            </span>
            <span className="text-xs font-medium text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded border border-yellow-500/20">
              {jobs.filter(j=>j.status === 'pending').length} Pending
            </span>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg">
          <div className="text-gray-500 text-sm font-medium mb-1">Average Floor Load</div>
          <div className="text-3xl font-bold text-white flex items-end gap-2">
            {avgLoad}%
          </div>
          <div className="mt-4 h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${avgLoad > 80 ? 'bg-red-500' : 'bg-primary-500'}`} style={{ width: `${avgLoad}%` }}></div>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg">
          <div className="text-gray-500 text-sm font-medium mb-1">Process Completion</div>
          <div className="text-3xl font-bold text-white flex items-end gap-2">
            {completionRate}%
          </div>
          <div className="mt-4 text-xs text-gray-400">
            {completedBlocks} of {blocks.length} scheduled blocks finished.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        
        {/* Left Column: Machine Workload Bar Chart (Custom CSS) */}
        <div className="col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg">
          <h3 className="text-lg font-bold text-white mb-6">Machine Utilization Breakdown</h3>
          <div className="space-y-4">
            {machines.map(machine => (
              <div key={machine.id}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-300 font-medium">{machine.name}</span>
                  <span className={machine.currentLoad > 80 ? 'text-red-400' : 'text-primary-400'}>
                    {machine.currentLoad || 0}%
                  </span>
                </div>
                <div className="h-2 w-full bg-gray-800 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-1000 ${
                      machine.currentLoad > 80 ? 'bg-red-500' : 
                      machine.currentLoad === 0 ? 'bg-gray-600' : 'bg-primary-500'
                    }`} 
                    style={{ width: `${machine.currentLoad || 0}%` }}
                  ></div>
                </div>
              </div>
            ))}
            {machines.length === 0 && <div className="text-gray-500 text-sm">No machines configured.</div>}
          </div>
        </div>

        {/* Right Column: Recent Activity Feed */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg">
          <h3 className="text-lg font-bold text-white mb-6">Recent Completions</h3>
          <div className="space-y-4">
            {recentActivity.length === 0 ? (
              <div className="text-gray-500 text-sm">No recent activity.</div>
            ) : (
              recentActivity.map(block => {
                const machine = machines.find(m => m.id === block.machine_id);
                return (
                  <div key={block.id} className="flex gap-4 items-start pb-4 border-b border-gray-800 last:border-0 last:pb-0">
                    <div className="w-8 h-8 rounded-full bg-green-500/10 text-green-500 flex items-center justify-center shrink-0 border border-green-500/20">
                      ✓
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-200">
                        {block.process_id} finished
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        Job {block.job_id.slice(0,5)} • {machine?.name || 'Unknown Machine'}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>
    </div>
  );
}