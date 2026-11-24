import { Component, HostListener, inject, OnDestroy, OnInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { NamedItem, Occurrence, OccurrenceStatus, Priority } from '../../core/models';
import { classLabel, formatDate, formatDateTime, priorityLabel, statusLabel } from '../../core/view-helpers';

@Component({
  selector: 'app-occurrences',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './occurrences.component.html',
  styleUrl: './occurrences.component.scss'
})
export class OccurrencesComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  readonly auth = inject(AuthService);

  occurrences: Occurrence[] = [];
  printItems: Occurrence[] = [];
  printGeneratedAt = '';
  categories: NamedItem[] = [];
  classes: string[] = [];
  loading = true;
  exporting = false;
  printing = false;
  error = '';
  filters = {
    search: '',
    status: '',
    priority: '',
    category: '',
    className: '',
    startDate: '',
    endDate: '',
    professor: ''
  };

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

  private querySub: Subscription | null = null;

  readonly statusLabel = statusLabel;
  readonly priorityLabel = priorityLabel;
  readonly formatDate = formatDate;
  readonly formatDateTime = formatDateTime;
  readonly classLabel = classLabel;

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.showMetadataModal) {
      this.closeMetadataModal();
    }
  }

  get pages(): number[] {
    const pages: number[] = [];
    const start = Math.max(1, this.page - 2);
    const end = Math.min(this.totalPages, this.page + 2);
    for (let p = start; p <= end; p++) {
      pages.push(p);
    }
    return pages;
  }

  get activeFilterSummary(): string {
    const parts: string[] = [];
    if (this.filters.search) parts.push(`Busca: "${this.filters.search}"`);
    if (this.filters.status) parts.push(`Status: ${this.statusLabel(this.filters.status as OccurrenceStatus)}`);
    if (this.filters.priority) parts.push(`Prioridade: ${this.priorityLabel(this.filters.priority as Priority)}`);
    if (this.filters.category) parts.push(`Categoria: ${this.filters.category}`);
    if (this.filters.className) parts.push(`Turma: ${this.filters.className}`);
    if (this.filters.professor) parts.push(`Professor: ${this.filters.professor}`);
    if (this.filters.startDate) parts.push(`De: ${this.formatDate(this.filters.startDate)}`);
    if (this.filters.endDate) parts.push(`Até: ${this.formatDate(this.filters.endDate)}`);
    return parts.length ? parts.join(' · ') : 'Todos os registros autorizados';
  }

  ngOnInit(): void {
    this.loadMetadata();
    this.querySub = this.route.queryParamMap.subscribe((qp) => {
      this.filters = {
        search: qp.get('search') ?? '',
        status: qp.get('status') ?? '',
        priority: qp.get('priority') ?? '',
        category: qp.get('category') ?? '',
        className: qp.get('className') ?? '',
        startDate: qp.get('startDate') ?? '',
        endDate: qp.get('endDate') ?? '',
        professor: qp.get('professor') ?? ''
      };
      this.load(true);
    });
  }

  ngOnDestroy(): void {
    this.querySub?.unsubscribe();
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
    this.filters = { search: '', status: '', priority: '', category: '', className: '', startDate: '', endDate: '', professor: '' };
    this.load(true);
  }

  goToPage(newPage: number): void {
    if (newPage < 1 || newPage > this.totalPages || newPage === this.page) return;
    this.page = newPage;
    this.load();
  }

  printReport(): void {
    if (this.printing || !this.occurrences.length) return;
    this.printing = true;
    this.api.getOccurrences({ ...this.filters, page: 1, limit: 500 }).subscribe({
      next: (res) => {
        this.printItems = res.items || [];
        this.printGeneratedAt = new Date().toISOString();
        this.printing = false;
        setTimeout(() => window.print(), 60);
      },
      error: () => {
        this.printing = false;
        this.error = 'Não foi possível preparar o relatório para impressão.';
      }
    });
  }

  exportCsv(): void {
    if (this.exporting || !this.occurrences.length) return;
    this.exporting = true;
    const queryParams: Record<string, string | number> = {
      ...this.filters,
      page: 1,
      limit: 500
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
            ].map((val) => this.csvCell(val)).join(';');
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
        this.error = 'Não foi possível exportar o arquivo CSV.';
      }
    });
  }

  private csvCell(raw: unknown): string {
    let text = String(raw ?? '');
    if (/^[=+\-@\t\r]/.test(text)) {
      text = `'${text}`;
    }
    return `"${text.replace(/"/g, '""')}"`;
  }

  studentNamesList(item: Occurrence): string {
    return item.students.map((s) => `${s.name} (${s.className})`).join(', ') || '—';
  }

  statusClass(status: OccurrenceStatus): string { return `status-${status.toLowerCase()}`; }
}
