import { useState } from "react";
import { useMachines } from "../hooks/useMachines";
import { useScheduleBlocks } from "../hooks/useScheduleBlocks";
import { useJobs } from "../hooks/useJobs"; 
import { completeProcessBlock } from "../services/scheduler.service"; 

const START_HOUR = 7;
const END_HOUR = 22;
const TOTAL_HOURS = END_HOUR - START_HOUR;

// Completely upgraded calculator that handles BOTH "Day" (Hours) and "Week" (Days) math
const calculateTimelinePosition = (firebaseStartTime, firebaseEndTime, selectedDate, viewMode) => {
  if (!firebaseStartTime || !firebaseEndTime) return { visible: false };
  
  const start = firebaseStartTime.toDate();
  const end = firebaseEndTime.toDate();
  
  if (viewMode === "Day") {
    // Exact Day Match
    const isSameDay = start.getDate() === selectedDate.getDate() && 
                      start.getMonth() === selectedDate.getMonth() && 
                      start.getFullYear() === selectedDate.getFullYear();
                      
    if (!isSameDay) return { visible: false };

    const startHourFloat = start.getHours() + (start.getMinutes() / 60);
    const endHourFloat = end.getHours() + (end.getMinutes() / 60);
    
    const clampedStart = Math.max(START_HOUR, Math.min(startHourFloat, END_HOUR));
    const clampedEnd = Math.max(START_HOUR, Math.min(endHourFloat, END_HOUR));
    
    const leftPercent = ((clampedStart - START_HOUR) / TOTAL_HOURS) * 100;
    const widthPercent = ((clampedEnd - clampedStart) / TOTAL_HOURS) * 100;
    
    return { left: `${leftPercent}%`, width: `${widthPercent}%`, visible: true };
  } 
  else {
    // Week Match (7 Days)
    const weekEnd = new Date(selectedDate);
    weekEnd.setDate(weekEnd.getDate() + 7);

    // If block is entirely before this week or entirely after, hide it
    if (end < selectedDate || start >= weekEnd) return { visible: false };

    // Calculate percentage based on 7 days (7 * 24 hours)
    const startDiffDays = (start.getTime() - selectedDate.getTime()) / (1000 * 60 * 60 * 24);
    const endDiffDays = (end.getTime() - selectedDate.getTime()) / (1000 * 60 * 60 * 24);

    const clampedStart = Math.max(0, startDiffDays);
    const clampedEnd = Math.min(7, endDiffDays);

    const leftPercent = (clampedStart / 7) * 100;
    const widthPercent = ((clampedEnd - clampedStart) / 7) * 100;

    return { left: `${leftPercent}%`, width: `${widthPercent}%`, visible: true };
  }
};

