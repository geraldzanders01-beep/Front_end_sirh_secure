import { AppState } from "../core/state.js";
import {
  SIRH_CONFIG,
  URL_READ,
  URL_WRITE_POST,
  URL_UPDATE,
  URL_EMPLOYEE_UPDATE,
  URL_CONTRACT_GENERATE,
  URL_UPLOAD_SIGNED_CONTRACT,
  URL_BADGE_GEN,
  URL_READ_CANDIDATES,
  URL_CANDIDATE_ACTION,
  ITEMS_PER_PAGE,
  AIRTABLE_FORM_PUBLIC_LINK, 
  AIRTABLE_FORM_EDIT_LINK 
} from "../core/config.js";
import { secureFetch } from "../core/api.js";
import {
  escapeHTML,
  convertToInputDate,
  parseDateSmart,
  formatGoogleLink,
  getDriveId,
  compressImage,
  PremiumUI,
} from "../core/utils.js";

export async function fetchData(forceUpdate = false, page = 1) {
  console.log(
    `🚀 fetchData lancée. Page: ${page}, Role: ${AppState.currentUser.role}`,
  );

  const CACHE_KEY = "sirh_data_v1";
  const limit = 10;

  if (forceUpdate) {
    localStorage.removeItem("sirh_data_v1"); // On vide le vieux cache
  }
  // --- NOUVEAU : Récupération centralisée des filtres ---
  // On utilise l'objet AppState.activeFilters (ou des valeurs par défaut si pas encore défini)
  const filters =
    typeof AppState.activeFilters !== "undefined"
      ? AppState.activeFilters
      : {
          search:
            typeof AppState.activeFilters.search !== "undefined"
              ? AppState.activeFilters.search
              : "",
          status:
            typeof AppState.currentStatusFilter !== "undefined"
              ? AppState.currentStatusFilter
              : "all",
          type: "all",
          dept: "all",
        };

  // 1. Construction de l'URL avec TOUS les paramètres de filtrage pro
  let fetchUrl =
    `${URL_READ}?page=${page}&limit=${limit}` +
    `&search=${encodeURIComponent(filters.search)}` +
    `&status=${filters.status}` +
    `&type=${filters.type}` +
    `&dept=${filters.dept}` +
    `&role=${filters.role || "all"}` +
    `&agent=${encodeURIComponent(AppState.currentUser.nom)}`;

  if (AppState.currentUser.role === "EMPLOYEE") {
    fetchUrl += `&target_id=${encodeURIComponent(AppState.currentUser.id)}`;
  }

  try {
    console.log("📞 Appel API (Deep Search Multi-Critères) vers :", fetchUrl);

    const r = await secureFetch(fetchUrl);
    const result = await r.json();

    const d = result.data || [];
    const meta = result.meta || { total: d.length, page: 1, last_page: 1 };

    console.log(
      `✅ Page ${meta.page} reçue :`,
      d.length,
      "enregistrements trouvés",
    );

    // 3. MAPPING (CORRIGÉ POUR INCLURE TRANSPORT ET LOGEMENT)
    AppState.employees = d.map((x) => {
      return {
        id: x.id,
        nom: x.nom,
        date: x.date_embauche,
        employee_type: x.employee_type || "OFFICE",
        poste: x.poste,
        dept: x.departement || "Non défini",
        Solde_Conges: parseFloat(x.solde_conges) || 0,
        limit:
          x.type_contrat === "CDI"
            ? "365"
            : x.type_contrat === "CDD"
              ? "180"
              : "90",
        photo: x.photo_url || "",
        statut: x.statut || "Actif",
        email: x.email,
        telephone: x.telephone,
        adresse: x.adresse,
        date_naissance: x.date_naissance,
        role: x.role || "EMPLOYEE",
        manager_id: x.manager_id || "",
        scope: x.management_scope || [],
        matricule: x.matricule || "N/A",
        doc: x.contrat_pdf_url || "",
        cv_link: x.cv_url || "",
        id_card_link: x.id_card_url || "",
        diploma_link: x.diploma_url || "",
        attestation_link: x.attestation_url || "",
        lm_link: x.lm_url || "",
        // --- LES CHAMPS FINANCIERS ---
        salaire_base_fixe: parseFloat(x.salaire_brut_fixe) || 0,
        indemnite_transport: parseFloat(x.indemnite_transport) || 0, // AJOUTÉ
        indemnite_logement: parseFloat(x.indemnite_logement) || 0, // AJOUTÉ
        // -----------------------------
        contract_status: x.contract_status || "Non signé",
      };
    });

    // 4. Sauvegarde Cache
    localStorage.setItem(CACHE_KEY, JSON.stringify(AppState.employees));
    localStorage.setItem(CACHE_KEY + "_time", Date.now());

    // 5. Mise à jour du Tableau
    renderData();

    // --- MISE À JOUR DE LA NAVIGATION (PAGINATION FOOTER) ---
    const paginationFooter = document.getElementById(
      "employee-pagination-footer",
    );

    if (paginationFooter) {
      if (meta.last_page > 1) {
        paginationFooter.innerHTML = `
                    <button onclick="window.fetchData(true, ${meta.page - 1})" ${meta.page <= 1 ? "disabled" : ""} 
                        class="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase text-slate-600 disabled:opacity-30 hover:bg-slate-100 transition-all shadow-sm">
                        <i class="fa-solid fa-chevron-left"></i> Précédent
                    </button>
                    
                    <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        PAGE ${meta.page} / ${meta.last_page}
                    </span>
                    
                    <button onclick="window.fetchData(true, ${meta.page + 1})" ${meta.page >= meta.last_page ? "disabled" : ""} 
                        class="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase text-slate-600 disabled:opacity-30 hover:bg-slate-100 transition-all shadow-sm">
                        Suivant <i class="fa-solid fa-chevron-right"></i>
                    </button>
                `;
      } else {
        paginationFooter.innerHTML = `<span class="text-[10px] font-black text-slate-300 uppercase tracking-widest">Fin de liste</span>`;
      }
    }

    // 6. Mise à jour graphiques
    window.renderCharts();

    if (AppState.currentUser.role !== "EMPLOYEE") {
      window.fetchLeaveRequests();
    }
  } catch (e) {
    console.error("❌ ERREUR FETCH:", e);
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      AppState.employees = JSON.parse(cached);
      renderData();
      loadMyProfile();
    } else {
      window.Swal.fire(
        "Erreur Connexion",
        "Impossible de charger vos informations.",
        "error",
      );
    }
  }
}




// Remplace toute la fonction changePage par celle-ci :
export function changePage(direction) {
    const totalPages = Math.ceil(AppState.employees.length / ITEMS_PER_PAGE);
    const newPage = AppState.currentPage + direction;
    if (newPage >= 1 && newPage <= totalPages) {
        AppState.currentPage = newPage;
        renderData();
    }
}





export function renderData() {
  const b = document.getElementById("full-body");
  const d = document.getElementById("dashboard-body");
  if (!b || !d) return;

    if (!AppState || !AppState.employees) {
        console.warn("AppState.employees n'est pas encore disponible");
        return;
    }
  
    // 1. Détection de la permission "Maître" (RH/ADMIN)
    const canManage = AppState.currentUser?.permissions?.can_see_employees === true;


// 2. LOGIQUE ESTHÉTIQUE
const headerAction = document.querySelector(
  'th[data-perm="can_see_employees"]',
);
  
  if (headerAction) {
    headerAction.style.display = canManage ? "" : "none";
  }

  b.innerHTML = "";
  d.innerHTML = "";

  let total = 0,
    alertes = 0,
    actifs = 0;

  // --- 1. CALCUL DES STATS (Sur le périmètre filtré par le serveur) ---
  AppState.employees.forEach((e) => {
    total++;
    const rawStatus = (e.statut || "Actif").toLowerCase().trim();
    const isSortie = rawStatus.includes("sortie");

    if (rawStatus === "actif") actifs++;

    if (e.date && !isSortie) {
      let sD = parseDateSmart(e.date);
      let eD = new Date(sD);
      eD.setDate(eD.getDate() + (parseInt(e.limit) || 365));
      let dL = Math.ceil((eD - new Date()) / 86400000);

      let isExpired = dL < 0;
      let isUrgent = dL <= 15;

      if (isExpired || isUrgent) {
        alertes++;
        // Dans le dashboard, on ne montre le bouton GÉRER que si on a le droit
        const manageBtn = canManage
          ? `<button class="bg-slate-900 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold" onclick="window.openEditModal('${escapeHTML(e.id)}')">GÉRER</button>`
          : "";

        d.innerHTML += `
                    <tr class="bg-white border-b">
                        <td class="p-4 text-sm font-bold text-slate-700">${escapeHTML(e.nom)}</td>
                        <td class="p-4 text-xs text-slate-500">${escapeHTML(e.poste)}</td>
                        <td class="p-4 ${isExpired ? "text-red-600" : "text-orange-600"} font-bold text-xs uppercase">${isExpired ? "Expiré" : dL + " j"}</td>
                        <td class="p-4 text-right">${manageBtn}</td>
                    </tr>`;
      }
    }
  });

  // --- 2. FILTRAGE LOCAL CORRIGÉ ---
  let filteredEmployees = AppState.employees;
  if (AppState.currentFilter !== "all") {
    filteredEmployees = AppState.employees.filter((e) => {
      const search = AppState.currentFilter.toLowerCase();
      const eStatut = (e.statut || "").toLowerCase();
      const eDept = (e.dept || "").toLowerCase();

      if (search === "actifs" || search === "actif") {
        return eStatut === "actif" || eStatut === "en poste";
      }
      return eStatut.includes(search) || eDept.includes(search);
    });
  }

  // --- 3. RENDU DU TABLEAU PRINCIPAL ---
  const startIndex = (AppState.currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedEmployees = filteredEmployees.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE,
  );

  paginatedEmployees.forEach((e) => {
    const rawStatus = (e.statut || "Actif").toLowerCase().trim();
    const isSortie = rawStatus.includes("sortie");
    const isConges = rawStatus.includes("cong");

    let bdgClass = isSortie
      ? "bg-slate-100 text-slate-500"
      : isConges
        ? "bg-blue-100 text-blue-700"
        : "bg-green-100 text-green-700";
    let bdgLabel = isSortie
      ? "SORTIE"
      : isConges
        ? "CONGÉ"
        : e.statut || "Actif";

    const av =
      e.photo && e.photo.length > 10
        ? `<img src="${formatGoogleLink(e.photo)}" loading="lazy" class="w-10 h-10 rounded-full object-cover bg-slate-200 border border-slate-200">`
        : `<div class="w-10 h-10 bg-slate-100 border border-slate-200 rounded-full flex items-center justify-center text-xs font-black text-slate-500">${escapeHTML(e.nom).substring(0, 2).toUpperCase()}</div>`;

    // --- CELLULE ACTION (Supprimée du DOM si pas autorisé) ---
    // --- DEBUT DU BLOC CORRIGÉ ---
    let actionCell = "";
    const perms = AppState.currentUser.permissions || {}; // Sécurité pour éviter les erreurs
    const safeId = escapeHTML(e.id);

    // On ouvre la cellule et le conteneur de boutons
    actionCell = `<td class="px-8 py-4 text-right"><div class="flex items-center justify-end gap-2">`;

    // 1. Bouton DOSSIER (📂)
    if (perms.can_view_employee_files) {
      actionCell += `<button onclick="window.openFullFolder('${safeId}')" title="Dossier" class="p-2 bg-yellow-50 text-yellow-600 rounded-lg hover:bg-yellow-500 hover:text-white transition-all"><i class="fa-solid fa-folder-open"></i></button>`;
    }

    // 2. Section CONTRATS (Brouillon, Signer, Scan)
    if (perms.can_manage_contracts) {
      const isSigned =
        String(e.contract_status || "")
          .toLowerCase()
          .trim() === "signé";
      actionCell += `<div class="h-4 w-[1px] bg-slate-200 mx-1"></div>`; // Séparateur

      if (!isSigned) {
        actionCell += `
                    <button onclick="window.generateDraftContract('${safeId}')" title="Brouillon" class="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-600 hover:text-white transition-all"><i class="fa-solid fa-file-contract"></i></button>                    
                    <button onclick="window.openContractModal('${safeId}')" title="Signer" class="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-all"><i class="fa-solid fa-pen-nib"></i></button>
                    <button onclick="window.triggerManualContractUpload('${safeId}')" title="Scan" class="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-600 hover:text-white transition-all"><i class="fa-solid fa-file-arrow-up"></i></button>
                `;
      } else {
        actionCell += `<span class="text-[10px] font-black text-emerald-500 uppercase bg-emerald-50 px-2 py-1 rounded">Signé</span>`;
      }
    }

    // 3. Bouton IMPRIMER (🖨️)
    if (perms.can_print_badges) {
      actionCell += `<div class="h-4 w-[1px] bg-slate-200 mx-1"></div>`; // Séparateur
      actionCell += `<button onclick="window.printBadge('${safeId}')" class="text-slate-400 hover:text-blue-600 transition-all"><i class="fa-solid fa-print"></i></button>`;
    }

    // 4. Bouton ÉDITER (✏️)
    // Accessible si on peut gérer les contrats OU simplement modifier les infos de base
    if (perms.can_edit_employee_basic || perms.can_manage_contracts) {
      actionCell += `<button onclick="window.openEditModal('${safeId}')" class="text-slate-400 hover:text-slate-800 transition-all"><i class="fa-solid fa-pen"></i></button>`;
    }

    if (perms.can_delete_employees) {
      actionCell += `<button onclick="window.deleteEmployee('${safeId}')" class="p-2 text-red-200 hover:text-red-600 transition-colors ml-1" title="Supprimer"><i class="fa-solid fa-trash-can"></i></button>`;
    }

    // On ferme les balises
    actionCell += `</div></td>`;
    // --- FIN DU BLOC CORRIGÉ ---

    b.innerHTML += `
            <tr class="border-b hover:bg-slate-50 transition-colors">
                <td class="p-4 flex gap-3 items-center min-w-[200px]">
                    ${av}
                    <div>
                        <div class="font-bold text-sm text-slate-800 uppercase">${escapeHTML(e.nom)}</div>
                        <div class="text-[10px] text-slate-400 font-mono">${e.matricule}</div>
                    </div>
                </td>
                <td class="p-4 text-xs font-medium text-slate-500">${escapeHTML(e.poste)}</td>
                <td class="p-4"><span class="px-3 py-1 border rounded-lg text-[10px] font-black uppercase ${bdgClass}">${escapeHTML(bdgLabel)}</span></td>
                ${actionCell} 
            </tr>`;
  });

  // Mise à jour des compteurs UI
  document.getElementById("stat-total").innerText = total;
  document.getElementById("stat-alert").innerText = alertes;
  document.getElementById("stat-active").innerText = actifs;

 // Pagination
    const totalPages = Math.ceil(
        filteredEmployees.length / ITEMS_PER_PAGE || 1
    );
    document.querySelectorAll(".page-info-global").forEach((el) => {
        el.innerText = `PAGE ${AppState.currentPage} / ${totalPages || 1}`;
    });
}

