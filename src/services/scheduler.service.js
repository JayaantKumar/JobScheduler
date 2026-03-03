import { collection, getDocs, doc, writeBatch, Timestamp } from "firebase/firestore";
import { db } from "../firebase/config";

export const autoScheduleJob = async (job) => {
  // 1. Fetch all machines to see who is online
  const machinesSnap = await getDocs(collection(db, "machines"));
  const allMachines = machinesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  // We only want to schedule on machines that are actually running
  const onlineMachines = allMachines.filter(m => m.status === "Online");

  // 2. Fetch existing schedule blocks to avoid double-booking (used for advanced logic later)
  const blocksSnap = await getDocs(collection(db, "schedule_blocks"));
  const allBlocks = blocksSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const batch = writeBatch(db);
  let currentTime = new Date(); // Start scheduling from right now

  const updatedSequence = [];

  for (const step of job.process_sequence) {
    if (step.status === "completed") {
      updatedSequence.push(step);
      continue; // Skip steps that are already done
    }

    // ==========================================
    // 🧠 THE MAGIC: MACHINE SELECTION LOGIC
    // ==========================================
    let selectedMachine = null;

    // SCENARIO A: The Manager Forced a Specific Machine (Point L)
    if (step.assigned_machine_id) {
      selectedMachine = allMachines.find(m => m.id === step.assigned_machine_id);
      
      // Safety Check: What if they assigned it, but it broke down yesterday?
      if (!selectedMachine || selectedMachine.status !== "Online") {
        throw new Error(`The pre-assigned machine for ${step.process_name} (${selectedMachine?.name || 'Unknown'}) is currently Offline or in Maintenance. Please clear the schedule or assign a new machine.`);
      }
    } 
    // SCENARIO B: Let the AI Decide (Load Balancing)
    else {
      // Find all online machines that match this process type
      const capableMachines = onlineMachines.filter(m => 
        m.type?.toLowerCase().includes(step.process_name.toLowerCase()) || 
        step.process_name.toLowerCase().includes(m.type?.toLowerCase())
      );

      if (capableMachines.length === 0) {
        throw new Error(`No online machines available to handle process: ${step.process_name}. Please add a machine or bring one online.`);
      }

      // AI Decision: Pick the capable machine with the FEWEST current jobs assigned to it
      selectedMachine = capableMachines.sort((a, b) => {
        const aJobs = allBlocks.filter(blk => blk.machine_id === a.id).length;
        const bJobs = allBlocks.filter(blk => blk.machine_id === b.id).length;
        return aJobs - bJobs;
      })[0];
    }

    // ==========================================
    // ⏱️ CALCULATE THE TIMESTAMPS
    // ==========================================
    const setupMins = parseInt(step.setup_mins) || 0;
    const runMins = parseInt(step.run_mins) || 0;
    const holdMins = parseInt(step.hold) || 0; 
    const totalDurationMins = setupMins + runMins + holdMins;

    // Ensure we don't accidentally schedule in the past
    const now = new Date();
    if (currentTime < now) currentTime = now;

    const startTime = new Date(currentTime);
    const endTime = new Date(startTime.getTime() + totalDurationMins * 60000); // Add minutes

    // Advance the timeline clock so the NEXT step starts exactly when this step finishes
    currentTime = new Date(endTime);

    // ==========================================
    // 💾 SAVE TO FIREBASE DATABASE
    // ==========================================
    
    // Create the visual block for the Gantt Chart (Live Scheduler)
    const blockRef = doc(collection(db, "schedule_blocks"));
    batch.set(blockRef, {
      job_id: job.id,
      process_id: step.process_name,
      machine_id: selectedMachine.id,
      start_time: Timestamp.fromDate(startTime),
      end_time: Timestamp.fromDate(endTime),
      status: "scheduled",
      created_at: Timestamp.now()
    });

    // Update the Job Card's sequence with the new times and the chosen machine
    updatedSequence.push({
      ...step,
      status: "scheduled",
      assigned_machine_id: selectedMachine.id,
      assigned_machine_name: selectedMachine.name,
      scheduled_start: Timestamp.fromDate(startTime),
      scheduled_end: Timestamp.fromDate(endTime)
    });
  }

  // Finally, update the main Job document from "Pending" to "Scheduled"
  const jobRef = doc(db, "jobs", job.id);
  batch.update(jobRef, {
    status: "scheduled",
    process_sequence: updatedSequence,
    updated_at: Timestamp.now()
  });

  // Push all changes to Firebase at the exact same time
  await batch.commit();
};

// ==========================================
// ✅ FUNCTION TO MARK A STEP AS COMPLETED 
// (Used in your Live Scheduler Gantt Chart)
// ==========================================
export const completeProcessBlock = async (block, machine, parentJob) => {
  const batch = writeBatch(db);
  
  // 1. Mark the visual block as completed
  const blockRef = doc(db, "schedule_blocks", block.id);
  batch.update(blockRef, { status: "completed" });

  // 2. Mark the specific step inside the Job Card as completed
  const updatedSequence = parentJob.process_sequence.map(step => {
    if (step.process_name === block.process_id && step.assigned_machine_id === machine.id) {
      return { ...step, status: "completed" };
    }
    return step;
  });

  // Check if ALL steps are now completed
  const allDone = updatedSequence.every(s => s.status === "completed");

  const jobRef = doc(db, "jobs", parentJob.id);
  batch.update(jobRef, {
    process_sequence: updatedSequence,
    status: allDone ? "completed" : parentJob.status,
    updated_at: Timestamp.now()
  });

  await batch.commit();
};