/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { useEuiTheme } from '@elastic/eui';

/**
 * The class applied to the plugin's app root. Everything visual is scoped under
 * it so the design-system foundation re-skins the whole app WITHOUT leaking into
 * the surrounding Kibana chrome.
 */
export const SOP_ROOT_CLASS = 'sopLearningAppRoot';

/*
 * RAW CSS override string.
 *
 * This is injected as a real DOM <style> element (NOT emotion <Global>), which
 * bypasses emotion's runtime specificity wars. Every rule uses !important and
 * high-specificity selectors scoped to .sopLearningAppRoot so EUI's internal
 * styles are definitively overridden. This is explicitly sanctioned — the user
 * wants pixel parity with the design-system mocks even if it means fighting EUI.
 *
 * Token values are lifted verbatim from docs/design-system/tokens/*.css.
 * CSP note: inline <style> is allowed by Kibana's style-src 'self' 'unsafe-inline'.
 */

const LIGHT_CSS = `
/* ============================================================================
   SOP Learning ("Protégé") — Design System Override (LIGHT)
   ============================================================================ */

/* -- Foundation: font family, antialiasing, base color ---------------------- */
.sopLearningAppRoot {
  font-family: 'Inter', BlinkMacSystemFont, Helvetica, Arial, sans-serif !important;
  font-size: 14px !important;
  color: #1D2A3E !important;
  -webkit-font-smoothing: antialiased !important;
  -moz-osx-font-smoothing: grayscale !important;
  text-rendering: optimizeLegibility !important;
  font-feature-settings: 'calt' 1, 'kern' 1, 'liga' 1 !important;
}
.sopLearningAppRoot *,
.sopLearningAppRoot *::before,
.sopLearningAppRoot *::after {
  font-family: inherit !important;
}
.sopLearningAppRoot .euiText,
.sopLearningAppRoot .euiText p,
.sopLearningAppRoot .euiTitle,
.sopLearningAppRoot .euiStat__title,
.sopLearningAppRoot .euiStat__description,
.sopLearningAppRoot .euiTab,
.sopLearningAppRoot .euiButton,
.sopLearningAppRoot .euiButtonEmpty,
.sopLearningAppRoot .euiBadge,
.sopLearningAppRoot .euiFormLabel,
.sopLearningAppRoot .euiTableHeaderCell,
.sopLearningAppRoot .euiTableRowCell,
.sopLearningAppRoot .euiFieldText,
.sopLearningAppRoot .euiTextArea,
.sopLearningAppRoot .euiAccordion__triggerWrapper,
.sopLearningAppRoot .euiFlexItem,
.sopLearningAppRoot h1, .sopLearningAppRoot h2, .sopLearningAppRoot h3, .sopLearningAppRoot h4,
.sopLearningAppRoot p, .sopLearningAppRoot span, .sopLearningAppRoot div,
.sopLearningAppRoot label, .sopLearningAppRoot a {
  font-family: 'Inter', BlinkMacSystemFont, Helvetica, Arial, sans-serif !important;
}
.sopLearningAppRoot button,
.sopLearningAppRoot input,
.sopLearningAppRoot select,
.sopLearningAppRoot textarea {
  font-family: 'Inter', BlinkMacSystemFont, Helvetica, Arial, sans-serif !important;
}
.sopLearningAppRoot code,
.sopLearningAppRoot pre,
.sopLearningAppRoot .euiCodeBlock,
.sopLearningAppRoot .euiCodeBlock *,
.sopLearningAppRoot .euiCodeBlock__code,
.sopLearningAppRoot .euiCode {
  font-family: 'Roboto Mono', 'JetBrains Mono', Menlo, Courier, monospace !important;
  font-feature-settings: normal !important;
}
.sopLearningAppRoot .euiTitle,
.sopLearningAppRoot h1, .sopLearningAppRoot h2, .sopLearningAppRoot h3 {
  font-weight: 700 !important;
  letter-spacing: -0.01em !important;
}

/* -- Code blocks ------------------------------------------------------------ */
.sopLearningAppRoot .euiCodeBlock .euiCodeBlock__code {
  font-size: 0.8125rem !important;
  line-height: 1.5 !important;
}

/* -- Page overflow fix ------------------------------------------------------ */
.sopLearningAppRoot .euiPage {
  min-height: auto !important;
  height: auto !important;
  flex-grow: 0 !important;
}

/* -- Panel borders (ensure the design-system border wins) ------------------- */
.sopLearningAppRoot .euiPanel[class*="hasBorder"],
.sopLearningAppRoot .euiPanel--hasBorder {
  border-color: #E3E8F2 !important;
}

/* -- Flyout/modal font inheritance (portaled outside root div) -------------- */
.sopLearningAppRoot.euiFlyout,
.sopLearningAppRoot.euiFlyout *,
.sopLearningAppRoot .euiFlyout,
.sopLearningAppRoot .euiFlyout * {
  font-family: 'Inter', BlinkMacSystemFont, Helvetica, Arial, sans-serif !important;
}
.sopLearningAppRoot.euiModal,
.sopLearningAppRoot.euiModal * {
  font-family: 'Inter', BlinkMacSystemFont, Helvetica, Arial, sans-serif !important;
}

/* -- Page background -------------------------------------------------------- */
.sopLearningAppRoot .euiPage,
.sopLearningAppRoot .euiPageBody {
  background: #F6F9FC !important;
}

/* -- Page title (Protégé masthead) ------------------------------------------ */
.sopLearningAppRoot .euiPageHeader .euiTitle,
.sopLearningAppRoot .euiPageHeaderContent__titleWrapper .euiTitle {
  font-size: 2.125rem !important;
  font-weight: 700 !important;
  letter-spacing: -0.01em !important;
  line-height: 1.1 !important;
  color: #111C2C !important;
}
.sopLearningAppRoot .euiPageHeader .euiText--s {
  font-size: 0.875rem !important;
  color: #516381 !important;
}

/* -- Panel backgrounds, borders, radii ------------------------------------- */
.sopLearningAppRoot .euiPanel {
  background: #FFFFFF !important;
  border-color: #E3E8F2 !important;
  border-radius: 6px !important;
}
.sopLearningAppRoot .euiPanel--subdued,
.sopLearningAppRoot .euiPanel[class*="subdued"] {
  background: #F6F9FC !important;
}
.sopLearningAppRoot .euiPanel[class*="primary"] {
  background: #F1F6FF !important;
}

/* -- Stat (KPI numbers) ---------------------------------------------------- */
.sopLearningAppRoot .euiStat .euiTitle,
.sopLearningAppRoot .euiStat__title {
  font-size: 2.125rem !important;
  font-weight: 700 !important;
  line-height: 1.1 !important;
  letter-spacing: -0.01em !important;
}
.sopLearningAppRoot .euiStat .euiTextColor--subdued,
.sopLearningAppRoot .euiStat__description {
  font-size: 0.75rem !important;
  color: #516381 !important;
  font-weight: 400 !important;
}

/* -- Tabs ------------------------------------------------------------------- */
.sopLearningAppRoot .euiTabs {
  border-bottom-color: #E3E8F2 !important;
}
.sopLearningAppRoot .euiTab {
  font-size: 0.875rem !important;
  font-weight: 500 !important;
}
.sopLearningAppRoot .euiTab-isSelected,
.sopLearningAppRoot .euiTab[aria-selected="true"] {
  font-weight: 600 !important;
  color: #0B64DD !important;
}
.sopLearningAppRoot .euiTab:not(.euiTab-isSelected) {
  color: #516381 !important;
}

/* -- Titles (section headings) --------------------------------------------- */
.sopLearningAppRoot .euiTitle--l {
  font-size: 2.125rem !important;
  font-weight: 700 !important;
  letter-spacing: -0.01em !important;
  color: #111C2C !important;
}
.sopLearningAppRoot .euiTitle--m {
  font-size: 1.6875rem !important;
  font-weight: 700 !important;
  letter-spacing: -0.01em !important;
  color: #111C2C !important;
}
.sopLearningAppRoot .euiTitle--s {
  font-size: 1.375rem !important;
  font-weight: 700 !important;
  color: #111C2C !important;
}
.sopLearningAppRoot .euiTitle--xs {
  font-size: 1rem !important;
  font-weight: 700 !important;
  color: #111C2C !important;
}
.sopLearningAppRoot .euiTitle--xxs {
  font-size: 0.875rem !important;
  font-weight: 700 !important;
  color: #111C2C !important;
}

/* -- Text sizing ------------------------------------------------------------ */
.sopLearningAppRoot .euiText--s,
.sopLearningAppRoot .euiText--s * {
  font-size: 0.875rem !important;
}
.sopLearningAppRoot .euiText--xs,
.sopLearningAppRoot .euiText--xs * {
  font-size: 0.75rem !important;
}
.sopLearningAppRoot .euiTextColor--subdued {
  color: #516381 !important;
}

/* -- Table headers ---------------------------------------------------------- */
.sopLearningAppRoot .euiTableHeaderCell .euiTableCellContent__text {
  font-size: 0.75rem !important;
  font-weight: 600 !important;
  text-transform: uppercase !important;
  letter-spacing: 0.04em !important;
  color: #516381 !important;
}
.sopLearningAppRoot .euiTableHeaderCell {
  border-bottom: 2px solid #E3E8F2 !important;
}

/* -- Table cells ------------------------------------------------------------ */
.sopLearningAppRoot .euiTableRowCell {
  font-size: 0.875rem !important;
  color: #1D2A3E !important;
  border-bottom-color: #E3E8F2 !important;
}
.sopLearningAppRoot .euiTableRow:hover {
  background-color: #F6F9FC !important;
}
.sopLearningAppRoot .euiTableCellContent--alignRight,
.sopLearningAppRoot .sop-num {
  font-variant-numeric: tabular-nums !important;
  font-feature-settings: 'tnum' 1 !important;
}

/* -- Badges ----------------------------------------------------------------- */
.sopLearningAppRoot .euiBadge {
  font-size: 0.75rem !important;
  font-weight: 500 !important;
  border-radius: 4px !important;
  line-height: 1 !important;
}

/* -- Buttons ---------------------------------------------------------------- */
.sopLearningAppRoot .euiButton,
.sopLearningAppRoot .euiButtonEmpty {
  border-radius: 6px !important;
  font-size: 0.875rem !important;
  font-weight: 500 !important;
}
.sopLearningAppRoot .euiButton--fill {
  box-shadow: none !important;
}

/* -- Form inputs ------------------------------------------------------------ */
.sopLearningAppRoot .euiFieldText,
.sopLearningAppRoot .euiTextArea,
.sopLearningAppRoot .euiFieldSearch,
.sopLearningAppRoot .euiFieldNumber,
.sopLearningAppRoot .euiSelect {
  border-color: #CAD3E2 !important;
  border-radius: 6px !important;
  font-size: 0.875rem !important;
}
.sopLearningAppRoot .euiFieldText:focus,
.sopLearningAppRoot .euiFieldSearch:focus,
.sopLearningAppRoot .euiTextArea:focus {
  border-color: #0B64DD !important;
  box-shadow: inset 0 -2px 0 #0B64DD !important;
}
.sopLearningAppRoot .euiFormLabel {
  font-size: 0.75rem !important;
  font-weight: 600 !important;
  color: #111C2C !important;
}

/* -- Flyout (portaled outside root, but given className) -------------------- */
.sopLearningAppRoot.euiFlyout,
.sopLearningAppRoot .euiFlyout {
  font-family: 'Inter', BlinkMacSystemFont, Helvetica, Arial, sans-serif !important;
}
.sopLearningAppRoot.euiFlyout .euiTitle--m,
.sopLearningAppRoot .euiFlyout .euiTitle--m {
  font-size: 1.6875rem !important;
  font-weight: 700 !important;
  letter-spacing: -0.01em !important;
  color: #111C2C !important;
}
.sopLearningAppRoot.euiFlyout .euiTitle--s,
.sopLearningAppRoot .euiFlyout .euiTitle--s {
  font-size: 1.375rem !important;
  font-weight: 700 !important;
  color: #111C2C !important;
}
.sopLearningAppRoot.euiFlyout .euiFlyoutHeader,
.sopLearningAppRoot .euiFlyout .euiFlyoutHeader {
  border-bottom-color: #E3E8F2 !important;
}
.sopLearningAppRoot.euiFlyout .euiFlyoutFooter,
.sopLearningAppRoot .euiFlyout .euiFlyoutFooter {
  border-top-color: #E3E8F2 !important;
  background: #F6F9FC !important;
}
.sopLearningAppRoot.euiFlyout *,
.sopLearningAppRoot .euiFlyout * {
  font-family: inherit !important;
}

/* -- Accordion (step list) ------------------------------------------------- */
.sopLearningAppRoot .euiAccordion__triggerWrapper {
  padding: 12px 16px !important;
}
.sopLearningAppRoot .euiAccordion__buttonContent {
  font-size: 0.875rem !important;
  font-weight: 500 !important;
}

/* -- Horizontal rule -------------------------------------------------------- */
.sopLearningAppRoot .euiHorizontalRule {
  border-color: #E3E8F2 !important;
  background-color: #E3E8F2 !important;
}

/* -- Spacers (ensure design-system rhythm) ---------------------------------- */
.sopLearningAppRoot .euiSpacer--xl { height: 32px !important; }
.sopLearningAppRoot .euiSpacer--l { height: 24px !important; }
.sopLearningAppRoot .euiSpacer--m { height: 16px !important; }
.sopLearningAppRoot .euiSpacer--s { height: 8px !important; }
.sopLearningAppRoot .euiSpacer--xs { height: 4px !important; }

/* -- Callouts --------------------------------------------------------------- */
.sopLearningAppRoot .euiCallOut {
  border-radius: 6px !important;
}
.sopLearningAppRoot .euiCallOut .euiCallOutHeader__title {
  font-size: 0.875rem !important;
  font-weight: 700 !important;
}

/* -- Progress bars / loading ------------------------------------------------ */
.sopLearningAppRoot .euiProgress--primary {
  background-color: #0B64DD !important;
}
.sopLearningAppRoot .euiProgress--success {
  background-color: #008A5E !important;
}

/* -- Icon tile (56px square for hero) --------------------------------------- */
.sopLearningAppRoot .euiPanel .euiIcon--primary {
  color: #0B64DD !important;
}

/* -- Switch ----------------------------------------------------------------- */
.sopLearningAppRoot .euiSwitch .euiSwitch__body {
  border-radius: 9999px !important;
}

/* -- Tooltip ---------------------------------------------------------------- */
.sopLearningAppRoot .euiToolTipPopover {
  font-size: 0.75rem !important;
  border-radius: 6px !important;
}

/* -- Popover ---------------------------------------------------------------- */
.sopLearningAppRoot .euiPopover__panel {
  border-radius: 6px !important;
  border-color: #E3E8F2 !important;
}

/* -- Modal (portaled) ------------------------------------------------------- */
.sopLearningAppRoot.euiModal,
.sopLearningAppRoot .euiModal {
  font-family: 'Inter', BlinkMacSystemFont, Helvetica, Arial, sans-serif !important;
  border-radius: 6px !important;
}
.sopLearningAppRoot.euiModal *,
.sopLearningAppRoot .euiModal * {
  font-family: inherit !important;
}
`;

