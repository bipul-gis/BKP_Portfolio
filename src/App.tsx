import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Map as MapIcon, 
  Database, 
  Bold,
  Cloud, 
  Briefcase, 
  GraduationCap, 
  Mail, 
  MapPin, 
  Linkedin,
  Layers, 
  Globe, 
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Menu,
  X,
  Settings,
  Code,
  Terminal,
  ImagePlus,
  Search,
  BarChart3,
  User
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const DEFAULT_LINKEDIN_URL = 'https://www.linkedin.com/in/bipul-kumar-paul-7a90a0125';
const DEFAULT_STATUS_TEXT = 'Available for new opportunities';
const DEFAULT_CAROUSEL_INTERVAL_MS = 4500;
const ABOUT_PHOTO_MAX_DATA_URL_LENGTH = 2_500_000;
const IMAGE_UPLOAD_HINTS = {
  aboutSlider: 'Recommended image size: 840 x 630 px (4:3). Frontend display: 420 x 315 px.',
  projectCover: 'Recommended image size: 1200 x 500 px. Minimum useful size: 800 x 400 px.',
  projectDescription: 'Recommended image size: 1200 x 675 px (16:9). Frontend detail content uses full width.',
};

const normalizeExternalUrl = (url?: string) => {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const getLinkedInUrl = (profile: any) => normalizeExternalUrl(profile?.linkedin) || DEFAULT_LINKEDIN_URL;

const LinkedInLogo = ({ className = '' }: { className?: string }) => (
  <svg
    width="112"
    height="31"
    viewBox="0 0 280 78"
    preserveAspectRatio="xMidYMid meet"
    aria-hidden="true"
    className={className}
  >
    <text
      x="0"
      y="59"
      fill="#0A66C2"
      fontFamily="Arial, Helvetica, sans-serif"
      fontSize="60"
      fontWeight="700"
    >
      Linked
    </text>
    <rect x="202" y="5" width="76" height="68" rx="8" fill="#0A66C2" />
    <circle cx="222" cy="24" r="8" fill="#fff" />
    <rect x="214" y="38" width="16" height="24" fill="#fff" />
    <path
      d="M240 38h15v5.1c3.1-4.1 7.2-6.1 12.6-6.1 9.6 0 16.4 6.4 16.4 19.4V62h-16V47.8c0-4.5-1.9-7.2-5.8-7.2-3.4 0-6.2 2.3-6.2 7.2V62h-16V38Z"
      fill="#fff"
    />
  </svg>
);

/** Map stored about-photo paths to URLs the browser can load (avoids /about route conflict). */
const resolveAboutPhotoSrc = (image: string) => {
  if (!image) return '';
  if (image.startsWith('data:') || image.startsWith('http://') || image.startsWith('https://')) {
    return image;
  }
  if (image.startsWith('/about/')) {
    return image;
  }
  return image;
};

type EducationCourse = {
  courseName: string;
  courseCode: string;
  creditHours: string;
  grade: string;
};

const emptyEducationCourse = (): EducationCourse => ({
  courseName: '',
  courseCode: '',
  creditHours: '',
  grade: '',
});

const normalizeEducationCourse = (course: Record<string, unknown>): EducationCourse => ({
  courseName: String(course.courseName ?? course.name ?? '').trim(),
  courseCode: String(course.courseCode ?? course.code ?? '').trim(),
  creditHours: String(course.creditHours ?? '').trim(),
  grade: String(course.grade ?? '').trim(),
});

const parseEducationCourses = (raw: unknown): EducationCourse[] => {
  if (!raw) return [];
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((item) => (item && typeof item === 'object' ? normalizeEducationCourse(item as Record<string, unknown>) : null))
    .filter((item): item is EducationCourse => Boolean(item && (item.courseName || item.courseCode || item.creditHours || item.grade)));
};

const formatEducationPeriod = (item: { startYear?: string; endYear?: string; year?: string }) => {
  const start = String(item.startYear || '').trim();
  const end = String(item.endYear || item.year || '').trim();
  if (start && end) return start === end ? end : `${start} – ${end}`;
  return end || start || '';
};

const safeFetchJson = async <T,>(url: string, fallback: T): Promise<T> => {
  try {
    const response = await fetch(url);
    if (!response.ok) return fallback;
    return (await response.json()) as T;
  } catch {
    return fallback;
  }
};

const ADMIN_TOKEN_KEY = 'superuser_session_token';
const SECRET_LOGIN_PATH = '/vault-access';
const SECRET_ADMIN_PATH = '/vault-admin';

const HIGHLIGHT_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Map: MapIcon,
  Cloud,
  Database,
  Layers,
  Globe,
  Briefcase,
  Code,
  Terminal,
  GraduationCap,
};

const HIGHLIGHT_ICON_OPTIONS = Object.keys(HIGHLIGHT_ICON_MAP);

const renderHighlightIcon = (iconName: string, className?: string) => {
  const Icon = HIGHLIGHT_ICON_MAP[iconName] || MapIcon;
  return <Icon className={className} />;
};
type ProjectTableRow = { metric: string; value: string; notes?: string };
type BuilderTable = {
  width: string;
  columns: string[];
  widths: string[];
  rows: string[][];
};
type ProjectBlock =
  | { id: string; type: 'title'; content: string }
  | { id: string; type: 'heading'; content: string }
  | { id: string; type: 'text'; content: string }
  | { id: string; type: 'photo'; url: string; caption: string }
  | { id: string; type: 'table'; table: BuilderTable };
type BuilderConfig = {
  colors: {
    primary: string;
    accent: string;
    surface: string;
  };
  blocks: ProjectBlock[];
};

