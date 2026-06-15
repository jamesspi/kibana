/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import { css, keyframes } from '@emotion/react';
import { WATCH_CONFIGS } from '../../../common';
import { ProposalCard } from './proposal_card';
import type { EnrichedProposal, HistoryEntry } from '../../data/mock_proposals';
import { MOCK_HISTORY } from '../../data/mock_proposals';
import { UserAvatar } from '../common/user_avatar';

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
`;

interface Props {
  proposals: EnrichedProposal[];
  onAction: (id: string, action: 'approve' | 'reject' | 'modify' | 'escalate') => void;
}

export const ProposalQueue: React.FC<Props> = ({ proposals, onAction }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [view, setView] = useState<'queue' | 'history'>('queue');
  const [selectedHistoryEntry, setSelectedHistoryEntry] = useState<HistoryEntry | null>(null);

  const pending = proposals.filter((p) => p.status === 'pending');
  const resolved = proposals.filter((p) => p.status !== 'pending');

  const sorted = [...pending].sort((a, b) => {
    const sev = { critical: 0, high: 1, medium: 2, low: 3 };
    const diff = sev[a.severity] - sev[b.severity];
    return diff !== 0 ? diff : b.confidence - a.confidence;
  });

  const focusedProposal = expandedId
    ? sorted.find((p) => p.id === expandedId) || sorted[0]
    : sorted[0];

  const queue = sorted.filter((p) => p.id !== focusedProposal?.id);

  // Build combined history
  const allHistory: HistoryEntry[] = [
    ...resolved.map((p): HistoryEntry => ({
      id: p.id,
      watchType: p.watchType,
      title: p.title,
      outcome: p.status as HistoryEntry['outcome'],
      timestamp: '',
      timeAgo: 'Just now',
      actor: 'human',
      actorName: 'You',
    })),
    ...MOCK_HISTORY,
  ];

  return (
    <div>
      {/* Sub-nav */}
      <div css={css`display: flex; gap: 6px; margin-bottom: 28px;`}>
        <button
          onClick={() => setView('queue')}
          css={css`
            padding: 7px 14px; border-radius: 6px; font-size: 13px; cursor: pointer;
            background: ${view === 'queue' ? 'rgba(255, 255, 255, 0.05)' : 'none'};
            border: 1px solid ${view === 'queue' ? 'rgba(255, 255, 255, 0.08)' : 'transparent'};
            color: ${view === 'queue' ? '#fff' : 'rgba(255, 255, 255, 0.35)'};
            font-weight: ${view === 'queue' ? 600 : 400};
            &:hover { color: rgba(255, 255, 255, 0.7); }
          `}
        >
          Queue{pending.length > 0 ? ` (${pending.length})` : ''}
        </button>
        <button
          onClick={() => setView('history')}
          css={css`
            padding: 7px 14px; border-radius: 6px; font-size: 13px; cursor: pointer;
            background: ${view === 'history' ? 'rgba(255, 255, 255, 0.05)' : 'none'};
            border: 1px solid ${view === 'history' ? 'rgba(255, 255, 255, 0.08)' : 'transparent'};
            color: ${view === 'history' ? '#fff' : 'rgba(255, 255, 255, 0.35)'};
            font-weight: ${view === 'history' ? 600 : 400};
            &:hover { color: rgba(255, 255, 255, 0.7); }
          `}
        >
          History
        </button>
      </div>

      {/* Queue view */}
      {view === 'queue' && (
        <>
          {!focusedProposal ? (
            <div css={css`text-align: center; padding: 60px 20px; color: rgba(255, 255, 255, 0.35);`}>
              <div css={css`font-size: 32px; margin-bottom: 12px; opacity: 0.3;`}>✓</div>
              <div css={css`font-size: 16px; font-weight: 600; color: rgba(255, 255, 255, 0.5); margin-bottom: 6px;`}>All clear</div>
              <div css={css`font-size: 14px;`}>No pending proposals. Check history to see what's been done.</div>
            </div>
          ) : (
            <>
              <ProposalCard key={focusedProposal.id} proposal={focusedProposal} onAction={onAction} isFocused />

              {/* Context panel */}
              <div css={css`margin-top: 32px; padding-top: 24px; border-top: 1px solid rgba(255, 255, 255, 0.04); display: grid; grid-template-columns: 1fr 1fr; gap: 24px;`}>
                <div>
                  <div css={css`font-size: 11px; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255, 255, 255, 0.25); margin-bottom: 10px;`}>
                    Entities involved
                  </div>
                  <div css={css`display: flex; flex-direction: column; gap: 4px;`}>
                    {getEntities(focusedProposal).map((entity, i) => (
                      <div key={i} css={css`display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.02); &:last-child { border-bottom: none; }`}>
                        <span css={css`font-size: 10px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: rgba(255, 255, 255, 0.25); width: 44px;`}>{entity.type}</span>
                        <span css={css`font-size: 13px; color: rgba(255, 255, 255, 0.6); font-family: 'JetBrains Mono', monospace;`}>{entity.name}</span>
                        {entity.risk && <span css={css`margin-left: auto; font-size: 11px; font-weight: 600; color: ${entity.risk === 'critical' ? '#F04E98' : entity.risk === 'high' ? '#FEC514' : 'rgba(255, 255, 255, 0.3)'};`}>{entity.risk}</span>}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div css={css`font-size: 11px; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255, 255, 255, 0.25); margin-bottom: 10px;`}>
                    Evidence summary
                  </div>
                  <div css={css`display: grid; grid-template-columns: 1fr 1fr; gap: 8px;`}>
                    {Object.entries(focusedProposal.evidence).filter(([, v]) => v && v !== true).map(([key, value]) => (
                      <div key={key} css={css`padding: 8px 0;`}>
                        <div css={css`font-size: 18px; font-weight: 700; color: rgba(255, 255, 255, 0.7);`}>{typeof value === 'number' ? value.toLocaleString() : String(value)}</div>
                        <div css={css`font-size: 11px; color: rgba(255, 255, 255, 0.25);`}>{formatLabel(key)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Up next */}
              {queue.length > 0 && (
                <div css={css`margin-top: 28px; padding-top: 20px; border-top: 1px solid rgba(255, 255, 255, 0.04);`}>
                  <div css={css`font-size: 11px; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255, 255, 255, 0.2); margin-bottom: 10px;`}>
                    Up next · {queue.length} more
                  </div>
                  <div css={css`display: flex; flex-direction: column; gap: 2px;`}>
                    {queue.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setExpandedId(p.id)}
                        css={css`display: flex; align-items: center; gap: 14px; padding: 11px 14px; background: rgba(255, 255, 255, 0.01); border: 1px solid rgba(255, 255, 255, 0.025); border-radius: 8px; cursor: pointer; text-align: left; width: 100%; transition: all 0.1s ease; &:hover { background: rgba(255, 255, 255, 0.02); border-color: ${WATCH_CONFIGS[p.watchType].color}18; }`}
                      >
                        <span css={css`width: 6px; height: 6px; border-radius: 50%; background: ${WATCH_CONFIGS[p.watchType].color}; opacity: 0.7;`} />
                        <span css={css`font-size: 13px; color: rgba(255, 255, 255, 0.55); flex: 1;`}>{p.title}</span>
                        <span css={css`font-size: 11px; color: rgba(255, 255, 255, 0.2); text-transform: uppercase;`}>{p.severity}</span>
                        <span css={css`font-size: 12px; font-weight: 600; color: ${WATCH_CONFIGS[p.watchType].color}77;`}>{p.confidence}%</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* History view */}
      {view === 'history' && (
        <div>
          {/* Legend */}
          <div css={css`display: flex; gap: 16px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.03);`}>
            <div css={css`display: flex; align-items: center; gap: 6px;`}>
              <span css={css`font-size: 10px; color: #6AADFF;`}>●</span>
              <span css={css`font-size: 11px; color: rgba(255, 255, 255, 0.3);`}>Human decision</span>
            </div>
            <div css={css`display: flex; align-items: center; gap: 6px;`}>
              <span css={css`font-size: 10px; color: #48EFCF;`}>⚡</span>
              <span css={css`font-size: 11px; color: rgba(255, 255, 255, 0.3);`}>Fully automated</span>
            </div>
          </div>

          <div css={css`display: flex; flex-direction: column; gap: 2px;`}>
            {allHistory.map((entry) => {
              const config = WATCH_CONFIGS[entry.watchType];
              const isAuto = entry.actor === 'auto';
              const outcomeColors: Record<string, string> = { approved: '#48EFCF', rejected: '#FF957D', modified: '#FEC514', escalated: '#6AADFF', auto_executed: '#48EFCF' };
              const outcomeLabels: Record<string, string> = { approved: 'Approved', rejected: 'Dismissed', modified: 'Modified', escalated: 'Escalated', auto_executed: 'Auto' };
              return (
                <button
                  key={entry.id}
                  onClick={() => setSelectedHistoryEntry(entry)}
                  css={css`
                    padding: 12px 14px; border-radius: 8px; background: rgba(255, 255, 255, 0.008);
                    border: 1px solid rgba(255, 255, 255, 0.02); text-align: left; width: 100%; cursor: pointer;
                    transition: all 0.12s ease;
                    &:hover { background: rgba(255, 255, 255, 0.025); border-color: ${config.color}15; }
                  `}
                >
                  <div css={css`display: flex; align-items: center; gap: 12px;`}>
                    <span css={css`width: 6px; height: 6px; border-radius: 50%; background: ${config.color}; opacity: 0.6; flex-shrink: 0;`} />
                    <span css={css`font-size: 10px; width: 14px; text-align: center; flex-shrink: 0; color: ${isAuto ? '#48EFCF' : '#6AADFF'};`}>
                      {isAuto ? '⚡' : '●'}
                    </span>
                    <span css={css`font-size: 13px; color: rgba(255, 255, 255, 0.6); flex: 1;`}>{entry.title}</span>
                    {entry.actorName && (
                      <div css={css`display: flex; align-items: center; gap: 6px;`}>
                        <UserAvatar name={entry.actorName} size={20} />
                        <span css={css`font-size: 11px; color: rgba(255, 255, 255, 0.2);`}>{entry.actorName}</span>
                      </div>
                    )}
                    <span css={css`font-size: 10px; font-weight: 600; color: ${outcomeColors[entry.outcome]}; text-transform: uppercase; letter-spacing: 0.04em;`}>
                      {outcomeLabels[entry.outcome]}
                    </span>
                    <span css={css`font-size: 11px; color: rgba(255, 255, 255, 0.15); width: 56px; text-align: right;`}>{entry.timeAgo}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {selectedHistoryEntry && (
            <HistoryFlyout
              entry={selectedHistoryEntry}
              resolvedProposal={resolved.find((p) => p.id === selectedHistoryEntry.id)}
              onClose={() => setSelectedHistoryEntry(null)}
            />
          )}
        </div>
      )}
    </div>
  );
};

