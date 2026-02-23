import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AdminLayout from "../layouts/AdminLayout";
import Login from "../pages/Login";
import Machines from "../pages/Machines";
import Jobs from "../pages/Jobs";
import Scheduler from "../pages/Scheduler";
import DashboardHome from "../pages/DashboardHome";
import Unauthorized from "../pages/Unauthorized";
import Analytics from "../pages/Analytics";

const ProtectedRoute = ({ children, requiredRole }) => {
  const { user, role } = useAuth();
  
  if (!user) return <Navigate to="/login" replace />;
  
  // If we have a user, but role is still fetching, WAIT! Don't redirect yet.
  if (requiredRole && role === undefined) {
    return (
      <div className="h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-primary-500 font-medium animate-pulse">Verifying permissions...</div>
      </div>
    );
  }

  // If role is fully loaded and doesn't match, THEN kick them out.
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
          {/* Default route loads the Analytics Dashboard */}
          <Route index element={<DashboardHome />} />

          <Route path="analytics" element={<Analytics />} />
          
          {/* Sub-routes for the management pages */}
          <Route path="machines" element={<Machines />} />
          <Route path="jobs" element={<Jobs />} />
          <Route path="scheduler" element={<Scheduler />} />
        </Route>
        
        {/* Catch-all redirects unknown URLs to the dashboard */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
};