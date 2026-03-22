import { AppState } from "../core/state.js";
import { SIRH_CONFIG } from "../core/config.js";
import { secureFetch } from "../core/api.js";
import { CSVManager } from "../core/utils.js";

export async function loadAccountingView() {
  const body = document.getElementById("accounting-table-body");
  if (!body) return;

  // 0. Charger les taux fiscaux si pas encore fait
if (typeof window.fetchPayrollConstants === "function" && Object.keys(AppState.payrollConstants).length === 0)
{
    await fetchPayrollConstants();
  }

  // 1. Récupération des valeurs de TOUS les filtres
  const filters = {
    type: document.getElementById("filter-accounting-type").value,
    dept: document.getElementById("filter-accounting-dept").value,
    status: document.getElementById("filter-accounting-status").value,
    role: document.getElementById("filter-accounting-role")
      ? document.getElementById("filter-accounting-role").value
      : "all",
    agent: AppState.currentUser.nom,
  };

  body.innerHTML =
    '<tr><td colspan="6" class="p-12 text-center"><i class="fa-solid fa-circle-notch fa-spin text-blue-600 text-3xl"></i><p class="text-[10px] font-black text-slate-400 uppercase mt-4">Filtrage des données en cours...</p></td></tr>';

  try {
    // 2. Construction de l'URL de recherche
    let url = `${SIRH_CONFIG.apiBaseUrl}/read-payroll-full?agent=${encodeURIComponent(filters.agent)}`;

    if (filters.type !== "all") url += `&type=${filters.type}`;
    if (filters.dept !== "all")
      url += `&dept=${encodeURIComponent(filters.dept)}`;
    if (filters.status !== "all") url += `&status=${filters.status}`;
    if (filters.role !== "all")
      url += `&role=${encodeURIComponent(filters.role)}`;

    const r = await secureFetch(url);
    const employeesToPay = await r.json();

    body.innerHTML = "";
    if (employeesToPay.length === 0) {
      body.innerHTML =
        '<tr><td colspan="6" class="p-20 text-center text-slate-300 italic">Aucun collaborateur ne correspond à ces critères.</td></tr>';
      return;
    }

// 3. Rendu du tableau (AVEC SÉCURITÉ ANTI-CRASH ET NOUVELLES COLONNES)
    employeesToPay.forEach((emp, index) => {
      const safeNom = emp.nom || "Inconnu";
      const safeMatricule = emp.matricule || "N/A";
      const safePoste = emp.poste || "Non défini";
      const initial = safeNom !== "Inconnu" ? safeNom.charAt(0).toUpperCase() : "?";
      const searchString = `${safeNom.toLowerCase()} ${safeMatricule.toLowerCase()}`;
      const totalIndemnites = (parseFloat(emp.indemnite_transport) || 0) + (parseFloat(emp.indemnite_logement) || 0);

      body.innerHTML += `
        <tr class="hover:bg-blue-50/50 transition-all accounting-row animate-fadeIn" data-search="${searchString}">
            
            <!-- 1. COLLABORATEUR -->
            <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-400">${initial}</div>
                    <div>
                        <div class="font-black text-slate-800 text-[11px] uppercase">${safeNom}</div>
                        <div class="text-[9px] text-slate-400 font-bold">${safeMatricule} • ${safePoste}</div>
                    </div>
                </div>
            </td>

            <!-- 2. BASE -->
            <td class="px-2 py-4 text-center">
                <input type="number" oninput="window.calculateRow(${index})" id="base-${index}" 
                       class="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-center font-black text-xs focus:ring-2 focus:ring-blue-500 outline-none shadow-sm transition-all" 
                       value="${emp.salaire_brut_fixe || 0}">
            </td>

            <!-- 3. INDEMNITÉS FIXES -->
            <td class="px-2 py-4 text-center">
                <div class="bg-indigo-50/50 border border-indigo-100 rounded-xl py-2 shadow-sm">
                    <span id="indem-constante-${index}" class="text-indigo-700 font-black text-xs">${totalIndemnites}</span>
                    <p class="text-[7px] text-indigo-400 font-bold uppercase tracking-tighter">Fixe</p>
                </div>
            </td>
            
            <!-- 4. PRIMES VARIABLES -->
            <td class="px-2 py-4 text-center">
                <input type="number" oninput="window.calculateRow(${index})" id="prime-${index}" 
                       class="w-full p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-center font-black text-xs text-emerald-700 focus:ring-2 focus:ring-emerald-500 outline-none shadow-sm transition-all placeholder-emerald-300" 
                       placeholder="0">
            </td>

            <!-- 5. ACOMPTES (NOUVEAU) -->
            <td class="px-2 py-4 text-center">
                <input type="number" oninput="window.calculateRow(${index})" id="acompte-${index}" 
                       class="w-full p-2.5 bg-orange-50 border border-orange-200 rounded-xl text-center font-black text-xs text-orange-700 focus:ring-2 focus:ring-orange-500 outline-none shadow-sm transition-all placeholder-orange-300" 
                       placeholder="0">
            </td>

            <!-- 6. RETENUES / TAXES (AVEC CADENAS INTELLIGENT) -->
            <td class="px-2 py-4 text-center">
                <div class="relative flex items-center group">
                    <input type="number" oninput="window.calculateRow(${index})" id="tax-${index}" data-auto="true" readonly
                           class="w-full pl-2 pr-8 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-center font-black text-xs text-red-600 outline-none shadow-inner transition-all">
                    <button onclick="window.toggleTaxLock(${index})" id="tax-lock-${index}" class="absolute right-2 text-slate-400 hover:text-blue-600 transition-colors" title="Déverrouiller la saisie manuelle">
                        <i class="fa-solid fa-lock text-[10px]"></i>
                    </button>
                </div>
                <p class="text-[7px] text-slate-400 font-bold uppercase tracking-tighter mt-1" id="tax-label-${index}">Calcul Auto</p>
            </td>

            <!-- 7. NET À PAYER -->
            <td class="px-6 py-4 text-right">
                <div class="text-sm font-black text-blue-600 bg-blue-50 px-3 py-2 rounded-xl inline-block shadow-sm border border-blue-100 sensitive-value" 
                     onclick="window.toggleSensitiveData(this)" 
                     id="net-${index}" 
                     data-id="${emp.id}" 
                     data-nom="${safeNom}" 
                     data-poste="${safePoste}" 
                     data-matricule="${safeMatricule}">0 CFA</div>
            </td>
        </tr>`;
    });

    // 4. Calcul immédiat à l'affichage
    employeesToPay.forEach((_, i) => window.calculateRow(i));
  } catch (e) {
    console.error("Erreur de rendu paie:", e);
    body.innerHTML =
      '<tr><td colspan="6" class="p-10 text-center text-red-500 font-bold uppercase text-xs">Erreur d\'affichage des données</td></tr>';
  }
}

