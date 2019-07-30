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

const projectFolder = `${__dirname}`
let projectSDK = ''
let projectPath = ''
let debuggerType = ''
let documentUri: vscode.Uri

const runtimes = [
    { name: 'nodejs8.10', path: 'testProject/hello-world/app.js', debuggerType: 'node2' },
    { name: 'nodejs10.x', path: 'testProject/hello-world/app.js', debuggerType: 'node2' },
    { name: 'python2.7', path: 'testProject/hello_world/app.py', debuggerType: 'python' },
    { name: 'python3.6', path: 'testProject/hello_world/app.py', debuggerType: 'python' },
    { name: 'python3.7', path: 'testProject/hello_world/app.py', debuggerType: 'python' },
    { name: 'dotnetcore2.1', path: 'testProject/src/HelloWorld/Function.cs', debuggerType: 'coreclr' }
]

async function openSamProject(): Promise<vscode.Uri> {
    const documentPath = path.join(projectFolder, projectPath)
    await vscode.workspace.openTextDocument(documentPath)

    return vscode.Uri.file(documentPath)
}

function tryRemoveProjectFolder() {
    try {
        removeSync(path.join(projectFolder, 'testProject'))
    } catch (e) {}
}

async function getCodeLenses(): Promise<vscode.CodeLens[]> {
    let codeLenses: vscode.CodeLens[] | undefined
    while (true) {
        try {
            // this works without a sleep locally, but not on CodeBuild
            await sleep(200)
            const codeLensesPromise: Thenable<vscode.CodeLens[] | undefined> = vscode.commands.executeCommand(
                'vscode.executeCodeLensProvider',
                documentUri
            )
            codeLenses = await codeLensesPromise
            if (!codeLenses) {
                continue
            }
            // omnisharp spits out some undefined code lenses for some reason, we filter them because they are
            // not shown to the user and do not affect how our extension is working
            codeLenses = codeLenses.filter(lens => lens !== undefined && lens.command !== undefined)
            if (codeLenses.length === 3) {
                return codeLenses as vscode.CodeLens[]
            }
        } catch (e) {}
    }
}

async function getCodeLensesOrTimeout(): Promise<vscode.CodeLens[]> {
    const codeLensPromise = getCodeLenses()
    const timeout = new Promise(resolve => {
        setTimeout(resolve, 10000, undefined)
    })
    const result = await Promise.race([codeLensPromise, timeout])

    if (result) {
        return result as vscode.CodeLens[]
    }
    throw new Error('Codelenses took too long to show up, this inidicates an issue!')
}

async function onDebugChanged(e: vscode.DebugSession | undefined) {
    if (!e) {
        return
    }
    assert.strictEqual(e.configuration.name, 'SamLocalDebug')
    assert.strictEqual(e.configuration.type, debuggerType)
    // wait for it to actually start (which we do not get an event for). 800 is
    // short enough to finish before the next test is run and long enough to
    // actually act after it pauses
    await sleep(800)
    await vscode.commands.executeCommand('workbench.action.debug.continue')
}

// Iterate through and test all runtimes
for (const runtime of runtimes) {
    describe(`SAM Integration tests ${runtime.name}`, async () => {
        before(async function() {
            // tslint:disable-next-line: no-invalid-this
            this.timeout(TIMEOUT)
            projectSDK = runtime.name
            projectPath = runtime.path
            debuggerType = runtime.debuggerType
            // set up debug config
            vscode.debug.onDidChangeActiveDebugSession(onDebugChanged)
            await activateExtension('amazonwebservices.aws-toolkit-vscode')
            console.log(`Using SDK ${projectSDK} with project in path ${projectPath}`)
            tryRemoveProjectFolder()
            mkdirpSync(projectFolder)
            // this is really test 1, but since it has to run before everything it's in the before section
            const initArguments: SamCliInitArgs = {
                name: 'testProject',
                location: projectFolder,
                runtime: projectSDK as SamLambdaRuntime
            }
            const samCliContext = getSamCliContext()
            await runSamCliInit(initArguments, samCliContext.invoker)
            // Activate the relevent extensions if needed
            if (projectSDK.includes('dotnet')) {
                await activateExtension('ms-vscode.csharp')
            }
            if (projectSDK.includes('python')) {
                await activateExtension('ms-python.python')
            }
            documentUri = await openSamProject()
        })

        after(async () => {
            tryRemoveProjectFolder()
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
            const [runCodeLens] = await getCodeLensesOrTimeout()
            assert.ok(runCodeLens.command)
            const command = runCodeLens.command!
            assert.ok(command.arguments)
            const runResult: any | undefined = await vscode.commands.executeCommand(
                command.command,
                ...command.arguments!
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
            const [, debugCodeLens] = await getCodeLensesOrTimeout()
            assert.ok(debugCodeLens.command)
            const command = debugCodeLens.command!
            assert.ok(command.arguments)
            const runResult: any | undefined = await vscode.commands.executeCommand(
                command.command,
                ...command.arguments!
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
    })
}
