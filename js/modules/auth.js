import { AppState } from "../core/state.js";
import { URL_LOGIN, SIRH_CONFIG, NOTIF_SOUND } from "../core/config.js";
import { secureFetch } from "../core/api.js";

export async function handleLogin(e) {
  e.preventDefault();
  // Déverrouille l'audio pour mobile
  NOTIF_SOUND.play()
    .then(() => {
      NOTIF_SOUND.pause();
      NOTIF_SOUND.currentTime = 0;
    })
    .catch(() => {});

  const u = document.getElementById("login-user").value.trim();
  const p = document.getElementById("login-pass").value.trim();
  const btn = document.getElementById("btn-login");
  const originalBtnText = btn.innerHTML;

  btn.innerHTML =
    '<i class="fa-solid fa-circle-notch fa-spin"></i> Connexion...';
  btn.disabled = true;
  btn.classList.add("opacity-50", "cursor-not-allowed");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(
      `${URL_LOGIN}?u=${encodeURIComponent(u.toLowerCase())}&p=${encodeURIComponent(p)}`,
      { signal: controller.signal },
    );
    clearTimeout(timeoutId);

    const d = await response.json();

    // --- CAS 1 : CONNEXION RÉUSSIE ---
    if (d.status === "success") {
      if (d.token) localStorage.setItem("sirh_token", d.token);

      let r = d.role || "EMPLOYEE";
      if (Array.isArray(r)) r = r[0];

      const userData = {
        nom: d.nom || u,
        role: String(r).toUpperCase(),
        id: d.id,
        employee_type: d.employee_type || "OFFICE",
        permissions: d.permissions || {},
      };

      localStorage.setItem("sirh_user_session", JSON.stringify(userData));

      const Toast = Swal.mixin({
        toast: true,
        position: "top",
        showConfirmButton: false,
        timer: 2000,
        timerProgressBar: true,
        background: "#ffffff",
        color: "#1e293b",
      });

      Toast.fire({
        icon: "success",
        title: "Connexion réussie",
        text: "Bienvenue " + userData.nom,
      });

      await setSession(
        userData.nom,
        userData.role,
        userData.id,
        d.permissions,
        userData.employee_type,
      );
    }

    // --- CAS 2 : COMPTE RÉVOQUÉ (Employé Sorti) ---
    else if (d.status === "revoked") {
      Swal.fire({
        title: "Accès Révoqué",
        text: d.message,
        icon: "warning",
        confirmButtonColor: "#0f172a",
      });
    }

    // --- CAS 3 : IDENTIFIANTS INCORRECTS ---
    else {
      Swal.fire(
        "Refusé",
        d.message || "Identifiant ou mot de passe incorrect",
        "error",
      );
    }
  } catch (error) {
    console.error(error);
    if (error.name === "AbortError") {
      Swal.fire(
        "Délai dépassé",
        "Le serveur démarre. Cela peut prendre 30 à 60 secondes. Veuillez réessayer.",
        "warning",
      );
    } else if (!navigator.onLine) {
      Swal.fire("Hors Ligne", "Vous semblez déconnecté d'internet.", "error");
    } else {
      Swal.fire(
        "Erreur Système",
        "Impossible de contacter le serveur. Réessayez.",
        "error",
      );
    }
  } finally {
    btn.innerHTML = originalBtnText;
    btn.disabled = false;
    btn.classList.remove("opacity-50", "cursor-not-allowed");
  }
}

