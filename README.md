# Ocorrência Online — E.E. Monsenhor Bicudo

Sistema full-stack para registro e acompanhamento de ocorrências escolares. O projeto usa **Angular** no frontend, **Node.js + Express** na API e **MySQL** no banco de dados.

## O que está pronto

- Login com JWT e senhas protegidas com bcrypt;
- Conta individual para cada professor, criada pelo administrador;
- Nome do professor conectado exibido no sistema e salvo automaticamente em cada ocorrência;
- Perfis de administrador, professor e aluno;
- Controle de acesso por rota e também pela API;
- Registro de ocorrência com um ou mais alunos, data, horário, local, categoria, prioridade e descrição;
- Consulta com filtros por texto, período, categoria, status e professor;
- Estados: pendente, em análise, em acompanhamento e encerrada;
- Observações, providências e linha do tempo;
- Histórico individual do aluno;
- Cadastro de alunos organizado do 6º Ano do Ensino Fundamental à 3ª Série do Ensino Médio;
- Organização por série e turma, como `6º Ano A`, `8º Ano C` e `3ª Série B`;
- Filtro fixo com as turmas A, B, C e D em todas as séries, do `6ºA` ao `3ºD`, no cadastro e na consulta de ocorrências;
- Área do aluno mostrando somente ocorrências ligadas a ele;
- Registro de auditoria de login, criação e atualização;
- Backup por `mysqldump`;
- Layout responsivo com a logo e a foto da escola fornecidas.

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
- npm;
- `mysqldump` no PATH apenas para o comando de backup.

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

Troque essas senhas antes de usar o sistema com dados reais.

## Cadastrar alunos e turmas

Entre com o perfil **Administrador** e abra **Alunos e turmas**. Clique em **Cadastrar aluno** e preencha:

1. Nome completo;
2. Matrícula;
3. Série, do `6º Ano` à `3ª Série`;
4. Turma: `A`, `B`, `C` ou `D`;
5. Nome e telefone do responsável, quando necessário.

As turmas A, B, C e D do `6º Ano` à `3ª Série` já aparecem nos filtros, mesmo antes de existir um aluno cadastrado.

## Criar o login de cada professor

Entre com o perfil **Administrador**, clique em **Cadastrar professores** no menu ou em **Cadastrar professor** no painel. Depois clique em **Novo professor** e informe o nome completo, o e-mail usado como login e uma senha individual.

Quando o professor entrar com essa conta:

- O nome dele aparecerá no canto superior do sistema;
- Uma nova ocorrência será vinculada automaticamente à conta conectada;
- O nome será exibido no campo **Registrado por** e na coluna **Responsável**;
- O professor visualizará somente as ocorrências registradas pela própria conta;
- O administrador poderá consultar todos os professores e todas as ocorrências.

O administrador também pode desativar o acesso de um professor sem apagar as ocorrências que ele registrou.

## Atualizar uma instalação anterior

Se você já iniciou a versão anterior, substitua a pasta pelo projeto atualizado e execute novamente na pasta `backend`:

```bash
npm run install:all
npm run env:check
npm run db:setup
npm run start:backend
```

Os alunos e as ocorrências que você já cadastrou no MySQL não serão apagados.

## Permissões aplicadas

| Função | Administrador | Professor | Aluno |
|---|:---:|:---:|:---:|
| Consultar painel | Sim | Sim | Sim, somente seus dados |
| Criar ocorrência | Sim | Sim | Não |
| Consultar todas as ocorrências | Sim | Não | Não |
| Consultar ocorrências criadas pelo próprio usuário | Sim | Sim | Não se aplica |
| Consultar ocorrências em seu nome | Sim | Sim | Sim |
| Atualizar status, observações e providências | Sim | Não | Não |
| Consultar histórico de alunos | Sim | Sim | Não |
| Consultar auditoria | Sim | Não | Não |

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

## Gerar a versão final do Angular

```bash
npm run check
```

Esse comando valida o backend e compila o frontend. Os arquivos prontos para publicação serão gerados em `frontend/dist/ocorrencia-online/browser`.