export function filterTable() {
  const input = document.getElementById("search-input");

  // On annule le compte à rebours précédent
  clearTimeout(AppState.searchTimeout);

  // On lance un nouveau compte à rebours de 300ms
  AppState.searchTimeout = setTimeout(() => {
    AppState.activeFilters.search = input.value.trim(); // On enregistre le texte
    fetchData(true, 1); // On lance la recherche
  }, 300);
}

export function setEmployeeFilter(category, value) {
  // 1. On met à jour la mémoire
  AppState.activeFilters[category] = value;

  // 2. On change les couleurs des boutons pour que Bill voit ce qu'il a choisi
  // On cherche le groupe de boutons (ex: filter-group-status)
  const container = document.getElementById(`filter-group-${category}`);
  if (container) {
    container.querySelectorAll(".filter-chip").forEach((btn) => {
      // Si le bouton correspond à la valeur cliquée -> Bleu
      if (btn.getAttribute("data-value") === value) {
        btn.className =
          "filter-chip px-3 py-1.5 rounded-lg text-[10px] font-black border bg-blue-600 text-white border-blue-600 shadow-md transition-all";
      } else {
        // Sinon -> Blanc
        btn.className =
          "filter-chip px-3 py-1.5 rounded-lg text-[10px] font-bold border bg-white text-slate-600 border-slate-200 hover:border-blue-300 transition-all";
      }
    });
  }

  // 3. On repart à la page 1 et on demande les données au serveur
  fetchData(true, 1);
}

export function applySmartFilter(filterType) {
  AppState.currentStatusFilter = filterType;

  // Mise à jour visuelle des boutons (Active / Hover)
  document.querySelectorAll(".filter-chip").forEach((btn) => {
    const isThisOne =
      btn.innerText.toLowerCase() === filterType.toLowerCase() ||
      (filterType === "all" && btn.innerText.toLowerCase() === "tous");

    if (isThisOne) {
      btn.classList.add(
        "bg-blue-600",
        "text-white",
        "border-blue-600",
        "shadow-md",
      );
      btn.classList.remove("bg-white", "text-slate-600");
    } else {
      btn.classList.remove(
        "bg-blue-600",
        "text-white",
        "border-blue-600",
        "shadow-md",
      );
      btn.classList.add("bg-white", "text-slate-600");
    }
  });

  fetchData(true, 1); // On relance le filtre à la page 1
}

export async function populateManagerSelects() {
  const createSelect = document.getElementById("f-manager");
  const editSelect = document.getElementById("edit-manager");
  if (!createSelect && !editSelect) return;

  try {
    // On appelle l'API avec une limite de 1000 et uniquement les actifs
    // On ajoute un paramètre agent pour la sécurité
    const response = await secureFetch(
      `${URL_READ}?limit=1000&status=Actif&agent=${encodeURIComponent(AppState.currentUser.nom)}`,
    );
    const result = await response.json();
    const allActive = result.data || [];

    // On génère le HTML des options
    // On trie par nom pour que ce soit plus facile à trouver
    const optionsHtml = allActive
      .sort((a, b) => a.nom.localeCompare(b.nom))
      .map(
        (e) =>
          `<option value="${e.id}">${e.nom} (${e.poste || "Sans poste"})</option>`,
      )
      .join("");

    const defaultOpt = `<option value="">-- Aucun / Autonome --</option>`;

    if (createSelect) createSelect.innerHTML = defaultOpt + optionsHtml;
    if (editSelect) editSelect.innerHTML = defaultOpt + optionsHtml;

    console.log(
      `👥 Liste des managers mise à jour (${allActive.length} personnes)`,
    );
  } catch (e) {
    console.error("Erreur lors du chargement de la liste des responsables", e);
  }
}

export async function syncAllRoleSelects() {
  try {
    let roles;
    // 1. Vérification du cache
    const cached = sessionStorage.getItem("sirh_cache_roles");

    if (cached) {
      roles = JSON.parse(cached);
      console.log("✅ Rôles chargés depuis le cache (Instant)");
    } else {
      // 2. Appel serveur
      const response = await secureFetch(
        `${SIRH_CONFIG.apiBaseUrl}/list-roles`,
      );
      roles = await response.json();
      // 3. Sauvegarde cache
      sessionStorage.setItem("sirh_cache_roles", JSON.stringify(roles));
    }

    AppState.activeRolesList = roles;
    const optionsHtml = roles
      .map((r) => `<option value="${r.role_name}">${r.role_name}</option>`)
      .join("");

    // Mise à jour des formulaires
    ["f-role", "edit-role"].forEach((id) => {
      const el = document.getElementById(id);
      if (el)
        el.innerHTML =
          `<option value="">-- Sélectionner un rôle --</option>` + optionsHtml;
    });

    // Mise à jour des filtres (Correction de ton ancienne erreur d'accolade ici aussi)
    ["filter-role-select", "filter-accounting-role"].forEach((id) => {
      const el = document.getElementById(id);
      if (el)
        el.innerHTML =
          `<option value="all">Tous les rôles</option>` + optionsHtml;
    });
  } catch (e) {
    console.error("Erreur synchro rôles", e);
  }
}

export async function fetchContractTemplatesForSelection() {
  const selectElement = document.getElementById("f-contract-template-selector");
  if (!selectElement) return;

  try {
    const response = await secureFetch(
      `${SIRH_CONFIG.apiBaseUrl}/list-templates`,
    );
    const templates = await response.json();

    let optionsHtml = '<option value="">-- Choisir un modèle --</option>';
    templates.forEach((tpl) => {
      optionsHtml += `<option value="${tpl.id}">${tpl.label}</option>`;
    });
    selectElement.innerHTML = optionsHtml;
  } catch (e) {
    console.error("Erreur chargement modèles de contrat pour sélection", e);
    selectElement.innerHTML = '<option value="">Erreur de chargement</option>';
  }
}

export async function fetchAndPopulateDepartments() {
  try {
    let depts;
    // 1. On vérifie le cache du navigateur
    const cached = sessionStorage.getItem("sirh_cache_depts");

    if (cached) {
      depts = JSON.parse(cached);
      console.log("✅ Départements chargés depuis le cache (Instant)");
    } else {
      // 2. Si pas en cache, on appelle le serveur
      const response = await secureFetch(
        `${SIRH_CONFIG.apiBaseUrl}/list-departments`,
      );
      depts = await response.json();
      // 3. On sauvegarde pour la prochaine fois
      sessionStorage.setItem("sirh_cache_depts", JSON.stringify(depts));
    }

    const defaultOpt = `<option value="">-- Choisir un département --</option>`;
    const optionsHtml = depts
      .map((d) => `<option value="${d.code}">${d.label}</option>`)
      .join("");

    // Mise à jour de l'interface
    const acctDept = document.getElementById("filter-accounting-dept");
    if (acctDept)
      acctDept.innerHTML =
        `<option value="all">Tous les Départements</option>` + optionsHtml;

    ["f-dept", "edit-dept"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = defaultOpt + optionsHtml;
    });
  } catch (e) {
    console.error("Erreur chargement départements", e);
  }
}

