/**
 * Intercom API client using the official intercom-client SDK
 */

import { IntercomClient, IntercomError } from "intercom-client";
import type { IntercomEvent, ProcessingResult } from "./types";

// Initialize the Intercom client
function getIntercomClient(testMode: boolean = false): IntercomClient {
  const token = testMode
    ? process.env.INTERCOM_ACCESS_TOKEN_TEST
    : process.env.INTERCOM_ACCESS_TOKEN;

  const tokenName = testMode
    ? "INTERCOM_ACCESS_TOKEN_TEST"
    : "INTERCOM_ACCESS_TOKEN";

  if (!token) {
    throw new Error(
      `${tokenName} environment variable is not set. Please add it to your .env.local file.`
    );
  }

  return new IntercomClient({ token });
}

/**
 * Ensure user exists in Intercom before publishing event
 */
async function ensureUserExists(
  email: string,
  name: string | undefined,
  phone: string | undefined,
  testMode: boolean
): Promise<void> {
  const client = getIntercomClient(testMode);

  const userData: {
    email: string;
    name?: string;
    phone?: string;
  } = {
    email,
  };

  // Add name if available and not empty
  if (name && name.trim()) {
    userData.name = name.trim();
  }

  // Add phone if available and not empty
  if (phone && phone.trim()) {
    userData.phone = phone.trim();
  }

  try {
    // Try to create the contact (user)
    await client.contacts.create(userData);
  } catch (error) {
    if (error instanceof IntercomError) {
      // If contact already exists (422 or 409), try to update it with phone/name
      if (error.statusCode === 422 || error.statusCode === 409) {
        // Try to find and update the contact
        try {
          // Search for contact by email
          const searchResult = await client.contacts.search({
            query: {
              operator: "AND",
              value: [
                {
                  field: "email",
                  operator: "=",
                  value: email,
                },
              ],
            },
          });

          if (searchResult.data && searchResult.data.length > 0) {
            const contact = searchResult.data[0];
            // Update contact with phone and name if provided
            const updateData: {
              contact_id: string;
              phone?: string;
              name?: string;
            } = {
              contact_id: contact.id,
            };

            if (phone && phone.trim()) {
              updateData.phone = phone.trim();
            }

            if (name && name.trim()) {
              updateData.name = name.trim();
            }

            // Only update if we have data to update
            if (Object.keys(updateData).length > 1) {
              await client.contacts.update(updateData);
            }
          }
        } catch (updateError) {
          // Update failed, but contact exists so we can proceed
          console.warn(`Could not update contact ${email} with phone/name: ${updateError instanceof Error ? updateError.message : "Unknown error"}`);
        }
        return; // Contact exists, we can proceed with event
      }
      // For other errors, log but don't throw - events might still work
      console.warn(`Could not create contact ${email}: ${error.message}`);
    }
    // For non-Intercom errors, silently continue - events might still work
  }
}

/**
 * Publish an event to Intercom
 * Ensures user exists before publishing the event
 */
export async function publishEvent(
  event: IntercomEvent,
  testMode: boolean = false
): Promise<ProcessingResult> {
  const client = getIntercomClient(testMode);

  try {
    // Ensure user exists first - this will create the user if needed
    await ensureUserExists(event.email, event.name, event.phone_number, testMode);

    // Small delay to ensure user is available for events
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Build event payload using email (user must exist)
    const eventPayload: {
      event_name: string;
      created_at: number;
      email: string;
      metadata?: Record<string, string>;
    } = {
      event_name: event.event_name,
      created_at: event.created_at,
      email: event.email,
    };

    // Filter out undefined values from metadata and convert to Record<string, string>
    const metadata: Record<string, string> = {};
    if (event.metadata) {
      for (const [key, value] of Object.entries(event.metadata)) {
        if (value !== undefined && value !== null && value !== "") {
          metadata[key] = value;
        }
      }
    }

    // Only include metadata if it has values
    if (Object.keys(metadata).length > 0) {
      eventPayload.metadata = metadata;
    }

    // Publish the event (user should now exist)
    await client.events.create(eventPayload);

    return {
      success: true,
      email: event.email,
      eventType:
        event.event_name === "registered-for-event"
          ? "registered-for-event"
          : "attended-event",
    };
  } catch (error) {
    let errorMessage = "Unknown error";

    if (error instanceof IntercomError) {
      // Include more detailed error information
      const errorBody = (error as IntercomError & { body?: { errors?: Array<{ message: string }>; request_id?: string } }).body;
      const errorDetails = errorBody?.errors
        ? errorBody.errors.map((e) => e.message).join(", ")
        : error.message;
      errorMessage = `Intercom API error (${error.statusCode}): ${errorDetails}`;
      if (errorBody?.request_id) {
        errorMessage += ` Request ID: ${errorBody.request_id}`;
      }
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    return {
      success: false,
      email: event.email,
      eventType:
        event.event_name === "registered-for-event"
          ? "registered-for-event"
          : "attended-event",
      error: errorMessage,
    };
  }
}

/**
 * Publish multiple events to Intercom
 */
export async function publishEvents(
  events: IntercomEvent[],
  testMode: boolean = false
): Promise<ProcessingResult[]> {
  const results: ProcessingResult[] = [];

  for (const event of events) {
    const result = await publishEvent(event, testMode);
    results.push(result);

    // Small delay to avoid rate limiting
    if (events.length > 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return results;
}

/**
 * Publish multiple events to Intercom with progress callback
 */
export async function publishEventsWithProgress(
  events: IntercomEvent[],
  onProgress: (result: ProcessingResult, index: number, total: number) => void,
  testMode: boolean = false
): Promise<void> {
  const total = events.length;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const result = await publishEvent(event, testMode);

    // Call progress callback
    onProgress(result, i + 1, total);

    // Small delay to avoid rate limiting
    if (events.length > 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