export async function setSession(n, r, id, perms, type) {
  AppState.currentUser = {
    nom: n,
    role: r,
    id: id,
    permissions: perms,
    employee_type: type || "OFFICE",
  };

  // On cache les éléments par défaut (Permissions/Groupes)
  document
    .querySelectorAll("[data-perm]")
    .forEach((el) => (el.style.display = "none"));
  document
    .querySelectorAll(".menu-group")
    .forEach((group) => (group.style.display = "none"));

  window.applyBranding();

  // 1. Préparation immédiate de l'écran
  const loginScreen = document.getElementById("login-screen");
  const loader = document.getElementById("initial-loader");
  const appLayout = document.getElementById("app-layout");

  if (loginScreen) loginScreen.classList.add("hidden");

  // On s'assure que le loader est bien au-dessus et opaque (fond bleu nuit actif)
  if (loader) {
    loader.classList.remove("fade-out", "hidden");
    loader.style.opacity = "1";
    loader.style.zIndex = "9999";
  }

  // Remplissage des infos d'identité
  document.getElementById("name-display").innerText = n;
  document.getElementById("role-display").innerText = r;
  document.getElementById("avatar-display").innerText = n[0];
  document.body.className =
    "text-slate-900 overflow-hidden h-screen w-screen role-" + r.toLowerCase();

  // 2. Injecter les SKELETONS (Pendant que le loader cache tout)
  const skeletonRow = `<tr class="border-b"><td class="p-4 flex gap-3 items-center"><div class="w-10 h-10 rounded-full skeleton"></div><div class="space-y-2"><div class="h-3 w-24 rounded skeleton"></div></div></td><td class="p-4"><div class="h-3 w-32 rounded skeleton"></div></td><td class="p-4"><div class="h-6 w-16 rounded-lg skeleton"></div></td><td class="p-4"></td></tr>`;
  ["full-body", "dashboard-body"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = skeletonRow.repeat(6);
  });

  try {
    // 3. CHARGEMENT DES DONNÉES CRITIQUES
    // Le logo et la barre de chargement restent ici tant que le serveur n'a pas répondu
    await Promise.all([
      window.refreshAllData(false),
      window.syncClockInterface(),
      window.fetchAndPopulateDepartments(),
      window.syncAllRoleSelects(),
      window.fetchContractTemplatesForSelection(),
    ]);

    await window.applyModulesUI();
    window.applyPermissionsUI(perms);

    // 4. NAVIGATION PRÉEMPTIVE (On choisit la vue SOUS le loader)
    const savedView = localStorage.getItem("sirh_last_view");
    const buttonSelector = `button[onclick="switchView('${savedView}')"]`;
    const buttonExists = savedView
      ? document.querySelector(buttonSelector)
      : null;

    if (
      savedView &&
      buttonExists &&
      document.getElementById("view-" + savedView)
    ) {
      window.switchView(savedView);
    } else {
      const hasDashAccess = document.querySelector(
        `button[onclick="switchView('dash')"]`,
      );
      hasDashAccess
        ? window.switchView("dash")
        : window.switchView("my-profile");
    }

    // --- SEULE MODIFICATION ICI : On force la fermeture du menu sur mobile AVANT d'afficher l'app ---
    if (window.innerWidth < 768) {
      document.getElementById("sidebar").classList.add("-translate-x-full");
      const overlay = document.getElementById("sidebar-overlay");
      if (overlay) overlay.classList.add("hidden");
    }
    // ------------------------------------------------------------------------------------------------

    // 5. PHASE DE RÉVÉLATION (Zéro écran vide)
    // On active l'affichage technique de l'app (mais elle est à opacity: 0 via CSS)
    appLayout.classList.remove("hidden");

    // On utilise le double cycle pour garantir que le navigateur a "peint" l'app en mémoire
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // L'application est prête en arrière-plan. On lance l'échange visuel.

        // On rend l'application opaque (ready)
        appLayout.classList.add("ready");

        if (loader) {
          // On lance l'animation de sortie du loader (le logo et la barre s'effacent doucement)
          loader.classList.add("fade-out");

          setTimeout(() => {
            loader.classList.add("hidden");
            document.body.style.backgroundColor = "#f1f5f9";
            document.body.style.overflow = "auto"; // On libère le scroll
          }, 600); // Délai calé sur la transition CSS
        }
      });
    });

    window.applyWidgetPreferences();
    window.requestNotificationPermission();
    window.initDarkMode();
  } catch (e) {
    console.error("Erreur critique au démarrage de l'app:", e);
    if (loader) loader.classList.add("hidden");
    if (appLayout) appLayout.classList.remove("hidden");
    Swal.fire(
      "Erreur",
      "Données chargées avec des erreurs mineures.",
      "warning",
    );
  }
}

