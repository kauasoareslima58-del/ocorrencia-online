import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Occurrence, Student } from '../../core/models';
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
  loading = true;
  historyLoading = false;
  showForm = false;
  saving = false;
  formError = '';
  success = '';
  studentForm = {
    name: '', registration: '', gradeLevel: '6º Ano', section: 'A', guardianName: '', guardianPhone: ''
  };
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
    this.api.getStudents(this.search, this.selectedClass).subscribe({
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
        this.loadClasses();
        this.loadStudents();
      },
      error: (error: HttpErrorResponse) => {
        this.formError = typeof error.error?.message === 'string' ? error.error.message : 'Não foi possível cadastrar o aluno.';
        this.saving = false;
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
}