function getEntities(proposal: EnrichedProposal): Array<{ type: string; name: string; risk?: string }> {
  const m: Record<string, Array<{ type: string; name: string; risk?: string }>> = {
    'prop-001': [
      { type: 'Rule', name: 'Suspicious Network Connection', risk: 'low' },
      { type: 'Rule', name: 'Unusual Process Execution', risk: 'low' },
      { type: 'Source', name: '10.20.0.0/16 (Qualys)' },
    ],
    'prop-002': [
      { type: 'User', name: 'j.martinez@corp.io', risk: 'critical' },
      { type: 'User', name: 's.park@corp.io', risk: 'critical' },
      { type: 'User', name: 'r.chen@corp.io', risk: 'critical' },
      { type: 'IP', name: '185.234.x.x (47 IPs, 3 ASNs)' },
    ],
    'prop-003': [
      { type: 'Account', name: 'svc-backup-prod', risk: 'critical' },
      { type: 'Host', name: 'jump-box-03', risk: 'high' },
      { type: 'Host', name: 'dc-prod-01', risk: 'critical' },
      { type: 'Host', name: 'ws-fin-01...06 (6 hosts)', risk: 'high' },
    ],
    'prop-005': [
      { type: 'Host', name: 'dev-ws-14', risk: 'critical' },
      { type: 'Host', name: 'build-srv-02', risk: 'critical' },
      { type: 'File', name: 'updater.dll (modified)' },
      { type: 'Advisory', name: 'CISA AA24-312A' },
    ],
    'prop-006': [
      { type: 'Rule', name: 'DLL Side-Load (new)' },
      { type: 'Rule', name: 'Svc Account Anomaly (new)' },
      { type: 'Rule', name: 'Encoded PS Callback (new)' },
    ],
    'prop-007': [
      { type: 'Host', name: 'edge-fw-01 (FortiGate)', risk: 'critical' },
      { type: 'CVE', name: 'CVE-2024-21762', risk: 'critical' },
      { type: 'C2', name: '*.update-check.cloud', risk: 'high' },
      { type: 'Actor', name: 'APT41' },
    ],
  };
  return m[proposal.id] || [{ type: 'Source', name: 'Watch analysis' }];
}

