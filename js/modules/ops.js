import { AppState } from "../core/state.js";
import {
  SIRH_CONFIG,
  URL_CLOCK_ACTION,
  URL_GATEKEEPER,
  URL_REDIRECT_FAILURE,
  SCAN_KEY,
  URL_READ_REPORT,
} from "../core/config.js";
import { secureFetch } from "../core/api.js";
import {
  PremiumUI,
  compressImage,
  dataURLtoBlob,
  getDistance,
  CSVManager,
  blobToDataURL,
  parseDateSmart,
  formatProductTags
} from "../core/utils.js";


export async function syncClockInterface() {
    // 1. MODULARISATION : On utilise AppState
    if (!AppState.currentUser || !AppState.currentUser.id) return;
    const userId = AppState.currentUser.id;

    try {
        const response = await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/get-clock-status?employee_id=${userId}`);
        const data = await response.json();

        // 2. On stocke la VÉRITÉ absolue du serveur dans le navigateur
        localStorage.setItem(`clock_status_${userId}`, data.status);
        localStorage.setItem(`clock_finished_${userId}`, data.day_finished);

        // 3. LOGIQUE D'AFFICHAGE DU BOUTON (Priorité au verrouillage)
        if (data.day_finished === true) {
            updateClockUI('DONE'); // Force le gris, peu importe le reste
        } else if (data.status === 'IN') {
            updateClockUI('IN'); // Rouge (Sortie)
        } else {
            updateClockUI('OUT'); // Vert (Entrée)
        }
    } catch (e) { 
        console.error("Erreur lors de la synchronisation de l'interface de pointage :", e); 
    }
}


export function updateClockUI(statusMode) {
    const btn = document.getElementById('btn-clock');
    const dot = document.getElementById('clock-status-dot');
    const text = document.getElementById('clock-status-text');
    
    // MODULARISATION : Utilisation de AppState avec sécurité (?)
    const empType = AppState.currentUser?.employee_type || 'OFFICE'; 
    
    if (!btn) return;

    // Nettoyage des classes pour repartir sur une base propre
    btn.className = "flex-1 md:flex-none px-8 py-4 rounded-2xl font-black uppercase transition-all flex items-center justify-center gap-2";
    dot.className = "w-3 h-3 rounded-full";

    // ÉTAT 3 : JOURNÉE FINIE (Partout) -> GRIS ET BLOQUÉ
    if (statusMode === 'DONE') {
        btn.classList.add('bg-slate-200', 'text-slate-400', 'cursor-not-allowed', 'border', 'border-slate-300');
        btn.innerHTML = '<i class="fa-solid fa-lock"></i> <span>JOURNÉE CLÔTURÉE</span>';
        btn.disabled = true;
        dot.classList.add('bg-slate-300');
        if (text) { 
            text.innerText = "FIN DE SERVICE"; 
            text.className = "text-2xl font-black text-slate-400"; 
        }
    }
    // ÉTAT 2 : EN POSTE / EN VISITE -> ROUGE (Prêt à sortir)
    else if (statusMode === 'IN') {
        btn.classList.add('bg-red-500', 'text-white', 'shadow-lg', 'hover:bg-red-400', 'active:scale-95');
        
        // Texte différent selon le type d'employé
        const actionLabel = (empType === 'MOBILE') ? "FIN DE VISITE" : "SORTIE";
        btn.innerHTML = `<i class="fa-solid fa-person-walking-arrow-right"></i> <span>${actionLabel}</span>`;
        btn.disabled = false;
        
        dot.classList.add('bg-emerald-500', 'shadow-[0_0_10px_rgba(16,185,129,0.5)]');
        
        if (text) { 
            text.innerText = (empType === 'MOBILE') ? "EN MISSION" : "EN POSTE"; 
            text.className = "text-2xl font-black text-emerald-500"; 
        }
    } 
    // ÉTAT 1 : LIBRE / PRÊT À COMMENCER -> VERT (Prêt à entrer)
    else {
        btn.classList.add('bg-emerald-500', 'text-white', 'shadow-lg', 'hover:bg-emerald-400', 'active:scale-95');
        btn.innerHTML = '<i class="fa-solid fa-fingerprint"></i> <span>ENTRÉE</span>';
        btn.disabled = false;
        
        dot.classList.add('bg-red-500', 'shadow-[0_0_10px_rgba(239,68,68,0.5)]');
        
        if (text) { 
            text.innerText = "PRÊT"; 
            text.className = "text-2xl font-black text-slate-800"; 
        }
    }
}

/**
 * Demande au serveur : "Quel est mon état ?" et met à jour le bouton
 */
export async function refreshClockButton() {
    if (!AppState.currentUser || !AppState.currentUser.id) return;
    
    try {
        // ON UTILISE LA BONNE ROUTE (Celle qui gère les dates)
        const r = await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/get-clock-status?employee_id=${AppState.currentUser.id}`);
        const data = await r.json(); 
        
        const btn = document.getElementById('btn-clock');
        if (btn) {
            // On met à jour l'action (Si IN -> bouton sortira, sinon -> bouton entrera)
            btn.dataset.action = (data.status === 'IN') ? 'CLOCK_OUT' : 'CLOCK_IN';
            
            // On applique le design
            if (data.day_finished === true) {
                updateClockUI('DONE');
            } else if (data.status === 'IN') {
                updateClockUI('IN');
            } else {
                updateClockUI('OUT');
            }
        }
    } catch (e) {
        console.error("Erreur synchro bouton :", e);
    }
}


/**
 * Coupe proprement les flux caméras pour libérer la mémoire du téléphone
 */
export function stopAllCameras() {
    // Coupe le flux vidéo de la caméra s'il existe via le State global
    if (AppState.proofStream) {
        AppState.proofStream.getTracks().forEach(track => track.stop());
        AppState.proofStream = null;
        console.log("📸 Caméra coupée proprement.");
    }
    // Nettoie aussi le srcObject de la vidéo pour libérer la mémoire visuelle
    const video = document.getElementById('proof-video');
    if (video) video.srcObject = null;
}

