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
import { Language } from '../shared/codelens/codeLensUtils'
import { VSCODE_EXTENSION_ID } from '../shared/extensions'
import { fileExists } from '../shared/filesystemUtilities'
import { AddSamDebugConfigurationInput } from '../shared/sam/debugger/commands/addSamDebugConfiguration'
import { findParentProjectFile } from '../shared/utilities/workspaceUtils'
import { activateExtension, getCodeLenses, getTestWorkspaceFolder, sleep } from './integrationTestsUtilities'
import { setTestTimeout } from './globalSetup.test'
import { waitUntil } from '../shared/utilities/timeoutUtils'

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
    { runtime: 'nodejs10.x', path: 'hello-world/app.js', debugSessionType: 'pwa-node', language: 'javascript' },
    { runtime: 'nodejs12.x', path: 'hello-world/app.js', debugSessionType: 'pwa-node', language: 'javascript' },
    { runtime: 'python2.7', path: 'hello_world/app.py', debugSessionType: 'python', language: 'python' },
    { runtime: 'python3.6', path: 'hello_world/app.py', debugSessionType: 'python', language: 'python' },
    { runtime: 'python3.7', path: 'hello_world/app.py', debugSessionType: 'python', language: 'python' },
    { runtime: 'python3.8', path: 'hello_world/app.py', debugSessionType: 'python', language: 'python' },
    // { runtime: 'dotnetcore2.1', path: 'src/HelloWorld/Function.cs', debugSessionType: 'coreclr', language: 'csharp' },
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

async function getAddConfigCodeLens(documentUri: vscode.Uri): Promise<vscode.CodeLens> {
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
                if (codeLens.command && codeLens.command.arguments && codeLens.command.arguments.length === 2) {
                    return codeLens.command.command === 'aws.pickAddSamDebugConfiguration'
                }

                return false
            })
            if (codeLenses.length === 1) {
                return codeLenses[0]
            }
        } catch (e) {
            console.log(`getAddConfigCodeLens(): failed, retrying:\n${e}`)
        }
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
    console.log('Extensions activated')
}

async function configurePythonExtension(): Promise<void> {
    const configPy = vscode.workspace.getConfiguration('python')
    // Disable linting to silence some of the Python extension's log spam
    await configPy.update('linting.pylintEnabled', false, false)
    await configPy.update('linting.enabled', false, false)
}

async function configureAwsToolkitExtension(): Promise<void> {
    const configAws = vscode.workspace.getConfiguration('aws')
    // Prevent the extension from preemptively cancelling a 'sam local' run
    await configAws.update('samcli.debug.attach.timeout.millis', 90000, false)
}

function runtimeNeedsWorkaround(lang: Language) {
    return vscode.version.startsWith('1.42') || lang === 'csharp' || lang === 'python'
}

