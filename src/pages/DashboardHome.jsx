import { useState, useMemo, useEffect } from "react";
import { useJobs } from "../hooks/useJobs";
import ExportDataButton from "../components/ExportDataButton"; 
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/config";
import { useNavigate } from "react-router-dom";

// ⭐️ ROUND 6.2: Bulletproof Local Date Formatting (Ignores UTC shifts)
const toLocalYYYYMMDD = (d) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Safely extracts the intended YYYY-MM-DD from any Firebase date format
const getJobDateStr = (val) => {
  if (!val) return "";
  if (typeof val === 'string') {
      if (val.includes('T')) return val.split('T')[0];
      return val;
  }
  if (val.toDate) return toLocalYYYYMMDD(val.toDate());
  return toLocalYYYYMMDD(new Date(val));
};

// ⭐️ ROUND 6.2: Strict "Current Week" Generator (Monday to Sunday)
const getCurrentWeekDates = () => {
  const today = new Date();
  const dayOfWeek = today.getDay() || 7; // Treat Sunday as 7 instead of 0
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - dayOfWeek + 1);
  
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
};

export default function DashboardHome() {
  const { jobs, loading } = useJobs();
  const navigate = useNavigate();
  
  // ⭐️ ROUND 6.2: Synchronized timeframe state
  const thisWeekDays = useMemo(() => getCurrentWeekDates(), []);
  const todayStr = toLocalYYYYMMDD(new Date());
  
  // Default to today if today is in the current week strip, otherwise default to Monday
  const [selectedDay, setSelectedDay] = useState(() => {
    const todayInWeek = thisWeekDays.find(d => toLocalYYYYMMDD(d) === todayStr);
    return todayInWeek ? todayStr : toLocalYYYYMMDD(thisWeekDays[0]);
  }); 

  const [lowStockCount, setLowStockCount] = useState(0);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "inventoryItems"), (snap) => {
      let count = 0;
      snap.forEach(doc => {
        const item = doc.data();
        if (item.minStock > 0 && (item.balance || 0) <= item.minStock) {
          count++;
        }
      });
      setLowStockCount(count);
    });
    return () => unsub();
  }, []);

  if (loading) return <div className="p-8 text-primary-500 animate-pulse font-medium">Loading Dashboard Data...</div>;

  const activeJobs = jobs.filter(j => j.status !== "completed");
  
  // ⭐️ ROUND 6.2: Synchronized KPI Logic
  const completedToday = jobs.filter(j => j.status === "completed" && getJobDateStr(j.updated_at || j.deadline) === todayStr);
  const ongoingJobs = activeJobs.filter(j => j.process_sequence?.some(p => p.status === "completed"));
  const overdueJobs = activeJobs.filter(j => {
      const jobDate = getJobDateStr(j.deadline);
      return jobDate !== "" && jobDate < todayStr;
  });

  const thisWeekStrings = thisWeekDays.map(toLocalYYYYMMDD);
  const completingThisWeek = activeJobs.filter(j => thisWeekStrings.includes(getJobDateStr(j.deadline)));
  const jobsCompletingSelectedDay = activeJobs.filter(j => getJobDateStr(j.deadline) === selectedDay);

  // Parse YYYY-MM-DD safely for visual display in the Target Header
  const [targetY, targetM, targetD] = selectedDay.split('-');
  const displayDate = new Date(targetY, targetM - 1, targetD);

  return (
    <div className="max-w-[1600px] mx-auto p-4 sm:p-6 h-full flex flex-col space-y-6 sm:space-y-8">
      
      {/* RESPONSIVE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Factory Dashboard</h2>
          <p className="text-sm sm:text-base text-gray-400 mt-1">High-level overview of current production targets.</p>
        </div>
        <div className="w-full sm:w-auto flex">
          <div className="w-full sm:w-auto [&>button]:w-full [&>button]:justify-center">
            <ExportDataButton />
          </div>
        </div>
      </div>

      {/* KPI GRID */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
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
        <div className="bg-red-950/20 border border-red-900/50 rounded-xl p-4 sm:p-5 shadow-lg flex flex-col">
          <span className="text-red-400/80 text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-1 truncate">Overdue</span>
          <span className="text-2xl sm:text-3xl font-black text-red-500">{overdueJobs.length}</span>
        </div>
        
        <div 
          onClick={() => navigate("/dashboard/inventory-management")}
          className="bg-yellow-950/20 border border-yellow-900/50 rounded-xl p-4 sm:p-5 shadow-lg flex flex-col cursor-pointer hover:bg-yellow-950/40 transition-colors group"
        >
          <span className="text-yellow-500/80 text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-1 truncate group-hover:text-yellow-400 transition-colors">Low Stock Alerts</span>
          <span className="text-2xl sm:text-3xl font-black text-yellow-500">{lowStockCount}</span>
        </div>
      </div>

      {/* WEEK PLANNER */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-xl overflow-hidden flex flex-col">
        <div className="p-4 sm:p-5 border-b border-gray-800 bg-[#151724]">
          <h3 className="text-lg font-bold text-white mb-4">Completing This Week</h3>
          <div className="flex gap-2 overflow-x-auto pb-2 snap-x">
            {thisWeekDays.map((dateObj) => {
              const dateString = toLocalYYYYMMDD(dateObj);
              const dayName = dateObj.toLocaleDateString("en-US", { weekday: 'short' });
              const dayNum = dateObj.getDate();
              const isSelected = selectedDay === dateString;

              return (
                <button
                  key={dateString}
                  onClick={() => setSelectedDay(dateString)}
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
              Targets for {displayDate.toLocaleDateString("en-US", { weekday: 'long', month: 'short', day: 'numeric'})}
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