export async function handleClockInOut() {
    const userId = AppState.currentUser.id;
    const actionTime = new Date().toISOString(); 
    const L = AppState.labels || { visit_singular: "Visite", target_singular: "Contact", product_plural: "Produits" };

    const btn = document.getElementById('btn-clock');
    const action = btn.dataset.action; 
    
    // Réinitialisation du State
    AppState.formResult = null; 
    AppState.outcome = null;
    AppState.report = null;
    AppState.proofBlob = null; 
    AppState.isLastExit = false;
    AppState.presentedProducts =[]; 
    AppState.prescripteur_id = null;
    AppState.contact_nom_libre = null;
    
    let schedule_id = null;
    let forced_location_id = null;

    const savedContext = localStorage.getItem('active_mission_context');
    if (savedContext) {
        const ctx = JSON.parse(savedContext);
        schedule_id = ctx.missionId;
        forced_location_id = ctx.locationId; 
    }

    const empData = AppState.employees.find(e => e.id === userId);
    const isMobile = (empData?.employee_type === 'MOBILE') || (AppState.currentUser?.employee_type === 'MOBILE');

    const stopAllCameras = () => {
        if (AppState.proofStream) {
            AppState.proofStream.getTracks().forEach(t => t.stop());
            AppState.proofStream = null;
        }
        const video = document.getElementById('proof-video');
        if (video) video.srcObject = null;
    };

    // --- LOGIQUE DE SORTIE MOBILE (MODALE) ---
    if (action === 'CLOCK_OUT' && isMobile) {
        Swal.fire({ title: 'Chargement...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

        let products = AppState.allProductsData ||[];
        let prescripteurs = AppState.allPrescripteurs ||[];

        if (navigator.onLine && (products.length === 0 || prescripteurs.length === 0)) {
            try {
                const [prodRes, presRes] = await Promise.all([
                    secureFetch(`${SIRH_CONFIG.apiBaseUrl}/list-products`),
                    secureFetch(`${SIRH_CONFIG.apiBaseUrl}/list-prescripteurs`)
                ]);
                products = await prodRes.json();
                prescripteurs = await presRes.json();
                AppState.allProductsData = products;
                AppState.allPrescripteurs = prescripteurs;
            } catch (e) { console.warn("Mode hors ligne utilisé"); }
        }
        Swal.close();

        let presOptions = `<option value="">-- Choisir un ${L.target_singular.toLowerCase()} --</option>` + 
            prescripteurs.map(p => `<option value="${p.id}">${p.nom_complet} (${p.fonction})</option>`).join('') +
            `<option value="autre" class="font-bold text-blue-600">➕ Autre (Nouveau ${L.target_singular})</option>`;

        let productsHtml = products.map(p => `
            <label class="cursor-pointer flex-shrink-0">
                <input type="checkbox" name="presented_prods" value="${p.id}" data-name="${p.name}" class="peer sr-only">
                <div class="flex items-center gap-2 p-1.5 pr-3 border border-slate-200 rounded-full peer-checked:border-blue-500 peer-checked:bg-blue-50 peer-checked:text-blue-700 transition-all bg-white shadow-sm">
                    <img src="${p.photo_url || 'https://via.placeholder.com/50'}" class="w-7 h-7 object-cover rounded-full">
                    <span class="text-[10px] font-black uppercase">${p.name}</span>
                </div>
            </label>`).join('');

        const swalRes = await Swal.fire({
            title: `Fin de ${L.visit_singular.toLowerCase()}`,
            customClass: { popup: 'wide-modal' },
            html: `
                <div class="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
                    <div class="space-y-6">
                        <div class="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                            <label class="text-[10px] font-black text-slate-400 uppercase mb-3 block">1. ${L.target_singular} concerné</label>
                            <select id="swal-prescripteur" class="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-sm outline-none">${presOptions}</select>
                            <div id="container-autre-nom" class="hidden mt-3">
                                <input id="swal-nom-libre" class="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm" placeholder="Nom du contact...">
                            </div>
                        </div>
                        <div class="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                            <label class="text-[10px] font-black text-slate-400 uppercase mb-3 block">2. Résultat de l'${L.visit_singular.toLowerCase()}</label>
                            <select id="swal-outcome" class="w-full p-3 bg-white border border-slate-200 rounded-xl font-black text-blue-600 outline-none">
                                <option value="VU">✅ Terminée avec succès</option>
                                <option value="ABSENT">❌ Absent / Indisponible</option>
                                <option value="COMMANDE">💰 Transaction / Commande</option>
                                <option value="RAS">👍 Simple passage</option>
                            </select>
                            <p class="text-[9px] font-black text-slate-400 uppercase mt-4 mb-2">${L.product_plural} présentés</p>
                            <div class="flex flex-wrap gap-2 max-h-[100px] overflow-y-auto p-1">${productsHtml}</div>
                        </div>
                    </div>
                    <div class="space-y-6 flex flex-col">
                        <div class="flex p-1 bg-slate-100 rounded-xl border border-slate-200 shrink-0">
                            <button type="button" onclick="window.switchProofMode('photo')" id="btn-mode-photo" class="flex-1 py-2 rounded-lg text-[9px] font-black uppercase bg-white shadow-sm text-blue-600">📸 Photo</button>
                            <button type="button" onclick="window.switchProofMode('sign')" id="btn-mode-sign" class="flex-1 py-2 rounded-lg text-[9px] font-black uppercase text-slate-500">✍️ Signature</button>
                        </div>
                        <div id="proof-photo-area" class="h-44 bg-slate-900 rounded-2xl overflow-hidden relative border-2 border-slate-200 flex-shrink-0 shadow-inner">
                            <video id="proof-video" autoplay playsinline class="w-full h-full object-cover"></video>
                            <img id="proof-image" class="w-full h-full object-cover hidden absolute top-0 left-0">
                            <canvas id="proof-canvas" class="hidden"></canvas>
                            <button type="button" id="btn-snap" class="absolute bottom-3 left-1/2 -translate-x-1/2 bg-white text-slate-900 px-4 py-2 rounded-full text-[10px] font-black shadow-xl">CAPTURER</button>
                        </div>
                        <div id="proof-sign-area" class="hidden h-44 flex-shrink-0">
                            <canvas id="visit-signature-pad" class="signature-zone w-full h-full bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200"></canvas>
                        </div>
                        <div class="flex-1 space-y-4">
                            <textarea id="swal-report" class="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm h-24 resize-none outline-none" placeholder="Observations..."></textarea>
                            <label class="flex items-center gap-3 p-3 bg-red-50 rounded-xl border border-red-100 cursor-pointer group">
                                <input type="checkbox" id="last-exit-check" class="w-5 h-5 accent-red-600">
                                <span class="text-[10px] font-black text-red-700 uppercase">Clôturer ma journée après cela</span>
                            </label>
                        </div>
                    </div>
                </div>
            `,
            confirmButtonText: 'Valider le rapport',
            showCancelButton: true,
            cancelButtonText: 'Annuler',
            allowOutsideClick: false,
            didOpen: () => {
                const video = document.getElementById('proof-video');
                navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
                    .then(s => { AppState.proofStream = s; if (video) video.srcObject = s; })
                    .catch(err => console.error("Caméra bloquée"));

                document.getElementById('swal-prescripteur').addEventListener('change', (e) => {
                    document.getElementById('container-autre-nom').classList.toggle('hidden', e.target.value !== 'autre');
                });

                document.getElementById('btn-snap').onclick = () => {
                    if (!video || video.videoWidth === 0) return Swal.fire('Patientez', 'La caméra s\'initialise...', 'info');
                    const canvas = document.getElementById('proof-canvas');
                    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
                    canvas.getContext('2d').drawImage(video, 0, 0);
                    canvas.toBlob(b => { 
                        AppState.proofBlob = b; 
                        const imgPreview = document.getElementById('proof-image');
                        imgPreview.src = URL.createObjectURL(b); 
                        imgPreview.classList.remove('hidden'); 
                    }, 'image/jpeg', 0.8);
                };

                const signCanvas = document.getElementById('visit-signature-pad');
                window.visitSignPad = new window.SignaturePad(signCanvas, { backgroundColor: 'rgba(255, 255, 255, 0)', penColor: 'rgb(0, 0, 128)' });    

                window.switchProofMode = (mode) => {
                    const isPhoto = mode === 'photo';
                    if (!isPhoto) { stopAllCameras(); }
                    else { 
                        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(s => { AppState.proofStream = s; const v = document.getElementById('proof-video'); if (v) v.srcObject = s; }); 
                    }
                    document.getElementById('proof-photo-area').classList.toggle('hidden', !isPhoto);
                    document.getElementById('proof-sign-area').classList.toggle('hidden', isPhoto);
                    document.getElementById('btn-mode-photo').className = isPhoto ? 'flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase bg-white shadow-sm text-blue-600' : 'flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase text-slate-500';
                    document.getElementById('btn-mode-sign').className = !isPhoto ? 'flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase bg-white shadow-sm text-blue-600' : 'flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase text-slate-500';
                };
            },
            willClose: () => { stopAllCameras(); },
            preConfirm: () => {
                let finalProof = AppState.proofBlob;
                if (document.getElementById('proof-sign-area').classList.contains('hidden') === false && !window.visitSignPad.isEmpty()) {
                    const dataUrl = window.visitSignPad.toDataURL('image/png');
                    const arr = dataUrl.split(','), mime = arr[0].match(/:(.*?);/)[1], bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
                    while(n--) u8arr[n] = bstr.charCodeAt(n);
                    finalProof = new Blob([u8arr], {type:mime});
                }
                return {
                    outcome: document.getElementById('swal-outcome').value,
                    report: document.getElementById('swal-report').value,
                    isLastExit: document.getElementById('last-exit-check').checked,
                    prescripteur_id: document.getElementById('swal-prescripteur').value,
                    contact_nom_libre: document.getElementById('swal-nom-libre').value,
                    selectedProducts: Array.from(document.querySelectorAll('input[name="presented_prods"]:checked')).map(i => ({id: i.value, name: i.dataset.name})),
                    proofFile: finalProof 
                };
            }
        });

        if (!swalRes.isConfirmed) return; 
        AppState.formResult = swalRes.value;
    }

// --- 3. POINTAGE GPS & ENVOI ---
    Swal.fire({ title: 'Vérification...', text: 'Traitement du pointage...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    try {
        let currentIp = "offline";
        let currentGps = "0,0";

        // Récupération GPS
        try {
            if (!navigator.geolocation) throw new Error("GPS bloqué (HTTPS requis ou non supporté)");
            
            // On affiche un petit message pour faire patienter
            Swal.update({ text: 'Recherche du signal GPS...' });
            
            const pos = await new Promise((res, rej) => { 
                // J'ai augmenté le timeout à 15s pour les mauvaises connexions
            navigator.geolocation.getCurrentPosition(res, rej, { 
                timeout: 15000, 
                enableHighAccuracy: true,
                maximumAge: 0 // <-- FORCE LE TEL À PRENDRE UNE NOUVELLE MESURE, PAS LE CACHE
            });
              
            });
            currentGps = `${pos.coords.latitude},${pos.coords.longitude}`;
        } catch (e) { 
            console.warn("Détail de l'échec GPS :", e.message);
            // On prévient l'utilisateur avec un Toast pour qu'il sache que le GPS a échoué
            Swal.fire({
                toast: true, position: 'top-end', icon: 'warning',
                title: 'Alerte GPS', text: e.message || "Impossible de vous localiser",
                showConfirmButton: false, timer: 5000
            });
            currentGps = "GPS_DISABLED"; 
        }

        // Récupération IP
        if (navigator.onLine) {
            try {
                const ipRes = await fetch('https://api.ipify.org?format=json').then(r => r.json());
                currentIp = ipRes.ip;
            } catch(e) {}
        }

        // 1. CRÉATION DU PAYLOAD UNIQUE (JSON)
        const payloadObj = {
            id: userId,
            action: action,
            gps: currentGps,
            ip: currentIp,
            agent: AppState.currentUser.nom,
            time: actionTime
        };

        // 2. SI SORTIE MOBILE : ON AJOUTE LES INFOS DU BILAN ET LA PHOTO EN TEXTE
        if (action === 'CLOCK_OUT' && isMobile && AppState.formResult) {
            const fr = AppState.formResult;
            payloadObj.outcome = fr.outcome || 'VU';
            payloadObj.report = fr.report || '';
            payloadObj.prescripteur_id = (fr.prescripteur_id && fr.prescripteur_id !== 'autre') ? fr.prescripteur_id : null;
            payloadObj.contact_nom_libre = fr.contact_nom_libre || null;
            payloadObj.presentedProducts = fr.selectedProducts || [];
            payloadObj.schedule_id = schedule_id;
            payloadObj.forced_location_id = forced_location_id;
            payloadObj.is_last_exit = fr.isLastExit ? 'true' : 'false';

            // 🔥 TRANSFORMATION DE LA PHOTO EN TEXTE (BASE64)
            if (fr.proofFile) {
                Swal.update({ text: 'Optimisation de la photo...' });
                const compressed = await compressImage(fr.proofFile);
                // On transforme le fichier en texte pour l'envoyer dans le JSON
                payloadObj.proof_photo_base64 = await window.blobToDataURL(compressed);
            }
        }

        // 3. --- GESTION HORS LIGNE : SAUVEGARDE LOCALE ---
        if (!navigator.onLine) {
            const queue = JSON.parse(localStorage.getItem("sirh_offline_queue") || "[]");
            queue.push(payloadObj);
            localStorage.setItem("sirh_offline_queue", JSON.stringify(queue));

            localStorage.removeItem('active_mission_context');
            let nextState = (action === 'CLOCK_IN') ? 'IN' : 'OUT';
            localStorage.setItem(`clock_status_${userId}`, nextState);
            if (payloadObj.is_last_exit === 'true' || !isMobile) localStorage.setItem(`clock_finished_${userId}`, 'true');

            stopAllCameras();
            if(typeof window.updateClockUI === 'function') window.updateClockUI(nextState);

            Swal.fire({ icon: 'info', title: 'Mode Hors Ligne', text: 'Pointage enregistré dans le téléphone. Il sera transmis au retour de la connexion.' });
            return; 
        }

        // 4. --- SI EN LIGNE : ENVOI JSON (Beaucoup plus fiable que FormData) ---
        console.log(`🔎 Envoi pointage JSON pour [${userId}] - Action: [${action}]`);
        
        const response = await secureFetch(URL_CLOCK_ACTION, { 
            method: 'POST', 
            body: JSON.stringify(payloadObj) 
        });

        const resData = await response.json();

        if (response.ok) {
            localStorage.removeItem('active_mission_context');
            await refreshClockButton(); // Met à jour l'interface
            Swal.fire('Succès', `Pointage validé : ${resData.zone}`, 'success');
        } else {
            throw new Error(resData.error || "Erreur serveur");
        }

    } catch (e) {
        stopAllCameras();
        console.error("Erreur handleClockInOut:", e);
        Swal.fire('Erreur', e.message, 'error');
    }

}

  
export async function fetchMobileLocations() {
  const container = document.getElementById("locations-grid");
  if (!container) return;

  // 1. On lit la préférence
  const mode = localStorage.getItem("sirh_view_pref_locations") || "grid";

  // 2. CORRECTION ANTI-BOUCLE : On met à jour les boutons MANUELLEMENT ici
  // On n'appelle PLUS changeViewMode() pour éviter le crash.
  document.querySelectorAll(`.view-toggle-locations`).forEach((btn) => {
    if (btn.dataset.mode === mode) {
      btn.classList.add("bg-blue-600", "text-white");
      btn.classList.remove("bg-white", "text-slate-600");
    } else {
      btn.classList.remove("bg-blue-600", "text-white");
      btn.classList.add("bg-white", "text-slate-600");
    }
  });

  try {
    const r = await secureFetch(
      `${SIRH_CONFIG.apiBaseUrl}/list-mobile-locations`,
    );
    const data = await r.json();

    container.innerHTML = "";
    if (data.length === 0) {
      container.className = "";
      container.innerHTML =
        '<div class="col-span-full text-center text-slate-400 py-10">Aucun lieu configuré.</div>';
      return;
    }

    const canManage =
      AppState.currentUser.permissions?.can_manage_mobile_locations;

    if (mode === "grid") {
      // --- VUE GRILLE ---
      container.className =
        "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6";
      data.forEach((loc) => {
        container.innerHTML += `
                    <div class="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all relative">
                        ${
                          canManage
                            ? `
                        <button onclick="window.deleteMobileLocation('${loc.id}')" class="absolute top-4 right-4 text-slate-300 hover:text-red-500 transition-colors">
                            <i class="fa-solid fa-trash"></i>
                        </button>`
                            : ""
                        }
                        <div class="flex items-center gap-3 mb-3">
                            <div class="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-lg"><i class="fa-solid fa-location-dot"></i></div>
                            <div>
                                <h3 class="font-bold text-slate-800">${loc.name}</h3>
                                <p class="text-[10px] font-black text-slate-400 uppercase">${loc.type_location}</p>
                            </div>
                        </div>
                        <p class="text-xs text-slate-500 mb-2"><i class="fa-solid fa-map-pin mr-1"></i> ${loc.address || "Non renseignée"}</p>
                        <div class="flex gap-2 text-[10px] font-mono bg-slate-50 p-2 rounded-lg text-slate-500">
                            <span>Lat: ${loc.latitude.toFixed(4)}</span>
                            <span>Lon: ${loc.longitude.toFixed(4)}</span>
                            <span>Rayon: ${loc.radius}m</span>
                        </div>
                    </div>`;
      });
    } else {
      // --- VUE LISTE ---
      container.className =
        "bg-white rounded-xl shadow-xl border border-slate-200 overflow-x-auto";
      let html = `
                <table class="w-full text-left whitespace-nowrap">
                    <thead class="bg-slate-900 text-white text-[10px] uppercase font-bold">
                        <tr>
                            <th class="px-6 py-4">Nom du Lieu</th>
                            <th class="px-6 py-4">Adresse</th>
                            <th class="px-6 py-4">Coordonnées GPS</th>
                            ${canManage ? '<th class="px-6 py-4 text-right">Actions</th>' : ""}
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">`;

      data.forEach((loc) => {
        html += `
                    <tr class="hover:bg-slate-50 transition-colors">
                        <td class="px-6 py-4">
                            <div class="flex items-center gap-3">
                                <i class="fa-solid fa-location-dot text-blue-500 bg-blue-50 p-2 rounded-lg"></i>
                                <div>
                                    <div class="font-bold text-slate-800">${loc.name}</div>
                                    <div class="text-[9px] font-black text-slate-400 uppercase">${loc.type_location}</div>
                                </div>
                            </div>
                        </td>
                        <td class="px-6 py-4 text-xs text-slate-500">${loc.address || '<span class="italic opacity-50">Non renseignée</span>'}</td>
                        <td class="px-6 py-4">
                            <div class="text-[10px] font-mono bg-slate-50 px-2 py-1 rounded inline-block text-slate-500">
                                Lat: ${loc.latitude.toFixed(4)} | Lon: ${loc.longitude.toFixed(4)} | R: ${loc.radius}m
                            </div>
                        </td>
                        ${
                          canManage
                            ? `
                        <td class="px-6 py-4 text-right">
                            <button onclick="window.deleteMobileLocation('${loc.id}')" class="p-2 bg-slate-50 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </td>`
                            : ""
                        }
                    </tr>`;
      });
      html += `</tbody></table>`;
      container.innerHTML = html;
    }
  } catch (e) {
    console.error(e);
  }
}

export async function openAddLocationModal() {
  // On demande la position actuelle pour faciliter la saisie
  let lat = "",
    lon = "";
  try {
    const pos = await new Promise((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej),
    );
    lat = pos.coords.latitude;
    lon = pos.coords.longitude;
  } catch (e) {}

  const { value: form } = await Swal.fire({
    title: "Nouveau Lieu",
    html: `
            <input id="loc-name" class="swal2-input" placeholder="Nom du lieu (ex: Pharmacie X)">
            <input id="loc-addr" class="swal2-input" placeholder="Adresse (facultatif)">
            <select id="loc-type" class="swal2-input">
                <option value="PHARMACIE">Pharmacie</option>
                <option value="CENTRE_SANTE">Centre de Santé</option>
                <option value="CLIENT">Client / Partenaire</option>
                <option value="SITE_GARDE">Site de Garde (Sécurité)</option>
            </select>
            <div class="grid grid-cols-2 gap-2">
                <input id="loc-lat" class="swal2-input" placeholder="Latitude" value="${lat}">
                <input id="loc-lon" class="swal2-input" placeholder="Longitude" value="${lon}">
            </div>
            <input id="loc-radius" type="number" class="swal2-input" placeholder="Rayon (mètres)" value="50">
        `,
    focusConfirm: false,
    showCancelButton: true,
    preConfirm: () => {
      return {
        name: document.getElementById("loc-name").value,
        address: document.getElementById("loc-addr").value,
        type_location: document.getElementById("loc-type").value,
        latitude: document.getElementById("loc-lat").value,
        longitude: document.getElementById("loc-lon").value,
        radius: document.getElementById("loc-radius").value,
      };
    },
  });

  if (form) {
    await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/add-mobile-location`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    fetchMobileLocations();
    Swal.fire("Ajouté !", "", "success");
  }
}

export async function deleteMobileLocation(id) {
  if (
    await Swal.fire({
      title: "Supprimer ?",
      icon: "warning",
      showCancelButton: true,
    }).then((r) => r.isConfirmed)
  ) {
    await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/delete-mobile-location`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchMobileLocations();
  }
}

export function changeViewMode(section, mode) {
  // 1. Sauvegarde du choix dans le navigateur
  localStorage.setItem(`sirh_view_pref_${section}`, mode);

  // 2. Mise à jour visuelle des boutons (Bouton actif en bleu)
  document.querySelectorAll(`.view-toggle-${section}`).forEach((btn) => {
    if (btn.dataset.mode === mode) {
      btn.classList.add("bg-blue-600", "text-white");
      btn.classList.remove("bg-white", "text-slate-600", "hover:bg-slate-50");
    } else {
      btn.classList.remove("bg-blue-600", "text-white");
      btn.classList.add("bg-white", "text-slate-600", "hover:bg-slate-50");
    }
  });

  // 3. Rechargement des données avec le bon format
  if (section === "locations") fetchMobileLocations();
  if (section === "prescripteurs") fetchPrescripteursManagement();
}

export async function offerRegisterLocation(gps) {
  const { value: locName } = await Swal.fire({
    title: "Lieu non répertorié",
    text: "Voulez-vous enregistrer ce point GPS comme un nouveau site ?",
    input: "text",
    inputPlaceholder: "Nom de la pharmacie / centre...",
    showCancelButton: true,
    confirmButtonText: "Enregistrer le site",
  });

  if (locName) {
    const [lat, lon] = gps.split(",");
    await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/add-mobile-location`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: locName,
        latitude: lat,
        longitude: lon,
        radius: 50,
        type_location: "AUTO_GEOLOC",
      }),
    });
    Swal.fire(
      "Succès",
      "Le lieu a été ajouté à la base de données.",
      "success",
    );
  }
}

export async function fetchMobileSchedules() {
  const container = document.getElementById("planning-timeline-container");
  if (!container) return;

  // Loader discret
  container.innerHTML =
    '<div class="flex flex-col items-center justify-center py-10"><i class="fa-solid fa-circle-notch fa-spin text-blue-500 text-2xl"></i><p class="text-xs text-slate-400 mt-2 font-bold uppercase">Chargement...</p></div>';

  try {
    const r = await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/list-schedules`);
    const data = await r.json();

    container.innerHTML = "";

    // Message si vide
    if (data.length === 0) {
      container.innerHTML = `
                <div class="text-center py-16 border-2 border-dashed border-slate-200 rounded-2xl">
                    <div class="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-3 mx-auto text-slate-300">
                        <i class="fa-regular fa-calendar text-2xl"></i>
                    </div>
                    <p class="text-sm font-bold text-slate-500">Aucune mission planifiée.</p>
                </div>`;
      return;
    }

    // 1. GROUPEMENT PAR DATE
    const grouped = {};
    data.forEach((s) => {
      const dateKey = s.schedule_date.split("T")[0];
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(s);
    });

    // On trie les dates (les plus récentes en haut, ou l'inverse selon ton besoin. Ici: Chronologique)
    const sortedDates = Object.keys(grouped).sort();

    let html = "";

    sortedDates.forEach((date) => {
      const dateObj = new Date(date);
      // Format : Lundi 24 Février
      const dateStr = dateObj.toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });

      const todayStr = new Date().toISOString().split("T")[0];
      const isToday = todayStr === date;

      // Badge "Aujourd'hui"
      const badgeToday = isToday
        ? `<span class="bg-blue-600 text-white text-[9px] px-2 py-0.5 rounded uppercase font-black tracking-wider ml-2">Aujourd'hui</span>`
        : "";
      const headerColor = isToday ? "text-slate-800" : "text-slate-500";

      // DÉBUT BLOC DATE
      html += `
                <div class="mb-8 animate-fadeIn">
                    <div class="flex items-center mb-4 px-1">
                        <i class="fa-regular fa-calendar-check mr-2 ${isToday ? "text-blue-600" : "text-slate-300"}"></i>
                        <h3 class="font-black text-sm uppercase tracking-wide ${headerColor}">
                            ${dateStr}
                        </h3>
                        ${badgeToday}
                    </div>
                    
                    <!-- GRILLE DES CARTES (Responsive: 1 col mobile, 2 col tablette, 3 col PC) -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            `;

      grouped[date].forEach((mission) => {
        const isMe =
          String(mission.employee_id) === String(AppState.currentUser.id);

        // --- LOGIQUE VISUELLE (COULEURS & STATUTS) ---
        let borderClass = "border-l-slate-300"; // Gris (En attente)
        let bgClass = "bg-white";
        let iconStatus = '<i class="fa-regular fa-circle text-slate-300"></i>';
        let timeClass = "text-slate-600";
        let statusBadge = "";

        if (mission.status === "COMPLETED") {
          borderClass = "border-l-emerald-500"; // Vert (Fait)
          bgClass = "bg-emerald-50/30";
          iconStatus =
            '<i class="fa-solid fa-circle-check text-emerald-500"></i>';
          timeClass = "text-emerald-700 line-through decoration-emerald-300";
          statusBadge =
            '<span class="text-[9px] font-black text-emerald-600 uppercase bg-emerald-100 px-1.5 py-0.5 rounded">Terminé</span>';
        } else if (mission.status === "CHECKED_IN") {
          borderClass = "border-l-blue-600"; // Bleu (En cours)
          bgClass = "bg-white shadow-md ring-1 ring-blue-100";
          iconStatus =
            '<i class="fa-solid fa-spinner fa-spin text-blue-600"></i>';
          timeClass = "text-blue-600 font-bold";
          statusBadge =
            '<span class="text-[9px] font-black text-blue-600 uppercase bg-blue-100 px-1.5 py-0.5 rounded animate-pulse">En cours</span>';
        } else if (mission.status === "MISSED") {
          borderClass = "border-l-red-500"; // Rouge (Raté)
          bgClass = "bg-red-50/30";
          iconStatus = '<i class="fa-solid fa-circle-xmark text-red-500"></i>';
          statusBadge =
            '<span class="text-[9px] font-black text-red-600 uppercase bg-red-100 px-1.5 py-0.5 rounded">Manqué</span>';
        }

        // Heure propre (09:00)
        const timeStr = mission.start_time.slice(0, 5);

        // --- CARTE COMPACTE ---
        html += `
                    <div class="relative p-4 rounded-xl border border-slate-200 border-l-4 ${borderClass} ${bgClass} shadow-sm hover:shadow-md transition-all group flex flex-col justify-between min-h-[140px]">
                        
                        <!-- HAUT : HEURE & STATUT -->
                        <div class="flex justify-between items-start mb-2">
                            <div class="flex items-center gap-2">
                                ${iconStatus}
                                <span class="font-mono text-sm ${timeClass}">${timeStr}</span>
                            </div>
                            ${statusBadge}
                        </div>

                        <!-- MILIEU : INFOS PRINCIPALES -->
                        <div class="mb-3">
                            <h4 class="font-extrabold text-slate-800 text-sm leading-tight mb-1 line-clamp-1" title="${mission.location_name}">
                                ${mission.location_name}
                            </h4>
                            
                            ${
                              mission.prescripteur_nom
                                ? `
                                <div class="flex items-center gap-1.5 text-xs text-blue-600 font-bold mb-1">
                                    <i class="fa-solid fa-user-doctor text-[10px]"></i>
                                    <span class="truncate">${mission.prescripteur_nom}</span>
                                </div>
                            `
                                : '<div class="h-4"></div>'
                            } <!-- Espace vide pour alignement si pas de médecin -->

                            <p class="text-[10px] text-slate-400 truncate flex items-center gap-1">
                                <i class="fa-solid fa-map-pin"></i> ${mission.location_address || "Adresse standard"}
                            </p>
                        </div>

                        <!-- BAS : ACTIONS (ICÔNES) -->
                        <div class="flex items-center justify-between mt-auto pt-3 border-t border-slate-100/50">
                            <!-- Notes (si présentes) -->
                            <div class="flex-1">
                                ${mission.notes ? `<i class="fa-regular fa-note-sticky text-slate-400 text-xs" title="${mission.notes}"></i>` : ""}
                            </div>

                            <!-- BOUTONS D'ACTION (Seulement pour moi et si pas fini) -->
                            ${
                              isMe && mission.status !== "COMPLETED"
                                ? `
                                <div class="flex gap-2">
                                    <button onclick="window.deleteSchedule('${mission.id}')" 
                                        class="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Annuler">
                                        <i class="fa-solid fa-trash-can text-xs"></i>
                                    </button>

                                    <button onclick="window.startMissionFromAgenda('${mission.id}', '${mission.location_id}', '${mission.prescripteur_id || ""}', '${mission.notes ? mission.notes.replace(/'/g, "\\'") : ""}')" 
                                        class="px-3 h-8 bg-slate-900 text-white rounded-lg flex items-center gap-2 text-[10px] font-bold uppercase shadow-md hover:bg-blue-600 transition-all active:scale-95">
                                        <i class="fa-solid fa-play"></i> Go
                                    </button>
                                </div>
                            `
                                : ""
                            }

                            <!-- INFO MANAGER (Si ce n'est pas moi) -->
                            ${
                              !isMe
                                ? `
                                <div class="flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded text-[9px] font-bold text-slate-500">
                                    <div class="w-4 h-4 bg-slate-300 rounded-full flex items-center justify-center text-[8px] text-white">${mission.employee_name.charAt(0)}</div>
                                    <span class="uppercase truncate max-w-[80px]">${mission.employee_name}</span>
                                </div>
                            `
                                : ""
                            }
                        </div>
                    </div>
                `;
      });

      html += `</div></div>`; // Fin Grille & Fin Bloc Date
    });

    container.innerHTML = html;
  } catch (e) {
    console.error(e);
    container.innerHTML =
      '<div class="text-center text-red-500 py-10 font-bold text-xs">Erreur connexion agenda.</div>';
  }
}

