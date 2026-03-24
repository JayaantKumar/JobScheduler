import { useState } from "react";
import { collection, addDoc, serverTimestamp, doc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { useCustomers } from "../hooks/useCustomers";
import { useProducts } from "../hooks/useProducts";
import { useRates } from "../hooks/useRates";
import { useDies } from "../hooks/useDies"; // <-- NEW HOOK
import { useMachines } from "../hooks/useMachines"; // <-- Needed to link dies to machines
import ExportDataButton from "../components/ExportDataButton"; 

export default function MasterData() {
  const [activeTab, setActiveTab] = useState("customers");
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Fetch real data from Firebase
  const { customers, loading: custLoading } = useCustomers();
  const { products, loading: prodLoading } = useProducts();
  const { rates, loading: ratesLoading } = useRates();
  const { dies, loading: diesLoading } = useDies();
  const { machines, loading: machLoading } = useMachines();

  // Form States
  const [formData, setFormData] = useState({});

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const getAddButtonText = () => {
    if (activeTab === "customers") return "+ Add Customer";
    if (activeTab === "products") return "+ Add Product";
    if (activeTab === "rates") return "+ Add Rate";
    return "+ Add Die"; // <-- New Button Text
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
        const linkedProduct = products.find(p => p.name === formData.productName);
        await addDoc(collection(db, "rates"), { 
          ...formData, 
          customerName: linkedProduct ? linkedProduct.customerName : "Unknown",
          created_at: serverTimestamp() 
        });
      } else if (activeTab === "dies") {
        // Find the linked product to auto-attach the customer
        const linkedProduct = products.find(p => p.name === formData.productName);
        await addDoc(collection(db, "dies"), {
          ...formData,
          customerName: linkedProduct ? linkedProduct.customerName : formData.customerName || "Unknown",
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

  if (custLoading || prodLoading || ratesLoading || diesLoading || machLoading) {
    return <div className="p-8 text-primary-500 animate-pulse font-medium">Loading Master Data...</div>;
  }

  // Basic Search Filter
  const filteredCustomers = customers.filter(c => c.name?.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredProducts = products.filter(p => p.name?.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredRates = rates.filter(r => r.productName?.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredDies = dies.filter(d => d.dieName?.toLowerCase().includes(searchQuery.toLowerCase()) || d.dieNumber?.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="max-w-[1600px] mx-auto p-6 h-full flex flex-col">
      
      {/* HEADER WITH EXPORT BUTTON */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">Master Data</h2>
          <p className="text-gray-400 mt-1">Manage your customers, products, pricing, and die inventory.</p>
        </div>
        <ExportDataButton />
      </div>

      <div className="flex items-center gap-3 mb-6 overflow-x-auto pb-2 no-scrollbar whitespace-nowrap">
        <button onClick={() => setActiveTab("customers")} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === "customers" ? "bg-primary-600 text-white shadow-lg shadow-primary-500/20" : "bg-gray-800 text-gray-400 hover:text-white"}`}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
          Customers ({customers.length})
        </button>
        <button onClick={() => setActiveTab("products")} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === "products" ? "bg-primary-600 text-white shadow-lg shadow-primary-500/20" : "bg-gray-800 text-gray-400 hover:text-white"}`}>
          Products ({products.length})
        </button>
        <button onClick={() => setActiveTab("rates")} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === "rates" ? "bg-primary-600 text-white shadow-lg shadow-primary-500/20" : "bg-gray-800 text-gray-400 hover:text-white"}`}>
          Rates ({rates.length})
        </button>
        
        {/* NEW DIES TAB */}
        <button onClick={() => setActiveTab("dies")} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === "dies" ? "bg-purple-600 text-white shadow-lg shadow-purple-500/20" : "bg-gray-800 text-gray-400 hover:text-white"}`}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
          Dies ({dies.length})
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center mb-6">
        <div className="relative w-full sm:max-w-md">
          <input type="text" placeholder={`Search ${activeTab}...`} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary-500" />
        </div>
        <button onClick={() => { setFormData({}); setIsModalOpen(true); }} className={`w-full sm:w-auto text-white px-5 py-2.5 rounded-lg font-medium transition-colors ${activeTab === "dies" ? "bg-purple-600 hover:bg-purple-500" : "bg-primary-600 hover:bg-primary-500"}`}>
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

          {/* RATES TABLE */}
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

          {/* NEW DIES TABLE */}
          {activeTab === "dies" && (
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-gray-950/50 border-b border-gray-800 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  <th className="py-4 px-6">Die Number</th>
                  <th className="py-4 px-6">Die Name</th>
                  <th className="py-4 px-6">Customer</th>
                  <th className="py-4 px-6">Linked Product</th>
                  <th className="py-4 px-6">Target Machine</th>
                  <th className="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {filteredDies.length === 0 && <tr><td colSpan="6" className="py-8 text-center text-gray-500">No dies found in inventory.</td></tr>}
                {filteredDies.map((die) => (
                  <tr key={die.id} className="hover:bg-gray-800/30 transition-colors">
                    <td className="py-4 px-6 font-bold text-gray-200">{die.dieNumber}</td>
                    <td className="py-4 px-6 text-gray-300">{die.dieName}</td>
                    <td className="py-4 px-6 text-blue-400">{die.customerName}</td>
                    <td className="py-4 px-6 text-gray-400">{die.productName || '-'}</td>
                    <td className="py-4 px-6 text-gray-400">
                      <span className="bg-gray-800 px-2 py-1 rounded text-xs border border-gray-700">{die.targetMachine || 'Any'}</span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <button onClick={() => handleDelete(die.id, "dies")} className="text-red-400 hover:text-red-300 transition-colors text-sm font-medium flex items-center justify-end w-full gap-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
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

              {/* Rate Inputs */}
              {activeTab === "rates" && (
                <>
                  <select required name="productName" onChange={handleInputChange} className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white mb-2 focus:outline-none focus:border-primary-500">
                    <option value="">-- Select Product --</option>
                    {products.map(p => <option key={p.id} value={p.name}>{p.name} ({p.customerName})</option>)}
                  </select>
                  
                  <input required name="quantity" type="number" onChange={handleInputChange} placeholder="Target Quantity (e.g. 5000) *" className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary-500" />
                  
                  <input required name="bulkRate" type="number" step="0.01" onChange={handleInputChange} placeholder="Rate Amount (₹) *" className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-primary-500" />
                </>
              )}

              {/* NEW DIES INPUTS */}
              {activeTab === "dies" && (
                <>
                  <input required name="dieNumber" onChange={handleInputChange} placeholder="Die Number (e.g., B6-Inner) *" className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-purple-500" />
                  <input required name="dieName" onChange={handleInputChange} placeholder="Die Name (e.g., Brown Box 6) *" className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-purple-500" />
                  
                  <select required name="productName" onChange={handleInputChange} className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-purple-500">
                    <option value="">-- Link to Product --</option>
                    {products.map(p => <option key={p.id} value={p.name}>{p.name} ({p.customerName})</option>)}
                  </select>

                  <select name="targetMachine" onChange={handleInputChange} className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-purple-500">
                    <option value="">-- Assign Target Machine (Optional) --</option>
                    {machines.filter(m => m.type.toLowerCase().includes("die")).map(m => (
                      <option key={m.id} value={m.name}>{m.name} ({m.place})</option>
                    ))}
                  </select>

                  <input name="size" onChange={handleInputChange} placeholder="Die Size / Dimensions" className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-purple-500" />
                </>
              )}

              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-gray-400 hover:text-white transition-colors">Cancel</button>
                <button type="submit" disabled={saving} className={`text-white px-5 py-2.5 rounded-lg transition-colors ${activeTab === "dies" ? "bg-purple-600 hover:bg-purple-500" : "bg-primary-600 hover:bg-primary-500"}`}>
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