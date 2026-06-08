# Protégé (SOP Learning) — Kibana Plugin Changes

This document summarizes all modifications made to the Kibana monorepo to implement the Protégé (formerly "SOP Learning") plugin.

## Plugin Location

```
x-pack/solutions/security/plugins/sop_learning/
```

## Kibana Configuration Changes

### `config/kibana.dev.yml`

The following settings were added/modified for the plugin to function correctly:

```yaml
# Required: Allow browser media capture APIs (screen sharing, microphone)
server.securityResponseHeaders.permissionsPolicy: "camera=(self), display-capture=(self), fullscreen=(self), geolocation=(), microphone=(self), web-share=()"

# Required: Allow large media uploads (screen recordings)
server.maxPayload: 50MB
```

**Why:** Kibana's default Content Security Policy blocks `display-capture` and `microphone` permissions. Without this override, the browser refuses to prompt the user for screen/mic access. The payload increase supports chunked video/audio upload.

### Content Security Policy (CSP) Notes

- Kibana's CSP (`style-src 'self' 'unsafe-inline'`) **blocks external stylesheet imports** (`@import url(...)`). The plugin cannot load fonts from Google Fonts CDN. Instead, it relies on Kibana's bundled Inter font (shipped with the Borealis theme) and uses a raw `<style>` tag with `!important` overrides for design-system fidelity.
- Inline `<style>` elements injected via React (`dangerouslySetInnerHTML`) are permitted by `'unsafe-inline'`.
- External script/font `@import` is NOT permitted — any attempt to load from CDN will be silently blocked.

## Files Added/Modified Outside the Plugin Directory

### Security Solution Navigation

```
src/platform/packages/shared/deeplinks/security/deep_links.ts
```
- Added `externalLinkSopLearning` deep link enum entry.

```
x-pack/solutions/security/plugins/security_solution/public/common/components/navigation/security_side_nav/security_side_nav.tsx
```
- Added "Protégé" to the Security Solution left navigation (`externalLinks` array).

```
x-pack/solutions/security/plugins/security_solution/public/common/components/navigation/security_side_nav/categories.ts
```
- Added `SecurityPageName.externalLinkSopLearning` to the Machine Learning / AI category.

## Plugin Architecture

### Server-Side (`server/`)

| File | Purpose |
|------|---------|
| `plugin.ts` | Registers routes, wires optional plugin deps (inference, agentBuilder, workflowsManagement) |
| `features.ts` | Registers the `sopLearning` Kibana feature privilege |
| `routes/recording.ts` | Start/stop/event/narrate recording sessions |
| `routes/sessions.ts` | Session CRUD, bulk delete, audit reconstruction |
| `routes/media.ts` | Chunked media upload/download (screen video, audio, keyframes) |
| `routes/synthesize.ts` | LLM synthesis (multimodal Claude / Agent Builder / text-only fallback) |
| `routes/sops.ts` | SOP CRUD, re-synthesis |
| `routes/deploy.ts` | Deploy to Agent Builder Skills / Elastic Workflows |
| `routes/embeddings.ts` | Jina embedding, kNN similar-SOP search, session search |
| `routes/overview.ts` | Metrics aggregation across all indices |
| `routes/gaps.ts` | Gap-fill workflow proposal + creation |
| `routes/preview.ts` | Read-only skill preview dry-run |
| `lib/synthesis.ts` | Prompt building, tool catalog, validation |
| `lib/gap_fills.ts` | Gap-fill workflow YAML generation |
| `lib/frames.ts` | Keyframe extraction for vision synthesis |
| `lib/workflow_authoring.ts` | NL workflow generation via Agent Builder |

### Client-Side (`public/`)

| File | Purpose |
|------|---------|
| `plugin.ts` | App registration |
| `application.tsx` | App mount point |
| `components/App.tsx` | Main app shell (tabs, theme wrapper) |
| `components/theme.tsx` | Design-system CSS overrides (raw `<style>` injection) |
| `components/OverviewView.tsx` | Program metrics dashboard (SVG charts, elevated masthead) |
| `components/SessionsView.tsx` | Session table + detail flyout |
| `components/SynthesizeView.tsx` | Synthesis input + result view |
| `components/DeployView.tsx` | SOP table + deploy flyout |
| `components/SopDetail.tsx` | Shared SOP detail (steps, gaps, preview) |
| `components/RecordingWidget.tsx` | Chrome header recording control |
| `components/RecordingOverlay.tsx` | Floating recording overlay |
| `services/api.ts` | Client-side API wrapper |

### Elasticsearch Indices

| Index | Purpose |
|-------|---------|
| `sop-learning-sessions` | Recording sessions |
| `sop-learning-sessions-events` | Captured events (UI actions, narration) |
| `sop-learning-sessions-media` | Chunked media (video, audio, keyframes) |
| `sop-learning-sessions-embeddings` | Session embeddings (Jina 1024-dim) |
| `sop-learning-sessions-sops` | Synthesized SOPs |
| `sop-learning-deployments` | Deployment records |

### Required/Optional Plugins

| Plugin | Required? | Used For |
|--------|-----------|----------|
| `data` | Required | Data views |
| `features` | Required | Feature privilege registration |
| `inference` | Required | LLM inference (chatComplete) |
| `security` | Optional | User identification |
| `spaces` | Optional | Space-aware indices |
| `agentBuilder` | Optional | Skill deployment, preview, tool-grounded synthesis |
| `workflowsManagement` | Optional | Workflow deployment, gap-fill tool creation |

## Design System

The plugin includes a full design system at `docs/design-system/` with:
- CSS token files (colors, typography, spacing for light + dark mode)
- Component specifications (badges, buttons, panels, tabs, etc.)
- A complete UI-kit recreation (`ui_kits/sop_learning/`)
- Custom SVG icon registry matching EUI glyph names

The plugin's `theme.tsx` injects a raw `<style>` tag with `!important` CSS overrides to achieve pixel parity with the design system, scoped to `.sopLearningAppRoot` to avoid leaking into Kibana chrome.

## Documentation

- `docs/PRD.md` — Full Product Requirements Document
- `docs/PATENTABILITY-WHITEPAPER.md` — Prior-art analysis and patentability assessment
- `docs/paper/` — arXiv-style research paper (LaTeX + PDF)
