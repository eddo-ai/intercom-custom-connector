/**
 * API route to handle CSV file upload, parsing, and publishing events to Intercom
 */

import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import type {
  LumaAttendee,
  ProcessedAttendee,
  IntercomEvent,
  ProcessingResult,
  ColumnMapping,
  EventSettings,
} from "@/lib/types";
import { publishEventsWithProgress } from "@/lib/intercom";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes for processing large files

/**
 * Normalize CSV column names to handle variations
 */
function normalizeColumnName(column: string): string {
  return column.toLowerCase().trim().replace(/\s+/g, "");
}

/**
 * Extract attendee data from CSV row using column mapping
 */
function parseAttendee(
  row: Record<string, string>,
  mapping: ColumnMapping
): LumaAttendee | null {
  // Get email using mapping (required)
  const email = mapping.email ? (row[mapping.email] || "").trim() : "";

  if (!email || !email.includes("@")) {
    return null; // Invalid email
  }

  // Parse hasJoinedEvent as boolean
  let hasJoinedEvent: boolean | undefined;
  if (mapping.hasJoinedEvent) {
    const value = (row[mapping.hasJoinedEvent] || "").trim().toLowerCase();
    hasJoinedEvent =
      value === "true" ||
      value === "1" ||
      value === "yes" ||
      value === "y" ||
      value === "joined";
  }

  return {
    email,
    name: mapping.name ? (row[mapping.name] || "").trim() : "",
    phone_number: mapping.phone_number
      ? (row[mapping.phone_number] || "").trim()
      : "",
    registrationDate: mapping.registrationDate
      ? (row[mapping.registrationDate] || "").trim()
      : "",
    attendanceDate: mapping.attendanceDate
      ? (row[mapping.attendanceDate] || "").trim()
      : "",
    ticketType: mapping.ticketType
      ? (row[mapping.ticketType] || "").trim()
      : "",
    status: mapping.status ? (row[mapping.status] || "").trim() : "",
    hasJoinedEvent,
  };
}

/**
 * Process attendees to determine which events to publish
 */
function processAttendees(
  attendees: LumaAttendee[]
): ProcessedAttendee[] {
  return attendees.map((attendee) => {
    const hasRegistration = !!(
      attendee.registrationDate ||
      attendee.status?.toLowerCase().includes("registered") ||
      attendee.status?.toLowerCase().includes("registration")
    );

    const hasAttendance = !!(
      attendee.hasJoinedEvent === true ||
      attendee.attendanceDate ||
      attendee.status?.toLowerCase().includes("attended") ||
      attendee.status?.toLowerCase().includes("checked") ||
      attendee.status?.toLowerCase().includes("present")
    );

    return {
      ...attendee,
      hasRegistration,
      hasAttendance,
    };
  });
}

/**
 * Convert processed attendees to Intercom events
 */
function createIntercomEvents(
  attendees: ProcessedAttendee[],
  eventSettings?: EventSettings
): IntercomEvent[] {
  const events: IntercomEvent[] = [];

  for (const attendee of attendees) {
    const now = Math.floor(Date.now() / 1000);

    // Parse dates if available
    let registrationTimestamp = now;
    let attendanceTimestamp = now;

    if (attendee.registrationDate) {
      const parsedDate = new Date(attendee.registrationDate);
      if (!isNaN(parsedDate.getTime())) {
        registrationTimestamp = Math.floor(parsedDate.getTime() / 1000);
      }
    }

    if (attendee.attendanceDate) {
      const parsedDate = new Date(attendee.attendanceDate);
      if (!isNaN(parsedDate.getTime())) {
        attendanceTimestamp = Math.floor(parsedDate.getTime() / 1000);
      }
    }

    // Get event name and date from event settings (event-level only)
    const eventName = eventSettings?.eventName || undefined;
    
    // Combine event date and time if both provided
    let eventDate = eventSettings?.eventDate || undefined;
    if (eventSettings?.eventDate && eventSettings?.eventTime) {
      eventDate = `${eventSettings.eventDate} ${eventSettings.eventTime}`;
    } else if (eventSettings?.eventDate) {
      eventDate = eventSettings.eventDate;
    }

    // Get presenter from event settings
    const presenter = eventSettings?.presenter || undefined;

    // Create registration event
    if (attendee.hasRegistration) {
      events.push({
        event_name: "registered-for-event",
        created_at: registrationTimestamp,
        email: attendee.email,
        name: attendee.name,
        phone_number: attendee.phone_number,
        metadata: {
          event_name: eventName,
          event_date: eventDate,
          ticket_type: attendee.ticketType || undefined,
          presenter: presenter,
        },
      });
    }

    // Create attendance event
    if (attendee.hasAttendance) {
      events.push({
        event_name: "attended-event",
        created_at: attendanceTimestamp,
        email: attendee.email,
        name: attendee.name,
        phone_number: attendee.phone_number,
        metadata: {
          event_name: eventName,
          event_date: eventDate,
          ticket_type: attendee.ticketType || undefined,
          presenter: presenter,
        },
      });
    }
  }

  return events;
}

