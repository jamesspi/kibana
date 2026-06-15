/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import { css, keyframes } from '@emotion/react';
import { WATCH_CONFIGS } from '../../../common';
import type { EnrichedProposal, ReasoningStep } from '../../data/mock_proposals';
import { UserAvatar } from '../common/user_avatar';

interface Props {
  proposal: EnrichedProposal;
  onAction: (id: string, action: 'approve' | 'reject' | 'modify' | 'escalate') => void;
  isFocused?: boolean;
}

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
`;

const slideOut = keyframes`
  from { opacity: 1; max-height: 1200px; }
  to { opacity: 0; max-height: 0; }
`;

type ActionState = null | 'confirming_approve' | 'confirming_reject' | 'modifying' | 'escalating' | 'executed' | 'askingAbout';

const STEP_ICONS: Record<ReasoningStep['type'], string> = {
  query: '⌕',
  finding: '◈',
  tool: '⚙',
  collaboration: '⟐',
  conclusion: '→',
};

const ASK_CANNED_RESPONSES: Record<string, string> = {
  'why this confidence?': 'Confidence is derived from 3 signals: evidence volume (weighted 40%), IOC match fidelity (30%), and cross-watch corroboration (30%). This proposal scored high on all three — multiple independent data sources confirmed the finding with low false-positive overlap.',
  'what if we don\'t?': 'If this proposal is not acted on, the underlying risk remains unmitigated. Based on similar past incidents, there is a ~72% chance the situation escalates within 48 hours. The Watch will continue monitoring and may re-propose with higher urgency.',
  'show alternatives': 'Alternative actions considered:\n\n1. Partial execution — apply only the containment steps, skip remediation (faster but incomplete)\n2. Deferred action — schedule for next maintenance window (lower disruption, higher risk window)\n3. Escalate to IR — hand off to incident response team for manual investigation\n\nThe Watch recommends the proposed action as the optimal balance of speed and thoroughness.',
};

const getAskResponse = (question: string): string => {
  const lower = question.toLowerCase();
  for (const [key, response] of Object.entries(ASK_CANNED_RESPONSES)) {
    if (lower.includes(key) || key.includes(lower.slice(0, 12))) {
      return response;
    }
  }
  if (lower.includes('confidence') || lower.includes('score') || lower.includes('why')) {
    return ASK_CANNED_RESPONSES['why this confidence?'];
  }
  if (lower.includes('alternative') || lower.includes('other') || lower.includes('else')) {
    return ASK_CANNED_RESPONSES['show alternatives'];
  }
  if (lower.includes('don\'t') || lower.includes('ignore') || lower.includes('skip') || lower.includes('risk')) {
    return ASK_CANNED_RESPONSES['what if we don\'t?'];
  }
  return 'Based on the evidence gathered, this proposal reflects the Watch\'s best assessment given current telemetry. The reasoning chain above shows the full decision path. Would you like me to elaborate on a specific step?';
};

export const ProposalCard: React.FC<Props> = ({ proposal, onAction, isFocused }) => {
  const [showReasoning, setShowReasoning] = useState(false);
  const [actionState, setActionState] = useState<ActionState>(null);
  const [modifyNote, setModifyNote] = useState('');
  const [escalateTarget, setEscalateTarget] = useState('');
  const [flyoutStep, setFlyoutStep] = useState<ReasoningStep | null>(null);
  const [askQuestion, setAskQuestion] = useState('');
  const [askResponse, setAskResponse] = useState<string | null>(null);
  const watchConfig = WATCH_CONFIGS[proposal.watchType];

  const completeAction = (action: 'approve' | 'reject' | 'modify' | 'escalate') => {
    if (action === 'approve') {
      setActionState('executed');
    } else {
      setActionState(null);
      setTimeout(() => onAction(proposal.id, action), 100);
    }
  };

  // Executed state — show what happened, then advance
  if (actionState === 'executed') {
    const result = proposal.actionResult;
    return (
      <div css={css`animation: ${fadeIn} 0.3s ease both;`}>
        <div css={css`display: flex; align-items: center; gap: 10px; margin-bottom: 16px;`}>
          <span css={css`width: 10px; height: 10px; border-radius: 50%; background: ${watchConfig.color};`} />
          <span css={css`font-size: 13px; font-weight: 600; color: ${watchConfig.color};`}>
            {watchConfig.name}
          </span>
          <span css={css`font-size: 13px; color: rgba(255, 255, 255, 0.25);`}>·</span>
          <span css={css`font-size: 13px; color: ${watchConfig.color}; font-weight: 600;`}>
            Approved — executing
          </span>
        </div>

        <h2 css={css`font-size: 20px; font-weight: 700; color: #fff; margin: 0 0 8px; line-height: 1.3;`}>
          {proposal.title}
        </h2>

        {result && (
          <div css={css`margin-top: 16px;`}>
            <div css={css`font-size: 14px; color: rgba(255, 255, 255, 0.6); margin-bottom: 14px;`}>
              {result.summary}
            </div>
            <div css={css`display: flex; flex-direction: column; gap: 6px;`}>
              {result.steps.map((step, i) => (
                <div
                  key={i}
                  css={css`
                    display: flex;
                    align-items: flex-start;
                    gap: 10px;
                    padding: 8px 0;
                    animation: ${fadeIn} 0.25s ease both;
                    animation-delay: ${i * 150}ms;
                  `}
                >
                  <span
                    css={css`
                      width: 6px;
                      height: 6px;
                      border-radius: 50%;
                      margin-top: 6px;
                      flex-shrink: 0;
                      background: ${step.status === 'done' ? '#48EFCF' : step.status === 'blocked' ? '#FF957D' : 'rgba(255, 255, 255, 0.2)'};
                    `}
                  />
                  <div>
                    <div css={css`font-size: 13px; color: ${step.status === 'done' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 255, 255, 0.4)'}; line-height: 1.4;`}>
                      {step.action}
                    </div>
                    {step.detail && (
                      <div css={css`font-size: 12px; color: rgba(255, 255, 255, 0.25); margin-top: 2px;`}>
                        {step.detail}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => onAction(proposal.id, 'approve')}
          css={css`
            margin-top: 24px;
            padding: 10px 24px;
            background: rgba(72, 239, 207, 0.08);
            border: 1px solid rgba(72, 239, 207, 0.25);
            border-radius: 8px;
            color: #48efcf;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.12s ease;
            &:hover { background: rgba(72, 239, 207, 0.14); border-color: rgba(72, 239, 207, 0.4); }
          `}
        >
          Next proposal →
        </button>
      </div>
    );
  }

  return (
    <div css={css`animation: ${fadeIn} 0.3s ease both;`}>
      {/* Source + collab */}
      <div css={css`display: flex; align-items: center; gap: 10px; margin-bottom: 16px; flex-wrap: wrap;`}>
        <span css={css`width: 10px; height: 10px; border-radius: 50%; background: ${watchConfig.color};`} />
        <span css={css`font-size: 13px; font-weight: 600; color: ${watchConfig.color};`}>
          {watchConfig.name}
        </span>
        {proposal.collaborators && proposal.collaborators.length > 0 && (
          <>
            <span css={css`font-size: 11px; color: rgba(255, 255, 255, 0.2);`}>+</span>
            {proposal.collaborators.map((c) => (
              <span
                key={c.watchType}
                css={css`
                  font-size: 11px;
                  color: ${WATCH_CONFIGS[c.watchType].color}aa;
                  padding: 2px 8px;
                  background: ${WATCH_CONFIGS[c.watchType].color}0a;
                  border: 1px solid ${WATCH_CONFIGS[c.watchType].color}20;
                  border-radius: 4px;
                `}
                title={c.contribution}
              >
                {WATCH_CONFIGS[c.watchType].name}
              </span>
            ))}
          </>
        )}
        <span css={css`margin-left: auto; font-size: 12px; color: rgba(255, 255, 255, 0.3);`}>
          {proposal.createdAt}
        </span>
        <span css={css`font-size: 12px; font-weight: 600; color: ${watchConfig.color}bb;`}>
          {proposal.confidence}%
        </span>
      </div>

      {/* Title */}
      <h2 css={css`font-size: 24px; font-weight: 700; color: #fff; margin: 0 0 12px; line-height: 1.3; letter-spacing: -0.01em;`}>
        {proposal.title}
      </h2>

      {/* Summary */}
      <p css={css`font-size: 15px; color: rgba(255, 255, 255, 0.6); line-height: 1.7; margin: 0 0 24px; max-width: 680px;`}>
        {proposal.summary}
      </p>

      {/* Impact */}
      <div
        css={css`
          display: flex;
          gap: 0;
          margin-bottom: 24px;
          padding: 0;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.04);
          background: rgba(255, 255, 255, 0.012);
          overflow: hidden;
        `}
      >
        {proposal.impactMetrics.map((m, i) => (
          <div key={m.label} css={css`flex: 1; padding: 16px 20px; ${i > 0 ? `border-left: 1px solid rgba(255, 255, 255, 0.04);` : ''}`}>
            <div css={css`font-size: 10px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255, 255, 255, 0.25); margin-bottom: 6px;`}>
              {m.label}
            </div>
            <div css={css`font-size: 24px; font-weight: 700; color: #fff; font-variant-numeric: tabular-nums; letter-spacing: -0.02em;`}>
              {m.value}
            </div>
          </div>
        ))}
      </div>

      {/* Recommendation */}
      <div css={css`font-size: 14px; color: rgba(255, 255, 255, 0.5); line-height: 1.7; margin-bottom: 24px; padding: 14px 16px; padding-left: 16px; border-left: 2px solid ${watchConfig.color}40; background: rgba(255, 255, 255, 0.01); border-radius: 0 8px 8px 0;`}>
        {proposal.recommendation}
      </div>

      {/* Reasoning chain */}
      {proposal.reasoningChain && (
        <div css={css`margin-bottom: 28px;`}>
          <div css={css`display: flex; align-items: center; gap: 12px;`}>
            <button
              onClick={() => setShowReasoning(!showReasoning)}
              css={css`
                background: none;
                border: none;
                font-size: 13px;
                color: rgba(255, 255, 255, 0.35);
                cursor: pointer;
                padding: 0;
                display: flex;
                align-items: center;
                gap: 6px;
                transition: color 0.12s ease;
                &:hover { color: rgba(255, 255, 255, 0.6); }
              `}
            >
              <span css={css`font-size: 10px; transition: transform 0.2s ease; transform: ${showReasoning ? 'rotate(90deg)' : 'none'};`}>▶</span>
              {showReasoning ? 'Hide reasoning chain' : `Show reasoning chain (${proposal.reasoningChain.length} steps)`}
            </button>
            <span css={css`font-size: 13px; color: rgba(255, 255, 255, 0.12);`}>·</span>
            <button
              onClick={() => setActionState(actionState === 'askingAbout' ? null : 'askingAbout')}
              css={css`
                background: none;
                border: none;
                font-size: 13px;
                color: ${actionState === 'askingAbout' ? `${watchConfig.color}` : 'rgba(255, 255, 255, 0.35)'};
                cursor: pointer;
                padding: 0;
                display: flex;
                align-items: center;
                gap: 5px;
                transition: color 0.12s ease;
                &:hover { color: ${watchConfig.color}; }
              `}
            >
              Ask about this →
            </button>
          </div>

          {showReasoning && (
            <div css={css`margin-top: 16px; padding-left: 2px; animation: ${fadeIn} 0.25s ease both;`}>
              {proposal.reasoningChain.map((step, i) => (
                <button
                  key={i}
                  onClick={() => step.flyout && setFlyoutStep(step)}
                  css={css`
                    display: flex;
                    gap: 12px;
                    padding: 10px 8px;
                    border-radius: 6px;
                    position: relative;
                    width: 100%;
                    text-align: left;
                    background: none;
                    border: none;
                    cursor: ${step.flyout ? 'pointer' : 'default'};
                    transition: background 0.1s ease;
                    ${step.flyout ? '&:hover { background: rgba(255, 255, 255, 0.02); }' : ''}
                    &::before {
                      content: '';
                      position: absolute;
                      left: 17px;
                      top: 36px;
                      bottom: -2px;
                      width: 1px;
                      background: ${i < proposal.reasoningChain!.length - 1 ? 'rgba(255, 255, 255, 0.05)' : 'transparent'};
                    }
                  `}
                >
                  <span
                    css={css`
                      width: 20px;
                      height: 20px;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      font-size: 11px;
                      flex-shrink: 0;
                      border-radius: 4px;
                      background: ${step.type === 'collaboration'
                        ? 'rgba(106, 173, 255, 0.1)'
                        : step.type === 'conclusion'
                        ? `${watchConfig.color}15`
                        : 'rgba(255, 255, 255, 0.03)'};
                      color: ${step.type === 'collaboration'
                        ? '#6AADFF'
                        : step.type === 'conclusion'
                        ? watchConfig.color
                        : 'rgba(255, 255, 255, 0.35)'};
                    `}
                  >
                    {STEP_ICONS[step.type]}
                  </span>
                  <div css={css`flex: 1;`}>
                    <div css={css`font-size: 13px; color: rgba(255, 255, 255, 0.6); line-height: 1.4; display: flex; align-items: center; gap: 6px;`}>
                      {step.label}
                      {step.flyout && (
                        <span css={css`font-size: 10px; color: rgba(255, 255, 255, 0.2); transition: color 0.1s;`}>↗</span>
                      )}
                    </div>
                    {step.detail && (
                      <div css={css`font-size: 12px; color: rgba(255, 255, 255, 0.3); margin-top: 2px; line-height: 1.4;`}>
                        {step.detail}
                      </div>
                    )}
                    {step.source && (
                      <span css={css`font-size: 10px; color: rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.03); padding: 1px 6px; border-radius: 3px; margin-top: 4px; display: inline-block;`}>
                        {step.source}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Flyout */}
      {flyoutStep && flyoutStep.flyout && (
        <ReasoningFlyout step={flyoutStep} color={watchConfig.color} onClose={() => setFlyoutStep(null)} />
      )}

      {/* Ask about this */}
      {actionState === 'askingAbout' && (
        <div css={css`animation: ${fadeIn} 0.2s ease both; margin-bottom: 24px;`}>
          <div css={css`font-size: 13px; color: rgba(255, 255, 255, 0.45); margin-bottom: 10px;`}>
            Ask the {watchConfig.name} about this proposal
          </div>
          <div css={css`display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px;`}>
            {['why this confidence?', 'what if we don\'t?', 'show alternatives'].map((q) => (
              <button
                key={q}
                onClick={() => {
                  setAskQuestion(q);
                  setAskResponse(getAskResponse(q));
                }}
                css={css`
                  padding: 6px 12px; border-radius: 14px; font-size: 12px;
                  background: rgba(255, 255, 255, 0.03);
                  border: 1px solid rgba(255, 255, 255, 0.08);
                  color: rgba(255, 255, 255, 0.45); cursor: pointer;
                  transition: all 0.12s ease;
                  &:hover { background: ${watchConfig.color}10; border-color: ${watchConfig.color}30; color: ${watchConfig.color}; }
                `}
              >
                {q}
              </button>
            ))}
          </div>
          <div css={css`display: flex; gap: 10px; align-items: flex-start;`}>
            <input
              type="text"
              value={askQuestion}
              onChange={(e) => setAskQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && askQuestion.trim()) {
                  setAskResponse(getAskResponse(askQuestion));
                }
              }}
              placeholder="Type a question about this proposal..."
              autoFocus
              css={css`
                flex: 1; padding: 10px 14px;
                background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px; color: #fff; font-size: 14px; outline: none; font-family: inherit;
                &:focus { border-color: ${watchConfig.color}40; }
                &::placeholder { color: rgba(255, 255, 255, 0.2); }
              `}
            />
            <button
              onClick={() => { if (askQuestion.trim()) setAskResponse(getAskResponse(askQuestion)); }}
              css={css`
                padding: 10px 16px; background: ${watchConfig.color}; color: #0a0e1a;
                font-size: 12px; font-weight: 700; border: none; border-radius: 6px; cursor: pointer;
                &:hover { opacity: 0.85; }
              `}
            >
              Ask
            </button>
          </div>
          {askResponse && (
            <div css={css`
              margin-top: 14px; padding: 14px 16px; border-radius: 10px;
              background: ${watchConfig.color}06; border: 1px solid ${watchConfig.color}18;
              animation: ${fadeIn} 0.25s ease both;
            `}>
              <div css={css`display: flex; align-items: center; gap: 8px; margin-bottom: 8px;`}>
                <span css={css`width: 7px; height: 7px; border-radius: 50%; background: ${watchConfig.color};`} />
                <span css={css`font-size: 11px; font-weight: 600; color: ${watchConfig.color};`}>{watchConfig.name}</span>
              </div>
              <div css={css`font-size: 13px; color: rgba(255, 255, 255, 0.6); line-height: 1.7; white-space: pre-wrap;`}>
                {askResponse}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {actionState === null && (
        <div css={css`display: flex; align-items: center; gap: 10px;`}>
          <button
            onClick={() => setActionState('confirming_approve')}
            css={css`
              padding: 10px 28px;
              background: ${watchConfig.color};
              color: #0a0e1a;
              font-size: 14px;
              font-weight: 700;
              border: none;
              border-radius: 8px;
              cursor: pointer;
              transition: all 0.12s ease;
              &:hover { opacity: 0.85; box-shadow: 0 4px 16px ${watchConfig.color}30; }
            `}
          >
            Approve
          </button>
          <button
            onClick={() => setActionState('modifying')}
            css={css`padding: 10px 20px; background: none; color: rgba(255, 255, 255, 0.55); font-size: 13px; font-weight: 500; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; cursor: pointer; transition: all 0.12s ease; &:hover { color: rgba(255, 255, 255, 0.8); border-color: rgba(255, 255, 255, 0.2); }`}
          >
            Modify
          </button>
          <button
            onClick={() => setActionState('escalating')}
            css={css`padding: 10px 20px; background: none; color: rgba(255, 255, 255, 0.55); font-size: 13px; font-weight: 500; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; cursor: pointer; transition: all 0.12s ease; &:hover { color: rgba(255, 255, 255, 0.8); border-color: rgba(255, 255, 255, 0.2); }`}
          >
            Escalate
          </button>
          <div css={css`flex: 1;`} />
          <button
            onClick={() => setActionState('confirming_reject')}
            css={css`padding: 10px 20px; background: none; color: rgba(255, 255, 255, 0.3); font-size: 13px; border: none; cursor: pointer; &:hover { color: rgba(255, 149, 125, 0.7); }`}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Confirm approve */}
      {actionState === 'confirming_approve' && (
        <div css={css`animation: ${fadeIn} 0.2s ease both; display: flex; align-items: center; gap: 12px;`}>
          <span css={css`font-size: 14px; color: rgba(255, 255, 255, 0.6);`}>Execute this?</span>
          <button onClick={() => completeAction('approve')} css={css`padding: 8px 20px; background: ${watchConfig.color}; color: #0a0e1a; font-size: 13px; font-weight: 700; border: none; border-radius: 6px; cursor: pointer;`}>
            Yes, execute
          </button>
          <button onClick={() => setActionState(null)} css={css`padding: 8px 16px; background: none; color: rgba(255, 255, 255, 0.4); font-size: 13px; border: none; cursor: pointer; &:hover { color: rgba(255, 255, 255, 0.7); }`}>
            Cancel
          </button>
        </div>
      )}

      {/* Confirm reject */}
      {actionState === 'confirming_reject' && (
        <div css={css`animation: ${fadeIn} 0.2s ease both; display: flex; align-items: center; gap: 12px;`}>
          <span css={css`font-size: 14px; color: rgba(255, 255, 255, 0.5);`}>Dismiss? The Watch learns from this.</span>
          <button onClick={() => completeAction('reject')} css={css`padding: 8px 20px; background: rgba(255, 149, 125, 0.12); color: #FF957D; font-size: 13px; font-weight: 600; border: 1px solid rgba(255, 149, 125, 0.25); border-radius: 6px; cursor: pointer;`}>
            Dismiss
          </button>
          <button onClick={() => setActionState(null)} css={css`padding: 8px 16px; background: none; color: rgba(255, 255, 255, 0.4); font-size: 13px; border: none; cursor: pointer; &:hover { color: rgba(255, 255, 255, 0.7); }`}>
            Cancel
          </button>
        </div>
      )}

      {/* Modify */}
      {actionState === 'modifying' && (
        <div css={css`animation: ${fadeIn} 0.2s ease both;`}>
          <div css={css`font-size: 13px; color: rgba(255, 255, 255, 0.45); margin-bottom: 10px;`}>
            Your feedback trains the Watch. What should change?
          </div>
          <div css={css`display: flex; gap: 10px; align-items: flex-start;`}>
            <textarea
              value={modifyNote}
              onChange={(e) => setModifyNote(e.target.value)}
              placeholder="e.g. Only suppress 8 of the 12 — keep the T1059 coverage..."
              rows={2}
              autoFocus
              css={css`flex: 1; padding: 10px 14px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; color: #fff; font-size: 14px; line-height: 1.5; resize: none; outline: none; font-family: inherit; &:focus { border-color: ${watchConfig.color}40; } &::placeholder { color: rgba(255, 255, 255, 0.2); }`}
            />
            <div css={css`display: flex; flex-direction: column; gap: 6px;`}>
              <button onClick={() => completeAction('modify')} css={css`padding: 8px 16px; background: ${watchConfig.color}; color: #0a0e1a; font-size: 12px; font-weight: 700; border: none; border-radius: 6px; cursor: pointer; white-space: nowrap;`}>
                Send
              </button>
              <button onClick={() => { setActionState(null); setModifyNote(''); }} css={css`padding: 6px 12px; background: none; color: rgba(255, 255, 255, 0.35); font-size: 12px; border: none; cursor: pointer; &:hover { color: rgba(255, 255, 255, 0.6); }`}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Escalate */}
      {actionState === 'escalating' && (
        <div css={css`animation: ${fadeIn} 0.2s ease both;`}>
          <div css={css`font-size: 13px; color: rgba(255, 255, 255, 0.45); margin-bottom: 12px;`}>
            Bring another human into this decision.
          </div>
          <div css={css`display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px;`}>
            {['Sarah Chen (SOC Lead)', 'Marcus Rivera (IR)', 'Dima Kozlov (Eng)', 'CISO'].map((p) => {
              const personName = p.split('(')[0].trim();
              return (
                <button
                  key={p}
                  onClick={() => setEscalateTarget(p)}
                  css={css`padding: 8px 14px; background: ${escalateTarget === p ? 'rgba(106, 173, 255, 0.1)' : 'rgba(255, 255, 255, 0.02)'}; border: 1px solid ${escalateTarget === p ? 'rgba(106, 173, 255, 0.35)' : 'rgba(255, 255, 255, 0.06)'}; border-radius: 6px; color: ${escalateTarget === p ? '#6AADFF' : 'rgba(255, 255, 255, 0.5)'}; font-size: 13px; cursor: pointer; transition: all 0.1s ease; display: flex; align-items: center; gap: 8px; &:hover { border-color: rgba(106, 173, 255, 0.25); }`}
                >
                  {personName !== 'CISO' && <UserAvatar name={personName} size={22} />}
                  {p}
                </button>
              );
            })}
          </div>
          <div css={css`display: flex; gap: 10px;`}>
            <button
              onClick={() => completeAction('escalate')}
              disabled={!escalateTarget}
              css={css`padding: 8px 20px; background: ${escalateTarget ? 'rgba(106, 173, 255, 0.12)' : 'rgba(255, 255, 255, 0.02)'}; color: ${escalateTarget ? '#6AADFF' : 'rgba(255, 255, 255, 0.2)'}; font-size: 13px; font-weight: 600; border: 1px solid ${escalateTarget ? 'rgba(106, 173, 255, 0.3)' : 'rgba(255, 255, 255, 0.04)'}; border-radius: 6px; cursor: ${escalateTarget ? 'pointer' : 'default'};`}
            >
              Escalate
            </button>
            <button onClick={() => { setActionState(null); setEscalateTarget(''); }} css={css`padding: 8px 16px; background: none; color: rgba(255, 255, 255, 0.35); font-size: 13px; border: none; cursor: pointer; &:hover { color: rgba(255, 255, 255, 0.6); }`}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Flyout component for reasoning step detail
const ReasoningFlyout: React.FC<{ step: ReasoningStep; color: string; onClose: () => void }> = ({ step, color, onClose }) => {
  const flyout = step.flyout!;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        css={css`
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 1000;
          animation: ${fadeIn} 0.15s ease both;
        `}
      />
      {/* Panel */}
      <div
        css={css`
          position: fixed;
          top: 0;
          right: 0;
          bottom: 0;
          width: 480px;
          max-width: 90vw;
          background: #0c0e16;
          border-left: 1px solid rgba(255, 255, 255, 0.06);
          z-index: 1001;
          overflow-y: auto;
          animation: flyoutSlide 0.2s ease both;
          @keyframes flyoutSlide {
            from { transform: translateX(20px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
        `}
      >
        {/* Header */}
        <div css={css`padding: 24px 28px 0; position: sticky; top: 0; background: #0c0e16; z-index: 1;`}>
          <div css={css`display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;`}>
            <div css={css`display: flex; align-items: center; gap: 8px;`}>
              <span
                css={css`
                  width: 22px; height: 22px; display: flex; align-items: center; justify-content: center;
                  font-size: 12px; border-radius: 5px;
                  background: ${step.type === 'collaboration' ? 'rgba(106, 173, 255, 0.1)' : step.type === 'conclusion' ? `${color}15` : 'rgba(255, 255, 255, 0.04)'};
                  color: ${step.type === 'collaboration' ? '#6AADFF' : step.type === 'conclusion' ? color : 'rgba(255, 255, 255, 0.4)'};
                `}
              >
                {STEP_ICONS[step.type]}
              </span>
              <span css={css`font-size: 11px; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255, 255, 255, 0.3);`}>
                {step.type}
              </span>
              {step.source && (
                <span css={css`font-size: 10px; color: rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.03); padding: 2px 8px; border-radius: 4px;`}>
                  {step.source}
                </span>
              )}
            </div>
            <button onClick={onClose} css={css`background: none; border: none; color: rgba(255, 255, 255, 0.3); font-size: 20px; cursor: pointer; padding: 4px 8px; border-radius: 4px; &:hover { color: rgba(255, 255, 255, 0.6); background: rgba(255, 255, 255, 0.04); }`}>
              ×
            </button>
          </div>
          <h3 css={css`font-size: 18px; font-weight: 700; color: #fff; margin: 0 0 4px; line-height: 1.3;`}>
            {flyout.title}
          </h3>
          <div css={css`height: 1px; background: rgba(255, 255, 255, 0.06); margin-top: 16px;`} />
        </div>

        {/* Body */}
        <div css={css`padding: 20px 28px 32px;`}>
          {/* Content */}
          <div css={css`font-size: 14px; color: rgba(255, 255, 255, 0.55); line-height: 1.8; white-space: pre-wrap; margin-bottom: 24px;`}>
            {flyout.content}
          </div>

          {/* Data table */}
          {flyout.data && flyout.data.length > 0 && (
            <div css={css`margin-bottom: 24px;`}>
              <div css={css`font-size: 11px; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255, 255, 255, 0.25); margin-bottom: 10px;`}>
                Data
              </div>
              <div css={css`border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.04); overflow: hidden;`}>
                {flyout.data.map((item, i) => (
                  <div
                    key={i}
                    css={css`
                      display: flex; justify-content: space-between; align-items: center;
                      padding: 10px 14px;
                      background: ${i % 2 === 0 ? 'rgba(255, 255, 255, 0.015)' : 'transparent'};
                    `}
                  >
                    <span css={css`font-size: 13px; color: rgba(255, 255, 255, 0.4);`}>{item.label}</span>
                    <span css={css`font-size: 13px; font-weight: 600; color: #fff; font-variant-numeric: tabular-nums;`}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Query */}
          {flyout.query && (
            <div css={css`margin-bottom: 24px;`}>
              <div css={css`font-size: 11px; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255, 255, 255, 0.25); margin-bottom: 10px;`}>
                Query executed
              </div>
              <pre
                css={css`
                  padding: 14px 16px;
                  background: rgba(255, 255, 255, 0.02);
                  border: 1px solid rgba(255, 255, 255, 0.05);
                  border-radius: 8px;
                  font-size: 12px;
                  color: ${color}cc;
                  font-family: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;
                  line-height: 1.6;
                  overflow-x: auto;
                  white-space: pre-wrap;
                  margin: 0;
                `}
              >
                {flyout.query}
              </pre>
            </div>
          )}

          {/* Results */}
          {flyout.results && (
            <div>
              <div css={css`font-size: 11px; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255, 255, 255, 0.25); margin-bottom: 10px;`}>
                Results
              </div>
              <pre
                css={css`
                  padding: 14px 16px;
                  background: rgba(255, 255, 255, 0.02);
                  border: 1px solid rgba(255, 255, 255, 0.05);
                  border-radius: 8px;
                  font-size: 12px;
                  color: rgba(255, 255, 255, 0.5);
                  font-family: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;
                  line-height: 1.6;
                  overflow-x: auto;
                  white-space: pre-wrap;
                  margin: 0;
                `}
              >
                {flyout.results}
              </pre>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
