# Ocorrência Online — E.E. Monsenhor Bicudo

Sistema full-stack desenvolvido para o registro, acompanhamento e gestão de ocorrências escolares da **E.E. Monsenhor Bicudo**. Utiliza **Angular** no frontend, **Node.js + Express** na API REST e **MySQL 8+** no banco de dados.

---

## Como o sistema funciona

O **Ocorrência Online** centraliza o fluxo pedagógico e disciplinar da escola, substituindo registros manuais em papel por um controle seguro, rastreável e responsivo:

1. **Professores** e **Coordenação (Administradores)** acessam com e-mail institucional e senha individual.
2. Ao registrar uma ocorrência, o sistema vincula automaticamente o servidor logado como responsável pelo registro, associa um ou mais alunos e gera um protocolo único (`OC-AAAA-...`).
3. A **Coordenação** acompanha os casos pelo painel em tempo real, atualiza o status (`Pendente` → `Em análise` → `Em acompanhamento` → `Encerrada`), registra providências e pode emitir fichas oficiais ou relatórios consolidados para impressão.
4. Todas as ações sensíveis (login, tentativas negadas, cadastros, edições, mudanças de status e alterações de senha) são registradas na **Auditoria**.

---

## Perfis de acesso (somente dois tipos de usuários)

O sistema possui **exclusivamente dois perfis com login**:

| Perfil | Descrição |
|---|---|
| **Administrador / Coordenação** (`ADMINISTRADOR`) | Acesso completo: painel gerencial da escola, todas as ocorrências, alteração de status, categorias/locais, gestão de professores, cadastro/importação de alunos e auditoria. |
| **Professor** (`PROFESSOR`) | Acesso restrito às suas ocorrências: pode registrar novas ocorrências, consultar e acompanhar suas próprias ocorrências (enquanto não encerradas), editar suas ocorrências enquanto estiverem pendentes e consultar alunos/turmas ativos. |

> [!IMPORTANT]
> **Os alunos NÃO possuem acesso nem login no sistema.** Eles são apenas cadastrados pela Coordenação para serem vinculados às ocorrências escolares e terem seu histórico pedagógico consultado pela equipe escolar.

### Matriz de permissões

| Funcionalidade | Coordenação (Admin) | Professor |
|---|:---:|:---:|
| Consultar painel com indicadores reais e gráficos | Sim (escola toda) | Sim (suas ocorrências) |
| Registrar nova ocorrência (1 ou mais alunos) | Sim | Sim |
| Consultar todas as ocorrências da escola | Sim | Não |
| Consultar ocorrências criadas por si | Sim | Sim |
| Editar dados da ocorrência | Sim | Sim (somente se Pendente e autor) |
| Alterar status da ocorrência | Sim | Não |
| Registrar observações e providências | Sim | Sim (nas suas ocorrências abertas) |
| Imprimir Ficha Oficial / Relatório / Exportar CSV | Sim | Sim (seus registros) |
| Consultar alunos ativos e histórico | Sim | Sim (histórico de suas ocorrências) |
| Cadastrar, editar, inativar e importar alunos (CSV) | Sim | Não |
| Gerenciar categorias e locais | Sim | Não |
| Gerenciar contas de professores (criar, editar, ativar/desativar, redefinir senha) | Sim | Não |
| Consultar registros de auditoria | Sim | Não |
| Alterar a própria senha | Sim | Sim |

---

## Principais funcionalidades

- **Autenticação e Segurança:**
  - JWT com algoritmo `HS256`, validação de `issuer`, `audience`, expiração e revogação imediata via `token_version` ao alterar/redefinir senha ou desativar conta;
  - Senhas protegidas com `bcryptjs` (custo 12) e política de senha forte (8 a 72 caracteres, maiúscula, minúscula, número e símbolo);
  - Política CORS restrita apenas às origens configuradas em `FRONTEND_URL` e `ALLOWED_ORIGINS`;
  - Rate limiting para proteção contra força bruta no login e abuso da API;
  - Proteção de todas as rotas da API e validação em tempo real de usuário ativo no MySQL.
