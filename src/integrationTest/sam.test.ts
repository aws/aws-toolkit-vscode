/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { Runtime } from 'aws-sdk/clients/lambda'
import { mkdirpSync, mkdtemp, removeSync } from 'fs-extra'
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
import * as testUtils from './integrationTestsUtilities'
import { setTestTimeout } from './globalSetup.test'
import { waitUntil } from '../shared/utilities/timeoutUtils'
import { AwsSamDebuggerConfiguration } from '../shared/sam/debugger/awsSamDebugConfiguration.gen'
import { ext } from '../shared/extensionGlobals'
import { closeAllEditors } from '../shared/utilities/vsCodeUtils'
import { insertTextIntoFile } from '../shared/utilities/textUtilities'
const projectFolder = testUtils.getTestWorkspaceFolder()

/**
 * These languages are skipped on our minimum supported version
 * For Go and Python this is because the extensions used do not support our minimum
 */
const SKIP_LANGUAGES_ON_MIN = ['python', 'go']
interface TestScenario {
    displayName: string
    runtime: Runtime
    baseImage?: string
    path: string
    debugSessionType: string
    language: Language
}

// When testing additional runtimes, consider pulling the docker container in buildspec\linuxIntegrationTests.yml
// to reduce the chance of automated tests timing out.
const scenarios: TestScenario[] = [
    // zips
    {
        runtime: 'nodejs10.x',
        displayName: 'nodejs10.x (ZIP)',
        path: 'hello-world/app.js',
        debugSessionType: 'pwa-node',
        language: 'javascript',
    },
    {
        runtime: 'nodejs12.x',
        displayName: 'nodejs12.x (ZIP)',
        path: 'hello-world/app.js',
        debugSessionType: 'pwa-node',
        language: 'javascript',
    },
    {
        runtime: 'nodejs14.x',
        displayName: 'nodejs14.x (ZIP)',
        path: 'hello-world/app.js',
        debugSessionType: 'pwa-node',
        language: 'javascript',
    },
    {
        runtime: 'python2.7',
        displayName: 'python2.7 (ZIP)',
        path: 'hello_world/app.py',
        debugSessionType: 'python',
        language: 'python',
    },
    {
        runtime: 'python3.6',
        displayName: 'python3.6 (ZIP)',
        path: 'hello_world/app.py',
        debugSessionType: 'python',
        language: 'python',
    },
    {
        runtime: 'python3.7',
        displayName: 'python3.7 (ZIP)',
        path: 'hello_world/app.py',
        debugSessionType: 'python',
        language: 'python',
    },
    {
        runtime: 'python3.8',
        displayName: 'python3.8 (ZIP)',
        path: 'hello_world/app.py',
        debugSessionType: 'python',
        language: 'python',
    },
    {
        runtime: 'go1.x',
        displayName: 'go1.x (ZIP)',
        path: 'hello-world/main.go',
        debugSessionType: 'delve',
        language: 'go',
    },
    // { runtime: 'dotnetcore2.1', path: 'src/HelloWorld/Function.cs', debugSessionType: 'coreclr', language: 'csharp' },
    // { runtime: 'dotnetcore3.1', path: 'src/HelloWorld/Function.cs', debugSessionType: 'coreclr', language: 'csharp' },

    // images
    {
        runtime: 'nodejs10.x',
        displayName: 'nodejs10.x (Image)',
        baseImage: `amazon/nodejs10.x-base`,
        path: 'hello-world/app.js',
        debugSessionType: 'pwa-node',
        language: 'javascript',
    },
    {
        runtime: 'nodejs12.x',
        displayName: 'nodejs12.x (Image)',
        baseImage: `amazon/nodejs12.x-base`,
        path: 'hello-world/app.js',
        debugSessionType: 'pwa-node',
        language: 'javascript',
    },
    {
        runtime: 'nodejs14.x',
        displayName: 'nodejs14.x (Image)',
        baseImage: `amazon/nodejs14.x-base`,
        path: 'hello-world/app.js',
        debugSessionType: 'pwa-node',
        language: 'javascript',
    },
    {
        runtime: 'python3.6',
        displayName: 'python3.6 (Image)',
        baseImage: `amazon/python3.6-base`,
        path: 'hello_world/app.py',
        debugSessionType: 'python',
        language: 'python',
    },
    {
        runtime: 'python3.7',
        displayName: 'python3.7 (Image)',
        baseImage: `amazon/python3.7-base`,
        path: 'hello_world/app.py',
        debugSessionType: 'python',
        language: 'python',
    },
    {
        runtime: 'go1.x',
        displayName: 'go1.x (Image)',
        baseImage: 'amazon/go1.x-base',
        path: 'hello-world/main.go',
        debugSessionType: 'delve',
        language: 'go',
    },
    // {
    //     runtime: 'python3.8',
    //     displayName: 'python3.8 (Image)',
    //     baseImage: `amazon/python3.8-base`,
    //     path: 'hello_world/app.py',
    //     debugSessionType: 'python',
    //     language: 'python',
    // },
    // { runtime: 'dotnetcore2.1', path: 'src/HelloWorld/Function.cs', debugSessionType: 'coreclr', language: 'csharp' },
    // { runtime: 'dotnetcore3.1', path: 'src/HelloWorld/Function.cs', debugSessionType: 'coreclr', language: 'csharp' },
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

async function getAddConfigCodeLens(documentUri: vscode.Uri): Promise<vscode.CodeLens[]> {
    while (true) {
        try {
            // this works without a sleep locally, but not on CodeBuild
            await testUtils.sleep(200)
            let codeLenses = await testUtils.getCodeLenses(documentUri)
            if (!codeLenses || codeLenses.length === 0) {
                continue
            }

            // omnisharp spits out some undefined code lenses for some reason, we filter them because they are
            // not shown to the user and do not affect how our extension is working
            codeLenses = codeLenses.filter(codeLens => {
                if (codeLens.command && codeLens.command.arguments && codeLens.command.arguments.length === 3) {
                    return codeLens.command.command === 'aws.pickAddSamDebugConfiguration'
                }

                return false
            })
            if (codeLenses.length > 0) {
                return codeLenses || []
            }
        } catch (e) {
            console.log(`sam.test.ts: getAddConfigCodeLens(): failed, retrying:\n${e}`)
        }
    }
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
    if (name !== expectedName || runtime !== expectedRuntime) {
        const failMsg =
            `Unexpected DebugSession (expected name="${expectedName}" runtime="${expectedRuntime}"):` +
            `\n${JSON.stringify(debugSession)}`
        return failMsg
    }
}

/**
 * Simulates pressing 'F5' to start debugging. Sets up events to see if debugging was successful
 * or not. Since we are not checking outputs we treat a successful operation as the debug session
 * closing on its own (i.e. the container executable terminated)
 *
 * @param scenario Scenario to run, used for logging information
 * @param scenarioIndex Scenario number, used for logging information
 * @param testConfig Debug configuration to start the debugging with
 * @param testDisposables All events registered by this function are pushed here to be removed later
 * @param sessionLog An array where session logs are stored
 */
async function startDebugger(
    scenario: TestScenario,
    scenarioIndex: number,
    testConfig: vscode.DebugConfiguration,
    testDisposables: vscode.Disposable[],
    sessionLog: string[]
) {
    // Create a Promise that encapsulates our success critera
    const success = new Promise<void>((resolve, reject) => {
        testDisposables.push(
            vscode.debug.onDidTerminateDebugSession(async endedSession => {
                sessionLog.push(`scenario ${scenarioIndex} (END) (runtime=${scenario.runtime}) ${endedSession.name}`)
                const sessionRuntime = (endedSession.configuration as any).runtime
                if (!sessionRuntime) {
                    // It's a coprocess, ignore it.
                    return
                }
                const failMsg = validateSamDebugSession(endedSession, testConfig.name, scenario.runtime)
                if (failMsg) {
                    reject(new Error(failMsg))
                }
                resolve()
                await stopDebugger(`${scenario.runtime} / onDidTerminateDebugSession`)
            })
        )
    })

    // Executes the 'F5' action
    await vscode.debug.startDebugging(undefined, testConfig).then(
        async () => {
            sessionLog.push(
                `scenario ${scenarioIndex} (START) (runtime=${scenario.runtime}) ${
                    vscode.debug.activeDebugSession!.name
                }`
            )

            await testUtils.sleep(400)
            await continueDebugger()
            await testUtils.sleep(400)
            await continueDebugger()
            await testUtils.sleep(400)
            await continueDebugger()

            await success
        },
        err => {
            throw err as Error
        }
    )
}

async function continueDebugger(): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.debug.continue')
}

