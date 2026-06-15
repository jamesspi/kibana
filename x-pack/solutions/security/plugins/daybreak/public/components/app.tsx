/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import type { CoreStart } from '@kbn/core/public';
import { css, Global } from '@emotion/react';
import { ProposalQueue } from './proposal_queue/proposal_queue';
import { WatchOverview } from './watch_overview/watch_overview';
import { AskSurface } from './ask/ask_surface';
import { PerformanceView } from './performance/performance_view';
import { DaybreakService } from '../services/api';
import type { WatchStatus } from '../../common';
import { MOCK_PROPOSALS, MOCK_WATCH_STATUSES } from '../data/mock_proposals';
import type { EnrichedProposal } from '../data/mock_proposals';

type Surface = 'decide' | 'watch' | 'ask' | 'performance';

interface Props {
  core: CoreStart;
}

const globalStyles = css`
  .daybreak-root {
    min-height: 100vh;
    background: #080a10;
    color: #fff;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .daybreak-root * {
    box-sizing: border-box;
  }
  .daybreak-root button {
    font-family: inherit;
  }
  .daybreak-root ::selection {
    background: rgba(72, 239, 207, 0.2);
  }
  .daybreak-root ::-webkit-scrollbar {
    width: 6px;
  }
  .daybreak-root ::-webkit-scrollbar-track {
    background: transparent;
  }
  .daybreak-root ::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.08);
    border-radius: 3px;
  }
  .daybreak-root ::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.14);
  }
`;

