# MCPBuilder — Setup local

## Prérequis

- Node.js >= 18
- npm >= 9
- Docker + Docker Compose

## 1. Installation des dépendances

```bash
cd mcpbuilder
npm install
```

## 2. Démarrer les services (PostgreSQL + Redis)

```bash
docker compose up -d
```

Vérifier que les services sont healthy :

```bash
docker compose ps
```

## 3. Variables d'environnement

### API (`apps/api`)

```bash
cp apps/api/.env.example apps/api/.env
```

Édite `apps/api/.env` — à minima :
- `JWT_SECRET` : une chaîne aléatoire longue
- `ENCRYPTION_KEY` : 64 caractères hexadécimaux (32 bytes)

Générer une clé d'encryption :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Web (`apps/web`)

```bash
cp apps/web/.env.local.example apps/web/.env.local
```

Édite `apps/web/.env.local` — à minima :
- `NEXTAUTH_SECRET` : une chaîne aléatoire

Générer un secret NextAuth :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## 4. Base de données — générer le client Prisma et migrer

```bash
npm run db:generate
npm run db:migrate
```

> La commande `db:migrate` lance `prisma migrate dev` qui crée les tables et génère les fichiers de migration dans `packages/db/prisma/migrations/`.

Ouvrir Prisma Studio (optionnel) :

```bash
npm run db:studio
```

## 5. Lancer le projet en mode développement

```bash
npm run dev
```

Turbo lance en parallèle :
- `apps/web` → [http://localhost:3000](http://localhost:3000)
- `apps/api` → [http://localhost:4000](http://localhost:4000)
- Health check API : [http://localhost:4000/health](http://localhost:4000/health)

## 6. Build de production

```bash
npm run build
```

## 7. Tests

```bash
npm run test
```

## Structure du monorepo

```
mcpbuilder/
├── apps/
│   ├── web/              # Next.js 15 — frontend SaaS
│   └── api/              # Express API — REST + auth
├── packages/
│   ├── db/               # Prisma schema + client singleton
│   ├── shared/           # Types TS partagés + constantes + codes d'erreur
│   └── mcp-runtime/      # Runtime MCP (spawn/stop serveurs MCP isolés)
├── docker-compose.yml    # PostgreSQL 16 + Redis 7
├── turbo.json            # Pipeline monorepo
└── package.json          # Workspaces root
```

## 6. Configuration Cloudflare Workers (optionnel)

Le mode CLOUDFLARE déploie chaque serveur MCP en tant que Cloudflare Worker.
Suivez ces étapes dans l'ordre exact.

### 6.1 Prérequis

1. Un compte Cloudflare avec Workers activé (plan Free suffisant).
2. Un **API Token** avec les permissions :
   - `Workers Scripts : Edit`
   - `Workers KV Storage : Edit`
   → Créez-le sur [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
   → Utilisez le template **"Edit Cloudflare Workers"**.
3. Votre **Account ID** (affiché dans la barre latérale de [dash.cloudflare.com](https://dash.cloudflare.com)).

### 6.2 Variables d'environnement

Ajoutez ces variables dans `apps/api/.env` :

```env
CLOUDFLARE_ACCOUNT_ID=<votre-account-id>
CLOUDFLARE_API_TOKEN=<votre-api-token>
CLOUDFLARE_WORKERS_SUBDOMAIN=<votre-subdomain>   # sans ".workers.dev"
MCP_RUNTIME_MODE=cloudflare
```

Le sous-domaine Workers est affiché dans le dashboard Cloudflare
(Workers & Pages → votre sous-domaine `xxx.workers.dev`).

### 6.3 Setup automatique (namespaces KV)

Le script suivant valide votre token et crée les namespaces KV nécessaires,
puis met à jour `apps/api/.env` automatiquement :

```bash
npm run cf:setup
```

Il crée :
- `MCP_CONFIGS` — namespace de production (→ `CLOUDFLARE_KV_NAMESPACE_ID`)
- `MCP_CONFIGS_PREVIEW` — namespace de développement (→ `CLOUDFLARE_KV_PREVIEW_NAMESPACE_ID`)

### 6.4 Vérifier un Worker déployé

```bash
npm run cf:test-worker -- --serverId=<id-du-serveur>
```

Ce script effectue un test end-to-end complet : health check, `initialize` MCP,
`tools/list` — et affiche la latence et la liste des tools exposés.

### 6.5 Scripts de maintenance

| Commande               | Description                                                    |
|------------------------|----------------------------------------------------------------|
| `npm run cf:setup`     | Valide le token + crée les namespaces KV                       |
| `npm run cf:sync`      | Synchronise DB ↔ Cloudflare (utile après incident)             |
| `npm run cf:cleanup`   | Supprime tous les Workers "mcp-*" du compte (reset dev)        |
| `npm run cf:test-worker -- --serverId=<id>` | Test E2E d'un Worker déployé          |

---

## 7. Build de production

```bash
npm run build
```

## 8. Tests

```bash
npm run test
```

## Commandes utiles

| Commande                    | Description                             |
|-----------------------------|-----------------------------------------|
| `npm run dev`               | Lance tout en parallèle (web + api)     |
| `npm run build`             | Build tous les packages                 |
| `npm run test`              | Lance tous les tests                    |
| `npm run lint`              | Type-check tous les packages            |
| `npm run db:generate`       | Régénère le client Prisma               |
| `npm run db:migrate`        | Applique les migrations pending         |
| `npm run db:studio`         | Ouvre Prisma Studio                     |
| `npm run cf:setup`          | Setup Cloudflare Workers                |
| `npm run cf:sync`           | Sync DB ↔ Cloudflare                    |
| `npm run cf:cleanup`        | Reset Workers dev                       |
| `docker compose up -d`      | Démarre PostgreSQL + Redis              |
| `docker compose down -v`    | Supprime les conteneurs et volumes      |
