import { DEFAULT_MODE } from '../config.js';
import { demoStaff } from '../domain/access.js';

// Bundled demo data. Every name, phone number, address and GSTIN here is invented and labelled as demo.
export const BUSINESS = {
  business_name: 'CoolCare AC Services',
  address: 'Shop 4, Demo Lane, Kothrud, Pune 411038',
  gstin: '27AAAAA0000A1Z5',
};

export const DEMO_CUSTOMERS = [
  { id: 'c01', name: 'Anita Deshpande', phone: '9900000101', area: 'Baner', equipment: 'LG 1T split AC', amc_expiry: '2027-01-09', amc_value: 4800, reminded_at: null },
  { id: 'c02', name: 'Farhan Shaikh', phone: '9900000102', area: 'Hadapsar', equipment: '2 x Daikin 2T split AC', amc_expiry: '2027-01-18', amc_value: 9200, reminded_at: null },
  { id: 'c03', name: 'Meera Joshi', phone: '9900000103', area: 'Aundh', equipment: 'Blue Star 1.5T window AC', amc_expiry: '2027-01-27', amc_value: 3900, reminded_at: null },
  { id: 'c04', name: 'Kulkarni Clinic', phone: '9900000104', area: 'Deccan', equipment: '3 x Carrier cassette AC', amc_expiry: '2027-02-08', amc_value: 18500, reminded_at: null },
  { id: 'c05', name: 'Rohit Verma', phone: '9900000105', area: 'Wakad', equipment: 'Samsung 1.5T inverter AC', amc_expiry: '2027-02-21', amc_value: 5200, reminded_at: null },
  { id: 'c06', name: 'Hotel Sahyadri', phone: '9900000106', area: 'Shivajinagar', equipment: '5-unit Voltas ductable AC', amc_expiry: '2027-03-04', amc_value: 42000, reminded_at: null },
  { id: 'c07', name: 'Sneha Patil', phone: '9900000107', area: 'Kharadi', equipment: 'Hitachi 1T split AC', amc_expiry: '2027-03-22', amc_value: 4500, reminded_at: null },
  { id: 'c08', name: 'Green Leaf Cafe', phone: '9900000108', area: 'Koregaon Park', equipment: '2 x Lloyd 2T split AC', amc_expiry: '2027-03-30', amc_value: 11000, reminded_at: null },
  { id: 'c09', name: 'Vikas Gupta', phone: '9900000109', area: 'Pimple Saudagar', equipment: 'Panasonic 1.5T split AC', amc_expiry: '2027-04-20', amc_value: 5600, reminded_at: null },
  { id: 'c10', name: 'Dr. Arvind Rao', phone: '9900000110', area: 'Model Colony', equipment: 'Daikin 1.5T split AC', amc_expiry: '2027-06-10', amc_value: 6000, reminded_at: null },
  { id: 'c11', name: 'Shree Ganesh Traders', phone: '9900000111', area: 'Market Yard', equipment: "O'General 2T split AC", amc_expiry: '2026-12-12', amc_value: 7800, reminded_at: null },
  { id: 'c12', name: 'Pooja Menon', phone: '9900000112', area: 'Viman Nagar', equipment: 'Whirlpool 1T split AC', amc_expiry: '2026-12-28', amc_value: 4200, reminded_at: null },
];

export const SAMPLES = [
  {
    id: 's-ramesh',
    kind: 'voice',
    label: 'Ramesh Sharma gas refill',
    technician: 'Santosh (technician)',
    seconds: 42,
    media_url: null, // simulated voice note: no audio file is shipped with the demo
    mock_transcript:
      'Sir, visited Ramesh Sharma ji in Kothrud. Voltas 1.5 ton split AC was not cooling, did a gas refill with R32. Customer number 98765 43210. His AMC runs till 15 March 2027, value 6,500. Gas refill charge 2,500, plus visit 400.',
    mock_extraction: {
      customer_name: 'Ramesh Sharma',
      phone: '9876543210',
      area: 'Kothrud',
      equipment: 'Voltas 1.5T split AC',
      work_done: 'Gas refill',
      parts: 'R32 refrigerant',
      amc_expiry: '2027-03-15',
      amc_value: 6500,
      lines: [
        { description: 'Gas refill (R32), Voltas 1.5T split AC', qty: 1, rate: 2500 },
        { description: 'Service visit', qty: 1, rate: 400 },
      ],
    },
  },
  {
    id: 's-neha',
    kind: 'voice',
    label: 'Neha Kapoor new AMC',
    technician: 'Imran (technician)',
    seconds: 31,
    media_url: null,
    mock_transcript:
      "New AMC at Neha Kapoor madam's flat in Bavdhan. Two Daikin 1 ton split ACs, did filter cleaning on both. Number 99000 00213. AMC for one year till 31 December 2027, 8,400 for both units. Cleaning 300 each.",
    mock_extraction: {
      customer_name: 'Neha Kapoor',
      phone: '9900000213',
      area: 'Bavdhan',
      equipment: '2 x Daikin 1T split AC',
      work_done: 'New AMC, filter cleaning',
      parts: '',
      amc_expiry: '2027-12-31',
      amc_value: 8400,
      lines: [
        { description: 'Annual maintenance contract, 2 units, 1 year', qty: 1, rate: 8400 },
        { description: 'Filter cleaning', qty: 2, rate: 300 },
      ],
    },
  },
  {
    id: 's-sunil',
    kind: 'photo',
    label: 'Job sheet photo: Sunil Patil',
    technician: 'Santosh (technician)',
    media_url: 'jobsheet',
    mock_transcript:
      'Job sheet No. 1187, 26/12/2026. Customer: Sunil Patil, Warje. Ph 99000 00177. Unit: LG 1.5T split AC. Work: PCB repair, capacitor replaced. Parts: capacitor 45 uF Rs 650. Labour Rs 800. AMC till 30/01/2027, Rs 5,500.',
    mock_extraction: {
      customer_name: 'Sunil Patil',
      phone: '9900000177',
      area: 'Warje',
      equipment: 'LG 1.5T split AC',
      work_done: 'PCB repair, capacitor replaced',
      parts: 'Capacitor 45 uF',
      amc_expiry: '2027-01-30',
      amc_value: 5500,
      lines: [
        { description: 'Capacitor 45 uF', qty: 1, rate: 650 },
        { description: 'Labour: PCB repair', qty: 1, rate: 800 },
      ],
    },
  },
];

export const WELCOME_MESSAGE = {
  id: 'm-welcome',
  from: 'bot',
  kind: 'text',
  body: "Namaste! I'm KaryaHub, CoolCare AC Services' job assistant. Technicians send me voice notes, photos of job sheets or plain text, and I turn them into job records, quotes and renewal reminders.",
  at: '2027-01-01T09:00:00',
};

export const DATA_VERSION = 3; // 3: staff accounts and access log (CR-0003)

export function demoState() {
  return {
    version: DATA_VERSION,
    settings: { ...BUSINESS, mode: DEFAULT_MODE, simulate_failure: false, theme: 'system' },
    customers: DEMO_CUSTOMERS.map((c) => ({ ...c })),
    jobs: [],
    documents: [],
    messages: [{ ...WELCOME_MESSAGE }],
    seq: { job: 0, quote: 0, invoice: 0, msg: 0, customer: 0, staff: 0, log: 0 },
    staff: demoStaff(),
    access_log: [],
  };
}
