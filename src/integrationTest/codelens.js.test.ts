/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { dirname, join } from 'path'
import * as vscode from 'vscode'
import { expectCodeLenses, getTestWorkspaceFolder } from './integrationTestsUtilities'
import { AddSamDebugConfigurationInput } from '../shared/sam/debugger/commands/addSamDebugConfiguration'

const ACTIVATE_EXTENSION_TIMEOUT_MILLIS = 30000
const CODELENS_TEST_TIMEOUT_MILLIS = 10000

const workspaceFolder = getTestWorkspaceFolder()

describe('SAM Local CodeLenses (JS)', async () => {
    // TODO : Extend this test suite out to work for different projects with different file configurations
    before(async function() {
        // tslint:disable-next-line:no-invalid-this
        this.timeout(ACTIVATE_EXTENSION_TIMEOUT_MILLIS)
    })

    it('appear when manifest in subfolder and app is beside manifest', async () => {
        const appRoot = join(workspaceFolder, 'js-plain-sam-app')
        const appCodePath = join(appRoot, 'src', 'app.js')
        const expectedHandlerName = 'app.handlerBesidePackageJson'
        const document = await vscode.workspace.openTextDocument(appCodePath)

        const codeLenses = await expectCodeLenses(document.uri)

        assertAddDebugConfigCodeLensExists(codeLenses, expectedHandlerName, dirname(appCodePath))
    }).timeout(CODELENS_TEST_TIMEOUT_MILLIS)

    it('appear when manifest in root', async () => {
        const appRoot = join(workspaceFolder, 'js-manifest-in-root')
        const appCodePath = join(appRoot, 'src', 'subfolder', 'app.js')
        const expectedHandlerName = 'src/subfolder/app.handlerTwoFoldersDeep'
        const document = await vscode.workspace.openTextDocument(appCodePath)

        const codeLenses = await expectCodeLenses(document.uri)

        assertAddDebugConfigCodeLensExists(codeLenses, expectedHandlerName, join(dirname(appCodePath), '..', '..'))
    }).timeout(CODELENS_TEST_TIMEOUT_MILLIS)

    it('appear when manifest in subfolder and app in subfolder to manifest', async () => {
        const appRoot = join(workspaceFolder, 'js-manifest-in-subfolder')
        const appCodePath = join(appRoot, 'src', 'subfolder', 'app.js')
        const expectedHandlerName = 'subfolder/app.handlerInManifestSubfolder'
        const document = await vscode.workspace.openTextDocument(appCodePath)

        const codeLenses = await expectCodeLenses(document.uri)

        assertAddDebugConfigCodeLensExists(codeLenses, expectedHandlerName, join(dirname(appCodePath), '..'))
    }).timeout(CODELENS_TEST_TIMEOUT_MILLIS)

    it('appear when project is a few folders deep in the workspace', async () => {
        const appRoot = join(workspaceFolder, 'deeper-projects', 'js-plain-sam-app')
        const appCodePath = join(appRoot, 'src', 'app.js')
        const expectedHandlerName = 'app.projectDeepInWorkspace'
        const document = await vscode.workspace.openTextDocument(appCodePath)

        const codeLenses = await expectCodeLenses(document.uri)

        assertAddDebugConfigCodeLensExists(codeLenses, expectedHandlerName, dirname(appCodePath))
    })

    function assertAddDebugConfigCodeLensExists(
        codeLenses: vscode.CodeLens[],
        expectedHandlerName: string,
        manifestPath: string
    ) {
        const debugCodeLenses = getLocalInvokeCodeLenses(codeLenses).filter(codeLens =>
            hasLocalInvokeArguments(codeLens, expectedHandlerName, manifestPath)
        )

        assert.strictEqual(debugCodeLenses.length, 1, 'Add Debug Config CodeLens was not found')
    }

    function getLocalInvokeCodeLenses(codeLenses: vscode.CodeLens[]): vscode.CodeLens[] {
        return codeLenses.filter(
            codeLens =>
                codeLens.command &&
                codeLens.command.command === 'aws.addSamDebugConfiguration' &&
                codeLens.command.arguments &&
                codeLens.command.arguments.length === 2
        )
    }

    function hasLocalInvokeArguments(codeLens: vscode.CodeLens, handlerName: string, manifestPath: string): boolean {
        if (!codeLens.command || !codeLens.command.arguments || codeLens.command.arguments.length !== 2) {
            return false
        }

        const commandArguments = codeLens.command.arguments[0] as AddSamDebugConfigurationInput

        return (
            commandArguments.resourceName === handlerName && dirname(commandArguments.rootUri.fsPath) === manifestPath
        )
    }
})
