/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

/**
 * Context keys used by the extension.
 *
 * New keys must start with "aws." or "amazonq.".
 */
export type contextKey =
    | 'aws.isDevMode'
    | 'aws.isSageMaker'
    | 'aws.isSageMakerUnifiedStudio'
    | 'aws.isWebExtHost'
    | 'aws.isInternalUser'
    | 'aws.amazonq.showLoginView'
    | 'aws.amazonq.security.noMatches'
    | 'aws.amazonq.notifications.show'
    | 'aws.amazonq.connectedSsoIdc'
    | 'aws.codecatalyst.connected'
    | 'aws.codewhisperer.connected'
    | 'aws.codewhisperer.connectionExpired'
    | 'aws.codewhisperer.tutorial.workInProgress'
    | 'aws.explorer.showAuthView'
    | 'aws.toolkit.amazonq.dismissed'
    | 'aws.toolkit.amazonqInstall.dismissed'
    | 'aws.stepFunctions.isWorkflowStudioFocused'
    | 'aws.toolkit.notifications.show'
    // Deprecated/legacy names. New keys should start with "aws.".
    | 'codewhisperer.activeLine'
    | 'gumby.isPlanAvailable'
    | 'gumby.isStopButtonAvailable'
    | 'gumby.isSummaryAvailable'
    | 'gumby.reviewState'
    | 'gumby.transformationProposalReviewInProgress'
    | 'gumby.wasQCodeTransformationUsed'
    | 'amazonq.inline.codelensShortcutEnabled'
    | 'aws.toolkit.lambda.walkthroughSelected'

const contextMap: Partial<Record<contextKey, any>> = {}

/**
 * Calls the vscode "setContext" command.
 *
 * This wrapper adds structure and traceability to the vscode "setContext". It also opens the door
 * for validation.
 *
 * Use "setContext" only as a last resort, to set flags that are detectable in package.json
 * declarations. Do not use it as a general way to store global state (which should be avoided
 * anyway).
 *
 * Warning: vscode context keys/values are NOT isolated to individual extensions. Other extensions
 * can read and modify them. See also https://github.com/microsoft/vscode/issues/10471
 */
export async function setContext(key: contextKey, val: any): Promise<void> {
    // eslint-disable-next-line aws-toolkits/no-banned-usages
    await vscode.commands.executeCommand('setContext', key, val)
    contextMap[key] = val
}

/**
 * Returns the value of a context key set via {@link setContext} wrapper for this session.
 *
 * Warning: this does not guarantee the state of the context key in vscode because it may have
 * been set via `vscode.commands.executeCommand('setContext')`. It has no connection the
 * context keys stored in vscode itself because an API for this is not exposed.
 */
export function getContext(key: contextKey): any {
    return contextMap[key]
}
