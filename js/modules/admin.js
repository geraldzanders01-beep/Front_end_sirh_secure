import { AppState } from "../core/state.js";
import {
  SIRH_CONFIG,
  URL_GET_CONFIG,
  URL_READ_LOGS,
  URL_WRITE_FLASH,
  URL_READ_FLASH,
  URL_READ_REPORT,
} from "../core/config.js";
import { secureFetch } from "../core/api.js";
import { CSVManager, escapeHTML, triggerGlobalPush } from "../core/utils.js";

export async function fetchLogs(page = 1) {
  // Accepte un paramètre de page
  const tbody = document.getElementById("logs-body");
  if (!tbody) return;

  // Affiche un loader pendant le chargement
  tbody.innerHTML =
    '<tr><td colspan="4" class="p-6 text-center italic text-slate-400"><i class="fa-solid fa-circle-notch fa-spin mr-2"></i> Chargement des logs...</td></tr>';

  AppState.logsPage = page; // Met à jour la page actuelle

  try {
    const r = await secureFetch(
      `${URL_READ_LOGS}?page=${page}&limit=20&agent=${encodeURIComponent(AppState.currentUser.nom)}`,
    );
    const result = await r.json();

    const raw = result.data || [];
    const meta = result.meta || { total: raw.length, page: 1, last_page: 1 };

    AppState.logsTotalPages = meta.last_page; // Met à jour le nombre total de pages

    tbody.innerHTML = ""; // Vide l'ancien contenu

    if (raw.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-slate-400 italic">Aucun log trouvé pour cette page.</td></tr>`;
      return;
    }

    raw.forEach((log) => {
      const dateF = log.created_at
        ? new Date(log.created_at).toLocaleString("fr-FR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "-";

      tbody.innerHTML += `
                <tr class="border-b hover:bg-slate-50 transition-colors">
                    <td class="p-4 text-xs font-mono">${dateF}</td>
                    <td class="p-4 font-bold text-slate-700">${escapeHTML(log.agent || "Système")}</td>
                    <td class="p-4"><span class="bg-blue-50 text-blue-600 px-2 py-1 rounded text-[10px] font-black">${escapeHTML(log.action || "-")}</span></td>
                    <td class="p-4 text-xs text-slate-500">${escapeHTML(log.details || "-")}</td>
                </tr>`;
    });

    // --- INJECTION DES BOUTONS DE PAGINATION ---
    const logsContainer = document.getElementById("view-logs");
    const oldPagination = document.getElementById("logs-pagination-controls");
    if (oldPagination) oldPagination.remove(); // Supprime l'ancienne barre si elle existe

    const paginationHtml = `
            <div id="logs-pagination-controls" class="flex justify-between items-center mt-6 p-4 bg-white rounded-2xl border shadow-sm animate-fadeIn">
                <button onclick="window.fetchLogs(${AppState.logsPage - 1})" ${AppState.logsPage <= 1 ? "disabled" : ""} 
                    class="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase text-slate-600 disabled:opacity-30 hover:bg-slate-100 transition-all shadow-sm">
                    <i class="fa-solid fa-chevron-left"></i> Précédent
                </button>
                <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Page ${AppState.logsPage} / ${AppState.logsTotalPages}</span>
                <button onclick="window.fetchLogs(${AppState.logsPage + 1})" ${AppState.logsPage >= AppState.logsTotalPages ? "disabled" : ""} 
                    class="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase text-slate-600 disabled:opacity-30 hover:bg-slate-100 transition-all shadow-sm">
                    Suivant <i class="fa-solid fa-chevron-right"></i>
                </button>
            </div>
        `;
    if (logsContainer)
      logsContainer.insertAdjacentHTML("beforeend", paginationHtml);
  } catch (e) {
    console.error("Erreur fetchLogs:", e);
    tbody.innerHTML = `<tr><td colspan="4" class="text-red-500 p-4 font-bold text-center">${escapeHTML(e.message || "Erreur de chargement des logs.")}</td></tr>`;
  }
}

export async function fetchCompanyConfig() {
  try {
    const response = await secureFetch(
      `${URL_GET_CONFIG}?agent=${encodeURIComponent(AppState.currentUser.nom)}&type=zones`,
    );
    const data = await response.json();

    if (Array.isArray(data) && data.length > 0) {
      SIRH_CONFIG.gps.offices = data.map((z) => {
        // On log pour debug si besoin : console.log("Zone brute reçue:", z);
        return {
          name: z.Nom || z.name || "Bureau",
          lat: parseFloat(z.Latitude || z.latitude || z.lat),
          lon: parseFloat(z.Longitude || z.longitude || z.lon),
          radius: parseInt(z.Rayon || z.rayon || z.radius) || 100,
        };
      });
      console.log(
        "✅ Configuration GPS mise à jour :",
        SIRH_CONFIG.gps.offices,
      );
    }
  } catch (e) {
    console.warn("⚠️ Erreur zones GPS :", e);
  }
}

export async function fetchProducts() {
  const grid = document.getElementById("products-grid");
  if (!grid) return;
  grid.innerHTML =
    '<div class="col-span-full text-center py-20"><i class="fa-solid fa-circle-notch fa-spin text-blue-500 text-3xl"></i></div>';

  try {
    const r = await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/list-products`);
    const products = await r.json();
    AppState.allProductsData = products;
    grid.innerHTML = "";
    // DROIT DE MODIFICATION : Un délégué n'a pas la permission 'can_manage_config'
    const canManage = AppState.currentUser.permissions?.can_manage_config;

    products.forEach((p) => {
      // On prend la 1ère photo du tableau photo_urls, sinon placeholder
      const photos = p.photo_urls || [];
      const thumb =
        photos.length > 0
          ? photos[0]
          : "https://via.placeholder.com/300x200?text=Pas+d+image";

      grid.innerHTML += `
                <div class="product-card bg-white rounded-[1.5rem] border border-slate-100 shadow-sm overflow-hidden group hover:shadow-xl transition-all" data-name="${p.name.toLowerCase()}">
                    <div class="h-48 bg-slate-50 relative overflow-hidden">
                        <img src="${thumb}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                        
                        <!-- BADGE NOMBRE DE PHOTOS -->
                        <div class="absolute top-3 left-3 bg-black/40 backdrop-blur text-white text-[8px] font-black px-2 py-1 rounded-lg">
                            <i class="fa-solid fa-images mr-1"></i> ${photos.length}
                        </div>

                        <!-- ACTIONS ADMIN UNIQUEMENT -->
                        ${
                          canManage
                            ? `
                        <div class="absolute top-3 right-3 flex gap-2">
                            <button onclick="openEditProductModal('${p.id}')" class="w-8 h-8 bg-white text-blue-600 rounded-full shadow-lg hover:bg-blue-600 hover:text-white transition-all">
                                <i class="fa-solid fa-pen text-[10px]"></i>
                            </button>
                            <button onclick="deleteProduct('${p.id}')" class="w-8 h-8 bg-white text-red-500 rounded-full shadow-lg hover:bg-red-500 hover:text-white transition-all">
                                <i class="fa-solid fa-trash-can text-[10px]"></i>
                            </button>
                        </div>`
                            : ""
                        }
                    </div>

                    <div class="p-5">
                        <h4 class="font-black text-slate-800 uppercase text-xs mb-4 truncate">${p.name}</h4>
                        <button onclick="viewProductDetail('${p.id}')" class="w-full py-3 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-blue-600 transition-all">
                            Voir la fiche
                        </button>
                    </div>
                </div>`;
    });
  } catch (e) {
    console.error(e);
  }
}



/**
 * Supprime un produit du catalogue
 */
export async function deleteProduct(id) {
  // 1. Demande de confirmation sécurisée
  const confirm = await Swal.fire({
    title: "Supprimer ce produit ?",
    text: "Le produit sera retiré du catalogue définitivement.",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#ef4444", // Rouge
    cancelButtonColor: "#64748b",
    confirmButtonText: "Oui, supprimer",
    cancelButtonText: "Annuler",
  });

  if (confirm.isConfirmed) {
    Swal.fire({
      title: "Suppression en cours...",
      didOpen: () => Swal.showLoading(),
    });

    try {
      // 2. Appel à l'API backend
      const r = await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/delete-product`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            id: id,
            agent: AppState.currentUser.nom 
        }),
      });

      if (r.ok) {
        Swal.fire("Supprimé !", "Le produit a été retiré du catalogue.", "success");
        // 3. Rafraîchir la grille des produits immédiatement
        fetchProducts(); 
      } else {
        throw new Error("Erreur lors de la suppression sur le serveur.");
      }
    } catch (e) {
      console.error(e);
      Swal.fire("Erreur", e.message, "error");
    }
  }
}

