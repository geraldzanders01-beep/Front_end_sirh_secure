import { AppState } from "./state.js";

/**
 * UI Premium : Vibrations et Sons
 */
export const PremiumUI = {
  // Vibrations haptiques (Standard iPhone/Android)
  vibrate: (type) => {
    if (!("vibrate" in navigator)) return;
    if (type === "success") navigator.vibrate([50, 30, 50]); // Double tap léger
    if (type === "error") navigator.vibrate([100, 50, 100, 50, 100]); // Alerte forte
    if (type === "click") navigator.vibrate(10); // Micro-vibration tactile
  },

  // Sons discrets et pros
  play: (soundName) => {
    const sounds = {
      success: "https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3",
      notification: "https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3",
    };
    const audio = new Audio(sounds[soundName]);
    audio.volume = 0.3;
    audio.play().catch(() => console.log("Audio bloqué par le navigateur"));
  },
};

/**
 * Pagination : Injection de contrôles dans le DOM
 */
export function injectPaginationUI(containerId, meta, callbackName) {
  const container = document.getElementById(containerId);
  if (!container || !meta || meta.last_page <= 1) return;

  const html = `
        <div class="flex justify-between items-center mt-6 p-4 bg-white rounded-2xl border shadow-sm">
            <button onclick="window.${callbackName}(${meta.page - 1})" ${meta.page <= 1 ? "disabled" : ""} 
                class="px-4 py-2 text-xs font-bold uppercase text-slate-500 disabled:opacity-20 hover:bg-slate-50 rounded-xl transition-all">
                <i class="fa-solid fa-arrow-left mr-2"></i> Précédent
            </button>
            <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Page ${meta.page} / ${meta.last_page}
            </span>
            <button onclick="window.${callbackName}(${meta.page + 1})" ${meta.page >= meta.last_page ? "disabled" : ""} 
                class="px-4 py-2 text-xs font-bold uppercase text-blue-600 disabled:opacity-20 hover:bg-blue-50 rounded-xl transition-all">
                Suivant <i class="fa-solid fa-arrow-right ml-2"></i>
            </button>
        </div>
    `;
  container.insertAdjacentHTML("beforeend", html);
}

/**
 * PWA : Notifications Push locales
 */
export async function triggerGlobalPush(title, message) {
  if (typeof PremiumUI !== "undefined") {
    PremiumUI.play("notification");
    PremiumUI.vibrate("success");
  }

  if (Notification.permission === "granted") {
    const reg = await navigator.serviceWorker.ready;
    reg.showNotification(title, {
      body: message,
      icon: "https://cdn-icons-png.flaticon.com/512/13594/13594876.png",
      badge: "https://cdn-icons-png.flaticon.com/512/13594/13594876.png",
      vibrate: [100, 50, 100],
      data: { url: window.location.href },
      actions: [{ action: "open", title: "Voir maintenant" }],
    });
  }
}

/**
 * Couleurs et Design
 */
export function getContrastColor(hexColor) {
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? "#1e293b" : "#ffffff";
}

/**
 * Dates : Formatage et Conversion
 */
export function parseDateSmart(d) {
  if (!d) return new Date();
  if (!isNaN(d) && !String(d).includes("/")) return new Date((d - 25569) * 86400000);
  if (String(d).includes("/")) {
    const p = d.split("/");
    return new Date(p[2], p[1] - 1, p[0]);
  }
  return new Date(d);
}

export function convertToInputDate(dStr) {
  if (!dStr) return "";
  if (dStr.match(/^\d{4}-\d{2}-\d{2}$/)) return dStr;
  if (dStr.includes("/")) {
    const p = dStr.split("/");
    return `${p[2]}-${p[1].padStart(2, "0")}-${p[0].padStart(2, "0")}`;
  }
  return "";
}

/**
 * CSV Manager : Import/Export (PapaParse)
 */
export const CSVManager = {
  downloadTemplate: (headers, filename) => {
    const csv = window.Papa.unparse([headers], { delimiter: ";" });
    CSVManager._triggerDownload(csv, filename);
  },

  exportData: (dataArray, filename) => {
    if (!dataArray || dataArray.length === 0) {
      return window.Swal.fire("Oups", "Aucune donnée à exporter", "warning");
    }
    const csv = window.Papa.unparse(dataArray, { delimiter: ";" });
    CSVManager._triggerDownload(csv, filename);
  },

  parseAndValidate: (file, requiredColumns) => {
    return new Promise((resolve, reject) => {
      window.Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim().toLowerCase(),
        complete: (results) => {
          if (results.errors.length > 0 && results.errors[0].code !== "TooFewFields") {
            return reject("Le fichier est mal formaté ou corrompu.");
          }
          const data = results.data;
          if (data.length === 0) return reject("Le fichier est vide.");
          const actualHeaders = Object.keys(data[0]);
          const missingColumns = requiredColumns.filter(col => !actualHeaders.includes(col.toLowerCase()));
          if (missingColumns.length > 0) {
            return reject(`Colonnes obligatoires manquantes : ${missingColumns.join(", ")}`);
          }
          resolve(data);
        },
        error: (err) => reject(err.message),
      });
    });
  },

  _triggerDownload: (csvContent, filename) => {
    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },
};