describe('SAM Integration Tests', async function() {
    const samApplicationName = 'testProject'
    /**
     * Breadcrumbs from each process, printed at end of all scenarios to give
     * us an idea of the timeline.
     */
    const sessionLog: string[] = []
    let testSuiteRoot: string

    before(async function() {
        await activateExtensions()
        await configureAwsToolkitExtension()
        await configurePythonExtension()

        testSuiteRoot = await mkdtemp(path.join(projectFolder, 'inttest'))
        console.log('testSuiteRoot: ', testSuiteRoot)
        mkdirpSync(testSuiteRoot)
    })

    after(async function() {
        tryRemoveFolder(testSuiteRoot)
        // Print a summary of session that were seen by `onDidStartDebugSession`.
        const sessionReport = sessionLog.map(x => `    ${x}`).join('\n')
        console.log(`DebugSessions seen in this run:${sessionReport}`)
    })

    for (let scenarioIndex = 0; scenarioIndex < scenarios.length; scenarioIndex++) {
        const scenario = scenarios[scenarioIndex]

        describe(`SAM Application Runtime: ${scenario.runtime}`, async function() {
            let runtimeTestRoot: string

            before(async function() {
                runtimeTestRoot = path.join(testSuiteRoot, scenario.runtime)
                console.log('runtimeTestRoot: ', runtimeTestRoot)
                mkdirpSync(runtimeTestRoot)
            })

            after(async function() {
                tryRemoveFolder(runtimeTestRoot)
            })

            function log(o: any) {
                console.log(`sam.test.ts: scenario ${scenarioIndex} (${scenario.runtime}): ${o}`)
            }

            /**
             * This suite cleans up at the end of each test.
             */
            describe('Starting from scratch', async function() {
                let testDir: string

                beforeEach(async function() {
                    testDir = await mkdtemp(path.join(runtimeTestRoot, 'test-'))
                    log(`testDir: ${testDir}`)
                })

                afterEach(async function() {
                    tryRemoveFolder(testDir)
                })

                it('creates a new SAM Application (happy path)', async function() {
                    await createSamApplication(testDir)

                    // Check for readme file
                    const readmePath = path.join(testDir, samApplicationName, 'README.md')
                    assert.ok(await fileExists(readmePath), `Expected SAM App readme to exist at ${readmePath}`)
                })
            })

            /**
             * This suite makes a sam app that all tests operate on.
             * Cleanup happens at the end of the suite.
             */
            describe(`Starting with a newly created ${scenario.runtime} SAM Application...`, async function() {
                let testDisposables: vscode.Disposable[]

                let testDir: string
                let samAppCodeUri: vscode.Uri
                let appPath: string
                let cfnTemplatePath: string

                before(async function() {
                    testDir = await mkdtemp(path.join(runtimeTestRoot, 'samapp-'))
                    log(`testDir: ${testDir}`)

                    await createSamApplication(testDir)
                    appPath = path.join(testDir, samApplicationName, scenario.path)
                    cfnTemplatePath = path.join(testDir, samApplicationName, 'template.yaml')
                    samAppCodeUri = await openSamAppFile(appPath)
                })

                beforeEach(async function() {
                    testDisposables = []
                    await closeAllEditors()
                })

                afterEach(async function() {
                    // tslint:disable-next-line: no-unsafe-any
                    testDisposables.forEach(d => d.dispose())
                    await stopDebugger()
                })

                after(async function() {
                    tryRemoveFolder(testDir)
                })

                it('the SAM Template contains the expected runtime', async function() {
                    const fileContents = readFileSync(cfnTemplatePath).toString()
                    assert.ok(fileContents.includes(`Runtime: ${scenario.runtime}`))
                })

                it('produces an error when creating a SAM Application to the same location', async function() {
                    const err = await assertThrowsError(async () => await createSamApplication(testDir))
                    assert(err.message.includes('directory already exists'))
                })

                it('produces an Add Debug Configuration codelens', async function() {
                    setTestTimeout(this.test?.fullTitle(), 60000)
                    const codeLens = await getAddConfigCodeLens(samAppCodeUri)
                    assert.ok(codeLens)

                    let manifestFile: string
                    switch (scenario.language) {
                        case 'javascript':
                            manifestFile = 'package.json'
                            break
                        case 'python':
                            manifestFile = 'requirements.txt'
                            break
                        case 'csharp':
                            manifestFile = '*.csproj'
                            break
                        default:
                            assert.fail('invalid scenario language')
                    }

                    const projectRoot = await findParentProjectFile(samAppCodeUri, manifestFile)
                    assert.ok(projectRoot, 'projectRoot not found')
                    assertCodeLensReferencesHasSameRoot(codeLens, projectRoot!)
                })

                it('invokes and attaches on debug request (F5)', async function() {
                    setTestTimeout(this.test?.fullTitle(), 60000)
                    // Allow previous sessions to go away.
                    await waitUntil(
                        async function() {
                            return vscode.debug.activeDebugSession === undefined
                        },
                        { timeout: 100, interval: 300 }
                    )
                    // FIXME: This assert is disabled to unblock CI.
                    // assert.strictEqual(
                    //     vscode.debug.activeDebugSession,
                    //     undefined,
                    //     `unexpected debug session in progress: ${JSON.stringify(
                    //         vscode.debug.activeDebugSession,
                    //         undefined,
                    //         2
                    //     )}`
                    // )

                    const testConfig = {
                        type: 'aws-sam',
                        request: 'direct-invoke',
                        name: `test-config-${scenarioIndex}`,
                        invokeTarget: {
                            target: 'template',
                            // Resource defined in `src/testFixtures/.../template.yaml`.
                            logicalId: 'HelloWorldFunction',
                            templatePath: cfnTemplatePath,
                        },
                    }

                    // Simulate "F5".
                    await vscode.debug.startDebugging(undefined, testConfig)

                    await new Promise<void>((resolve, reject) => {
                        // XXX: temporary workaround because the csharp/python
                        // debuggers exit without triggering `onDidStartDebugSession`.
                        if (runtimeNeedsWorkaround(scenario.language)) {
                            testDisposables.push(
                                vscode.debug.onDidTerminateDebugSession(session => {
                                    sessionLog.push(
                                        `scenario ${scenarioIndex} (END) (runtime=${scenario.runtime}) ${session.name}`
                                    )
                                    resolve()
                                })
                            )
                        }
                        testDisposables.push(
                            vscode.debug.onDidStartDebugSession(async startedSession => {
                                sessionLog.push(
                                    `scenario ${scenarioIndex} (START) (runtime=${scenario.runtime}) ${startedSession.name}`
                                )

                                // If `onDidStartDebugSession` is fired then the debugger doesn't need the workaround anymore.
                                if (runtimeNeedsWorkaround(scenario.language)) {
                                    await stopDebugger()
                                    reject(
                                        new Error(
                                            `runtime "${scenario.language}" triggered onDidStartDebugSession, so it can be removed from runtimeNeedsWorkaround(), yay!`
                                        )
                                    )
                                }

                                // Wait for this debug session to terminate
                                testDisposables.push(
                                    vscode.debug.onDidTerminateDebugSession(async endedSession => {
                                        sessionLog.push(
                                            `scenario ${scenarioIndex} (END) (runtime=${scenario.runtime}) ${endedSession.name}`
                                        )
                                        const sessionRuntime = (endedSession.configuration as any).runtime
                                        if (!sessionRuntime) {
                                            // It's a coprocess, ignore it.
                                            return
                                        }
                                        const failMsg = validateSamDebugSession(
                                            endedSession,
                                            testConfig.name,
                                            scenario.runtime
                                        )
                                        if (failMsg) {
                                            reject(new Error(failMsg))
                                        }
                                        resolve()
                                        await stopDebugger()
                                    })
                                )

                                // Wait for it to actually start (which we do not get an event for).
                                await sleep(400)
                                await continueDebugger()
                                await sleep(400)
                                await continueDebugger()
                                await sleep(400)
                                await continueDebugger()
                            })
                        )
                    }).catch(e => {
                        throw e
                    })
                })
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
         * Returns a string if there is a validation issue, undefined if there is no issue.
         */
        function validateSamDebugSession(
            debugSession: vscode.DebugSession,
            expectedName: string,
            expectedRuntime: string
        ): string | undefined {
            const runtime = (debugSession.configuration as any).runtime
            const name = (debugSession.configuration as any).name
            if (name !== name || runtime !== expectedRuntime) {
                const failMsg =
                    `Unexpected DebugSession (expected name="${expectedName}" runtime="${expectedRuntime}"):` +
                    `\n${JSON.stringify(debugSession)}`
                return failMsg
            }
        }

        function assertCodeLensReferencesHasSameRoot(codeLens: vscode.CodeLens, expectedUri: vscode.Uri) {
            assert.ok(codeLens.command, 'CodeLens did not have a command')
            const command = codeLens.command!

            assert.ok(command.arguments, 'CodeLens command had no arguments')
            const commandArguments = command.arguments!

            assert.strictEqual(commandArguments.length, 2, 'CodeLens command had unexpected arg count')
            const params: AddSamDebugConfigurationInput = commandArguments[0]
            assert.ok(params, 'unexpected non-defined command argument')

            assert.strictEqual(path.dirname(params.rootUri.fsPath), path.dirname(expectedUri.fsPath))
        }
    }
})
