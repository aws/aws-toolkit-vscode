/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { Runtime } from 'aws-sdk/clients/lambda'
import { mkdirpSync, mkdtemp } from 'fs-extra'
import * as path from 'path'
import * as vscode from 'vscode'
import * as vscodeUtils from '../../src/shared/utilities/vsCodeUtils'
import { DependencyManager } from '../../src/lambda/models/samLambdaRuntime'
import { helloWorldTemplate, typeScriptBackendTemplate } from '../../src/lambda/models/samTemplates'
import { getSamCliContext } from '../../src/shared/sam/cli/samCliContext'
import { runSamCliInit, SamCliInitArgs } from '../../src/shared/sam/cli/samCliInit'
import { Language } from '../shared/codelens/codeLensUtils'
import { VSCODE_EXTENSION_ID } from '../shared/extensions'
import { fileExists, tryRemoveFolder } from '../shared/filesystemUtilities'
import { AddSamDebugConfigurationInput } from '../shared/sam/debugger/commands/addSamDebugConfiguration'
import { findParentProjectFile } from '../shared/utilities/workspaceUtils'
import * as testUtils from './integrationTestsUtilities'
import { setTestTimeout } from './globalSetup.test'
import { waitUntil } from '../shared/utilities/timeoutUtils'
import { AwsSamDebuggerConfiguration } from '../shared/sam/debugger/awsSamDebugConfiguration.gen'
import { ext } from '../shared/extensionGlobals'
import { AwsSamTargetType } from '../shared/sam/debugger/awsSamDebugConfiguration'
import { closeAllEditors } from '../shared/utilities/vsCodeUtils'
import { insertTextIntoFile } from '../shared/utilities/textUtilities'
import { sleep } from '../shared/utilities/promiseUtilities'
const projectFolder = testUtils.getTestWorkspaceFolder()

/* Test constants go here */
const CODELENS_TIMEOUT: number = 60000
const CODELENS_RETRY_INTERVAL: number = 200
// note: this refers to the _test_ timeout, not the invocation timeout
const DEBUG_TIMEOUT: number = 120000
const NO_DEBUG_SESSION_TIMEOUT: number = 5000
const NO_DEBUG_SESSION_INTERVAL: number = 100

/**
 * These languages are skipped on our minimum supported version
 * For Go and Python this is because the extensions used do not support our minimum
 */
const SKIP_LANGUAGES_ON_MIN = ['python', 'go']

/** Go can't handle API tests yet */
const SKIP_LANGUAGES_ON_API = ['go']

interface TestScenario {
    displayName: string
    runtime: Runtime
    baseImage?: string
    path: string
    debugSessionType: string
    language: Language
    dependencyManager: DependencyManager
}

