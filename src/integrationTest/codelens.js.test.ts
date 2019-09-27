/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { join } from 'path'
import * as vscode from 'vscode'
import { LambdaLocalInvokeParams } from '../shared/codelens/localLambdaRunner'
import {
    activateExtension,
    expectCodeLenses,
    EXTENSION_NAME_AWS_TOOLKIT,
    getTestWorkspaceFolder
} from './integrationTestsUtilities'

const ACTIVATE_EXTENSION_TIMEOUT_MILLIS = 30000
const CODELENS_TEST_TIMEOUT_MILLIS = 10000

const workspaceFolder = getTestWorkspaceFolder()

describe('SAM Local CodeLenses (JS)', async () => {
    // TODO : Extend this test suite out to work for different projects with different file configurations
    before(async function() {
        // tslint:disable-next-line:no-invalid-this
        this.timeout(ACTIVATE_EXTENSION_TIMEOUT_MILLIS)
        await activateExtension(EXTENSION_NAME_AWS_TOOLKIT)
    })

    it('appear when manifest in subfolder and app is beside manifest', async () => {
        const appRoot = join(workspaceFolder, 'js-plain-sam-app')
        const appCodePath = join(appRoot, 'src', 'app.js')
        const samTemplatePath = join(appRoot, 'template.yaml')
        const expectedHandlerName = 'app.handlerBesidePackageJson'
        const document = await vscode.workspace.openTextDocument(appCodePath)

        const codeLenses = await expectCodeLenses(document.uri)

        assertDebugCodeLensExists(codeLenses, expectedHandlerName, samTemplatePath)
        assertRunCodeLensExists(codeLenses, expectedHandlerName, samTemplatePath)
        assertConfigureCodeLensExists(codeLenses)
    }).timeout(CODELENS_TEST_TIMEOUT_MILLIS)

    it('appear when manifest in root', async () => {
        const appRoot = join(workspaceFolder, 'js-manifest-in-root')
        const appCodePath = join(appRoot, 'src', 'subfolder', 'app.js')
        const samTemplatePath = join(appRoot, 'template.yaml')
        const expectedHandlerName = 'src/subfolder/app.handlerTwoFoldersDeep'
        const document = await vscode.workspace.openTextDocument(appCodePath)

        const codeLenses = await expectCodeLenses(document.uri)

        assertDebugCodeLensExists(codeLenses, expectedHandlerName, samTemplatePath)
        assertRunCodeLensExists(codeLenses, expectedHandlerName, samTemplatePath)
        assertConfigureCodeLensExists(codeLenses)
    }).timeout(CODELENS_TEST_TIMEOUT_MILLIS)

    it('appear when manifest in subfolder and app in subfolder to manifest', async () => {
        const appRoot = join(workspaceFolder, 'js-manifest-in-subfolder')
        const appCodePath = join(appRoot, 'src', 'subfolder', 'app.js')
        const samTemplatePath = join(appRoot, 'template.yaml')
        const expectedHandlerName = 'subfolder/app.handlerInManifestSubfolder'
        const document = await vscode.workspace.openTextDocument(appCodePath)

        const codeLenses = await expectCodeLenses(document.uri)

        assertDebugCodeLensExists(codeLenses, expectedHandlerName, samTemplatePath)
        assertRunCodeLensExists(codeLenses, expectedHandlerName, samTemplatePath)
        assertConfigureCodeLensExists(codeLenses)
    }).timeout(CODELENS_TEST_TIMEOUT_MILLIS)

    function assertDebugCodeLensExists(
        codeLenses: vscode.CodeLens[],
        expectedHandlerName: string,
        expectedSamTemplatePath: string
    ) {
        const debugCodeLenses = getLocalInvokeCodeLenses(codeLenses).filter(codeLens =>
            hasLocalInvokeArguments(codeLens, expectedHandlerName, expectedSamTemplatePath, true)
        )

        assert.strictEqual(debugCodeLenses.length, 1, 'Debug CodeLens was not found')
    }

    function assertRunCodeLensExists(
        codeLenses: vscode.CodeLens[],
        expectedHandlerName: string,
        expectedSamTemplatePath: string
    ) {
        const debugCodeLenses = getLocalInvokeCodeLenses(codeLenses).filter(codeLens =>
            hasLocalInvokeArguments(codeLens, expectedHandlerName, expectedSamTemplatePath, false)
        )

        assert.strictEqual(debugCodeLenses.length, 1, 'Run CodeLens was not found')
    }

    function getLocalInvokeCodeLenses(codeLenses: vscode.CodeLens[]): vscode.CodeLens[] {
        return codeLenses.filter(
            codeLens =>
                codeLens.command &&
                codeLens.command.command === 'aws.lambda.local.invoke.javascript' &&
                codeLens.command.arguments &&
                codeLens.command.arguments.length === 1
        )
    }

    function hasLocalInvokeArguments(
        codeLens: vscode.CodeLens,
        handlerName: string,
        templatePath: string,
        isDebug: boolean
    ): boolean {
        if (!codeLens.command || !codeLens.command.arguments || codeLens.command.arguments.length !== 1) {
            return false
        }

        const commandArguments = codeLens.command.arguments[0] as LambdaLocalInvokeParams

        return (
            commandArguments.handlerName === handlerName &&
            commandArguments.samTemplate.fsPath === templatePath &&
            commandArguments.isDebug === isDebug
        )
    }

    function assertConfigureCodeLensExists(codeLenses: vscode.CodeLens[]) {
        assert.strictEqual(
            codeLenses.filter(codeLens => codeLens.command && codeLens.command.command === 'aws.configureLambda')
                .length,
            1,
            'The Configure CodeLens could not be found'
        )
    }
})
