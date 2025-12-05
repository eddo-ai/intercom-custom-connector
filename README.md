# Intercom Custom Connector

A Next.js application that imports Luma event registration/attendance data from CSV files and publishes events to Intercom using the official [intercom-client](https://github.com/intercom/intercom-node) SDK.

## Features

- Upload CSV files exported from Luma event registrations
- Automatic parsing of attendee data (email, name, registration date, attendance date)
- Publishes `registered-for-event` and `attended-event` events to Intercom
- Creates or updates users in Intercom automatically
- Real-time progress tracking and detailed results display

## Getting Started

### Prerequisites

- Node.js 18+ installed
- Intercom account with API access
- Luma event CSV exports

### Installation

1. Install dependencies:

```bash
npm install
```

2. Create a `.env.local` file in the root directory:

```env
INTERCOM_ACCESS_TOKEN=your_intercom_access_token_here
```

Get your Intercom Access Token from: https://app.intercom.com/a/apps/_/settings/api-keys

3. Run the development server:

```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. **Export CSV from Luma:**
   - Go to your event's Manage page in Luma
   - Navigate to the Guests tab
   - Click "Download CSV" to export the guest list

2. **Upload CSV:**
   - Use the file selector to choose your exported CSV file
   - Click "Upload & Process"
   - Wait for processing to complete

3. **View Results:**
   - See a summary of processed, successful, and failed events
   - Review detailed results for each attendee
   - Check for any parsing errors or warnings

## CSV Format

The CSV file should include the following columns (column names are flexible and case-insensitive):

- **Email** (required): `email`, `e-mail`, `emailaddress`
- **Name** (optional): `name`, `fullname`, `full_name`, `attendee_name`
- **Event Name** (optional): `eventname`, `event_name`, `event`
- **Event Date** (optional): `eventdate`, `event_date`, `date`
- **Registration Date** (optional): `registrationdate`, `registration_date`, `registered`
- **Attendance Date** (optional): `attendancedate`, `attendance_date`, `attended`, `checkedin`
- **Ticket Type** (optional): `tickettype`, `ticket_type`, `ticket`
- **Status** (optional): `status`

## Event Types

The connector publishes two types of events to Intercom:

- **`registered-for-event`**: Published when registration data is detected
- **`attended-event`**: Published when attendance data is detected

Both events include metadata:
- `event_name`: Name of the event
- `event_date`: Date of the event
- `ticket_type`: Type of ticket purchased

## Technology Stack

- **Next.js 16**: React framework with App Router
- **TypeScript**: Type-safe development
- **intercom-client**: Official Intercom SDK for Node.js/TypeScript
- **papaparse**: CSV parsing library
- **Tailwind CSS**: Styling

## Project Structure

```
├── app/
│   ├── api/
│   │   └── upload/
│   │       └── route.ts      # API endpoint for CSV processing
│   └── page.tsx               # CSV upload UI
├── lib/
│   ├── intercom.ts           # Intercom API client
│   └── types.ts              # TypeScript type definitions
└── .env.local                # Environment variables (create this)
```

## Development

```bash
# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint
```

## Error Handling

The connector handles various error scenarios:

- Invalid CSV format or missing columns
- Missing or invalid email addresses
- Intercom API errors (rate limiting, authentication, etc.)
- Network errors

All errors are logged and displayed in the results, allowing you to identify and fix issues with specific attendees.

## License

Private project.
