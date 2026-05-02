/**
 * Stub employee directory — mirrors backend STUB_EMPLOYEES.
 * Used by the frontend to render profile pages without an extra API call.
 *
 * Roster sourced from W2 DOB_DOH.xlsx census (April 2026).
 * Emails follow the agrunwald+N@clearcompany.com demo pattern.
 * Hire dates are real; DOB years are masked so omitted here.
 */

export interface EmployeeProfile {
  id: string;
  firstName: string;
  lastName: string;
  title: string;
  department: string;
  email: string;
  managerId: string;
  managerName: string;
  managerTitle: string;
  location: string;
  startDate: string;
  avatarColor: string; // background for initials avatar
  bio: string;
  goals: { title: string; progress: number; due: string }[];
  /** Frontline employees don't have a corporate desk; recognition delivered via personal channel */
  isFrontline?: boolean;
  personalEmail?: string;
  personalPhone?: string;
}

export const EMPLOYEES: EmployeeProfile[] = [
  // ── Customer Success (reports to Rachael Alpert) ─────────────────────────
  {
    id: 'emp_001',
    firstName: 'Samuel',
    lastName: 'Abramsky',
    title: 'Customer Success Specialist',
    department: 'Customer Success',
    email: 'agrunwald+4@clearcompany.com',
    managerId: 'mgr_001',
    managerName: 'Rachael Alpert',
    managerTitle: 'VP Customer Success',
    location: 'New York, NY',
    startDate: '2023-07-10',
    avatarColor: '#dbeafe',
    isFrontline: true,
    personalEmail: 'samuel.abramsky@gmail.com',
    personalPhone: '+1-212-555-0147',
    bio: 'Samuel brings energy and empathy to every customer interaction. Since joining in 2023 he has become the go-to escalation specialist on the team, consistently turning frustrated customers into advocates. He is pursuing his CX certification and mentors two new hires.',
    goals: [
      { title: 'Achieve 4.8+ CSAT score for Q2', progress: 81, due: 'Q2 2026' },
      { title: 'Complete CX Professional certification', progress: 55, due: 'Jun 2026' },
      { title: 'Reduce average resolution time to < 6 hours', progress: 68, due: 'Q2 2026' },
    ],
  },
  {
    id: 'emp_002',
    firstName: 'Jordan',
    lastName: 'Beaman',
    title: 'Implementation Manager',
    department: 'Customer Success',
    email: 'agrunwald+5@clearcompany.com',
    managerId: 'mgr_001',
    managerName: 'Rachael Alpert',
    managerTitle: 'VP Customer Success',
    location: 'Austin, TX',
    startDate: '2022-05-31',
    avatarColor: '#d1fae5',
    isFrontline: true,
    personalEmail: 'jordan.beaman@gmail.com',
    personalPhone: '+1-512-555-0283',
    bio: 'Jordan leads the implementation practice for mid-market and enterprise accounts. She has onboarded 50+ customers and built the implementation playbook the entire team now runs from. Her hallmark is getting customers to first value in under 21 days.',
    goals: [
      { title: 'Reduce time-to-first-value to < 21 days', progress: 91, due: 'Q2 2026' },
      { title: 'Train 3 new implementation specialists', progress: 67, due: 'Q3 2026' },
      { title: 'Publish updated enterprise onboarding playbook', progress: 40, due: 'May 2026' },
    ],
  },
  {
    id: 'emp_003',
    firstName: 'Maddy',
    lastName: 'Bender',
    title: 'Customer Success Manager',
    department: 'Customer Success',
    email: 'agrunwald+6@clearcompany.com',
    managerId: 'mgr_001',
    managerName: 'Rachael Alpert',
    managerTitle: 'VP Customer Success',
    location: 'Chicago, IL',
    startDate: '2022-02-21',
    avatarColor: '#ede9fe',
    bio: 'Maddy manages a portfolio of 20 strategic accounts with an 97% renewal rate — the highest on the team three quarters running. She introduced the customer health scoring model that is now standard practice across the CS org.',
    goals: [
      { title: 'Maintain 97%+ renewal rate across portfolio', progress: 97, due: 'EOY 2026' },
      { title: 'Expand 4 accounts to additional modules', progress: 50, due: 'Q3 2026' },
      { title: 'Complete Salesforce Admin certification', progress: 30, due: 'Jun 2026' },
    ],
  },
  {
    id: 'emp_004',
    firstName: 'Colin',
    lastName: 'Beverstock',
    title: 'Senior Customer Success Manager',
    department: 'Customer Success',
    email: 'agrunwald+7@clearcompany.com',
    managerId: 'mgr_001',
    managerName: 'Rachael Alpert',
    managerTitle: 'VP Customer Success',
    location: 'San Francisco, CA',
    startDate: '2014-03-01',
    avatarColor: '#fce7f3',
    bio: 'With over 12 years at ClearCompany, Colin is the institutional memory of the CS team. He leads the strategic accounts program, covers the largest enterprise logos, and is the first call when a customer relationship gets complicated. He has mentored almost every CSM on the current team.',
    goals: [
      { title: 'Grow strategic accounts ARR by 15%', progress: 62, due: 'EOY 2026' },
      { title: 'Complete executive sponsor mapping for top 10 accounts', progress: 80, due: 'May 2026' },
      { title: 'Launch peer mentorship program for new CSMs', progress: 45, due: 'Q3 2026' },
    ],
  },

  // ── Engineering (reports to David Almeida) ────────────────────────────────
  {
    id: 'emp_005',
    firstName: 'Eddie',
    lastName: 'Amori',
    title: 'Software Engineer',
    department: 'Engineering',
    email: 'agrunwald+8@clearcompany.com',
    managerId: 'mgr_002',
    managerName: 'David Almeida',
    managerTitle: 'Director of Engineering',
    location: 'Remote',
    startDate: '2022-11-14',
    avatarColor: '#fef3c7',
    bio: 'Eddie is the team\'s resident performance expert. He shaved 40% off the API p99 latency in his first year and has been the go-to engineer for any critical path optimization ever since. He is an active open-source contributor and leads the weekly architecture guild.',
    goals: [
      { title: 'Reduce API p99 latency to < 200ms', progress: 74, due: 'Q2 2026' },
      { title: 'Ship observability v2 (distributed tracing)', progress: 55, due: 'Q3 2026' },
      { title: 'Mentor one junior engineer through first major feature', progress: 90, due: 'Jun 2026' },
    ],
  },
  {
    id: 'emp_006',
    firstName: 'Jake',
    lastName: 'Axsom',
    title: 'Associate Software Engineer',
    department: 'Engineering',
    email: 'agrunwald+9@clearcompany.com',
    managerId: 'mgr_002',
    managerName: 'David Almeida',
    managerTitle: 'Director of Engineering',
    location: 'Denver, CO',
    startDate: '2024-12-02',
    avatarColor: '#ccfbf1',
    bio: 'Jake joined fresh out of university and hit the ground running — he shipped his first production feature in week three and has already fixed two long-standing bugs that stumped senior engineers. He brings fresh eyes and a relentless curiosity to every code review.',
    goals: [
      { title: 'Ship first solo feature end-to-end', progress: 100, due: 'Q1 2026' },
      { title: 'Reach 80% test coverage on owned modules', progress: 62, due: 'Q2 2026' },
      { title: 'Complete internal backend architecture course', progress: 48, due: 'Jun 2026' },
    ],
  },
  {
    id: 'emp_007',
    firstName: 'Melanie',
    lastName: 'Baravik',
    title: 'Product Manager',
    department: 'Engineering',
    email: 'agrunwald+10@clearcompany.com',
    managerId: 'mgr_002',
    managerName: 'David Almeida',
    managerTitle: 'Director of Engineering',
    location: 'Boston, MA',
    startDate: '2021-04-05',
    avatarColor: '#e0e7ff',
    bio: 'Melanie bridges customer insights and technical execution better than anyone on the team. She drives the quarterly roadmap process, runs discovery with 30+ customers per quarter, and has an uncanny ability to turn ambiguous feedback into clear, shippable specs.',
    goals: [
      { title: 'Launch Q3 roadmap with 90%+ stakeholder alignment', progress: 58, due: 'Q3 2026' },
      { title: 'Reduce feature discovery-to-spec cycle to < 2 weeks', progress: 72, due: 'Q2 2026' },
      { title: 'Complete Product Leadership certification', progress: 35, due: 'Aug 2026' },
    ],
  },

  // ── Sales (reports to Thomas Badeen) ─────────────────────────────────────
  {
    id: 'emp_008',
    firstName: 'Lorraine',
    lastName: 'Alexus',
    title: 'Account Executive',
    department: 'Sales',
    email: 'agrunwald+11@clearcompany.com',
    managerId: 'mgr_003',
    managerName: 'Thomas Badeen',
    managerTitle: 'Sales Manager',
    location: 'Atlanta, GA',
    startDate: '2024-06-10',
    avatarColor: '#fce7f3',
    isFrontline: true,
    personalEmail: 'lorraine.alexus@gmail.com',
    personalPhone: '+1-404-555-0319',
    bio: 'Lorraine joined less than two years ago and is already tracking to exceed her annual quota by 120%. She has a talent for multi-threading deals and keeping late-stage opportunities moving when others stall. Her pipeline hygiene is the benchmark the whole team aims for.',
    goals: [
      { title: 'Achieve 120% of Q2 quota', progress: 88, due: 'Q2 2026' },
      { title: 'Close 2 enterprise deals > $100K ARR', progress: 50, due: 'Q2 2026' },
      { title: 'Complete MEDDIC advanced certification', progress: 70, due: 'May 2026' },
    ],
  },
  {
    id: 'emp_009',
    firstName: 'Jeremy',
    lastName: 'Allen',
    title: 'Senior Account Executive',
    department: 'Sales',
    email: 'agrunwald+12@clearcompany.com',
    managerId: 'mgr_003',
    managerName: 'Thomas Badeen',
    managerTitle: 'Sales Manager',
    location: 'Dallas, TX',
    startDate: '2024-06-10',
    avatarColor: '#dbeafe',
    bio: 'Jeremy is the team\'s deal mechanic — give him a stalled opportunity and he will find the path forward. He closed the largest new logo in company history last quarter and is the go-to for navigating complex procurement. He also runs the weekly sales skills session every Friday.',
    goals: [
      { title: 'Close the Meridian Health deal (>$200K ARR)', progress: 75, due: 'Q2 2026' },
      { title: 'Grow existing accounts by 20% through expansion', progress: 42, due: 'Q3 2026' },
      { title: 'Obtain VP of Sales endorsement on 3 deals', progress: 67, due: 'Q2 2026' },
    ],
  },
  {
    id: 'emp_010',
    firstName: 'Daironex',
    lastName: 'Batista',
    title: 'Sales Development Representative',
    department: 'Sales',
    email: 'agrunwald+13@clearcompany.com',
    managerId: 'mgr_003',
    managerName: 'Thomas Badeen',
    managerTitle: 'Sales Manager',
    location: 'Miami, FL',
    startDate: '2024-05-17',
    avatarColor: '#d1fae5',
    isFrontline: true,
    personalEmail: 'daironex.batista@gmail.com',
    personalPhone: '+1-305-555-0462',
    bio: 'Daironex is one of the most creative prospectors on the team. He consistently books 2× the team average in qualified meetings each month and has pioneered a video prospecting approach that the entire SDR team has now adopted. He is gunning for AE promotion later this year.',
    goals: [
      { title: 'Book 25 qualified meetings per month', progress: 92, due: 'Ongoing' },
      { title: 'Complete AE readiness program', progress: 60, due: 'Q3 2026' },
      { title: 'Achieve top SDR ranking for Q2', progress: 85, due: 'Q2 2026' },
    ],
  },

  // ── People Operations (reports to Abigail Anderson) ──────────────────────
  {
    id: 'emp_011',
    firstName: 'Gilbert',
    lastName: 'Apodaca',
    title: 'HR Business Partner',
    department: 'People Operations',
    email: 'agrunwald+14@clearcompany.com',
    managerId: 'mgr_004',
    managerName: 'Abigail Anderson',
    managerTitle: 'HR & Operations Manager',
    location: 'Phoenix, AZ',
    startDate: '2021-08-16',
    avatarColor: '#ffedd5',
    bio: 'Gilbert partners with Engineering and Sales to build people programs that actually stick. He led the rollout of the company\'s career ladders framework and cut voluntary attrition in his client groups by 18% last year. He is known for thoughtful, frank conversations that employees genuinely trust.',
    goals: [
      { title: 'Reduce voluntary attrition in Engineering to < 8%', progress: 70, due: 'EOY 2026' },
      { title: 'Launch updated performance review framework', progress: 85, due: 'May 2026' },
      { title: 'Complete SHRM-SCP certification', progress: 40, due: 'Sep 2026' },
    ],
  },
  {
    id: 'emp_012',
    firstName: 'Kaya',
    lastName: 'Adams',
    title: 'Talent Acquisition Specialist',
    department: 'People Operations',
    email: 'agrunwald+15@clearcompany.com',
    managerId: 'mgr_004',
    managerName: 'Abigail Anderson',
    managerTitle: 'HR & Operations Manager',
    location: 'Seattle, WA',
    startDate: '2025-08-18',
    avatarColor: '#ccfbf1',
    bio: 'Kaya joined ClearCompany in August 2025 and has already overhauled the technical screening process, cutting time-to-hire by 12 days while improving offer acceptance rates. She brings a data-driven approach to recruiting and has built strong sourcing pipelines in competitive engineering markets.',
    goals: [
      { title: 'Hire 8 engineers in Q2 within target time-to-fill', progress: 63, due: 'Q2 2026' },
      { title: 'Improve offer acceptance rate to > 85%', progress: 78, due: 'Q2 2026' },
      { title: 'Build university recruiting pipeline for FY 2027', progress: 25, due: 'Q4 2026' },
    ],
  },
];