export async function openAddScheduleModal() {
  Swal.fire({
    title: "Chargement des données...",
    didOpen: () => Swal.showLoading(),
  });

  try {
    // 1. On charge : Employés (si manager), Lieux, ET Prescripteurs
    const promises = [
      secureFetch(`${SIRH_CONFIG.apiBaseUrl}/list-mobile-locations`),
      secureFetch(`${SIRH_CONFIG.apiBaseUrl}/list-prescripteurs`),
    ];

    // Si je suis chef, je charge aussi la liste des employés pour leur assigner des tâches
    const isManager = AppState.currentUser.role !== "EMPLOYEE";
    if (isManager) {
      promises.push(
        secureFetch(`${SIRH_CONFIG.apiBaseUrl}/read?limit=1000&status=Actif`),
      );
    }

    const responses = await Promise.all(promises);
    const locs = await responses[0].json();
    const pres = await responses[1].json();
    const emps = isManager ? (await responses[2].json()).data : [];

    // 2. Construction des listes déroulantes

    // Liste Lieux
    let locOptions = locs
      .map((l) => `<option value="${l.id}">${l.name}</option>`)
      .join("");

    // Liste Médecins (Avec recherche possible plus tard, pour l'instant simple select)
    let presOptions =
      `<option value="">-- Aucun médecin précis --</option>` +
      pres
        .map(
          (p) =>
            `<option value="${p.id}">${p.nom_complet} (${p.fonction})</option>`,
        )
        .join("");

    // Liste Employés (Seulement si Manager, sinon c'est MOI)
    let empFieldHtml = "";
    if (isManager) {
      let empOptions = emps
        .map((e) => `<option value="${e.id}">${e.nom}</option>`)
        .join("");
      empFieldHtml = `
                <label class="block text-[10px] font-black text-slate-400 uppercase mb-1">Pour qui ?</label>
                <select id="sched-emp" class="swal2-input !mt-0">${empOptions}</select>
            `;
    } else {
      // Champ caché pour l'ID de l'employé connecté
      empFieldHtml = `<input type="hidden" id="sched-emp" value="${AppState.currentUser.id}">`;
    }

    // 3. LA MODALE DE PLANIFICATION (Style "Netreps" amélioré)
    const { value: form } = await Swal.fire({
      title: "Planifier une visite",
      customClass: { popup: "wide-modal" },

      html: `
    <div class="text-left space-y-6">
        <!-- Section Qui -->
        <div class="bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <label class="block text-[10px] font-black text-slate-400 uppercase mb-2">Assignation</label>
            ${empFieldHtml}
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Gauche : Quand -->
            <div class="space-y-4">
                <div class="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                    <label class="block text-[9px] font-black text-slate-400 uppercase mb-1">Date de la visite</label>
                    <input id="sched-date" type="date" class="w-full outline-none font-bold text-slate-700" value="${new Date().toISOString().split("T")[0]}">
                </div>
                <div class="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                    <label class="block text-[9px] font-black text-slate-400 uppercase mb-1">Heure de passage</label>
                    <input id="sched-start" type="time" class="w-full outline-none font-bold text-slate-700" value="09:00">
                </div>
            </div>

            <!-- Droite : Où -->
            <div class="space-y-4">
                <div class="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                    <label class="block text-[9px] font-black text-slate-400 uppercase mb-1">Lieu / ${L.location_singular}</label>
                    <select id="sched-loc" class="w-full outline-none font-bold text-blue-600 bg-transparent">${locOptions}</select>
                </div>
                <div class="bg-blue-50 p-3 rounded-xl border border-blue-100 shadow-sm">
                    <label class="block text-[9px] font-black text-blue-400 uppercase mb-1">${L.target_singular} à rencontrer</label>
                    <select id="sched-pres" class="w-full outline-none font-black text-blue-800 bg-transparent">${presOptions}</select>
                </div>
            </div>
        </div>

        <!-- Bas : Note -->
        <div class="bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <label class="block text-[10px] font-black text-slate-400 uppercase mb-2">Objectif de la mission</label>
            <textarea id="sched-notes" class="w-full bg-transparent outline-none text-sm h-20 resize-none" placeholder="Ex: Présentation du nouveau produit..."></textarea>
        </div>
    </div>
`,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Ajouter à mon agenda",
      confirmButtonColor: "#4f46e5",
      showCancelButton: true,
      cancelButtonText: "Fermer",
      cancelButtonColor: "#94a3b8",
      preConfirm: () => {
        return {
          employee_id: document.getElementById("sched-emp").value,
          location_id: document.getElementById("sched-loc").value,
          prescripteur_id: document.getElementById("sched-pres").value || null, // On récupère le médecin
          schedule_date: document.getElementById("sched-date").value,
          start_time: document.getElementById("sched-start").value,
          end_time: "18:00",
          notes: document.getElementById("sched-notes").value,
        };
      },
    });

    // 4. Envoi au serveur
    if (form) {
      Swal.fire({
        title: "Planification...",
        didOpen: () => Swal.showLoading(),
      });
      const response = await secureFetch(
        `${SIRH_CONFIG.apiBaseUrl}/add-schedule`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        },
      );

      if (response.ok) {
        Swal.fire({
          icon: "success",
          title: "Planifié !",
          timer: 1500,
          showConfirmButton: false,
        });
        fetchMobileSchedules(); // Recharge la timeline
      }
    }
  } catch (e) {
    console.error(e);
    Swal.fire("Erreur", "Impossible de charger les données.", "error");
  }
}