- **Painel Administrativo (Dashboard):**
  - Totais reais direto do MySQL: Total, Pendentes, Em análise, Em acompanhamento e Encerradas;
  - Indicadores de desempenho reais: Taxa de resolução (%), tempo médio de encerramento, volume mensal com comparativo e casos de alta/urgente em aberto;
  - Gráfico interativo de **ocorrências por mês** (últimos 6 meses);
  - Gráfico de **ocorrências por categoria**, **por turma** e **por prioridade** com percentuais reais.
- **Gestão de Ocorrências:**
  - Seleção de um ou mais alunos, filtro por turma, data, horário, local, categoria, prioridade e descrição detalhada;
  - Filtros combinados por aluno/protocolo, status, prioridade, categoria, turma, professor e período;
  - Linha do tempo com histórico completo de alterações de dados, mudanças de status, observações e providências;
  - Impressão da **Ficha Oficial de Ocorrência**, **Relatório Consolidado** e exportação CSV protegida.
- **Gestão de Professores (exclusivo Coordenação):**
  - Cadastro com login individual, edição de dados, ativação/desativação de acesso e redefinição de senha com revogação imediata de sessões anteriores.
- **Gestão de Alunos e Turmas:**
  - Organização escolar do **6º Ano do Ensino Fundamental à 3ª Série do Ensino Médio**, turmas **A, B, C e D**;
  - Cadastro individual, edição, inativação/reativação lógica (preservando histórico) e impressão do histórico disciplinar;
  - Importação por planilha **CSV** com modelo para download, validação de campos e bloqueio automático de matrículas duplicadas.
- **Banco de Dados, Backup e Restauração:**
  - Schema MySQL com chaves estrangeiras, restrições `UNIQUE` e índices otimizados;
  - Migrações seguras sem perda de dados (`db:schema`);
  - Backup SQL (`npm run backup`) via `mysqldump` ou gerador SQL interno compatível, e restauração segura (`npm run restore`).

---

## Estrutura do projeto

```text
ocorrencia-online/
├── backend/
│   ├── database/schema.sql        # Estrutura MySQL (tabelas, FKs e índices)
│   ├── src/
│   │   ├── config/                # env.js, db.js, classes.js
│   │   ├── middleware/            # auth.js (JWT + RBAC), error-handler.js
│   │   ├── routes/                # auth, dashboard, occurrences, students, teachers, metadata, audit, notifications
│   │   ├── scripts/               # setup-db, seed, create-admin, backup, restore, check-env
│   │   ├── tests/                 # integration.test.js (suíte de testes da API e MySQL)
│   │   └── utils/                 # validators.js, audit.js, occurrence-queries.js
│   └── .env.example
├── frontend/
│   ├── public/images/             # Logo e foto da E.E. Monsenhor Bicudo
│   └── src/app/
│       ├── core/                  # api.service, auth.service, guards, interceptor, models, helpers
│       ├── layout/                # shell.component (menu, topbar, notificações, troca de senha)
│       └── pages/                 # login, dashboard, occurrences, occurrence-form, occurrence-detail, students, teachers, audit
├── scripts/                       # Utilitários (create-env.js, generate-students.js)
└── README.md
```

---

## Requisitos do sistema

- **Node.js** 20 ou superior;
- **npm** 10 ou superior;
- **MySQL** 8.0 ou superior em execução.

> [!NOTE]
> No Windows, se o PowerShell bloquear scripts (`ExecutionPolicy`), utilize `npm.cmd` ou execute `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`.

---

## Instalação e configuração

### 1. Instalar dependências

No diretório raiz `ocorrencia-online`:

```bash
npm run install:all
```

### 2. Configurar variáveis de ambiente (`backend/.env`)