export function getEmployee(id: string): EmployeeProfile | undefined {
  return EMPLOYEES.find(e => e.id === id);
}

// ---------------------------------------------------------------------------
// Manager-view stub data
// ---------------------------------------------------------------------------

export interface RecognitionRecord {
  id: string;
  date: string;         // ISO date string
  value: string;
  message: string;
  rewardSent: boolean;
  rewardAmount: number; // cents
}

export interface DirectReport extends EmployeeProfile {
  lastRecognizedDaysAgo: number | null; // null = never
  recognitionsThisQuarter: number;
  recognitionHistory: RecognitionRecord[];
}

export interface ManagerProfile {
  id: string;
  firstName: string;
  lastName: string;
  title: string;
  avatarColor: string;
  budgetAllocatedCents: number;
  budgetSpentCents: number;
  budgetPeriodLabel: string;       // e.g. "Q2 2026"
  budgetWeeksRemaining: number;
  directReports: DirectReport[];
}

// Thomas Badeen — Sales Manager with three direct reports
export const FRONTLINE_MANAGER: ManagerProfile = {
  id: 'mgr_003',
  firstName: 'Thomas',
  lastName: 'Badeen',
  title: 'Sales Manager',
  avatarColor: '#fef3c7',
  budgetAllocatedCents: 50000,
  budgetSpentCents: 0,
  budgetPeriodLabel: 'Q2 2026',
  budgetWeeksRemaining: 6,
  directReports: [
    {
      ...EMPLOYEES[7], // Lorraine Alexus
      lastRecognizedDaysAgo: null,
      recognitionsThisQuarter: 0,
      recognitionHistory: [],
    },
    {
      ...EMPLOYEES[8], // Jeremy Allen
      lastRecognizedDaysAgo: null,
      recognitionsThisQuarter: 0,
      recognitionHistory: [],
    },
    {
      ...EMPLOYEES[9], // Daironex Batista
      lastRecognizedDaysAgo: null,
      recognitionsThisQuarter: 0,
      recognitionHistory: [],
    },
  ],
};