/**
 * Replace email domain with example.com for test mode
 */
function replaceEmailDomain(email: string): string {
  const atIndex = email.indexOf("@");
  if (atIndex === -1) return email;
  return email.substring(0, atIndex + 1) + "example.com";
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const mappingJson = formData.get("mapping") as string | null;
    const eventSettingsJson = formData.get("eventSettings") as string | null;
    const testModeStr = formData.get("testMode") as string | null;
    const testMode = testModeStr === "true";

    if (!file) {
      return new Response(
        JSON.stringify({ type: "error", error: "No file uploaded" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Validate file type
    if (!file.name.endsWith(".csv")) {
      return new Response(
        JSON.stringify({ type: "error", error: "File must be a CSV file" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Parse column mapping
    let mapping: ColumnMapping;
    if (mappingJson) {
      try {
        mapping = JSON.parse(mappingJson) as ColumnMapping;
        if (!mapping.email) {
          return new Response(
            JSON.stringify({ type: "error", error: "Email column mapping is required" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            }
          );
        }
      } catch (e) {
        return new Response(
          JSON.stringify({ type: "error", error: "Invalid column mapping format" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    } else {
      return new Response(
        JSON.stringify({ type: "error", error: "Column mapping is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Parse event settings (optional)
    let eventSettings: EventSettings | undefined;
    if (eventSettingsJson) {
      try {
        eventSettings = JSON.parse(eventSettingsJson) as EventSettings;
      } catch (e) {
        console.warn("Failed to parse event settings, continuing without them");
      }
    }

    // Read file content
    const text = await file.text();

    // Parse CSV
    const parseResult = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
    });

    if (parseResult.errors.length > 0) {
      console.warn("CSV parsing errors:", parseResult.errors);
    }

    // Verify mapped columns exist in CSV
    const csvColumns = parseResult.meta.fields || [];
    const requiredColumns = [mapping.email];
    const optionalColumns = [
      mapping.name,
      mapping.phone_number,
      mapping.registrationDate,
      mapping.attendanceDate,
      mapping.ticketType,
      mapping.status,
      mapping.hasJoinedEvent,
      mapping.approval_status,
    ].filter((col): col is string => !!col);

    const missingColumns = [
      ...requiredColumns.filter((col) => !csvColumns.includes(col)),
      ...optionalColumns.filter((col) => !csvColumns.includes(col)),
    ];

    if (missingColumns.length > 0) {
      return new Response(
        JSON.stringify({
          type: "error",
          error: `Mapped columns not found in CSV: ${missingColumns.join(", ")}`,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Extract and validate attendees
    const attendees: LumaAttendee[] = [];
    const errors: string[] = [];

    for (let i = 0; i < parseResult.data.length; i++) {
      const row = parseResult.data[i];
      
      // Exclude rows where approval_status="invited"
      if (mapping.approval_status) {
        const approvalStatus = (row[mapping.approval_status] || "").trim().toLowerCase();
        if (approvalStatus === "invited") {
          continue; // Skip invited attendees
        }
      }
      
      const attendee = parseAttendee(row, mapping);

      if (!attendee) {
        errors.push(
          `Row ${i + 2}: Missing or invalid email address`
        );
        continue;
      }

      // Replace email domain with example.com in test mode
      if (testMode) {
        attendee.email = replaceEmailDomain(attendee.email);
      }

      attendees.push(attendee);
    }

    if (attendees.length === 0) {
      return new Response(
        JSON.stringify({
          type: "error",
          error: "No valid attendees found in CSV",
          errors,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Process attendees and create events
    const processedAttendees = processAttendees(attendees);
    const events = createIntercomEvents(processedAttendees, eventSettings);

    if (events.length === 0) {
      return NextResponse.json(
        {
          error: "No events to publish. Ensure CSV contains registration or attendance data.",
          processed: attendees.length,
        },
        { status: 400 }
      );
    }

    // Create a readable stream for Server-Sent Events
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        
        // Send initial message
        const sendMessage = (data: object) => {
          const message = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
        };

        // Send start message
        sendMessage({
          type: "start",
          totalEvents: events.length,
          totalProcessed: attendees.length,
        });

        const results: ProcessingResult[] = [];
        let successful = 0;
        let failed = 0;

        try {
          // Publish events with progress callback
          await publishEventsWithProgress(
            events,
            (result, index, total) => {
              results.push(result);
              if (result.success) {
                successful++;
              } else {
                failed++;
              }

              // Send progress update
              sendMessage({
                type: "progress",
                result,
                index,
                total,
                successful,
                failed,
              });
            },
            testMode
          );

          // Send completion message
          sendMessage({
            type: "complete",
            totalProcessed: attendees.length,
            successful,
            failed,
            results,
            errors: errors.length > 0 ? errors : undefined,
          });
        } catch (error) {
          sendMessage({
            type: "error",
            error: error instanceof Error ? error.message : "Unknown error occurred",
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Error processing upload:", error);

    let errorMessage = "Unknown error occurred";
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    return new Response(
      JSON.stringify({
        type: "error",
        error: errorMessage,
        success: false,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

