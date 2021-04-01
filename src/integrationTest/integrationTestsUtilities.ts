/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import * as fs from 'fs'

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

// Install gopls, need to force GPROXY=direct for it to work properly.
// Had to dig around for the commands used by the Go extension.
// Ref: https://github.com/golang/vscode-go/blob/0058bd16ba31394f98aa3396056998e4808998a7/src/goMain.ts#L408-L417
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

    // Force it
    process.env['GOPROXY'] = 'direct'

    await vscode.commands.executeCommand('go.tools.install', [gopls])
}

/**
 * Inserts data into a file.
 * Very slow for large files so don't use it for that purpose.
 *
 * @param filePath Path to the file to write to
 * @param data Data that will be inserted
 * @param line Optional line number to use (0 indexed)
 */
export async function insertDataInFile(data: string, filePath: string, line: number = 0) {
    const oldData: Buffer = fs.readFileSync(filePath)
    const lines: string[] = oldData.toString().split(/\r?\n/)
    lines.splice(line, 0, data)

    const newData: Buffer = Buffer.from(lines.join('\n'))
    const fd: number = fs.openSync(filePath, 'w+')

    fs.writeSync(fd, newData, 0, newData.length, 0)

    fs.close(fd, err => {
        if (err) {
            throw err
        }
    })
}
