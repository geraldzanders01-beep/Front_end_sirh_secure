import { AppState } from "../core/state.js";
import { SIRH_CONFIG } from "../core/config.js";
import { secureFetch } from "../core/api.js";

export async function updateManagementSignals() {
  const container = document.getElementById("signals-container");
  if (!container || !AppState.currentUser || AppState.currentUser.role === "EMPLOYEE") return;
  let signals = [];

  try {
    // 1. Chiffres globaux du serveur
    const rStats = await secureFetch(
      `${SIRH_CONFIG.apiBaseUrl}/get-dashboard-stats`,
    );
    const globalData = await rStats.json();

    // SIGNAL 1 : CONGÉS
    if (globalData.alertConges > 0) {
      signals.push({
        title: "Absences",
        desc: `${globalData.alertConges} demande(s) à valider.`,
        icon: "fa-plane-departure",
        color: "blue",
        action: "switchView('dash')",
      });
    }

    // SIGNAL 2 : CONTRATS
    if (globalData.alertContrats > 0) {
      signals.push({
        title: "Contrats",
        desc: `${globalData.alertContrats} fin(s) imminente(s).`,
        icon: "fa-file-circle-exclamation",
        color: "red",
        action: "switchView('AppState.employees')",
      });
    }

    // SIGNAL 3 : STOCK TERRAIN
    const rStock = await secureFetch(
      `${SIRH_CONFIG.apiBaseUrl}/read-daily-reports?period=today`,
    );
    const dailies = await rStock.json();
    const stockAlerts = (dailies.data || dailies).filter(
      (rp) => rp.needs_restock,
    ).length;
    if (stockAlerts > 0) {
      signals.push({
        title: "Logistique",
        desc: `${stockAlerts} alerte(s) réappro. terrain.`,
        icon: "fa-box-open",
        color: "orange",
        action: "switchView('mobile-reports')",
      });
    }

    // --- SIGNAL 4 : MAINTENANCE SYSTÈME ---
    const lastMaint = localStorage.getItem("sirh_last_maint");
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    if (!lastMaint || new Date(lastMaint) < threeMonthsAgo) {
      signals.push({
        title: "Maintenance",
        desc: "Nettoyage du stockage conseillé.",
        icon: "fa-screwdriver-wrench",
        color: "slate",
        action: "runArchivingJob()",
      });
    }

    // --- RENDU FINAL ---
    if (signals.length === 0) {
      container.innerHTML = `
                <div class="col-span-full py-4 px-6 bg-slate-50 border border-slate-100 rounded-2xl flex items-center gap-3">
                    <i class="fa-solid fa-circle-check text-emerald-500"></i>
                    <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Tout est sous contrôle • Aucun signal d'alerte</span>
                </div>`;
      return;
    }

    container.innerHTML = signals
      .map(
        (s) => `
            <div class="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between group hover:shadow-md transition-all">
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-xl bg-${s.color}-50 text-${s.color}-600 flex items-center justify-center text-sm">
                        <i class="fa-solid ${s.icon}"></i>
                    </div>
                    <div>
                        <h4 class="font-black text-slate-800 text-[11px] uppercase">${s.title}</h4>
                        <p class="text-[10px] text-slate-400 font-medium">${s.desc}</p>
                    </div>
                </div>
                <button onclick="${s.action}" class="p-2 text-slate-300 group-hover:text-blue-600 transition-colors">
                    <i class="fa-solid fa-arrow-right-long"></i>
                </button>
            </div>
        `,
      )
      .join("");
  } catch (e) {
    console.error("Erreur lors de la mise à jour des signaux:", e);
  }
}

