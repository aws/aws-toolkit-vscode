/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode'
import { addColor, codicon, getIcon } from '../../shared/icons'
import { DataQuickPickItem } from '../../shared/ui/pickerPrompter'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Commands, placeholder } from '../../shared/vscode/commands2'
import {
    toggleCodeSuggestions,
    showReferenceLog,
    showSecurityScan,
    showLearnMore,
    showFreeTierLimit,
    reconnect,
    selectCustomizationPrompt,
    signoutCodeWhisperer,
    showIntroduction,
    toggleCodeScans,
    switchToAmazonQCommand,
    switchToAmazonQSignInCommand,
} from '../commands/basicCommands'
import { CodeWhispererCommandDeclarations } from '../commands/gettingStartedPageCommands'
import { CodeScansState, codeScanState } from '../models/model'
import { getNewCustomizationsAvailable, getSelectedCustomization } from '../util/customizationUtil'
import { cwQuickPickSource } from '../commands/types'
import { AuthUtil } from '../util/authUtil'
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

export function createAutoScans(pause: boolean): DataQuickPickItem<'autoScans'> {
    const labelResume = localize('AWS.codewhisperer.resumeCodeWhispererNode.label', 'Resume Auto-Scans')
    const iconResume = getIcon('vscode-debug-alt')
    const labelPause = localize('AWS.codewhisperer.pauseCodeWhispererNode.label', 'Pause Auto-Scans')
    const iconPause = getIcon('vscode-debug-pause')
    const monthlyQuotaExceeded = CodeScansState.instance.isMonthlyQuotaExceeded()

    return {
        data: 'autoScans',
        label: pause ? codicon`${iconPause} ${labelPause}` : codicon`${iconResume} ${labelResume}`,
        description: monthlyQuotaExceeded ? 'Monthly quota exceeded' : pause ? 'RUNNING' : 'PAUSED',
        onClick: () => toggleCodeScans.execute(placeholder, cwQuickPickSource),
    } as DataQuickPickItem<'autoScans'>
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
    const label = `${prefix} Project Scan`
    const icon = codeScanState.getIconForButton()

    return {
        data: 'securityScan',
        label: codicon`${icon} ${label}`,
        onClick: () => showSecurityScan.execute(placeholder, cwQuickPickSource),
    } as DataQuickPickItem<'securityScan'>
}

export function createReconnect(): DataQuickPickItem<'reconnect'> {
    const label = localize('aws.amazonq.reconnectNode.label', 'Re-authenticate to connect')
    const icon = addColor(getIcon('vscode-debug-disconnect'), 'notificationsErrorIcon.foreground')

    return {
        data: 'reconnect',
        label: codicon`${icon} ${label}`,
        onClick: () => reconnect.execute(placeholder, cwQuickPickSource),
    }
}

export function createLearnMore(): DataQuickPickItem<'learnMore'> {
    const label = localize('AWS.codewhisperer.learnMoreNode.label', 'Learn more about Amazon Q')
    const icon = getIcon('vscode-question')

    return {
        data: 'learnMore',
        label: codicon`${icon} ${label}`,
        onClick: () => showLearnMore.execute(cwQuickPickSource),
    } as DataQuickPickItem<'learnMore'>
}

export function createFreeTierLimitMet(): DataQuickPickItem<'freeTierLimitMet'> {
    const label = localize('AWS.codewhisperer.freeTierLimitMetNode.label', 'Free Tier Limit Met')
    const icon = getIcon('vscode-error')

    return {
        data: 'freeTierLimitMet',
        label: codicon`${icon} ${label}`,
        onClick: () => showFreeTierLimit.execute(placeholder, cwQuickPickSource),
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
    const label = localize('AWS.codewhisperer.gettingStartedNode.label', 'Try inline suggestion examples')
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
        onClick: () => Commands.tryExecute('aws.amazonq.configure'),
    } as DataQuickPickItem<'openCodeWhispererSettings'>
}

export function createFeedbackNode(): DataQuickPickItem<'sendFeedback'> {
    return {
        data: 'sendFeedback',
        label: 'Send Feedback',
        iconPath: getIcon('vscode-thumbsup'),
        onClick: () => submitFeedback(placeholder, 'CodeWhisperer'),
    } as DataQuickPickItem<'sendFeedback'>
}

export function createGitHubNode(): DataQuickPickItem<'visitGithub'> {
    return {
        data: 'visitGithub',
        label: 'Connect with us on Github',
        iconPath: getIcon('vscode-github-alt'),
        onClick: () => Commands.tryExecute('aws.amazonq.github'),
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

export function createSeparator(label: string = ''): DataQuickPickItem<'separator'> {
    return {
        kind: vscode.QuickPickItemKind.Separator,
        data: 'separator',
        label,
    }
}

export function switchToAmazonQNode(): DataQuickPickItem<'openChatPanel'> {
    return {
        data: 'openChatPanel',
        label: 'Open Chat Panel',
        iconPath: getIcon('vscode-comment'),
        onClick: () => switchToAmazonQCommand.execute('codewhispererQuickPick'),
    }
}

export function createSignIn(): DataQuickPickItem<'signIn'> {
    const label = localize('AWS.codewhisperer.signInNode.label', 'Sign in to get started')
    const icon = getIcon('vscode-account')

    return {
        data: 'signIn',
        label: codicon`${icon} ${label}`,
        onClick: () => switchToAmazonQSignInCommand.execute('codewhispererQuickPick'),
    }
}
