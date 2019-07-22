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

const projectFolder = `${__dirname}`
const projectSDK = 'nodejs10.x'

async function getCodeLenses(): Promise<vscode.CodeLens[]> {
    const documentPath = path.join(projectFolder, 'testProject', 'hello-world', 'app.js')
    await vscode.workspace.openTextDocument(documentPath)
    const documentUri = vscode.Uri.file(documentPath)
    const codeLensesPromise: Thenable<vscode.CodeLens[] | undefined> =
        vscode.commands.executeCommand('vscode.executeCodeLensProvider', documentUri)
    const codeLenses = await codeLensesPromise
    assert.ok(codeLenses)
    assert.strictEqual(codeLenses!.length, 3)

    return codeLenses as vscode.CodeLens[]
}

describe(`SAM ${projectSDK}`, async () => {
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
            removeSync(path.join(projectFolder, 'testProject'))
        } catch (e) { }
        mkdirpSync(projectFolder)
        const initArguments: SamCliInitArgs = {
            name: 'testProject',
            location: projectFolder,
            runtime: projectSDK
        }
        const samCliContext = getSamCliContext()
        await runSamCliInit(initArguments, samCliContext.invoker)
    })

    it('Generates a teamplate with a proper runtime', async () => {
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
    }).timeout(TIMEOUT)

    it('Invokes the run codelense', async () => {
        const [ runCodeLens ] = await getCodeLenses()
        assert.ok(runCodeLens.command)
        const command = runCodeLens.command!
        assert.ok(command.arguments)
        const runResult: any | undefined = await vscode.commands.executeCommand(
            command.command,
            command.arguments!
        )
        assert.ok(runResult)
        // tslint:disable: no-unsafe-any
        const datum = runResult!.datum
        assert.strictEqual(datum.name, 'invokelocal')
        assert.strictEqual(datum.value, 1)
        assert.strictEqual(datum.unit, 'Count')

        assert.ok(datum.metadata)
        const metadata = datum.metadata!
        assert.strictEqual(metadata.get('runtime'), 'nodejs10.x')
        assert.strictEqual(metadata.get('debug'), 'false')
    }).timeout(TIMEOUT)
/*
    it('Invokes the debug codelense', async () => {
        const [, debugCodeLens ] = await getCodeLenses()
        assert.ok(debugCodeLens.command)
        const command = debugCodeLens.command!
        assert.ok(command.arguments)
        const runResult: any | undefined = await vscode.commands.executeCommand(
            command.command,
            command.arguments!
        )
        assert.ok(runResult)
        const datum = runResult!.datum
        assert.strictEqual(datum.name, 'invokelocal')
        assert.strictEqual(datum.value, 1)
        assert.strictEqual(datum.unit, 'Count')

        assert.ok(datum.metadata)
        const metadata = datum.metadata!
        assert.strictEqual(metadata.get('runtime'), 'nodejs10.x')
        assert.strictEqual(metadata.get('debug'), 'true')
    }).timeout(TIMEOUT)
*/
    after(async () => {
        try {
            removeSync(path.join(projectFolder, 'testProject'))
        } catch (e) {}
    })
})
