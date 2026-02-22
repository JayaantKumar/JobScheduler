import { useMachines } from "../hooks/useMachines";
import { useScheduleBlocks } from "../hooks/useScheduleBlocks";
import { useJobs } from "../hooks/useJobs"; // We need this to get the job data
import { completeProcessBlock } from "../services/scheduler.service"; // Import the new function

const START_HOUR = 8;
const END_HOUR = 20;
const TOTAL_HOURS = END_HOUR - START_HOUR;

const calculateTimelinePosition = (firebaseStartTime, firebaseEndTime) => {
  if (!firebaseStartTime || !firebaseEndTime) return { left: '0%', width: '0%' };
  const start = firebaseStartTime.toDate();
  const end = firebaseEndTime.toDate();
  const startHourFloat = start.getHours() + (start.getMinutes() / 60);
  const endHourFloat = end.getHours() + (end.getMinutes() / 60);
  const clampedStart = Math.max(START_HOUR, Math.min(startHourFloat, END_HOUR));
  const clampedEnd = Math.max(START_HOUR, Math.min(endHourFloat, END_HOUR));
  const leftPercent = ((clampedStart - START_HOUR) / TOTAL_HOURS) * 100;
  const widthPercent = ((clampedEnd - clampedStart) / TOTAL_HOURS) * 100;
  return { left: `${leftPercent}%`, width: `${widthPercent}%` };
};

export default function Scheduler() {
  const { machines, loading: machinesLoading } = useMachines();
  const { blocks, loading: blocksLoading } = useScheduleBlocks();
  const { jobs, loading: jobsLoading } = useJobs();

  if (machinesLoading || blocksLoading || jobsLoading) {
    return <div className="p-8 text-primary-500 animate-pulse font-medium">Loading timeline data...</div>;
  }

  const timeHeaders = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => START_HOUR + i);

  // Handle clicking a block to complete it
  const handleBlockClick = async (block, machine) => {
    if (block.status === "completed") return; // Already done

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
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white">Live Scheduler</h2>
        <p className="text-gray-400 mt-1">Interactive Gantt chart. Click an active block to mark it completed.</p>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 flex-1 flex flex-col overflow-hidden shadow-2xl">
        <div className="flex border-b border-gray-800 bg-gray-950/50">
          <div className="w-48 shrink-0 p-4 font-semibold text-gray-400 border-r border-gray-800">Resource</div>
          <div className="flex-1 relative flex">
            {timeHeaders.map((hour) => (
              <div key={hour} className="flex-1 border-l border-gray-800/50 first:border-l-0 relative h-12">
                <span className="absolute -left-3 top-3 text-xs text-gray-500 font-medium bg-gray-950/80 px-1 z-10">
                  {hour > 12 ? `${hour - 12}PM` : hour === 12 ? '12PM' : `${hour}AM`}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {machines.map(machine => {
            const machineBlocks = blocks.filter(b => b.machine_id === machine.id);

            return (
              <div key={machine.id} className="flex border-b border-gray-800 group hover:bg-gray-800/20 transition-colors">
                <div className="w-48 shrink-0 p-4 border-r border-gray-800 flex flex-col justify-center bg-gray-900 z-10 relative">
                  <span className="text-sm font-medium text-gray-200 truncate">{machine.name}</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-500">{machine.type}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${machine.currentLoad > 80 ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                      {machine.currentLoad || 0}%
                    </span>
                  </div>
                </div>

                <div className="flex-1 relative bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwJSIgaGVpZ2h0PSI0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMSIgaGVpZ2h0PSI0MCIgZmlsbD0icmdiYSgyNTUsIDI1NSwgMjU1LCAwLjA1KSIvPjwvc3ZnPg==')] bg-[length:calc(100%/12)_100%]">
                  {machineBlocks.map(block => {
                    const position = calculateTimelinePosition(block.start_time, block.end_time);
                    const isCompleted = block.status === "completed";
                    
                    return (
                      <div 
                        key={block.id}
                        onClick={() => handleBlockClick(block, machine)}
                        className={`absolute top-2 bottom-2 rounded-md p-2 shadow-lg flex flex-col justify-center overflow-hidden transition-all cursor-pointer group/block ${
                          isCompleted 
                            ? 'bg-green-900/40 border border-green-500/50 hover:bg-green-900/60' // Green if done
                            : 'bg-primary-600/30 border border-primary-500/50 hover:bg-primary-600/50 hover:border-primary-400' // Purple if active
                        }`}
                        style={{ left: position.left, width: position.width, minWidth: '2rem' }}
                      >
                        <span className={`text-xs font-bold truncate ${isCompleted ? 'text-green-300' : 'text-primary-300'}`}>
                          Job {block.job_id?.slice(0, 5)}
                        </span>
                        <span className={`text-[10px] truncate ${isCompleted ? 'text-green-200/70' : 'text-primary-200/70'}`}>
                          {block.process_id}
                        </span>
                        
                        <div className="absolute hidden group-hover/block:block bottom-full mb-2 left-0 bg-gray-800 text-white text-xs p-2 rounded shadow-xl border border-gray-700 w-max z-50">
                          Click to complete<br/>
                          Status: {block.status}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}