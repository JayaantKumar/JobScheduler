import { doc, collection, writeBatch, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase/config";

/**
 * CORE ENGINE: Batched Write for Job Scheduling
 * Updates Job array, creates Schedule Block, and updates Machine Load simultaneously.
 */
export const executeLiveSchedule = async (
  jobId, 
  machineId, 
  operatorId, 
  processStep, // The specific step object from the job's process_sequence
  startTime, 
  endTime,
  newMachineLoad
) => {
  const batch = writeBatch(db);

  // 1. References
  const jobRef = doc(db, "jobs", jobId);
  const machineRef = doc(db, "machines", machineId);
  const newBlockRef = doc(collection(db, "schedule_blocks")); // Auto-generates ID

  // 2. Fetch current job to update the specific process_sequence array
  const jobSnap = await getDoc(jobRef);
  if (!jobSnap.exists()) throw new Error("Job not found");
  
  const jobData = jobSnap.data();
  const updatedSequence = jobData.process_sequence.map(step => {
    if (step.process_id === processStep.process_id) {
      return {
        ...step,
        status: "scheduled",
        assigned_machine_id: machineId,
        assigned_operator_id: operatorId,
        scheduled_start: startTime,
        scheduled_end: endTime
      };
    }
    return step;
  });

  // 3. Queue Batch Operations
  
  // Op A: Update the Job's sequence and status
  batch.update(jobRef, { 
    process_sequence: updatedSequence,
    status: "scheduled",
    updated_at: new Date()
  });

  // Op B: Create the flat Schedule Block
  batch.set(newBlockRef, {
    machine_id: machineId,
    job_id: jobId,
    operator_id: operatorId,
    process_id: processStep.process_id,
    start_time: startTime,
    end_time: endTime,
    status: "planned",
    yield_actual: 0
  });

  // Op C: Update the Machine's load capacity
  batch.update(machineRef, {
    currentLoad: newMachineLoad, // Note: adjusted to match your completeProcessBlock naming
    updated_at: new Date()
  });

  // 4. Commit all or nothing
  await batch.commit();
  console.log("Batched Schedule Execution Successful!");
};

/**
 * The CORE ENGINE Allocation Algorithm
 * Finds the next pending process, assigns an optimal machine, and calculates time slots.
 */
export const autoScheduleJob = async (job) => {
  // 1. Find the next pending step in the sequence
  const nextStep = job.process_sequence.find(step => step.status === "pending");
  if (!nextStep) throw new Error("No pending processes left to schedule for this job.");

  // 2. Fetch all "Online" machines
  // Note: In a full app, you would add: where("supported_processes", "array-contains", nextStep.process_id)
  const machinesRef = collection(db, "machines");
  const q = query(machinesRef, where("status", "==", "Online"));
  const machineSnap = await getDocs(q);
  
  if (machineSnap.empty) throw new Error("No online machines available to take this job.");
  
  const availableMachines = machineSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  // 3. Load Balancing: Pick the machine with the lowest current load
  const optimalMachine = availableMachines.sort((a, b) => (a.currentLoad || 0) - (b.currentLoad || 0))[0];

  // 4. Time Calculation (Simulated Logic for Gantt Chart)
  // We want the block to show up nicely on today's timeline (between 8 AM and 8 PM)
  const today = new Date();
  
  // Pick a random start hour between 8 AM and 2 PM (14:00)
  const startHour = Math.floor(Math.random() * 6) + 8; 
  const startTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), startHour, 0, 0);
  
  // Calculate duration based on quantity (e.g., 1 hour per 2,500 units, max 4 hours)
  const durationHours = Math.min(4, Math.max(1, job.quantity_target / 2500));
  const endTime = new Date(startTime.getTime() + (durationHours * 60 * 60 * 1000));

  // Calculate new simulated machine load (add 15%)
  const newLoad = Math.min(100, (optimalMachine.currentLoad || 0) + 15);

  // 5. Fire the Batched Write!
  await executeLiveSchedule(
    job.id,
    optimalMachine.id,
    "op_auto_01", // Simulated operator ID
    nextStep,
    startTime,
    endTime,
    newLoad
  );
};

/**
 * CORE ENGINE: Close the Loop
 * Marks a block as completed, frees up machine capacity, and updates the Job.
 */
export const completeProcessBlock = async (block, machine, job) => {
  const batch = writeBatch(db);

  // 1. References
  const blockRef = doc(db, "schedule_blocks", block.id);
  const machineRef = doc(db, "machines", machine.id);
  const jobRef = doc(db, "jobs", job.id);

  // 2. Free up the machine load (Subtract the 15% we added earlier, min 0)
  const newLoad = Math.max(0, (machine.currentLoad || 0) - 15);
  batch.update(machineRef, {
    currentLoad: newLoad,
    updated_at: new Date()
  });

  // 3. Mark the block as completed
  batch.update(blockRef, {
    status: "completed",
    updated_at: new Date()
  });

  // 4. Update the Job's sequence
  let allStepsCompleted = true;
  const updatedSequence = job.process_sequence.map(step => {
    if (step.process_id === block.process_id) {
      step.status = "completed"; // Mark this specific step green
    }
    if (step.status !== "completed") {
      allStepsCompleted = false; // If any step isn't complete, the job isn't complete
    }
    return step;
  });

  // Update Job document
  batch.update(jobRef, {
    process_sequence: updatedSequence,
    status: allStepsCompleted ? "completed" : "pending", // If done, complete job. Otherwise, back to pending for the next step!
    updated_at: new Date()
  });

  // 5. Commit!
  await batch.commit();
  console.log("Process completed and capacity freed!");
};