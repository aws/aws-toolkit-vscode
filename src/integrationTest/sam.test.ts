/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { Runtime } from 'aws-sdk/clients/lambda'
import { mkdirpSync, mkdtemp, readFileSync, removeSync } from 'fs-extra'
import * as path from 'path'
import * as vscode from 'vscode'
import { getDependencyManager } from '../../src/lambda/models/samLambdaRuntime'
import { helloWorldTemplate } from '../../src/lambda/models/samTemplates'
import { getSamCliContext } from '../../src/shared/sam/cli/samCliContext'
import { runSamCliInit, SamCliInitArgs } from '../../src/shared/sam/cli/samCliInit'
import { assertThrowsError } from '../../src/test/shared/utilities/assertUtils'
import { getInvokeCmdKey, Language } from '../shared/codelens/codeLensUtils'
import { VSCODE_EXTENSION_ID } from '../shared/extensions'
import { fileExists } from '../shared/filesystemUtilities'
import { getLogger } from '../shared/logger'
import { WinstonToolkitLogger } from '../shared/logger/winstonToolkitLogger'
import { activateExtension, getCodeLenses, getTestWorkspaceFolder, sleep, TIMEOUT } from './integrationTestsUtilities'

const projectFolder = getTestWorkspaceFolder()

interface TestScenario {
    runtime: Runtime
    path: string
    debugSessionType: string
    language: Language
}

// When testing additional runtimes, consider pulling the docker container in buildspec\linuxIntegrationTests.yml
// to reduce the chance of automated tests timing out.
const scenarios: TestScenario[] = [
    {
        runtime: 'nodejs10.x',
        path: 'hello-world/app.js',
        debugSessionType: 'node2',
        language: 'javascript',
    },
    { runtime: 'nodejs12.x', path: 'hello-world/app.js', debugSessionType: 'node2', language: 'javascript' },
    { runtime: 'python2.7', path: 'hello_world/app.py', debugSessionType: 'python', language: 'python' },
    { runtime: 'python3.6', path: 'hello_world/app.py', debugSessionType: 'python', language: 'python' },
    { runtime: 'python3.7', path: 'hello_world/app.py', debugSessionType: 'python', language: 'python' },
    { runtime: 'python3.8', path: 'hello_world/app.py', debugSessionType: 'python', language: 'python' },
    // { runtime: 'dotnetcore2.1', path: 'src/HelloWorld/Function.cs', debugSessionType: 'coreclr' }
]

async function openSamAppFile(applicationPath: string): Promise<vscode.Uri> {
    const document = await vscode.workspace.openTextDocument(applicationPath)

    return document.uri
}

function tryRemoveFolder(fullPath: string) {
    try {
        removeSync(fullPath)
    } catch (e) {
        console.error(`Failed to remove path ${fullPath}`, e)
    }
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
                    return (
                        codeLens.command.command === getInvokeCmdKey(language) &&
                        // tslint:disable-next-line:no-unsafe-any
                        codeLens.command.arguments[0].isDebug === debug
                    )
                }

                return false
            })
            if (codeLenses.length === 1) {
                return codeLenses[0]
            }
        } catch (e) {}
    }
}

async function continueDebugger(): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.debug.continue')
}

async function stopDebugger(): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.debug.stop')
}

async function closeAllEditors(): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')
}

async function activateExtensions(): Promise<void> {
    console.log('Activating extensions...')
    await activateExtension(VSCODE_EXTENSION_ID.python)
    await activateExtension(VSCODE_EXTENSION_ID.awstoolkit)
    console.log('Extensions activated')
}

async function configurePythonExtension(): Promise<void> {
    logSeparator()
    const configPy = vscode.workspace.getConfiguration('python')
    // Disable linting to silence some of the Python extension's log spam
    await configPy.update('linting.pylintEnabled', false, false)
    await configPy.update('linting.enabled', false, false)
    logSeparator()
}

async function configureAwsToolkitExtension(): Promise<void> {
    logSeparator()
    const configAws = vscode.workspace.getConfiguration('aws')
    await configAws.update('logLevel', 'verbose', false)
    // Prevent the extension from preemptively cancelling a 'sam local' run
    await configAws.update('samcli.debug.attach.timeout.millis', '90000', false)
    logSeparator()
}

function logSeparator() {
    console.log('************************************************************')
}

function configureToolkitLogging() {
    const logger = getLogger()

    if (logger instanceof WinstonToolkitLogger) {
        // Ensure we're logging everything possible
        logger.setLogLevel('debug')
        // The logs help to diagnose SAM integration test failures
        logger.logToConsole()
    } else {
        assert.fail('Unexpected extension logger')
    }
}

