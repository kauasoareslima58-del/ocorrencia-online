import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { DashboardStats, OccurrenceStatus } from '../../core/models';
import { formatDate, priorityLabel, statusLabel } from '../../core/view-helpers';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly auth = inject(AuthService);
  stats: DashboardStats | null = null;
  loading = true;
  error = '';
  readonly statusLabel = statusLabel;
  readonly priorityLabel = priorityLabel;
  readonly formatDate = formatDate;

  ngOnInit(): void {
    this.api.getDashboard().subscribe({
      next: (data) => { this.stats = data; this.loading = false; },
      error: () => { this.error = 'Não foi possível carregar os indicadores.'; this.loading = false; }
    });
  }

  statusClass(status: OccurrenceStatus): string {
    return `status-${status.toLowerCase()}`;
  }
}