const safeParseArray = <T,>(value: any): T[] => {
  try {
    if (!value) return [];
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const safeParseObject = <T,>(value: any, fallback: T): T => {
  try {
    if (!value) return fallback;
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' ? { ...fallback, ...parsed } : fallback;
  } catch {
    return fallback;
  }
};

const makeBlockId = () =>
  (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
    ? globalThis.crypto.randomUUID()
    : `block-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const formatProjectDateRange = (start?: string, end?: string, fallback?: string) => {
  if (!start && !end) return fallback || '';
  const toLabel = (value?: string) => {
    if (!value) return '';
    const [year, month] = value.split('-');
    const monthNum = Number(month);
    if (!year || !monthNum || Number.isNaN(monthNum)) return value;
    const monthName = new Date(Number(year), monthNum - 1, 1).toLocaleString('en-US', { month: 'short' });
    return `${monthName} ${year}`;
  };
  const startLabel = toLabel(start);
  const endLabel = toLabel(end);
  if (startLabel && endLabel) return `${startLabel} - ${endLabel}`;
  if (startLabel) return `${startLabel} - Present`;
  return endLabel;
};

const countProjectsForExperience = (experienceId: number, projects: any[]) =>
  projects.filter((p) => Number(p.experienceId) === Number(experienceId)).length;

const getExperienceGroupId = (exp: { id: number; organizationGroupId?: number | null }) =>
  Number(exp.organizationGroupId || exp.id);

type ExperienceOrganizationGroup = {
  groupId: number;
  company: string;
  department: string;
  location: string;
  roles: any[];
  totalMonths: number;
  totalProjects: number;
};

const groupExperienceByOrganization = (experience: any[]): ExperienceOrganizationGroup[] => {
  if (!Array.isArray(experience)) return [];

  const groups = new Map<number, ExperienceOrganizationGroup>();

  experience.forEach((item) => {
    const groupId = getExperienceGroupId(item);
    if (!groups.has(groupId)) {
      groups.set(groupId, {
        groupId,
        company: item.company,
        department: item.department || '',
        location: item.location,
        roles: [],
        totalMonths: 0,
        totalProjects: 0,
      });
    }
    const group = groups.get(groupId)!;
    group.roles.push(item);
    group.totalProjects += typeof item.projectCount === 'number' ? item.projectCount : 0;
  });

  return Array.from(groups.values())
    .map((group) => {
      const roles = [...group.roles].sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')));
      const primaryRole = roles[0];
      return {
        ...group,
        roles,
        department: primaryRole?.department || roles.find((r) => r.department)?.department || '',
        totalMonths: mergeOrganizationExperienceMonths(roles),
      };
    })
    .sort((a, b) => String(b.roles[0]?.startDate || '').localeCompare(String(a.roles[0]?.startDate || '')));
};

const isPromotionRole = (role: any) => Boolean(Number(role?.isPromotion));

const getExperienceCompany = (experienceId: number | null | undefined, experience: any[]) =>
  experience.find((e) => Number(e.id) === Number(experienceId))?.company || '';

const isProjectManagerRole = (project: any) => Boolean(Number(project?.isProjectManager));

const getProjectCategories = (projects: any[]) =>
  Array.from(new Set(projects.map((p) => p.category).filter(Boolean))).sort((a, b) =>
    String(a).localeCompare(String(b))
  );

const EXPERIENCE_MONTH_MAP: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
  may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8,
  september: 9, sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11,
  december: 12, dec: 12,
};

const parseExperienceDateValue = (value?: string): Date | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/present/i.test(trimmed)) return new Date();

  const yearMonth = trimmed.match(/^(\d{4})-(\d{2})$/);
  if (yearMonth) {
    const year = Number(yearMonth[1]);
    const month = Number(yearMonth[2]);
    if (month >= 1 && month <= 12) return new Date(year, month - 1, 1);
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    const monthKey = parts[0].toLowerCase();
    const year = Number(parts[parts.length - 1]);
    const month =
      EXPERIENCE_MONTH_MAP[monthKey] ??
      EXPERIENCE_MONTH_MAP[monthKey.slice(0, 3)];
    if (month && !Number.isNaN(year)) return new Date(year, month - 1, 1);
  }

  return null;
};

const parseExperienceRange = (item: { startDate?: string; period?: string }) => {
  let start = parseExperienceDateValue(item.startDate);
  let end: Date | null = null;

  if (item.period) {
    const parts = item.period.split(/\s+to\s+|\s+-\s+|\s+–\s+/i);
    if (!start && parts[0]) start = parseExperienceDateValue(parts[0].trim());
    if (parts[1]) {
      end = parseExperienceDateValue(parts[1].trim());
    } else if (/present/i.test(item.period)) {
      end = new Date();
    }
  }

  if (!end && /present/i.test(item.period || '')) end = new Date();
  if (start && !end) end = new Date();

  return { start, end };
};

const monthsBetweenExperienceDates = (start: Date, end: Date) => {
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
  return Math.max(0, months);
};

const calculateExperienceMonths = (item: { startDate?: string; period?: string }) => {
  const { start, end } = parseExperienceRange(item);
  if (!start || !end || end < start) return 0;
  return monthsBetweenExperienceDates(start, end);
};

/** Span from earliest role start to latest role end — avoids double-counting promotions at one company. */
const mergeOrganizationExperienceMonths = (roles: { startDate?: string; period?: string }[]) => {
  let earliest: Date | null = null;
  let latest: Date | null = null;

  roles.forEach((role) => {
    const { start, end } = parseExperienceRange(role);
    if (!start || !end) return;
    if (!earliest || start < earliest) earliest = start;
    if (!latest || end > latest) latest = end;
  });

  if (!earliest || !latest || latest < earliest) return 0;
  return monthsBetweenExperienceDates(earliest, latest);
};

const calculateTotalExperienceMonths = (
  items: { startDate?: string; period?: string; id?: number; organizationGroupId?: number | null }[]
) => {
  if (!Array.isArray(items) || items.length === 0) return 0;
  return groupExperienceByOrganization(items).reduce((total, org) => total + org.totalMonths, 0);
};

const formatExperienceDuration = (months: number) => {
  if (months <= 0) return '0 years';
  const years = months / 12;
  if (years < 1) {
    const roundedMonths = Math.max(1, Math.round(months));
    return roundedMonths === 1 ? '1 month' : `${roundedMonths} months`;
  }
  const roundedYears = Math.round(years * 10) / 10;
  if (roundedYears === 1) return '1 year';
  if (Number.isInteger(roundedYears)) return `${roundedYears} years`;
  return `${roundedYears} years`;
};

const formatStatYearsExperience = (months: number) => {
  if (months <= 0) return '0';
  const years = Math.floor(months / 12);
  return years > 0 ? `${years}+` : '<1';
};

const buildHomeStats = (experience: any[], projects: any[], skills: any[]) => {
  const totalMonths = calculateTotalExperienceMonths(experience);
  const projectsLed = projects.filter(isProjectManagerRole).length;
  const totalProjects = projects.length;
  const gisTools = skills.filter((skill) => String(skill.category).toLowerCase() === 'gis').length;

  return [
    { label: 'Years Experience', value: formatStatYearsExperience(totalMonths) },
    { label: 'Projects Led', value: String(projectsLed) },
    { label: 'Total Projects', value: String(totalProjects) },
    { label: 'GIS Tools', value: String(gisTools) },
  ];
};

const filterProjectsList = (
  projects: any[],
  query: string,
  category: string,
  experience: any[] = []
) => {
  const normalizedQuery = query.trim().toLowerCase();
  return projects.filter((project) => {
    if (category !== 'all' && project.category !== category) return false;
    if (!normalizedQuery) return true;

    const organization = getExperienceCompany(project.experienceId, experience);
    const searchable = [
      project.title,
      project.client,
      project.location,
      project.category,
      project.date,
      organization,
      formatProjectDateRange(project.projectStartDate, project.projectEndDate, project.date),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return searchable.includes(normalizedQuery);
  });
};

const createDefaultBuilderConfig = (): BuilderConfig => ({
  colors: {
    primary: '#059669',
    accent: '#0f766e',
    surface: '#f8fafc',
  },
  blocks: [
    { id: makeBlockId(), type: 'title', content: 'Project Overview' },
    { id: makeBlockId(), type: 'text', content: 'Write project details here...' },
  ],
});

const buildLegacyBlocks = (project: any): ProjectBlock[] => {
  const blocks: ProjectBlock[] = [];
  if (project?.features) {
    blocks.push({ id: makeBlockId(), type: 'heading', content: 'Key Features' });
    blocks.push({ id: makeBlockId(), type: 'text', content: project.features });
  }
  if (project?.activities) {
    blocks.push({ id: makeBlockId(), type: 'heading', content: 'My Role & Activities' });
    blocks.push({ id: makeBlockId(), type: 'text', content: project.activities });
  }
  if (project?.outputDetails) {
    blocks.push({ id: makeBlockId(), type: 'heading', content: 'Detailed Outputs' });
    blocks.push({ id: makeBlockId(), type: 'text', content: project.outputDetails });
  }
  if (project?.activityDetails) {
    blocks.push({ id: makeBlockId(), type: 'heading', content: 'Detailed Activities' });
    blocks.push({ id: makeBlockId(), type: 'text', content: project.activityDetails });
  }
  const tableRows = safeParseArray<ProjectTableRow>(project?.outputTable).map((r) => [r.metric || '', r.value || '', r.notes || '']);
  if (tableRows.length > 0) {
    blocks.push({
      id: makeBlockId(),
      type: 'table',
      table: { width: '900', columns: ['Metric', 'Value', 'Notes'], widths: ['220', '220', '220'], rows: tableRows },
    });
  }
  const photos = safeParseArray<string>(project?.photoGallery);
  photos.forEach((url) => blocks.push({ id: makeBlockId(), type: 'photo', url, caption: '' }));
  return blocks.length > 0 ? blocks : createDefaultBuilderConfig().blocks;
};

// --- Components ---

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsOpen(false);
    navigate('/');
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 10);
  };

  const navLinks = [
    { name: 'Certification & Award', hash: '#certification-award' },
    { name: 'About Me', hash: '#about' },
    { name: 'Education', hash: '#education' },
    { name: 'Experience', hash: '#experience' },
    { name: 'Projects', hash: '#projects' },
    { name: 'Skills', hash: '#skills' },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/85 backdrop-blur-xl border-b border-zinc-200/80 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" onClick={handleLogoClick} className="flex items-center gap-2.5 shrink-0 select-none group" aria-label="Home">
            <img
              src="/bkp-logo.png"
              alt="BKP"
              className="h-9 w-auto object-contain cursor-pointer transition-transform duration-300 group-hover:scale-[1.03]"
            />
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center space-x-8">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.hash === '#home' ? '/' : `/${link.hash}`}
                className={cn(
                  "text-sm font-semibold transition-colors hover:text-emerald-700",
                  location.pathname === '/' && ((link.hash === '#home' && !location.hash) || location.hash === link.hash)
                    ? "text-emerald-700"
                    : "text-zinc-600"
                )}
              >
                {link.name}
              </a>
            ))}
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="text-zinc-600 hover:text-zinc-900 p-2"
            >
              {isOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Nav */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-white border-b border-zinc-200 overflow-hidden"
          >
            <div className="px-4 pt-2 pb-6 space-y-1">
              {navLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.hash === '#home' ? '/' : `/${link.hash}`}
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    "block px-3 py-2 rounded-md text-base font-medium",
                    location.pathname === '/' && ((link.hash === '#home' && !location.hash) || location.hash === link.hash)
                      ? "bg-emerald-50 text-emerald-800"
                      : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                  )}
                >
                  {link.name}
                </a>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

const AdminLogin = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const existingToken = localStorage.getItem(ADMIN_TOKEN_KEY);
    if (existingToken) {
      fetch('/api/admin/session', {
        headers: { Authorization: `Bearer ${existingToken}` },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data?.authenticated) {
            navigate(SECRET_ADMIN_PATH, { replace: true });
          }
        })
        .catch(() => undefined);
    }
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      let errorMessage = 'Access denied. Check your superuser credentials.';
      let data: any = null;
      try {
        data = await response.json();
      } catch (err) {
        errorMessage = `Server returned an error: ${response.status} ${response.statusText}`;
      }
      if (!response.ok || !data?.token) {
        throw new Error(data?.message || errorMessage);
      }
      localStorage.setItem(ADMIN_TOKEN_KEY, data.token);
      navigate(SECRET_ADMIN_PATH, { replace: true });
    } catch (error: any) {
      setError(error?.message || 'Access denied. Check your superuser credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="pt-24 pb-20 max-w-md mx-auto px-4 sm:px-6 lg:px-8">
      <div className="bg-white border border-zinc-200 shadow-sm rounded-2xl p-8">
        <SectionHeader title="Restricted Access" subtitle="Superuser authentication required." icon={Settings} />
        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Superuser name"
            required
            className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 focus:border-emerald-600 outline-none transition-all"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Secret password"
            required
            className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 focus:border-emerald-600 outline-none transition-all"
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-all disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Authenticating...' : 'Enter'}
          </button>
        </form>
      </div>
    </div>
  );
};

const SectionHeader = ({ title, subtitle, icon: Icon, compact }: { title: string; subtitle?: string; icon?: any; compact?: boolean }) => (
  <div className={cn(compact ? 'mb-4' : 'mb-8')}>
    <div className="flex items-center space-x-3 mb-2">
      {Icon && <Icon className="w-6 h-6 text-emerald-700" />}
      <h2 className="text-3xl font-bold text-zinc-900 tracking-tight">{title}</h2>
    </div>
    {subtitle && <p className="text-zinc-600 max-w-3xl leading-relaxed">{subtitle}</p>}
    <div className="h-1 w-24 bg-gradient-to-r from-emerald-600 to-cyan-600 mt-4 rounded-full" />
  </div>
);

type FormattedTextBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'bullet'; items: string[] }
  | { kind: 'numbered'; items: string[] };

const BULLET_LINE_RE = /^(\s*)(?:(?:[\u2022\u00b7\u25aa\u25e6\u2023\u2043])\s*|[*-]\s+)(.*)$/;
const NUMBER_LINE_RE = /^(\s*)(\d+)[.)]\s+(.*)$/;

const parseFormattedTextBlocks = (content: string): FormattedTextBlock[] => {
  const lines = (content || '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').split('\n');
  const blocks: FormattedTextBlock[] = [];
  let bulletItems: string[] = [];
  let numberItems: string[] = [];
  let paragraphLines: string[] = [];

  const flushParagraph = () => {
    const text = paragraphLines.join('\n').trim();
    if (text) blocks.push({ kind: 'paragraph', text });
    paragraphLines = [];
  };
  const flushBullets = () => {
    if (bulletItems.length) {
      blocks.push({ kind: 'bullet', items: bulletItems });
      bulletItems = [];
    }
  };
  const flushNumbers = () => {
    if (numberItems.length) {
      blocks.push({ kind: 'numbered', items: numberItems });
      numberItems = [];
    }
  };

  for (const rawLine of lines) {
    if (!rawLine.trim()) {
      flushBullets();
      flushNumbers();
      flushParagraph();
      continue;
    }

    const bullet = rawLine.match(BULLET_LINE_RE);
    if (bullet) {
      flushNumbers();
      flushParagraph();
      bulletItems.push((bullet[2] || '').trim());
      continue;
    }

    const numbered = rawLine.match(NUMBER_LINE_RE);
    if (numbered) {
      flushBullets();
      flushParagraph();
      numberItems.push((numbered[3] || '').trim());
      continue;
    }

    if (bulletItems.length > 0) {
      const lastIdx = bulletItems.length - 1;
      bulletItems[lastIdx] = `${bulletItems[lastIdx]} ${rawLine.trim()}`.trim();
      continue;
    }

    if (numberItems.length > 0) {
      const lastIdx = numberItems.length - 1;
      numberItems[lastIdx] = `${numberItems[lastIdx]} ${rawLine.trim()}`.trim();
      continue;
    }

    flushBullets();
    flushNumbers();
    paragraphLines.push(rawLine);
  }

  flushBullets();
  flushNumbers();
  flushParagraph();
  return blocks;
};

const normalizePastedListText = (text: string) =>
  text
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => {
      if (!line.trim()) return '';

      const wordBullet = line.match(/^(\s*)[\t ]*(?:[\u2022\u00b7\u2023\u2043\u2219]|[•·▪◦‣⁃])\s*(.*)$/);
      if (wordBullet) return `${wordBullet[1]}• ${wordBullet[2].trim()}`;

      const dashBullet = line.match(/^(\s*)[-*+]\s+(.*)$/);
      if (dashBullet) return `${dashBullet[1]}• ${dashBullet[2]}`;

      return line;
    })
    .join('\n');

const renderInlineFormattedText = (text: string) => {
  const parts: React.ReactNode[] = [];
  const pattern = /\*\*([^*]+(?:\*(?!\*)[^*]+)*)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <strong key={`bold-${match.index}`} className="font-semibold">
        {match[1]}
      </strong>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
};

const FormattedTextContent = ({
  content,
  className,
}: {
  content: string;
  className?: string;
}) => {
  const blocks = parseFormattedTextBlocks(content);
  if (blocks.length === 0) return null;

  return (
    <div className={cn('space-y-3', className)}>
      {blocks.map((block, idx) => {
        if (block.kind === 'bullet') {
          return (
            <ul key={idx} className="list-disc pl-6 space-y-1.5 marker:text-emerald-600 text-zinc-700">
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx} className="leading-relaxed pl-1">
                  {renderInlineFormattedText(item)}
                </li>
              ))}
            </ul>
          );
        }
        if (block.kind === 'numbered') {
          return (
            <ol key={idx} className="list-decimal pl-6 space-y-1.5 marker:font-medium marker:text-emerald-700 text-zinc-700">
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx} className="leading-relaxed pl-1">
                  {renderInlineFormattedText(item)}
                </li>
              ))}
            </ol>
          );
        }
        return (
          <p key={idx} className="text-zinc-700 leading-relaxed whitespace-pre-wrap">
            {renderInlineFormattedText(block.text)}
          </p>
        );
      })}
    </div>
  );
};

const TextareaWithListTools = ({
  value,
  onValueChange,
  className,
  ...props
}: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> & {
  value?: string;
  onValueChange?: (value: string) => void;
}) => {
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  const applyTextChange = (nextValue: string, nextSelectionStart?: number, nextSelectionEnd = nextSelectionStart) => {
    if (typeof value === 'string' && onValueChange) {
      onValueChange(nextValue);
      if (typeof nextSelectionStart === 'number') {
        requestAnimationFrame(() => {
          if (textareaRef.current) {
            textareaRef.current.selectionStart = nextSelectionStart;
            textareaRef.current.selectionEnd = typeof nextSelectionEnd === 'number' ? nextSelectionEnd : nextSelectionStart;
          }
        });
      }
      return;
    }

    const el = textareaRef.current;
    if (!el) return;
    el.value = nextValue;
    if (typeof nextSelectionStart === 'number') {
      el.selectionStart = nextSelectionStart;
      el.selectionEnd = typeof nextSelectionEnd === 'number' ? nextSelectionEnd : nextSelectionStart;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const insertPrefix = (prefix: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const current = typeof value === 'string' ? value : el.value;
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? start;
    const needsNewline = start > 0 && current[start - 1] !== '\n';
    const insert = `${needsNewline ? '\n' : ''}${prefix}`;
    const next = `${current.slice(0, start)}${insert}${current.slice(end)}`;
    const nextCursor = start + insert.length;
    applyTextChange(next, nextCursor);
    el.focus();
  };

  const insertNormalLine = () => {
    const el = textareaRef.current;
    if (!el) return;
    const current = typeof value === 'string' ? value : el.value;
    const cursor = el.selectionStart ?? current.length;
    const lineStart = current.lastIndexOf('\n', cursor - 1) + 1;
    const lineEndIdx = current.indexOf('\n', cursor);
    const lineEnd = lineEndIdx === -1 ? current.length : lineEndIdx;
    const line = current.slice(lineStart, lineEnd);

    const bulletMatch = line.match(/^(\s*)([•*-])\s+/);
    const numberMatch = line.match(/^(\s*)(\d+)\.\s+/);

    // If the line is only a list marker, remove it back to normal text.
    if (bulletMatch && line.trim() === `${bulletMatch[2]}`) {
      const replacement = bulletMatch[1];
      const next = `${current.slice(0, lineStart)}${replacement}${current.slice(lineEnd)}`;
      const nextCursor = lineStart + replacement.length;
      applyTextChange(next, nextCursor);
      el.focus();
      return;
    }
    if (numberMatch && line.trim() === `${numberMatch[2]}.`) {
      const replacement = numberMatch[1];
      const next = `${current.slice(0, lineStart)}${replacement}${current.slice(lineEnd)}`;
      const nextCursor = lineStart + replacement.length;
      applyTextChange(next, nextCursor);
      el.focus();
      return;
    }

    // If currently on a list line, insert a plain new line (no marker).
    if (bulletMatch || numberMatch) {
      const next = `${current.slice(0, cursor)}\n${current.slice(cursor)}`;
      applyTextChange(next, cursor + 1);
      el.focus();
      return;
    }

    // Default behavior when not in list context.
    const next = `${current.slice(0, cursor)}\n${current.slice(cursor)}`;
    applyTextChange(next, cursor + 1);
    el.focus();
  };

  const toggleBoldSelection = () => {
    const el = textareaRef.current;
    if (!el) return;
    const current = typeof value === 'string' ? value : el.value;
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? start;

    if (start !== end) {
      const selected = current.slice(start, end);
      const hasOuterMarkers = selected.startsWith('**') && selected.endsWith('**') && selected.length > 4;
      const hasSurroundingMarkers = current.slice(start - 2, start) === '**' && current.slice(end, end + 2) === '**';

      if (hasOuterMarkers) {
        const unwrapped = selected.slice(2, -2);
        const next = `${current.slice(0, start)}${unwrapped}${current.slice(end)}`;
        applyTextChange(next, start, start + unwrapped.length);
        el.focus();
        return;
      }

      if (hasSurroundingMarkers) {
        const next = `${current.slice(0, start - 2)}${selected}${current.slice(end + 2)}`;
        applyTextChange(next, start - 2, end - 2);
        el.focus();
        return;
      }

      const next = `${current.slice(0, start)}**${selected}**${current.slice(end)}`;
      applyTextChange(next, start + 2, end + 2);
      el.focus();
      return;
    }

    const placeholder = 'bold text';
    const insert = `**${placeholder}**`;
    const next = `${current.slice(0, start)}${insert}${current.slice(end)}`;
    applyTextChange(next, start + 2, start + 2 + placeholder.length);
    el.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      toggleBoldSelection();
      return;
    }

    if (e.key !== 'Enter') return;
    const el = textareaRef.current;
    if (!el) return;

    const current = typeof value === 'string' ? value : el.value;
    const cursor = el.selectionStart ?? current.length;
    const lineStart = current.lastIndexOf('\n', cursor - 1) + 1;
    const lineEndIdx = current.indexOf('\n', cursor);
    const lineEnd = lineEndIdx === -1 ? current.length : lineEndIdx;
    const line = current.slice(lineStart, lineEnd);

    const bulletMatch = line.match(/^(\s*)([•*-])\s+/);
    const numberMatch = line.match(/^(\s*)(\d+)\.\s+/);
    if (!bulletMatch && !numberMatch) return;

    e.preventDefault();
    let continuation = '';
    if (bulletMatch) {
      continuation = `${bulletMatch[1]}${bulletMatch[2]} `;
    } else if (numberMatch) {
      const nextNumber = Number(numberMatch[2]) + 1;
      continuation = `${numberMatch[1]}${nextNumber}. `;
    }

    const insert = `\n${continuation}`;
    const next = `${current.slice(0, cursor)}${insert}${current.slice(cursor)}`;
    const nextCursor = cursor + insert.length;
    applyTextChange(next, nextCursor);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData('text/plain');
    if (!pasted) return;

    const normalized = normalizePastedListText(pasted);
    const hasListMarkers = /(?:^|\n)\s*(?:[•·▪◦‣⁃\*\-]|\u2022|\u00b7|\d+[.)]\s)/m.test(pasted);
    if (!hasListMarkers && normalized === pasted) return;

    e.preventDefault();
    const el = textareaRef.current;
    if (!el) return;

    const current = typeof value === 'string' ? value : el.value;
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? start;
    const prefix = start > 0 && current[start - 1] !== '\n' ? '\n' : '';
    const insert = `${prefix}${normalized}`;
    const next = `${current.slice(0, start)}${insert}${current.slice(end)}`;
    applyTextChange(next, start + insert.length);
    el.focus();
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={toggleBoldSelection}
          title="Bold selected text"
          aria-label="Bold selected text"
          className="inline-flex h-7 w-7 items-center justify-center rounded bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
        >
          <Bold className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => insertPrefix('• ')} className="text-xs px-2 py-1 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-700">• Bullet</button>
        <button type="button" onClick={() => insertPrefix('1. ')} className="text-xs px-2 py-1 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-700">1. Number</button>
        <button type="button" onClick={insertNormalLine} className="text-xs px-2 py-1 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-700">Normal</button>
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={onValueChange ? (e) => onValueChange(e.target.value) : undefined}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        className={className}
        {...props}
      />
    </div>
  );
};

// --- Pages ---

const Home = () => {
  const [profile, setProfile] = useState<any>(null);
  const [homeStats, setHomeStats] = useState<{ label: string; value: string }[]>([]);
  const [highlights, setHighlights] = useState<any[]>([]);
  const [aboutPhotos, setAboutPhotos] = useState<{ id: number; image: string; caption?: string }[]>([]);
  const [isHomeLoading, setIsHomeLoading] = useState(true);

  useEffect(() => {
    const loadHome = async () => {
      try {
        const [profileData, experience, projects, skills, highlightRows, photoRows] = await Promise.all([
          safeFetchJson<any | null>('/api/profile', null),
          safeFetchJson<any[]>('/api/experience', []),
          safeFetchJson<any[]>('/api/projects', []),
          safeFetchJson<any[]>('/api/skills', []),
          safeFetchJson<any[]>('/api/highlights', []),
          safeFetchJson<any[]>('/api/about-photos', []),
        ]);

        setProfile(
          profileData ?? {
            name: 'Portfolio',
            title: '',
            email: '',
            linkedin: DEFAULT_LINKEDIN_URL,
            status: DEFAULT_STATUS_TEXT,
            carouselIntervalMs: DEFAULT_CAROUSEL_INTERVAL_MS,
            address: '',
            summary: '',
            bio: 'Unable to load content from the server. Run npm run dev locally, or check your deployment API.',
          }
        );
        setHomeStats(buildHomeStats(experience, projects, skills));
        setHighlights(highlightRows);
        setAboutPhotos(Array.isArray(photoRows) ? photoRows.filter((p) => p?.image) : []);
      } finally {
        setIsHomeLoading(false);
      }
    };

    loadHome();
  }, []);

  useEffect(() => {
    const refreshAboutPhotos = async () => {
      const photoRows = await safeFetchJson<any[]>('/api/about-photos', []);
      setAboutPhotos(Array.isArray(photoRows) ? photoRows.filter((p) => p?.image) : []);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshAboutPhotos();
      }
    };
    window.addEventListener('focus', refreshAboutPhotos);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('focus', refreshAboutPhotos);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  if (isHomeLoading) {
    return (
      <div className="pt-24 pb-20 animate-pulse">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="h-6 w-40 bg-zinc-200 rounded-full mb-6" />
              <div className="h-14 sm:h-16 bg-zinc-200 rounded-2xl w-3/4 mb-6" />
              <div className="space-y-3 mb-8">
                <div className="h-4 bg-zinc-200 rounded w-full" />
                <div className="h-4 bg-zinc-200 rounded w-5/6" />
                <div className="h-4 bg-zinc-200 rounded w-2/3" />
              </div>
              <div className="flex flex-wrap gap-3">
                <div className="h-[50px] w-36 bg-zinc-200 rounded-xl" />
                <div className="h-[50px] w-44 bg-zinc-200 rounded-xl" />
                <div className="h-[50px] w-14 bg-zinc-200 rounded-xl" />
              </div>
            </div>
            <div className="aspect-square rounded-3xl bg-zinc-100 border border-zinc-200 p-8 flex flex-col justify-center">
              <div className="grid grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((id) => (
                  <div key={id} className="p-6 rounded-2xl bg-zinc-50 border border-zinc-100/60">
                    <div className="w-8 h-8 rounded-lg bg-zinc-200 mb-4" />
                    <div className="h-4 w-20 bg-zinc-200 rounded mb-2" />
                    <div className="h-3 w-28 bg-zinc-200 rounded" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 py-8 border-y border-zinc-200">
            {[1, 2, 3, 4].map((id) => (
              <div key={id} className="text-center">
                <div className="h-8 w-16 bg-zinc-200 rounded mx-auto mb-2" />
                <div className="h-3 w-24 bg-zinc-200 rounded mx-auto" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const linkedinUrl = getLinkedInUrl(profile);

  return (
    <div className="pt-24 pb-20">
      {/* Hero Section */}
      <section className="relative overflow-hidden mb-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(16,185,129,0.05),transparent_50%)]" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-medium mb-6">
                <Globe className="w-3 h-3" />
                <span>{profile.status || DEFAULT_STATUS_TEXT}</span>
              </div>
              <h1 className="text-5xl lg:text-7xl font-bold text-zinc-900 mb-6 tracking-tighter leading-none">
                {profile.name}
              </h1>
              <p className="text-xl text-zinc-600 mb-8 max-w-lg leading-relaxed">
                {renderInlineFormattedText(profile.summary)}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-2xl mt-4">
                <a 
                  href={`mailto:${profile.email}`} 
                  className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-all flex items-center justify-center space-x-2 h-[50px] min-w-0 w-full"
                >
                  <Mail className="w-4 h-4 shrink-0" />
                  <span>Contact Me</span>
                </a>

                <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 h-[50px] shadow-sm min-w-0 w-full">
                  <MapPin className="h-4 w-4 shrink-0 text-emerald-600" />
                  <div className="flex flex-col justify-center leading-tight min-w-0">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">Location</p>
                    <p className="text-xs sm:text-xs font-semibold text-zinc-700 truncate" title={profile.address}>
                      {profile.address || "Dhaka, Bangladesh"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 h-[50px] shadow-sm min-w-0 w-full">
                  <a
                    href={linkedinUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open LinkedIn profile"
                    title="Open LinkedIn profile"
                    className="inline-flex h-7 items-center transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-[#0A66C2] focus:ring-offset-2 rounded"
                  >
                    <LinkedInLogo className="h-6 w-auto" />
                  </a>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative"
            >
              <div className="aspect-square rounded-3xl overflow-hidden border border-zinc-200 bg-white shadow-xl p-8 flex flex-col justify-center">
                <div className="grid grid-cols-2 gap-4">
                  {highlights.map((item) => (
                    <div key={item.id} className="p-6 rounded-2xl bg-zinc-50 border border-zinc-100">
                      {renderHighlightIcon(item.icon, cn('w-8 h-8 mb-4', item.iconColor || 'text-emerald-600'))}
                      <h3 className="text-zinc-900 font-bold mb-1">{item.title}</h3>
                      <p className="text-zinc-500 text-sm">{item.subtitle}</p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Quick Stats */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 py-8 border-y border-zinc-200">
          {homeStats.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-4xl font-bold text-zinc-900 mb-2">{stat.value}</div>
              <div className="text-zinc-500 text-sm uppercase tracking-widest">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="certification-award" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 scroll-mt-24">
        <h2 className="text-center text-2xl md:text-3xl font-bold text-zinc-900">Certification and Award</h2>
        <AboutPhotoSlider photos={aboutPhotos} intervalMs={profile.carouselIntervalMs} />
      </section>
    </div>
  );
};

const normalizeCarouselInterval = (value: unknown) => {
  const interval = Number(value);
  if (!Number.isFinite(interval)) return DEFAULT_CAROUSEL_INTERVAL_MS;
  return Math.min(30000, Math.max(1000, interval));
};

const AboutPhotoSlider = ({
  photos,
  intervalMs,
}: {
  photos: { id: number; image: string; caption?: string; authority?: string; date?: string; type?: string }[];
  intervalMs?: number | string;
}) => {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const slideIntervalMs = normalizeCarouselInterval(intervalMs);

  useEffect(() => {
    setIndex(0);
  }, [photos.length]);

  useEffect(() => {
    if (photos.length <= 1 || paused) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % photos.length);
    }, slideIntervalMs);
    return () => window.clearInterval(timer);
  }, [photos.length, paused, slideIntervalMs]);

  if (photos.length === 0) return null;

  const goTo = (next: number) => setIndex((next + photos.length) % photos.length);
  const prevSlide = () => goTo(index - 1);
  const nextSlide = () => goTo(index + 1);

  const slideOffset = (photoIndex: number) => {
    let diff = photoIndex - index;
    if (diff > photos.length / 2) diff -= photos.length;
    if (diff < -photos.length / 2) diff += photos.length;
    return diff;
  };

  return (
    <div
      className="mt-4 mb-2 select-none relative group"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative mx-auto h-[220px] sm:h-[280px] md:h-[320px] max-w-4xl px-8">
        {/* Left Arrow */}
        {photos.length > 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              prevSlide();
            }}
            type="button"
            className="absolute left-0 sm:left-2 md:-left-2 top-1/2 -translate-y-1/2 z-40 bg-white/90 hover:bg-white text-zinc-700 hover:text-zinc-950 p-2 sm:p-2.5 rounded-full shadow-md border border-zinc-200/80 transition-all hover:scale-110 active:scale-95 cursor-pointer flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
            aria-label="Previous slide"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        {/* Right Arrow */}
        {photos.length > 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              nextSlide();
            }}
            type="button"
            className="absolute right-0 sm:right-2 md:-right-2 top-1/2 -translate-y-1/2 z-40 bg-white/90 hover:bg-white text-zinc-700 hover:text-zinc-950 p-2 sm:p-2.5 rounded-full shadow-md border border-zinc-200/80 transition-all hover:scale-110 active:scale-95 cursor-pointer flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
            aria-label="Next slide"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}

        <div className="absolute inset-0 flex items-center justify-center">
          {photos.map((photo, photoIndex) => {
            const offset = slideOffset(photoIndex);
            if (photos.length > 2 && Math.abs(offset) > 1) return null;

            const isCenter = offset === 0;
            const xShift = photos.length === 1 ? 0 : offset === 0 ? 0 : offset < 0 ? '-58%' : '58%';
            const scale = isCenter ? 1 : 0.72;
            const zIndex = isCenter ? 30 : 20 - Math.abs(offset);

            return (
              <motion.div
                key={photo.id}
                role={isCenter ? undefined : 'button'}
                tabIndex={isCenter ? undefined : 0}
                onClick={isCenter ? undefined : () => goTo(photoIndex)}
                onKeyDown={
                  isCenter
                    ? undefined
                    : (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          goTo(photoIndex);
                        }
                      }
                }
                initial={false}
                animate={{
                  x: xShift,
                  scale,
                  opacity: isCenter ? 1 : 0.55,
                  filter: isCenter ? 'blur(0px)' : 'blur(1px)',
                }}
                transition={{ type: 'spring', stiffness: 280, damping: 28 }}
                className={cn(
                  'absolute w-[min(72vw,380px)] sm:w-[min(62vw,420px)] aspect-[4/3] rounded-xl overflow-hidden bg-zinc-200 border border-zinc-200/80 shadow-lg',
                  isCenter ? 'shadow-xl ring-1 ring-zinc-200/60 cursor-default' : 'cursor-pointer shadow-md',
                  !isCenter && offset < 0 && '[mask-image:linear-gradient(to_right,black_55%,transparent)]',
                  !isCenter && offset > 0 && '[mask-image:linear-gradient(to_left,black_55%,transparent)]'
                )}
                style={{ zIndex }}
              >
                <img
                  src={resolveAboutPhotoSrc(photo.image)}
                  alt={photo.caption || 'About me'}
                  className="w-full h-full object-cover pointer-events-none"
                  draggable={false}
                />
                {isCenter && photo.caption && (
                  <p className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent text-white text-sm px-4 py-3 pt-8">
                    {photo.caption}
                  </p>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      {photos.length > 1 && (
        <div className="flex justify-center gap-2 mt-5" role="tablist" aria-label="Photo slides">
          {photos.map((photo, photoIndex) => (
            <button
              key={photo.id}
              type="button"
              role="tab"
              aria-selected={photoIndex === index}
              aria-label={`Go to photo ${photoIndex + 1}`}
              onClick={() => goTo(photoIndex)}
              className={cn(
                'rounded-full transition-all duration-300',
                photoIndex === index
                  ? 'w-2.5 h-2.5 bg-zinc-700'
                  : 'w-2 h-2 bg-zinc-300 hover:bg-zinc-400'
              )}
            />
          ))}
        </div>
      )}

      {/* Certification and Award Interactive Table */}
      <div className="mt-8 w-full mx-auto overflow-hidden bg-white border border-zinc-200 rounded-3xl shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse table-fixed">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-200">
                <th className="w-28 px-6 py-4 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-zinc-500">Type</th>
                <th className="w-[50%] px-6 py-4 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-zinc-500">Certification & Award Title</th>
                <th className="w-[30%] px-6 py-4 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-zinc-500">Issuing Authority</th>
                <th className="w-36 px-6 py-4 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-zinc-500 text-right">Date Issued</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-150">
              {photos.map((photo, photoIndex) => {
                const isActive = photoIndex === index;
                const itemType = photo.type || 'Certificate';
                return (
                  <tr
                    key={photo.id}
                    onClick={() => goTo(photoIndex)}
                    className={cn(
                      'group cursor-pointer transition-all duration-150 text-xs sm:text-sm',
                      isActive 
                        ? 'bg-emerald-50/60 hover:bg-emerald-50/80 border-l-4 border-emerald-600' 
                        : 'hover:bg-zinc-50 text-zinc-600 border-l-4 border-transparent'
                    )}
                  >
                    <td className="px-6 py-3.5 whitespace-nowrap align-middle">
                      <span className={cn(
                        'inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border',
                        itemType === 'Award'
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                      )}>
                        {itemType}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 align-middle">
                      <div className="flex items-center gap-2">
                        {isActive && (
                          <span className="relative flex h-2 w-2 shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
                          </span>
                        )}
                        <span className={cn(
                          'transition-colors leading-relaxed block truncate',
                          isActive 
                            ? 'font-bold text-zinc-900' 
                            : 'font-medium text-zinc-700 group-hover:text-emerald-700'
                        )} title={photo.caption || 'Certification / Award'}>
                          {photo.caption || 'Certification / Award'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-3.5 align-middle truncate">
                      {photo.authority ? (
                        <span className="inline-flex items-center text-xs font-semibold text-zinc-600 bg-zinc-100 hover:bg-zinc-150 border border-zinc-200/80 px-2 py-0.5 rounded-md" title={photo.authority}>
                          {photo.authority}
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-400 italic">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3.5 whitespace-nowrap font-mono text-xs text-zinc-500 text-right align-middle">
                      {photo.date || <span className="text-xs text-zinc-400 italic font-sans">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const AboutMe = () => {
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    safeFetchJson<any | null>('/api/profile', null).then((profileData) => {
      setProfile(
        profileData ?? {
          name: '',
          bio: '',
          address: '',
          linkedin: DEFAULT_LINKEDIN_URL,
          status: DEFAULT_STATUS_TEXT,
          carouselIntervalMs: DEFAULT_CAROUSEL_INTERVAL_MS,
          aboutPhoto: '',
        }
      );
    });
  }, []);

  if (!profile) {
    return (
      <div className="py-4 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white border border-zinc-200 shadow-sm rounded-3xl p-6 md:p-8 animate-pulse">
          <div className="h-6 w-32 bg-zinc-200 rounded-lg mb-6" />
          <div className="space-y-3">
            <div className="h-4 bg-zinc-200 rounded w-full" />
            <div className="h-4 bg-zinc-200 rounded w-5/6" />
            <div className="h-4 bg-zinc-200 rounded w-4/5" />
          </div>
        </div>
      </div>
    );
  }

  const hasPhoto = !!profile.aboutPhoto;

  return (
    <div className="py-4 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="bg-white border border-zinc-200 shadow-sm rounded-3xl p-6 md:p-8">
        <SectionHeader title="About Me" icon={Terminal} compact />
        <div className={cn(
          "grid grid-cols-1 gap-8 mt-4",
          hasPhoto ? "md:grid-cols-3" : ""
        )}>
          <div className={cn(
            hasPhoto ? "md:col-span-2" : ""
          )}>
            <FormattedTextContent content={profile.bio} className="text-zinc-600 text-base lg:text-lg mb-4 text-justify leading-relaxed" />
          </div>
          {hasPhoto && (
            <div className="flex justify-center md:justify-end items-start">
              <div className="relative w-full max-w-[320px] aspect-[4/5] rounded-3xl overflow-hidden border border-zinc-200 shadow-sm bg-zinc-50 group">
                <img
                  src={resolveAboutPhotoSrc(profile.aboutPhoto)}
                  alt={profile.name || "About Me Photo"}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const EducationSection = () => {
  const [education, setEducation] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    safeFetchJson<any[]>('/api/education', []).then((rows) => {
      setEducation(rows);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="py-4 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white border border-zinc-200 shadow-sm rounded-3xl p-6 md:p-8 animate-pulse">
          <div className="h-6 w-40 bg-zinc-200 rounded-lg mb-6" />
          <div className="space-y-4">
            <div className="p-5 rounded-2xl bg-zinc-50 border border-zinc-100">
              <div className="h-4 w-24 bg-zinc-200 rounded mb-3" />
              <div className="h-5 bg-zinc-200 rounded w-1/2 mb-2" />
              <div className="h-4 bg-zinc-200 rounded w-1/3" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-4 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="bg-white border border-zinc-200 shadow-sm rounded-3xl p-6 md:p-8">
        <SectionHeader
          title="Education"
          subtitle="Academic background and qualifications."
          icon={GraduationCap}
          compact
        />
        <div className="space-y-4">
          {education.map((item) => {
            const courses = parseEducationCourses(item.courses);
            const period = formatEducationPeriod(item);
            const totalCredits = courses.reduce((sum, course) => {
              const credits = parseFloat(course.creditHours);
              return sum + (Number.isFinite(credits) ? credits : 0);
            }, 0);

            return (
              <div key={item.id} className="p-5 md:p-6 rounded-2xl bg-zinc-50 border border-zinc-100">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                  <div className="text-emerald-600 text-sm font-bold">{period || item.year}</div>
                  {item.gpa && (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                      GPA: {item.gpa}
                    </span>
                  )}
                </div>
                <div className="text-zinc-900 text-base md:text-lg font-semibold leading-snug">{item.degree}</div>
                <div className="text-zinc-600 text-sm mt-1 font-medium">{item.institution}</div>
                {(item.location || item.details) && (
                  <div className="text-zinc-500 text-sm mt-1 space-y-0.5">
                    {item.location && <p>{item.location}</p>}
                    {item.details && <p>{item.details}</p>}
                  </div>
                )}
                {courses.length > 0 && (
                  <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
                    <table className="w-full text-sm text-left min-w-[480px]">
                      <thead>
                        <tr className="border-b border-zinc-100 bg-zinc-50/80">
                          <th className="px-3 py-2.5 font-semibold text-zinc-700">Course</th>
                          <th className="px-3 py-2.5 font-semibold text-zinc-700">Code</th>
                          <th className="px-3 py-2.5 font-semibold text-zinc-700 text-right">Credits</th>
                          <th className="px-3 py-2.5 font-semibold text-zinc-700 text-right">Grade</th>
                        </tr>
                      </thead>
                      <tbody>
                        {courses.map((course, courseIndex) => (
                          <tr key={courseIndex} className="border-b border-zinc-50 last:border-0">
                            <td className="px-3 py-2.5 text-zinc-800">{course.courseName}</td>
                            <td className="px-3 py-2.5 text-zinc-500">{course.courseCode || '—'}</td>
                            <td className="px-3 py-2.5 text-zinc-600 text-right tabular-nums">
                              {course.creditHours || '—'}
                            </td>
                            <td className="px-3 py-2.5 text-zinc-800 text-right font-medium">{course.grade || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                      {totalCredits > 0 && (
                        <tfoot>
                          <tr className="bg-zinc-50/50">
                            <td colSpan={2} className="px-3 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                              Total credit hours
                            </td>
                            <td className="px-3 py-2 text-right text-sm font-bold text-emerald-700 tabular-nums">
                              {totalCredits}
                            </td>
                            <td />
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const Experience = () => {
  const [exp, setExp] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    safeFetchJson<any[]>('/api/experience', []).then((rows) => {
      setExp(rows);
      setLoading(false);
    });
  }, []);

  const projectCountFor = (item: any) =>
    typeof item.projectCount === 'number' ? item.projectCount : 0;

  const organizationGroups = groupExperienceByOrganization(exp);
  const totalExperienceMonths = calculateTotalExperienceMonths(exp);

  if (loading) {
    return (
      <div className="py-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white border border-zinc-200 shadow-sm rounded-3xl p-6 md:p-8 animate-pulse">
          <div className="h-6 w-56 bg-zinc-200 rounded-lg mb-2" />
          <div className="h-4 w-96 bg-zinc-200 rounded mb-8" />
          
          <div className="h-16 bg-zinc-100 rounded-2xl mb-8" />
          
          <div className="space-y-8 relative pl-8 border-l border-zinc-200">
            <div className="absolute left-[-5px] top-0 w-[9px] h-[9px] rounded-full bg-zinc-200" />
            <div className="h-32 bg-zinc-50 border border-zinc-100 rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <SectionHeader 
        title="Professional Experience" 
        subtitle="A timeline of my professional journey in GIS, Remote Sensing, and Consulting."
        icon={Briefcase}
        compact
      />

      {organizationGroups.length > 0 && (
        <div className="mb-8 bg-gradient-to-r from-emerald-50 to-white border border-emerald-100 rounded-2xl px-6 py-4">
          <p className="text-zinc-600 text-sm sm:text-base leading-relaxed">
            <span className="text-2xl sm:text-3xl font-bold text-zinc-900">{formatExperienceDuration(totalExperienceMonths)}</span>
            {' '}total professional experience across{' '}
            <span className="text-lg sm:text-xl font-semibold text-emerald-700">{organizationGroups.length}</span>
            {' '}organizations
          </p>
        </div>
      )}

      <div className="space-y-8">
        {organizationGroups.map((org, index) => (
          <motion.div
            key={org.groupId}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="group relative pl-8 border-l border-zinc-200 pb-8 last:pb-0"
          >
            <div className="absolute left-[-5px] top-0 w-[9px] h-[9px] rounded-full bg-emerald-600 group-hover:scale-150 transition-transform" />
            <div className="bg-white border border-zinc-200 shadow-sm rounded-2xl p-6 hover:border-emerald-600/50 transition-all">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-5 pb-5 border-b border-zinc-100">
                <div className="md:flex-1 min-w-0">
                  <h3 className="text-xl font-bold text-zinc-900">{org.company}</h3>
                  {org.department && (
                    <p className="text-emerald-700 text-sm font-medium mt-1">{org.department}</p>
                  )}
                  <p className="text-zinc-500 text-sm mt-1">{org.location}</p>
                </div>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-2 md:flex-shrink-0">
                  <span className="inline-flex items-center px-3 py-1.5 rounded-lg border border-emerald-600 text-emerald-700 text-sm font-bold whitespace-nowrap bg-transparent">
                    {org.totalProjects} {org.totalProjects === 1 ? 'project' : 'projects'} involved
                  </span>
                  <span className="inline-flex items-center px-3 py-1.5 rounded-lg border border-emerald-600 text-emerald-700 text-xs sm:text-sm font-semibold whitespace-nowrap bg-emerald-50">
                    {formatExperienceDuration(org.totalMonths)} at this organization
                  </span>
                </div>
              </div>

              <div className={cn('space-y-5', org.roles.length > 1 && 'relative pl-4 border-l-2 border-emerald-200/80 ml-1')}>
                {org.roles.length > 1 && (
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 -ml-4 mb-1">
                    Career progression
                  </p>
                )}
                {org.roles.map((role, roleIndex) => {
                  const roleMonths = calculateExperienceMonths(role);
                  const roleProjects = projectCountFor(role);

                  return (
                    <div
                      key={role.id}
                      className={cn(
                        'rounded-xl border border-zinc-100 bg-zinc-50/60 p-4',
                        org.roles.length > 1 && roleIndex > 0 && 'relative'
                      )}
                    >
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 mb-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <div>
                              <h4 className="text-lg font-bold text-zinc-900">{role.position}</h4>
                              {org.roles.length > 1 && role.department && role.department !== org.department && (
                                <p className="text-emerald-600 text-sm font-medium mt-0.5">{role.department}</p>
                              )}
                            </div>
                            {isPromotionRole(role) && (
                              <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-wide">
                                Promotion
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="md:text-right shrink-0">
                          <div className="inline-block px-3 py-1 rounded-full bg-white border border-zinc-200 text-zinc-600 text-xs font-bold">
                            {role.period}
                          </div>
                          <p className="text-emerald-700 text-xs font-semibold mt-2">
                            {formatExperienceDuration(roleMonths)} · {roleProjects} {roleProjects === 1 ? 'project' : 'projects'}
                          </p>
                        </div>
                      </div>
                      <FormattedTextContent content={role.description} className="text-zinc-600 text-sm" />
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

const Projects = () => {
  const [projects, setProjects] = useState<any[]>([]);
  const [experience, setExperience] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      safeFetchJson<any[]>('/api/projects', []),
      safeFetchJson<any[]>('/api/experience', []),
    ]).then(([projectRows, experienceRows]) => {
      setProjects(Array.isArray(projectRows) ? projectRows : []);
      setExperience(Array.isArray(experienceRows) ? experienceRows : []);
      setLoading(false);
    });
  }, []);

  const categories = getProjectCategories(projects);
  const filteredProjects = filterProjectsList(projects, searchQuery, categoryFilter, experience);

  if (loading) {
    return (
      <div className="py-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white border border-zinc-200 shadow-sm rounded-3xl p-6 md:p-8 animate-pulse">
          <div className="h-6 w-48 bg-zinc-200 rounded-lg mb-2" />
          <div className="h-4 w-96 bg-zinc-200 rounded mb-8" />
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3].map((id) => (
              <div key={id} className="bg-white border border-zinc-200/65 shadow-sm rounded-2xl overflow-hidden">
                <div className="h-48 bg-zinc-200" />
                <div className="p-6 space-y-4">
                  <div className="h-6 bg-zinc-200 rounded w-3/4" />
                  <div className="h-4 bg-zinc-200 rounded w-1/2" />
                  <div className="h-3 bg-zinc-200 rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <SectionHeader 
        title="Featured Projects" 
        subtitle="Showcasing my work in energy, infrastructure, and environmental sectors."
        icon={Layers}
        compact
      />

      <div className="mb-8 space-y-4">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title, client, location, category, or organization..."
              className="w-full bg-white border border-zinc-200 rounded-xl pl-11 pr-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-white border border-zinc-200 rounded-xl px-4 py-3 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 lg:min-w-[220px]"
          >
            <option value="all">All categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          {(searchQuery || categoryFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setCategoryFilter('all');
              }}
              className="px-4 py-3 text-sm font-semibold rounded-xl border border-zinc-200 text-zinc-600 hover:bg-zinc-50 whitespace-nowrap"
            >
              Clear filters
            </button>
          )}
        </div>
        <p className="text-sm text-zinc-500">
          Showing {filteredProjects.length} of {projects.length} projects
        </p>
      </div>

      {filteredProjects.length === 0 ? (
        <div className="text-center py-16 bg-white border border-zinc-200 rounded-2xl">
          <p className="text-zinc-900 font-semibold mb-1">No projects found</p>
          <p className="text-zinc-500 text-sm">Try a different search term or category.</p>
        </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {filteredProjects.map((project, index) => {
          
          return (
            <Link to={`/project/${project.id}`} key={project.id}>
            <motion.div
              key={project.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
              className={cn(
                "bg-white border shadow-sm rounded-2xl overflow-hidden transition-all group cursor-pointer",
                "border-zinc-200 hover:border-emerald-600/50"
              )}
            >
              <div className="h-48 bg-zinc-100 relative overflow-hidden">
                <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white/80 to-transparent z-10" />
                <img 
                  src={project.image || `https://picsum.photos/seed/${project.id}/800/400`} 
                  alt={project.title}
                  className="w-full h-full object-cover opacity-90 group-hover:scale-110 transition-transform duration-500"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute top-4 right-4 z-20">
                  <span className="px-3 py-1 rounded-full bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-wider">
                    {project.category}
                  </span>
                </div>
              </div>
              <div className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xl font-bold text-zinc-900 group-hover:text-emerald-600 transition-colors">{project.title}</h3>
                  <span className="text-zinc-500 text-xs">{formatProjectDateRange(project.projectStartDate, project.projectEndDate, project.date)}</span>
                </div>
                <p className="text-emerald-600/80 text-sm font-medium mb-2">{project.client}</p>
                {isProjectManagerRole(project) && (
                  <span className="inline-block mb-4 px-2.5 py-1 rounded-md border border-emerald-600 bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase tracking-wide">
                    Project Manager
                  </span>
                )}
                
                <div className="mt-6 pt-6 border-t border-zinc-100 flex items-center justify-between">
                  <div className="flex items-center text-zinc-500 text-xs">
                    <MapPin className="w-3 h-3 mr-1" />
                    {project.location}
                  </div>
                  <div className="text-emerald-600 text-sm font-bold flex items-center space-x-1">
                    <span>View Details</span>
                    <motion.div
                      animate={{ rotate: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </motion.div>
                  </div>
                </div>
              </div>
            </motion.div>
            </Link>
          );
        })}
      </div>
      )}
    </div>
  );
};

