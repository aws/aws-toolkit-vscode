/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthUtil } from 'aws-core-vscode/codewhisperer'
import { Commands, fs, globals, LanguageServerResolver } from 'aws-core-vscode/shared'
import vscode from 'vscode'

/**
 * The purpose of this module is to provide a util to clear all extension cache so that it has a clean state
 */

/**
 * Clears "all" cache of the extension, effectively putting the user in a "net new" state.
 *
 * NOTE: This is a best attempt. There may be state like a file in the filesystem which is not deleted.
 *       We should aim to add all state clearing in to this method.
 */
async function clearCache() {
    // Check a final time if they want to clear their cache
    const doContinue = await vscode.window
        .showInformationMessage(
            'This will wipe your Amazon Q extension state, then reload your VS Code window. This operation is not dangerous. ',
            { modal: true },
            'Continue'
        )
        .then((value) => {
            return value === 'Continue'
        })
    if (!doContinue) {
        return
    }

    // SSO cache persists on disk, this should indirectly delete it
    const conn = AuthUtil.instance.conn
    if (conn) {
        await AuthUtil.instance.auth.deleteConnection(conn)
    }

    await globals.globalState.clear()

    // Clear the Language Server Cache
    await fs.delete(LanguageServerResolver.defaultDir(), { recursive: true, force: true })

    // Make the IDE reload so all new changes take effect
    void vscode.commands.executeCommand('workbench.action.reloadWindow')
}
export const clearCacheDeclaration = Commands.declare({ id: 'aws.amazonq.clearCache' }, () => clearCache)