export async function loadMyProfile() {
  console.log("🔍 --- DÉBUT CHARGEMENT PROFIL PERSONNEL ---");
  console.log("👤 Utilisateur connecté :", AppState.currentUser);

  // 1. Sécurité : Vérifier que l'utilisateur est bien connecté
  if (!AppState.currentUser || !AppState.currentUser.id) {
    console.error(
      "❌ Pas d'utilisateur connecté ou ID manquant pour charger le profil.",
    );
    Swal.fire(
      "Erreur",
      "Impossible de charger votre profil. Veuillez vous reconnecter.",
      "error",
    );
    return;
  }

  // --- 2. NETTOYAGE IMMÉDIAT DE L'INTERFACE POUR ÉVITER LE FLICKER ---
  document.getElementById("emp-name").innerText = "Chargement...";
  document.getElementById("emp-job").innerText = "Chargement...";
  document.getElementById("emp-email").value = "";
  document.getElementById("emp-phone").value = "";
  document.getElementById("emp-address").value = "";
  document.getElementById("emp-dob").value = "";
  document.getElementById("folder-docs-grid").innerHTML =
    '<div class="col-span-full text-center text-slate-400 py-10 italic">Chargement des documents...</div>';

  const photoEl = document.getElementById("emp-photo-real");
  const avatarEl = document.getElementById("emp-avatar");
  if (photoEl) photoEl.classList.add("hidden");
  if (avatarEl) {
    avatarEl.classList.remove("hidden");
    avatarEl.innerText = (AppState.currentUser.nom || "U")
      .charAt(0)
      .toUpperCase();
  }
  document.getElementById("emp-start-date").innerText = "--/--/----";
  document.getElementById("emp-end-date").innerText = "--/--/----";
  document.getElementById("leave-balance-display").innerText = "--";

  // --- 3. APPEL ASYNCHRONE AU SERVEUR ---
  try {
    const r = await secureFetch(
      `${URL_READ}?target_id=${encodeURIComponent(AppState.currentUser.id)}&agent=${encodeURIComponent(AppState.currentUser.nom)}`,
    );
    const result = await r.json();
    const myRawData = result.data?.[0];

    if (!myRawData) {
      console.error("❌ ÉCHEC : Impossible de trouver votre profil.");
      Swal.fire("Erreur", "Votre fiche employé est introuvable.", "error");
      return;
    }

    // --- 4. MAPPING DES DONNÉES ---
    const myData = {
      id: myRawData.id,
      nom: myRawData.nom,
      date: myRawData.date_embauche,
      employee_type: myRawData.employee_type || "OFFICE",
      poste: myRawData.poste,
      dept: myRawData.departement || "Non défini",
      solde_conges: parseFloat(myRawData.solde_conges) || 0,
      limit:
        myRawData.type_contrat === "CDI"
          ? "365"
          : myRawData.type_contrat === "CDD"
            ? "180"
            : "90",
      photo: myRawData.photo_url || "",
      statut: myRawData.statut || "Actif",
      email: myRawData.email,
      telephone: myRawData.telephone,
      adresse: myRawData.adresse,
      date_naissance: myRawData.date_naissance,
      role: myRawData.role || "EMPLOYEE",
      matricule: myRawData.matricule || "N/A",
      doc: myRawData.contrat_pdf_url || "",
      cv_link: myRawData.cv_url || "",
      id_card_link: myRawData.id_card_url || "",
      diploma_link: myRawData.diploma_url || "",
      attestation_link: myRawData.attestation_url || "",
      lm_link: myRawData.lm_url || "",
      contract_status: myRawData.contract_status || "Non signé",
    };

    // --- 5. REMPLISSAGE DE L'INTERFACE ---
    document.getElementById("emp-name").innerText = myData.nom;
    document.getElementById("emp-job").innerText = myData.poste;

    const nameDisplay = document.getElementById("name-display");
    if (nameDisplay) nameDisplay.innerText = myData.nom;

    if (myData.photo && myData.photo.length > 10) {
      photoEl.src = formatGoogleLink(myData.photo);
      photoEl.classList.remove("hidden");
      avatarEl.classList.add("hidden");
    }

    if (myData.date) {
      let sD = parseDateSmart(myData.date);
      document.getElementById("emp-start-date").innerText =
        sD.toLocaleDateString("fr-FR");
      let eD = new Date(sD);
      eD.setDate(eD.getDate() + (parseInt(myData.limit) || 365));
      document.getElementById("emp-end-date").innerText =
        eD.toLocaleDateString("fr-FR");
    }

    document.getElementById("emp-email").value = myData.email || "";
    document.getElementById("emp-phone").value = myData.telephone || "";
    document.getElementById("emp-address").value = myData.adresse || "";
    document.getElementById("emp-dob").value = convertToInputDate(
      myData.date_naissance,
    );

    // Gestion des documents
    const dC = document.getElementById("doc-container");
    if (dC) {
      dC.innerHTML = "";
      const allDocs = [
        {
          label: "Contrat Actuel",
          link: myData.doc,
          icon: "fa-file-signature",
          color: "blue",
          key: "contrat",
        },
        {
          label: "Curriculum Vitae",
          link: myData.cv_link,
          icon: "fa-file-pdf",
          color: "indigo",
          key: "cv",
        },
        {
          label: "Lettre Motivation",
          link: myData.lm_link,
          icon: "fa-envelope-open-text",
          color: "pink",
          key: "lm",
        },
        {
          label: "Pièce d'Identité",
          link: myData.id_card_link,
          icon: "fa-id-card",
          color: "slate",
          key: "id_card",
        },
        {
          label: "Diplômes/Certifs",
          link: myData.diploma_link,
          icon: "fa-graduation-cap",
          color: "emerald",
          key: "diploma",
        },
        {
          label: "Attestations",
          link: myData.attestation_link,
          icon: "fa-file-invoice",
          color: "orange",
          key: "attestation",
        },
      ];

      const VISIBLE_LIMIT = 4;
      let gridHtml = '<div class="grid grid-cols-1 md:grid-cols-4 gap-4">';

      allDocs.forEach((doc, index) => {
        const hasLink = doc.link && doc.link.length > 5;
        const safeLabel = doc.label.replace(/'/g, "\\'");
        const hiddenClass = index >= VISIBLE_LIMIT ? "hidden more-docs" : "";
        const isAdminOrRH =
          AppState.currentUser.role === "ADMIN" ||
          AppState.currentUser.role === "RH";
        const canEdit = isAdminOrRH || doc.key === "id_card";

        gridHtml += `
                    <div class="${hiddenClass} flex flex-col justify-between p-4 border border-slate-100 bg-white rounded-2xl hover:shadow-md transition-all group h-full">
                        <div class="flex items-center gap-3 mb-4">
                            <div class="bg-${doc.color}-50 text-${doc.color}-600 p-3 rounded-xl shrink-0"><i class="fa-solid ${doc.icon} text-lg"></i></div>
                            <div class="overflow-hidden">
                                <p class="text-xs font-bold text-slate-700 truncate">${doc.label}</p>
                                <p class="text-[9px] text-slate-400 font-bold uppercase tracking-wide">Document</p>
                            </div>
                        </div>
                        <div class="flex gap-2 mt-auto">
                            ${hasLink ? `<button onclick="viewDocument('${doc.link}', '${safeLabel}')" class="flex-1 py-2 text-[10px] font-bold uppercase bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-all">Voir</button>` : `<div class="flex-1 py-2 text-[10px] font-bold uppercase bg-slate-50 text-slate-300 rounded-lg text-center cursor-not-allowed">Vide</div>`}
                            ${canEdit ? `<button onclick="updateSingleDoc('${doc.key}', '${myData.id}')" class="w-10 flex items-center justify-center bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-800 hover:text-white transition-all"><i class="fa-solid fa-pen"></i></button>` : ""}
                        </div>
                    </div>`;
      });
      gridHtml += "</div>";
      if (allDocs.length > VISIBLE_LIMIT)
        gridHtml += `<div class="text-center mt-4 pt-2 border-t border-slate-50"><button onclick="toggleMoreDocs(this)" class="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-full text-xs font-bold text-slate-500 hover:text-blue-600 transition-all shadow-sm"><i class="fa-solid fa-circle-plus"></i> Voir plus</button></div>`;
      dC.innerHTML = gridHtml;
    }

    const leaveBalanceEl = document.getElementById("leave-balance-display");
    const solde = myData.solde_conges;
    if (leaveBalanceEl) {
      leaveBalanceEl.innerText = `${solde} jours`;
      leaveBalanceEl.className =
        solde <= 5
          ? "text-4xl font-black mt-2 text-orange-600"
          : "text-4xl font-black mt-2 text-indigo-600";
    }

    // --- LOGIQUE DE CHARGEMENT DES DONNÉES DE TERRAIN ---
    const mobileSection = document.getElementById("mobile-recap-section");

    if (myData.employee_type === "MOBILE") {
      // Si c'est un agent de terrain, on affiche les blocs de récapitulatif (Visites/Bilans)
      if (mobileSection) mobileSection.classList.remove("hidden");

      // On lance le chargement de ses statistiques d'activité
      if (typeof fetchMyActivityRecap === "function") {
        fetchMyActivityRecap();
      }
    } else {
      // Pour un employé de bureau, on cache les blocs de statistiques terrain
      if (mobileSection) mobileSection.classList.add("hidden");
    }

    // Note : Le bouton "Rapport de Fin de Journée" est maintenant géré
    // automatiquement par applyPermissionsUI via l'attribut data-perm="can_submit_daily_report"
  } catch (e) {
    console.error("Erreur de chargement du profil personnel:", e);
    Swal.fire("Erreur", "Impossible de charger votre profil.", "error");
  }
}

export async function saveMyProfile() {
  Swal.fire({ title: "Sauvegarde...", didOpen: () => Swal.showLoading() });

  // --- CORRECTION : Recherche sécurisée du Matricule ---
  // On nettoie les noms (enlève points, espaces) pour comparer "sena.broda" et "Sena Broda"
  const normalize = (s) => (s ? s.toLowerCase().replace(/[\.\s_-]/g, "") : "");
  const searchNom = normalize(AppState.currentUser.nom);

  const myData = AppState.employees.find(
    (e) =>
      normalize(e.nom) === searchNom ||
      normalize(e.nom).includes(searchNom) ||
      searchNom.includes(normalize(e.nom)),
  );

  // On utilise directement l'ID de la session actuelle, c'est le plus sûr
  const idToSend = AppState.currentUser.id;

  console.log("Tentative d'envoi pour l'ID :", idToSend);

  const fd = new FormData();
  fd.append("id", idToSend); 
  fd.append("email", document.getElementById("emp-email").value);
  fd.append("phone", document.getElementById("emp-phone").value);
  fd.append("address", document.getElementById("emp-address").value);
  fd.append("dob", document.getElementById("emp-dob").value);
  fd.append("agent", AppState.currentUser.nom);
  fd.append("agent_role", AppState.currentUser.role); 
  fd.append("doc_type", "text_update"); 

  const photoInput = document.getElementById("emp-upload-photo");
  if (photoInput && photoInput.files[0]) {
    fd.append("new_photo", photoInput.files[0]);
  } else if (AppState.capturedBlob) {
    fd.append("new_photo", AppState.capturedBlob, "photo_profil.jpg");
  }
  // --- FIN DU REMPLACEMENT ---
  try {
    const response = await secureFetch(URL_EMPLOYEE_UPDATE, {
      method: "POST",
      body: fd,
    });

    if (response.ok) {
      Swal.fire("Succès", "Votre profil a été mis à jour", "success");
      toggleEditMode();
      fetchData(true); // On met à jour ses infos
    } else {
      throw new Error("Erreur serveur (" + response.status + ")");
    }
  } catch (e) {
    Swal.fire("Erreur", "Échec de l'enregistrement : " + e.message, "error");
  }
}

export function toggleEditMode() {
  const ids = ["emp-email", "emp-phone", "emp-address", "emp-dob"],
    btn = document.getElementById("save-btn-container"),
    dis = document.getElementById("emp-email").disabled;
  ids.forEach((i) => {
    const el = document.getElementById(i);
    el.disabled = !dis;
    if (!dis) el.classList.add("bg-white", "ring-2", "ring-blue-100");
    else el.classList.remove("bg-white", "ring-2", "ring-blue-100");
  });
  if (dis) {
    btn.classList.remove("hidden");
    document.getElementById("emp-email").focus();
  } else {
    btn.classList.add("hidden");
    loadMyProfile();
  }
}

export function triggerPhotoUpload() {
  document.getElementById("emp-upload-photo").click();
}

export function previewPhoto(e) {
  const f = e.target.files[0];
  if (f) {
    const r = new FileReader();
    r.onload = function (ev) {
      document.getElementById("emp-photo-real").src = ev.target.result;
      document.getElementById("emp-photo-real").classList.remove("hidden");
      document.getElementById("emp-avatar").classList.add("hidden");
      document.getElementById("save-btn-container").classList.remove("hidden");
    };
    r.readAsDataURL(f);
  }
}

export function openFullFolder(id) {
  const e = AppState.employees.find((x) => x.id === id);
  if (!e) return;

  // 1. Remplissage de l'identité de base
  document.getElementById("folder-photo").src =
    formatGoogleLink(e.photo) || "https://via.placeholder.com/150";
  document.getElementById("folder-name").innerText = e.nom;
  document.getElementById("folder-id").innerText = "MATRICULE : " + e.matricule;
  document.getElementById("folder-poste").innerText = e.poste;
  document.getElementById("folder-dept").innerText = e.dept;
  document.getElementById("folder-email").innerText =
    e.email || "Non renseigné";
  document.getElementById("folder-phone").innerText =
    e.telephone || "Non renseigné";
  document.getElementById("folder-address").innerText =
    e.adresse || "Non renseignée";

  // 2. Gestion des dates de contrat
  if (e.date) {
    let sD = parseDateSmart(e.date);
    document.getElementById("folder-start").innerText =
      sD.toLocaleDateString("fr-FR");
    let eD = new Date(sD);
    eD.setDate(eD.getDate() + (parseInt(e.limit) || 365));
    document.getElementById("folder-end").innerText =
      eD.toLocaleDateString("fr-FR");
  }

  // --- 3. NOUVEAU : INSERTION DU BLOC RÉMUNÉRATION (SÉCURISÉ) ---
  // On cherche l'endroit dans la colonne de gauche (md:w-1/3) pour injecter le salaire
  const infoContainer =
    document.getElementById("folder-dept").parentElement.parentElement;

  // On vérifie si le bloc existe déjà pour ne pas le doubler
  const existingSalary = document.getElementById("folder-salary-block");
  if (existingSalary) existingSalary.remove();

  const salaryHtml = `
    <div id="folder-salary-block" class="mt-4 pt-4 border-t border-white/10">
        <p class="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Salaire de Base Fixe</p>
        <div class="flex items-center gap-2">
            <p class="text-sm font-black text-blue-400 sensitive-value" onclick="toggleSensitiveData(this)">
                ${new Intl.NumberFormat("fr-FR").format(e.salaire_base_fixe || 0)} CFA
            </p>
            <i class="fa-solid fa-eye-slash text-[9px] text-slate-600"></i>
        </div>
    </div>`;

  infoContainer.insertAdjacentHTML("beforeend", salaryHtml);
  // -------------------------------------------------------------

  // 4. Remplissage de la grille des documents
  const grid = document.getElementById("folder-docs-grid");
  grid.innerHTML = "";

  const docs = [
    {
      label: "Contrat Actuel",
      link: e.doc,
      icon: "fa-file-signature",
      color: "blue",
      key: "contrat",
    },
    {
      label: "Curriculum Vitae",
      link: e.cv_link,
      icon: "fa-file-pdf",
      color: "indigo",
      key: "cv",
    },
    {
      label: "Lettre Motivation",
      link: e.lm_link,
      icon: "fa-envelope-open-text",
      color: "pink",
      key: "lm",
    },
    {
      label: "Pièce d'Identité",
      link: e.id_card_link,
      icon: "fa-id-card",
      color: "slate",
      key: "id_card",
    },
    {
      label: "Diplômes/Certifs",
      link: e.diploma_link,
      icon: "fa-graduation-cap",
      color: "emerald",
      key: "diploma",
    },
    {
      label: "Attestations / Autres",
      link: e.attestation_link,
      icon: "fa-file-invoice",
      color: "orange",
      key: "attestation",
    },
  ];

  docs.forEach((doc) => {
    const hasLink = doc.link && doc.link.length > 5;
    const safeLabel = doc.label.replace(/'/g, "\\'");
    const canEdit =
      AppState.currentUser.role === "ADMIN" ||
      AppState.currentUser.role === "RH" ||
      AppState.currentUser.role === "MANAGER";

    grid.innerHTML += `
            <div class="p-4 rounded-2xl border ${hasLink ? "bg-white shadow-sm border-slate-200" : "bg-slate-100 opacity-50"} flex items-center justify-between group">
                <div class="flex items-center gap-3">
                    <div class="p-2.5 rounded-xl bg-${doc.color}-50 text-${doc.color}-600"><i class="fa-solid ${doc.icon}"></i></div>
                    <p class="text-xs font-bold text-slate-700">${doc.label}</p>
                </div>
                <div class="flex gap-2">
                    ${hasLink ? `<button onclick="viewDocument('${doc.link}', '${safeLabel}')" class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="Consulter"><i class="fa-solid fa-eye"></i></button>` : ""}
                    ${canEdit ? `<button onclick="updateSingleDoc('${doc.key}', '${e.id}')" class="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Modifier"><i class="fa-solid fa-pen-to-square"></i></button>` : ""}
                </div>
            </div>`;
  });

  document.getElementById("folder-modal").classList.remove("hidden");
}

export function closeFolderModal() {
  document.getElementById("folder-modal").classList.add("hidden");
}

export function toggleMoreDocs(btn) {
  // Affiche tous les éléments cachés
  document.querySelectorAll(".more-docs").forEach((el) => {
    el.classList.remove("hidden");
    el.classList.add("animate-fadeIn"); // Petit effet d'apparition
  });
  // Supprime le bouton après le clic
  btn.parentElement.remove();
}

export function openDocCamera(target) {
  Swal.fire({
    title: "Source du document",
    text: "Voulez-vous prendre une photo ou choisir un fichier ?",
    showCancelButton: true,
    confirmButtonText: "📸 Caméra",
    cancelButtonText: "📁 Fichier",
    confirmButtonColor: "#2563eb",
  }).then((result) => {
    if (result.isConfirmed) {
      startGenericCamera(target);
    } else if (result.dismiss === Swal.DismissReason.cancel) {
      document.getElementById("f-" + target).click();
    }
  });
}

export async function startGenericCamera(target) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
    });
    Swal.fire({
      title: "Capture",
      html: `<video id="temp-video" autoplay playsinline class="w-full rounded-xl"></video>`,
      confirmButtonText: "CAPTURER",
      showCancelButton: true,
      didOpen: () => {
        document.getElementById("temp-video").srcObject = stream;
      },
    }).then((result) => {
      if (result.isConfirmed) {
        const video = document.getElementById("temp-video");
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d").drawImage(video, 0, 0);
        canvas.toBlob(
          (blob) => {
            saveDoc(target, blob);
            stream.getTracks().forEach((t) => t.stop());
          },
          "image/jpeg",
          0.8,
        );
      } else {
        stream.getTracks().forEach((t) => t.stop());
      }
    });
  } catch (e) {
    Swal.fire("Erreur", "Caméra inaccessible", "error");
  }
}

