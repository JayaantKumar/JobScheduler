import { useState } from "react";
import { collection, addDoc, serverTimestamp, doc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { useCustomers } from "../hooks/useCustomers";
import { useProducts } from "../hooks/useProducts";
import { useRates } from "../hooks/useRates";

export default function MasterData() {
  const [activeTab, setActiveTab] = useState("customers");
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Fetch real data from Firebase
  const { customers, loading: custLoading } = useCustomers();
  const { products, loading: prodLoading } = useProducts();
  const { rates, loading: ratesLoading } = useRates();

  // Form States
  const [formData, setFormData] = useState({});

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const getAddButtonText = () => {
    if (activeTab === "customers") return "+ Add Customer";
    if (activeTab === "products") return "+ Add Product";
    return "+ Add Rate";
  };

  // --- SAVE DATA TO FIREBASE ---
  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (activeTab === "customers") {
        await addDoc(collection(db, "customers"), { ...formData, productsCount: 0, created_at: serverTimestamp() });
      } else if (activeTab === "products") {
        await addDoc(collection(db, "products"), { ...formData, created_at: serverTimestamp() });
      } else if (activeTab === "rates") {
        // Find the product to attach the customer name to the rate automatically
        const linkedProduct = products.find(p => p.name === formData.productName);
        await addDoc(collection(db, "rates"), { 
          ...formData, 
          customerName: linkedProduct ? linkedProduct.customerName : "Unknown",
          created_at: serverTimestamp() 
        });
      }
      setIsModalOpen(false);
      setFormData({});
    } catch (error) {
      alert("Error saving data: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  // --- DELETE DATA FROM FIREBASE ---
  const handleDelete = async (id, collectionName) => {
    if (window.confirm(`Are you sure you want to delete this ${collectionName.slice(0, -1)}?`)) {
      try {
        await deleteDoc(doc(db, collectionName, id));
      } catch (error) {
        alert("Error deleting data: " + error.message);
      }
    }
  };

  if (custLoading || prodLoading || ratesLoading) {
    return <div className="p-8 text-primary-500 animate-pulse font-medium">Loading Master Data...</div>;
  }

  // Basic Search Filter
  const filteredCustomers = customers.filter(c => c.name?.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredProducts = products.filter(p => p.name?.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredRates = rates.filter(r => r.productName?.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="max-w-[1600px] mx-auto p-6 h-full flex flex-col">
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-white tracking-tight">Master Data</h2>
        <p className="text-gray-400 mt-1">Manage your customers, products, and pricing rates.</p>
      </div>

      <div className="flex items-center gap-3 mb-6 overflow-x-auto pb-2 no-scrollbar whitespace-nowrap">
        <button onClick={() => setActiveTab("customers")} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === "customers" ? "bg-primary-600 text-white shadow-lg shadow-primary-500/20" : "bg-gray-800 text-gray-400 hover:text-white"}`}>
          Customers ({customers.length})
        </button>
        <button onClick={() => setActiveTab("products")} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === "products" ? "bg-primary-600 text-white shadow-lg shadow-primary-500/20" : "bg-gray-800 text-gray-400 hover:text-white"}`}>
          Products ({products.length})
        </button>
        <button onClick={() => setActiveTab("rates")} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === "rates" ? "bg-primary-600 text-white shadow-lg shadow-primary-500/20" : "bg-gray-800 text-gray-400 hover:text-white"}`}>
          Rates ({rates.length})
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center mb-6">
        <div className="relative w-full sm:max-w-md">
          <input type="text" placeholder={`Search ${activeTab}...`} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary-500" />
        </div>
        <button onClick={() => { setFormData({}); setIsModalOpen(true); }} className="w-full sm:w-auto bg-primary-600 hover:bg-primary-500 text-white px-5 py-2.5 rounded-lg font-medium transition-colors">
          {getAddButtonText()}
        </button>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden shadow-xl flex-1 flex flex-col">
        <div className="overflow-x-auto flex-1">
          
          {/* CUSTOMERS TABLE */}
          {activeTab === "customers" && (
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead><tr className="bg-gray-950/50 border-b border-gray-800 text-xs font-bold text-gray-400 uppercase tracking-wider"><th className="py-4 px-6">Customer Name</th><th className="py-4 px-6">Contact Person</th><th className="py-4 px-6">Phone</th><th className="py-4 px-6">GSTIN</th><th className="py-4 px-6 text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-gray-800">
                {filteredCustomers.length === 0 && <tr><td colSpan="5" className="py-8 text-center text-gray-500">No customers found.</td></tr>}
                {filteredCustomers.map((cust) => (
                  <tr key={cust.id} className="hover:bg-gray-800/30 transition-colors">
                    <td className="py-4 px-6 font-bold text-gray-200">{cust.name}</td>
                    <td className="py-4 px-6 text-gray-400">{cust.contactPerson || '-'}</td>
                    <td className="py-4 px-6 text-gray-400">{cust.phone || '-'}</td>
                    <td className="py-4 px-6 text-gray-400">{cust.gstin || '-'}</td>
                    <td className="py-4 px-6 text-right">
                      <button onClick={() => handleDelete(cust.id, "customers")} className="text-red-400 hover:text-red-300 transition-colors text-sm font-medium">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* PRODUCTS TABLE */}
          {activeTab === "products" && (
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead><tr className="bg-gray-950/50 border-b border-gray-800 text-xs font-bold text-gray-400 uppercase tracking-wider"><th className="py-4 px-6">Product Name</th><th className="py-4 px-6">SKU / Code</th><th className="py-4 px-6">Assigned Customer</th><th className="py-4 px-6">Category</th><th className="py-4 px-6 text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-gray-800">
                {filteredProducts.length === 0 && <tr><td colSpan="5" className="py-8 text-center text-gray-500">No products found.</td></tr>}
                {filteredProducts.map((prod) => (
                  <tr key={prod.id} className="hover:bg-gray-800/30 transition-colors">
                    <td className="py-4 px-6 font-bold text-gray-200">{prod.name}</td>
                    <td className="py-4 px-6 text-gray-400 font-mono text-sm">{prod.sku || '-'}</td>
                    <td className="py-4 px-6 text-gray-300 font-medium">{prod.customerName}</td>
                    <td className="py-4 px-6 text-gray-400">{prod.category || '-'}</td>
                    <td className="py-4 px-6 text-right">
                      <button onClick={() => handleDelete(prod.id, "products")} className="text-red-400 hover:text-red-300 transition-colors text-sm font-medium">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* RATES TABLE - Updated Base Rate to Quantity */}
          {activeTab === "rates" && (
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-gray-950/50 border-b border-gray-800 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  <th className="py-4 px-6">Product</th>
                  <th className="py-4 px-6">Customer</th>
                  <th className="py-4 px-6">Quantity</th>
                  <th className="py-4 px-6">Bulk Rate</th>
                  <th className="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {filteredRates.length === 0 && <tr><td colSpan="5" className="py-8 text-center text-gray-500">No rates found.</td></tr>}
                {filteredRates.map((rate) => (
                  <tr key={rate.id} className="hover:bg-gray-800/30 transition-colors">
                    <td className="py-4 px-6 font-bold text-gray-200">{rate.productName}</td>
                    <td className="py-4 px-6 text-gray-300 font-medium">{rate.customerName}</td>
                    <td className="py-4 px-6 text-gray-400 font-mono">{rate.quantity ? parseInt(rate.quantity).toLocaleString() : '-'}</td>
                    <td className="py-4 px-6 text-green-400 font-mono">₹ {rate.bulkRate}</td>
                    <td className="py-4 px-6 text-right">
                      <button onClick={() => handleDelete(rate.id, "rates")} className="text-red-400 hover:text-red-300 transition-colors text-sm font-medium">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      
      {/* DYNAMIC FORM MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-6">Add {activeTab.slice(0, -1)}</h3>
            
            <form onSubmit={handleSave} className="space-y-4">
              
              {/* Customer Inputs */}
              {activeTab === "customers" && (
                <>
                  <input required name="name" onChange={handleInputChange} placeholder="Customer/Company Name *" className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary-500" />
                  <input name="contactPerson" onChange={handleInputChange} placeholder="Contact Person" className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary-500" />
                  <input name="phone" onChange={handleInputChange} placeholder="Phone Number" className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary-500" />
                  <input name="gstin" onChange={handleInputChange} placeholder="GST Number" className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary-500" />
                </>
              )}

              {/* Product Inputs */}
              {activeTab === "products" && (
                <>
                  <input required name="name" onChange={handleInputChange} placeholder="Product Name *" className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary-500" />
                  <input name="sku" onChange={handleInputChange} placeholder="SKU / Code" className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary-500" />
                  <input name="category" onChange={handleInputChange} placeholder="Category (e.g., Rigid Box)" className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary-500" />
                  <select required name="customerName" onChange={handleInputChange} className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary-500">
                    <option value="">-- Assign to Customer --</option>
                    {customers.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </>
              )}

              {/* Rate Inputs - Updated Base Rate to Quantity */}
              {activeTab === "rates" && (
                <>
                  <select required name="productName" onChange={handleInputChange} className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white mb-2 focus:outline-none focus:border-primary-500">
                    <option value="">-- Select Product --</option>
                    {products.map(p => <option key={p.id} value={p.name}>{p.name} ({p.customerName})</option>)}
                  </select>
                  
                  {/* CHANGED FROM BASE RATE TO QUANTITY */}
                  <input required name="quantity" type="number" onChange={handleInputChange} placeholder="Target Quantity (e.g. 5000) *" className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary-500" />
                  
                  <input required name="bulkRate" type="number" step="0.01" onChange={handleInputChange} placeholder="Rate Amount (₹) *" className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary-500" />
                </>
              )}

              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-gray-400 hover:text-white transition-colors">Cancel</button>
                <button type="submit" disabled={saving} className="bg-primary-600 hover:bg-primary-500 text-white px-5 py-2.5 rounded-lg transition-colors">
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}