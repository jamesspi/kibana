/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import {
  EuiAccordion,
  EuiBadge,
  EuiSpacer,
  EuiText,
  EuiCodeBlock,
  EuiMarkdownFormat,
  EuiFlexGroup,
  EuiFlexItem,
  EuiToolTip,
  EuiPanel,
  EuiPopover,
  EuiNotificationBadge,
  EuiCallOut,
  EuiButton,
  EuiButtonEmpty,
  EuiTitle,
  EuiModal,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiModalBody,
  EuiModalFooter,
  EuiFieldText,
  EuiFormRow,
  EuiSuperSelect,
  EuiLoadingSpinner,
  useEuiTheme,
  useGeneratedHtmlId,
} from '@elastic/eui';
import type { EuiSuperSelectOption } from '@elastic/eui';
import type {
  SynthesizedSOP,
  ProvenanceRef,
  SOPStep,
  WorkflowToolProposal,
} from '../../common';
import type { SopLearningService, SkillPreviewResult } from '../services/api';
import { SOP_ROOT_CLASS } from './theme';

interface PreviewConnector {
  id: string;
  name: string;
  visionCapable?: boolean;
}

// Map a provenance modality to an EUI badge color + icon. Dark-mode safe
// (uses named EUI palette colors, not hardcoded hex).
const PROVENANCE_STYLE: Record<
  ProvenanceRef['type'],
  { color: 'primary' | 'accent' | 'hollow' | 'warning'; icon: string; word: string }
> = {
  ui_action: { color: 'primary', icon: 'clickLeft', word: 'action' },
  voice: { color: 'accent', icon: 'quote', word: 'voice' },
  typed: { color: 'hollow', icon: 'pencil', word: 'typed' },
  frame: { color: 'warning', icon: 'image', word: 'screen frame' },
};

export const VIA_LABEL: Record<NonNullable<SynthesizedSOP['generated_via']>, string> = {
  claude_multimodal: 'Claude multimodal (vision)',
  agent_builder: 'Agent Builder (tool-grounded)',
  llm: 'Direct LLM (text-only)',
};

/**
 * De-emphasized provenance summary: a single small "Sources" trigger that
 * opens a popover listing the contributing evidence. This keeps the default
 * step view scannable instead of crowding it with a row of large badges.
 */
export function ProvenanceBadges({ provenance }: { provenance?: ProvenanceRef[] }) {
  const [open, setOpen] = useState(false);
  if (!provenance || provenance.length === 0) {
    return (
      <EuiText size="xs" color="subdued">
        <EuiFlexGroup gutterSize="xs" responsive={false} alignItems="center">
          <EuiFlexItem grow={false}>
            <EuiBadge color="hollow" iconType="warning">
              inferred
            </EuiBadge>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <em>not directly grounded in captured evidence</em>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiText>
    );
  }
  return (
    <EuiPopover
      isOpen={open}
      closePopover={() => setOpen(false)}
      anchorPosition="upLeft"
      panelPaddingSize="s"
      button={
        <EuiBadge
          color="hollow"
          iconType="documentation"
          iconSide="left"
          onClick={() => setOpen((o) => !o)}
          onClickAriaLabel="Show sources for this step"
        >
          {provenance.length} source{provenance.length === 1 ? '' : 's'}
        </EuiBadge>
      }
    >
      <div style={{ maxWidth: 280 }}>
        <EuiText size="xs" color="subdued">
          <strong>Grounded in</strong>
        </EuiText>
        <EuiSpacer size="xs" />
        <EuiFlexGroup direction="column" gutterSize="xs" responsive={false}>
          {provenance.map((p, i) => {
            const style = PROVENANCE_STYLE[p.type] ?? PROVENANCE_STYLE.typed;
            const label = p.label ?? `${style.word}${p.ref ? ` ${p.ref}` : ''}`;
            return (
              <EuiFlexItem grow={false} key={`${p.ref ?? p.type}-${i}`}>
                <EuiFlexGroup gutterSize="xs" responsive={false} alignItems="center">
                  <EuiFlexItem grow={false}>
                    <EuiBadge color={style.color} iconType={style.icon}>
                      {style.word}
                    </EuiBadge>
                  </EuiFlexItem>
                  <EuiFlexItem>
                    <EuiText size="xs">{label}</EuiText>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
            );
          })}
        </EuiFlexGroup>
      </div>
    </EuiPopover>
  );
}

