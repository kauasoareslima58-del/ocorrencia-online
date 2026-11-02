import { Component, inject, OnInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { timeout, TimeoutError } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { NamedItem, Occurrence, OccurrenceStatus, Student } from '../../core/models';
import { formatDate, formatDateTime, priorityLabel, roleLabel, statusLabel } from '../../core/view-helpers';

@Component({
  selector: 'app-occurrence-detail',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './occurrence-detail.component.html',
  styleUrl: './occurrence-detail.component.scss'
})
export class OccurrenceDetailComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  readonly auth = inject(AuthService);
  occurrence: Occurrence | null = null;
  loading = true;
  saving = false;
  error = '';
  success = '';
  editMode = false;
  categories: NamedItem[] = [];
  locations: NamedItem[] = [];
  availableStudents: Student[] = [];
  editStudentSearch = '';
  editSelectedStudents: Student[] = [];
  editModel = { occurrenceDate: '', occurrenceTime: '', categoryId: 0, locationId: 0, priority: 'MEDIA', description: '' };
  updateModel: { newStatus: OccurrenceStatus; observation: string; actionTaken: string } = {
    newStatus: 'EM_ANALISE', observation: '', actionTaken: ''
  };
  readonly statusLabel = statusLabel;
  readonly priorityLabel = priorityLabel;
  readonly roleLabel = roleLabel;
  readonly formatDate = formatDate;
  readonly formatDateTime = formatDateTime;

  get canAddUpdate(): boolean {
    if (!this.occurrence) return false;
    if (this.auth.hasRole('ADMINISTRADOR')) return true;
    return this.auth.hasRole('PROFESSOR') && this.occurrence.createdBy === this.auth.currentUser?.id;
  }

  get canEditOccurrence(): boolean {
    if (!this.occurrence) return false;
    if (this.auth.hasRole('ADMINISTRADOR')) return true;
    return this.auth.hasRole('PROFESSOR') && this.occurrence.createdBy === this.auth.currentUser?.id && this.occurrence.status === 'PENDENTE';
  }

  ngOnInit(): void { this.load(); }

  load(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.loading = true;
    this.error = '';
    if (!Number.isInteger(id) || id <= 0) {
      this.error = 'O endereço desta ocorrência é inválido.';
      this.loading = false;
      return;
    }

    this.api.getOccurrence(id).pipe(timeout(10000)).subscribe({
      next: (item) => {
        this.occurrence = item;
        this.updateModel.newStatus = item.status;
        this.editSelectedStudents = [...item.students];
        this.editModel = {
          occurrenceDate: item.occurrenceDate.slice(0, 10), occurrenceTime: item.occurrenceTime.slice(0, 5),
          categoryId: item.categoryId ?? 0, locationId: item.locationId ?? 0,
          priority: item.priority, description: item.description
        };
        if ((this.auth.hasRole('ADMINISTRADOR') || this.auth.hasRole('PROFESSOR')) && !this.categories.length) {
          this.api.getMetadata().subscribe(({ categories, locations }) => { this.categories = categories; this.locations = locations; });
        }
        this.loading = false;
      },
      error: (response: HttpErrorResponse | TimeoutError) => {
        if (response instanceof TimeoutError) {
          this.error = 'A API demorou para responder. Confira se o backend e o MySQL estão ligados e tente novamente.';
        } else if (response.status === 403) {
          this.error = 'Seu perfil não possui permissão para visualizar esta ocorrência.';
        } else if (response.status === 404) {
          this.error = 'A ocorrência não foi encontrada.';
        } else {
          this.error = response.error?.message || 'Não foi possível carregar os detalhes da ocorrência.';
        }
        this.loading = false;
      }
    });
  }

  startEdit(): void {
    if (!this.occurrence) return;
    this.editMode = true;
    this.editSelectedStudents = [...this.occurrence.students];
    this.editStudentSearch = '';
    this.searchEditStudents();
  }

  searchEditStudents(): void {
    this.api.getStudents(this.editStudentSearch).subscribe({
      next: (students) => { this.availableStudents = students; }
    });
  }

  isEditStudentSelected(id: number): boolean {
    return this.editSelectedStudents.some((s) => s.id === id);
  }

  toggleEditStudent(student: Student, checked: boolean): void {
    if (checked) {
      if (!this.isEditStudentSelected(student.id)) {
        this.editSelectedStudents = [...this.editSelectedStudents, student];
      }
    } else {
      this.removeEditStudent(student.id);
    }
  }

  removeEditStudent(id: number): void {
    this.editSelectedStudents = this.editSelectedStudents.filter((s) => s.id !== id);
  }

  saveDetails(): void {
    if (!this.occurrence || this.saving) return;
    if (!this.editSelectedStudents.length) {
      this.error = 'A ocorrência deve ter pelo menos um aluno envolvido.';
      return;
    }
    this.saving = true;
    this.error = '';
    this.success = '';
    const payload = {
      ...this.editModel,
      studentIds: this.editSelectedStudents.map((s) => s.id)
    };
    this.api.updateOccurrence(this.occurrence.id, payload).subscribe({
      next: (item) => {
        this.occurrence = item;
        this.editSelectedStudents = [...item.students];
        this.editMode = false;
        this.saving = false;
        this.success = 'Dados da ocorrência atualizados.';
      },
      error: (err: HttpErrorResponse) => {
        this.error = typeof err.error?.message === 'string' ? err.error.message : 'Não foi possível atualizar os dados.';
        this.saving = false;
      }
    });
  }

  addUpdate(): void {
    if (!this.occurrence || this.saving) return;
    if (!this.updateModel.observation.trim() && !this.updateModel.actionTaken.trim() && this.updateModel.newStatus === this.occurrence.status) {
      this.error = 'Informe uma observação, uma providência ou altere o status.';
      return;
    }
    this.saving = true;
    this.error = '';
    this.success = '';
    this.api.addOccurrenceUpdate(this.occurrence.id, this.updateModel).subscribe({
      next: () => {
        this.success = 'Atualização registrada com sucesso.';
        this.updateModel.observation = '';
        this.updateModel.actionTaken = '';
        this.saving = false;
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        this.error = typeof err.error?.message === 'string' ? err.error.message : 'Não foi possível salvar a atualização.';
        this.saving = false;
      }
    });
  }

  getWhatsAppLink(student: Student): string | null {
    if (!this.occurrence || !student.guardianPhone) return null;
    const digits = student.guardianPhone.replace(/\D/g, '');
    if (digits.length < 10) return null;
    const phone = digits.startsWith('55') ? digits : `55${digits}`;
    const greeting = student.guardianName ? `Olá, ${student.guardianName}.` : 'Olá, responsável.';
    const dateStr = this.formatDate(this.occurrence.occurrenceDate);
    const timeStr = this.occurrence.occurrenceTime.slice(0, 5);
    const message = [
      `${greeting} Aqui é da coordenação da *E.E. Monsenhor Bicudo*.`,
      `Entramos em contato para informar o registro da ocorrência escolar protocolo *${this.occurrence.protocol}* referente ao(à) aluno(a) *${student.name}* (${student.className}).`,
      `• *Data/Horário:* ${dateStr} às ${timeStr}`,
      `• *Categoria:* ${this.occurrence.categoryName}`,
      `• *Status:* ${this.statusLabel(this.occurrence.status)}`,
      `Solicitamos sua atenção para acompanhamento junto à escola.`
    ].join('\n');
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  }

  printOfficialSheet(): void {
    window.print();
  }

  statusClass(status: OccurrenceStatus): string { return `status-${status.toLowerCase()}`; }
}
