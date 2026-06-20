export type QuestionType =
  | 'worker_places'
  | 'date'
  | 'time'
  | 'choice'
  | 'text'
  | 'number';

export interface Question {
  order: number;
  key: string;
  type: QuestionType;
  text: string;
  options: string[];
  required: boolean;
}