// Rachael Alpert — VP Customer Success (primary demo manager, email = agrunwald@clearcompany.com)
export const MANAGER: ManagerProfile = {
  id: 'mgr_001',
  firstName: 'Rachael',
  lastName: 'Alpert',
  title: 'VP Customer Success',
  avatarColor: '#ede9fe',
  budgetAllocatedCents: 50000,   // $500 / quarter
  budgetSpentCents: 0,
  budgetPeriodLabel: 'Q2 2026',
  budgetWeeksRemaining: 6,
  directReports: [
    {
      ...EMPLOYEES[0], // Samuel Abramsky
      lastRecognizedDaysAgo: 5,
      recognitionsThisQuarter: 1,
      recognitionHistory: [
        {
          id: 'rec_001',
          date: new Date(Date.now() - 5 * 86400000).toISOString(),
          value: 'Customer Focus',
          message: 'Samuel handled the Acme Corp escalation with incredible poise — stayed on a 3-hour call until the customer was fully resolved and followed up with a detailed summary the same day.',
          rewardSent: true,
          rewardAmount: 2500,
        },
      ],
    },
    {
      ...EMPLOYEES[1], // Jordan Beaman
      lastRecognizedDaysAgo: 47,
      recognitionsThisQuarter: 0,
      recognitionHistory: [],
    },
    {
      ...EMPLOYEES[2], // Maddy Bender
      lastRecognizedDaysAgo: 12,
      recognitionsThisQuarter: 1,
      recognitionHistory: [
        {
          id: 'rec_002',
          date: new Date(Date.now() - 12 * 86400000).toISOString(),
          value: 'Raise the Bar',
          message: 'Maddy\'s new customer health scoring model is already flagging at-risk accounts two weeks earlier than our old approach. Incredible work.',
          rewardSent: false,
          rewardAmount: 0,
        },
      ],
    },
    {
      ...EMPLOYEES[3], // Colin Beverstock
      lastRecognizedDaysAgo: 21,
      recognitionsThisQuarter: 1,
      recognitionHistory: [
        {
          id: 'rec_003',
          date: new Date(Date.now() - 21 * 86400000).toISOString(),
          value: 'Listen to Many, Execute as One',
          message: 'Colin personally flew to Chicago to save a renewal that was heading south. He spent two days on-site, rebuilt trust with the executive team, and closed a 3-year expansion. That\'s what 12 years of relationship-building looks like.',
          rewardSent: true,
          rewardAmount: 5000,
        },
      ],
    },
  ],
};