export async function startMissionFromAgenda(
  missionId,
  locationId,
  presId,
  notes,
) {
  // 1. Confirmation rapide
  const confirm = await Swal.fire({
    title: "Démarrer la visite ?",
    text: "Cela va valider votre ENTRÉE immédiatement.",
    icon: "question",
    showCancelButton: true,
    confirmButtonColor: "#10b981",
    confirmButtonText: "Oui, j'y suis !",
  });

  if (!confirm.isConfirmed) return;

  Swal.fire({ title: "Validation GPS...", didOpen: () => Swal.showLoading() });

  try {
    // 2. Récupération GPS & IP
    const pos = await new Promise((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej),
    );
    const currentGps = `${pos.coords.latitude},${pos.coords.longitude}`;
    const ipRes = await fetch("https://api.ipify.org?format=json").then((r) =>
      r.json(),
    );

    // 3. Envoi au serveur (CLOCK IN + LIEN AVEC LE PLANNING)
    const fd = new FormData();
    fd.append("id", AppState.currentUser.id);
    fd.append("action", "CLOCK_IN"); // On force l'entrée
    fd.append("gps", currentGps);
    fd.append("ip", ipRes.ip);
    fd.append("agent", AppState.currentUser.nom);

    // C'EST ICI QUE TOUT SE JOUE : On envoie l'ID du planning et du lieu prévu
    fd.append("schedule_id", missionId);
    fd.append("forced_location_id", locationId); // Pour dire au serveur "C'est ce lieu là, ne cherche pas"

    const response = await secureFetch(URL_CLOCK_ACTION, {
      method: "POST",
      body: fd,
    });
    const resData = await response.json();

    if (response.ok) {
      // 4. MÉMOIRE LOCALE : On retient les infos pour le CLOCK OUT tout à l'heure
      localStorage.setItem(
        "active_mission_context",
        JSON.stringify({
          missionId: missionId,
          prescripteurId: presId, // On retient le médecin
          preNotes: notes, // On retient la note préparatoire
        }),
      );

      // 5. Mise à jour Interface
      localStorage.setItem(`clock_status_${AppState.currentUser.id}`, "IN");
      updateClockUI("IN");

      Swal.fire({
        icon: "success",
        title: "Visite démarrée !",
        text: `Bon courage pour le ${presId ? "Dr sélectionné" : "RDV"}.`,
        timer: 2000,
        showConfirmButton: false,
      });

      window.switchView("dash"); // Retour accueil
    } else {
      throw new Error(resData.error);
    }
  } catch (e) {
    console.error(e);
    Swal.fire(
      "Erreur",
      e.message || "Impossible de démarrer (Vérifiez le GPS).",
      "error",
    );
  }
}

export async function deleteSchedule(id) {
  if (
    await Swal.fire({
      title: "Annuler cette mission ?",
      icon: "warning",
      showCancelButton: true,
    }).then((r) => r.isConfirmed)
  ) {
    await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/delete-schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchMobileSchedules();
  }
}

export async function fetchPrescripteursManagement() {
  const container = document.getElementById("prescripteurs-grid");
  if (!container) return;

  const L = AppState.labels; // RACCOURCI POUR LES LABELS DYNAMIQUES
  const mode = localStorage.getItem("sirh_view_pref_prescripteurs") || "grid";

  // Mise à jour manuelle des boutons de vue
  document.querySelectorAll(`.view-toggle-prescripteurs`).forEach((btn) => {
    if (btn.dataset.mode === mode) {
      btn.classList.add("bg-blue-600", "text-white");
      btn.classList.remove("bg-white", "text-slate-600");
    } else {
      btn.classList.remove("bg-blue-600", "text-white");
      btn.classList.add("bg-white", "text-slate-600");
    }
  });

  container.innerHTML =
    '<div class="col-span-full text-center p-10"><i class="fa-solid fa-circle-notch fa-spin text-blue-500 text-2xl"></i></div>';

  try {
    const [presRes, locRes] = await Promise.all([
      secureFetch(`${SIRH_CONFIG.apiBaseUrl}/list-prescripteurs`),
      secureFetch(`${SIRH_CONFIG.apiBaseUrl}/list-mobile-locations`),
    ]);

    const prescripteurs = await presRes.json();
    const locations = await locRes.json();
    AppState.allPrescripteurs = prescripteurs;

    const locMap = {};
    locations.forEach((l) => (locMap[l.id] = l.name));

    container.innerHTML = "";
    if (prescripteurs.length === 0) {
      container.className = "";
      container.innerHTML =
        `<div class="text-center text-slate-400 py-10 italic">Aucun ${L.target_singular.toLowerCase()} enregistré.</div>`;
      return;
    }

    const canManage = AppState.currentUser.permissions.can_manage_prescripteurs;

    if (mode === "grid") {
      // --- VUE GRILLE ---
      container.className = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6";
      prescripteurs.forEach((p) => {
        const lieuNom = p.location_id ? locMap[p.location_id] : "Non assigné";
        container.innerHTML += `
            <div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all relative search-item-prescripteur" data-name="${p.nom_complet.toLowerCase()}">
                ${
                  canManage
                    ? `
                <div class="absolute top-4 right-4 flex gap-2">
                    <button onclick="window.openEditPrescripteurModal('${p.id}')" class="text-slate-300 hover:text-blue-600 bg-slate-50 p-1.5 rounded-lg"><i class="fa-solid fa-pen"></i></button>
                    <button onclick="window.deletePrescripteur('${p.id}')" class="text-slate-300 hover:text-red-500 bg-slate-50 p-1.5 rounded-lg"><i class="fa-solid fa-trash-can"></i></button>
                </div>`
                    : ""
                }
                <div class="flex items-center gap-4 mb-3">
                    <div class="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold border border-blue-100">${p.nom_complet.charAt(0)}</div>
                    <div>
                        <h3 class="font-black text-slate-800 text-sm">${p.nom_complet}</h3>
                        <p class="text-[10px] font-bold text-blue-500 uppercase mt-0.5">${p.fonction || "Rôle standard"}</p>
                    </div>
                </div>
                <div class="space-y-2 mt-4 text-xs text-slate-500">
                    <div class="bg-slate-50 p-2 rounded-lg">
                        <i class="fa-solid fa-location-dot text-slate-400 mr-2"></i> 
                        <span class="font-bold">${L.location_singular} :</span> ${lieuNom}
                    </div>
                    <div class="bg-slate-50 p-2 rounded-lg font-mono">
                        <i class="fa-solid fa-phone text-slate-400 mr-2"></i> ${p.telephone || "---"}
                    </div>
                </div>
            </div>`;
      });
    } else {
      // --- VUE TABLEAU ---
      container.className = "bg-white rounded-xl shadow-xl border border-slate-200 overflow-x-auto";
      let html = `
        <table class="w-full text-left whitespace-nowrap">
            <thead class="bg-slate-900 text-white text-[10px] uppercase font-bold">
                <tr>
                    <th class="px-6 py-4">Nom du ${L.target_singular}</th>
                    <th class="px-6 py-4">Fonction / Rôle</th>
                    <th class="px-6 py-4">Affectation (${L.location_singular})</th>
                    <th class="px-6 py-4">Coordonnées</th>
                    ${canManage ? '<th class="px-6 py-4 text-right">Actions</th>' : ""}
                </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">`;

      prescripteurs.forEach((p) => {
        const lieuNom = p.location_id
          ? locMap[p.location_id]
          : '<span class="italic text-slate-300">Non défini</span>';
        html += `
            <tr class="hover:bg-slate-50 transition-colors search-item-prescripteur" data-name="${p.nom_complet.toLowerCase()}">
                <td class="px-6 py-4 flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-bold">${p.nom_complet.charAt(0)}</div>
                    <span class="font-bold text-slate-800 text-sm uppercase">${p.nom_complet}</span>
                </td>
                <td class="px-6 py-4 text-[10px] font-black text-blue-500 uppercase tracking-widest">${p.fonction || "---"}</td>
                <td class="px-6 py-4 text-xs font-medium text-slate-600">${lieuNom}</td>
                <td class="px-6 py-4 text-xs font-mono text-slate-500">${p.telephone || "---"}</td>
                ${
                  canManage
                    ? `
                <td class="px-6 py-4 text-right">
                    <button onclick="window.openEditPrescripteurModal('${p.id}')" class="p-2 text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 rounded-lg mr-1"><i class="fa-solid fa-pen"></i></button>
                    <button onclick="window.deletePrescripteur('${p.id}')" class="p-2 text-slate-400 hover:text-red-500 bg-slate-50 hover:bg-red-50 rounded-lg"><i class="fa-solid fa-trash-can"></i></button>
                </td>`
                    : ""
                }
            </tr>`;
      });
      html += `</tbody></table>`;
      container.innerHTML = html;
    }
  } catch (e) {
    console.error("Erreur fetchPrescripteursManagement:", e);
  }
}


/**
 * Affiche une modale SweetAlert avec les détails de l'audit (Lieux ou Produits)
 * @param {string} nom - Nom du collaborateur
 * @param {string} type - Type de détail (ex: "PRODUITS", "LIEUX VISITES")
 * @param {string} contenu - Le texte ou HTML à afficher dans la modale

/**
 * Affiche une modale SweetAlert avec les détails de l'audit (Lieux ou Produits)
 * @param {string} nom - Nom du collaborateur
 * @param {string} type - Type de détail (ex: "PRODUITS", "LIEUX VISITES")
 * @param {string} contenu - Le texte ou HTML à afficher dans la modale
 */
export function showAuditDetails(nom, type, contenu) {
    window.Swal.fire({
        title: `<span class="text-xs font-black uppercase text-slate-400">${type} • ${nom}</span>`,
        html: `
            <div class="text-left bg-slate-50 p-6 rounded-2xl border border-slate-100 mt-4 max-h-[60vh] overflow-y-auto custom-scroll">
                <div class="text-sm text-slate-700 leading-relaxed font-bold">
                    ${contenu}
                </div>
            </div>
        `,
        confirmButtonText: 'Fermer',
        confirmButtonColor: '#0f172a',
        customClass: { popup: 'rounded-[2rem]' }
    });
}





