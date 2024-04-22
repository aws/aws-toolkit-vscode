/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    createAutoSuggestions,
    createOpenReferenceLog,
    createSecurityScan,
    createLearnMore,
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
    createAutoScans,
} from './codeWhispererNodes'
import { hasVendedIamCredentials } from '../../auth/auth'
import { AuthUtil } from '../util/authUtil'
import { DataQuickPickItem, createQuickPick } from '../../shared/ui/pickerPrompter'
import { CodeScansState, CodeSuggestionsState, vsCodeState } from '../models/model'
import { Commands } from '../../shared/vscode/commands2'
import { createExitButton } from '../../shared/ui/buttons'
import { telemetry } from '../../shared/telemetry/telemetry'
import { once } from '../../shared/utilities/functionUtils'
import { getLogger } from '../../shared/logger'
import { createSignIn, switchToAmazonQNode } from '../../amazonq/explorer/commonNodes'

function getAmazonQCodeWhispererNodes() {
    const autoTriggerEnabled = CodeSuggestionsState.instance.isSuggestionsEnabled()
    const autoScansEnabled = CodeScansState.instance.isScansEnabled()
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

    return [
        // CodeWhisperer
        createSeparator('Inline Suggestions'),
        createAutoSuggestions(autoTriggerEnabled),
        ...(AuthUtil.instance.isValidEnterpriseSsoInUse() && AuthUtil.instance.isCustomizationFeatureEnabled
            ? [createSelectCustomization()]
            : []),
        createOpenReferenceLog(),
        createGettingStarted(), // "Learn" node : opens Learn CodeWhisperer page

        // Security scans
        createSeparator('Security Scans'),
        createAutoScans(autoScansEnabled),
        createSecurityScan(),

        // Amazon Q + others
        createSeparator('Other Features'),
        switchToAmazonQNode('item'),
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

export const listCodeWhispererCommandsId = 'aws.amazonq.listCommands'
export const listCodeWhispererCommands = Commands.declare({ id: listCodeWhispererCommandsId }, () => () => {
    once(() => telemetry.ui_click.emit({ elementId: 'cw_statusBarMenu' }))()
    Commands.tryExecute('aws.amazonq.refreshAnnotation', true)
        .then()
        .catch(e => {
            getLogger().debug(
                `codewhisperer: running into error while executing command { refreshAnnotation } on user clicking statusbar: ${e}`
            )
        })
    return createQuickPick(getQuickPickItems(), {
        title: 'Amazon Q (Preview) + CodeWhisperer',
        buttons: [createExitButton()],
        ignoreFocusOut: false,
    }).prompt()
})

/**
 * Does what {@link listCodeWhispererCommands} does, must only be used by the walkthrough for telemetry
 * purposes.
 */
export const listCodeWhispererCommandsWalkthrough = Commands.declare(
    `_aws.amazonq.walkthrough.listCommands`,
    () => async () => {
        await listCodeWhispererCommands.execute()
    }
)
