// core/api.js

export async function secureFetch(url, options = {}) {
  if (!navigator.onLine) {
    throw new Error("Vous êtes hors ligne. Vérifiez votre connexion internet.");
  }

  const token = localStorage.getItem("sirh_token");
  const headers = options.headers || {};

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const TIMEOUT_MS = 120000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      headers,
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
