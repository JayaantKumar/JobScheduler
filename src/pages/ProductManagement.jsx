import { useState, useEffect } from "react";
import { collection, onSnapshot, doc, deleteDoc, query, where, getDocs } from "firebase/firestore";
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
  const [selectedCustomerFilter, setSelectedCustomerFilter] = useState(""); 
  const [toastMessage, setToastMessage] = useState("");
  const [showToast, setShowToast] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState(null); 

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

  useEffect(() => {
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

  // ⭐️ ROUND 17 FIX: Added Guardrail to prevent orphaned jobs
  const handleDelete = async (id) => {
    try {
      const qProduct = query(collection(db, "jobs"), where("product.id", "==", id));
      const snap = await getDocs(qProduct);
      
      if (!snap.empty) {
        setConfirmConfig({
          isOpen: true,
          title: "Cannot Delete Product",
          message: `This product is currently linked to ${snap.size} active job card(s) on the factory floor. Deleting it would orphan those records. Please complete or delete the associated jobs first.`,
          confirmText: null, 
          isDanger: false,
          onConfirm: null,
          onCancel: () => setConfirmConfig(null),
          cancelText: "Understood"
        });
        return;
      }
    } catch (err) {
      console.error("Error checking job references:", err);
    }

    setConfirmConfig({
      isOpen: true,
      title: "Delete Product Template",
      message: "Are you sure you want to delete this product? This action cannot be undone.",
      confirmText: "Delete Product",
      isDanger: true,
      onConfirm: async () => {
        setConfirmConfig(null);
        try {
          await deleteDoc(doc(db, "products", id));
          triggerToast("Product deleted successfully.");
        } catch (error) {
          triggerToast("Failed to delete: " + error.message);
        }
      },
      onCancel: () => setConfirmConfig(null),
      cancelText: "Cancel"
    });
  };

  const openTemplateModal = (prod = null) => {
    setEditingProduct(prod);
    setTemplateModalOpen(true);
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          p.customerName?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCustomer = selectedCustomerFilter 
      ? (p.customerId === selectedCustomerFilter || p.customerName === selectedCustomerFilter) 
      : true;

    return matchesSearch && matchesCustomer;
  });

  const selectedCustomerObj = customers.find(c => c.id === selectedCustomerFilter);
  const activeCustomerLabel = selectedCustomerObj ? selectedCustomerObj.name : (selectedCustomerFilter || "All Customers");

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

      {/* ⭐️ ROUND 17 FIX: Updated confirm modal to conditionally render the confirm button */}
      {confirmConfig && confirmConfig.isOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-fade-in">
            <div className="p-6">
              <h3 className="text-xl font-bold text-white mb-2">{confirmConfig.title}</h3>
              <p className="text-sm text-gray-300 leading-relaxed mb-8">{confirmConfig.message}</p>
              <div className="flex justify-end gap-3">
                <button onClick={confirmConfig.onCancel} className="px-5 py-2.5 text-gray-400 hover:text-white transition-colors font-medium bg-gray-800 rounded-lg">
                  {confirmConfig.cancelText || "Cancel"}
                </button>
                {confirmConfig.onConfirm && (
                  <button onClick={confirmConfig.onConfirm} className={`px-6 py-2.5 rounded-lg font-bold text-white transition-colors shadow-lg ${confirmConfig.isDanger ? 'bg-red-600 hover:bg-red-500' : 'bg-primary-600 hover:bg-primary-500'}`}>
                    {confirmConfig.confirmText || "Confirm"}
                  </button>
                )}
              </div>
            </div>
          </div>
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

      <div className="flex flex-col sm:flex-row gap-4 mb-3">
        <select
          value={selectedCustomerFilter}
          onChange={(e) => setSelectedCustomerFilter(e.target.value)}
          className="w-full sm:w-64 bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary-500"
        >
          <option value="">All Customers</option>
          {customers.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        
        <input 
          type="text" 
          placeholder="Search products or SKU..." 
          value={searchQuery} 
          onChange={(e) => setSearchQuery(e.target.value)} 
          className="flex-1 max-w-md bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary-500" 
        />
      </div>

      <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 px-1">
        {filteredProducts.length} Products · {activeCustomerLabel}
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