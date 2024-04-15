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
    createAutoScans,
} from './codeWhispererNodes'
import { hasVendedIamCredentials } from '../../auth/auth'
import { AuthUtil } from '../util/authUtil'
import { DataQuickPickItem, createQuickPick } from '../../shared/ui/pickerPrompter'
import { CodeScansState, CodeSuggestionsState, vsCodeState } from '../models/model'
import { Commands } from '../../shared/vscode/commands2'
import { createExitButton } from '../../shared/ui/buttons'
import { isWeb } from '../../common/webUtils'
import { telemetry } from '../../shared/telemetry/telemetry'
import { once } from '../../shared/utilities/functionUtils'
import { getLogger } from '../../shared/logger'

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

    // TODO: Remove when web is supported for amazonq
    let amazonq
    if (!isWeb()) {
        amazonq = require('../../amazonq/explorer/amazonQChildrenNodes')
    }

    if (AuthUtil.instance.isBuilderIdInUse()) {
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
            createSecurityScan(),
    
            // Amazon Q + others
            createSeparator('Other Features'),
            ...(amazonq ? [amazonq.switchToAmazonQNode('item')] : []),
        ]
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
        ...(amazonq ? [amazonq.switchToAmazonQNode('item')] : []),
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
export const listCodeWhispererCommands = Commands.declare({ id: listCodeWhispererCommandsId }, () => () => {
    once(() => telemetry.ui_click.emit({ elementId: 'cw_statusBarMenu' }))()
    Commands.tryExecute('aws.codewhisperer.refreshAnnotation', true)
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
