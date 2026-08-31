import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AdminLayout from "../layouts/AdminLayout";
import Login from "../pages/Login";
import Machines from "../pages/Machines";
import Jobs from "../pages/Jobs";
import DashboardHome from "../pages/DashboardHome";
import Unauthorized from "../pages/Unauthorized";
import Analytics from "../pages/Analytics";
import MasterData from "../pages/MasterData";
import ProductManagement from "../pages/ProductManagement";
import ProcessManagement from "../pages/ProcessManagement";
import InventoryManagement from "../pages/InventoryManagement";
import OperationsBoard from "../components/OperationsBoard";
import Settings from "../pages/Settings"; 
import PrintJobCard from "../pages/PrintJobCard";
import JobWork from "../pages/JobWork";

// ⭐️ ROUND 21: Import the new Repeat Orders page
import RepeatOrders from "../pages/RepeatOrders"; 

const ProtectedRoute = ({ children, requiredRole }) => {
  const { user, role } = useAuth();
  
  if (!user) return <Navigate to="/login" replace />;
  
  if (requiredRole && role === undefined) {
    return (
      <div className="h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-primary-500 font-medium animate-pulse">Verifying permissions...</div>
      </div>
    );
  }

  if (requiredRole && role !== requiredRole) return <Navigate to="/unauthorized" replace />;
  
  return children;
};

export const AppRouter = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/unauthorized" element={<Unauthorized />} />
        
        <Route path="/print/:jobId" element={
          <ProtectedRoute requiredRole="admin">
            <PrintJobCard />
          </ProtectedRoute>
        } />
        
        <Route path="/dashboard" element={
          <ProtectedRoute requiredRole="admin">
            <AdminLayout />
          </ProtectedRoute>
        }>
          <Route index element={<DashboardHome />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="machines" element={<Machines />} />
          <Route path="process-management" element={<ProcessManagement />} />
          <Route path="master-data" element={<MasterData />} />
          <Route path="jobs" element={<Jobs />} />
          
          {/* ⭐️ ROUND 21: Added Repeat Orders Route */}
          <Route path="repeat-orders" element={<RepeatOrders />} />
          
          <Route path="product-management" element={<ProductManagement />} />
          <Route path="inventory-management" element={<InventoryManagement />} />
          <Route path="operations-board" element={<OperationsBoard />} />
          <Route path="settings" element={<Settings />} />
          
          {/* ⭐️ ROUND 23: Added Job Work Route */}
          <Route path="job-work" element={<JobWork />} />
        </Route>
        
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
};