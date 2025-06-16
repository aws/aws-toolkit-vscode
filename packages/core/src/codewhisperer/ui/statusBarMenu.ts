/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    createAutoSuggestions,
    createOpenReferenceLog,
    createLearnMore,
    createFreeTierLimitMet,
    createSelectCustomization,
    createReconnect,
    createGettingStarted,
    createManageSubscription,
    createSignout,
    createSeparator,
    createSettingsNode,
    createFeedbackNode,
    createGitHubNode,
    createDocumentationNode,
    createAutoScans,
    createSignIn,
    switchToAmazonQNode,
    createSecurityScan,
    createSelectRegionProfileNode,
} from './codeWhispererNodes'
import { hasVendedIamCredentials, hasVendedCredentialsFromMetadata } from '../../auth/auth'
import { AuthUtil } from '../util/authUtil'
import { DataQuickPickItem, createQuickPick } from '../../shared/ui/pickerPrompter'
import { CodeScansState, CodeSuggestionsState, vsCodeState } from '../models/model'
import { Commands } from '../../shared/vscode/commands2'
import { createExitButton } from '../../shared/ui/buttons'
import { telemetry } from '../../shared/telemetry/telemetry'
import { getLogger } from '../../shared/logger/logger'

function getAmazonQCodeWhispererNodes() {
    const autoTriggerEnabled = CodeSuggestionsState.instance.isSuggestionsEnabled()
    const autoScansEnabled = CodeScansState.instance.isScansEnabled()
    if (AuthUtil.instance.isConnectionExpired()) {
        return [createReconnect(), createLearnMore()]
    }

    if (!AuthUtil.instance.isConnected()) {
        return [createSignIn(), createLearnMore()]
    }

    if (AuthUtil.instance.isConnected() && AuthUtil.instance.requireProfileSelection()) {
        return []
    }

    if (vsCodeState.isFreeTierLimitReached) {
        if (hasVendedIamCredentials()) {
            return [createFreeTierLimitMet(), createOpenReferenceLog()]
        }
        return [
            createFreeTierLimitMet(),
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
        createOpenReferenceLog(),
        createGettingStarted(), // "Learn" node : opens Learn CodeWhisperer page

        // Security scans
        createSeparator('Code Reviews'),
        ...(AuthUtil.instance.isBuilderIdInUse() ? [] : [createAutoScans(autoScansEnabled)]),
        createSecurityScan(),

        // Amazon Q + others
        createSeparator('Other Features'),
        ...(AuthUtil.instance.isValidEnterpriseSsoInUse() && AuthUtil.instance.isCustomizationFeatureEnabled
            ? [createSelectCustomization()]
            : []),
        switchToAmazonQNode(),
    ]
}

export function getQuickPickItems(): DataQuickPickItem<string>[] {
    const isUsingEnterpriseSso = AuthUtil.instance.isValidEnterpriseSsoInUse()
    const regionProfile = AuthUtil.instance.regionProfileManager.activeRegionProfile

    const children = [
        // If the user has signed in but not selected a region, we strongly indicate they need to select
        // a profile, otherwise features will not work.
        ...(isUsingEnterpriseSso && !regionProfile ? [createSelectRegionProfileNode(undefined)] : []),

        ...getAmazonQCodeWhispererNodes(),

        // Generic Nodes
        createSeparator('Connect / Help'),
        createFeedbackNode(),
        createGitHubNode(),
        createDocumentationNode(),

        // Add settings and signout
        createSeparator(),
        createSettingsNode(),
        ...(isUsingEnterpriseSso && regionProfile ? [createSelectRegionProfileNode(regionProfile)] : []),
        ...(AuthUtil.instance.isConnected() && !hasVendedIamCredentials() && !hasVendedCredentialsFromMetadata()
            ? [...(AuthUtil.instance.isBuilderIdInUse() ? [createManageSubscription()] : []), createSignout()]
            : []),
    ]

    return children
}

export const listCodeWhispererCommandsId = 'aws.amazonq.listCommands'
export const listCodeWhispererCommands = Commands.declare({ id: listCodeWhispererCommandsId }, () => () => {
    telemetry.ui_click.emit({ elementId: 'cw_statusBarMenu' })
    Commands.tryExecute('aws.amazonq.refreshAnnotation', true)
        .then()
        .catch((e) => {
            getLogger().debug(
                `codewhisperer: running into error while executing command { refreshAnnotation } on user clicking statusbar: ${e}`
            )
        })
    return createQuickPick(getQuickPickItems(), {
        title: 'Amazon Q',
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
