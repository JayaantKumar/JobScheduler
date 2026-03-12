import { useState, useEffect } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "../firebase/config";

export function useProcesses() {
  const [processes, setProcesses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Orders processes alphabetically by name
    const q = query(collection(db, "processes"), orderBy("processName", "asc"));
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        setProcesses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      }, 
      (error) => {
        console.error("🔥 Firebase Read Error (Processes):", error.message);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  return { processes, loading };
}