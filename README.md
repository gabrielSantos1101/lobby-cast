# Lobby Cast

Aplicação web para compartilhamento de tela ao vivo via WebRTC. Funciona como uma alternativa simples e auto-hospedável a plataformas como Discord Go Live ou Twitch — sem necessidade de conta, sem download, sem instalação. A pessoa abre o link, clica em transmitir, e quem tem o código assiste direto no navegador.

## Como funciona

O fluxo é simples:

1. **O transmissor** abre `/share`, seleciona resolução/FPS, clica em "Iniciar transmissão" e autoriza o compartilhamento de tela no navegador.
2. O navegador captura a tela + áudio do sistema via `getDisplayMedia` e estabelece uma conexão WebRTC com o Cloudflare Calls.
3. Um **session ID** é gerado no servidor — esse é o código da live.
4. O transmissor compartilha o link (`/watch/<session-id>`) com quem quiser assistir.
5. **O espectador** abre o link, o navegador cria uma conexão WebRTC separada e puxa as tracks (vídeo + áudio) do transmissor via Cloudflare Calls.
6. A stream aparece em tempo real com controles de volume, PiP e tela cheia.

Não existe sala, chat ou login. É P2P via Cloudflare como relay — o servidor só faz o signaling (troca de SDP/ICE), o fluxo de mídia vai direto entre os peers.

### Métricas ao vivo (opcional)

