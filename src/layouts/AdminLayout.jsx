import { Outlet, NavLink } from "react-router-dom";
import { logoutUser } from "../services/auth.service";

export default function AdminLayout() {
  
  // Reusable styling function for our sidebar links
  const navLinkClasses = ({ isActive }) => 
    `block px-4 py-3 rounded-lg transition-all font-medium ${
      isActive 
        ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/20' 
        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
    }`;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col z-20">
        <div className="p-6 text-2xl font-bold text-white tracking-wider flex items-center gap-2">
          <span className="w-8 h-8 rounded bg-primary-600 flex items-center justify-center text-sm shadow-lg shadow-primary-500/40">⚡</span>
          SysAdmin
        </div>
        
        <nav className="flex-1 px-4 space-y-2 mt-2">
          {/* Note the 'end' prop here! It prevents "Overview" from glowing when you are on other /dashboard/... pages */}
          <NavLink to="/dashboard" end className={navLinkClasses}>
            Overview Analytics
          </NavLink>
          
          <NavLink to="/dashboard/machines" className={navLinkClasses}>
            Machine Management
          </NavLink>

          <NavLink to="/dashboard/jobs" className={navLinkClasses}>
            Job Management
          </NavLink>

          <NavLink to="/dashboard/scheduler" className={navLinkClasses}>
            Live Scheduler
          </NavLink>
        </nav>

        <div className="p-4 border-t border-gray-800">
          <button onClick={logoutUser} className="w-full px-4 py-2 text-left text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors font-medium">
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <header className="h-16 shrink-0 bg-gray-900 border-b border-gray-800 flex items-center px-8 justify-between z-10">
          <h1 className="text-xl font-semibold text-gray-100">Factory Control</h1>
          
          {/* A nice little user avatar placeholder */}
          <div className="w-8 h-8 rounded-full bg-primary-600/20 border border-primary-500/50 flex items-center justify-center text-primary-500 text-xs font-bold">
            AD
          </div>
        </header>
        
        <div className="flex-1 overflow-auto p-8 bg-gray-950">
          <Outlet />
        </div>
      </main>
    </div>
  );
}