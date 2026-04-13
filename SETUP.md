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
| `docker compose up -d`      | Démarre PostgreSQL + Redis              |
| `docker compose down -v`    | Supprime les conteneurs et volumes      |