export async function openSaveProductModal(existingId = null) {
  // 1. Si on est en mode édition, on récupère les données du produit
  const p = existingId
    ? AppState.allProductsData.find((item) => item.id == existingId)
    : null;
  const title = p ? "Modifier le Produit" : "Nouveau Produit";

  const { value: formValues } = await Swal.fire({
    title: `<span class="text-xl font-black uppercase tracking-tight">${title}</span>`,
    width: "800px",
    customClass: { popup: "rounded-[2rem]" },
    html: `
            <div class="text-left space-y-6 p-2">
                <!-- LIGNE 1 : NOM ET CATEGORIE -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label class="text-[10px] font-black text-slate-400 uppercase ml-2">Nom du produit / Médicament</label>
                        <input id="p-name" class="swal2-input !mt-1" placeholder="Ex: Paracétamol 500mg" value="${p ? p.name : ""}">
                    </div>
                    <div>
                        <label class="text-[10px] font-black text-slate-400 uppercase ml-2">Catégorie</label>
                        <select id="p-category" class="swal2-input !mt-1">
                            <option value="ANTALGIQUE" ${p?.category === "ANTALGIQUE" ? "selected" : ""}>Antalgique</option>
                            <option value="ANTIBIOTIQUE" ${p?.category === "ANTIBIOTIQUE" ? "selected" : ""}>Antibiotique</option>
                            <option value="MATERIEL" ${p?.category === "MATERIEL" ? "selected" : ""}>Matériel Médical</option>
                            <option value="AUTRE" ${p?.category === "AUTRE" ? "selected" : ""}>Autre</option>
                        </select>
                    </div>
                </div>

                <!-- LIGNE 2 : DESCRIPTION ET INFOS TECHNIQUES -->
                <div>
                    <label class="text-[10px] font-black text-slate-400 uppercase ml-2">Description Commerciale</label>
                    <textarea id="p-desc" class="swal2-textarea !mt-1" style="height:100px" placeholder="Arguments de vente, présentation...">${p ? p.description : ""}</textarea>
                </div>

                <!-- LIGNE 3 : PHOTOS MULTIPLES -->
                <div class="p-5 bg-blue-50 rounded-2xl border-2 border-dashed border-blue-100">
                    <label class="flex flex-col items-center justify-center cursor-pointer">
                        <i class="fa-solid fa-images text-2xl text-blue-400 mb-2"></i>
                        <span class="text-xs font-bold text-blue-600">Sélectionner plusieurs photos</span>
                        <input type="file" id="p-files" class="hidden" multiple accept="image/*" onchange="updateFileCountFeedback(this)">
                        <p id="file-count-label" class="text-[9px] text-blue-400 mt-1 uppercase font-black"></p>
                    </label>
                </div>
                
                ${p ? `<p class="text-[9px] text-orange-500 font-bold italic text-center">Note : Les nouvelles photos seront ajoutées à celles déjà existantes.</p>` : ""}
            </div>
        `,
    showCancelButton: true,
    confirmButtonText: "Enregistrer la fiche",
    confirmButtonColor: "#2563eb",
    preConfirm: () => {
      const name = document.getElementById("p-name").value;
      if (!name) return Swal.showValidationMessage("Le nom est obligatoire");
      return {
        id: existingId,
        name: name,
        description: document.getElementById("p-desc").value,
        files: document.getElementById("p-files").files,
      };
    },
  });

  if (formValues) {
    Swal.fire({
      title: "Enregistrement...",
      didOpen: () => Swal.showLoading(),
    });

    const fd = new FormData();
    if (formValues.id) fd.append("id", formValues.id);
    fd.append("name", formValues.name);
    fd.append("description", formValues.description);
    fd.append("agent", AppState.currentUser.nom);

    // On boucle sur les fichiers (c'est ça qui permet le multi-photo)
    for (let i = 0; i < formValues.files.length; i++) {
      fd.append("photos", formValues.files[i]);
    }

    try {
      const r = await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/save-product`, {
        method: "POST",
        body: fd,
      });
      if (r.ok) {
        Swal.fire("Succès", "Fiche produit enregistrée", "success");
        fetchProducts(); // On rafraîchit la grille
      }
    } catch (e) {
      Swal.fire("Erreur", e.message, "error");
    }
  }
}

export function viewProductDetail(id) {
  const p = AppState.allProductsData.find((item) => item.id == id);
  if (!p) return;

  const photos = p.photo_urls || [];
  let currentIndex = 0;

  // Fonction de mise à jour du carrousel interne
  const updateCarousel = () => {
    const imgEl = document.getElementById("modal-carousel-img");
    const counterEl = document.getElementById("carousel-counter");
    if (imgEl) imgEl.src = photos[currentIndex];
    if (counterEl)
      counterEl.innerText = `${currentIndex + 1} / ${photos.length}`;
  };

  // On attache les fonctions au window pour qu'elles soient cliquables dans le HTML de Swal
  window.movePhoto = (dir) => {
    currentIndex = (currentIndex + dir + photos.length) % photos.length;
    updateCarousel();
  };

  Swal.fire({
    width: "950px",
    padding: "0",
    showConfirmButton: false,
    showCloseButton: true,
    customClass: { popup: "rounded-[2.5rem] overflow-hidden" },
    html: `
            <div class="flex flex-col md:flex-row text-left bg-white h-auto md:h-[600px]">
                
                <!-- GAUCHE : VISUEL PRODUIT (Carrousel) -->
                <div class="w-full md:w-1/2 bg-slate-900 relative flex items-center justify-center group">
                    <img id="modal-carousel-img" src="${photos[0] || "https://via.placeholder.com/600x600?text=Pas+d'image"}" 
                         class="w-full h-full object-contain transition-all duration-500">
                    
                    <!-- Contrôles du carrousel -->
                    ${
                      photos.length > 1
                        ? `
                        <button onclick="window.movePhoto(-1)" class="absolute left-4 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md text-white transition-all">
                            <i class="fa-solid fa-chevron-left"></i>
                        </button>
                        <button onclick="window.movePhoto(1)" class="absolute right-4 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md text-white transition-all">
                            <i class="fa-solid fa-chevron-right"></i>
                        </button>
                        <div id="carousel-counter" class="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-xl text-white text-[10px] font-black px-4 py-1.5 rounded-full border border-white/20">
                            1 / ${photos.length}
                        </div>
                    `
                        : ""
                    }
                </div>

                <!-- DROITE : CONTENU TECHNIQUE -->
                <div class="w-full md:w-1/2 p-10 flex flex-col">
                    <div class="flex-1 overflow-y-auto custom-scroll pr-4">
                        <div class="flex items-center gap-2 mb-4">
                            <span class="bg-blue-600 text-white text-[9px] font-black px-2 py-1 rounded uppercase tracking-widest shadow-lg shadow-blue-500/20">Produit Officiel</span>
                            <span class="text-[10px] font-bold text-slate-400 font-mono">ID: ${p.id.toString().substring(0, 8)}</span>
                        </div>
                        
                        <h3 class="text-3xl font-black text-slate-800 leading-tight mb-2 uppercase tracking-tighter">${p.name}</h3>
                        <p class="text-blue-500 font-bold text-xs uppercase tracking-widest mb-8">Médicament Répertorié</p>

                        <div class="space-y-8">
                            <div>
                                <h4 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                    <i class="fa-solid fa-file-lines text-blue-500"></i> Description Technique
                                </h4>
                                <p class="text-sm text-slate-600 leading-relaxed italic bg-slate-50 p-4 rounded-2xl border border-slate-100 shadow-inner">
                                    "${p.description || "Aucune information technique renseignée pour le moment."}"
                                </p>
                            </div>

                            <div class="grid grid-cols-2 gap-4">
                                <div class="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                    <p class="text-[9px] font-black text-slate-400 uppercase mb-1">Stock disponible</p>
                                    <p class="text-sm font-black text-emerald-600">OUI ✓</p>
                                </div>
                                <div class="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                    <p class="text-[9px] font-black text-slate-400 uppercase mb-1">Dernière MAJ</p>
                                    <p class="text-sm font-bold text-slate-700">${new Date().toLocaleDateString()}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="mt-8 pt-6 border-t border-slate-100 flex gap-3">
                        <button onclick="Swal.close()" class="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl active:scale-95 transition-all">
                            Fermer
                        </button>
                    </div>
                </div>
            </div>
        `,
  });
}

export function filterProductsLocally() {
  const term = document
    .getElementById("search-product-input")
    .value.toLowerCase();
  document.querySelectorAll(".product-card").forEach((card) => {
    const name = card.dataset.name;
    card.style.display = name.includes(term) ? "" : "none";
  });
}

export async function fetchZones() {
  const container = document.getElementById("zones-container");
  if (!container) return;

  try {
    const r = await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/list-zones`);
    const zones = await r.json();

    container.innerHTML = "";
    zones.forEach((z) => {
      container.innerHTML += `
                <div class="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden group">
                    <div class="flex justify-between items-start mb-4">
                        <div class="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-xl">
                            <i class="fa-solid fa-building-shield"></i>
                        </div>
                        <button onclick="deleteZone(${z.id})" class="text-slate-300 hover:text-red-500 transition-colors">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                    <h3 class="font-black text-lg text-slate-800 uppercase tracking-tighter">${z.nom}</h3>
                    <p class="text-[10px] text-slate-400 font-bold uppercase mb-4">Rayon : ${z.rayon}m</p>
                    
                    <div class="bg-slate-50 p-3 rounded-xl text-[10px] font-mono text-slate-500">
                        LAT: ${z.latitude} <br> LON: ${z.longitude}
                    </div>
                    
                    <div class="mt-4 flex items-center gap-2">
                        <span class="w-2 h-2 rounded-full ${z.actif ? "bg-emerald-500" : "bg-slate-300"}"></span>
                        <span class="text-[10px] font-black uppercase text-slate-400">${z.actif ? "Zone Active" : "Désactivée"}</span>
                    </div>
                </div>
            `;
    });
  } catch (e) {
    console.error(e);
  }
}