function formatLabel(key: string): string {
  const l: Record<string, string> = {
    rulesAnalyzed: 'Rules analyzed',
    alertsProcessed: 'Alerts processed',
    groundTruthLabels: 'Ground truth labels',
    hostsInvestigated: 'Hosts investigated',
    iocMatches: 'IOC matches',
    timelineEvents: 'Timeline events',
    queriesRun: 'Queries run',
  };
  return l[key] || key;
}

const HistoryFlyout: React.FC<{
  entry: HistoryEntry;
  resolvedProposal?: EnrichedProposal;
  onClose: () => void;
}> = ({ entry, resolvedProposal, onClose }) => {
  const config = WATCH_CONFIGS[entry.watchType];
  const isAuto = entry.actor === 'auto';
  const outcomeColors: Record<string, string> = { approved: '#48EFCF', rejected: '#FF957D', modified: '#FEC514', escalated: '#6AADFF', auto_executed: '#48EFCF' };
  const outcomeLabels: Record<string, string> = { approved: 'Approved', rejected: 'Dismissed', modified: 'Modified', escalated: 'Escalated', auto_executed: 'Auto' };

  return (
    <>
      <div
        onClick={onClose}
        css={css`
          position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5);
          z-index: 1000; animation: ${fadeIn} 0.15s ease both;
        `}
      />
      <div
        css={css`
          position: fixed; top: 0; right: 0; bottom: 0; width: 480px; max-width: 90vw;
          background: #0c0e16; border-left: 1px solid rgba(255, 255, 255, 0.06);
          z-index: 1001; overflow-y: auto;
          animation: historyFlyoutSlide 0.2s ease both;
          @keyframes historyFlyoutSlide {
            from { transform: translateX(20px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
        `}
      >
        {/* Header */}
        <div css={css`padding: 24px 28px 0; position: sticky; top: 0; background: #0c0e16; z-index: 1;`}>
          <div css={css`display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;`}>
            <div css={css`display: flex; align-items: center; gap: 10px;`}>
              <span css={css`width: 8px; height: 8px; border-radius: 50%; background: ${config.color};`} />
              <span css={css`font-size: 13px; font-weight: 600; color: ${config.color};`}>{config.name}</span>
              <span css={css`
                font-size: 10px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;
                padding: 3px 8px; border-radius: 4px;
                background: ${outcomeColors[entry.outcome]}12;
                color: ${outcomeColors[entry.outcome]};
                border: 1px solid ${outcomeColors[entry.outcome]}25;
              `}>
                {outcomeLabels[entry.outcome]}
              </span>
            </div>
            <button
              onClick={onClose}
              css={css`background: none; border: none; color: rgba(255, 255, 255, 0.3); font-size: 20px; cursor: pointer; padding: 4px 8px; border-radius: 4px; &:hover { color: rgba(255, 255, 255, 0.6); background: rgba(255, 255, 255, 0.04); }`}
            >
              ×
            </button>
          </div>
          <div css={css`font-size: 11px; color: rgba(255, 255, 255, 0.25); margin-bottom: 12px;`}>
            {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : entry.timeAgo}
          </div>
          <h3 css={css`font-size: 20px; font-weight: 700; color: #fff; margin: 0 0 4px; line-height: 1.3;`}>
            {entry.title}
          </h3>
          <div css={css`height: 1px; background: rgba(255, 255, 255, 0.06); margin-top: 16px;`} />
        </div>

        {/* Body */}
        <div css={css`padding: 20px 28px 32px;`}>
          {/* Detail text */}
          {entry.detail && (
            <div css={css`font-size: 14px; color: rgba(255, 255, 255, 0.55); line-height: 1.8; margin-bottom: 24px;`}>
              {entry.detail}
            </div>
          )}

          {/* Human decision info */}
          {entry.actor === 'human' && entry.actorName && (
            <div css={css`margin-bottom: 24px; padding: 16px; background: rgba(106, 173, 255, 0.04); border: 1px solid rgba(106, 173, 255, 0.1); border-radius: 10px;`}>
              <div css={css`font-size: 11px; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255, 255, 255, 0.25); margin-bottom: 12px;`}>
                Decision by
              </div>
              <div css={css`display: flex; align-items: center; gap: 12px;`}>
                <img
                  src={`https://i.pravatar.cc/40?u=${entry.actorName.toLowerCase().replace(/\s/g, '-')}`}
                  alt={entry.actorName}
                  css={css`width: 36px; height: 36px; border-radius: 50%; border: 2px solid rgba(106, 173, 255, 0.2);`}
                />
                <div>
                  <div css={css`font-size: 14px; font-weight: 600; color: #fff;`}>{entry.actorName}</div>
                  {entry.actorRole && (
                    <div css={css`font-size: 12px; color: rgba(255, 255, 255, 0.35);`}>{entry.actorRole}</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Auto-executed info */}
          {isAuto && entry.flyoutDetail && (
            <>
              {entry.flyoutDetail.triggeredBy && (
                <div css={css`margin-bottom: 20px;`}>
                  <div css={css`font-size: 11px; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255, 255, 255, 0.25); margin-bottom: 8px;`}>
                    Triggered by
                  </div>
                  <div css={css`font-size: 13px; color: rgba(255, 255, 255, 0.5); line-height: 1.6; padding: 12px 14px; background: rgba(72, 239, 207, 0.03); border: 1px solid rgba(72, 239, 207, 0.08); border-radius: 8px;`}>
                    {entry.flyoutDetail.triggeredBy}
                  </div>
                </div>
              )}

              {entry.flyoutDetail.duration && (
                <div css={css`margin-bottom: 20px; display: flex; align-items: center; gap: 8px;`}>
                  <span css={css`font-size: 11px; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255, 255, 255, 0.25);`}>Duration:</span>
                  <span css={css`font-size: 13px; font-weight: 600; color: rgba(255, 255, 255, 0.6); font-family: 'JetBrains Mono', monospace;`}>{entry.flyoutDetail.duration}</span>
                </div>
              )}

              {entry.flyoutDetail.steps && entry.flyoutDetail.steps.length > 0 && (
                <div css={css`margin-bottom: 24px;`}>
                  <div css={css`font-size: 11px; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255, 255, 255, 0.25); margin-bottom: 12px;`}>
                    Execution steps
                  </div>
                  <div css={css`display: flex; flex-direction: column; gap: 4px;`}>
                    {entry.flyoutDetail.steps.map((step, i) => (
                      <div
                        key={i}
                        css={css`
                          display: flex; align-items: flex-start; gap: 10px; padding: 10px 0;
                          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
                          &:last-child { border-bottom: none; }
                          animation: ${fadeIn} 0.2s ease both;
                          animation-delay: ${i * 80}ms;
                        `}
                      >
                        <span css={css`
                          width: 7px; height: 7px; border-radius: 50%; margin-top: 5px; flex-shrink: 0;
                          background: ${step.status === 'done' ? '#48EFCF' : step.status === 'blocked' ? '#FF957D' : 'rgba(255, 255, 255, 0.2)'};
                        `} />
                        <div>
                          <div css={css`font-size: 13px; color: ${step.status === 'done' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 255, 255, 0.4)'}; line-height: 1.4;`}>
                            {step.action}
                          </div>
                          {step.detail && (
                            <div css={css`font-size: 12px; color: rgba(255, 255, 255, 0.25); margin-top: 2px;`}>{step.detail}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Resolved proposal action steps */}
          {resolvedProposal?.actionResult && (
            <div css={css`margin-bottom: 24px;`}>
              <div css={css`font-size: 11px; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255, 255, 255, 0.25); margin-bottom: 8px;`}>
                Action result
              </div>
              <div css={css`font-size: 13px; color: rgba(255, 255, 255, 0.5); margin-bottom: 14px;`}>
                {resolvedProposal.actionResult.summary}
              </div>
              <div css={css`display: flex; flex-direction: column; gap: 4px;`}>
                {resolvedProposal.actionResult.steps.map((step, i) => (
                  <div
                    key={i}
                    css={css`
                      display: flex; align-items: flex-start; gap: 10px; padding: 10px 0;
                      border-bottom: 1px solid rgba(255, 255, 255, 0.03);
                      &:last-child { border-bottom: none; }
                      animation: ${fadeIn} 0.2s ease both;
                      animation-delay: ${i * 80}ms;
                    `}
                  >
                    <span css={css`
                      width: 7px; height: 7px; border-radius: 50%; margin-top: 5px; flex-shrink: 0;
                      background: ${step.status === 'done' ? '#48EFCF' : step.status === 'blocked' ? '#FF957D' : 'rgba(255, 255, 255, 0.2)'};
                    `} />
                    <div>
                      <div css={css`font-size: 13px; color: ${step.status === 'done' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 255, 255, 0.4)'}; line-height: 1.4;`}>
                        {step.action}
                      </div>
                      {step.detail && (
                        <div css={css`font-size: 12px; color: rgba(255, 255, 255, 0.25); margin-top: 2px;`}>{step.detail}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
