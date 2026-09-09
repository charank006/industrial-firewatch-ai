import React from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Header } from './components/layout/Header';
import { Navigation } from './components/layout/Navigation';
import { FirmsLiveSyncModal } from './components/modals/FirmsLiveSyncModal';
import { IntelligenceProvider } from './context/IntelligenceContext';
import { AlertsPage } from './pages/Alerts/AlertsPage';
import { AnalyticsPage } from './pages/Analytics/AnalyticsPage';
import { CommandCenterPage } from './pages/CommandCenter/CommandCenterPage';
import { FireDetailPage } from './pages/FireDetail/FireDetailPage';
import { GlobalEarthPage } from './pages/GlobalEarth/GlobalEarthPage';
import { IncidentAnalysisPage } from './pages/IncidentAnalysis/IncidentAnalysisPage';
import { IncidentDetailsPage } from './pages/IncidentDetails/IncidentDetailsPage';
import { IncidentsPage } from './pages/Incidents/IncidentsPage';
import { LandingPage } from './pages/Landing/LandingPage';
import { MethodologyPage } from './pages/Methodology/MethodologyPage';
import { MissionBriefPage } from './pages/MissionBrief/MissionBriefPage';
import { RiskImpactPage } from './pages/RiskImpact/RiskImpactPage';
import { SystemStatusPage } from './pages/SystemStatus/SystemStatusPage';
import { ThermalHistoryPage } from './pages/ThermalHistory/ThermalHistoryPage';
import { WeatherAnalysisPage } from './pages/WeatherAnalysis/WeatherAnalysisPage';

const AppContent: React.FC = () => {
  const location = useLocation();
  const isLanding = location.pathname === '/';

  return (
    <div className="min-h-screen bg-[#05080D] flex flex-col font-sans selection:bg-[#3DB7D9] selection:text-[#05080D] overflow-hidden">
      {!isLanding && <Header />}
      {!isLanding && <Navigation />}
      <FirmsLiveSyncModal />

      <div className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/global-earth" element={<GlobalEarthPage />} />
          <Route path="/command-center" element={<CommandCenterPage />} />
          <Route path="/fire/:fireId" element={<FireDetailPage />} />
          <Route path="/incident/:incidentId" element={<IncidentAnalysisPage />} />
          <Route path="/incidents/:id" element={<IncidentDetailsPage />} />
          <Route path="/incidents" element={<IncidentsPage />} />
          <Route path="/risk-zone-registry" element={<IncidentsPage />} />
          <Route path="/map-explorer" element={<GlobalEarthPage />} />
          <Route path="/thermal-history" element={<ThermalHistoryPage />} />
          <Route path="/weather-analysis" element={<WeatherAnalysisPage />} />
          <Route path="/facility-watch" element={<IncidentsPage />} />
          <Route path="/risk-impact" element={<RiskImpactPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/system-status" element={<SystemStatusPage />} />
          <Route path="/methodology" element={<MethodologyPage />} />
          <Route path="/mission-brief" element={<MissionBriefPage />} />
        </Routes>
      </div>
    </div>
  );
};

export function App() {
  return (
    <IntelligenceProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </IntelligenceProvider>
  );
}

export default App;