/** A single SOP step rendered as a collapsible accordion row. */
function StepAccordion({ step, index }: { step: SOPStep; index: number }) {
  const { euiTheme } = useEuiTheme();
  const accordionId = useGeneratedHtmlId({ prefix: 'sopStep' });
  // The pink/warning number is reserved EXCLUSIVELY for genuinely ungrounded
  // steps (no captured evidence). It must NOT be driven by confidence or
  // `is_optional`: a grounded optional/lower-confidence step (e.g. an optional
  // enrichment that still cites voice + frame provenance) is still grounded and
  // must read as neutral. "Optional" is conveyed by the label; confidence by
  // the header badge — neither reuses the weakly-grounded color.
  const weaklyGrounded = !step.provenance || step.provenance.length === 0;

  // Compact, scannable trigger: step number + name + the single most relevant
  // badge (tool or reasoning). Everything else is disclosed on expand. The
  // title grows and truncates so a long name never collides with the
  // right-aligned tool/gap badge.
  const buttonContent = (
    <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
      <EuiFlexItem grow={false}>
        <EuiNotificationBadge color={weaklyGrounded ? 'accent' : 'subdued'} size="m">
          {index + 1}
        </EuiNotificationBadge>
      </EuiFlexItem>
      <EuiFlexItem grow style={{ minWidth: 0 }}>
        <EuiFlexGroup gutterSize="xs" alignItems="baseline" responsive={false}>
          <EuiFlexItem grow style={{ minWidth: 0 }}>
            <EuiText size="s" className="eui-textTruncate">
              <strong title={step.name}>{step.name}</strong>
            </EuiText>
          </EuiFlexItem>
          {step.is_optional && (
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">
                (optional)
              </EuiText>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      </EuiFlexItem>
    </EuiFlexGroup>
  );

  const extraAction = (
    <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
      {step.tool_id ? (
        <EuiFlexItem grow={false}>
          <EuiToolTip content={`Agent Builder tool: ${step.tool_id}`}>
            <EuiBadge color="hollow" iconType="compute" style={{ maxWidth: 200 }}>
              {step.tool_id}
            </EuiBadge>
          </EuiToolTip>
        </EuiFlexItem>
      ) : step.capability_gap ? (
        <EuiFlexItem grow={false}>
          <EuiToolTip
            content={`Capability gap: no built-in tool can perform "${step.capability_gap.action}". ${step.capability_gap.reason}`}
          >
            <EuiBadge color="danger" iconType="warning">
              capability gap
            </EuiBadge>
          </EuiToolTip>
        </EuiFlexItem>
      ) : (
        <EuiFlexItem grow={false}>
          <EuiToolTip content="No Agent Builder tool — this is a reasoning/decision step.">
            <EuiBadge color="hollow" iconType="branch">
              reasoning
            </EuiBadge>
          </EuiToolTip>
        </EuiFlexItem>
      )}
      {weaklyGrounded && (
        <EuiFlexItem grow={false}>
          <EuiToolTip content="No captured evidence (action / voice / frame) backs this step — it was inferred by the model.">
            <EuiBadge color="warning" iconType="warning">
              weakly grounded
            </EuiBadge>
          </EuiToolTip>
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  );

  return (
    <EuiAccordion
      id={accordionId}
      arrowDisplay="left"
      buttonContent={buttonContent}
      extraAction={extraAction}
      paddingSize="s"
      borders="horizontal"
    >
      <EuiText size="s">{step.description}</EuiText>

      {step.capability_gap && (
        <>
          <EuiSpacer size="s" />
          <EuiCallOut
            size="s"
            color="danger"
            iconType="warning"
            title={`Capability gap: ${step.capability_gap.action}`}
          >
            <EuiText size="xs">
              <p style={{ marginBottom: 4 }}>{step.capability_gap.reason}</p>
              <p>
                Suggested fill: <strong>{step.capability_gap.suggested_fill}</strong>. See the
                &ldquo;Capability gaps&rdquo; panel below to propose &amp; create a gap-filling
                workflow tool.
              </p>
            </EuiText>
          </EuiCallOut>
        </>
      )}

      {(step.tool_id || step.tool_params || step.intent) && (
        <>
          <EuiSpacer size="s" />
          {step.tool_id && (
            <EuiText size="xs" color="subdued">
              <strong>Tool:</strong> <code>{step.tool_id}</code>
            </EuiText>
          )}
          {step.tool_params && (
            <EuiText size="xs" color="subdued">
              <strong>Params:</strong> {step.tool_params}
            </EuiText>
          )}
          {step.intent && (
            <EuiText size="xs" color="subdued">
              <em>Why: {step.intent}</em>
            </EuiText>
          )}
        </>
      )}

      {step.query_template && (
        <>
          <EuiSpacer size="s" />
          <EuiAccordion
            id={`${accordionId}-query`}
            arrowDisplay="left"
            buttonContent={
              <EuiText size="xs" color="subdued">
                <strong>Query template</strong>
              </EuiText>
            }
          >
            <EuiSpacer size="xs" />
            <EuiCodeBlock language="esql" fontSize="s" paddingSize="s" isCopyable overflowHeight={180}>
              {step.query_template}
            </EuiCodeBlock>
          </EuiAccordion>
        </>
      )}

      <EuiSpacer size="s" />
      <div style={{ borderTop: `${euiTheme.border.thin}`, paddingTop: euiTheme.size.s }}>
        <ProvenanceBadges provenance={step.provenance} />
      </div>
    </EuiAccordion>
  );
}

/**
 * Render a list of SOP steps as a calm, collapsible accordion list. Collapsed,
 * each row shows just the step number, name, and its tool/reasoning badge;
 * expanding discloses the description, params, query template (itself
 * collapsible), intent, and a de-emphasized sources summary.
 */
export function SopSteps({ steps }: { steps: SOPStep[] }) {
  const ordered = [...steps].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return (
    <EuiPanel hasShadow={false} hasBorder paddingSize="none">
      {ordered.map((step, i) => (
        <StepAccordion key={step.id ?? i} step={step} index={i} />
      ))}
    </EuiPanel>
  );
}

/** A compact provenance summary line for a synthesized SOP. */
export function ProvenanceHeader({ sop }: { sop: SynthesizedSOP }) {
  const p = sop.provenance;
  if (!p) return null;
  const hasFrames = typeof p.screen_frame_count === 'number' && p.screen_frame_count > 0;
  return (
    <EuiPanel hasShadow={false} hasBorder paddingSize="s" color="subdued">
      <EuiFlexGroup gutterSize="s" wrap responsive={false} alignItems="center">
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            <strong>Sources</strong>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiToolTip content="Captured human UI interactions (clicks, queries, navigations).">
            <EuiBadge color="hollow" iconType="clickLeft">
              {p.action_event_count} action{p.action_event_count === 1 ? '' : 's'}
            </EuiBadge>
          </EuiToolTip>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiToolTip content="Browser-transcribed spoken segments fed to the model.">
            <EuiBadge color="hollow" iconType="quote">
              {p.voice_segment_count} voice
            </EuiBadge>
          </EuiToolTip>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiToolTip content="Typed narration the analyst entered while recording.">
            <EuiBadge color="hollow" iconType="pencil">
              {p.narration_count} typed
            </EuiBadge>
          </EuiToolTip>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiToolTip content="Distinct recording sessions this SOP draws from.">
            <EuiBadge color="hollow" iconType="documents">
              {p.session_count} session{p.session_count === 1 ? '' : 's'}
            </EuiBadge>
          </EuiToolTip>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          {hasFrames ? (
            <EuiToolTip content="Periodic screen keyframes were extracted and sent to the vision model — these genuinely contribute to step content.">
              <EuiBadge color="warning" iconType="image">
                {p.screen_frame_count} frame{p.screen_frame_count === 1 ? '' : 's'} (vision)
              </EuiBadge>
            </EuiToolTip>
          ) : (
            <EuiToolTip content="Screen video, if any, is stored for playback only — the raw video is NOT analyzed and never contributes to a step.">
              <EuiBadge color="hollow" iconType="image">
                {p.screen_video_present ? 'video (not analyzed)' : 'no video'}
              </EuiBadge>
            </EuiToolTip>
          )}
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
}

/**
 * Full detail of a synthesized SOP: a compact header strip (engine badge /
 * confidence / tools / provenance summary) followed by the collapsible step
 * list. Shared by the Synthesize result panel and the Deploy view so a stored
 * SOP can be inspected anytime.
 */
export function SopDetail({
  sop,
  service,
  connectors,
  onChanged,
  hideHeaderStrip = false,
  hideGaps = false,
}: {
  sop: SynthesizedSOP;
  /** When provided, enables the gap-fill create flow + skill preview dry-run. */
  service?: SopLearningService;
  /** AI connectors for the preview dry-run; the first is used by default. */
  connectors?: PreviewConnector[];
  /** Called after a gap fill is created so the parent can refresh the SOP. */
  onChanged?: () => void;
  /**
   * When true, the leading metadata badge strip is NOT rendered (the embedding
   * page header already owns those badges). The provenance summary, step list,
   * capability-gaps panel, and the skill-preview affordance still render.
   */
  hideHeaderStrip?: boolean;
  /**
   * When true, the internal capability-gaps panel is NOT rendered. Used by the
   * Deploy view, which surfaces gaps in their own dedicated tab instead of
   * inline under the step list.
   */
  hideGaps?: boolean;
}) {
  const goodConfidence = sop.confidence >= 0.7;
  const gapSteps = (sop.steps ?? []).filter((s) => s.capability_gap);
  const [showPreview, setShowPreview] = useState(false);
  return (
    <>
      {/* Metadata strip: descriptive BADGES on the left, ACTIONS on the right.
          Keeping them in separate groups stops a clickable action from reading
          like just another status badge. Suppressed when the embedding header
          already renders these badges (see `hideHeaderStrip`). */}
      {!hideHeaderStrip && (
        <>
          <EuiFlexGroup
            alignItems="center"
            gutterSize="m"
            responsive={false}
            wrap
            justifyContent="spaceBetween"
          >
            <EuiFlexItem grow={false}>
              <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false} wrap>
                {sop.generated_via && (
                  <EuiFlexItem grow={false}>
                    <EuiToolTip content="The engine that produced this step plan.">
                      <EuiBadge color="hollow" iconType="bolt">
                        {VIA_LABEL[sop.generated_via]}
                      </EuiBadge>
                    </EuiToolTip>
                  </EuiFlexItem>
                )}
                <EuiFlexItem grow={false}>
                  <EuiToolTip content="Model self-reported confidence in this synthesized procedure.">
                    <EuiBadge color={goodConfidence ? 'success' : 'warning'} iconType="visGauge">
                      {Math.round(sop.confidence * 100)}% confidence
                    </EuiBadge>
                  </EuiToolTip>
                </EuiFlexItem>
                {sop.tool_ids && sop.tool_ids.length > 0 && (
                  <EuiFlexItem grow={false}>
                    <EuiToolTip content={sop.tool_ids.join(', ')}>
                      <EuiBadge color="hollow" iconType="compute">
                        {sop.tool_ids.length} tool{sop.tool_ids.length === 1 ? '' : 's'}
                      </EuiBadge>
                    </EuiToolTip>
                  </EuiFlexItem>
                )}
                {gapSteps.length > 0 && (
                  <EuiFlexItem grow={false}>
                    <EuiToolTip content="Steps whose write action has no built-in tool. Fill them with a workflow tool below.">
                      <EuiBadge color="danger" iconType="warning">
                        {gapSteps.length} capability gap{gapSteps.length === 1 ? '' : 's'}
                      </EuiBadge>
                    </EuiToolTip>
                  </EuiFlexItem>
                )}
              </EuiFlexGroup>
            </EuiFlexItem>
            {service && (
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty
                  size="xs"
                  iconType="play"
                  flush="right"
                  onClick={() => setShowPreview(true)}
                >
                  Preview skill (dry-run)
                </EuiButtonEmpty>
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
          <EuiSpacer size="s" />
        </>
      )}

      {/* When the header strip is suppressed, still surface the skill-preview
          dry-run as a slim, right-aligned affordance so the flyout stays
          reachable from the Steps tab. */}
      {hideHeaderStrip && service && (
        <>
          <EuiFlexGroup justifyContent="flexEnd" gutterSize="none" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty
                size="xs"
                iconType="play"
                flush="right"
                onClick={() => setShowPreview(true)}
              >
                Preview skill (dry-run)
              </EuiButtonEmpty>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size="xs" />
        </>
      )}

      <ProvenanceHeader sop={sop} />

      <EuiSpacer size="m" />
      {sop.steps && sop.steps.length > 0 ? (
        <SopSteps steps={sop.steps} />
      ) : (
        <EuiText size="s" color="subdued">
          <em>This SOP has no detailed steps stored (created before step capture was added).</em>
        </EuiText>
      )}

      {!hideGaps && service && gapSteps.length > 0 && (
        <>
          <EuiSpacer size="m" />
          <GapFillsPanel sop={sop} service={service} onChanged={onChanged} />
        </>
      )}

      {service && showPreview && (
        <SkillPreviewModal
          sop={sop}
          service={service}
          connectors={connectors ?? []}
          onClose={() => setShowPreview(false)}
        />
      )}
    </>
  );
}

/**
 * Capability-gaps panel: for each gap step, lets the user PROPOSE a gap-filling
 * workflow tool (shows the parameterized Workflow YAML), then CREATE it with one
 * click. Honest about infeasible gaps (e.g. endpoint isolation — no native step).
 */
export function GapFillsPanel({
  sop,
  service,
  onChanged,
}: {
  sop: SynthesizedSOP;
  service: SopLearningService;
  onChanged?: () => void;
}) {
  const [proposals, setProposals] = useState<WorkflowToolProposal[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Record<string, string>>({});

  async function loadProposals() {
    setLoading(true);
    setError(null);
    try {
      setProposals(await service.proposeGapFills(sop.id));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function create(p: WorkflowToolProposal) {
    setCreatingId(p.step_id);
    setError(null);
    try {
      const res = await service.createGapFill(sop.id, p);
      setCreated((c) => ({ ...c, [p.step_id]: res.tool_id }));
      onChanged?.();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreatingId(null);
    }
  }

  return (
    <EuiPanel hasShadow={false} hasBorder paddingSize="m" color="danger">
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
        <EuiFlexItem>
          <EuiTitle size="xxs">
            <h4>Capability gaps — fill with workflow tools</h4>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton size="s" iconType="wrench" onClick={loadProposals} isLoading={loading}>
            Propose fills
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="xs" />
      <EuiText size="xs" color="subdued">
        <p>
          These steps need a SOC write action no built-in Agent Builder tool can perform. Propose a
          gap-filling Elastic Workflow (using real workflow step types), review the YAML, then
          create it as a workflow tool — nothing is created until you click.
        </p>
      </EuiText>

      {error && (
        <>
          <EuiSpacer size="s" />
          <EuiCallOut size="s" color="danger" title="Gap-fill failed">
            {error}
          </EuiCallOut>
        </>
      )}

      {proposals && proposals.length === 0 && (
        <>
          <EuiSpacer size="s" />
          <EuiText size="s" color="subdued">
            <em>No capability gaps to fill.</em>
          </EuiText>
        </>
      )}

      {proposals?.map((p) => (
        <React.Fragment key={p.step_id}>
          <EuiSpacer size="s" />
          <GapProposalCard
            proposal={p}
            createdToolId={created[p.step_id]}
            isCreating={creatingId === p.step_id}
            onCreate={() => create(p)}
          />
        </React.Fragment>
      ))}
    </EuiPanel>
  );
}

/**
 * A single gap-fill proposal card. Feasible proposals show the gap title,
 * action/API badges, the note, and a "Create this workflow tool" button; the
 * generated Workflow YAML is tucked into a collapsed accordion so it doesn't
 * dominate the panel. Infeasible proposals show a warning callout; already
 * created proposals show a success callout.
 */
function GapProposalCard({
  proposal: p,
  createdToolId,
  isCreating,
  onCreate,
}: {
  proposal: WorkflowToolProposal;
  createdToolId?: string;
  isCreating: boolean;
  onCreate: () => void;
}) {
  const yamlAccordionId = useGeneratedHtmlId({ prefix: 'gapFillYaml' });
  return (
    <EuiPanel hasShadow={false} hasBorder paddingSize="s">
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false} wrap>
        <EuiFlexItem>
          <EuiText size="s">
            <strong>{p.title}</strong>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiBadge color={p.feasible ? 'primary' : 'warning'}>{p.action}</EuiBadge>
        </EuiFlexItem>
        {p.api && (
          <EuiFlexItem grow={false}>
            <EuiToolTip content={`This workflow calls the real Kibana API: ${p.api}`}>
              <EuiBadge color="hollow" iconType="globe">
                {p.api}
              </EuiBadge>
            </EuiToolTip>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
      <EuiSpacer size="xs" />
      <EuiText size="xs" color="subdued">
        {p.note}
      </EuiText>
      {createdToolId ? (
        <>
          <EuiSpacer size="s" />
          <EuiCallOut
            size="s"
            color="success"
            iconType="check"
            title={`Created workflow tool: ${createdToolId}`}
          />
        </>
      ) : p.feasible ? (
        <>
          <EuiSpacer size="s" />
          <EuiButton
            size="s"
            fill
            iconType="plusInCircle"
            onClick={onCreate}
            isLoading={isCreating}
          >
            Create this workflow tool
          </EuiButton>
          <EuiSpacer size="s" />
          <EuiAccordion
            id={yamlAccordionId}
            arrowDisplay="left"
            buttonContent={
              <EuiText size="xs" color="subdued">
                <strong>View workflow YAML</strong>
              </EuiText>
            }
          >
            <EuiSpacer size="xs" />
            <EuiCodeBlock
              language="yaml"
              fontSize="s"
              paddingSize="s"
              isCopyable
              overflowHeight={200}
            >
              {p.yaml}
            </EuiCodeBlock>
          </EuiAccordion>
        </>
      ) : (
        <>
          <EuiSpacer size="s" />
          <EuiCallOut
            size="s"
            color="warning"
            iconType="warning"
            title="No native workflow step — requires a custom connector"
          />
        </>
      )}
    </EuiPanel>
  );
}

/**
 * Skill preview modal: runs a READ-ONLY dry-run of the SOP's skill through the
 * Agent Builder converse engine and shows the agent's tool calls + final
 * message. Only the SOP's read-only tools are enabled, so the dry-run can never
 * fire a write/isolate/case-create tool.
 *
 * Rendered as a MODAL (not a flyout) so it can safely overlay the full-width SOP
 * detail flyout without nesting/stacking two flyouts.
 */
function SkillPreviewModal({
  sop,
  service,
  connectors,
  onClose,
}: {
  sop: SynthesizedSOP;
  service: SopLearningService;
  connectors: PreviewConnector[];
  onClose: () => void;
}) {
  const modalTitleId = useGeneratedHtmlId({ prefix: 'sopPreview' });
  const [connectorId, setConnectorId] = useState(
    connectors.find((c) => c.visionCapable)?.id ?? connectors[0]?.id ?? ''
  );
  const [sampleInput, setSampleInput] = useState('a critical malware alert on a host');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SkillPreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connectorOptions: Array<EuiSuperSelectOption<string>> = connectors.map((c) => ({
    value: c.id,
    inputDisplay: c.name,
  }));

  async function run() {
    if (!connectorId) {
      setError('Pick a connector first.');
      return;
    }
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      setResult(await service.previewSkill(sop.id, connectorId, sampleInput));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <EuiModal
      onClose={onClose}
      aria-labelledby={modalTitleId}
      style={{ width: 720, maxWidth: '90vw' }}
      className={SOP_ROOT_CLASS}
    >
      <EuiModalHeader>
        <div>
          <EuiModalHeaderTitle id={modalTitleId}>
            Preview skill — read-only dry-run
          </EuiModalHeaderTitle>
          <EuiSpacer size="xs" />
          <EuiText size="xs" color="subdued">
            Runs the skill through the Agent Builder converse engine with ONLY this SOP&apos;s
            read-only tools enabled. No write / isolate / case-create tool can fire.
          </EuiText>
        </div>
      </EuiModalHeader>
      <EuiModalBody>
        <EuiFormRow label="Connector" fullWidth>
          {connectors.length > 0 ? (
            <EuiSuperSelect<string>
              fullWidth
              options={connectorOptions}
              valueOfSelected={connectorId}
              onChange={setConnectorId}
            />
          ) : (
            <EuiFieldText
              fullWidth
              placeholder="Connector id"
              value={connectorId}
              onChange={(e) => setConnectorId(e.target.value)}
            />
          )}
        </EuiFormRow>
        <EuiFormRow label="Sample input" fullWidth helpText="Describe the alert the skill should run against.">
          <EuiFieldText
            fullWidth
            value={sampleInput}
            onChange={(e) => setSampleInput(e.target.value)}
          />
        </EuiFormRow>

        {running && (
          <>
            <EuiSpacer />
            <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiLoadingSpinner size="m" />
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiText size="s" color="subdued">
                  Running read-only dry-run…
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </>
        )}

        {error && (
          <>
            <EuiSpacer />
            <EuiCallOut size="s" color="danger" title="Preview failed">
              {error}
            </EuiCallOut>
          </>
        )}

        {result && (
          <>
            <EuiSpacer />
            <EuiCallOut
              size="s"
              color="primary"
              iconType="lock"
              title="Read-only dry-run"
            >
              <EuiText size="xs">
                Tools enabled: {result.tools_used.length ? result.tools_used.join(', ') : '(none)'}
                {result.tools_excluded_for_safety.length > 0 && (
                  <>
                    {' '}
                    · Excluded for safety: {result.tools_excluded_for_safety.join(', ')}
                  </>
                )}
              </EuiText>
            </EuiCallOut>
            <EuiSpacer />
            <EuiTitle size="xs">
              <h4>Tool calls ({result.tool_calls.length})</h4>
            </EuiTitle>
            <EuiSpacer size="xs" />
            {result.tool_calls.length === 0 ? (
              <EuiText size="s" color="subdued">
                <em>The agent made no tool calls.</em>
              </EuiText>
            ) : (
              result.tool_calls.map((tc, i) => (
                <EuiPanel key={i} hasShadow={false} hasBorder paddingSize="s">
                  <EuiBadge color="hollow" iconType="compute">
                    {tc.tool_id}
                  </EuiBadge>
                  {tc.result_summary && (
                    <EuiText size="xs" color="subdued">
                      {tc.result_summary}
                    </EuiText>
                  )}
                </EuiPanel>
              ))
            )}
            <EuiSpacer />
            <EuiTitle size="xs">
              <h4>Final response</h4>
            </EuiTitle>
            <EuiSpacer size="xs" />
            <EuiPanel paddingSize="m" hasShadow={false} style={{ maxHeight: 260, overflow: 'auto' }}>
              <EuiMarkdownFormat textSize="s" >
                {result.final_message || '(no final message)'}
              </EuiMarkdownFormat>
            </EuiPanel>
          </>
        )}
      </EuiModalBody>
      <EuiModalFooter>
        <EuiFlexGroup justifyContent="spaceBetween" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty onClick={onClose}>Close</EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton fill iconType="play" onClick={run} isLoading={running} disabled={!connectorId}>
              Run dry-run
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiModalFooter>
    </EuiModal>
  );
}