/**
 * Génère le tableau d'audit global d'activité (Vue Terrain)
 * @param {Array} data - Les données reçues du serveur (Audit Global)
 */
export function renderAuditTable(data) {
    const container = document.getElementById('reports-list-container');
    const L = AppState.labels; // Labels universels
    if (!container) return;

    let html = `
    <div class="col-span-full bg-white rounded-[2.5rem] shadow-xl border overflow-hidden animate-fadeIn mb-10">
        <div class="p-6 border-b flex justify-between items-center bg-slate-50">
            <h3 class="font-black text-slate-800 uppercase text-sm">Audit d'Activité (${L.location_plural})</h3>
            <button onclick="window.exportAuditToExcel()" class="bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-lg active:scale-95">EXPORTER EXCEL</button>
        </div>
        <div class="overflow-x-auto">
            <table class="w-full text-left">
                <thead class="bg-slate-900 text-white text-[10px] uppercase font-bold">
                    <tr>
                        <th class="px-6 py-5">Collaborateur</th>
                        <th class="px-6 py-5 text-center">${L.visit_plural}</th>
                        <th class="px-6 py-5 text-center">${L.product_plural}</th>
                        <th class="px-6 py-5">${L.location_plural} identifiés</th>
                        <th class="px-6 py-5 text-right">Dernière Obs.</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">`;
    
    data.forEach(row => {
        // --- SÉCURISATION DES DONNÉES POUR LE ONCLICK ---
        // On remplace les apostrophes pour ne pas casser la chaîne de caractères JS
        const safeNom = row.nom.replace(/'/g, "&#39;");
        
        // On prépare le contenu des listes (on s'assure que les variables existent)
        const detailLieux = row.detail_lieux || "Aucun lieu répertorié";
        const detailProds = row.detail_produits || "Aucun produit présenté";
        
        const safeLieux = detailLieux.replace(/'/g, "&#39;").split(',').join('<br> • ');
        const safeProds = detailProds.replace(/'/g, "&#39;").split(',').join('<br> • ');

        html += `
            <tr class="hover:bg-blue-50/50 transition-all">
                <td class="px-6 py-4">
                    <div class="font-bold text-slate-800 uppercase text-xs">${row.nom}</div>
                    <div class="text-[9px] text-slate-400 font-mono">${row.matricule}</div>
                </td>
                <td class="px-6 py-4 text-center">
                    <span class="bg-blue-600 text-white px-3 py-1 rounded-full font-black text-xs shadow-sm">${row.total_visites}</span>
                </td>
                <td class="px-6 py-4 text-center">
                    <!-- CLIC SUR LE NOMBRE : Affiche les noms des produits -->
                    <button onclick="window.showAuditDetails('${safeNom}', 'PRODUITS PRÉSENTÉS', '• ${safeProds}')" 
                            class="bg-indigo-50 text-indigo-600 border border-indigo-200 px-3 py-1 rounded-full font-black text-xs hover:bg-indigo-600 hover:text-white transition-all">
                        ${row.total_produits}
                    </button>
                </td>
                <td class="px-6 py-4">
                    <!-- CLIC SUR LES LIEUX : Affiche la liste complète -->
                    <div class="text-[10px] text-slate-600 max-w-[200px] truncate cursor-pointer hover:text-blue-600 font-bold" 
                         onclick="window.showAuditDetails('${safeNom}', 'LIEUX VISITES', '• ${safeLieux}')">
                        <i class="fa-solid fa-eye mr-1 opacity-50"></i> ${detailLieux}
                    </div>
                </td>
                <td class="px-6 py-4 text-[10px] text-slate-500 italic text-right">
                    <div class="max-w-[150px] truncate" title="${row.dernier_rapport || ''}">${row.dernier_rapport || 'RAS'}</div>
                </td>
            </tr>`;
    });
    
    html += `</tbody></table></div></div>`;
    container.innerHTML = html;
}




export async function openAddPrescripteurModal() {
  // On charge les lieux pour le menu déroulant
  let locOptions = '<option value="">-- Aucun / Cabinet Privé --</option>';
  try {
    const r = await secureFetch(
      `${SIRH_CONFIG.apiBaseUrl}/list-mobile-locations`,
    );
    const locs = await r.json();
    locs.forEach((l) => {
      locOptions += `<option value="${l.id}">${l.name}</option>`;
    });
  } catch (e) {}

  const { value: form } = await Swal.fire({
    title: "Nouveau Prescripteur",
    html: `
            <div class="text-left">
                <label class="block text-[10px] font-black text-slate-400 uppercase mb-1">Nom Complet (Ex: Dr. Zossougbo)</label>
                <input id="pres-nom" class="swal2-input !mt-0" placeholder="Nom...">

                <label class="block text-[10px] font-black text-slate-400 uppercase mt-3 mb-1">Fonction / Spécialité</label>
                <select id="pres-role" class="swal2-input !mt-0">
                    <option value="Médecin Généraliste">Médecin Généraliste</option>
                    <option value="Médecin Spécialiste">Médecin Spécialiste</option>
                    <option value="Pharmacien">Pharmacien</option>
                    <option value="Sage-femme">Sage-femme</option>
                    <option value="Infirmier Major">Infirmier Major</option>
                </select>

                <label class="block text-[10px] font-black text-slate-400 uppercase mt-3 mb-1">Lieu d'exercice principal</label>
                <select id="pres-loc" class="swal2-input !mt-0">
                    ${locOptions}
                </select>

                <label class="block text-[10px] font-black text-slate-400 uppercase mt-3 mb-1">Téléphone</label>
                <input id="pres-tel" type="tel" class="swal2-input !mt-0" placeholder="+229...">
            </div>
        `,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: "Enregistrer",
    confirmButtonColor: "#2563eb",
    preConfirm: () => {
      const nom = document.getElementById("pres-nom").value;
      if (!nom) return Swal.showValidationMessage("Le nom est obligatoire");
      return {
        nom_complet: nom,
        fonction: document.getElementById("pres-role").value,
        location_id: document.getElementById("pres-loc").value,
        telephone: document.getElementById("pres-tel").value,
      };
    },
  });

  if (form) {
    Swal.fire({
      title: "Enregistrement...",
      didOpen: () => Swal.showLoading(),
    });
    const res = await secureFetch(
      `${SIRH_CONFIG.apiBaseUrl}/add-prescripteur`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      },
    );

    const data = await res.json();
    if (data.error) Swal.fire("Erreur", data.error, "error");
    else {
      Swal.fire("Succès", "Contact ajouté au répertoire.", "success");
      fetchPrescripteursManagement();
    }
  }
}

export async function openEditPrescripteurModal(id) {
  // 1. On retrouve les infos du médecin grâce à l'ID (depuis la mémoire locale)
  const p = AppState.allPrescripteurs.find((item) => item.id === id);
  if (!p) return;

  // 2. On charge la liste des lieux pour le select
  let locOptions = '<option value="">-- Aucun / Cabinet Privé --</option>';
  try {
    const r = await secureFetch(
      `${SIRH_CONFIG.apiBaseUrl}/list-mobile-locations`,
    );
    const locs = await r.json();
    locs.forEach((l) => {
      const selected = l.id === p.location_id ? "selected" : "";
      locOptions += `<option value="${l.id}" ${selected}>${l.name}</option>`;
    });
  } catch (e) {}

  // 3. On ouvre la modale PRÉ-REMPLIE
  const { value: form } = await Swal.fire({
    title: "Modifier le contact",
    html: `
            <div class="text-left">
                <label class="block text-[10px] font-black text-slate-400 uppercase mb-1">Nom Complet</label>
                <input id="edit-pres-nom" class="swal2-input !mt-0" value="${p.nom_complet}">

                <label class="block text-[10px] font-black text-slate-400 uppercase mt-3 mb-1">Fonction</label>
                <select id="edit-pres-role" class="swal2-input !mt-0">
                    <option value="Médecin Généraliste" ${p.fonction === "Médecin Généraliste" ? "selected" : ""}>Médecin Généraliste</option>
                    <option value="Médecin Spécialiste" ${p.fonction === "Médecin Spécialiste" ? "selected" : ""}>Médecin Spécialiste</option>
                    <option value="Pharmacien" ${p.fonction === "Pharmacien" ? "selected" : ""}>Pharmacien</option>
                    <option value="Sage-femme" ${p.fonction === "Sage-femme" ? "selected" : ""}>Sage-femme</option>
                    <option value="Infirmier Major" ${p.fonction === "Infirmier Major" ? "selected" : ""}>Infirmier Major</option>
                </select>

                <label class="block text-[10px] font-black text-slate-400 uppercase mt-3 mb-1">Lieu d'exercice</label>
                <select id="edit-pres-loc" class="swal2-input !mt-0">
                    ${locOptions}
                </select>

                <label class="block text-[10px] font-black text-slate-400 uppercase mt-3 mb-1">Téléphone</label>
                <input id="edit-pres-tel" type="tel" class="swal2-input !mt-0" value="${p.telephone || ""}">
            </div>
        `,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: "Sauvegarder",
    confirmButtonColor: "#2563eb",
    preConfirm: () => {
      return {
        id: id, // On garde l'ID pour savoir qui modifier
        nom_complet: document.getElementById("edit-pres-nom").value,
        fonction: document.getElementById("edit-pres-role").value,
        location_id: document.getElementById("edit-pres-loc").value,
        telephone: document.getElementById("edit-pres-tel").value,
      };
    },
  });

  if (form) {
    Swal.fire({ title: "Mise à jour...", didOpen: () => Swal.showLoading() });

    const res = await secureFetch(
      `${SIRH_CONFIG.apiBaseUrl}/update-prescripteur`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      },
    );

    if (res.ok) {
      Swal.fire("Succès", "Fiche mise à jour.", "success");
      fetchPrescripteursManagement(); // On rafraîchit la grille
    } else {
      Swal.fire("Erreur", "Impossible de modifier.", "error");
    }
  }
}

export async function deletePrescripteur(id) {
  const conf = await Swal.fire({
    title: "Supprimer ?",
    text: "Il ne sera plus proposé aux délégués.",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#ef4444",
  });
  if (conf.isConfirmed) {
    await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/delete-prescripteur`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchPrescripteursManagement();
  }
}

export function filterPrescripteursLocally() {
  const term = document
    .getElementById("search-prescripteur-input")
    .value.toLowerCase();
  document.querySelectorAll(".search-item-prescripteur").forEach((el) => {
    el.style.display = el.dataset.name.includes(term) ? "" : "none";
  });
}



/**
 * Charge et affiche les rapports (Visites ou Bilans) avec calcul des statistiques
 */
export async function fetchMobileReports(page = 1) {
    const container = document.getElementById('reports-list-container');
    const counterVisites = document.getElementById('stat-visites-total');
    const counterProduits = document.getElementById('stat-produits-total');
    const counterAgents = document.getElementById('stat-agents-actifs');
    const labelEl = document.getElementById('stat-report-label');
    const nameFilter = document.getElementById('filter-report-name')?.value.toLowerCase() || "";
    const periodFilter = document.getElementById('filter-report-date')?.value || "month";

    if (!container) return;
    
    const isChef = AppState.currentUser.role !== 'EMPLOYEE';
    const L = AppState.labels || {}; // RÉCUPÉRATION DU DICTIONNAIRE
    
    // Fallback de sécurité si le dictionnaire n'est pas chargé
    const safeLabel = (key, defaultVal) => L[key] || defaultVal;
    
    AppState.reportPage = page; 
    
    container.innerHTML = '<div class="col-span-full text-center p-10"><i class="fa-solid fa-circle-notch fa-spin text-blue-500 text-2xl"></i></div>';

    try {
        const limit = 20;
        const endpoint = AppState.currentReportTab === 'visits' ? 'read-visit-reports' : 'read-daily-reports';
        const url = `${SIRH_CONFIG.apiBaseUrl}/${endpoint}?page=${page}&limit=${limit}&name=${encodeURIComponent(nameFilter)}&period=${periodFilter}`;
        
        const r = await secureFetch(url);
        const result = await r.json();

        const data = result.data || result; 
        AppState.reportTotalPages = result.meta?.last_page || 1;

        // --- 1. CALCUL DES STATISTIQUES GLOBALES POUR LES CARTES ---
        let totalVisitesCount = result.meta?.total || data.length;
        let totalProductsCount = 0;
        let uniqueAgents = new Set();

        data.forEach(item => {
            const empId = item.employee_id || (item.employees && item.employees.id);
            if(empId) uniqueAgents.add(empId);

            if (AppState.currentReportTab === 'visits') {
                let pList =[];
                try { pList = typeof item.presented_products === 'string' ? JSON.parse(item.presented_products) : (item.presented_products ||[]); } catch(e){}
                totalProductsCount += pList.length;
            } else {
                if (item.products_stats) {
                    Object.values(item.products_stats).forEach(qty => totalProductsCount += (parseInt(qty) || 0));
                }
            }
        });

        // Mise à jour des compteurs
        if(counterVisites) counterVisites.innerText = totalVisitesCount;
        if(counterProduits) counterProduits.innerText = totalProductsCount;
        if(counterAgents) counterAgents.innerText = uniqueAgents.size;

        // Mise à jour des libellés (Dynamiques)
        if(labelEl) {
            labelEl.innerText = AppState.currentReportTab === 'visits' ? `${safeLabel('visit_plural', 'Visites').toUpperCase()} IDENTIFIÉES` : `${safeLabel('report_plural', 'Bilans').toUpperCase()} ENREGISTRÉS`;
        }
        
        const prodLabelEl = document.getElementById('stat-produits-total')?.previousElementSibling;
        if (prodLabelEl) prodLabelEl.innerText = `${safeLabel('product_plural', 'Produits').toUpperCase()} ENREGISTRÉS`;

        // Mise à jour des onglets (Dynamiques)
        const tabVisits = document.getElementById('tab-visits');
        if (tabVisits) tabVisits.innerText = `${safeLabel('visit_plural', 'Visites')} (${safeLabel('location_plural', 'Sites')})`;
        
        const tabDaily = document.getElementById('tab-daily');
        if (tabDaily) tabDaily.innerText = `${safeLabel('report_plural', 'Bilans')} Journaliers`;

        container.innerHTML = '';
        if (!data || data.length === 0) {
            container.innerHTML = `<div class="col-span-full text-center text-slate-400 py-10 uppercase font-black text-[10px] tracking-widest">Aucune donnée trouvée</div>`;
            return;
        }

        let html = '';

        if (AppState.currentReportTab === 'visits') {
            const grouped = {};
            data.forEach(v => {
                const name = v.nom_agent || "Inconnu";
                if (!grouped[name]) grouped[name] = [];
                grouped[name].push(v);
            });

            html = `<div class="col-span-full space-y-4">`;
            for (const [name, visits] of Object.entries(grouped)) {
                const accordionId = `acc-vis-${name.replace(/\s+/g, '-')}`;
                html += `
                    <div class="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-visible animate-fadeIn">
                        <div onclick="window.toggleAccordion('${accordionId}')" class="bg-slate-900 px-6 py-4 flex justify-between items-center cursor-pointer hover:bg-slate-800 transition-all">
                            <div class="flex items-center gap-3">
                                <div class="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-xs">${name.charAt(0)}</div>
                                <span class="font-black text-white text-sm uppercase tracking-widest">${name}</span>
                            </div>
                            <div class="flex items-center gap-4">
                                <span class="bg-white/10 text-white px-3 py-1 rounded-full text-[10px] font-bold">${visits.length} ${safeLabel('visit_plural', 'VISITES').toUpperCase()} ICI</span>
                                <i id="icon-${accordionId}" class="fa-solid fa-chevron-down text-white/50 transition-transform duration-300"></i>
                            </div>
                        </div>
                           <div id="${accordionId}" class="hidden bg-slate-50/50">
                                <div class="table-container">
                                    <table class="w-full text-left border-collapse min-w-[800px]">
                                        <thead class="bg-slate-100 border-b">
                                            <tr class="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                                <th class="p-4">👤 ${safeLabel('target_singular', 'Contact')} & ${safeLabel('location_singular', 'Lieu')}</th>
                                                <th class="p-4">📦 Détails de l'${safeLabel('visit_singular', 'Intervention')}</th>
                                                <th class="p-4 text-center">📸 Preuve</th>
                                                <th class="p-4 text-right">📝 Notes</th>
                                                ${isChef ? '<th class="p-4 text-center">Action</th>' : ''}
                                            </tr>
                                        </thead>
                                        <tbody class="divide-y divide-slate-100">`;
               
            visits.forEach(v => {
                    let durationText = "---";
                    if (v.duration) durationText = v.duration >= 60 ? `${Math.floor(v.duration / 60)}h ${v.duration % 60}m` : `${v.duration} min`;

                    // FIX PRODUITS ICI
                    let prodsHtml = formatProductTags(v.presented_products);

                    let outcomeBadge = "";
                    if(v.outcome === 'COMMANDE') outcomeBadge = '<span class="text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded font-black text-[9px] uppercase border border-emerald-200">💰 Achat/Action</span>';
                    else if(v.outcome === 'ABSENT') outcomeBadge = '<span class="text-red-700 bg-red-100 px-2 py-0.5 rounded font-black text-[9px] uppercase border border-red-200">❌ Indisponible</span>';
                    else if(v.outcome === 'VU') outcomeBadge = '<span class="text-blue-700 bg-blue-100 px-2 py-0.5 rounded font-black text-[9px] uppercase border border-blue-200">✅ Succès</span>';
                    else outcomeBadge = `<span class="text-slate-600 bg-slate-200 px-2 py-0.5 rounded font-black text-[9px] uppercase">👍 ${v.outcome || 'RAS'}</span>`;

                    html += `
                    <tr id="row-vis-${v.id}" class="hover:bg-blue-50/30 transition-colors group">
                        <td class="p-4 align-top">
                            <div class="flex items-start gap-3">
                                <div class="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-bold shrink-0 border border-slate-200 shadow-sm group-hover:bg-blue-500 group-hover:text-white transition-colors">
                                    <i class="fa-solid fa-user-tag"></i>
                                </div>
                                <div>
                                    <div class="text-sm font-black text-slate-800 uppercase tracking-tighter">${v.contact_nom}</div>
                                    <div class="text-[9px] text-blue-600 font-bold uppercase tracking-widest mb-1">${v.contact_role}</div>
                                    <div class="text-[10px] text-slate-500 font-medium"><i class="fa-solid fa-location-dot mr-1 text-slate-300"></i>${v.lieu_nom}</div>
                                </div>
                            </div>
                        </td>
                        <td class="p-4 align-top">
                            <div class="flex items-center gap-2 mb-1">
                                ${outcomeBadge}
                                <span class="text-[9px] font-mono text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded"><i class="fa-regular fa-clock mr-1"></i>${v.check_in ? new Date(v.check_in).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--:--'} (${durationText})</span>
                            </div>
                            ${prodsHtml}
                        </td>
                        <td class="p-4 text-center align-top">
                            ${v.proof_url ? `<button onclick="window.viewDocument('${v.proof_url}', 'Preuve')" class="text-emerald-500 hover:scale-125 transition-transform bg-emerald-50 p-2 rounded-lg"><i class="fa-solid fa-camera-retro text-lg"></i></button>` : '<div class="p-2 text-slate-200"><i class="fa-solid fa-ban"></i></div>'}
                        </td>
                        <td class="p-4 text-right align-top relative">
                            <div class="text-[11px] text-slate-600 italic line-clamp-2 cursor-pointer hover:text-blue-600 transition-colors" 
                                 onclick="window.toggleTextFixed(this)" title="Cliquez pour lire en entier" data-fixed="false">
                                "${v.notes || 'Aucun commentaire'}"
                            </div>
                        </td>
                        ${isChef ? `
                        <td class="p-4 text-center align-top">
                            <button onclick="window.deleteVisitReport('${v.id}')" class="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all" title="Marquer comme traité">
                                <i class="fa-solid fa-check-double text-lg"></i>
                            </button>
                        </td>` : ''}
                    </tr>`;
            });
                html += `</tbody></table></div></div></div>`;
            }
            html += `</div>`;
        } 
        else {
            // LOGIQUE BILANS JOURNALIERS (DAILY)
            const groupedDaily = {};
            data.forEach(rep => {
                const name = rep.employees?.nom || "Agent Inconnu";
                if (!groupedDaily[name]) groupedDaily[name] = [];
                groupedDaily[name].push(rep);
            });

            html = `<div class="col-span-full space-y-3">`;
            for (const [name, reports] of Object.entries(groupedDaily)) {
                const accordionId = `acc-day-${name.replace(/\s+/g, '-')}`;
                const hasStockAlert = reports.some(rp => rp.needs_restock);

                html += `
                    <div class="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-visible animate-fadeIn">
                        <div onclick="window.toggleAccordion('${accordionId}')" class="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-slate-50 transition-colors">
                            <div class="flex items-center gap-4">
                                <div class="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black text-sm">${name.charAt(0)}</div>
                                <div><h4 class="font-black text-slate-800 text-sm uppercase tracking-tighter">${name}</h4><p class="text-[10px] text-slate-400 font-bold uppercase">${reports.length} ${safeLabel('report_plural', 'bilans')}</p></div>
                            </div>
                            <div class="flex items-center gap-3">
                                ${hasStockAlert ? `<span class="bg-orange-100 text-orange-600 px-2 py-1 rounded-lg text-[9px] font-black animate-pulse">ALERTE BESOIN</span>` : ''}
                                <i id="icon-${accordionId}" class="fa-solid fa-chevron-down text-slate-300 transition-transform duration-300"></i>
                            </div>
                        </div>
                        <div id="${accordionId}" class="hidden border-t border-slate-100 bg-slate-50/50">
                            <div class="table-container">
                                <table class="w-full text-left min-w-[700px]">
                                    <tbody class="divide-y divide-slate-100">`;
                
                reports.forEach(rep => {
                    const hours = Math.floor(rep.total_work_minutes / 60);
                    const mins = rep.total_work_minutes % 60;
                    const timeDisplay = hours > 0 ? `${hours}h ${mins}min` : `${mins} min`;
                            
                    let statsHtml = "";
                    if (rep.products_stats && Object.keys(rep.products_stats).length > 0) {
                        statsHtml = `<div class="flex flex-wrap gap-1 mt-2">`;
                        for (let[prodName, count] of Object.entries(rep.products_stats)) {
                            let cleanName = prodName;
                            if (typeof prodName === 'string' && prodName.startsWith('{')) {
                                try { cleanName = JSON.parse(prodName).name || JSON.parse(prodName).NAME || "Article"; } catch(e){}
                            }
                            statsHtml += `<span class="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-[8px] font-black border border-indigo-100 uppercase">${cleanName} <span class="text-indigo-400">x${count}</span></span>`;
                        }
                        statsHtml += `</div>`;
                    }

                    html += `
                        <tr id="row-daily-${rep.id}" class="hover:bg-white transition-colors group relative">
                            <td class="px-6 py-4 w-1/4 align-top">
                                <div class="text-[10px] font-black text-indigo-500 uppercase">${new Date(rep.report_date).toLocaleDateString('fr-FR', {weekday:'long', day:'numeric', month:'long'})}</div>
                                <div class="mt-2 inline-flex items-center gap-1.5 px-2 py-1 bg-blue-600 text-white rounded-lg shadow-sm">
                                    <i class="fa-solid fa-clock text-[9px]"></i><span class="text-[10px] font-black uppercase">${timeDisplay}</span>
                                </div>
                                ${statsHtml}
                            </td>
                            <td class="px-6 py-4 w-2/4 align-top">
                                <div class="text-xs text-slate-600 italic line-clamp-1 cursor-pointer transition-all" onclick="window.toggleTextFixed(this)">${rep.summary || "..."}</div>
                            </td>
                            <td class="px-6 py-4 w-1/4 align-top text-right">
                                <div class="flex items-center justify-end gap-3">
                                    ${rep.photo_url ? `<button onclick="window.viewDocument('${rep.photo_url}', 'Document annexé')" class="text-blue-500"><i class="fa-solid fa-file-image text-lg"></i></button>` : ''}
                                    ${isChef ? `<button onclick="window.deleteDailyReport('${rep.id}')" class="text-slate-300 hover:text-red-500 transition-all"><i class="fa-solid fa-check-double text-lg"></i></button>` : ''}
                                </div>
                            </td>
                        </tr>`;
                });
                html += `</tbody></table></div></div></div>`;
            }
            html += `</div>`;
        }

        const paginationHtml = `
            <div class="col-span-full flex justify-between items-center mt-6 px-4">
                <button onclick="window.fetchMobileReports(${AppState.reportPage - 1})" ${AppState.reportPage <= 1 ? 'disabled' : ''} class="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black uppercase text-slate-600 disabled:opacity-30 shadow-sm transition-all hover:bg-slate-50"><i class="fa-solid fa-chevron-left mr-2"></i> Précédent</button>
                <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Page ${AppState.reportPage} / ${AppState.reportTotalPages}</span>
                <button onclick="window.fetchMobileReports(${AppState.reportPage + 1})" ${AppState.reportPage >= AppState.reportTotalPages ? 'disabled' : ''} class="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black uppercase text-slate-600 disabled:opacity-30 shadow-sm transition-all hover:bg-slate-50">Suivant <i class="fa-solid fa-chevron-right ml-2"></i></button>
            </div>`;

        container.innerHTML = html + paginationHtml;

    } catch (e) {
        console.error("Erreur rapports:", e);
        container.innerHTML = '<div class="col-span-full text-center text-red-500 py-10 font-bold uppercase text-[10px]">Erreur de chargement</div>';
    }
}



export function changeReportTab(tab) {
  AppState.currentReportTab = tab;

  document.getElementById("filter-report-name").value = "";
  document
    .getElementById("stat-report-label")
    .classList.remove("text-blue-400");

  document.querySelectorAll(".report-tab-btn").forEach((btn) => {
    btn.classList.remove("text-blue-600", "border-blue-600");
    btn.classList.add("text-slate-400", "border-transparent");
  });
  const activeBtn = document.getElementById("tab-" + tab);
  if (activeBtn) {
    activeBtn.classList.remove("text-slate-400", "border-transparent");
    activeBtn.classList.add("text-blue-600", "border-blue-600");
  }

  if (tab === "audit") {
    fetchGlobalAudit();
  } else {
    fetchMobileReports();
  }
}




/**
 * Récupère et calcule la synthèse d'audit global pour le mois en cours
 */
export async function fetchGlobalAudit() {
    const container = document.getElementById('reports-list-container');
    const labelEl = document.getElementById('stat-report-label');
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    if (!container) return;
    
    // Affichage du loader
    container.innerHTML = '<div class="col-span-full text-center p-10"><i class="fa-solid fa-circle-notch fa-spin text-blue-500 text-3xl"></i></div>';

    try {
        const r = await secureFetch(`${SIRH_CONFIG.apiBaseUrl}/get-global-audit?month=${month}&year=${year}`);
        const data = await r.json();
        
        // Stockage dans l'état global
        AppState.lastAuditData = data;
        
        if(labelEl) labelEl.innerText = "VISITES CUMULÉES (ÉQUIPE TERRAIN)";
        
        // Calculs des 3 KPIs
        const totalVisites = data.reduce((acc, row) => acc + row.total_visites, 0);
        const totalProduits = data.reduce((acc, row) => acc + (row.total_produits || 0), 0);
        const agentsActifs = data.filter(row => row.total_visites > 0).length;

        // Mise à jour des compteurs dans l'UI
        const elVisites = document.getElementById('stat-visites-total');
        const elProduits = document.getElementById('stat-produits-total');
        const elAgents = document.getElementById('stat-agents-actifs');

        if(elVisites) elVisites.innerText = totalVisites;
        if(elProduits) elProduits.innerText = totalProduits;
        if(elAgents) elAgents.innerText = agentsActifs;

        // Appel de la fonction de rendu du tableau (doit aussi être dans ops.js)
        renderAuditTable(data);

    } catch (e) {
        console.error("Erreur Audit Global:", e);
        container.innerHTML = '<div class="col-span-full text-center text-red-500 py-10 font-bold uppercase text-xs tracking-widest">Erreur lors de la génération de la synthèse</div>';
    }
}




export function peakText(el) {
  el.classList.remove("line-clamp-1");
  el.classList.add(
    "whitespace-normal",
    "bg-blue-50",
    "p-3",
    "rounded-xl",
    "text-slate-800",
    "border",
    "border-blue-200",
    "shadow-xl",
    "z-50",
    "relative",
  );
}

export function unpeakText(el) {
  if (el.dataset.fixed !== "true") {
    // On ne ferme pas si l'utilisateur a cliqué pour le bloquer
    el.classList.add("line-clamp-1");
    el.classList.remove(
      "whitespace-normal",
      "bg-blue-50",
      "p-3",
      "rounded-xl",
      "text-slate-800",
      "border",
      "border-blue-200",
      "shadow-xl",
      "z-50",
      "relative",
    );
  }
}

export function setReportView(mode) {
  window.reportViewMode = mode;
  fetchMobileReports();
}

export function handleReportSearch() {
  const searchTerm = document
    .getElementById("filter-report-name")
    .value.toLowerCase();

  if (AppState.currentReportTab === "audit") {
    // Si on est sur l'audit, on filtre le tableau déjà chargé (très rapide)
    filterAuditTableLocally(searchTerm);
  } else {
    // Sinon, on lance la recherche classique (serveur) pour les visites ou bilans
    fetchMobileReports(1);
  }
}

export async function openDailyReportModal() {
  // On ajoute le champ pour la photo dans le HTML de l'alerte
  const { value: formValues } = await Swal.fire({
    title: `Mon ${AppState.labels.report_singular} d'activité`,
    html: `
      <p class="text-[10px] text-slate-400 uppercase font-black mb-2">Résumé global de vos ${AppState.labels.visit_plural.toLowerCase()}</p>

            <!-- CONTENEUR RELATIF -->
            <div class="relative">
                <textarea id="daily-summary" class="swal2-textarea" style="height: 100px; margin-top:0;" placeholder="Nombre de visites, difficultés..."></textarea>
                
                <!-- LE MICRO -->
                <button type="button" onclick="window.toggleDictation('daily-summary', this)" 
                    class="absolute bottom-3 right-3 p-2 rounded-full bg-white border border-slate-200 text-slate-400 shadow-sm hover:text-blue-600 transition-all z-10">
                    <i class="fa-solid fa-microphone"></i>
                </button>
            </div>
            
            <!-- NOUVEAU : Zone Photo -->
            <div class="my-4 text-left">
                <label class="block text-[10px] font-black text-slate-400 uppercase mb-1">Photo du Rapport / Cahier (Optionnel)</label>
                <input type="file" id="daily-photo" class="block w-full text-xs text-slate-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-full file:border-0
                  file:text-xs file:font-semibold
                  file:bg-blue-50 file:text-blue-700
                  hover:file:bg-blue-100
                " accept="image/*,application/pdf">
            </div>

            <div class="flex items-center gap-2 mt-4 p-3 bg-orange-50 rounded-xl border border-orange-100">
                <input type="checkbox" id="daily-restock" class="w-5 h-5 text-orange-600 rounded focus:ring-orange-500">
                <label for="daily-restock" class="text-xs font-bold text-orange-800">Besoin de stock / échantillons ?</label>
            </div>
        `,
    confirmButtonText: "Envoyer le rapport",
    showCancelButton: true,
    confirmButtonColor: "#0f172a",
    cancelButtonText: "Fermer",
    cancelButtonColor: "#94a3b8",
    reverseButtons: true,
    preConfirm: () => {
      return {
        summary: document.getElementById("daily-summary").value,
        needs_restock: document.getElementById("daily-restock").checked,
        photo: document.getElementById("daily-photo").files[0], // On récupère le fichier
      };
    },
  });

  if (formValues) {
    Swal.fire({
      title: "Envoi du rapport...",
      text: "Téléversement de la photo en cours...",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    try {
      // ON PASSE EN FORMDATA POUR ENVOYER LE FICHIER
      const fd = new FormData();
      fd.append("employee_id", AppState.currentUser.id);
      fd.append("summary", formValues.summary);
      fd.append("needs_restock", formValues.needs_restock);

      if (formValues.photo) {
        Swal.update({ text: "Compression de la photo en cours..." });
        const compressedPhoto = await compressImage(formValues.photo);
        fd.append("report_doc", compressedPhoto);
      }

      // Note: On ne met PAS de 'Content-Type': 'application/json' car c'est du FormData
      const response = await secureFetch(
        `${SIRH_CONFIG.apiBaseUrl}/submit-daily-report`,
        {
          method: "POST",
          body: fd,
        },
      );

      Swal.close();

      if (response.ok) {
        Swal.fire(
          "Succès !",
          "Votre bilan et la photo ont été transmis.",
          "success",
        );
      } else {
        throw new Error("Erreur serveur");
      }
    } catch (e) {
      Swal.close();
      console.error(e);
      Swal.fire("Erreur", "Le rapport n'a pas pu être envoyé.", "error");
    }
  }
}

export function toggleDictation(targetId, btn) {
  // 1. Vérification de compatibilité (si le téléphone ne peut pas, on prévient)
  if (
    !("webkitSpeechRecognition" in window) &&
    !("SpeechRecognition" in window)
  ) {
    return Swal.fire(
      "Info",
      "La dictée vocale n'est pas disponible sur ce navigateur.",
      "info",
    );
  }

  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  const target = document.getElementById(targetId);

  // 2. Si on clique pour arrêter
  if (AppState.recognition && AppState.recognition.started) {
    recognition.stop();
    return;
  }

  // 3. Configuration
  AppState.recognition = new SpeechRecognition();
  recognition.lang = "fr-FR"; // Français
  recognition.interimResults = false;

  // 4. Démarrage (Feedback visuel)
  AppState.recognition.onstart = () => {
    AppState.recognition.started = true;
    btn.classList.remove("text-slate-400", "bg-white");
    btn.classList.add("text-white", "bg-red-500", "animate-pulse"); // Devient rouge et pulse
    btn.innerHTML = '<i class="fa-solid fa-microphone-lines"></i>';
  };

  // 5. Fin (Retour à la normale)
  AppState.recognition.onend = () => {
    AppState.recognition.started = false;
    btn.classList.remove("text-white", "bg-red-500", "animate-pulse");
    btn.classList.add("text-slate-400", "bg-white");
    btn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
  };

  // 6. Résultat (On AJOUTE le texte au lieu de remplacer)
  AppState.recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    // On ajoute un espace si le champ n'est pas vide
    const prefix = target.value ? " " : "";
    target.value += prefix + transcript;
  };

  AppState.recognition.start();
}

export async function deleteVisitReport(id) {
  const confirm = await Swal.fire({
    title: "Supprimer ?",
    text: "Cette visite sera retirée définitivement.",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#ef4444",
  });
  if (confirm.isConfirmed) {
    try {
      const r = await secureFetch(
        `${SIRH_CONFIG.apiBaseUrl}/delete-visit-report`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        },
      );
      if (r.ok) {
        document.getElementById("row-vis-" + id).remove();
      }
    } catch (e) {
      console.error(e);
    }
  }
}

export async function deleteDailyReport(id) {
  try {
    const r = await secureFetch(
      `${SIRH_CONFIG.apiBaseUrl}/delete-daily-report`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      },
    );
    if (r.ok) {
      const row = document.getElementById("row-daily-" + id);
      row.style.opacity = "0";
      setTimeout(() => row.remove(), 300);
    }
  } catch (e) {
    console.error(e);
  }
}

