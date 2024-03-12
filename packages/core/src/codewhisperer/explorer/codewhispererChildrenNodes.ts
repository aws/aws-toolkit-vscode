/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode'
import { ToolkitError } from '../../shared/errors'
import { addColor, codicon, getIcon } from '../../shared/icons'
import { TreeNode } from '../../shared/treeview/resourceTreeDataProvider'
import { DataQuickPickItem } from '../../shared/ui/pickerPrompter'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Command, placeholder } from '../../shared/vscode/commands2'
import {
    toggleCodeSuggestions,
    showReferenceLog,
    showSecurityScan,
    showLearnMore,
    showFreeTierLimit,
    reconnect,
    selectCustomizationPrompt,
    signoutCodeWhisperer,
    showManageCwConnections,
    toggleCodeScans,
} from '../commands/basicCommands'
import { CodeWhispererCommandDeclarations } from '../commands/gettingStartedPageCommands'
import { codeScanState } from '../models/model'
import { getNewCustomizationAvailable, getSelectedCustomization } from '../util/customizationUtil'
import { cwQuickPickSource, cwTreeNodeSource } from '../commands/types'

export function createAutoSuggestions(type: 'item', pause: boolean): DataQuickPickItem<'autoSuggestions'>
export function createAutoSuggestions(type: 'tree', pause: boolean): TreeNode<Command>
export function createAutoSuggestions(
    type: 'item' | 'tree',
    pause: boolean
): DataQuickPickItem<'autoSuggestions'> | TreeNode<Command>
export function createAutoSuggestions(type: 'item' | 'tree', pause: boolean): any {
    const labelResume = localize('AWS.codewhisperer.resumeCodeWhispererNode.label', 'Resume Auto-Suggestions')
    const iconResume = getIcon('vscode-debug-start')
    const labelPause = localize('AWS.codewhisperer.pauseCodeWhispererNode.label', 'Pause Auto-Suggestions')
    const iconPause = getIcon('vscode-debug-pause')

    switch (type) {
        case 'tree':
            return toggleCodeSuggestions.build(placeholder, cwTreeNodeSource).asTreeNode(
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
            return {
                data: 'autoSuggestions',
                label: pause ? codicon`${iconPause} ${labelPause}` : codicon`${iconResume} ${labelResume}`,
                description: pause ? 'Currently RUNNING' : 'Currently PAUSED',
                onClick: () => toggleCodeSuggestions.execute(placeholder, cwQuickPickSource),
            } as DataQuickPickItem<'autoSuggestions'>
    }
}

export function createAutoScans(type: 'item', pause: boolean): DataQuickPickItem<'autoScans'>
export function createAutoScans(type: 'tree', pause: boolean): TreeNode<Command>
export function createAutoScans(
    type: 'item' | 'tree',
    pause: boolean
): DataQuickPickItem<'autoScans'> | TreeNode<Command>
export function createAutoScans(type: 'item' | 'tree', pause: boolean): any {
    const labelResume = localize('AWS.codewhisperer.resumeCodeWhispererNode.label', 'Resume Auto-Scans')
    const iconResume = getIcon('vscode-debug-alt')
    const labelPause = localize('AWS.codewhisperer.pauseCodeWhispererNode.label', 'Pause Auto-Scans')
    const iconPause = getIcon('vscode-debug-pause')

    switch (type) {
        case 'tree':
            return toggleCodeScans.build(placeholder, cwTreeNodeSource).asTreeNode(
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
            return {
                data: 'autoScans',
                label: pause ? codicon`${iconPause} ${labelPause}` : codicon`${iconResume} ${labelResume}`,
                description: pause ? 'Currently RUNNING' : 'Currently PAUSED',
                onClick: () => toggleCodeScans.execute(placeholder, cwQuickPickSource),
            } as DataQuickPickItem<'autoScans'>
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
            return showReferenceLog.build(placeholder, cwTreeNodeSource).asTreeNode({
                label: label,
                iconPath: icon,
                tooltip: localize(
                    'AWS.explorerNode.codewhispererOpenReferenceLogNode.tooltip',
                    'Click to open Code Reference Log'
                ),
                contextValue: 'awsCodeWhispererOpenReferenceLogNode',
            })
        case 'item':
            return {
                data: 'openReferenceLog',
                label: codicon`${icon} ${label}`,
                onClick: () => showReferenceLog.execute(placeholder, cwQuickPickSource),
            } as DataQuickPickItem<'openReferenceLog'>
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
            return showSecurityScan.build(placeholder, cwTreeNodeSource).asTreeNode({
                label: label,
                iconPath: icon,
                tooltip: label,
                contextValue: `awsCodeWhisperer${prefix}SecurityScanNode`,
            })
        case 'item':
            return {
                data: 'securityScan',
                label: codicon`${icon} ${label}`,
                onClick: () => showSecurityScan.execute(placeholder, cwQuickPickSource),
            } as DataQuickPickItem<'securityScan'>
    }
}

export function createSignIn(type: 'item'): DataQuickPickItem<'signIn'>
export function createSignIn(type: 'tree'): TreeNode<Command>
export function createSignIn(type: 'item' | 'tree'): DataQuickPickItem<'signIn'> | TreeNode<Command>
export function createSignIn(type: 'item' | 'tree'): any {
    const label = localize('AWS.codewhisperer.signInNode.label', 'Sign in to get started')
    const icon = getIcon('vscode-account')

    switch (type) {
        case 'tree':
            return showManageCwConnections.build(placeholder, cwTreeNodeSource).asTreeNode({
                label: label,
                iconPath: icon,
            })
        case 'item':
            return {
                data: 'signIn',
                label: codicon`${icon} ${label}`,
                onClick: () => showManageCwConnections.execute(placeholder, cwQuickPickSource),
            } as DataQuickPickItem<'signIn'>
    }
}

export function createReconnect(type: 'item'): DataQuickPickItem<'reconnect'>
export function createReconnect(type: 'tree'): TreeNode<Command>
export function createReconnect(type: 'item' | 'tree'): DataQuickPickItem<'reconnect'> | TreeNode<Command>
export function createReconnect(type: 'item' | 'tree'): any {
    const label = localize('AWS.codewhisperer.reconnectNode.label', 'Re-authenticate to connect')
    const icon = addColor(getIcon('vscode-debug-disconnect'), 'notificationsErrorIcon.foreground')

    switch (type) {
        case 'tree':
            return reconnect.build(placeholder, cwTreeNodeSource).asTreeNode({
                label: label,
                iconPath: icon,
            })
        case 'item':
            return {
                data: 'reconnect',
                label: codicon`${icon} ${label}`,
                onClick: () => reconnect.execute(placeholder, cwQuickPickSource),
            } as DataQuickPickItem<'reconnect'>
    }
}

export function createLearnMore(type: 'item'): DataQuickPickItem<'learnMore'>
export function createLearnMore(type: 'tree'): TreeNode<Command>
export function createLearnMore(type: 'item' | 'tree'): DataQuickPickItem<'learnMore'> | TreeNode<Command>
export function createLearnMore(type: 'item' | 'tree'): any {
    const label = localize('AWS.codewhisperer.learnMoreNode.label', 'Learn more about CodeWhisperer')
    const icon = getIcon('vscode-question')

    switch (type) {
        case 'tree':
            return showLearnMore.build(cwTreeNodeSource).asTreeNode({
                label: label,
                iconPath: icon,
                contextValue: 'awsCodeWhispererLearnMoreNode',
            })
        case 'item':
            return {
                data: 'learnMore',
                label: codicon`${icon} ${label}`,
                onClick: () => showLearnMore.execute(cwQuickPickSource),
            } as DataQuickPickItem<'learnMore'>
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
            return showFreeTierLimit.build(placeholder, cwTreeNodeSource).asTreeNode({
                label: label,
                iconPath: icon,
                description: localize('AWS.explorerNode.freeTierLimitMet.tooltip', `paused until ${nextMonth}`),
            })

        case 'item':
            return {
                data: 'freeTierLimitMet',
                label: codicon`${icon} ${label}`,
                onClick: () => showFreeTierLimit.execute(placeholder, cwQuickPickSource),
            } as DataQuickPickItem<'freeTierLimitMet'>
    }
}

export function createSelectCustomization(type: 'item'): DataQuickPickItem<'selectCustomization'>
export function createSelectCustomization(type: 'tree'): TreeNode<Command>
export function createSelectCustomization(
    type: 'item' | 'tree'
): DataQuickPickItem<'selectCustomization'> | TreeNode<Command>
export function createSelectCustomization(type: 'tree' | 'item'): any {
    const newCustomizationsAvailable = getNewCustomizationAvailable()
    const selectedCustomization = getSelectedCustomization()
    const newText = newCustomizationsAvailable ? 'new!      ' : ''

    const label = localize('AWS.codewhisperer.selectCustomizationNode.label', 'Select Customization')
    const icon = getIcon('vscode-extensions')

    switch (type) {
        case 'tree':
            return selectCustomizationPrompt.build(placeholder, cwTreeNodeSource).asTreeNode({
                label: label,
                iconPath: icon,
                description: `${newText}${selectedCustomization.arn === '' ? '' : selectedCustomization.name}`,
            })
        case 'item':
            return {
                data: 'selectCustomization',
                label: codicon`${icon} ${label}`,
                description: `Using ${selectedCustomization.name}`,
                onClick: () => selectCustomizationPrompt.execute(placeholder, cwQuickPickSource),
            } as DataQuickPickItem<'selectCustomization'>
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
                .build(placeholder, cwTreeNodeSource)
                .asTreeNode({
                    label: label,
                    iconPath: icon,
                })

        case 'item':
            return {
                data: 'gettingStarted',
                label: codicon`${icon} ${label}`,
                onClick: () =>
                    CodeWhispererCommandDeclarations.instance.declared.showGettingStartedPage.execute(
                        placeholder,
                        cwQuickPickSource
                    ),
            } as DataQuickPickItem<'gettingStarted'>
    }
}

export function createSignout(type: 'item'): DataQuickPickItem<'signout'>
export function createSignout(type: 'tree'): TreeNode<Command>
export function createSignout(type: 'item' | 'tree'): DataQuickPickItem<'signout'> | TreeNode<Command>
export function createSignout(type: 'item' | 'tree'): any {
    const label = localize('AWS.codewhisperer.signoutNode.label', 'Sign Out')
    const icon = getIcon('vscode-sign-out')
    switch (type) {
        case 'tree':
            throw new ToolkitError('codewhisperer: Signout Node not implemented for tree.')
        case 'item':
            return {
                data: 'signout',
                label: codicon`${icon} ${label}`,
                onClick: () => signoutCodeWhisperer.execute(placeholder, cwQuickPickSource),
            } as DataQuickPickItem<'signout'>
    }
}

export function createSeparator(): DataQuickPickItem<'separator'> {
    return {
        kind: vscode.QuickPickItemKind.Separator,
        data: 'separator',
        label: '',
    }
}