export async function handleForgotPassword() {
  // ÉTAPE 1 : Demander l'email avec un design épuré
  const { value: email } = await Swal.fire({
    title: "Mot de passe oublié ?",
    html: `
            <div class="text-center px-2">
                <p class="text-slate-500 text-sm mb-8 leading-relaxed">
                    Entrez votre email professionnel. Nous vous enverrons un <b>code de sécurité</b> pour réinitialiser votre accès.
                </p>
                <div class="text-left">
                    <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Adresse Email</label>
                    <input type="email" id="swal-email-input" class="swal2-input !m-0 !w-full" placeholder="nom@entreprise.com">
                </div>
            </div>
        `,
    showCancelButton: true,
    confirmButtonText: "Envoyer le code",
    cancelButtonText: "Annuler",
    confirmButtonColor: "#2563eb",
    reverseButtons: true, // Annuler à gauche, Envoyer à droite
    customClass: {
      popup: "rounded-[2rem]",
      confirmButton: "rounded-xl px-6 py-3 font-bold",
      cancelButton: "rounded-xl px-6 py-3 font-bold",
    },
    preConfirm: () => {
      const email = document.getElementById("swal-email-input").value;
      if (!email || !email.includes("@")) {
        Swal.showValidationMessage("Veuillez entrer une adresse email valide");
        return false;
      }
      return email;
    },
  });

  if (!email) return;

  Swal.fire({
    title: "Vérification...",
    didOpen: () => Swal.showLoading(),
    allowOutsideClick: false,
  });

  try {
    const response = await fetch(
      `${SIRH_CONFIG.apiBaseUrl}/request-password-reset`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.toLowerCase().trim() }),
      },
    );

    const data = await response.json();

    if (data.status === "success") {
      // ÉTAPE 2 : Demander le code (Design harmonisé)
      const { value: formValues } = await Swal.fire({
        title: "Vérifiez vos mails",
        html: `
                    <div class="text-center px-2">
                        <p class="text-slate-500 text-sm mb-8">Un code à 6 chiffres a été envoyé à <b>${email}</b>.</p>
                        <div class="grid grid-cols-1 gap-4 text-left">
                            <div>
                                <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Code de sécurité</label>
                                <input id="swal-code" class="swal2-input !m-0 !text-center !text-2xl !font-black !tracking-[0.5em]" maxlength="6" placeholder="000000">
                            </div>
                            <div>
                                <label class="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Nouveau mot de passe</label>
                                <input id="swal-newpass" type="password" class="swal2-input !m-0" placeholder="••••••••">
                            </div>
                        </div>
                    </div>
                `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: "Changer le mot de passe",
        confirmButtonColor: "#10b981", // Vert pour le succès
        preConfirm: () => {
          const code = document.getElementById("swal-code").value;
          const pass = document.getElementById("swal-newpass").value;
          if (!code || code.length < 6) {
            Swal.showValidationMessage(`Entrez le code à 6 chiffres`);
            return false;
          }
          if (pass.length < 6) {
            Swal.showValidationMessage(
              `Le mot de passe doit faire 6 caractères min.`,
            );
            return false;
          }
          return { code, newPassword: pass };
        },
      });

      if (formValues) {
        Swal.fire({
          title: "Mise à jour...",
          didOpen: () => Swal.showLoading(),
        });
        const resReset = await fetch(
          `${SIRH_CONFIG.apiBaseUrl}/reset-password`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: email.toLowerCase().trim(),
              code: formValues.code,
              newPassword: formValues.newPassword,
            }),
          },
        );

        if (resReset.ok) {
          Swal.fire({
            icon: "success",
            title: "Succès !",
            text: "Votre mot de passe a été modifié.",
            confirmButtonColor: "#2563eb",
          });
        } else {
          const err = await resReset.json();
          throw new Error(err.error || "Code invalide ou expiré");
        }
      }
    } else {
      throw new Error(data.error || "Utilisateur introuvable");
    }
  } catch (e) {
    Swal.fire("Échec", e.message, "error");
  }
}

export function handleLogout() {
  // 1. Arrêter les flux caméra s'ils tournent
  if (AppState.videoStream)
    AppState.videoStream.getTracks().forEach((t) => t.stop());
  if (AppState.contractStream)
    AppState.contractStream.getTracks().forEach((t) => t.stop());

  // 2. VIDER TOTALEMENT LE CACHE ET LA MÉMOIRE
  localStorage.removeItem("sirh_token");
  localStorage.removeItem("sirh_user_session");
  localStorage.removeItem("sirh_last_view");
  // Optionnel : vider les préférences de widgets pour repartir à zéro
  const keys = Object.keys(localStorage);
  keys.forEach((k) => {
    if (k.startsWith("pref_")) localStorage.removeItem(k);
  });

  // 3. CACHER L'INTERFACE IMMÉDIATEMENT (évite le flash au prochain login)
  const appLayout = document.getElementById("app-layout");
  if (appLayout) appLayout.classList.add("hidden");

  // 4. REDIRECTION PROPRE
  window.location.reload();
}

export function resetInactivityTimer() {
  // Si l'utilisateur n'est pas connecté, on ne fait rien
  if (!AppState.currentUser) return;

  // On efface le compte à rebours précédent
  clearTimeout(AppState.inactivityTimer);

  // On lance un nouveau compte à rebours de 15 minutes (900 000 ms)
  AppState.inactivityTimer = setTimeout(() => {
    handleAutoLogout();
  }, 900000);
}

export function handleAutoLogout() {
  Swal.fire({
    title: "Session expirée",
    text: "Pour votre sécurité, vous avez été déconnecté suite à une longue inactivité.",
    icon: "info",
    confirmButtonText: "Se reconnecter",
    confirmButtonColor: "#0f172a",
  }).then(() => {
    handleLogout(); // Ta fonction de déconnexion existante
  });
}
