import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/config";

const jobsCollectionRef = collection(db, "jobs");

export const addJob = async (jobData) => {
  try {
    const docRef = await addDoc(jobsCollectionRef, {
      ...jobData,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    console.error("Error adding job: ", error);
    throw error;
  }
};