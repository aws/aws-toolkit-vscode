/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { dirname, join } from 'path'
import * as vscode from 'vscode'
import { getAddConfigCodeLens, getTestWorkspaceFolder } from './integrationTestsUtilities'
import { AddSamDebugConfigurationInput } from '../shared/sam/debugger/commands/addSamDebugConfiguration'
import * as testUtils from './integrationTestsUtilities'

const activateExtensionTimeoutMillis = 30000
const codelensTestTimeoutMillis = 10000
const codelensRetryInterval = 1000

const workspaceFolder = getTestWorkspaceFolder()

describe('SAM Local CodeLenses (JS)', async function () {
    // TODO : Extend this test suite out to work for different projects with different file configurations
    before(async function () {
        this.timeout(activateExtensionTimeoutMillis)
        await testUtils.configureAwsToolkitExtension()
    })

    it('appear when manifest in subfolder and app is beside manifest', async function () {
        const appRoot = join(workspaceFolder, 'js-plain-sam-app')
        const appCodePath = join(appRoot, 'src', 'app.js')
        const expectedHandlerName = 'app.handlerBesidePackageJson'
        const document = await vscode.workspace.openTextDocument(appCodePath)

        const codeLenses = await getAddConfigCodeLens(document.uri, codelensTestTimeoutMillis, codelensRetryInterval)

        assertAddDebugConfigCodeLensExists(codeLenses, expectedHandlerName, dirname(appCodePath))
    }).timeout(codelensTestTimeoutMillis)

    it('appear when manifest in root', async function () {
        const appRoot = join(workspaceFolder, 'js-manifest-in-root')
        const appCodePath = join(appRoot, 'src', 'subfolder', 'app.js')
        const expectedHandlerName = 'src/subfolder/app.handlerTwoFoldersDeep'
        const document = await vscode.workspace.openTextDocument(appCodePath)

        const codeLenses = await getAddConfigCodeLens(document.uri, codelensTestTimeoutMillis, codelensRetryInterval)

        assertAddDebugConfigCodeLensExists(codeLenses, expectedHandlerName, join(dirname(appCodePath), '..', '..'))
    }).timeout(codelensTestTimeoutMillis)

    it('appear when manifest in subfolder and app in subfolder to manifest', async function () {
        const appRoot = join(workspaceFolder, 'js-manifest-in-subfolder')
        const appCodePath = join(appRoot, 'src', 'subfolder', 'app.js')
        const expectedHandlerName = 'subfolder/app.handlerInManifestSubfolder'
        const document = await vscode.workspace.openTextDocument(appCodePath)

        const codeLenses = await getAddConfigCodeLens(document.uri, codelensTestTimeoutMillis, codelensRetryInterval)

        assertAddDebugConfigCodeLensExists(codeLenses, expectedHandlerName, join(dirname(appCodePath), '..'))
    }).timeout(codelensTestTimeoutMillis)

    it('appear when project is a few folders deep in the workspace', async function () {
        const appRoot = join(workspaceFolder, 'deeper-projects', 'js-plain-sam-app')
        const appCodePath = join(appRoot, 'src', 'app.js')
        const expectedHandlerName = 'app.projectDeepInWorkspace'
        const document = await vscode.workspace.openTextDocument(appCodePath)

        const codeLenses = await getAddConfigCodeLens(document.uri, codelensTestTimeoutMillis, codelensRetryInterval)

        assertAddDebugConfigCodeLensExists(codeLenses, expectedHandlerName, dirname(appCodePath))
    })

    function assertAddDebugConfigCodeLensExists(
        codeLenses: vscode.CodeLens[] | undefined,
        expectedHandlerName: string,
        manifestPath: string
    ) {
        assert.ok(codeLenses !== undefined, 'Did not expect undefined when requesting CodeLenses')

        const debugCodeLenses = getLocalInvokeCodeLenses(codeLenses).filter(codeLens =>
            hasLocalInvokeArguments(codeLens, expectedHandlerName, manifestPath)
        )

        assert.strictEqual(debugCodeLenses.length, 2, 'Add Debug Config CodeLenses were not found')
    }

    function getLocalInvokeCodeLenses(codeLenses: vscode.CodeLens[]): vscode.CodeLens[] {
        return codeLenses.filter(
            codeLens =>
                codeLens.command &&
                codeLens.command.command === 'aws.pickAddSamDebugConfiguration' &&
                codeLens.command.arguments &&
                codeLens.command.arguments.length === 3
        )
    }

    function hasLocalInvokeArguments(codeLens: vscode.CodeLens, handlerName: string, manifestPath: string): boolean {
        if (!codeLens.command || !codeLens.command.arguments || codeLens.command.arguments.length !== 3) {
            return false
        }

        const commandArguments = codeLens.command.arguments[0] as AddSamDebugConfigurationInput

        return (
            commandArguments.resourceName === handlerName && dirname(commandArguments.rootUri.fsPath) === manifestPath
        )
    }
})
