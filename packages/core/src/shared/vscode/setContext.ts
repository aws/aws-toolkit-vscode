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
type contextKey =
    | 'aws.isDevMode'
    | 'aws.isSageMaker'
    | 'aws.isWebExtHost'
    | 'aws.isInternalUser'
    | 'aws.amazonq.showLoginView'
    | 'aws.codecatalyst.connected'
    | 'aws.codewhisperer.connected'
    | 'aws.codewhisperer.connectionExpired'
    | 'aws.codewhisperer.tutorial.workInProgress'
    | 'aws.explorer.showAuthView'
    | 'aws.toolkit.amazonq.dismissed'
    | 'aws.toolkit.amazonqInstall.dismissed'
    // Deprecated/legacy names. New keys should start with "aws.".
    | 'codewhisperer.activeLine'
    | 'gumby.isPlanAvailable'
    | 'gumby.isStopButtonAvailable'
    | 'gumby.isSummaryAvailable'
    | 'gumby.reviewState'
    | 'gumby.transformationProposalReviewInProgress'
    | 'gumby.wasQCodeTransformationUsed'

/**
 * Calls the vscode "setContext" command.
 *
 * This wrapper adds structure and traceability to the vscode "setContext". It also opens the door
 * for:
 * - validation
 * - getContext() (see also https://github.com/microsoft/vscode/issues/10471)
 *
 * Use "setContext" only as a last resort, to set flags that are detectable in package.json
 * declarations. Do not use it as a general way to store global state (which should be avoided
 * anyway).
 */
export async function setContext(key: contextKey, val: any): Promise<void> {
    // eslint-disable-next-line aws-toolkits/no-banned-usages
    await vscode.commands.executeCommand('setContext', key, val)
}
