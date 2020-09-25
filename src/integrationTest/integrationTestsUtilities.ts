/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'

const SECOND = 1000
export const TIMEOUT = 30 * SECOND

export async function activateExtension(extensionId: string): Promise<vscode.Extension<void>> {
    console.log(`PID=${process.pid} activateExtension request: ${extensionId}`)
    const extension: vscode.Extension<void> | undefined = vscode.extensions.getExtension(extensionId)

    if (!extension) {
        throw new Error(`Extension not found: ${extensionId}`)
    }

    if (!extension.isActive) {
        console.log(`PID=${process.pid} Activating extension: ${extensionId}`)
        await extension.activate()
    } else {
        console.log(`PID=${process.pid} Extension is already active: ${extensionId}`)
    }

    return extension
}

export async function sleep(miliseconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, miliseconds))
}

// Retrieves CodeLenses from VS Code
export async function getCodeLenses(uri: vscode.Uri): Promise<vscode.CodeLens[] | undefined> {
    return vscode.commands.executeCommand('vscode.executeCodeLensProvider', uri)
}

// Retrieves CodeLenses and asserts that undefined is not returned.
// Convenience wrapper around the linter too.
export async function expectCodeLenses(uri: vscode.Uri): Promise<vscode.CodeLens[]> {
    const codeLenses = await getCodeLenses(uri)

    assert.ok(codeLenses, 'Did not expect undefined when requesting CodeLenses')

    return codeLenses! // appease the linter
}

export function getTestWorkspaceFolder(): string {
    assert.ok(vscode.workspace.workspaceFolders, 'Integration Tests expect a workspace folder to be loaded')
    assert.strictEqual(
        vscode.workspace.workspaceFolders!.length,
        1,
        'Integration Tests expect only one workspace folder to be loaded'
    )

    return vscode.workspace.workspaceFolders![0].uri.fsPath
}
