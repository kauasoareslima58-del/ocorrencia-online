import { Component, inject, OnInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { timeout, TimeoutError } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { NamedItem, Occurrence, OccurrenceStatus } from '../../core/models';
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
  editModel = { occurrenceDate: '', occurrenceTime: '', categoryId: 0, locationId: 0, priority: 'MEDIA', description: '' };
  updateModel: { newStatus: OccurrenceStatus; observation: string; actionTaken: string } = {
    newStatus: 'EM_ANALISE', observation: '', actionTaken: ''
  };
  readonly statusLabel = statusLabel;
  readonly priorityLabel = priorityLabel;
  readonly roleLabel = roleLabel;
  readonly formatDate = formatDate;
  readonly formatDateTime = formatDateTime;

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
        this.editModel = {
          occurrenceDate: item.occurrenceDate.slice(0, 10), occurrenceTime: item.occurrenceTime.slice(0, 5),
          categoryId: item.categoryId ?? 0, locationId: item.locationId ?? 0,
          priority: item.priority, description: item.description
        };
        if (this.auth.hasRole('ADMINISTRADOR') && !this.categories.length) {
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

  saveDetails(): void {
    if (!this.occurrence || this.saving) return;
    this.saving = true;
    this.error = '';
    this.success = '';
    this.api.updateOccurrence(this.occurrence.id, this.editModel).subscribe({
      next: (item) => {
        this.occurrence = item;
        this.editMode = false;
        this.saving = false;
        this.success = 'Dados da ocorrência atualizados.';
      },
      error: () => { this.error = 'Não foi possível atualizar os dados.'; this.saving = false; }
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
      error: () => { this.error = 'Não foi possível salvar a atualização.'; this.saving = false; }
    });
  }

  statusClass(status: OccurrenceStatus): string { return `status-${status.toLowerCase()}`; }
}
