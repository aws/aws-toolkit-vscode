/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { mkdirpSync, readFileSync, removeSync } from 'fs-extra'
import * as path from 'path'
import * as vscode from 'vscode'
import { SamLambdaRuntime } from '../../src/lambda/models/samLambdaRuntime'
import { getSamCliContext } from '../../src/shared/sam/cli/samCliContext'
import { runSamCliInit, SamCliInitArgs } from '../../src/shared/sam/cli/samCliInit'
import { activateExtension, sleep, TIMEOUT } from './integrationTestsUtilities'

let projectSDK = 'nodejs10.x'
let projectPath = 'testProject/hello-world/app.js'
const projectFolder = `${__dirname}`

async function openSamProject(): Promise<vscode.Uri> {
    const documentPath = path.join(projectFolder, projectPath)
    await vscode.workspace.openTextDocument(documentPath)

    return vscode.Uri.file(documentPath)
}

async function getCodeLenses(): Promise<vscode.CodeLens[]> {
    const documentUri = await openSamProject()
    const codeLensesPromise: Thenable<vscode.CodeLens[] | undefined> =
        vscode.commands.executeCommand('vscode.executeCodeLensProvider', documentUri)
    let codeLenses = await codeLensesPromise
    assert.ok(codeLenses)
    // omnisharp spits out some undefined code lenses for some reason, we filter them because they are
    // not shown to the user and do not affect how our extension is working
    codeLenses = codeLenses!.filter(lens => lens !== undefined && lens.command !== undefined)
    assert.strictEqual(codeLenses!.length, 3)

    return codeLenses as vscode.CodeLens[]
}

describe('SAM Integration', async () => {
    before(async function () {
        // tslint:disable-next-line: no-invalid-this
        this.timeout(TIMEOUT)
        await activateExtension()
        /* read in from the environment what to test.
           This has to be done through environment variables or dynamically generating
           test files. Using the test generation APIs of Mocha will not work and results in
           promises timing out and other issues.
        */
        if (process.env.SAM_PROJECT_SDK) {
            projectSDK = process.env.SAM_PROJECT_SDK
        }
        if (process.env.SAM_PROJECT_PATH) {
            projectPath = process.env.SAM_PROJECT_PATH
        }
        console.log(`Using SDK ${projectSDK} with project in path ${projectPath}`)
        // this is really test 1, but since it has to run before everything it's in the before section
        try {
            removeSync(path.join(projectFolder, 'testProject'))
        } catch (e) { }
        mkdirpSync(projectFolder)
        const initArguments: SamCliInitArgs = {
            name: 'testProject',
            location: projectFolder,
            runtime: projectSDK as SamLambdaRuntime
        }
        const samCliContext = getSamCliContext()
        await runSamCliInit(initArguments, samCliContext.invoker)
        // we have to restore dotnet projects before we do anything, so we need this step just for dotnet
        if (projectSDK.includes('dotnet')) {
            console.log('Runtime under test is dotnet, will open and restore first')
            await openSamProject()
            // to add to this we have to wait for the .net extension to active to restore
            await sleep(10000)
            console.log('Restoring')
            await vscode.commands.executeCommand('dotnet.restore.all')
            // then we have to sleep to wait for it to actually restore
            await sleep(10000)
            console.log('Dotnet restore finished')
        }
    })

    it('Generates a template with a proper runtime', async () => {
        const fileContents = readFileSync(`${projectFolder}/testProject/template.yaml`).toString()
        assert.ok(fileContents.includes(`Runtime: ${projectSDK}`))
    })

    it('Fails to create template when it already exists', async () => {
        const initArguments: SamCliInitArgs = {
            name: 'testProject',
            location: projectFolder,
            runtime: projectSDK as SamLambdaRuntime
        }
        console.log(initArguments.location)
        const samCliContext = getSamCliContext()
        await runSamCliInit(initArguments, samCliContext.invoker).catch((e: Error) => {
            assert(e.message.includes('directory already exists'))
        })
    }).timeout(TIMEOUT)

    it('Invokes the run codelens', async () => {
        const [ runCodeLens ] = await getCodeLenses()
        assert.ok(runCodeLens.command)
        const command = runCodeLens.command!
        assert.ok(command.arguments)
        const runResult: any | undefined = await vscode.commands.executeCommand(
            command.command,
            command.arguments![0]
        )
        assert.ok(runResult)
        // tslint:disable: no-unsafe-any
        const datum = runResult!.datum
        assert.strictEqual(datum.name, 'invokelocal')
        assert.strictEqual(datum.value, 1)
        assert.strictEqual(datum.unit, 'Count')

        assert.ok(datum.metadata)
        const metadata = datum.metadata!
        assert.strictEqual(metadata.get('runtime'), projectSDK)
        assert.strictEqual(metadata.get('debug'), 'false')
    }).timeout(TIMEOUT)

    it('Invokes the debug codelens', async () => {
        const [, debugCodeLens ] = await getCodeLenses()
        assert.ok(debugCodeLens.command)
        const command = debugCodeLens.command!
        assert.ok(command.arguments)
        const runResult: any | undefined = await vscode.commands.executeCommand(
            command.command,
            command.arguments![0]
        )
        assert.ok(runResult)
        const datum = runResult!.datum
        assert.strictEqual(datum.name, 'invokelocal')
        assert.strictEqual(datum.value, 1)
        assert.strictEqual(datum.unit, 'Count')

        assert.ok(datum.metadata)
        const metadata = datum.metadata!
        assert.strictEqual(metadata.get('runtime'), projectSDK)
        assert.strictEqual(metadata.get('debug'), 'true')
    // This timeout is significantly longer, mostly to accommodate the long first time .net debugger
    }).timeout(TIMEOUT * 2)

    after(async () => {
        try {
            removeSync(path.join(projectFolder, 'testProject'))
        } catch (e) {}
    })
})
