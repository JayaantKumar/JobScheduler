import { useNavigate } from "react-router-dom";
import { logoutUser } from "../services/auth.service";

export default function Unauthorized() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logoutUser();
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 px-4 text-center">
      <div className="text-red-500 text-6xl mb-4">🚫</div>
      <h1 className="text-3xl font-bold text-white mb-2">Access Denied</h1>
      <p className="text-gray-400 max-w-md mb-8">
        You do not have the necessary administrator permissions to view this dashboard.
      </p>
      <button 
        onClick={handleLogout}
        className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
      >
        Return to Login
      </button>
    </div>
  );
}