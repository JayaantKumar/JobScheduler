import { useMachines } from "../hooks/useMachines";
import { useJobs } from "../hooks/useJobs";
// import { useScheduleBlocks } from "../hooks/useScheduleBlocks"; // Not strictly needed for this specific UI

export default function DashboardHome() {
  const { machines, loading: mLoading } = useMachines();
  const { jobs, loading: jLoading } = useJobs();

  if (mLoading || jLoading) {
    return <div className="p-8 text-primary-500 animate-pulse font-medium">Loading command center...</div>;
  }

  // --- Metric Calculations ---
  
  // 1. Jobs Stats
  const activeJobs = jobs.filter(j => j.status === 'pending' || j.status === 'scheduled');
  const inProgressCount = activeJobs.filter(j => j.status === 'scheduled').length;
  const completedJobs = jobs.filter(j => j.status === 'completed');
  
  // 2. Machine Stats
  const onlineMachinesCount = machines.filter(m => m.status === 'Online').length;
  const avgLoad = machines.length > 0 
    ? Math.round(machines.reduce((acc, m) => acc + (m.currentLoad || 0), 0) / machines.length) 
    : 0;
    
  // 3. Alerts (Simulated by checking for offline machines or high load)
  const offlineMachines = machines.filter(m => m.status === 'Offline');
  const overloadedMachines = machines.filter(m => (m.currentLoad || 0) > 90);
  const criticalAlertsCount = offlineMachines.length + overloadedMachines.length;

  // 4. High Priority Jobs (Sort active jobs by deadline, grab the closest 3)
  const highPriorityJobs = [...activeJobs]
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
    .slice(0, 3);

  return (
    <div className="max-w-[1600px] mx-auto p-6">
      {/* Header matching the screenshot */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-white tracking-tight">Dashboard</h2>
        <p className="text-gray-400 mt-1">A high-level overview of your production floor.</p>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        
        {/* Card 1: Active Jobs */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex items-center gap-5 shadow-lg">
          <div className="w-14 h-14 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0 border border-purple-500/20">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </div>
          <div>
            <div className="text-gray-400 text-sm font-medium mb-0.5">Active Jobs</div>
            <div className="text-3xl font-bold text-white">{activeJobs.length}</div>
            <div className="text-xs text-gray-500 mt-1">{inProgressCount} in progress</div>
          </div>
        </div>

        {/* Card 2: Avg Machine Utilization */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex items-center gap-5 shadow-lg">
          <div className="w-14 h-14 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/20">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
          </div>
          <div>
            <div className="text-gray-400 text-sm font-medium mb-0.5">Avg. Machine Utilization</div>
            <div className="text-3xl font-bold text-white">{avgLoad}%</div>
            <div className="text-xs text-gray-500 mt-1">{onlineMachinesCount} machines online</div>
          </div>
        </div>

        {/* Card 3: Completed Today */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex items-center gap-5 shadow-lg">
          <div className="w-14 h-14 rounded-xl bg-green-500/10 text-green-400 flex items-center justify-center shrink-0 border border-green-500/20">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <div className="text-gray-400 text-sm font-medium mb-0.5">Completed Today</div>
            <div className="text-3xl font-bold text-white">{completedJobs.length}</div>
            <div className="text-xs text-gray-500 mt-1">Jobs finished since midnight</div>
          </div>
        </div>

        {/* Card 4: Critical Alerts */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex items-center gap-5 shadow-lg">
          <div className="w-14 h-14 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center shrink-0 border border-red-500/20">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <div className="text-gray-400 text-sm font-medium mb-0.5">Critical Alerts</div>
            <div className="text-3xl font-bold text-white">{criticalAlertsCount}</div>
            <div className="text-xs text-gray-500 mt-1">Machine breakdowns</div>
          </div>
        </div>

      </div>

      {/* Bottom Panels Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        
        {/* Recent Alerts Panel */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg flex flex-col">
          <h3 className="text-lg font-bold text-white mb-6">Recent Alerts</h3>
          
          <div className="flex-1 flex flex-col gap-3">
            {criticalAlertsCount === 0 ? (
              <div className="flex-1 flex items-center justify-center text-gray-500 text-sm italic min-h-[150px]">
                No active alerts. Factory is operating normally.
              </div>
            ) : (
              <>
                {offlineMachines.map(m => (
                  <div key={`off-${m.id}`} className="bg-gray-950 border border-red-900/30 border-l-2 border-l-red-500 rounded-lg p-4 flex justify-between items-center">
                    <div>
                      <div className="text-white font-medium text-sm">{m.name} is Offline</div>
                      <div className="text-gray-500 text-xs mt-0.5">Requires maintenance check</div>
                    </div>
                    <span className="text-xs font-bold text-red-400 bg-red-500/10 px-2 py-1 rounded">Urgent</span>
                  </div>
                ))}
                {overloadedMachines.map(m => (
                  <div key={`load-${m.id}`} className="bg-gray-950 border border-orange-900/30 border-l-2 border-l-orange-500 rounded-lg p-4 flex justify-between items-center">
                    <div>
                      <div className="text-white font-medium text-sm">{m.name} Overloaded</div>
                      <div className="text-gray-500 text-xs mt-0.5">Current load at {m.currentLoad}%</div>
                    </div>
                    <span className="text-xs font-bold text-orange-400 bg-orange-500/10 px-2 py-1 rounded">Warning</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* High Priority Jobs Panel */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg flex flex-col">
          <h3 className="text-lg font-bold text-white mb-6">High Priority Jobs</h3>
          
          <div className="flex-1 flex flex-col gap-3">
            {highPriorityJobs.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-gray-500 text-sm italic min-h-[150px]">
                No pending or scheduled jobs in the queue.
              </div>
            ) : (
              highPriorityJobs.map(job => (
                <div key={job.id} className="bg-gray-950 border border-gray-800 rounded-lg p-4 transition-colors hover:border-gray-700">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-white font-medium">
                        {job.product?.name} <span className="text-red-400 text-xs ml-1 font-mono">(JOB-{job.id.slice(0,6).toUpperCase()})</span>
                      </div>
                      <div className="text-gray-500 text-xs mt-1">
                        Due: {new Date(job.deadline).toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' })}
                      </div>
                    </div>
                    <span className={`text-[10px] px-2 py-1 rounded-full uppercase font-bold tracking-wider ${
                      job.status === 'scheduled' ? 'bg-blue-500/10 text-blue-400' : 'bg-yellow-500/10 text-yellow-400'
                    }`}>
                      {job.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}