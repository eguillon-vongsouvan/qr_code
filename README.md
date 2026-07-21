# Émargement QR — Système de Présence Sécurisé

Une application web complète en **Node.js** permettant aux enseignants de faire l'appel de manière rapide et sécurisée via un système de QR Code dynamique.

## 🌟 Fonctionnalités

- **Interface Premium "Liquid Glass"** : Design moderne, fluide et responsive.
- **Sessions isolées par enseignant** : Chaque professeur possède sa propre séance indépendante. Plusieurs enseignants peuvent utiliser l'application simultanément sans interférence.
- **QR Codes Dynamiques** : Les QR codes se rafraîchissent toutes les 45 secondes pour éviter le partage de photos entre étudiants.
- **Sécurité Anti-Fraude (Anti-Cheat)** :
  - Token cryptographique à usage unique (HMAC).
  - Géofencing (restriction GPS : l'étudiant doit être dans un rayon défini autour de l'école).
  - Empreinte d'appareil (device fingerprint) pour empêcher le scan multiple depuis le même téléphone.
- **Sécurité des Données (RGPD)** :
  - Chiffrement AES-256-GCM des données personnelles dans la base SQLite (Noms, Prénoms, Emails).
  - Logs système audités et chiffrés de bout en bout (`system.log`).
  - Mots de passe utilisateurs hachés avec `bcrypt`.
  - Protection contre les failles courantes (IDOR, Injection SQL).
- **Exportation des Présences** : Export direct en PDF et Excel pour les archives administratives.
- **Cloudflare Ready** : Détection dynamique de l'hôte (`PUBLIC_URL`) pour générer les bons liens sur les QR codes.

---

## 🚀 Installation

### Option 1 : Déploiement sur serveur Ubuntu avec Docker (Recommandé)

#### Prérequis
- Un serveur Ubuntu (20.04+ / 22.04+ / 24.04+) avec accès SSH.
- Un utilisateur avec les droits `sudo`.

#### Étape 1 — Installer Docker sur le serveur

Connectez-vous à votre serveur en SSH :
```bash
ssh utilisateur@IP_DU_SERVEUR
```

Installez Docker et Docker Compose :
```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2
sudo usermod -aG docker $USER
```
> ⚠️ Déconnectez-vous puis reconnectez-vous pour que le groupe `docker` soit pris en compte.

#### Étape 2 — Transférer le projet sur le serveur

Depuis votre PC (Windows/Mac), copiez le dossier du projet vers le serveur :
```bash
scp -r ./qr_code-main utilisateur@IP_DU_SERVEUR:~/emargement-qr
```

#### Étape 3 — Configurer le fichier `.env`

Sur le serveur, accédez au dossier et créez votre fichier de configuration :
```bash
cd ~/emargement-qr
cp .env.example .env
nano .env
```

Remplissez **toutes** les valeurs obligatoires :

| Variable | Description | Exemple |
|----------|-------------|---------|
| `ADMIN_PASSWORD` | Mot de passe du compte administrateur (premier démarrage) | `MonMotDePasse!` |
| `PROF_PASSWORD` | Mot de passe du compte professeur (premier démarrage) | `ProfPass123` |
| `QR_SECRET` | Clé de signature des QR codes (min 32 chars) | Générer avec la commande ci-dessous |
| `ENCRYPTION_KEY` | Clé de chiffrement AES-256 (min 32 chars) | Générer avec la commande ci-dessous |
| `COOKIE_SECRET` | Clé des cookies signés (min 32 chars) | Générer avec la commande ci-dessous |
| `PUBLIC_URL` | URL publique (Cloudflare, domaine…) — laisser vide pour Wi-Fi local | `https://xxx.trycloudflare.com` |

Pour générer des clés aléatoires sécurisées :
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> ⚠️ **Important** : La variable `ENCRYPTION_KEY` ne doit **jamais** changer une fois la base de données créée, sous peine de perdre toutes les données chiffrées.

#### Étape 4 — Lancer l'application

```bash
cd ~/emargement-qr
docker compose up -d --build
```

Vérifiez que le conteneur tourne :
```bash
docker ps
```

Vous devriez voir le conteneur `qr-app` avec le statut `Up` et le port `3000` mappé.

Testez l'accès local :
```bash
curl http://localhost:3000
```

#### Étape 5 — Exposer l'application avec Cloudflare Tunnel (accès Internet)

Pour que les élèves puissent scanner les QR codes depuis leur téléphone (4G/5G), il faut rendre l'application accessible sur Internet.