export function toggleTextFixed(el) {
  const isFixed = el.dataset.fixed === "true";
  el.dataset.fixed = isFixed ? "false" : "true";

  if (!isFixed) {
    peakText(el);
    el.classList.replace("bg-blue-50", "bg-amber-50"); // Couleur différente pour dire "bloqué ouvert"
    el.classList.replace("border-blue-200", "border-amber-200");
  } else {
    el.dataset.fixed = "false";
    unpeakText(el);
  }
}

export function startScanner() {
  let scannerInstance = null;
  Swal.fire({
    title: "SCANNER",
    html: '<div id="reader"></div>',
    didOpen: () => {
      scannerInstance = new Html5Qrcode("reader");
      scannerInstance.start({ facingMode: "environment" }, { fps: 10 }, (d) => {
        scannerInstance.stop().then(() => {
          let id = d;
          try {
            id = new URL(d).searchParams.get("id");
          } catch (e) {}
          secureFetch(
            `${URL_GATEKEEPER}?id=${encodeURIComponent(id)}&key=${SCAN_KEY}&agent=${encodeURIComponent(AppState.currentUser.nom)}`,
          )
            .then((r) => r.json())
            .then((d) => {
              if (d.status === "valid") Swal.fire("ACCÈS OK", d.nom, "success");
              else {
                Swal.fire({ icon: "error", title: "REFUSÉ" }).then(
                  () => (location.href = URL_REDIRECT_FAILURE),
                );
              }
            });
        });
      });
    },
    willClose: () => {
      if (scannerInstance) {
        scannerInstance.stop().catch((err) => console.log("Stop Qr"));
      }
    },
  });
}

