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
import { assertThrowsError } from '../../src/test/shared/utilities/assertUtils'
import { activateExtension, sleep, TIMEOUT } from './integrationTestsUtilities'

import { EOL } from 'os'

const projectFolder = `${__dirname}`

const runtimes = [
    { name: 'nodejs8.10', path: 'testProject/hello-world/app.js', debuggerType: 'node2' },
    { name: 'nodejs10.x', path: 'testProject/hello-world/app.js', debuggerType: 'node2' },
    { name: 'python2.7', path: 'testProject/hello_world/app.py', debuggerType: 'python' },
    { name: 'python3.6', path: 'testProject/hello_world/app.py', debuggerType: 'python' },
    { name: 'python3.7', path: 'testProject/hello_world/app.py', debuggerType: 'python' },
    // { name: 'dotnetcore2.1', path: 'testProject/src/HelloWorld/Function.cs', debuggerType: 'coreclr' }
]

async function openSamProject(projectPath: string): Promise<vscode.Uri> {
    const documentPath = path.join(projectFolder, projectPath)
    const document = await vscode.workspace.openTextDocument(documentPath)

    // Make an edit to the file to try and help trigger CodeLens generation
    const editor = await vscode.window.showTextDocument(
        document,
        {
            preview: true,
        })

    await editor.edit(editBuilder => {
        editBuilder.insert(document.positionAt(document.getText().length), EOL)
    })

    return document.uri
}

function tryRemoveProjectFolder() {
    try {
        removeSync(path.join(projectFolder, 'testProject'))
    } catch (e) { }
}

async function getCodeLenses(documentUri: vscode.Uri): Promise<vscode.CodeLens[]> {
    while (true) {
        try {
            // this works without a sleep locally, but not on CodeBuild
            await sleep(200)
            let codeLenses: vscode.CodeLens[] | undefined = await vscode.commands.executeCommand(
                'vscode.executeCodeLensProvider',
                documentUri
            )
            if (!codeLenses || codeLenses.length === 0) {
                continue
            }
            // omnisharp spits out some undefined code lenses for some reason, we filter them because they are
            // not shown to the user and do not affect how our extension is working
            codeLenses = codeLenses.filter(lens => lens !== undefined && lens.command !== undefined)
            if (codeLenses.length === 3) {
                return codeLenses as vscode.CodeLens[]
            }
        } catch (e) { }
    }
}

async function getCodeLensesOrTimeout(documentUri: vscode.Uri): Promise<vscode.CodeLens[]> {
    const codeLensPromise = getCodeLenses(documentUri)
    const timeout = new Promise(resolve => {
        setTimeout(resolve, 10000, undefined)
    })
    const result = await Promise.race([codeLensPromise, timeout])

    if (result) {
        return result as vscode.CodeLens[]
    }
    throw new Error('Codelenses took too long to show up!')
}

async function onDebugChanged(e: vscode.DebugSession | undefined, debuggerType: string) {
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

function validateRunResult(runResult: any | undefined, projectSDK: string, debug: string) {
    // tslint:disable: no-unsafe-any
    assert.ok(runResult)
    const datum = runResult!.datum
    assert.strictEqual(datum.name, 'invokelocal')
    assert.strictEqual(datum.value, 1)
    assert.strictEqual(datum.unit, 'Count')

    assert.ok(datum.metadata)
    const metadata = datum.metadata!
    assert.strictEqual(metadata.get('runtime'), projectSDK)
    assert.strictEqual(metadata.get('debug'), debug)
    // tslint:enable: no-unsafe-any
}

// Iterate through and test all runtimes
for (const runtime of runtimes) {
    const projectSDK = runtime.name
    const projectPath = runtime.path
    const debuggerType = runtime.debuggerType
    let documentUri: vscode.Uri
    let debugDisposable: vscode.Disposable

    describe(`SAM Integration tests ${runtime.name}`, async () => {
        before(async function () {
            // tslint:disable-next-line: no-invalid-this
            this.timeout(TIMEOUT)
            // set up debug config
            debugDisposable = vscode.debug.onDidChangeActiveDebugSession(async session =>
                onDebugChanged(session, debuggerType)
            )
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
            documentUri = await openSamProject(projectPath)
        })

        after(async () => {
            tryRemoveProjectFolder()
            debugDisposable.dispose()
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
            const err = await assertThrowsError(async () => runSamCliInit(initArguments, samCliContext.invoker))
            assert(err.message.includes('directory already exists'))
        }).timeout(TIMEOUT)

        it('Invokes the run codelens', async () => {
            const [runCodeLens] = await getCodeLensesOrTimeout(documentUri)
            assert.ok(runCodeLens.command)
            const command = runCodeLens.command!
            assert.ok(command.arguments)
            const runResult: any | undefined = await vscode.commands.executeCommand(
                command.command,
                ...command.arguments!
            )
            validateRunResult(runResult, projectSDK, 'false')
        }).timeout(TIMEOUT)

        it('Invokes the debug codelens', async () => {
            const [, debugCodeLens] = await getCodeLensesOrTimeout(documentUri)
            assert.ok(debugCodeLens.command)
            const command = debugCodeLens.command!
            assert.ok(command.arguments)
            const runResult: any | undefined = await vscode.commands.executeCommand(
                command.command,
                ...command.arguments!
            )
            validateRunResult(runResult, projectSDK, 'true')
            // This timeout is significantly longer, mostly to accommodate the long first time .net debugger
        }).timeout(TIMEOUT * 2)
    })
}