export async function openAddZoneModal() {
  // On propose à l'admin d'utiliser sa position actuelle
  const { value: formValues } = await Swal.fire({
    title: "Ajouter un nouveau siège",
    html:
      '<input id="swal-nom" class="swal2-input" placeholder="Nom (ex: Siège Cotonou)">' +
      '<input id="swal-lat" class="swal2-input" placeholder="Latitude">' +
      '<input id="swal-lon" class="swal2-input" placeholder="Longitude">' +
      '<input id="swal-ray" class="swal2-input" type="number" value="100" placeholder="Rayon (mètres)">' +
      '<button onclick="useCurrentLocation()" class="mt-2 text-[10px] font-black text-blue-600 uppercase underline">Utiliser ma position actuelle</button>',
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: "Enregistrer la zone",
    preConfirm: () => {
      return {
        nom: document.getElementById("swal-nom").value,
        lat: document.getElementById("swal-lat").value,
        lon: document.getElementById("swal-lon").value,
        rayon: document.getElementById("swal-ray").value,
      };
    },
  });

  if (formValues) {
    if (!formValues.nom || !formValues.lat || !formValues.lon)
      return Swal.fire("Erreur", "Tous les champs sont requis", "error");

    const response = await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/add-zone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formValues),
    });

    if (response.ok) {
      Swal.fire("Zone ajoutée !", "", "success");
      fetchZones();
      // On force la mise à jour de la config GPS globale
      fetchCompanyConfig();
    }
  }
}

