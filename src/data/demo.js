import { DEFAULT_MODE } from '../config.js';

// Bundled demo data. Every name, phone number, address and GSTIN here is invented and labelled as demo.
export const BUSINESS = {
  business_name: 'CoolCare AC Services',
  address: 'Shop 4, Demo Lane, Kothrud, Pune 411038',
  gstin: '27AAAAA0000A1Z5',
  is_demo: true,
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

const WELCOME_TEXT = 'Technicians send me voice notes, photos of job sheets or plain text, and I turn them into job records, quotes and renewal reminders.';
export const welcomeMessage = (businessName) => ({
  id: 'm-welcome',
  from: 'bot',
  kind: 'text',
  body: `Namaste! I'm KaryaHub, the job assistant for ${businessName}. ${WELCOME_TEXT}`,
  at: '2027-01-01T09:00:00',
});
export const WELCOME_MESSAGE = {
  ...welcomeMessage(BUSINESS.business_name),
  body: `Namaste! I'm KaryaHub, CoolCare AC Services' job assistant. ${WELCOME_TEXT}`,
};

export const DATA_VERSION = 5; // 4: staff and the access log moved to the server (CR-0005); 5: inventory (CR-0011)

// Sample inventory for the demo business only. Prices are in paise. It stays on the device and never syncs.
const item = (id, code, name, unit, qty, low, sale, cost, hsn, gst = 18) => ({ id, code, name, unit, qty, low, sale: sale * 100, cost: cost == null ? null : cost * 100, hsn: hsn || '', gst, stopped: false });
export const DEMO_ITEMS = [
  item('it-r32', 'GAS-R32', 'R32 refrigerant gas', 'kg', 6.5, 5, 950, 620, '2903'),
  item('it-r22', 'GAS-R22', 'R22 refrigerant gas', 'kg', 1.5, 3, 1100, 760, '2903'),
  item('it-cap45', 'CAP-45', 'Capacitor 45 µF', 'nos', 12, 5, 450, 210, '8532'),
  item('it-cap25', 'CAP-2.5', 'Capacitor 2.5 µF fan', 'nos', 3, 5, 180, 70, '8532'),
  item('it-cu14', 'CU-14', 'Copper pipe 1/4 in', 'metre', 38, 20, 260, 180, '7411'),
  item('it-cu38', 'CU-38', 'Copper pipe 3/8 in', 'metre', 0, 15, 320, 230, '7411'),
  item('it-motor', 'MTR-IDU15', 'Indoor fan motor, 1.5 ton split', 'nos', 2, 2, 3200, 2100, '8501'),
  item('it-pcb', 'PCB-UNI', 'PCB, universal split AC', 'nos', 4, 2, 2800, 1650, '8537'),
  item('it-drain', 'DRN-16', 'Drain pipe 16 mm', 'metre', 45, 10, 40, 22, '3917'),
  item('it-tape', 'TAPE-INS', 'Insulation tape', 'roll', 24, 10, 60, 28, '3919'),
  item('it-filter', 'FLT-SET', 'Filter mesh (pair)', 'set', 9, 4, 350, 150, ''),
  item('it-valve', 'VLV-CHG', 'Gas charging valve', 'nos', 7, null, 220, 120, '8481'),
];
const demoMoves = () => DEMO_ITEMS.map((i) => ({
  id: `mv-${i.id}`, item_id: i.id, kind: 'opening', qty: i.qty, after: i.qty, date: '2026-12-01', at: '2026-12-01T09:00:00', who: 'Akash Mehta', note: 'Sample stock',
}));

const SEQ = { job: 0, quote: 0, invoice: 0, msg: 0, customer: 0 };

/** The sample business: bundled customers and a welcome message. Only the demo business uses it. */
export function demoState() {
  return {
    version: DATA_VERSION,
    settings: { ...BUSINESS, mode: DEFAULT_MODE, simulate_failure: false, theme: 'system' },
    customers: DEMO_CUSTOMERS.map((c) => ({ ...c })),
    jobs: [],
    documents: [],
    messages: [{ ...WELCOME_MESSAGE }],
    items: DEMO_ITEMS.map((i) => ({ ...i })),
    stock_moves: demoMoves(),
    seq: { ...SEQ },
  };
}

/** A real business starts empty: no sample customers, no sample chat. */
export function emptyState(business) {
  return {
    version: DATA_VERSION,
    settings: {
      business_name: business.name, address: business.address || '', gstin: business.gstin || '', is_demo: false,
      mode: DEFAULT_MODE, simulate_failure: false, theme: 'system',
    },
    customers: [],
    jobs: [],
    documents: [],
    messages: [welcomeMessage(business.name)],
    items: [],
    stock_moves: [],
    seq: { ...SEQ },
  };
}
