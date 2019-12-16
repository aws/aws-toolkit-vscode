/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { Runtime } from 'aws-sdk/clients/lambda'
import { mkdirpSync, readFileSync, removeSync } from 'fs-extra'
import * as path from 'path'
import * as vscode from 'vscode'
import { getDependencyManager } from '../../src/lambda/models/samLambdaRuntime'
import { getSamCliContext } from '../../src/shared/sam/cli/samCliContext'
import { runSamCliInit, SamCliInitArgs } from '../../src/shared/sam/cli/samCliInit'
import { assertThrowsError } from '../../src/test/shared/utilities/assertUtils'
import { getInvokeCmdKey, Language } from '../shared/codelens/codeLensUtils'
import { VSCODE_EXTENSION_ID } from '../shared/extensions'
import { fileExists, readFileAsString } from '../shared/filesystemUtilities'
import { LOG_PATH } from '../shared/logger/activation'
import { Datum } from '../shared/telemetry/telemetryTypes'
import { activateExtension, getCodeLenses, getTestWorkspaceFolder, sleep, TIMEOUT } from './integrationTestsUtilities'

const projectFolder = getTestWorkspaceFolder()

interface TestScenario {
    runtime: Runtime
    path: string
    debugSessionType: string
    language: Language
}

const runtimes: TestScenario[] = [
    // {
    //     runtime: 'nodejs8.10',
    //     path: 'testProject/hello-world/app.js',
    //     debugSessionType: 'node2',
    //     language: 'javascript'
    // },
    // {
    //     runtime: 'nodejs10.x',
    //     path: 'testProject/hello-world/app.js',
    //     debugSessionType: 'node2',
    //     language: 'javascript'
    // },
    // {
    //     runtime: 'nodejs12.x',
    //     path: 'testProject/hello-world/app.js',
    //     debugSessionType: 'node2',
    //     language: 'javascript'
    // },
    { runtime: 'python2.7', path: 'testProject/hello_world/app.py', debugSessionType: 'python', language: 'python' },
    { runtime: 'python3.6', path: 'testProject/hello_world/app.py', debugSessionType: 'python', language: 'python' },
    { runtime: 'python3.7', path: 'testProject/hello_world/app.py', debugSessionType: 'python', language: 'python' },
    { runtime: 'python3.8', path: 'testProject/hello_world/app.py', debugSessionType: 'python', language: 'python' }
    // { runtime: 'dotnetcore2.1', path: 'testProject/src/HelloWorld/Function.cs', debugSessionType: 'coreclr' }
]

async function openSamProject(projectPath: string): Promise<vscode.Uri> {
    const documentPath = path.join(projectFolder, projectPath)
    const document = await vscode.workspace.openTextDocument(documentPath)

    return document.uri
}

function setupProjectFolder() {
    tryRemoveProjectFolder()
    mkdirpSync(projectFolder)
}

function tryRemoveProjectFolder() {
    try {
        removeSync(path.join(projectFolder, 'testProject'))
    } catch (e) {}
}

async function getDebugLocalCodeLens(documentUri: vscode.Uri, language: Language): Promise<vscode.CodeLens> {
    return getLocalCodeLens(documentUri, language, true)
}

async function getRunLocalCodeLens(documentUri: vscode.Uri, language: Language): Promise<vscode.CodeLens> {
    return getLocalCodeLens(documentUri, language, false)
}

async function getLocalCodeLens(documentUri: vscode.Uri, language: Language, debug: boolean): Promise<vscode.CodeLens> {
    while (true) {
        try {
            // this works without a sleep locally, but not on CodeBuild
            await sleep(200)
            let codeLenses = await getCodeLenses(documentUri)
            if (!codeLenses || codeLenses.length === 0) {
                continue
            }

            // omnisharp spits out some undefined code lenses for some reason, we filter them because they are
            // not shown to the user and do not affect how our extension is working
            codeLenses = codeLenses.filter(codeLens => {
                if (codeLens.command && codeLens.command.arguments && codeLens.command.arguments.length === 1) {
                    // tslint:disable: no-unsafe-any
                    return (
                        codeLens.command.command === getInvokeCmdKey(language) &&
                        codeLens.command.arguments[0].isDebug === debug
                    )
                    // tslint:enable: no-unsafe-any
                }

                return false
            })
            if (codeLenses.length === 1) {
                return codeLenses[0]
            }
        } catch (e) {}
    }
}

interface LocalInvokeCodeLensCommandResult {
    datum: Datum
}

