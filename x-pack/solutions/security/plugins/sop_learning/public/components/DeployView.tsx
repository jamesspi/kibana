/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useGeneratedHtmlId, useEuiTheme } from '@elastic/eui';
import {
  EuiPanel,
  EuiText,
  EuiSpacer,
  EuiButton,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiToolTip,
  EuiFlexGroup,
  EuiFlexItem,
  EuiCodeBlock,
  EuiCallOut,
  EuiBasicTable,
  EuiBadge,
  EuiNotificationBadge,
  EuiTabbedContent,
  EuiTitle,
  EuiModal,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiModalBody,
  EuiModalFooter,
  EuiForm,
  EuiFormRow,
  EuiFieldText,
  EuiTextArea,
  EuiConfirmModal,
  EuiSuperSelect,
  EuiLoadingSpinner,
  EuiPopover,
  EuiContextMenuPanel,
  EuiContextMenuItem,
  EuiHorizontalRule,
  EuiFlyout,
  EuiFlyoutHeader,
  EuiFlyoutBody,
  EuiMarkdownFormat,
} from '@elastic/eui';
import type { EuiBasicTableColumn, EuiSuperSelectOption } from '@elastic/eui';
import { SopLearningService } from '../services/api';
import { SynthesizedSOP } from '../../common';
import { SopDetail, GapFillsPanel, VIA_LABEL } from './SopDetail';
import { SOP_ROOT_CLASS } from './theme';

interface Connector {
  id: string;
  name: string;
  connectorTypeId: string;
  visionCapable: boolean;
}

interface Props {
  service: SopLearningService;
  /**
   * Bumped by the parent whenever a SOP is created/changed elsewhere (e.g. a
   * synthesis completes in the Synthesize tab). When it changes we re-fetch the
   * SOP list and refresh the opened detail, so the new SOP shows without a
   * manual page reload.
   */
  refreshToken?: number;
  /** Notify the parent that this view changed the SOP set (delete/re-synth). */
  onSopsChanged?: () => void;
}

