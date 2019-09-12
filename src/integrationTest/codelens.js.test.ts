/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { join } from 'path'
import * as vscode from 'vscode'
import { LambdaLocalInvokeParams } from '../shared/codelens/localLambdaRunner'
import { activateExtension, EXTENSION_NAME_AWS_TOOLKIT, getCodeLenses } from './integrationTestsUtilities'

const ACTIVATE_EXTENSION_TIMEOUT_MILLIS = 30000
const CODELENS_TEST_TIMEOUT_MILLIS = 10000

describe.only('CodeLenses (JS)', async () => {
    // TODO : Extend this test suite out to work for different projects with different file configurations
    before(async function() {
        // tslint:disable-next-line:no-invalid-this
        this.timeout(ACTIVATE_EXTENSION_TIMEOUT_MILLIS)
        await activateExtension(EXTENSION_NAME_AWS_TOOLKIT)
    })

    it('Debug, Run, and Configure CodeLenses Appear for a SAM App where the source and manifest are in the same folder', async () => {
        const appRoot = join(vscode.workspace.workspaceFolders![0].uri.fsPath, 'js-plain-sam-app')
        const appCodePath = join(appRoot, 'src', 'app.js')
        const samTemplatePath = join(appRoot, 'template.yaml')
        const document = await vscode.workspace.openTextDocument(appCodePath)

        const codeLenses = await getCodeLenses(document.uri)

        assertLocalInvokeCodeLensesExist(codeLenses, 'app.handlerBesidePackageJson', samTemplatePath)
        assertConfigureCodeLensExists(codeLenses)
    }).timeout(CODELENS_TEST_TIMEOUT_MILLIS)

    function assertLocalInvokeCodeLensesExist(
        codeLenses: vscode.CodeLens[],
        expectedHandlerName: string,
        expectedSamTemplatePath: string
    ) {
        // Look for the CodeLenses of interest
        const invokeCodeLenses = codeLenses.filter(
            codeLens =>
                codeLens.command &&
                codeLens.command.command === 'aws.lambda.local.invoke.javascript' &&
                codeLens.command.arguments &&
                codeLens.command.arguments.length === 1
        )

        assert.strictEqual(invokeCodeLenses.length, 2, 'Expected two invoke CodeLenses (Run and Debug)')

        // Check the Command arguments
        assert.ok(
            invokeCodeLenses.every(codeLens => {
                const commandArguments = codeLens.command!.arguments![0] as LambdaLocalInvokeParams

                return (
                    commandArguments.handlerName === expectedHandlerName &&
                    commandArguments.samTemplate.fsPath === expectedSamTemplatePath
                )
            }),
            'The invoke CodeLenses did not have the expected command arguments'
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
