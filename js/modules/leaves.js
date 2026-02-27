import { AppState } from "../core/state.js";
import {
  URL_LEAVE_REQUEST,
  URL_READ_LEAVES,
  URL_LEAVE_ACTION,
} from "../core/config.js";
import { secureFetch } from "../core/api.js";
import { parseDateSmart, getDriveId } from "../core/utils.js";

export function openLeaveModal() {
  document.getElementById("leave-modal").classList.remove("hidden");
  document.getElementById("leave-start").valueAsDate = new Date();
  document.getElementById("leave-end").valueAsDate = new Date();
}

export function showLeaveDetailFromSafeData(
  safeNom,
  type,
  debut,
  fin,
  safeMotif,
  safeDocLink,
) {
  const nom = decodeURIComponent(safeNom);
  const motif = decodeURIComponent(safeMotif);
  const docLink = safeDocLink ? decodeURIComponent(safeDocLink) : null;

  // Appel de la vraie fonction d'affichage
  showLeaveDetail(nom, type, debut, fin, motif, docLink);
}




export async function submitLeaveRequest(e) {
  e.preventDefault();

  const fd = new FormData();
  // Utilisation stricte de AppState
  fd.append("employee_id", AppState.currentUser.id);
  fd.append("nom", AppState.currentUser.nom);
  fd.append("type", document.querySelector('input[name="leave_type"]:checked').value);
  fd.append("date_debut", document.getElementById("leave-start").value);
  fd.append("date_fin", document.getElementById("leave-end").value);
  fd.append("motif", document.getElementById("leave-reason").value);
  fd.append("agent", AppState.currentUser.nom);

  // CORRECTION ICI : AppState.docBlobs
  if (AppState.docBlobs.leave_justif) {
    fd.append("justificatif", AppState.docBlobs.leave_justif, "justificatif_conge.jpg");
  }

  Swal.fire({ title: "Envoi...", didOpen: () => Swal.showLoading() });

  try {
    const response = await secureFetch(URL_LEAVE_REQUEST, { method: "POST", body: fd });
    if (response.ok) {
      document.getElementById("leave-modal").classList.add("hidden");
      e.target.reset();
      AppState.docBlobs.leave_justif = null; // Reset AppState
      Swal.fire("Succès", "Demande envoyée.", "success");
    }
  } catch (error) {
    Swal.fire("Erreur", error.message, "error");
  }
}

