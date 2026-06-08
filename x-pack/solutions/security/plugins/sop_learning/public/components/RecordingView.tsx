import React, { useState } from 'react';
import { CoreStart } from '@kbn/core/public';
import {
  EuiPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiButton,
  EuiButtonEmpty,
  EuiFieldText,
  EuiFormRow,
  EuiSelect,
  EuiSpacer,
  EuiText,
  EuiComment,
  EuiBadge,
  EuiCallOut,
  EuiTextArea,
} from '@elastic/eui';
import { SopLearningService } from '../services/api';

interface Props {
  service: SopLearningService;
  core: CoreStart;
}

const WORKFLOW_TYPES = [
  { value: 'alert_triage', text: 'Alert Triage' },
  { value: 'threat_hunt', text: 'Threat Hunting' },
  { value: 'incident_response', text: 'Incident Response' },
  { value: 'case_management', text: 'Case Management' },
];

const TRIAGE_ACTIONS = [
  { type: 'alert.opened', category: 'alert', label: 'Open Alert', icon: '📋' },
  { type: 'query.process_tree', category: 'query', label: 'Check Process Tree', icon: '🌳' },
  { type: 'query.lateral_movement', category: 'query', label: 'Check Lateral Movement', icon: '🔀' },
  { type: 'enrichment.user_lookup', category: 'enrichment', label: 'Lookup User', icon: '👤' },
  { type: 'enrichment.threat_intel', category: 'enrichment', label: 'Check Threat Intel', icon: '🔍' },
  { type: 'response.isolate_host', category: 'response', label: 'Isolate Host', icon: '🔒' },
  { type: 'case.create', category: 'case', label: 'Create Case', icon: '📂' },
  { type: 'case.escalate', category: 'case', label: 'Escalate to IR', icon: '🚨' },
  { type: 'alert.close_fp', category: 'alert', label: 'Close as False Positive', icon: '✅' },
  { type: 'alert.close_tp', category: 'alert', label: 'Close as True Positive', icon: '⚠️' },
];

export function RecordingView({ service, core }: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [workflowType, setWorkflowType] = useState('alert_triage');
  const [workflowLabel, setWorkflowLabel] = useState('');
  const [narration, setNarration] = useState('');
  const [events, setEvents] = useState<Array<{ type: string; description: string; narration?: string; timestamp: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  async function startRecording() {
    try {
      setError(null);
      const session = await service.startRecording(workflowType, workflowLabel || 'Unnamed session');
      setSessionId(session.id);
      setIsRecording(true);
      setEvents([]);
      core.notifications.toasts.addSuccess('Recording started');
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function performAction(action: typeof TRIAGE_ACTIONS[0]) {
    if (!sessionId) return;
    const description = `${action.label}`;
    try {
      await service.recordEvent(sessionId, {
        event_type: action.type,
        category: action.category,
        description,
        narration: narration || undefined,
      });
      setEvents((prev) => [...prev, {
        type: action.type,
        description,
        narration: narration || undefined,
        timestamp: new Date().toISOString(),
      }]);
      setNarration('');
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function stopRecording() {
    if (!sessionId) return;
    try {
      await service.stopRecording(sessionId);
      setIsRecording(false);
      core.notifications.toasts.addSuccess(`Recording saved (${events.length} events)`);
    } catch (e: any) {
      setError(e.message);
    }
  }

  if (!isRecording) {
    return (
      <EuiPanel paddingSize="l">
        <EuiText>
          <h3>Start a Recording Session</h3>
          <p>Record your triage workflow. Click actions as you perform them, and narrate your reasoning.</p>
        </EuiText>
        <EuiSpacer />
        <EuiFlexGroup>
          <EuiFlexItem grow={false}>
            <EuiFormRow label="Workflow type">
              <EuiSelect
                options={WORKFLOW_TYPES}
                value={workflowType}
                onChange={(e) => setWorkflowType(e.target.value)}
              />
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiFormRow label="Session label">
              <EuiFieldText
                placeholder="e.g. Ransomware alert triage"
                value={workflowLabel}
                onChange={(e) => setWorkflowLabel(e.target.value)}
              />
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFormRow hasEmptyLabelSpace>
              <EuiButton fill color="danger" onClick={startRecording} iconType="dot">
                Start Recording
              </EuiButton>
            </EuiFormRow>
          </EuiFlexItem>
        </EuiFlexGroup>
        {error && (
          <>
            <EuiSpacer />
            <EuiCallOut title="Error" color="danger">{error}</EuiCallOut>
          </>
        )}
      </EuiPanel>
    );
  }

  return (
    <EuiFlexGroup gutterSize="l">
      {/* Left: Actions + Narration */}
      <EuiFlexItem grow={2}>
        <EuiPanel paddingSize="l">
          <EuiFlexGroup alignItems="center" gutterSize="s">
            <EuiFlexItem grow={false}>
              <EuiBadge color="danger" iconType="dot">Recording</EuiBadge>
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiText size="s" color="subdued">{events.length} events captured</EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty color="danger" onClick={stopRecording} iconType="stop" size="s">
                Stop Recording
              </EuiButtonEmpty>
            </EuiFlexItem>
          </EuiFlexGroup>

          <EuiSpacer />

          <EuiFormRow label="Narrate your reasoning (before each action)" fullWidth>
            <EuiTextArea
              placeholder="Why are you taking this next step? What are you looking for?"
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              rows={2}
              fullWidth
            />
          </EuiFormRow>

          <EuiSpacer />

          <EuiText size="xs" color="subdued"><strong>Investigation Actions</strong></EuiText>
          <EuiSpacer size="s" />
          <EuiFlexGroup wrap gutterSize="s">
            {TRIAGE_ACTIONS.filter((a) => ['query', 'enrichment'].includes(a.category)).map((action) => (
              <EuiFlexItem key={action.type} grow={false}>
                <EuiButton size="s" onClick={() => performAction(action)}>
                  {action.icon} {action.label}
                </EuiButton>
              </EuiFlexItem>
            ))}
          </EuiFlexGroup>

          <EuiSpacer />

          <EuiText size="xs" color="subdued"><strong>Response Actions</strong></EuiText>
          <EuiSpacer size="s" />
          <EuiFlexGroup wrap gutterSize="s">
            {TRIAGE_ACTIONS.filter((a) => ['response', 'case', 'alert'].includes(a.category)).map((action) => (
              <EuiFlexItem key={action.type} grow={false}>
                <EuiButton
                  size="s"
                  color={action.category === 'response' ? 'danger' : action.type.includes('close_fp') ? 'success' : 'warning'}
                  onClick={() => performAction(action)}
                >
                  {action.icon} {action.label}
                </EuiButton>
              </EuiFlexItem>
            ))}
          </EuiFlexGroup>
        </EuiPanel>
      </EuiFlexItem>

      {/* Right: Event Timeline */}
      <EuiFlexItem grow={1}>
        <EuiPanel paddingSize="l">
          <EuiText size="s"><strong>Event Timeline</strong></EuiText>
          <EuiSpacer size="s" />
          {events.length === 0 ? (
            <EuiText size="s" color="subdued">Events will appear here as you perform actions.</EuiText>
          ) : (
            events.map((event, i) => (
              <EuiComment
                key={i}
                username="You"
                event={event.description}
                timestamp={new Date(event.timestamp).toLocaleTimeString()}
                timelineAvatar="user"
              >
                {event.narration && (
                  <EuiText size="xs" color="subdued"><em>"{event.narration}"</em></EuiText>
                )}
              </EuiComment>
            ))
          )}
        </EuiPanel>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
}