**Installation de `cloudflared` :**
```bash
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb
```

**Lancer un tunnel temporaire (trycloudflare.com) :**
```bash
cloudflared tunnel --url http://localhost:3000
```

Dans la sortie, vous verrez une URL du type :
```
https://xxxxx-xxxxx-xxxxx.trycloudflare.com
```

**Mettre à jour le `.env` avec l'URL obtenue :**
```bash
nano ~/emargement-qr/.env
# Modifier la ligne :
# PUBLIC_URL=https://xxxxx-xxxxx-xxxxx.trycloudflare.com
```

Puis redémarrez l'application pour prendre en compte la nouvelle URL :
```bash
cd ~/emargement-qr
docker compose restart
```

> 💡 **Astuce** : Pour lancer `cloudflared` en arrière-plan et le garder actif :
> ```bash
> nohup cloudflared tunnel --url http://localhost:3000 > cloudflared.log 2>&1 &
> ```
> Récupérez l'URL avec :
> ```bash
> grep -o 'https://.*trycloudflare.com' cloudflared.log
> ```

> ⚠️ **Note** : Les URLs `trycloudflare.com` sont **temporaires** et changent à chaque redémarrage de la commande `cloudflared`. Pour une URL permanente, créez un compte Cloudflare gratuit et configurez un tunnel nommé avec `cloudflared tunnel create`.

---

### Option 2 : Exécution locale (Windows / Mac)

1. Assurez-vous d'avoir installé **Node.js** (v18+).
2. Installez les dépendances :
   ```powershell
   npm install
   ```
3. Copiez `.env.example` en `.env` et configurez vos mots de passe et clés.
4. Lancez l'application :
   ```powershell
   # Via le script fourni (Windows) :
   demarrer.bat
   # Ou manuellement :
   npm start
   ```

---

## 🛠️ Configuration (`.env`)

Le fichier `.env` est obligatoire pour démarrer le serveur. Voir le fichier `.env.example` pour la liste complète des variables.

### Variables obligatoires

| Variable | Description |
|----------|-------------|
| `ENCRYPTION_KEY` | Clé de 32+ caractères pour le chiffrement AES-GCM (BDD + logs) |
| `QR_SECRET` | Clé pour signer les QR Codes (HMAC) |
| `COOKIE_SECRET` | Clé pour les cookies signés |
| `ADMIN_PASSWORD` | Mot de passe initial du compte admin |
| `PROF_PASSWORD` | Mot de passe initial du compte prof |

### Variables optionnelles

| Variable | Description | Défaut |
|----------|-------------|--------|
| `PORT` | Port d'écoute du serveur | `3000` |
| `PUBLIC_URL` | URL publique (Cloudflare, domaine) | *(vide = mode Wi-Fi local)* |
| `GEO_LAT` | Latitude du centre de géofencing | *(désactivé)* |
| `GEO_LNG` | Longitude du centre de géofencing | *(désactivé)* |
| `GEO_RADIUS_M` | Rayon autorisé en mètres | `200` |

---

## 📱 Utilisation

| Page | URL | Description |
|------|-----|-------------|
| Connexion | `/` | Page de connexion |
| Panneau Enseignant | `/seance` | Démarrer une session, projeter le QR code |
| Affichage QR | `/affiche` | Vue plein écran du QR code pour vidéoprojection |
| Panneau Admin | `/admin` | Gestion des listes d'élèves, utilisateurs, historique |

### Comptes par défaut (premier démarrage)

| Rôle | Identifiant | Mot de passe |
|------|-------------|--------------|
| Admin | `admini` | Défini dans `ADMIN_PASSWORD` du `.env` |
| Professeur | `prof` | Défini dans `PROF_PASSWORD` du `.env` |

---

## 🛡️ Outils d'Audit

Déchiffrement des logs système (pour administrateurs) :
```bash
# Depuis le serveur (Docker)
docker compose exec qr-app node tools/decrypt-logs.js

# En local
node tools/decrypt-logs.js
```

---

## 📦 Architecture Docker

```
emargement-qr/
├── Dockerfile           # Image Node.js 20 Alpine
├── docker-compose.yml   # Orchestration du conteneur
├── .env                 # Configuration (non versionné)
├── .env.example         # Template de configuration
├── data/                # Base SQLite (volume persistant)
├── server.js            # Point d'entrée serveur Express
├── lib/                 # Modules métier
├── static/              # Assets CSS, JS, images
├── scripts/             # Scripts utilitaires
└── tools/               # Outils d'audit
```