export function resetAccountingFilters() {
  document.getElementById("search-accounting").value = "";
  document.getElementById("filter-accounting-type").value = "all";
  document.getElementById("filter-accounting-status").value = "Actif";
  document.getElementById("filter-accounting-dept").value = "all";
  if (document.getElementById("filter-accounting-role"))
    document.getElementById("filter-accounting-role").value = "all";
  loadAccountingView();
}

export function filterAccountingTableLocally() {
  const term = document.getElementById("search-accounting").value.toLowerCase();
  document.querySelectorAll(".accounting-row").forEach((row) => {
    const text = row.getAttribute("data-search");
    row.style.display = text.includes(term) ? "" : "none";
  });
}

export function toggleTaxLock(index) {
    const inputTax = document.getElementById(`tax-${index}`);
    const lockBtn = document.getElementById(`tax-lock-${index}`);
    const label = document.getElementById(`tax-label-${index}`);

    const isAuto = inputTax.dataset.auto === "true";

    if (isAuto) {
        // On DÉVERROUILLE (Passe en manuel)
        inputTax.dataset.auto = "false";
        inputTax.readOnly = false;
        inputTax.classList.replace("bg-slate-100", "bg-white");
        inputTax.classList.replace("shadow-inner", "shadow-sm");
        inputTax.classList.add("focus:ring-2", "focus:ring-red-500");
        lockBtn.innerHTML = '<i class="fa-solid fa-unlock text-[10px] text-red-500"></i>';
        label.innerText = "Saisie Manuelle";
        label.classList.replace("text-slate-400", "text-red-400");
    } else {
        // On VERROUILLE (Repasse en auto)
        inputTax.dataset.auto = "true";
        inputTax.readOnly = true;
        inputTax.classList.replace("bg-white", "bg-slate-100");
        inputTax.classList.replace("shadow-sm", "shadow-inner");
        inputTax.classList.remove("focus:ring-2", "focus:ring-red-500");
        lockBtn.innerHTML = '<i class="fa-solid fa-lock text-[10px]"></i>';
        label.innerText = "Calcul Auto";
        label.classList.replace("text-red-400", "text-slate-400");
        
        // On force un recalcul immédiat avec les taux officiels
        calculateRow(index);
    }
}