export function DeployView({ service, refreshToken, onSopsChanged }: Props) {
  const { euiTheme } = useEuiTheme();
  const [sops, setSops] = useState<SynthesizedSOP[]>([]);
  const [selectedSop, setSelectedSop] = useState<SynthesizedSOP | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Connectors for re-synthesis.
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [resynthConnectorId, setResynthConnectorId] = useState('');

  // Edit name/description modal state.
  const [editSop, setEditSop] = useState<SynthesizedSOP | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete-confirm state.
  const [deleteSop, setDeleteSop] = useState<SynthesizedSOP | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Bulk-delete state. `tableKey` is bumped after a bulk delete to remount the
  // table and clear its (uncontrolled) selection checkboxes.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [tableKey, setTableKey] = useState(0);

  // Re-synthesis state (keyed by the SOP currently being re-synthesized).
  const [resynthesizing, setResynthesizing] = useState(false);

  // Header actions context-menu open state for the selected SOP.
  const [actionsOpen, setActionsOpen] = useState(false);

  const flyoutTitleId = useGeneratedHtmlId({ prefix: 'sopDetailFlyout' });

  function closeDetail() {
    setSelectedSop(null);
    setActionsOpen(false);
    setDeployResult(null);
    setError(null);
  }

  useEffect(() => {
    loadSOPs();
    service
      .getConnectors()
      .then((list) => {
        setConnectors(list);
        const preferred = list.find((c) => c.visionCapable) ?? list[0];
        if (preferred) setResynthConnectorId((prev) => prev || preferred.id);
      })
      .catch(() => setConnectors([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service]);

  // Re-fetch when the parent signals a SOP changed elsewhere (e.g. a synthesis
  // completed in the Synthesize tab). Skips the very first render, which the
  // mount effect above already covers.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    loadSOPs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  async function loadSOPs() {
    try {
      const result = await service.getSOPs();
      setSops(result);
      // Keep the opened detail in sync with the freshly fetched list (e.g. after
      // an external synthesis re-generated it) without forcing a page reload.
      setSelectedSop((cur) => (cur ? result.find((s) => s.id === cur.id) ?? cur : cur));
    } catch (e: any) {
      setError(e.message);
    }
  }

  function openEdit(sop: SynthesizedSOP) {
    setEditSop(sop);
    setEditName(sop.name || '');
    setEditDescription(sop.description || '');
  }

  async function saveEdit() {
    if (!editSop) return;
    setSavingEdit(true);
    setError(null);
    try {
      const updated = await service.updateSOP(editSop.id, {
        name: editName.trim(),
        description: editDescription,
      });
      setEditSop(null);
      setSelectedSop((cur) => (cur && cur.id === updated.id ? updated : cur));
      await loadSOPs();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingEdit(false);
    }
  }

  async function confirmDelete() {
    if (!deleteSop) return;
    setDeleting(true);
    setError(null);
    try {
      await service.deleteSOP(deleteSop.id);
      setSelectedSop((cur) => (cur && cur.id === deleteSop.id ? null : cur));
      setDeleteSop(null);
      await loadSOPs();
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
      await service.bulkDeleteSOPs(ids);
      setShowBulkDelete(false);
      // Clear the open detail if it was among the deleted SOPs, clear selection
      // by remounting the table, and refresh the list.
      setSelectedSop((cur) => (cur && ids.includes(cur.id) ? null : cur));
      setSelectedIds([]);
      setTableKey((k) => k + 1);
      await loadSOPs();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBulkDeleting(false);
    }
  }

  async function resynthesize(sop: SynthesizedSOP) {
    if (!resynthConnectorId) {
      setError('Pick a connector before re-synthesizing.');
      return;
    }
    setResynthesizing(true);
    setError(null);
    setDeployResult(null);
    try {
      const updated = await service.resynthesizeSOP(sop.id, { connector_id: resynthConnectorId });
      // Refresh the opened detail with the fresh result + the list.
      setSelectedSop(updated);
      await loadSOPs();
      onSopsChanged?.();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setResynthesizing(false);
    }
  }

  const connectorOptions: Array<EuiSuperSelectOption<string>> = connectors.map((c) => ({
    value: c.id,
    inputDisplay: c.name,
    dropdownDisplay: (
      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
        <EuiFlexItem>
          <strong>{c.name}</strong>
          <EuiText size="xs" color="subdued">
            {c.connectorTypeId}
          </EuiText>
        </EuiFlexItem>
        {c.visionCapable && (
          <EuiFlexItem grow={false}>
            <EuiBadge color="accent" iconType="image">
              vision
            </EuiBadge>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
    ),
  }));

  async function deployAsSkill() {
    if (!selectedSop) return;
    setDeploying(true);
    setError(null);
    try {
      const skillId = selectedSop.name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
      const result = await service.deploySkill({
        id: skillId,
        name: selectedSop.name,
        description: selectedSop.description,
        content: selectedSop.skill_output ?? '',
        tool_ids:
          selectedSop.tool_ids && selectedSop.tool_ids.length > 0
            ? selectedSop.tool_ids
            : [
                'security.alerts',
                'security.get_entity',
                'platform.core.execute_esql',
                'platform.core.cases',
              ],
      });
      setDeployResult(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeploying(false);
    }
  }

  async function deployAsWorkflow() {
    if (!selectedSop?.workflow_output) return;
    setDeploying(true);
    setError(null);
    try {
      const result = await service.deployWorkflow(selectedSop.workflow_output);
      setDeployResult(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeploying(false);
    }
  }

  const numericCellStyle: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' };

  const columns: Array<EuiBasicTableColumn<SynthesizedSOP>> = [
    {
      field: 'name',
      name: 'SOP name',
      sortable: true,
      truncateText: true,
      width: '38%',
      render: (name: string) => <span title={name}>{name}</span>,
    },
    {
      field: 'confidence',
      name: 'Confidence',
      width: '13%',
      align: 'center',
      render: (v: number) => (
        <EuiBadge color={v >= 0.7 ? 'success' : 'warning'}>
          <span style={numericCellStyle}>{Math.round(v * 100)}%</span>
        </EuiBadge>
      ),
    },
    {
      field: 'steps',
      name: 'Steps',
      width: '9%',
      align: 'center',
      render: (steps: SynthesizedSOP['steps']) => (
        <span style={numericCellStyle}>{steps?.length ?? 0}</span>
      ),
    },
    {
      name: 'Gaps',
      width: '10%',
      align: 'center',
      render: (sop: SynthesizedSOP) => {
        const gapCount = (sop.steps ?? []).filter((s) => s.capability_gap).length;
        return gapCount > 0 ? (
          <EuiBadge color="danger">
            <span style={numericCellStyle}>{gapCount}</span>
          </EuiBadge>
        ) : (
          <EuiText size="s" color="subdued">
            —
          </EuiText>
        );
      },
    },
    {
      name: 'Actions',
      width: '30%',
      align: 'right',
      render: (sop: SynthesizedSOP) => (
        <EuiFlexGroup
          gutterSize="xs"
          responsive={false}
          wrap={false}
          justifyContent="flexEnd"
          alignItems="center"
        >
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              size="xs"
              flush="both"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                setSelectedSop(sop);
              }}
              iconType="inspect"
            >
              Open
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiToolTip content="Edit name & description">
              <EuiButtonIcon
                size="xs"
                aria-label={`Edit ${sop.name}`}
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  openEdit(sop);
                }}
                iconType="pencil"
              />
            </EuiToolTip>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiToolTip content="Delete SOP">
              <EuiButtonIcon
                size="xs"
                color="danger"
                aria-label={`Delete ${sop.name}`}
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  setDeleteSop(sop);
                }}
                iconType="trash"
              />
            </EuiToolTip>
          </EuiFlexItem>
        </EuiFlexGroup>
      ),
    },
  ];

  return (
    <>
    <EuiPanel paddingSize="l" hasShadow={false} hasBorder>
          <EuiTitle size="s">
            <h3>Synthesized SOPs</h3>
          </EuiTitle>
          <EuiSpacer size="xs" />
          <EuiText size="s" color="subdued">
            <p>
              Open a SOP to review its steps, reasoning, and provenance, then deploy it as an Agent
              Builder Skill or Elastic Workflow.
            </p>
          </EuiText>
          <EuiSpacer />
          {selectedIds.length > 0 && (
            <>
              <EuiPanel
                hasShadow={false}
                hasBorder
                paddingSize="s"
                color="subdued"
                style={{ borderLeft: `${euiTheme.size.xxs} solid ${euiTheme.colors.accent}` }}
              >
                <EuiFlexGroup
                  justifyContent="spaceBetween"
                  alignItems="center"
                  gutterSize="s"
                  responsive={false}
                >
                  <EuiFlexItem grow={false}>
                    <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                      <EuiFlexItem grow={false}>
                        <EuiNotificationBadge color="accent" size="m">
                          {selectedIds.length}
                        </EuiNotificationBadge>
                      </EuiFlexItem>
                      <EuiFlexItem grow={false}>
                        <EuiText size="s">selected</EuiText>
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiButton
                      color="danger"
                      size="s"
                      iconType="trash"
                      onClick={() => setShowBulkDelete(true)}
                    >
                      Delete selected ({selectedIds.length})
                    </EuiButton>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiPanel>
              <EuiSpacer size="s" />
            </>
          )}
          <EuiBasicTable
            key={tableKey}
            items={sops}
            itemId="id"
            columns={columns}
            selection={{
              onSelectionChange: (sel: SynthesizedSOP[]) => setSelectedIds(sel.map((s) => s.id)),
            }}
            rowProps={(sop) => ({
              onClick: () => setSelectedSop(sop),
              isSelected: selectedSop?.id === sop.id,
            })}
            noItemsMessage="No SOPs synthesized yet."
          />
        </EuiPanel>

      {selectedSop && (
        <EuiFlyout
          ownFocus
          size="l"
          onClose={closeDetail}
          aria-labelledby={flyoutTitleId}
          paddingSize="l"
          className={SOP_ROOT_CLASS}
        >
          <EuiFlyoutHeader hasBorder>
            {/* ---- SOP page header: title + description (left), a single
                 right-aligned actions menu (Edit / Delete). ---- */}
            <EuiFlexGroup
              alignItems="flexStart"
              gutterSize="m"
              responsive={false}
              justifyContent="spaceBetween"
            >
              <EuiFlexItem>
                <EuiTitle size="m">
                  <h2 id={flyoutTitleId}>{selectedSop.name}</h2>
                </EuiTitle>
                {selectedSop.description && (
                  <>
                    <EuiSpacer size="xs" />
                    <EuiText size="s" color="subdued">
                      <p style={{ marginBottom: 0 }}>{selectedSop.description}</p>
                    </EuiText>
                  </>
                )}
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiPopover
                  isOpen={actionsOpen}
                  closePopover={() => setActionsOpen(false)}
                  anchorPosition="downRight"
                  panelPaddingSize="none"
                  button={
                    <EuiButtonIcon
                      display="base"
                      size="s"
                      iconType="boxesVertical"
                      aria-label="SOP actions"
                      onClick={() => setActionsOpen((o) => !o)}
                    />
                  }
                >
                  <EuiContextMenuPanel
                    items={[
                      <EuiContextMenuItem
                        key="edit"
                        icon="pencil"
                        onClick={() => {
                          setActionsOpen(false);
                          openEdit(selectedSop);
                        }}
                      >
                        Edit name &amp; description
                      </EuiContextMenuItem>,
                      <EuiContextMenuItem
                        key="delete"
                        icon="trash"
                        color="danger"
                        onClick={() => {
                          setActionsOpen(false);
                          setDeleteSop(selectedSop);
                        }}
                      >
                        Delete SOP
                      </EuiContextMenuItem>,
                    ]}
                  />
                </EuiPopover>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlyoutHeader>

          <EuiFlyoutBody>
            {/* ---- The ONLY badge summary row (engine / confidence / tools /
                 capability gaps). SopDetail's duplicate strip is suppressed via
                 `hideHeaderStrip`. ---- */}
            <EuiFlexGroup gutterSize="xs" responsive={false} wrap alignItems="center">
              {selectedSop.generated_via && (
                <EuiFlexItem grow={false}>
                  <EuiToolTip content="The engine that produced this step plan.">
                    <EuiBadge color="hollow" iconType="bolt">
                      {VIA_LABEL[selectedSop.generated_via]}
                    </EuiBadge>
                  </EuiToolTip>
                </EuiFlexItem>
              )}
              <EuiFlexItem grow={false}>
                <EuiToolTip content="Model self-reported confidence in this synthesized procedure.">
                  <EuiBadge
                    color={selectedSop.confidence >= 0.7 ? 'success' : 'warning'}
                    iconType="visGauge"
                  >
                    {Math.round(selectedSop.confidence * 100)}% confidence
                  </EuiBadge>
                </EuiToolTip>
              </EuiFlexItem>
              {selectedSop.tool_ids && selectedSop.tool_ids.length > 0 && (
                <EuiFlexItem grow={false}>
                  <EuiToolTip content={selectedSop.tool_ids.join(', ')}>
                    <EuiBadge color="hollow" iconType="compute">
                      {selectedSop.tool_ids.length} tool
                      {selectedSop.tool_ids.length === 1 ? '' : 's'}
                    </EuiBadge>
                  </EuiToolTip>
                </EuiFlexItem>
              )}
              {(() => {
                const gapCount = (selectedSop.steps ?? []).filter((s) => s.capability_gap).length;
                return gapCount > 0 ? (
                  <EuiFlexItem grow={false}>
                    <EuiToolTip content="Steps whose write action has no built-in tool. Fill them with a workflow tool in the Steps tab.">
                      <EuiBadge color="danger" iconType="warning">
                        {gapCount} capability gap{gapCount === 1 ? '' : 's'}
                      </EuiBadge>
                    </EuiToolTip>
                  </EuiFlexItem>
                ) : null;
              })()}
            </EuiFlexGroup>

            <EuiHorizontalRule margin="m" />

            {/* ---- Tabbed body: only one heavy section shows at a time. ---- */}
            <EuiTabbedContent
              tabs={(() => {
                const gapCount = (selectedSop.steps ?? []).filter((s) => s.capability_gap).length;
                const onSopChanged = async () => {
                  await loadSOPs();
                  onSopsChanged?.();
                };
                return [
                  {
                    id: 'steps',
                    name: 'Steps',
                    content: (
                      <>
                        <EuiSpacer size="m" />
                        <SopDetail
                          sop={selectedSop}
                          service={service}
                          connectors={connectors}
                          hideHeaderStrip
                          hideGaps
                          onChanged={onSopChanged}
                        />
                      </>
                    ),
                  },
                  ...(gapCount > 0
                    ? [
                        {
                          id: 'capability-gaps',
                          name: 'Capability gaps',
                          append: (
                            <EuiNotificationBadge color="accent">{gapCount}</EuiNotificationBadge>
                          ),
                          content: (
                            <>
                              <EuiSpacer size="m" />
                              <GapFillsPanel
                                sop={selectedSop}
                                service={service}
                                onChanged={onSopChanged}
                              />
                            </>
                          ),
                        },
                      ]
                    : []),
                  {
                  id: 'deploy',
                  name: 'Deploy',
                  content: (
                    <>
                      <EuiSpacer size="m" />
                      <EuiText size="xs" color="subdued">
                        Push this SOP as an Agent Builder Skill or an Elastic Workflow.
                      </EuiText>
                      <EuiSpacer size="s" />
                      <EuiTabbedContent
                        tabs={[
                          {
                            id: 'skill-preview',
                            name: 'Agent Builder Skill',
                            content: (
                              <>
                                <EuiSpacer />
                                <EuiPanel
                                  paddingSize="m"
                                  hasShadow={false}
                                  style={{ background: '#07101F', borderRadius: 6, maxHeight: 300, overflow: 'auto' }}
                                >
                                  <EuiMarkdownFormat textSize="s" style={{ color: '#D5DEEC' }}>
                                    {selectedSop.skill_output ?? 'No skill content'}
                                  </EuiMarkdownFormat>
                                </EuiPanel>
                                <EuiSpacer />
                                <EuiButton
                                  fill
                                  onClick={deployAsSkill}
                                  isLoading={deploying}
                                  iconType="push"
                                >
                                  Deploy to Agent Builder
                                </EuiButton>
                              </>
                            ),
                          },
                          {
                            id: 'workflow-preview',
                            name: 'Elastic Workflow',
                            content: (
                              <>
                                <EuiSpacer />
                                {selectedSop.workflow_generated_via === 'agent_builder_nl' && (
                                  <>
                                    <EuiCallOut
                                      size="s"
                                      color="success"
                                      iconType="bolt"
                                      title="Authored by Agent Builder / Workflows NL workflow authoring"
                                    />
                                    <EuiSpacer size="s" />
                                  </>
                                )}
                                <EuiCodeBlock
                                  language="yaml"
                                  fontSize="s"
                                  paddingSize="m"
                                  isCopyable
                                  overflowHeight={300}
                                  style={{ background: '#07101F', borderRadius: 6 }}
                                >
                                  {selectedSop.workflow_output ?? 'No workflow content'}
                                </EuiCodeBlock>
                                <EuiSpacer />
                                <EuiButton
                                  fill
                                  onClick={deployAsWorkflow}
                                  isLoading={deploying}
                                  iconType="push"
                                >
                                  Deploy as Workflow
                                </EuiButton>
                              </>
                            ),
                          },
                        ]}
                      />
                      {deployResult && (
                        <>
                          <EuiSpacer />
                          <EuiCallOut
                            title="Deployment result"
                            color={deployResult.deployed ? 'success' : 'warning'}
                          >
                            {deployResult.deployed
                              ? 'Successfully deployed!'
                              : deployResult.message}
                          </EuiCallOut>
                        </>
                      )}
                    </>
                  ),
                },
                {
                  id: 'resynthesize',
                  name: 'Re-synthesize',
                  content: (
                    <>
                      <EuiSpacer size="m" />
                      <EuiText size="xs" color="subdued">
                        Re-run synthesis from this SOP&apos;s source sessions with a chosen
                        connector.
                      </EuiText>
                      <EuiSpacer size="s" />
                      <EuiFlexGroup gutterSize="s" alignItems="flexEnd" responsive={false} wrap>
                        <EuiFlexItem grow={true} style={{ minWidth: 200 }}>
                          <EuiFormRow label="Connector" fullWidth>
                            {connectors.length > 0 ? (
                              <EuiSuperSelect<string>
                                fullWidth
                                options={connectorOptions}
                                valueOfSelected={resynthConnectorId}
                                onChange={(value) => setResynthConnectorId(value)}
                              />
                            ) : (
                              <EuiFieldText
                                fullWidth
                                placeholder="Connector id"
                                value={resynthConnectorId}
                                onChange={(e) => setResynthConnectorId(e.target.value)}
                              />
                            )}
                          </EuiFormRow>
                        </EuiFlexItem>
                        <EuiFlexItem grow={false}>
                          <EuiButton
                            onClick={() => resynthesize(selectedSop)}
                            isLoading={resynthesizing}
                            disabled={resynthesizing || !resynthConnectorId}
                            iconType="refresh"
                          >
                            Re-synthesize
                          </EuiButton>
                        </EuiFlexItem>
                      </EuiFlexGroup>
                      {resynthesizing && (
                        <>
                          <EuiSpacer size="s" />
                          <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                            <EuiFlexItem grow={false}>
                              <EuiLoadingSpinner size="m" />
                            </EuiFlexItem>
                            <EuiFlexItem>
                              <EuiText size="xs" color="subdued">
                                Re-running synthesis from {selectedSop.session_ids?.length ?? 0}{' '}
                                source session
                                {(selectedSop.session_ids?.length ?? 0) === 1 ? '' : 's'}…
                              </EuiText>
                            </EuiFlexItem>
                          </EuiFlexGroup>
                        </>
                      )}
                    </>
                  ),
                },
                ];
              })()}
            />

            {error && (
              <>
                <EuiSpacer />
                <EuiCallOut title="Deployment failed" color="danger">
                  {error}
                </EuiCallOut>
              </>
            )}
          </EuiFlyoutBody>
        </EuiFlyout>
      )}

      {editSop && (
        <EuiModal onClose={() => setEditSop(null)} initialFocus="[name=sopName]" className={SOP_ROOT_CLASS}>
          <EuiModalHeader>
            <EuiModalHeaderTitle>Edit SOP</EuiModalHeaderTitle>
          </EuiModalHeader>
          <EuiModalBody>
            <EuiForm component="form">
              <EuiFormRow label="Name">
                <EuiFieldText
                  name="sopName"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </EuiFormRow>
              <EuiFormRow label="Description">
                <EuiTextArea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                />
              </EuiFormRow>
            </EuiForm>
          </EuiModalBody>
          <EuiModalFooter>
            <EuiButtonEmpty onClick={() => setEditSop(null)}>Cancel</EuiButtonEmpty>
            <EuiButton fill onClick={saveEdit} isLoading={savingEdit} disabled={!editName.trim()}>
              Save
            </EuiButton>
          </EuiModalFooter>
        </EuiModal>
      )}

      {deleteSop && (
        <EuiConfirmModal
          title={`Delete "${deleteSop.name}"?`}
          onCancel={() => setDeleteSop(null)}
          onConfirm={confirmDelete}
          cancelButtonText="Cancel"
          confirmButtonText="Delete SOP"
          buttonColor="danger"
          isLoading={deleting}
        >
          <EuiText size="s">
            <p>
              This permanently deletes the synthesized SOP (and its embedding). The source sessions
              it was derived from are not affected. This cannot be undone.
            </p>
          </EuiText>
        </EuiConfirmModal>
      )}

      {showBulkDelete && (
        <EuiConfirmModal
          title={`Delete ${selectedIds.length} SOP${selectedIds.length === 1 ? '' : 's'}?`}
          onCancel={() => setShowBulkDelete(false)}
          onConfirm={confirmBulkDelete}
          cancelButtonText="Cancel"
          confirmButtonText={`Delete ${selectedIds.length} SOP${selectedIds.length === 1 ? '' : 's'}`}
          buttonColor="danger"
          isLoading={bulkDeleting}
        >
          <EuiText size="s">
            <p>
              This permanently deletes the {selectedIds.length} selected SOP
              {selectedIds.length === 1 ? '' : 's'} (and their embeddings). The source sessions they
              were derived from are not affected. This cannot be undone.
            </p>
          </EuiText>
        </EuiConfirmModal>
      )}
    </>
  );
}