export async function deleteZone(id) {
  const confirm = await Swal.fire({
    title: "Supprimer cette zone ?",
    text: "Le pointage ne sera plus possible ici.",
    icon: "warning",
    showCancelButton: true,
  });
  if (confirm.isConfirmed) {
    await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/delete-zone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchZones();
    fetchCompanyConfig();
  }
}

export function useCurrentLocation() {
  navigator.geolocation.getCurrentPosition((pos) => {
    document.getElementById("swal-lat").value = pos.coords.latitude;
    document.getElementById("swal-lon").value = pos.coords.longitude;
  });
}

export async function fetchTemplates() {
  const tbody = document.getElementById("templates-body");
  if (!tbody) return;

  tbody.innerHTML =
    '<tr><td colspan="4" class="p-6 text-center italic text-slate-400"><i class="fa-solid fa-circle-notch fa-spin mr-2"></i> Chargement des modèles...</td></tr>';

  try {
    const r = await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/list-templates`);
    const templates = await r.json();

    tbody.innerHTML = "";
    if (templates.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="4" class="p-10 text-center text-slate-400 italic">Aucun modèle de contrat configuré. Cliquez sur "Uploader" pour commencer.</td></tr>';
      return;
    }

    templates.forEach((t) => {
      // On sécurise le nom du fichier pour éviter les bugs si y'a des apostrophes
      const safeLabel = t.label.replace(/'/g, "\\'");

      tbody.innerHTML += `
                <tr class="border-b hover:bg-slate-50 transition-all group">
                    <td class="px-6 py-4 font-black uppercase text-blue-600 text-xs">${t.role_target}</td>
                    <td class="px-6 py-4">
                        <div class="font-bold text-slate-700 text-sm">${t.label}</div>
                        <div class="text-[9px] text-slate-400 uppercase font-medium">Modèle de document</div>
                    </td>
                    <td class="px-6 py-4">
                        <span class="bg-blue-50 text-blue-600 px-2 py-1 rounded text-[10px] font-bold border border-blue-100">
                            <i class="fa-solid fa-file-word mr-1"></i> DOCX
                        </span>
                    </td>
                    <td class="px-6 py-4 text-right">
                        <!-- CORRECTION : On appelle viewDocument qui va ouvrir le Modal -->
                        <button onclick="window.viewDocument('${t.template_file_url}', '${safeLabel}')" class="p-2 text-slate-400 hover:text-blue-600" title="Voir le fichier"><i class="fa-solid fa-eye"></i></button>
                        
                        <button onclick="deleteTemplate('${t.id}')" class="p-2 text-slate-200 hover:text-red-500" title="Supprimer"><i class="fa-solid fa-trash-can"></i></button>
                    </td>
                </tr>
            `;
    });
  } catch (e) {
    console.error("Erreur templates:", e);
    tbody.innerHTML =
      '<tr><td colspan="4" class="p-6 text-red-500 font-bold text-center text-xs">Erreur de chargement des modèles.</td></tr>';
  }
}

export async function openAddTemplateModal() {
  // 1. On affiche un petit chargement pendant qu'on récupère les rôles
  Swal.fire({
    title: "Chargement des rôles...",
    didOpen: () => Swal.showLoading(),
  });

  try {
    // 2. Récupération des rôles réels de Supabase
    const response = await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/list-roles`);
    const roles = await response.json();

    // 3. On génère les options du menu déroulant dynamiquement
    const roleOptions = AppState.activeRolesList
      .map((r) => `<option value="${r.role_name}">${r.role_name}</option>`)
      .join("");

    // 4. On ouvre la vraie modale avec la liste à jour
    const { value: formValues } = await Swal.fire({
      title: "Uploader un Modèle Word",
      html: `
                <div class="text-left">
                    <label class="block text-[10px] font-black text-slate-400 uppercase mb-1">Rôle Cible (Base de données)</label>
                        <select id="swal-tpl-role" class="swal2-input !mt-0">
                            <option value="">-- Choisir le rôle ciblé --</option>
                            ${roleOptions}
                        </select>

                    <label class="block text-[10px] font-black text-slate-400 uppercase mt-4 mb-1">Libellé du modèle (ex: Contrat de garde)</label>
                    <input id="swal-tpl-label" class="swal2-input !mt-0" placeholder="Nom du document...">

                    <label class="block text-[10px] font-black text-slate-400 uppercase mt-4 mb-1">Fichier Word (.docx)</label>
                    <input type="file" id="swal-tpl-file" class="swal2-file !mt-0" accept=".docx">
                </div>
            `,
      showCancelButton: true,
      confirmButtonText: "Enregistrer le modèle",
      preConfirm: () => {
        const role = document.getElementById("swal-tpl-role").value;
        const label = document.getElementById("swal-tpl-label").value;
        const file = document.getElementById("swal-tpl-file").files[0];

        if (!role || !label || !file) {
          Swal.showValidationMessage("Tous les champs sont obligatoires.");
          return false;
        }
        return { role, label, file };
      },
    });

    // 5. Envoi au serveur (reste inchangé)
    if (formValues) {
      const fd = new FormData();
      fd.append("role_target", formValues.role);
      fd.append("label", formValues.label);
      fd.append("template_file", formValues.file);
      fd.append("agent", AppState.currentUser.nom);

      const upRes = await secureFetch(
        `${SIRH_CONFIG.apiBaseUrl}/upload-template`,
        {
          method: "POST",
          body: fd,
        },
      );

      if (upRes.ok) {
        Swal.fire("Succès !", "Modèle enregistré.", "success");
        fetchTemplates();
      }
    }
  } catch (e) {
    console.error(e);
    Swal.fire("Erreur", "Impossible de charger les rôles de la base.", "error");
  }
}

