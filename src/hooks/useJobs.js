import { useState, useEffect } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "../firebase/config";

export const useJobs = () => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // We order by deadline to see what needs to be scheduled first
    const q = query(collection(db, "jobs"), orderBy("deadline", "asc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const jobData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setJobs(jobData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { jobs, loading };
};