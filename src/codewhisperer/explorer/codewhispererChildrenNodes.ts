/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getIcon } from '../../shared/icons'
import { localize } from '../../shared/utilities/vsCodeUtils'
import {
    enableCodeSuggestions,
    toggleCodeSuggestions,
    showReferenceLog,
    showSecurityScan,
    showLearnMore,
    showSsoSignIn,
    showFreeTierLimit,
    reconnect,
} from '../commands/basicCommands'
import { codeScanState } from '../models/model'

export const createEnableCodeSuggestionsNode = () =>
    enableCodeSuggestions.build().asTreeNode({
        label: localize('AWS.explorerNode.enableCodeWhispererNode.label', 'Enable CodeWhisperer'),
        iconPath: getIcon('vscode-debug-start'),
        tooltip: localize('AWS.explorerNode.enableCodeWhispererNode.tooltip', 'Click to Enable CodeWhisperer'),
    })

export const createAutoSuggestionsNode = (pause: boolean) =>
    toggleCodeSuggestions.build().asTreeNode(
        pause
            ? {
                  label: localize('AWS.explorerNode.pauseCodeWhispererNode.label', 'Pause Auto-Suggestions'),
                  iconPath: getIcon('vscode-debug-pause'),
              }
            : {
                  label: localize('AWS.explorerNode.resumeCodeWhispererNode.label', 'Resume Auto-Suggestions'),
                  iconPath: getIcon('vscode-debug-start'),
              }
    )

export const createOpenReferenceLogNode = () =>
    showReferenceLog.build().asTreeNode({
        label: localize('AWS.explorerNode.codewhispererOpenReferenceLogNode.label', 'Open Code Reference Log'),
        iconPath: getIcon('vscode-remote'),
        tooltip: localize(
            'AWS.explorerNode.codewhispererOpenReferenceLogNode.tooltip',
            'Click to open Code Reference Log'
        ),
        contextValue: 'awsCodeWhispererOpenReferenceLogNode',
    })

export const createSecurityScanNode = () => {
    const prefix = codeScanState.getPrefixTextForButton()
    return showSecurityScan.build().asTreeNode({
        label: `${prefix} Security Scan`,
        iconPath: codeScanState.getIconForButton(),
        tooltip: `${prefix} Security Scan`,
        contextValue: `awsCodeWhisperer${prefix}SecurityScanNode`,
    })
}

export const createSsoSignIn = () =>
    showSsoSignIn.build().asTreeNode({
        label: localize('AWS.explorerNode.sSoSignInNode.label', 'Start'),
        iconPath: getIcon('vscode-debug-start'),
    })

export const createReconnectNode = () =>
    reconnect.build().asTreeNode({
        label: localize('AWS.explorerNode.reconnectNode.label', 'Reconnect'),
        iconPath: getIcon('vscode-debug-start'),
    })

export const createLearnMore = () =>
    showLearnMore.build().asTreeNode({
        label: localize('AWS.explorerNode.codewhispererLearnMore.label', 'Learn More about CodeWhisperer'),
        iconPath: getIcon('vscode-question'),
        contextValue: 'awsCodeWhispererLearnMoreNode',
    })

export const createFreeTierLimitMetNode = () => {
    const now = new Date()
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleDateString('en-US')
    return showFreeTierLimit.build().asTreeNode({
        label: localize('AWS.explorerNode.freeTierLimitMet.label', 'Free Tier Limit Met'),
        iconPath: getIcon('vscode-error'),
        description: localize('AWS.explorerNode.freeTierLimitMet.tooltip', `paused until ${nextMonth}`),
    })
}