async function stopDebugger(logMsg: string | undefined): Promise<void> {
    if (logMsg) {
        console.log(`sam.test.ts: stopDebugger(): ${logMsg}`)
    }
    await vscode.commands.executeCommand('workbench.action.debug.stop')
}

async function activateExtensions(): Promise<void> {
    console.log('Activating extensions...')
    await testUtils.activateExtension(VSCODE_EXTENSION_ID.python)
    await testUtils.activateExtension(VSCODE_EXTENSION_ID.go)
    console.log('Extensions activated')
}

describe('SAM Integration Tests', async function () {
    const samApplicationName = 'testProject'
    /**
     * Breadcrumbs from each process, printed at end of all scenarios to give
     * us an idea of the timeline.
     */
    const sessionLog: string[] = []
    let testSuiteRoot: string

    before(async function () {
        await activateExtensions()
        await testUtils.configureAwsToolkitExtension()
        await testUtils.configurePythonExtension()
        await testUtils.configureGoExtension()

        testSuiteRoot = await mkdtemp(path.join(projectFolder, 'inttest'))
        console.log('testSuiteRoot: ', testSuiteRoot)
        mkdirpSync(testSuiteRoot)
    })

    after(async function () {
        tryRemoveFolder(testSuiteRoot)
        // Print a summary of session that were seen by `onDidStartDebugSession`.
        const sessionReport = sessionLog.map(x => `    ${x}`).join('\n')
        console.log(`DebugSessions seen in this run:${sessionReport}`)
    })

    for (let scenarioIndex = 0; scenarioIndex < scenarios.length; scenarioIndex++) {
        const scenario = scenarios[scenarioIndex]

        describe(`SAM Application Runtime: ${scenario.displayName}`, async function () {
            let runtimeTestRoot: string

            before(async function () {
                runtimeTestRoot = path.join(testSuiteRoot, scenario.runtime)
                console.log('runtimeTestRoot: ', runtimeTestRoot)
                mkdirpSync(runtimeTestRoot)
            })

            after(async function () {
                tryRemoveFolder(runtimeTestRoot)
            })

            function log(o: any) {
                console.log(`sam.test.ts: scenario ${scenarioIndex} (${scenario.displayName}): ${o}`)
            }

            /**
             * This suite cleans up at the end of each test.
             */
            describe('Starting from scratch', async function () {
                let testDir: string

                beforeEach(async function () {
                    testDir = await mkdtemp(path.join(runtimeTestRoot, 'test-'))
                    log(`testDir: ${testDir}`)
                })

                afterEach(async function () {
                    tryRemoveFolder(testDir)
                })

                it('creates a new SAM Application (happy path)', async function () {
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
            describe(`Starting with a newly created ${scenario.displayName} SAM Application...`, async function () {
                let testDisposables: vscode.Disposable[]

                let testDir: string
                let samAppCodeUri: vscode.Uri
                let appPath: string
                let cfnTemplatePath: string

                before(async function () {
                    testDir = await mkdtemp(path.join(runtimeTestRoot, 'samapp-'))
                    log(`testDir: ${testDir}`)

                    await createSamApplication(testDir)
                    appPath = path.join(testDir, samApplicationName, scenario.path)
                    cfnTemplatePath = path.join(testDir, samApplicationName, 'template.yaml')
                    assert.ok(await fileExists(cfnTemplatePath), `Expected SAM template to exist at ${cfnTemplatePath}`)
                    samAppCodeUri = await openSamAppFile(appPath)
                })

                beforeEach(async function () {
                    testDisposables = []
                    await closeAllEditors()
                })

                afterEach(async function () {
                    testDisposables.forEach(d => d.dispose())
                    await stopDebugger(undefined)
                })

                after(async function () {
                    tryRemoveFolder(testDir)
                })

                it('produces an error when creating a SAM Application to the same location', async function () {
                    const err = await assertThrowsError(async () => await createSamApplication(testDir))
                    assert(err.message.includes('directory already exists'))
                })

                it('produces an Add Debug Configuration codelens', async function () {
                    if (vscode.version.startsWith('1.42') && SKIP_LANGUAGES_ON_MIN.includes(scenario.language)) {
                        this.skip()
                    }

                    setTestTimeout(this.test?.fullTitle(), 60000)
                    const codeLenses = await getAddConfigCodeLens(samAppCodeUri)
                    assert.ok(codeLenses && codeLenses.length === 2)

                    let manifestFile: RegExp
                    switch (scenario.language) {
                        case 'javascript':
                            manifestFile = /^package\.json$/
                            break
                        case 'python':
                            manifestFile = /^requirements\.txt$/
                            break
                        case 'csharp':
                            manifestFile = /^.*\.csproj$/
                            break
                        case 'go':
                            manifestFile = /^go\.mod$/
                            break
                        default:
                            assert.fail('invalid scenario language')
                    }

                    const projectRoot = await findParentProjectFile(samAppCodeUri, manifestFile)
                    assert.ok(projectRoot, 'projectRoot not found')
                    for (const codeLens of codeLenses) {
                        assertCodeLensReferencesHasSameRoot(codeLens, projectRoot!)
                    }
                })

                it('invokes and attaches on debug request (F5)', async function () {
                    if (vscode.version.startsWith('1.42') && SKIP_LANGUAGES_ON_MIN.includes(scenario.language)) {
                        this.skip()
                    }

                    setTestTimeout(this.test?.fullTitle(), 90000)
                    // Allow previous sessions to go away.
                    const noDebugSession: boolean | undefined = await waitUntil(
                        async () => vscode.debug.activeDebugSession === undefined,
                        { timeout: 10000, interval: 100, truthy: true }
                    )

                    assert.strictEqual(
                        noDebugSession,
                        true,
                        `unexpected debug session in progress: ${JSON.stringify(
                            vscode.debug.activeDebugSession,
                            undefined,
                            2
                        )}`
                    )

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
                    } as AwsSamDebuggerConfiguration

                    // runtime is optional for ZIP, but required for image-based
                    if (scenario.baseImage) {
                        testConfig.lambda = {
                            runtime: scenario.runtime,
                        }

                        // little hack for Go, have to set GOPROXY to direct or it will fail to build
                        // This only applies for our internal systems
                        if (scenario.language === 'go') {
                            const dockerfilePath: string = path.join(path.dirname(appPath), 'Dockerfile')
                            insertTextIntoFile('ENV GOPROXY=direct', dockerfilePath, 1)
                        }
                    }

                    // XXX: force load since template registry seems a bit flakey
                    await ext.templateRegistry.addItemToRegistry(vscode.Uri.file(cfnTemplatePath))

                    await startDebugger(scenario, scenarioIndex, testConfig, testDisposables, sessionLog)
                })
            })
        })

        async function createSamApplication(location: string): Promise<void> {
            const initArguments: SamCliInitArgs = {
                name: samApplicationName,
                location: location,
                dependencyManager: getDependencyManager(scenario.runtime),
            }
            if (scenario.baseImage) {
                initArguments.baseImage = scenario.baseImage
            } else {
                initArguments.runtime = scenario.runtime
                initArguments.template = helloWorldTemplate
            }
            const samCliContext = getSamCliContext()
            await runSamCliInit(initArguments, samCliContext)
        }

        function assertCodeLensReferencesHasSameRoot(codeLens: vscode.CodeLens, expectedUri: vscode.Uri) {
            assert.ok(codeLens.command, 'CodeLens did not have a command')
            const command = codeLens.command!

            assert.ok(command.arguments, 'CodeLens command had no arguments')
            const commandArguments = command.arguments!

            assert.strictEqual(commandArguments.length, 3, 'CodeLens command had unexpected arg count')
            const params: AddSamDebugConfigurationInput = commandArguments[0]
            assert.ok(params, 'unexpected non-defined command argument')

            assert.strictEqual(path.dirname(params.rootUri.fsPath), path.dirname(expectedUri.fsPath))
        }
    }
})
