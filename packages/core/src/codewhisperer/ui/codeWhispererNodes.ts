/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode'
import { addColor, codicon, getIcon } from '../../shared/icons'
import { DataQuickPickItem } from '../../shared/ui/pickerPrompter'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Command, Commands, placeholder } from '../../shared/vscode/commands2'
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
    showIntroduction,
} from '../commands/basicCommands'
import { CodeWhispererCommandDeclarations } from '../commands/gettingStartedPageCommands'
import { codeScanState } from '../models/model'
import { getNewCustomizationsAvailable, getSelectedCustomization } from '../util/customizationUtil'
import { cwQuickPickSource, cwTreeNodeSource } from '../commands/types'
import { AuthUtil } from '../util/authUtil'
import { TreeNode } from '../../shared/treeview/resourceTreeDataProvider'
import { submitFeedback } from '../../feedback/vue/submitFeedback'

export function createAutoSuggestions(pause: boolean): DataQuickPickItem<'autoSuggestions'> {
    const labelResume = localize('AWS.codewhisperer.resumeCodeWhispererNode.label', 'Resume Auto-Suggestions')
    const iconResume = getIcon('vscode-debug-start')
    const labelPause = localize('AWS.codewhisperer.pauseCodeWhispererNode.label', 'Pause Auto-Suggestions')
    const iconPause = getIcon('vscode-debug-pause')

    return {
        data: 'autoSuggestions',
        label: pause ? codicon`${iconPause} ${labelPause}` : codicon`${iconResume} ${labelResume}`,
        description: pause ? 'Currently RUNNING' : 'Currently PAUSED',
        onClick: () => toggleCodeSuggestions.execute(placeholder, cwQuickPickSource),
    } as DataQuickPickItem<'autoSuggestions'>
}

export function createOpenReferenceLog(): DataQuickPickItem<'openReferenceLog'> {
    const label = localize('AWS.codewhisperer.openReferenceLogNode.label', 'Open Code Reference Log')
    const icon = getIcon('vscode-code')

    return {
        data: 'openReferenceLog',
        label: codicon`${icon} ${label}`,
        onClick: () => showReferenceLog.execute(placeholder, cwQuickPickSource),
    } as DataQuickPickItem<'openReferenceLog'>
}

export function createSecurityScan(): DataQuickPickItem<'securityScan'> {
    const prefix = codeScanState.getPrefixTextForButton()
    const label = `${prefix} Security Scan`
    const icon = codeScanState.getIconForButton()

    return {
        data: 'securityScan',
        label: codicon`${icon} ${label}`,
        onClick: () => showSecurityScan.execute(placeholder, cwQuickPickSource),
    } as DataQuickPickItem<'securityScan'>
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

export function createLearnMore(): DataQuickPickItem<'learnMore'> {
    const label = localize('AWS.codewhisperer.learnMoreNode.label', 'Learn more about CodeWhisperer')
    const icon = getIcon('vscode-question')

    return {
        data: 'learnMore',
        label: codicon`${icon} ${label}`,
        onClick: () => showLearnMore.execute(cwQuickPickSource),
    } as DataQuickPickItem<'learnMore'>
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

export function createSelectCustomization(): DataQuickPickItem<'selectCustomization'> {
    const selectedCustomization = getSelectedCustomization()
    const newCustomizationsAmount = getNewCustomizationsAvailable()

    const label = localize('AWS.codewhisperer.selectCustomizationNode.label', 'Select Customization')
    const icon = getIcon('vscode-settings')
    const description =
        newCustomizationsAmount > 0 ? `${newCustomizationsAmount} new available` : `Using ${selectedCustomization.name}`

    return {
        data: 'selectCustomization',
        label: codicon`${icon} ${label}`,
        description: description,
        onClick: () => selectCustomizationPrompt.execute(placeholder, cwQuickPickSource),
    } as DataQuickPickItem<'selectCustomization'>
}

/* Opens the Learn CodeWhisperer Page */
export function createGettingStarted(): DataQuickPickItem<'gettingStarted'> {
    const label = localize('AWS.codewhisperer.gettingStartedNode.label', 'Learn about inline suggestions')
    const icon = getIcon('vscode-rocket')
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

export function createSignout(): DataQuickPickItem<'signout'> {
    const label = localize('AWS.codewhisperer.signoutNode.label', 'Sign Out')
    const icon = getIcon('vscode-export')
    const connection = AuthUtil.instance.isBuilderIdInUse() ? 'AWS Builder ID' : 'IAM Identity Center'

    return {
        data: 'signout',
        label: codicon`${icon} ${label}`,
        description: `Connected with ${connection}`,
        onClick: () => signoutCodeWhisperer.execute(placeholder, cwQuickPickSource),
    } as DataQuickPickItem<'signout'>
}

export function createSettingsNode(): DataQuickPickItem<'openCodeWhispererSettings'> {
    return {
        data: 'openCodeWhispererSettings',
        label: 'Open Settings',
        iconPath: getIcon('vscode-settings-gear'),
        onClick: () => Commands.tryExecute('aws.codeWhisperer.configure'),
    } as DataQuickPickItem<'openCodeWhispererSettings'>
}

export function createFeedbackNode(): DataQuickPickItem<'sendFeedback'> {
    return {
        data: 'sendFeedback',
        label: 'Send Feedback',
        iconPath: getIcon('vscode-thumbsup'),
        onClick: () => submitFeedback.execute(placeholder, 'CodeWhisperer'),
    } as DataQuickPickItem<'sendFeedback'>
}

export function createGitHubNode(): DataQuickPickItem<'visitGithub'> {
    return {
        data: 'visitGithub',
        label: 'Connect with us on Github',
        iconPath: getIcon('vscode-github-alt'),
        onClick: () => Commands.tryExecute('aws.github'),
    } as DataQuickPickItem<'visitGithub'>
}

/* Opens the AWS Docs for CodeWhisperer */
export function createDocumentationNode(): DataQuickPickItem<'viewDocumentation'> {
    return {
        data: 'viewDocumentation',
        label: 'View Documentation',
        iconPath: getIcon('vscode-symbol-ruler'),
        onClick: () => showIntroduction.execute(),
    } as DataQuickPickItem<'viewDocumentation'>
}

export function createSeparator(label?: string): DataQuickPickItem<'separator'> {
    return {
        kind: vscode.QuickPickItemKind.Separator,
        data: 'separator',
        label: label ?? '',
    }
}