// When testing additional runtimes, consider pulling the docker container in buildspec\linuxIntegrationTests.yml
// to reduce the chance of automated tests timing out.
const scenarios: TestScenario[] = [
    // zips
    {
        runtime: 'nodejs12.x',
        displayName: 'nodejs12.x/typescript (ZIP)',
        path: 'app/src/handlers/post.ts',
        debugSessionType: 'pwa-node',
        language: 'typescript',
        dependencyManager: 'npm',
    },
    {
        runtime: 'nodejs12.x',
        displayName: 'nodejs12.x (ZIP)',
        path: 'hello-world/app.js',
        debugSessionType: 'pwa-node',
        language: 'javascript',
        dependencyManager: 'npm',
    },
    {
        runtime: 'nodejs14.x',
        displayName: 'nodejs14.x (ZIP)',
        path: 'hello-world/app.js',
        debugSessionType: 'pwa-node',
        language: 'javascript',
        dependencyManager: 'npm',
    },
    {
        runtime: 'python3.6',
        displayName: 'python3.6 (ZIP)',
        path: 'hello_world/app.py',
        debugSessionType: 'python',
        language: 'python',
        dependencyManager: 'pip',
    },
    {
        runtime: 'python3.7',
        displayName: 'python3.7 (ZIP)',
        path: 'hello_world/app.py',
        debugSessionType: 'python',
        language: 'python',
        dependencyManager: 'pip',
    },
    {
        runtime: 'python3.8',
        displayName: 'python3.8 (ZIP)',
        path: 'hello_world/app.py',
        debugSessionType: 'python',
        language: 'python',
        dependencyManager: 'pip',
    },
    // TODO: Add Python3.9 support to integration test hosts
    // {
    //     runtime: 'python3.9',
    //     displayName: 'python3.9 (ZIP)',
    //     path: 'hello_world/app.py',
    //     debugSessionType: 'python',
    //     language: 'python',
    //     dependencyManager: 'pip',
    // },
    {
        runtime: 'java8',
        displayName: 'java8 (Gradle ZIP)',
        path: 'HelloWorldFunction/src/main/java/helloworld/App.java',
        debugSessionType: 'java',
        language: 'java',
        dependencyManager: 'gradle',
    },
    {
        runtime: 'java8.al2',
        displayName: 'java8.al2 (Maven ZIP)',
        path: 'HelloWorldFunction/src/main/java/helloworld/App.java',
        debugSessionType: 'java',
        language: 'java',
        dependencyManager: 'maven',
    },
    {
        runtime: 'java11',
        displayName: 'java11 (Gradle ZIP)',
        path: 'HelloWorldFunction/src/main/java/helloworld/App.java',
        debugSessionType: 'java',
        language: 'java',
        dependencyManager: 'gradle',
    },
    {
        runtime: 'go1.x',
        displayName: 'go1.x (ZIP)',
        path: 'hello-world/main.go',
        debugSessionType: 'delve',
        language: 'go',
        dependencyManager: 'mod',
    },
    // { runtime: 'dotnetcore2.1', path: 'src/HelloWorld/Function.cs', debugSessionType: 'coreclr', language: 'csharp' },
    // { runtime: 'dotnetcore3.1', path: 'src/HelloWorld/Function.cs', debugSessionType: 'coreclr', language: 'csharp' },

    // images
    {
        runtime: 'nodejs12.x',
        displayName: 'nodejs12.x (Image)',
        baseImage: `amazon/nodejs12.x-base`,
        path: 'hello-world/app.js',
        debugSessionType: 'pwa-node',
        language: 'javascript',
        dependencyManager: 'npm',
    },
    {
        runtime: 'nodejs14.x',
        displayName: 'nodejs14.x (Image)',
        baseImage: `amazon/nodejs14.x-base`,
        path: 'hello-world/app.js',
        debugSessionType: 'pwa-node',
        language: 'javascript',
        dependencyManager: 'npm',
    },
    {
        runtime: 'python3.6',
        displayName: 'python3.6 (Image)',
        baseImage: `amazon/python3.6-base`,
        path: 'hello_world/app.py',
        debugSessionType: 'python',
        language: 'python',
        dependencyManager: 'pip',
    },
    {
        runtime: 'python3.7',
        displayName: 'python3.7 (Image)',
        baseImage: `amazon/python3.7-base`,
        path: 'hello_world/app.py',
        debugSessionType: 'python',
        language: 'python',
        dependencyManager: 'pip',
    },
    {
        runtime: 'python3.8',
        displayName: 'python3.8 (Image)',
        baseImage: `amazon/python3.8-base`,
        path: 'hello_world/app.py',
        debugSessionType: 'python',
        language: 'python',
        dependencyManager: 'pip',
    },
    // TODO: Add Python3.9 support to integration test hosts
    // {
    //     runtime: 'python3.9',
    //     displayName: 'python3.9 (Image)',
    //     baseImage: `amazon/python3.9-base`,
    //     path: 'hello_world/app.py',
    //     debugSessionType: 'python',
    //     language: 'python',
    //     dependencyManager: 'pip',
    // },
    {
        runtime: 'go1.x',
        displayName: 'go1.x (Image)',
        baseImage: 'amazon/go1.x-base',
        path: 'hello-world/main.go',
        debugSessionType: 'delve',
        language: 'go',
        dependencyManager: 'mod',
    },
    {
        runtime: 'java8',
        displayName: 'java8 (Maven Image)',
        path: 'HelloWorldFunction/src/main/java/helloworld/App.java',
        baseImage: `amazon/java8-base`,
        debugSessionType: 'java',
        language: 'java',
        dependencyManager: 'maven',
    },
    {
        runtime: 'java8.al2',
        displayName: 'java8.al2 (Gradle Image)',
        path: 'HelloWorldFunction/src/main/java/helloworld/App.java',
        baseImage: `amazon/java8.al2-base`,
        debugSessionType: 'java',
        language: 'java',
        dependencyManager: 'gradle',
    },
    {
        runtime: 'java11',
        displayName: 'java11 (Maven Image)',
        path: 'HelloWorldFunction/src/main/java/helloworld/App.java',
        baseImage: `amazon/java11-base`,
        debugSessionType: 'java',
        language: 'java',
        dependencyManager: 'maven',
    },
    // { runtime: 'dotnetcore2.1', path: 'src/HelloWorld/Function.cs', debugSessionType: 'coreclr', language: 'csharp' },
    // { runtime: 'dotnetcore3.1', path: 'src/HelloWorld/Function.cs', debugSessionType: 'coreclr', language: 'csharp' },
]