Com um projeto gratuito do [Supabase](https://supabase.com) configurado, o app também ganha:

- **Contador de espectadores** em tempo real — polling leve via HTTP, sem WebSocket
- **Som de entrada/saída** para o transmissor quando alguém entra ou sai da live
- **Tempo de transmissão** visível para todos — badge no player do espectador e na barra do transmissor

Funciona por heartbeat: cada espectador avisa o Supabase a cada 10s, o transmissor faz polling a cada 5s. Sem Supabase configurado, tudo continua funcionando — os indicadores apenas não aparecem.

## Arquitetura

```
┌─────────────┐         ┌──────────────────┐         ┌─────────────┐
│  Transmissor │◄───────►│ Cloudflare Calls │◄───────►│  Espectador  │
│  (browser)   │  WebRTC │  (signaling +    │  WebRTC │  (browser)   │
│              │         │   TURN relay)    │         │              │
└──────┬──────┘         └──────────────────┘         └──────┬──────┘
       │                                                     │
       │  getDisplayMedia()                                  │
       │  (tela + áudio do sistema)                          │
       │                                                     │
       ▼                                                     ▼
  ┌─────────┐                                          ┌─────────┐
  │  Vite + │  Server Functions (signaling)             │  Vite + │
  │  Nitro  │◄────────────────────────────────────────►│  Nitro  │
  └─────────┘   POST /sessions/new                     └─────────┘
                POST /sessions/:id/tracks/new
                PUT  /sessions/:id/renegotiate
```

### Camadas

| Camada | Responsabilidade |
|--------|-----------------|
| **Browser (transmissor)** | Captura tela+áudio via `getDisplayMedia`, cria `RTCPeerConnection`, envia SDP offer |
| **Server Functions** (`src/lib/calls.ts`) | Proxy para a Cloudflare Calls API — cria sessões, faz push/pull de tracks, renegotiação SDP |
| **Cloudflare Calls** | Signaling server + TURN relay. Não armazena streams — só roteia os pacotes WebRTC |
| **Browser (espectador)** | Cria `RTCPeerConnection`, puxa tracks remotas, renderiza no `<video>` |

### Server Functions

Todas as interações com a Cloudflare Calls API passam por server functions do TanStack Start (`src/lib/calls.ts`), que rodam no servidor. Isso mantém o token de API e o App ID no lado do servidor, sem expor ao cliente.

| Função | Método | O que faz |
|--------|--------|-----------|
| `createSession()` | POST | Cria uma nova sessão na Cloudflare Calls e retorna o `sessionId` |
| `pushTracks()` | POST | Envia tracks (vídeo/áudio) do transmissor para a sessão com SDP offer |
| `pullTracks()` | POST | Puxa tracks remotas de outra sessão (usado pelo espectador) |
| `renegotiate()` | PUT | Finaliza a negociação SDP com a answer do espectador |

### ICE Servers

As conexões usam os seguintes servidores STUN/TURN para NAT traversal:

- `stun:stun.cloudflare.com:3478` (Cloudflare)
- `stun:stun.l.google.com:19302` (Google)
- `turn:openrelay.metered.ca:80` (OpenRelay — fallback TURN gratuito)

### Multi-stream

A página `/watch/:streamId` permite adicionar múltiplas streams simultaneamente. O layout se adapta automaticamente:

- 1 stream → largura total
- 2-4 streams → grid 2 colunas
- 5+ streams → grid 3 colunas
- Modo foco → uma stream em destaque, outras minimizadas

O transmissor também pode assistir outras lives enquanto transmite — sua própria stream aparece em uma janela arrastável (draggable) no canto da tela.

## Como usar

### Transmitir

1. Acesse `/` e clique em **"Iniciar transmissão"**
2. Escolha a **resolução** (720p ou 1080p) e o **FPS** (5 a 60)
3. Clique em **"Iniciar transmissão"** e selecione a janela/tela no prompt do navegador
4. Compartilhe o link ou código que aparece na tela

Enquanto transmite, a barra inferior mostra o **tempo de live** e quantas pessoas estão assistindo — com som de aviso quando alguém entra ou sai (requer Supabase configurado).

### Assistir

1. Acesse `/` e cole o link ou código da live no campo de texto
2. Clique em **"Assistir"**
3. Use os controles para:
   - **Volume** — slider na barra inferior do player
   - **Mudo** — ícone de volume
   - **Picture-in-Picture** — ícone de PiP (canto inferior direito do player)
   - **Tela cheia** — ícone de maximizar
   - **Indicadores ao vivo** — tempo de transmissão e número de espectadores no canto superior do player

### Assistir múltiplas streams

Na página de visualização, use o campo **"Adicionar outra live"** na parte inferior para adicionar mais streams. Cada stream pode ser:

- **Focada** — clica no ícone de expandir para uma ocupar a tela inteira
- **Removida** — clica no X para sair daquela stream

## Iniciar o projeto

```bash
# 1. Clonar
git clone <url-do-repositorio>
cd lobby-cast

# 2. Instalar dependências
pnpm install

# 3. Configurar ambiente
cp .env.example .env
# Edite .env com suas credenciais do Cloudflare

# 4. Rodar
pnpm dev
```

A aplicação abre em `http://localhost:3000`.

## Self-hosting

O Lobby Cast pode ser hospedado em qualquer lugar que rode Node.js. O único serviço externo necessário é o **Cloudflare Calls** (gratuito para até 1.000 minutos/mês).

### 1. Criar app no Cloudflare Calls

1. Acesse o [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Vá em **Real-Time** → **Calls** (ou acesse direto em `dash.cloudflare.com/<account-id>/calls`)
3. Crie um novo **App** — anote o **App ID**
4. Em **API Tokens**, gere um token com permissão para **Calls** — anote o **API Token**

### 2. Configurar variáveis de ambiente

```bash
CLOUDFLARE_API_TOKEN=<token gerado no passo 1>
CLOUDFLARE_CALLS_APP_ID=<App ID do passo 1>
```

### 3. (Opcional) Supabase — métricas ao vivo

O contador de espectadores, os sons de entrada/saída e o tempo de live dependem de um projeto do [Supabase](https://supabase.com) — o plano gratuito serve:

1. Crie um projeto no Supabase
2. Abra o **SQL Editor** e execute o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) — cria as tabelas `presence` e `streams` com as policies de RLS
3. Em **Project Settings → API Keys**, copie a **Project URL** e a chave **publishable/anon**

Adicione ao `.env`:

```bash
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxx
```

> A chave publishable/anon é pública por design — quem protege os dados são as policies RLS do schema. Nunca use a chave `service_role`/`secret` no cliente.

### 4. Deploy com Vercel (mais fácil)

```bash
# Instalar a CLI
npm i -g vercel

# Fazer login
vercel login

# Deploy
vercel

# Configurar variáveis de ambiente no painel:
# Settings → Environment Variables
# Adicione CLOUDFLARE_API_TOKEN e CLOUDFLARE_CALLS_APP_ID
# (e as VITE_SUPABASE_* se for usar as métricas ao vivo)

# Deploy em produção
vercel --prod
```

O `vercel.json` já está configurado com os rewrites necessários para as rotas do TanStack Router.

### 5. Deploy com Docker

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/package.json ./
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
```

```bash
docker build -t lobby-cast .
docker run -p 3000:3000 \
  -e CLOUDFLARE_API_TOKEN=seu_token \
  -e CLOUDFLARE_CALLS_APP_ID=seu_app_id \
  lobby-cast
```

### 6. Deploy manual (VPS / qualquer servidor)

```bash
# No servidor
git clone <url-do-repositorio>
cd lobby-cast
pnpm install
echo "CLOUDFLARE_API_TOKEN=seu_token" > .env
echo "CLOUDFLARE_CALLS_APP_ID=seu_app_id" >> .env
pnpm build
pnpm preview  # ou use um process manager como pm2
```

Com pm2:

```bash
pnpm build
pm2 start "pnpm preview" --name lobby-cast
pm2 save
```

### Notas sobre self-hosting

- O Cloudflare Calls é o único serviço **obrigatório** — não precisa de banco de dados nem Redis para o funcionamento básico.
- O Supabase é opcional (métricas ao vivo). No plano gratuito, o projeto pausa após ~7 dias sem uso — basta reativar no dashboard.
- As streams não são gravadas nem armazenadas em lugar nenhum — é tudo em tempo real.
- O token de API do Cloudflare fica apenas no servidor (nas server functions), nunca exposto ao cliente.
- Para HTTPS (necessário para `getDisplayMedia` em produção), use um reverse proxy como Caddy ou Nginx com Let's Encrypt.

## Stack

- [TanStack Start](https://tanstack.com/start) — framework React com SSR
- [TanStack Router](https://tanstack.com/router) — roteamento file-based
- [Tailwind CSS v4](https://tailwindcss.com/) — estilização
- [shadcn/ui](https://ui.shadcn.com/) — componentes UI
- [Cloudflare Calls API](https://developers.cloudflare.com/calls/) — WebRTC signaling
- [Supabase](https://supabase.com) — presença ao vivo (opcional): contador de espectadores, tempo de live e sons
- [Vite](https://vitejs.dev/) — bundler
- [Biome](https://biomejs.dev/) — linting e formatação

## Estrutura do projeto

```
src/
├── assets/
│   ├── Join.mp3             # som de novo espectador
│   └── Leave.mp3            # som de saída de espectador
├── components/
│   ├── draggable.tsx        # janela arrastável (PiP da própria stream)
│   ├── stream-player.tsx    # player WebRTC — conecta, puxa tracks, renderiza vídeo
│   └── ui/                  # componentes shadcn/ui (button, input, slider, etc.)
├── hooks/
│   ├── use-audience.ts      # heartbeat, contagem, tempo de live e sons
│   └── use-zoom-pan.ts      # zoom/pan do player
├── lib/
│   ├── calls.ts             # server functions — proxy para Cloudflare Calls API
│   ├── presence.ts          # client Supabase — heartbeat, presença e sons
│   ├── stream-layout.ts     # cálculo de larguras para layout multi-stream
│   └── utils.ts             # utilitários (cn, etc.)
├── routes/
│   ├── __root.tsx           # root layout (HTML shell, head, scripts)
│   ├── index.tsx            # home — iniciar transmissão ou assistir
│   ├── share.tsx            # transmissão — captura tela, controls, sharing
│   └── watch.$streamId.tsx  # visualização — player + multi-stream
├── router.tsx               # instância do TanStack Router
├── routeTree.gen.ts         # árvore de rotas gerada automaticamente
└── styles.css               # import do Tailwind
supabase/
└── schema.sql               # tabelas presence/streams + policies RLS
```

## Comandos

```bash
pnpm dev          # dev server na porta 3000
pnpm build        # build de produção
pnpm preview      # preview do build de produção
pnpm lint         # verificar lint (Biome)
pnpm format       # formatar código (Biome)
pnpm check        # lint + format combinados
```
