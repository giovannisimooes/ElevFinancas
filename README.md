# ELEV FINANCE

Controle financeiro pessoal e empresarial (perfis **Pessoal**, **ELEV** e **Visão geral**): entradas, despesas, contas fixas recorrentes, parcelamentos, cartões e faturas, metas, calendário e relatórios com exportação em PDF/CSV.

## Onde ficam os dados

| Onde o app é aberto | Armazenamento | Sincroniza entre dispositivos? |
|---|---|---|
| Link do GitHub Pages, **conectado ao GitHub** | Um Gist **secreto** da sua conta (`elev-finance.json`) | **Sim** — em todo aparelho conectado com um token da mesma conta |
| Link do GitHub Pages, sem conectar | `localStorage` do navegador | Não |
| Artifact no Claude | Banco privado do Artifact | Sim (dentro do Claude) |

Nenhum dado financeiro fica neste repositório.

### Conectar um aparelho (uma vez por aparelho)

1. GitHub → **Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token (classic)**.
2. Marque **apenas** o escopo `gist`. Em *Expiration*, escolha o prazo que preferir (ex.: *No expiration*).
3. Copie o token, abra o app pelo link do GitHub Pages → **Configurações (engrenagem) → Dados e backup → Sincronizar pelo GitHub** → cole e clique em **Conectar**.

No primeiro aparelho o app cria o Gist secreto com os dados. Nos outros, ele encontra o mesmo Gist sozinho. O token fica salvo só no navegador de cada aparelho.

Segurança: um Gist secreto não aparece em buscas nem no seu perfil, mas quem tiver o endereço exato consegue abrir. Não compartilhe o endereço do Gist nem o token.

## Estrutura

- `index.html` — versão pronta (um único arquivo, abre direto no navegador)
- `src/core/` — regras financeiras (centavos inteiros, datas, recorrências, parcelas, faturas), armazenamento e exportações
- `src/ui/` — interface em React + TypeScript
- `src/styles.css` — tema (claro/escuro, cor principal configurável)
- `test/engine.test.ts` — testes dos cálculos

## Gerar a versão pronta

```bash
npm install
npm test        # testes dos cálculos
npm run build   # gera o index.html na raiz
```

## Publicar no GitHub Pages

Settings → Pages → Source: *Deploy from a branch* → Branch `main`, pasta `/ (root)`.
