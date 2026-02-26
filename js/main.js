// ==============================================================
// 1. IMPORTS DES CORE & MODULES MÉTIERS
// ==============================================================
import { AppState } from "./core/state.js";
import { SIRH_CONFIG } from "./core/config.js";
import { PremiumUI } from "./core/utils.js";

import * as Auth from "./modules/auth.js";
import * as UI from "./modules/ui.js";
import * as Dash from "./modules/dashboard.js";
import * as HR from "./modules/hr.js";
import * as Leaves from "./modules/leaves.js";
import * as Payroll from "./modules/payroll.js";
import * as Ops from "./modules/ops.js";
import * as Chat from "./modules/chat.js";
import * as Admin from "./modules/admin.js";

// ==============================================================
// 2. ATTACHEMENT À WINDOW (OBLIGATOIRE POUR LES ONCLICK DU HTML)
// ==============================================================

// --- Authentification ---
window.handleLogin = Auth.handleLogin;
window.handleLogout = Auth.handleLogout;
window.handleForgotPassword = Auth.handleForgotPassword;

// --- Interface Utilisateur (UI) ---
window.switchView = UI.switchView;
window.toggleSidebar = UI.toggleSidebar;
window.toggleDarkMode = UI.toggleDarkMode;
window.toggleWidget = UI.toggleWidget;
window.toggleSensitiveData = UI.toggleSensitiveData;
window.refreshAllData = UI.refreshAllData;
window.viewDocument = UI.viewDocument;
window.toggleAccordion = UI.toggleAccordion;
window.applyModulesUI = UI.applyModulesUI;
window.applyPermissionsUI = UI.applyPermissionsUI;
window.applyWidgetPreferences = UI.applyWidgetPreferences;
window.requestNotificationPermission = UI.requestNotificationPermission;
window.applyBranding = UI.applyBranding;
window.initDarkMode = UI.initDarkMode;

// --- Ressources Humaines (HR) ---
window.fetchData = HR.fetchData;
window.filterTable = HR.filterTable;
window.applySmartFilter = HR.applySmartFilter;
window.setEmployeeFilter = HR.setEmployeeFilter;
window.changePage = HR.changePage;
window.loadMyProfile = HR.loadMyProfile;
window.saveMyProfile = HR.saveMyProfile;
window.toggleEditMode = HR.toggleEditMode;
window.triggerPhotoUpload = HR.triggerPhotoUpload;
window.previewPhoto = HR.previewPhoto;
window.openFullFolder = HR.openFullFolder;
window.closeFolderModal = HR.closeFolderModal;
window.openDocCamera = HR.openDocCamera;
window.startGenericCamera = HR.startGenericCamera;
window.previewDocFile = HR.previewDocFile;
window.updateSingleDoc = HR.updateSingleDoc;
window.handleOnboarding = HR.handleOnboarding;
window.moveStep = HR.moveStep;
window.openEditModal = HR.openEditModal;
window.closeEditModal = HR.closeEditModal;
window.submitUpdate = HR.submitUpdate;
window.deleteEmployee = HR.deleteEmployee;
window.generateDraftContract = HR.generateDraftContract;
window.openContractModal = HR.openContractModal;
window.closeContractModal = HR.closeContractModal;
window.submitSignedContract = HR.submitSignedContract;
window.triggerManualContractUpload = HR.triggerManualContractUpload;
window.toggleContractFieldsVisibility = HR.toggleContractFieldsVisibility;
window.clearSignature = HR.clearSignature;
window.downloadMyBadge = HR.downloadMyBadge;
window.printBadge = HR.printBadge;
window.fetchCandidates = HR.fetchCandidates;
window.showCandidateDocs = HR.showCandidateDocs;
window.handleCandidateAction = HR.handleCandidateAction;
window.copyFormLink = HR.copyFormLink;
window.openFormEditor = HR.openFormEditor;
window.openBulkManagerModal = HR.openBulkManagerModal;
window.toggleBulkActions = HR.toggleBulkActions;
window.exportToCSV = HR.exportToCSV;
window.fetchAndPopulateDepartments = HR.fetchAndPopulateDepartments;
window.syncAllRoleSelects = HR.syncAllRoleSelects;
window.fetchContractTemplatesForSelection =
  HR.fetchContractTemplatesForSelection;
window.populateManagerSelects = HR.populateManagerSelects;
window.fetchMyActivityRecap = HR.fetchMyActivityRecap;

