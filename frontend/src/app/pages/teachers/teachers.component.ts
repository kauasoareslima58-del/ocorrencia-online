import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { Teacher } from '../../core/models';
import { formatDate } from '../../core/view-helpers';

@Component({
  selector: 'app-teachers',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './teachers.component.html',
  styleUrl: './teachers.component.scss'
})
export class TeachersComponent implements OnInit {
  private readonly api = inject(ApiService);
  teachers: Teacher[] = [];
  loading = true;
  saving = false;
  showForm = false;
  showPassword = false;
  error = '';
  success = '';
  teacherForm = { name: '', email: '', password: '' };
  readonly formatDate = formatDate;

  ngOnInit(): void { this.loadTeachers(); }

  loadTeachers(): void {
    this.loading = true;
    this.api.getTeachers().subscribe({
      next: (teachers) => { this.teachers = teachers; this.loading = false; },
      error: () => { this.error = 'Não foi possível carregar os professores.'; this.loading = false; }
    });
  }

  createTeacher(): void {
    if (this.saving) return;
    this.saving = true;
    this.error = '';
    this.success = '';
    this.api.createTeacher(this.teacherForm).subscribe({
      next: (teacher) => {
        this.success = `Login de ${teacher.name} criado com sucesso.`;
        this.teacherForm = { name: '', email: '', password: '' };
        this.showPassword = false;
        this.showForm = false;
        this.saving = false;
        this.loadTeachers();
      },
      error: (error: HttpErrorResponse) => {
        this.error = typeof error.error?.message === 'string' ? error.error.message : 'Não foi possível criar o login.';
        this.saving = false;
      }
    });
  }

  toggleStatus(teacher: Teacher): void {
    const active = !Boolean(teacher.active);
    this.error = '';
    this.api.updateTeacherStatus(teacher.id, active).subscribe({
      next: () => {
        teacher.active = active;
        this.success = active ? `Acesso de ${teacher.name} ativado.` : `Acesso de ${teacher.name} desativado.`;
      },
      error: () => this.error = 'Não foi possível alterar o acesso do professor.'
    });
  }
}