const ProjectDetail = () => {
  const { id } = useParams();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/projects/${id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setProject(data))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="pt-24 pb-20 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">Loading project...</div>;
  if (!project) return <div className="pt-24 pb-20 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">Project not found.</div>;

  const builder = safeParseObject<BuilderConfig>(project.builderConfig, createDefaultBuilderConfig());
  const blocks = Array.isArray(builder.blocks) && builder.blocks.length > 0 ? builder.blocks : buildLegacyBlocks(project);

  return (
    <div className="pt-24 pb-20 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <Link to="/#projects" className="inline-flex items-center text-sm font-semibold text-emerald-700 hover:text-emerald-800 mb-6">
        <ChevronRight className="w-4 h-4 rotate-180 mr-1" />
        Back to Projects
      </Link>

      <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm" style={{ backgroundColor: builder.colors.surface }}>
        <div className="h-72 bg-zinc-100">
          <img
            src={project.image || `https://picsum.photos/seed/${project.id}/1200/500`}
            alt={project.title}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        </div>
        <div className="p-8 space-y-8">
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <span className="px-3 py-1 rounded-full text-white text-xs font-bold uppercase tracking-wide" style={{ backgroundColor: builder.colors.primary }}>
                {project.category}
              </span>
              {isProjectManagerRole(project) && (
                <span className="px-2.5 py-1 rounded-md border border-emerald-600 bg-emerald-50 text-emerald-700 text-xs font-bold uppercase tracking-wide">
                  Project Manager
                </span>
              )}
              <span className="text-zinc-500 text-sm">{formatProjectDateRange(project.projectStartDate, project.projectEndDate, project.date)}</span>
            </div>
            <h1 className="text-3xl font-bold text-zinc-900 mb-2">{project.title}</h1>
            <p className="font-medium" style={{ color: builder.colors.accent }}>{project.client}</p>
            <p className="text-zinc-500 text-sm mt-1 flex items-center">
              <MapPin className="w-4 h-4 mr-1" />
              {project.location}
            </p>
          </div>

          {blocks.map((block) => {
            if (block.type === 'title') {
              return <h2 key={block.id} className="text-2xl font-bold text-zinc-900">{renderInlineFormattedText(block.content)}</h2>;
            }
            if (block.type === 'heading') {
              return <h3 key={block.id} className="text-sm font-bold uppercase tracking-widest text-zinc-400">{renderInlineFormattedText(block.content)}</h3>;
            }
            if (block.type === 'text') {
              return (
                <div key={block.id}>
                  <FormattedTextContent content={block.content} />
                </div>
              );
            }
            if (block.type === 'photo') {
              return (
                <div key={block.id} className="space-y-2">
                  <img src={block.url} alt={block.caption || project.title} className="w-full max-h-[28rem] object-cover rounded-xl border border-zinc-200" referrerPolicy="no-referrer" />
                  {block.caption && <p className="text-xs text-zinc-500">{block.caption}</p>}
                </div>
              );
            }
            if (block.type === 'table') {
              const widths = block.table.widths?.length === block.table.columns.length
                ? block.table.widths
                : block.table.columns.map(() => '');
              return (
                <div key={block.id} className="overflow-x-auto rounded-xl border border-zinc-200">
                  <table className="text-left text-sm" style={{ width: `min(100%, ${Number(block.table.width || 900)}px)` }}>
                    <colgroup>
                      {block.table.columns.map((_, idx) => (
                        <col key={`${block.id}-width-${idx}`} style={{ width: widths[idx] ? `${Number(widths[idx])}px` : undefined }} />
                      ))}
                    </colgroup>
                    <thead className="bg-zinc-50 text-zinc-500">
                      <tr>
                        {block.table.columns.map((col, idx) => (
                          <th key={`${block.id}-col-${idx}`} className="px-4 py-3 font-semibold">{col || `Column ${idx + 1}`}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {block.table.rows.map((row, idx) => (
                        <tr key={`${block.id}-row-${idx}`} className="border-t border-zinc-100">
                          {block.table.columns.map((_, colIdx) => (
                            <td key={`${block.id}-cell-${idx}-${colIdx}`} className="px-4 py-3 text-zinc-700">{row[colIdx] || '-'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            }
            return null;
          })}
        </div>
      </div>
    </div>
  );
};

const Skills = () => {
  const [skills, setSkills] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      safeFetchJson<any[]>('/api/skills', []),
      safeFetchJson<any[]>('/api/projects', [])
    ]).then(([skillRows, projectRows]) => {
      setSkills(Array.isArray(skillRows) ? skillRows : []);
      setProjects(Array.isArray(projectRows) ? projectRows : []);
      setLoading(false);
    });
  }, []);

  const categories = Array.from(new Set(skills.map(s => s.category)));

  if (loading) {
    return (
      <div className="py-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white border border-zinc-200 shadow-sm rounded-3xl p-6 md:p-8 animate-pulse">
          <div className="h-6 w-44 bg-zinc-200 rounded-lg mb-2" />
          <div className="h-4 w-96 bg-zinc-200 rounded mb-8" />
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3].map((id) => (
              <div key={id} className="bg-white border border-zinc-200 shadow-sm rounded-2xl p-6">
                <div className="h-6 w-32 bg-zinc-200 rounded-lg mb-6" />
                <div className="space-y-6">
                  {[1, 2].map((sid) => (
                    <div key={sid} className="space-y-2">
                      <div className="flex justify-between">
                        <div className="h-4 w-20 bg-zinc-200 rounded" />
                        <div className="h-4 w-8 bg-zinc-200 rounded" />
                      </div>
                      <div className="h-2 bg-zinc-200 rounded-full w-full" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12 animate-fade-in-up">
      <div>
        <SectionHeader 
          title="Technical Arsenal" 
          subtitle="Proficiency in GIS tools, programming languages, and specialized analysis techniques."
          icon={Code}
          compact
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {categories.map((cat) => (
            <div key={cat} className="bg-white border border-zinc-200 shadow-sm rounded-2xl p-6">
              <h3 className="text-sm font-bold text-zinc-900 mb-6 flex items-center space-x-2 border-b border-zinc-100 pb-3">
                <div className="w-2 h-2 rounded-full bg-emerald-600" />
                <span>{cat}</span>
              </h3>
              <div className="space-y-6">
                {skills.filter(s => s.category === cat).map(skill => {
                  const count = projects.filter(p => {
                    try {
                      if (!p.skills) return false;
                      const parsed = JSON.parse(p.skills);
                      return Array.isArray(parsed) && parsed.map(Number).includes(Number(skill.id));
                    } catch {
                      return false;
                    }
                  }).length;

                  return (
                    <div key={skill.id} className="space-y-1.5">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-zinc-700 font-medium">{skill.name}</span>
                        <span className="text-emerald-600 font-bold">{skill.level}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${skill.level}%` }}
                          transition={{ duration: 1, delay: 0.2 }}
                          className="h-full bg-emerald-600"
                        />
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-zinc-500 pt-0.5 select-none">
                        <span className="text-zinc-400">Project involvement</span>
                        {count > 0 ? (
                          <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-semibold border border-emerald-100 font-mono">
                            {count} {count === 1 ? 'project' : 'projects'}
                          </span>
                        ) : (
                          <span className="text-zinc-400 italic">None</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Skill Statistics Section & Project Involvement Visualization */}
      <div className="bg-zinc-50 border border-zinc-200 shadow-sm rounded-3xl p-6 md:p-8">
        <h3 className="text-sm font-bold text-zinc-900 mb-2 flex items-center space-x-2">
          <BarChart3 className="w-5 h-5 text-emerald-600" />
          <span>Skill & Tool Project Involvement Statistics</span>
        </h3>
        <p className="text-xs text-zinc-500 mb-8">
          Analysis of GIS platform modules, programming tools, and professional frameworks applied during development workflows across my {projects.length} featured project involvements.
        </p>

        {/* Highlight Stats Dashboard Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
          <div className="bg-white border border-zinc-150 rounded-2xl p-5 shadow-xs">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Involved Skills</span>
            <div className="text-2xl font-extrabold text-zinc-900">
              {skills.filter(s => {
                return projects.some(p => {
                  try {
                    if (!p.skills) return false;
                    const parsed = JSON.parse(p.skills);
                    return Array.isArray(parsed) && parsed.map(Number).includes(Number(s.id));
                  } catch {
                    return false;
                  }
                });
              }).length} <span className="text-xs text-zinc-450 font-normal">/ {skills.length} skills total</span>
            </div>
          </div>

          <div className="bg-white border border-zinc-150 rounded-2xl p-5 shadow-xs">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Most Utilized Tool</span>
            <div className="text-md font-bold text-emerald-600 truncate pt-1">
              {(() => {
                let maxCount = 0;
                let topSkillName = "None yet";
                skills.forEach(s => {
                  const cnt = projects.filter(p => {
                    try {
                      if (!p.skills) return false;
                      const parsed = JSON.parse(p.skills);
                      return Array.isArray(parsed) && parsed.map(Number).includes(Number(s.id));
                    } catch {
                      return false;
                    }
                  }).length;
                  if (cnt > maxCount) {
                    maxCount = cnt;
                    topSkillName = `${s.name} (${cnt} ${cnt === 1 ? 'proj' : 'projs'})`;
                  }
                });
                return topSkillName;
              })()}
            </div>
          </div>

          <div className="bg-white border border-zinc-150 rounded-2xl p-5 shadow-xs">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Total Tool Linkages</span>
            <div className="text-2xl font-extrabold text-zinc-900">
              {projects.reduce((acc, p) => {
                try {
                  if (!p.skills) return acc;
                  const parsed = JSON.parse(p.skills);
                  return acc + (Array.isArray(parsed) ? parsed.length : 0);
                } catch {
                  return acc;
                }
              }, 0)} <span className="text-xs text-zinc-450 font-normal">associations</span>
            </div>
          </div>
        </div>

        {/* Visual Horizontal Distribution Chart of Skills Involvement */}
        {skills.some(s => projects.some(p => {
          try {
            if (!p.skills) return false;
            const parsed = JSON.parse(p.skills);
            return Array.isArray(parsed) && parsed.map(Number).includes(Number(s.id));
          } catch {
            return false;
          }
        })) ? (
          <div className="bg-white border border-zinc-150 rounded-2xl p-5 md:p-6 shadow-xs">
            <h4 className="text-xs font-bold text-zinc-850 mb-6 uppercase tracking-wider">Top Skills by Project Involvement Frequency</h4>
            <div className="space-y-4">
              {skills
                .map(s => {
                  const count = projects.filter(p => {
                    try {
                      if (!p.skills) return false;
                      const parsed = JSON.parse(p.skills);
                      return Array.isArray(parsed) && parsed.map(Number).includes(Number(s.id));
                    } catch {
                      return false;
                    }
                  }).length;
                  return { ...s, count };
                })
                .filter(item => item.count > 0)
                .sort((a, b) => b.count - a.count)
                .slice(0, 8)
                .map((item, idx, arr) => {
                  const maxInvolvement = Math.max(...arr.map(a => a.count), 1);
                  const percentage = (item.count / maxInvolvement) * 100;

                  return (
                    <div key={`stat-bar-${item.id}`} className="space-y-1">
                      <div className="flex justify-between items-center text-xs justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="w-4 text-zinc-350 font-mono font-bold text-[10px]">{idx + 1}.</span>
                          <span className="font-semibold text-zinc-700">{item.name}</span>
                          <span className="text-[9px] text-zinc-400 font-mono">({item.category})</span>
                        </div>
                        <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md text-[10px] font-mono border border-emerald-100">
                          {item.count} {item.count === 1 ? 'project' : 'projects'}
                        </span>
                      </div>
                      <div className="h-3 w-full bg-zinc-50 rounded-full overflow-hidden border border-zinc-100">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${percentage}%` }}
                          transition={{ duration: 1, delay: idx * 0.05 }}
                          className="h-full bg-emerald-600 rounded-full"
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        ) : (
          <div className="bg-white border border-zinc-150 rounded-2xl p-6 text-center text-xs text-zinc-400 italic">
            No active project associations recorded for these skills at present.
          </div>
        )}
      </div>
    </div>
  );
};

const Admin = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('profile');
  const [profile, setProfile] = useState<any>(null);
  const [experience, setExperience] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [skills, setSkills] = useState<any[]>([]);
  const [education, setEducation] = useState<any[]>([]);
  const [educationCourses, setEducationCourses] = useState<EducationCourse[]>([]);
  const [highlights, setHighlights] = useState<any[]>([]);
  const [aboutPhotos, setAboutPhotos] = useState<any[]>([]);
  const [aboutPhotoImage, setAboutPhotoImage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [editingItem, setEditingItem] = useState<{ type: string; id: number | null } | null>(null);
  const [projectImage, setProjectImage] = useState<string | null>(null);
  const [projectBuilder, setProjectBuilder] = useState<BuilderConfig>(createDefaultBuilderConfig());
  const [selectedProjectSkills, setSelectedProjectSkills] = useState<number[]>([]);
  const [columnResizeState, setColumnResizeState] = useState<{
    blockId: string;
    colIdx: number;
    startX: number;
    startWidth: number;
  } | null>(null);
  const [tableResizeState, setTableResizeState] = useState<{
    blockId: string;
    startX: number;
    startWidth: number;
  } | null>(null);
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [projectListSearch, setProjectListSearch] = useState('');
  const [projectListCategory, setProjectListCategory] = useState('all');
  const [experienceEntryMode, setExperienceEntryMode] = useState<'new_org' | 'existing_org'>('new_org');
  const [selectedOrganizationGroupId, setSelectedOrganizationGroupId] = useState('');
  const [markAsPromotion, setMarkAsPromotion] = useState(true);

  // Date selection state
  const [isPresent, setIsPresent] = useState(false);
  const [editDates, setEditDates] = useState({ startMonth: 'January', startYear: new Date().getFullYear(), endMonth: 'January', endYear: new Date().getFullYear() });
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const years = Array.from({ length: 40 }, (_, i) => new Date().getFullYear() - i);

  useEffect(() => {
    if (!columnResizeState) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - columnResizeState.startX;
      const nextWidth = Math.max(120, Math.min(800, columnResizeState.startWidth + delta));
      setProjectBuilder((prev) => ({
        ...prev,
        blocks: prev.blocks.map((b) =>
          b.id === columnResizeState.blockId && b.type === 'table'
            ? {
                ...b,
                table: {
                  ...b.table,
                  widths: (b.table.widths || b.table.columns.map(() => '220')).map((w, i) =>
                    i === columnResizeState.colIdx ? String(nextWidth) : w
                  ),
                },
              }
            : b
        ),
      }));
    };

    const handleMouseUp = () => setColumnResizeState(null);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [columnResizeState]);

  useEffect(() => {
    if (!tableResizeState) return;
    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - tableResizeState.startX;
      const nextWidth = Math.max(420, Math.min(1400, tableResizeState.startWidth + delta));
      setProjectBuilder((prev) => ({
        ...prev,
        blocks: prev.blocks.map((b) =>
          b.id === tableResizeState.blockId && b.type === 'table'
            ? { ...b, table: { ...b.table, width: String(nextWidth) } }
            : b
        ),
      }));
    };
    const handleMouseUp = () => setTableResizeState(null);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [tableResizeState]);

  useEffect(() => {
    if (editingItem?.type === 'experience' && editingItem.id) {
      const exp = experience.find(e => e.id === editingItem.id);
      if (exp && exp.period) {
        // Parse "Month YYYY to Month YYYY" or "Month YYYY to Present"
        const parts = exp.period.split(' to ');
        if (parts.length === 2) {
          const startParts = parts[0].split(' ');
          if (startParts.length === 2) {
            setEditDates(prev => ({ ...prev, startMonth: startParts[0], startYear: parseInt(startParts[1]) }));
          }
          if (parts[1] === 'Present') {
            setIsPresent(true);
          } else {
            setIsPresent(false);
            const endParts = parts[1].split(' ');
            if (endParts.length === 2) {
              setEditDates(prev => ({ ...prev, endMonth: endParts[0], endYear: parseInt(endParts[1]) }));
            }
          }
        }
      }
    } else if (editingItem?.type === 'projects' && editingItem.id) {
      const proj = projects.find(p => p.id === editingItem.id);
      if (proj) {
        setProjectImage(proj.image || null);
        const nextBuilder = safeParseObject<BuilderConfig>(proj.builderConfig, createDefaultBuilderConfig());
        if (!Array.isArray(nextBuilder.blocks) || nextBuilder.blocks.length === 0) {
          nextBuilder.blocks = buildLegacyBlocks(proj);
        }
        setProjectBuilder(nextBuilder);
        // Load skills for edited project
        let parsedSkills: number[] = [];
        try {
          if (proj.skills) {
            const parsed = JSON.parse(proj.skills);
            if (Array.isArray(parsed)) {
              parsedSkills = parsed.map(Number);
            }
          }
        } catch (err) {
          console.error("Failed to parse project skills", err);
        }
        setSelectedProjectSkills(parsedSkills);
      }
    } else if (!editingItem) {
      setIsPresent(false);
      setEditDates({ startMonth: 'January', startYear: new Date().getFullYear(), endMonth: 'January', endYear: new Date().getFullYear() });
      setProjectImage(null);
      setProjectBuilder(createDefaultBuilderConfig());
      setSelectedProjectSkills([]);
      if (experienceEntryMode === 'new_org') {
        setSelectedOrganizationGroupId('');
      }
    }
  }, [editingItem, experience, projects, experienceEntryMode]);

  useEffect(() => {
    if (editingItem?.type === 'experience' && editingItem.id) {
      const exp = experience.find((e) => e.id === editingItem.id);
      if (exp?.organizationGroupId) {
        setExperienceEntryMode('existing_org');
        setSelectedOrganizationGroupId(String(exp.organizationGroupId));
        setMarkAsPromotion(isPromotionRole(exp));
      } else {
        setExperienceEntryMode('new_org');
        setSelectedOrganizationGroupId('');
        setMarkAsPromotion(false);
      }
    }
  }, [editingItem, experience]);

  useEffect(() => {
    if (editingItem?.type === 'education' && editingItem.id) {
      const entry = education.find((ed) => ed.id === editingItem.id);
      const courses = parseEducationCourses(entry?.courses);
      setEducationCourses(courses.length > 0 ? courses : [emptyEducationCourse()]);
      return;
    }
    if (editingItem?.type !== 'education') {
      setEducationCourses([]);
    }
  }, [editingItem?.type, editingItem?.id, education]);

  useEffect(() => {
    if (editingItem?.type !== 'about-photos') {
      setAboutPhotoImage(null);
      return;
    }
    if (editingItem.id) {
      const photo = aboutPhotos.find((p) => p.id === editingItem.id);
      setAboutPhotoImage(photo?.image ? resolveAboutPhotoSrc(photo.image) : null);
    }
  }, [editingItem?.type, editingItem?.id, aboutPhotos]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProjectImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const compressImageForUpload = (file: File, maxWidth = 840, quality = 0.72) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read image'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Invalid image file'));
        img.onload = () => {
          const scale = Math.min(1, maxWidth / img.width);
          const width = Math.round(img.width * scale);
          const height = Math.round(img.height * scale);
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(String(reader.result));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          let nextQuality = quality;
          let output = canvas.toDataURL('image/jpeg', nextQuality);
          while (output.length > ABOUT_PHOTO_MAX_DATA_URL_LENGTH && nextQuality > 0.42) {
            nextQuality -= 0.08;
            output = canvas.toDataURL('image/jpeg', nextQuality);
          }
          resolve(output);
        };
        img.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });

  const handleAboutPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImageForUpload(file);
      if (compressed.length > ABOUT_PHOTO_MAX_DATA_URL_LENGTH) {
        alert('This image is still too large for Vercel. Try a smaller JPG or PNG.');
        e.target.value = '';
        return;
      }
      setAboutPhotoImage(compressed);
    } catch {
      alert('Could not process that image. Try a smaller JPG or PNG.');
    }
  };

  const fetchData = async () => {
    const [p, e, pr, s, ed, hl, ap] = await Promise.all([
      safeFetchJson<any | null>('/api/profile', null),
      safeFetchJson<any[]>('/api/experience', []),
      safeFetchJson<any[]>('/api/projects', []),
      safeFetchJson<any[]>('/api/skills', []),
      safeFetchJson<any[]>('/api/education', []),
      safeFetchJson<any[]>('/api/highlights', []),
      safeFetchJson<any[]>('/api/about-photos', []),
    ]);
    setProfile(p);
    setExperience(Array.isArray(e) ? e : []);
    setProjects(Array.isArray(pr) ? pr : []);
    setSkills(Array.isArray(s) ? s : []);
    setEducation(Array.isArray(ed) ? ed : []);
    setHighlights(Array.isArray(hl) ? hl : []);
    setAboutPhotos(Array.isArray(ap) ? ap : []);
  };

  useEffect(() => {
    const token = localStorage.getItem(ADMIN_TOKEN_KEY);
    if (!token) {
      navigate(SECRET_LOGIN_PATH, { replace: true });
      return;
    }

    fetch('/api/admin/session', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (!data?.authenticated) {
          localStorage.removeItem(ADMIN_TOKEN_KEY);
          navigate(SECRET_LOGIN_PATH, { replace: true });
          return;
        }
        setIsAuthorized(true);
        fetchData();
      })
      .catch(() => {
        localStorage.removeItem(ADMIN_TOKEN_KEY);
        navigate(SECRET_LOGIN_PATH, { replace: true });
      });
  }, [navigate]);

  const getAuthHeaders = () => {
    const token = localStorage.getItem(ADMIN_TOKEN_KEY) || '';
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  };

  const handleUnauthorized = (status: number, message?: string) => {
    if (status === 401) {
      alert(message || 'Your session expired. Please sign in again.');
      localStorage.removeItem(ADMIN_TOKEN_KEY);
      navigate(SECRET_LOGIN_PATH, { replace: true });
      return true;
    }
    if (status === 413) {
      alert(message || 'Image too large. Try a smaller JPG or PNG.');
      return true;
    }
    return false;
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    await fetch('/api/profile', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(profile),
    });
    setIsSaving(false);
    alert('Profile updated!');
  };

  const saveAboutPhoto = async () => {
    const existingPhoto =
      editingItem?.type === 'about-photos' && editingItem.id
        ? aboutPhotos.find((p) => p.id === editingItem.id)
        : null;
    const image = aboutPhotoImage || existingPhoto?.image || '';
    if (!image) {
      alert('Please upload a certification or award slider photo.');
      return;
    }
    const formEl = document.getElementById('about-photo-form') as HTMLFormElement | null;
    const formData = formEl ? new FormData(formEl) : new FormData();
    const payload = {
      image,
      caption: String(formData.get('caption') || '').trim(),
      sortOrder: parseInt(String(formData.get('sortOrder') || '0'), 10) || 0,
      authority: String(formData.get('authority') || '').trim(),
      date: String(formData.get('date') || '').trim(),
      type: String(formData.get('type') || 'Certificate').trim(),
    };
    const isEditing = Boolean(editingItem?.type === 'about-photos' && editingItem.id);
    const url = isEditing ? `/api/about-photos/${editingItem!.id}` : '/api/about-photos';
    setIsSaving(true);
    try {
      const response = await fetch(url, {
        method: isEditing ? 'PUT' : 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const contentType = response.headers.get('content-type') || '';
        let message = 'Failed to save certification or award slider photo';
        if (contentType.includes('application/json')) {
          try {
            const errBody = await response.json();
            if (errBody?.message) message = errBody.message;
          } catch {
            /* ignore */
          }
        } else if (!contentType.includes('application/json')) {
          message = 'Restart the dev server: npm run dev';
        }
        if (handleUnauthorized(response.status, message)) return;
        throw new Error(message);
      }
      setEditingItem(null);
      setAboutPhotoImage(null);
      await fetchData();
      alert('Certification and award slider photo saved!');
    } catch (error) {
      console.error('Save about photo failed:', error);
      alert(error instanceof Error ? error.message : 'Failed to save certification or award slider photo.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveItem = async (e: React.FormEvent, type: string) => {
    e.preventDefault();
    if (type === 'about-photos') {
      await saveAboutPhoto();
      return;
    }
    setIsSaving(true);
    try {
      const formData = new FormData(e.target as HTMLFormElement);
      const data: any = Object.fromEntries(formData.entries());
      
      if (type === 'experience') {
        const start = `${data.startMonth} ${data.startYear}`;
        const end = isPresent ? 'Present' : `${data.endMonth} ${data.endYear}`;
        data.period = `${start} to ${end}`;
        
        // Calculate sortable startDate (YYYY-MM)
        const monthIdx = months.indexOf(data.startMonth as string) + 1;
        const monthStr = monthIdx < 10 ? `0${monthIdx}` : `${monthIdx}`;
        data.startDate = `${data.startYear}-${monthStr}`;

        // Remove temporary fields
        delete data.startMonth;
        delete data.startYear;
        delete data.endMonth;
        delete data.endYear;
        data.department = String(data.department || '').trim();

        const isEditingExperience = editingItem?.type === 'experience' && editingItem.id;
        const existingExperience = isEditingExperience
          ? experience.find((e) => e.id === editingItem.id)
          : null;

        if (isEditingExperience && existingExperience) {
          data.organizationGroupId = existingExperience.organizationGroupId
            ? Number(existingExperience.organizationGroupId)
            : null;
          data.isPromotion = data.isPromotion === '1' ? 1 : 0;
        } else if (experienceEntryMode === 'existing_org' && selectedOrganizationGroupId) {
          data.organizationGroupId = Number(selectedOrganizationGroupId);
          const anchor = experience.find((e) => getExperienceGroupId(e) === Number(selectedOrganizationGroupId));
          if (anchor) {
            data.company = anchor.company;
            data.location = anchor.location;
            if (!data.department) data.department = anchor.department || '';
          }
          data.isPromotion = markAsPromotion ? 1 : 0;
        } else {
          data.organizationGroupId = null;
          data.isPromotion = 0;
        }
      }

      if (type === 'projects') {
        const start = (data.projectStartDate as string) || '';
        const end = (data.projectEndDate as string) || '';
        data.date = formatProjectDateRange(start, end, '');
        data.sortDate = start || data.sortDate || '';
        data.experienceId = data.experienceId ? Number(data.experienceId) : null;
        data.isProjectManager =
          data.isProjectManager === '1' ||
          data.isProjectManager === true ||
          data.isProjectManager === 1;
        data.image = projectImage as any;
        const textBlocks = projectBuilder.blocks.filter((b) => b.type === 'text');
        const tableBlocks = projectBuilder.blocks.filter((b) => b.type === 'table');
        const photoBlocks = projectBuilder.blocks.filter((b) => b.type === 'photo' && b.url);
        data.features = ((textBlocks[0] as any)?.content || '').toString();
        data.activities = ((textBlocks[1] as any)?.content || (textBlocks[0] as any)?.content || '').toString();
        data.outputDetails = ((textBlocks[2] as any)?.content || '').toString();
        data.activityDetails = ((textBlocks[3] as any)?.content || '').toString();
        data.photoGallery = JSON.stringify(photoBlocks.map((p: any) => p.url).filter(Boolean));
        const firstTable = tableBlocks[0] as any;
        data.outputTable = JSON.stringify(
          firstTable?.table?.rows?.map((row: string[]) => ({
            metric: (row[0] || '').trim(),
            value: (row[1] || '').trim(),
            notes: (row[2] || '').trim(),
          })).filter((row: any) => row.metric || row.value || row.notes) || []
        );
        data.builderConfig = JSON.stringify(projectBuilder);
        data.skills = JSON.stringify(selectedProjectSkills);
      }

      if (type === 'skills') {
        data.level = parseInt(data.level as string) as any;
      }

      if (type === 'highlights') {
        data.sortOrder = parseInt(data.sortOrder as string, 10) || 0;
      }

      if (type === 'education') {
        const courses = educationCourses
          .map((course) => normalizeEducationCourse(course as unknown as Record<string, unknown>))
          .filter((course) => course.courseName || course.courseCode || course.creditHours || course.grade);
        data.courses = JSON.stringify(courses);
        data.sortOrder = parseInt(String(data.sortOrder || '0'), 10) || 0;
        if (!data.endYear && data.year) data.endYear = data.year;
        data.year = String(data.endYear || data.year || data.startYear || '');
      }

      const isEditing = editingItem && editingItem.type === type && editingItem.id !== null;
      const url = isEditing ? `/api/${type}/${editingItem.id}` : `/api/${type}`;
      const method = isEditing ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        if (handleUnauthorized(response.status)) {
          return;
        }
        const contentType = response.headers.get('content-type') || '';
        let message = 'Failed to save item';
        if (!contentType.includes('application/json')) {
          message =
            response.status === 404
              ? 'API not found. Stop the dev server (Ctrl+C) and run: npm run dev'
              : 'Server error. Restart with: npm run dev';
        } else {
          try {
            const errBody = await response.json();
            if (errBody?.message) message = errBody.message;
          } catch {
            /* ignore */
          }
        }
        throw new Error(message);
      }
      
      setEditingItem(null);
      setExperienceEntryMode('new_org');
      setSelectedOrganizationGroupId('');
      setMarkAsPromotion(true);
      setAboutPhotoImage(null);
      setEducationCourses([]);
      await fetchData();
      (e.target as HTMLFormElement).reset();
      setProjectImage(null);
      setProjectBuilder(createDefaultBuilderConfig());
      alert('Saved successfully!');
    } catch (error) {
      console.error('Save failed:', error);
      alert(error instanceof Error ? error.message : 'Failed to save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (type: string, id: number) => {
    try {
      const response = await fetch(`/api/${type}/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem(ADMIN_TOKEN_KEY) || ''}` },
      });
      if (response.ok) {
        await fetchData();
      } else if (!handleUnauthorized(response.status)) {
        throw new Error('Delete failed');
      }
    } catch (error) {
      console.error('Delete failed:', error);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.newPassword.length < 8) {
      alert('New password must be at least 8 characters.');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      alert('New password and confirm password do not match.');
      return;
    }

    setIsChangingPassword(true);
    try {
      const response = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });

      if (!response.ok) {
        if (handleUnauthorized(response.status)) {
          return;
        }
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.message || 'Failed to change password');
      }

      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      alert('Password changed successfully.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to change password';
      alert(message);
    } finally {
      setIsChangingPassword(false);
    }
  };

  if (isAuthorized === null) {
    return (
      <div className="pt-24 pb-20 max-w-6xl mx-auto px-4 text-center text-zinc-500">
        Loading admin...
      </div>
    );
  }
  if (!profile) {
    return (
      <div className="pt-24 pb-20 max-w-6xl mx-auto px-4 text-center text-zinc-500">
        Unable to load profile. Check that the server is running.
      </div>
    );
  }

  const projectCategories = getProjectCategories(projects);
  const filteredAdminProjects = filterProjectsList(projects, projectListSearch, projectListCategory, experience);
  const experienceOrganizations = groupExperienceByOrganization(experience);
  const selectedExperienceOrg = experienceOrganizations.find(
    (org) => String(org.groupId) === selectedOrganizationGroupId
  );
  const editingExperience =
    editingItem?.type === 'experience' && editingItem.id
      ? experience.find((e) => e.id === editingItem.id)
      : null;

  const tabs = [
    { id: 'profile', name: 'Profile', icon: Settings },
    { id: 'highlights', name: 'Expertise', icon: Globe },
    { id: 'education', name: 'Education', icon: GraduationCap },
    { id: 'experience', name: 'Experience', icon: Briefcase },
    { id: 'projects', name: 'Projects', icon: Layers },
    { id: 'skills', name: 'Skills', icon: Code },
    { id: 'security', name: 'Security', icon: Settings },
  ];

  return (
    <div className="pt-24 pb-20 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <SectionHeader title="Admin Dashboard" subtitle="Manage your portfolio content." icon={Settings} />
      <div className="mb-6 flex justify-end">
        <button
          type="button"
          onClick={() => {
            localStorage.removeItem(ADMIN_TOKEN_KEY);
            navigate(SECRET_LOGIN_PATH, { replace: true });
          }}
          className="px-4 py-2 text-sm font-semibold rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
        >
          Logout
        </button>
      </div>
      
      <div className="flex flex-wrap gap-2 mb-8">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              setEditingItem(null);
              setIsPresent(false);
              setAboutPhotoImage(null);
              setEducationCourses([]);
            }}
            className={cn(
              "flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-bold transition-all",
              activeTab === tab.id ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20" : "bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
            )}
          >
            <tab.icon className="w-4 h-4" />
            <span>{tab.name}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'profile' && (
          <motion.div
            key="profile"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-8"
          >
            <form onSubmit={handleProfileSave} className="space-y-6 bg-white border border-zinc-200 shadow-sm rounded-2xl p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase">Full Name</label>
                  <input 
                    type="text" 
                    value={profile.name} 
                    onChange={e => setProfile({...profile, name: e.target.value})}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 focus:border-emerald-600 outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase">Hero Status Badge</label>
                  <input
                    type="text"
                    value={profile.status || ''}
                    onChange={(e) => setProfile({ ...profile, status: e.target.value })}
                    placeholder={DEFAULT_STATUS_TEXT}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 focus:border-emerald-600 outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase">Email</label>
                  <input
                    type="email"
                    value={profile.email || ''}
                    onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 focus:border-emerald-600 outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase">Carousel Timer (Seconds)</label>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    step="0.5"
                    value={Number(profile.carouselIntervalMs || DEFAULT_CAROUSEL_INTERVAL_MS) / 1000}
                    onChange={(e) => setProfile({ ...profile, carouselIntervalMs: Math.round(Number(e.target.value || 0) * 1000) })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 focus:border-emerald-600 outline-none transition-all"
                  />
                  <p className="text-xs text-zinc-500">Controls how often the About photo carousel advances. Recommended: 4.5 seconds.</p>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase">LinkedIn Profile URL</label>
                  <input
                    type="url"
                    placeholder="https://www.linkedin.com/in/your-profile"
                    value={profile.linkedin || ''}
                    onChange={(e) => setProfile({ ...profile, linkedin: e.target.value })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 focus:border-emerald-600 outline-none transition-all"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase">Location / Address</label>
                <input
                  type="text"
                  value={profile.address || ''}
                  onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 focus:border-emerald-600 outline-none transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase">Summary</label>
                <TextareaWithListTools
                  rows={3}
                  value={profile.summary}
                  onValueChange={(next) => setProfile({ ...profile, summary: next })}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 focus:border-emerald-600 outline-none transition-all resize-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase">About Me</label>
                <TextareaWithListTools
                  rows={6}
                  value={profile.bio}
                  onValueChange={(next) => setProfile({ ...profile, bio: next })}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 focus:border-emerald-600 outline-none transition-all resize-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase">About Me Photo</label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                  <div className="md:col-span-2">
                    <p className="text-xs text-zinc-500 mb-2">Upload a professional portrait or custom image that will show up right next to your About Me bio text on the homepage. Recommended size: 400x500 px. Max size: 2MB.</p>
                    <label className="flex flex-col items-center justify-center w-full h-44 border-2 border-dashed border-zinc-200 rounded-2xl cursor-pointer bg-zinc-50 hover:bg-zinc-100 overflow-hidden transition-all">
                      <div className="flex flex-col items-center px-4 text-center text-zinc-500">
                        <ImagePlus className="w-8 h-8 mb-2 text-emerald-600 animate-pulse" />
                        <span className="text-sm font-semibold">Click to upload brand-new Photo</span>
                        <span className="mt-1 text-xs text-zinc-400">JPG or PNG formats supported</span>
                      </div>
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            const compressed = await compressImageForUpload(file);
                            if (compressed.length > ABOUT_PHOTO_MAX_DATA_URL_LENGTH) {
                              alert('This image is still too large. Try a smaller JPG or PNG.');
                              e.target.value = '';
                              return;
                            }
                            setProfile({ ...profile, aboutPhoto: compressed });
                          } catch {
                            alert('Could not process that image. Try a smaller JPG or PNG.');
                          }
                        }} 
                        className="hidden" 
                      />
                    </label>
                  </div>
                  <div className="flex flex-col items-center justify-center border border-zinc-150 rounded-2xl p-4 bg-zinc-50 h-full min-h-[176px]">
                    {profile.aboutPhoto ? (
                      <div className="relative w-full max-w-[125px] aspect-[4/5] rounded-xl overflow-hidden border border-zinc-200 group shadow-sm bg-white">
                        <img src={resolveAboutPhotoSrc(profile.aboutPhoto)} alt="About Me preview" className="w-full h-full object-cover animate-fade-in" />
                        <button
                          type="button"
                          onClick={() => setProfile({ ...profile, aboutPhoto: '' })}
                          className="absolute inset-0 bg-red-600/80 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold transition-opacity"
                        >
                          Remove Photo
                        </button>
                      </div>
                    ) : (
                      <div className="text-center text-zinc-400 py-6">
                        <User className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <span className="text-xs">No image uploaded</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <button 
                disabled={isSaving}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800 text-white font-bold rounded-xl transition-all shadow-lg shadow-emerald-600/20"
              >
                {isSaving ? 'Saving Changes...' : 'Update Profile'}
              </button>
            </form>

            <form
              id="about-photo-form"
              key={editingItem?.type === 'about-photos' ? `about-photo-${editingItem.id}` : 'about-photo-new'}
              onSubmit={(e) => handleSaveItem(e, 'about-photos')}
              className="bg-white border border-zinc-200 shadow-sm rounded-2xl p-8 space-y-4"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-zinc-900">
                  {editingItem?.type === 'about-photos' ? 'Edit Certification and Award Photo' : 'Add Certification and Award Photo'}
                </h3>
                {editingItem?.type === 'about-photos' && (
                  <button type="button" onClick={() => { setEditingItem(null); setAboutPhotoImage(null); }} className="text-sm text-zinc-500 hover:text-zinc-700">
                    Cancel Edit
                  </button>
                )}
              </div>
              <p className="text-sm text-zinc-500">
                Carousel photos shown in the Certification and Award section. They rotate automatically.
              </p>
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase">Certification and Award Photo</label>
                <p className="text-xs text-zinc-500">{IMAGE_UPLOAD_HINTS.aboutSlider}</p>
                <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-zinc-200 rounded-xl cursor-pointer bg-zinc-50 hover:bg-zinc-100 overflow-hidden">
                  {aboutPhotoImage ? (
                    <img src={aboutPhotoImage} alt="Certification and award preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center px-4 text-center text-zinc-500">
                      <ImagePlus className="w-8 h-8 mb-2" />
                      <span className="text-sm font-medium">Click to upload certification or award photo</span>
                      <span className="mt-1 text-xs">{IMAGE_UPLOAD_HINTS.aboutSlider}</span>
                    </div>
                  )}
                  <input type="file" accept="image/*" onChange={handleAboutPhotoUpload} className="hidden" />
                </label>
              </div>
              <input
                name="caption"
                placeholder="Certification / Award Name / Caption"
                required
                defaultValue={editingItem?.type === 'about-photos' ? aboutPhotos.find((p) => p.id === editingItem.id)?.caption : ''}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2"
              />
              <select
                name="type"
                defaultValue={editingItem?.type === 'about-photos' ? (aboutPhotos.find((p) => p.id === editingItem.id)?.type || 'Certificate') : 'Certificate'}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2 text-zinc-800"
              >
                <option value="Certificate">Certificate</option>
                <option value="Award">Award</option>
              </select>
              <input
                name="authority"
                placeholder="Authority / Issuing Organization (e.g. Esri, Google, Coursera)"
                defaultValue={editingItem?.type === 'about-photos' ? aboutPhotos.find((p) => p.id === editingItem.id)?.authority : ''}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2"
              />
              <input
                name="date"
                placeholder="Date Issued (e.g. January 2026, Year)"
                defaultValue={editingItem?.type === 'about-photos' ? aboutPhotos.find((p) => p.id === editingItem.id)?.date : ''}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2"
              />
              <input
                name="sortOrder"
                type="number"
                min="0"
                placeholder="Sort order"
                defaultValue={
                  editingItem?.type === 'about-photos'
                    ? aboutPhotos.find((p) => p.id === editingItem.id)?.sortOrder ?? 0
                    : aboutPhotos.length + 1
                }
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2"
              />
              <button
                type="submit"
                disabled={isSaving || !aboutPhotoImage}
                className="w-full py-3 bg-emerald-600 text-white font-bold rounded-xl disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : editingItem?.type === 'about-photos' ? 'Update Photo' : 'Add Photo'}
              </button>
            </form>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {aboutPhotos.map((photo) => (
                <div key={photo.id} className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
                  <div className="aspect-video bg-zinc-100">
                    <img src={resolveAboutPhotoSrc(photo.image)} alt={photo.caption || 'Certification and award'} className="w-full h-full object-cover" />
                  </div>
                  <div className="p-3 flex justify-between items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-zinc-400">
                        Order: {photo.sortOrder ?? 0} {photo.date && `• ${photo.date}`}
                        <span className="ml-1 text-[10px] font-bold text-emerald-600 font-mono">[{photo.type || 'Certificate'}]</span>
                      </p>
                      {photo.caption && <p className="text-sm font-semibold text-zinc-705 truncate" title={photo.caption}>{photo.caption}</p>}
                      {photo.authority && <p className="text-xs text-emerald-700 font-medium truncate" title={photo.authority}>{photo.authority}</p>}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => setEditingItem({ type: 'about-photos', id: photo.id })}
                        className="text-emerald-600 p-2 hover:bg-emerald-50 rounded-lg"
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete('about-photos', photo.id)}
                        className="text-red-500 p-2 hover:bg-red-50 rounded-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {activeTab === 'highlights' && (
          <motion.div
            key="highlights"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-8"
          >
            <form
              key={editingItem?.type === 'highlights' ? `highlight-${editingItem.id}` : 'highlight-new'}
              onSubmit={(e) => handleSaveItem(e, 'highlights')}
              className="bg-white border border-zinc-200 shadow-sm rounded-2xl p-8 space-y-4"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-zinc-900">
                  {editingItem?.type === 'highlights' ? 'Edit Expertise Card' : 'Add Expertise Card'}
                </h3>
                {editingItem?.type === 'highlights' && (
                  <button type="button" onClick={() => setEditingItem(null)} className="text-sm text-zinc-500 hover:text-zinc-700">Cancel Edit</button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input name="title" placeholder="Title (e.g. GIS Expert)" required defaultValue={editingItem?.type === 'highlights' ? highlights.find((h) => h.id === editingItem.id)?.title : ''} className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2" />
                <input name="subtitle" placeholder="Subtitle" required defaultValue={editingItem?.type === 'highlights' ? highlights.find((h) => h.id === editingItem.id)?.subtitle : ''} className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2" />
                <select name="icon" required defaultValue={editingItem?.type === 'highlights' ? highlights.find((h) => h.id === editingItem.id)?.icon : 'Map'} className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2">
                  {HIGHLIGHT_ICON_OPTIONS.map((icon) => (
                    <option key={icon} value={icon}>{icon}</option>
                  ))}
                </select>
                <select name="iconColor" required defaultValue={editingItem?.type === 'highlights' ? highlights.find((h) => h.id === editingItem.id)?.iconColor : 'text-emerald-600'} className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2">
                  <option value="text-emerald-600">Green</option>
                  <option value="text-blue-600">Blue</option>
                  <option value="text-purple-600">Purple</option>
                  <option value="text-orange-600">Orange</option>
                  <option value="text-zinc-600">Gray</option>
                </select>
                <input name="sortOrder" type="number" min="0" placeholder="Sort order" defaultValue={editingItem?.type === 'highlights' ? highlights.find((h) => h.id === editingItem.id)?.sortOrder ?? 0 : highlights.length + 1} className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2" />
              </div>
              <button className="w-full py-3 bg-emerald-600 text-white font-bold rounded-xl">
                {editingItem?.type === 'highlights' ? 'Update Card' : 'Add Card'}
              </button>
            </form>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {highlights.map((item) => (
                <div key={item.id} className="bg-white border border-zinc-200 p-4 rounded-xl flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    {renderHighlightIcon(item.icon, cn('w-6 h-6', item.iconColor || 'text-emerald-600'))}
                    <div>
                      <h4 className="font-bold text-zinc-900">{item.title}</h4>
                      <p className="text-zinc-500 text-sm">{item.subtitle}</p>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button type="button" onClick={() => setEditingItem({ type: 'highlights', id: item.id })} className="text-emerald-600 hover:text-emerald-700 p-2 hover:bg-emerald-50 rounded-lg transition-colors">
                      <Settings className="w-5 h-5" />
                    </button>
                    <button type="button" onClick={() => handleDelete('highlights', item.id)} className="text-red-500 hover:text-red-600 p-2 hover:bg-red-50 rounded-lg transition-colors">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {activeTab === 'education' && (
          <motion.div
            key="education"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-8"
          >
            {(() => {
              const editingEducation =
                editingItem?.type === 'education' && editingItem.id
                  ? education.find((ed) => ed.id === editingItem.id)
                  : null;
              return (
            <form
              key={editingItem?.type === 'education' ? `education-${editingItem.id}` : 'education-new'}
              onSubmit={(e) => handleSaveItem(e, 'education')}
              className="bg-white border border-zinc-200 shadow-sm rounded-2xl p-8 space-y-5"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-zinc-900">
                  {editingItem?.type === 'education' ? 'Edit Education' : 'Add Education'}
                </h3>
                {editingItem?.type === 'education' && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingItem(null);
                      setEducationCourses([]);
                    }}
                    className="text-sm text-zinc-500 hover:text-zinc-700"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase">Degree / Program</label>
                  <input
                    name="degree"
                    required
                    defaultValue={editingEducation?.degree || ''}
                    placeholder="e.g. Bachelor of Urban and Regional Planning"
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase">Institution</label>
                  <input
                    name="institution"
                    required
                    defaultValue={editingEducation?.institution || ''}
                    placeholder="University or school name"
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-400 uppercase">Start Year</label>
                  <input
                    name="startYear"
                    defaultValue={editingEducation?.startYear || ''}
                    placeholder="e.g. 2014"
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-400 uppercase">End / Graduation Year</label>
                  <input
                    name="endYear"
                    required
                    defaultValue={editingEducation?.endYear || editingEducation?.year || ''}
                    placeholder="e.g. 2019"
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-400 uppercase">GPA / Result</label>
                  <input
                    name="gpa"
                    defaultValue={editingEducation?.gpa || ''}
                    placeholder="e.g. 3.75/4.00 or First Class"
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase">Location</label>
                  <input
                    name="location"
                    defaultValue={editingEducation?.location || ''}
                    placeholder="City, country"
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-400 uppercase">Sort Order</label>
                  <input
                    name="sortOrder"
                    type="number"
                    min="0"
                    defaultValue={editingEducation?.sortOrder ?? education.length + 1}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase">Notes</label>
                  <input
                    name="details"
                    defaultValue={editingEducation?.details || ''}
                    placeholder="Department, major, honors, etc."
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5"
                  />
                </div>
              </div>

              <div className="border-t border-zinc-100 pt-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase">Courses</label>
                  <button
                    type="button"
                    onClick={() => setEducationCourses((prev) => [...prev, emptyEducationCourse()])}
                    className="text-sm font-semibold text-emerald-700 hover:text-emerald-800"
                  >
                    + Add course
                  </button>
                </div>
                {educationCourses.length === 0 && (
                  <p className="text-sm text-zinc-500">No courses yet. Add course rows to show a transcript table on the site.</p>
                )}
                {educationCourses.map((course, courseIndex) => (
                  <div
                    key={courseIndex}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-2 p-3 rounded-xl bg-zinc-50 border border-zinc-100"
                  >
                    <input
                      value={course.courseName}
                      onChange={(e) =>
                        setEducationCourses((prev) =>
                          prev.map((row, i) => (i === courseIndex ? { ...row, courseName: e.target.value } : row))
                        )
                      }
                      placeholder="Course name"
                      className="sm:col-span-5 bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm"
                    />
                    <input
                      value={course.courseCode}
                      onChange={(e) =>
                        setEducationCourses((prev) =>
                          prev.map((row, i) => (i === courseIndex ? { ...row, courseCode: e.target.value } : row))
                        )
                      }
                      placeholder="Code"
                      className="sm:col-span-2 bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm"
                    />
                    <input
                      value={course.creditHours}
                      onChange={(e) =>
                        setEducationCourses((prev) =>
                          prev.map((row, i) => (i === courseIndex ? { ...row, creditHours: e.target.value } : row))
                        )
                      }
                      placeholder="Credits"
                      className="sm:col-span-2 bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm"
                    />
                    <input
                      value={course.grade}
                      onChange={(e) =>
                        setEducationCourses((prev) =>
                          prev.map((row, i) => (i === courseIndex ? { ...row, grade: e.target.value } : row))
                        )
                      }
                      placeholder="Grade"
                      className="sm:col-span-2 bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setEducationCourses((prev) => prev.filter((_, i) => i !== courseIndex))
                      }
                      className="sm:col-span-1 flex items-center justify-center text-red-500 hover:bg-red-50 rounded-lg py-2"
                      aria-label="Remove course"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <button type="submit" disabled={isSaving} className="w-full py-3 bg-emerald-600 text-white font-bold rounded-xl disabled:opacity-50">
                {isSaving ? 'Saving...' : editingItem?.type === 'education' ? 'Update Education' : 'Add Education'}
              </button>
            </form>
              );
            })()}
            <div className="space-y-4">
              {education.map((item) => {
                const courseCount = parseEducationCourses(item.courses).length;
                return (
                <div key={item.id} className="bg-white border border-zinc-200 p-4 rounded-xl flex justify-between items-start gap-4">
                  <div className="min-w-0">
                    <h4 className="font-bold text-zinc-900">{item.degree}</h4>
                    <p className="text-zinc-500 text-sm">
                      {formatEducationPeriod(item) || item.year} · {item.institution}
                    </p>
                    {item.gpa && <p className="text-emerald-700 text-xs font-medium mt-0.5">GPA: {item.gpa}</p>}
                    {item.details && <p className="text-zinc-400 text-xs mt-0.5">{item.details}</p>}
                    {courseCount > 0 && (
                      <p className="text-zinc-400 text-xs mt-1">{courseCount} course{courseCount !== 1 ? 's' : ''} listed</p>
                    )}
                  </div>
                  <div className="flex shrink-0 space-x-2">
                    <button type="button" onClick={() => setEditingItem({ type: 'education', id: item.id })} className="text-emerald-600 hover:text-emerald-700 p-2 hover:bg-emerald-50 rounded-lg transition-colors">
                      <Settings className="w-5 h-5" />
                    </button>
                    <button type="button" onClick={() => handleDelete('education', item.id)} className="text-red-500 hover:text-red-600 p-2 hover:bg-red-50 rounded-lg transition-colors">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              );
              })}
            </div>
          </motion.div>
        )}

        {activeTab === 'experience' && (
          <motion.div
            key="experience"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-8"
          >
            {experienceOrganizations.length > 0 && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-5 py-4">
                <p className="text-zinc-600 text-sm leading-relaxed">
                  <span className="text-2xl font-bold text-zinc-900">
                    {formatExperienceDuration(calculateTotalExperienceMonths(experience))}
                  </span>
                  {' '}total professional experience across{' '}
                  <span className="text-lg font-semibold text-emerald-700">{experienceOrganizations.length}</span>
                  {' '}organizations
                </p>
              </div>
            )}
            <form
              key={
                editingItem?.type === 'experience'
                  ? `exp-edit-${editingItem.id}`
                  : `exp-new-${experienceEntryMode}-${selectedOrganizationGroupId}`
              }
              onSubmit={(e) => handleSaveItem(e, 'experience')}
              className="bg-white border border-zinc-200 shadow-sm rounded-2xl p-8 space-y-4"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-zinc-900">
                  {editingItem?.type === 'experience' ? 'Edit Experience' : 'Add Experience'}
                </h3>
                {editingItem?.type === 'experience' && (
                  <button type="button" onClick={() => setEditingItem(null)} className="text-sm text-zinc-500 hover:text-zinc-700">Cancel Edit</button>
                )}
              </div>

              {!editingItem && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setExperienceEntryMode('new_org');
                      setSelectedOrganizationGroupId('');
                      setMarkAsPromotion(false);
                    }}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-semibold border',
                      experienceEntryMode === 'new_org'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-zinc-600 border-zinc-200'
                    )}
                  >
                    New organization
                  </button>
                  <button
                    type="button"
                    onClick={() => setExperienceEntryMode('existing_org')}
                    disabled={experienceOrganizations.length === 0}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-semibold border disabled:opacity-50',
                      experienceEntryMode === 'existing_org'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-zinc-600 border-zinc-200'
                    )}
                  >
                    New position / promotion at existing organization
                  </button>
                </div>
              )}

              {experienceEntryMode === 'existing_org' && !editingItem && (
                <div className="space-y-3 p-4 rounded-xl bg-zinc-50 border border-zinc-200">
                  <label className="text-xs font-bold text-zinc-500 uppercase">Select organization</label>
                  <select
                    value={selectedOrganizationGroupId}
                    onChange={(e) => setSelectedOrganizationGroupId(e.target.value)}
                    required
                    className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-2 text-sm"
                  >
                    <option value="" disabled>Choose organization</option>
                    {experienceOrganizations.map((org) => (
                      <option key={org.groupId} value={org.groupId}>
                        {org.company} ({org.roles.length} {org.roles.length === 1 ? 'role' : 'roles'})
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 text-sm text-zinc-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={markAsPromotion}
                      onChange={(e) => setMarkAsPromotion(e.target.checked)}
                      className="rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Involved as promotion (show Promotion badge)</span>
                  </label>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {experienceEntryMode === 'existing_org' && selectedExperienceOrg && !editingItem ? (
                  <>
                    <input
                      name="company"
                      value={selectedExperienceOrg.company}
                      readOnly
                      required
                      className="bg-zinc-100 border border-zinc-200 rounded-xl px-4 py-2 md:col-span-2"
                    />
                    <input
                      name="department"
                      placeholder="Department (e.g. GIS and Remote Sensing)"
                      defaultValue={selectedExperienceOrg.department ?? ''}
                      className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2 md:col-span-2"
                    />
                    <input
                      name="location"
                      value={selectedExperienceOrg.location}
                      readOnly
                      required
                      className="bg-zinc-100 border border-zinc-200 rounded-xl px-4 py-2 md:col-span-2"
                    />
                  </>
                ) : (
                  <>
                    <input
                      name="company"
                      placeholder="Company"
                      required
                      defaultValue={editingExperience?.company ?? ''}
                      className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2"
                    />
                    <input
                      name="location"
                      placeholder="Location"
                      required
                      defaultValue={editingExperience?.location ?? ''}
                      className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2"
                    />
                    <input
                      name="department"
                      placeholder="Department (e.g. GIS and Remote Sensing)"
                      defaultValue={editingExperience?.department ?? ''}
                      className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2 md:col-span-2"
                    />
                  </>
                )}
                <input
                  name="position"
                  placeholder="Position (e.g. Senior GIS Analyst)"
                  required
                  defaultValue={editingExperience?.position ?? ''}
                  className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2 md:col-span-2"
                />
              </div>

              <div className="space-y-4 p-4 bg-zinc-50 rounded-xl border border-zinc-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-400 uppercase">Start Date</label>
                    <div className="flex space-x-2">
                      <select 
                        name="startMonth" 
                        value={editDates.startMonth}
                        onChange={e => setEditDates({...editDates, startMonth: e.target.value})}
                        className="flex-1 bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm"
                      >
                        {months.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                      <select 
                        name="startYear" 
                        value={editDates.startYear}
                        onChange={e => setEditDates({...editDates, startYear: parseInt(e.target.value)})}
                        className="flex-1 bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm"
                      >
                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-bold text-zinc-400 uppercase">End Date</label>
                      <label className="flex items-center space-x-2 text-xs font-bold text-emerald-600 cursor-pointer">
                        <input type="checkbox" checked={isPresent} onChange={(e) => setIsPresent(e.target.checked)} className="rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500" />
                        <span>Present</span>
                      </label>
                    </div>
                    {!isPresent && (
                      <div className="flex space-x-2">
                        <select 
                          name="endMonth" 
                          value={editDates.endMonth}
                          onChange={e => setEditDates({...editDates, endMonth: e.target.value})}
                          className="flex-1 bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm"
                        >
                          {months.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <select 
                          name="endYear" 
                          value={editDates.endYear}
                          onChange={e => setEditDates({...editDates, endYear: parseInt(e.target.value)})}
                          className="flex-1 bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm"
                        >
                          {years.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {editingItem?.type === 'experience' && experience.find((e) => e.id === editingItem.id)?.organizationGroupId && (
                <label className="flex items-center gap-2 text-sm text-zinc-700 cursor-pointer">
                  <input
                    type="checkbox"
                    name="isPromotion"
                    value="1"
                    defaultChecked={isPromotionRole(experience.find((e) => e.id === editingItem.id))}
                    className="rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Involved as promotion (show Promotion badge)</span>
                </label>
              )}

              <TextareaWithListTools
                name="description"
                placeholder="Description"
                required
                defaultValue={editingItem?.type === 'experience' ? experience.find(e => e.id === editingItem.id)?.description : ''}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2 h-24"
              />
              <button 
                disabled={isSaving}
                className="w-full py-3 bg-emerald-600 text-white font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {isSaving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                <span>{editingItem?.type === 'experience' ? 'Update Experience' : 'Add Experience'}</span>
              </button>
            </form>
            <div className="space-y-4">
              {experienceOrganizations.map((org) => (
                <div key={org.groupId} className="bg-white border border-zinc-200 rounded-xl p-4 space-y-3">
                  <div className="flex justify-between items-start gap-3 border-b border-zinc-100 pb-3">
                    <div>
                      <h4 className="font-bold text-zinc-900">{org.company}</h4>
                      {org.department && (
                        <p className="text-emerald-700 text-sm font-medium">{org.department}</p>
                      )}
                      <p className="text-zinc-500 text-sm">{org.location}</p>
                      <p className="text-emerald-700 text-xs font-semibold mt-1">
                        {org.roles.length} {org.roles.length === 1 ? 'position' : 'positions'} · {formatExperienceDuration(org.totalMonths)} · {org.totalProjects} projects
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setExperienceEntryMode('existing_org');
                        setSelectedOrganizationGroupId(String(org.groupId));
                        setMarkAsPromotion(false);
                        setEditingItem(null);
                      }}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-emerald-600 text-emerald-700 hover:bg-emerald-50 whitespace-nowrap"
                    >
                      + Add role
                    </button>
                  </div>
                  {org.roles.map((role) => {
                    const involvedCount = countProjectsForExperience(role.id, projects);
                    const organizationYears = calculateExperienceMonths(role);
                    return (
                      <div key={role.id} className="flex justify-between items-center gap-3 pl-2">
                        <div>
                          <p className="font-semibold text-zinc-900">
                            {role.position}
                            {isPromotionRole(role) && (
                              <span className="ml-2 text-[10px] uppercase font-bold text-emerald-700">Promotion</span>
                            )}
                          </p>
                          {role.department && (
                            <p className="text-emerald-600 text-xs font-medium">{role.department}</p>
                          )}
                          <p className="text-zinc-500 text-sm">{role.period}</p>
                          <p className="text-emerald-600 text-xs mt-0.5">
                            {formatExperienceDuration(organizationYears)} · {involvedCount} projects
                          </p>
                        </div>
                        <div className="flex space-x-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setEditingItem({ type: 'experience', id: role.id })}
                            className="text-emerald-600 hover:text-emerald-700 p-2 hover:bg-emerald-50 rounded-lg transition-colors"
                          >
                            <Settings className="w-5 h-5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete('experience', role.id)}
                            className="text-red-500 hover:text-red-600 p-2 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {activeTab === 'projects' && (
          <motion.div
            key="projects"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-8"
          >
            <form
              key={editingItem?.type === 'projects' ? `project-${editingItem.id}` : 'project-new'}
              onSubmit={(e) => handleSaveItem(e, 'projects')}
              className="bg-white border border-zinc-200 shadow-sm rounded-2xl p-8 space-y-4"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-zinc-900">
                  {editingItem?.type === 'projects' ? 'Edit Project' : 'Add New Project'}
                </h3>
                {editingItem?.type === 'projects' && (
                  <button type="button" onClick={() => setEditingItem(null)} className="text-sm text-zinc-500 hover:text-zinc-700">Cancel Edit</button>
                )}
              </div>
              {experience.length === 0 && (
                <p className="text-amber-700 text-sm bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  Add at least one experience entry before creating projects.
                </p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input name="title" placeholder="Project Title" required defaultValue={editingItem?.type === 'projects' ? projects.find(p => p.id === editingItem.id)?.title : ''} className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2" />
                <select
                  name="experienceId"
                  required
                  disabled={experience.length === 0}
                  defaultValue={editingItem?.type === 'projects' ? String(projects.find(p => p.id === editingItem.id)?.experienceId || '') : ''}
                  className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2 disabled:opacity-50"
                >
                  <option value="" disabled>Select organization</option>
                  {experience.map((exp) => (
                    <option key={exp.id} value={exp.id}>{exp.company}</option>
                  ))}
                </select>
                <input name="client" placeholder="Client / Sponsor" required defaultValue={editingItem?.type === 'projects' ? projects.find(p => p.id === editingItem.id)?.client : ''} className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2" />
                <div className="flex space-x-2">
                  <input
                    name="projectStartDate"
                    type="month"
                    defaultValue={editingItem?.type === 'projects' ? projects.find(p => p.id === editingItem.id)?.projectStartDate || '' : ''}
                    className="flex-1 bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2"
                  />
                  <input
                    name="projectEndDate"
                    type="month"
                    defaultValue={editingItem?.type === 'projects' ? projects.find(p => p.id === editingItem.id)?.projectEndDate || '' : ''}
                    className="flex-1 bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2"
                  />
                </div>
                <input name="location" placeholder="Location" required defaultValue={editingItem?.type === 'projects' ? projects.find(p => p.id === editingItem.id)?.location : ''} className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2" />
                <input name="category" placeholder="Category (e.g. Energy)" required defaultValue={editingItem?.type === 'projects' ? projects.find(p => p.id === editingItem.id)?.category : ''} className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2" />
                <label className="flex items-center gap-3 bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2 cursor-pointer">
                  <input
                    type="checkbox"
                    name="isProjectManager"
                    value="1"
                    defaultChecked={
                      editingItem?.type === 'projects'
                        ? isProjectManagerRole(projects.find((p) => p.id === editingItem.id))
                        : false
                    }
                    className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-sm font-medium text-zinc-700">Involved as Project Manager</span>
                </label>
                <div className="md:col-span-2 space-y-3 bg-zinc-55 border border-zinc-200 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-zinc-700 block">Link Skills & Tools to this Project</span>
                    <span className="text-xs font-mono text-zinc-400 bg-white border border-zinc-150 px-2 py-0.5 rounded-full">
                      {selectedProjectSkills.length} selected
                    </span>
                  </div>
                  {skills.length === 0 ? (
                    <p className="text-xs text-zinc-450 italic">No skills defined yet. Add some skills first under the Skills tab.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-1">
                      {skills.map((skill) => {
                        const isSelected = selectedProjectSkills.includes(skill.id);
                        return (
                          <button
                            key={`pj-skill-${skill.id}`}
                            type="button"
                            onClick={() => {
                              setSelectedProjectSkills(prev => 
                                isSelected 
                                  ? prev.filter(id => id !== skill.id) 
                                  : [...prev, skill.id]
                              );
                            }}
                            className={`px-3 py-1.5 text-xs rounded-xl font-medium border transition-all duration-150 flex items-center space-x-1.5 ${
                              isSelected 
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-500 shadow-xs' 
                                : 'bg-white text-zinc-650 border-zinc-200 hover:border-zinc-300'
                            }`}
                          >
                            <span>{skill.name}</span>
                            <span className={`text-[9px] font-mono rounded px-1 ${
                              isSelected ? 'bg-emerald-100 text-emerald-600' : 'bg-zinc-100 text-zinc-400'
                            }`}>
                              {skill.category}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between gap-4 bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2">
                  <label className="flex min-w-0 items-center space-x-2 cursor-pointer text-zinc-500 hover:text-emerald-600 transition-colors">
                    <ImagePlus className="w-5 h-5 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">Upload Project Cover Image</span>
                      <span className="block text-xs text-zinc-400">{IMAGE_UPLOAD_HINTS.projectCover}</span>
                    </span>
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                  </label>
                  {projectImage && (
                    <div className="relative w-10 h-10 rounded-lg overflow-hidden border border-zinc-200">
                      <img src={projectImage} alt="Preview" className="w-full h-full object-cover" />
                      <button 
                        type="button" 
                        onClick={() => setProjectImage(null)}
                        className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  )}
                </div>
                <div className="md:col-span-2 bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 space-y-3">
                  <label className="text-xs font-bold text-zinc-400 uppercase">Builder Theme</label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <label className="flex items-center gap-2 bg-white border border-zinc-200 rounded-lg px-3 py-2 text-xs">Primary <input type="color" value={projectBuilder.colors.primary} onChange={(e) => setProjectBuilder((p) => ({ ...p, colors: { ...p.colors, primary: e.target.value } }))} /></label>
                    <label className="flex items-center gap-2 bg-white border border-zinc-200 rounded-lg px-3 py-2 text-xs">Accent <input type="color" value={projectBuilder.colors.accent} onChange={(e) => setProjectBuilder((p) => ({ ...p, colors: { ...p.colors, accent: e.target.value } }))} /></label>
                    <label className="flex items-center gap-2 bg-white border border-zinc-200 rounded-lg px-3 py-2 text-xs">Surface <input type="color" value={projectBuilder.colors.surface} onChange={(e) => setProjectBuilder((p) => ({ ...p, colors: { ...p.colors, surface: e.target.value } }))} /></label>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setProjectBuilder((p) => ({ ...p, blocks: [...p.blocks, { id: makeBlockId(), type: 'title', content: 'New Title' }] }))} className="text-xs px-3 py-1 rounded bg-emerald-100 text-emerald-700">+ Title</button>
                    <button type="button" onClick={() => setProjectBuilder((p) => ({ ...p, blocks: [...p.blocks, { id: makeBlockId(), type: 'heading', content: 'New Heading' }] }))} className="text-xs px-3 py-1 rounded bg-emerald-100 text-emerald-700">+ Heading</button>
                    <button type="button" onClick={() => setProjectBuilder((p) => ({ ...p, blocks: [...p.blocks, { id: makeBlockId(), type: 'text', content: '' }] }))} className="text-xs px-3 py-1 rounded bg-emerald-100 text-emerald-700">+ Text</button>
                    <button type="button" onClick={() => setProjectBuilder((p) => ({ ...p, blocks: [...p.blocks, { id: makeBlockId(), type: 'photo', url: '', caption: '' }] }))} className="text-xs px-3 py-1 rounded bg-sky-100 text-sky-700">+ Insert Photo In Description</button>
                    <button type="button" onClick={() => setProjectBuilder((p) => ({ ...p, blocks: [...p.blocks, { id: makeBlockId(), type: 'table', table: { width: '900', columns: ['Column 1', 'Column 2'], widths: ['220', '220'], rows: [['', '']] } }] }))} className="text-xs px-3 py-1 rounded bg-sky-100 text-sky-700">+ Table</button>
                  </div>
                </div>
              </div>
              <div className="space-y-3 bg-zinc-50 border border-zinc-200 rounded-xl p-4">
                <label className="text-xs font-bold text-zinc-400 uppercase">Project Content Builder</label>
                <div className="space-y-3">
                  {projectBuilder.blocks.map((block, idx) => (
                    <div key={block.id} className="bg-white border border-zinc-200 rounded-lg p-3 space-y-2">
                      <div className="flex justify-between items-center text-xs text-zinc-500">
                        <span className="uppercase font-semibold">{block.type}</span>
                        <div className="flex gap-1">
                          <button type="button" onClick={() => idx > 0 && setProjectBuilder((p) => { const b=[...p.blocks]; [b[idx-1], b[idx]] = [b[idx], b[idx-1]]; return { ...p, blocks: b }; })} className="px-2 py-1 rounded bg-zinc-100">Up</button>
                          <button type="button" onClick={() => idx < projectBuilder.blocks.length - 1 && setProjectBuilder((p) => { const b=[...p.blocks]; [b[idx+1], b[idx]] = [b[idx], b[idx+1]]; return { ...p, blocks: b }; })} className="px-2 py-1 rounded bg-zinc-100">Down</button>
                          <button type="button" onClick={() => setProjectBuilder((p) => ({ ...p, blocks: p.blocks.filter((x) => x.id !== block.id) }))} className="px-2 py-1 rounded bg-red-100 text-red-600">Delete</button>
                        </div>
                      </div>
                      {(block.type === 'title' || block.type === 'heading' || block.type === 'text') && (
                        <TextareaWithListTools
                          value={block.content}
                          onValueChange={(next) => setProjectBuilder((p) => ({ ...p, blocks: p.blocks.map((x) => x.id === block.id ? { ...x, content: next } as ProjectBlock : x) }))}
                          rows={block.type === 'text' ? 4 : 2}
                          className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm"
                        />
                      )}
                      {block.type === 'photo' && (
                        <div className="space-y-2">
                          <p className="text-xs text-zinc-500">
                            This photo is inserted in the project description flow, not the main thumbnail. {IMAGE_UPLOAD_HINTS.projectDescription}
                          </p>
                          <label className="inline-flex items-center gap-2 cursor-pointer text-zinc-600 hover:text-emerald-700">
                            <ImagePlus className="w-4 h-4" />
                            <span>Upload Description Photo</span>
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (!f) return;
                              const reader = new FileReader();
                              reader.onloadend = () => setProjectBuilder((p) => ({ ...p, blocks: p.blocks.map((x) => x.id === block.id ? { ...x, url: reader.result as string } as ProjectBlock : x) }));
                              reader.readAsDataURL(f);
                            }} />
                          </label>
                          {block.url && <img src={block.url} alt="block" className="h-24 w-full object-cover rounded border border-zinc-200" />}
                          <input value={block.caption} onChange={(e) => setProjectBuilder((p) => ({ ...p, blocks: p.blocks.map((x) => x.id === block.id ? { ...x, caption: e.target.value } as ProjectBlock : x) }))} placeholder="Caption" className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm" />
                        </div>
                      )}
                      {block.type === 'table' && (
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <button type="button" className="text-xs px-2 py-1 rounded bg-sky-100 text-sky-700" onClick={() => setProjectBuilder((p) => ({ ...p, blocks: p.blocks.map((x) => x.id === block.id ? { ...x, table: { width: x.table.width || '900', columns: [...x.table.columns, `Column ${x.table.columns.length + 1}`], widths: [...(x.table.widths || x.table.columns.map(() => '220')), '220'], rows: x.table.rows.map((r) => [...r, '']) } } as ProjectBlock : x) }))}>Add Column</button>
                            <button type="button" className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700" onClick={() => setProjectBuilder((p) => ({ ...p, blocks: p.blocks.map((x) => x.id === block.id ? { ...x, table: { ...x.table, rows: [...x.table.rows, new Array(x.table.columns.length).fill('')] } } as ProjectBlock : x) }))}>Add Row</button>
                            <button
                              type="button"
                              className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 disabled:opacity-50"
                              disabled={block.table.columns.length <= 1}
                              onClick={() => setProjectBuilder((p) => ({
                                ...p,
                                blocks: p.blocks.map((x) => x.id === block.id ? {
                                  ...x,
                                  table: {
                                    ...x.table,
                                    columns: x.table.columns.slice(0, -1),
                                    widths: (x.table.widths || x.table.columns.map(() => '220')).slice(0, -1),
                                    rows: x.table.rows.map((r) => r.slice(0, -1)),
                                  },
                                } as ProjectBlock : x),
                              }))}
                            >
                              Delete Column
                            </button>
                            <button
                              type="button"
                              className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 disabled:opacity-50"
                              disabled={block.table.rows.length <= 1}
                              onClick={() => setProjectBuilder((p) => ({
                                ...p,
                                blocks: p.blocks.map((x) => x.id === block.id ? {
                                  ...x,
                                  table: {
                                    ...x.table,
                                    rows: x.table.rows.slice(0, -1),
                                  },
                                } as ProjectBlock : x),
                              }))}
                            >
                              Delete Row
                            </button>
                          </div>
                          <p className="text-[11px] text-zinc-500">Drag table right edge to resize full table. Drag each column right edge to resize that column.</p>
                          <div className="relative overflow-x-auto border border-zinc-200 rounded-lg bg-white p-2">
                            <table className="text-xs border-collapse" style={{ width: `${Number(block.table.width || 900)}px`, minWidth: '420px' }}>
                              <colgroup>
                                {block.table.columns.map((_, idx) => (
                                  <col key={`${block.id}-admin-col-${idx}`} style={{ width: `${Number(block.table.widths?.[idx] || 220)}px` }} />
                                ))}
                              </colgroup>
                              <thead>
                                <tr>
                                  {block.table.columns.map((col, colIdx) => (
                                    <th key={`${block.id}-h-${colIdx}`} className="relative border border-zinc-300 bg-zinc-50 p-1 text-left align-top">
                                      <div className="pr-2">
                                        <input
                                          value={col}
                                          onChange={(e) => setProjectBuilder((p) => ({ ...p, blocks: p.blocks.map((x) => x.id === block.id ? { ...x, table: { ...x.table, columns: x.table.columns.map((c, i) => i === colIdx ? e.target.value : c) } } as ProjectBlock : x) }))}
                                          className="w-full bg-white border border-zinc-200 rounded px-1 py-0.5 text-[11px]"
                                        />
                                      </div>
                                      <button
                                        type="button"
                                        onMouseDown={(e) => {
                                          e.preventDefault();
                                          setColumnResizeState({ blockId: block.id, colIdx, startX: e.clientX, startWidth: Number(block.table.widths?.[colIdx] || 220) });
                                        }}
                                        className="absolute top-0 right-[-3px] w-1.5 h-full cursor-col-resize bg-transparent hover:bg-emerald-400/60"
                                        title="Drag column border"
                                      />
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {block.table.rows.map((row, rowIdx) => (
                                  <tr key={`${block.id}-preview-r-${rowIdx}`}>
                                    {block.table.columns.map((_, colIdx) => (
                                      <td key={`${block.id}-preview-c-${rowIdx}-${colIdx}`} className="border border-zinc-200 p-1">
                                        <input
                                          value={row[colIdx] || ''}
                                          onChange={(e) => setProjectBuilder((p) => ({ ...p, blocks: p.blocks.map((x) => x.id === block.id ? { ...x, table: { ...x.table, rows: x.table.rows.map((r, ri) => ri === rowIdx ? r.map((c, ci) => ci === colIdx ? e.target.value : c) : r) } } as ProjectBlock : x) }))}
                                          className="w-full bg-white border border-zinc-200 rounded px-1 py-0.5 text-[11px]"
                                        />
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <button
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setTableResizeState({
                                  blockId: block.id,
                                  startX: e.clientX,
                                  startWidth: Number(block.table.width || 900),
                                });
                              }}
                              className="absolute top-2 bottom-2 w-2 cursor-ew-resize bg-transparent hover:bg-blue-400/40"
                              style={{ left: `${Math.max(0, Number(block.table.width || 900) + 8)}px` }}
                              title="Drag to resize full table width"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <button 
                disabled={isSaving}
                className="w-full py-3 bg-emerald-600 text-white font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {isSaving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                <span>{editingItem?.type === 'projects' ? 'Update Project' : 'Add Project'}</span>
              </button>
            </form>

            <div className="bg-white border border-zinc-200 rounded-2xl p-4 space-y-3">
              <h4 className="text-sm font-bold text-zinc-900">Filter saved projects</h4>
              <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input
                    type="search"
                    value={projectListSearch}
                    onChange={(e) => setProjectListSearch(e.target.value)}
                    placeholder="Search projects..."
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                  />
                </div>
                <select
                  value={projectListCategory}
                  onChange={(e) => setProjectListCategory(e.target.value)}
                  className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2 text-sm md:min-w-[200px]"
                >
                  <option value="all">All categories</option>
                  {projectCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
                {(projectListSearch || projectListCategory !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setProjectListSearch('');
                      setProjectListCategory('all');
                    }}
                    className="px-4 py-2 text-sm font-semibold rounded-xl border border-zinc-200 text-zinc-600 hover:bg-zinc-50 whitespace-nowrap"
                  >
                    Clear
                  </button>
                )}
              </div>
              <p className="text-xs text-zinc-500">
                Showing {filteredAdminProjects.length} of {projects.length} projects
              </p>
            </div>

            {filteredAdminProjects.length === 0 ? (
              <div className="text-center py-10 bg-white border border-zinc-200 rounded-2xl text-zinc-500 text-sm">
                No projects match your filters.
              </div>
            ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredAdminProjects.map(proj => (
                <div key={proj.id} className="bg-white border border-zinc-200 p-4 rounded-xl flex justify-between items-center">
                  <div className="flex items-center space-x-4">
                    {proj.image ? (
                      <div className="w-12 h-12 rounded-lg overflow-hidden border border-zinc-100">
                        <img src={proj.image} alt={proj.title} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-zinc-100 flex items-center justify-center border border-zinc-100">
                        <ImagePlus className="w-5 h-5 text-zinc-400" />
                      </div>
                    )}
                    <div>
                      <h4 className="font-bold text-zinc-900">{proj.title}</h4>
                      <p className="text-zinc-500 text-sm">{proj.client}</p>
                      <p className="text-emerald-600 text-xs mt-0.5">{getExperienceCompany(proj.experienceId, experience) || 'No organization linked'}</p>
                      {isProjectManagerRole(proj) && (
                        <p className="text-emerald-700 text-xs font-semibold mt-0.5">Involved as Project Manager</p>
                      )}
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button 
                      onClick={() => setEditingItem({ type: 'projects', id: proj.id })}
                      className="text-emerald-600 hover:text-emerald-700 p-2 hover:bg-emerald-50 rounded-lg transition-colors"
                    >
                      <Settings className="w-5 h-5" />
                    </button>
                    <button 
                      type="button"
                      onClick={() => handleDelete('projects', proj.id)} 
                      className="text-red-500 hover:text-red-600 p-2 hover:bg-red-50 rounded-lg transition-colors z-10"
                      title="Delete"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            )}
          </motion.div>
        )}

        {activeTab === 'skills' && (
          <motion.div
            key="skills"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-8"
          >
            <form onSubmit={(e) => handleSaveItem(e, 'skills')} className="bg-white border border-zinc-200 shadow-sm rounded-2xl p-8 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-zinc-900">
                  {editingItem?.type === 'skills' ? 'Edit Skill' : 'Add New Skill'}
                </h3>
                {editingItem?.type === 'skills' && (
                  <button type="button" onClick={() => setEditingItem(null)} className="text-sm text-zinc-500 hover:text-zinc-700">Cancel Edit</button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input name="name" placeholder="Skill Name" required defaultValue={editingItem?.type === 'skills' ? skills.find(s => s.id === editingItem.id)?.name : ''} className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2" />
                <input name="category" placeholder="Category" required defaultValue={editingItem?.type === 'skills' ? skills.find(s => s.id === editingItem.id)?.category : ''} className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2" />
                <input name="level" type="number" min="0" max="100" placeholder="Level (0-100)" required defaultValue={editingItem?.type === 'skills' ? skills.find(s => s.id === editingItem.id)?.level : ''} className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2" />
              </div>
              <button className="w-full py-3 bg-emerald-600 text-white font-bold rounded-xl">
                {editingItem?.type === 'skills' ? 'Update Skill' : 'Add Skill'}
              </button>
            </form>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {skills.map(skill => (
                <div key={skill.id} className="bg-white border border-zinc-200 p-4 rounded-xl flex justify-between items-center">
                  <div>
                    <h4 className="font-bold text-zinc-900">{skill.name}</h4>
                    <p className="text-zinc-500 text-sm">{skill.category} - {skill.level}%</p>
                  </div>
                  <div className="flex space-x-2">
                    <button 
                      onClick={() => setEditingItem({ type: 'skills', id: skill.id })}
                      className="text-emerald-600 hover:text-emerald-700 p-2 hover:bg-emerald-50 rounded-lg transition-colors"
                    >
                      <Settings className="w-5 h-5" />
                    </button>
                    <button 
                      type="button"
                      onClick={() => handleDelete('skills', skill.id)} 
                      className="text-red-500 hover:text-red-600 p-2 hover:bg-red-50 rounded-lg transition-colors z-10"
                      title="Delete"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {activeTab === 'security' && (
          <motion.div
            key="security"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <form onSubmit={handleChangePassword} className="space-y-6 bg-white border border-zinc-200 shadow-sm rounded-2xl p-8">
              <h3 className="text-lg font-bold text-zinc-900">Change Superuser Password</h3>
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase">Current Password</label>
                <input
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                  required
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 focus:border-emerald-600 outline-none transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase">New Password</label>
                <input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  minLength={8}
                  required
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 focus:border-emerald-600 outline-none transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-400 uppercase">Confirm New Password</label>
                <input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                  minLength={8}
                  required
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 focus:border-emerald-600 outline-none transition-all"
                />
              </div>
              <button
                type="submit"
                disabled={isChangingPassword}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-70 text-white font-bold rounded-xl transition-all"
              >
                {isChangingPassword ? 'Updating Password...' : 'Update Password'}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const LandingPage = () => {
  return (
    <>
      <section id="home" className="scroll-mt-20">
        <Home />
      </section>
      <section id="about" className="scroll-mt-20 -mt-4">
        <AboutMe />
      </section>
      <section id="education" className="scroll-mt-20 -mt-4">
        <EducationSection />
      </section>
      <section id="experience" className="scroll-mt-20 -mt-4">
        <Experience />
      </section>
      <section id="projects" className="scroll-mt-20 -mt-4">
        <Projects />
      </section>
      <section id="skills" className="scroll-mt-20 -mt-4">
        <Skills />
      </section>
    </>
  );
};

export default function App() {
  return (
    <Router>
      <div className="min-h-screen bg-zinc-50 text-zinc-600 font-sans selection:bg-emerald-100 selection:text-emerald-700">
        <Navbar />
        <main>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/about" element={<LandingPage />} />
            <Route path="/education" element={<LandingPage />} />
            <Route path="/experience" element={<LandingPage />} />
            <Route path="/projects" element={<LandingPage />} />
            <Route path="/skills" element={<LandingPage />} />
            <Route path="/project/:id" element={<ProjectDetail />} />
            <Route path={SECRET_LOGIN_PATH} element={<AdminLogin />} />
            <Route path={SECRET_ADMIN_PATH} element={<Admin />} />
          </Routes>
        </main>
        
        <footer className="border-t border-zinc-200 py-3 mt-8 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-row items-center justify-between gap-4 min-h-0">
            <div className="flex items-center space-x-2 shrink-0">
              <div className="w-5 h-5 bg-emerald-600 rounded flex items-center justify-center shrink-0">
                <MapIcon className="text-white w-3 h-3" />
              </div>
              <span className="text-zinc-900 font-bold text-sm tracking-tight whitespace-nowrap">Bipul Kumar Paul</span>
            </div>
            <p className="text-zinc-400 text-xs whitespace-nowrap shrink-0">
              © {new Date().getFullYear()} All Rights Reserved to Bipul Kumar Paul.
            </p>
          </div>
        </footer>
      </div>
    </Router>
  );
}