function validateLocalInvokeResult(
    actualResult: LocalInvokeCodeLensCommandResult,
    expectedResult: LocalInvokeCodeLensCommandResult
) {
    assert.strictEqual(actualResult.datum.name, expectedResult.datum.name)
    assert.strictEqual(actualResult.datum.value, expectedResult.datum.value)
    assert.strictEqual(actualResult.datum.unit, expectedResult.datum.unit)

    expectedResult.datum.metadata!.forEach((value, key) => {
        assert.strictEqual(actualResult.datum.metadata!.get(key), value)
    })
}

async function activateExtensions(): Promise<void> {
    console.log('Activating extensions...')
    await activateExtension(VSCODE_EXTENSION_ID.python)
    await activateExtension(VSCODE_EXTENSION_ID.awstoolkit)
    console.log('Extensions activated')
}

async function configurePythonExtension(): Promise<void> {
    console.log('************************************************************')
    // tslint:disable-next-line:no-null-keyword
    let config = vscode.workspace.getConfiguration(undefined, null)
    const pylintEnabled = config.get('python.linting.pylintEnabled')
    const lintingEnabled = config.get('python.linting.enabled')

    const configPy = vscode.workspace.getConfiguration('python')
    await configPy.update('linting.pylintEnabled', false, false)
    await configPy.update('linting.enabled', false, false)

    console.log(`pylintEnabled: ${pylintEnabled}, lintingEnabled: ${lintingEnabled}`)

    // tslint:disable-next-line:no-null-keyword
    config = vscode.workspace.getConfiguration(undefined, null)
    const pylintEnabled2 = config.get('python.linting.pylintEnabled')
    const lintingEnabled2 = config.get('python.linting.enabled')
    console.log(`pylintEnabled: ${pylintEnabled2}, lintingEnabled: ${lintingEnabled2}`)
    console.log('************************************************************')
}

