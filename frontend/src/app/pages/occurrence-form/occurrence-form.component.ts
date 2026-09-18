import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { NamedItem, Occurrence, Student } from '../../core/models';
import { classLabel } from '../../core/view-helpers';

@Component({
  selector: 'app-occurrence-form',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './occurrence-form.component.html',
  styleUrl: './occurrence-form.component.scss'
})
export class OccurrenceFormComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  readonly auth = inject(AuthService);
  students: Student[] = [];
  categories: NamedItem[] = [];
  locations: NamedItem[] = [];
  classes: string[] = [];
  studentSearch = '';
  classFilter = '';
  selectedStudentIds: number[] = [];
  loading = true;
  saving = false;
  error = '';
  readonly classLabel = classLabel;
  formModel = {
    occurrenceDate: new Date().toISOString().slice(0, 10),
    occurrenceTime: new Date().toTimeString().slice(0, 5),
    categoryId: 0,
    locationId: 0,
    priority: 'MEDIA',
    description: ''
  };

  ngOnInit(): void {
    this.api.getMetadata().subscribe({
      next: ({ categories, locations, classes }) => {
        this.categories = categories;
        this.locations = locations;
        this.classes = classes;
        this.formModel.categoryId = categories[0]?.id ?? 0;
        this.formModel.locationId = locations[0]?.id ?? 0;
        this.loading = false;
      },
      error: () => { this.error = 'Não foi possível carregar categorias e locais.'; this.loading = false; }
    });
    this.loadStudents();
  }

  loadStudents(): void {
    this.api.getStudents(this.studentSearch, this.classFilter).subscribe({ next: (items) => this.students = items });
  }

  toggleStudent(id: number, checked: boolean): void {
    this.selectedStudentIds = checked
      ? [...new Set([...this.selectedStudentIds, id])]
      : this.selectedStudentIds.filter((studentId) => studentId !== id);
  }

  isSelected(id: number): boolean { return this.selectedStudentIds.includes(id); }

  submit(): void {
    if (this.saving || !this.selectedStudentIds.length) {
      this.error = 'Selecione pelo menos um aluno envolvido.';
      return;
    }
    this.saving = true;
    this.error = '';
    this.api.createOccurrence({ ...this.formModel, studentIds: this.selectedStudentIds }).subscribe({
      next: (occurrence: Occurrence) => void this.router.navigate(['/ocorrencias', occurrence.id]),
      error: (error: HttpErrorResponse) => {
        this.saving = false;
        this.error = typeof error.error?.message === 'string' ? error.error.message : 'Não foi possível registrar a ocorrência.';
      }
    });
  }
}
