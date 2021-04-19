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

export async function configureAwsToolkitExtension(): Promise<void> {
    const configAws = vscode.workspace.getConfiguration('aws')
    // Prevent the extension from preemptively cancelling a 'sam local' run
    await configAws.update('samcli.debug.attach.timeout.millis', 90000, false)
}

export async function configurePythonExtension(): Promise<void> {
    const configPy = vscode.workspace.getConfiguration('python')
    // Disable linting to silence some of the Python extension's log spam
    await configPy.update('linting.pylintEnabled', false, false)
    await configPy.update('linting.enabled', false, false)
    await configPy.update('analysis.logLevel', 'Error')
}

// Installs tools that the Go extension wants (it complains a lot if we don't)
// Had to dig around for the commands used by the Go extension.
// Ref: https://github.com/golang/vscode-go/blob/0058bd16ba31394f98aa3396056998e4808998a7/src/goTools.ts#L211
export async function configureGoExtension(): Promise<void> {
    console.log('Setting up Go...')

    const gopls = {
        name: 'gopls',
        importPath: 'golang.org/x/tools/gopls',
        replacedByGopls: false,
        isImportant: true,
        description: 'Language Server from Google',
        minimumGoVersion: '1.12',
        latestVersion: '0.6.4',
        latestVersionTimestamp: '2021-01-19',
        latestPrereleaseVersion: '0.6.4',
        latestPrereleaseVersionTimestamp: '2021-01-19',
    }

    const dlv = {
        name: 'dlv',
        importPath: 'github.com/go-delve/delve/cmd/dlv',
        modulePath: 'github.com/go-delve/delve',
        replacedByGopls: false,
        isImportant: true,
        description: 'Debugging',
    }

    await vscode.commands.executeCommand('go.tools.install', [gopls, dlv])
}