export function calculateRow(index) {
    const base = parseInt(document.getElementById(`base-${index}`).value) || 0;
    const indemnitesFixes = parseInt(document.getElementById(`indem-constante-${index}`).innerText) || 0;
    const primeVariable = parseInt(document.getElementById(`prime-${index}`).value) || 0;
    const acompte = parseInt(document.getElementById(`acompte-${index}`).value) || 0;
    
    const inputTax = document.getElementById(`tax-${index}`);

    // Si le cadenas est fermé (AUTO), le système calcule les taxes lui-même
    if (inputTax && inputTax.dataset.auto === "true") {
        const rateCNSS = AppState.payrollConstants["CNSS_EMPLOYEE_RATE"] || 0;
        const rateIRPP = AppState.payrollConstants["IRPP_BASE_RATE"] || 0;
        const totalTaxRate = rateCNSS + rateIRPP;
        
        // La taxe s'applique généralement sur la Base + Primes
        const assietteFiscale = base + primeVariable;
        inputTax.value = Math.round(assietteFiscale * (totalTaxRate / 100));
    }

    const retenues = parseInt(inputTax.value) || 0;

    // LE CALCUL FINAL
    const net = base + indemnitesFixes + primeVariable - acompte - retenues;

    // Mise à jour de l'affichage
    const display = document.getElementById(`net-${index}`);
    display.innerText = new Intl.NumberFormat("fr-FR").format(net) + " CFA";

    // Stockage dans le HTML pour la génération des PDF
    display.dataset.net = net;
    display.dataset.base = base;
    display.dataset.prime = primeVariable;
    display.dataset.acompte = acompte;
    display.dataset.tax = retenues;
}

export async function fetchPayrollConstants() {
  try {
    const r = await secureFetch(
      `${SIRH_CONFIG.apiBaseUrl}/read-config-salaries`,
    ); // On va créer cette route
    const data = await r.json();

    // On transforme le tableau en objet facile à lire : { "CNSS_EMPLOYEE_RATE": 3.6, ... }
    data.forEach((item) => {
      AppState.payrollConstants[item.key_code] = item.value_number;
    });

    const inputCnss = document.getElementById("config-cnss");
    const inputIrpp = document.getElementById("config-irpp");
    if (inputCnss) inputCnss.value = AppState.payrollConstants["CNSS_EMPLOYEE_RATE"] || 0;
    if (inputIrpp) inputIrpp.value = AppState.payrollConstants["IRPP_BASE_RATE"] || 0;
    
    console.log("📊 Constantes de paie chargées :", AppState.payrollConstants); 
      } catch (e) {
        console.error("Erreur constantes paie", e);
      }
    }



