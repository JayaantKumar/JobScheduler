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
          <Route path="product-management" element={<ProductManagement />} />
        </Route>
        
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
};