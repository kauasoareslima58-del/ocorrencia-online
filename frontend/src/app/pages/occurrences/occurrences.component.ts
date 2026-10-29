import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Occurrence, OccurrenceStatus } from '../../core/models';
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
  readonly auth = inject(AuthService);
  occurrences: Occurrence[] = [];
  classes: string[] = [];
  loading = true;
  error = '';
  filters = { search: '', status: '', category: '', className: '', startDate: '', endDate: '', professor: '' };

  // Pagination
  page = 1;
  limit = 15;
  total = 0;
  totalPages = 1;

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
    this.api.getMetadata().subscribe(({ classes }) => this.classes = classes);
    this.load();
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

  statusClass(status: OccurrenceStatus): string { return `status-${status.toLowerCase()}`; }
}
