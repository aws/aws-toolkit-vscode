/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { Runtime } from 'aws-sdk/clients/lambda'
import { mkdtempSync } from 'fs' // eslint-disable-line no-restricted-imports
import * as path from 'path'
import * as semver from 'semver'
import * as vscode from 'vscode'
import * as vscodeUtils from '../../src/shared/utilities/vsCodeUtils'
import { DependencyManager } from '../../src/lambda/models/samLambdaRuntime'
import { helloWorldTemplate } from '../../src/lambda/models/samTemplates'
import { getSamCliContext } from '../../src/shared/sam/cli/samCliContext'
import { runSamCliInit, SamCliInitArgs } from '../../src/shared/sam/cli/samCliInit'
import { Language } from '../shared/codelens/codeLensUtils'
import { VSCODE_EXTENSION_ID } from '../shared/extensions'
import { fileExists, tryRemoveFolder } from '../shared/filesystemUtilities'
import { AddSamDebugConfigurationInput } from '../shared/sam/debugger/commands/addSamDebugConfiguration'
import { findParentProjectFile } from '../shared/utilities/workspaceUtils'
import * as testUtils from './integrationTestsUtilities'
import { waitUntil } from '../shared/utilities/timeoutUtils'
import { AwsSamDebuggerConfiguration } from '../shared/sam/debugger/awsSamDebugConfiguration.gen'
import { AwsSamTargetType } from '../shared/sam/debugger/awsSamDebugConfiguration'
import { insertTextIntoFile } from '../shared/utilities/textUtilities'
import globals from '../shared/extensionGlobals'
import { closeAllEditors, getWorkspaceFolder } from '../test/testUtil'
import { ToolkitError } from '../shared/errors'
import { SamAppLocation } from '../awsService/appBuilder/explorer/samProject'
import { AppNode } from '../awsService/appBuilder/explorer/nodes/appNode'
import sinon from 'sinon'
import { getTestWindow } from '../test/shared/vscode/window'
import { ParamsSource, runBuild } from '../shared/sam/build'
import { DataQuickPickItem } from '../shared/ui/pickerPrompter'
import fs from '../shared/fs/fs'

const projectFolder = testUtils.getTestWorkspaceFolder()

/* Test constants go here */
const codelensTimeout: number = 60000
const codelensRetryInterval: number = 5000
const noDebugSessionTimeout: number = 5000
const noDebugSessionInterval: number = 100

/** Go can't handle API tests yet */
const skipLanguagesOnApi = ['go']

interface TestScenario {
    displayName: string
    runtime: Runtime
    baseImage?: string
    path: string
    debugSessionType: string
    language: Language
    dependencyManager: DependencyManager
    /** Minimum vscode version required by the relevant third-party extension. */
    vscodeMinimum: string
}

