"use client";

interface EnvBannerProps {
  showBanner: boolean;
  repositoryUrl: string;
}

export default function EnvBanner({ showBanner, repositoryUrl }: EnvBannerProps) {
  if (!showBanner) return null;

  return (
    <div className="w-full border-b border-yellow-300 bg-yellow-50 px-4 py-3 dark:border-yellow-700 dark:bg-yellow-900/20">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
        <div className="flex-1">
          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
            Production environment variable not configured. To use this with your own Intercom account, set the{" "}
            <code className="rounded bg-yellow-100 px-1.5 py-0.5 font-mono text-xs text-yellow-900 dark:bg-yellow-800/50 dark:text-yellow-200">
              INTERCOM_ACCESS_TOKEN
            </code>{" "}
            in your <code className="rounded bg-yellow-100 px-1.5 py-0.5 font-mono text-xs text-yellow-900 dark:bg-yellow-800/50 dark:text-yellow-200">.env.local</code> file.
          </p>
        </div>
        <a
          href={repositoryUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 rounded-full border border-yellow-400 bg-yellow-100 px-4 py-2 text-sm font-medium text-yellow-900 transition-colors hover:bg-yellow-200 dark:border-yellow-600 dark:bg-yellow-800/50 dark:text-yellow-200 dark:hover:bg-yellow-800/70"
        >
          View README
        </a>
      </div>
    </div>
  );
}