export default function Scheduler() {
  const { machines, loading: machinesLoading } = useMachines();
  const { blocks, loading: blocksLoading } = useScheduleBlocks();
  const { jobs, loading: jobsLoading } = useJobs();
  
  // New States
  const [viewMode, setViewMode] = useState("Day"); // "Day" or "Week"
  
  // Guarantee selectedDate is always strictly at Midnight to avoid Timezone bugs
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  if (machinesLoading || blocksLoading || jobsLoading) {
    return <div className="p-8 text-primary-500 animate-pulse font-medium">Loading timeline data...</div>;
  }

  // Generate Headers dynamically based on View Mode
  const timeHeaders = viewMode === "Day" 
    ? Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => START_HOUR + i) // Hour numbers
    : Array.from({ length: 7 }, (_, i) => {                             // Date objects
        const d = new Date(selectedDate);
        d.setDate(d.getDate() + i);
        return d;
      });

  // --- Date Navigation Handlers ---
  const handlePrev = () => {
    const prev = new Date(selectedDate);
    prev.setDate(prev.getDate() - (viewMode === "Week" ? 7 : 1));
    setSelectedDate(prev);
  };

  const handleNext = () => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + (viewMode === "Week" ? 7 : 1));
    setSelectedDate(next);
  };

  const handleToday = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Strip the time to prevent UTC shifting
    setSelectedDate(today);
  };

  // Safely format date for the HTML input WITHOUT triggering UTC timezone shifts
  const year = selectedDate.getFullYear();
  const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
  const day = String(selectedDate.getDate()).padStart(2, '0');
  const formattedDateForInput = `${year}-${month}-${day}`;

  const handleDateChange = (e) => {
    if (e.target.value) {
      const [y, m, d] = e.target.value.split('-');
      setSelectedDate(new Date(y, m - 1, d)); // Months are 0-indexed in JS!
    }
  };

  // Block Interaction
  const handleBlockClick = async (block, machine) => {
    if (block.status === "completed") return; 

    const parentJob = jobs.find(j => j.id === block.job_id);
    if (!parentJob) return alert("Could not find the parent job for this block.");

    if (window.confirm(`Mark ${block.process_id} for Job ${block.job_id.slice(0,5)} as Completed? This will free up machine capacity.`)) {
      try {
        await completeProcessBlock(block, machine, parentJob);
      } catch (error) {
        alert("Failed to complete process: " + error.message);
      }
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto p-6 h-full flex flex-col">
      
      {/* Header & Controls */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Live Scheduler</h2>
          <p className="text-gray-400 mt-1 text-sm">Click a machine to manage its daily schedule.</p>
        </div>

        {/* Calendar Navigation Controls */}
        <div className="flex items-center gap-3 overflow-x-auto pb-2 xl:pb-0">
          
          {/* Day / Week Toggle */}
          <div className="flex bg-gray-900 border border-gray-800 rounded-lg p-1 shrink-0">
            <button 
              onClick={() => setViewMode("Day")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'Day' ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/20' : 'text-gray-400 hover:text-white'}`}
            >
              Day
            </button>
            <button 
              onClick={() => setViewMode("Week")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'Week' ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/20' : 'text-gray-400 hover:text-white'}`}
            >
              Week
            </button>
          </div>

          {/* Date Selector */}
          <div className="flex items-center bg-gray-900 border border-gray-800 rounded-lg shrink-0 overflow-hidden">
            <button onClick={handlePrev} className="px-3 py-2 text-gray-400 hover:text-white hover:bg-gray-800 border-r border-gray-800 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
            
            <input 
              type="date" 
              value={formattedDateForInput}
              onChange={handleDateChange}
              className="bg-transparent text-white px-3 py-1.5 text-sm font-medium focus:outline-none [color-scheme:dark] cursor-pointer"
            />
            
            <button onClick={handleNext} className="px-3 py-2 text-gray-400 hover:text-white hover:bg-gray-800 border-l border-gray-800 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>

          <button onClick={handleToday} className="bg-gray-800 hover:bg-gray-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors shrink-0">
            Today
          </button>

          <button className="bg-primary-500/10 text-primary-400 border border-primary-500/30 hover:bg-primary-500/20 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shrink-0">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zM12 2a1 1 0 01.967.744L14.146 7.2 17.5 8.4a1 1 0 010 1.9l-3.354 1.2-1.18 4.456a1 1 0 01-1.933 0L9.854 11.5 6.5 10.3a1 1 0 010-1.9l3.354-1.2 1.18-4.456A1 1 0 0112 2z" clipRule="evenodd" /></svg>
            AI Daily Plan
          </button>
        </div>
      </div>

      {/* Gantt Chart Container */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 flex-1 flex flex-col overflow-hidden shadow-2xl">
        
        {/* ADDED THIS WRAPPER: Makes the Gantt chart swipeable on phones */}
        <div className="overflow-x-auto flex-1 flex flex-col">
          <div className="min-w-[900px] flex-1 flex flex-col">
            
            {/* Time Markers Header */}
            <div className="flex border-b border-gray-800 bg-gray-950/50 shrink-0">
              <div className="w-56 shrink-0 p-4 font-semibold text-gray-400 border-r border-gray-800 text-sm">
                Machines
              </div>
              <div className="flex-1 relative flex">
                {viewMode === "Day" ? (
                  timeHeaders.map((hour) => (
                    <div key={hour} className="flex-1 border-l border-gray-800/50 first:border-l-0 relative h-12">
                      <span className="absolute -left-4 top-3 text-xs text-gray-500 font-medium bg-gray-950/80 px-1 z-10 w-8 text-center">
                        {hour > 12 ? `${hour - 12} PM` : hour === 12 ? '12 PM' : `${hour} AM`}
                      </span>
                    </div>
                  ))
                ) : (
                  timeHeaders.map((date, idx) => (
                    <div key={idx} className="flex-1 border-l border-gray-800/50 first:border-l-0 relative h-12">
                      <span className="absolute -left-10 top-3 text-xs text-gray-500 font-medium bg-gray-950/80 px-1 z-10 w-20 text-center">
                        {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Gantt Swimlanes */}
            <div className="flex-1 overflow-y-auto">
              {machines.map(machine => {
                const machineBlocks = blocks.filter(b => b.machine_id === machine.id);

                return (
                  <div key={machine.id} className="flex border-b border-gray-800 group hover:bg-gray-800/20 transition-colors min-h-[80px]">
                    
                    {/* Machine Sidebar */}
                    <div className="w-56 shrink-0 p-4 border-r border-gray-800 flex flex-col justify-center bg-gray-900 z-10 relative">
                      <span className="text-sm font-medium text-gray-200 truncate">{machine.name}</span>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-500 truncate">{machine.type}</span>
                        {machine.currentLoad > 0 && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${machine.currentLoad > 80 ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                            {machine.currentLoad}%
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Timeline Grid Background (Dynamic sizing based on viewMode) */}
                    <div 
                      className="flex-1 relative bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwJSIgaGVpZ2h0PSI0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMSIgaGVpZ2h0PSI0MCIgZmlsbD0icmdiYSgyNTUsIDI1NSwgMjU1LCAwLjA1KSIvPjwvc3ZnPg==')] z-0"
                      style={{ backgroundSize: viewMode === "Day" ? "calc(100%/15) 100%" : "calc(100%/7) 100%" }}
                    >
                      
                      {/* Schedule Blocks */}
                      {machineBlocks.map(block => {
                        const position = calculateTimelinePosition(block.start_time, block.end_time, selectedDate, viewMode);
                        
                        if (!position.visible) return null; 

                        const isCompleted = block.status === "completed";
                        
                        return (
                          <div 
                            key={block.id}
                            onClick={() => handleBlockClick(block, machine)}
                            className={`absolute top-2 bottom-2 rounded-md p-2 shadow-lg flex flex-col justify-center overflow-hidden transition-all cursor-pointer group/block ${
                              isCompleted 
                                ? 'bg-green-900/40 border border-green-500/50 hover:bg-green-900/60' 
                                : 'bg-primary-600/30 border border-primary-500/50 hover:bg-primary-600/50 hover:border-primary-400' 
                            }`}
                            style={{ left: position.left, width: position.width, minWidth: '3rem' }}
                          >
                            <div className="flex items-center gap-1 mb-0.5">
                              {isCompleted ? (
                                <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                              ) : (
                                <svg className="w-3 h-3 text-primary-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
                              )}
                              <span className={`text-[10px] font-bold uppercase tracking-wider ${isCompleted ? 'text-green-300' : 'text-primary-300'}`}>
                                {isCompleted ? 'Done' : (viewMode === "Day" ? 'Day' : 'Active')}
                              </span>
                            </div>
                            <span className={`text-xs font-bold truncate ${isCompleted ? 'text-green-100' : 'text-white'}`}>
                              Job {block.job_id?.slice(0, 5)}
                            </span>
                            
                            <div className="absolute hidden group-hover/block:block bottom-full mb-2 left-0 bg-gray-800 text-white text-xs p-2 rounded shadow-xl border border-gray-700 w-max z-50">
                              Click to complete<br/>
                              Process: {block.process_id}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {machines.length === 0 && (
                <div className="p-8 text-center text-gray-500">No machines found. Go to Machine Management to add resources.</div>
              )}
            </div>

          </div>
        </div>
        
      </div>
    </div>
  );
}