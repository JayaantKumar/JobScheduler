import { useState, useEffect } from "react";
import { collection, onSnapshot, doc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase/config";

import { useProducts } from "../hooks/useProducts";
import { useCustomers } from "../hooks/useCustomers";
import { useProcesses } from "../hooks/useProcesses";
import { useMachines } from "../hooks/useMachines";
import { useDies } from "../hooks/useDies";
import { useProduceMath } from "../hooks/useProduceMath";

import ProductTable from "../components/ProductTable";
import ProduceJobSetModal from "../components/ProduceJobSetModal";
import ProductTemplateModal from "../components/ProductTemplateModal";
import InlineAddModal from "../components/InlineAddModal";

export default function ProductManagement() {
  const { products, loading: prodLoading } = useProducts();
  const { customers } = useCustomers();
  const { processes: dbProcesses } = useProcesses();
  const { machines } = useMachines();
  const { dies } = useDies();
  const produceMath = useProduceMath();

  const [searchQuery, setSearchQuery] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const [showToast, setShowToast] = useState(false);

  const [isTemplateModalOpen, setTemplateModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [inlineModal, setInlineModal] = useState({ isOpen: false, type: "" });

  const [categories, setCategories] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "productCategories"), (snapshot) => {
      const cats = [];
      snapshot.forEach(doc => cats.push({ id: doc.id, ...doc.data() }));
      setCategories(cats);
    });
    return () => unsub();
  }, []);

  // ⭐️ ROUND 7.1: Fetch Inventory Items for the Stock Picker and Shortage Logic
  useEffect(() => {
    // Note: Assuming your collection is named 'inventoryItems' or 'inventory'
    const unsub = onSnapshot(collection(db, "inventoryItems"), (snapshot) => {
      const items = [];
      snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
      setInventoryItems(items);
    });
    return () => unsub();
  }, []);

  const triggerToast = (msg) => {
    setToastMessage(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this product template?")) {
      try {
        await deleteDoc(doc(db, "products", id));
        triggerToast("Product deleted successfully.");
      } catch (error) {
        alert("Failed to delete: " + error.message);
      }
    }
  };

  const openTemplateModal = (prod = null) => {
    setEditingProduct(prod);
    setTemplateModalOpen(true);
  };

  const filteredProducts = products.filter(p => 
    p.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.customerName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (prodLoading) return <div className="p-8 text-primary-500 animate-pulse font-medium">Loading Products...</div>;

  return (
    <div className="max-w-[1600px] mx-auto p-6 h-full flex flex-col relative">
      
      {showToast && (
        <div className="fixed top-6 right-6 bg-green-600/90 backdrop-blur-sm border border-green-500 text-white px-6 py-4 rounded-xl shadow-2xl z-[100] font-bold animate-fade-in flex items-center gap-3">
          <svg className="w-6 h-6 text-green-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
          </svg>
          {toastMessage}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">Product Management</h2>
          <p className="text-gray-400 mt-1">Define multi-part product templates and link target machines.</p>
        </div>
        <button onClick={() => openTemplateModal()} className="bg-primary-600 hover:bg-primary-500 text-white px-5 py-2.5 rounded-lg font-medium transition-colors shadow-lg shadow-primary-500/20 flex items-center gap-2">
          <span>+</span> Add Product Template
        </button>
      </div>

      <div className="mb-6 relative w-full max-w-md">
        <input 
          type="text" 
          placeholder="Search products or customers..." 
          value={searchQuery} 
          onChange={(e) => setSearchQuery(e.target.value)} 
          className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary-500" 
        />
      </div>

      <ProductTable 
        products={filteredProducts} 
        machines={machines}
        onProduce={produceMath.openProduceModal}
        onEdit={openTemplateModal}
        onDelete={handleDelete}
      />

      <ProduceJobSetModal 
        isOpen={produceMath.isProduceModalOpen}
        onClose={() => produceMath.setProduceModalOpen(false)}
        activeProduceProduct={produceMath.activeProduceProduct}
        produceQty={produceMath.produceQty}
        handleProduceQtyChange={produceMath.handleProduceQtyChange}
        produceDate={produceMath.produceDate}
        setProduceDate={produceMath.setProduceDate}
        produceParts={produceMath.produceParts}
        updatePartSets={produceMath.updatePartSets}
        updatePartMultiplier={produceMath.updatePartMultiplier}
        toggleCustomOverride={produceMath.toggleCustomOverride}
        updatePartCustomPcs={produceMath.updatePartCustomPcs}
        handleStepQtyChange={produceMath.handleStepQtyChange}
        togglePartExpanded={produceMath.togglePartExpanded}
        machines={machines}
        dbProcesses={dbProcesses}
        inventoryItems={inventoryItems}
        dies={dies}
        onSuccess={triggerToast}
      />

      <ProductTemplateModal 
        isOpen={isTemplateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        editingProduct={editingProduct}
        customers={customers}
        categories={categories}
        machines={machines}
        dbProcesses={dbProcesses}
        dies={dies}
        inventoryItems={inventoryItems}
        onSaveSuccess={(savedData) => {
          setTemplateModalOpen(false);
          produceMath.openProduceModal(savedData);
        }}
        openInlineModal={(type) => setInlineModal({ isOpen: true, type })}
      />

      <InlineAddModal 
        isOpen={inlineModal.isOpen}
        type={inlineModal.type}
        onClose={() => setInlineModal({ isOpen: false, type: "" })}
        onSuccess={(type) => {
          triggerToast(`${type} added successfully!`);
          setInlineModal({ isOpen: false, type: "" });
        }}
      />
    </div>
  );
}