describe('SAM Integration Tests', async () => {
    const samApplicationName = 'testProject'
    let testSuiteRoot: string

    before(async function() {
        // tslint:disable-next-line:no-invalid-this
        this.timeout(600000)

        await activateExtensions()
        await configureAwsToolkitExtension()
        await configurePythonExtension()

        configureToolkitLogging()

        testSuiteRoot = await mkdtemp(path.join(projectFolder, 'inttest'))
        console.log('testSuiteRoot: ', testSuiteRoot)
        mkdirpSync(testSuiteRoot)
    })

    after(async () => {
        tryRemoveFolder(testSuiteRoot)
    })

    for (const scenario of scenarios) {
        describe(`SAM Application Runtime: ${scenario.runtime}`, async () => {
            let runtimeTestRoot: string

            before(async function() {
                runtimeTestRoot = path.join(testSuiteRoot, scenario.runtime)
                console.log('runtimeTestRoot: ', runtimeTestRoot)
                mkdirpSync(runtimeTestRoot)
            })

            after(async function() {
                tryRemoveFolder(runtimeTestRoot)
            })

            /**
             * This suite cleans up at the end of each test.
             */
            describe('Starting from scratch', async () => {
                let subSuiteTestLocation: string

                beforeEach(async function() {
                    subSuiteTestLocation = await mkdtemp(path.join(runtimeTestRoot, 'test-'))
                    console.log(`subSuiteTestLocation: ${subSuiteTestLocation}`)
                })

                afterEach(async function() {
                    tryRemoveFolder(subSuiteTestLocation)
                })

                it('creates a new SAM Application (happy path)', async function() {
                    // tslint:disable-next-line: no-invalid-this
                    this.timeout(TIMEOUT)

                    await createSamApplication(subSuiteTestLocation)

                    // Check for readme file
                    const readmePath = path.join(subSuiteTestLocation, samApplicationName, 'README.md')
                    assert.ok(await fileExists(readmePath), `Expected SAM App readme to exist at ${readmePath}`)
                })
            })

            /**
             * This suite makes a sam app that all tests operate on.
             * Cleanup happens at the end of the suite.
             */
            describe(`Starting with a newly created ${scenario.runtime} SAM Application...`, async () => {
                let testDisposables: vscode.Disposable[]
                let subSuiteTestLocation: string

                let samAppCodeUri: vscode.Uri
                let samTemplatePath: string

                before(async function() {
                    // tslint:disable-next-line: no-invalid-this
                    this.timeout(TIMEOUT)

                    subSuiteTestLocation = await mkdtemp(path.join(runtimeTestRoot, 'samapp-'))
                    console.log(`subSuiteTestLocation: ${subSuiteTestLocation}`)

                    await createSamApplication(subSuiteTestLocation)
                    const appPath = path.join(subSuiteTestLocation, samApplicationName, scenario.path)
                    samTemplatePath = path.join(subSuiteTestLocation, samApplicationName, 'template.yaml')
                    samAppCodeUri = await openSamAppFile(appPath)
                })

                beforeEach(async function() {
                    testDisposables = []
                    await closeAllEditors()
                })

                afterEach(async function() {
                    // tslint:disable-next-line: no-unsafe-any
                    testDisposables.forEach(d => d.dispose())
                })

                after(async function() {
                    tryRemoveFolder(subSuiteTestLocation)
                })

                it('the SAM Template contains the expected runtime', async () => {
                    const fileContents = readFileSync(samTemplatePath).toString()
                    assert.ok(fileContents.includes(`Runtime: ${scenario.runtime}`))
                })

                it('produces an error when creating a SAM Application to the same location', async () => {
                    const err = await assertThrowsError(async () => await createSamApplication(subSuiteTestLocation))
                    assert(err.message.includes('directory already exists'))
                }).timeout(TIMEOUT)

                it('produces a Run Local CodeLens', async () => {
                    const codeLens = await getRunLocalCodeLens(samAppCodeUri, scenario.language)
                    assert.ok(codeLens, 'expected to find a CodeLens')
                    assertCodeLensReferencesSamTemplate(codeLens, samTemplatePath)
                }).timeout(TIMEOUT)

                it('produces a Debug Local CodeLens', async () => {
                    const codeLens = await getDebugLocalCodeLens(samAppCodeUri, scenario.language)
                    assert.ok(codeLens)
                    assertCodeLensReferencesSamTemplate(codeLens, samTemplatePath)
                }).timeout(TIMEOUT)

                it.skip('invokes the Run Local CodeLens', async () => {
                    const codeLens = await getRunLocalCodeLens(samAppCodeUri, scenario.language)
                    assert.ok(codeLens, 'expected to find a CodeLens')

                    // tslint:disable-next-line: no-unsafe-any
                    await vscode.commands.executeCommand<any>(
                        codeLens.command!.command,
                        ...codeLens.command!.arguments!
                    )
                }).timeout(TIMEOUT)

                it.skip('invokes the Debug Local CodeLens', async () => {
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
                                await continueDebugger()
                            })
                        )
                    })

                    await vscode.commands.executeCommand<any>(
                        codeLens.command!.command,
                        ...codeLens.command!.arguments!
                    )

                    await debugSessionStartedAndStoppedPromise
                }).timeout(TIMEOUT * 2)
            })
        })

        async function createSamApplication(location: string): Promise<void> {
            const initArguments: SamCliInitArgs = {
                name: samApplicationName,
                location: location,
                template: helloWorldTemplate,
                runtime: scenario.runtime,
                dependencyManager: getDependencyManager(scenario.runtime),
            }
            const samCliContext = getSamCliContext()
            await runSamCliInit(initArguments, samCliContext)
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

        function assertCodeLensReferencesSamTemplate(codeLens: vscode.CodeLens, expectedSamTemplatePath: string) {
            assert.ok(codeLens.command, 'CodeLens did not have a command')
            const command = codeLens.command!

            assert.ok(command.arguments, 'CodeLens command had no arguments')
            const commandArguments = command.arguments!

            assert.strictEqual(commandArguments.length, 1, 'CodeLens command had unexpected arg count')
            const params = commandArguments[0]
            assert.ok(params, 'unexpected non-defined command argument')

            // tslint:disable-next-line:no-unsafe-any
            const samTemplateUri = params.samTemplate as vscode.Uri
            assert.strictEqual(
                samTemplateUri.fsPath,
                vscode.Uri.file(expectedSamTemplatePath).fsPath,
                'CodeLens not referencing expected SAM Template'
            )
        }
    }
})
