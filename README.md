# Ocorrência Online — E.E. Monsenhor Bicudo

Sistema full-stack para registro e acompanhamento de ocorrências escolares. O projeto usa **Angular** no frontend, **Node.js + Express** na API e **MySQL** no banco de dados.

## O que está pronto

- **Autenticação e Segurança:**
  - Login com JWT e senhas protegidas com bcrypt;
  - Validação em tempo real do status ativo do usuário a cada requisição;
  - Recurso de alteração da própria senha para todos os usuários autenticados;
  - Redefinição administrativa de senha de professores pelo painel;
  - Contas individuais por professor criadas pelo administrador;
  - Perfis de acesso com escopo rígido: Administrador, Professor e Aluno.
- **Gestão de Ocorrências:**
  - Registro de ocorrência com um ou múltiplos alunos, data, horário, local, categoria, prioridade e descrição;
  - Consulta com filtros combinados (texto, status, categoria, série/turma, professor, período);
  - **Paginação de ocorrências** com navegação por páginas;
  - Estados: pendente, em análise, em acompanhamento e encerrada;
  - Linha do tempo de providências com registro de autoria;
  - **Acompanhamento do professor:** professores podem adicionar observações e providências nas ocorrências que registraram;
  - **Impressão da Ficha Oficial:** geração da Ficha / Termo de Notificação de Ocorrência Escolar formatada para impressão direta com campos formais de assinatura (aluno, responsável, professor e direção).
- **Gestão de Alunos e Turmas:**
  - Cadastro organizado do 6º Ano do Ensino Fundamental à 3ª Série do Ensino Médio (turmas A, B, C e D);
  - **Edição de dados do aluno** (nome, matrícula, turma e responsável);
  - **Inativação e reativação de alunos** com histórico preservado;
  - **Importação em lote via planilha CSV** para início de ano letivo;
  - Histórico disciplinar individual do aluno.
- **Auditoria e Operação:**
  - Registro de auditoria detalhado (login, criação, edição e alteração de status);
  - Rotina de backup por `mysqldump`;
  - Layout moderno e responsivo com a logo e a foto da escola.

## Estrutura

```text
ocorrencia-online/
├── frontend/               # Angular
│   ├── public/images/      # Logo e foto da escola
│   └── src/app/            # Páginas, layout, serviços e proteção de rotas
├── backend/                # Node.js + Express
│   ├── database/schema.sql # Estrutura do MySQL
│   └── src/                # API, autenticação, permissões e auditoria
└── README.md
```

## Requisitos no computador

- Node.js 20 ou superior;
- MySQL 8 ou superior;
- npm.

> [!NOTE]
> No Windows, se o PowerShell exibir aviso sobre scripts desabilitados (`ExecutionPolicy`), utilize `npm.cmd` em vez de apenas `npm`, ou configure `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`.

## 1. Preparar a API e o banco

Abra o terminal na pasta principal `ocorrencia-online` e instale todas as dependências:

```bash
npm run install:all
```

Crie o arquivo de configuração sem substituir uma configuração existente:

```bash
npm run env:create
```

Abra `backend/.env`, informe a senha do MySQL em `DB_PASSWORD` e salve. O banco será criado com o nome definido em `DB_NAME`.

Confira a configuração sem exibir a senha:

```bash
npm run env:check
```

Crie as tabelas e os dados de demonstração:

```bash
npm run db:setup
```

Inicie a API:

```bash
npm run start:backend
```

A API ficará em `http://localhost:3000`.

## 2. Iniciar o Angular

Abra outro terminal na pasta principal do projeto:

```bash
npm run start:frontend
```

O navegador abrirá `http://localhost:4200`.

## Acessos de demonstração

| Perfil | E-mail | Senha |
|---|---|---|
| Administrador | `admin@monsenhor.edu.br` | `Admin@123` |
| Professor | `professor@monsenhor.edu.br` | `Professor@123` |
| Aluno | `aluno@monsenhor.edu.br` | `Aluno@123` |

> Na tela de login, há botões de clique rápido para preenchimento de teste. Troque essas senhas antes de usar o sistema com dados reais.

## Cadastrar alunos e turmas

Entre com o perfil **Administrador** e abra **Alunos e turmas**:

1. **Cadastro Individual:** Clique em **Cadastrar aluno** e preencha nome, matrícula, série, turma e dados do responsável.
2. **Edição e Inativação:** Na lista de alunos, use o ícone de lápis para editar ou o ícone de bloqueio para inativar alunos transferidos.
3. **Importação via Planilha (CSV):** Clique em **Importar Planilha (CSV)** e selecione um arquivo com as colunas:
   ```csv
   Matrícula, Nome, Turma, Nome do Responsável, Telefone
   20260025, Carlos da Silva, 6º Ano A, Maria da Silva, (14) 99888-7766
   ```

## Criar o login e gerenciar professores

Entre com o perfil **Administrador**, clique em **Professores** no menu:

- **Novo professor:** Informe nome, e-mail e senha individual provisória;
- **Desativar/Ativar acesso:** Bloqueie o acesso de professores sem apagar suas ocorrências registradas;
- **Redefinir senha:** Clique em **Redefinir Senha** para criar uma nova senha caso o professor tenha esquecido seu acesso.

## Permissões aplicadas

| Função | Administrador | Professor | Aluno |
|---|:---:|:---:|:---:|
| Consultar painel | Sim | Sim | Sim, somente seus dados |
| Criar ocorrência | Sim | Sim | Não |
| Consultar todas as ocorrências | Sim | Não | Não |
| Consultar ocorrências criadas pelo próprio usuário | Sim | Sim | Não se aplica |
| Consultar ocorrências em seu nome | Sim | Sim | Sim |
| Alterar status da ocorrência | Sim | Não | Não |
| Adicionar acompanhamento/providência | Sim | Sim (nas suas ocorrências) | Não |
| Editar dados da ocorrência | Sim | Sim (se pendente e autor) | Não |
| Imprimir Ficha Oficial | Sim | Sim | Sim |
| Cadastrar e editar alunos | Sim | Não | Não |
| Importar alunos via CSV | Sim | Não | Não |
| Gerenciar contas de professores | Sim | Não | Não |
| Consultar auditoria | Sim | Não | Não |
| Alterar a própria senha | Sim | Sim | Sim |

## Backup

Dentro de `backend`, execute:

```bash
npm run backup
```

O arquivo será criado na pasta `backend/backups`. Em uso real, agende esse comando diariamente no Agendador de Tarefas do Windows e guarde uma cópia fora do computador da escola.

## Produção e segurança

Antes de publicar:

1. Use uma `JWT_SECRET` aleatória, longa e exclusiva;
2. Ative HTTPS;
3. Restrinja `FRONTEND_URL` ao endereço real do site;
4. Crie um usuário MySQL exclusivo com apenas as permissões necessárias;
5. Troque as contas e senhas de demonstração;
6. Defina rotina de backup, teste de restauração e política de retenção;
7. Faça uma revisão da instituição sobre quais observações podem ser vistas pelo aluno, de acordo com a LGPD e as regras internas.
