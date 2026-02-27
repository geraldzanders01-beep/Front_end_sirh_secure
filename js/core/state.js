export const AppState = {
  // --- Identité & Session ---
  currentUser: null,
  inactivityTimer: null,
  deferredPrompt: null, // Pour l'installation PWA

  // --- Données Globales ---
  employees: [],
  allLeaves: [],
  myPayrolls: [],
  allPrescripteurs: [],
  allProductsData: [],
  activeRolesList: [],
  activeDepartmentsList: [],

  // --- Navigation & Vues ---
  currentView: "dash",
  currentPage: 1, // Pagination HR
  logsPage: 1,
  logsTotalPages: 1,
  reportPage: 1,
  reportTotalPages: 1,

  // --- Filtrage & Recherche ---
  currentFilter: "all",
  currentStatusFilter: "all",
  searchTimeout: null,
  activeFilters: {
    search: "",
    status: "all",
    type: "all",
    dept: "all",
    role: "all",
  },

  // --- Gestion des Médias & Documents ---
  docBlobs: {
    id_card: null,
    cv: null,
    diploma: null,
    attestation: null,
    leave_justif: null,
  },
  capturedBlob: null,
  videoStream: null,
  contractBlob: null,
  contractStream: null,
  proofStream: null,
  proofBlob: null, // Ajouté pour Ops.js

  // --- Instances de Librairies (Signatures / Graphiques) ---
  signaturePad: null,
  visitSignPad: null,
  chartStatusInstance: null,
  chartDeptInstance: null,

  // --- Logique Métier Pointage (Ops.js) ---
  // Ajout de ces clés pour éviter les erreurs lors du CLOCK_OUT
  formResult: null,
  outcome: null,
  report: null,
  isLastExit: false,
  prescripteur_id: null,
  contact_nom_libre: null,
  presentedProducts: [],

  // --- Rapports & Audit ---
  currentReportTab: "visits",
  reportViewMode: "list",
  currentReportData: [],
  lastAuditData: [],
  currentPerformanceData: [], // Ajouté pour la synthèse manager (Ops.js)

  // --- Paramètres & Config ---
  companyConfig: {
    latitude: null,
    longitude: null,
    radius: 100,
    geo_required: false,
  },
  payrollConstants: {},
  lastFetchTimes: {
    global: 0,
    employees: 0,
    leaves: 0,
    candidates: 0,
    payroll: 0,
    flash: 0,
  },

  // --- Recrutement & Onboarding ---
  currentWizardStep: 1,
  currentEditingOriginal: null,

  // --- Communication & Realtime ---
  chatPolling: null,
  chatSubscription: null,
  recognition: null, // Pour la dictée vocale

  // --- Pagination technique ---
  offsetSuivant: null,
};
