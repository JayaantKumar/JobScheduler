import { useState, useEffect } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "../firebase/config";

export function useMachines() {
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Point exactly to the "machines" collection and order by newest
    const q = query(collection(db, "machines"), orderBy("created_at", "desc"));

    // 2. Listen for real-time changes
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const machineList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setMachines(machineList);
        setLoading(false);
      },
      (error) => {
        // 3. THIS IS THE CRUCIAL PART! 
        // If Firebase blocks the read, it will now loudly complain in your console.
        console.error("🔥 Firebase Read Error in useMachines:", error.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return { machines, loading };
}