# SOP Learning — Kibana Plugin

A Kibana plugin that records analyst workflows, synthesizes them into standard operating procedures, and deploys them as Elastic Agent Builder Skills or Elastic Workflows.

## Installation

Copy this plugin into your Kibana `plugins/` directory:

```bash
cp -r sop_learning /path/to/kibana/plugins/
cd /path/to/kibana
yarn kbn bootstrap
yarn start
```

The plugin registers under **Security > SOP Learning** in the Kibana navigation.

## Features

### 1. Record Workflow
- Start a recording session
- Click triage actions as you perform them (process tree, lateral movement, threat intel, etc.)
- Add narration explaining your reasoning at each step
- Stop recording when done

### 2. Sessions
- View all recorded sessions
- See event counts, analysts, timestamps
- Select multiple sessions for synthesis

### 3. Synthesize SOP
- Select sessions and provide a name
- Point to an LLM connector (EIS inference endpoint)
- The system sends recorded events + narrations to the LLM
- Receives back a structured SOP with steps, confidence scores, and decision points
- Generates both Agent Builder Skill (Markdown) and Workflow (YAML) outputs

### 4. Deploy
- Preview the generated Skill and Workflow
- One-click deploy to Agent Builder via `POST /api/agent_builder/skills`
- One-click deploy to Workflows via `POST /api/workflows/workflow`

## Architecture

```
┌─────────────────────────────────────────────────────┐
│ Kibana Browser                                       │
│                                                     │
│  SOP Learning Plugin UI (React + EUI)               │
│  - RecordingView: capture analyst actions           │
│  - SessionsView: list/select recorded sessions     │
│  - SynthesizeView: LLM-powered SOP generation      │
│  - DeployView: push to Agent Builder / Workflows    │
└─────────────────────┬───────────────────────────────┘
                      │ HTTP
                      ▼
┌─────────────────────────────────────────────────────┐
│ Kibana Server                                        │
│                                                     │
│  /api/sop_learning/recording/*  (start/event/stop)  │
│  /api/sop_learning/sessions     (list/get)          │
│  /api/sop_learning/synthesize   (LLM call)          │
│  /api/sop_learning/deploy/*     (skill/workflow)    │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│ Elasticsearch                                        │
│                                                     │
│  sop-learning-sessions        (session metadata)    │
│  sop-learning-sessions-events (recorded events)     │
│  sop-learning-sessions-sops   (synthesized SOPs)    │
│  .kibana-audit-*              (existing audit logs) │
└─────────────────────────────────────────────────────┘
```

## Indices Created

| Index | Purpose |
|-------|---------|
| `sop-learning-sessions` | Recording session metadata (analyst, start/end, status) |
| `sop-learning-sessions-events` | Individual recorded events with narrations |
| `sop-learning-sessions-sops` | Synthesized SOP documents |
| `sop-learning-deployments` | Deployment records (pending/completed) |

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/sop_learning/sessions` | List all recording sessions |
| GET | `/api/sop_learning/sessions/{id}` | Get session with events |
| GET | `/api/sop_learning/sessions/from-audit` | Reconstruct sessions from audit logs |
| POST | `/api/sop_learning/recording/start` | Start a new recording |
| POST | `/api/sop_learning/recording/event` | Record an event |
| POST | `/api/sop_learning/recording/stop` | Stop recording |
| POST | `/api/sop_learning/recording/narrate` | Add narration |
| POST | `/api/sop_learning/synthesize` | Synthesize SOP from sessions |
| GET | `/api/sop_learning/sops` | List synthesized SOPs |
| POST | `/api/sop_learning/deploy/skill` | Deploy as Agent Builder Skill |
| POST | `/api/sop_learning/deploy/workflow` | Deploy as Elastic Workflow |

## Requirements

- Kibana 9.4+
- Elasticsearch with audit logging enabled
- An inference connector configured (for synthesis)
- Agent Builder and Workflows features enabled
