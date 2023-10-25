/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthCommandDeclarations } from '../../auth/commands'
import { getIcon } from '../../shared/icons'
import { TreeNode } from '../../shared/treeview/resourceTreeDataProvider'
import { DataQuickPickItem } from '../../shared/ui/pickerPrompter'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Command } from '../../shared/vscode/commands2'
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
import { CodeWhispererCommandDeclarations } from '../commands/gettingStartedPageCommands'
import { codeScanState } from '../models/model'
import { getNewCustomizationAvailable, getSelectedCustomization } from '../util/customizationUtil'

export const createEnableCodeSuggestionsNode = () =>
    enableCodeSuggestions.build().asTreeNode({
        label: localize('AWS.explorerNode.enableCodeWhispererNode.label', 'Enable CodeWhisperer'),
        iconPath: getIcon('vscode-debug-start'),
        tooltip: localize('AWS.explorerNode.enableCodeWhispererNode.tooltip', 'Click to Enable CodeWhisperer'),
    })

export function createAutoSuggestions(type: 'item', pause: boolean): DataQuickPickItem<'autoSuggestions'>
export function createAutoSuggestions(type: 'tree', pause: boolean): TreeNode<Command>
export function createAutoSuggestions(type: 'item' | 'tree', pause: boolean): DataQuickPickItem<'autoSuggestions'> | TreeNode<Command>
export function createAutoSuggestions(type: 'item' | 'tree', pause: boolean): any {
    const labelResume = localize('AWS.codewhisperer.resumeCodeWhispererNode.label', 'Resume Auto-Suggestions')
    const iconResume = getIcon('vscode-debug-start')
    const labelPause = localize('AWS.codewhisperer.pauseCodeWhispererNode.label', 'Pause Auto-Suggestions')
    const iconPause = getIcon('vscode-debug-pause')

    switch (type) {
        case 'tree':
            return toggleCodeSuggestions.build().asTreeNode(
                pause
                    ? {
                          label: labelPause,
                          iconPath: iconPause,
                      }
                    : {
                          label: labelResume,
                          iconPath: iconResume,
                      }
            )
        case 'item':
            break
    }
}

export function createOpenReferenceLog(type: 'item'): DataQuickPickItem<'openReferenceLog'>
export function createOpenReferenceLog(type: 'tree'): TreeNode<Command>
export function createOpenReferenceLog(type: 'item' | 'tree'): DataQuickPickItem<'openReferenceLog'> | TreeNode<Command>
export function createOpenReferenceLog(type: 'item' | 'tree'): any {
    const label = localize('AWS.codewhisperer.openReferenceLogNode.label', 'Open Code Reference Log')
    const icon = getIcon('vscode-remote')

    switch (type) {
        case 'tree':
            return showReferenceLog.build().asTreeNode({
                label: label,
                iconPath: icon,
                tooltip: localize(
                    'AWS.explorerNode.codewhispererOpenReferenceLogNode.tooltip',
                    'Click to open Code Reference Log'
                ),
                contextValue: 'awsCodeWhispererOpenReferenceLogNode',
            })
        case 'item':
            break
    }
}

export function createSecurityScan(type: 'item'): DataQuickPickItem<'securityScan'>
export function createSecurityScan(type: 'tree'): TreeNode<Command>
export function createSecurityScan(type: 'item' | 'tree'): DataQuickPickItem<'securityScan'> | TreeNode<Command>
export function createSecurityScan(type: 'item' | 'tree'): any {
    const prefix = codeScanState.getPrefixTextForButton()
    const label = `${prefix} Security Scan`
    const icon = codeScanState.getIconForButton()

    switch (type) {
        case 'tree':
            return showSecurityScan.build().asTreeNode({
                label: label,
                iconPath: icon,
                tooltip: label,
                contextValue: `awsCodeWhisperer${prefix}SecurityScanNode`,
            })
        case 'item':
            break
    }
}

export function createSignIn(type: 'item'): DataQuickPickItem<'signIn'>
export function createSignIn(type: 'tree'): TreeNode<Command>
export function createSignIn(type: 'item' | 'tree'): DataQuickPickItem<'signIn'> | TreeNode<Command>
export function createSignIn(type: 'item' | 'tree'): any {
    const label = localize('AWS.codewhisperer.signInNode.label', 'Start')
    const icon = getIcon('vscode-debug-start')

    switch (type) {
        case 'tree':
            return AuthCommandDeclarations.instance.declared.showManageConnections
                .build('codewhispererDeveloperTools', 'codewhisperer')
                .asTreeNode({
                    label: label,
                    iconPath: icon,
                })
        case 'item':
            break
    }
}