export function previewDocFile(event, target) {
  const file = event.target.files[0];
  if (file) saveDoc(target, file);
}

export async function saveDoc(target, fileOrBlob) {
  // Rendre asynchrone
  // --- NOUVEAU : Compression si c'est une image ---
  Swal.update({ text: "Compression du document en cours..." }); // Affiche un loader si nécessaire
  const processedFile = await compressImage(fileOrBlob);
  AppState.docBlobs[target] = processedFile; // Stocke la version compressée

  const preview = document.getElementById("preview-" + target);
  const icon = document.getElementById("icon-" + target);

  if (preview) {
    preview.src = URL.createObjectURL(processedFile); // Utilise processedFile ici
    preview.classList.remove("hidden");
    if (icon) icon.classList.add("hidden");
  } else if (target === "leave_justif") {
    document.getElementById("leave-doc-preview").innerHTML =
      '<i class="fa-solid fa-check text-emerald-500"></i>';
  }
}

export async function updateSingleDoc(docKey, employeeId) {
  const { value: file } = await Swal.fire({
    title: "Mettre à jour le document",
    input: "file",
    inputAttributes: { accept: "image/*,application/pdf" },
    showCancelButton: true,
    confirmButtonText: "Uploader",
    cancelButtonColor: "#ef4444",
    confirmButtonColor: "#2563eb",
  });

  if (file) {
    Swal.fire({
      title: "Envoi...",
      didOpen: () => Swal.showLoading(),
      allowOutsideClick: false,
    });
    const fd = new FormData();
    fd.append("id", employeeId);
    fd.append("agent", AppState.currentUser.nom);
    fd.append("agent_role", AppState.currentUser.role);

    // --- NOUVEAU : COMPRESSION POUR LA MISE À JOUR ---
    Swal.update({ text: "Compression du document en cours..." });
    const compressedFile = await compressImage(file);
    fd.append("new_photo", compressedFile); // Champ utilisé par ton serveur
    fd.append("doc_type", docKey);

    try {
      const r = await secureFetch(URL_EMPLOYEE_UPDATE, {
        method: "POST",
        body: fd,
      });
      if (r.ok) {
        Swal.fire("Succès", "Document mis à jour", "success");
        refreshAllData();
      }
    } catch (e) {
      Swal.fire("Erreur", e.message, "error");
    }
  }
}

export function updateFileFeedback(inputId, labelId) {
  const input = document.getElementById(inputId);
  const label = document.getElementById(labelId); // Le bouton ou le conteneur visuel
  const file = input.files[0];

  if (file) {
    // Change le style pour dire "C'est bon !"
    if (label) {
      // Sauvegarde le texte original si pas déjà fait
      if (!label.dataset.originalText)
        label.dataset.originalText = label.innerHTML;

      // Affiche le nom et une icône verte
      label.innerHTML = `<i class="fa-solid fa-check-circle text-emerald-500 mr-2"></i> <span class="text-emerald-700 font-bold text-[10px] truncate">${file.name}</span>`;
      label.classList.add("bg-emerald-50", "border-emerald-200");
      label.classList.remove(
        "bg-white",
        "bg-blue-50",
        "text-slate-600",
        "text-blue-600",
      );
    }
  }
}

export async function handleOnboarding(e) {
  e.preventDefault();
  console.log("Tentative de création de profil...");
    const fd = new FormData();


  // 1. Vérification de la photo de profil (Obligatoire)
  if (AppState.capturedBlob) {
    const compressed = await compressImage(AppState.capturedBlob);
    fd.append("photo", compressed, "photo_profil.jpg");
  }

  try {
  
    const getVal = (id) => {
      const el = document.getElementById(id);
      if (!el) {
        console.warn(`Attention: L'élément avec l'ID ${id} est introuvable.`);
        return ""; // Retourne vide au lieu de crasher
      }
      return el.value;
    };

    // CHAMPS GÉNERAUX ET HIÉRARCHIQUES
    fd.append("manager_id", document.getElementById("f-manager").value);
    const scopeVal = document.getElementById("f-scope").value;
    fd.append(
      "scope",
      scopeVal
        ? JSON.stringify(scopeVal.split(",").map((s) => s.trim()))
        : "[]",
    );

    fd.append("nom", getVal("f-nom"));
    fd.append("email", getVal("f-email"));
    fd.append("telephone", getVal("f-phone"));
    fd.append("dob", getVal("f-dob"));
    fd.append("adresse", getVal("f-address"));
    fd.append("date", getVal("f-date")); // date_embauche
    fd.append("poste", getVal("f-poste"));
    fd.append("dept", getVal("f-dept"));
    fd.append("employee_type", getVal("f-type"));
    fd.append("limit", getVal("f-limit")); // type_contrat
    fd.append("role", getVal("f-role"));

    // NOUVEAUX CHAMPS CONTRACTUELS (INTÉGRATION COMPLÈTE)
    fd.append("salaire_brut_fixe", getVal("f-salaire-fixe")); // Nouveau champ
    fd.append("indemnite_transport", getVal("f-indemnite-transport")); // Nouveau champ
    fd.append("indemnite_logement", getVal("f-indemnite-logement")); // Nouveau champ
    fd.append("temps_travail", getVal("f-temps-travail")); // Nouveau champ
    fd.append("lieu_naissance", getVal("f-lieu-naissance")); // Nouveau champ
    fd.append("nationalite", getVal("f-nationalite")); // Nouveau champ
    fd.append("contract_template_id", getVal("f-contract-template-selector")); // Nouveau champ pour le modèle choisi
    fd.append("civilite", getVal("f-civilite"));
    fd.append("duree_essai", getVal("f-duree-essai"));
    fd.append("lieu_signature", getVal("f-lieu-signature"));
    fd.append("contract_template_id", getVal("f-contract-template-selector"));
    fd.append(
      "agent",
      AppState.currentUser ? AppState.currentUser.nom : "Système",
    );

    // 3. Ajout de la photo de profil (Obligatoire)
    Swal.update({ text: "Compression de la photo de profil..." });
    const compressedProfilePhoto = await compressImage(AppState.capturedBlob);
    fd.append("photo", compressedProfilePhoto, "photo_profil.jpg");

    // 4. Ajout des documents KYC (Optionnels)
    if (AppState.docBlobs.id_card)
      fd.append("id_card", AppState.docBlobs.id_card, "piece_identite.jpg");
    if (AppState.docBlobs.cv) fd.append("cv", AppState.docBlobs.cv, "cv.jpg");
    if (AppState.docBlobs.diploma)
      fd.append("diploma", AppState.docBlobs.diploma, "diplome.jpg");
    if (AppState.docBlobs.attestation)
      fd.append(
        "attestation",
        AppState.docBlobs.attestation,
        "attestation.jpg",
      );

    // 5. Affichage du chargement
    Swal.fire({
      title: "Création du dossier...",
      text: "Envoi des informations et des documents au serveur sécurisé",
      didOpen: () => Swal.showLoading(),
      allowOutsideClick: false,
    });

    // 6. Envoi au serveur Render
    const response = await secureFetch(URL_WRITE_POST, {
      method: "POST",
      body: fd,
    });

    if (response.ok) {
      await Swal.fire({
        icon: "success",
        title: "Profil créé !",
        text: "Le collaborateur a été ajouté et ses accès ont été envoyés par email.",
        confirmButtonColor: "#2563eb",
      });

      // --- NETTOYAGE COMPLET DU FORMULAIRE ---
      e.target.reset();
      resetCamera();
      AppState.docBlobs = {
        id_card: null,
        cv: null,
        diploma: null,
        attestation: null,
        leave_justif: null,
      };
      const docIds = ["id_card", "cv", "diploma", "attestation"];
      docIds.forEach((id) => {
        const label = document.getElementById("btn-" + id);
        const preview = document.getElementById("preview-" + id);
        const icon = document.getElementById("icon-" + id);

        if (label) {
          label.classList.remove("bg-emerald-50", "border-emerald-200");
          label.innerHTML = label.dataset.originalText || label.innerHTML;
        }
        if (preview) preview.classList.add("hidden");
        if (icon) icon.classList.remove("hidden");
      });

      await fetchData(true);
      window.switchView(AppState.employees);
    } else {
      const errorData = await response.json();
      throw new Error(errorData.error || "Erreur serveur");
    }
  } catch (error) {
    console.error("Erreur lors de l'onboarding:", error);
    Swal.fire(
      "Échec",
      "Impossible de créer le profil : " + error.message,
      "error",
    );
  }
}

export function moveStep(delta) {
  if (delta > 0) {
    // Validation Étape 1
    if (AppState.currentWizardStep === 1) {
      const nom = document.getElementById("f-nom").value.trim();
      const email = document.getElementById("f-email").value.trim();
      if (!nom || !email) {
        Swal.fire(
          "Champ manquant",
          "Le nom et l'email sont obligatoires.",
          "warning",
        );
        return;
      }
    }

    // VALIDATION ÉTAPE 2 (C'est ici que ça règle ton bug)
    if (AppState.currentWizardStep === 2) {
      const poste = document.getElementById("f-poste").value.trim();
      const dateEmbauche = document.getElementById("f-date").value; // Le fameux f-date

      if (!poste || !dateEmbauche) {
        PremiumUI.vibrate("error");
        Swal.fire(
          "Données du contrat",
          "Le poste et la date d'embauche sont obligatoires pour générer le contrat.",
          "warning",
        );
        return;
      }
    }
  }

  const nextStep = AppState.currentWizardStep + delta;
  if (nextStep < 1 || nextStep > 3) return;

  // Mise à jour visuelle
  document
    .getElementById(`step-${AppState.currentWizardStep}`)
    .classList.add("hidden");
  document.getElementById(`step-${nextStep}`).classList.remove("hidden");

  for (let i = 1; i <= 3; i++) {
    const dot = document.getElementById(`step-dot-${i}`);
    dot.classList.toggle("bg-blue-600", i <= nextStep);
    dot.classList.toggle("bg-white/10", i > nextStep);
  }

  document.getElementById("btn-prev").style.visibility =
    nextStep === 1 ? "hidden" : "visible";
  document
    .getElementById("btn-next")
    .classList.toggle("hidden", nextStep === 3);
  document
    .getElementById("btn-submit-wizard")
    .classList.toggle("hidden", nextStep !== 3);

  const titles = {
    1: "Identité & Photo",
    2: "Poste & Finances",
    3: "Dossier & Hiérarchie",
  };
  document.getElementById("wizard-subtitle").innerText =
    `Étape ${nextStep} : ${titles[nextStep]}`;
  AppState.currentWizardStep = nextStep;
  document.getElementById("main-scroll-container").scrollTo(0, 0);
}

export function toggleContractFieldsVisibility() {
  const selectedEmployeeType = document.getElementById("f-type").value;

  // Masquer tous les champs conditionnels par défaut
  document
    .querySelectorAll(".field-group-contract[data-employee-type]")
    .forEach((el) => {
      el.style.display = "none";
    });

  // Afficher les champs communs à tous (ceux sans data-employee-type)
  document
    .querySelectorAll(".field-group-contract:not([data-employee-type])")
    .forEach((el) => {
      el.style.display = "block";
    });

  // Afficher les champs spécifiques au type d'employé sélectionné
  document
    .querySelectorAll(
      `.field-group-contract[data-employee-type="${selectedEmployeeType}"]`,
    )
    .forEach((el) => {
      el.style.display = "block";
    });
}

