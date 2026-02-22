import { useState, useEffect } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "../firebase/config";

export const useScheduleBlocks = () => {
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // In a production app, you would add .where() clauses here to only fetch "this week's" blocks
    const q = query(collection(db, "schedule_blocks"), orderBy("start_time", "asc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const blockData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setBlocks(blockData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { blocks, loading };
};