export type UserRole = 'school_admin' | 'teacher' | 'support';

export type ApiErrorShape = {
  code: string;
  message: string;
  messageKey?: string;
  details?: Record<string, unknown>;
  fieldErrors?: Record<string, string[]>;
};
