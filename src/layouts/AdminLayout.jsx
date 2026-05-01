import { useState } from "react";
import { Outlet, NavLink } from "react-router-dom";
import { logoutUser } from "../services/auth.service";

export default function AdminLayout() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // --- NEW: Feature Toggle State with LocalStorage ---
  const [showProductMgmt, setShowProductMgmt] = useState(() => {
    return localStorage.getItem('showProductMgmt') !== 'false';
  });

  const toggleProductMgmt = () => {
    setShowProductMgmt(prev => {
      const newVal = !prev;
      localStorage.setItem('showProductMgmt', newVal);
      return newVal;
    });
  };

  const navLinkClasses = ({ isActive }) =>
    `block px-4 py-3 rounded-lg transition-all font-medium ${
      isActive
        ? "bg-primary-600 text-white shadow-lg shadow-primary-500/20"
        : "text-gray-400 hover:bg-gray-800 hover:text-white"
    }`;

  // Close the menu automatically when a link is clicked on mobile
  const handleNavClick = () => setIsMobileMenuOpen(false);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950">
      {/* Mobile Overlay Background */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-20 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar - Now slides in on mobile, static on desktop */}
      <aside
        className={`fixed md:relative w-64 h-full bg-gray-900 border-r border-gray-800 flex flex-col z-30 transform transition-transform duration-300 ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
      >
        <div className="p-6 text-2xl font-bold text-white tracking-wider flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded bg-primary-600 flex items-center justify-center text-sm shadow-lg shadow-primary-500/40">
              ⚡
            </span>
            SysAdmin
          </div>
          {/* Close button for mobile */}
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="md:hidden text-gray-400 hover:text-white"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-2 overflow-y-auto pb-4 custom-scrollbar">
          <NavLink
            to="/dashboard"
            end
            onClick={handleNavClick}
            className={navLinkClasses}
          >
            Dashboard
          </NavLink>
          <NavLink
            to="/dashboard/analytics"
            onClick={handleNavClick}
            className={navLinkClasses}
          >
            Analytics
          </NavLink>
          <NavLink
            to="/dashboard/jobs"
            onClick={handleNavClick}
            className={navLinkClasses}
          >
            Job Management
          </NavLink>
          <NavLink
            to="/dashboard/machines"
            onClick={handleNavClick}
            className={navLinkClasses}
          >
            Machine Management
          </NavLink>
          <NavLink
            to="/dashboard/process-management"
            onClick={handleNavClick}
            className={navLinkClasses}
          >
            Process Management
          </NavLink>
          <NavLink
            to="/dashboard/master-data"
            onClick={handleNavClick}
            className={navLinkClasses}
          >
            Master Data
          </NavLink>
          
          {/* ⭐️ NEW: Hidden dynamically based on toggle */}
          {showProductMgmt && (
            <NavLink
              to="/dashboard/product-management"
              onClick={handleNavClick}
              className={navLinkClasses}
            >
              Product Management
            </NavLink>
          )}
        </nav>

        {/* ⭐️ NEW: Product Management Toggle Switch */}
        <div className="px-5 py-4 border-t border-gray-800 shrink-0 bg-gray-900">
          <label className="flex items-center justify-between cursor-pointer mb-4 group">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider group-hover:text-gray-300 transition-colors">Product Mgmt UI</span>
            <div className="relative">
              <input type="checkbox" className="sr-only" checked={showProductMgmt} onChange={toggleProductMgmt} />
              <div className={`block w-8 h-5 rounded-full transition-colors ${showProductMgmt ? 'bg-primary-600' : 'bg-gray-800 border border-gray-700'}`}></div>
              <div className={`dot absolute left-1 top-1 bg-white w-3 h-3 rounded-full transition-transform ${showProductMgmt ? 'transform translate-x-3' : ''}`}></div>
            </div>
          </label>

          <button
            onClick={logoutUser}
            className="w-full px-4 py-2 text-left text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors font-medium flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative w-full">
        <header className="h-16 shrink-0 bg-gray-900 border-b border-gray-800 flex items-center px-4 md:px-8 justify-between z-10">
          <div className="flex items-center gap-3">
            {/* Hamburger Button for Mobile */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden p-2 -ml-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
            <h1 className="text-xl font-semibold text-gray-100 hidden sm:block">
              Factory Control
            </h1>
          </div>

          <div className="w-8 h-8 rounded-full bg-primary-600/20 border border-primary-500/50 flex items-center justify-center text-primary-500 text-xs font-bold shadow-lg shadow-primary-500/20">
            AD
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4 md:p-8 bg-gray-950 custom-scrollbar">
          <Outlet />
        </div>
      </main>
    </div>
  );
}