export async function renderCharts() {
  // --- GARDE-FOU DE SÉCURITÉ (NOUVEAU) ---
  // Si l'utilisateur n'a pas le droit de voir le dashboard, on arrête tout ici.
  // Cela empêche l'appel API inutile et l'erreur rouge dans la console.
  if (
    !AppState.currentUser ||
    !AppState.currentUser.permissions ||
    !AppState.currentUser.permissions.can_see_dashboard
  ) {
    return;
  }
  // ----------------------------------------

// --- 1. BLOC D'INTELLIGENCE VISUELLE (DÉBUT) ---
const isSuperBoss =
  AppState.currentUser.permissions?.can_see_employees === true; 

  // Mise à jour du titre principal du Dashboard
  const dashboardTitle = document.querySelector("#view-dash h2");
  if (dashboardTitle) {
    dashboardTitle.innerText = isSuperBoss
      ? "Analyse Globale de l'Entreprise"
      : "Pilotage de mon Équipe";
  }

  // Mise à jour du libellé de la carte noire "Absents"
  // On cible le petit texte au-dessus du chiffre 97
  const absentCardLabel = document
    .querySelector("#live-absents-list")
    ?.parentElement?.querySelector("p");
  if (absentCardLabel) {
    absentCardLabel.innerText = isSuperBoss
      ? "ABSENTS / NON POINTÉS (TOTAL)"
      : "MEMBRES DE L'ÉQUIPE NON POINTÉS";
  }
  // --- FIN DU BLOC D'INTELLIGENCE VISUELLE ---

  try {
    const response = await secureFetch(
      `${SIRH_CONFIG.apiBaseUrl}/get-dashboard-stats`,
    );
    const stats = await response.json();

    // 1. Synchronisation des chiffres du Dashboard
    if (document.getElementById("stat-total"))
      document.getElementById("stat-total").innerText = stats.total;
    if (document.getElementById("stat-active"))
      document.getElementById("stat-active").innerText = stats.actifs;

    // 2. Rendu Chart.js (Statut) - Ce graphique fonctionne
    if (AppState.chartStatusInstance) { 
            AppState.chartStatusInstance.destroy(); 
    }    
    const ctxStatus = document.getElementById("chartStatus")?.getContext("2d");
    if (ctxStatus) {
      // Vérifie si le contexte est disponible
        AppState.chartStatusInstance = new Chart(ctxStatus, {
        type: "doughnut",
        data: {
          labels: ["Actif", "Congé", "Sortie"],
          datasets: [
            {
              data: [stats.actifs, stats.enConge, stats.sortis],
              backgroundColor: ["#10b981", "#f59e0b", "#ef4444"],
              borderWidth: 0,
            },
          ],
        },
        options: {
          plugins: { legend: { position: "bottom" } },
          cutout: "70%",
          animation: { duration: 800 },
        },
      });
    } else {
      console.warn("Impossible d'obtenir le contexte du graphique de statut.");
    }

        // --- 3. RENDU CHART.JS (DÉPARTEMENT) ---
        if (AppState.chartDeptInstance) { 
            AppState.chartDeptInstance.destroy(); 
        }    
        const ctxDept = document.getElementById("chartDept")?.getContext("2d");

    // Ajout de logs de débogage pour voir les données
    console.log("➡️ Données Département (stats.depts) :", stats.depts);
    console.log("➡️ Contexte du graphique Département (ctxDept) :", ctxDept);

    // On ne crée le graphique que si le contexte est valide ET qu'il y a des données
    if (ctxDept && Object.keys(stats.depts).length > 0) {
     AppState.chartDeptInstance = new Chart(ctxDept, {
        type: "bar",
        data: {
          labels: Object.keys(stats.depts),
          datasets: [
            {
              label: "Collaborateurs",
              data: Object.values(stats.depts),
              backgroundColor: "#6366f1",
              borderRadius: 8,
            },
          ],
        },
        options: {
          scales: {
            y: { beginAtZero: true, ticks: { stepSize: 1 } },
            x: { grid: { display: false } },
          },
          plugins: { legend: { display: false } },
        },
      });
    } else {
      // Message si le graphique ne peut pas être rendu (ex: pas de données)
      console.warn(
        "Graphique de répartition par département non rendu : Contexte invalide ou aucune donnée.",
      );
      const chartContainer =
        document.getElementById("chartDept")?.parentElement;
      if (chartContainer) {
        chartContainer.innerHTML = `
                    <p class="font-bold text-slate-700 mb-4 uppercase text-xs tracking-widest">Répartition par Département</p>
                    <div class="text-center text-slate-400 text-sm italic p-4 bg-slate-50 rounded-lg">
                        Aucune donnée départementale à afficher.
                    </div>
                `;
      }
    }
  } catch (e) {
    console.error("Erreur de mise à jour des statistiques globales:", e);
    // Si une erreur grave survient, on peut vider le canvas ou afficher un message général
    const chartContainer = document.getElementById("w-charts-content");
    if (chartContainer)
      chartContainer.innerHTML =
        '<p class="text-center text-red-500 font-bold p-6">Erreur de chargement des graphiques.</p>';
  }
}

export async function fetchLiveAttendance() {
  // --- CORRECTION : SÉCURITÉ BASÉE SUR LA PERMISSION ---
  // Au lieu de vérifier si c'est un "EMPLOYEE", on vérifie s'il a le droit de voir le Dashboard.
  // Cela empêche le Comptable (qui n'est pas "EMPLOYEE" mais n'a pas ce droit) de déclencher l'erreur 403.
  if (
    !AppState.currentUser ||
    !AppState.currentUser.permissions ||
    !AppState.currentUser.permissions.can_see_dashboard
  ) {
    return;
  }

  try {
    const r = await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/live-attendance`);
    const data = await r.json();

    // Mise à jour des compteurs
    document.getElementById("live-presents-count").innerText =
      data.presents.length;
    document.getElementById("live-partis-count").innerText = data.partis.length;
    document.getElementById("live-absents-count").innerText =
      data.absents.length;

    // Fonction pour générer les petits avatars (INCHANGÉE)
    const renderAvatars = (list, containerId) => {
      const container = document.getElementById(containerId);
      container.innerHTML = "";
      list.slice(0, 5).forEach((emp) => {
        // On en montre max 5 pour le design
        const imgUrl =
          emp.photo_url ||
          `https://ui-avatars.com/api/?name=${emp.nom}&background=random`;
        container.innerHTML += `<img src="${imgUrl}" title="${emp.nom}" class="w-8 h-8 rounded-full border-2 border-white object-cover">`;
      });
      if (list.length > 5) {
        container.innerHTML += `<div class="w-8 h-8 rounded-full bg-white/20 border-2 border-white flex items-center justify-center text-[10px] font-bold">+${list.length - 5}</div>`;
      }
    };

    renderAvatars(data.presents, "live-presents-list");
    renderAvatars(data.partis, "live-partis-list");
    renderAvatars(data.absents, "live-absents-list");
  } catch (e) {
    console.error("Erreur Live Tracker", e);
  }
}
