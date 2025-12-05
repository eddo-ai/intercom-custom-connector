/**
 * Type definitions for Luma CSV data and Intercom events
 */

export interface LumaAttendee {
  email: string;
  name?: string;
  phone_number?: string;
  registrationDate?: string;
  attendanceDate?: string;
  ticketType?: string;
  status?: string;
  hasJoinedEvent?: boolean;
  [key: string]: string | boolean | undefined; // Allow other CSV columns
}

export interface ProcessedAttendee extends LumaAttendee {
  hasRegistration: boolean;
  hasAttendance: boolean;
}

export interface IntercomEvent {
  event_name: string;
  created_at: number;
  email: string;
  name?: string;
  phone_number?: string;
  metadata?: {
    event_name?: string;
    event_date?: string;
    ticket_type?: string;
    presenter?: string;
    [key: string]: string | undefined;
  };
}

export interface ProcessingResult {
  success: boolean;
  email: string;
  eventType: 'registered-for-event' | 'attended-event';
  error?: string;
}

export interface UploadResponse {
  success: boolean;
  totalProcessed: number;
  successful: number;
  failed: number;
  results: ProcessingResult[];
  errors?: string[];
}

export interface ColumnMapping {
  email: string;
  name?: string;
  phone_number?: string;
  registrationDate?: string;
  attendanceDate?: string;
  ticketType?: string;
  status?: string;
  hasJoinedEvent?: string;
  approval_status?: string;
}

export interface CSVPreview {
  columns: string[];
  sampleRow: Record<string, string>;
  totalRows: number;
}

export interface PreviewResponse {
  success: boolean;
  preview: CSVPreview;
  suggestedMapping?: ColumnMapping;
  extractedEventSettings?: EventSettings;
  error?: string;
}

export interface EventSettings {
  eventName?: string;
  eventDate?: string;
  eventTime?: string;
  presenter?: string;
}

