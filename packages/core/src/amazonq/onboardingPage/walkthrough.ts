/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { focusAmazonQPanel } from '../../codewhispererChat/commands/registerCommands'
import globals, { isWeb } from '../../shared/extensionGlobals'
import { VSCODE_EXTENSION_ID } from '../../shared/extensions'
import { getLogger } from '../../shared/logger/logger'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Commands, placeholder } from '../../shared/vscode/commands2'
import vscode from 'vscode'

/**
 * Show the Amazon Q walkthrough one time forever when the user adds an Amazon Q connection.
 * All subsequent calls to this do nothing.
 */
export async function showAmazonQWalkthroughOnce(showWalkthrough = () => openAmazonQWalkthrough.execute()) {
    const hasShownWalkthrough = globals.globalState.tryGet('aws.amazonq.hasShownWalkthrough', Boolean, false)
    if (hasShownWalkthrough) {
        return
    }

    if (isWeb()) {
        getLogger().debug(`amazonq: Not showing walkthrough since we are in web mode`)
        return
    }

    await globals.globalState.update('aws.amazonq.hasShownWalkthrough', true)
    await showWalkthrough()
}

/**
 * Opens the Amazon Q Walkthrough.
 * We wrap the actual command so that we can get telemetry from it.
 */
export const openAmazonQWalkthrough = Commands.declare(`aws.amazonq.walkthrough.show`, () => async () => {
    await vscode.commands.executeCommand(
        'workbench.action.openWalkthrough',
        `${VSCODE_EXTENSION_ID.amazonq}#aws.amazonq.walkthrough`
    )
})

/** For use by the walkthrough page only. We need this for telemetry. */
export const focusAmazonQChatWalkthrough = Commands.declare('_aws.amazonq.walkthrough.focusChat', () => async () => {
    await focusAmazonQPanel.execute(placeholder, 'walkthrough')
})

export const walkthroughInlineSuggestionsExample = Commands.declare(
    `_aws.amazonq.walkthrough.inlineSuggestionsExample`,
    () => async () => {
        const fileName = 'AmazonQ_generate_suggestion.py'
        const fileContents = `# TODO: place your cursor at the end of line 6 and press Enter to generate a suggestion.
# Tip: press tab to accept the suggestion

fake_users = [
    { "name": "User 1", "id": "user1", "city": "San Francisco", "state": "CA" },
]`

        const uri = vscode.Uri.parse(`untitled:${fileName}`)
        const document = await vscode.workspace.openTextDocument(uri)
        const editor = await vscode.window.showTextDocument(document)

        await editor.edit((editBuilder) => {
            editBuilder.insert(new vscode.Position(0, 0), fileContents)
        })
    }
)

export const walkthroughSecurityScanExample = Commands.declare(
    `_aws.amazonq.walkthrough.securityScanExample`,
    () => async () => {
        const filterText = localize('AWS.command.amazonq.security.scan', 'Run Project Review')
        void vscode.commands.executeCommand('workbench.action.quickOpen', `> ${filterText}`)
    }
)