export const DaybreakApp: React.FC<Props> = ({ core }) => {
  const [activeSurface, setActiveSurface] = useState<Surface>('decide');
  const [proposals, setProposals] = useState<EnrichedProposal[]>(MOCK_PROPOSALS);
  const [watches, setWatches] = useState<WatchStatus[]>(MOCK_WATCH_STATUSES);
  const [isDaybreakMode, setIsDaybreakMode] = useState(true);
  const [timeRange, setTimeRange] = useState('24h');

  const TIME_OPTIONS = [
    { id: '1h', label: 'Last 1 hour' },
    { id: '4h', label: 'Last 4 hours' },
    { id: '24h', label: 'Last 24 hours' },
    { id: '7d', label: 'Last 7 days' },
    { id: '30d', label: 'Last 30 days' },
  ];
  const [showTimePicker, setShowTimePicker] = useState(false);

  const service = useMemo(() => new DaybreakService(core.http), [core.http]);

  useEffect(() => {
    service.getProposals().then((p) => setProposals(p as EnrichedProposal[])).catch(() => {});
    service.getWatches().then(setWatches).catch(() => {});
  }, [service]);

  useEffect(() => {
    core.chrome.setIsVisible(!isDaybreakMode);
  }, [isDaybreakMode, core.chrome]);

  const pendingCount = proposals.filter((p) => p.status === 'pending').length;

  const resetProposals = useCallback(() => {
    setProposals(MOCK_PROPOSALS.map((p) => ({ ...p, status: 'pending' as const })));
  }, []);

  const handleAction = useCallback(
    async (id: string, action: 'approve' | 'reject' | 'modify' | 'escalate') => {
      try {
        const updated = await service.actionProposal(id, action);
        setProposals((prev) => prev.map((p) => (p.id === updated.id ? updated as EnrichedProposal : p)));
      } catch {
        setProposals((prev) =>
          prev.map((p) => {
            if (p.id !== id) return p;
            const statusMap = { approve: 'approved', reject: 'rejected', modify: 'modified', escalate: 'escalated' } as const;
            return { ...p, status: statusMap[action] };
          })
        );
      }
    },
    [service]
  );

  const tabs: Array<{ id: Surface; label: string; badge?: number }> = [
    { id: 'decide', label: 'Decide', badge: pendingCount || undefined },
    { id: 'watch', label: 'Watch' },
    { id: 'ask', label: 'Ask' },
    { id: 'performance', label: 'Performance' },
  ];

  return (
    <>
      <Global styles={globalStyles} />
      <div className="daybreak-root">
        <div css={css`max-width: 1060px; margin: 0 auto; padding: 48px 40px 80px;`}>

          {/* Header */}
          <header css={css`display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 48px; position: relative;`}>
            {/* Subtle ambient glow */}
            <div css={css`position: absolute; top: -80px; left: -100px; width: 400px; height: 300px; background: radial-gradient(ellipse, rgba(72, 239, 207, 0.03) 0%, transparent 70%); pointer-events: none;`} />
            <div>
              <div css={css`font-size: 11px; font-weight: 600; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(72, 239, 207, 0.6); margin-bottom: 8px;`}>
                Elastic Security · Daybreak
              </div>
              <h1 css={css`font-size: 26px; font-weight: 700; color: #fff; margin: 0; letter-spacing: -0.02em;`}>
                {activeSurface === 'decide' && (pendingCount > 0 ? <>{pendingCount} proposals need your decision</> : <>All clear</>)}
                {activeSurface === 'watch' && 'Your watches are working'}
                {activeSurface === 'ask' && 'Ask anything'}
                {activeSurface === 'performance' && 'Watch performance'}
              </h1>
            </div>

            <div css={css`display: flex; align-items: center; gap: 12px;`}>
              {/* Time picker */}
              <div css={css`position: relative;`}>
                <button
                  onClick={() => setShowTimePicker(!showTimePicker)}
                  css={css`
                    display: flex; align-items: center; gap: 8px;
                    padding: 8px 14px;
                    background: rgba(255, 255, 255, 0.03);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-radius: 8px; cursor: pointer;
                    transition: all 0.12s ease;
                    &:hover { background: rgba(255, 255, 255, 0.05); border-color: rgba(255, 255, 255, 0.12); }
                  `}
                >
                  <span css={css`font-size: 13px; color: rgba(255, 255, 255, 0.5);`}>⏱</span>
                  <span css={css`font-size: 12px; color: rgba(255, 255, 255, 0.6); font-weight: 500;`}>
                    {TIME_OPTIONS.find((t) => t.id === timeRange)?.label}
                  </span>
                  <span css={css`font-size: 10px; color: rgba(255, 255, 255, 0.25);`}>▾</span>
                </button>
                {showTimePicker && (
                  <>
                    <div onClick={() => setShowTimePicker(false)} css={css`position: fixed; inset: 0; z-index: 99;`} />
                    <div
                      css={css`
                        position: absolute; top: calc(100% + 6px); right: 0; z-index: 100;
                        background: #12141c;
                        border: 1px solid rgba(255, 255, 255, 0.08);
                        border-radius: 10px;
                        padding: 6px;
                        min-width: 160px;
                        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
                      `}
                    >
                      {TIME_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => { setTimeRange(opt.id); setShowTimePicker(false); }}
                          css={css`
                            display: block; width: 100%; text-align: left;
                            padding: 8px 12px; border-radius: 6px;
                            background: ${timeRange === opt.id ? 'rgba(72, 239, 207, 0.08)' : 'transparent'};
                            border: none; cursor: pointer;
                            color: ${timeRange === opt.id ? '#48efcf' : 'rgba(255, 255, 255, 0.55)'};
                            font-size: 13px; font-weight: ${timeRange === opt.id ? 600 : 400};
                            transition: background 0.1s ease;
                            &:hover { background: rgba(255, 255, 255, 0.04); }
                          `}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Mode toggle */}
              <button
                onClick={() => {
                  if (isDaybreakMode) {
                    // Switching to traditional — show chrome and navigate to alerts with 90d filter
                    setIsDaybreakMode(false);
                    core.application.navigateToApp('securitySolutionUI', {
                      path: '/alerts',
                      state: { timeRange: { from: 'now-90d', to: 'now' } },
                    });
                  } else {
                    setIsDaybreakMode(true);
                  }
                }}
                css={css`
                  display: flex; align-items: center; gap: 10px;
                  padding: 8px 14px;
                  background: ${isDaybreakMode ? 'rgba(72, 239, 207, 0.08)' : 'rgba(255, 255, 255, 0.04)'};
                  border: 1px solid ${isDaybreakMode ? 'rgba(72, 239, 207, 0.25)' : 'rgba(255, 255, 255, 0.08)'};
                  border-radius: 8px; cursor: pointer; transition: all 0.15s ease;
                  &:hover { background: ${isDaybreakMode ? 'rgba(72, 239, 207, 0.12)' : 'rgba(255, 255, 255, 0.06)'}; }
                `}
              >
                <div css={css`width: 32px; height: 18px; border-radius: 9px; background: ${isDaybreakMode ? '#48efcf' : 'rgba(255, 255, 255, 0.15)'}; position: relative; transition: background 0.2s ease;`}>
                  <div css={css`width: 14px; height: 14px; border-radius: 50%; background: ${isDaybreakMode ? '#0a0e1a' : 'rgba(255, 255, 255, 0.5)'}; position: absolute; top: 2px; left: ${isDaybreakMode ? '16px' : '2px'}; transition: left 0.2s ease, background 0.2s ease;`} />
                </div>
                <span css={css`font-size: 12px; font-weight: 500; color: ${isDaybreakMode ? '#48efcf' : 'rgba(255, 255, 255, 0.4)'}; white-space: nowrap;`}>
                  {isDaybreakMode ? 'Daybreak' : 'Traditional'}
                </span>
              </button>
              <button onClick={resetProposals} css={css`background: none; border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 6px; padding: 6px 12px; font-size: 11px; color: rgba(255, 255, 255, 0.3); cursor: pointer; &:hover { color: rgba(255, 255, 255, 0.6); border-color: rgba(255, 255, 255, 0.12); }`}>
                Reset
              </button>
              <div css={css`display: flex; align-items: center; gap: 8px;`}>
                <div css={css`width: 6px; height: 6px; border-radius: 50%; background: #48efcf; box-shadow: 0 0 6px rgba(72, 239, 207, 0.5); animation: livePulse 2.5s ease-in-out infinite; @keyframes livePulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }`} />
                <span css={css`font-size: 12px; color: rgba(255, 255, 255, 0.35);`}>Live</span>
              </div>
            </div>
          </header>

          {/* Nav */}
          <nav css={css`display: flex; gap: 2px; margin-bottom: 40px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); padding: 0 4px;`}>
            {tabs.map(({ id, label, badge }) => {
              const isActive = activeSurface === id;
              return (
                <button
                  key={id}
                  onClick={() => setActiveSurface(id)}
                  css={css`
                    padding: 10px 20px; border: none; background: none;
                    color: ${isActive ? '#fff' : 'rgba(255, 255, 255, 0.4)'};
                    font-size: 14px; font-weight: ${isActive ? 600 : 400};
                    cursor: pointer; position: relative; transition: color 0.15s ease;
                    &:hover { color: rgba(255, 255, 255, 0.7); }
                    &::after { content: ''; position: absolute; bottom: -1px; left: 20px; right: 20px; height: 2px; border-radius: 1px; background: ${isActive ? '#48efcf' : 'transparent'}; transition: background 0.15s ease; }
                  `}
                >
                  {label}
                  {badge && badge > 0 && (
                    <span css={css`margin-left: 8px; font-size: 11px; font-weight: 700; padding: 1px 6px; border-radius: 8px; background: ${isActive ? 'rgba(72, 239, 207, 0.15)' : 'rgba(255, 255, 255, 0.06)'}; color: ${isActive ? '#48efcf' : 'rgba(255, 255, 255, 0.4)'};`}>
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {activeSurface === 'decide' && <ProposalQueue proposals={proposals} onAction={handleAction} />}
          {activeSurface === 'watch' && <WatchOverview watches={watches} />}
          {activeSurface === 'ask' && <AskSurface />}
          {activeSurface === 'performance' && <PerformanceView />}
        </div>
      </div>
    </>
  );
};
