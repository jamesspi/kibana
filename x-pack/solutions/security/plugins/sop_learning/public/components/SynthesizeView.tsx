/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  EuiPanel,
  EuiFieldText,
  EuiFormRow,
  EuiButton,
  EuiButtonEmpty,
  EuiSpacer,
  EuiText,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiCodeBlock,
  EuiMarkdownFormat,
  EuiTabbedContent,
  EuiLoadingSpinner,
  EuiBadge,
  EuiTextArea,
  EuiTitle,
  EuiSelectable,
  EuiFlyout,
  EuiFlyoutHeader,
  EuiFlyoutBody,
  EuiHealth,
  EuiLink,
  EuiEmptyPrompt,
  EuiIconTip,
  useEuiTheme,
} from '@elastic/eui';
import type { EuiSelectableOption } from '@elastic/eui';
import type { SopLearningService } from '../services/api';
import type { SynthesizedSOP, SimilarSOP, RecordingSession } from '../../common';
import { SopSteps, SopDetail } from './SopDetail';
import { SOP_ROOT_CLASS } from './theme';

interface Connector {
  id: string;
  name: string;
  connectorTypeId: string;
  visionCapable: boolean;
}

/**
 * Flyout previewing an existing similar SOP so the analyst can inspect it
 * before deciding to synthesize a new one.
 */