export async function deleteTemplate(id) {
  const confirm = await Swal.fire({
    title: "Archiver ce modèle ?",
    text: "Il ne sera plus proposé pour les futurs contrats, mais restera conservé dans l'historique pour les employés actuels.",
    icon: "info",
    showCancelButton: true,
    confirmButtonColor: "#0f172a",
    confirmButtonText: "Oui, archiver",
    cancelButtonText: "Annuler",
  });

  if (confirm.isConfirmed) {
    Swal.fire({ title: "Suppression...", didOpen: () => Swal.showLoading() });

    try {
      const response = await secureFetch(
        `${SIRH_CONFIG.apiBaseUrl}/delete-template`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: id }),
        },
      );

      if (response.ok) {
        Swal.fire("Supprimé !", "Le modèle a été retiré.", "success");
        fetchTemplates(); // Rafraîchit le tableau
      } else {
        throw new Error("Erreur lors de la suppression sur le serveur.");
      }
    } catch (e) {
      console.error(e);
      Swal.fire("Erreur", e.message, "error");
    }
  }
}

export async function submitFlashMessage(e) {
  e.preventDefault();

  const msgInput = document.getElementById("flash-input-msg");
  const typeInput = document.getElementById("flash-input-type");
  const durationInput = document.getElementById("flash-input-duration");

  if (!msgInput || !durationInput) return;

  const msg = msgInput.value;
  const type = typeInput ? typeInput.value : "Info";
  const durationMinutes = parseFloat(durationInput.value);

  const now = new Date();
  // CALCUL : Maintenant + (Minutes choisies * 60 000 ms)
  const expirationDate = new Date(now.getTime() + durationMinutes * 60000);

  Swal.fire({ title: "Publication...", didOpen: () => Swal.showLoading() });

  try {
    const response = await secureFetch(URL_WRITE_FLASH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: msg,
        type: type,
        sender: AppState.currentUser.nom,
        date: now.toISOString(),
        date_expiration: expirationDate.toISOString(),
        agent: AppState.currentUser.nom,
      }),
    });

    if (response.ok) {
      document.getElementById("flash-modal").classList.add("hidden");
      const timeStr = expirationDate.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      Swal.fire(
        "Succès !",
        `L'alerte est publiée. Elle expirera à ${timeStr}`,
        "success",
      );
      // On rafraîchit l'affichage pour voir le message immédiatement
      setTimeout(() => fetchFlashMessage(), 1000);
    }
  } catch (e) {
    console.error("Erreur envoi flash:", e);
    Swal.fire(
      "Erreur",
      "Le serveur n'a pas reçu l'info. Vérifie ta connexion.",
      "error",
    );
  }
}

