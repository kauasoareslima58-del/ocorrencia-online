import { HttpErrorResponse } from '@angular/common/http';
import { Component, HostListener, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { BatchImportResponse, Occurrence, Student } from '../../core/models';
import { classLabel, formatDate, priorityLabel, statusLabel } from '../../core/view-helpers';

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
  error = '';
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
  updateExistingOnImport = false;
  importError = '';
  importErrors: string[] = [];
  importDuplicates: string[] = [];
  importSuccess = '';
  csvData: Array<{ name: string; registration: string; className: string; guardianName?: string; guardianPhone?: string }> = [];

  readonly formatDate = formatDate;
  readonly statusLabel = statusLabel;
  readonly priorityLabel = priorityLabel;
  readonly classLabel = classLabel;

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.showEditModal) this.closeEdit();
    else if (this.showImportModal) this.closeImportModal();
  }

  ngOnInit(): void {
    this.loadClasses();
    this.loadStudents();
  }

  loadClasses(): void {
    this.api.getMetadata().subscribe(({ classes }) => { this.classes = classes; });
  }

  loadStudents(): void {
    this.loading = true;
    this.error = '';
    const canSeeInactive = this.auth.hasRole('ADMINISTRADOR') && this.includeInactive;
    this.api.getStudents(this.search, this.selectedClass, canSeeInactive).subscribe({
      next: (items) => { this.students = items; this.loading = false; },
      error: () => {
        this.error = 'Não foi possível carregar a lista de alunos.';
        this.loading = false;
      }
    });
  }

  submitStudent(): void {
    if (this.saving) return;
    const section = this.studentForm.section.trim().toUpperCase();
    if (!this.sections.includes(section)) {
      this.formError = 'Selecione uma turma entre A e D.';
      return;
    }
    this.saving = true;
    this.formError = '';
    this.error = '';
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
    const isCurrentlyActive = student.active === true || student.active === 1;
    const newStatus = !isCurrentlyActive;
    const actionLabel = newStatus ? 'reativar' : 'inativar';
    if (!confirm(`Deseja realmente ${actionLabel} o cadastro de ${student.name}?`)) return;

    this.error = '';
    this.success = '';
    this.api.updateStudentStatus(student.id, newStatus).subscribe({
      next: () => {
        student.active = newStatus;
        this.success = `Aluno ${student.name} ${newStatus ? 'reativado' : 'inativado'} com sucesso.`;
        this.loadStudents();
      },
      error: (err: HttpErrorResponse) => {
        this.error = typeof err.error?.message === 'string'
          ? err.error.message
          : 'Não foi possível alterar o status do aluno.';
      }
    });
  }

  openHistory(student: Student): void {
    this.selectedStudent = student;
    this.historyLoading = true;
    this.api.getStudentHistory(student.id).subscribe({
      next: (data) => {
        this.selectedStudent = data.student;
        this.history = data.occurrences;
        this.historyLoading = false;
      },
      error: () => {
        this.history = [];
        this.historyLoading = false;
      }
    });
  }

  printStudentHistory(): void {
    if (!this.selectedStudent) return;
    window.print();
  }

  // Import CSV methods
  openImportModal(): void {
    this.showImportModal = true;
    this.updateExistingOnImport = false;
    this.importError = '';
    this.importErrors = [];
    this.importDuplicates = [];
    this.importSuccess = '';
    this.csvData = [];
  }

  closeImportModal(): void {
    this.showImportModal = false;
  }

  downloadCsvTemplate(): void {
    const content = [
      'Matrícula;Nome;Turma;Nome do Responsável;Telefone',
      '"20260050";"Bruno Silveira";"1ª Série B";"Marcos Silveira";"(14) 99888-1122"',
      '"20260051";"Carla Mendes";"6º Ano A";"Patrícia Mendes";"(14) 99777-3344"'
    ].join('\r\n');
    const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'modelo-importacao-alunos.csv';
    link.click();
    URL.revokeObjectURL(url);
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

  parseCsv(rawText: string): void {
    this.importError = '';
    this.importErrors = [];
    this.importDuplicates = [];
    this.importSuccess = '';

    const cleanText = rawText.replace(/^\uFEFF/, '');
    const lines = cleanText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    if (!lines.length) {
      this.importError = 'Arquivo CSV vazio.';
      this.csvData = [];
      return;
    }

    const firstLine = lines[0].toLowerCase();
    const startIndex = (firstLine.includes('nome') || firstLine.includes('matr') || firstLine.includes('turma')) ? 1 : 0;

    const parsed: Array<{ name: string; registration: string; className: string; guardianName?: string; guardianPhone?: string }> = [];

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      const delimiter = line.includes(';') ? ';' : ',';
      const cols = this.splitCsvLine(line, delimiter);
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
      this.csvData = [];
      return;
    }

    this.csvData = parsed;
  }

  private splitCsvLine(line: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  submitBatchImport(): void {
    if (this.importing || !this.csvData.length) return;
    this.importing = true;
    this.importError = '';
    this.importErrors = [];
    this.importDuplicates = [];
    this.importSuccess = '';

    this.api.batchCreateStudents(this.csvData, this.updateExistingOnImport).subscribe({
      next: (res: BatchImportResponse) => {
        this.importing = false;
        this.importSuccess = res.message;
        this.importErrors = res.errors ?? [];
        this.importDuplicates = res.duplicates ?? [];
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
