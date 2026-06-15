/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState, useEffect, useRef } from 'react';
import { css, keyframes } from '@emotion/react';
import type { WatchStatus, WatchType, AutonomyLevel } from '../../../common';
import { WATCH_CONFIGS } from '../../../common';
import { UserAvatar } from '../common/user_avatar';

interface Props {
  watches: WatchStatus[];
}

interface ActivityEvent {
  id: string;
  watchType: WatchType;
  message: string;
  timestamp: string;
  type: 'action' | 'finding' | 'decision' | 'waiting';
  detail?: string;
}

const ACTIVITY_MESSAGES: Record<WatchType, Array<{ msg: string; type: ActivityEvent['type']; detail?: string }>> = {
  watch_floor: [
    { msg: 'Triaged alert: Suspicious PowerShell on srv-fin-03', type: 'action', detail: 'Endpoint detection rule triggered. Enriching with process tree context.' },
    { msg: 'Closed 4 alerts as duplicate — same scanner batch', type: 'decision', detail: 'Matched known Qualys scanner pattern. All 4 share source 10.20.4.12.' },
    { msg: 'Enriched alert with VirusTotal — matched known RAT', type: 'finding', detail: 'Hash: a3f2b... matched AsyncRAT family. Confidence 94%.' },
    { msg: 'Routed phishing alert to Watch Officer', type: 'decision', detail: 'User clicked link → credential harvesting page. Needs IR response.' },
    { msg: 'FP pattern identified in Qualys scanner alerts', type: 'finding', detail: 'Same pattern as Proposal #3429. Adding to suppression candidate list.' },
    { msg: 'Correlated 7 endpoint alerts into attack narrative', type: 'finding', detail: 'Single actor, 7 hosts, consistent TTP. Drafting proposal.' },
    { msg: 'Processed 23 new alerts from detection engine', type: 'action', detail: '19 auto-classified, 4 need enrichment.' },
  ],
  watch_officer: [
    { msg: 'Building case timeline for lateral movement', type: 'action', detail: 'Correlating auth logs from 14 hosts over 4-hour window.' },
    { msg: 'Cross-referenced Azure AD with endpoint data', type: 'action', detail: 'Found 3 matching sessions between identity and endpoint telemetry.' },
    { msg: 'Drafted containment plan: 6 hosts for isolation', type: 'finding', detail: 'Graduated response: isolate → collect → analyze. Pending approval.' },
    { msg: 'Waiting for approval on containment', type: 'waiting', detail: 'Proposal #3431 submitted 28m ago. 6 hosts at risk.' },
    { msg: 'Generated MITRE mapping for active incident', type: 'action', detail: 'T1021.002, T1059.001, T1003.001 confirmed. T1078 suspected.' },
    { msg: 'Validated IOCs against threat intel feeds', type: 'finding', detail: '3 of 5 IPs confirmed malicious. 2 inconclusive — queued for Dark Watch.' },
  ],
  dark_watch: [
    { msg: 'Hypothesis hunt: DLL side-loading in update paths', type: 'action', detail: 'Scanning /ProgramData/*/update* for unsigned DLLs across fleet.' },
    { msg: 'Scanned 2,400 hosts for unsigned DLLs', type: 'action', detail: 'Complete. 2 anomalies found. Analyzing PE sections.' },
    { msg: 'Drafted EQL rule: encoded PS with net callbacks', type: 'finding', detail: 'process where process.command_line matches "*encodedcommand*" and network.direction == "outbound"' },
    { msg: 'Queried 30 days of DNS for tunneling patterns', type: 'action', detail: 'Looking for high-entropy subdomains with consistent query cadence.' },
    { msg: 'Rule validated — 0 FP in 30-day backtest', type: 'finding', detail: 'New rule catches 2 known-bad samples. Ready for proposal.' },
    { msg: 'Attributed TTP cluster to known threat actor', type: 'finding', detail: 'Infrastructure overlap with APT41 C2 patterns (Mandiant ref).' },
  ],
  deep_watch: [
    { msg: 'Extracting IOCs from memory dump (dev-ws-14)', type: 'action', detail: '4.2GB dump. Scanning for shellcode, injected threads, C2 strings.' },
    { msg: 'Mapped DNS tunneling C2 — 12 domains', type: 'finding', detail: 'All resolve to 3 IPs in AS398721. Registrar: Namecheap. Created 2024-02-28.' },
    { msg: 'Binary analysis: reflective loader confirmed', type: 'finding', detail: 'Position-independent code in appended PE section. Loads Cobalt Strike beacon.' },
    { msg: 'Generated 23-day forensic timeline', type: 'action', detail: 'Full event reconstruction from initial access to exfil complete.' },
    { msg: 'APT41 TTP overlap: 87% confidence', type: 'finding', detail: 'Matching: DNS tunneling, scheduled task persistence, Cobalt Strike, FortiGate targeting.' },
  ],
};

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
`;

const pulseRing = keyframes`
  0% { transform: scale(1); opacity: 0.6; }
  100% { transform: scale(2.5); opacity: 0; }