export async function startCameraFeed() {
  try {
    AppState.videoStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
    });
    const v = document.getElementById("video-stream");
    v.srcObject = AppState.videoStream;
    v.classList.remove("hidden");
    document.getElementById("captured-image").classList.add("hidden");
    document.getElementById("btn-capture").classList.remove("hidden");
    document.getElementById("initial-controls").classList.add("hidden");
    document.getElementById("photo-placeholder").classList.add("hidden");
  } catch (e) {
    Swal.fire("Erreur", "Caméra bloquée", "error");
  }
}

export function resetCamera() {
  document.getElementById("captured-image").classList.add("hidden");
  document.getElementById("btn-retake").classList.add("hidden");
  document.getElementById("btn-capture").classList.add("hidden");
  document.getElementById("video-stream").classList.add("hidden");
  document.getElementById("initial-controls").classList.remove("hidden");
  document.getElementById("file-upload").value = "";
  document.getElementById("photo-placeholder").classList.remove("hidden");
  AppState.capturedBlob = null;
  if (AppState.videoStream) {
    AppState.videoStream.getTracks().forEach((t) => t.stop());
    AppState.videoStream = null;
  }
}

export function takeSnapshot() {
  const v = document.getElementById("video-stream"),
    c = document.getElementById("camera-canvas");
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  c.getContext("2d").drawImage(v, 0, 0);
  c.toBlob(
    (b) => {
      AppState.capturedBlob = b;
      const i = document.getElementById("captured-image");
      i.src = URL.createObjectURL(b);
      i.classList.remove("hidden");
      v.classList.add("hidden");
      document.getElementById("btn-capture").classList.add("hidden");
      document.getElementById("btn-retake").classList.remove("hidden");
      if (AppState.videoStream) {
        AppState.videoStream.getTracks().forEach((t) => t.stop());
        AppState.videoStream = null;
      }
    },
    "image/jpeg",
    0.8,
  );
}

export function handleFileUpload(e) {
  const f = e.target.files[0];
  if (f) {
    AppState.capturedBlob = f;
    const i = document.getElementById("captured-image");
    i.src = URL.createObjectURL(f);
    i.classList.remove("hidden");
    document.getElementById("video-stream").classList.add("hidden");
    document.getElementById("initial-controls").classList.add("hidden");
    document.getElementById("btn-retake").classList.remove("hidden");
    document.getElementById("photo-placeholder").classList.add("hidden");
  }
}

export async function openEditModal(id) {
  const e = AppState.employees.find((x) => x.id === id);
  if (!e) return;

  // DEBUG : Supprime ces lignes après le test
  console.log("--- DEBUG MODAL ---");
  console.log("ID recherché:", id);
  console.log("Rôle brut en BDD:", e.role);

  AppState.currentEditingOriginal = { ...e };

  document.getElementById("edit-modal").classList.remove("hidden");
  document.getElementById("edit-id-hidden").value = id;

  // --- VISIBILITÉ DES BLOCS ---
  const perms = AppState.currentUser.permissions || {};
  const blockStatus = document.getElementById("edit-block-status");
  const blockContract = document.getElementById("edit-block-contract");
  const blockHierarchy = document.getElementById("edit-block-hierarchy");

  if (blockContract)
    blockContract.style.display = perms.can_manage_contracts ? "block" : "none";
  if (blockHierarchy)
    blockHierarchy.style.display = perms.can_manage_contracts
      ? "block"
      : "none";
  if (blockStatus)
    blockStatus.style.display =
      perms.can_manage_contracts || perms.can_edit_employee_basic
        ? "block"
        : "none";

  // --- REMPLISSAGE DES DROPDOWNS ---
  await populateManagerSelects();

  const roleSelect = document.getElementById("edit-role");
  if (roleSelect) {
    // ON FORCE LA GÉNÉRATION DES OPTIONS IMMÉDIATEMENT
  const roles = AppState.activeRolesList || [];
    roleSelect.innerHTML =
      '<option value="">-- Sélectionner --</option>' +
      roles
        .map((r) => `<option value="${r.role_name}">${r.role_name}</option>`)
        .join("");
  }

  // --- PETIT DÉLAI DE SÉCURITÉ POUR LE RENDU ---
  setTimeout(() => {
    // 1. Manager & Scope
    const mgrSelect = document.getElementById("edit-manager");
    if (mgrSelect) mgrSelect.value = e.manager_id || "";
    const scopeInput = document.getElementById("edit-scope");
    if (scopeInput) scopeInput.value = (e.scope || []).join(", ");

    // 2. Type & Statut
    document.getElementById("edit-type").value = e.employee_type || "OFFICE";
    document.getElementById("edit-statut").value = e.statut || "Actif";

    // 3. RÔLE (FORÇAGE ET SÉCURITÉ)
    if (roleSelect) {
      // On récupère la valeur propre
      const dbRole = String(e.role || "")
        .trim()
        .toUpperCase();

      // On essaie de trouver le match exact dans les options du menu
      let matchFound = false;
      for (let i = 0; i < roleSelect.options.length; i++) {
        if (roleSelect.options[i].value.toUpperCase() === dbRole) {
          roleSelect.selectedIndex = i;
          matchFound = true;
          break;
        }
      }

      // Si le rôle de la BDD n'est pas trouvé dans la liste des options
      if (!matchFound) {
        console.warn(
          "⚠️ Le rôle " +
            dbRole +
            " n'existe pas dans la config des permissions.",
        );
        // On peut décider de mettre une option vide pour forcer le choix
        roleSelect.value = "";
      }
    }

    // 4. Département & Contrat
    const deptSelect = document.getElementById("edit-dept");
    if (deptSelect) deptSelect.value = e.dept || "IT & Tech";
    const typeSelect = document.getElementById("edit-type-contrat");
    if (typeSelect) typeSelect.value = e.limit || "365";

    const dateInput = document.getElementById("edit-start-date");
    if (dateInput) {
      dateInput.value = e.date
        ? convertToInputDate(e.date)
        : new Date().toISOString().split("T")[0];
    }

    // 5. Finances
    if (document.getElementById("edit-salaire-fixe"))
      document.getElementById("edit-salaire-fixe").value =
        e.salaire_base_fixe || 0;
    if (document.getElementById("edit-indemnite-transport"))
      document.getElementById("edit-indemnite-transport").value =
        e.indemnite_transport || 0;
    if (document.getElementById("edit-indemnite-logement"))
      document.getElementById("edit-indemnite-logement").value =
        e.indemnite_logement || 0;

    document.getElementById("edit-init-check").checked = false;

    console.log("Rôle final affiché dans le menu:", roleSelect.value);
  }, 50);
}

export function closeEditModal() {
  document.getElementById("edit-modal").classList.add("hidden");
}

export async function submitUpdate(e) {
  e.preventDefault();
  const id = document.getElementById("edit-id-hidden").value;

  // 1. Récupération des valeurs actuelles du formulaire
  const newVal = {
    statut: document.getElementById("edit-statut").value,
    role: document.getElementById("edit-role").value,
    dept: document.getElementById("edit-dept").value,
    limit: document.getElementById("edit-type-contrat").value,
    employee_type: document.getElementById("edit-type").value,
    start_date: document.getElementById("edit-start-date").value,
    manager_id: document.getElementById("edit-manager").value || null,
    salaire: document.getElementById("edit-salaire-fixe").value,
    transport: document.getElementById("edit-indemnite-transport").value,
    logement: document.getElementById("edit-indemnite-logement").value,
  };

  // 2. Construction de l'objet de modifications (Delta)
  const changes = {};

  // Comparaison des champs de base
  if (newVal.statut !== AppState.currentEditingOriginal.statut)
    changes.statut = newVal.statut;
  if (newVal.role !== AppState.currentEditingOriginal.role)
    changes.role = newVal.role;
  if (newVal.dept !== AppState.currentEditingOriginal.dept)
    changes.dept = newVal.dept;
  if (newVal.employee_type !== AppState.currentEditingOriginal.employee_type)
    changes.employee_type = newVal.employee_type;

  // Comparaison du manager (attention au type null/string)
  if (newVal.manager_id != AppState.currentEditingOriginal.manager_id) {
    changes.manager_id = newVal.manager_id;
  }

  // Gestion de la hiérarchie (Scope)
  const scopeVal = document.getElementById("edit-scope").value;
  const scopeArray = scopeVal ? scopeVal.split(",").map((s) => s.trim()) : [];
  if (
    JSON.stringify(scopeArray) !==
    JSON.stringify(AppState.currentEditingOriginal.scope || [])
  ) {
    changes.scope = JSON.stringify(scopeArray);
  }

  // --- LOGIQUE CONTRAT ---
  // Si la date de début ou la durée change, on signale qu'il faut recalculer la date de fin
  const originalDate = convertToInputDate(AppState.currentEditingOriginal.date);
  if (
    newVal.start_date !== originalDate ||
    newVal.limit !== AppState.currentEditingOriginal.limit
  ) {
    changes.start_date = newVal.start_date;
    changes.limit = newVal.limit;
    changes.recalculate_contract = "true"; // Signal pour le serveur
  }

  // --- LOGIQUE FINANCES ---
  if (
    parseFloat(newVal.salaire) !==
    parseFloat(AppState.currentEditingOriginal.salaire_base_fixe)
  )
    changes.salaire_brut_fixe = newVal.salaire;

  if (
    parseFloat(newVal.transport) !==
    parseFloat(AppState.currentEditingOriginal.indemnite_transport)
  )
    changes.indemnite_transport = newVal.transport;

  if (
    parseFloat(newVal.logement) !==
    parseFloat(AppState.currentEditingOriginal.indemnite_logement)
  )
    changes.indemnite_logement = newVal.logement;

  // Checkbox spéciale
  const forceInit = document.getElementById("edit-init-check").checked;

  // 3. SÉCURITÉ : Si rien n'a changé, on arrête
  if (Object.keys(changes).length === 0 && !forceInit) {
    Swal.fire("Info", "Aucune modification détectée.", "info");
    closeEditModal();
    return;
  }

  // 4. ENVOI DES DONNÉES CIBLÉES
  Swal.fire({
    title: "Mise à jour...",
    text: "Synchronisation...",
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading(),
  });

  const params = new URLSearchParams({
    id: id,
    agent: AppState.currentUser.nom,
    force_init: forceInit,
    ...changes, // On n'envoie que les clés présentes dans 'changes'
  });

  try {
    const response = await secureFetch(`${URL_UPDATE}?${params.toString()}`);
    if (response.ok) {
      closeEditModal();
      await Swal.fire(
        "Succès",
        "Les modifications ont été enregistrées.",
        "success",
      );
      refreshAllData(true);
    } else {
      throw new Error("Erreur serveur lors de la mise à jour");
    }
  } catch (e) {
    Swal.fire("Erreur", e.message, "error");
  }
}

export async function deleteEmployee(id) {
  // 1. On cherche le nom de l'employé pour personnaliser l'alerte
  const emp = AppState.employees.find((e) => e.id === id);
  const empName = emp ? emp.nom : "ce collaborateur";

  // 2. Alerte de confirmation de sécurité
  const result = await Swal.fire({
    title: "Suppression Définitive",
    text: `Êtes-vous sûr de vouloir supprimer ${empName} ? Cette action effacera son profil, son historique et ses accès au système.`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#ef4444", // Rouge
    cancelButtonColor: "#64748b",
    confirmButtonText: "Oui, supprimer",
    cancelButtonText: "Annuler",
  });

  if (result.isConfirmed) {
    Swal.fire({
      title: "Suppression en cours...",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    try {
      // 3. Appel au serveur via secureFetch pour envoyer le token
      const response = await secureFetch(
        `${SIRH_CONFIG.apiBaseUrl}/delete-employee`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: id, agent: AppState.currentUser.nom }),
        },
      );

      if (response.ok) {
        Swal.fire(
          "Supprimé !",
          "Le collaborateur a été retiré de la base.",
          "success",
        );
        // 4. On rafraîchit la liste immédiatement
        fetchData(true, 1);
      } else {
        const err = await response.json();
        throw new Error(err.error || "Erreur serveur lors de la suppression.");
      }
    } catch (error) {
      console.error(error);
      Swal.fire("Erreur", error.message, "error");
    }
  }
}

