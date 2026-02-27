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

    // 3. Rendu du tableau (AVEC SÉCURITÉ ANTI-CRASH)
    employeesToPay.forEach((emp, index) => {
      // SÉCURITÉ : On s'assure que le nom et le matricule existent toujours
      const safeNom = emp.nom || "Inconnu";
      const safeMatricule = emp.matricule || "N/A";
      const safePoste = emp.poste || "Non défini";
      const initial =
        safeNom !== "Inconnu" ? safeNom.charAt(0).toUpperCase() : "?";

      // Chaîne de recherche sécurisée
      const searchString = `${safeNom.toLowerCase()} ${safeMatricule.toLowerCase()}`;

      // Calcul des indemnités
      const totalIndemnites =
        (parseFloat(emp.indemnite_transport) || 0) +
        (parseFloat(emp.indemnite_logement) || 0);

      body.innerHTML += `
                <tr class="hover:bg-blue-50/50 transition-all accounting-row animate-fadeIn" 
                    data-search="${searchString}">
                    
                    <!-- 1. COLLABORATEUR -->
                    <td class="px-6 py-5">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-400">${initial}</div>
                            <div>
                                <div class="font-black text-slate-800 text-[11px] uppercase">${safeNom}</div>
                                <div class="text-[9px] text-slate-400 font-bold">${safeMatricule} • ${safePoste}</div>
                            </div>
                        </div>
                    </td>

                    <!-- 2. BASE (MODIFIABLE) -->
                    <td class="px-4 py-5 text-center">
                        <input type="number" oninput="calculateRow(${index})" id="base-${index}" 
                               class="w-full p-2 bg-slate-50 border-none rounded-xl text-center font-black text-xs focus:ring-2 focus:ring-blue-500" 
                               value="${emp.salaire_brut_fixe || 0}">
                    </td>

                    <!-- 3. INDEMNITÉS FIXES -->
                    <td class="px-4 py-5 text-center">
                        <div class="bg-indigo-50 border border-indigo-100 rounded-xl py-2 shadow-sm">
                            <span id="indem-constante-${index}" class="text-indigo-700 font-black text-xs">${totalIndemnites}</span>
                            <p class="text-[7px] text-indigo-400 font-bold uppercase tracking-tighter">Fixe (Transp+Log)</p>
                        </div>
                    </td>
                    
                    <!-- 4. PRIMES VARIABLES -->
                    <td class="px-4 py-5 text-center">
                        <input type="number" oninput="calculateRow(${index})" id="prime-${index}" 
                               class="w-full p-2 bg-emerald-50 border-none rounded-xl text-center font-black text-xs text-emerald-600 focus:ring-2 focus:ring-emerald-500" 
                               value="0">
                    </td>

                    <!-- 5. RETENUES -->
                    <td class="px-4 py-5 text-center">
                        <input type="number" oninput="calculateRow(${index})" id="tax-${index}" 
                               class="w-full p-2 bg-red-50 border-none rounded-xl text-center font-black text-xs text-red-600 focus:ring-2 focus:ring-red-500" 
                               value="0">
                    </td>

                    <!-- 6. NET À PAYER -->
                    <td class="px-6 py-5 text-right">
                        <div class="text-sm font-black text-blue-600 sensitive-value" 
                             onclick="toggleSensitiveData(this)" 
                             id="net-${index}" 
                             data-id="${emp.id}" 
                             data-nom="${safeNom}" 
                             data-poste="${safePoste}" 
                             data-matricule="${safeMatricule}">0 CFA</div>
                    </td>
                </tr>`;
    });

    // 4. Calcul immédiat
    employeesToPay.forEach((_, i) => calculateRow(i));
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

export function calculateRow(index) {
  // 1. Récupération des valeurs de base
  const base = parseInt(document.getElementById(`base-${index}`).value) || 0;

  // 2. Récupération des indemnités fixes (Somme transport + logement affichée dans le tableau)
  const indemnitesFixes =
    parseInt(document.getElementById(`indem-constante-${index}`).innerText) ||
    0;

  // 3. AUTOMATISATION DES RETENUES (Stratégie Étape 4)
  // On récupère les taux chargés depuis la table 'salaries_config'
  const rateCNSS = AppState.payrollConstants["CNSS_EMPLOYEE_RATE"] || 0;
  const rateIRPP = AppState.payrollConstants["IRPP_BASE_RATE"] || 0;
  const totalTaxRate = rateCNSS + rateIRPP;

  const inputTax = document.getElementById(`tax-${index}`);

  // On calcule automatiquement la retenue seulement si le champ est à 0
  // ou s'il est marqué comme étant en mode "auto"
  if (
    inputTax &&
    (inputTax.value === "0" || inputTax.dataset.auto === "true")
  ) {
    const estimationRetenues = Math.round(base * (totalTaxRate / 100));
    inputTax.value = estimationRetenues;
    inputTax.dataset.auto = "true"; // On garde la trace que c'est un calcul auto
  }

  // 4. Calcul final avec les primes variables saisies
  const primeVariable =
    parseInt(document.getElementById(`prime-${index}`).value) || 0;
  const retenues = parseInt(inputTax.value) || 0;

  const net = base + indemnitesFixes + primeVariable - retenues;

  // 5. Mise à jour visuelle (Format Premium)
  const display = document.getElementById(`net-${index}`);
  display.innerText = new Intl.NumberFormat("fr-FR").format(net) + " CFA";

  // 6. Stockage des données pour l'envoi final au serveur (Publish)
  display.dataset.net = net;
  display.dataset.base = base;
  display.dataset.prime = primeVariable;
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
      payrollConstants[item.key_code] = item.value_number;
    });
    console.log("📊 Constantes de paie chargées :", payrollConstants);
  } catch (e) {
    console.error("Erreur constantes paie", e);
  }
}

