import React, { useState, useEffect } from 'react';
import { EuiPanel, EuiBasicTable, EuiButton, EuiButtonIcon, EuiSpacer, EuiText, EuiBadge, EuiIcon, EuiLink, EuiToolTip, EuiFlexGroup, EuiFlexItem, EuiCallOut, EuiFlyout, EuiFlyoutBody, EuiFlyoutHeader, EuiTitle, EuiButtonEmpty, EuiCodeBlock, EuiModal, EuiModalHeader, EuiModalHeaderTitle, EuiModalBody, EuiModalFooter, EuiForm, EuiFormRow, EuiFieldText, EuiComboBox, EuiConfirmModal, useEuiTheme } from '@elastic/eui';
import type { EuiBasicTableColumn, EuiComboBoxOptionOption } from '@elastic/eui';
import { SopLearningService } from '../services/api';
import { RecordingSession, RecordedEvent, SOP_TYPE_PRESETS } from '../../common';
import { SOP_ROOT_CLASS } from './theme';

/** Sentence-case a snake/Title-cased workflow type for display (e.g. "Alert triage"). */
function sentenceCaseType(t?: string): string {
  if (!t) return '';
  const spaced = t.replace(/_/g, ' ').trim().toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Map a session status to an EUI badge color (success/primary/danger/default). */
function statusBadgeColor(status: string): 'success' | 'primary' | 'accent' | 'danger' | 'default' {
  switch (status) {
    case 'completed':
      return 'success';
    case 'synthesized':
      return 'primary';
    case 'recording':
      return 'danger';
    default:
      return 'default';
  }
}

interface Props {
  service: SopLearningService;
  onSynthesizeSelected: (ids: string[]) => void;
}

export function SessionsView({ service, onSynthesizeSelected }: Props) {
  const { euiTheme } = useEuiTheme();
  const [sessions, setSessions] = useState<RecordingSession[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flyoutSession, setFlyoutSession] = useState<RecordingSession | null>(null);
  const [flyoutEvents, setFlyoutEvents] = useState<RecordedEvent[]>([]);
  const [flyoutMedia, setFlyoutMedia] = useState<Array<{media_type:string;size_bytes:number;data_base64:string}>>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  // Edit-metadata modal state.
  const [editSession, setEditSession] = useState<RecordingSession | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editTypeOptions, setEditTypeOptions] = useState<Array<EuiComboBoxOptionOption<string>>>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete-confirm modal state.
  const [deleteSession, setDeleteSession] = useState<RecordingSession | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Bulk-delete state. `tableKey` is bumped after a bulk delete to remount the
  // table and clear its (uncontrolled) selection checkboxes.
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [tableKey, setTableKey] = useState(0);

  useEffect(() => { loadSessions(); }, []);

  function openEdit(session: RecordingSession) {
    setEditSession(session);
    setEditLabel(session.workflow_label || '');
    setEditTypeOptions(session.workflow_type ? [{ label: session.workflow_type }] : []);
  }

  async function saveEdit() {
    if (!editSession) return;
    setSavingEdit(true);
    setError(null);
    try {
      const workflow_type = editTypeOptions[0]?.label?.trim();
      await service.updateSession(editSession.id, {
        workflow_label: editLabel.trim(),
        ...(workflow_type ? { workflow_type } : {}),
      });
      setEditSession(null);
      await loadSessions();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingEdit(false);
    }
  }

  async function confirmDelete() {
    if (!deleteSession) return;
    setDeleting(true);
    setError(null);
    try {
      await service.deleteSession(deleteSession.id);
      setDeleteSession(null);
      // Drop any open flyout for the deleted session.
      setFlyoutSession((cur) => (cur && cur.id === deleteSession.id ? null : cur));
      await loadSessions();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  }

  async function confirmBulkDelete() {
    const ids = selectedIds;
    if (ids.length === 0) return;
    setBulkDeleting(true);
    setError(null);
    try {
      await service.bulkDeleteSessions(ids);
      setShowBulkDelete(false);
      // Drop any open flyout for a deleted session and clear the selection by
      // remounting the table.
      setFlyoutSession((cur) => (cur && ids.includes(cur.id) ? null : cur));
      setSelectedIds([]);
      setTableKey((k) => k + 1);
      await loadSessions();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBulkDeleting(false);
    }
  }

  async function loadSessions() {
    setLoading(true);
    try { setSessions(await service.getSessions()); } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function forceStop(sessionId: string) {
    try { await service.stopRecording(sessionId); loadSessions(); } catch (e: any) { setError(e.message); }
  }

  async function forceStopAll() {
    for (const s of sessions.filter(s => s.status === 'recording')) {
      try { await service.stopRecording(s.id); } catch {}
    }
    loadSessions();
  }

  async function openSession(session: RecordingSession) {
    setFlyoutSession(session);
    setLoadingEvents(true);
    setFlyoutMedia([]);
    try { const r = await service.getSession(session.id); setFlyoutEvents(r.events ?? []); }
    catch { setFlyoutEvents([]); }
    try { const m = await service.getMedia(session.id); setFlyoutMedia(m); }
    catch { setFlyoutMedia([]); }
    finally { setLoadingEvents(false); }
  }

  // EUI glyphs (never emoji): color + icon travel together so meaning never
  // rests on color alone.
  const EVENT_ICON: Record<string, string> = {
    query: 'search',
    alert: 'bell',
    navigation: 'apps',
    response: 'lock',
    case: 'documents',
    interaction: 'clickLeft',
    annotation: 'quote',
    system: 'gear',
  };
  function borderColor(cat: string) {
    return {
      query: euiTheme.colors.primary,
      alert: euiTheme.colors.warning,
      response: euiTheme.colors.danger,
      case: euiTheme.colors.accent,
      interaction: euiTheme.colors.primary,
      annotation: euiTheme.colors.success,
      navigation: euiTheme.colors.textSubdued,
    }[cat] ?? euiTheme.colors.borderBasePlain;
  }

  const numericCellStyle: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' };

  const columns: Array<EuiBasicTableColumn<RecordingSession>> = [
    { field: 'workflow_label', name: 'Label', sortable: true, render: (label: string, session: RecordingSession) => (
      <EuiLink onClick={() => openSession(session)}>{label || 'Unnamed'}</EuiLink>
    )},
    { field: 'analyst_name', name: 'Analyst', sortable: true },
    { field: 'workflow_type', name: 'Type', render: (t: string) => <EuiBadge color="hollow">{sentenceCaseType(t)}</EuiBadge> },
    { field: 'started_at', name: 'Started', sortable: true, render: (ts: string) => ts ? new Date(ts).toLocaleString() : '-' },
    { field: 'event_count', name: 'Events', sortable: true, align: 'right', render: (n: number) => <span style={numericCellStyle}>{n}</span> },
    { field: 'status', name: 'Status', render: (s: string) => <EuiBadge color={statusBadgeColor(s)}>{s}</EuiBadge> },
    { name: 'Actions', width: '120px', align: 'right', render: (session: RecordingSession) => (
      <EuiFlexGroup gutterSize="xs" responsive={false} justifyContent="flexEnd" alignItems="center">
        <EuiFlexItem grow={false}>
          <EuiToolTip content="View captured events">
            <EuiButtonIcon size="xs" aria-label={`View ${session.workflow_label || 'session'}`} onClick={() => openSession(session)} iconType="inspect" />
          </EuiToolTip>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiToolTip content="Edit label & type">
            <EuiButtonIcon size="xs" aria-label={`Edit ${session.workflow_label || 'session'}`} onClick={() => openEdit(session)} iconType="pencil" />
          </EuiToolTip>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiToolTip content="Delete session">
            <EuiButtonIcon size="xs" color="danger" aria-label={`Delete ${session.workflow_label || 'session'}`} onClick={() => setDeleteSession(session)} iconType="trash" />
          </EuiToolTip>
        </EuiFlexItem>
        {session.status === 'recording' && (
          <EuiFlexItem grow={false}>
            <EuiToolTip content="Stop recording">
              <EuiButtonIcon size="xs" color="danger" aria-label={`Stop ${session.workflow_label || 'session'}`} onClick={() => forceStop(session.id)} iconType="stop" />
            </EuiToolTip>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
    )},
  ];

  const selection = {
    onSelectionChange: (sel: RecordingSession[]) => setSelectedIds(sel.map(s => s.id)),
    selectable: (s: RecordingSession) => s.status === 'completed',
    selectableMessage: (ok: boolean) => ok ? '' : 'Only completed sessions',
  };

  return (
    <>
      <EuiPanel paddingSize="l" hasShadow={false} hasBorder>
        <EuiFlexGroup alignItems="center" gutterSize="m" responsive={false} wrap>
          <EuiFlexItem>
            <EuiTitle size="s">
              <h3>Recorded sessions</h3>
            </EuiTitle>
            <EuiSpacer size="xs" />
            <EuiText size="s" color="subdued">
              <p>Click a session to see captured events. Select sessions to synthesize.</p>
            </EuiText>
          </EuiFlexItem>
          {sessions.some((s) => s.status === 'recording') && (
            <EuiFlexItem grow={false}>
              <EuiButton color="danger" size="s" onClick={forceStopAll} iconType="stop">
                Stop all ({sessions.filter((s) => s.status === 'recording').length})
              </EuiButton>
            </EuiFlexItem>
          )}
          <EuiFlexItem grow={false}>
            <EuiButton color="danger" size="s" disabled={selectedIds.length === 0} onClick={() => setShowBulkDelete(true)} iconType="trash">
              Delete ({selectedIds.length})
            </EuiButton>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton fill size="s" disabled={selectedIds.length === 0} onClick={() => onSynthesizeSelected(selectedIds)} iconType="sparkles">
              Synthesize ({selectedIds.length})
            </EuiButton>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton size="s" onClick={loadSessions} iconType="refresh">
              Refresh
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer />
        {error && (
          <>
            <EuiCallOut title="Error" color="danger" iconType="warning">
              {error}
            </EuiCallOut>
            <EuiSpacer />
          </>
        )}
        <EuiBasicTable key={tableKey} items={sessions} columns={columns} itemId="id" selection={selection} loading={loading} noItemsMessage="No sessions yet. Click &quot;Record SOP&quot; in the header to start." />
      </EuiPanel>

      {flyoutSession && (
        <EuiFlyout onClose={() => setFlyoutSession(null)} size="m" className={SOP_ROOT_CLASS}>
          <EuiFlyoutHeader hasBorder>
            <EuiTitle size="m"><h2>{flyoutSession.workflow_label || 'Session'}</h2></EuiTitle>
            <EuiSpacer size="s" />
            <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap>
              <EuiFlexItem grow={false}><EuiBadge color="hollow">{sentenceCaseType(flyoutSession.workflow_type)}</EuiBadge></EuiFlexItem>
              <EuiFlexItem grow={false}><EuiBadge color={statusBadgeColor(flyoutSession.status)}>{flyoutSession.status}</EuiBadge></EuiFlexItem>
              <EuiFlexItem grow={false}><EuiText size="xs" color="subdued">{flyoutSession.analyst_name} · {flyoutSession.event_count} events</EuiText></EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlyoutHeader>
          <EuiFlyoutBody>
            {loadingEvents ? <EuiText size="s" color="subdued">Loading…</EuiText> : flyoutEvents.length === 0 && flyoutMedia.length === 0 ? (
              <EuiCallOut title="No events" color="warning" iconType="warning">No events recorded for this session.</EuiCallOut>
            ) : (
              <div>
                {flyoutMedia.length > 0 && (
                  <>
                    <EuiTitle size="xxs"><h4>Recordings</h4></EuiTitle>
                    <EuiSpacer size="s" />
                    <EuiFlexGroup gutterSize="s" responsive={false} wrap>
                      {flyoutMedia.filter((m) => m.media_type === 'video').map((m, i) => (
                        <EuiFlexItem key={`v${i}`}>
                          <EuiPanel color="subdued" hasShadow={false} hasBorder paddingSize="s">
                            <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                              <EuiFlexItem grow={false}><EuiIcon type="videoPlayer" color="primary" /></EuiFlexItem>
                              <EuiFlexItem><EuiText size="xs" color="subdued">Screen .webm · {Math.round(m.size_bytes / 1024)} KB</EuiText></EuiFlexItem>
                            </EuiFlexGroup>
                            <EuiSpacer size="xs" />
                            <video controls style={{ width: '100%', maxHeight: 200, borderRadius: euiTheme.border.radius.medium }} src={`data:video/webm;base64,${m.data_base64}`} />
                          </EuiPanel>
                        </EuiFlexItem>
                      ))}
                      {flyoutMedia.filter((m) => m.media_type === 'audio').map((m, i) => (
                        <EuiFlexItem key={`a${i}`}>
                          <EuiPanel color="subdued" hasShadow={false} hasBorder paddingSize="s">
                            <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                              <EuiFlexItem grow={false}><EuiIcon type="quote" color="accent" /></EuiFlexItem>
                              <EuiFlexItem><EuiText size="xs" color="subdued">Voice .webm · {Math.round(m.size_bytes / 1024)} KB</EuiText></EuiFlexItem>
                            </EuiFlexGroup>
                            <EuiSpacer size="xs" />
                            <audio controls style={{ width: '100%' }} src={`data:audio/webm;base64,${m.data_base64}`} />
                          </EuiPanel>
                        </EuiFlexItem>
                      ))}
                    </EuiFlexGroup>
                    <EuiSpacer size="l" />
                  </>
                )}
                <EuiTitle size="xxs"><h4>{flyoutEvents.length} captured events</h4></EuiTitle>
                <EuiSpacer size="m" />
                {flyoutEvents.map((event, i) => (
                  <div key={i} style={{ marginBottom: euiTheme.size.m, paddingLeft: euiTheme.size.s, borderLeft: `${euiTheme.border.width.thick} solid ${borderColor(event.category)}` }}>
                    <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                      <EuiFlexItem grow={false}><EuiIcon type={EVENT_ICON[event.category] ?? 'dot'} size="s" color="subdued" /></EuiFlexItem>
                      <EuiFlexItem><EuiText size="s"><strong>{event.event_type}</strong></EuiText></EuiFlexItem>
                      <EuiFlexItem grow={false}><EuiText size="xs" color="subdued">{event['@timestamp'] ? new Date(event['@timestamp']).toLocaleTimeString() : ''}</EuiText></EuiFlexItem>
                    </EuiFlexGroup>
                    <EuiText size="xs" style={{ marginLeft: euiTheme.size.l, marginTop: euiTheme.size.xxs }}>{event.description}</EuiText>
                    {event.narration && <EuiText size="xs" color="success" style={{ marginLeft: euiTheme.size.l, marginTop: euiTheme.size.xs, fontStyle: 'italic' }}>&ldquo;{event.narration}&rdquo;</EuiText>}
                    {event.details && (event.details as any).query_text && (
                      <div style={{ marginLeft: euiTheme.size.l, marginTop: euiTheme.size.xs }}>
                        <EuiCodeBlock language="esql" fontSize="s" paddingSize="s" overflowHeight={120} isCopyable>
                          {(event.details as any).query_text}
                        </EuiCodeBlock>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </EuiFlyoutBody>
        </EuiFlyout>
      )}

      {editSession && (
        <EuiModal onClose={() => setEditSession(null)} initialFocus="[name=sessionLabel]" className={SOP_ROOT_CLASS}>
          <EuiModalHeader>
            <EuiModalHeaderTitle>Edit session</EuiModalHeaderTitle>
          </EuiModalHeader>
          <EuiModalBody>
            <EuiForm component="form">
              <EuiFormRow label="Label">
                <EuiFieldText
                  name="sessionLabel"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  placeholder="e.g. Ransomware alert triage"
                />
              </EuiFormRow>
              <EuiFormRow label="Type" helpText="Pick a preset or type a custom workflow type.">
                <EuiComboBox
                  singleSelection={{ asPlainText: true }}
                  options={SOP_TYPE_PRESETS.map((t) => ({ label: t }))}
                  selectedOptions={editTypeOptions}
                  onChange={(opts) => setEditTypeOptions(opts as Array<EuiComboBoxOptionOption<string>>)}
                  onCreateOption={(value) => setEditTypeOptions([{ label: value.trim() }])}
                  customOptionText="Add {searchValue} as a custom type"
                  isClearable
                />
              </EuiFormRow>
            </EuiForm>
          </EuiModalBody>
          <EuiModalFooter>
            <EuiButtonEmpty onClick={() => setEditSession(null)}>Cancel</EuiButtonEmpty>
            <EuiButton fill onClick={saveEdit} isLoading={savingEdit} disabled={!editLabel.trim()}>
              Save
            </EuiButton>
          </EuiModalFooter>
        </EuiModal>
      )}

      {deleteSession && (
        <EuiConfirmModal
          title={`Delete "${deleteSession.workflow_label || 'session'}"?`}
          onCancel={() => setDeleteSession(null)}
          onConfirm={confirmDelete}
          cancelButtonText="Cancel"
          confirmButtonText="Delete session"
          buttonColor="danger"
          isLoading={deleting}
        >
          <EuiText size="s">
            <p>
              This permanently deletes the session and cascade-deletes all of its captured events,
              media (screen/voice recordings and frames), and its embedding. This cannot be undone.
            </p>
          </EuiText>
        </EuiConfirmModal>
      )}

      {showBulkDelete && (
        <EuiConfirmModal
          title={`Delete ${selectedIds.length} session${selectedIds.length === 1 ? '' : 's'}?`}
          onCancel={() => setShowBulkDelete(false)}
          onConfirm={confirmBulkDelete}
          cancelButtonText="Cancel"
          confirmButtonText={`Delete ${selectedIds.length} session${selectedIds.length === 1 ? '' : 's'}`}
          buttonColor="danger"
          isLoading={bulkDeleting}
        >
          <EuiText size="s">
            <p>
              This permanently deletes the {selectedIds.length} selected session
              {selectedIds.length === 1 ? '' : 's'} AND cascade-deletes all of their captured
              events, media (screen/voice recordings and frames), and embeddings. This cannot be
              undone.
            </p>
          </EuiText>
        </EuiConfirmModal>
      )}
    </>
  );
}
