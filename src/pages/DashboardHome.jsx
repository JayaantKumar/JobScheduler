import { useState, useMemo } from "react";
import { useJobs } from "../hooks/useJobs";
import ExportDataButton from "../components/ExportDataButton"; 

const parseDate = (val) => {
  if (!val) return new Date();
  return val.toDate ? val.toDate() : new Date(val);
};

const isToday = (dateObj) => {
  const d = parseDate(dateObj);
  const today = new Date();
  return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
};

const isThisWeek = (dateObj) => {
  const d = parseDate(dateObj);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayOfWeek = today.getDay(); 
  const daysUntilEndOfWeek = dayOfWeek === 0 ? 0 : 7 - dayOfWeek; 
  const endOfWeek = new Date(today);
  endOfWeek.setDate(today.getDate() + daysUntilEndOfWeek);
  endOfWeek.setHours(23, 59, 59, 999);
  return d >= today && d <= endOfWeek;
};

const getNextWeekDays = () => {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysUntilNextMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  const nextMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilNextMonday);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(nextMonday);
    d.setDate(nextMonday.getDate() + i);
    return d;
  });
};

export default function DashboardHome() {
  const { jobs, loading } = useJobs();
  const nextWeekDays = useMemo(() => getNextWeekDays(), []);
  const [selectedNextDay, setSelectedNextDay] = useState(nextWeekDays[0].toISOString().split('T')[0]); 

  if (loading) return <div className="p-8 text-primary-500 animate-pulse font-medium">Loading Dashboard Data...</div>;

  const now = new Date();
  const activeJobs = jobs.filter(j => j.status !== "completed");
  const completedToday = jobs.filter(j => j.status === "completed" && isToday(j.updated_at || j.deadline));
  const completingThisWeek = activeJobs.filter(j => isThisWeek(j.deadline));
  const ongoingJobs = activeJobs.filter(j => j.process_sequence?.some(p => p.status === "completed"));
  const overdueJobs = activeJobs.filter(j => parseDate(j.deadline) < now);

  const jobsCompletingSelectedDay = activeJobs.filter(j => {
    const deadlineDate = parseDate(j.deadline).toISOString().split('T')[0];
    return deadlineDate === selectedNextDay;
  });

  return (
    <div className="max-w-[1600px] mx-auto p-4 sm:p-6 h-full flex flex-col space-y-6 sm:space-y-8">
      
      {/* RESPONSIVE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Factory Dashboard</h2>
          <p className="text-sm sm:text-base text-gray-400 mt-1">High-level overview of current production targets.</p>
        </div>
        <div className="w-full sm:w-auto flex">
          {/* We wrap the export button to ensure it can stretch on mobile if needed */}
          <div className="w-full sm:w-auto [&>button]:w-full [&>button]:justify-center">
            <ExportDataButton />
          </div>
        </div>
      </div>

      {/* KPI GRID (Adjusted for mobile sizes) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5 shadow-lg flex flex-col">
          <span className="text-gray-500 text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-1 truncate">Active Jobs</span>
          <span className="text-2xl sm:text-3xl font-black text-white">{activeJobs.length}</span>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5 shadow-lg flex flex-col">
          <span className="text-gray-500 text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-1 truncate">On-going Jobs</span>
          <span className="text-2xl sm:text-3xl font-black text-blue-400">{ongoingJobs.length}</span>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5 shadow-lg flex flex-col">
          <span className="text-gray-500 text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-1 truncate">Done Today</span>
          <span className="text-2xl sm:text-3xl font-black text-green-400">{completedToday.length}</span>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5 shadow-lg flex flex-col">
          <span className="text-gray-500 text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-1 truncate">Due This Wk</span>
          <span className="text-2xl sm:text-3xl font-black text-primary-400">{completingThisWeek.length}</span>
        </div>
        <div className="bg-red-950/20 border border-red-900/50 rounded-xl p-4 sm:p-5 shadow-lg flex flex-col col-span-2 sm:col-span-1 lg:col-span-1">
          <span className="text-red-400/80 text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-1 truncate">Overdue</span>
          <span className="text-2xl sm:text-3xl font-black text-red-500">{overdueJobs.length}</span>
        </div>
      </div>

      {/* NEXT WEEK PLANNER */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-xl overflow-hidden flex flex-col">
        <div className="p-4 sm:p-5 border-b border-gray-800 bg-[#151724]">
          <h3 className="text-lg font-bold text-white mb-4">Completing Next Week</h3>
          <div className="flex gap-2 overflow-x-auto pb-2 snap-x">
            {nextWeekDays.map((dateObj) => {
              const dateString = dateObj.toISOString().split('T')[0];
              const dayName = dateObj.toLocaleDateString("en-US", { weekday: 'short' });
              const dayNum = dateObj.getDate();
              const isSelected = selectedNextDay === dateString;

              return (
                <button
                  key={dateString}
                  onClick={() => setSelectedNextDay(dateString)}
                  className={`snap-start flex flex-col items-center justify-center min-w-[70px] sm:min-w-[80px] p-2 sm:p-3 rounded-lg border transition-all ${
                    isSelected 
                      ? 'bg-primary-600 border-primary-500 text-white shadow-lg shadow-primary-500/20' 
                      : 'bg-gray-950 border-gray-800 text-gray-400 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  <span className="text-[10px] sm:text-xs uppercase font-bold tracking-wider">{dayName}</span>
                  <span className="text-xl sm:text-2xl font-black mt-1">{dayNum}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h4 className="text-xs sm:text-sm font-bold text-gray-400 uppercase tracking-wider">
              Targets for {new Date(selectedNextDay).toLocaleDateString("en-US", { weekday: 'long', month: 'short', day: 'numeric'})}
            </h4>
            <span className="bg-gray-800 text-white px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap">
              {jobsCompletingSelectedDay.length} Jobs
            </span>
          </div>

          {jobsCompletingSelectedDay.length === 0 ? (
            <div className="py-12 text-center flex flex-col items-center justify-center text-gray-500 border border-dashed border-gray-800 rounded-lg">
              <svg className="w-12 h-12 mb-3 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
              No deadlines fall on this day.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
              {jobsCompletingSelectedDay.map(job => (
                <div key={job.id} className="bg-gray-950 border border-gray-800 rounded-lg p-4 hover:border-gray-600 transition-colors">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] sm:text-xs font-mono text-primary-400 bg-primary-500/10 px-2 py-0.5 rounded uppercase font-bold truncate max-w-[120px]">
                      JOB-{job.id.slice(0,6)}
                    </span>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-400 whitespace-nowrap">
                      {job.status}
                    </span>
                  </div>
                  <h5 className="font-bold text-white truncate text-sm sm:text-base">{job.title || job.product?.name}</h5>
                  <p className="text-xs text-gray-500 mt-1 truncate">{job.customer}</p>
                  
                  <div className="mt-4 pt-3 border-t border-gray-800 flex justify-between items-center text-xs sm:text-sm">
                    <span className="text-gray-400">Target Qty:</span>
                    <span className="text-white font-bold">{job.quantity_target?.toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}