export async function openBulkManagerModal() {
  const selectedIds = Array.from(
    document.querySelectorAll(".emp-select-checkbox:checked"),
  ).map((cb) => cb.value);

  if (selectedIds.length === 0) return;

  // On charge une liste large pour le select des managers potentiels
  try {
    const r = await secureFetch(`${URL_READ}?limit=500&status=Actif`);
    const result = await r.json();
    const potentialManagers = result.data || [];

    let options = `<option value="">-- Aucun / Détacher --</option>`;
    potentialManagers.forEach((m) => {
      // On évite de s'auto-sélectionner
      if (!selectedIds.includes(m.id)) {
        options += `<option value="${m.id}">${m.nom} (${m.poste})</option>`;
      }
    });

    const { value: managerId } = await Swal.fire({
      title: `Assigner ${selectedIds.length} personnes`,
      html: `
                <p class="text-sm text-slate-500 mb-4">Choisissez le responsable hiérarchique direct (N+1).</p>
                <select id="bulk-manager-select" class="swal2-input text-sm">${options}</select>
            `,
      showCancelButton: true,
      confirmButtonText: "Valider",
      confirmButtonColor: "#0f172a",
      preConfirm: () => document.getElementById("bulk-manager-select").value,
    });

    if (typeof managerId !== "undefined") {
      Swal.fire({ title: "Mise à jour...", didOpen: () => Swal.showLoading() });

      const res = await secureFetch(
        `${SIRH_CONFIG.apiBaseUrl}/bulk-assign-manager`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employee_ids: selectedIds,
            manager_id: managerId || null,
          }),
        },
      );

      if (res.ok) {
        Swal.fire("Succès", "Hiérarchie mise à jour !", "success");
        fetchData(true); // On rafraîchit la liste
        document.getElementById("bulk-action-bar").classList.add("hidden");
      }
    }
  } catch (e) {
    console.error(e);
    Swal.fire(
      "Erreur",
      "Impossible de charger la liste ou de mettre à jour.",
      "error",
    );
  }
}

export function toggleBulkActions() {
  const checkboxes = document.querySelectorAll(".emp-select-checkbox:checked");
  const bar = document.getElementById("bulk-action-bar");
  const countSpan = document.getElementById("selected-count");

  if (bar && countSpan) {
    if (checkboxes.length > 0) {
      bar.classList.remove("hidden");
      countSpan.innerText = checkboxes.length;
    } else {
      bar.classList.add("hidden");
    }
  }
}

export async function generateDraftContract(id) {
  const e = AppState.employees.find((x) => x.id === id);
  if (!e) return;

  // 1. Affichage d'un loader pro
  Swal.fire({
    title: "Génération du Brouillon...",
    text: "Conversion du modèle en PDF sécurisé...",
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading(),
  });

  try {
    const token = localStorage.getItem("sirh_token");

    // 2. Appel au serveur
    const response = await fetch(
      `${URL_CONTRACT_GENERATE}?id=${id}&token=${token}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (!response.ok) {
      // Si le serveur renvoie une erreur (ex: modèle manquant)
      const err = await response.json();
      throw new Error(err.error || "Erreur lors de la génération");
    }

    // 3. RÉCUPÉRATION DU PDF (BLOB)
    // On ne crée plus de lien <a>, on récupère le flux binaire
    const blob = await response.blob();

    // 4. CRÉATION D'UNE URL VIRTUELLE
    const pdfUrl = window.URL.createObjectURL(blob);

    // 5. AFFICHAGE DANS TON MODAL EXISTANT
    // On ferme le loader et on appelle ta fonction de visualisation
    Swal.close();
    viewDocument(pdfUrl, `Prévisualisation Contrat : ${e.nom}`);

    // Note : On ne révoque pas l'URL immédiatement car l'iframe en a besoin pour afficher le PDF
    // Elle sera nettoyée à la fermeture ou au prochain chargement.
  } catch (error) {
    console.error("Erreur Brouillon:", error);
    Swal.fire("Erreur", error.message, "error");
  }
}

export function openContractModal(id) {
  document.getElementById("contract-id-hidden").value = id;
  document.getElementById("contract-modal").classList.remove("hidden");

  // Initialisation du pad de signature sur le canvas
  const canvas = document.getElementById("signature-pad");
  AppState.signaturePad = new SignaturePad(canvas, {
    backgroundColor: "rgba(255, 255, 255, 0)", // Fond transparent
    penColor: "rgb(0, 0, 0)", // Encre noire
  });

  // Cette partie est CRUCIALE pour que la signature soit précise sur mobile (Retina display)
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  canvas.width = canvas.offsetWidth * ratio;
  canvas.height = canvas.offsetHeight * ratio;
  canvas.getContext("2d").scale(ratio, ratio);
  AppState.signaturePad.clear(); // On vide le cadre au cas où
}
export function closeContractModal() {
  if (AppState.contractStream)
    AppState.contractStream.getTracks().forEach((t) => t.stop());
  document.getElementById("contract-modal").classList.add("hidden");
}

export function clearSignature() {
  if (signaturePad) signaturePad.clear();
}

export function exportToCSV() {
  if (AppState.employees.length === 0) {
    return Swal.fire("Erreur", "Aucune donnée à exporter", "warning");
  }

  // 1. Définir les colonnes à exporter
  const headers = [
    "Matricule",
    "Nom Complet",
    "Poste",
    "Departement",
    "Statut",
    "Email",
    "Telephone",
    "Date Embauche",
    "Duree Contrat",
  ];

  // 2. Préparer les données
  let csvContent = headers.join(";") + "\n"; // Utilisation du point-virgule pour Excel France

  AppState.employees.forEach((e) => {
    const row = [
      e.id, // Index 0
      e.nom, // Index 1
      e.poste, // Index 2
      e.dept, // Index 3
      e.statut, // Index 4
      e.email || "", // Index 5
      e.telephone || "", // Index 6 (Le coupable)
      e.date || "", // Index 7
      e.limit, // Index 8
    ];

    // Nettoyage des données et formatage forcé pour Excel
    const cleanRow = row.map((val, index) => {
      let str = String(val).replace(/"/g, '""'); // Gère les guillemets internes

      // PROTECTION : Si c'est le Matricule (0) ou le Téléphone (6)
      // On ajoute \t (tabulation) au début pour forcer Excel à lire du TEXTE
      if (index === 0 || index === 6) {
        return `"\t${str}"`;
      }

      return `"${str}"`;
    });
    csvContent += cleanRow.join(";") + "\n";
  });

  // 3. Créer le fichier et le télécharger
  // Utilisation du BOM UTF-8 (\ufeff) pour les accents et du Blob pour le binaire
  const blob = new Blob(["\ufeff" + csvContent], {
    type: "text/csv;charset=utf-8;",
  });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  const dateStr = new Date().toLocaleDateString("fr-FR").replace(/\//g, "-");

  link.setAttribute("href", url);
  link.setAttribute("download", `Rapport_Effectif_${dateStr}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  const Toast = Swal.mixin({
    toast: true,
    position: "top-end",
    showConfirmButton: false,
    timer: 3000,
  });
  Toast.fire({ icon: "success", title: "Exportation réussie !" });
}

export async function submitSignedContract() {
  if (!AppState.signaturePad || AppState.signaturePad.isEmpty()) {
    return Swal.fire(
      "Attention",
      "Veuillez signer avant de valider.",
      "warning",
    );
  }

  const id = document.getElementById("contract-id-hidden").value;
  const signatureBase64 = AppState.signaturePad.toDataURL();

  Swal.fire({
    title: "Signature en cours...",
    text: "Incrustation dans le document Word...",
    didOpen: () => Swal.showLoading(),
    allowOutsideClick: false,
  });

  try {
    const r = await secureFetch(URL_UPLOAD_SIGNED_CONTRACT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: id,
        signature: signatureBase64,
        agent: AppState.currentUser.nom,
      }),
    });

    const result = await r.json(); // On récupère le JSON, pas le texte HTML

    if (r.ok && result.status === "success") {
      closeContractModal();

      // Succès ! On propose de voir le fichier
      Swal.fire({
        icon: "success",
        title: "Contrat Signé !",
        text: "Le document Word a été généré avec votre signature.",
        showCancelButton: true,
        confirmButtonText: "📥 Télécharger",
        cancelButtonText: "Fermer",
      }).then((choice) => {
        if (choice.isConfirmed) {
          window.open(result.url, "_blank");
        }
      });
      refreshAllData(true);
    } else {
      throw new Error(result.error || "Erreur lors de la signature");
    }
  } catch (e) {
    console.error(e);
    Swal.fire("Erreur", e.message, "error");
  }
}