export async function generateAllPay() {
  const mois = document.getElementById("pay-month").value;
  const annee = document.getElementById("pay-year").value;
  const records = [];

  document.querySelectorAll('[id^="net-"]').forEach((el) => {
    const index = el.id.split("-")[1]; // On récupère l'index de la ligne
    const netValue = parseInt(el.dataset.net) || 0;

    if (netValue > 0) {
      // On récupère les valeurs directement depuis les champs du tableau
      const baseVal =
        parseInt(document.getElementById(`base-${index}`).value) || 0;
      const indemVal =
        parseInt(
          document.getElementById(`indem-constante-${index}`).innerText,
        ) || 0;
      const primeVal =
        parseInt(document.getElementById(`prime-${index}`).value) || 0;
      const taxVal =
        parseInt(document.getElementById(`tax-${index}`).value) || 0;

      records.push({
        id: el.dataset.id,
        matricule: el.dataset.matricule,
        nom: el.dataset.nom,
        poste: el.dataset.poste,
        mois: mois,
        annee: annee,
        salaire_base: baseVal,
        indemnites_fixes: indemVal, // AJOUTÉ : Somme Transport + Logement
        primes: primeVal,
        retenues: taxVal,
        salaire_net: netValue,
        taux_cnss: AppState.payrollConstants["CNSS_EMPLOYEE_RATE"] || 0,
        taux_irpp: AppState.payrollConstants["IRPP_BASE_RATE"] || 0,
      });
    }
  });

  if (records.length === 0)
    return Swal.fire("Oups", "Saisissez au moins un salaire.", "warning");

  Swal.fire({
    title: "Édition en cours...",
    text: `Publication de ${records.length} bulletins`,
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading(),
  });

  const response = await secureFetch(
    `${SIRH_CONFIG.apiBaseUrl}/process-payroll`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payrollRecords: records,
        agent: AppState.currentUser.nom,
      }),
    },
  );

  if (response.ok) {
    Swal.fire(
      "Terminé !",
      "Les bulletins sont maintenant dans les espaces personnels.",
      "success",
    );
    switchView("dash");
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
      // On récupère le nom et le poste depuis l'objet lié
      const nomEmp = p.AppState.employees
        ? p.AppState.employees.nom
        : AppState.currentUser.nom;
      const posteEmp = p.AppState.employees ? p.AppState.employees.poste : "--";

      // Attention aux minuscules/majuscules venant de Supabase
      const montant = p.salaire_net
        ? new Intl.NumberFormat("fr-FR").format(p.salaire_net) + " FCFA"
        : "--";
      const titre = `${p.mois} ${p.annee}`;
      const fileUrl = p.fiche_pdf_url; // Nom exact de ta colonne Supabase

      container.innerHTML += `
                            <div class="flex flex-col justify-between p-4 border border-slate-100 bg-slate-50 rounded-xl hover:bg-white hover:border-blue-200 hover:shadow-md transition-all group">
                                <div class="flex items-start justify-between mb-3">
                                    <div class="bg-white border border-slate-100 text-emerald-600 p-2.5 rounded-xl shadow-sm">
                                        <i class="fa-solid fa-file-invoice text-xl"></i>
                                    </div>
                                    <button onclick="viewDocument('${fileUrl}', 'Bulletin ${titre}')" class="text-slate-300 hover:text-blue-600 transition-colors">
                                        <i class="fa-solid fa-eye"></i>
                                    </button>
                                </div>
                                <div>
                                    <p class="text-[10px] font-black text-slate-400 uppercase mb-1">${nomEmp}</p>
                                    <p class="text-xs font-bold text-slate-700 mb-1">Bulletin de ${titre}</p>
                                    
                                    <!-- MODIFICATION ICI : Ajout du Privacy Mode sur le montant -->
                                    <p class="text-[10px] text-emerald-600 font-black uppercase tracking-wide bg-emerald-50 inline-block px-2 py-1 rounded sensitive-value" 
                                       onclick="toggleSensitiveData(this)" 
                                       title="Cliquez pour afficher">
                                        ${montant}
                                    </p>
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
