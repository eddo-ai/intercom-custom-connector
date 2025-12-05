"use client";

import { useState, useEffect } from "react";
import type {
  UploadResponse,
  ProcessingResult,
  CSVPreview,
  ColumnMapping,
  PreviewResponse,
  EventSettings,
} from "@/lib/types";

type Step = "upload" | "mapping" | "processing" | "results";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [currentStep, setCurrentStep] = useState<Step>("upload");
  const [preview, setPreview] = useState<CSVPreview | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({ email: "" });
  const [eventSettings, setEventSettings] = useState<EventSettings>({});
  const [testMode, setTestMode] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<UploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wasTestMode, setWasTestMode] = useState(false);
  const [streamingResults, setStreamingResults] = useState<ProcessingResult[]>([]);
  const [streamingStats, setStreamingStats] = useState({ successful: 0, failed: 0, total: 0 });
  const [testModeAvailable, setTestModeAvailable] = useState(false);

  const fieldLabels: Record<keyof ColumnMapping, string> = {
    email: "Email (required)",
    name: "Name",
    phone_number: "Phone Number",
    registrationDate: "Registration Date",
    attendanceDate: "Attendance Date",
    ticketType: "Ticket Type",
    status: "Status",
    hasJoinedEvent: "Has Joined Event (boolean)",
    approval_status: "Approval Status",
  };

  // Check if test mode is available and enable by default if available
  useEffect(() => {
    async function checkTestModeAvailability() {
      try {
        const response = await fetch("/api/config");
        const data = await response.json();
        const available = data.testModeAvailable || false;
        setTestModeAvailable(available);
        // Enable test mode by default if available
        if (available) {
          setTestMode(true);
        }
      } catch (err) {
        console.error("Failed to check test mode availability:", err);
        setTestModeAvailable(false);
      }
    }
    checkTestModeAvailability();
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.name.endsWith(".csv")) {
        setFile(selectedFile);
        setError(null);
        setResults(null);
        setCurrentStep("mapping");
        await loadPreview(selectedFile);
      } else {
        setError("Please select a CSV file");
        setFile(null);
      }
    }
  };

  const loadPreview = async (selectedFile: File) => {
    setLoadingPreview(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch("/api/preview", {
        method: "POST",
        body: formData,
      });

      const data: PreviewResponse = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error || "Failed to preview CSV");
        setCurrentStep("upload");
        return;
      }

      setPreview(data.preview);
      if (data.suggestedMapping) {
        setMapping(data.suggestedMapping);
      }
      if (data.extractedEventSettings) {
        setEventSettings(data.extractedEventSettings);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load preview"
      );
      setCurrentStep("upload");
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleProcess = async () => {
    if (!file || !mapping.email) {
      setError("Email column mapping is required");
      return;
    }

    setUploading(true);
    setError(null);
    setResults(null);
    setStreamingResults([]);
    setStreamingStats({ successful: 0, failed: 0, total: 0 });
    setCurrentStep("processing");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mapping", JSON.stringify(mapping));
      formData.append("eventSettings", JSON.stringify(eventSettings));
      formData.append("testMode", testMode.toString());

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        // Try to parse error response
        try {
          const errorData = await response.json();
          setError(errorData.error || "Upload failed");
        } catch {
          setError("Upload failed");
        }
        setCurrentStep("mapping");
        setUploading(false);
        return;
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        setError("Failed to read response stream");
        setCurrentStep("mapping");
        setUploading(false);
        return;
      }

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === "start") {
                setStreamingStats({
                  successful: 0,
                  failed: 0,
                  total: data.totalEvents,
                });
              } else if (data.type === "progress") {
                setStreamingResults((prev) => [...prev, data.result]);
                setStreamingStats({
                  successful: data.successful,
                  failed: data.failed,
                  total: data.total,
                });
              } else if (data.type === "complete") {
                setResults({
                  success: true,
                  totalProcessed: data.totalProcessed,
                  successful: data.successful,
                  failed: data.failed,
                  results: data.results,
                  errors: data.errors,
                });
                setWasTestMode(testMode);
                setCurrentStep("results");
                setUploading(false);
              } else if (data.type === "error") {
                setError(data.error || "An error occurred");
                setCurrentStep("mapping");
                setUploading(false);
              }
            } catch (e) {
              console.error("Error parsing SSE data:", e);
            }
          }
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred"
      );
      setCurrentStep("mapping");
      setUploading(false);
    }
  };

  const handleRunInProduction = async () => {
    if (!file || !mapping.email) {
      setError("Email column mapping is required");
      return;
    }

    setUploading(true);
    setError(null);
    setResults(null);
    setStreamingResults([]);
    setStreamingStats({ successful: 0, failed: 0, total: 0 });
    setCurrentStep("processing");
    setTestMode(false); // Disable test mode for production run

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mapping", JSON.stringify(mapping));
      formData.append("eventSettings", JSON.stringify(eventSettings));
      formData.append("testMode", "false");

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        // Try to parse error response
        try {
          const errorData = await response.json();
          setError(errorData.error || "Upload failed");
        } catch {
          setError("Upload failed");
        }
        setCurrentStep("mapping");
        setUploading(false);
        return;
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        setError("Failed to read response stream");
        setCurrentStep("mapping");
        setUploading(false);
        return;
      }

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === "start") {
                setStreamingStats({
                  successful: 0,
                  failed: 0,
                  total: data.totalEvents,
                });
              } else if (data.type === "progress") {
                setStreamingResults((prev) => [...prev, data.result]);
                setStreamingStats({
                  successful: data.successful,
                  failed: data.failed,
                  total: data.total,
                });
              } else if (data.type === "complete") {
                setResults({
                  success: true,
                  totalProcessed: data.totalProcessed,
                  successful: data.successful,
                  failed: data.failed,
                  results: data.results,
                  errors: data.errors,
                });
                setWasTestMode(false);
                setCurrentStep("results");
                setUploading(false);
              } else if (data.type === "error") {
                setError(data.error || "An error occurred");
                setCurrentStep("mapping");
                setUploading(false);
              }
            } catch (e) {
              console.error("Error parsing SSE data:", e);
            }
          }
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred"
      );
      setCurrentStep("mapping");
      setUploading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setPreview(null);
    setMapping({ email: "" });
    setEventSettings({});
    setTestMode(false);
    setResults(null);
    setError(null);
    setWasTestMode(false);
    setStreamingResults([]);
    setStreamingStats({ successful: 0, failed: 0, total: 0 });
    setCurrentStep("upload");
    const fileInput = document.getElementById("file-input") as HTMLInputElement;
    if (fileInput) {
      fileInput.value = "";
    }
  };

  const getResultStatusColor = (result: ProcessingResult) => {
    if (result.success) {
      return "text-green-600 dark:text-green-400";
    }
    return "text-red-600 dark:text-red-400";
  };

  const getResultStatusIcon = (result: ProcessingResult) => {
    if (result.success) {
      return "✓";
    }
    return "✗";
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="w-full max-w-4xl px-4 py-8 sm:px-8">
        <div className="rounded-lg bg-white p-8 shadow-lg dark:bg-zinc-900">
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-black dark:text-zinc-50">
            Luma to Intercom Event Connector
          </h1>
          <p className="mb-8 text-zinc-600 dark:text-zinc-400">
            Upload a CSV file from Luma event registrations to publish events to
            Intercom.
          </p>

          {/* Step Indicator */}
          {currentStep !== "results" && (
            <div className="mb-8 flex items-center justify-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${currentStep === "upload"
                  ? "bg-black text-white dark:bg-white dark:text-black"
                  : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
              >
                1
              </div>
              <div className="h-1 w-12 bg-zinc-200 dark:bg-zinc-800"></div>
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${currentStep === "mapping"
                  ? "bg-black text-white dark:bg-white dark:text-black"
                  : currentStep === "processing"
                    ? "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                    : "bg-zinc-100 text-zinc-400 dark:bg-zinc-900 dark:text-zinc-600"
                  }`}
              >
                2
              </div>
              <div className="h-1 w-12 bg-zinc-200 dark:bg-zinc-800"></div>
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${currentStep === "processing"
                  ? "bg-black text-white dark:bg-white dark:text-black"
                  : "bg-zinc-100 text-zinc-400 dark:bg-zinc-900 dark:text-zinc-600"
                  }`}
              >
                3
              </div>
            </div>
          )}

          {/* File Upload Section */}
          {currentStep === "upload" && (
            <div className="mb-8">
              <label
                htmlFor="file-input"
                className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
              >
                Select CSV File
              </label>
              <input
                id="file-input"
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="block w-full text-sm text-zinc-500 file:mr-4 file:rounded-full file:border-0 file:bg-zinc-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-zinc-700 hover:file:bg-zinc-200 dark:file:bg-zinc-800 dark:file:text-zinc-300 dark:hover:file:bg-zinc-700"
              />
            </div>
          )}

          {/* Column Mapping Section */}
          {currentStep === "mapping" && preview && (
            <div className="space-y-6">
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-800 dark:bg-zinc-800/50">
                <h2 className="mb-4 text-xl font-semibold text-black dark:text-zinc-50">
                  Map CSV Columns
                </h2>
                <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
                  Preview: {preview.totalRows} rows found. Map your CSV columns
                  to the expected fields below.
                </p>

                {/* Sample Row Preview */}
                {Object.keys(preview.sampleRow).length > 0 && (
                  <div className="mb-6 overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                    <div className="border-b border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
                      Sample Row Preview
                    </div>
                    <div className="max-h-32 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-zinc-50 dark:bg-zinc-800">
                          <tr>
                            {Object.keys(preview.sampleRow).map((col) => (
                              <th
                                key={col}
                                className="border-b border-zinc-200 px-3 py-2 text-left font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                              >
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            {Object.entries(preview.sampleRow).map(
                              ([col, value]) => (
                                <td
                                  key={col}
                                  className="border-b border-zinc-100 px-3 py-2 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400"
                                >
                                  {String(value || "").slice(0, 50)}
                                  {String(value || "").length > 50 ? "..." : ""}
                                </td>
                              )
                            )}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Column Mapping Fields */}
                <div className="space-y-4">
                  {(Object.keys(fieldLabels) as Array<keyof ColumnMapping>).map(
                    (field) => (
                      <div key={field}>
                        <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                          {fieldLabels[field]}
                        </label>
                        <select
                          value={mapping[field] || ""}
                          onChange={(e) =>
                            setMapping({ ...mapping, [field]: e.target.value })
                          }
                          required={field === "email"}
                          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 focus:border-black focus:outline-none focus:ring-1 focus:ring-black dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:focus:border-white dark:focus:ring-white"
                        >
                          <option value="">
                            {field === "email" ? "Select column..." : "(Optional)"}
                          </option>
                          {preview.columns.map((col) => (
                            <option key={col} value={col}>
                              {col}
                            </option>
                          ))}
                        </select>
                      </div>
                    )
                  )}
                </div>

                {/* Event Settings Section */}
                <div className="mt-8 rounded-lg border border-blue-200 bg-blue-50 p-6 dark:border-blue-800 dark:bg-blue-900/20">
                  <h3 className="mb-3 text-lg font-semibold text-black dark:text-zinc-50">
                    Event Information (Applies to all attendees)
                  </h3>
                  <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
                    Set event details that will apply to all attendees. These
                    will override any values from CSV columns.
                  </p>
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                        Event Name
                      </label>
                      <input
                        type="text"
                        value={eventSettings.eventName || ""}
                        onChange={(e) =>
                          setEventSettings({
                            ...eventSettings,
                            eventName: e.target.value,
                          })
                        }
                        placeholder="e.g., Community Meetup"
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 placeholder:text-zinc-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:placeholder:text-zinc-500 dark:focus:border-white dark:focus:ring-white"
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                          Event Date
                        </label>
                        <input
                          type="date"
                          value={eventSettings.eventDate || ""}
                          onChange={(e) =>
                            setEventSettings({
                              ...eventSettings,
                              eventDate: e.target.value,
                            })
                          }
                          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 focus:border-black focus:outline-none focus:ring-1 focus:ring-black dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:focus:border-white dark:focus:ring-white"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                          Event Time
                        </label>
                        <input
                          type="time"
                          value={eventSettings.eventTime || ""}
                          onChange={(e) =>
                            setEventSettings({
                              ...eventSettings,
                              eventTime: e.target.value,
                            })
                          }
                          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 focus:border-black focus:outline-none focus:ring-1 focus:ring-black dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:focus:border-white dark:focus:ring-white"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                        Presenter
                      </label>
                      <input
                        type="text"
                        value={eventSettings.presenter || ""}
                        onChange={(e) =>
                          setEventSettings({
                            ...eventSettings,
                            presenter: e.target.value,
                          })
                        }
                        placeholder="e.g., John Doe"
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 placeholder:text-zinc-400 focus:border-black focus:outline-none focus:ring-1 focus:ring-black dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:placeholder:text-zinc-500 dark:focus:border-white dark:focus:ring-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Test Mode Toggle */}
                {testModeAvailable ? (
                  <div className="mt-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="test-mode"
                        checked={testMode}
                        onChange={(e) => setTestMode(e.target.checked)}
                        className="h-4 w-4 rounded border-zinc-300 text-black focus:ring-2 focus:ring-black dark:border-zinc-600 dark:text-white dark:focus:ring-white"
                      />
                      <label
                        htmlFor="test-mode"
                        className="text-sm font-medium text-black dark:text-zinc-50"
                      >
                        Test Mode
                      </label>
                    </div>
                    <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                      When enabled, uses INTERCOM_ACCESS_TOKEN_TEST and replaces email domains with example.com
                    </p>
                  </div>
                ) : (
                  <div className="mt-6 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800/50">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="test-mode"
                        checked={false}
                        disabled
                        className="h-4 w-4 rounded border-zinc-300 text-zinc-300 dark:border-zinc-600 dark:text-zinc-700"
                      />
                      <label
                        htmlFor="test-mode"
                        className="text-sm font-medium text-zinc-500 dark:text-zinc-500"
                      >
                        Test Mode
                      </label>
                    </div>
                    <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
                      Test mode is not available. Please set <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs dark:bg-zinc-800">INTERCOM_ACCESS_TOKEN_TEST</code> in your <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs dark:bg-zinc-800">.env.local</code> file to enable test mode.
                    </p>
                  </div>
                )}

                <div className="mt-6 flex gap-4">
                  <button
                    onClick={handleProcess}
                    disabled={!mapping.email}
                    className="rounded-full bg-black px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                  >
                    {testMode ? "Test Mode: Process" : "Process & Upload"}
                  </button>
                  <button
                    onClick={handleReset}
                    className="rounded-full border border-zinc-300 bg-white px-6 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                  >
                    Start Over
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Loading Preview */}
          {loadingPreview && (
            <div className="mb-6 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800/50">
              <div className="flex items-center gap-3">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600 dark:border-zinc-600 dark:border-t-zinc-300"></div>
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Loading CSV preview...
                </p>
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
              <p className="text-sm font-medium text-red-800 dark:text-red-400">
                Error: {error}
              </p>
            </div>
          )}

          {/* Upload Status */}
          {currentStep === "processing" && uploading && (
            <div className="mb-6 space-y-4">
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800/50">
                <div className="flex items-center gap-3">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600 dark:border-zinc-600 dark:border-t-zinc-300"></div>
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Processing CSV and publishing events to Intercom...
                  </p>
                </div>
                {streamingStats.total > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400">
                        Progress
                      </p>
                      <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                        {streamingResults.length} / {streamingStats.total}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400">
                        Successful
                      </p>
                      <p className="text-sm font-semibold text-green-600 dark:text-green-400">
                        {streamingStats.successful}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400">
                        Failed
                      </p>
                      <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                        {streamingStats.failed}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Streaming Results */}
              {streamingResults.length > 0 && (
                <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
                    <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
                      Processing Results (Live)
                    </h2>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {streamingResults.map((result, index) => (
                      <div
                        key={index}
                        className="border-b border-zinc-100 px-6 py-3 last:border-b-0 dark:border-zinc-800"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-lg font-bold ${getResultStatusColor(result)}`}
                              >
                                {getResultStatusIcon(result)}
                              </span>
                              <span className="font-medium text-black dark:text-zinc-50">
                                {result.email}
                              </span>
                              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                                {result.eventType}
                              </span>
                            </div>
                            {result.error && (
                              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                                {result.error}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Results Summary */}
          {currentStep === "results" && results && (
            <div className="space-y-6">
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-800 dark:bg-zinc-800/50">
                <h2 className="mb-4 text-xl font-semibold text-black dark:text-zinc-50">
                  Upload Summary
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      Total Processed
                    </p>
                    <p className="text-2xl font-bold text-black dark:text-zinc-50">
                      {results.totalProcessed}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      Successful
                    </p>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {results.successful}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      Failed
                    </p>
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                      {results.failed}
                    </p>
                  </div>
                </div>
              </div>

              {/* Results List */}
              {results.results && results.results.length > 0 && (
                <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
                    <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
                      Processing Results
                    </h2>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {results.results.map((result, index) => (
                      <div
                        key={index}
                        className="border-b border-zinc-100 px-6 py-3 last:border-b-0 dark:border-zinc-800"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-lg font-bold ${getResultStatusColor(result)}`}
                              >
                                {getResultStatusIcon(result)}
                              </span>
                              <span className="font-medium text-black dark:text-zinc-50">
                                {result.email}
                              </span>
                              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                                {result.eventType}
                              </span>
                            </div>
                            {result.error && (
                              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                                {result.error}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Errors from CSV parsing */}
              {results.errors && results.errors.length > 0 && (
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20">
                  <h3 className="mb-2 text-sm font-semibold text-yellow-800 dark:text-yellow-400">
                    CSV Parsing Warnings
                  </h3>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-yellow-700 dark:text-yellow-300">
                    {results.errors.map((err, index) => (
                      <li key={index}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Test Mode Success - Run in Production Button */}
              {wasTestMode && results.success && results.successful > 0 && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-6 dark:border-green-800 dark:bg-green-900/20">
                  <h3 className="mb-2 text-lg font-semibold text-green-800 dark:text-green-400">
                    ✓ Test Mode Successful
                  </h3>
                  <p className="mb-4 text-sm text-green-700 dark:text-green-300">
                    Your test run completed successfully. Ready to publish to production Intercom?
                  </p>
                  <button
                    onClick={handleRunInProduction}
                    className="rounded-full bg-green-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600"
                  >
                    Run in Production
                  </button>
                </div>
              )}

              {/* Reset Button */}
              <button
                onClick={handleReset}
                className="w-full rounded-full border border-zinc-300 bg-white px-6 py-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 sm:w-auto"
              >
                Upload Another File
              </button>
            </div>
          )}

          {/* Instructions */}
          {currentStep === "upload" && (
            <div className="mt-8 rounded-lg border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-800 dark:bg-zinc-800/50">
              <h3 className="mb-3 text-sm font-semibold text-black dark:text-zinc-50">
                Instructions
              </h3>
              <ol className="list-decimal space-y-2 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
                <li>Export your event guest list from Luma as a CSV file</li>
                <li>Select the CSV file to preview and map columns</li>
                <li>Map CSV columns to the expected fields (email is required)</li>
                <li>
                  Process to publish events to Intercom for each attendee with
                  registration or attendance data
                </li>
              </ol>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