describe('SAM Integration Tests', async () => {
    const samApplicationName = 'testProject'
    let testDisposables: vscode.Disposable[]

    before(async function() {
        // tslint:disable-next-line:no-invalid-this
        this.timeout(600000)

        await activateExtensions()
        await configurePythonExtension()
    })

    beforeEach(async function() {
        testDisposables = []
    })

    afterEach(async function() {
        // tslint:disable-next-line: no-unsafe-any
        testDisposables.forEach(d => d.dispose())
    })

    after(async () => {
        tryRemoveProjectFolder()

        const logs = await readFileAsString(LOG_PATH)
        console.log(logs)
    })

    for (const scenario of runtimes) {
        describe(`SAM Application Runtime: ${scenario.runtime}`, async () => {
            it('creates a new SAM Application (happy path)', async function() {
                // tslint:disable-next-line: no-invalid-this
                this.timeout(TIMEOUT)

                setupProjectFolder()

                await createSamApplication()

                // Check for readme file
                const readmePath = path.join(projectFolder, samApplicationName, 'README.md')
                assert.ok(await fileExists(readmePath), `Expected SAM App readme to exist at ${readmePath}`)
            })

            describe(`Starting with a newly created ${scenario.runtime} SAM Application...`, async () => {
                let samAppCodeUri: vscode.Uri

                before(async function() {
                    // tslint:disable-next-line: no-invalid-this
                    this.timeout(TIMEOUT)

                    setupProjectFolder()

                    await createSamApplication()
                    samAppCodeUri = await openSamProject(scenario.path)
                })

                beforeEach(async function() {
                    await closeAllEditors()
                })

                after(async function() {
                    tryRemoveProjectFolder()
                })

                it('the SAM Template contains the expected runtime', async () => {
                    const fileContents = readFileSync(`${projectFolder}/${samApplicationName}/template.yaml`).toString()
                    assert.ok(fileContents.includes(`Runtime: ${scenario.runtime}`))
                })

                it('produces an error when creating a SAM Application to the same location', async () => {
                    // await createSamApplication()
                    const err = await assertThrowsError(async () => await createSamApplication())
                    assert(err.message.includes('directory already exists'))
                }).timeout(TIMEOUT)

                it('produces a Run Local CodeLens', async () => {
                    const codeLens = await getRunLocalCodeLens(samAppCodeUri, scenario.language)
                    assert.ok(codeLens, 'expected to find a CodeLens')
                })

                // TODO : CC : Thought: What if each test uses a distinct test folder
                // TODO : CC : Thought: Open file, loop to get symbols up here first
                // TODO : CC : Thought: Can we get/see the output status/logs for the local invokes?
                it('produces a Debug Local CodeLens', async () => {
                    const codeLens = await getDebugLocalCodeLens(samAppCodeUri, scenario.language)
                    assert.ok(codeLens)
                }).timeout(300000)

                it('invokes the Run Local CodeLens', async () => {
                    const codeLens = await getRunLocalCodeLens(samAppCodeUri, scenario.language)
                    assert.ok(codeLens, 'expected to find a CodeLens')

                    const runResult = await vscode.commands.executeCommand<LocalInvokeCodeLensCommandResult>(
                        codeLens.command!.command,
                        ...codeLens.command!.arguments!
                    )
                    assert.ok(runResult, 'expected to get invoke results back')
                    validateLocalInvokeResult(runResult!, {
                        datum: {
                            name: 'invokelocal',
                            value: 1,
                            unit: 'Count',
                            metadata: new Map([
                                ['runtime', scenario.runtime],
                                ['debug', 'false'],
                                ['result', 'Succeeded']
                            ])
                        }
                    })
                }).timeout(TIMEOUT)

                it('invokes the Debug Local CodeLens', async () => {
                    assert.strictEqual(
                        vscode.debug.activeDebugSession,
                        undefined,
                        'unexpected debug session in progress'
                    )

                    const codeLens = await getDebugLocalCodeLens(samAppCodeUri, scenario.language)
                    assert.ok(codeLens, 'expected to find a CodeLens')

                    const debugSessionStartedAndStoppedPromise = new Promise<void>((resolve, reject) => {
                        testDisposables.push(
                            vscode.debug.onDidStartDebugSession(async startedSession => {
                                const sessionValidation = validateSamDebugSession(
                                    startedSession,
                                    scenario.debugSessionType
                                )

                                if (sessionValidation) {
                                    await stopDebugger()
                                    throw new Error(sessionValidation)
                                }

                                // Wait for this debug session to terminate
                                testDisposables.push(
                                    vscode.debug.onDidTerminateDebugSession(async endedSession => {
                                        const endSessionValidation = validateSamDebugSession(
                                            endedSession,
                                            scenario.debugSessionType
                                        )

                                        if (endSessionValidation) {
                                            throw new Error(endSessionValidation)
                                        }

                                        if (startedSession.id === endedSession.id) {
                                            resolve()
                                        } else {
                                            reject(new Error('Unexpected debug session ended'))
                                        }
                                    })
                                )

                                // wait for it to actually start (which we do not get an event for). 800 is
                                // short enough to finish before the next test is run and long enough to
                                // actually act after it pauses
                                await sleep(800)
                                await vscode.commands.executeCommand('workbench.action.debug.continue')
                            })
                        )
                    })

                    const runResult = await vscode.commands.executeCommand<LocalInvokeCodeLensCommandResult>(
                        codeLens.command!.command,
                        ...codeLens.command!.arguments!
                    )
                    assert.ok(runResult, 'expected to get invoke results back')
                    validateLocalInvokeResult(runResult!, {
                        datum: {
                            name: 'invokelocal',
                            value: 1,
                            unit: 'Count',
                            metadata: new Map([
                                ['runtime', scenario.runtime],
                                ['debug', 'true'],
                                ['result', 'Succeeded']
                            ])
                        }
                    })

                    await debugSessionStartedAndStoppedPromise
                })
                    .timeout(TIMEOUT * 3)
                    .retries(3)
            })
        })

        async function createSamApplication(): Promise<void> {
            const initArguments: SamCliInitArgs = {
                name: samApplicationName,
                location: projectFolder,
                runtime: scenario.runtime,
                dependencyManager: getDependencyManager(scenario.runtime)
            }
            const samCliContext = getSamCliContext()
            await runSamCliInit(initArguments, samCliContext)
        }

        async function stopDebugger(): Promise<void> {
            await vscode.commands.executeCommand('workbench.action.debug.stop')
        }

        async function closeAllEditors(): Promise<void> {
            await vscode.commands.executeCommand('workbench.action.closeAllEditors')
        }

        /**
         * Returns a string if there is a validation issue, undefined if there is no issue
         */
        function validateSamDebugSession(
            debugSession: vscode.DebugSession,
            expectedSessionType: string
        ): string | undefined {
            if (debugSession.name !== 'SamLocalDebug') {
                return `Unexpected Session Name ${debugSession}`
            }

            if (debugSession.type !== expectedSessionType) {
                return `Unexpected Session Type ${debugSession}`
            }
        }
    }
})
