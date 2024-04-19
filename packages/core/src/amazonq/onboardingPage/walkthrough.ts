/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../../shared/extensionGlobals'
import { VSCODE_EXTENSION_ID } from '../../shared/extensions'
import { Commands } from '../../shared/vscode/commands2'
import vscode from 'vscode'

/**
 * Show the Amazon Q walkthrough one time forever when the user adds an Amazon Q connection.
 * All subsequent calls to this do nothing.
 */
export async function showAmazonQWalkthroughOnce(
    state = globals.context.globalState,
    showWalkthrough = () => openAmazonQWalkthrough.execute()
) {
    const hasShownWalkthroughId = 'aws.amazonq.hasShownWalkthrough'
    const hasShownWalkthrough = state.get(hasShownWalkthroughId, false)
    if (hasShownWalkthrough) {
        return
    }
    await state.update(hasShownWalkthroughId, true)
    await showWalkthrough()
}

/**
 * Opens the Amazon Q Walkthrough.
 * We wrap the actual command so that we can get telemetry from it.
 */
export const openAmazonQWalkthrough = Commands.declare(`_aws.amazonq.walkthrough.show`, () => async () => {
    await vscode.commands.executeCommand(
        'workbench.action.openWalkthrough',
        `${VSCODE_EXTENSION_ID.amazonq}#aws.amazonq.walkthrough`
    )
})