// --- Congés & Absences (Leaves) ---
window.openLeaveModal = Leaves.openLeaveModal;
window.submitLeaveRequest = Leaves.submitLeaveRequest;
window.showLeaveDetail = Leaves.showLeaveDetail;
window.processLeave = Leaves.processLeave;

// --- Comptabilité & Paie (Payroll) ---
window.loadAccountingView = Payroll.loadAccountingView;
window.calculateRow = Payroll.calculateRow;
window.generateAllPay = Payroll.generateAllPay;
window.exportPayrollTemplate = Payroll.exportPayrollTemplate;
window.triggerPayrollImport = Payroll.triggerPayrollImport;
window.handlePayrollImport = Payroll.handlePayrollImport;
window.resetAccountingFilters = Payroll.resetAccountingFilters;
window.filterAccountingTableLocally = Payroll.filterAccountingTableLocally;

// --- Dash
window.updateManagementSignals = Dash.updateManagementSignals;
window.renderCharts = Dash.renderCharts;
window.fetchLiveAttendance = Dash.fetchLiveAttendance;

// --- Opérations & Mobile (Ops) ---
window.syncClockInterface = Ops.syncClockInterface;
window.renderPerformanceTable = Ops.renderPerformanceTable;
window.handleClockInOut = Ops.handleClockInOut;
window.openAddLocationModal = Ops.openAddLocationModal;
window.deleteMobileLocation = Ops.deleteMobileLocation;
window.changeViewMode = Ops.changeViewMode;
window.openAddScheduleModal = Ops.openAddScheduleModal;
window.startMissionFromAgenda = Ops.startMissionFromAgenda;
window.deleteSchedule = Ops.deleteSchedule;
window.openAddPrescripteurModal = Ops.openAddPrescripteurModal;
window.openEditPrescripteurModal = Ops.openEditPrescripteurModal;
window.deletePrescripteur = Ops.deletePrescripteur;
window.filterPrescripteursLocally = Ops.filterPrescripteursLocally;
window.fetchPrescripteursManagement = Ops.fetchPrescripteursManagement;
window.fetchMobileLocations = Ops.fetchMobileLocations;
window.changeReportTab = Ops.changeReportTab;
window.setReportView = Ops.setReportView;
window.handleReportSearch = Ops.handleReportSearch;
window.openDailyReportModal = Ops.openDailyReportModal;
window.toggleDictation = Ops.toggleDictation;
window.deleteVisitReport = Ops.deleteVisitReport;
window.deleteDailyReport = Ops.deleteDailyReport;
window.peakText = Ops.peakText;
window.unpeakText = Ops.unpeakText;
window.toggleTextFixed = Ops.toggleTextFixed;
window.startScanner = Ops.startScanner;
window.fetchMobileReports = Ops.fetchMobileReports;
window.openAttendancePicker = Ops.openAttendancePicker;
window.fetchAttendanceReport = Ops.fetchAttendanceReport;
window.renderPersonalReport = Ops.renderPersonalReport;
window.downloadReportCSV = Ops.downloadReportCSV;

// --- Communication (Chat) ---
window.fetchMessages = Chat.fetchMessages;
window.sendMessage = Chat.sendMessage;
window.cancelFile = Chat.cancelFile;
window.initChatRealtime = Chat.initChatRealtime;

// --- Administration & Configuration ---
window.openAddZoneModal = Admin.openAddZoneModal;
window.deleteZone = Admin.deleteZone;
window.useCurrentLocation = Admin.useCurrentLocation;
window.openSaveProductModal = Admin.openSaveProductModal;
window.viewProductDetail = Admin.viewProductDetail;
window.filterProductsLocally = Admin.filterProductsLocally;
window.deleteProduct = Admin.deleteProduct;
window.openEditProductModal = Admin.openEditProductModal;
window.openAddTemplateModal = Admin.openAddTemplateModal;
window.deleteTemplate = Admin.deleteTemplate;
window.submitFlashMessage = Admin.submitFlashMessage;
window.openFlashModal = Admin.openFlashModal;
window.closeFlashBanner = Admin.closeFlashBanner;
window.closeSpecificFlash = Admin.closeSpecificFlash;
window.runArchivingJob = Admin.runArchivingJob;
window.triggerCSVImport = Admin.triggerCSVImport;
window.downloadLocationsTemplate = Admin.downloadLocationsTemplate;
window.exportLocations = Admin.exportLocations;
window.handleCSVFile = Admin.handleCSVFile;
window.downloadPrescripteursTemplate = Admin.downloadPrescripteursTemplate;
window.exportPrescripteurs = Admin.exportPrescripteurs;
window.handlePrescripteursCSV = Admin.handlePrescripteursCSV;
window.triggerZonesCSVImport = Admin.triggerZonesCSVImport;
window.downloadZonesTemplate = Admin.downloadZonesTemplate;
window.exportZones = Admin.exportZones;
window.handleZonesCSVFile = Admin.handleZonesCSVFile;
window.exportAuditToExcel = Admin.exportAuditToExcel;
window.fetchLogs = Admin.fetchLogs;
window.fetchCompanyConfig = Admin.fetchCompanyConfig;
window.fetchProducts = Admin.fetchProducts;
window.fetchZones = Admin.fetchZones;
window.fetchTemplates = Admin.fetchTemplates;
window.fetchFlashMessage = Admin.fetchFlashMessage;
window.triggerRobotCheck = Admin.triggerRobotCheck;
window.fetchGlobalAudit = Admin.fetchGlobalAudit;