// When testing additional runtimes, consider pulling the docker container in buildspec\linuxIntegrationTests.yml
// to reduce the chance of automated tests timing out.
const scenarios: TestScenario[] = [
    // zips
    {
        runtime: 'nodejs18.x',
        displayName: 'nodejs18.x (ZIP)',
        path: 'hello-world/app.mjs',
        debugSessionType: 'pwa-node',
        language: 'javascript',
        dependencyManager: 'npm',
        vscodeMinimum: '1.50.0',
    },
    {
        runtime: 'nodejs20.x',
        displayName: 'nodejs20.x (ZIP)',
        path: 'hello-world/app.mjs',
        debugSessionType: 'pwa-node',
        language: 'javascript',
        dependencyManager: 'npm',
        vscodeMinimum: '1.50.0',
    },
    {
        runtime: 'nodejs22.x',
        displayName: 'nodejs22.x (ZIP)',
        path: 'hello-world/app.mjs',
        debugSessionType: 'pwa-node',
        language: 'javascript',
        dependencyManager: 'npm',
        vscodeMinimum: '1.78.0',
    },
    {
        runtime: 'python3.10',
        displayName: 'python 3.10 (ZIP)',
        path: 'hello_world/app.py',
        debugSessionType: 'python',
        language: 'python',
        dependencyManager: 'pip',
        // https://github.com/microsoft/vscode-python/blob/main/package.json
        vscodeMinimum: '1.77.0',
    },
    {
        runtime: 'python3.11',
        displayName: 'python 3.11 (ZIP)',
        path: 'hello_world/app.py',
        debugSessionType: 'python',
        language: 'python',
        dependencyManager: 'pip',
        // https://github.com/microsoft/vscode-python/blob/main/package.json
        vscodeMinimum: '1.78.0',
    },
    {
        runtime: 'python3.12',
        displayName: 'python 3.12 (ZIP)',
        path: 'hello_world/app.py',
        debugSessionType: 'python',
        language: 'python',
        dependencyManager: 'pip',
        // https://github.com/microsoft/vscode-python/blob/main/package.json
        vscodeMinimum: '1.78.0',
    },
    {
        runtime: 'python3.13',
        displayName: 'python 3.13 (ZIP)',
        path: 'hello_world/app.py',
        debugSessionType: 'python',
        language: 'python',
        dependencyManager: 'pip',
        // https://github.com/microsoft/vscode-python/blob/main/package.json
        vscodeMinimum: '1.78.0',
    },
    {
        runtime: 'dotnet6',
        displayName: 'dotnet6 (ZIP)',
        path: 'src/HelloWorld/Function.cs',
        debugSessionType: 'coreclr',
        language: 'csharp',
        dependencyManager: 'cli-package',
        vscodeMinimum: '1.80.0',
    },
    {
        runtime: 'java8.al2',
        displayName: 'java8.al2 (Maven ZIP)',
        path: 'HelloWorldFunction/src/main/java/helloworld/App.java',
        debugSessionType: 'java',
        language: 'java',
        dependencyManager: 'maven',
        vscodeMinimum: '1.50.0',
    },
    {
        runtime: 'java11',
        displayName: 'java11 (Gradle ZIP)',
        path: 'HelloWorldFunction/src/main/java/helloworld/App.java',
        debugSessionType: 'java',
        language: 'java',
        dependencyManager: 'gradle',
        vscodeMinimum: '1.50.0',
    },
    {
        runtime: 'java17',
        displayName: 'java11 (Gradle ZIP)',
        path: 'HelloWorldFunction/src/main/java/helloworld/App.java',
        debugSessionType: 'java',
        language: 'java',
        dependencyManager: 'gradle',
        vscodeMinimum: '1.50.0',
    },
    // {
    //     runtime: 'go1.x',
    //     displayName: 'go1.x (ZIP)',
    //     path: 'hello-world/main.go',
    //     debugSessionType: 'delve',
    //     language: 'go',
    //     dependencyManager: 'mod',
    //     // https://github.com/golang/vscode-go/blob/master/package.json
    //     vscodeMinimum: '1.67.0',
    // },

    // images
    {
        runtime: 'nodejs18.x',
        displayName: 'nodejs18.x (Image)',
        baseImage: 'amazon/nodejs18.x-base',
        path: 'hello-world/app.mjs',
        debugSessionType: 'pwa-node',
        language: 'javascript',
        dependencyManager: 'npm',
        vscodeMinimum: '1.50.0',
    },
    {
        runtime: 'nodejs20.x',
        displayName: 'nodejs20.x (Image)',
        baseImage: 'amazon/nodejs20.x-base',
        path: 'hello-world/app.mjs',
        debugSessionType: 'pwa-node',
        language: 'javascript',
        dependencyManager: 'npm',
        vscodeMinimum: '1.50.0',
    },
    {
        runtime: 'nodejs22.x',
        displayName: 'nodejs22.x (Image)',
        baseImage: 'amazon/nodejs22.x-base',
        path: 'hello-world/app.mjs',
        debugSessionType: 'pwa-node',
        language: 'javascript',
        dependencyManager: 'npm',
        vscodeMinimum: '1.78.0',
    },
    {
        runtime: 'python3.10',
        displayName: 'python 3.10 (ZIP)',
        baseImage: 'amazon/python3.10-base',
        path: 'hello_world/app.py',
        debugSessionType: 'python',
        language: 'python',
        dependencyManager: 'pip',
        // https://github.com/microsoft/vscode-python/blob/main/package.json
        vscodeMinimum: '1.77.0',
    },
    {
        runtime: 'python3.11',
        displayName: 'python 3.11 (ZIP)',
        baseImage: 'amazon/python3.11-base',
        path: 'hello_world/app.py',
        debugSessionType: 'python',
        language: 'python',
        dependencyManager: 'pip',
        // https://github.com/microsoft/vscode-python/blob/main/package.json
        vscodeMinimum: '1.78.0',
    },
    {
        runtime: 'python3.12',
        displayName: 'python 3.12 (ZIP)',
        baseImage: 'amazon/python3.12-base',
        path: 'hello_world/app.py',
        debugSessionType: 'python',
        language: 'python',
        dependencyManager: 'pip',
        // https://github.com/microsoft/vscode-python/blob/main/package.json
        vscodeMinimum: '1.78.0',
    },
    {
        runtime: 'python3.13',
        displayName: 'python 3.13 (ZIP)',
        baseImage: 'amazon/python3.13-base',
        path: 'hello_world/app.py',
        debugSessionType: 'python',
        language: 'python',
        dependencyManager: 'pip',
        // https://github.com/microsoft/vscode-python/blob/main/package.json
        vscodeMinimum: '1.78.0',
    },
    // {
    //     runtime: 'go1.x',
    //     displayName: 'go1.x (Image)',
    //     baseImage: 'amazon/go1.x-base',
    //     path: 'hello-world/main.go',
    //     debugSessionType: 'delve',
    //     language: 'go',
    //     dependencyManager: 'mod',
    //     // https://github.com/golang/vscode-go/blob/master/package.json
    //     vscodeMinimum: '1.67.0',
    // },
    {
        runtime: 'java8.al2',
        displayName: 'java8.al2 (Gradle Image)',
        path: 'HelloWorldFunction/src/main/java/helloworld/App.java',
        baseImage: 'amazon/java8.al2-base',
        debugSessionType: 'java',
        language: 'java',
        dependencyManager: 'gradle',
        vscodeMinimum: '1.50.0',
    },
    {
        runtime: 'java11',
        displayName: 'java11 (Maven Image)',
        path: 'HelloWorldFunction/src/main/java/helloworld/App.java',
        baseImage: 'amazon/java11-base',
        debugSessionType: 'java',
        language: 'java',
        dependencyManager: 'maven',
        vscodeMinimum: '1.50.0',
    },
    {
        runtime: 'java17',
        displayName: 'java17 (Maven Image)',
        path: 'HelloWorldFunction/src/main/java/helloworld/App.java',
        baseImage: 'amazon/java17-base',
        debugSessionType: 'java',
        language: 'java',
        dependencyManager: 'maven',
        vscodeMinimum: '1.50.0',
    },
    {
        runtime: 'dotnet6',
        displayName: 'dotnet6 (Image)',
        path: 'src/HelloWorld/Function.cs',
        baseImage: 'amazon/dotnet6-base',
        debugSessionType: 'coreclr',
        language: 'csharp',
        dependencyManager: 'cli-package',
        vscodeMinimum: '1.80.0',
    },
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
            vscode.debug.onDidTerminateDebugSession(async (session) => {
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

    // Executes the 'F5' action to start debugging
    await vscode.debug.startDebugging(undefined, testConfig)
    if (!vscode.debug.activeDebugSession) {
        logSession('EXIT', `${testConfig.name} (exited immediately)`)
        return
    }
    logSession('START', vscode.debug.activeDebugSession.name)

    // Some tests need to hit debug continue to the debugger to complete.
    // Testing locally seemed to take 600-800 millis to run.
    const result = await waitUntil(
        async () => {
            try {
                await vscode.commands.executeCommand('workbench.action.debug.continue')
                return true
            } catch {
                return false
            }
        },
        { interval: 500, timeout: 10_000 }
    )
    if (result === undefined) {
        throw new ToolkitError(`Toolkit: Debug session did not stop. Something may have gotten stuck.`)
    }

    return success
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
    // TODO: Must be reactivated when go tests are enabled above.
    // Caveat: v0.40.1 of the go extension breaks this line (see changelog for this version)
    // await vscodeUtils.activateExtension(VSCODE_EXTENSION_ID.go, false)
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
        await config.update('server.launchMode', 'Standard')

        await activateExtensions()
        await testUtils.configureAwsToolkitExtension()
        // await testUtils.configureGoExtension()

        testSuiteRoot = mkdtempSync(path.join(projectFolder, 'inttest'))
        console.log('testSuiteRoot: ', testSuiteRoot)
        await fs.mkdir(testSuiteRoot)
    })

    after(async function () {
        await tryRemoveFolder(testSuiteRoot)
        // Print a summary of session that were seen by `onDidStartDebugSession`.
        const sessionReport = sessionLog.map((x) => `    ${x}`).join('\n')
        await config.update('server.launchMode', javaLanguageSetting)
        console.log(`DebugSessions seen in this run:\n${sessionReport}`)
    })

    describe('SAM install test', async () => {
        let runtimeTestRoot: string
        let randomTestScenario: TestScenario

        before(async function () {
            if (scenarios.length === 0) {
                throw new Error('There are no scenarios available.')
            }
            randomTestScenario = scenarios[0]

            runtimeTestRoot = path.join(testSuiteRoot, 'randomScenario')
            await fs.mkdir(runtimeTestRoot)
        })

        after(async function () {
            await tryRemoveFolder(runtimeTestRoot)
        })

        it('produces an error when creating a SAM Application to the same location', async function () {
            await createSamApplication(runtimeTestRoot, randomTestScenario)
            await assert.rejects(createSamApplication(runtimeTestRoot, randomTestScenario), 'Promise was not rejected')
        })
    })

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

    for (let scenarioIndex = 0; scenarioIndex < scenarios.length; scenarioIndex++) {
        const scenario = scenarios[scenarioIndex]

        describe(`SAM runtime: ${scenario.displayName}`, async function () {
            let runtimeTestRoot: string

            before(async function () {
                runtimeTestRoot = path.join(testSuiteRoot, scenario.runtime)
                console.log('runtimeTestRoot: ', runtimeTestRoot)
                await fs.mkdir(runtimeTestRoot)
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
                    testDir = mkdtempSync(path.join(runtimeTestRoot, 'samapp-'))
                    log(`testDir: ${testDir}`)

                    await createSamApplication(testDir, scenario)
                    appPath = path.join(testDir, samApplicationName, scenario.path)

                    cfnTemplatePath = path.join(testDir, samApplicationName, 'template.yaml')
                    const readmePath = path.join(testDir, samApplicationName, 'README.md')
                    assert.ok(await fileExists(cfnTemplatePath), `Expected SAM template to exist at ${cfnTemplatePath}`)
                    assert.ok(await fileExists(readmePath), `Expected SAM App readme to exist at ${readmePath}`)

                    samAppCodeUri = await openSamAppFile(appPath)
                })

                beforeEach(async function () {
                    testDisposables = []
                    await closeAllEditors()
                })

                afterEach(async function () {
                    testDisposables.forEach((d) => d.dispose())
                    await stopDebugger(undefined)
                })

                after(async function () {
                    // don't clean up after java tests so the java language server doesn't freak out
                    if (scenario.language !== 'java') {
                        await tryRemoveFolder(testDir)
                    }
                })

                it('produces an Add Debug Configuration codelens', async function () {
                    if (
                        scenario.language === 'csharp' || // TODO
                        semver.lt(vscode.version, scenario.vscodeMinimum)
                    ) {
                        this.skip()
                    }
                    const codeLenses = await testUtils.getAddConfigCodeLens(
                        samAppCodeUri,
                        codelensTimeout,
                        codelensRetryInterval
                    )
                    assert.ok(codeLenses, 'No CodeLenses provided')
                    assert.strictEqual(codeLenses.length, 2, 'Incorrect amount of CodeLenses provided')

                    let manifestFile: RegExp
                    switch (scenario.language) {
                        case 'javascript':
                            manifestFile = /^package\.json$/
                            break
                        case 'python':
                            manifestFile = /^requirements\.txt$/
                            break
                        // case 'csharp':
                        //     manifestFile = /^.*\.csproj$/
                        //     break
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
                        skipLanguagesOnApi.includes(scenario.language) ||
                        semver.lt(vscode.version, scenario.vscodeMinimum)
                    ) {
                        this.skip()
                    }

                    await testTarget('api', {
                        api: {
                            path: '/hello',
                            httpMethod: 'get',
                            headers: { 'accept-language': 'fr-FR' },
                        },
                    })
                })

                it('target=template: invokes and attaches on debug request (F5)', async function () {
                    if (semver.lt(vscode.version, scenario.vscodeMinimum)) {
                        this.skip()
                    }

                    await testTarget('template')
                })

                async function testTarget(target: AwsSamTargetType, extraConfig: any = {}) {
                    // Allow previous sessions to go away.
                    await waitUntil(async () => vscode.debug.activeDebugSession === undefined, {
                        timeout: noDebugSessionTimeout,
                        interval: noDebugSessionInterval,
                        truthy: true,
                    })

                    // We exclude the Node debug type since it causes the most erroneous failures with CI.
                    // However, the fact that there are sessions from previous tests is still an issue, so
                    // a warning will be logged under the current session.
                    if (vscode.debug.activeDebugSession) {
                        assert.strictEqual(
                            vscode.debug.activeDebugSession.type,
                            'pwa-node',
                            `unexpected debug session in progress: ${JSON.stringify(
                                vscode.debug.activeDebugSession,
                                undefined,
                                2
                            )}`
                        )

                        sessionLog.push(`(WARNING) Unexpected debug session ${vscode.debug.activeDebugSession.name}`)
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
                        sam: {
                            containerBuild: true,
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
                            await insertTextIntoFile('ENV GOPROXY=direct', dockerfilePath, 1)
                        }
                    }

                    // XXX: force load since template registry seems a bit flakey
                    await (await globals.templateRegistry).addItem(vscode.Uri.file(cfnTemplatePath))

                    await startDebugger(scenario, scenarioIndex, target, testConfig, testDisposables, sessionLog)
                }
            })
        })
    }

    describe('SAM Build', async function () {
        let workspaceFolder: vscode.WorkspaceFolder
        // We're testing only one case (python 3.10 (ZIP)) on the integration tests. More niche cases are handled as unit tests.
        const scenarioIndex = 2
        const scenario = scenarios[scenarioIndex]
        let testRoot: string
        let sandbox: sinon.SinonSandbox
        let testDir: string
        let cfnTemplatePath: string

        before(async function () {
            workspaceFolder = getWorkspaceFolder(testSuiteRoot)
            testRoot = path.join(testSuiteRoot, scenario.runtime)
            await fs.mkdir(testRoot)

            testDir = mkdtempSync(path.join(testRoot, 'samapp-'))
            console.log(`testDir: ${testDir}`)

            await createSamApplication(testDir, scenario)

            cfnTemplatePath = path.join(testDir, samApplicationName, 'template.yaml')
        })

        after(async function () {
            await tryRemoveFolder(testSuiteRoot)
            // don't clean up after java tests so the java language server doesn't freak out
            if (scenario.language !== 'java') {
                await tryRemoveFolder(testRoot)
            }
        })

        beforeEach(async function () {
            sandbox = sinon.createSandbox()
            await closeAllEditors()
        })

        afterEach(async function () {
            sandbox.restore()
        })

        it('can build a SAM Template', async function () {
            // Instantiate AppNode
            const samAppLocation = {
                samTemplateUri: vscode.Uri.file(cfnTemplatePath),
                workspaceFolder: workspaceFolder,
            } as SamAppLocation
            const appNode = new AppNode(samAppLocation)

            getTestWindow().onDidShowQuickPick((input) => {
                if (input.title?.includes('Specify parameter source for build')) {
                    input.acceptItem(input.items[0])
                    const item = input.items[0] as DataQuickPickItem<ParamsSource>
                    assert.deepStrictEqual(item.data as ParamsSource, ParamsSource.Specify)
                } else if (input.title?.includes('Select build flags')) {
                    const item1 = input.items[2] as DataQuickPickItem<string>
                    const item2 = input.items[4] as DataQuickPickItem<string>
                    const item3 = input.items[7] as DataQuickPickItem<string>
                    input.acceptItems(item1, item2, item3) // --cached, --parallel, --use-container

                    assert.strictEqual(item1.data as string, '--cached')
                    assert.strictEqual(item2.data as string, '--parallel')
                    assert.strictEqual(item3.data as string, '--use-container')
                }
            })

            const response = await runBuild(appNode)

            assert.deepStrictEqual(response, {
                isSuccess: true,
            })

            const builtTemplatePath = path.join(testDir, samApplicationName, '.aws-sam', 'build', 'template.yaml')
            assert.ok(await fs.existsFile(builtTemplatePath))
        })
    })

    async function createSamApplication(location: string, scenario: TestScenario): Promise<void> {
        const initArguments: SamCliInitArgs = {
            name: samApplicationName,
            location: location,
            dependencyManager: scenario.dependencyManager,
        }
        if (scenario.baseImage) {
            initArguments.baseImage = scenario.baseImage
        } else {
            initArguments.runtime = scenario.runtime
            initArguments.template = helloWorldTemplate
        }
        const samCliContext = getSamCliContext()
        await runSamCliInit(initArguments, samCliContext)
        // XXX: Fixes flakiness. Ensures the files from creation of sam
        // app are processed by code lens file watcher. Otherwise, potential
        // issues of file not in registry before it is found.
        await globals.codelensRootRegistry.rebuild()
    }
})
