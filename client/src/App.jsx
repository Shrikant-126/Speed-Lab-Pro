import { lazy, Component } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { EmptyState, Button, ErrorState } from './components/ui.jsx';

// Every dashboard module is lazy-loaded so the initial bundle stays small.
const Overview = lazy(() => import('./pages/Overview.jsx'));
const Analyzer = lazy(() => import('./pages/Analyzer.jsx'));
const CoreWebVitals = lazy(() => import('./pages/CoreWebVitals.jsx'));
const LcpAnalysis = lazy(() => import('./pages/LcpAnalysis.jsx'));
const ImageOptimizer = lazy(() => import('./pages/ImageOptimizer.jsx'));
const VideoOptimizer = lazy(() => import('./pages/VideoOptimizer.jsx'));
const CssAnalyzer = lazy(() => import('./pages/CssAnalyzer.jsx'));
const JsAnalyzer = lazy(() => import('./pages/JsAnalyzer.jsx'));
const NetworkAnalysis = lazy(() => import('./pages/NetworkAnalysis.jsx'));
const ThirdParty = lazy(() => import('./pages/ThirdParty.jsx'));
const Suggestions = lazy(() => import('./pages/Suggestions.jsx'));
const CodeGenerator = lazy(() => import('./pages/CodeGenerator.jsx'));
const History = lazy(() => import('./pages/History.jsx'));
const Reports = lazy(() => import('./pages/Reports.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-2xl p-6">
          <ErrorState title="This page crashed" message={this.state.error.message} onRetry={() => this.setState({ error: null })} />
        </div>
      );
    }
    return this.props.children;
  }
}

function NotFound() {
  return (
    <EmptyState
      title="Page not found"
      description="The page you are looking for does not exist."
      action={
        <Link to="/">
          <Button>Back to overview</Button>
        </Link>
      }
    />
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Overview />} />
          <Route path="analyzer" element={<Analyzer />} />
          <Route path="core-web-vitals" element={<CoreWebVitals />} />
          <Route path="lcp" element={<LcpAnalysis />} />
          <Route path="images" element={<ImageOptimizer />} />
          <Route path="videos" element={<VideoOptimizer />} />
          <Route path="css" element={<CssAnalyzer />} />
          <Route path="javascript" element={<JsAnalyzer />} />
          <Route path="network" element={<NetworkAnalysis />} />
          <Route path="third-party" element={<ThirdParty />} />
          <Route path="suggestions" element={<Suggestions />} />
          <Route path="code-generator" element={<CodeGenerator />} />
          <Route path="history" element={<History />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
