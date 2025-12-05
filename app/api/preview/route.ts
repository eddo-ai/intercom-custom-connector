/**
 * API route to preview CSV file columns and suggest mappings
 */

import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import type { CSVPreview, PreviewResponse, ColumnMapping, EventSettings } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Normalize CSV column names to handle variations
 */
function normalizeColumnName(column: string): string {
    return column.toLowerCase().trim().replace(/\s+/g, "");
}

/**
 * Extract event name and date from filename
 * Expected format: "Event Name - Guests - YYYY-MM-DD-HH-MM-SS.csv"
 */
function extractEventSettingsFromFilename(filename: string): EventSettings | undefined {
    // Remove .csv extension
    const nameWithoutExt = filename.replace(/\.csv$/i, "");

    // Pattern: "Event Name - Guests - YYYY-MM-DD-HH-MM-SS"
    const match = nameWithoutExt.match(/^(.+?)\s*-\s*Guests\s*-\s*(\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2})$/);

    if (!match) {
        return undefined;
    }

    const eventName = match[1].trim();
    const dateTimeStr = match[2]; // YYYY-MM-DD-HH-MM-SS

    // Parse the date-time string: YYYY-MM-DD-HH-MM-SS
    const parts = dateTimeStr.split("-");
    if (parts.length !== 6) {
        return undefined;
    }

    const year = parts[0];
    const month = parts[1];
    const day = parts[2];
    const hour = parts[3];
    const minute = parts[4];
    const second = parts[5];

    // Format as YYYY-MM-DD for eventDate
    const eventDate = `${year}-${month}-${day}`;

    // Format as HH:MM:SS for eventTime
    const eventTime = `${hour}:${minute}:${second}`;

    return {
        eventName,
        eventDate,
        eventTime,
    };
}

/**
 * Suggest column mapping based on column names
 */
