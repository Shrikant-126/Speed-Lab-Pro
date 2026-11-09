import { Link } from 'react-router-dom';
import { ScanSearch, AlertTriangle } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { EmptyState, Button, PageSkeleton, ErrorState, Notice } from './ui.jsx';

/** Renders children(report) when a scan is loaded; otherwise an empty/loading state. */
export default function RequireReport({ children, title }) {
  const { report, reportsLoading, reportsError, scanning, device } = useApp();
  if (reportsLoading) return <PageSkeleton />;
  if (!report) {
    return (
      <div className="space-y-4">
        {reportsError && <ErrorState title="Could not load the last scan" message={reportsError} />}
        <EmptyState
          icon={ScanSearch}
          title={scanning ? 'Scan in progress…' : `No scan loaded${title ? ` for ${title}` : ''}`}
          description={scanning ? 'Results will appear here as soon as the analysis finishes.' : 'Run a performance scan on any public URL, or open a previous scan from Scan History.'}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/analyzer">
                <Button icon={ScanSearch}>{scanning ? 'View progress' : 'Analyze a website'}</Button>
              </Link>
              <Link to="/history">
                <Button variant="secondary">Scan history</Button>
              </Link>
            </div>
          }
        />
      </div>
    );
  }
  return (
    <>
      {report.strategy !== device && (
        <Notice tone="warn" className="mb-4">
          No {device} scan is loaded – showing the {report.strategy} results instead.
        </Notice>
      )}
      {!report.sources?.lighthouse && (
        <Notice tone="warn" className="mb-4">
          <span className="inline-flex items-center gap-1"><AlertTriangle size={14} /> Lighthouse data was unavailable for this scan.</span> Scores and throttled lab metrics are missing; values shown come from an unthrottled browser load.
        </Notice>
      )}
      {children(report)}
    </>
  );
}
