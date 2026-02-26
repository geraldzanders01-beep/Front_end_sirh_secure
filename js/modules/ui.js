import { AppState } from "../core/state.js";
import { SIRH_CONFIG, REFRESH_THRESHOLD } from "../core/config.js";
import { getContrastColor, PremiumUI } from "../core/utils.js";
import { secureFetch } from "../core/api.js";

export async function refreshAllData(force = false) {
  const now = Date.now();
  const icon = document.getElementById("refresh-icon");
  if (icon) icon.classList.add("fa-spin");

  if (force) {
    const Toast = Swal.mixin({
      toast: true,
      position: "top-end",
      showConfirmButton: false,
    });
    Toast.fire({ icon: "info", title: "Actualisation..." });
  }

  try {
    const tasks = [];
    const perms = AppState.currentUser.permissions || {};

    // 1. TACHES PUBLIQUES (GPS, Flash messages)
    if (force || now - AppState.lastFetchTimes.global > 3600000) {
      tasks.push(
        window.fetchCompanyConfig().catch((e) => console.warn("GPS ignoré", e)),
      );
    }
    tasks.push(
      window.fetchFlashMessage().catch((e) => console.warn("Flash ignoré", e)),
    );

    // 2. TACHES LIÉES À LA LISTE DES EMPLOYÉS (RH / Admin / Comptable)
    if (perms.can_see_AppState.employees) {
      if (
        force ||
        AppState.employees.length === 0 ||
        now - AppState.lastFetchTimes.AppState.employees > REFRESH_THRESHOLD
      ) {
        // IMPORTANT : On ajoute la promesse de fetchData
        tasks.push(window.fetchData(false, 1));
        AppState.lastFetchTimes.AppState.employees = now;
      }
    }

    // 3. TACHES LIÉES AU DASHBOARD (Stats & Live Tracker)
    if (perms.can_see_dashboard) {
      tasks.push(window.fetchLiveAttendance());
    }

    // 4. TÂCHE ROBOT (Alertes)
    if (perms.can_send_announcements) {
      tasks.push(window.triggerRobotCheck());
    }

    // 5. TACHES SPÉCIFIQUES AUX VUES ACTIVES
    if (AppState.currentView === "recruitment" && perms.can_see_recruitment) {
      tasks.push(window.fetchCandidates());
    }

    if (AppState.currentView === "logs" && perms.can_see_audit) {
      tasks.push(window.fetchLogs());
    }

    // 6. ESPACE PERSONNEL
    if (AppState.currentView === "my-profile") {
      tasks.push(window.fetchPayrollData());
      tasks.push(window.fetchLeaveRequests());
    }

    // 7. GESTION MANAGERIALE (Validation des congés)
    if (
      AppState.currentUser.role !== "EMPLOYEE" &&
      !perms.can_see_AppState.employees
    ) {
      tasks.push(window.fetchLeaveRequests());
    }

    // --- ATTENTE DE TOUTES LES TÂCHES ---
    await Promise.all(tasks);
    window.updateManagementSignals();

    // 8. Rendu final des graphiques (Si on est sur le Dashboard et qu'on a le droit)
    if (AppState.currentView === "dash" && perms.can_see_dashboard) {
      // On attend que les graphiques soient dessinés
      await window.renderCharts();
    }

    if (force) {
      const Toast = Swal.mixin({
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 2000,
      });
      Toast.fire({ icon: "success", title: "Données à jour !" });
    }

    return true; // On confirme que tout est prêt
  } catch (error) {
    console.error("Erreur Sync:", error);
    return false;
  } finally {
    if (icon) setTimeout(() => icon.classList.remove("fa-spin"), 500);
  }
}

