import { useState, useEffect } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "../firebase/config";

export function useDies() {
  const [dies, setDies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Orders dies by newest first
    const q = query(collection(db, "dies"), orderBy("created_at", "desc"));
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        setDies(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      }, 
      (error) => {
        console.error("🔥 Firebase Read Error (Dies):", error.message);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  return { dies, loading };
}