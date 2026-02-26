import { AppState } from "./state.js";

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
      success:
        "https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3",
      notification:
        "https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3",
    };
    const audio = new Audio(sounds[soundName]);
    audio.volume = 0.3;
    audio.play().catch((e) => console.log("Audio bloqué"));
  },
};

export function injectPaginationUI(containerId, meta, callbackName) {
  const container = document.getElementById(containerId);
  if (!container || !meta || meta.last_page <= 1) return;

  const html = `
        <div class="flex justify-between items-center mt-6 p-4 bg-white rounded-2xl border shadow-sm">
            <button onclick="${callbackName}(${meta.page - 1})" ${meta.page <= 1 ? "disabled" : ""} 
                class="px-4 py-2 text-xs font-bold uppercase text-slate-500 disabled:opacity-20">
                <i class="fa-solid fa-arrow-left mr-2"></i> Précédent
            </button>
            <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Page ${meta.page} / ${meta.last_page}
            </span>
            <button onclick="${callbackName}(${meta.page + 1})" ${meta.page >= meta.last_page ? "disabled" : ""} 
                class="px-4 py-2 text-xs font-bold uppercase text-blue-600 disabled:opacity-20">
                Suivant <i class="fa-solid fa-arrow-right ml-2"></i>
            </button>
        </div>
    `;

  // On l'ajoute à la fin de la section
  container.insertAdjacentHTML("beforeend", html);
}

export async function triggerGlobalPush(title, message) {
  PremiumUI.play("notification");
  PremiumUI.vibrate("success");

  if (Notification.permission === "granted") {
    const reg = await navigator.serviceWorker.ready;
    reg.showNotification(title, {
      body: message,
      icon: "https://cdn-icons-png.flaticon.com/512/13594/13594876.png",
      badge: "https://cdn-icons-png.flaticon.com/512/13594/13594876.png",
      vibrate: [100, 50, 100],
      data: { url: window.location.href }, // Pour rouvrir l'app au bon endroit
      actions: [{ action: "open", title: "Voir maintenant" }],
    });
  }
}

export function getContrastColor(hexColor) {
  // Nettoyer le hex
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  // Calcul de la luminosité (formule standard)
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? "#1e293b" : "#ffffff"; // Si clair -> texte noir, si sombre -> texte blanc
}

export const CSVManager = {
  // 1. Générer et télécharger un fichier modèle vide
  downloadTemplate: (headers, filename) => {
    // AJOUT ICI : { delimiter: ";" } pour forcer le point-virgule
    const csv = window.Papa.unparse([headers], { delimiter: ";" });
    CSVManager._triggerDownload(csv, filename);
  },

  // 2. Exporter un tableau de données JSON en CSV
  exportData: (dataArray, filename) => {
    if (!dataArray || dataArray.length === 0) {
      return window.Swal.fire("Oups", "Aucune donnée à exporter", "warning");
    }
    // AJOUT ICI : { delimiter: ";" } pour forcer le point-virgule
    const csv = window.Papa.unparse(dataArray, { delimiter: ";" });
    CSVManager._triggerDownload(csv, filename);
  },

  // 3. Lire, parser et valider un fichier importé
  parseAndValidate: (file, requiredColumns) => {
    return new Promise((resolve, reject) => {
      window.Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim().toLowerCase(),
        // PapaParse détecte automatiquement le séparateur en lecture,
        // donc pas besoin de forcer ici, il lira aussi bien , que ;
        complete: (results) => {
          if (
            results.errors.length > 0 &&
            results.errors[0].code !== "TooFewFields"
          ) {
            return reject("Le fichier est mal formaté ou corrompu.");
          }

          const data = results.data;
          if (data.length === 0) return reject("Le fichier est vide.");

          const actualHeaders = Object.keys(data[0]);
          const missingColumns = requiredColumns.filter(
            (reqCol) => !actualHeaders.includes(reqCol.toLowerCase()),
          );

          if (missingColumns.length > 0) {
            return reject(
              `Colonnes obligatoires manquantes : ${missingColumns.join(", ")}`,
            );
          }

          resolve(data);
        },
        error: (err) => reject(err.message),
      });
    });
  },

  // Fonction interne (Inchangée mais cruciale pour les accents)
  _triggerDownload: (csvContent, filename) => {
    // Le \ufeff (BOM) est OBLIGATOIRE pour qu'Excel lise les accents (é, è, à)
    const blob = new Blob(["\ufeff" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },
};

export async function compressImage(file, maxWidth = 1200, quality = 0.7) {
  return new Promise((resolve) => {
    if (!file || !file.type.startsWith("image/")) {
      resolve(file); // Si ce n'est pas une image, on ne compresse pas
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

        // Convertir le canvas en Blob (fichier)
        canvas.toBlob(
          (blob) => {
            resolve(blob);
          },
          file.type, // Garder le type original de l'image (ex: image/jpeg)
          quality, // Qualité de compression (0.7 = 70%)
        );
      };
      img.onerror = () => resolve(file); // En cas d'erreur de chargement, renvoyer le fichier original
    };
    reader.onerror = () => resolve(file); // En cas d'erreur de lecture, renvoyer le fichier original
  });
}