export async function viewDocument(url, title) {
  if (!url || url === "#" || url === "null") return;

  const urlLower = url.toLowerCase();
  const isDocx = urlLower.includes(".docx");
  const isBlob = url.startsWith("blob:"); // Détecte si c'est un fichier temporaire (Brouillon)

  let finalUrl = url;

  // 1. Si c'est un Word distant, on utilise le viewer Google
  if (isDocx && !isBlob) {
    finalUrl = `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;
  }
  // 2. Si c'est un PDF distant (Supabase/Drive), on ajoute l'anti-cache
  else if (!isBlob) {
    finalUrl = url + (url.includes("?") ? "&" : "?") + "t=" + Date.now();
  }
  // 3. Si c'est un BLOB (ton brouillon), on garde l'URL pure, sinon le navigateur ne le trouve plus

  window.Swal.fire({
    title: `<span class="text-sm font-black uppercase text-slate-500">${title}</span>`,
    html: `
            <!-- On utilise flex-col pour que le bouton prenne sa place en bas sans être écrasé -->
            <div class="flex flex-col h-[70vh] gap-4">
                
                <!-- La zone PDF prend tout l'espace restant (flex-1) -->
                <div class="flex-1 rounded-xl overflow-hidden border border-slate-200 bg-slate-50 shadow-inner relative">
                    <iframe src="${finalUrl}" class="absolute inset-0 w-full h-full" frameborder="0"></iframe>
                </div>

                <!-- La barre d'action en bas, taille fixe (shrink-0) -->
                <div class="shrink-0 flex justify-between items-center bg-white pt-2">
                    <a href="${url}" target="_blank" download class="text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors flex items-center gap-2">
                        <i class="fa-solid fa-download"></i> Télécharger l'original
                    </a>
                    <button onclick="window.Swal.close()" class="px-6 py-2.5 bg-slate-900 text-white rounded-lg text-xs font-bold uppercase shadow-md hover:bg-slate-800 transition-all active:scale-95">
                        Fermer
                    </button>
                </div>

            </div>
        `,
    width: "900px",
    showConfirmButton: false,
    padding: "1.5rem", // On garde un padding raisonnable
    customClass: { popup: "rounded-2xl viewer-modal" },
  });
}

export function toggleAccordion(id) {
  const content = document.getElementById(id);
  const icon = document.getElementById("icon-" + id);
  if (!content) return;
  const isHidden = content.classList.contains("hidden");
  if (isHidden) {
    content.classList.remove("hidden");
    if (icon) icon.style.transform = "rotate(180deg)";
  } else {
    content.classList.add("hidden");
    if (icon) icon.style.transform = "rotate(0deg)";
  }
}

export function switchView(v) {
  localStorage.setItem("sirh_last_view", v);

  // --- 1. INITIALISATION DE L'ANIMATION (FADE OUT) ---
  const mainContainer = document.getElementById("main-scroll-container");
  if (mainContainer) {
    mainContainer.style.opacity = "0";
    mainContainer.style.transform = "translateY(10px)";
    mainContainer.style.transition = "none";
  }

  if (window.chatIntervalId) {
    clearInterval(window.chatIntervalId);
    window.chatIntervalId = null;
  }

  AppState.currentView = v;
  console.log("Vue active :", AppState.currentView);

  if (AppState.videoStream) {
    AppState.videoStream.getTracks().forEach((t) => t.stop());
    AppState.videoStream = null;
  }
  if (AppState.contractStream) {
    AppState.contractStream.getTracks().forEach((t) => t.stop());
    AppState.contractStream = null;
  }

  document.querySelectorAll(".view-section").forEach((section) => {
    section.classList.remove("active");
  });

  const target = document.getElementById("view-" + v);
  if (target) target.classList.add("active");

  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.classList.remove("bg-blue-600", "text-white");
  });

  const activeBtn = document.querySelector(
    `button[onclick="switchView('${v}')"]`,
  );
  if (activeBtn) activeBtn.classList.add("bg-blue-600", "text-white");

  if (mainContainer) {
    mainContainer.scrollTo(0, 0);
  }
  window.scrollTo(0, 0);

  // Logique de recherche et accounting
  const searchContainer = document.getElementById("global-search-container");
  if (v === "AppState.employees" || v === "logs") {
    if (AppState.currentUser && AppState.currentUser.role !== "EMPLOYEE") {
      searchContainer.style.visibility = "visible";
      searchContainer.style.opacity = "1";
    }
  } else {
    searchContainer.style.visibility = "hidden";
    searchContainer.style.opacity = "0";
  }

  if (v === "dash") {
    window.renderCharts();
    window.fetchLiveAttendance();
  }

  // 2. Collaborateurs (Affichage de la liste)
  if (v === "AppState.employees") {
    window.renderData();
  }

  if (v === "catalog") {
    window.fetchProducts();
  }

  if (v === "maintenance") {
    // Pas de chargement automatique nécessaire pour l'instant
    // On pourrait ajouter fetchServerStats() ici dans le futur (Vision 20 ans)
  }

  if (v === "accounting") window.loadAccountingView();

  if (v === "prescripteurs-list") window.fetchPrescripteursManagement();

  if (v === "add-new") {
    const form = document.getElementById("form-onboarding");
    if (form) form.reset();
    window.resetCamera();
    window.populateManagerSelects();
  }

  if (v === "chat") {
    window.fetchMessages();
    window.initChatRealtime();
  } else {
    if (AppState.chatSubscription) {
      supabaseClient.removeChannel(AppState.chatSubscription);
      AppState.chatSubscription = null;
    }
  }

  // MODULES MOBILES
  if (v === "mobile-locations") window.fetchMobileLocations();
  if (v === "mobile-planning") window.fetchMobileSchedules();
  if (v === "contract-templates") window.fetchTemplates();
  if (v === "mobile-planning") window.fetchMobileSchedules();

  // Correction spécifique pour les rapports opérationnels
  if (v === "mobile-reports") {
    fetchMobileReports(); // Charge la liste (visites ou bilans)
    renderPerformanceTable(); // Charge les stats (Total visites, synthèses)
  }

  if (v === "settings") window.fetchZones();
  if (v === "logs") window.fetchLogs(1);
  if (v === "recruitment") window.fetchCandidates();
  if (v === "my-profile") {
    window.loadMyProfile();
    window.fetchPayrollData();
    window.fetchLeaveRequests();
  }

  // --- SEULE MODIFICATION ICI (Pour forcer la fermeture propre sur mobile) ---
  if (window.innerWidth < 768) {
    const sb = document.getElementById("sidebar");
    if (!sb.classList.contains("-translate-x-full")) {
      toggleSidebar(true);
    }
  }
  // -------------------------------------------------------------------------

  // --- 2. DÉCLENCHEMENT DE L'ANIMATION (FADE IN) ---
  setTimeout(() => {
    if (mainContainer) {
      mainContainer.style.transition = "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)";
      mainContainer.style.opacity = "1";
      mainContainer.style.transform = "translateY(0)";
    }
    if ("vibrate" in navigator) navigator.vibrate(8);
  }, 50);
}

export function toggleSidebar(forceClose = false) {
  const sb = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  const isMobile = window.innerWidth < 768;

  // 1. On bascule la classe de translation (Cacher/Afficher) ou on force la fermeture
  if (forceClose === true) {
    sb.classList.add("-translate-x-full");
  } else {
    sb.classList.toggle("-translate-x-full");
  }

  // 2. On vérifie l'état RÉEL de la sidebar après l'action
  const isSidebarHidden = sb.classList.contains("-translate-x-full");

  if (isMobile) {
    // Sur mobile, on gère l'overlay sombre EN FONCTION de l'état de la sidebar
    if (isSidebarHidden) {
      overlay.classList.add("hidden");
    } else {
      overlay.classList.remove("hidden");
    }
  } else {
    // Sur ordinateur, on peut ajouter une petite animation de transition
    // Si la sidebar est cachée, on s'assure que l'overlay est caché
    overlay.classList.add("hidden");
  }
}

export function initDarkMode() {
  const isDark = localStorage.getItem("sirh_dark_mode") === "true";
  if (isDark) {
    document.body.classList.add("dark-mode");
    updateDarkIcon(true);
  }
}

export function toggleDarkMode() {
  const isDark = document.body.classList.toggle("dark-mode");
  localStorage.setItem("sirh_dark_mode", isDark);
  updateDarkIcon(isDark);

  // Feedback sonore léger ou vibration
  if (navigator.vibrate) navigator.vibrate(50);
}

export function updateDarkIcon(isDark) {
  const icon = document.getElementById("dark-icon");
  const btn = document.querySelector(".dark-toggle-btn");
  if (isDark) {
    icon.classList.replace("fa-moon", "fa-sun");
    btn.classList.replace("bg-slate-100", "bg-slate-800");
    btn.classList.replace("text-slate-600", "text-yellow-400");
  } else {
    icon.classList.replace("fa-sun", "fa-moon");
    btn.classList.replace("bg-slate-800", "bg-slate-100");
    btn.classList.replace("text-yellow-400", "text-slate-600");
  }
}

export function applyBranding() {
  const theme = SIRH_CONFIG.theme;

  // 1. Calcul des couleurs de texte intelligentes
  const textOnPrimary = getContrastColor(theme.primary);
  const textOnAccent = getContrastColor(theme.accent);

  // 2. Application des variables CSS
  const root = document.documentElement;
  root.style.setProperty("--primary", theme.primary);
  root.style.setProperty("--accent", theme.accent);
  root.style.setProperty("--font-main", theme.fontFamily);
  root.style.setProperty("--base-size", theme.baseFontSize);
  root.style.setProperty("--text-on-primary", textOnPrimary);
  root.style.setProperty("--text-on-accent", textOnAccent);

  // 3. Sidebar : Nom et Logo
  const nameEls = document.querySelectorAll(".company-name-display");
  nameEls.forEach((el) => {
    el.innerText = SIRH_CONFIG.company.name;
    el.style.color = textOnPrimary; // Le nom s'adapte à la couleur de fond
  });

  const logoSidebar = document.querySelector(".app-logo-display");
  if (logoSidebar) logoSidebar.src = SIRH_CONFIG.company.logo;

  // 4. Écran de Connexion
  const loginTitle = document.querySelector("#login-screen h1");
  if (loginTitle) loginTitle.innerText = SIRH_CONFIG.company.name;

  const loginIconContainer = document.querySelector(
    "#login-screen .inline-flex",
  );
  if (loginIconContainer && SIRH_CONFIG.company.logo) {
    loginIconContainer.innerHTML = `<img src="${SIRH_CONFIG.company.logo}" class="w-14 h-14 object-contain">`;
  }

  // 5. Titre du navigateur
  document.title = SIRH_CONFIG.company.name + " | Portail RH";

  console.log(
    `🎨 Branding intelligent appliqué (${textOnAccent} sur ${theme.accent})`,
  );
}

export async function applyModulesUI() {
  console.log("⚙️ Application de la configuration entreprise...");
  try {
    // 1. On récupère la config depuis Supabase
    const response = await secureFetch(
      `${SIRH_CONFIG.apiBaseUrl}/read-modules`,
    );
    const modules = await response.json();

    // 2. On parcourt chaque module de la base de données
    modules.forEach((mod) => {
      // On cherche TOUS les éléments HTML qui portent cette étiquette
      const elements = document.querySelectorAll(
        `[data-module="${mod.module_key}"]`,
      );

      elements.forEach((el) => {
        if (mod.is_active === true) {
          // Si le module est ACTIF, on ne fait rien (on laisse l'élément visible)
          // Sauf s'il était caché par une autre logique, on enlève 'hidden' au cas où
          el.classList.remove("hidden");
        } else {
          // Si le module est INACTIF, on le SUPPRIME du DOM
          el.remove();
          console.log(`🚫 Module masqué : ${mod.module_key}`);
        }
      });
    });
  } catch (e) {
    console.error("Erreur critique chargement modules:", e);
  }
}

export function applyPermissionsUI(perms) {
  const safePerms = perms || {};
  console.log(
    "🛠️ Application des permissions UI (Mode Suppression Absolue)...",
    safePerms,
  );

  // ÉTAPE 1 : Supprimer physiquement les éléments non autorisés du DOM
  // On ne se contente plus de cacher, on détruit l'élément HTML.
  document.querySelectorAll("[data-perm]").forEach((el) => {
    const key = el.getAttribute("data-perm");

    if (safePerms[key] === true) {
      // L'utilisateur a le droit : on s'assure que c'est visible
      el.style.display = "";
      el.classList.remove("hidden");
    } else {
      // L'utilisateur n'a pas le droit : ON DÉTRUIT TOTALEMENT L'ÉLÉMENT !
      el.remove();
    }
  });

  // ÉTAPE 2 : Nettoyer les groupes de menus (menu-group) qui sont devenus vides
  document.querySelectorAll(".menu-group").forEach((group) => {
    // On cible la zone qui contient les boutons (ex: m-perso-content)
    const contentArea = group.querySelector('[id$="-content"]');

    if (contentArea) {
      // Comme on a fait "el.remove()" plus haut, il suffit de compter les boutons restants
      // On cherche tous les éléments cliquables restants dans ce groupe
      const remainingItems = contentArea.querySelectorAll(
        ".nav-btn, button, a",
      );

      if (remainingItems.length > 0) {
        group.style.display = ""; // Il reste des autorisations, on laisse le titre du groupe
      } else {
        group.remove(); // Le groupe est totalement vide, ON LE DÉTRUIT AUSSI !
      }
    }
  });
}

export function toggleWidget(widgetId) {
  const content = document.getElementById(widgetId + "-content");
  const icon = document.getElementById(widgetId + "-icon");

  // On bascule la classe 'hidden' (caché)
  const isNowHidden = content.classList.toggle("hidden");

  // On change l'icône (haut vers bas)
  if (isNowHidden) {
    icon.classList.replace("fa-chevron-up", "fa-chevron-down");
    localStorage.setItem("pref_" + widgetId, "closed");
  } else {
    icon.classList.replace("fa-chevron-down", "fa-chevron-up");
    localStorage.setItem("pref_" + widgetId, "open");
  }
}

export function applyWidgetPreferences() {
  // On ajoute les IDs du menu (commençant par m-) à la liste
  const widgets = [
    "w-stats",
    "w-live",
    "w-charts",
    "w-alerts",
    "w-leaves", // Widgets Dashboard
    "m-perso",
    "m-gestion",
    "m-admin", // Sections Menu
  ];

  widgets.forEach((id) => {
    const state = localStorage.getItem(`pref_${id}`);
    const content = document.getElementById(id + "-content");
    const icon = document.getElementById(id + "-icon");

    if (state === "closed" && content && icon) {
      content.classList.add("hidden");
      icon.classList.replace("fa-chevron-up", "fa-chevron-down");
    }
  });
}

export function toggleSensitiveData(element) {
  // 1. On affiche la donnée
  element.classList.add("revealed");

  // 2. On joue une petite vibration pour le feeling pro
  if (navigator.vibrate) navigator.vibrate(10);

  // 3. Sécurité : On refloute automatiquement après 10 secondes
  setTimeout(() => {
    element.classList.remove("revealed");
  }, 10000);
}

export async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    console.log("Ce navigateur ne supporte pas les notifications.");
    return;
  }

  if (Notification.permission !== "granted") {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      console.log("Permission notifications accordée !");
    }
  }
}