// --- Divers / Utilitaires ---
window.closeEditor = () => {
  const editor = document.getElementById("editor-modal");
  if (editor) editor.classList.add("hidden");
};
// ==============================================================
// 3. LOGIQUE D'INITIALISATION DE L'APPLICATION
// ==============================================================
window.addEventListener("DOMContentLoaded", () => {
  UI.applyBranding();
  UI.initDarkMode();

  document.getElementById("current-date").innerText =
    new Date().toLocaleDateString("fr-FR");

  // Restauration de session
  const session = localStorage.getItem("sirh_user_session");
  const loader = document.getElementById("initial-loader");

  if (session) {
    try {
      const u = JSON.parse(session);
      if (u && u.nom) {
        console.log("Restauration session : " + u.nom);
        Auth.setSession(u.nom, u.role, u.id, u.permissions, u.employee_type);
      } else {
        throw new Error("Session invalide");
      }
    } catch (e) {
      localStorage.removeItem("sirh_user_session");
      if (loader) loader.classList.add("hidden");
    }
  } else {
    if (loader) loader.classList.add("hidden");
  }
});

// ==============================================================
// 4. ÉCOUTEURS D'ÉVÉNEMENTS GLOBAUX
// ==============================================================

// --- Gestion du Pull-to-refresh (Mobile) ---
let touchStart = 0;
document.addEventListener(
  "touchstart",
  (e) => (touchStart = e.touches[0].pageY),
  { passive: true },
);
document.addEventListener("touchend", (e) => {
  const touchEnd = e.changedTouches[0].pageY;
  if (window.scrollY === 0 && touchEnd > touchStart + 150) {
    if (typeof PremiumUI !== "undefined") PremiumUI.vibrate("click");
    UI.refreshAllData(true);
  }
});

// --- Gestion du Réseau (Online/Offline) ---
window.addEventListener("online", () => {
  Swal.close();
  Swal.fire({
    icon: "success",
    title: "Connexion Rétablie",
    text: "Vous êtes de nouveau en ligne.",
    toast: true,
    position: "top-end",
    timer: 3000,
    showConfirmButton: false,
  });
  document.body.classList.remove("offline-mode");
  Ops.syncOfflineData();
  if (AppState.currentUser) UI.refreshAllData();
});

window.addEventListener("offline", () => {
  Swal.fire({
    icon: "warning",
    title: "Connexion Perdue",
    text: "Mode hors ligne activé.",
    toast: true,
    position: "top-end",
    showConfirmButton: false,
  });
  document.body.classList.add("offline-mode");
});

// --- Gestion de l'Installation PWA ---
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  AppState.deferredPrompt = e;
  const installBtn = document.getElementById("install-button");
  if (installBtn) {
    installBtn.classList.remove("hidden");
    installBtn.onclick = async () => {
      if (AppState.deferredPrompt) {
        AppState.deferredPrompt.prompt();
        const { outcome } = await AppState.deferredPrompt.userChoice;
        console.log("PWA Choice:", outcome);
        installBtn.classList.add("hidden");
        AppState.deferredPrompt = null;
      }
    };
  }
});

window.addEventListener("appinstalled", () => {
  console.log("Application installée");
  const installBtn = document.getElementById("install-button");
  if (installBtn) installBtn.classList.add("hidden");
});

// --- Inactivité & Sécurité ---
["mousedown", "mousemove", "keypress", "scroll", "touchstart"].forEach(
  (evt) => {
    document.addEventListener(evt, Auth.resetInactivityTimer, {
      passive: true,
    });
  },
);

// --- Enregistrement du Service Worker ---
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => console.log("SW enregistré"))
      .catch((err) => console.log("Erreur SW", err));
  });
}
