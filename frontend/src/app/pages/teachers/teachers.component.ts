import { HttpErrorResponse } from '@angular/common/http';
import { Component, HostListener, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { Teacher } from '../../core/models';
import { formatDate, isStrongPassword } from '../../core/view-helpers';

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
  search = '';
  statusFilter: 'all' | 'active' | 'inactive' = 'all';
  loading = true;
  saving = false;
  showForm = false;
  showPassword = false;
  error = '';
  success = '';
  teacherForm = { name: '', email: '', password: '' };

  // Edit teacher modal
  showEditModal = false;
  editSaving = false;
  editError = '';
  editTeacherForm = { id: 0, name: '', email: '' };

  // Reset password
  showResetModal = false;
  showResetPassword = false;
  selectedTeacher: Teacher | null = null;
  newPassword = '';
  resetSaving = false;
  resetError = '';

  readonly formatDate = formatDate;

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.showEditModal) this.closeEditModal();
    else if (this.showResetModal) this.closeResetModal();
  }

  get filteredTeachers(): Teacher[] {
    const q = this.search.trim().toLowerCase();
    return this.teachers.filter((t) => {
      const isActive = Boolean(t.active);
      if (this.statusFilter === 'active' && !isActive) return false;
      if (this.statusFilter === 'inactive' && isActive) return false;
      if (!q) return true;
      return t.name.toLowerCase().includes(q) || t.email.toLowerCase().includes(q);
    });
  }

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
    if (!isStrongPassword(this.teacherForm.password)) {
      this.error = 'A senha deve ter entre 8 e 72 caracteres, com maiúscula, minúscula, número e símbolo.';
      return;
    }
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

  openEditModal(teacher: Teacher): void {
    this.editTeacherForm = { id: teacher.id, name: teacher.name, email: teacher.email };
    this.editError = '';
    this.showEditModal = true;
  }

  closeEditModal(): void {
    this.showEditModal = false;
  }

  submitEditTeacher(): void {
    if (this.editSaving) return;
    this.editSaving = true;
    this.editError = '';
    this.api.updateTeacher(this.editTeacherForm.id, {
      name: this.editTeacherForm.name,
      email: this.editTeacherForm.email
    }).subscribe({
      next: (updated) => {
        this.editSaving = false;
        this.showEditModal = false;
        this.success = `Dados do professor ${updated.name} atualizados com sucesso.`;
        this.loadTeachers();
      },
      error: (err: HttpErrorResponse) => {
        this.editSaving = false;
        this.editError = typeof err.error?.message === 'string' ? err.error.message : 'Não foi possível atualizar os dados do professor.';
      }
    });
  }

  toggleStatus(teacher: Teacher): void {
    const active = !Boolean(teacher.active);
    const action = active ? 'ativar' : 'desativar';
    if (!confirm(`Deseja realmente ${action} o acesso do professor ${teacher.name}?`)) return;

    this.error = '';
    this.success = '';
    this.api.updateTeacherStatus(teacher.id, active).subscribe({
      next: (updated) => {
        teacher.active = updated.active;
        teacher.occurrenceCount = updated.occurrenceCount;
        this.success = active ? `Acesso de ${teacher.name} ativado.` : `Acesso de ${teacher.name} desativado.`;
      },
      error: () => { this.error = 'Não foi possível alterar o acesso do professor.'; }
    });
  }

  openResetModal(teacher: Teacher): void {
    this.selectedTeacher = teacher;
    this.newPassword = '';
    this.showResetPassword = false;
    this.resetError = '';
    this.showResetModal = true;
  }

  closeResetModal(): void {
    this.showResetModal = false;
    this.selectedTeacher = null;
  }

  submitResetPassword(): void {
    if (this.resetSaving || !this.selectedTeacher) return;
    if (!isStrongPassword(this.newPassword)) {
      this.resetError = 'A senha deve ter entre 8 e 72 caracteres, com maiúscula, minúscula, número e símbolo.';
      return;
    }

    this.resetSaving = true;
    this.resetError = '';

    this.api.resetTeacherPassword(this.selectedTeacher.id, this.newPassword).subscribe({
      next: (res) => {
        this.success = res.message;
        this.resetSaving = false;
        this.closeResetModal();
      },
      error: (err: HttpErrorResponse) => {
        this.resetSaving = false;
        this.resetError = typeof err.error?.message === 'string' ? err.error.message : 'Erro ao redefinir senha.';
      }
    });
  }
}