export async function fetchFlashMessage() {
  const container = document.getElementById("flash-container");
  if (!container) return;

  try {
    const r = await secureFetch(
      `${URL_READ_FLASH}?agent=${encodeURIComponent(AppState.currentUser.nom)}`,
    );
    let messages = await r.json();
    if (!Array.isArray(messages)) messages = messages ? [messages] : [];

    const lastNotifId = localStorage.getItem("last_flash_id");

    container.innerHTML = "";
    const normalize = (s) =>
      String(s || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

    messages.forEach((data, index) => {
      const msgText = data.Message || data.message;
      const msgSender = data.Sender || data.sender;
      const msgType = data.Type || data.type || "Info";
      const msgId = String(data.id); // Utilisation de l'ID réel de la base de données

      // Filtrage : ne pas afficher si le message est vide ou si on en est l'auteur
      if (
        !msgText ||
        normalize(msgSender) === normalize(AppState.currentUser.nom)
      )
        return;

      // --- LOGIQUE PUSH NOTIFICATION ---
      // Si c'est le message le plus récent et qu'on ne l'a pas encore notifié
      if (index === 0) {
        if (lastNotifId !== msgId) {
          triggerGlobalPush(`NOUVELLE ANNONCE : ${msgType}`, msgText);
          localStorage.setItem("last_flash_id", msgId);
        }
      }

      // Ne pas afficher si l'utilisateur a fermé cette annonce durant sa session
      const msgKey = `flash_closed_${msgId}`;
      if (sessionStorage.getItem(msgKey)) return;

      const styles = {
        Info: {
          bg: "bg-gradient-to-r from-blue-600 to-indigo-600",
          icon: "fa-circle-info",
        },
        Urgent: {
          bg: "bg-gradient-to-r from-red-600 to-rose-600",
          icon: "fa-triangle-exclamation",
        },
        Maintenance: {
          bg: "bg-gradient-to-r from-yellow-500 to-orange-500",
          icon: "fa-screwdriver-wrench",
        },
      };
      const st = styles[msgType] || styles["Info"];

      container.innerHTML += `
                    <div id="flash-msg-${msgId}" class="${st.bg} rounded-2xl p-4 text-white shadow-lg relative overflow-hidden mb-3">
                        <div class="relative z-10 flex items-start gap-4">
                            <div class="p-3 bg-white/20 rounded-xl"><i class="fa-solid ${st.icon} text-xl animate-pulse"></i></div>
                            <div class="flex-1">
                                <div class="flex justify-between items-start">
                                    <p class="text-[9px] font-black uppercase opacity-80">${msgType} • PAR ${msgSender.toUpperCase()}</p>
                                    <button onclick="window.closeSpecificFlash('${msgKey}', 'flash-msg-${msgId}')"><i class="fa-solid fa-xmark"></i></button>
                                </div>
                                <p class="font-bold text-sm">${msgText}</p>
                            </div>
                        </div>
                    </div>`;
    });
  } catch (e) {
    console.warn("Erreur chargement Flash:", e);
  }
}

export function closeFlashBanner() {
  const banner = document.getElementById("flash-banner");
  if (banner.dataset.key) {
    sessionStorage.setItem(banner.dataset.key, "true"); // Mémorise la fermeture pour la session
  }
  banner.classList.add("hidden");
}

export function openFlashModal() {
  document.getElementById("flash-modal").classList.remove("hidden");
  document.getElementById("flash-input-msg").value = "";
}

export function closeSpecificFlash(storageKey, elementId) {
  sessionStorage.setItem(storageKey, "true");
  const el = document.getElementById(elementId);
  if (el) {
    el.style.opacity = "0";
    el.style.transform = "translateX(20px)";
    setTimeout(() => el.remove(), 500);
  }
}

export async function triggerRobotCheck() {
  if (
    AppState.currentUser.role === "ADMIN" ||
    AppState.currentUser.role === "RH"
  ) {
    try {
      const response = await secureFetch(
        `${SIRH_CONFIG.apiBaseUrl}/check-returns?agent=Robot`,
      );
      const data = await response.json();

      if (data.alerts && data.alerts.length > 0) {
        // On affiche une notification visuelle à l'Admin
        data.alerts.forEach((alert) => {
          Swal.fire({
            icon: "warning",
            title: "Alerte Absence",
            text: alert.message,
            toast: true,
            position: "top-end",
            showConfirmButton: false,
            timer: 10000,
          });
        });
      }
    } catch (e) {
      console.log("Robot en sommeil...");
    }
  }
}

export async function runArchivingJob() {
  const confirm = await Swal.fire({
    title: "Lancer la maintenance ?",
    text: "Cela va déplacer les vieilles données vers les archives et supprimer les anciennes photos de visite pour libérer de l'espace.",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#0f172a",
    confirmButtonText: "Oui, nettoyer maintenant",
  });

  if (confirm.isConfirmed) {
    Swal.fire({
      title: "Maintenance en cours...",
      didOpen: () => Swal.showLoading(),
    });

    try {
      const r = await secureFetch(
        `${SIRH_CONFIG.apiBaseUrl}/run-archiving-job`,
        { method: "POST" },
      );
      const data = await r.json();
      localStorage.setItem("sirh_last_maint", new Date().toISOString());

      Swal.fire({
        title: "Terminé !",
        html: `
                    <div class="text-left text-sm">
                        <p><strong>Logs archivés :</strong> ${data.report.logs}</p>
                        <p><strong>Photos supprimées :</strong> ${data.report.photos_deleted}</p>
                        <p><strong>Employés archivés :</strong> ${data.report.employees}</p>
                    </div>
                `,
        icon: "success",
      });
    } catch (e) {
      Swal.fire("Erreur", e.message, "error");
    }
  }
}

export function triggerCSVImport() {
  document.getElementById("csv-file-input").click();
}

export function downloadLocationsTemplate() {
  // Ce sont les en-têtes exacts que le système cherchera
  const headers = ["Nom_Lieu", "Latitude", "Longitude", "Adresse", "Type"];
  CSVManager.downloadTemplate(headers, "Modele_Import_Lieux.csv");
}

export async function exportLocations() {
  try {
    const r = await secureFetch(
      `${SIRH_CONFIG.apiBaseUrl}/list-mobile-locations`,
    );
    const locs = await r.json();

    const cleanData = locs.map((l) => ({
      Nom_Lieu: l.name,
      Latitude: l.latitude,
      Longitude: l.longitude,
      Adresse: l.address || "",
      Type: l.type_location || "",
    }));

    CSVManager.exportData(
      cleanData,
      `Export_Lieux_${new Date().toISOString().split("T")[0]}.csv`,
    );
  } catch (e) {
    Swal.fire("Erreur", "Impossible d'exporter les données", "error");
  }
}

export async function handleCSVFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  Swal.fire({
    title: "Analyse en cours...",
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading(),
  });

  try {
    // On exige uniquement que ces 3 colonnes soient présentes, peu importe leur position !
    const requiredColumns = ["nom_lieu", "latitude", "longitude"];

    // Le Moteur CSV fait le sale boulot
    const parsedData = await CSVManager.parseAndValidate(file, requiredColumns);

    // Mapping propre pour envoyer au serveur
    const locationsToInsert = parsedData
      .map((row) => ({
        name: row["nom_lieu"],
        latitude: parseFloat(row["latitude"]?.replace(",", ".")), // Gère la virgule française
        longitude: parseFloat(row["longitude"]?.replace(",", ".")),
        address: row["adresse"] || "",
        type_location: row["type"] || "PHARMACIE",
        radius: 50,
        is_active: true,
      }))
      .filter((loc) => !isNaN(loc.latitude) && !isNaN(loc.longitude)); // On vire les lignes où les GPS sont cassés

    if (locationsToInsert.length === 0) {
      throw new Error("Aucune donnée GPS valide trouvée dans le fichier.");
    }

    // Envoi au backend
    const response = await secureFetch(
      `${SIRH_CONFIG.apiBaseUrl}/import-locations`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locations: locationsToInsert }),
      },
    );

    if (response.ok) {
      Swal.fire(
        "Succès !",
        `${locationsToInsert.length} lieux importés.`,
        "success",
      );
      window.fetchMobileLocations(); // Rafraîchit l'écran
    } else {
      const err = await response.json();
      throw new Error(err.error);
    }
  } catch (errMsg) {
    Swal.fire("Échec de l'import", errMsg, "error");
  } finally {
    event.target.value = ""; // Reset l'input file pour pouvoir ré-uploader le même fichier
  }
}

export function triggerZonesCSVImport() {
  document.getElementById("csv-zones-input").click();
}

export function downloadPrescripteursTemplate() {
  const headers = ["Nom_Complet", "Fonction", "Telephone"];
  CSVManager.downloadTemplate(headers, "Modele_Import_Prescripteurs.csv");
}

