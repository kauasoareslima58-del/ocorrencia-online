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
  readonly statusLabel = statusLabel;
  readonly priorityLabel = priorityLabel;
  readonly formatDate = formatDate;
  readonly classLabel = classLabel;

  ngOnInit(): void {
    this.api.getMetadata().subscribe(({ classes }) => this.classes = classes);
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.api.getOccurrences(this.filters).subscribe({
      next: (items) => { this.occurrences = items; this.loading = false; },
      error: () => { this.error = 'Não foi possível carregar as ocorrências.'; this.loading = false; }
    });
  }

  clearFilters(): void {
    this.filters = { search: '', status: '', category: '', className: '', startDate: '', endDate: '', professor: '' };
    this.load();
  }

  statusClass(status: OccurrenceStatus): string { return `status-${status.toLowerCase()}`; }
}