export async function triggerManualContractUpload(employeeId) {
  const { value: file } = await Swal.fire({
    title: "Contrat scanné / Physique",
    text: "Sélectionnez le PDF ou prenez une photo du contrat signé manuellement.",
    input: "file",
    inputAttributes: {
      accept: "application/pdf,image/*",
      "aria-label": "Uploader le contrat",
    },
    showCancelButton: true,
    confirmButtonText: "Envoyer le document",
    confirmButtonColor: "#10b981",
    cancelButtonText: "Annuler",
  });

  if (file) {
    Swal.fire({
      title: "Envoi en cours...",
      text: "Le fichier est en cours d'archivage dans Airtable",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    // Préparation du FormData
    const fd = new FormData();
    fd.append("id", employeeId);
    fd.append("contract_file", file); // Le fichier binaire
    fd.append("mode", "manual_scan");
    fd.append("agent", AppState.currentUser.nom);

    try {
      // UTILISATION DE secureFetch POUR ENVOYER LE TOKEN
      const response = await secureFetch(URL_UPLOAD_SIGNED_CONTRACT, {
        method: "POST",
        body: fd,
        // Note : On ne définit PAS de headers ici,
        // secureFetch s'en occupe et le navigateur gère le "multipart/form-data"
      });

      if (response.ok) {
        Swal.fire(
          "Succès !",
          "Le contrat scanné a été enregistré avec succès.",
          "success",
        );
        refreshAllData();
      } else {
        // Si on arrive ici, secureFetch a déjà levé une erreur normalement
        throw new Error("Le serveur a répondu avec une erreur.");
      }
    } catch (error) {
      console.error("Erreur Upload:", error);
      Swal.fire(
        "Échec",
        "Impossible d'envoyer le fichier : " + error.message,
        "error",
      );
    }
  }
}

export async function downloadMyBadge() {
  // 1. Sécurité : Vérifier que la liste n'est pas vide
  if (!AppState.employees || AppState.employees.length === 0) {
    return Swal.fire("Patientez", "Le système charge vos données...", "info");
  }

  // 2. LOGIQUE DE RECHERCHE IDENTIQUE À loadMyProfile (qui fonctionne chez toi)
  const cleanUser = AppState.currentUser.nom
    .toLowerCase()
    .replace(/[\.-_]/g, " ")
    .trim();

  let myData = AppState.employees.find((e) => {
    const cleanEmp = e.nom
      .toLowerCase()
      .replace(/[\.-_]/g, " ")
      .trim();
    return cleanEmp.includes(cleanUser) || cleanUser.includes(cleanEmp);
  });

  // 3. Fallback par ID au cas où
  if (!myData && AppState.currentUser.id) {
    myData = AppState.employees.find(
      (e) => String(e.id) === String(AppState.currentUser.id),
    );
  }

  // 4. Si on ne trouve toujours rien
  if (!myData) {
    console.error(
      "Badge Error: Impossible de trouver cet l'employé",
      AppState.currentUser.nom,
    );
    return Swal.fire(
      "Erreur",
      "Impossible de localiser votre fiche employé pour générer le badge.",
      "error",
    );
  }

  // 5. Lancement de la génération
  const token = localStorage.getItem("sirh_token");
  Swal.fire({
    title: "Génération du badge...",
    text: "Veuillez patienter",
    didOpen: () => Swal.showLoading(),
    allowOutsideClick: false,
  });

  try {
    // On formate la photo pour qu'elle soit visible sur le badge
    const photoUrl = myData.photo ? formatGoogleLink(myData.photo) : "";

    // Construction de l'URL vers ton API de badge
    const url = `${URL_BADGE_GEN}?id=${encodeURIComponent(myData.id)}&nom=${encodeURIComponent(myData.nom)}&poste=${encodeURIComponent(myData.poste)}&photo=${encodeURIComponent(photoUrl)}&agent=${encodeURIComponent(AppState.currentUser.nom)}&token=${token}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error("Erreur serveur");

    const htmlContent = await response.text();
    Swal.close();

    // Ouverture de la fenêtre d'impression
    const w = window.open("", "_blank", "width=450,height=700");
    if (w) {
      w.document.open();
      w.document.write(htmlContent);
      w.document.close();
    } else {
      Swal.fire(
        "Pop-up bloqué",
        "Veuillez autoriser les fenêtres surgissantes pour voir votre badge.",
        "warning",
      );
    }
  } catch (error) {
    console.error(error);
    Swal.fire("Erreur", "Une erreur technique est survenue.", "error");
  }
}

export async function printBadge(id) {
  const e = AppState.employees.find((x) => x.id === id);
  if (!e) return;

  // On récupère le token
  const token = localStorage.getItem("sirh_token");

  Swal.fire({ title: "Génération...", didOpen: () => Swal.showLoading() });

  try {
    // On construit l'URL
    const url = `${URL_BADGE_GEN}?id=${encodeURIComponent(id)}&nom=${encodeURIComponent(e.nom)}&poste=${encodeURIComponent(e.poste)}&photo=${encodeURIComponent(formatGoogleLink(e.photo) || "")}&agent=${encodeURIComponent(AppState.currentUser.nom)}&token=${token}`;

    // AU LIEU DE FAIRE window.open(url)...
    // On va chercher le contenu (le code HTML du badge)
    const response = await fetch(url);

    if (!response.ok) throw new Error("Erreur génération");

    // On récupère le texte HTML
    const htmlContent = await response.text();

    // On ferme le loader
    Swal.close();

    // On ouvre une fenêtre vide
    const w = window.open("", "_blank", "width=400,height=600");

    // On écrit le HTML dedans manuellement
    w.document.open();
    w.document.write(htmlContent);
    w.document.close();

    // Petit délai pour laisser les images charger avant d'imprimer (si le HTML contient un script d'impression auto, ça marchera aussi)
    w.onload = function () {
      // Optionnel : forcer l'impression si le HTML ne le fait pas déjà
      // w.print();
    };
  } catch (error) {
    console.error(error);
    Swal.fire(
      "Erreur",
      "Impossible de générer le badge : " + error.message,
      "error",
    );
  }
}

export function openFormEditor() {
  Swal.fire({
    title: "Modifier le formulaire ?",
    text: "Vous allez être redirigé vers l'interface de modification d'Airtable.",
    icon: "info",
    showCancelButton: true,
    confirmButtonText: "Y aller",
    cancelButtonText: "Annuler",
    confirmButtonColor: "#0f172a",
  }).then((result) => {
    if (result.isConfirmed) {
      window.open(AIRTABLE_FORM_EDIT_LINK, "_blank");
    }
  });
}

export function copyFormLink() {
  navigator.clipboard
    .writeText(AIRTABLE_FORM_PUBLIC_LINK)
    .then(() => {
      const Toast = Swal.mixin({
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true,
      });

      Toast.fire({
        icon: "success",
        title: "Lien copié !",
        text: "Vous pouvez maintenant l'envoyer au candidat.",
      });
    })
    .catch((err) => {
      Swal.fire(
        "Erreur",
        "Impossible de copier le lien automatiquement.",
        "error",
      );
    });
}

export async function handleCandidateAction(id, action) {
  const conf = {
    VALIDER_POUR_ENTRETIEN: {
      t: "Inviter en entretien ?",
      c: "#2563eb",
      txt: "Un email d'invitation sera envoyé automatiquement.",
    },
    REFUS_IMMEDIAT: {
      t: "Refuser la candidature ?",
      c: "#ef4444",
      txt: "Un email de refus immédiat sera envoyé.",
    },
    ACCEPTER_EMBAUCHE: {
      t: "Confirmer l'embauche ?",
      c: "#10b981",
      txt: "Cela créera le profil employé et enverra les accès.",
    },
    REFUS_APRES_ENTRETIEN: {
      t: "Refuser après entretien ?",
      c: "#f97316",
      txt: "Un email de refus personnalisé sera envoyé.",
    },
  }[action];

  const res = await Swal.fire({
    title: conf.t,
    text: conf.txt,
    icon: "question",
    showCancelButton: true,
    confirmButtonColor: conf.c,
    confirmButtonText: "Oui, confirmer",
    cancelButtonText: "Annuler",
  });

  if (res.isConfirmed) {
    let employeeType = "OFFICE"; // Valeur par défaut
    let chosenDept = "À définir";

    // --- SI EMBAUCHE : ON DEMANDE LE TYPE ET LE DEPARTEMENT ---
    if (action === "ACCEPTER_EMBAUCHE") {
      const depRes = await secureFetch(
        `${SIRH_CONFIG.apiBaseUrl}/list-departments`,
      );
      const depts = await depRes.json();
      let deptOptions = depts
        .map((d) => `<option value="${d.code}">${d.label}</option>`)
        .join("");

      const { value: selection } = await Swal.fire({
        title: "Paramètres d'embauche",
        html: `
                    <div class="text-left">
                        <label class="block text-[10px] font-black text-slate-400 uppercase mb-1">Type d'activité</label>
                        <select id="swal-emp-type" class="swal2-input !mt-0">
                            <option value="OFFICE">🏢 Bureau (Fixe)</option>
                            <option value="FIXED">🏠 Agent Site (Fixe)</option>
                            <option value="MOBILE">🚗 Délégué (Nomade)</option>
                        </select>

                        <label class="block text-[10px] font-black text-slate-400 uppercase mt-4 mb-1">Affectation Département</label>
                        <select id="swal-dept" class="swal2-input !mt-0">
                            <option value="">-- Sélectionner --</option>
                            ${deptOptions}
                        </select>
                    </div>
                `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonColor: "#10b981",
        preConfirm: () => {
          const type = document.getElementById("swal-emp-type").value;
          const dept = document.getElementById("swal-dept").value;
          if (!dept) {
            Swal.showValidationMessage("Veuillez choisir un département");
            return false;
          }
          return { employeeType: type, department: dept };
        },
      });

      if (!selection) return; // Annulation
      employeeType = selection.employeeType;
      chosenDept = selection.department;
    }

    // Affichage du loader
    Swal.fire({
      title: "Action en cours...",
      text: "Mise à jour du dossier...",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    try {
      const response = await secureFetch(URL_CANDIDATE_ACTION, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: id,
          action: action,
          agent: AppState.currentUser.nom,
          employee_type: employeeType,
          departement: chosenDept,
        }),
      });

      const result = await response.json();

      if (result && result.status === "success") {
        Swal.fire("Succès", "Action effectuée avec succès.", "success");
        fetchCandidates();
        if (action === "ACCEPTER_EMBAUCHE") fetchData(true);
      } else {
        throw new Error(result.error || "Le serveur n'a pas confirmé l'action");
      }
    } catch (e) {
      Swal.fire("Échec du traitement", e.message, "error");
    }
  }
}

export function showCandidateDocs(safeNom, poste, cv, lm, dip, att, idCard) {
  const nom = decodeURIComponent(safeNom);

  const docs = [
    {
      id: "cv",
      label: "CV",
      url: cv ? decodeURIComponent(cv) : null,
      icon: "fa-file-user",
      color: "blue",
    },
    {
      id: "lm",
      label: "Lettre Motiv.",
      url: lm ? decodeURIComponent(lm) : null,
      icon: "fa-envelope-open-text",
      color: "pink",
    },
    {
      id: "id_card",
      label: "Pièce Identité",
      url: idCard ? decodeURIComponent(idCard) : null,
      icon: "fa-id-card",
      color: "purple",
    },
    {
      id: "dip",
      label: "Diplôme",
      url: dip ? decodeURIComponent(dip) : null,
      icon: "fa-graduation-cap",
      color: "emerald",
    },
    {
      id: "att",
      label: "Attestation",
      url: att ? decodeURIComponent(att) : null,
      icon: "fa-file-invoice",
      color: "orange",
    },
  ];

  // --- COLONNE GAUCHE (Menu) ---
  let buttonsHtml =
    '<div class="flex flex-col gap-2 overflow-y-auto pr-1 custom-scroll" style="max-height: 350px;">';
  let firstDocUrl = null;
  let hasDocs = false;

  docs.forEach((d) => {
    if (d.url && d.url !== "null" && d.url.length > 5) {
      hasDocs = true;
      if (!firstDocUrl) firstDocUrl = d.url;

      buttonsHtml += `
                <button onclick="changePreview('${d.url}', this)" 
                    class="doc-btn w-full flex items-center gap-2 p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-all text-left group shadow-sm">
                    <div class="w-8 h-8 shrink-0 rounded-lg bg-${d.color}-50 flex items-center justify-center text-${d.color}-600 group-hover:scale-110 transition-transform">
                        <i class="fa-solid ${d.icon} text-sm"></i>
                    </div>
                    <div class="overflow-hidden flex-1 min-w-0">
                        <p class="text-[9px] font-black text-slate-400 uppercase tracking-wide truncate">DOC</p>
                        <p class="text-xs font-bold text-slate-700 truncate">${d.label}</p>
                    </div>
                </button>
            `;
    }
  });
  buttonsHtml += "</div>";

  if (!hasDocs) {
    buttonsHtml = `<div class="p-4 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-center text-slate-400 text-xs italic">Aucun document</div>`;
  }

  // --- LOGIQUE D'AFFICHAGE ---
  window.changePreview = function (url, btn) {
    // 1. Style des boutons
    document.querySelectorAll(".doc-btn").forEach((b) => {
      b.classList.remove("ring-2", "ring-blue-500", "bg-blue-50/50");
      b.classList.add("bg-white", "border-slate-200");
    });
    if (btn) {
      btn.classList.remove("bg-white", "border-slate-200");
      btn.classList.add("ring-2", "ring-blue-500", "bg-blue-50/50");
    }

    const viewerFrame = document.getElementById("doc-viewer-frame");
    const viewerImg = document.getElementById("doc-viewer-img");
    const extLink = document.getElementById("external-link-btn");
    const container = document.getElementById("preview-container");

    if (extLink) extLink.href = url;

    // 2. Détection IMAGE vs AUTRE (PDF)
    // On considère comme image : les extensions classiques OU les liens Airtable hébergeant des images
    // Les liens Airtable ressemblent souvent à v5.airtableusercontent...
    const isImageExtension = url.match(/\.(jpeg|jpg|gif|png|webp|bmp)$/i);
    const isAirtableImage =
      url.includes("airtableusercontent") &&
      !url.toLowerCase().includes(".pdf");

    // SÉCURITÉ : Google Drive ID
    const driveMatch =
      url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
    let finalUrl = url;

    if (driveMatch) {
      // Conversion Drive -> Image directe
      finalUrl = `https://lh3.googleusercontent.com/d/${driveMatch[1]}`;
      viewerFrame.classList.add("hidden");
      viewerImg.classList.remove("hidden");
      viewerImg.src = finalUrl;
    } else if (isImageExtension || isAirtableImage) {
      // C'EST UNE IMAGE (Airtable ou autre)
      viewerFrame.classList.add("hidden");
      viewerImg.classList.remove("hidden");
      viewerImg.src = url;

      // Réglage du conteneur pour le scroll
      container.classList.remove("overflow-hidden");
      container.classList.add("overflow-y-auto", "overflow-x-hidden");
    } else {
      // C'EST UN PDF (ou autre fichier) -> IFRAME
      viewerImg.classList.add("hidden");
      viewerFrame.classList.remove("hidden");

      // Ajustement URL Drive pour PDF
      if (url.includes("drive.google.com") && url.includes("/view"))
        finalUrl = url.replace("/view", "/preview");

      viewerFrame.src = finalUrl;

      // Pour l'iframe, on laisse le conteneur hidden car l'iframe a son propre scroll
      container.classList.add("overflow-hidden");
      container.classList.remove("overflow-y-auto");
    }
  };

  // --- HTML SWEETALERT ---
  Swal.fire({
    title: null,
    html: `
            <div class="flex flex-col md:flex-row h-[500px] gap-4 text-left">
                
                <!-- GAUCHE : MENU (25%) -->
                <div class="w-full md:w-[25%] flex flex-col h-full border-r border-slate-100 pr-2">
                    <div class="mb-4">
                        <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Candidat</p>
                        <h2 class="text-xl font-extrabold text-slate-800 leading-tight mb-1 truncate">${nom}</h2>
                        <span class="inline-block bg-blue-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wide">
                            ${poste}
                        </span>
                    </div>
                    
                    <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Fichiers</p>
                    ${buttonsHtml}

                    <div class="mt-auto pt-2">
                        <button onclick="Swal.close()" class="w-full py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-xs hover:bg-slate-200 transition-colors uppercase">
                            Fermer
                        </button>
                    </div>
                </div>

                <!-- DROITE : APERÇU (75%) -->
                <!-- 
                     id="preview-container" : C'est lui qui gère le scroll.
                     overflow-x-hidden : TUE le scroll horizontal.
                     overflow-y-auto : ACTIVE le scroll vertical si l'image est grande.
                -->
                <div id="preview-container" class="w-full md:w-[75%] h-full bg-slate-900 rounded-xl border border-slate-200 relative flex flex-col items-center shadow-inner overflow-x-hidden overflow-y-auto custom-scroll">
                    
                    ${
                      hasDocs
                        ? `
                        <div class="absolute top-3 right-3 z-10 sticky">
                            <a id="external-link-btn" href="${firstDocUrl || "#"}" target="_blank" class="bg-white/90 backdrop-blur text-slate-700 px-3 py-1.5 rounded-lg text-[10px] font-bold shadow-sm border hover:text-blue-600 transition-all flex items-center gap-1">
                                <i class="fa-solid fa-up-right-from-square"></i> Ouvrir
                            </a>
                        </div>
                        
                        <!-- IFRAME (PDF) : Prend 100% hauteur -->
                        <iframe id="doc-viewer-frame" src="" class="w-full h-full bg-white hidden" frameborder="0"></iframe>
                        
                        <!-- IMG : Largeur 100% (w-full) et Hauteur Auto (h-auto) 
                             Cela force l'image à toucher les bords gauche/droite (pas de scroll H)
                             mais à s'allonger vers le bas (scroll V) -->
                        <img id="doc-viewer-img" class="w-full h-auto min-h-full bg-black/5 hidden object-top">

                    `
                        : `
                        <div class="w-full h-full flex flex-col items-center justify-center text-slate-500">
                            <i class="fa-solid fa-file-circle-xmark text-5xl opacity-20 mb-3"></i>
                            <p class="text-xs font-medium">Aucun aperçu</p>
                        </div>
                    `
                    }
                </div>
            </div>
        `,
    width: "1000px",
    showConfirmButton: false,
    showCloseButton: false,
    padding: "1.5rem",
    customClass: {
      popup: "rounded-[1.5rem] viewer-modal",
      htmlContainer: "!m-0",
    },
    didOpen: () => {
      const firstBtn = document.querySelector(".doc-btn");
      if (firstBtn) {
        const onclickStr = firstBtn.getAttribute("onclick");
        const url = onclickStr.split("'")[1];
        window.changePreview(url, firstBtn);
      }
    },
  });
}

export async function fetchCandidates() {
  const body = document.getElementById("candidates-body");
  body.innerHTML =
    '<tr><td colspan="4" class="p-8 text-center"><i class="fa-solid fa-circle-notch fa-spin text-blue-600 text-2xl"></i><p class="text-xs text-slate-400 mt-2 font-bold uppercase">Chargement des talents...</p></td></tr>';

  try {
    const r = await secureFetch(
      `${URL_READ_CANDIDATES}?agent=${encodeURIComponent(AppState.currentUser.nom)}`,
    );
    let rawData = await r.json();

    let candidates = [];
    if (Array.isArray(rawData)) {
      candidates = rawData;
    } else if (typeof rawData === "object" && rawData !== null) {
      candidates = rawData.data || rawData.items || [rawData];
    }

    body.innerHTML = "";

    if (candidates.length === 0) {
      body.innerHTML =
        '<tr><td colspan="4" class="p-8 text-center text-slate-400 font-bold bg-slate-50 rounded-xl border border-dashed border-slate-200">Aucune candidature en attente</td></tr>';
      return;
    }

    candidates.forEach((c) => {
      // --- CORRECTION 1 : Utiliser nom_complet au lieu de nom ---
      const displayNom = c.nom_complet || c.Nom_complet || c.nom || "Inconnu";
      const safeNom = encodeURIComponent(displayNom);

      // --- CORRECTION 2 : Utiliser id au lieu de record_id ---
      const safeId = c.id;

      const getAttachmentUrl = (attachment) => {
        if (!attachment) return null;
        if (Array.isArray(attachment) && attachment.length > 0)
          return attachment[0].url;
        if (typeof attachment === "string" && attachment.startsWith("http"))
          return attachment;
        return null;
      };

      const cvLink = getAttachmentUrl(c.cv_url); // c.cv_url correspond à votre colonne Supabase
      const lMLink = getAttachmentUrl(c.lm_url);
      const dipLink = getAttachmentUrl(c.diploma_url);
      const attLink = getAttachmentUrl(c.attestation_url);
      const idCardLink = getAttachmentUrl(c.id_card_url);

      const safeCv = cvLink ? encodeURIComponent(cvLink) : "";
      const safeLm = lMLink ? encodeURIComponent(lMLink) : "";
      const safeDip = dipLink ? encodeURIComponent(dipLink) : "";
      const safeAtt = attLink ? encodeURIComponent(attLink) : "";
      const safeIdCard = idCardLink ? encodeURIComponent(idCardLink) : "";

      let stRaw = c.statut || "Nouveau";
      let stLogic = stRaw.toString().toLowerCase().trim();

      let badgeClass = "bg-slate-100 text-slate-600";

      if (stLogic.includes("entretien"))
        badgeClass = "bg-blue-100 text-blue-700";
      else if (stLogic.includes("embauché") || stLogic.includes("validé"))
        badgeClass = "bg-emerald-100 text-emerald-700";
      else if (stLogic.includes("refus")) badgeClass = "bg-red-50 text-red-500";
      else if (stLogic.includes("nouveau"))
        badgeClass = "bg-yellow-50 text-yellow-700";

      const btnDocs = `
                <button onclick="window.showCandidateDocs('${safeNom}', '${c.poste_vise || "Candidat"}', '${safeCv}', '${safeLm}', '${safeDip}', '${safeAtt}', '${safeIdCard}')" 
                        class="p-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:text-blue-600 hover:border-blue-200 shadow-sm transition-all mr-2" title="Ouvrir le dossier">
                    <i class="fa-solid fa-folder-open"></i>
                </button>
            `;

      let actionButtons = "";

      // --- CORRECTION 3 : Utiliser safeId (qui est c.id) dans les appels de fonction ---
      if (stLogic === "nouveau" || !c.statut) {
        actionButtons = `
                    ${btnDocs}
                    <button onclick="window.handleCandidateAction('${safeId}', 'VALIDER_POUR_ENTRETIEN')" class="bg-blue-600 text-white hover:bg-blue-700 px-3 py-2 rounded-lg text-[10px] font-bold uppercase shadow-md shadow-blue-200 transition-all mr-2"><i class="fa-solid fa-calendar-check mr-1"></i> Entretien</button>
                    <button onclick="window.handleCandidateAction('${safeId}', 'REFUS_IMMEDIAT')" class="bg-white border border-red-100 text-red-500 hover:bg-red-50 px-3 py-2 rounded-lg text-[10px] font-bold uppercase transition-all"><i class="fa-solid fa-xmark mr-1"></i> Refus</button>
                `;
      } else if (stLogic === "entretien") {
        actionButtons = `
                    ${btnDocs}
                    <button onclick="window.handleCandidateAction('${safeId}', 'ACCEPTER_EMBAUCHE')" class="bg-emerald-500 text-white hover:bg-emerald-600 px-3 py-2 rounded-lg text-[10px] font-bold uppercase shadow-md shadow-emerald-200 transition-all mr-2"><i class="fa-solid fa-user-plus mr-1"></i> Embaucher</button>
                    <button onclick="window.handleCandidateAction('${safeId}', 'REFUS_APRES_ENTRETIEN')" class="bg-white border border-orange-100 text-orange-500 hover:bg-orange px-3 py-2 rounded-lg text-[10px] font-bold uppercase transition-all"><i class="fa-solid fa-thumbs-down mr-1"></i> Refus</button>
                `;
      } else {
        actionButtons = `${btnDocs} <span class="text-[10px] font-bold text-slate-300 italic">Dossier Traité</span>`;
      }

      body.innerHTML += `
            <tr class="border-b hover:bg-slate-50 transition-colors group">
                <td class="px-6 py-4">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500">${displayNom.charAt(0)}</div>
                        <div>
                            <!-- CORRECTION : Affichage de displayNom -->
                            <div class="font-bold text-sm text-slate-800">${displayNom}</div>
                            <div class="text-[10px] text-slate-400 font-mono">${c.email}</div>
                        </div>
                    </div>
                </td>
                <!-- CORRECTION : poste_vise au lieu de poste -->
                <td class="px-6 py-4 text-xs font-bold text-slate-600 uppercase tracking-tight">${c.poste_vise || "Non précisé"}</td>
                <td class="px-6 py-4 text-center">
                    <span class="${badgeClass} px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wide border border-black/5 shadow-sm">${stRaw}</span>
                </td>
                <td class="px-6 py-4 text-right flex justify-end items-center">
                    ${actionButtons}
                </td>
            </tr>`;
    });
  } catch (e) {
    console.error("Erreur Candidats:", e);
    body.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-red-500 font-bold text-sm bg-red-50 rounded-xl border border-red-100">Erreur de chargement : ${e.message}</td></tr>`;
  }
}

export async function fetchMyActivityRecap() {
  console.log("🚀 DÉBUT fetchMyActivityRecap (Filtrage Chronologique)");

  const visitContainer = document.getElementById("my-today-visits");
  const dailyContainer = document.getElementById("my-month-dailies");
  if (!visitContainer) return;

  visitContainer.innerHTML =
    '<div class="text-center py-4"><i class="fa-solid fa-spinner fa-spin text-blue-500"></i></div>';
  if (dailyContainer)
    dailyContainer.innerHTML =
      '<div class="text-center py-4"><i class="fa-solid fa-spinner fa-spin text-blue-500"></i></div>';

  try {
    const timeHack = Date.now();
    const [visRes, daiRes] = await Promise.all([
      secureFetch(
        `${SIRH_CONFIG.apiBaseUrl}/read-visit-reports?limit=1000&personal=true&t=${timeHack}`,
      ),
      secureFetch(
        `${SIRH_CONFIG.apiBaseUrl}/read-daily-reports?limit=100&personal=true&t=${timeHack}`,
      ),
    ]);

    const allVisits = await visRes.json();
    const allDailies = await daiRes.json();

    const now = new Date();
    const todayLocal = now.toLocaleDateString();

    // --- CALCUL DE LA LIMITE DES 31 JOURS ---
    const thirtyOneDaysAgo = new Date();
    thirtyOneDaysAgo.setDate(now.getDate() - 31);

    // 3. Filtrage Visites : Aujourd'hui seulement + Tri Récent en haut
    const myVisits = (allVisits.data || allVisits)
      .filter((v) => {
        if (v.employee_id !== AppState.currentUser.id) return false;
        const vDate = new Date(v.check_in).toLocaleDateString();
        return vDate === todayLocal;
      })
      .sort((a, b) => new Date(b.check_in) - new Date(a.check_in)); // Tri décroissant

    console.log(`✅ VISITES D'AUJOURD'HUI : ${myVisits.length}`);

    // 4. Affichage Visites
    if (myVisits.length > 0) {
      visitContainer.innerHTML = myVisits
        .map(
          (v) => `
                <div class="flex items-center justify-between p-3 bg-blue-50 rounded-xl border border-blue-100 mb-2 animate-fadeIn">
                    <div>
                        <p class="text-[10px] font-black text-blue-700 uppercase">${v.lieu_nom}</p>
                        <p class="text-[9px] text-slate-400">
                            ${new Date(v.check_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                    </div>
                    <span class="text-[9px] font-bold bg-white px-2 py-1 rounded shadow-sm text-emerald-600">${v.outcome || "VU"}</span>
                </div>
            `,
        )
        .join("");
    } else {
      visitContainer.innerHTML =
        '<div class="text-center py-6 border border-dashed rounded-xl"><p class="text-[10px] text-slate-400 italic">0 visite trouvée pour ce jour.</p></div>';
    }

    // 5. Filtrage Bilans : 31 derniers jours + Tri Récent en haut
    const myDailies = (allDailies.data || allDailies)
      .filter((d) => {
        if (d.employee_id !== AppState.currentUser.id) return false;
        const dDate = new Date(d.report_date);
        return dDate >= thirtyOneDaysAgo; // Règle des 31 jours
      })
      .sort((a, b) => new Date(b.report_date) - new Date(a.report_date)); // Tri décroissant

    console.log(`✅ BILANS DES 31 JOURS : ${myDailies.length}`);

    // Affichage Bilans
    if (myDailies.length > 0) {
      dailyContainer.innerHTML = myDailies
        .map(
          (d) => `
                <div class="p-3 bg-slate-50 rounded-xl border border-slate-100 mb-2 animate-fadeIn">
                    <p class="text-[9px] font-black text-slate-500 mb-1">${new Date(d.report_date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}</p>
                    <p class="text-[10px] text-slate-600 italic line-clamp-1">${d.summary}</p>
                </div>
            `,
        )
        .join("");
    } else {
      dailyContainer.innerHTML =
        '<div class="text-center py-6 border border-dashed rounded-xl"><p class="text-[10px] text-slate-400 italic">0 bilan sur les 31 derniers jours.</p></div>';
    }
  } catch (e) {
    console.error("❌ CRASH FETCH PROFIL:", e);
    visitContainer.innerHTML =
      '<p class="text-[10px] text-red-500">Erreur technique</p>';
  }
}

export async function startContractCamera() {
  try {
    AppState.contractStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
    });
    const v = document.getElementById("contract-video");
    v.srcObject = AppState.contractStream;
    v.classList.remove("hidden");
    document.getElementById("contract-img-preview").classList.add("hidden");
    document.getElementById("contract-icon").classList.add("hidden");
    document.getElementById("btn-contract-capture").classList.remove("hidden");
  } catch (e) {
    Swal.fire("Erreur", "Caméra inaccessible", "error");
  }
}