export async function exportPrescripteurs() {
  try {
    const r = await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/list-prescripteurs`);
    const data = await r.json();

    const cleanData = data.map((p) => ({
      Nom_Complet: p.nom_complet,
      Fonction: p.fonction || "Médecin",
      Telephone: p.telephone || "",
    }));

    CSVManager.exportData(
      cleanData,
      `Export_Prescripteurs_${new Date().toISOString().split("T")[0]}.csv`,
    );
  } catch (e) {
    Swal.fire("Erreur", "Impossible d'exporter les données", "error");
  }
}

export async function handlePrescripteursCSV(event) {
  const file = event.target.files[0];
  if (!file) return;

  Swal.fire({
    title: "Analyse en cours...",
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading(),
  });

  try {
    const requiredColumns = ["nom_complet", "fonction"];
    const parsedData = await CSVManager.parseAndValidate(file, requiredColumns);

    const dataToInsert = parsedData
      .map((row) => ({
        nom_complet: row["nom_complet"],
        fonction: row["fonction"],
        telephone: row["telephone"] || null,
        is_active: true,
      }))
      .filter((p) => p.nom_complet); // On ignore les lignes sans nom

    if (dataToInsert.length === 0)
      throw new Error("Aucune donnée valide trouvée.");

    const response = await secureFetch(
      `${SIRH_CONFIG.apiBaseUrl}/import-prescripteurs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prescripteurs: dataToInsert }),
      },
    );

    if (response.ok) {
      Swal.fire(
        "Succès !",
        `${dataToInsert.length} contacts importés.`,
        "success",
      );
      window.fetchPrescripteursManagement();
    } else {
      const err = await response.json();
      throw new Error(err.error);
    }
  } catch (errMsg) {
    Swal.fire("Échec de l'import", errMsg, "error");
  } finally {
    event.target.value = "";
  }
}

export function downloadZonesTemplate() {
  const headers = ["Nom_Siege", "Latitude", "Longitude", "Rayon"];
  CSVManager.downloadTemplate(headers, "Modele_Import_Sieges.csv");
}

