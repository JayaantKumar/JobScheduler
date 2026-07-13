import { useState, useMemo } from "react";
import { useJobs } from "../hooks/useJobs";

export default function Analytics() {
  const [timeRange, setTimeRange] = useState("30days");
  const { jobs, loading } = useJobs();

  // --- SMART CALCULATIONS (ROUND 6.3: SET-LEVEL MATH) ---
  const analyticsData = useMemo(() => {
    if (!jobs || jobs.length === 0) return null;

    const now = new Date();
    const rangeDays = timeRange === "7days" ? 7 : 30;
    const cutoffDate = new Date(now.getTime() - (rangeDays * 24 * 60 * 60 * 1000));

    // Filter jobs created within the selected timeframe
    const filteredJobs = jobs.filter(j => {
      const createdDate = j.created_at?.toDate ? j.created_at.toDate() : new Date(j.created_at || j.deadline);
      return createdDate >= cutoffDate;
    });

    // ⭐️ ROUND 6.3: Group individual part cards into cohesive Sets
    const groupedSets = [];
    const setMap = {};

    filteredJobs.forEach(job => {
      if (job.set_code && job.parts_total > 1) {
        if (!setMap[job.set_code]) setMap[job.set_code] = [];
        setMap[job.set_code].push(job);
      } else {
        groupedSets.push([job]); // Single-part jobs
      }
    });

    Object.values(setMap).forEach(group => groupedSets.push(group));

    // A Set is only "completed" when ALL of its linked part cards are completed
    const completedSets = groupedSets.filter(group => group.every(j => j.status === "completed"));
    
    // 1. Set Completion Rate
    const completionRate = groupedSets.length > 0 
      ? Math.round((completedSets.length / groupedSets.length) * 100) 
      : 0;

    // 2. On-Time Completion
    const onTimeSets = completedSets.filter(group => {
      return group.every(j => {
        const deadline = j.deadline?.toDate ? j.deadline.toDate() : new Date(j.deadline);
        const completedAt = j.updated_at?.toDate ? j.updated_at.toDate() : new Date(j.updated_at || now);
        return completedAt <= deadline;
      });
    });

    const onTimeRate = completedSets.length > 0 
      ? Math.round((onTimeSets.length / completedSets.length) * 100) 
      : 0;

    // 3. Finished Units Target (Sums the base target sets exactly ONCE per grouping)
    const totalVolume = groupedSets.reduce((sum, group) => {
      const firstJob = group[0];
      const isSet = group.length > 1 || (firstJob.parts_total > 1 && firstJob.set_code);
      const groupVolume = isSet ? (Number(firstJob.sets_qty) || 0) : (Number(firstJob.quantity_target) || 0);
      return sum + groupVolume;
    }, 0);

    // 4. Process Bottlenecks (Evaluated purely per card step, as intended)
    const processCounts = {};
    filteredJobs.forEach(job => {
      if (job.status !== "completed" && job.process_sequence) {
        job.process_sequence.forEach(step => {
          if (step.status !== "completed") {
            const name = step.process_name || "Unknown";
            processCounts[name] = (processCounts[name] || 0) + 1;
          }
        });
      }
    });

    const bottlenecks = Object.entries(processCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5); 

    return {
      totalSets: groupedSets.length,
      completedSets: completedSets.length,
      completionRate,
      onTimeRate,
      totalVolume,
      bottlenecks
    };
  }, [jobs, timeRange]);

  if (loading) return <div className="p-8 text-primary-500 animate-pulse font-medium">Loading Analytics...</div>;

  return (
    <div className="max-w-[1600px] mx-auto p-6 h-full flex flex-col">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-bold text-white flex items-center gap-3">
            <svg className="w-8 h-8 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            Performance Analytics
          </h2>
          <p className="text-gray-400 mt-1">Analyze live production data based on factory output.</p>
        </div>
        
        <div className="flex bg-gray-900 border border-gray-800 rounded-lg p-1 shrink-0">
          <button 
            onClick={() => setTimeRange("7days")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${timeRange === "7days" ? "bg-gray-800 text-white" : "text-gray-400 hover:text-white"}`}
          >
            Last 7 Days
          </button>
          <button 
            onClick={() => setTimeRange("30days")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${timeRange === "30days" ? "bg-primary-600 text-white shadow-lg shadow-primary-500/20" : "text-gray-400 hover:text-white"}`}
          >
            Last 30 Days
          </button>
        </div>
      </div>

      {analyticsData ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex items-start gap-4 shadow-lg">
              <div className="w-12 h-12 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0 border border-blue-500/20 mt-1">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div>
                <div className="text-gray-400 text-sm font-medium mb-1">Set Completion Rate</div>
                <div className="text-3xl font-bold text-white">{analyticsData.completionRate}%</div>
                <div className="text-xs text-gray-500 mt-1">{analyticsData.completedSets} of {analyticsData.totalSets} sets finished</div>
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex items-start gap-4 shadow-lg">
              <div className="w-12 h-12 rounded-full bg-green-500/10 text-green-500 flex items-center justify-center shrink-0 border border-green-500/20 mt-1">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div>
                <div className="text-gray-400 text-sm font-medium mb-1">On-Time Delivery</div>
                <div className="text-3xl font-bold text-white">{analyticsData.onTimeRate}%</div>
                <div className="text-xs text-gray-500 mt-1">Sets completed before deadline</div>
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex items-start gap-4 shadow-lg">
              <div className="w-12 h-12 rounded-full bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0 border border-purple-500/20 mt-1">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
              </div>
              <div>
                <div className="text-gray-400 text-sm font-medium mb-1">Finished Units Target</div>
                <div className="text-3xl font-bold text-white">{analyticsData.totalVolume.toLocaleString()}</div>
                <div className="text-xs text-gray-500 mt-1">Expected boxes to dispatch</div>
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex items-start gap-4 shadow-lg">
              <div className="w-12 h-12 rounded-full bg-yellow-500/10 text-yellow-400 flex items-center justify-center shrink-0 border border-yellow-500/20 mt-1">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </div>
              <div>
                <div className="text-gray-400 text-sm font-medium mb-1">Active Workload</div>
                <div className="text-3xl font-bold text-white">{analyticsData.totalSets - analyticsData.completedSets}</div>
                <div className="text-xs text-gray-500 mt-1">Master sets currently in progress</div>
              </div>
            </div>

          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6 flex-1">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg flex flex-col">
              <h3 className="text-lg font-bold text-white mb-4">Process Bottlenecks (Pending Steps)</h3>
              <p className="text-sm text-gray-400 mb-6">Identifies which manual processes currently have the most pending work across the factory floor.</p>
              
              {analyticsData.bottlenecks.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-gray-500 text-sm border border-dashed border-gray-800 rounded-lg">
                  No pending processes. Factory floor is clear!
                </div>
              ) : (
                <div className="space-y-4">
                  {analyticsData.bottlenecks.map(([processName, count], idx) => {
                    const maxCount = analyticsData.bottlenecks[0][1];
                    const percent = Math.round((count / maxCount) * 100);
                    
                    return (
                      <div key={processName}>
                        <div className="flex justify-between text-sm mb-1.5">
                          <span className="text-gray-300 font-medium">{processName}</span>
                          <span className="text-gray-400">{count} pending steps</span>
                        </div>
                        <div className="h-2.5 w-full bg-gray-800 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${idx === 0 ? 'bg-red-500' : idx === 1 ? 'bg-orange-500' : 'bg-primary-500'}`} 
                            style={{ width: `${percent}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg flex flex-col">
              <h3 className="text-lg font-bold text-white mb-4">Factory Pulse</h3>
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border border-gray-800 rounded-xl bg-gray-950/50">
                <svg className="w-16 h-16 text-gray-700 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <h4 className="text-white font-bold text-lg mb-2">Analyzing {analyticsData.totalSets} Sets</h4>
                <p className="text-gray-400 text-sm">
                  Metrics are generated dynamically based on active job creation, process completion, and missed deadlines.
                </p>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-500 mt-12">
          No job data available for this time range.
        </div>
      )}
    </div>
  );
}