export async function renderPerformanceTable() {
  const body = document.getElementById("performance-table-body");
  if (!body) return;

  if (
    AppState.currentUser.role === "EMPLOYEE" ||
    !AppState.currentUser.permissions.can_see_employees
  ) {
    return; // On arrête silencieusement, pas d'erreur serveur.
  }

  // On définit la période (Mois en cours)
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  body.innerHTML =
    '<tr><td colspan="4" class="p-10 text-center"><i class="fa-solid fa-circle-notch fa-spin text-blue-600"></i></td></tr>';

  try {
    const r = await secureFetch(
      `${SIRH_CONFIG.apiBaseUrl}/get-boss-summary?month=${month}&year=${year}`,
    );
    const data = await r.json();

    body.innerHTML = "";
    if (data.length === 0) {
      body.innerHTML =
        '<tr><td colspan="4" class="p-10 text-center text-slate-400">Aucune activité ce mois-ci.</td></tr>';
      return;
    }

    // Mise à jour de la stat rapide
    let totalVisitesGlobal = 0;

    data.forEach((emp) => {
      totalVisitesGlobal += emp.total;
      const lieuxUniques = [...new Set(emp.details.map((d) => d.lieu))].length;

      body.innerHTML += `
                <tr class="hover:bg-slate-50 transition-all">
                    <td class="px-8 py-5">
                        <div class="font-black text-slate-800 uppercase text-sm">${emp.nom}</div>
                        <div class="text-[10px] text-slate-400 font-bold">${emp.matricule}</div>
                    </td>
                    <td class="px-8 py-5">
                        <span class="bg-blue-50 text-blue-600 px-3 py-1 rounded-full font-black text-xs">${emp.total} visites</span>
                    </td>
                    <td class="px-8 py-5 text-sm font-bold text-slate-600">${lieuxUniques} sites visités</td>
                    <td class="px-8 py-5 text-right">
                        <button onclick="window.showDetailedEmpReport('${emp.nom}')" class="text-blue-600 font-black text-[10px] uppercase hover:underline">Détails par lieu</button>
                    </td>
                </tr>
            `;
    });

    document.getElementById("stat-visites-total").innerText =
      totalVisitesGlobal;

    // On stocke les données pour pouvoir afficher le détail au clic
    AppState.currentPerformanceData = data;
  } catch (e) {
    console.error(e);
  }
}

