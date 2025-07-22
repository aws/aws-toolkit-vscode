/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { ProgressField, MynahIcons, ChatItemButton } from '@aws/mynah-ui'
import { AggregatedCodeScanIssue, CodeAnalysisScope, SecurityScanStep, severities } from 'aws-core-vscode/codewhisperer'
import { i18n } from 'aws-core-vscode/shared'

// For uniquely identifiying which chat messages should be routed to Scan
export const scanChat = 'scanChat'

export enum ScanAction {
    RUN_PROJECT_SCAN = 'runProjectScan',
    RUN_FILE_SCAN = 'runFileScan',
    STOP_PROJECT_SCAN = 'stopProjectScan',
    STOP_FILE_SCAN = 'stopFileScan',
}

export const cancelFileScanButton: ChatItemButton = {
    id: ScanAction.STOP_FILE_SCAN,
    text: i18n('AWS.generic.cancel'),
    icon: 'cancel' as MynahIcons,
}

export const cancelProjectScanButton: ChatItemButton = {
    ...cancelFileScanButton,
    id: ScanAction.STOP_PROJECT_SCAN,
}

export const fileScanProgressField: ProgressField = {
    status: 'default',
    text: i18n('AWS.amazonq.scans.fileScanInProgress'),
    value: -1,
    actions: [cancelFileScanButton],
}

export const projectScanProgressField: ProgressField = {
    ...fileScanProgressField,
    text: i18n('AWS.amazonq.scans.projectScanInProgress'),
    actions: [cancelProjectScanButton],
}

export const cancellingProgressField: ProgressField = {
    status: 'warning',
    text: i18n('AWS.generic.cancelling'),
    value: -1,
    actions: [],
}

const checkIcons = {
    wait: '&#9744;',
    current: '&#9744;',
    done: '&#9745;',
}
export const scanProgressMessage = (
    currentStep: SecurityScanStep,
    scope: CodeAnalysisScope,
    fileName?: string
) => `Okay, I'm reviewing ${scope === CodeAnalysisScope.PROJECT ? 'your project' : fileName ? `\`${fileName}\`` : 'your file'} for code issues.

This may take a few minutes. I'll share my progress here.

${getIconForStep(SecurityScanStep.CREATE_SCAN_JOB, currentStep)} Initiating code review

${getIconForStep(SecurityScanStep.POLL_SCAN_STATUS, currentStep)} Reviewing your code 

${getIconForStep(SecurityScanStep.PROCESS_SCAN_RESULTS, currentStep)} Processing review results 
`

export const scanSummaryMessage = (
    scope: CodeAnalysisScope,
    securityRecommendationCollection: AggregatedCodeScanIssue[]
) => {
    const severityCounts = securityRecommendationCollection.reduce(
        (accumulator, current) => ({
            ...Object.fromEntries(
                severities.map((severity) => [
                    severity,
                    accumulator[severity] +
                        current.issues.filter((issue) => issue.severity === severity && issue.visible).length,
                ])
            ),
        }),
        Object.fromEntries(severities.map((severity) => [severity, 0]))
    )
    return `I completed the code review. I found the following issues in your ${scope === CodeAnalysisScope.PROJECT ? 'workspace' : 'file'}:
${Object.entries(severityCounts)
    .map(([severity, count]) => `- ${severity}: \`${count} ${count === 1 ? 'issue' : 'issues'}\``)
    .join('\n')}
`
}

const getIconForStep = (targetStep: number, currentStep: number) => {
    return currentStep === targetStep
        ? checkIcons.current
        : currentStep > targetStep
          ? checkIcons.done
          : checkIcons.wait
}

export const codeReviewInChat = false
