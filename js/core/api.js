// core/api.js

export async function secureFetch(url, options = {}) {
  if (!navigator.onLine) {
    throw new Error("Vous êtes hors ligne. Vérifiez votre connexion internet.");
  }

  const token = localStorage.getItem("sirh_token");
  
  // 1. On clone les headers pour pouvoir les modifier en toute sécurité
  const headers = { ...options.headers };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // =================================================================
  // 🔥 LE SECRET QUI CORRIGE L'ERREUR "ID MANQUANT / BAD REQUEST" 🔥
  // =================================================================
  if (options.body) {
    if (options.body instanceof FormData) {
      // Si on envoie un formulaire (avec ou sans photo), le navigateur DOIT 
      // gérer le Content-Type lui-même pour ajouter la balise "boundary".
      // On s'assure donc qu'il n'y a pas de Content-Type forcé.
      delete headers["Content-Type"];
    } else {
      // Si on envoie du texte pur (le fameux JSON de l'Entrée),
      // On OBLIGE le serveur à le lire comme du JSON, sinon il l'ignore.
      headers["Content-Type"] = "application/json";
    }
  }
  // =================================================================

  const TIMEOUT_MS = 120000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      headers: headers, // On injecte nos headers intelligents
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorMessage = `Erreur serveur (${response.status})`;
      try {
        const errData = await response.json();
        if (errData.error) errorMessage = errData.error;
      } catch (e) {}

      if (response.status === 401) {
        Swal.fire({
          title: "Session expirée",
          text: "Veuillez vous reconnecter.",
          icon: "info",
        }).then(() => {
          if (typeof window.handleLogout === "function") window.handleLogout(); // Appel sécurisé
        });
        throw new Error("Session expirée.");
      }

      if (response.status === 403) {
        throw new Error(
          "Accès refusé. Vous n'avez pas les droits nécessaires.",
        );
      }
      throw new Error(errorMessage);
    }
    return response;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Le serveur met trop de temps à répondre. Réessayez.");
    }
    throw error;
  }
}
