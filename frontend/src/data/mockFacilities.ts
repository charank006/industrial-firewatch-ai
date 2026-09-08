import type { IndustrialFacility } from '../types';

/**
 * Demo-mode stand-ins, shaped like the OSM-derived payload.
 *
 * These are no longer seeded into the database: the curated registry was
 * removed because it could only describe the region it was seeded for, and
 * held these six Gujarat plants while the pipeline polled Telangana. They
 * exist solely so `VITE_DATA_SOURCE=mock` still renders.
 */
export const MOCK_FACILITIES: IndustrialFacility[] = [
  {
    id: 'Oil / Gas|Surat Petrochemicals Complex',
    name: 'Surat Petrochemicals Complex',
    type: 'Oil / Gas',
    lat: 21.1702,
    lng: 72.8311,
    location: 'Surat Industrial Zone, Gujarat',
    status: 'ANOMALY_DETECTED',
    named: true,
    nearestDistanceM: 420,
    currentFRP: 184.6,
    lastDetected: '2026-08-27T16:12:00Z',
    eventCount: 3,
    fireEventIds: ['FW-2026-0842', 'FW-2026-0839', 'FW-2026-0831'],
  },
  {
    id: 'Oil / Gas|Hazira LNG Terminal',
    name: 'Hazira LNG Terminal',
    type: 'Oil / Gas',
    lat: 21.1118,
    lng: 72.6358,
    location: 'Hazira Coastal Belt, Gujarat',
    status: 'ELEVATED',
    named: true,
    nearestDistanceM: 180,
    currentFRP: 82.3,
    lastDetected: '2026-08-27T14:45:00Z',
    eventCount: 1,
    fireEventIds: ['FW-2026-0838'],
  },
  {
    id: 'Industrial Estate|Dahej Petrochemical Industrial Estate',
    name: 'Dahej Petrochemical Industrial Estate',
    type: 'Industrial Estate',
    lat: 21.6893,
    lng: 72.5408,
    location: 'Dahej SEZ, Bharuch, Gujarat',
    status: 'ELEVATED',
    named: true,
    nearestDistanceM: 0,
    currentFRP: 30.5,
    lastDetected: '2026-08-27T12:20:00Z',
    eventCount: 1,
    fireEventIds: ['FW-2026-0829'],
  },
  {
    id: 'Works / Factory|Vapi Chemical Manufacturing Complex',
    name: 'Vapi Chemical Manufacturing Complex',
    type: 'Works / Factory',
    lat: 20.3714,
    lng: 72.9047,
    location: 'Vapi GIDC, Valsad, Gujarat',
    status: 'ANOMALY_DETECTED',
    named: true,
    nearestDistanceM: 260,
    currentFRP: 112.7,
    lastDetected: '2026-08-27T10:05:00Z',
    eventCount: 2,
    fireEventIds: ['FW-2026-0827', 'FW-2026-0821'],
  },
  {
    id: 'Industrial Estate|Unnamed Industrial Estate',
    name: 'Unnamed Industrial Estate',
    type: 'Industrial Estate',
    lat: 22.4707,
    lng: 70.0577,
    location: 'Moti Khavdi, Jamnagar, Gujarat',
    status: 'ELEVATED',
    // Unnamed parcels are common in OSM; the demo data shows one so the UI
    // path that handles them is exercised.
    named: false,
    nearestDistanceM: 640,
    currentFRP: 118.4,
    lastDetected: '2026-08-27T08:30:00Z',
    eventCount: 1,
    fireEventIds: ['FW-2026-0815'],
  },
  {
    id: 'Works / Factory|Bharuch Fertilizer & Chemical Complex',
    name: 'Bharuch Fertilizer & Chemical Complex',
    type: 'Works / Factory',
    lat: 21.7051,
    lng: 72.9959,
    location: 'Narmadanagar, Bharuch, Gujarat',
    status: 'ELEVATED',
    named: true,
    nearestDistanceM: 910,
    currentFRP: 14.2,
    lastDetected: '2026-08-26T22:10:00Z',
    eventCount: 1,
    fireEventIds: ['FW-2026-0808'],
  },
];