/**
 * Traitement d'images et Blobs
 */
export async function compressImage(file, maxWidth = 1200, quality = 0.7) {
  return new Promise((resolve) => {
    if (!file || !file.type.startsWith("image/")) {
      resolve(file);
      return;
    }
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => resolve(blob), file.type, quality);
      };
      img.onerror = () => resolve(file);
    };
    reader.onerror = () => resolve(file);
  });
}

export function dataURLtoBlob(dataurl) {
  var arr = dataurl.split(","), mime = arr[0].match(/:(.*?);/)[1],
    bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new Blob([u8arr], { type: mime });
}

/**
 * Géolocalisation
 */
export function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Rayon de la terre en mètres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/**
 * Gestion des liens Cloud (Drive / Supabase)
 */
export function formatGoogleLink(link) {
  if (!link || link === "#" || link === "null") {
    return "https://ui-avatars.com/api/?background=cbd5e1&color=fff&size=128";
  }
  let url = String(link);
  if (url.includes("supabase.co/storage")) return url;
  const idMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
  return idMatch ? `https://lh3.googleusercontent.com/d/${idMatch[1]}` : url;
}

export function getDriveId(link) {
  if (!link) return null;
  const match = String(link).match(/\/d\/([a-zA-Z0-9_-]+)/) || String(link).match(/id=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}






/**
 * Utilitaire pour nettoyer et formater les tags de produits en HTML
 * @param {string|Array} rawProducts - Les données brutes des produits
 * @returns {string} HTML des badges de produits
 */
export function formatProductTags(rawProducts) {
    let prods = [];
    try {
        if (typeof rawProducts === 'string') prods = JSON.parse(rawProducts);
        else if (Array.isArray(rawProducts)) prods = rawProducts;
    } catch(e) { return ""; }

    if (!prods || prods.length === 0) return "";

    return `<div class="flex flex-wrap gap-1 mt-2">` + 
        prods.map(p => {
            let name = "";
            // Si c'est un objet (ex: {id: 1, name: "X"})
            if (typeof p === 'object' && p !== null) {
                name = p.name || p.NAME || p.Name || "Produit";
            } 
            // Si c'est une chaîne qui ressemble à du JSON
            else if (typeof p === 'string' && p.startsWith('{')) {
                try { 
                    const obj = JSON.parse(p); 
                    name = obj.name || obj.NAME || "Produit";
                } catch(e) { name = p; }
            } 
            // Si c'est juste du texte
            else {
                name = p || "Produit";
            }
            
            return `<span class="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-[8px] font-black border border-indigo-100 uppercase">${name}</span>`;
        }).join('') + `</div>`;
}





/**
 * Sécurité et HTML
 */
export function escapeHTML(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(/[&<>'"]/g, tag => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  }[tag]));
}

/**
 * Exports et Visualisation (PDF/HTML)
 */
export async function downloadHtmlAsPdf(url, title) {
  window.Swal.fire({
    title: "Génération du PDF...",
    text: "Veuillez patienter pendant la mise en page",
    allowOutsideClick: false,
    didOpen: () => window.Swal.showLoading(),
  });
  try {
    const response = await fetch(url);
    const htmlSource = await response.text();
    const opt = {
      margin: [10, 10, 10, 10],
      filename: `${title || "Contrat"}.pdf`,
      image: { type: "jpeg", quality: 1 },
      html2canvas: {
        scale: 2,
        useCORS: true, 
        letterRendering: true,
        allowTaint: true,
        logging: false,
      },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    };
    await window.html2pdf().set(opt).from(htmlSource).save();
    window.Swal.close();
  } catch (e) {
    window.Swal.fire("Erreur", "Impossible de générer le fichier PDF.", "error");
  }
}



// --- FONCTION PRIVÉE DE CLÔTURE AUTOMATIQUE (INTELLIGENCE MÉTIER) ---
export function calculateAutoClose(startMs, isSecurity) {
            const startDate = new Date(startMs);
            if (isSecurity) {
                // Pour la sécurité/nuit : Forfait de 12 heures de garde
                return startMs + (12 * 60 * 60 * 1000);
            } else {
                // Pour bureau/mobile : Clôture à 18h00 le jour même
                const eighteenHour = new Date(startDate);
                eighteenHour.setHours(18, 0, 0, 0);
                
                // Si l'entrée était déjà après 18h, on accorde 1h symbolique, sinon 18h
                return (startDate.getTime() >= eighteenHour.getTime()) 
                    ? startDate.getTime() + (60 * 60 * 1000) 
                    : eighteenHour.getTime();
            }
        }