export async function exportZones() {
  try {
    const r = await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/list-zones`);
    const data = await r.json();
    const cleanData = data.map((z) => ({
      Nom_Siege: z.nom,
      Latitude: z.latitude,
      Longitude: z.longitude,
      Rayon: z.rayon,
    }));
    CSVManager.exportData(
      cleanData,
      `Export_Sieges_${new Date().toISOString().split("T")[0]}.csv`,
    );
  } catch (e) {
    Swal.fire("Erreur", "Export impossible", "error");
  }
}

export async function handleZonesCSVFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  Swal.fire({
    title: "Analyse en cours...",
    text: "Validation des données...",
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading(),
  });

  try {
    // 1. Définition des colonnes strictement requises (basées sur le modèle)
    const requiredColumns = ["nom_siege", "latitude", "longitude"];

    // 2. Le Moteur CSV fait le parsing, vérifie les colonnes et gère les erreurs
    const parsedData = await CSVManager.parseAndValidate(file, requiredColumns);

    // 3. Mapping propre avec conversion sécurisée des chiffres
    const zones = parsedData
      .map((row) => ({
        nom: row["nom_siege"],
        latitude: parseFloat(row["latitude"]?.replace(",", ".")), // Remplace la virgule FR par un point US
        longitude: parseFloat(row["longitude"]?.replace(",", ".")),
        rayon: row["rayon"] ? parseInt(row["rayon"]) : 100, // Rayon par défaut à 100m si vide
        actif: true,
      }))
      .filter((z) => !isNaN(z.latitude) && !isNaN(z.longitude)); // On rejette silencieusement les lignes sans GPS valide

    // 4. Sécurité finale avant envoi
    if (zones.length === 0) {
      throw new Error(
        "Aucune donnée GPS valide n'a été trouvée dans le fichier.",
      );
    }

    // 5. Envoi au serveur
    const response = await secureFetch(
      `${SIRH_CONFIG.apiBaseUrl}/import-zones`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zones }),
      },
    );

    if (response.ok) {
      Swal.fire(
        "Succès !",
        `${zones.length} sièges importés avec succès.`,
        "success",
      );
      fetchZones(); // Rafraîchit le tableau à l'écran
      fetchCompanyConfig(); // Met à jour le périmètre GPS global de l'app
    } else {
      const err = await response.json();
      throw new Error(err.error || "Erreur lors de l'enregistrement serveur.");
    }
  } catch (errMsg) {
    Swal.fire("Échec de l'import", errMsg, "error");
  } finally {
    event.target.value = ""; // Réinitialise l'input pour pouvoir cliquer à nouveau sur le même fichier
  }
}

export function filterAuditTableLocally(term) {
  const rows = document.querySelectorAll("#reports-list-container tbody tr");

  // On récupère nos 3 compteurs
  const counterVisites = document.getElementById("stat-visites-total");
  const counterProduits = document.getElementById("stat-produits-total");
  const counterAgents = document.getElementById("stat-agents-actifs");
  const labelEl = document.getElementById("stat-report-label");

  let sumVisits = 0;
  let sumProducts = 0;
  let activeAgents = 0;

  rows.forEach((row) => {
    // On récupère le texte du nom (colonne 1)
    const agentInfo = row.cells[0].innerText.toLowerCase();

    // On récupère les chiffres des colonnes 2 (Visites) et 3 (Produits)
    const visitCount = parseInt(row.cells[1].innerText) || 0;
    const productCount = parseInt(row.cells[2].innerText) || 0;

    // Si la ligne correspond à la recherche
    if (agentInfo.includes(term)) {
      row.style.display = ""; // On affiche
      sumVisits += visitCount;
      sumProducts += productCount;
      if (visitCount > 0) activeAgents++;
    } else {
      row.style.display = "none"; // On cache
    }
  });

  // --- MISE À JOUR DE L'INTERFACE EN DIRECT ---
  if (counterVisites) counterVisites.innerText = sumVisits;
  if (counterProduits) counterProduits.innerText = sumProducts;
  if (counterAgents) counterAgents.innerText = activeAgents;

  if (labelEl) {
    if (term.length > 0) {
      labelEl.innerText = `RÉSULTAT POUR "${term.toUpperCase()}"`;
      labelEl.classList.add("text-blue-400"); // Passe en bleu pour montrer le filtre
    } else {
      labelEl.innerText = "VISITES CUMULÉES (ÉQUIPE TERRAIN)";
      labelEl.classList.remove("text-blue-400");
    }
  }
}

export function exportAuditToExcel() {
  if (AppState.lastAuditData.length === 0) return;
  const headers = [
    "Matricule",
    "Nom",
    "Poste",
    "Visites Totales",
    "Details Lieux",
    "Jours Absence",
    "Dernier Rapport",
  ];
  let csvContent = "\ufeff" + headers.join(";") + "\n";
  AppState.lastAuditData.forEach((row) => {
    const line = [
      row.matricule,
      row.nom,
      row.poste,
      row.total_visites,
      row.detail_lieux.replace(/;/g, ","),
      row.jours_absence,
      row.dernier_rapport.replace(/\n/g, " ").replace(/;/g, ","),
    ];
    csvContent += line.join(";") + "\n";
  });
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `Audit_SIRH_${new Date().toLocaleDateString()}.csv`;
  link.click();
}

export function renderAuditTable(data) {
  const container = document.getElementById("reports-list-container");
  let html = `
    <div class="col-span-full bg-white rounded-[2.5rem] shadow-xl border overflow-hidden animate-fadeIn mb-10">
        <div class="p-6 border-b flex justify-between items-center bg-slate-50">
            <div><h3 class="font-black text-slate-800 uppercase text-sm">Audit Global d'Activité (Mobiles)</h3></div>
            <button onclick="exportAuditToExcel()" class="bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-lg">EXPORTER EXCEL</button>
        </div>
        <div class="overflow-x-auto">
            <table class="w-full text-left">
                <thead class="bg-slate-900 text-white text-[10px] uppercase font-bold">
                    <tr>
                        <th class="px-6 py-5">Collaborateur</th>
                        <th class="px-6 py-5 text-center">Visites</th>
                        <th class="px-6 py-5 text-center">Produits Prés.</th> <!-- NOUVELLE COLONNE -->
                        <th class="px-6 py-5">Détail des Lieux</th>
                        <th class="px-6 py-5 text-center">Absences</th>
                        <th class="px-6 py-5 text-right">Dernière Obs.</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">`;

  data.forEach((row) => {
    html += `
            <tr class="hover:bg-blue-50/50">
                <td class="px-6 py-4">
                    <div class="font-bold text-slate-800 uppercase text-xs">${row.nom}</div>
                    <div class="text-[9px] text-slate-400 font-mono">${row.matricule}</div>
                </td>
                <td class="px-6 py-4 text-center">
                    <span class="bg-blue-600 text-white px-3 py-1 rounded-full font-black text-xs">${row.total_visites}</span>
                </td>
                <td class="px-6 py-4 text-center">
                    <span class="bg-indigo-50 text-indigo-600 border border-indigo-200 px-3 py-1 rounded-full font-black text-xs">${row.total_produits || 0}</span>
                </td>
                <td class="px-6 py-4 text-[10px] text-slate-600 max-w-xs truncate" title="${row.detail_lieux}">
                    ${row.detail_lieux}
                </td>
                <td class="px-6 py-4 text-center">
                    ${row.jours_absence > 0 ? `<span class="text-red-600 font-bold text-[10px] bg-red-50 px-2 py-1 rounded">${row.jours_absence} JOURS</span>` : `<span class="text-slate-300 text-[10px]">-</span>`}
                </td>
                <td class="px-6 py-4 text-[10px] text-slate-500 italic max-w-[150px] truncate text-right">
                    ${row.dernier_rapport}
                </td>
            </tr>`;
  });

  html += `</tbody></table></div></div>`;
  container.innerHTML = html;
}

export async function fetchGlobalAudit() {
  const container = document.getElementById("reports-list-container");
  const labelEl = document.getElementById("stat-report-label");
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  if (!container) return;
  container.innerHTML =
    '<div class="col-span-full text-center p-10"><i class="fa-solid fa-circle-notch fa-spin text-blue-500 text-3xl"></i></div>';

  try {
    const r = await secureFetch(
      `${SIRH_CONFIG.apiBaseUrl}/get-global-audit?month=${month}&year=${year}`,
    );
    const data = await r.json();
    AppState.lastAuditData = data;
    if (labelEl) labelEl.innerText = "VISITES CUMULÉES (ÉQUIPE TERRAIN)";

    // Calculs des 3 KPIs
    const totalVisites = data.reduce((acc, row) => acc + row.total_visites, 0);
    const totalProduits = data.reduce(
      (acc, row) => acc + (row.total_produits || 0),
      0,
    );
    const agentsActifs = data.filter((row) => row.total_visites > 0).length;

    // Injection dans le HTML
    if (document.getElementById("stat-visites-total"))
      document.getElementById("stat-visites-total").innerText = totalVisites;
    if (document.getElementById("stat-produits-total"))
      document.getElementById("stat-produits-total").innerText = totalProduits;
    if (document.getElementById("stat-agents-actifs"))
      document.getElementById("stat-agents-actifs").innerText = agentsActifs;

    renderAuditTable(data);
  } catch (e) {
    console.error(e);
    container.innerHTML =
      '<div class="col-span-full text-center text-red-500 py-10 font-bold">Erreur synthèse.</div>';
  }
}

export async function openEditProductModal(id) {
  const p = AppState.allProductsData.find((item) => item.id == id);
  if (!p) return;

  const { value: formValues } = await Swal.fire({
    title: "Modifier le produit",
    html: `
            <div class="text-left">
                <label class="text-[10px] font-black text-slate-400 uppercase">Nom du produit</label>
                <input id="edit-p-name" class="swal2-input !mt-1" value="${p.name}">
                
                <label class="text-[10px] font-black text-slate-400 uppercase mt-4 block">Description détaillée</label>
                <textarea id="edit-p-desc" class="swal2-textarea !mt-1">${p.description || ""}</textarea>
                
                <label class="text-[10px] font-black text-slate-400 uppercase mt-4 block">Ajouter des photos (cumulatif)</label>
                <input type="file" id="edit-p-files" class="swal2-file" multiple accept="image/*">
            </div>
        `,
    showCancelButton: true,
    confirmButtonText: "Sauvegarder",
    preConfirm: () => {
      return {
        name: document.getElementById("edit-p-name").value,
        description: document.getElementById("edit-p-desc").value,
        files: document.getElementById("edit-p-files").files,
      };
    },
  });

  if (formValues) {
    Swal.fire({ title: "Mise à jour...", didOpen: () => Swal.showLoading() });
    const fd = new FormData();
    fd.append("id", id);
    fd.append("name", formValues.name);
    fd.append("description", formValues.description);
    for (let i = 0; i < formValues.files.length; i++) {
      fd.append("photos", formValues.files[i]);
    }

    const r = await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/save-product`, {
      method: "POST",
      body: fd,
    });
    if (r.ok) {
      Swal.fire("Succès", "Produit mis à jour", "success");
      fetchProducts();
    }
  }
}

export function updateFileCountFeedback(input) {
  const label = document.getElementById("file-count-label");
  const count = input.files.length;
  label.innerText =
    count > 1 ? `${count} PHOTOS SÉLECTIONNÉES` : `${count} PHOTO SÉLECTIONNÉE`;
}