const DARK_DIRECT_CSS = `
/* ============================================================================
   SOP Learning ("Protégé") — Design System Override (DARK)
   Direct .sopLearningAppRoot targeting — no ancestor-class selectors needed
   because dark mode is detected at the React level.
   ============================================================================ */

/* -- Foundation: font family, antialiasing, base color ---------------------- */
.sopLearningAppRoot {
  font-family: 'Inter', BlinkMacSystemFont, Helvetica, Arial, sans-serif !important;
  font-size: 14px !important;
  color: #D5DEEC !important;
  -webkit-font-smoothing: antialiased !important;
  -moz-osx-font-smoothing: grayscale !important;
  text-rendering: optimizeLegibility !important;
  font-feature-settings: 'calt' 1, 'kern' 1, 'liga' 1 !important;
}
.sopLearningAppRoot *,
.sopLearningAppRoot *::before,
.sopLearningAppRoot *::after {
  font-family: inherit !important;
}
.sopLearningAppRoot .euiText,
.sopLearningAppRoot .euiText p,
.sopLearningAppRoot .euiTitle,
.sopLearningAppRoot .euiStat__title,
.sopLearningAppRoot .euiStat__description,
.sopLearningAppRoot .euiTab,
.sopLearningAppRoot .euiButton,
.sopLearningAppRoot .euiButtonEmpty,
.sopLearningAppRoot .euiBadge,
.sopLearningAppRoot .euiFormLabel,
.sopLearningAppRoot .euiTableHeaderCell,
.sopLearningAppRoot .euiTableRowCell,
.sopLearningAppRoot .euiFieldText,
.sopLearningAppRoot .euiTextArea,
.sopLearningAppRoot .euiAccordion__triggerWrapper,
.sopLearningAppRoot .euiFlexItem,
.sopLearningAppRoot h1, .sopLearningAppRoot h2, .sopLearningAppRoot h3, .sopLearningAppRoot h4,
.sopLearningAppRoot p, .sopLearningAppRoot span, .sopLearningAppRoot div,
.sopLearningAppRoot label, .sopLearningAppRoot a {
  font-family: 'Inter', BlinkMacSystemFont, Helvetica, Arial, sans-serif !important;
}
.sopLearningAppRoot button,
.sopLearningAppRoot input,
.sopLearningAppRoot select,
.sopLearningAppRoot textarea {
  font-family: 'Inter', BlinkMacSystemFont, Helvetica, Arial, sans-serif !important;
}
.sopLearningAppRoot code,
.sopLearningAppRoot pre,
.sopLearningAppRoot .euiCodeBlock,
.sopLearningAppRoot .euiCodeBlock *,
.sopLearningAppRoot .euiCodeBlock__code,
.sopLearningAppRoot .euiCode {
  font-family: 'Roboto Mono', 'JetBrains Mono', Menlo, Courier, monospace !important;
  font-feature-settings: normal !important;
}
.sopLearningAppRoot .euiTitle,
.sopLearningAppRoot h1, .sopLearningAppRoot h2, .sopLearningAppRoot h3 {
  font-weight: 700 !important;
  letter-spacing: -0.01em !important;
}

/* -- Code blocks ------------------------------------------------------------ */
.sopLearningAppRoot .euiCodeBlock .euiCodeBlock__code {
  font-size: 0.8125rem !important;
  line-height: 1.5 !important;
}

/* -- Page background -------------------------------------------------------- */
.sopLearningAppRoot .euiPage,
.sopLearningAppRoot .euiPageBody {
  background: #0B1421 !important;
}

/* -- Page title (Protégé masthead) ------------------------------------------ */
.sopLearningAppRoot .euiPageHeader .euiTitle,
.sopLearningAppRoot .euiPageHeaderContent__titleWrapper .euiTitle {
  font-size: 2.125rem !important;
  font-weight: 700 !important;
  letter-spacing: -0.01em !important;
  line-height: 1.1 !important;
  color: #EDF1F8 !important;
}
.sopLearningAppRoot .euiPageHeader .euiText--s {
  font-size: 0.875rem !important;
  color: #8E9FBC !important;
}

/* -- Panel backgrounds, borders, radii ------------------------------------- */
.sopLearningAppRoot .euiPanel {
  background: #16202E !important;
  border-color: #1F2C3E !important;
  border-radius: 6px !important;
}
.sopLearningAppRoot .euiPanel--subdued,
.sopLearningAppRoot .euiPanel[class*="subdued"] {
  background: #0F1A28 !important;
}
.sopLearningAppRoot .euiPanel[class*="primary"] {
  background: #112A45 !important;
}

/* -- Stat (KPI numbers) ---------------------------------------------------- */
.sopLearningAppRoot .euiStat .euiTitle,
.sopLearningAppRoot .euiStat__title {
  font-size: 2.125rem !important;
  font-weight: 700 !important;
  line-height: 1.1 !important;
  letter-spacing: -0.01em !important;
}
.sopLearningAppRoot .euiStat .euiTextColor--subdued,
.sopLearningAppRoot .euiStat__description {
  font-size: 0.75rem !important;
  color: #8E9FBC !important;
  font-weight: 400 !important;
}

/* -- Tabs ------------------------------------------------------------------- */
.sopLearningAppRoot .euiTabs {
  border-bottom-color: #1F2C3E !important;
}
.sopLearningAppRoot .euiTab {
  font-size: 0.875rem !important;
  font-weight: 500 !important;
}
.sopLearningAppRoot .euiTab-isSelected,
.sopLearningAppRoot .euiTab[aria-selected="true"] {
  font-weight: 600 !important;
  color: #36A2EF !important;
}
.sopLearningAppRoot .euiTab:not(.euiTab-isSelected) {
  color: #8E9FBC !important;
}

/* -- Titles (section headings) --------------------------------------------- */
.sopLearningAppRoot .euiTitle--l {
  font-size: 2.125rem !important;
  font-weight: 700 !important;
  letter-spacing: -0.01em !important;
  color: #EDF1F8 !important;
}
.sopLearningAppRoot .euiTitle--m {
  font-size: 1.6875rem !important;
  font-weight: 700 !important;
  letter-spacing: -0.01em !important;
  color: #EDF1F8 !important;
}
.sopLearningAppRoot .euiTitle--s {
  font-size: 1.375rem !important;
  font-weight: 700 !important;
  color: #EDF1F8 !important;
}
.sopLearningAppRoot .euiTitle--xs {
  font-size: 1rem !important;
  font-weight: 700 !important;
  color: #EDF1F8 !important;
}
.sopLearningAppRoot .euiTitle--xxs {
  font-size: 0.875rem !important;
  font-weight: 700 !important;
  color: #EDF1F8 !important;
}

/* -- Text sizing ------------------------------------------------------------ */
.sopLearningAppRoot .euiText--s,
.sopLearningAppRoot .euiText--s * {
  font-size: 0.875rem !important;
}
.sopLearningAppRoot .euiText--xs,
.sopLearningAppRoot .euiText--xs * {
  font-size: 0.75rem !important;
}
.sopLearningAppRoot .euiTextColor--subdued {
  color: #8E9FBC !important;
}

/* -- Table headers ---------------------------------------------------------- */
.sopLearningAppRoot .euiTableHeaderCell .euiTableCellContent__text {
  font-size: 0.75rem !important;
  font-weight: 600 !important;
  text-transform: uppercase !important;
  letter-spacing: 0.04em !important;
  color: #8E9FBC !important;
}
.sopLearningAppRoot .euiTableHeaderCell {
  border-bottom: 2px solid #34435C !important;
}

/* -- Table cells ------------------------------------------------------------ */
.sopLearningAppRoot .euiTableRowCell {
  font-size: 0.875rem !important;
  color: #D5DEEC !important;
  border-bottom-color: #1F2C3E !important;
}
.sopLearningAppRoot .euiTableRow:hover {
  background-color: #0F1A28 !important;
}
.sopLearningAppRoot .euiTableCellContent--alignRight,
.sopLearningAppRoot .sop-num {
  font-variant-numeric: tabular-nums !important;
  font-feature-settings: 'tnum' 1 !important;
}

/* -- Badges ----------------------------------------------------------------- */
.sopLearningAppRoot .euiBadge {
  font-size: 0.75rem !important;
  font-weight: 500 !important;
  border-radius: 4px !important;
  line-height: 1 !important;
}

/* -- Buttons ---------------------------------------------------------------- */
.sopLearningAppRoot .euiButton,
.sopLearningAppRoot .euiButtonEmpty {
  border-radius: 6px !important;
  font-size: 0.875rem !important;
  font-weight: 500 !important;
}
.sopLearningAppRoot .euiButton--fill {
  box-shadow: none !important;
}

/* -- Form inputs ------------------------------------------------------------ */
.sopLearningAppRoot .euiFieldText,
.sopLearningAppRoot .euiTextArea,
.sopLearningAppRoot .euiFieldSearch,
.sopLearningAppRoot .euiFieldNumber,
.sopLearningAppRoot .euiSelect {
  border-color: #34435C !important;
  border-radius: 6px !important;
  font-size: 0.875rem !important;
  background: #16202E !important;
}
.sopLearningAppRoot .euiFieldText:focus,
.sopLearningAppRoot .euiFieldSearch:focus,
.sopLearningAppRoot .euiTextArea:focus {
  border-color: #36A2EF !important;
  box-shadow: inset 0 -2px 0 #36A2EF !important;
}
.sopLearningAppRoot .euiFormLabel {
  font-size: 0.75rem !important;
  font-weight: 600 !important;
  color: #EDF1F8 !important;
}

/* -- Flyout (portaled outside root, but given className) -------------------- */
.sopLearningAppRoot.euiFlyout,
.sopLearningAppRoot .euiFlyout {
  font-family: 'Inter', BlinkMacSystemFont, Helvetica, Arial, sans-serif !important;
  background: #16202E !important;
}
.sopLearningAppRoot.euiFlyout .euiTitle--m,
.sopLearningAppRoot .euiFlyout .euiTitle--m {
  font-size: 1.6875rem !important;
  font-weight: 700 !important;
  letter-spacing: -0.01em !important;
  color: #EDF1F8 !important;
}
.sopLearningAppRoot.euiFlyout .euiTitle--s,
.sopLearningAppRoot .euiFlyout .euiTitle--s {
  font-size: 1.375rem !important;
  font-weight: 700 !important;
  color: #EDF1F8 !important;
}
.sopLearningAppRoot.euiFlyout .euiFlyoutHeader,
.sopLearningAppRoot .euiFlyout .euiFlyoutHeader {
  border-bottom-color: #1F2C3E !important;
}
.sopLearningAppRoot.euiFlyout .euiFlyoutFooter,
.sopLearningAppRoot .euiFlyout .euiFlyoutFooter {
  border-top-color: #1F2C3E !important;
  background: #0F1A28 !important;
}
.sopLearningAppRoot.euiFlyout *,
.sopLearningAppRoot .euiFlyout * {
  font-family: inherit !important;
}

/* -- Accordion (step list) ------------------------------------------------- */
.sopLearningAppRoot .euiAccordion__triggerWrapper {
  padding: 12px 16px !important;
}
.sopLearningAppRoot .euiAccordion__buttonContent {
  font-size: 0.875rem !important;
  font-weight: 500 !important;
}

/* -- Horizontal rule -------------------------------------------------------- */
.sopLearningAppRoot .euiHorizontalRule {
  border-color: #1F2C3E !important;
  background-color: #1F2C3E !important;
}

/* -- Spacers (ensure design-system rhythm) ---------------------------------- */
.sopLearningAppRoot .euiSpacer--xl { height: 32px !important; }
.sopLearningAppRoot .euiSpacer--l { height: 24px !important; }
.sopLearningAppRoot .euiSpacer--m { height: 16px !important; }
.sopLearningAppRoot .euiSpacer--s { height: 8px !important; }
.sopLearningAppRoot .euiSpacer--xs { height: 4px !important; }

/* -- Callouts --------------------------------------------------------------- */
.sopLearningAppRoot .euiCallOut {
  border-radius: 6px !important;
}
.sopLearningAppRoot .euiCallOut .euiCallOutHeader__title {
  font-size: 0.875rem !important;
  font-weight: 700 !important;
}

/* -- Progress bars / loading ------------------------------------------------ */
.sopLearningAppRoot .euiProgress--primary {
  background-color: #36A2EF !important;
}
.sopLearningAppRoot .euiProgress--success {
  background-color: #24C292 !important;
}

/* -- Icon tile (56px square for hero) --------------------------------------- */
.sopLearningAppRoot .euiPanel .euiIcon--primary {
  color: #36A2EF !important;
}

/* -- Switch ----------------------------------------------------------------- */
.sopLearningAppRoot .euiSwitch .euiSwitch__body {
  border-radius: 9999px !important;
}

/* -- Tooltip ---------------------------------------------------------------- */
.sopLearningAppRoot .euiToolTipPopover {
  font-size: 0.75rem !important;
  border-radius: 6px !important;
}

/* -- Popover ---------------------------------------------------------------- */
.sopLearningAppRoot .euiPopover__panel {
  border-radius: 6px !important;
  border-color: #1F2C3E !important;
}

/* -- Modal (portaled) ------------------------------------------------------- */
.sopLearningAppRoot.euiModal,
.sopLearningAppRoot .euiModal {
  font-family: 'Inter', BlinkMacSystemFont, Helvetica, Arial, sans-serif !important;
  border-radius: 6px !important;
  background: #16202E !important;
}
.sopLearningAppRoot.euiModal *,
.sopLearningAppRoot .euiModal * {
  font-family: inherit !important;
}
`;

/**
 * Design-system style overrides, injected as a raw DOM <style> element.
 *
 * This bypasses emotion's specificity / injection-order entirely. The rules use
 * !important and are scoped to .sopLearningAppRoot so they override EUI without
 * leaking into the wider Kibana chrome.
 *
 * The component detects dark-mode via EUI's useEuiTheme() hook and injects the
 * matching dark override block alongside the base light rules.
 */
export function DesignSystemOverrides() {
  const { colorMode } = useEuiTheme();
  const isDark = colorMode === 'DARK';

  const css = isDark ? DARK_DIRECT_CSS : LIGHT_CSS;

  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}

/**
 * @deprecated Retained for backwards compatibility; callers should switch to
 * DesignSystemOverrides. This now simply delegates to the new implementation.
 */
export function DesignSystemGlobalStyles() {
  return <DesignSystemOverrides />;
}
