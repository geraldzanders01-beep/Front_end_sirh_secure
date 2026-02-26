export const SIRH_CONFIG = {
  company: {
    name: "SIRH-SECURE",
    logo: "https://cdn-icons-png.flaticon.com/128/13594/13594876.png",
    supportEmail: "rh@entreprise.com",
  },
  theme: {
    primary: "#0f172a",
    accent: "#2563eb",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    baseFontSize: "16px",
  },
  gps: { enabled: true, strictMode: true, offices: [] },
  features: { recruitment: true, payroll: true, auditLogs: true },
  apiBaseUrl: "https://sirh-secure.onrender.com/api",
};

export const URL_LOGIN = `${SIRH_CONFIG.apiBaseUrl}/login`;
export const URL_READ = `${SIRH_CONFIG.apiBaseUrl}/read`;
export const URL_WRITE_POST = `${SIRH_CONFIG.apiBaseUrl}/write`;
export const URL_UPDATE = `${SIRH_CONFIG.apiBaseUrl}/update`;
export const URL_READ_LOGS = `${SIRH_CONFIG.apiBaseUrl}/read-logs`;
export const URL_GATEKEEPER = `${SIRH_CONFIG.apiBaseUrl}/gatekeeper`;
export const URL_BADGE_GEN = `${SIRH_CONFIG.apiBaseUrl}/badge`;
export const URL_EMPLOYEE_UPDATE = `${SIRH_CONFIG.apiBaseUrl}/emp-update`;
export const URL_CONTRACT_GENERATE = `${SIRH_CONFIG.apiBaseUrl}/contract-gen`;
export const URL_UPLOAD_SIGNED_CONTRACT = `${SIRH_CONFIG.apiBaseUrl}/contract-upload`;
export const URL_LEAVE_REQUEST = `${SIRH_CONFIG.apiBaseUrl}/leave`;
export const URL_CLOCK_ACTION = `${SIRH_CONFIG.apiBaseUrl}/clock`;
export const URL_READ_LEAVES = `${SIRH_CONFIG.apiBaseUrl}/read-leaves`;
export const URL_LEAVE_ACTION = `${SIRH_CONFIG.apiBaseUrl}/leave-action`;
export const URL_READ_CANDIDATES = `${SIRH_CONFIG.apiBaseUrl}/read-candidates`;
export const URL_CANDIDATE_ACTION = `${SIRH_CONFIG.apiBaseUrl}/candidate-action`;
export const URL_READ_PAYROLL = `${SIRH_CONFIG.apiBaseUrl}/read-payroll`;
export const URL_READ_FLASH = `${SIRH_CONFIG.apiBaseUrl}/read-flash`;
export const URL_WRITE_FLASH = `${SIRH_CONFIG.apiBaseUrl}/write-flash`;
export const URL_READ_REPORT = `${SIRH_CONFIG.apiBaseUrl}/read-report`;
export const URL_GET_CONFIG = `${SIRH_CONFIG.apiBaseUrl}/read-config`;
export const URL_READ_PAYROLL_FULL = `${SIRH_CONFIG.apiBaseUrl}/read-payroll-full`;
export const URL_READ_CONFIG_SALARIES = `${SIRH_CONFIG.apiBaseUrl}/read-config-salaries`;
export const URL_LIST_PRODUCTS = `${SIRH_CONFIG.apiBaseUrl}/list-products`;
export const URL_SAVE_PRODUCT = `${SIRH_CONFIG.apiBaseUrl}/save-product`;
export const URL_LIST_PRESCripteurs = `${SIRH_CONFIG.apiBaseUrl}/list-prescripteurs`;
export const URL_ADD_SCHEDULE = `${SIRH_CONFIG.apiBaseUrl}/add-schedule`;
export const URL_LIST_SCHEDULES = `${SIRH_CONFIG.apiBaseUrl}/list-schedules`;
export const URL_LIST_MOBILE_LOCATIONS = `${SIRH_CONFIG.apiBaseUrl}/list-mobile-locations`;

export const SCAN_KEY = "SIGD_SECURE_2025";
export const URL_REDIRECT_FAILURE = "https://google.com";
export const REFRESH_THRESHOLD = 300000;
export const ITEMS_PER_PAGE = 10;

export const NOTIF_SOUND = new Audio(
  "https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3",
);

export const AIRTABLE_FORM_PUBLIC_LINK =
  "https://dom4002.github.io/recrutement_page/?shared=1&hdob=0&hlm=0&hdip=0&hid=0";
export const AIRTABLE_FORM_EDIT_LINK =
  "https://dom4002.github.io/recrutement_page/";

// Initialisation de Supabase
export const supabaseUrl = "https://wdfuqsqssapcrzhjsels.supabase.co";
export const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkZnVxc3Fzc2FwY3J6aGpzZWxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwMjQ3MDksImV4cCI6MjA4NTYwMDcwOX0.G8i83W0ZcdEd9Bnp3T8rbGjlBxRcpgFdwG5k_LPd0po";
export const supabaseClient = window.supabase.createClient(
  supabaseUrl,
  supabaseKey,
);
