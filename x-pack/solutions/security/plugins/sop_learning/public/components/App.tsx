import React, { useState, useMemo } from 'react';
import { CoreStart } from '@kbn/core/public';
import { NavigationPublicPluginStart } from '@kbn/navigation-plugin/public';
import {
  EuiPage,
  EuiPageBody,
  EuiPageHeader,
  EuiTabs,
  EuiTab,
  EuiSpacer,
} from '@elastic/eui';
import { SopLearningService } from '../services/api';
import { SessionsView } from './SessionsView';
import { SynthesizeView } from './SynthesizeView';
import { DeployView } from './DeployView';
import { OverviewView } from './OverviewView';
import { RecordingOverlay } from './RecordingOverlay';
import { DesignSystemOverrides, SOP_ROOT_CLASS } from './theme';

interface Props {
  core: CoreStart;
  navigation: NavigationPublicPluginStart;
  history: any;
}

type TabId = 'overview' | 'sessions' | 'synthesize' | 'deploy';

export function SopLearningApp({ core }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  // Bumped whenever a SOP is created/changed (e.g. a synthesis completes) so
  // the Deploy view re-fetches its list without a manual page reload.
  const [sopsVersion, setSopsVersion] = useState(0);

  const service = useMemo(() => new SopLearningService(core.http), [core.http]);

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'sessions', label: 'Sessions' },
    { id: 'synthesize', label: 'Synthesize SOP' },
    { id: 'deploy', label: 'Deploy' },
  ];

  function onSessionsSelected(ids: string[]) {
    setSelectedSessionIds(ids);
    setActiveTab('synthesize');
  }

  return (
    <div className={SOP_ROOT_CLASS}>
      <DesignSystemOverrides />
      <RecordingOverlay service={service} />

      <EuiPage paddingSize="l" grow={false} style={{ minHeight: 'auto' }}>
        <EuiPageBody restrictWidth>
          <EuiPageHeader
            pageTitle="Protégé"
            description="Record analyst workflows, synthesize standard procedures, and deploy as Agent Builder Skills or Elastic Workflows."
          />
          <EuiTabs>
            {tabs.map((tab) => (
              <EuiTab
                key={tab.id}
                isSelected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </EuiTab>
            ))}
          </EuiTabs>
          <EuiSpacer size="l" />

          {activeTab === 'overview' && <OverviewView service={service} />}
          {activeTab === 'sessions' && (
            <SessionsView service={service} onSynthesizeSelected={onSessionsSelected} />
          )}
          {activeTab === 'synthesize' && (
            <SynthesizeView
              service={service}
              preselectedIds={selectedSessionIds}
              onSynthesized={() => setSopsVersion((v) => v + 1)}
            />
          )}
          {activeTab === 'deploy' && (
            <DeployView
              service={service}
              refreshToken={sopsVersion}
              onSopsChanged={() => setSopsVersion((v) => v + 1)}
            />
          )}
        </EuiPageBody>
      </EuiPage>
    </div>
  );
}
