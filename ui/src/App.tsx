import { lazy, Suspense, useState } from 'react';
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
const VoiceOverlay = lazy(() =>
  import('@/components/voice/VoiceOverlay').then((m) => ({ default: m.VoiceOverlay })),
);

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-[var(--text-secondary)] text-sm">Loading...</div>
    </div>
  );
}

/** Wrapper that adds padding for admin panels (ChatView manages its own layout) */
function AdminPage({ children }: { children: React.ReactNode }) {
  return <div className="p-6 h-full overflow-auto">{children}</div>;
}

export default function App() {
  const [voiceOpen, setVoiceOpen] = useState(false);

  return (
    <ConfigProvider>
      <Layout>
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="/" element={<ChatView onVoiceOpen={() => setVoiceOpen(true)} />} />
            <Route path="/overview" element={<AdminPage><OverviewPanel /></AdminPage>} />
            <Route path="/agents" element={<AdminPage><AgentsPanel /></AdminPage>} />
            <Route path="/sessions" element={<AdminPage><SessionsPanel /></AdminPage>} />
            <Route path="/settings" element={<AdminPage><SettingsPanel /></AdminPage>} />
            <Route path="/channels" element={<AdminPage><ChannelsPanel /></AdminPage>} />
            <Route path="/skills" element={<AdminPage><SkillsPanel /></AdminPage>} />
            <Route path="/telemetry" element={<AdminPage><TelemetryPanel /></AdminPage>} />
            <Route path="/logs" element={<AdminPage><LogsPanel /></AdminPage>} />
            <Route path="/mesh" element={<AdminPage><MeshPanel /></AdminPage>} />
          </Routes>
        </Suspense>
      </Layout>

      {/* Voice overlay — rendered outside Layout so it covers everything */}
      {voiceOpen && (
        <Suspense fallback={null}>
          <VoiceOverlay onClose={() => setVoiceOpen(false)} />
        </Suspense>
      )}
    </ConfigProvider>
  );
}
