/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { mkdirpSync, readFileSync, removeSync } from 'fs-extra'
import * as path from 'path'
import * as vscode from 'vscode'
import { getSamCliContext } from '../../src/shared/sam/cli/samCliContext'
import { runSamCliInit, SamCliInitArgs } from '../../src/shared/sam/cli/samCliInit'
import { TIMEOUT } from './integrationTestsUtilities'

describe('SAM', async () => {
    const projectFolder = `${__dirname}/nodejs10x`
    const projectSDK = 'nodejs10.x'

    before(async function () {
        // tslint:disable-next-line: no-invalid-this
        this.timeout(TIMEOUT)
        const extension: vscode.Extension<void> | undefined = vscode.extensions.getExtension(
            'amazonwebservices.aws-toolkit-vscode'
        )
        assert.ok(extension)
        await extension!.activate()

        // this is really test 1, but since it has to run before everything it's in the before section
        try {
            removeSync(projectFolder)
        } catch (e) { }
        mkdirpSync(projectFolder)
        const initArguments: SamCliInitArgs = {
            name: 'testProject',
            location: projectFolder,
            runtime: projectSDK
        }
        const samCliContext = getSamCliContext()
        await runSamCliInit(initArguments, samCliContext.invoker)
        const fileContents = readFileSync(`${projectFolder}/testProject/template.yaml`).toString()
        assert.ok(fileContents.includes(`Runtime: ${projectSDK}`))
    })

    it('Fails to create template when it already exists', async () => {
        const initArguments: SamCliInitArgs = {
            name: 'testProject',
            location: projectFolder,
            runtime: projectSDK
        }
        console.log(initArguments.location)
        const samCliContext = getSamCliContext()
        await runSamCliInit(initArguments, samCliContext.invoker).catch((e: Error) => {
            assert(e.message.includes('directory already exists'))
        })
    })

    it('Invokes the run codelense', async () => {
        const documentPath = path.join(projectFolder, 'testProject', 'hello-world', 'app.js')
        console.log(documentPath)
        const documentUri = vscode.Uri.file(documentPath)
        const document = await vscode.workspace.openTextDocument(documentUri)
        const codeLensesPromise: Thenable<vscode.CodeLens[] | undefined> =
            vscode.commands.executeCommand('vscode.executeCodeLensProvider', document.uri)
        const codeLenses = await codeLensesPromise
        assert.ok(codeLenses)
        assert.strictEqual(codeLenses!.length, 3)
    }).timeout(TIMEOUT)

    after(async () => {
        try {
            removeSync(projectFolder)
        } catch (e) {}
    })
})
