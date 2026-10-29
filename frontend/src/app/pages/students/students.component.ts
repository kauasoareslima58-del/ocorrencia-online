import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { BatchImportResponse, Occurrence, Student } from '../../core/models';
import { classLabel, formatDate, statusLabel } from '../../core/view-helpers';

@Component({
  selector: 'app-students',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './students.component.html',
  styleUrl: './students.component.scss'
})
export class StudentsComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly auth = inject(AuthService);
  readonly gradeLevels = ['6º Ano', '7º Ano', '8º Ano', '9º Ano', '1ª Série', '2ª Série', '3ª Série'];
  readonly sections = ['A', 'B', 'C', 'D'];
  students: Student[] = [];
  classes: string[] = [];
  selectedStudent: Student | null = null;
  history: Occurrence[] = [];
  search = '';
  selectedClass = '';
  includeInactive = false;
  loading = true;
  historyLoading = false;
  showForm = false;
  saving = false;
  formError = '';
  success = '';

  studentForm = {
    name: '', registration: '', gradeLevel: '6º Ano', section: 'A', guardianName: '', guardianPhone: ''
  };

  // Edit modal
  showEditModal = false;
  editSaving = false;
  editError = '';
  editStudentForm = {
    id: 0, name: '', registration: '', gradeLevel: '6º Ano', section: 'A', guardianName: '', guardianPhone: ''
  };

  // CSV Import modal
  showImportModal = false;
  importing = false;
  importError = '';
  importSuccess = '';
  csvData: Array<{ name: string; registration: string; className: string; guardianName?: string; guardianPhone?: string }> = [];

  readonly formatDate = formatDate;
  readonly statusLabel = statusLabel;
  readonly classLabel = classLabel;

  ngOnInit(): void {
    this.loadClasses();
    this.loadStudents();
  }

  loadClasses(): void {
    this.api.getMetadata().subscribe(({ classes }) => this.classes = classes);
  }

  loadStudents(): void {
    this.loading = true;
    this.api.getStudents(this.search, this.selectedClass, this.includeInactive).subscribe({
      next: (items) => { this.students = items; this.loading = false; },
      error: () => this.loading = false
    });
  }

  submitStudent(): void {
    if (this.saving) return;
    const section = this.studentForm.section.trim().toUpperCase();
    if (!this.sections.includes(section)) { this.formError = 'Selecione uma turma entre A e D.'; return; }
    this.saving = true;
    this.formError = '';
    this.success = '';
    const payload = {
      name: this.studentForm.name,
      registration: this.studentForm.registration,
      className: `${this.studentForm.gradeLevel} ${section}`,
      guardianName: this.studentForm.guardianName,
      guardianPhone: this.studentForm.guardianPhone
    };
    this.api.createStudent(payload).subscribe({
      next: (student) => {
        this.studentForm = { name: '', registration: '', gradeLevel: this.studentForm.gradeLevel, section, guardianName: '', guardianPhone: '' };
        this.selectedClass = student.className;
        this.success = `${student.name} foi cadastrado na turma ${student.className}.`;
        this.saving = false;
        this.showForm = false;
        this.loadClasses();
        this.loadStudents();
      },
      error: (error: HttpErrorResponse) => {
        this.formError = typeof error.error?.message === 'string' ? error.error.message : 'Não foi possível cadastrar o aluno.';
        this.saving = false;
      }
    });
  }

  openEdit(student: Student, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    this.showEditModal = true;
    this.editError = '';

    // Split className e.g. "6º Ano A" -> grade "6º Ano", section "A"
    const parts = student.className.trim().split(' ');
    const section = parts.pop() || 'A';
    const gradeLevel = parts.join(' ') || '6º Ano';

    this.editStudentForm = {
      id: student.id,
      name: student.name,
      registration: student.registration,
      gradeLevel: this.gradeLevels.includes(gradeLevel) ? gradeLevel : '6º Ano',
      section: this.sections.includes(section) ? section : 'A',
      guardianName: student.guardianName || '',
      guardianPhone: student.guardianPhone || ''
    };
  }

  closeEdit(): void {
    this.showEditModal = false;
  }

  submitEdit(): void {
    if (this.editSaving) return;
    const section = this.editStudentForm.section.trim().toUpperCase();
    if (!this.sections.includes(section)) {
      this.editError = 'Selecione uma turma entre A e D.';
      return;
    }
    this.editSaving = true;
    this.editError = '';
    const payload = {
      name: this.editStudentForm.name,
      registration: this.editStudentForm.registration,
      className: `${this.editStudentForm.gradeLevel} ${section}`,
      guardianName: this.editStudentForm.guardianName,
      guardianPhone: this.editStudentForm.guardianPhone
    };

    this.api.updateStudent(this.editStudentForm.id, payload).subscribe({
      next: (updated) => {
        this.editSaving = false;
        this.showEditModal = false;
        this.success = `Dados de ${updated.name} atualizados com sucesso.`;
        if (this.selectedStudent?.id === updated.id) {
          this.selectedStudent = updated;
        }
        this.loadClasses();
        this.loadStudents();
      },
      error: (error: HttpErrorResponse) => {
        this.editSaving = false;
        this.editError = typeof error.error?.message === 'string' ? error.error.message : 'Erro ao atualizar aluno.';
      }
    });
  }

  toggleStudentStatus(student: Student, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    const newStatus = !student.active;
    const actionLabel = newStatus ? 'reativar' : 'inativar';
    if (!confirm(`Deseja realmente ${actionLabel} o cadastro de ${student.name}?`)) return;

    this.api.updateStudentStatus(student.id, newStatus).subscribe({
      next: () => {
        student.active = newStatus;
        this.success = `Aluno ${student.name} ${newStatus ? 'reativado' : 'inativado'} com sucesso.`;
        this.loadStudents();
      },
      error: () => {
        alert('Não foi possível alterar o status do aluno.');
      }
    });
  }

  openHistory(student: Student): void {
    this.selectedStudent = student;
    this.historyLoading = true;
    this.api.getStudentHistory(student.id).subscribe({
      next: (data) => { this.selectedStudent = data.student; this.history = data.occurrences; this.historyLoading = false; },
      error: () => { this.history = []; this.historyLoading = false; }
    });
  }

  // Import CSV methods
  openImportModal(): void {
    this.showImportModal = true;
    this.importError = '';
    this.importSuccess = '';
    this.csvData = [];
  }

  closeImportModal(): void {
    this.showImportModal = false;
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      this.parseCsv(text);
    };
    reader.readAsText(file, 'utf-8');
  }

  parseCsv(text: string): void {
    this.importError = '';
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (!lines.length) {
      this.importError = 'Arquivo CSV vazio.';
      return;
    }

    // Determine if first row is header
    const firstLine = lines[0].toLowerCase();
    const startIndex = (firstLine.includes('nome') || firstLine.includes('matr') || firstLine.includes('turma')) ? 1 : 0;

    const parsed: Array<{ name: string; registration: string; className: string; guardianName?: string; guardianPhone?: string }> = [];

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      // Split by semicolon or comma
      const delimiter = line.includes(';') ? ';' : ',';
      const cols = line.split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));
      if (cols.length >= 3) {
        parsed.push({
          registration: cols[0],
          name: cols[1],
          className: cols[2],
          guardianName: cols[3] || '',
          guardianPhone: cols[4] || ''
        });
      }
    }

    if (!parsed.length) {
      this.importError = 'Nenhum registro válido encontrado. O arquivo deve ter: Matrícula, Nome, Turma, Responsável, Telefone.';
      return;
    }

    this.csvData = parsed;
  }

  submitBatchImport(): void {
    if (this.importing || !this.csvData.length) return;
    this.importing = true;
    this.importError = '';
    this.importSuccess = '';

    this.api.batchCreateStudents(this.csvData).subscribe({
      next: (res: BatchImportResponse) => {
        this.importing = false;
        this.importSuccess = res.message;
        this.csvData = [];
        this.loadClasses();
        this.loadStudents();
      },
      error: (err: HttpErrorResponse) => {
        this.importing = false;
        this.importError = typeof err.error?.message === 'string' ? err.error.message : 'Falha na importação do arquivo.';
      }
    });
  }
}