export async function generateAllPay() {
    const mois = document.getElementById("pay-month").value;
    const annee = document.getElementById("pay-year").value;
    const records =[];

    // 1. Récupération des données depuis le tableau
    document.querySelectorAll('[id^="net-"]').forEach((el) => {
        const index = el.id.split("-")[1];
        const netValue = parseInt(el.dataset.net) || 0;

        if (netValue > 0) {
            const baseVal = parseInt(document.getElementById(`base-${index}`).value) || 0;
            const indemVal = parseInt(document.getElementById(`indem-constante-${index}`).innerText) || 0;
            const primeVal = parseInt(document.getElementById(`prime-${index}`).value) || 0;
            const acompteVal = parseInt(document.getElementById(`acompte-${index}`).value) || 0; // Ajout Acompte
            const taxVal = parseInt(document.getElementById(`tax-${index}`).value) || 0;

            records.push({
                id: el.dataset.id,
                matricule: el.dataset.matricule,
                nom: el.dataset.nom,
                poste: el.dataset.poste,
                mois: mois,
                annee: annee,
                salaire_base: baseVal,
                indemnites_fixes: indemVal, 
                primes: primeVal,
                acomptes: acompteVal, // Ajout Acompte
                retenues: taxVal,
                salaire_net: netValue,
                taux_cnss: AppState.payrollConstants["CNSS_EMPLOYEE_RATE"] || 0,
                taux_irpp: AppState.payrollConstants["IRPP_BASE_RATE"] || 0,
            });
        }
    });

    if (records.length === 0) return Swal.fire("Oups", "Saisissez au moins un salaire positif.", "warning");

    // --- 2. LOGIQUE BATCH (Découpage en lots de 3) ---
    const chunkSize = 3; 
    const chunks =[];
    for (let i = 0; i < records.length; i += chunkSize) {
        chunks.push(records.slice(i, i + chunkSize));
    }

    // 3. Affichage de la progression
    let processedCount = 0;
    Swal.fire({
        title: "Génération en cours...",
        html: `
            <p class="text-sm text-slate-500 mb-4">Création des bulletins PDF et archivage...</p>
            <div class="text-3xl font-black text-blue-600 mb-2" id="payroll-progress-text">0 / ${records.length}</div>
            <p class="text-[10px] font-black uppercase tracking-widest text-slate-400">Bulletins Traités</p>
        `,
        allowOutsideClick: false,
        showConfirmButton: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        // 4. Envoi des lots un par un (On attend que le lot 1 finisse avant d'envoyer le lot 2)
        for (const chunk of chunks) {
            const response = await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/process-payroll`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    payrollRecords: chunk,
                    agent: AppState.currentUser.nom,
                }),
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || "Erreur lors de la génération");
            }

            // Mise à jour de la progression visuelle
            processedCount += chunk.length;
            const progressText = document.getElementById("payroll-progress-text");
            if (progressText) {
                progressText.innerText = `${processedCount} / ${records.length}`;
            }
        }

        // 5. Succès Total
        Swal.fire(
            "Terminé !",
            "Tous les bulletins ont été générés et distribués dans les espaces personnels.",
            "success"
        );
        
        // Optionnel : On peut retourner au Dashboard
        setTimeout(() => window.switchView("dash"), 1500);

    } catch (e) {
        console.error("Erreur Batch Paie:", e);
        Swal.fire("Erreur", `Le processus s'est arrêté à ${processedCount}/${records.length}. Erreur: ${e.message}`, "error");
    }
}





export function exportPayrollTemplate() {
  // 1. On récupère toutes les lignes affichées dans le tableau de comptabilité
  const rows = document.querySelectorAll(".accounting-row");

  if (rows.length === 0) {
    return Swal.fire(
      "Oups",
      "Aucun collaborateur affiché dans le tableau à exporter.",
      "warning",
    );
  }

  // 2. Définition des entêtes (7 colonnes au total)
  let csvContent =
    "\ufeffMATRICULE;NOM;POSTE;SALAIRE_BASE;INDEMNITES_FIXES;TOTAL_PRIMES;TOTAL_RETENUES\n";

  rows.forEach((row) => {
    // On identifie l'index de la ligne via l'ID du div NET
    const netDisplay = row.querySelector('[id^="net-"]');
    if (!netDisplay) return;
    const index = netDisplay.id.split("-")[1];

    // 3. RÉCUPÉRATION DES INFOS "TÉLLES QU'ELLES SONT" À L'ÉCRAN
    const matricule = netDisplay.dataset.matricule || "";
    const nom = netDisplay.dataset.nom || "";
    const poste = netDisplay.dataset.poste || "";

    // On récupère les valeurs des champs (Base, Primes, Retenues)
    const baseCurrent = document.getElementById(`base-${index}`).value || 0;
    const indemCurrent =
      document.getElementById(`indem-constante-${index}`).innerText || 0;
    const primeCurrent = document.getElementById(`prime-${index}`).value || 0;
    const taxCurrent = document.getElementById(`tax-${index}`).value || 0; // On récupère la taxe calculée auto !

    // 4. Génération de la ligne avec les 7 colonnes remplies
    csvContent += `\t${matricule};${nom};${poste};${baseCurrent};${indemCurrent};${primeCurrent};${taxCurrent}\n`;
  });

  // 5. Téléchargement du fichier
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `Saisie_Paie_${document.getElementById("pay-month").value}.csv`;
  link.click();
}

export function triggerPayrollImport() {
  document.getElementById("payroll-csv-file").click();
}

export async function handlePayrollImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  Swal.fire({
    title: "Analyse intelligente...",
    text: "Lecture du fichier de Paie",
    didOpen: () => Swal.showLoading(),
  });

  try {
    // 1. On exige uniquement la colonne MATRICULE (les autres sont optionnelles pour la mise à jour)
    const requiredColumns = ["matricule"];

    // 2. Le moteur fait le nettoyage (gère les guillemets, les virgules dans les chiffres, etc.)
    const parsedData = await CSVManager.parseAndValidate(file, requiredColumns);

    let updateCount = 0;

    // 3. Traitement des données
    parsedData.forEach((row) => {
      const matricule = row["matricule"]
        ? row["matricule"].replace(/\t/g, "").trim()
        : null;
      if (!matricule) return; // Passe à la ligne suivante si vide

      // On cherche l'élément HTML correspondant à cet employé
      const netDisplay = document.querySelector(
        `div[data-matricule="${matricule}"]`,
      );

      if (netDisplay) {
        const index = netDisplay.id.split("-")[1];

        const inputBase = document.getElementById(`base-${index}`);
        const displayIndem = document.getElementById(
          `indem-constante-${index}`,
        );
        const inputPrime = document.getElementById(`prime-${index}`);
        const inputTax = document.getElementById(`tax-${index}`);

        let hasChanged = false;

        // On met à jour uniquement si la colonne existe dans le fichier Excel
        if (row["salaire_base"] !== undefined && inputBase) {
          inputBase.value = parseInt(row["salaire_base"]) || 0;
          hasChanged = true;
        }

        if (row["indemnites_fixes"] !== undefined && displayIndem) {
          displayIndem.innerText = parseInt(row["indemnites_fixes"]) || 0;
          hasChanged = true;
        }

        if (row["total_primes"] !== undefined && inputPrime) {
          inputPrime.value = parseInt(row["total_primes"]) || 0;
          hasChanged = true;
        }

        if (row["total_retenues"] !== undefined && inputTax) {
          inputTax.value = parseInt(row["total_retenues"]) || 0;
          inputTax.dataset.auto = "false"; // Désactive le calcul auto
          hasChanged = true;
        }

        // Si on a modifié au moins un chiffre, on recalcule le net en temps réel
        if (hasChanged) {
          calculateRow(index);
          updateCount++;
        }
      }
    });

    if (updateCount > 0) {
      Swal.fire(
        "Succès",
        `${updateCount} bulletin(s) mis à jour depuis le fichier.`,
        "success",
      );
    } else {
      Swal.fire(
        "Info",
        "Aucun matricule correspondant trouvé à l'écran.",
        "warning",
      );
    }
  } catch (errMsg) {
    Swal.fire("Erreur de format", errMsg, "error");
  } finally {
    event.target.value = ""; // Réinitialise l'input
  }
}

export async function fetchPayrollData() {
  const container = document.getElementById("payroll-container");
  const countLabel = document.getElementById("count-payroll");
  if (!container || !AppState.currentUser) return;

  try {
    const r = await secureFetch(
      `${SIRH_CONFIG.apiBaseUrl}/read-payroll?employee_id=${encodeURIComponent(AppState.currentUser.id)}&agent=${encodeURIComponent(AppState.currentUser.nom)}`,
    );
    const payrolls = await r.json();

    container.innerHTML = "";
    if (countLabel) countLabel.innerText = payrolls.length || 0;

    if (!payrolls || payrolls.length === 0) {
      container.innerHTML =
        '<p class="col-span-full text-[10px] text-slate-400 italic text-center py-10">Aucun bulletin disponible</p>';
      return;
    }


payrolls.forEach((p) => {
      const nomEmp = p.employees ? p.employees.nom : AppState.currentUser.nom;
      const posteEmp = p.employees ? p.employees.poste : "--";
      const montant = p.salaire_net ? new Intl.NumberFormat("fr-FR").format(p.salaire_net) + " FCFA" : "--";
      const titre = `${p.mois} ${p.annee}`;
      const fileUrl = p.fiche_pdf_url; 
      
      // --- NOUVEAU : LOGIQUE DU BADGE DE CONSULTATION ---
      let statusBadge = `<span class="bg-orange-50 text-orange-600 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border border-orange-100"><i class="fa-regular fa-eye-slash mr-1"></i> Non consulté</span>`;
      
      if (p.date_consultation) {
          const dateVue = new Date(p.date_consultation).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
          statusBadge = `<span class="bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border border-emerald-100" title="Preuve légale de remise"><i class="fa-solid fa-check-double mr-1"></i> Vu le ${dateVue}</span>`;
      }

      container.innerHTML += `
        <div class="flex flex-col justify-between p-4 border border-slate-100 bg-slate-50 rounded-xl hover:bg-white hover:border-blue-200 hover:shadow-md transition-all group relative">
            <div class="flex items-start justify-between mb-3">
                <div class="bg-white border border-slate-100 text-emerald-600 p-2.5 rounded-xl shadow-sm">
                    <i class="fa-solid fa-file-invoice text-xl"></i>
                </div>
                <!-- ON UTILISE MAINTENANT window.viewPayroll AU LIEU DE viewDocument -->
                <button onclick="window.viewPayroll('${p.id}', '${fileUrl}', 'Bulletin ${titre}')" class="text-slate-300 hover:text-blue-600 transition-colors p-2 bg-white rounded-lg shadow-sm border border-slate-100 group-hover:bg-blue-50 group-hover:border-blue-200">
                    <i class="fa-solid fa-eye"></i> Ouvrir
                </button>
            </div>
            <div>
                <p class="text-[10px] font-black text-slate-400 uppercase mb-1">${nomEmp}</p>
                <p class="text-xs font-bold text-slate-700 mb-2">Bulletin de ${titre}</p>
                
                <div class="flex items-center justify-between mt-3 pt-3 border-t border-slate-200/60">
                    <p class="text-[10px] text-emerald-600 font-black uppercase tracking-wide sensitive-value" onclick="toggleSensitiveData(this)" title="Cliquez pour afficher">
                        ${montant}
                    </p>
                    ${statusBadge}
                </div>
            </div>
        </div>
      `;
    });
    
  } catch (e) {
    console.warn("Erreur bulletins:", e);
    container.innerHTML =
      '<p class="col-span-full text-[10px] text-red-400 italic text-center py-4">Erreur de chargement</p>';
  }
}


// --- SAUVEGARDER LES TAUX DE PAIE ---
export async function savePayrollConfig(e) {
    e.preventDefault();
    const cnss = document.getElementById("config-cnss").value;
    const irpp = document.getElementById("config-irpp").value;

    Swal.fire({ title: "Mise à jour...", didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    try {
        const response = await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/update-config-salaries`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cnss, irpp })
        });

        if (response.ok) {
            Swal.fire("Succès", "Les taux ont été mis à jour. Ils s'appliqueront à la prochaine paie.", "success");
            await fetchPayrollConstants(); // On recharge les constantes en mémoire
        } else {
            throw new Error("Erreur serveur.");
        }
    } catch (err) {
        Swal.fire("Erreur", "Impossible de mettre à jour les taux.", "error");
    }
}




export async function simulateMoMoPayment() {
    // 1. Calculer le montant total net à payer depuis le tableau actuel
    let totalNet = 0;
    let count = 0;
    document.querySelectorAll('[id^="net-"]').forEach(el => {
        const val = parseInt(el.dataset.net) || 0;
        if (val > 0) {
            totalNet += val;
            count++;
        }
    });

    if (count === 0) {
        return Swal.fire("Tableau vide", "Veuillez d'abord saisir les salaires à payer.", "warning");
    }

    const fmtTotal = new Intl.NumberFormat('fr-FR').format(totalNet);

    // 2. Ouvrir la modale de confirmation (Design MTN)
    const { value: confirmMoMo } = await Swal.fire({
        title: '<span style="color:#004f71">Décaisser via MTN MoMo</span>',
        html: `
            <div class="text-left p-2">
                <div class="bg-blue-50 p-4 rounded-2xl border border-blue-100 mb-6">
                    <p class="text-[10px] font-black text-blue-600 uppercase">Résumé du Virement Groupé</p>
                    <h3 class="text-2xl font-black text-blue-900 mt-1">${fmtTotal} CFA</h3>
                    <p class="text-xs text-blue-400">${count} collaborateurs concernés</p>
                </div>
                <label class="text-[10px] font-black text-slate-400 uppercase ml-1">Numéro du Compte Entreprise (MoMo Business)</label>
                <input type="tel" id="momo-source" class="swal2-input !mt-1" placeholder="Ex: 229 66 XX XX XX">
                <p class="text-[9px] text-slate-400 mt-4 italic">Note : Cette action déclenchera une demande d'approbation sur le téléphone du gestionnaire du compte MoMo Business.</p>
            </div>
        `,
        confirmButtonText: 'Lancer le paiement groupé',
        confirmButtonColor: '#ffcc00',
        confirmButtonTextColor: '#004f71',
        showCancelButton: true,
        cancelButtonText: 'Annuler',
        customClass: {
            confirmButton: 'text-blue-900 font-black',
            popup: 'rounded-[2rem]'
        }
    });

    if (confirmMoMo) {
        // 3. Animation de connexion aux API de MTN
        Swal.fire({
            title: 'Connexion MTN Gateway...',
            html: '<p class="text-sm">Vérification du solde et sécurisation du tunnel (Sandbox API)...</p>',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
                // Simulation d'attente API (3 secondes)
                setTimeout(() => {
                    Swal.fire({
                        icon: 'success',
                        title: 'Paiement Transmis !',
                        html: `
                            <div class="text-center">
                                <p class="text-sm text-slate-600 mb-4">La demande de paiement groupé de <b>${fmtTotal} CFA</b> a été envoyée au réseau MTN.</p>
                                <div class="bg-emerald-50 p-3 rounded-xl inline-block text-emerald-600 font-bold text-xs border border-emerald-100">
                                   ID Transaction : MTN-${Math.floor(Math.random()*1000000)}
                                </div>
                            </div>
                        `,
                        confirmButtonColor: '#004f71'
                    });
                }, 3000);
            }
        });
    }
}

export async function viewPayroll(payrollId, fileUrl, title) {
    // 1. On ouvre le document immédiatement pour ne pas faire attendre l'utilisateur
    window.viewDocument(fileUrl, title);

    // 2. On envoie un signal silencieux au serveur pour dire "Il l'a lu !"
    try {
        await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/mark-payroll-read`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: payrollId })
        });
        
        // On rafraîchit la liste en arrière-plan pour que le badge passe au vert (Vu) à la fermeture du PDF
        setTimeout(() => fetchPayrollData(), 2000);
        
    } catch (e) {
        console.error("Erreur logging paie:", e);
    }
}




export async function saveRule() {
    // 1. Récupération des valeurs du formulaire HTML
    const field = document.getElementById('r-field').value;
    const operator = document.getElementById('r-op').value;
    const val = document.getElementById('r-val').value;
    const actionValue = prompt("Quel est le montant de la prime/déduction en CFA ? (ex: 15000)");

    if (!val || !actionValue) return Swal.fire("Erreur", "Tous les champs sont requis", "warning");

    Swal.fire({ title: 'Enregistrement...', didOpen: () => Swal.showLoading() });

    try {
        // 2. Envoi au serveur
        const response = await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/save-payroll-rule`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                rule_name: `Règle Auto (${val})`,
                condition_field: field,
                condition_operator: operator,
                condition_value: val,
                action_type: 'ADD_FIXED', // On simplifie : Ajout fixe par défaut
                action_value: actionValue
            })
        });

        if (response.ok) {
            Swal.fire("Succès", "La règle a été ajoutée. Elle s'appliquera automatiquement au prochain calcul de paie.", "success");
            // Optionnel : Recharger la liste des règles ici
        } else {
            throw new Error("Erreur serveur");
        }
    } catch (e) {
        Swal.fire("Erreur", e.message, "error");
    }
}