export function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Rayon de la terre en mètres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Résultat en mètres
}

export function formatGoogleLink(link) {
  if (!link || link === "#" || link === "null") {
    return "https://ui-avatars.com/api/?background=cbd5e1&color=fff&size=128";
  }

  let url = String(link);

  // Si c'est un lien qui vient de Supabase Storage, on ne le transforme pas
  if (url.includes("supabase.co/storage")) {
    return url;
  }

  // Si c'est un lien Google Drive, on applique la transformation habituelle
  const idMatch =
    url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
  if (idMatch && idMatch[1]) {
    return `https://lh3.googleusercontent.com/d/${idMatch[1]}`;
  }

  return url;
}

export function getDriveId(link) {
  if (!link) return null;
  const str = String(link);
  const match =
    str.match(/\/d\/([a-zA-Z0-9_-]+)/) || str.match(/id=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

export function parseDateSmart(d) {
  if (!d) return new Date();
  if (!isNaN(d) && !String(d).includes("/"))
    return new Date((d - 25569) * 86400000);
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

export function escapeHTML(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(
    /[&<>'"]/g,
    (tag) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[tag],
  );
}

export function dataURLtoBlob(dataurl) {
  var arr = dataurl.split(","),
    mime = arr[0].match(/:(.*?);/)[1],
    bstr = atob(arr[1]),
    n = bstr.length,
    u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

export function updatePaginationUI(containerId, meta, callbackName) {
  const footer = document.getElementById(containerId);
  if (!footer) return;

  if (!meta || meta.last_page <= 1) {
    footer.innerHTML = `<span class="text-[10px] font-black text-slate-300 uppercase tracking-widest">Fin de liste</span>`;
    return;
  }

  footer.innerHTML = `
        <button onclick="window.${callbackName}(${meta.page - 1})" ${meta.page <= 1 ? "disabled" : ""} 
            class="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase text-slate-600 disabled:opacity-30 hover:bg-slate-100 transition-all shadow-sm">
            <i class="fa-solid fa-chevron-left"></i> Précédent
        </button>
        
        <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            PAGE ${meta.page} / ${meta.last_page}
        </span>
        
        <button onclick="window.${callbackName}(${meta.page + 1})" ${meta.page >= meta.last_page ? "disabled" : ""} 
            class="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase text-slate-600 disabled:opacity-30 hover:bg-slate-100 transition-all shadow-sm">
            Suivant <i class="fa-solid fa-chevron-right"></i>
        </button>
    `;
}

export async function openHtmlInNewWindow(url) {
  if (!url.toLowerCase().includes(".html")) {
    window.open(url, "_blank");
    return;
  }

  try {
    // 1. On télécharge le contenu du contrat
    const response = await fetch(url);
    const text = await response.text();

    // 2. On crée un "Blob" (un fichier virtuel) en forçant le type HTML
    const blob = new Blob([text], { type: "text/html" });
    const blobUrl = URL.createObjectURL(blob);

    // 3. On ouvre ce fichier virtuel dans un nouvel onglet
    window.open(blobUrl, "_blank");
  } catch (e) {
    console.error("Erreur d'ouverture:", e);
    window.open(url, "_blank"); // Fallback si ça rate
  }
}

export async function downloadHtmlAsPdf(url, title) {
  window.Swal.fire({
    title: "Génération du PDF...",
    text: "Veuillez patienter pendant la mise en page",
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading(),
  });

  try {
    // 1. Récupérer le contenu HTML du contrat
    const response = await fetch(url);
    const htmlSource = await response.text();

    // 2. Configuration optimisée pour html2pdf
    const opt = {
      margin: [10, 10, 10, 10], // Marges en mm
      filename: `${title || "Contrat"}.pdf`,
      image: { type: "jpeg", quality: 1 },
      html2canvas: {
        scale: 2,
        useCORS: true, // Crucial pour charger la signature et les images
        letterRendering: true,
        allowTaint: true,
        logging: false,
      },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    };

    // 3. Exécution directe sur le texte source
    // On ne passe plus par un élément du DOM, on donne le HTML directement
    await window.html2pdf().set(opt).from(htmlSource).save();

    window.Swal.close();
  } catch (e) {
    console.error("Erreur génération PDF:", e);
    window.Swal.fire(
      "Erreur",
      "Impossible de générer le fichier PDF.",
      "error",
    );
  }
}
