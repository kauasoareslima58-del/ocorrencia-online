import { Component, inject, OnInit } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { AuditLog } from '../../core/models';
import { formatDateTime, roleLabel } from '../../core/view-helpers';

@Component({
  selector: 'app-audit',
  standalone: true,
  templateUrl: './audit.component.html',
  styleUrl: './audit.component.scss'
})
export class AuditComponent implements OnInit {
  private readonly api = inject(ApiService);
  logs: AuditLog[] = [];
  loading = true;
  readonly formatDateTime = formatDateTime;
  readonly roleLabel = roleLabel;
  ngOnInit(): void {
    this.api.getAuditLogs().subscribe({ next: (logs) => { this.logs = logs; this.loading = false; }, error: () => this.loading = false });
  }

  actionLabel(action: string, entity: string): string {
    if (action === 'CREATE' && entity === 'STUDENT') return 'Aluno cadastrado';
    if (action === 'CREATE' && entity === 'TEACHER') return 'Professor cadastrado';
    if (action === 'UPDATE' && entity === 'TEACHER') return 'Acesso atualizado';
    return ({ LOGIN: 'Login realizado', CREATE: 'Ocorrência criada', UPDATE: 'Ocorrência atualizada' } as Record<string, string>)[action] ?? action;
  }
}
