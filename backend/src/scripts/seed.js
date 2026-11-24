import bcrypt from 'bcryptjs';
import { ensureRuntimeSchema, pool } from '../config/db.js';
import { initialStudents } from '../data/students-seed.js';

async function upsertUser(name, email, password, role) {
  const hash = await bcrypt.hash(password, 12);
  await pool.execute(
    `INSERT INTO users (name, email, password_hash, role, active)
     VALUES (?, ?, ?, ?, TRUE)
     ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash), role = VALUES(role), active = TRUE`,
    [name, email, hash, role]
  );
  const [[user]] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
  return user.id;
}

try {
  await ensureRuntimeSchema();

  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin@123';
  const professorPassword = process.env.SEED_PROFESSOR_PASSWORD || 'Professor@123';

  const adminId = await upsertUser('Marina Oliveira', 'admin@monsenhor.edu.br', adminPassword, 'ADMINISTRADOR');
  const professorId = await upsertUser('Carlos Henrique', 'professor@monsenhor.edu.br', professorPassword, 'PROFESSOR');

  const categories = [
    'Comportamento',
    'Conflito / Bullying',
    'Frequência / Atraso',
    'Saúde',
    'Material escolar',
    'Infraestrutura',
    'Outro'
  ];
  const locations = [
    'Sala de aula',
    'Pátio',
    'Quadra esportiva',
    'Corredor',
    'Biblioteca',
    'Refeitório',
    'Entrada / Saída',
    'Outro'
  ];
  for (const name of categories) await pool.execute('INSERT IGNORE INTO categories (name) VALUES (?)', [name]);
  for (const name of locations) await pool.execute('INSERT IGNORE INTO locations (name) VALUES (?)', [name]);

  console.log(`Inserindo/atualizando ${initialStudents.length} alunos (20 por turma, do 6º Ano à 3ª Série)...`);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const batchSize = 100;
    for (let i = 0; i < initialStudents.length; i += batchSize) {
      const slice = initialStudents.slice(i, i + batchSize);
      const placeholders = slice.map(() => '(?, ?, ?, ?, ?, TRUE)').join(', ');
      const values = slice.flatMap((s) => [s.registration, s.name, s.className, s.guardianName, s.guardianPhone]);
      await connection.execute(
        `INSERT INTO students (registration, name, class_name, guardian_name, guardian_phone, active)
         VALUES ${placeholders}
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           class_name = VALUES(class_name),
           guardian_name = VALUES(guardian_name),
           guardian_phone = VALUES(guardian_phone),
           active = TRUE`,
        values
      );
    }
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM occurrences');
  if (!total) {
    const [[category]] = await pool.execute('SELECT id FROM categories WHERE name = ?', ['Comportamento']);
    const [[location]] = await pool.execute('SELECT id FROM locations WHERE name = ?', ['Sala de aula']);
    const [[student]] = await pool.execute('SELECT id FROM students ORDER BY id ASC LIMIT 1');
    if (student && category && location) {
      const [result] = await pool.execute(
        `INSERT INTO occurrences (protocol, occurrence_date, occurrence_time, category_id, location_id, description, status, priority, created_by)
         VALUES (?, CURRENT_DATE, '10:15', ?, ?, ?, 'EM_ANALISE', 'MEDIA', ?)`,
        [
          'OC-DEMO-0001',
          category.id,
          location.id,
          'Durante a atividade em grupo, houve uma discussão entre alunos. A situação foi interrompida e encaminhada para conversa individual.',
          professorId
        ]
      );
      await pool.execute('INSERT INTO occurrence_students (occurrence_id, student_id) VALUES (?, ?)', [result.insertId, student.id]);
      await pool.execute(
        `INSERT INTO occurrence_updates (occurrence_id, observation, previous_status, new_status, created_by)
         VALUES (?, ?, 'PENDENTE', 'EM_ANALISE', ?)`,
        [result.insertId, 'Registro encaminhado para avaliação da equipe gestora.', adminId]
      );
    }
  }
  console.log('Dados iniciais e alunos inseridos com sucesso (nenhuma conta de aluno foi criada).');
} finally {
  await pool.end();
}
