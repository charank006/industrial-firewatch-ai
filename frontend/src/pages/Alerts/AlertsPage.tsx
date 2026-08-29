import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';
import { useIntelligence } from '../../context/IntelligenceContext';

export const AlertsPage: React.FC = () => {
  const { alerts, resolveAlert, selectIncidentById } = useIntelligence();
  const navigate = useNavigate();

  const handleFocusClick = (incidentId: string) => {
    selectIncidentById(incidentId);
    navigate(`/command-center?incidentId=${incidentId}`);
  };

  return (
    <div className="min-h-screen bg-[#05080D] p-4 sm:p-6 space-y-6 font-sans text-[#F1F4F6]">
      {/* Title Header */}
      <div className="flex items-center justify-between border-b border-[#253340] pb-4 font-mono">
        <div>
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-[#F04438]" />
            <h1 className="text-xl font-semibold text-white tracking-wide">
              OPERATIONAL ALERT QUEUE
            </h1>
          </div>
          <p className="text-xs text-[#A7B4C1] mt-1">
            CRITICAL & HIGH PRIORITY INCIDENT NOTIFICATION STREAM
          </p>
        </div>

        <div className="text-xs font-mono text-[#3DB7D9] bg-[#081019] px-3 py-1.5 border border-[#253340] rounded">
          {alerts.filter((a) => a.isUnresolved).length} UNRESOLVED ALERTS
        </div>
      </div>

      {/* Alert Feed List */}
      <div className="space-y-3 font-mono text-xs max-w-5xl mx-auto">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={`p-4 rounded-lg border transition space-y-2 ${
              alert.isUnresolved
                ? alert.severity === 'CRITICAL' || alert.severity === 'HIGH'
                  ? 'bg-[#081019] border-[#F04438]/40 shadow-lg'
                  : 'bg-[#081019] border-[#E8A93A]/40'
                : 'bg-[#0D151E]/40 border-[#253340] opacity-60'
            }`}
          >
            <div className="flex items-center justify-between border-b border-[#253340] pb-2">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-[#3DB7D9]">{alert.incidentId}</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    alert.severity === 'HIGH' || alert.severity === 'CRITICAL'
                      ? 'bg-[#F04438]/20 text-[#F04438]'
                      : 'bg-[#E8A93A]/20 text-[#E8A93A]'
                  }`}
                >
                  {alert.severity}
                </span>
              </div>
              <span className="text-[10px] text-[#A7B4C1]">{alert.timestampFormatted}</span>
            </div>

            <div className="text-sm font-sans font-semibold text-white">
              {alert.title}
            </div>

            <p className="text-xs text-[#A7B4C1] font-sans leading-relaxed">
              {alert.message}
            </p>

            <div className="flex items-center justify-between pt-2 border-t border-[#253340] text-xs">
              <button
                onClick={() => handleFocusClick(alert.incidentId || alert.hotspotId)}
                className="px-3 py-1 bg-[#3DB7D9] hover:bg-[#287FB1] text-[#05080D] font-semibold rounded transition inline-flex items-center space-x-1"
              >
                <span>Focus Map Command Center</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>

              {alert.isUnresolved ? (
                <button
                  onClick={() => resolveAlert(alert.id)}
                  className="px-3 py-1 bg-[#0D151E] hover:bg-[#111B25] border border-[#253340] text-[#39B978] rounded transition inline-flex items-center space-x-1"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Acknowledge Alert</span>
                </button>
              ) : (
                <span className="text-[10px] text-[#39B978] font-bold">ACKNOWLEDGED</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
