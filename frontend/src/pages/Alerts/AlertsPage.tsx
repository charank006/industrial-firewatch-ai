import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  Radio,
  Send,
  ShieldAlert,
} from 'lucide-react';
import { useIntelligence } from '../../context/IntelligenceContext';

interface DeliveryRecord {
  id: string;
  recipientName: string;
  recipientType: string;
  channel: string;
  status: string;
  sentAt: string;
  deliveredAt: string | null;
  acknowledgedAt: string | null;
}

export const AlertsPage: React.FC = () => {
  const { alerts, resolveAlert } = useIntelligence();
  const [searchParams] = useSearchParams();
  const incidentParamId = searchParams.get('incidentId') || 'FW-1042';

  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [channels, setChannels] = useState<{ fcm: boolean; sms: boolean; email: boolean }>({
    fcm: true,
    sms: true,
    email: true,
  });
  const [dispatchStatus, setDispatchStatus] = useState<string>('IDLE');

  // Simulated Delivery Status Stream
  const [deliveryRecords, setDeliveryRecords] = useState<DeliveryRecord[]>([
    {
      id: 'RECIP-001',
      recipientName: 'Surat District Fire Control (112)',
      recipientType: 'Emergency Contact (Fire)',
      channel: 'SMS (Twilio)',
      status: 'ACKNOWLEDGED',
      sentAt: '14:41:12 IST',
      deliveredAt: '14:41:15 IST',
      acknowledgedAt: '14:42:08 IST',
    },
    {
      id: 'RECIP-002',
      recipientName: 'Hazira GIDC Emergency Desk',
      recipientType: 'Emergency Contact (Fire)',
      channel: 'FCM Push',
      status: 'READ',
      sentAt: '14:41:12 IST',
      deliveredAt: '14:41:14 IST',
      acknowledgedAt: null,
    },
    {
      id: 'RECIP-003',
      recipientName: 'Surat Petrochem Safety Officer',
      recipientType: 'Facility Operator',
      channel: 'Email (SendGrid)',
      status: 'DELIVERED',
      sentAt: '14:41:12 IST',
      deliveredAt: '14:41:18 IST',
      acknowledgedAt: null,
    },
    {
      id: 'RECIP-004',
      recipientName: 'Rajesh Patel (Resident)',
      recipientType: 'Opted-in Resident',
      channel: 'SMS (Twilio)',
      status: 'SENT',
      sentAt: '14:41:12 IST',
      deliveredAt: null,
      acknowledgedAt: null,
    },
  ]);

  const handleAuthorizeDispatch = () => {
    setDispatchStatus('AUTHORIZING');
    setTimeout(() => {
      setDispatchStatus('DISPATCHED');
      setIsAuthModalOpen(false);

      // Add newly dispatched simulated delivery records
      const newRecip = {
        id: `RECIP-${Date.now().toString().slice(-4)}`,
        recipientName: 'Emergency Broadcast Subscriber',
        recipientType: 'Opted-in Resident',
        channel: channels.sms ? 'SMS (Twilio)' : 'FCM Push',
        status: 'QUEUED',
        sentAt: new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour12: false }) + ' IST',
        deliveredAt: null,
        acknowledgedAt: null,
      };
      setDeliveryRecords((prev) => [newRecip, ...prev]);

      // Simulate state progression QUEUED -> SENT -> DELIVERED -> ACKNOWLEDGED
      setTimeout(() => {
        setDeliveryRecords((prev) =>
          prev.map((r) => (r.id === newRecip.id ? { ...r, status: 'DELIVERED', deliveredAt: 'Just now' } : r))
        );
      }, 2000);
    }, 1200);
  };

  const handleAcknowledgeRecord = (recipId: string) => {
    setDeliveryRecords((prev) =>
      prev.map((r) =>
        r.id === recipId
          ? {
              ...r,
              status: 'ACKNOWLEDGED',
              acknowledgedAt: new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour12: false }) + ' IST',
            }
          : r
      )
    );
  };

  return (
    <div className="min-h-screen bg-[#05080D] p-4 sm:p-6 space-y-6 font-sans text-[#F1F4F6]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#253340] pb-4 font-mono">
        <div>
          <div className="flex items-center space-x-2">
            <Radio className="w-5 h-5 text-[#F04438]" />
            <h1 className="text-xl font-semibold text-white tracking-wide">
              EMERGENCY ALERT DISPATCH & DELIVERY MONITORING
            </h1>
          </div>
          <p className="text-xs text-[#A7B4C1] mt-1">
            NOTIFICATIONS LIFECYCLE: QUEUED &rarr; SENT &rarr; DELIVERED &rarr; READ &rarr; ACKNOWLEDGED
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <span className="text-xs text-[#E8A93A] bg-[#081019] px-3 py-1.5 border border-[#253340] rounded font-mono">
            TWILIO & SENDGRID DEMO MODE
          </span>

          <button
            onClick={() => setIsAuthModalOpen(true)}
            className="px-4 py-2 bg-[#F04438] hover:bg-[#FF6B35] text-white font-bold rounded text-xs transition flex items-center space-x-1.5 shadow-lg"
          >
            <Send className="w-4 h-4" />
            <span>AUTHORIZE ALERT DISPATCH</span>
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 font-mono text-xs">
        {/* Active Alert Events List (5 cols) */}
        <div className="lg:col-span-5 bg-[#081019] border border-[#253340] rounded-xl p-4 space-y-3 shadow-2xl">
          <div className="flex items-center justify-between border-b border-[#253340] pb-2">
            <span className="font-bold text-[#3DB7D9] uppercase text-xs">OPERATIONAL ALERT QUEUE</span>
            <span className="text-[10px] text-[#A7B4C1]">{alerts.filter((a) => a.isUnresolved).length} ACTIVE</span>
          </div>

          <div className="space-y-3">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={`p-3 rounded-lg border transition space-y-2 ${
                  alert.isUnresolved
                    ? 'bg-[#0D151E] border-[#F04438]/50'
                    : 'bg-[#0D151E]/40 border-[#253340] opacity-60'
                }`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[#3DB7D9]">{alert.hotspotId || alert.incidentId}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                      alert.severity === 'HIGH' || alert.severity === 'CRITICAL'
                        ? 'bg-[#F04438]/20 text-[#F04438]'
                        : 'bg-[#E8A93A]/20 text-[#E8A93A]'
                    }`}
                  >
                    {alert.severity}
                  </span>
                </div>

                <div className="font-sans font-semibold text-white text-xs">{alert.title}</div>
                <div className="text-[10px] text-[#A7B4C1]">{alert.locationName}</div>

                <div className="flex justify-between items-center text-[10px] pt-1 border-t border-[#253340]">
                  <span>FRP: {alert.frpMw} MW</span>
                  {alert.isUnresolved ? (
                    <button
                      onClick={() => resolveAlert(alert.id)}
                      className="text-[#39B978] hover:underline flex items-center space-x-1 font-bold"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Acknowledge</span>
                    </button>
                  ) : (
                    <span className="text-[#39B978]">ACKNOWLEDGED</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Real-time Delivery Status Stream (7 cols) */}
        <div className="lg:col-span-7 bg-[#081019] border border-[#253340] rounded-xl p-4 space-y-4 shadow-2xl">
          <div className="flex items-center justify-between border-b border-[#253340] pb-2">
            <span className="font-bold text-white text-xs uppercase">RECIPIENT DELIVERY & ACKNOWLEDGEMENT TRACKER</span>
            <span className="text-[10px] text-[#39B978] font-bold flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-[#39B978]" />
              <span>LIVE TRACKING</span>
            </span>
          </div>

          <div className="space-y-2">
            {deliveryRecords.map((r) => (
              <div key={r.id} className="p-3 bg-[#0D151E] border border-[#253340] rounded-lg space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-white block">{r.recipientName}</span>
                    <span className="text-[10px] text-[#A7B4C1]">{r.recipientType} &bull; {r.channel}</span>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      r.status === 'ACKNOWLEDGED'
                        ? 'bg-[#39B978]/20 text-[#39B978] border border-[#39B978]/40'
                        : r.status === 'READ'
                        ? 'bg-[#3DB7D9]/20 text-[#3DB7D9]'
                        : r.status === 'DELIVERED'
                        ? 'bg-[#E8A93A]/20 text-[#E8A93A]'
                        : 'bg-[#6F7E8D]/20 text-[#A7B4C1]'
                    }`}
                  >
                    {r.status}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[10px] text-[#A7B4C1] pt-1 border-t border-[#253340]">
                  <span>Sent: {r.sentAt} {r.deliveredAt ? `| Delivered: ${r.deliveredAt}` : ''}</span>

                  {r.status !== 'ACKNOWLEDGED' && (
                    <button
                      onClick={() => handleAcknowledgeRecord(r.id)}
                      className="text-[#39B978] hover:underline font-bold"
                    >
                      Acknowledge Response
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ADMIN AUTHORIZATION MODAL */}
      {isAuthModalOpen && (
        <div className="fixed inset-0 bg-[#05080D]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 font-mono text-xs">
          <div className="bg-[#081019] border border-[#253340] rounded-xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#253340] pb-3">
              <div className="flex items-center space-x-2">
                <ShieldAlert className="w-5 h-5 text-[#F04438]" />
                <h2 className="font-bold text-white text-base">AUTHORIZE ALERT DISPATCH</h2>
              </div>
            </div>

            <div className="space-y-3">
              <div className="p-3 bg-[#0D151E] border border-[#253340] rounded space-y-1">
                <span className="text-[10px] text-[#A7B4C1]">TARGET INCIDENT:</span>
                <div className="font-bold text-white text-sm">{incidentParamId}</div>
                <div className="text-[11px] text-[#FF6B35]">Surat Petrochemical Industrial Zone</div>
              </div>

              <div>
                <label className="text-[10px] text-[#A7B4C1] uppercase block mb-1">SELECT DISPATCH CHANNELS</label>
                <div className="space-y-2">
                  <label className="flex items-center space-x-2 text-white cursor-pointer">
                    <input
                      type="checkbox"
                      checked={channels.fcm}
                      onChange={(e) => setChannels({ ...channels, fcm: e.target.checked })}
                      className="accent-[#3DB7D9]"
                    />
                    <span>FCM Cloud Push Notification (Mobile App)</span>
                  </label>
                  <label className="flex items-center space-x-2 text-white cursor-pointer">
                    <input
                      type="checkbox"
                      checked={channels.sms}
                      onChange={(e) => setChannels({ ...channels, sms: e.target.checked })}
                      className="accent-[#3DB7D9]"
                    />
                    <span>Twilio SMS Emergency Broadcast</span>
                  </label>
                  <label className="flex items-center space-x-2 text-white cursor-pointer">
                    <input
                      type="checkbox"
                      checked={channels.email}
                      onChange={(e) => setChannels({ ...channels, email: e.target.checked })}
                      className="accent-[#3DB7D9]"
                    />
                    <span>SendGrid Email Dispatch</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-[#253340] flex justify-end space-x-2">
              <button
                onClick={() => setIsAuthModalOpen(false)}
                className="px-4 py-2 bg-[#0D151E] text-[#A7B4C1] hover:text-white rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleAuthorizeDispatch}
                disabled={dispatchStatus === 'AUTHORIZING'}
                className="px-4 py-2 bg-[#F04438] hover:bg-[#FF6B35] text-white font-bold rounded flex items-center space-x-1.5"
              >
                <Send className="w-4 h-4" />
                <span>{dispatchStatus === 'AUTHORIZING' ? 'AUTHORIZING...' : 'AUTHORIZE & DISPATCH NOW'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
