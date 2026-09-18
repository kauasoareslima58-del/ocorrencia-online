import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';

async function upsertUser(name, email, password, role) {
  const hash = await bcrypt.hash(password, 12);
  await pool.execute(
    `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash), role = VALUES(role), active = TRUE`,
    [name, email, hash, role]
  );
  const [[user]] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
  return user.id;
}

try {
  const adminId = await upsertUser('Marina Oliveira', 'admin@monsenhor.edu.br', 'Admin@123', 'ADMINISTRADOR');
  const professorId = await upsertUser('Carlos Henrique', 'professor@monsenhor.edu.br', 'Professor@123', 'PROFESSOR');
  const studentUserId = await upsertUser('Lucas Almeida', 'aluno@monsenhor.edu.br', 'Aluno@123', 'ALUNO');

  const categories = ['Comportamento', 'Conflito / Bullying', 'Frequência / Atraso', 'Saúde', 'Material escolar', 'Infraestrutura', 'Outro'];
  const locations = ['Sala de aula', 'Pátio', 'Quadra esportiva', 'Corredor', 'Biblioteca', 'Refeitório', 'Entrada / Saída', 'Outro'];
  for (const name of categories) await pool.execute('INSERT IGNORE INTO categories (name) VALUES (?)', [name]);
  for (const name of locations) await pool.execute('INSERT IGNORE INTO locations (name) VALUES (?)', [name]);

  const students = [
    [studentUserId, '20260001', 'Lucas Almeida', '2ª Série A', 'Patrícia Almeida', '(14) 99999-1001'],
    [null, '20260002', 'Ana Beatriz Souza', '2ª Série A', 'Roberto Souza', '(14) 99999-1002'],
    [null, '20260003', 'Gabriel Martins', '1ª Série B', 'Renata Martins', '(14) 99999-1003'],
    [null, '20260004', 'Sofia Ferreira', '3ª Série A', 'Paulo Ferreira', '(14) 99999-1004'],
    [null, '20260005', 'Matheus Santos', '1ª Série A', 'Fernanda Santos', '(14) 99999-1005']
  ];
  for (const row of students) {
    await pool.execute(
      `INSERT INTO students (user_id, registration, name, class_name, guardian_name, guardian_phone)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), name = VALUES(name), class_name = VALUES(class_name), guardian_name = VALUES(guardian_name), guardian_phone = VALUES(guardian_phone), active = TRUE`,
      row
    );
  }

  const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM occurrences');
  if (!total) {
    const [[category]] = await pool.execute('SELECT id FROM categories WHERE name = ?', ['Comportamento']);
    const [[location]] = await pool.execute('SELECT id FROM locations WHERE name = ?', ['Sala de aula']);
    const [[student]] = await pool.execute('SELECT id FROM students WHERE registration = ?', ['20260001']);
    const [result] = await pool.execute(
      `INSERT INTO occurrences (protocol, occurrence_date, occurrence_time, category_id, location_id, description, status, priority, created_by)
       VALUES (?, CURRENT_DATE, '10:15', ?, ?, ?, 'EM_ANALISE', 'MEDIA', ?)`,
      ['OC-DEMO-0001', category.id, location.id, 'Durante a atividade em grupo, houve uma discussão entre alunos. A situação foi interrompida e encaminhada para conversa individual.', professorId]
    );
    await pool.execute('INSERT INTO occurrence_students (occurrence_id, student_id) VALUES (?, ?)', [result.insertId, student.id]);
    await pool.execute(
      `INSERT INTO occurrence_updates (occurrence_id, observation, previous_status, new_status, created_by)
       VALUES (?, ?, 'PENDENTE', 'EM_ANALISE', ?)`,
      [result.insertId, 'Registro encaminhado para avaliação da equipe gestora.', adminId]
    );
  }
  console.log('Dados de demonstração inseridos com sucesso.');
} finally {
  await pool.end();
}