function suggestMapping(columns: string[]): ColumnMapping {
    const mapping: ColumnMapping = { email: "" };
    const normalizedColumns = columns.map((col) => ({
        original: col,
        normalized: normalizeColumnName(col),
    }));

    // Find email column (prioritize exact Luma field name)
    for (const col of normalizedColumns) {
        if (col.normalized === "email") {
            mapping.email = col.original;
            break;
        }
    }
    // If not found, try alternatives
    if (!mapping.email) {
        for (const col of normalizedColumns) {
            if (
                col.normalized === "e-mail" ||
                col.normalized === "emailaddress" ||
                col.normalized === "e_mail"
            ) {
                mapping.email = col.original;
                break;
            }
        }
    }

    // Find name column (prioritize exact Luma field name)
    for (const col of normalizedColumns) {
        if (col.normalized === "name") {
            mapping.name = col.original;
            break;
        }
    }
    // If not found, try alternatives
    if (!mapping.name) {
        for (const col of normalizedColumns) {
            if (
                col.normalized === "fullname" ||
                col.normalized === "full_name" ||
                col.normalized === "attendeename" ||
                col.normalized === "attendee_name"
            ) {
                mapping.name = col.original;
                break;
            }
        }
    }

    // Find phone_number column (prioritize exact Luma field name)
    for (const col of normalizedColumns) {
        if (col.normalized === "phone_number" || col.normalized === "phonenumber") {
            mapping.phone_number = col.original;
            break;
        }
    }
    // If not found, try alternatives
    if (!mapping.phone_number) {
        for (const col of normalizedColumns) {
            if (
                col.normalized === "phone" ||
                col.normalized === "phonenum" ||
                col.normalized === "mobile" ||
                col.normalized === "telephone"
            ) {
                mapping.phone_number = col.original;
                break;
            }
        }
    }

    // Find registration date column (prioritize Luma created_at field)
    for (const col of normalizedColumns) {
        if (col.normalized === "created_at" || col.normalized === "createdat") {
            mapping.registrationDate = col.original;
            break;
        }
    }
    // If not found, try alternatives
    if (!mapping.registrationDate) {
        for (const col of normalizedColumns) {
            if (
                col.normalized === "registrationdate" ||
                col.normalized === "registration_date" ||
                col.normalized === "registered"
            ) {
                mapping.registrationDate = col.original;
                break;
            }
        }
    }

    // Find attendance date column
    for (const col of normalizedColumns) {
        if (
            col.normalized === "attendancedate" ||
            col.normalized === "attendance_date" ||
            col.normalized === "attended" ||
            col.normalized === "checkedin"
        ) {
            mapping.attendanceDate = col.original;
            break;
        }
    }

    // Find ticket type column (prioritize Luma ticket_name field)
    for (const col of normalizedColumns) {
        if (col.normalized === "ticket_name" || col.normalized === "ticketname") {
            mapping.ticketType = col.original;
            break;
        }
    }
    // If not found, try alternatives
    if (!mapping.ticketType) {
        for (const col of normalizedColumns) {
            if (
                col.normalized === "tickettype" ||
                col.normalized === "ticket_type" ||
                col.normalized === "ticket"
            ) {
                mapping.ticketType = col.original;
                break;
            }
        }
    }

    // Find approval_status column (prioritize Luma approval_status field)
    for (const col of normalizedColumns) {
        if (col.normalized === "approval_status" || col.normalized === "approvalstatus") {
            mapping.approval_status = col.original;
            break;
        }
    }
    // If not found, try alternatives
    if (!mapping.approval_status) {
        for (const col of normalizedColumns) {
            if (
                col.normalized === "approval" ||
                col.normalized === "status"
            ) {
                mapping.approval_status = col.original;
                break;
            }
        }
    }

    // Find status column (for other status fields)
    for (const col of normalizedColumns) {
        if (col.normalized === "status" && !mapping.approval_status) {
            mapping.status = col.original;
            break;
        }
    }
    // If not found, try alternatives
    if (!mapping.status) {
        for (const col of normalizedColumns) {
            if (col.normalized === "status") {
                mapping.status = col.original;
                break;
            }
        }
    }

    // Find hasJoinedEvent column (prioritize exact Luma field name)
    for (const col of normalizedColumns) {
        if (col.normalized === "has_joined_event" || col.normalized === "hasjoinedevent") {
            mapping.hasJoinedEvent = col.original;
            break;
        }
    }
    // If not found, try alternatives
    if (!mapping.hasJoinedEvent) {
        for (const col of normalizedColumns) {
            if (
                col.normalized === "joined" ||
                col.normalized === "attended"
            ) {
                mapping.hasJoinedEvent = col.original;
                break;
            }
        }
    }

    return mapping;
}

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;

        if (!file) {
            return NextResponse.json<PreviewResponse>(
                {
                    success: false,
                    error: "No file uploaded",
                    preview: { columns: [], sampleRow: {}, totalRows: 0 },
                },
                { status: 400 }
            );
        }

        // Validate file type
        if (!file.name.endsWith(".csv")) {
            return NextResponse.json<PreviewResponse>(
                {
                    success: false,
                    error: "File must be a CSV file",
                    preview: { columns: [], sampleRow: {}, totalRows: 0 },
                },
                { status: 400 }
            );
        }

        // Read file content
        const text = await file.text();

        // Parse CSV (only first few rows for preview)
        const parseResult = Papa.parse<Record<string, string>>(text, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (header: string) => header.trim(),
            preview: 5, // Only parse first 5 rows for preview
        });

        if (parseResult.errors.length > 0) {
            console.warn("CSV parsing errors:", parseResult.errors);
        }

        // Get columns
        const columns = parseResult.meta.fields || [];

        if (columns.length === 0) {
            return NextResponse.json<PreviewResponse>(
                {
                    success: false,
                    error: "CSV file appears to have no columns",
                    preview: { columns: [], sampleRow: {}, totalRows: 0 },
                },
                { status: 400 }
            );
        }

        // Get sample row (first non-empty row)
        const sampleRow = parseResult.data[0] || {};

        // Count total rows (need to parse again without preview limit)
        const countResult = Papa.parse<Record<string, string>>(text, {
            header: true,
            skipEmptyLines: true,
        });
        const totalRows = countResult.data.length;

        const preview: CSVPreview = {
            columns,
            sampleRow,
            totalRows,
        };

        // Suggest mapping
        const suggestedMapping = suggestMapping(columns);

        // Extract event settings from filename
        const extractedEventSettings = extractEventSettingsFromFilename(file.name);

        return NextResponse.json<PreviewResponse>({
            success: true,
            preview,
            suggestedMapping,
            extractedEventSettings,
        });
    } catch (error) {
        console.error("Error previewing CSV:", error);

        let errorMessage = "Unknown error occurred";
        if (error instanceof Error) {
            errorMessage = error.message;
        }

        return NextResponse.json<PreviewResponse>(
            {
                success: false,
                error: errorMessage,
                preview: { columns: [], sampleRow: {}, totalRows: 0 },
            },
            { status: 500 }
        );
    }
}

