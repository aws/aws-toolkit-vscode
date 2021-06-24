/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { waitUntil } from '../shared/utilities/timeoutUtils'
import * as vscode from 'vscode'

const SECOND = 1000
export const TIMEOUT = 30 * SECOND

export async function sleep(miliseconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, miliseconds))
}

// Retrieves CodeLenses from VS Code
export async function getCodeLenses(uri: vscode.Uri): Promise<vscode.CodeLens[] | undefined> {
    return vscode.commands.executeCommand('vscode.executeCodeLensProvider', uri)
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
    await configAws.update('samcli.lambda.timeout', 90000, false)
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

export async function getAddConfigCodeLens(
    documentUri: vscode.Uri,
    timeout: number,
    retryInterval: number
): Promise<vscode.CodeLens[] | undefined> {
    return waitUntil(
        async () => {
            try {
                let codeLenses = await getCodeLenses(documentUri)
                if (!codeLenses || codeLenses.length === 0) {
                    return undefined
                }

                // omnisharp spits out some undefined code lenses for some reason, we filter them because they are
                // not shown to the user and do not affect how our extension is working
                codeLenses = codeLenses.filter(codeLens => {
                    if (codeLens.command && codeLens.command.arguments && codeLens.command.arguments.length === 3) {
                        return codeLens.command.command === 'aws.pickAddSamDebugConfiguration'
                    }

                    return false
                })

                if (codeLenses.length > 0) {
                    return codeLenses || []
                }
            } catch (e) {
                console.log(`sam.test.ts: getAddConfigCodeLens() on "${documentUri.fsPath}" failed, retrying:\n${e}`)
            }

            return undefined
        },
        { timeout: timeout, interval: retryInterval, truthy: false }
    )
}
