import { useState, useEffect } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "../firebase/config";

export function useRates() {
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "rates"), orderBy("productName", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setRates(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      console.error("🔥 Firebase Read Error (Rates):", error.message);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  return { rates, loading };
}