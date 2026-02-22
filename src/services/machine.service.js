import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/config";

const collectionRef = collection(db, "machines");

export const addMachine = (data) => {
  return addDoc(collectionRef, {
    ...data,
    createdAt: serverTimestamp(),
  });
};

export const updateMachine = (id, data) => {
  return updateDoc(doc(db, "machines", id), data);
};

export const deleteMachine = (id) => {
  return deleteDoc(doc(db, "machines", id));
};

export const toggleMachineStatus = (id, currentStatus) => {
  const newStatus = currentStatus === "Online" ? "Offline" : "Online";
  return updateDoc(doc(db, "machines", id), { status: newStatus });
};