async function openSamAppFile(applicationPath: string): Promise<vscode.Uri> {
    const document = await vscode.workspace.openTextDocument(applicationPath)

    return document.uri
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
    target: AwsSamTargetType,
    testConfig: vscode.DebugConfiguration,
    testDisposables: vscode.Disposable[],
    sessionLog: string[]
) {
    function logSession(startEnd: 'START' | 'END' | 'EXIT' | 'FAIL', name: string) {
        sessionLog.push(
            `scenario ${scenarioIndex}.${target.toString()[0]} ${startEnd.padEnd(5, ' ')} ${target}/${
                scenario.displayName
            }: ${name}`
        )
    }

    // Create a Promise that encapsulates our success critera
    const success = new Promise<void>((resolve, reject) => {
        testDisposables.push(
            vscode.debug.onDidTerminateDebugSession(async session => {
                logSession('END', session.name)
                const sessionRuntime = (session.configuration as any).runtime
                if (!sessionRuntime) {
                    // It's a coprocess, ignore it.
                    return
                }
                const failMsg = validateSamDebugSession(session, testConfig.name, scenario.runtime)
                if (failMsg) {
                    reject(new Error(failMsg))
                }
                resolve()
                await stopDebugger(`${scenario.runtime} / onDidTerminateDebugSession`)
            })
        )
    })

    // Executes the 'F5' action
    const attached = await vscode.debug.startDebugging(undefined, testConfig)
    const session = vscode.debug.activeDebugSession

    if (!attached) {
        // TODO: set a breakpoint so the debugger actually attaches!
        console.log(`sam.test.ts: startDebugging did not attach (config=${testConfig.name})`)
        // logSession('FAIL', `${testConfig} (startDebugging failed)`)
        // throw Error('startDebugging did not attach debugger')
    }

    if (session === undefined) {
        logSession('EXIT', `${testConfig} (exited immediately)`)
        return
    }

    logSession('START', session.name)

    await sleep(400)
    await continueDebugger()
    await sleep(400)
    await continueDebugger()
    await sleep(400)
    await continueDebugger()

    return success
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
    await vscodeUtils.activateExtension(VSCODE_EXTENSION_ID.python, false)
    await vscodeUtils.activateExtension(VSCODE_EXTENSION_ID.go, false)
    await vscodeUtils.activateExtension(VSCODE_EXTENSION_ID.java, false)
    await vscodeUtils.activateExtension(VSCODE_EXTENSION_ID.javadebug, false)
    console.log('Extensions activated')
}

