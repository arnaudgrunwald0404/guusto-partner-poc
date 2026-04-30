/**
 * Stub employee directory — mirrors backend STUB_EMPLOYEES.
 * Used by the frontend to render profile pages without an extra API call.
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
  /** Frontline employees don't have corporate email / desk; recognition delivered via QR / SMS */
  isFrontline?: boolean;
  personalEmail?: string;
  personalPhone?: string;
}

export const EMPLOYEES: EmployeeProfile[] = [
  {
    id: 'emp_001',
    firstName: 'John',
    lastName: 'Kim',
    title: 'Senior Support Engineer',
    department: 'Customer Success',
    email: 'john.kim@clearcompany.com',
    managerId: 'mgr_001',
    managerName: 'Sarah Chen',
    managerTitle: 'VP Customer Success',
    location: 'San Francisco, CA',
    startDate: '2021-03-15',
    avatarColor: '#dbeafe',
    bio: 'Passionate about turning complex problems into simple solutions. John consistently goes above and beyond for customers and mentors junior team members.',
    goals: [
      { title: 'Reduce avg. ticket resolution time to < 4h', progress: 72, due: 'Q2 2026' },
      { title: 'Complete AWS Solutions Architect certification', progress: 45, due: 'Jun 2026' },
      { title: 'Mentor 2 new support engineers through onboarding', progress: 100, due: 'Q1 2026' },
    ],
  },
  {
    id: 'emp_002',
    firstName: 'Maria',
    lastName: 'Santos',
    title: 'Implementation Specialist',
    department: 'Customer Success',
    email: 'maria.santos@clearcompany.com',
    managerId: 'mgr_001',
    managerName: 'Sarah Chen',
    managerTitle: 'VP Customer Success',
    location: 'Austin, TX',
    startDate: '2022-07-01',
    avatarColor: '#d1fae5',
    bio: 'Maria brings a consultative approach to every implementation, ensuring customers see value quickly. She has onboarded over 40 enterprise accounts.',
    goals: [
      { title: 'Reduce time-to-first-value to < 30 days', progress: 88, due: 'Q2 2026' },
      { title: 'Build new implementation playbook for mid-market', progress: 60, due: 'May 2026' },
    ],
  },
  {
    id: 'emp_003',
    firstName: 'Alex',
    lastName: 'Chen',
    title: 'Customer Success Manager',
    department: 'Enterprise CS',
    email: 'alex.chen@clearcompany.com',
    managerId: 'mgr_002',
    managerName: 'David Park',
    managerTitle: 'Director of Enterprise CS',
    location: 'New York, NY',
    startDate: '2020-11-30',
    avatarColor: '#ede9fe',
    bio: 'Alex manages a portfolio of 25 enterprise accounts and has the highest NPS score on the team for three consecutive quarters.',
    goals: [
      { title: 'Achieve 95% renewal rate on portfolio', progress: 91, due: 'EOY 2026' },
      { title: 'Expand 5 accounts to additional modules', progress: 40, due: 'Q3 2026' },
    ],
  },
  // Frontline employee — no corporate email, no desk; recognition delivered via personal QR / SMS
  {
    id: 'emp_004',
    firstName: 'Carmen',
    lastName: 'Rodriguez',
    title: 'Retail Associate',
    department: 'Retail – Chicago West',
    email: 'carmen.rodriguez@clearcompany-retail.com',
    managerId: 'mgr_003',
    managerName: 'Luis Morales',
    managerTitle: 'Store Manager',
    location: 'Chicago, IL',
    startDate: '2024-02-12',
    avatarColor: '#fce7f3',
    bio: 'Carmen is one of our top-performing retail associates, consistently exceeding monthly sales targets and receiving excellent customer feedback. She mentors new hires and volunteers for every closing shift.',
    goals: [
      { title: 'Achieve top-tier NPS score for Q2', progress: 83, due: 'Jun 2026' },
      { title: 'Complete product knowledge certification', progress: 55, due: 'May 2026' },
    ],
    isFrontline: true,
    personalEmail: 'carmen.r.personal@gmail.com',
    personalPhone: '+1-312-555-0194',
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

// Luis Morales — store manager with Carmen as direct report (frontline demo)
export const FRONTLINE_MANAGER: ManagerProfile = {
  id: 'mgr_003',
  firstName: 'Luis',
  lastName: 'Morales',
  title: 'Store Manager',
  avatarColor: '#d1fae5',
  budgetAllocatedCents: 20000,
  budgetSpentCents: 0,
  budgetPeriodLabel: 'Q2 2026',
  budgetWeeksRemaining: 6,
  directReports: [
    {
      ...EMPLOYEES[3], // Carmen Rodriguez
      lastRecognizedDaysAgo: null, // never recognized
      recognitionsThisQuarter: 0,
      recognitionHistory: [],
    },
  ],
};

export const MANAGER: ManagerProfile = {
  id: 'mgr_001',
  firstName: 'Sarah',
  lastName: 'Chen',
  title: 'VP Customer Success',
  avatarColor: '#fef3c7',
  budgetAllocatedCents: 30000,   // $300 / quarter
  budgetSpentCents: 2500,        // $25 sent so far
  budgetPeriodLabel: 'Q2 2026',
  budgetWeeksRemaining: 6,
  directReports: [
    {
      ...EMPLOYEES[0], // John Kim
      lastRecognizedDaysAgo: 5,
      recognitionsThisQuarter: 1,
      recognitionHistory: [
        {
          id: 'rec_001',
          date: new Date(Date.now() - 5 * 86400000).toISOString(),
          value: 'Customer Focus',
          message: 'John went above and beyond handling the Acme Corp escalation — stayed on a call for 3 hours until the customer was fully satisfied.',
          rewardSent: true,
          rewardAmount: 2500,
        },
      ],
    },
    {
      ...EMPLOYEES[1], // Maria Santos
      lastRecognizedDaysAgo: 47,
      recognitionsThisQuarter: 0,
      recognitionHistory: [],
    },
  ],
};