export function createReconnect(type: 'item'): DataQuickPickItem<'reconnect'>
export function createReconnect(type: 'tree'): TreeNode<Command>
export function createReconnect(type: 'item' | 'tree'): DataQuickPickItem<'reconnect'> | TreeNode<Command>
export function createReconnect(type: 'item' | 'tree'): any {
    const label = localize('AWS.codewhisperer.reconnectNode.label', 'Reconnect')
    const icon = getIcon('vscode-debug-start')

    switch (type) {
        case 'tree':
            return reconnect.build().asTreeNode({
                label: label,
                iconPath: icon,
            })
        case 'item':
            break
    }
}

export function createLearnMore(type: 'item'): DataQuickPickItem<'learnMore'>
export function createLearnMore(type: 'tree'): TreeNode<Command>
export function createLearnMore(type: 'item' | 'tree'): DataQuickPickItem<'learnMore'> | TreeNode<Command>
export function createLearnMore(type: 'item' | 'tree'): any {
    const label = localize('AWS.codewhisperer.learnMoreNode.label', 'Learn More about CodeWhisperer')
    const icon = getIcon('vscode-question')

    switch (type) {
        case 'tree':
            return showLearnMore.build().asTreeNode({
                label: label,
                iconPath: icon,
                contextValue: 'awsCodeWhispererLearnMoreNode',
            })
        case 'item':
            break
    }
}

export function createFreeTierLimitMet(type: 'item'): DataQuickPickItem<'freeTierLimitMet'>
export function createFreeTierLimitMet(type: 'tree'): TreeNode<Command>
export function createFreeTierLimitMet(type: 'item' | 'tree'): DataQuickPickItem<'freeTierLimitMet'> | TreeNode<Command>
export function createFreeTierLimitMet(type: 'tree' | 'item'): any {
    const now = new Date()
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleDateString('en-US')

    const label = localize('AWS.codewhisperer.freeTierLimitMetNode.label', 'Free Tier Limit Met')
    const icon = getIcon('vscode-error')

    switch (type) {
        case 'tree':
            return showFreeTierLimit.build().asTreeNode({
                label: label,
                iconPath: icon,
                description: localize('AWS.explorerNode.freeTierLimitMet.tooltip', `paused until ${nextMonth}`),
            })

        case 'item':
            break
    }
}

export function createSelectCustomization(type: 'item'): DataQuickPickItem<'selectCustomization'>
export function createSelectCustomization(type: 'tree'): TreeNode<Command>
export function createSelectCustomization(type: 'item' | 'tree'): DataQuickPickItem<'selectCustomization'> | TreeNode<Command>
export function createSelectCustomization(type: 'tree' | 'item'): any {
    const newCustomizationsAvailable = getNewCustomizationAvailable()
    const selectedCustomization = getSelectedCustomization()
    const newText = newCustomizationsAvailable ? 'new!      ' : ''

    const label = localize('AWS.codewhisperer.selectCustomizationNode.label', 'Select Customization')
    const icon = getIcon('vscode-extensions')

    switch (type) {
        case 'tree':
            return selectCustomizationPrompt.build().asTreeNode({
                label: label,
                iconPath: icon,
                description: `${newText}${selectedCustomization.arn === '' ? '' : selectedCustomization.name}`,
            })
            break

        case 'item':
            break
    }
}

/* Opens the Learn CodeWhisperer Page */
export function createGettingStarted(type: 'item'): DataQuickPickItem<'gettingStarted'>
export function createGettingStarted(type: 'tree'): TreeNode<Command>
export function createGettingStarted(type: 'item' | 'tree'): DataQuickPickItem<'gettingStarted'> | TreeNode<Command>
export function createGettingStarted(type: 'item' | 'tree'): any {
    const label = localize('AWS.codewhisperer.gettingStartedNode.label', 'Learn')
    const icon = getIcon('aws-codewhisperer-learn')
    switch (type) {
        case 'tree':
            return CodeWhispererCommandDeclarations.instance.declared.showGettingStartedPage
                .build('codewhispererDeveloperTools')
                .asTreeNode({
                    label: label,
                    iconPath: icon,
                })

        case 'item':
            break
    }
}
