import React, { useState } from 'react';
import { Search, FileText, ShieldAlert, Menu, X, CheckCircle2, AlertCircle, BarChart3 } from 'lucide-react';
import type { ActiveTab, HealthStatus } from '../types';

interface HeaderProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  health: HealthStatus | null;
  healthLoading: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  health,
  healthLoading,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isConnected = health && health.status === 'ok';

  const navItems: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { id: 'investigate', label: 'Investigate', icon: <Search className="w-4 h-4" /> },
    { id: 'documents', label: 'Documents', icon: <FileText className="w-4 h-4" /> },
    { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="w-4 h-4" /> },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-[#d3e7d1] shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Brand Logo & Tagline */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => onTabChange('investigate')}>
            <div className="w-9 h-9 rounded-lg bg-[#2F9C95] flex items-center justify-center text-white shadow-xs">
              <ShieldAlert className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold tracking-tight text-lg text-[#1f2937]">ROOTTRACE</span>
                <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-[#E5F9E0] text-[#2F9C95] border border-[#A3F7B5]">
                  AI Agent
                </span>
              </div>
              <div className="text-[11px] font-semibold tracking-widest text-[#664147] uppercase">
                Incident Intelligence
              </div>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-1">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-[#E5F9E0] text-[#2F9C95] border border-[#A3F7B5] shadow-2xs font-semibold'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50 border border-transparent'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Backend Status Indicator */}
          <div className="hidden sm:flex items-center space-x-3">
            <div
              className={`flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-medium border ${
                isConnected
                  ? 'bg-[#E5F9E0] text-[#247c76] border-[#A3F7B5]'
                  : healthLoading
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}
            >
              {isConnected ? (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#40C9A2] opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#2F9C95]"></span>
                  </span>
                  <span>Connected ({health?.doc_count ?? 0} docs)</span>
                </>
              ) : healthLoading ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <span>Checking...</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                  <span>Offline</span>
                </>
              )}
            </div>
          </div>

          {/* Mobile menu toggle */}
          <div className="flex md:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

        </div>
      </div>

      {/* Mobile dropdown menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-[#d3e7d1] bg-white px-4 pt-2 pb-4 space-y-1">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onTabChange(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-md text-sm font-medium ${
                  isActive
                    ? 'bg-[#E5F9E0] text-[#2F9C95] font-semibold border border-[#A3F7B5]'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
          
          <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500 px-3 py-2">
            <span>System Status:</span>
            <span className={`font-medium flex items-center space-x-1.5 ${isConnected ? 'text-[#247c76]' : 'text-rose-600'}`}>
              {isConnected ? <CheckCircle2 className="w-3.5 h-3.5 text-[#2F9C95]" /> : <AlertCircle className="w-3.5 h-3.5" />}
              <span>{isConnected ? `Online (${health?.doc_count} docs)` : 'Offline'}</span>
            </span>
          </div>
        </div>
      )}
    </header>
  );
};
