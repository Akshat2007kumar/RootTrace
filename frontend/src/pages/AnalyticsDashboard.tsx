import React, { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

interface MetricData {
  prompt: string;
  full_prompt: string;
  answered: number;
  insufficient: number;
  total: number;
}

export const AnalyticsDashboard: React.FC = () => {
  const [data, setData] = useState<MetricData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        // Using the same URL origin logic as api.ts if possible
        const baseUrl = window.location.hostname === 'localhost' && window.location.port !== '8000' 
          ? 'http://localhost:8000' 
          : '';
        const response = await fetch(`${baseUrl}/metrics`);
        if (!response.ok) {
          throw new Error('Failed to fetch metrics');
        }
        const result = await response.json();
        setData(result.data);
      } catch (err: any) {
        setError(err.message || 'Error fetching metrics');
      } finally {
        setLoading(false);
      }
    };
    fetchMetrics();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-12">
        <div className="text-gray-500 font-medium animate-pulse">Loading metrics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 text-red-700 p-4 rounded-md border border-red-200">
          {error}
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="p-8 text-center">
        <div className="text-gray-500">No query metrics available yet.</div>
      </div>
    );
  }

  const totalQueries = data.reduce((sum, item) => sum + item.total, 0);
  const totalAnswered = data.reduce((sum, item) => sum + item.answered, 0);
  const totalInsufficient = data.reduce((sum, item) => sum + item.insufficient, 0);

  const pieData = [
    { name: 'Answered', value: totalAnswered },
    { name: 'Insufficient Evidence', value: totalInsufficient }
  ];
  const COLORS = ['#2F9C95', '#F59E0B']; // matched brand colors

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Investigation Analytics</h2>
        <p className="text-sm text-gray-600 mt-1">
          Tracking frequency and verdicts for {totalQueries} total queries.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Bar Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-6">Queries by Frequency & Verdict</h3>
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 50 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis 
                  dataKey="prompt" 
                  angle={-45}
                  textAnchor="end"
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  height={80}
                />
                <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} />
                <Tooltip 
                  cursor={{ fill: '#f9fafb' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                <Bar dataKey="answered" name="Answered" stackId="a" fill="#2F9C95" radius={[0, 0, 4, 4]} />
                <Bar dataKey="insufficient" name="Insufficient Evidence" stackId="a" fill="#F59E0B" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col">
          <h3 className="text-lg font-semibold text-gray-800 mb-6">Overall Verdict Breakdown</h3>
          <div className="flex-1 min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={120}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  itemStyle={{ fontWeight: 500 }}
                />
                <Legend verticalAlign="bottom" height={36} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
