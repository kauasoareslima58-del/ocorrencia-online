import { Component, inject, OnInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { NamedItem, Occurrence, OccurrenceStatus } from '../../core/models';
import { classLabel, formatDate, priorityLabel, statusLabel } from '../../core/view-helpers';

@Component({
  selector: 'app-occurrences',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './occurrences.component.html',
  styleUrl: './occurrences.component.scss'
})
export class OccurrencesComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  readonly auth = inject(AuthService);
  occurrences: Occurrence[] = [];
  categories: NamedItem[] = [];
  classes: string[] = [];
  loading = true;
  exporting = false;
  error = '';
  filters = { search: '', status: '', category: '', className: '', startDate: '', endDate: '', professor: '' };

  // Pagination
  page = 1;
  limit = 15;
  total = 0;
  totalPages = 1;

  // Metadata management modal (Admin)
  showMetadataModal = false;
  allCategories: NamedItem[] = [];
  allLocations: NamedItem[] = [];
  newCategoryName = '';
  newLocationName = '';
  metaSaving = false;
  metaError = '';
  metaSuccess = '';

  readonly statusLabel = statusLabel;
  readonly priorityLabel = priorityLabel;
  readonly formatDate = formatDate;
  readonly classLabel = classLabel;

  get pages(): number[] {
    const pages: number[] = [];
    const start = Math.max(1, this.page - 2);
    const end = Math.min(this.totalPages, this.page + 2);
    for (let p = start; p <= end; p++) {
      pages.push(p);
    }
    return pages;
  }

  ngOnInit(): void {
    const qp = this.route.snapshot.queryParamMap;
    if (qp.get('status')) this.filters.status = qp.get('status') ?? '';
    if (qp.get('category')) this.filters.category = qp.get('category') ?? '';
    if (qp.get('className')) this.filters.className = qp.get('className') ?? '';
    this.loadMetadata();
    this.load();
  }

  loadMetadata(): void {
    const isAdmin = this.auth.hasRole('ADMINISTRADOR');
    this.api.getMetadata(isAdmin).subscribe(({ categories, classes, allCategories, allLocations }) => {
      this.categories = categories;
      this.classes = classes;
      if (allCategories) this.allCategories = allCategories;
      if (allLocations) this.allLocations = allLocations;
    });
  }

  openMetadataModal(): void {
    this.showMetadataModal = true;
    this.metaError = '';
    this.metaSuccess = '';
    this.newCategoryName = '';
    this.newLocationName = '';
    this.loadMetadata();
  }

  closeMetadataModal(): void {
    this.showMetadataModal = false;
  }

  addCategory(): void {
    const name = this.newCategoryName.trim();
    if (!name || this.metaSaving) return;
    this.metaSaving = true;
    this.metaError = '';
    this.metaSuccess = '';
    this.api.createCategory(name).subscribe({
      next: () => {
        this.newCategoryName = '';
        this.metaSaving = false;
        this.metaSuccess = `Categoria "${name}" salva com sucesso.`;
        this.loadMetadata();
      },
      error: (err: HttpErrorResponse) => {
        this.metaSaving = false;
        this.metaError = typeof err.error?.message === 'string' ? err.error.message : 'Erro ao salvar categoria.';
      }
    });
  }

  toggleCategory(item: NamedItem): void {
    const active = !(item.active === true || item.active === 1);
    this.api.updateCategoryStatus(item.id, active).subscribe({
      next: () => this.loadMetadata(),
      error: () => { this.metaError = 'Não foi possível alterar a categoria.'; }
    });
  }

  addLocation(): void {
    const name = this.newLocationName.trim();
    if (!name || this.metaSaving) return;
    this.metaSaving = true;
    this.metaError = '';
    this.metaSuccess = '';
    this.api.createLocation(name).subscribe({
      next: () => {
        this.newLocationName = '';
        this.metaSaving = false;
        this.metaSuccess = `Local "${name}" salvo com sucesso.`;
        this.loadMetadata();
      },
      error: (err: HttpErrorResponse) => {
        this.metaSaving = false;
        this.metaError = typeof err.error?.message === 'string' ? err.error.message : 'Erro ao salvar local.';
      }
    });
  }

  toggleLocation(item: NamedItem): void {
    const active = !(item.active === true || item.active === 1);
    this.api.updateLocationStatus(item.id, active).subscribe({
      next: () => this.loadMetadata(),
      error: () => { this.metaError = 'Não foi possível alterar o local.'; }
    });
  }

  load(pageReset = false): void {
    if (pageReset) this.page = 1;
    this.loading = true;
    this.error = '';

    const queryParams: Record<string, string | number> = {
      ...this.filters,
      page: this.page,
      limit: this.limit
    };

    this.api.getOccurrences(queryParams).subscribe({
      next: (res) => {
        this.occurrences = res.items || [];
        this.total = res.total || 0;
        this.page = res.page || 1;
        this.totalPages = res.totalPages || 1;
        this.loading = false;
      },
      error: () => {
        this.error = 'Não foi possível carregar as ocorrências.';
        this.loading = false;
      }
    });
  }

  clearFilters(): void {
    this.filters = { search: '', status: '', category: '', className: '', startDate: '', endDate: '', professor: '' };
    this.load(true);
  }

  goToPage(newPage: number): void {
    if (newPage < 1 || newPage > this.totalPages || newPage === this.page) return;
    this.page = newPage;
    this.load();
  }

  exportCsv(): void {
    if (this.exporting || !this.occurrences.length) return;
    this.exporting = true;
    const queryParams: Record<string, string | number> = {
      ...this.filters,
      page: 1,
      limit: 100
    };
    this.api.getOccurrences(queryParams).subscribe({
      next: (res) => {
        this.exporting = false;
        const rows = res.items || [];
        const headers = ['Protocolo', 'Data', 'Horário', 'Categoria', 'Local', 'Prioridade', 'Status', 'Alunos', 'Turmas', 'Registrado por', 'Descrição'];
        const csvLines = [
          headers.join(';'),
          ...rows.map((item) => {
            const studentsNames = item.students.map((s) => s.name).join(', ');
            const studentsClasses = [...new Set(item.students.map((s) => s.className))].join(', ');
            return [
              item.protocol,
              this.formatDate(item.occurrenceDate),
              item.occurrenceTime.slice(0, 5),
              item.categoryName,
              item.locationName,
              this.priorityLabel(item.priority),
              this.statusLabel(item.status),
              studentsNames,
              studentsClasses,
              item.professorName,
              item.description.replace(/\r?\n/g, ' ')
            ].map((val) => `"${String(val ?? '').replace(/"/g, '""')}"`).join(';');
          })
        ];
        const blob = new Blob(['\uFEFF' + csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `ocorrencias-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
      },
      error: () => {
        this.exporting = false;
      }
    });
  }

  statusClass(status: OccurrenceStatus): string { return `status-${status.toLowerCase()}`; }
}
