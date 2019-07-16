/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { TIMEOUT } from './integrationTestsUtilities'

describe('SAM', async () => {
    it('Creates a NodeJs SAM app', async () => {
        const extension = vscode.extensions.getExtension('amazonwebservices.aws-toolkit-vscode')
        assert.ok(extension)
        await extension!.activate()
        const workspaceFolders = vscode.workspace.workspaceFolders
        assert.ok(workspaceFolders)
        const codeLensesPromise = await vscode.commands.executeCommand('vscode.executeCodeLensProvider', document.uri)
    }).timeout(TIMEOUT)
})
