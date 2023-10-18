/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthCommandDeclarations } from '../../auth/commands'
import { getIcon } from '../../shared/icons'
import { localize } from '../../shared/utilities/vsCodeUtils'
import {
    enableCodeSuggestions,
    toggleCodeSuggestions,
    showReferenceLog,
    showSecurityScan,
    showLearnMore,
    showFreeTierLimit,
    reconnect,
    selectCustomizationPrompt,
} from '../commands/basicCommands'
import { codeScanState } from '../models/model'
import { getNewCustomizationAvailable, getSelectedCustomization } from '../util/customizationUtil'

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
    AuthCommandDeclarations.instance.declared.showManageConnections
        .build('codewhispererDeveloperTools', 'codewhisperer')
        .asTreeNode({
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

export const createSelectCustomizationNode = () => {
    const newCustomizationsAvailable = getNewCustomizationAvailable()
    const selectedCustomization = getSelectedCustomization()
    const newText = newCustomizationsAvailable ? 'new!      ' : ''

    return selectCustomizationPrompt.build().asTreeNode({
        label: localize('AWS.explorerNode.selectCustomization.label', 'Select Customization'),
        iconPath: getIcon('vscode-extensions'),
        description: `${newText}${selectedCustomization.arn === '' ? '' : selectedCustomization.name}`,
    })
}