function SimilarSOPFlyout({ sop, onClose }: { sop: SimilarSOP; onClose: () => void }) {
  return (
    <EuiFlyout onClose={onClose} size="m" aria-labelledby="similarSopFlyoutTitle" className={SOP_ROOT_CLASS}>
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size="m">
          <h2 id="similarSopFlyoutTitle">{sop.name ?? sop.id}</h2>
        </EuiTitle>
        <EuiSpacer size="s" />
        <EuiFlexGroup gutterSize="xs" wrap responsive={false} alignItems="center">
          {typeof sop.confidence === 'number' && (
            <EuiFlexItem grow={false}>
              <EuiBadge color="success">{Math.round(sop.confidence * 100)}% confidence</EuiBadge>
            </EuiFlexItem>
          )}
          {typeof sop.score === 'number' && (
            <EuiFlexItem grow={false}>
              <EuiBadge color="hollow" iconType="kqlSelector">
                vector score {sop.score.toFixed(3)}
              </EuiBadge>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        {sop.description && (
          <>
            <EuiText size="s">{sop.description}</EuiText>
            <EuiSpacer />
          </>
        )}
        {sop.match_reasons && sop.match_reasons.length > 0 && (
          <>
            <EuiTitle size="xxs">
              <h4>Why it matched</h4>
            </EuiTitle>
            <EuiSpacer size="xs" />
            <EuiText size="s">
              <ul>
                {sop.match_reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </EuiText>
            <EuiSpacer />
          </>
        )}
        {sop.tool_ids && sop.tool_ids.length > 0 && (
          <>
            <EuiTitle size="xxs">
              <h4>Agent tools used</h4>
            </EuiTitle>
            <EuiSpacer size="xs" />
            <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
              {sop.tool_ids.map((t) => (
                <EuiFlexItem grow={false} key={t}>
                  <EuiBadge color="primary" iconType="compute">
                    {t}
                  </EuiBadge>
                </EuiFlexItem>
              ))}
            </EuiFlexGroup>
            <EuiSpacer />
          </>
        )}
        <EuiTitle size="xxs">
          <h4>Steps</h4>
        </EuiTitle>
        <EuiSpacer size="s" />
        {sop.steps && sop.steps.length > 0 ? (
          <SopSteps steps={sop.steps} />
        ) : (
          <EuiText size="s" color="subdued">
            <em>This SOP has no detailed steps stored (created before step preview was added).</em>
          </EuiText>
        )}
      </EuiFlyoutBody>
    </EuiFlyout>
  );
}

interface Props {
  service: SopLearningService;
  /**
   * Sessions handed off from the Sessions tab. Used only to SEED the in-tab
   * selection; the Synthesize tab also loads the full session list itself so it
   * works standalone (arrived at directly, with nothing preselected).
   */
  preselectedIds: string[];
  /**
   * Called once a synthesis succeeds so the parent can signal other views
   * (e.g. Deploy) to re-fetch their SOP list without a manual page reload.
   */
  onSynthesized?: () => void;
}

export function SynthesizeView({ service, preselectedIds, onSynthesized }: Props) {
  const { euiTheme } = useEuiTheme();
  const [sopName, setSopName] = useState('');
  const [sopDescription, setSopDescription] = useState('');
  const [connectorId, setConnectorId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SynthesizedSOP | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Connectors for the dropdown.
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [connectorsLoaded, setConnectorsLoaded] = useState(false);

  // In-tab session selection (so the tab works standalone, not just via handoff).
  const [sessions, setSessions] = useState<RecordingSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>(preselectedIds);

  // Similar-SOP discovery + preview.
  const [similar, setSimilar] = useState<SimilarSOP[]>([]);
  const [previewSop, setPreviewSop] = useState<SimilarSOP | null>(null);

  // Load AI connectors for the dropdown.
  useEffect(() => {
    let cancelled = false;
    service
      .getConnectors()
      .then((list) => {
        if (cancelled) return;
        setConnectors(list);
        // Default to the first vision-capable connector, else the first AI connector.
        const preferred = list.find((c) => c.visionCapable) ?? list[0];
        if (preferred) setConnectorId((prev) => prev || preferred.id);
      })
      .catch(() => {
        if (!cancelled) setConnectors([]);
      })
      .finally(() => {
        if (!cancelled) setConnectorsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [service]);

  // Load the completed sessions the analyst can synthesize from.
  useEffect(() => {
    let cancelled = false;
    setSessionsLoading(true);
    service
      .getSessions()
      .then((all) => {
        if (cancelled) return;
        setSessions(all.filter((s) => s.status === 'completed' || s.status === 'synthesized'));
      })
      .catch((e: any) => {
        if (!cancelled) setSessionsError(e.message);
      })
      .finally(() => {
        if (!cancelled) setSessionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [service]);

  // Keep the selection in sync if the Sessions tab hands off a new set.
  useEffect(() => {
    if (preselectedIds.length) setSelectedIds(preselectedIds);
  }, [preselectedIds]);

  // Surface already-existing similar SOPs whenever the selection changes.
  useEffect(() => {
    let cancelled = false;
    if (selectedIds.length === 0) {
      setSimilar([]);
      return;
    }
    service
      .findSimilarSOPs(selectedIds, 5)
      .then((resp) => {
        if (!cancelled) setSimilar(resp.similar ?? []);
      })
      .catch(() => {
        if (!cancelled) setSimilar([]);
      });
    return () => {
      cancelled = true;
    };
  }, [service, selectedIds]);

  const sessionOptions: EuiSelectableOption[] = useMemo(
    () =>
      sessions.map((s) => ({
        label: s.workflow_label || s.id,
        key: s.id,
        checked: selectedIds.includes(s.id) ? 'on' : undefined,
        append: (
          <EuiFlexGroup gutterSize="xs" responsive={false} alignItems="center">
            <EuiFlexItem grow={false}>
              <EuiBadge color="hollow">{(s.workflow_type || 'sop').replace(/_/g, ' ')}</EuiBadge>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiBadge color="hollow">{s.event_count} ev</EuiBadge>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiHealth
                color={
                  s.status === 'synthesized' ? euiTheme.colors.success : euiTheme.colors.primary
                }
              >
                <EuiText size="xs">{s.status}</EuiText>
              </EuiHealth>
            </EuiFlexItem>
          </EuiFlexGroup>
        ),
      })),
    [sessions, selectedIds, euiTheme]
  );

  const selectedConnector = connectors.find((c) => c.id === connectorId);

  function onSessionSelectionChange(options: EuiSelectableOption[]) {
    setSelectedIds(
      options.filter((o) => o.checked === 'on').map((o) => (o.key ?? o.label) as string)
    );
  }

  const canSynthesize = !!sopName && !!connectorId && selectedIds.length > 0;

  async function runSynthesis() {
    if (!canSynthesize) return;
    setLoading(true);
    setError(null);
    try {
      const sop = await service.synthesize(selectedIds, sopName, connectorId, sopDescription);
      setResult(sop);
      // Tell the parent a new SOP now exists so the Deploy view refreshes its
      // list without a manual page reload.
      onSynthesized?.();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <EuiFlexGroup gutterSize="l" alignItems="flexStart">
        {/* LEFT: inputs */}
        <EuiFlexItem grow={2}>
          <EuiPanel paddingSize="l">
            <EuiTitle size="s">
              <h3
                style={{
                  fontSize: '1.375rem',
                  fontWeight: 700,
                }}
              >
                Synthesize SOP
              </h3>
            </EuiTitle>
            <EuiSpacer size="xs" />
            <EuiText size="s" color="subdued">
              <p>
                Select recorded sessions, then generate a standard operating procedure grounded in
                the real Agent Builder tools.
              </p>
            </EuiText>
            <EuiSpacer />

            <EuiFormRow label="SOP name" fullWidth>
              <EuiFieldText
                fullWidth
                placeholder="e.g. Ransomware Alert Triage"
                value={sopName}
                onChange={(e) => setSopName(e.target.value)}
              />
            </EuiFormRow>

            <EuiFormRow label="Description (optional)" fullWidth>
              <EuiTextArea
                fullWidth
                placeholder="When this SOP should be used..."
                value={sopDescription}
                onChange={(e) => setSopDescription(e.target.value)}
                rows={2}
              />
            </EuiFormRow>

            <EuiFormRow
              label={
                <span>
                  Model connector{' '}
                  <EuiIconTip
                    type="question"
                    content="The LLM endpoint used for synthesis. Synthesis runs through the Agent Builder agent (tool-grounded). When screen frames were captured, the model is called directly with vision so it can see the screens — pick a vision-capable connector for that."
                  />
                </span>
              }
              helpText={
                selectedConnector
                  ? selectedConnector.visionCapable
                    ? 'Vision-capable: screen frames will be sent to the model.'
                    : 'Text-only connector: screen frames will not be analyzed.'
                  : 'Choose an AI connector (Stack Management › Connectors).'
              }
              fullWidth
            >
              {connectors.length > 0 ? (
                <div
                  style={{
                    maxHeight: 168,
                    overflowY: 'auto',
                    paddingRight: euiTheme.size.xs,
                    border: `1px solid ${euiTheme.colors.borderBaseSubdued}`,
                    borderRadius: euiTheme.border.radius.medium,
                    padding: euiTheme.size.s,
                  }}
                >
                  <EuiFlexGroup gutterSize="s" responsive={false} wrap>
                    {connectors.map((c) => {
                      const selected = c.id === connectorId;
                      return (
                        <EuiFlexItem key={c.id} grow={false} style={{ minWidth: 150, maxWidth: 200 }}>
                          <EuiPanel
                            hasShadow={false}
                            hasBorder
                            paddingSize="s"
                            onClick={() => setConnectorId(c.id)}
                            style={{
                              cursor: 'pointer',
                              textAlign: 'left' as const,
                              height: '100%',
                              borderColor: selected ? euiTheme.colors.primary : undefined,
                              backgroundColor: selected
                                ? euiTheme.colors.backgroundBasePrimary
                                : undefined,
                            }}
                          >
                            <EuiText size="xs">
                              <strong>{c.name}</strong>
                            </EuiText>
                            <EuiText size="xs" color="subdued">
                              {c.connectorTypeId}
                            </EuiText>
                            {c.visionCapable && (
                              <>
                                <EuiSpacer size="xs" />
                                <EuiBadge color="accent" iconType="image">
                                  vision
                                </EuiBadge>
                              </>
                            )}
                          </EuiPanel>
                        </EuiFlexItem>
                      );
                    })}
                  </EuiFlexGroup>
                </div>
              ) : (
                <EuiFieldText
                  fullWidth
                  placeholder={
                    connectorsLoaded ? 'No AI connectors found — enter an id' : 'Loading connectors…'
                  }
                  value={connectorId}
                  onChange={(e) => setConnectorId(e.target.value)}
                />
              )}
            </EuiFormRow>

            <EuiSpacer />

            <EuiFormRow
              label={`Sessions to synthesize from (${selectedIds.length} selected)`}
              fullWidth
            >
              <>
                {sessionsError && (
                  <EuiCallOut size="s" color="danger" title="Could not load sessions">
                    {sessionsError}
                  </EuiCallOut>
                )}
                {!sessionsError && sessions.length === 0 && !sessionsLoading ? (
                  <EuiCallOut size="s" color="warning" iconType="document" title="No sessions yet">
                    Record a workflow first, then return here to synthesize.
                  </EuiCallOut>
                ) : (
                  <EuiSelectable
                    aria-label="Select sessions to synthesize from"
                    searchable
                    isLoading={sessionsLoading}
                    options={sessionOptions}
                    onChange={onSessionSelectionChange}
                    listProps={{ bordered: true, rowHeight: 40 }}
                    height={220}
                  >
                    {(list, search) => (
                      <>
                        {search}
                        {list}
                      </>
                    )}
                  </EuiSelectable>
                )}
              </>
            </EuiFormRow>

            {similar.length > 0 && (
              <>
                <EuiSpacer />
                <EuiCallOut
                  title={`${similar.length} similar SOP${
                    similar.length !== 1 ? 's' : ''
                  } already exist`}
                  color="warning"
                  iconType="search"
                >
                  <EuiText size="s">
                    <p>You may not need to synthesize a new one — review the closest matches:</p>
                  </EuiText>
                  {similar.map((s) => (
                    <EuiPanel
                      key={s.id}
                      hasShadow={false}
                      hasBorder
                      paddingSize="s"
                      style={{ marginBottom: euiTheme.size.s }}
                    >
                      <EuiFlexGroup alignItems="baseline" gutterSize="s" responsive={false}>
                        <EuiFlexItem>
                          <EuiLink onClick={() => setPreviewSop(s)}>
                            <strong>{s.name ?? s.id}</strong>
                          </EuiLink>
                        </EuiFlexItem>
                        {typeof s.score === 'number' && (
                          <EuiFlexItem grow={false}>
                            <EuiBadge color="hollow">score {s.score.toFixed(3)}</EuiBadge>
                          </EuiFlexItem>
                        )}
                        <EuiFlexItem grow={false}>
                          <EuiButtonEmpty
                            size="xs"
                            iconType="inspect"
                            onClick={() => setPreviewSop(s)}
                          >
                            Preview
                          </EuiButtonEmpty>
                        </EuiFlexItem>
                      </EuiFlexGroup>
                      {s.match_reasons && s.match_reasons.length > 0 && (
                        <EuiText size="xs" color="subdued">
                          Matches on: {s.match_reasons.join('; ')}
                        </EuiText>
                      )}
                    </EuiPanel>
                  ))}
                </EuiCallOut>
              </>
            )}

            <EuiSpacer />

            <EuiButton
              fill
              onClick={runSynthesis}
              disabled={!canSynthesize}
              isLoading={loading}
              iconType="sparkles"
            >
              {loading ? 'Synthesizing...' : 'Generate SOP'}
            </EuiButton>

            {error && (
              <>
                <EuiSpacer />
                <EuiCallOut title="Synthesis failed" color="danger">
                  {error}
                </EuiCallOut>
              </>
            )}
          </EuiPanel>
        </EuiFlexItem>

        {/* RIGHT: generated SOP */}
        <EuiFlexItem grow={3}>
          {loading && (
            <EuiPanel paddingSize="l">
              <EuiFlexGroup justifyContent="center" alignItems="center" direction="column">
                <EuiFlexItem grow={false}>
                  <EuiLoadingSpinner size="xl" />
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiText textAlign="center">
                    <p>
                      Analyzing {selectedIds.length} session{selectedIds.length === 1 ? '' : 's'}{' '}
                      and synthesizing SOP...
                    </p>
                  </EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiPanel>
          )}

          {!loading && !result && (
            <EuiPanel paddingSize="l" color="subdued">
              <EuiEmptyPrompt
                iconType="sparkles"
                title={<h3>No SOP generated yet</h3>}
                body={
                  <EuiText size="s">
                    <p>
                      Pick one or more sessions on the left, name the SOP, choose a connector, then
                      generate. The result, its reasoning, and provenance will appear here.
                    </p>
                  </EuiText>
                }
              />
            </EuiPanel>
          )}

          {result && !loading && (
            <EuiPanel paddingSize="l">
              <EuiTitle size="s">
                <h3>{result.name}</h3>
              </EuiTitle>
              <EuiSpacer size="s" />

              <SopDetail sop={result} />

              <EuiSpacer />
              <EuiTabbedContent
                tabs={[
                  {
                    id: 'skill',
                    name: 'Agent Builder Skill',
                    content: (
                      <EuiPanel paddingSize="m" hasShadow={false} style={{ background: '#07101F', borderRadius: 6, maxHeight: 300, overflow: 'auto' }}>
                        <EuiMarkdownFormat textSize="s" style={{ color: '#D5DEEC' }}>
                          {result.skill_output ?? 'No skill output generated'}
                        </EuiMarkdownFormat>
                      </EuiPanel>
                    ),
                  },
                  {
                    id: 'workflow',
                    name: 'Elastic Workflow',
                    content: (
                      <>
                        <EuiSpacer size="s" />
                        {result.workflow_generated_via === 'agent_builder_nl' ? (
                          <EuiCallOut
                            size="s"
                            color="success"
                            iconType="bolt"
                            title="Authored by Agent Builder / Workflows natural-language workflow authoring"
                          >
                            <EuiText size="xs">
                              <p>
                                This YAML was generated by the real Agent Builder / Workflows NL
                                workflow-authoring capability (Tech Preview) and validated against
                                the Workflow schema, not hand-written by this plugin.
                              </p>
                            </EuiText>
                          </EuiCallOut>
                        ) : (
                          <EuiCallOut
                            size="s"
                            color="warning"
                            iconType="wrench"
                            title="Generated by the local fallback workflow builder"
                          >
                            <EuiText size="xs">
                              <p>
                                The NL workflow-authoring capability was unavailable or failed, so
                                this YAML came from the plugin&apos;s local builder.
                                {result.workflow_generation_note
                                  ? ` (${result.workflow_generation_note})`
                                  : ''}
                              </p>
                            </EuiText>
                          </EuiCallOut>
                        )}
                        <EuiSpacer size="s" />
                        <EuiCodeBlock language="yaml" fontSize="s" paddingSize="m" isCopyable>
                          {result.workflow_output ?? 'No workflow output generated'}
                        </EuiCodeBlock>
                      </>
                    ),
                  },
                ]}
              />
            </EuiPanel>
          )}
        </EuiFlexItem>
      </EuiFlexGroup>

      {previewSop && <SimilarSOPFlyout sop={previewSop} onClose={() => setPreviewSop(null)} />}
    </>
  );
}
