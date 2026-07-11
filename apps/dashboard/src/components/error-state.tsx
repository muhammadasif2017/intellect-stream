import { Button } from './button';

type ErrorStateProps = {
  title?: string;
  /* Technical detail (error message) — shown small, in mono. */
  detail?: string;
  onRetry?: () => void;
};

export function ErrorState({
  title = 'Something went wrong',
  detail,
  onRetry,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-lg border border-red-200 bg-red-50 px-6 py-10 text-center"
    >
      <p className="text-sm font-medium text-red-800">{title}</p>
      {detail && (
        <p className="mt-1 max-w-md font-mono text-xs break-all text-red-700">
          {detail}
        </p>
      )}
      {onRetry && (
        <div className="mt-4">
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}
