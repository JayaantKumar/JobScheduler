import { useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';

export default function ExportDataButton() {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      // 1. List every collection we want to back up
      const collectionsToExport = ['jobs', 'machines', 'customers', 'products', 'rates', 'processes'];
      const backupData = {};

      // 2. Fetch all documents from each collection
      for (const colName of collectionsToExport) {
        const querySnapshot = await getDocs(collection(db, colName));
        backupData[colName] = querySnapshot.docs.map(doc => {
          const data = doc.data();
          // Clean up Firebase Timestamps so they serialize to JSON properly
          if (data.created_at?.toDate) data.created_at = data.created_at.toDate().toISOString();
          if (data.updated_at?.toDate) data.updated_at = data.updated_at.toDate().toISOString();
          return { id: doc.id, ...data };
        });
      }

      // 3. Convert the massive Javascript Object into a JSON string
      const jsonString = JSON.stringify(backupData, null, 2);

      // 4. Create a downloadable file (Blob) in the browser
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      // 5. Trigger the download automatically
      const downloadLink = document.createElement("a");
      downloadLink.href = url;
      downloadLink.download = `Factory_Backup_${new Date().toISOString().split('T')[0]}.json`;
      
      document.body.appendChild(downloadLink);
      downloadLink.click();
      
      // Cleanup
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(url);

    } catch (error) {
      console.error("Export failed:", error);
      alert("Export failed: " + error.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={exporting}
      className="bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 border border-gray-700 shadow-sm disabled:opacity-50"
      title="Download a complete JSON backup of the database"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      {exporting ? "Compiling Backup..." : "Export Database"}
    </button>
  );
}