export async function fetchLeaveRequests() {
  if (!AppState.currentUser) return;

  const body = document.getElementById("leave-requests-body");
  const section = document.getElementById("manager-leave-section");
  const myBody = document.getElementById("my-leave-requests-body");

  const normalize = (s) =>
    String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  try {
    const r = await secureFetch(
      `${URL_READ_LEAVES}?agent=${encodeURIComponent(AppState.currentUser.nom)}`,
    );
    const rawLeaves = await r.json();

    AppState.allLeaves = rawLeaves.map((l) => {
      if (!l) return null; 
      const clean = (v) => (Array.isArray(v) ? v[0] : v);
      const rawNom = clean(l.employees_nom || l.nom || l["Employé"] || "Inconnu");
      return {
        id: l.record_id || l.id || "",
        nom: rawNom ? String(rawNom).trim() : null,
        nomIndex: normalize(rawNom),
        statut: normalize(clean(l.Statut || l.statut)),
        type: normalize(clean(l.Type || l.type)),
        debut: clean(l["Date Début"] || l["Date de début"] || l.debut)
          ? parseDateSmart(
              clean(l["Date Début"] || l["Date de début"] || l.debut),
            )
          : null,
        fin: clean(l["Date Fin"] || l["Date de fin"] || l.fin)
          ? parseDateSmart(clean(l["Date Fin"] || l["Date de fin"] || l.fin))
          : null,
        motif: clean(l.motif || l.Motif || "Aucun motif"),
        doc: clean(l.justificatif_link || l.Justificatif || l.doc || null),
        solde: l.solde_actuel || 0,
      };
    }).filter(item => item !== null); // ✅ On enlève les lignes vides


    // ============================================================
    // PARTIE 1 : TABLEAU DE VALIDATION (POUR MANAGER / ADMIN / RH)
    // ============================================================
    if (AppState.currentUser.role !== "EMPLOYEE") {
      const pending = AppState.allLeaves.filter(
        (l) => l.statut === "en attente",
      );

      if (body && section) {
        section.classList.remove("hidden");
        body.innerHTML = "";

        // --- STRATÉGIE DE DÉCISION ---
        const canValidate =
          AppState.currentUser.permissions?.can_validate_leaves;

        if (pending.length > 0) {
          pending.forEach((l) => {
            const cleanNom = (l.nom || "Inconnu").replace(/"/g, "&quot;");
            const cleanType = (l.type || "Congé").replace(/"/g, "&quot;");
            const cleanMotif = (l.motif || "Aucun motif").replace(
              /"/g,
              "&quot;",
            );
            const cleanDoc = (l.doc || "").replace(/"/g, "&quot;");

            const dStart = l.debut ? l.debut.toLocaleDateString("fr-FR") : "?";
            const dEnd = l.fin ? l.fin.toLocaleDateString("fr-FR") : "?";

            const diffTime =
              l.fin && l.debut
                ? Math.abs(l.fin.getTime() - l.debut.getTime())
                : 0;
            const daysDifference =
              Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

            const soldeColor =
              l.solde <= 5 ? "text-orange-600" : "text-emerald-600";

            body.innerHTML += `
                            <tr class="border-b hover:bg-slate-50 transition-colors">
                                <td class="px-8 py-4">
                                    <div class="font-bold text-sm text-slate-700">${l.nom || "Inconnu"}</div>
                                    <div class="text-[9px] font-black uppercase ${soldeColor} mb-1">
                                        Solde actuel : ${l.solde} JOURS
                                    </div>
                                    <div class="text-[10px] text-slate-400 font-normal uppercase">${l.type || "Congé"}</div>
                                </td>
                                <td class="px-8 py-4 text-xs text-slate-500">${dStart} ➔ ${dEnd}</td>
                                <td class="px-8 py-4 text-right flex justify-end items-center gap-2">
                                    <button onclick="showLeaveDetail(this)" 
                                            data-nom="${cleanNom}"
                                            data-type="${cleanType}"
                                            data-start="${dStart}"
                                            data-end="${dEnd}"
                                            data-motif="${cleanMotif}"
                                            data-doc="${cleanDoc}"
                                            class="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-sm mr-2">
                                        <i class="fa-solid fa-eye"></i>
                                    </button>
                                    
                                    <!-- BOUTONS D'ACTION CONDITIONNELS -->
                                    ${
                                      canValidate
                                        ? `
                                        <button onclick="processLeave('${l.id}', 'Validé', ${daysDifference})" class="bg-emerald-500 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase shadow-md shadow-emerald-200">OUI</button>
                                        <button onclick="processLeave('${l.id}', 'Refusé', 0)" class="bg-white text-red-500 border border-red-100 px-4 py-2 rounded-xl text-[10px] font-black uppercase">NON</button>
                                    `
                                        : `
                                        <div class="px-3 py-1.5 bg-slate-100 text-slate-400 rounded-lg text-[9px] font-black uppercase tracking-tighter">Lecture seule</div>
                                    `
                                    }
                                </td>
                            </tr>`;
          });
        } else {
          body.innerHTML = `
                        <tr>
                            <td colspan="3" class="px-8 py-10 text-center text-slate-400">
                                <div class="flex flex-col items-center gap-2">
                                    <i class="fa-solid fa-check-double text-2xl opacity-20"></i>
                                    <p class="text-xs font-bold uppercase tracking-widest">Aucune demande en attente</p>
                                </div>
                            </td>
                        </tr>`;
        }
      }
    }

    // PARTIE 2 : HISTORIQUE PERSONNEL (Inchangé)
    if (myBody) {
      myBody.innerHTML = "";
      const myNameNormalized = normalize(AppState.currentUser.nom);
      const myRequests = AppState.allLeaves.filter(
        (l) => l.nomIndex === myNameNormalized,
      );

      if (myRequests.length === 0) {
        myBody.innerHTML =
          '<tr><td colspan="4" class="p-4 text-center text-slate-400 italic">Aucune demande soumise.</td></tr>';
      } else {
        myRequests.sort((a, b) => b.debut - a.debut);
        myRequests.forEach((r) => {
          const dStart = r.debut ? r.debut.toLocaleDateString("fr-FR") : "?";
          const dEnd = r.fin ? r.fin.toLocaleDateString("fr-FR") : "?";

          let statusClass = "bg-slate-100 text-slate-600";
          let statusText = r.statut.toUpperCase();

          if (r.statut.includes("attente")) {
            statusClass =
              "bg-yellow-50 text-yellow-700 border border-yellow-100";
            statusText = "⏳ EN ATTENTE";
          } else if (r.statut.includes("valid")) {
            statusClass =
              "bg-emerald-50 text-emerald-700 border border-emerald-100";
            statusText = "✅ APPROUVÉ";
          } else if (r.statut.includes("refus")) {
            statusClass = "bg-red-50 text-red-700 border border-red-100";
            statusText = "❌ REFUSÉ";
          }

          myBody.innerHTML += `
                        <tr class="hover:bg-slate-50 transition-colors border-b last:border-0">
                            <td class="px-6 py-4 text-xs font-bold text-slate-700">${dStart} <span class="text-slate-400 mx-1">au</span> ${dEnd}</td>
                            <td class="px-6 py-4 text-xs font-medium text-slate-500 capitalize">${r.type}</td>
                            <td class="px-6 py-4 text-xs text-slate-400 italic">${r.motif.substring(0, 25) + (r.motif.length > 25 ? "..." : "")}</td>
                            <td class="px-6 py-4 text-right">
                                <span class="px-2.5 py-1.5 rounded-lg text-[10px] font-black ${statusClass}">${statusText}</span>
                            </td>
                        </tr>`;
        });
      }
    }

    renderCharts();
  } catch (e) {
    console.error("Erreur fetchLeaveRequests:", e);
    if (myBody)
      myBody.innerHTML =
        '<tr><td colspan="4" class="p-4 text-center text-red-400">Erreur de chargement des congés.</td></tr>';
  }
}

export function showLeaveDetail(btn) {
  // 1. RÉCUPÉRATION DES DONNÉES
  const nom = btn.getAttribute("data-nom");
  const type = btn.getAttribute("data-type");
  const debut = btn.getAttribute("data-start");
  const fin = btn.getAttribute("data-end");
  const motif = btn.getAttribute("data-motif");
  const docLink = btn.getAttribute("data-doc");

  let documentHtml = "";
  const driveId = typeof getDriveId === "function" ? getDriveId(docLink) : null;

  // --- STRATÉGIE DE CONFIDENTIALITÉ ---
  const canViewFiles =
    AppState.currentUser.permissions?.can_view_employee_files;

  if (!canViewFiles) {
    // Si l'utilisateur n'a pas le droit de voir les fichiers, on affiche un bloc verrouillé
    documentHtml = `
            <div class="mt-4 p-6 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 text-center">
                <i class="fa-solid fa-lock text-slate-300 text-3xl mb-2"></i>
                <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Accès restreint aux pièces jointes</p>
                <p class="text-[9px] text-slate-400 mt-1 italic">Contactez un administrateur pour consulter le justificatif.</p>
            </div>`;
  } else {
    // Logique originale de gestion du document
    if (driveId) {
      const previewUrl = `https://drive.google.com/file/d/${driveId}/preview`;
      documentHtml = `
                <div class="mt-4 rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-slate-100 h-[200px]">
                    <iframe src="${previewUrl}" width="100%" height="100%" style="border:none;"></iframe>
                </div>`;
    } else if (docLink && docLink.length > 5 && docLink !== "null") {
      documentHtml = `
                <div class="mt-4 text-center">
                    <p class="text-[10px] font-black text-slate-400 uppercase mb-2 text-left">Pièce Jointe</p>
                    <img src="${docLink}" class="max-h-[200px] w-full object-cover rounded-xl border shadow-sm cursor-pointer hover:scale-[1.02] transition-transform" 
                        onclick="window.open('${docLink}', '_blank')">
                </div>`;
    } else {
      documentHtml = `
                <div class="mt-4 p-4 rounded-xl border border-dashed border-slate-200 text-center text-slate-400">
                    <i class="fa-solid fa-file-circle-xmark mb-1"></i>
                    <p class="text-[10px] font-bold uppercase">Aucun justificatif</p>
                </div>`;
    }
  }

  // 2. AFFICHAGE DU POP-UP HORIZONTAL (Inchangé)
  Swal.fire({
    width: "850px",
    padding: "0",
    showConfirmButton: true,
    confirmButtonText: "Fermer la fiche",
    confirmButtonColor: "#0f172a",
    customClass: { popup: "rounded-[2rem] overflow-hidden" },
    html: `
            <div class="flex flex-col md:flex-row text-left bg-white">
                <div class="w-full md:w-[35%] bg-slate-50 p-8 border-r border-slate-100">
                    <p class="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] mb-2">Détails Demande</p>
                    <h3 class="text-2xl font-black text-slate-800 leading-tight mb-6">${nom}</h3>
                    <div class="space-y-6">
                        <div>
                            <label class="block text-[9px] font-black text-slate-400 uppercase mb-1">Nature de l'absence</label>
                            <span class="inline-block bg-blue-100 text-blue-700 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide">
                                ${type}
                            </span>
                        </div>
                        <div class="grid grid-cols-1 gap-4">
                            <div class="p-3 bg-white rounded-xl border border-slate-200">
                                <p class="text-[9px] font-black text-slate-400 uppercase">Début (Matin)</p>
                                <p class="font-bold text-sm text-slate-700">${debut}</p>
                            </div>
                            <div class="p-3 bg-white rounded-xl border border-slate-200">
                                <p class="text-[9px] font-black text-slate-400 uppercase">Fin (Soir)</p>
                                <p class="font-bold text-sm text-slate-700">${fin}</p>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="w-full md:w-[65%] p-8 flex flex-col justify-between">
                    <div>
                        <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Argumentaire / Motif</p>
                        <div class="bg-slate-50 p-5 rounded-2xl border border-slate-100 text-slate-600 text-sm leading-relaxed italic shadow-inner max-h-[150px] overflow-y-auto custom-scroll">
                            "${motif}"
                        </div>
                        ${documentHtml}
                    </div>
                </div>
            </div>
        `,
  });
}

export async function processLeave(recordId, decision, daysToDeduct = 0) {
  // daysToDeduct est maintenant le nombre de jours calculé entre début et fin

  // 1. Demander confirmation à l'utilisateur
  const confirmation = await Swal.fire({
    title:
      decision === "Validé"
        ? `Approuver ${daysToDeduct} jours de congé ?`
        : "Refuser ce congé ?",
    // On affiche directement le nombre de jours dans le texte :
    text:
      decision === "Validé"
        ? `La déduction de ${daysToDeduct} jours sera appliquée au solde de l'employé.`
        : "L'employé sera informé de cette décision.",
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Oui, confirmer",
    cancelButtonText: "Annuler",
    confirmButtonColor: decision === "Validé" ? "#10b981" : "#ef4444",
  });

  if (confirmation.isConfirmed) {
    // 2. Afficher un chargement
    Swal.fire({
      title: "Traitement en cours...",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    // NOUVEAU : On définit la déduction à daysToDeduct pour l'envoi à Make
    const finalDaysDeduct = decision === "Validé" ? daysToDeduct : 0;

    try {
      // 3. Envoyer l'ordre au serveur Render -> Make
      const response = await secureFetch(URL_LEAVE_ACTION, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: recordId,
          decision: decision,
          days_deduct: finalDaysDeduct, // <--- ENVOI AUTOMATIQUE DU NOMBRE
          agent: AppState.currentUser.nom,
        }),
      });

      if (response.ok) {
        await Swal.fire({
          icon: "success",
          title: "Terminé",
          text: `La demande a été marquée comme ${decision.toLowerCase()} et ${finalDaysDeduct} jours ont été déduits.`,
          timer: 3000,
        });
        // 4. On actualise tout pour voir le nouveau solde
        window.refreshAllData(true);
      } else {
        throw new Error("Erreur du serveur");
      }
    } catch (e) {
      console.error("Erreur action congé:", e);
      Swal.fire(
        "Erreur",
        "Impossible de valider l'action : " + e.message,
        "error",
      );
    }
  }
}