Crie o arquivo de ambiente sem sobrescrever configurações existentes:

```bash
npm run env:create
```

Abra `backend/.env` e ajuste as credenciais do MySQL e a chave JWT:

```env
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:4200
ALLOWED_ORIGINS=
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=sua_senha_do_mysql
DB_NAME=ocorrencia_online
JWT_SECRET=gere-uma-chave-aleatoria-segura-com-pelo-menos-32-caracteres
JWT_EXPIRES_IN=8h
MYSQL_BIN_PATH=
```

Para gerar uma `JWT_SECRET` forte no terminal:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Verifique se o `.env` está válido (sem expor a senha):

```bash
npm run env:check
```

### 3. Configurar o banco de dados MySQL

Para criar o banco, tabelas e índices (sem apagar dados existentes):

```bash
npm run db:schema
```

Para também popular categorias, locais, lista inicial de alunos por turma e contas de demonstração para testes/TCC:

```bash
npm run db:setup
```

---

## Como criar o primeiro Administrador (Coordenação)

Para criar (ou atualizar) o primeiro usuário **Administrador / Coordenação** sem depender de contas de teste:

### Modo interativo (recomendado)

```bash
npm run admin:create
```

O terminal solicitará:
1. Nome completo;
2. E-mail institucional;
3. Senha forte (mínimo 8 caracteres, contendo letra maiúscula, minúscula, número e símbolo).

### Modo direto por argumentos

```bash
npm run admin:create -- --name "Nome da Coordenação" --email "coordenacao@monsenhor.edu.br" --password "SenhaForte@2026"
```

---

## Como iniciar o sistema

### Modo desenvolvimento (Backend + Frontend juntos)

```bash
npm run dev
```

### Ou em dois terminais separados

Terminal 1 (API Node.js/Express — `http://localhost:3000`):

```bash
npm run start:backend
```

Terminal 2 (Frontend Angular — `http://localhost:4200`):

```bash
npm run start:frontend
```

### Build de produção do Angular

```bash
npm run build
```

Quando o build existe em `frontend/dist/ocorrencia-online/browser`, o próprio backend serve o frontend automaticamente em `http://localhost:3000`.

---

## Backup e restauração do MySQL

### Gerar backup

```bash
npm run backup
```

O arquivo `.sql` será salvo em `backend/backups/ocorrencia-online-<data>.sql`. O script utiliza `mysqldump` automaticamente (se disponível no `PATH` ou em `MYSQL_BIN_PATH`) e conta com gerador SQL interno compatível caso `mysqldump` não esteja configurado no PATH do Windows.

### Restaurar backup

```bash
npm run restore -- backend/backups/ocorrencia-online-ARQUIVO.sql --confirm
```

> [!WARNING]
> A restauração substitui os dados atuais do banco configurado em `DB_NAME`. Sempre realize um backup antes de restaurar um arquivo antigo.

---

## Testes e validação

Verificação de sintaxe do backend + build de produção do frontend:

```bash
npm run check
```

Suíte automatizada de testes de integração (autenticação, bloqueio sem token, CORS, permissões por perfil, CRUD de professores e alunos, importação CSV com bloqueio de duplicados, ocorrências, filtros e dashboard):

```bash
npm run test:integration
```

---

## Boas práticas antes de colocar em produção

1. Configure `NODE_ENV=production` no `backend/.env`;
2. Defina uma `JWT_SECRET` exclusiva e aleatória (mínimo 32 caracteres);
3. Configure `FRONTEND_URL` (e `ALLOWED_ORIGINS`, se aplicável) apenas com o domínio oficial HTTPS da escola;
4. Crie um usuário MySQL dedicado com privilégios restritos apenas ao banco `ocorrencia_online`;
5. Remova ou desative quaisquer contas de demonstração após criar a conta real da Coordenação via `npm run admin:create`;
6. Agende `npm run backup` diariamente e armazene cópias externas testando periodicamente o `npm run restore`.
