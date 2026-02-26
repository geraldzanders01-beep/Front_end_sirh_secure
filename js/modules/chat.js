import { AppState } from "../core/state.js";
import { SIRH_CONFIG, NOTIF_SOUND, supabaseClient } from "../core/config.js";
import { compressImage } from "../core/utils.js";

export async function fetchMessages() {
  const container = document.getElementById("chat-container");
  if (!container) return;

  try {
    const response = await secureFetch(
      `${SIRH_CONFIG.apiBaseUrl}/read-messages?agent=${encodeURIComponent(AppState.currentUser.nom)}`,
    );
    const messages = await response.json();

    // Petite optimisation : si le nombre de messages n'a pas changé, on ne redessine pas tout
    if (container.dataset.msgCount == messages.length) return;
    container.dataset.msgCount = messages.length;

    container.innerHTML = "";
    let lastDate = null;

    messages.forEach((msg) => {
      // Gestion de la date (Afficher "Aujourd'hui" ou la date si ça change)
      const msgDate = new Date(msg.date);
      const dateStr = msgDate.toLocaleDateString();
      if (dateStr !== lastDate) {
        container.innerHTML += `<div class="flex justify-center my-4"><span class="bg-slate-100 text-slate-400 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">${dateStr}</span></div>`;
        lastDate = dateStr;
      }

      const isMe = String(msg.sender_id) === String(AppState.currentUser.id);
      const time = msgDate.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      });

      // Design différent pour MOI (Droite/Bleu) et les AUTRES (Gauche/Gris)
      const align = isMe ? "justify-end" : "justify-start";
      const bg = isMe
        ? "bg-blue-600 text-white rounded-tr-none"
        : "bg-white border border-slate-100 text-slate-600 rounded-tl-none";
      const metaAlign = isMe ? "text-right" : "text-left";

      let mediaHtml = "";
      if (msg.file && msg.file !== "null" && msg.file !== "") {
        const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(msg.file);

        if (isImg) {
          mediaHtml = `
                        <div class="mt-2 rounded-xl overflow-hidden border border-black/5 shadow-sm bg-white">
                            <img src="${msg.file}" class="w-full h-auto max-h-64 object-cover cursor-pointer hover:opacity-90 transition-all" onclick="window.open('${msg.file}', '_blank')">
                        </div>`;
        } else {
          // Design pour les fichiers (PDF, DOC, etc.)
          mediaHtml = `
                        <a href="${msg.file}" target="_blank" class="flex items-center gap-3 mt-2 p-3 bg-slate-50 border border-slate-100 rounded-xl hover:bg-slate-100 transition-all group">
                            <div class="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm text-blue-600 group-hover:scale-110 transition-transform">
                                <i class="fa-solid fa-file-lines text-lg"></i>
                            </div>
                            <div class="flex-1 overflow-hidden">
                                <p class="text-[11px] font-bold text-slate-700 truncate">${msg.file.split("/").pop().substring(13)}</p>
                                <p class="text-[9px] text-blue-500 font-black uppercase">Cliquez pour télécharger</p>
                            </div>
                        </a>`;
        }
      }

      container.innerHTML += `
                <div class="flex ${align} gap-3 mb-2 animate-fadeIn">
                    ${!isMe ? `<div class="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs shrink-0 border border-indigo-200 shadow-sm">${msg.sender_name ? msg.sender_name.charAt(0) : "?"}</div>` : ""}
                    
                    <div class="max-w-[75%]">
                        ${!isMe ? `<p class="text-[9px] font-bold text-slate-400 ml-1 mb-1">${msg.sender_name || "Inconnu"}</p>` : ""}
                        
                        <div class="p-4 rounded-2xl shadow-sm ${bg} text-sm font-medium leading-relaxed">
                            ${msg.message}
                            ${mediaHtml}
                        </div>
                        <p class="text-[9px] text-slate-300 mt-1 ${metaAlign} opacity-70">${time}</p>
                    </div>
                </div>
            `;
    });

    // Scroll tout en bas
    container.scrollTop = container.scrollHeight;
  } catch (e) {
    console.error("Chat Error", e);
  }
}

export async function sendMessage(e) {
  e.preventDefault();
  const input = document.getElementById("chat-input");
  const fileInput = document.getElementById("chat-file");
  const btn = document.getElementById("btn-send-chat");

  const txt = input.value.trim();
  const hasFile = fileInput.files.length > 0;

  if (!txt && !hasFile) return;

  btn.disabled = true;

  const fd = new FormData();
  fd.append("sender_id", AppState.currentUser.id);
  fd.append("agent", AppState.currentUser.nom);
  fd.append("message", txt);

  if (hasFile) {
    // --- NOUVEAU : COMPRESSION POUR LE CHAT ---
    Swal.update({ text: "Compression du fichier en cours..." });
    const compressedChatFile = await compressImage(fileInput.files[0]);
    fd.append("chat_file", compressedChatFile);
  }

  try {
    const response = await fetch(`${SIRH_CONFIG.apiBaseUrl}/send-message`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("sirh_token")}`,
      },
      body: fd,
    });

    if (response.ok) {
      input.value = "";
      cancelFile(); // Vide l'aperçu et l'input file
      fetchMessages();
    }
  } catch (err) {
    console.error("Erreur envoi chat:", err);
  } finally {
    btn.disabled = false;
    input.focus();
  }
}

export function cancelFile() {
  document.getElementById("chat-file").value = ""; // Vide l'input
  document.getElementById("chat-preview-container").classList.add("hidden"); // Cache la boîte
  document.getElementById("file-indicator").classList.add("hidden"); // Cache le petit point bleu
}

export function initChatRealtime() {
  if (chatSubscription) return; // On n'ouvre pas deux fois la connexion

  console.log("📡 Connexion au Chat Realtime...");

  chatSubscription = supabaseClient
    .channel("public:messages")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
      },
      (payload) => {
        console.log("✨ Nouveau message reçu :", payload.new);

        // On recharge les messages pour afficher le nouveau
        fetchMessages();

        // Jouer le son si ce n'est pas nous l'expéditeur
        if (String(payload.new.sender_id) !== String(AppState.currentUser.id)) {
          NOTIF_SOUND.play().catch(() => {});
        }
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log("✅ Chat en direct activé !");
      }
    });
}

window.addEventListener("DOMContentLoaded", () => {
  const chatFileInput = document.getElementById("chat-file");
  if (chatFileInput) {
    chatFileInput.addEventListener("change", function (e) {
      const file = e.target.files[0];
      const maxSize = 5 * 1024 * 1024; // 5 Mo
      if (file) {
        if (file.size > maxSize) {
          Swal.fire({
            icon: "warning",
            title: "Fichier trop lourd",
            text: "La taille max est de 5 Mo.",
            confirmButtonColor: "#2563eb",
          });
          this.value = "";
          return;
        }
        const previewImg = document.getElementById("chat-img-preview");
        const fileName = document.getElementById("chat-file-name");
        const container = document.getElementById("chat-preview-container");

        if (file.type.startsWith("image/")) {
          const reader = new FileReader();
          reader.onload = (event) => {
            previewImg.src = event.target.result;
          };
          reader.readAsDataURL(file);
        } else {
          previewImg.src =
            "https://cdn-icons-png.flaticon.com/512/2991/2991112.png";
        }
        fileName.innerText = file.name;
        container.classList.remove("hidden");
        document.getElementById("file-indicator").classList.remove("hidden");
      }
    });
  }
});
