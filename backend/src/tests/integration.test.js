import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { app } from '../app.js';
import { checkDatabase, ensureRuntimeSchema, pool } from '../config/db.js';
import { env } from '../config/env.js';

let server;
let baseUrl;
let adminToken;
let teacherToken;
let createdAdminId;
let createdTeacherId;
let createdStudentIds = [];
let createdOccurrenceIds = [];

const suffix = `${Date.now()}`;
const testAdminEmail = `test.admin.${suffix}@monsenhor.edu.br`;
const testTeacherEmail = `test.prof.${suffix}@monsenhor.edu.br`;
const testPass = 'Teste@2026!';

async function api(path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* plain text */ }
  return { status: response.status, json, headers: response.headers };
}

before(async () => {
  await checkDatabase();
  await ensureRuntimeSchema();

  // Garantir pelo menos 1 categoria e 1 local ativos
  await pool.execute('INSERT IGNORE INTO categories (name, active) VALUES (?, TRUE)', ['Comportamento']);
  await pool.execute('INSERT IGNORE INTO locations (name, active) VALUES (?, TRUE)', ['Sala de aula']);

  const hash = await bcrypt.hash(testPass, 10);
  const [adminRes] = await pool.execute(
    `INSERT INTO users (name, email, password_hash, role, active, token_version)
     VALUES (?, ?, ?, 'ADMINISTRADOR', TRUE, 1)`,
    ['Admin Teste Integração', testAdminEmail, hash]
  );
  createdAdminId = adminRes.insertId;

  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

after(async () => {
  try {
    if (createdOccurrenceIds.length) {
      await pool.execute(
        `DELETE FROM occurrences WHERE id IN (${createdOccurrenceIds.map(() => '?').join(',')})`,
        createdOccurrenceIds
      );
    }
    if (createdStudentIds.length) {
      await pool.execute(
        `DELETE FROM students WHERE id IN (${createdStudentIds.map(() => '?').join(',')})`,
        createdStudentIds
      );
    }
    const userIds = [createdTeacherId, createdAdminId].filter(Boolean);
    if (userIds.length) {
      await pool.execute(
        `DELETE FROM audit_logs WHERE user_id IN (${userIds.map(() => '?').join(',')})`,
        userIds
      );
      await pool.execute(
        `DELETE FROM users WHERE id IN (${userIds.map(() => '?').join(',')})`,
        userIds
      );
    }
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
});

test('1. Health check e bloqueio de rotas sem autenticação (401)', async () => {
  const health = await api('/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.json.status, 'ok');

  for (const route of ['/api/dashboard', '/api/occurrences', '/api/students', '/api/teachers', '/api/audit', '/api/auth/me']) {
    const res = await api(route);
    assert.equal(res.status, 401, `Rota ${route} deveria exigir autenticação`);
  }
});

test('2. Política CORS rejeita origens não autorizadas em produção ou fora de localhost', async () => {
  const res = await api('/api/health', {
    headers: { Origin: 'https://site-nao-autorizado.exemplo.com' }
  });
  assert.equal(res.status, 403);

  const allowed = await api('/api/health', {
    headers: { Origin: env.frontendUrl }
  });
  assert.equal(allowed.status, 200);
});

test('3. Login de administrador e validação de sessão (/api/auth/me)', async () => {
  const badLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { email: testAdminEmail, password: 'WrongPassword@1' }
  });
  assert.equal(badLogin.status, 401);

  const login = await api('/api/auth/login', {
    method: 'POST',
    body: { email: testAdminEmail, password: testPass }
  });
  assert.equal(login.status, 200);
  assert.ok(login.json.token);
  assert.equal(login.json.user.role, 'ADMINISTRADOR');
  adminToken = login.json.token;

  const me = await api('/api/auth/me', { token: adminToken });
  assert.equal(me.status, 200);
  assert.equal(me.json.user.email, testAdminEmail);
});

test('4. Gerenciamento de professores: criar, editar, login, permissões, reset senha e desativar', async () => {
  const created = await api('/api/teachers', {
    method: 'POST',
    token: adminToken,
    body: { name: 'Professor Teste', email: testTeacherEmail, password: testPass }
  });
  assert.equal(created.status, 201);
  createdTeacherId = created.json.id;

  const loginProf = await api('/api/auth/login', {
    method: 'POST',
    body: { email: testTeacherEmail, password: testPass }
  });
  assert.equal(loginProf.status, 200);
  assert.equal(loginProf.json.user.role, 'PROFESSOR');
  teacherToken = loginProf.json.token;

  // Professor não pode acessar rotas administrativas
  assert.equal((await api('/api/teachers', { token: teacherToken })).status, 403);
  assert.equal((await api('/api/audit', { token: teacherToken })).status, 403);

  // Admin edita professor
  const edited = await api(`/api/teachers/${createdTeacherId}`, {
    method: 'PATCH',
    token: adminToken,
    body: { name: 'Professor Teste Editado', email: testTeacherEmail }
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.json.name, 'Professor Teste Editado');

  // Redefinir senha revoga token antigo imediatamente
  const newPass = 'NovaSenha@2026!';
  const resetRes = await api(`/api/teachers/${createdTeacherId}/reset-password`, {
    method: 'POST',
    token: adminToken,
    body: { newPassword: newPass }
  });
  assert.equal(resetRes.status, 200);
  assert.equal((await api('/api/auth/me', { token: teacherToken })).status, 401);

  // Login com nova senha funciona
  const relogin = await api('/api/auth/login', {
    method: 'POST',
    body: { email: testTeacherEmail, password: newPass }
  });
  assert.equal(relogin.status, 200);
  teacherToken = relogin.json.token;
});

test('5. Cadastro de alunos, bloqueio de duplicados, inativação e importação CSV', async () => {
  const reg1 = `T${suffix.slice(-7)}1`;
  const reg2 = `T${suffix.slice(-7)}2`;

  // Professor não pode cadastrar aluno
  const forbidden = await api('/api/students', {
    method: 'POST',
    token: teacherToken,
    body: { name: 'Aluno Proibido', registration: reg1, className: '6º Ano A' }
  });
  assert.equal(forbidden.status, 403);

  // Admin cadastra aluno
  const st1 = await api('/api/students', {
    method: 'POST',
    token: adminToken,
    body: { name: 'Aluno Um Teste', registration: reg1, className: '6º Ano A', guardianName: 'Resp Um' }
  });
  assert.equal(st1.status, 201);
  createdStudentIds.push(st1.json.id);

  // Duplicado bloqueado (409)
  const dup = await api('/api/students', {
    method: 'POST',
    token: adminToken,
    body: { name: 'Aluno Duplicado', registration: reg1, className: '6º Ano B' }
  });
  assert.equal(dup.status, 409);

  // Importação CSV com 1 válido, 1 duplicado existente, 1 duplicado interno e 1 turma inválida
  const batch = await api('/api/students/batch', {
    method: 'POST',
    token: adminToken,
    body: {
      updateExisting: false,
      students: [
        { registration: reg2, name: 'Aluno Dois CSV', className: '3ª Série D', guardianName: 'Resp Dois' },
        { registration: reg1, name: 'Já Existente', className: '6º Ano A' },
        { registration: reg2, name: 'Duplicado No Arquivo', className: '3ª Série D' },
        { registration: `INV${suffix.slice(-5)}`, name: 'Turma Errada', className: '5º Ano Z' }
      ]
    }
  });
  assert.equal(batch.status, 200);
  assert.equal(batch.json.successCount, 1);
  assert.equal(batch.json.duplicateCount, 2);
  assert.equal(batch.json.errorCount, 1);

  const [[st2Row]] = await pool.execute('SELECT id FROM students WHERE registration = ?', [reg2]);
  if (st2Row) createdStudentIds.push(st2Row.id);

  // Exclusão lógica (inativar e reativar)
  const inact = await api(`/api/students/${st1.json.id}/status`, {
    method: 'PATCH',
    token: adminToken,
    body: { active: false }
  });
  assert.equal(inact.status, 200);
  const react = await api(`/api/students/${st1.json.id}/status`, {
    method: 'PATCH',
    token: adminToken,
    body: { active: true }
  });
  assert.equal(react.status, 200);
});

test('6. Ocorrências: cadastro, edição com histórico, status, permissões, filtros e dashboard real', async () => {
  const meta = await api('/api/metadata', { token: teacherToken });
  assert.equal(meta.status, 200);
  const categoryId = meta.json.categories[0].id;
  const locationId = meta.json.locations[0].id;

  // Professor registra ocorrência com os 2 alunos de teste
  const created = await api('/api/occurrences', {
    method: 'POST',
    token: teacherToken,
    body: {
      studentIds: createdStudentIds,
      categoryId,
      locationId,
      occurrenceDate: new Date().toISOString().slice(0, 10),
      occurrenceTime: '09:30',
      priority: 'ALTA',
      description: 'Registro de teste automatizado para validar todo o ciclo da ocorrência escolar.'
    }
  });
  assert.equal(created.status, 201);
  assert.equal(created.json.createdBy, createdTeacherId);
  assert.equal(created.json.status, 'PENDENTE');
  assert.equal(created.json.students.length, createdStudentIds.length);
  createdOccurrenceIds.push(created.json.id);

  // Professor tenta alterar status -> bloqueado (403)
  const forbiddenStatus = await api(`/api/occurrences/${created.json.id}/updates`, {
    method: 'POST',
    token: teacherToken,
    body: { newStatus: 'ENCERRADA', observation: 'Tentando encerrar sem permissão' }
  });
  assert.equal(forbiddenStatus.status, 403);

  // Professor edita ocorrência enquanto PENDENTE -> histórico automático criado
  const edited = await api(`/api/occurrences/${created.json.id}`, {
    method: 'PATCH',
    token: teacherToken,
    body: {
      studentIds: createdStudentIds,
      categoryId,
      locationId,
      occurrenceDate: new Date().toISOString().slice(0, 10),
      occurrenceTime: '09:45',
      priority: 'URGENTE',
      description: 'Descrição atualizada no teste automatizado para validar histórico de alterações.'
    }
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.json.priority, 'URGENTE');
  assert.ok(edited.json.updates.length >= 1, 'Edição deve registrar entrada na linha do tempo');

  // Coordenação altera status para ENCERRADA
  const closeRes = await api(`/api/occurrences/${created.json.id}/updates`, {
    method: 'POST',
    token: adminToken,
    body: { newStatus: 'ENCERRADA', actionTaken: 'Conversa realizada com responsáveis e caso encerrado.' }
  });
  assert.equal(closeRes.status, 200);
  assert.equal(closeRes.json.occurrence.status, 'ENCERRADA');

  // Professor não pode mais adicionar updates após encerrada
  const postClose = await api(`/api/occurrences/${created.json.id}/updates`, {
    method: 'POST',
    token: teacherToken,
    body: { observation: 'Tentativa após encerramento' }
  });
  assert.equal(postClose.status, 403);

  // Filtros na listagem
  const filtered = await api(`/api/occurrences?status=ENCERRADA&priority=URGENTE&search=${encodeURIComponent(created.json.protocol)}`, {
    token: adminToken
  });
  assert.equal(filtered.status, 200);
  assert.equal(filtered.json.total, 1);

  // Dashboard retorna indicadores reais e gráfico mensal
  const dash = await api('/api/dashboard', { token: adminToken });
  assert.equal(dash.status, 200);
  assert.equal(dash.json.byMonth.length, 6);
  assert.ok(dash.json.totals.all >= 1);
  assert.ok(typeof dash.json.performance.resolutionRate === 'number');

  // Desativação de professor preserva ocorrência e revoga acesso imediatamente
  const deactivate = await api(`/api/teachers/${createdTeacherId}/status`, {
    method: 'PATCH',
    token: adminToken,
    body: { active: false }
  });
  assert.equal(deactivate.status, 200);
  assert.ok(Number(deactivate.json.occurrenceCount) >= 1, 'Contagem real de ocorrências preservada');
  assert.equal((await api('/api/auth/me', { token: teacherToken })).status, 401);
});
