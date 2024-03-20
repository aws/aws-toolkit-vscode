/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    createAutoSuggestions,
    createOpenReferenceLog,
    createSecurityScan,
    createLearnMore,
    createSignIn,
    createFreeTierLimitMet,
    createSelectCustomization,
    createReconnect,
    createGettingStarted,
    createSignout,
    createSeparator,
    createSettingsNode,
    createFeedbackNode,
    createGitHubNode,
    createDocumentationNode,
} from './codeWhispererNodes'
import { hasVendedIamCredentials } from '../../auth/auth'
import { AuthUtil } from '../util/authUtil'
import { DataQuickPickItem, createQuickPick } from '../../shared/ui/pickerPrompter'
import { CodeSuggestionsState, vsCodeState } from '../models/model'
import { Commands } from '../../shared/vscode/commands2'
import { createExitButton } from '../../shared/ui/buttons'
import { isWeb } from '../../common/webUtils'
import { telemetry } from '../../shared/telemetry/telemetry'
import { once } from '../../shared/utilities/functionUtils'
import { Container } from '../service/serviceContainer'

function getAmazonQCodeWhispererNodes() {
    const autoTriggerEnabled = CodeSuggestionsState.instance.isSuggestionsEnabled()
    if (AuthUtil.instance.isConnectionExpired()) {
        return [createReconnect('item'), createLearnMore()]
    }

    if (!AuthUtil.instance.isConnected()) {
        return [createSignIn('item'), createLearnMore()]
    }

    if (vsCodeState.isFreeTierLimitReached) {
        if (hasVendedIamCredentials()) {
            return [createFreeTierLimitMet('item'), createOpenReferenceLog()]
        }
        return [
            createFreeTierLimitMet('item'),
            createOpenReferenceLog(),
            createSeparator('Other Features'),
            createSecurityScan(),
        ]
    }

    if (hasVendedIamCredentials()) {
        return [createAutoSuggestions(autoTriggerEnabled), createOpenReferenceLog()]
    }

    // TODO: Remove when web is supported for amazonq
    let amazonq
    if (!isWeb()) {
        amazonq = require('../../amazonq/explorer/amazonQChildrenNodes')
    }

    return [
        // CodeWhisperer
        createSeparator('Inline Suggestions'),
        createAutoSuggestions(autoTriggerEnabled),
        ...(AuthUtil.instance.isValidEnterpriseSsoInUse() && AuthUtil.instance.isCustomizationFeatureEnabled
            ? [createSelectCustomization()]
            : []),
        createOpenReferenceLog(),
        createGettingStarted(), // "Learn" node : opens Learn CodeWhisperer page

        // Amazon Q + others
        createSeparator('Other Features'),
        ...(amazonq ? [amazonq.switchToAmazonQNode('item')] : []),
        createSecurityScan(),
    ]
}

export function getQuickPickItems(): DataQuickPickItem<string>[] {
    const children = [
        ...getAmazonQCodeWhispererNodes(),

        // Generic Nodes
        createSeparator('Connect / Help'),
        createFeedbackNode(),
        createGitHubNode(),
        createDocumentationNode(),

        // Add settings and signout
        createSeparator(),
        createSettingsNode(),
        ...(AuthUtil.instance.isConnected() && !hasVendedIamCredentials() ? [createSignout()] : []),
    ]

    return children
}

export const listCodeWhispererCommandsId = 'aws.codewhisperer.listCommands'
export const listCodeWhispererCommands = Commands.declare(
    { id: listCodeWhispererCommandsId },
    (container: Container) => async () => {
        once(() => telemetry.ui_click.emit({ elementId: 'cw_statusBarMenu' }))()
        await container.lineAnnotationController.clickStatusBar()
        return createQuickPick(getQuickPickItems(), {
            title: 'Amazon Q (Preview) + CodeWhisperer',
            buttons: [createExitButton()],
            ignoreFocusOut: false,
        }).prompt()
    }
)