describe('SAM Integration Tests', async function () {
    const samApplicationName = 'testProject'
    /**
     * Breadcrumbs from each process, printed at end of all scenarios to give
     * us an idea of the timeline.
     */
    const sessionLog: string[] = []
    let javaLanguageSetting: string | undefined
    const config = vscode.workspace.getConfiguration('java')
    let testSuiteRoot: string

    before(async function () {
        javaLanguageSetting = config.get('server.launchMode')
        config.update('server.launchMode', 'Standard')

        await activateExtensions()
        await testUtils.configureAwsToolkitExtension()
        await testUtils.configurePythonExtension()
        await testUtils.configureGoExtension()

        testSuiteRoot = await mkdtemp(path.join(projectFolder, 'inttest'))
        console.log('testSuiteRoot: ', testSuiteRoot)
        mkdirpSync(testSuiteRoot)
    })

    after(async function () {
        await tryRemoveFolder(testSuiteRoot)
        // Print a summary of session that were seen by `onDidStartDebugSession`.
        const sessionReport = sessionLog.map(x => `    ${x}`).join('\n')
        config.update('server.launchMode', javaLanguageSetting)
        console.log(`DebugSessions seen in this run:\n${sessionReport}`)
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
                // don't clean up after java tests so the java language server doesn't freak out
                if (scenario.language !== 'java') {
                    await tryRemoveFolder(runtimeTestRoot)
                }
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
                    // don't clean up after java tests so the java language server doesn't freak out
                    if (scenario.language !== 'java') {
                        await tryRemoveFolder(testDir)
                    }
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
                    if (!(await fileExists(cfnTemplatePath))) {
                        // May be ".yaml" or ".yml". COOL!
                        cfnTemplatePath = path.join(testDir, samApplicationName, 'template.yml')
                    }
                    assert.ok(
                        await fileExists(cfnTemplatePath),
                        `Expected SAM template.{yml,yaml} to exist at: ${cfnTemplatePath}`
                    )

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
                    // don't clean up after java tests so the java language server doesn't freak out
                    if (scenario.language !== 'java') {
                        await tryRemoveFolder(testDir)
                    }
                })

                it('produces an error when creating a SAM Application to the same location', async function () {
                    await assert.rejects(
                        createSamApplication(testDir),
                        /directory already exists/,
                        'Promise was not rejected'
                    )
                })

                it('produces an Add Debug Configuration codelens', async function () {
                    if (vscode.version.startsWith('1.42') && SKIP_LANGUAGES_ON_MIN.includes(scenario.language)) {
                        this.skip()
                    }

                    const codeLenses = await testUtils.getAddConfigCodeLens(
                        samAppCodeUri,
                        CODELENS_TIMEOUT,
                        CODELENS_RETRY_INTERVAL
                    )
                    assert.ok(codeLenses && codeLenses.length === 2)

                    let manifestFile: RegExp
                    switch (scenario.language) {
                        case 'javascript':
                        case 'typescript':
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
                        case 'java':
                            if (scenario.dependencyManager === 'maven') {
                                manifestFile = /^.*pom\.xml$/
                                break
                            } else if (scenario.dependencyManager === 'gradle') {
                                manifestFile = /^.*build\.gradle$/
                                break
                            }
                            assert.fail(`invalid dependency manager for java: ${scenario.dependencyManager}`)
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

                it('target=api: invokes and attaches on debug request (F5)', async function () {
                    if (
                        (vscode.version.startsWith('1.42') && SKIP_LANGUAGES_ON_MIN.includes(scenario.language)) ||
                        SKIP_LANGUAGES_ON_API.includes(scenario.language)
                    ) {
                        this.skip()
                    }

                    setTestTimeout(this.test?.fullTitle(), DEBUG_TIMEOUT)
                    await testTarget('api', {
                        api: {
                            path: '/hello',
                            httpMethod: 'get',
                            headers: { 'accept-language': 'fr-FR' },
                        },
                    })
                })

                it('target=template: invokes and attaches on debug request (F5)', async function () {
                    if (vscode.version.startsWith('1.42') && SKIP_LANGUAGES_ON_MIN.includes(scenario.language)) {
                        this.skip()
                    }

                    setTestTimeout(this.test?.fullTitle(), DEBUG_TIMEOUT)
                    await testTarget('template')
                })

                async function testTarget(target: AwsSamTargetType, extraConfig: any = {}) {
                    // Allow previous sessions to go away.
                    const noDebugSession: boolean | undefined = await waitUntil(
                        async () => vscode.debug.activeDebugSession === undefined,
                        { timeout: NO_DEBUG_SESSION_TIMEOUT, interval: NO_DEBUG_SESSION_INTERVAL, truthy: true }
                    )

                    // We exclude the Node debug type since it causes the most erroneous failures with CI.
                    // However, the fact that there are sessions from previous tests is still an issue, so
                    // a warning will be logged under the current session.
                    if (!noDebugSession) {
                        assert.strictEqual(
                            vscode.debug.activeDebugSession!.type,
                            'pwa-node',
                            `unexpected debug session in progress: ${JSON.stringify(
                                vscode.debug.activeDebugSession,
                                undefined,
                                2
                            )}`
                        )

                        sessionLog.push(`(WARNING) Unexpected debug session ${vscode.debug.activeDebugSession!.name}`)
                    }

                    const testConfig = {
                        type: 'aws-sam',
                        request: 'direct-invoke',
                        name: `test-config-${scenarioIndex}`,
                        invokeTarget: {
                            target: target,
                            // Resource defined in `src/testFixtures/.../template.yaml`.
                            logicalId: 'HelloWorldFunction',
                            templatePath: cfnTemplatePath,
                        },
                        ...extraConfig,
                    } as AwsSamDebuggerConfiguration

                    // runtime is optional for ZIP, but required for image-based
                    if (scenario.baseImage) {
                        testConfig.lambda = {
                            runtime: scenario.runtime,
                        }

                        // HACK: set GOPROXY=direct or it will fail to build. https://golang.org/ref/mod#module-proxy
                        // This only applies for our internal systems
                        if (scenario.language === 'go') {
                            const dockerfilePath: string = path.join(path.dirname(appPath), 'Dockerfile')
                            insertTextIntoFile('ENV GOPROXY=direct', dockerfilePath, 1)
                        }
                    }

                    // XXX: force load since template registry seems a bit flakey
                    await ext.templateRegistry.addItemToRegistry(vscode.Uri.file(cfnTemplatePath))

                    await startDebugger(scenario, scenarioIndex, target, testConfig, testDisposables, sessionLog)
                }
            })
        })

        async function createSamApplication(location: string): Promise<void> {
            const initArguments: SamCliInitArgs = {
                name: samApplicationName,
                location: location,
                dependencyManager: scenario.dependencyManager,
            }
            if (scenario.baseImage) {
                initArguments.baseImage = scenario.baseImage
            } else if (scenario.language === 'typescript') {
                initArguments.runtime = scenario.runtime
                initArguments.template = typeScriptBackendTemplate
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