export function showDetailedEmpReport(empName) {
  const empData = AppState.currentPerformanceData.find(
    (e) => e.nom === empName,
  );
  if (!empData) return;

  let html =
    '<div class="text-left space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scroll">';
  empData.details.forEach((visite) => {
    html += `
            <div class="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div class="flex justify-between font-bold text-xs text-slate-800 mb-1">
                    <span>${visite.lieu}</span>
                    <span class="text-blue-600">${new Date(visite.date).toLocaleDateString()}</span>
                </div>
                <p class="text-[10px] text-slate-500 italic">"${visite.notes || "Pas de commentaire"}"</p>
                <div class="mt-2 text-[9px] font-black uppercase text-emerald-600">${visite.resultat}</div>
            </div>
        `;
  });
  html += "</div>";

  Swal.fire({
    title: `Activité de ${empName}`,
    html: html,
    width: "600px",
    confirmButtonText: "Fermer",
    confirmButtonColor: "#0f172a",
  });
}


export function renderPersonalReport(reports, container) {
  if (!container) return;
  if (!reports || reports.length === 0) {
    container.innerHTML =
      '<p class="text-xs text-slate-400 italic p-4 text-center">Aucun rapport disponible.</p>';
    return;
  }

  // --- TRI LONG TERME : On inverse l'ordre (le dernier arrivé en premier) ---
  // Si 'reports' vient d'Airtable, c'est souvent du plus ancien au plus récent.
  // On fait un reverse() simple pour afficher le dernier mois en haut.
  const sortedReports = [...reports].reverse();

  container.innerHTML = "";

  sortedReports.forEach((item) => {
    // ... (Le reste de votre code d'affichage reste identique) ...
    // Utilisez 'item' ici
    let mois = item.mois || item["Mois/Année"] || "-";
    let heures = item.heures || item["Total Heures"] || 0;
    let jours = item.jours || item["Jours de présence"] || 0;
    const letter = mois !== "-" ? mois.charAt(0) : "?";

    container.innerHTML += `
            <div class="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-xl hover:bg-white transition-colors">
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-lg shadow-sm border border-indigo-200">${letter}</div>
                    <div><h4 class="font-bold text-slate-800 text-sm capitalize">${mois}</h4><p class="text-[10px] text-slate-500 font-medium">Cumul validé</p></div>
                </div>
                <div class="text-right">
                    <p class="text-sm font-black text-slate-800">${heures}h <span class="text-[10px] text-slate-400 font-normal">/ ${jours}j</span></p>
                    <span class="text-[9px] font-bold text-emerald-500 uppercase bg-emerald-50 px-2 py-0.5 rounded">Validé</span>
                </div>
            </div>
        `;
  });
}




/**
 * Récupère et affiche le rapport de présence (Journalier ou Mensuel)
 */
export async function fetchAttendanceReport(mode = 'PERSONAL', period = 'monthly') {
    const container = document.getElementById('personal-report-container');
    
    if (mode === 'GLOBAL') {
        window.Swal.fire({ title: 'Chargement...', text: 'Analyse des présences en cours', didOpen: () => window.Swal.showLoading() });
    } else {
        if(container) container.innerHTML = '<div class="flex justify-center p-4"><i class="fa-solid fa-circle-notch fa-spin text-indigo-500"></i></div>';
    }

    try {
        // Utilisation de AppState.currentUser
        const url = `${URL_READ_REPORT}?agent=${encodeURIComponent(AppState.currentUser.nom)}&requester_id=${encodeURIComponent(AppState.currentUser.id)}&mode=${mode}&period=${period}`;
        const r = await secureFetch(url);
        const cleanReports = await r.json(); 

        if (mode === 'GLOBAL') {
            window.Swal.close();
            let tableHtml = '';
            
            if (period === 'today') {
                const nbPresents = cleanReports.filter(r => r.statut === 'PRÉSENT').length;
                const nbPartis = cleanReports.filter(r => r.statut === 'PARTI').length;
                const nbAbsents = cleanReports.filter(r => r.statut === 'ABSENT' || r.statut === 'CONGÉ').length;

                tableHtml = `
                    <div class="grid grid-cols-3 gap-3 mb-6">
                        <div class="bg-emerald-50 p-3 rounded-2xl border border-emerald-100 text-center">
                            <p class="text-[8px] font-black text-emerald-600 uppercase">En Poste</p>
                            <h4 class="text-xl font-black text-emerald-700">${nbPresents}</h4>
                        </div>
                        <div class="bg-blue-50 p-3 rounded-2xl border border-blue-100 text-center">
                            <p class="text-[8px] font-black text-blue-600 uppercase">Terminé</p>
                            <h4 class="text-xl font-black text-blue-700">${nbPartis}</h4>
                        </div>
                        <div class="bg-rose-50 p-3 rounded-2xl border border-rose-100 text-center">
                            <p class="text-[8px] font-black text-rose-600 uppercase">Absents</p>
                            <h4 class="text-xl font-black text-rose-700">${nbAbsents}</h4>
                        </div>
                    </div>
                    
                    <div class="flex justify-end mb-4">
                        <button onclick="window.downloadReportCSV('${period}')" class="bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase shadow hover:bg-emerald-700 transition-all flex items-center gap-2"><i class="fa-solid fa-file-csv"></i> Exporter Excel</button>
                    </div>
                    <div class="overflow-x-auto max-h-[50vh] custom-scroll border rounded-xl">
                        <table class="w-full text-left whitespace-nowrap">
                            <thead class="bg-slate-900 text-white text-[9px] uppercase font-black sticky top-0">
                                <tr>
                                    <th class="p-3">Employé</th>
                                    <th class="p-3 text-center">Statut</th>
                                    <th class="p-3 text-center">Arrivée</th>
                                    <th class="p-3 text-center">Temps de Présence</th>
                                    <th class="p-3 text-right">Zone</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100 text-[11px]">
                `;

                cleanReports.forEach(item => {
                    let badgeClass = "bg-rose-100 text-rose-700"; 
                    if (item.statut === 'PRÉSENT') badgeClass = "bg-emerald-100 text-emerald-700";
                    else if (item.statut === 'PARTI') badgeClass = "bg-blue-100 text-blue-700";
                    else if (item.statut === 'CONGÉ') badgeClass = "bg-amber-100 text-amber-700";

                    tableHtml += `
                        <tr class="${item.statut === 'ABSENT' ? 'opacity-60 bg-slate-50/50' : ''}">
                            <td class="p-3">
                                <div class="font-bold text-slate-700 uppercase">${item.nom}</div>
                                <div class="text-[9px] text-slate-400">ID: ${item.matricule}</div>
                            </td>
                            <td class="p-3 text-center">
                                <span class="px-2 py-0.5 rounded font-black text-[9px] ${badgeClass}">${item.statut}</span>
                            </td>
                            <td class="p-3 text-center font-mono font-bold text-slate-500">${item.arrivee}</td>
                            <td class="p-3 text-center">
                                <div class="font-black text-indigo-600">${item.duree}</div>
                                <div class="text-[8px] text-slate-400 font-bold uppercase">${item.statut === 'PRÉSENT' ? 'Live' : 'Total'}</div>
                            </td>
                            <td class="p-3 text-right text-slate-400 font-medium">${item.zone}</td>
                        </tr>
                    `;
                });
            } else {
                tableHtml = `
                    <div class="flex justify-end mb-4">
                        <button onclick="window.downloadReportCSV('${period}')" class="bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase shadow hover:bg-emerald-700 transition-all flex items-center gap-2"><i class="fa-solid fa-file-csv"></i> Télécharger Cumul</button>
                    </div>
                    <div class="overflow-x-auto max-h-[60vh] custom-scroll border rounded-xl">
                        <table class="w-full text-left whitespace-nowrap border-collapse">
                            <thead class="bg-slate-900 text-white text-[9px] uppercase font-black sticky top-0">
                                <tr><th class="p-4">Mois</th><th class="p-4">Employé</th><th class="p-4 text-center">Jours Présence</th><th class="p-4 text-center">Heures Totales</th><th class="p-4 text-right">Statut</th></tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100 text-[11px]">
                `;

                cleanReports.forEach(item => {
                    tableHtml += `
                        <tr class="hover:bg-slate-50 transition-all">
                            <td class="p-4 font-bold text-slate-700 capitalize">${item.mois}</td>
                            <td class="p-4 font-medium uppercase">${item.nom}</td>
                            <td class="p-4 text-center font-black text-slate-800">${item.jours} j</td>
                            <td class="p-4 text-center font-mono text-indigo-600 font-black">${item.heures}</td>
                            <td class="p-4 text-right"><span class="bg-emerald-50 text-emerald-600 px-2 py-1 rounded font-bold text-[9px]">Validé</span></td>
                        </tr>`;
                });
            }

            tableHtml += `</tbody></table></div>`;
            window.Swal.fire({
                title: period === 'today' ? 'Analyse des Présences' : 'Cumul Mensuel',
                html: tableHtml,
                width: '900px',
                confirmButtonText: 'Fermer',
                confirmButtonColor: '#0f172a',
                customClass: { popup: 'rounded-2xl' }
            });
            // Mise à jour de AppState
            AppState.currentReportData = cleanReports; 
        } else {
            // Assure-toi que renderPersonalReport est aussi exportée dans ops.js
            window.renderPersonalReport(cleanReports, container);
        }
    } catch (e) {
        console.error("Erreur rapport:", e);
        window.Swal.fire('Erreur', "Impossible de charger le rapport.", 'error');
    }
}

export async function openAttendancePicker() {
  Swal.fire({
    title: "Rapport de Présence",
    text: "Quelle période souhaitez-vous consulter ?",
    icon: "question",
    showDenyButton: true,
    showCancelButton: true,
    confirmButtonText: "🕒 Aujourd'hui",
    denyButtonText: "📅 Mensuel (Cumul)",
    cancelButtonText: "Annuler",
    confirmButtonColor: "#4f46e5",
    denyButtonColor: "#0f172a",
  }).then((result) => {
    if (result.isConfirmed) {
      fetchAttendanceReport("GLOBAL", "today");
    } else if (result.isDenied) {
      fetchAttendanceReport("GLOBAL", "monthly");
    }
  });
}

export function downloadReportCSV(period = "monthly") {
  if (!AppState.currentReportData || AppState.currentReportData.length === 0) {
    return Swal.fire("Erreur", "Aucune donnée à exporter.", "warning");
  }

  let headers = [];
  let csvContent = "";

  if (period === "today") {
    // --- EN-TÊTES POUR LE RAPPORT DU JOUR (LIVE) ---
    headers = [
      "Employé",
      "Matricule",
      "Statut",
      "Arrivée",
      "Durée Présence",
      "Zone",
    ];
    csvContent = headers.join(";") + "\n";

    AppState.currentReportData.forEach((row) => { 
      const clean = (text) =>
        text ? String(text).replace(/;/g, ",").replace(/\n/g, " ") : "---";

      // Correction ici : On utilise 'arrivee' au lieu de 'heure_arrivee'
      // Et on ajoute une sécurité pour éviter le crash si la valeur est vide
      let hAffiche = row.arrivee || "---";
      if (
        hAffiche &&
        typeof hAffiche === "string" &&
        hAffiche.match(/(\d{2}:\d{2})/)
      ) {
        hAffiche = hAffiche.match(/(\d{2}:\d{2})/)[1];
      }

      const rowData = [
        clean(row.nom),
        clean(row.matricule),
        clean(row.statut),
        clean(hAffiche),
        clean(row.duree),
        clean(row.zone),
      ];
      const cleanRow = rowData.map(
        (val) => `"${String(val).replace(/"/g, '""')}"`,
      );
      csvContent += cleanRow.join(";") + "\n";
    });
  } else {
    // --- EN-TÊTES POUR LE RAPPORT MENSUEL (CUMUL) ---
    headers = [
      "Mois/Année",
      "Employé",
      "Jours Présence",
      "Total Heures",
      "Statut",
    ];
    csvContent = headers.join(";") + "\n";

    AppState.currentReportData.forEach((row) => { 
      const clean = (text) =>
        text ? String(text).replace(/;/g, ",").replace(/\n/g, " ") : "---";

      const rowData = [
        clean(row.mois),
        clean(row.nom),
        clean(row.jours),
        clean(row.heures),
        "Validé",
      ];
      const cleanRow = rowData.map(
        (val) => `"${String(val).replace(/"/g, '""')}"`,
      );
      csvContent += cleanRow.join(";") + "\n";
    });
  }

  // --- CRÉATION ET TÉLÉCHARGEMENT DU FICHIER ---
  const blob = new Blob(["\ufeff" + csvContent], {
    type: "text/csv;charset=utf-8;",
  });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  const dateStr = new Date().toLocaleDateString("fr-FR").replace(/\//g, "-");
  const fileName =
    period === "today"
      ? `Presence_Live_${dateStr}.csv`
      : `Presence_Mensuelle_${dateStr}.csv`;

  link.setAttribute("href", url);
  link.setAttribute("download", fileName);
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
