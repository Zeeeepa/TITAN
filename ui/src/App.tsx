import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router';
import { Layout } from '@/components/layout/Layout';
import { ConfigProvider } from '@/hooks/useConfig';

const ChatView = lazy(() => import('@/components/chat/ChatView'));
const OverviewPanel = lazy(() => import('@/components/admin/OverviewPanel'));
const AgentsPanel = lazy(() => import('@/components/admin/AgentsPanel'));
const SessionsPanel = lazy(() => import('@/components/admin/SessionsPanel'));
const SettingsPanel = lazy(() => import('@/components/admin/SettingsPanel'));
const ChannelsPanel = lazy(() => import('@/components/admin/ChannelsPanel'));
const SkillsPanel = lazy(() => import('@/components/admin/SkillsPanel'));
const TelemetryPanel = lazy(() => import('@/components/admin/TelemetryPanel'));
const LogsPanel = lazy(() => import('@/components/admin/LogsPanel'));
const MeshPanel = lazy(() => import('@/components/admin/MeshPanel'));

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-[var(--text-secondary)] text-sm">Loading...</div>
    </div>
  );
}

export default function App() {
  return (
    <ConfigProvider>
      <Layout>
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="/" element={<ChatView />} />
            <Route path="/overview" element={<OverviewPanel />} />
            <Route path="/agents" element={<AgentsPanel />} />
            <Route path="/sessions" element={<SessionsPanel />} />
            <Route path="/settings" element={<SettingsPanel />} />
            <Route path="/channels" element={<ChannelsPanel />} />
            <Route path="/skills" element={<SkillsPanel />} />
            <Route path="/telemetry" element={<TelemetryPanel />} />
            <Route path="/logs" element={<LogsPanel />} />
            <Route path="/mesh" element={<MeshPanel />} />
          </Routes>
        </Suspense>
      </Layout>
    </ConfigProvider>
  );
}
