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
- Git (for cloning the repository)

### Installation

1. Clone the repository:

```bash
git clone https://github.com/eddo-ai/intercom-custom-connector.git
cd intercom-custom-connector
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env.local` file in the root directory and configure your API keys:

```env
# Production Intercom Access Token (required for production mode)
INTERCOM_ACCESS_TOKEN=your_production_intercom_access_token_here

# Test Intercom Access Token (required for test mode)
INTERCOM_ACCESS_TOKEN_TEST=your_test_intercom_access_token_here
```

**Getting your Intercom Access Tokens:**
- Production Token: Get your Intercom Access Token from: https://app.intercom.com/a/apps/_/settings/api-keys
- Test Token: You can use the same token for testing, or create a separate test workspace in Intercom and use its access token

**Note:** The application will display a banner if `INTERCOM_ACCESS_TOKEN` is not set, as it's required for production operations. Test mode uses `INTERCOM_ACCESS_TOKEN_TEST` and can be enabled via the UI toggle.

4. Run the development server:

```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Test Mode

The application includes a **Test Mode** feature that allows you to safely test the connector without affecting real user data in your production Intercom workspace.

### How Test Mode Works

When Test Mode is enabled:
- **Separate API Token**: Uses `INTERCOM_ACCESS_TOKEN_TEST` instead of `INTERCOM_ACCESS_TOKEN`
- **Email Domain Replacement**: All email addresses are automatically converted to use the `example.com` domain
  - Example: `john@company.com` → `john@example.com`
- **Safe Testing**: Events and users are created/updated in your test Intercom workspace, preventing any impact on production data

### Setting Up Test Mode

1. **Get your test API token:**
   - Option A: Use a separate Intercom workspace/app for testing (recommended)
   - Option B: Use the same production token (not recommended for safety)

2. **Add to `.env.local`:**
   ```env
   INTERCOM_ACCESS_TOKEN_TEST=your_test_intercom_access_token_here
   ```

3. **Enable Test Mode:**
   - When mapping CSV columns, check the "Test Mode" checkbox before processing
   - The UI will clearly indicate when Test Mode is active

### When to Use Test Mode

- Testing CSV parsing and column mapping
- Verifying event data structure before production runs
- Debugging issues without affecting real users
- Running through the entire workflow before processing production data

### Test Mode Workflow

1. Enable Test Mode checkbox in the UI
2. Process your CSV file (emails will be converted to `example.com` domain)
3. Review results to verify everything works correctly
4. If successful, you'll see a "Run in Production" button after test completion
5. Disable Test Mode or use the production button to process real data

**Important:** Always test your CSV files in Test Mode first, especially when:
- Uploading a new CSV format
- Testing column mappings
- Verifying event settings

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
