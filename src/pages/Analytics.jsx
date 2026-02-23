import { useState } from "react";

export default function Analytics() {
  const [timeRange, setTimeRange] = useState("30days");

  return (
    <div className="max-w-[1600px] mx-auto p-6">
      
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-bold text-white flex items-center gap-3">
            <svg className="w-8 h-8 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            Performance Analytics
          </h2>
          <p className="text-gray-400 mt-1">Analyze production KPIs to identify trends and areas for improvement.</p>
        </div>
        
        {/* Time Range Toggle */}
        <div className="flex bg-gray-900 border border-gray-800 rounded-lg p-1 shrink-0">
          <button 
            onClick={() => setTimeRange("7days")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${timeRange === "7days" ? "bg-gray-800 text-white" : "text-gray-400 hover:text-white"}`}
          >
            Last 7 Days
          </button>
          <button 
            onClick={() => setTimeRange("30days")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${timeRange === "30days" ? "bg-primary-600 text-white shadow-lg shadow-primary-500/20" : "text-gray-400 hover:text-white"}`}
          >
            Last 30 Days
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        
        {/* Card 1: On-Time Completion Rate */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex items-start gap-4 shadow-lg">
          <div className="w-12 h-12 rounded-full bg-green-500/10 text-green-500 flex items-center justify-center shrink-0 border border-green-500/20 mt-1">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <div className="text-gray-400 text-sm font-medium mb-1">On-Time Completion Rate</div>
            <div className="text-3xl font-bold text-white">0%</div>
            <div className="text-xs text-gray-500 mt-1">Jobs completed by due date</div>
          </div>
        </div>

        {/* Card 2: Average Job Delay */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex items-start gap-4 shadow-lg">
          <div className="w-12 h-12 rounded-full bg-yellow-500/10 text-yellow-500 flex items-center justify-center shrink-0 border border-yellow-500/20 mt-1">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <div className="text-gray-400 text-sm font-medium mb-1">Average Job Delay</div>
            <div className="text-3xl font-bold text-white">N/A</div>
            <div className="text-xs text-gray-500 mt-1">For jobs past due date</div>
          </div>
        </div>

        {/* Card 3: Production Efficiency */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex items-start gap-4 shadow-lg">
          <div className="w-12 h-12 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/20 mt-1">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <div className="text-gray-400 text-sm font-medium mb-1">Production Efficiency</div>
            <div className="text-3xl font-bold text-white">N/A</div>
            <div className="text-xs text-gray-500 mt-1">Planned vs. Actual time</div>
          </div>
        </div>

        {/* Card 4: First Pass Yield (Quality) */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex items-start gap-4 shadow-lg">
          <div className="w-12 h-12 rounded-full bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0 border border-purple-500/20 mt-1">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <div className="text-gray-400 text-sm font-medium mb-1">First Pass Yield (Quality)</div>
            <div className="text-3xl font-bold text-white">0%</div>
            <div className="text-xs text-gray-500 mt-1">Items passing QC first time</div>
          </div>
        </div>

      </div>

      {/* Bottom Panels Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        
        {/* Left Column (Quality & Rejections) */}
        <div className="flex flex-col gap-6">
          {/* Quality Analysis Panel */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg flex flex-col flex-1 min-h-[300px]">
            <h3 className="text-lg font-bold text-white mb-4">Quality Analysis</h3>
            <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
              No data
            </div>
          </div>

          {/* Top Rejection Reasons Panel */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg flex flex-col min-h-[200px]">
            <h3 className="text-lg font-bold text-white mb-4">Top Rejection Reasons</h3>
            <div className="flex-1 flex items-center justify-start text-gray-500 text-sm">
              No rejections recorded.
            </div>
          </div>
        </div>

        {/* Right Column (Machine Performance) */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg flex flex-col min-h-[524px]">
          <h3 className="text-lg font-bold text-white mb-4">Machine Performance (Efficiency)</h3>
          <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
            No data
          </div>
        </div>

      </div>
    </div>
  );
}