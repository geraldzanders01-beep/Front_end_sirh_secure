# SIRH Secure - Frontend

Application modulaire de gestion RH (SaaS).

## 📂 Architecture du projet

├── index.html # Point d'entrée de l'application
├── style.css # Styles globaux et variables
├── manifest.json # Configuration PWA
├── sw.js # Service Worker (Mode hors-ligne)
└── js/
├── main.js # Chef d'orchestre (Écouteurs globaux, attachements Window)
├── core/ # Fichiers vitaux (API, Config, State, Utils)
└── modules/ # Logique métier séparée (RH, Paie, Ops, Chat...)

## 🚀 Lancement local

Ce projet utilise des **ES Modules** (`<script type="module">`). Il ne peut pas être ouvert directement en double-cliquant sur le fichier HTML (`file://`).
Utilisez une extension comme **Live Server** sur VS Code pour le tester en local.