`;

const AUTONOMY_LEVELS: AutonomyLevel[] = ['human_in_loop', 'human_on_loop', 'supervised_auto'];
const AUTONOMY_LABELS: Record<AutonomyLevel, string> = {
  human_in_loop: 'Human approves all',
  human_on_loop: 'Human reviews async',
  supervised_auto: 'Auto with oversight',
};

const BAR_COUNT = 12;

const generateBarHeights = (isActive: boolean): number[] =>
  Array.from({ length: BAR_COUNT }, () => Math.max(3, Math.random() * 20 * (isActive ? 1 : 0.2)));

const useSparklineBars = (watches: WatchStatus[]) => {
  const [bars, setBars] = useState<Record<WatchType, number[]>>(() => {
    const initial: Partial<Record<WatchType, number[]>> = {};
    for (const w of watches) {
      initial[w.id] = generateBarHeights(w.state === 'active');
    }
    return initial as Record<WatchType, number[]>;
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setBars((prev) => {
        const next: Partial<Record<WatchType, number[]>> = {};
        for (const w of watches) {
          next[w.id] = generateBarHeights(w.state === 'active');
        }
        return next as Record<WatchType, number[]>;
      });
    }, 2500);
    return () => clearInterval(interval);
  }, [watches]);

  return bars;
};

const DECISION_ACTORS: Record<ActivityEvent['type'], string | null> = {
  decision: 'Sarah Chen',
  waiting: 'James Spiteri',
  finding: null,
  action: null,
};

export const WatchOverview: React.FC<Props> = ({ watches }) => {
  const [expandedWatch, setExpandedWatch] = useState<WatchType | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<ActivityEvent | null>(null);
  const [activityLog, setActivityLog] = useState<ActivityEvent[]>([]);
  const [autonomyOverrides, setAutonomyOverrides] = useState<Record<WatchType, AutonomyLevel>>({
    watch_floor: 'human_on_loop',
    watch_officer: 'human_in_loop',
    dark_watch: 'supervised_auto',
    deep_watch: 'human_in_loop',
  });
  const [activityCounts, setActivityCounts] = useState<Record<WatchType, number>>({
    watch_floor: 0, watch_officer: 0, dark_watch: 0, deep_watch: 0,
  });
  const sparklineBars = useSparklineBars(watches);
  const counterRef = useRef(0);

  useEffect(() => {
    const addEvent = () => {
      const watchTypes: WatchType[] = ['watch_floor', 'watch_floor', 'watch_floor', 'watch_officer', 'dark_watch', 'deep_watch'];
      const watchType = watchTypes[Math.floor(Math.random() * watchTypes.length)];
      const messages = ACTIVITY_MESSAGES[watchType];
      const { msg, type, detail } = messages[Math.floor(Math.random() * messages.length)];
      const now = new Date();
      const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

      counterRef.current += 1;
      const event: ActivityEvent = { id: `evt-${counterRef.current}`, watchType, message: msg, timestamp, type, detail };
      setActivityLog((prev) => [event, ...prev].slice(0, 50));
      setActivityCounts((prev) => ({ ...prev, [watchType]: prev[watchType] + 1 }));
    };

    for (let i = 0; i < 5; i++) setTimeout(addEvent, i * 400);
    const interval = setInterval(addEvent, 2000 + Math.random() * 2500);
    return () => clearInterval(interval);
  }, []);

  const filteredLog = expandedWatch
    ? activityLog.filter((e) => e.watchType === expandedWatch)
    : activityLog;

  return (
    <div>
      {/* Visual activity overview — watch "orbs" */}
      <div css={css`display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 32px;`}>
        {watches.map((watch) => {
          const config = watch.config;
          const isExpanded = expandedWatch === watch.id;
          const count = activityCounts[watch.id];
          const isActive = watch.state === 'active';

          return (
            <button
              key={watch.id}
              onClick={() => setExpandedWatch(isExpanded ? null : watch.id)}
              css={css`
                padding: 20px;
                border-radius: 14px;
                border: 1.5px solid ${isExpanded ? `${config.color}40` : 'rgba(255, 255, 255, 0.04)'};
                background: ${isExpanded ? `${config.color}08` : 'rgba(255, 255, 255, 0.015)'};
                cursor: pointer;
                text-align: left;
                transition: all 0.15s ease;
                position: relative;
                overflow: hidden;
                &:hover { border-color: ${config.color}30; background: ${config.color}06; }
              `}
            >
              {/* Activity pulse ring */}
              {isActive && (
                <div css={css`position: absolute; top: 20px; right: 20px; width: 8px; height: 8px;`}>
                  <div css={css`position: absolute; inset: 0; border-radius: 50%; background: ${config.color}; opacity: 0.8;`} />
                  <div css={css`position: absolute; inset: -4px; border-radius: 50%; border: 1px solid ${config.color}; animation: ${pulseRing} 2s ease-out infinite;`} />
                </div>
              )}

              {/* Name */}
              <div css={css`font-size: 14px; font-weight: 600; color: #fff; margin-bottom: 4px;`}>
                {config.name}
              </div>

              {/* Activity bar — visual throughput */}
              <div css={css`display: flex; gap: 2px; margin: 10px 0 8px; height: 20px; align-items: flex-end;`}>
                {(sparklineBars[watch.id] ?? []).map((height, i) => (
                  <div
                    key={i}
                    css={css`
                      width: 4px;
                      height: ${height}px;
                      border-radius: 2px;
                      background: ${config.color};
                      opacity: ${0.2 + (i / BAR_COUNT) * 0.6};
                      transition: height 0.8s cubic-bezier(0.4, 0, 0.2, 1);
                    `}
                  />
                ))}
              </div>

              {/* Stats */}
              <div css={css`display: flex; align-items: baseline; gap: 6px;`}>
                <span css={css`font-size: 20px; font-weight: 700; color: ${config.color}; font-variant-numeric: tabular-nums;`}>
                  {count}
                </span>
                <span css={css`font-size: 11px; color: rgba(255, 255, 255, 0.3);`}>actions</span>
              </div>

              {/* Autonomy indicator */}
              <div css={css`margin-top: 8px; font-size: 11px; color: rgba(255, 255, 255, 0.25);`}>
                {AUTONOMY_LABELS[autonomyOverrides[watch.id]]}
              </div>
            </button>
          );
        })}
      </div>

      {/* Expanded watch detail panel */}
      {expandedWatch && (
        <div
          css={css`
            margin-bottom: 24px;
            padding: 20px 24px;
            border-radius: 12px;
            border: 1px solid ${WATCH_CONFIGS[expandedWatch].color}20;
            background: ${WATCH_CONFIGS[expandedWatch].color}04;
            animation: ${fadeIn} 0.2s ease both;
          `}
        >
          <div css={css`display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;`}>
            <div css={css`display: flex; align-items: center; gap: 10px;`}>
              <span css={css`width: 10px; height: 10px; border-radius: 50%; background: ${WATCH_CONFIGS[expandedWatch].color};`} />
              <span css={css`font-size: 16px; font-weight: 600; color: #fff;`}>{WATCH_CONFIGS[expandedWatch].name}</span>
              <span css={css`font-size: 13px; font-style: italic; color: ${WATCH_CONFIGS[expandedWatch].color}77;`}>
                &ldquo;{WATCH_CONFIGS[expandedWatch].tagline}&rdquo;
              </span>
            </div>
            <button onClick={() => setExpandedWatch(null)} css={css`background: none; border: none; color: rgba(255, 255, 255, 0.3); font-size: 18px; cursor: pointer; &:hover { color: rgba(255, 255, 255, 0.6); }`}>×</button>
          </div>

          {/* Autonomy slider */}
          <div css={css`margin-bottom: 16px;`}>
            <div css={css`font-size: 11px; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255, 255, 255, 0.25); margin-bottom: 8px;`}>
              Autonomy level
            </div>
            <div css={css`display: flex; gap: 6px;`}>
              {AUTONOMY_LEVELS.map((level) => {
                const isActive = autonomyOverrides[expandedWatch] === level;
                const color = WATCH_CONFIGS[expandedWatch].color;
                return (
                  <button
                    key={level}
                    onClick={() => setAutonomyOverrides((prev) => ({ ...prev, [expandedWatch]: level }))}
                    css={css`
                      flex: 1; padding: 10px 12px; border-radius: 8px;
                      border: 1px solid ${isActive ? `${color}50` : 'rgba(255, 255, 255, 0.06)'};
                      background: ${isActive ? `${color}12` : 'rgba(255, 255, 255, 0.015)'};
                      color: ${isActive ? color : 'rgba(255, 255, 255, 0.4)'};
                      font-size: 12px; font-weight: ${isActive ? 600 : 400};
                      cursor: pointer; text-align: center; transition: all 0.12s ease;
                      &:hover { border-color: ${color}30; }
                    `}
                  >
                    {AUTONOMY_LABELS[level]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Current task + stats */}
          <div css={css`display: flex; gap: 24px; padding: 12px 0; border-top: 1px solid rgba(255, 255, 255, 0.04);`}>
            <div css={css`flex: 1;`}>
              <div css={css`font-size: 11px; color: rgba(255, 255, 255, 0.25); margin-bottom: 4px;`}>Current task</div>
              <div css={css`font-size: 13px; color: rgba(255, 255, 255, 0.6);`}>
                {watches.find((w) => w.id === expandedWatch)?.currentTask}
              </div>
            </div>
            <div>
              <div css={css`font-size: 11px; color: rgba(255, 255, 255, 0.25); margin-bottom: 4px;`}>Today</div>
              <span css={css`font-size: 18px; font-weight: 700; color: #fff;`}>
                {watches.find((w) => w.id === expandedWatch)?.proposalsGenerated24h}
              </span>
              <span css={css`font-size: 12px; color: rgba(255, 255, 255, 0.3); margin-left: 4px;`}>proposals</span>
            </div>
          </div>
        </div>
      )}

      {/* Live feed */}
      <div>
        <div css={css`display: flex; align-items: center; gap: 8px; margin-bottom: 14px;`}>
          <span css={css`width: 5px; height: 5px; border-radius: 50%; background: #48efcf; animation: feedPulse 1.5s ease-in-out infinite; @keyframes feedPulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }`} />
          <span css={css`font-size: 11px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255, 255, 255, 0.25);`}>
            {expandedWatch ? `${WATCH_CONFIGS[expandedWatch].name} activity` : 'All watch activity'}
          </span>
        </div>

        <div css={css`display: flex; flex-direction: column; gap: 0;`}>
          {filteredLog.slice(0, 12).map((event) => {
            const color = WATCH_CONFIGS[event.watchType].color;
            return (
              <div key={event.id}>
                <button
                  onClick={() => setSelectedEvent(event)}
                  css={css`
                    display: flex; align-items: center; gap: 12px;
                    padding: 10px 12px;
                    border-radius: 8px;
                    border: 1px solid transparent;
                    background: transparent;
                    cursor: pointer; text-align: left; width: 100%;
                    animation: ${fadeIn} 0.25s ease both;
                    transition: all 0.1s ease;
                    &:hover { background: rgba(255, 255, 255, 0.02); border-color: ${color}15; }
                  `}
                >
                  <span css={css`font-size: 11px; color: rgba(255, 255, 255, 0.15); font-variant-numeric: tabular-nums; flex-shrink: 0; width: 52px;`}>
                    {event.timestamp}
                  </span>
                  {!expandedWatch && (
                    <span css={css`width: 3px; height: 14px; border-radius: 1px; background: ${color}; opacity: 0.6; flex-shrink: 0;`} />
                  )}
                  <span css={css`font-size: 13px; color: rgba(255, 255, 255, 0.55); line-height: 1.3; flex: 1;`}>
                    {event.message}
                  </span>
                  {DECISION_ACTORS[event.type] && (
                    <UserAvatar name={DECISION_ACTORS[event.type]!} size={20} />
                  )}
                  <span css={css`
                    width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
                    background: ${event.type === 'finding' ? '#48EFCF' : event.type === 'decision' ? '#6AADFF' : event.type === 'waiting' ? '#FEC514' : 'rgba(255, 255, 255, 0.12)'};
                  `} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div css={css`display: flex; gap: 16px; margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(255, 255, 255, 0.03);`}>
          {[
            { label: 'Action', color: 'rgba(255, 255, 255, 0.12)' },
            { label: 'Finding', color: '#48EFCF' },
            { label: 'Decision', color: '#6AADFF' },
            { label: 'Waiting', color: '#FEC514' },
          ].map((item) => (
            <div key={item.label} css={css`display: flex; align-items: center; gap: 6px;`}>
              <span css={css`width: 6px; height: 6px; border-radius: 50%; background: ${item.color};`} />
              <span css={css`font-size: 11px; color: rgba(255, 255, 255, 0.25);`}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Event flyout */}
      {selectedEvent && (
        <EventFlyout event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </div>
  );
};

// Flyout for live activity events
const EventFlyout: React.FC<{ event: ActivityEvent; onClose: () => void }> = ({ event, onClose }) => {
  const config = WATCH_CONFIGS[event.watchType];
  const typeLabels: Record<ActivityEvent['type'], string> = {
    action: 'Action',
    finding: 'Finding',
    decision: 'Decision',
    waiting: 'Awaiting input',
  };

  // Generate contextual content based on event
  const getContext = () => {
    const contexts: Record<string, { summary: string; data: Array<{ label: string; value: string }>; query?: string }> = {
      'Triaged alert: Suspicious PowerShell on srv-fin-03': {
        summary: 'Endpoint detection rule "Suspicious PowerShell Execution" triggered on srv-fin-03. Process tree analysis shows powershell.exe spawned by winword.exe with encoded command argument.\n\nWatch Floor enriched with VirusTotal (hash clean), process tree context (unusual parent), and user context (finance department, no admin privileges).\n\nClassification: Likely true positive. Escalation recommended.',
        data: [
          { label: 'Host', value: 'srv-fin-03' },
          { label: 'Rule', value: 'Suspicious PowerShell Execution' },
          { label: 'User', value: 'l.johnson@corp.io' },
          { label: 'Parent process', value: 'WINWORD.EXE' },
          { label: 'Risk score', value: '78/100' },
          { label: 'MITRE', value: 'T1059.001' },
        ],
        query: 'FROM .alerts-security*\n| WHERE host.name == "srv-fin-03"\n  AND rule.name == "Suspicious PowerShell Execution"\n  AND @timestamp > NOW() - 1h\n| KEEP host.name, user.name, process.parent.name,\n       process.command_line, event.risk_score',
      },
      'Closed 4 alerts as duplicate — same scanner batch': {
        summary: 'Identified 4 alerts from the same Qualys vulnerability scan batch (scan ID: QS-2024-4891). All share source IP 10.20.4.12, triggered within 3-second window, targeting sequential ports.\n\nPattern matches known scanner behavior. Auto-closed with rationale logged.',
        data: [
          { label: 'Alerts closed', value: '4' },
          { label: 'Source IP', value: '10.20.4.12' },
          { label: 'Scan ID', value: 'QS-2024-4891' },
          { label: 'Time window', value: '3 seconds' },
          { label: 'Confidence', value: '99.8%' },
        ],
      },
      'Enriched alert with VirusTotal — matched known RAT': {
        summary: 'File hash submitted to VirusTotal returned 47/72 detections. Identified as AsyncRAT variant (family: MSIL/AsyncRAT.B). Known C2 infrastructure at 185.234.72.x.\n\nAdded IOCs to local threat intel feed. Alert escalated to Watch Officer for containment decision.',
        data: [
          { label: 'Hash', value: 'a3f2b8c1...9d4e' },
          { label: 'VT detections', value: '47/72' },
          { label: 'Malware family', value: 'AsyncRAT' },
          { label: 'C2 server', value: '185.234.72.x' },
          { label: 'First seen', value: '2024-05-28' },
          { label: 'Action taken', value: 'Escalated to Watch Officer' },
        ],
      },
      'Building case timeline for lateral movement': {
        summary: 'Correlating authentication events from 14 hosts over a 4-hour window to build the complete lateral movement timeline for svc-backup-prod.\n\nData sources: Windows Security event logs (4624, 4625, 4672), Elastic Defend process telemetry, network flow data.\n\nCurrent progress: 847 events correlated, timeline 80% complete.',
        data: [
          { label: 'Account', value: 'svc-backup-prod' },
          { label: 'Hosts involved', value: '14' },
          { label: 'Time window', value: '4 hours' },
          { label: 'Events correlated', value: '847' },
          { label: 'Progress', value: '80%' },
          { label: 'ETA', value: '~2 minutes' },
        ],
        query: 'FROM logs-windows.security*\n| WHERE user.name == "svc-backup-prod"\n  AND event.code IN ("4624", "4625", "4672")\n  AND @timestamp > "2024-06-09T14:00:00Z"\n  AND @timestamp < "2024-06-09T18:00:00Z"\n| SORT @timestamp\n| KEEP @timestamp, host.name, event.code,\n       source.ip, logon_type',
      },
      'Drafted containment plan: 6 hosts for isolation': {
        summary: 'Based on the lateral movement timeline, identified 6 hosts with confirmed code execution that require immediate isolation.\n\nGraduated response plan:\n1. Disable svc-backup-prod (Active Directory)\n2. Network-isolate 6 compromised hosts (Elastic Defend)\n3. Collect memory dumps from 2 priority targets\n4. Audit DC access (no isolation — monitoring only)\n\nPending human approval before execution.',
        data: [
          { label: 'Hosts to isolate', value: '6' },
          { label: 'Response type', value: 'Graduated containment' },
          { label: 'Risk if delayed', value: 'High — active C2' },
          { label: 'Est. time to execute', value: '~3 minutes' },
          { label: 'Approval required', value: 'Yes (human-in-loop)' },
        ],
      },
      'Hypothesis hunt: DLL side-loading in update paths': {
        summary: 'Running hypothesis hunt based on CISA advisory AA24-312A. Scanning all hosts for unsigned or anomalously-signed DLLs in software update directories.\n\nScope: /ProgramData/*/update*, /AppData/*/update* across 2,400 managed hosts.\nMethod: File creation events + Authenticode signature validation.\nTime range: Last 30 days.',
        data: [
          { label: 'Hypothesis source', value: 'CISA AA24-312A' },
          { label: 'Hosts in scope', value: '2,400' },
          { label: 'Directories scanned', value: 'ProgramData + AppData update paths' },
          { label: 'Time range', value: '30 days' },
          { label: 'Status', value: 'Running' },
        ],
        query: 'FROM logs-endpoint.events.file*\n| WHERE event.action == "creation"\n  AND file.extension == "dll"\n  AND (file.path LIKE "*ProgramData*update*"\n       OR file.path LIKE "*AppData*update*")\n  AND @timestamp > NOW() - 30d\n| WHERE NOT file.code_signature.status == "trusted"\n| STATS count = COUNT(*) BY host.name, file.path,\n       file.code_signature.subject_name',
      },
      'Scanned 2,400 hosts for unsigned DLLs': {
        summary: 'Fleet-wide scan complete. 2 hosts flagged with anomalous DLLs in update directories:\n\n• dev-ws-14: updater.dll — valid Authenticode signature but file size 340KB larger than vendor baseline. Appended PE section detected.\n• build-srv-02: helper.dll — same anomaly pattern.\n\nBoth files have legitimate publisher signatures but contain injected code sections. Consistent with supply chain technique described in CISA advisory.',
        data: [
          { label: 'Hosts scanned', value: '2,400' },
          { label: 'Anomalies found', value: '2' },
          { label: 'Technique', value: 'T1574.002 DLL Side-Loading' },
          { label: 'Confidence', value: '76%' },
          { label: 'Action', value: 'Proposal drafted' },
        ],
      },
      'Extracting IOCs from memory dump (dev-ws-14)': {
        summary: 'Processing 4.2GB memory dump from dev-ws-14 (isolated host from supply chain finding).\n\nAnalysis pipeline:\n1. Volatility3 process listing + injection scan\n2. YARA rule matching (Cobalt Strike, Metasploit, custom)\n3. String extraction + C2 config parsing\n4. Network artifact extraction\n\nCurrent progress: Process injection scan complete. 2 injected threads found in svchost.exe PID 4872.',
        data: [
          { label: 'Dump size', value: '4.2 GB' },
          { label: 'Host', value: 'dev-ws-14' },
          { label: 'Injected threads', value: '2 (svchost.exe:4872)' },
          { label: 'YARA matches', value: 'Pending...' },
          { label: 'Progress', value: '40%' },
          { label: 'ETA', value: '~45 minutes' },
        ],
      },
    };
    return contexts[event.message] || {
      summary: event.detail || `${config.name} performed this action as part of its ongoing monitoring. Click through to the relevant proposal for full context and reasoning chain.`,
      data: [
        { label: 'Watch', value: config.name },
        { label: 'Type', value: typeLabels[event.type] },
        { label: 'Timestamp', value: event.timestamp },
      ],
    };
  };

  const context = getContext();

  return (
    <>
      <div
        onClick={onClose}
        css={css`position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); z-index: 1000; animation: ${fadeIn} 0.15s ease both;`}
      />
      <div
        css={css`
          position: fixed; top: 0; right: 0; bottom: 0; width: 480px; max-width: 90vw;
          background: #0c0e16; border-left: 1px solid rgba(255, 255, 255, 0.06);
          z-index: 1001; overflow-y: auto;
          animation: flyoutSlide 0.2s ease both;
          @keyframes flyoutSlide { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        `}
      >
        {/* Header */}
        <div css={css`padding: 24px 28px 0; position: sticky; top: 0; background: #0c0e16; z-index: 1;`}>
          <div css={css`display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;`}>
            <div css={css`display: flex; align-items: center; gap: 10px;`}>
              <span css={css`width: 10px; height: 10px; border-radius: 50%; background: ${config.color};`} />
              <span css={css`font-size: 13px; font-weight: 600; color: ${config.color};`}>{config.name}</span>
              <span css={css`
                font-size: 11px; padding: 2px 8px; border-radius: 4px;
                background: ${event.type === 'finding' ? 'rgba(72, 239, 207, 0.1)' : event.type === 'decision' ? 'rgba(106, 173, 255, 0.1)' : event.type === 'waiting' ? 'rgba(254, 197, 20, 0.1)' : 'rgba(255, 255, 255, 0.03)'};
                color: ${event.type === 'finding' ? '#48EFCF' : event.type === 'decision' ? '#6AADFF' : event.type === 'waiting' ? '#FEC514' : 'rgba(255, 255, 255, 0.4)'};
              `}>
                {typeLabels[event.type]}
              </span>
            </div>
            <button onClick={onClose} css={css`background: none; border: none; color: rgba(255, 255, 255, 0.3); font-size: 20px; cursor: pointer; padding: 4px 8px; border-radius: 4px; &:hover { color: rgba(255, 255, 255, 0.6); background: rgba(255, 255, 255, 0.04); }`}>
              ×
            </button>
          </div>
          <h3 css={css`font-size: 17px; font-weight: 700; color: #fff; margin: 0; line-height: 1.4;`}>
            {event.message}
          </h3>
          <div css={css`font-size: 12px; color: rgba(255, 255, 255, 0.25); margin-top: 6px;`}>
            {event.timestamp}
          </div>
          <div css={css`height: 1px; background: rgba(255, 255, 255, 0.06); margin-top: 16px;`} />
        </div>

        {/* Body */}
        <div css={css`padding: 20px 28px 32px;`}>
          <div css={css`font-size: 14px; color: rgba(255, 255, 255, 0.55); line-height: 1.8; white-space: pre-wrap; margin-bottom: 24px;`}>
            {context.summary}
          </div>

          {context.data.length > 0 && (
            <div css={css`margin-bottom: 24px;`}>
              <div css={css`font-size: 11px; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255, 255, 255, 0.25); margin-bottom: 10px;`}>
                Details
              </div>
              <div css={css`border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.04); overflow: hidden;`}>
                {context.data.map((item, i) => (
                  <div key={i} css={css`display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: ${i % 2 === 0 ? 'rgba(255, 255, 255, 0.015)' : 'transparent'};`}>
                    <span css={css`font-size: 13px; color: rgba(255, 255, 255, 0.4);`}>{item.label}</span>
                    <span css={css`font-size: 13px; font-weight: 600; color: #fff; font-variant-numeric: tabular-nums;`}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {context.query && (
            <div>
              <div css={css`font-size: 11px; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255, 255, 255, 0.25); margin-bottom: 10px;`}>
                Query
              </div>
              <pre css={css`padding: 14px 16px; background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 8px; font-size: 12px; color: ${config.color}cc; font-family: 'JetBrains Mono', 'SF Mono', monospace; line-height: 1.6; overflow-x: auto; white-space: pre-wrap; margin: 0;`}>
                {context.query}
              </pre>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