export function takeContractSnapshot() {
  const v = document.getElementById("contract-video");
  const c = document.createElement("canvas");
  c.width = v.videoWidth;
  c.height = v.videoHeight;
  c.getContext("2d").drawImage(v, 0, 0);
  c.toBlob(
    (blob) => {
      AppState.contractBlob = blob;
      const img = document.getElementById("contract-img-preview");
      img.src = URL.createObjectURL(blob);
      img.classList.remove("hidden");
      v.classList.add("hidden");
      document.getElementById("btn-contract-capture").classList.add("hidden");
      if (AppState.contractStream) {
        AppState.contractStream.getTracks().forEach((t) => t.stop());
        AppState.contractStream = null;
      }
    },
    "image/jpeg",
    0.8,
  );
}

export function previewContractFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  AppState.contractBlob = file;
  if (file.type.includes("image")) {
    const img = document.getElementById("contract-img-preview");
    img.src = URL.createObjectURL(file);
    img.classList.remove("hidden");
    document.getElementById("contract-icon").classList.add("hidden");
  }
}

export function resetContractCamera() {
  AppState.contractBlob = null;
  document.getElementById("contract-img-preview").classList.add("hidden");
  document.getElementById("contract-video").classList.add("hidden");
  document.getElementById("contract-icon").classList.remove("hidden");
  document.getElementById("btn-contract-capture").classList.add("hidden");
  if (AppState.contractStream)
    AppState.contractStream.getTracks().forEach((t) => t.stop());
}
