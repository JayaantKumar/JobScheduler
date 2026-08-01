import { useState, useEffect } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "../firebase/config";

export const useJobs = () => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const q = query(collection(db, "jobs"), orderBy("deadline", "asc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!isMounted) return;
      
      const jobData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setJobs(jobData);
      setLoading(false);
    }, (error) => {
      console.error("Firestore snapshot error:", error);
      if (isMounted) setLoading(false);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  return { jobs, loading };
};