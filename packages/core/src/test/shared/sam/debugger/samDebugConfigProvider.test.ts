/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as os from 'os'
import * as path from 'path'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import * as lambdaModel from '../../../../lambda/models/samLambdaRuntime'
import { CloudFormationTemplateRegistry } from '../../../../shared/fs/templateRegistry'
import { makeTemporaryToolkitFolder } from '../../../../shared/filesystemUtilities'
import {
    TemplateTargetProperties,
    AwsSamDebuggerConfiguration,
    API_TARGET_TYPE,
    AWS_SAM_DEBUG_TYPE,
    CODE_TARGET_TYPE,
    DIRECT_INVOKE_TYPE,
    TEMPLATE_TARGET_TYPE,
    createTemplateAwsSamDebugConfig,
    ensureRelativePaths,
    createCodeAwsSamDebugConfig,
    CodeTargetProperties,
    createApiAwsSamDebugConfig,
    APIGatewayProperties,
    PathMapping,
} from '../../../../shared/sam/debugger/awsSamDebugConfiguration'
import { SamDebugConfigProvider, SamLaunchRequestArgs } from '../../../../shared/sam/debugger/awsSamDebugger'
import * as debugConfiguration from '../../../../lambda/local/debugConfiguration'
import * as pathutil from '../../../../shared/utilities/pathUtils'
import { FakeExtensionContext } from '../../../fakeExtensionContext'
import * as testutil from '../../../testUtil'
import { assertFileText } from '../../../testUtil'
import {
    makeSampleSamTemplateYaml,
    makeSampleYamlResource,
    makeSampleYamlParameters,
} from '../../cloudformation/cloudformationTestUtils'
import { CredentialsStore } from '../../../../auth/credentials/store'
import { CredentialsProviderManager } from '../../../../auth/providers/credentialsProviderManager'
import { Credentials } from '@aws-sdk/types'
import { ExtContext } from '../../../../shared/extensions'
import { getLogger } from '../../../../shared/logger/logger'
import { CredentialsProvider } from '../../../../auth/providers/credentials'
import globals from '../../../../shared/extensionGlobals'
import { isCI } from '../../../../shared/vscode/env'
import { fs } from '../../../../shared'

/**
 * Asserts the contents of a "launch config" (the result of `makeConfig()` or
 * `resolveDebugConfiguration()` invoked on a user-provided "debug config").
 */
function assertEqualLaunchConfigs(actual: SamLaunchRequestArgs, expected: SamLaunchRequestArgs) {
    // Deep copy, do not modify the original variables.
    actual = { ...actual }
    expected = { ...expected }

    assert.strictEqual(actual.workspaceFolder.name, expected.workspaceFolder.name)

    // Compare filepaths (before removing them for deep-compare).
    testutil.assertEqualPaths(actual.workspaceFolder.uri.fsPath, expected.workspaceFolder.uri.fsPath)

    // Port number is unstable; check that it looks reasonable.
    assert.ok(!actual.apiPort || actual.apiPort > 5000)
    assert.ok(!actual.debugPort || actual.debugPort > 5000)
    assert.strictEqual(actual.port, expected.port)

    // Build dir is randomly-generated; check that it looks reasonable.
    assert.ok(actual.baseBuildDir && actual.baseBuildDir.length > 9)
    if (expected.type === 'python') {
        // manifestPath is randomly-generated; check that it looks reasonable.
        assert.ok(actual.manifestPath && actual.manifestPath.length > 9)
    }

    // should never be defined if we're not debugging
    if (expected.noDebug) {
        delete expected.debugArgs
        delete expected.containerEnvFile
        delete expected.containerEnvVars
    }

    // Normalize path fields before comparing.
    for (const o of [actual, expected]) {
        o.codeRoot = pathutil.normalize(o.codeRoot)
        o.containerEnvFile = o.containerEnvFile ? pathutil.normalize(o.containerEnvFile) : o.containerEnvFile
        o.envFile = o.envFile ? pathutil.normalize(o.envFile) : undefined
        o.eventPayloadFile = o.eventPayloadFile ? pathutil.normalize(o.eventPayloadFile) : undefined
        o.debuggerPath = o.debuggerPath ? pathutil.normalize(o.debuggerPath) : o.debuggerPath
        o.localRoot = o.localRoot ? pathutil.normalize(o.localRoot) : o.localRoot
    }

    // Remove noisy properties before doing a deep-compare.
    for (const o of [actual, expected]) {
        delete o.manifestPath
        delete (o as any).documentUri
        delete (o as any).templatePath
        delete (o as any).workspaceFolder
        delete (o as any).codeRoot
        delete (o as any).localRoot // Node-only
        delete (o as any).debuggerPath // Dotnet-only
    }
    assert.deepStrictEqual(actual, expected)
}

/**
 * Tests `noDebug=true` for the given `input` and fixes up the given `expected`
 * result, for a `target=template` config.
 */
async function assertEqualNoDebugTemplateTarget(
    input: any,
    expected: SamLaunchRequestArgs,
    folder: vscode.WorkspaceFolder,
    debugConfigProvider: SamDebugConfigProvider,
    noFiles?: boolean
) {
    ;(input as any).noDebug = true
    const actualNoDebug = (await debugConfigProvider.makeConfig(folder, input))!
    const expectedNoDebug: SamLaunchRequestArgs = {
        ...expected,
        noDebug: true,
        request: 'launch',
        debugPort: undefined,
        port: -1,
        baseBuildDir: actualNoDebug.baseBuildDir,
        envFile: noFiles ? undefined : `${actualNoDebug.baseBuildDir}/env-vars.json`,
        eventPayloadFile: noFiles ? undefined : `${actualNoDebug.baseBuildDir}/event.json`,
    }
    assertEqualLaunchConfigs(actualNoDebug, expectedNoDebug)
}

describe('SamDebugConfigurationProvider', async function () {
    let debugConfigProvider: SamDebugConfigProvider
    let tempFolder: string
    let tempFolderSimilarName: string | undefined
    let tempFile: vscode.Uri
    let fakeWorkspaceFolder: vscode.WorkspaceFolder
    let fakeContext: ExtContext
    let sandbox: sinon.SinonSandbox
    const resourceName = 'myResource'
    const fakeCredentials: Credentials = {
        accessKeyId: 'fake-access-id',
        secretAccessKey: 'fake-secret',
        sessionToken: 'fake-session',
    }

    beforeEach(async function () {
        fakeContext = await FakeExtensionContext.getFakeExtContext()
        await fakeContext.awsContext.setCredentials({
            accountId: '9888888',
            credentials: fakeCredentials,
            credentialsId: 'profile:fake',
            defaultRegion: 'us-west-2',
        })
        debugConfigProvider = new SamDebugConfigProvider(fakeContext)
        sandbox = sinon.createSandbox()

        fakeWorkspaceFolder = await testutil.createTestWorkspaceFolder()
        tempFolder = fakeWorkspaceFolder.uri.fsPath
        tempFile = vscode.Uri.file(path.join(tempFolder, 'test.yaml'))
        tempFolderSimilarName = undefined
    })

    afterEach(async function () {
        await fs.delete(tempFolder, { recursive: true })
        if (tempFolderSimilarName) {
            await fs.delete(tempFolderSimilarName, { recursive: true })
        }
        ;(await globals.templateRegistry).reset()
        sandbox.restore()
    })

    describe('provideDebugConfig', async function () {
        it('failure modes', async function () {
            // No workspace folder:
            assert.deepStrictEqual(await debugConfigProvider.provideDebugConfigurations(undefined), [])
            // Workspace with no templates:
            assert.deepStrictEqual(await debugConfigProvider.provideDebugConfigurations(fakeWorkspaceFolder), [])

            // Malformed template.yaml:
            await testutil.toFile('bogus', tempFile.fsPath)
            await (await globals.templateRegistry).addItem(tempFile)
            assert.deepStrictEqual(await debugConfigProvider.provideDebugConfigurations(fakeWorkspaceFolder), [])
        })

        it('Ignores non function type resources', async function () {
            const bigYamlStr = `${makeSampleSamTemplateYaml(true)}\nTestResource2:\n .   Type: AWS::Serverless::Api`

            await testutil.toFile(bigYamlStr, tempFile.fsPath)
            await (await globals.templateRegistry).addItem(tempFile)
            const provided = await debugConfigProvider.provideDebugConfigurations(fakeWorkspaceFolder)
            assert.strictEqual(provided!.length, 1)
        })

        it('returns one item if a template with one resource is in the workspace', async function () {
            await testutil.toFile(makeSampleSamTemplateYaml(true), tempFile.fsPath)
            await (await globals.templateRegistry).addItem(tempFile)
            const provided = await debugConfigProvider.provideDebugConfigurations(fakeWorkspaceFolder)
            assert.notStrictEqual(provided, undefined)
            assert.strictEqual(provided!.length, 1)
            assert.strictEqual(
                provided![0].name,
                `${path.basename(fakeWorkspaceFolder.uri.fsPath)}:TestResource (nodejs12.x)`
            )
        })

        it('returns multiple items if a template with multiple resources is in the workspace', async function () {
            const resources = ['resource1', 'resource2']
            const bigYamlStr = `${makeSampleSamTemplateYaml(true, {
                resourceName: resources[0],
            })}\n${makeSampleYamlResource({ resourceName: resources[1] })}`
            await testutil.toFile(bigYamlStr, tempFile.fsPath)
            await (await globals.templateRegistry).addItem(tempFile)
            const provided = await debugConfigProvider.provideDebugConfigurations(fakeWorkspaceFolder)
            assert.notStrictEqual(provided, undefined)
            if (provided) {
                assert.strictEqual(provided.length, 2)
                assert.ok(resources.includes((provided[0].invokeTarget as TemplateTargetProperties).logicalId))
                assert.ok(resources.includes((provided[1].invokeTarget as TemplateTargetProperties).logicalId))
            }
        })

        it('only detects the specifically targeted workspace folder (and its subfolders)', async function () {
            const resources = ['resource1', 'resource2']
            const badResourceName = 'notIt'

            const nestedDir = path.join(tempFolder, 'nested')
            const nestedYaml = vscode.Uri.file(path.join(nestedDir, 'test.yaml'))
            tempFolderSimilarName = tempFolder + 'SimilarName'
            const similarNameYaml = vscode.Uri.file(path.join(tempFolderSimilarName, 'test.yaml'))

            await fs.mkdir(nestedDir)
            await fs.mkdir(tempFolderSimilarName)

            await testutil.toFile(makeSampleSamTemplateYaml(true, { resourceName: resources[0] }), tempFile.fsPath)
            await testutil.toFile(makeSampleSamTemplateYaml(true, { resourceName: resources[1] }), nestedYaml.fsPath)
            await testutil.toFile(
                makeSampleSamTemplateYaml(true, { resourceName: badResourceName }),
                similarNameYaml.fsPath
            )

            await (await globals.templateRegistry).addItem(tempFile)
            await (await globals.templateRegistry).addItem(nestedYaml)
            await (await globals.templateRegistry).addItem(similarNameYaml)

            const provided = await debugConfigProvider.provideDebugConfigurations(fakeWorkspaceFolder)
            assert.notStrictEqual(provided, undefined)
            if (provided) {
                assert.strictEqual(provided.length, 2)
                assert.ok(resources.includes((provided[0].invokeTarget as TemplateTargetProperties).logicalId))
                assert.ok(resources.includes((provided[1].invokeTarget as TemplateTargetProperties).logicalId))
                assert.ok(!resources.includes(badResourceName))
            }
        })

        it('Returns api function type resources as additional api configurations', async function () {
            const bigYamlStr = `${makeSampleSamTemplateYaml(true)}
            Events:
                HelloWorld2:
                    Type: Api
                    Properties:
                        Path: /hello
                        Method: get`

            await testutil.toFile(bigYamlStr, tempFile.fsPath)
            await (await globals.templateRegistry).addItem(tempFile)
            const provided = await debugConfigProvider.provideDebugConfigurations(fakeWorkspaceFolder)
            assert.strictEqual(provided!.length, 2)
            assert.strictEqual(provided![1].invokeTarget.target, API_TARGET_TYPE)
            assert.strictEqual(provided![1].api?.path, '/hello')
            assert.strictEqual(provided![1].api?.httpMethod, 'get')
        })

        it('Ignores HttpApi events', async function () {
            const bigYamlStr = `${makeSampleSamTemplateYaml(true)}
            Events:
                HelloWorld2:
                    Type: HttpApi`

            await testutil.toFile(bigYamlStr, tempFile.fsPath)
            await (await globals.templateRegistry).addItem(tempFile)
            const provided = await debugConfigProvider.provideDebugConfigurations(fakeWorkspaceFolder)
            assert.strictEqual(provided!.length, 1)
        })
    })

    describe('makeConfig', async function () {
        describe('buildDir', function () {
            it('uses `buildDir` as `baseBuildDir` when provided', async function () {
                const buildDir = (await testutil.createTestWorkspaceFolder('my-build-dir')).uri.fsPath
                const folder = testutil.getWorkspaceFolder(testutil.getProjectDir())
                const launchConfig = await getConfig(
                    debugConfigProvider,
                    await globals.templateRegistry,
                    'testFixtures/workspaceFolder/js-plain-sam-app/'
                )
                const config = launchConfig.config as AwsSamDebuggerConfiguration & {
                    invokeTarget: { target: 'template' }
                }
                config.sam = Object.assign(launchConfig.config.sam ?? {}, { buildDir })
                config.invokeTarget.templatePath = config.invokeTarget.templatePath.replace(
                    '${workspaceFolder}',
                    launchConfig.folder.uri.fsPath
                )

                const actual = await debugConfigProvider.makeConfig(folder, config)
                testutil.assertEqualPaths(actual?.baseBuildDir ?? '', buildDir)
            })
        })

        it('failure modes', async function () {
            const config = await getConfig(
                debugConfigProvider,
                await globals.templateRegistry,
                'testFixtures/workspaceFolder/csharp6-zip/'
            )

            // No workspace folder:
            await assert.rejects(() => debugConfigProvider.makeConfig(undefined, config.config))

            // No launch.json (vscode will pass an empty config.request):
            await assert.rejects(() => debugConfigProvider.makeConfig(undefined, { ...config.config, request: '' }))

            // Unknown runtime:
            config.config.lambda = {
                runtime: 'happy-runtime-42',
            }
            await assert.rejects(() => debugConfigProvider.makeConfig(config.folder, config.config))

            // bad credentials
            const mockCredentialsStore: CredentialsStore = new CredentialsStore()

            const credentialsProvider: CredentialsProvider = {
                getCredentials: sandbox.stub().resolves({} as any as AWS.Credentials),
                getProviderType: sandbox.stub().resolves('profile'),
                getTelemetryType: sandbox.stub().resolves('staticProfile'),
                getCredentialsId: sandbox.stub().returns({
                    credentialSource: 'sharedCredentials',
                    credentialTypeId: 'someId',
                }),
                getDefaultRegion: sandbox.stub().returns('someRegion'),
                getHashCode: sandbox.stub().returns('1234'),
                canAutoConnect: sandbox.stub().returns(true),
                isAvailable: sandbox.stub().returns(Promise.resolve(true)),
            }
            const getCredentialsProviderStub = sandbox.stub(
                CredentialsProviderManager.getInstance(),
                'getCredentialsProvider'
            )
            getCredentialsProviderStub.resolves(credentialsProvider)
            sandbox.stub(mockCredentialsStore, 'upsertCredentials').throws()
            const debugConfigProviderMockCredentials = new SamDebugConfigProvider({
                ...fakeContext,
                credentialsStore: mockCredentialsStore,
            })

            await assert.rejects(() =>
                debugConfigProviderMockCredentials.makeConfig(config.folder, {
                    ...config.config,
                    aws: {
                        credentials: 'profile:error',
                    },
                })
            )
        })

        it('generates a valid resource name based on the projectDir #1685', async function () {
            const appDir = pathutil.normalize(
                path.join(testutil.getProjectDir(), 'testFixtures/workspaceFolder/go1-plain-sam-app')
            )
            const folder = testutil.getWorkspaceFolder(appDir)
            const input = {
                type: AWS_SAM_DEBUG_TYPE,
                name: 'test-go-code-logicalid',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: CODE_TARGET_TYPE,
                    lambdaHandler: 'hello-world',
                    projectRoot: '.', // Issue #1685
                },
                lambda: {
                    runtime: 'go1.x',
                },
            }
            const config = (await debugConfigProvider.makeConfig(folder, input))!

            await assertFileText(
                config.templatePath,
                `Resources:
  go1plainsamapp:
    Type: AWS::Serverless::Function
    Properties:
      Handler: hello-world
      CodeUri: >-
        ${config.codeRoot}
      Runtime: go1.x
`
            )
        })

        it('rejects when resolving debug configurations with an invalid request type', async function () {
            await assert.rejects(() =>
                debugConfigProvider.makeConfig(undefined, {
                    type: AWS_SAM_DEBUG_TYPE,
                    name: 'whats in a name',
                    request: 'not-direct-invoke',
                    invokeTarget: {
                        target: CODE_TARGET_TYPE,
                        lambdaHandler: 'sick handles',
                        projectRoot: 'root as in beer',
                    },
                })
            )
        })

        it('rejects when resolving debug configurations with an invalid target type', async function () {
            const tgt = 'not-code' as 'code'
            await assert.rejects(() =>
                debugConfigProvider.makeConfig(undefined, {
                    type: AWS_SAM_DEBUG_TYPE,
                    name: 'whats in a name',
                    request: DIRECT_INVOKE_TYPE,
                    invokeTarget: {
                        target: tgt,
                        lambdaHandler: 'sick handles',
                        projectRoot: 'root as in beer',
                    },
                })
            )
        })

        it("rejects when resolving template debug configurations with a template that isn't in the registry", async () => {
            await assert.rejects(() => debugConfigProvider.makeConfig(undefined, createFakeConfig({})))
        })

        it("rejects when resolving template debug configurations with a template that doesn't have the set resource", async () => {
            await createAndRegisterYaml({}, tempFile, await globals.templateRegistry)
            await assert.rejects(() =>
                debugConfigProvider.makeConfig(undefined, createFakeConfig({ templatePath: tempFile.fsPath }))
            )
        })

        it('rejects when resolving template debug configurations with a resource that has an invalid runtime in template', async function () {
            await createAndRegisterYaml(
                { resourceName, runtime: 'moreLikeRanOutOfTime' },
                tempFile,
                await globals.templateRegistry
            )
            await assert.rejects(
                () =>
                    debugConfigProvider.makeConfig(
                        undefined,
                        createFakeConfig({
                            templatePath: tempFile.fsPath,
                            logicalId: resourceName,
                        })
                    ),
                /runtime/i
            )
        })

        it('rejects when resolving template debug configurations with a resource that has an invalid runtime in template', async function () {
            await testutil.toFile(
                makeSampleSamTemplateYaml(true, { resourceName, runtime: 'moreLikeRanOutOfTime' }),
                tempFile.fsPath
            )
            await assert.rejects(() =>
                debugConfigProvider.makeConfig(undefined, {
                    type: AWS_SAM_DEBUG_TYPE,
                    name: 'whats in a name',
                    request: DIRECT_INVOKE_TYPE,
                    invokeTarget: {
                        target: TEMPLATE_TARGET_TYPE,
                        templatePath: tempFile.fsPath,
                        logicalId: resourceName,
                    },
                })
            )
        })

        it('rejects when resolving code debug configurations with invalid runtimes', async function () {
            await assert.rejects(() =>
                debugConfigProvider.makeConfig(undefined, {
                    ...createBaseCodeConfig({}),
                    lambda: {
                        runtime: 'COBOL',
                    },
                })
            )
        })

        it('supports workspace-relative template path ("./foo.yaml")', async function () {
            await testutil.toFile(makeSampleSamTemplateYaml(true, { runtime: 'nodejs18.x' }), tempFile.fsPath)
            // Register with *full* path.
            await (await globals.templateRegistry).addItem(tempFile)
            // Simulates launch.json:
            //     "invokeTarget": {
            //         "target": "./test.yaml",
            //     },
            const relPath = './' + path.relative(fakeWorkspaceFolder.uri.path, tempFile.path)

            // Assert that the relative path correctly maps to the full path in the registry.
            const name = 'Test rel path'
            const resolved = await debugConfigProvider.makeConfig(fakeWorkspaceFolder, {
                type: AWS_SAM_DEBUG_TYPE,
                name: name,
                request: 'direct-invoke',
                invokeTarget: {
                    target: TEMPLATE_TARGET_TYPE,
                    templatePath: relPath,
                    logicalId: 'TestResource',
                    // lambdaHandler: 'sick handles',
                    // projectRoot: 'root as in beer'
                },
            })
            assert.strictEqual(resolved!.name, name)
        })

        it('target=code: javascript', async function () {
            const appDir = pathutil.normalize(
                path.join(testutil.getProjectDir(), 'testFixtures/workspaceFolder/js-manifest-in-root/')
            )
            const folder = testutil.getWorkspaceFolder(appDir)
            const input = {
                type: AWS_SAM_DEBUG_TYPE,
                name: 'whats in a name',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: CODE_TARGET_TYPE,
                    lambdaHandler: 'my.test.handler',
                    projectRoot: 'src',
                },
                lambda: {
                    runtime: 'nodejs18.x',
                    // For target=code these envvars are written to the input-template.yaml.
                    environmentVariables: {
                        'test-envvar-1': 'test value 1',
                        'test-envvar-2': 'test value 2',
                    },
                    memoryMb: 1.2,
                    timeoutSec: 9000,
                    payload: {
                        json: {
                            'test-payload-key-1': 'test payload value 1',
                            'test-payload-key-2': 'test payload value 2',
                        },
                    },
                },
            }
            const actual = (await debugConfigProvider.makeConfig(folder, input))!
            const expected: SamLaunchRequestArgs = {
                type: AWS_SAM_DEBUG_TYPE,
                awsCredentials: fakeCredentials,
                request: 'attach', // Input "direct-invoke", output "attach".
                runtime: 'nodejs18.x',
                runtimeFamily: lambdaModel.RuntimeFamily.NodeJS,
                useIkpdb: false,
                workspaceFolder: {
                    index: 0,
                    name: 'test-workspace-folder',
                    uri: vscode.Uri.file(appDir),
                },
                baseBuildDir: actual.baseBuildDir, // Random, sanity-checked by assertEqualLaunchConfigs().
                envFile: `${actual.baseBuildDir}/env-vars.json`,
                eventPayloadFile: `${actual.baseBuildDir}/event.json`,
                codeRoot: pathutil.normalize(path.join(appDir, 'src')), // Normalized to absolute path.
                apiPort: undefined,
                debugPort: actual.debugPort,
                documentUri: vscode.Uri.file(''), // TODO: remove or test.
                handlerName: 'my.test.handler',
                invokeTarget: { ...input.invokeTarget },
                lambda: {
                    ...input.lambda,
                },
                localRoot: pathutil.normalize(path.join(appDir, 'src')), // Normalized to absolute path.
                name: input.name,
                templatePath: pathutil.normalize(path.join(actual.baseBuildDir!, 'app___vsctk___template.yaml')),
                parameterOverrides: undefined,
                architecture: undefined,

                //
                // Node-related fields
                //
                address: 'localhost',
                port: actual.debugPort,
                preLaunchTask: undefined,
                protocol: 'inspector',
                region: 'us-west-2',
                remoteRoot: '/var/task',
                skipFiles: ['/var/runtime/node_modules/**/*.js', '<node_internals>/**/*.js'],
                continueOnAttach: true,
                stopOnEntry: false,
            }

            assertEqualLaunchConfigs(actual, expected)
            await assertFileText(
                expected.envFile!,
                '{"src":{"test-envvar-1":"test value 1","test-envvar-2":"test value 2"}}'
            )
            await assertFileText(
                expected.eventPayloadFile!,
                '{"test-payload-key-1":"test payload value 1","test-payload-key-2":"test payload value 2"}'
            )
            await assertFileText(
                expected.templatePath,
                `Resources:
  src:
    Type: AWS::Serverless::Function
    Properties:
      Handler: my.test.handler
      CodeUri: >-
        ${expected.codeRoot}
      Runtime: nodejs18.x
      Environment:
        Variables:
          test-envvar-1: test value 1
          test-envvar-2: test value 2
      MemorySize: 1.2
      Timeout: 9000
`
            )

            //
            // Test pathMapping
            //
            const inputWithPathMapping = {
                ...input,
                lambda: {
                    ...input.lambda,
                    pathMappings: [
                        {
                            localRoot: 'somethingLocal',
                            remoteRoot: 'somethingRemote',
                        },
                        {
                            localRoot: 'ignoredLocal',
                            remoteRoot: 'ignoredRemote',
                        },
                    ] as PathMapping[],
                },
            }
            const actualWithPathMapping = (await debugConfigProvider.makeConfig(folder, inputWithPathMapping))!
            const expectedWithPathMapping: SamLaunchRequestArgs = {
                ...expected,
                lambda: {
                    ...expected.lambda,
                    pathMappings: inputWithPathMapping.lambda.pathMappings,
                },
                localRoot: 'somethingLocal',
                remoteRoot: 'somethingRemote',
                baseBuildDir: actualWithPathMapping.baseBuildDir,
                envFile: `${actualWithPathMapping.baseBuildDir}/env-vars.json`,
                eventPayloadFile: `${actualWithPathMapping.baseBuildDir}/event.json`,
            }
            assertEqualLaunchConfigs(actualWithPathMapping, expectedWithPathMapping)

            //
            // Test noDebug=true.
            //
            ;(input as any).noDebug = true
            const actualNoDebug = (await debugConfigProvider.makeConfig(folder, input))!
            const expectedNoDebug: SamLaunchRequestArgs = {
                ...expected,
                noDebug: true,
                request: 'launch',
                debugPort: undefined,
                port: -1,
                baseBuildDir: actualNoDebug.baseBuildDir,
                envFile: `${actualNoDebug.baseBuildDir}/env-vars.json`,
                eventPayloadFile: `${actualNoDebug.baseBuildDir}/event.json`,
            }
            assertEqualLaunchConfigs(actualNoDebug, expectedNoDebug)
        })

        it('target=code: typescript', async function () {
            /**
             * When executing the test on macOS in CI the tests fail with the following error:
             *  'Error: TypeScript compiler "tsc" not found in node_modules/ or the system
             *
             * See: https://github.com/aws/aws-toolkit-vscode/issues/5587
             */
            if (isCI() && os.platform() === 'darwin') {
                this.skip()
            }

            const appDir = pathutil.normalize(
                path.join(testutil.getProjectDir(), 'testFixtures/workspaceFolder/ts-plain-sam-app/')
            )
            const folder = testutil.getWorkspaceFolder(appDir)
            const input = {
                type: AWS_SAM_DEBUG_TYPE,
                name: 'test-ts-code',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: CODE_TARGET_TYPE,
                    lambdaHandler: 'app.handler',
                    projectRoot: 'src',
                },
                lambda: {
                    runtime: 'nodejs18.x',
                    // For target=code these envvars are written to the input-template.yaml.
                    environmentVariables: {
                        'test-envvar-1': 'test value 1',
                        'test-envvar-2': 'test value 2',
                    },
                    memoryMb: 1.2,
                    timeoutSec: 9000,
                    payload: {
                        json: {
                            'test-payload-key-1': 'test payload value 1',
                            'test-payload-key-2': 'test payload value 2',
                        },
                    },
                },
            }
            const actual = (await debugConfigProvider.makeConfig(folder, input))!
            const expected: SamLaunchRequestArgs = {
                type: AWS_SAM_DEBUG_TYPE,
                awsCredentials: fakeCredentials,
                request: 'attach', // Input "direct-invoke", output "attach".
                runtime: 'nodejs18.x',
                runtimeFamily: lambdaModel.RuntimeFamily.NodeJS,
                useIkpdb: false,
                workspaceFolder: {
                    index: 0,
                    name: 'test-workspace-folder',
                    uri: vscode.Uri.file(appDir),
                },
                baseBuildDir: actual.baseBuildDir, // Random, sanity-checked by assertEqualLaunchConfigs().
                envFile: `${actual.baseBuildDir}/env-vars.json`,
                eventPayloadFile: `${actual.baseBuildDir}/event.json`,
                codeRoot: pathutil.normalize(path.join(appDir, 'src')), // Normalized to absolute path.
                apiPort: undefined,
                debugPort: actual.debugPort,
                documentUri: vscode.Uri.file(''), // TODO: remove or test.
                handlerName: 'app.handler',
                invokeTarget: {
                    ...input.invokeTarget,
                },
                lambda: {
                    ...input.lambda,
                },
                localRoot: pathutil.normalize(path.join(appDir, 'src')), // Normalized to absolute path.
                name: input.name,
                templatePath: pathutil.normalize(path.join(actual.baseBuildDir!, 'app___vsctk___template.yaml')),
                parameterOverrides: undefined,
                architecture: undefined,

                //
                // Node-related fields
                //
                address: 'localhost',
                port: actual.debugPort,
                preLaunchTask: undefined,
                protocol: 'inspector',
                region: 'us-west-2',
                remoteRoot: '/var/task',
                skipFiles: ['/var/runtime/node_modules/**/*.js', '<node_internals>/**/*.js'],
                continueOnAttach: true,
                stopOnEntry: false,
            }

            assertEqualLaunchConfigs(actual, expected)
            await assertFileText(
                expected.envFile!,
                '{"src":{"test-envvar-1":"test value 1","test-envvar-2":"test value 2"}}'
            )
            await assertFileText(
                expected.eventPayloadFile!,
                '{"test-payload-key-1":"test payload value 1","test-payload-key-2":"test payload value 2"}'
            )
            await assertFileText(
                expected.templatePath,
                `Resources:
  src:
    Type: AWS::Serverless::Function
    Properties:
      Handler: app.handler
      CodeUri: >-
        ${expected.codeRoot}
      Runtime: nodejs18.x
      Environment:
        Variables:
          test-envvar-1: test value 1
          test-envvar-2: test value 2
      MemorySize: 1.2
      Timeout: 9000
`
            )

            //
            // Test pathMapping
            //
            const inputWithPathMapping = {
                ...input,
                lambda: {
                    ...input.lambda,
                    pathMappings: [
                        {
                            localRoot: 'somethingLocal',
                            remoteRoot: 'somethingRemote',
                        },
                        {
                            localRoot: 'ignoredLocal',
                            remoteRoot: 'ignoredRemote',
                        },
                    ] as PathMapping[],
                },
            }
            const actualWithPathMapping = (await debugConfigProvider.makeConfig(folder, inputWithPathMapping))!
            const expectedWithPathMapping: SamLaunchRequestArgs = {
                ...expected,
                lambda: {
                    ...expected.lambda,
                    pathMappings: inputWithPathMapping.lambda.pathMappings,
                },
                localRoot: 'somethingLocal',
                remoteRoot: 'somethingRemote',
                baseBuildDir: actualWithPathMapping.baseBuildDir,
                envFile: `${actualWithPathMapping.baseBuildDir}/env-vars.json`,
                eventPayloadFile: `${actualWithPathMapping.baseBuildDir}/event.json`,
            }
            assertEqualLaunchConfigs(actualWithPathMapping, expectedWithPathMapping)

            //
            // Test noDebug=true.
            //
            ;(input as any).noDebug = true
            const actualNoDebug = (await debugConfigProvider.makeConfig(folder, input))!
            const expectedNoDebug: SamLaunchRequestArgs = {
                ...expected,
                noDebug: true,
                request: 'launch',
                debugPort: undefined,
                port: -1,
                baseBuildDir: actualNoDebug.baseBuildDir,
                envFile: `${actualNoDebug.baseBuildDir}/env-vars.json`,
                eventPayloadFile: `${actualNoDebug.baseBuildDir}/event.json`,
            }
            assertEqualLaunchConfigs(actualNoDebug, expectedNoDebug)
        })

        it('target=template: javascript', async function () {
            const appDir = pathutil.normalize(
                path.join(testutil.getProjectDir(), 'testFixtures/workspaceFolder/js-manifest-in-root')
            )
            const folder = testutil.getWorkspaceFolder(appDir)
            const input = {
                type: AWS_SAM_DEBUG_TYPE,
                name: 'test-js-template',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: TEMPLATE_TARGET_TYPE,
                    templatePath: 'template.yaml',
                    logicalId: 'SourceCodeTwoFoldersDeep',
                },
                lambda: {
                    // For target=template these are written to env-vars.json,
                    // NOT the input-template.yaml.
                    environmentVariables: {
                        'test-js-template-envvar-1': 'test target=template envvar value 1',
                        'test-js-template-envvar-2': 'test target=template envvar value 2',
                    },
                    memoryMb: 1.01,
                    timeoutSec: 99,
                    payload: {
                        json: {
                            'test-js-template-key-1': 'test js target=template value 1',
                            'test-js-template-key-2': 'test js target=template value 2',
                        },
                    },
                },
            }
            const templatePath = vscode.Uri.file(path.join(appDir, 'template.yaml'))
            const actual = (await debugConfigProvider.makeConfig(folder, input))!

            const expected: SamLaunchRequestArgs = {
                type: AWS_SAM_DEBUG_TYPE,
                awsCredentials: fakeCredentials,
                request: 'attach', // Input "direct-invoke", output "attach".
                runtime: 'nodejs20.x',
                runtimeFamily: lambdaModel.RuntimeFamily.NodeJS,
                useIkpdb: false,
                workspaceFolder: {
                    index: 0,
                    name: 'test-workspace-folder',
                    uri: vscode.Uri.file(appDir),
                },
                baseBuildDir: actual.baseBuildDir, // Random, sanity-checked by assertEqualLaunchConfigs().
                envFile: `${actual.baseBuildDir}/env-vars.json`,
                eventPayloadFile: `${actual.baseBuildDir}/event.json`,
                codeRoot: appDir,
                apiPort: undefined,
                debugPort: actual.debugPort,
                documentUri: vscode.Uri.file(''), // TODO: remove or test.
                handlerName: 'src/subfolder/app.handlerTwoFoldersDeep',
                invokeTarget: { ...input.invokeTarget },
                lambda: {
                    ...input.lambda,
                },
                localRoot: appDir,
                name: input.name,
                templatePath: pathutil.normalize(path.join(path.dirname(templatePath.fsPath), 'template.yaml')),
                parameterOverrides: undefined,
                architecture: undefined,

                //
                // Node-related fields
                //
                address: 'localhost',
                port: actual.debugPort,
                preLaunchTask: undefined,
                protocol: 'inspector',
                region: 'us-west-2',
                remoteRoot: '/var/task',
                skipFiles: ['/var/runtime/node_modules/**/*.js', '<node_internals>/**/*.js'],
                continueOnAttach: true,
                stopOnEntry: false,
            }

            assertEqualLaunchConfigs(actual, expected)
            await assertFileText(
                expected.envFile!,
                '{"SourceCodeTwoFoldersDeep":{"test-js-template-envvar-1":"test target=template envvar value 1","test-js-template-envvar-2":"test target=template envvar value 2"}}'
            )
            await assertFileText(
                expected.eventPayloadFile!,
                '{"test-js-template-key-1":"test js target=template value 1","test-js-template-key-2":"test js target=template value 2"}'
            )

            //
            // Test pathMapping
            //
            const inputWithPathMapping = {
                ...input,
                lambda: {
                    ...input.lambda,
                    pathMappings: [
                        {
                            localRoot: 'somethingLocal',
                            remoteRoot: 'somethingRemote',
                        },
                        {
                            localRoot: 'ignoredLocal',
                            remoteRoot: 'ignoredRemote',
                        },
                    ] as PathMapping[],
                },
            }
            const actualWithPathMapping = (await debugConfigProvider.makeConfig(folder, inputWithPathMapping))!
            const expectedWithPathMapping: SamLaunchRequestArgs = {
                ...expected,
                lambda: {
                    ...expected.lambda,
                    pathMappings: inputWithPathMapping.lambda.pathMappings,
                },
                localRoot: 'somethingLocal',
                remoteRoot: 'somethingRemote',
                baseBuildDir: actualWithPathMapping.baseBuildDir,
                envFile: `${actualWithPathMapping.baseBuildDir}/env-vars.json`,
                eventPayloadFile: `${actualWithPathMapping.baseBuildDir}/event.json`,
            }
            assertEqualLaunchConfigs(actualWithPathMapping, expectedWithPathMapping)

            //
            // Test noDebug=true.
            //
            ;(input as any).noDebug = true
            const actualNoDebug = (await debugConfigProvider.makeConfig(folder, input))!
            const expectedNoDebug: SamLaunchRequestArgs = {
                ...expected,
                noDebug: true,
                request: 'launch',
                debugPort: undefined,
                port: -1,
                baseBuildDir: actualNoDebug.baseBuildDir,
                envFile: `${actualNoDebug.baseBuildDir}/env-vars.json`,
                eventPayloadFile: `${actualNoDebug.baseBuildDir}/event.json`,
            }
            assertEqualLaunchConfigs(actualNoDebug, expectedNoDebug)
        })

        it('target=template: Image javascript', async function () {
            const appDir = pathutil.normalize(
                path.join(testutil.getProjectDir(), 'testFixtures/workspaceFolder/js-image-sam-app')
            )
            const folder = testutil.getWorkspaceFolder(appDir)
            const input = {
                type: AWS_SAM_DEBUG_TYPE,
                name: 'test-js-image-template',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: TEMPLATE_TARGET_TYPE,
                    templatePath: 'template.yaml',
                    logicalId: 'HelloWorldFunction',
                },
                lambda: {
                    runtime: 'nodejs18.x',
                },
            }
            const templatePath = vscode.Uri.file(path.join(appDir, 'template.yaml'))
            const actual = (await debugConfigProvider.makeConfig(folder, input))!

            const expected: SamLaunchRequestArgs = {
                type: AWS_SAM_DEBUG_TYPE,
                awsCredentials: fakeCredentials,
                request: 'attach', // Input "direct-invoke", output "attach".
                runtime: 'nodejs18.x',
                runtimeFamily: lambdaModel.RuntimeFamily.NodeJS,
                useIkpdb: false,
                workspaceFolder: {
                    index: 0,
                    name: 'test-workspace-folder',
                    uri: vscode.Uri.file(appDir),
                },
                baseBuildDir: actual.baseBuildDir, // Random, sanity-checked by assertEqualLaunchConfigs().
                containerEnvFile: `${actual.baseBuildDir}/container-env-vars.json`,
                containerEnvVars: {
                    NODE_OPTIONS: `--inspect=0.0.0.0:${actual.debugPort} --max-http-header-size 81920`,
                },
                envFile: undefined,
                eventPayloadFile: undefined,
                codeRoot: appDir,
                apiPort: undefined,
                debugPort: actual.debugPort,
                documentUri: vscode.Uri.file(''), // TODO: remove or test.
                handlerName: 'HelloWorldFunction',
                invokeTarget: { ...input.invokeTarget },
                lambda: {
                    ...input.lambda,
                    environmentVariables: {},
                    memoryMb: undefined,
                    timeoutSec: 3,
                },
                localRoot: appDir,
                name: input.name,
                architecture: undefined,
                templatePath: pathutil.normalize(path.join(path.dirname(templatePath.fsPath), 'template.yaml')),

                //
                // Node-related fields
                //
                address: 'localhost',
                port: actual.debugPort,
                preLaunchTask: undefined,
                protocol: 'inspector',
                region: 'us-west-2',
                remoteRoot: '/var/task',
                skipFiles: ['/var/runtime/node_modules/**/*.js', '<node_internals>/**/*.js'],
                continueOnAttach: true,
                stopOnEntry: false,
                parameterOverrides: undefined,
            }

            assertEqualLaunchConfigs(actual, expected)
            await assertFileText(
                expected.containerEnvFile!,
                `{"NODE_OPTIONS":"--inspect=0.0.0.0:${actual.debugPort} --max-http-header-size 81920"}`
            )

            //
            // Test pathMapping
            //
            const inputWithPathMapping = {
                ...input,
                lambda: {
                    ...input.lambda,
                    pathMappings: [
                        {
                            localRoot: 'somethingLocal',
                            remoteRoot: 'somethingRemote',
                        },
                        {
                            localRoot: 'ignoredLocal',
                            remoteRoot: 'ignoredRemote',
                        },
                    ] as PathMapping[],
                },
            }
            const actualWithPathMapping = (await debugConfigProvider.makeConfig(folder, inputWithPathMapping))!
            const expectedWithPathMapping: SamLaunchRequestArgs = {
                ...expected,
                lambda: {
                    ...expected.lambda,
                    pathMappings: inputWithPathMapping.lambda.pathMappings,
                },
                localRoot: 'somethingLocal',
                remoteRoot: 'somethingRemote',
                baseBuildDir: actualWithPathMapping.baseBuildDir,
                containerEnvFile: `${actualWithPathMapping.baseBuildDir}/container-env-vars.json`,
                envFile: undefined,
                eventPayloadFile: undefined,
                architecture: undefined,
            }
            assertEqualLaunchConfigs(actualWithPathMapping, expectedWithPathMapping)

            // Test noDebug=true.
            await assertEqualNoDebugTemplateTarget(input, expected, folder, debugConfigProvider, true)
        })

        it('target=api: javascript', async function () {
            const appDir = pathutil.normalize(
                path.join(testutil.getProjectDir(), 'testFixtures/workspaceFolder/js-manifest-in-root')
            )
            const folder = testutil.getWorkspaceFolder(appDir)
            const input: AwsSamDebuggerConfiguration = {
                type: AWS_SAM_DEBUG_TYPE,
                name: 'test-js-api',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: API_TARGET_TYPE,
                    templatePath: 'template.yaml',
                    logicalId: 'SourceCodeTwoFoldersDeep',
                },
                api: {
                    path: '/hello',
                    httpMethod: 'post',
                    headers: {
                        'user-agent': 'mozilla 42',
                    },
                    querystring: 'foo&bar=baz',
                },
                lambda: {
                    // For target=template these are written to env-vars.json,
                    // NOT the input-template.yaml.
                    environmentVariables: {
                        'test-js-template-envvar-1': 'test target=template envvar value 1',
                        'test-js-template-envvar-2': 'test target=template envvar value 2',
                    },
                    memoryMb: 1.01,
                    timeoutSec: 99,
                    payload: {
                        json: {
                            'test-js-template-key-1': 'test js target=template value 1',
                            'test-js-template-key-2': 'test js target=template value 2',
                        },
                    },
                },
            }
            const templatePath = vscode.Uri.file(path.join(appDir, 'template.yaml'))
            const actual = (await debugConfigProvider.makeConfig(folder, input))!

            const expected: SamLaunchRequestArgs = {
                type: AWS_SAM_DEBUG_TYPE,
                awsCredentials: fakeCredentials,
                request: 'attach', // Input "direct-invoke", output "attach".
                runtime: 'nodejs20.x',
                runtimeFamily: lambdaModel.RuntimeFamily.NodeJS,
                useIkpdb: false,
                workspaceFolder: {
                    index: 0,
                    name: 'test-workspace-folder',
                    uri: vscode.Uri.file(appDir),
                },
                baseBuildDir: actual.baseBuildDir, // Random, sanity-checked by assertEqualLaunchConfigs().
                envFile: `${actual.baseBuildDir}/env-vars.json`,
                eventPayloadFile: `${actual.baseBuildDir}/event.json`,
                codeRoot: appDir,
                apiPort: actual.apiPort,
                debugPort: actual.debugPort,
                documentUri: vscode.Uri.file(''), // TODO: remove or test.
                handlerName: 'src/subfolder/app.handlerTwoFoldersDeep',
                invokeTarget: { ...input.invokeTarget },
                api: {
                    ...(input.api as APIGatewayProperties),
                },
                lambda: {
                    ...input.lambda,
                },
                localRoot: appDir,
                name: input.name,
                architecture: undefined,
                templatePath: pathutil.normalize(path.join(path.dirname(templatePath.fsPath), 'template.yaml')),

                //
                // Node-related fields
                //
                address: 'localhost',
                port: actual.debugPort,
                preLaunchTask: undefined,
                protocol: 'inspector',
                region: 'us-west-2',
                remoteRoot: '/var/task',
                skipFiles: ['/var/runtime/node_modules/**/*.js', '<node_internals>/**/*.js'],
                continueOnAttach: true,
                stopOnEntry: false,
                parameterOverrides: undefined,
            }

            assertEqualLaunchConfigs(actual, expected)
            await assertFileText(
                expected.envFile!,
                '{"SourceCodeTwoFoldersDeep":{"test-js-template-envvar-1":"test target=template envvar value 1","test-js-template-envvar-2":"test target=template envvar value 2"}}'
            )
            await assertFileText(
                expected.eventPayloadFile!,
                '{"test-js-template-key-1":"test js target=template value 1","test-js-template-key-2":"test js target=template value 2"}'
            )

            // Test noDebug=true.
            await assertEqualNoDebugTemplateTarget(input, expected, folder, debugConfigProvider)
        })

        it('target=code: java17 maven', async function () {
            const appDir = pathutil.normalize(
                path.join(testutil.getProjectDir(), 'testFixtures/workspaceFolder/java17-gradle/')
            )
            const folder = testutil.getWorkspaceFolder(appDir)
            const handler = 'helloworld.App::handleRequest'
            const input = {
                type: AWS_SAM_DEBUG_TYPE,
                name: 'Test debugconfig',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: CODE_TARGET_TYPE,
                    lambdaHandler: handler,
                    projectRoot: 'HelloWorldFunction',
                },
                lambda: {
                    runtime: 'java17',
                },
            }
            const actual = (await debugConfigProvider.makeConfig(folder, input))! as SamLaunchRequestArgs
            const expectedCodeRoot = (actual.baseBuildDir ?? 'fail') + '/input'
            const expected: SamLaunchRequestArgs = {
                awsCredentials: fakeCredentials,
                request: 'attach', // Input "direct-invoke", output "attach".
                runtime: 'java17',
                runtimeFamily: lambdaModel.RuntimeFamily.Java,
                useIkpdb: false,
                type: AWS_SAM_DEBUG_TYPE,
                workspaceFolder: {
                    index: 0,
                    name: 'test-workspace-folder',
                    uri: vscode.Uri.file(appDir),
                },
                baseBuildDir: actual.baseBuildDir, // Random, sanity-checked by assertEqualLaunchConfigs().
                envFile: undefined,
                eventPayloadFile: undefined,
                codeRoot: expectedCodeRoot, // Normalized to absolute path.
                apiPort: undefined,
                debugPort: actual.debugPort,
                documentUri: vscode.Uri.file(''), // TODO: remove or test.
                handlerName: handler,
                invokeTarget: { ...input.invokeTarget },
                lambda: {
                    ...input.lambda,
                    environmentVariables: {},
                    memoryMb: undefined,
                    timeoutSec: undefined,
                },
                name: input.name,
                templatePath: pathutil.normalize(path.join(actual.baseBuildDir!, 'app___vsctk___template.yaml')),
                parameterOverrides: undefined,
                architecture: undefined,
                region: 'us-west-2',
            }

            const expectedDebug = {
                ...expected,
                //
                // Java-specific fields
                //
                hostName: '127.0.0.1',
                port: actual.debugPort,
            }

            assertEqualLaunchConfigs(actual, expectedDebug)

            await assertFileText(
                expected.templatePath,
                `Resources:
  HelloWorldFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: ${handler}
      CodeUri: >-
        ${input.invokeTarget.projectRoot}
      Runtime: java17
`
            )

            //
            // Test noDebug=true.
            //
            ;(input as any).noDebug = true
            const actualNoDebug = (await debugConfigProvider.makeConfig(folder, input))! as SamLaunchRequestArgs
            const expectedCodeRootNoDebug = (actualNoDebug.baseBuildDir ?? 'fail') + '/input'
            const expectedNoDebug: SamLaunchRequestArgs = {
                ...expected,
                codeRoot: expectedCodeRootNoDebug,
                noDebug: true,
                request: 'launch',
                debuggerPath: undefined,
                debugPort: undefined,
                baseBuildDir: actualNoDebug.baseBuildDir,
                envFile: undefined,
                eventPayloadFile: undefined,
            }
            delete expectedNoDebug.processName
            delete expectedNoDebug.pipeTransport
            delete expectedNoDebug.sourceFileMap
            delete expectedNoDebug.windows
            assertEqualLaunchConfigs(actualNoDebug, expectedNoDebug)
        })

        it('target=code: java 17 gradle', async function () {
            const appDir = pathutil.normalize(
                path.join(testutil.getProjectDir(), 'testFixtures/workspaceFolder/java17-gradle/')
            )
            const folder = testutil.getWorkspaceFolder(appDir)
            const handler = 'helloworld.App::handleRequest'
            const input = {
                type: AWS_SAM_DEBUG_TYPE,
                name: 'Test debugconfig',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: CODE_TARGET_TYPE,
                    lambdaHandler: handler,
                    projectRoot: 'HelloWorldFunction',
                },
                lambda: {
                    runtime: 'java17',
                },
            }
            const actual = (await debugConfigProvider.makeConfig(folder, input))! as SamLaunchRequestArgs
            const expectedCodeRoot = (actual.baseBuildDir ?? 'fail') + '/input'
            const expected: SamLaunchRequestArgs = {
                awsCredentials: fakeCredentials,
                request: 'attach', // Input "direct-invoke", output "attach".
                runtime: 'java17',
                runtimeFamily: lambdaModel.RuntimeFamily.Java,
                useIkpdb: false,
                type: AWS_SAM_DEBUG_TYPE,
                workspaceFolder: {
                    index: 0,
                    name: 'test-workspace-folder',
                    uri: vscode.Uri.file(appDir),
                },
                baseBuildDir: actual.baseBuildDir, // Random, sanity-checked by assertEqualLaunchConfigs().
                envFile: undefined,
                eventPayloadFile: undefined,
                codeRoot: expectedCodeRoot, // Normalized to absolute path.
                apiPort: undefined,
                debugPort: actual.debugPort,
                documentUri: vscode.Uri.file(''), // TODO: remove or test.
                handlerName: handler,
                invokeTarget: { ...input.invokeTarget },
                lambda: {
                    ...input.lambda,
                    environmentVariables: {},
                    memoryMb: undefined,
                    timeoutSec: undefined,
                },
                name: input.name,
                templatePath: pathutil.normalize(path.join(actual.baseBuildDir!, 'app___vsctk___template.yaml')),
                parameterOverrides: undefined,
                architecture: undefined,
                region: 'us-west-2',
            }

            const expectedDebug = {
                ...expected,
                //
                // Java-specific fields
                //
                hostName: '127.0.0.1',
                port: actual.debugPort,
            }

            assertEqualLaunchConfigs(actual, expectedDebug)

            await assertFileText(
                expectedDebug.templatePath,
                `Resources:
  HelloWorldFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: ${handler}
      CodeUri: >-
        ${input.invokeTarget.projectRoot}
      Runtime: java17
`
            )

            //
            // Test noDebug=true.
            //
            ;(input as any).noDebug = true
            const actualNoDebug = (await debugConfigProvider.makeConfig(folder, input))! as SamLaunchRequestArgs
            const expectedCodeRootNoDebug = (actualNoDebug.baseBuildDir ?? 'fail') + '/input'
            const expectedNoDebug: SamLaunchRequestArgs = {
                ...expected,
                codeRoot: expectedCodeRootNoDebug,
                noDebug: true,
                request: 'launch',
                debuggerPath: undefined,
                debugPort: undefined,
                baseBuildDir: actualNoDebug.baseBuildDir,
                envFile: undefined,
                eventPayloadFile: undefined,
            }
            delete expectedNoDebug.processName
            delete expectedNoDebug.pipeTransport
            delete expectedNoDebug.sourceFileMap
            delete expectedNoDebug.windows
            assertEqualLaunchConfigs(actualNoDebug, expectedNoDebug)
        })

        it('target=template: java maven', async function () {
            const handler = 'helloworld.App::handleRequest'
            const appDir = pathutil.normalize(
                path.join(testutil.getProjectDir(), 'testFixtures/workspaceFolder/java17-maven/')
            )
            const folder = testutil.getWorkspaceFolder(appDir)
            const input = {
                type: AWS_SAM_DEBUG_TYPE,
                name: 'test-java-template',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: TEMPLATE_TARGET_TYPE,
                    templatePath: 'template.yaml',
                    logicalId: 'HelloWorldFunction',
                },
                lambda: {
                    environmentVariables: {
                        'test-envvar-1': 'test value 1',
                    },
                    memoryMb: 512,
                    timeoutSec: 20,
                    payload: {
                        json: {
                            'test-payload-key-1': 'test payload value 1',
                        },
                    },
                },
            }
            const templatePath = vscode.Uri.file(path.join(appDir, 'template.yaml'))
            const actual = (await debugConfigProvider.makeConfig(folder, input))! as SamLaunchRequestArgs
            const expectedCodeRoot = (actual.baseBuildDir ?? 'fail') + '/input'
            const expected: SamLaunchRequestArgs = {
                awsCredentials: fakeCredentials,
                request: 'attach', // Input "direct-invoke", output "attach".
                runtime: 'java17',
                runtimeFamily: lambdaModel.RuntimeFamily.Java,
                useIkpdb: false,
                type: AWS_SAM_DEBUG_TYPE,
                workspaceFolder: {
                    index: 0,
                    name: 'test-workspace-folder',
                    uri: vscode.Uri.file(appDir),
                },
                baseBuildDir: actual.baseBuildDir, // Random, sanity-checked by assertEqualLaunchConfigs().
                envFile: `${actual.baseBuildDir}/env-vars.json`,
                eventPayloadFile: `${actual.baseBuildDir}/event.json`,
                codeRoot: expectedCodeRoot,
                apiPort: undefined,
                debugPort: actual.debugPort,
                documentUri: vscode.Uri.file(''), // TODO: remove or test.
                handlerName: handler,
                invokeTarget: { ...input.invokeTarget },
                lambda: {
                    ...input.lambda,
                },
                name: input.name,
                templatePath: pathutil.normalize(path.join(path.dirname(templatePath.fsPath), 'template.yaml')),
                parameterOverrides: undefined,
                architecture: 'x86_64',
                region: 'us-west-2',
            }

            const expectedDebug = {
                ...expected,
                //
                // Java-specific fields
                //
                hostName: '127.0.0.1',
                port: actual.debugPort,
            }

            assertEqualLaunchConfigs(actual, expectedDebug)
            await assertFileText(expectedDebug.envFile!, '{"HelloWorldFunction":{"test-envvar-1":"test value 1"}}')
            await assertFileText(expectedDebug.eventPayloadFile!, '{"test-payload-key-1":"test payload value 1"}')

            //
            // Test noDebug=true.
            //
            ;(input as any).noDebug = true
            const actualNoDebug = (await debugConfigProvider.makeConfig(folder, input))! as SamLaunchRequestArgs
            const expectedCodeRootNoDebug = (actualNoDebug.baseBuildDir ?? 'fail') + '/input'
            const expectedNoDebug: SamLaunchRequestArgs = {
                ...expected,
                codeRoot: expectedCodeRootNoDebug,
                noDebug: true,
                request: 'launch',
                debuggerPath: undefined,
                debugPort: undefined,
                baseBuildDir: actualNoDebug.baseBuildDir,
                envFile: `${actualNoDebug.baseBuildDir}/env-vars.json`,
                eventPayloadFile: `${actualNoDebug.baseBuildDir}/event.json`,
            }
            delete expectedNoDebug.processName
            delete expectedNoDebug.pipeTransport
            delete expectedNoDebug.sourceFileMap
            delete expectedNoDebug.windows
            assertEqualLaunchConfigs(actualNoDebug, expectedNoDebug)
        })

        it('target=template: Image java', async function () {
            const appDir = pathutil.normalize(
                path.join(testutil.getProjectDir(), 'testFixtures/workspaceFolder/java17-image')
            )
            const folder = testutil.getWorkspaceFolder(appDir)
            const input = {
                type: AWS_SAM_DEBUG_TYPE,
                name: 'test-java-image-template',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: TEMPLATE_TARGET_TYPE,
                    templatePath: 'template.yaml',
                    logicalId: 'HelloWorldFunction',
                },
                lambda: {
                    runtime: 'java11',
                    environmentVariables: {
                        'test-envvar-1': 'test value 1',
                    },
                    memoryMb: 512,
                    timeoutSec: 20,
                    payload: {
                        json: {
                            'test-payload-key-1': 'test payload value 1',
                        },
                    },
                },
            }
            const templatePath = vscode.Uri.file(path.join(appDir, 'template.yaml'))
            const actual = (await debugConfigProvider.makeConfig(folder, input))! as SamLaunchRequestArgs
            const expectedCodeRoot = (actual.baseBuildDir ?? 'fail') + '/input'
            const expected: SamLaunchRequestArgs = {
                awsCredentials: fakeCredentials,
                request: 'attach', // Input "direct-invoke", output "attach".
                runtime: 'java11',
                runtimeFamily: lambdaModel.RuntimeFamily.Java,
                useIkpdb: false,
                type: AWS_SAM_DEBUG_TYPE,
                workspaceFolder: {
                    index: 0,
                    name: 'test-workspace-folder',
                    uri: vscode.Uri.file(appDir),
                },
                baseBuildDir: actual.baseBuildDir, // Random, sanity-checked by assertEqualLaunchConfigs().
                containerEnvFile: `${actual.baseBuildDir}/container-env-vars.json`,
                containerEnvVars: {
                    _JAVA_OPTIONS: `-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,quiet=y,address=*:${actual.debugPort} -XX:MaxHeapSize=2834432k -XX:MaxMetaspaceSize=163840k -XX:ReservedCodeCacheSize=81920k -XX:+UseSerialGC -XX:-TieredCompilation -Djava.net.preferIPv4Stack=true`,
                },
                envFile: `${actual.baseBuildDir}/env-vars.json`,
                eventPayloadFile: `${actual.baseBuildDir}/event.json`,
                codeRoot: expectedCodeRoot,
                apiPort: undefined,
                debugPort: actual.debugPort,
                documentUri: vscode.Uri.file(''), // TODO: remove or test.
                handlerName: 'HelloWorldFunction',
                invokeTarget: { ...input.invokeTarget },
                lambda: {
                    ...input.lambda,
                },
                name: input.name,
                templatePath: pathutil.normalize(path.join(path.dirname(templatePath.fsPath), 'template.yaml')),
                parameterOverrides: undefined,
                architecture: 'x86_64',
                region: 'us-west-2',
            }

            const expectedDebug = {
                ...expected,
                //
                // Java-specific fields
                //
                hostName: '127.0.0.1',
                port: actual.debugPort,
            }

            assertEqualLaunchConfigs(actual, expectedDebug)
            await assertFileText(expectedDebug.envFile!, '{"HelloWorldFunction":{"test-envvar-1":"test value 1"}}')
            await assertFileText(expectedDebug.eventPayloadFile!, '{"test-payload-key-1":"test payload value 1"}')
            await assertFileText(
                expectedDebug.containerEnvFile!,
                `{"_JAVA_OPTIONS":"${expectedDebug.containerEnvVars!._JAVA_OPTIONS}"}`
            )

            //
            // Test noDebug=true.
            //
            ;(input as any).noDebug = true
            const actualNoDebug = (await debugConfigProvider.makeConfig(folder, input))! as SamLaunchRequestArgs
            const expectedCodeRootNoDebug = (actualNoDebug.baseBuildDir ?? 'fail') + '/input'
            const expectedNoDebug: SamLaunchRequestArgs = {
                ...expected,
                codeRoot: expectedCodeRootNoDebug,
                noDebug: true,
                request: 'launch',
                debuggerPath: undefined,
                debugPort: undefined,
                baseBuildDir: actualNoDebug.baseBuildDir,
                envFile: `${actualNoDebug.baseBuildDir}/env-vars.json`,
                eventPayloadFile: `${actualNoDebug.baseBuildDir}/event.json`,
            }
            delete expectedNoDebug.processName
            delete expectedNoDebug.pipeTransport
            delete expectedNoDebug.sourceFileMap
            delete expectedNoDebug.windows
            assertEqualLaunchConfigs(actualNoDebug, expectedNoDebug)
        })

        it('target=code: dotnet/csharp', async function () {
            const appDir = pathutil.normalize(
                path.join(testutil.getProjectDir(), 'testFixtures/workspaceFolder/csharp6-zip/')
            )
            const folder = testutil.getWorkspaceFolder(appDir)
            const input = {
                type: AWS_SAM_DEBUG_TYPE,
                name: 'Test debugconfig',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: CODE_TARGET_TYPE,
                    lambdaHandler: 'HelloWorld::HelloWorld.Function::FunctionHandler',
                    projectRoot: 'src/HelloWorld',
                },
                lambda: {
                    runtime: 'dotnet6',
                },
            }
            const actual = (await debugConfigProvider.makeConfig(folder, input))! as SamLaunchRequestArgs
            const codeRoot = input.invokeTarget.projectRoot
            const expectedCodeRoot = (actual.baseBuildDir ?? 'fail') + '/input'
            const expected: SamLaunchRequestArgs = {
                awsCredentials: fakeCredentials,
                request: 'attach', // Input "direct-invoke", output "attach".
                runtime: 'dotnet6', // lambdaModel.dotNetRuntimes[0],
                runtimeFamily: lambdaModel.RuntimeFamily.DotNet,
                useIkpdb: false,
                type: AWS_SAM_DEBUG_TYPE,
                workspaceFolder: {
                    index: 0,
                    name: 'test-workspace-folder',
                    uri: vscode.Uri.file(appDir),
                },
                baseBuildDir: actual.baseBuildDir, // Random, sanity-checked by assertEqualLaunchConfigs().
                envFile: undefined,
                eventPayloadFile: undefined,
                codeRoot: expectedCodeRoot, // Normalized to absolute path.
                apiPort: undefined,
                debugPort: actual.debugPort,
                documentUri: vscode.Uri.file(''), // TODO: remove or test.
                handlerName: 'HelloWorld::HelloWorld.Function::FunctionHandler',
                invokeTarget: { ...input.invokeTarget },
                lambda: {
                    ...input.lambda,
                    environmentVariables: {},
                    memoryMb: undefined,
                    timeoutSec: undefined,
                },
                name: input.name,
                templatePath: pathutil.normalize(path.join(actual.baseBuildDir!, 'app___vsctk___template.yaml')),
                parameterOverrides: undefined,
                architecture: undefined,
                region: 'us-west-2',

                //
                // Csharp-related fields
                //
                debuggerPath: codeRoot + '/.vsdbg', // Normalized to absolute path.
                processName: 'dotnet',
                pipeTransport: {
                    debuggerPath: '/tmp/lambci_debug_files/vsdbg',
                    pipeArgs: [
                        '-c',
                        `docker exec -i $(docker ps -q -f publish=${actual.debugPort}) \${debuggerCommand}`,
                    ],
                    pipeCwd: codeRoot,
                    pipeProgram: 'sh',
                },
                windows: {
                    pipeTransport: {
                        debuggerPath: '/tmp/lambci_debug_files/vsdbg',
                        pipeArgs: [
                            '-c',
                            `docker exec -i $(docker ps -q -f publish=${actual.debugPort}) \${debuggerCommand}`,
                        ],
                        pipeCwd: codeRoot,
                        pipeProgram: 'powershell',
                    },
                },
            }

            assertEqualLaunchConfigs(actual, expected)

            await assertFileText(
                expected.templatePath,
                `Resources:
  HelloWorld:
    Type: AWS::Serverless::Function
    Properties:
      Handler: HelloWorld::HelloWorld.Function::FunctionHandler
      CodeUri: >-
        ${input.invokeTarget.projectRoot}
      Runtime: dotnet6
`
            )

            //
            // Test pathMapping
            //
            const inputWithPathMapping = {
                ...input,
                lambda: {
                    ...input.lambda,
                    pathMappings: [
                        {
                            localRoot: 'somethingLocal',
                            remoteRoot: 'somethingRemote',
                        },
                        {
                            localRoot: 'anotherLocal',
                            remoteRoot: 'anotherRemote',
                        },
                    ] as PathMapping[],
                },
            }
            const actualWithPathMapping = (await debugConfigProvider.makeConfig(folder, inputWithPathMapping))!
            const expectedWithPathMapping: SamLaunchRequestArgs = {
                ...expected,
                lambda: {
                    ...expected.lambda,
                    pathMappings: inputWithPathMapping.lambda.pathMappings,
                },
                sourceFileMap: {
                    somethingRemote: 'somethingLocal',
                    anotherRemote: 'anotherLocal',
                },
                baseBuildDir: actualWithPathMapping.baseBuildDir,
                envFile: undefined,
                eventPayloadFile: undefined,
            }
            assertEqualLaunchConfigs(actualWithPathMapping, expectedWithPathMapping)

            //
            // Test noDebug=true.
            //
            ;(input as any).noDebug = true
            const actualNoDebug = (await debugConfigProvider.makeConfig(folder, input))! as SamLaunchRequestArgs
            const expectedCodeRootNoDebug = (actualNoDebug.baseBuildDir ?? 'fail') + '/input'
            const expectedNoDebug: SamLaunchRequestArgs = {
                ...expected,
                codeRoot: expectedCodeRootNoDebug,
                noDebug: true,
                request: 'launch',
                debuggerPath: undefined,
                debugPort: undefined,
                baseBuildDir: actualNoDebug.baseBuildDir,
                envFile: undefined,
                eventPayloadFile: undefined,
            }
            delete expectedNoDebug.processName
            delete expectedNoDebug.pipeTransport
            delete expectedNoDebug.sourceFileMap
            delete expectedNoDebug.windows
            assertEqualLaunchConfigs(actualNoDebug, expectedNoDebug)
        })

        it('target=template: dotnet/csharp', async function () {
            const appDir = pathutil.normalize(
                path.join(testutil.getProjectDir(), 'testFixtures/workspaceFolder/csharp6-zip')
            )
            const folder = testutil.getWorkspaceFolder(appDir)
            const input = {
                type: AWS_SAM_DEBUG_TYPE,
                name: 'test-csharp-template',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: TEMPLATE_TARGET_TYPE,
                    templatePath: 'template.yaml',
                    logicalId: 'HelloWorldFunction',
                },
                sam: {
                    containerBuild: true, // #3864
                },
                lambda: {
                    environmentVariables: {
                        'test-envvar-1': 'test value 1',
                    },
                    memoryMb: 42,
                    timeoutSec: 10,
                    payload: {
                        json: {
                            'test-payload-key-1': 'test payload value 1',
                        },
                    },
                },
            }
            const templatePath = vscode.Uri.file(path.join(appDir, 'template.yaml'))
            const actual = (await debugConfigProvider.makeConfig(folder, input))! as SamLaunchRequestArgs
            const codeRoot = `${appDir}/src/HelloWorld`
            const expectedCodeRoot = (actual.baseBuildDir ?? 'fail') + '/input'
            const expected: SamLaunchRequestArgs = {
                awsCredentials: fakeCredentials,
                request: 'attach', // Input "direct-invoke", output "attach".
                runtime: 'dotnet6', // lambdaModel.dotNetRuntimes[0],
                runtimeFamily: lambdaModel.RuntimeFamily.DotNet,
                useIkpdb: false,
                type: AWS_SAM_DEBUG_TYPE,
                workspaceFolder: {
                    index: 0,
                    name: 'test-workspace-folder',
                    uri: vscode.Uri.file(appDir),
                },
                baseBuildDir: actual.baseBuildDir, // Random, sanity-checked by assertEqualLaunchConfigs().
                envFile: `${actual.baseBuildDir}/env-vars.json`,
                eventPayloadFile: `${actual.baseBuildDir}/event.json`,
                codeRoot: expectedCodeRoot,
                apiPort: undefined,
                debugPort: actual.debugPort,
                documentUri: vscode.Uri.file(''), // TODO: remove or test.
                handlerName: 'HelloWorld::HelloWorld.Function::FunctionHandler',
                invokeTarget: { ...input.invokeTarget },
                sam: { ...input.sam },
                lambda: {
                    ...input.lambda,
                },
                name: input.name,
                architecture: 'x86_64',
                templatePath: pathutil.normalize(path.join(path.dirname(templatePath.fsPath), 'template.yaml')),
                mountWith: 'write',
                region: 'us-west-2',

                //
                // Csharp-related fields
                //
                debuggerPath: codeRoot + '/.vsdbg', // Normalized to absolute path.
                processName: 'dotnet',
                pipeTransport: {
                    debuggerPath: '/tmp/lambci_debug_files/vsdbg',
                    pipeArgs: [
                        '-c',
                        `docker exec -i $(docker ps -q -f publish=${actual.debugPort}) \${debuggerCommand}`,
                    ],
                    pipeCwd: codeRoot,
                    pipeProgram: 'sh',
                },
                windows: {
                    pipeTransport: {
                        debuggerPath: '/tmp/lambci_debug_files/vsdbg',
                        pipeArgs: [
                            '-c',
                            `docker exec -i $(docker ps -q -f publish=${actual.debugPort}) \${debuggerCommand}`,
                        ],
                        pipeCwd: codeRoot,
                        pipeProgram: 'powershell',
                    },
                },
                parameterOverrides: undefined,
            }

            assertEqualLaunchConfigs(actual, expected)
            await assertFileText(expected.envFile!, '{"HelloWorldFunction":{"test-envvar-1":"test value 1"}}')
            await assertFileText(expected.eventPayloadFile!, '{"test-payload-key-1":"test payload value 1"}')

            //
            // Test pathMapping
            //
            const inputWithPathMapping = {
                ...input,
                lambda: {
                    ...input.lambda,
                    pathMappings: [
                        {
                            localRoot: 'somethingLocal',
                            remoteRoot: 'somethingRemote',
                        },
                        {
                            localRoot: 'anotherLocal',
                            remoteRoot: 'anotherRemote',
                        },
                    ] as PathMapping[],
                },
            }
            const actualWithPathMapping = (await debugConfigProvider.makeConfig(folder, inputWithPathMapping))!
            const expectedWithPathMapping: SamLaunchRequestArgs = {
                ...expected,
                lambda: {
                    ...expected.lambda,
                    pathMappings: inputWithPathMapping.lambda.pathMappings,
                },
                sourceFileMap: {
                    somethingRemote: 'somethingLocal',
                    anotherRemote: 'anotherLocal',
                },
                baseBuildDir: actualWithPathMapping.baseBuildDir,
                envFile: `${actualWithPathMapping.baseBuildDir}/env-vars.json`,
                eventPayloadFile: `${actualWithPathMapping.baseBuildDir}/event.json`,
            }
            assertEqualLaunchConfigs(actualWithPathMapping, expectedWithPathMapping)

            //
            // Test noDebug=true.
            //
            ;(input as any).noDebug = true
            const actualNoDebug = (await debugConfigProvider.makeConfig(folder, input))! as SamLaunchRequestArgs
            const expectedCodeRootNoDebug = (actualNoDebug.baseBuildDir ?? 'fail') + '/input'
            const expectedNoDebug: SamLaunchRequestArgs = {
                ...expected,
                codeRoot: expectedCodeRootNoDebug,
                noDebug: true,
                request: 'launch',
                debuggerPath: undefined,
                debugPort: undefined,
                baseBuildDir: actualNoDebug.baseBuildDir,
                envFile: `${actualNoDebug.baseBuildDir}/env-vars.json`,
                eventPayloadFile: `${actualNoDebug.baseBuildDir}/event.json`,
            }
            delete expectedNoDebug.processName
            delete expectedNoDebug.pipeTransport
            delete expectedNoDebug.sourceFileMap
            delete expectedNoDebug.windows
            assertEqualLaunchConfigs(actualNoDebug, expectedNoDebug)
        })

        it('target=template: Image dotnet/csharp', async function () {
            const appDir = pathutil.normalize(
                path.join(testutil.getProjectDir(), 'testFixtures/workspaceFolder/csharp6-image')
            )
            const folder = testutil.getWorkspaceFolder(appDir)
            const input = {
                type: AWS_SAM_DEBUG_TYPE,
                name: 'test-csharp-image-template',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: TEMPLATE_TARGET_TYPE,
                    templatePath: 'template.yaml',
                    logicalId: 'HelloWorldFunction',
                },
                lambda: {
                    runtime: 'dotnet6',
                    environmentVariables: {
                        'test-envvar-1': 'test value 1',
                    },
                    memoryMb: 42,
                    timeoutSec: 10,
                    payload: {
                        json: {
                            'test-payload-key-1': 'test payload value 1',
                        },
                    },
                },
            }
            const templatePath = vscode.Uri.file(path.join(appDir, 'template.yaml'))
            const actual = (await debugConfigProvider.makeConfig(folder, input))! as SamLaunchRequestArgs
            const codeRoot = `${appDir}/src/HelloWorld`
            const expectedCodeRoot = (actual.baseBuildDir ?? 'fail') + '/input'
            const expected: SamLaunchRequestArgs = {
                awsCredentials: fakeCredentials,
                request: 'attach', // Input "direct-invoke", output "attach".
                runtime: 'dotnet6', // lambdaModel.dotNetRuntimes[0],
                runtimeFamily: lambdaModel.RuntimeFamily.DotNet,
                useIkpdb: false,
                type: AWS_SAM_DEBUG_TYPE,
                workspaceFolder: {
                    index: 0,
                    name: 'test-workspace-folder',
                    uri: vscode.Uri.file(appDir),
                },
                baseBuildDir: actual.baseBuildDir, // Random, sanity-checked by assertEqualLaunchConfigs().
                containerEnvFile: `${actual.baseBuildDir}/container-env-vars.json`,
                containerEnvVars: {
                    _AWS_LAMBDA_DOTNET_DEBUGGING: '1',
                },
                envFile: `${actual.baseBuildDir}/env-vars.json`,
                eventPayloadFile: `${actual.baseBuildDir}/event.json`,
                codeRoot: expectedCodeRoot,
                apiPort: undefined,
                debugPort: actual.debugPort,
                documentUri: vscode.Uri.file(''), // TODO: remove or test.
                handlerName: 'HelloWorldFunction',
                invokeTarget: { ...input.invokeTarget },
                lambda: {
                    ...input.lambda,
                },
                name: input.name,
                templatePath: pathutil.normalize(path.join(path.dirname(templatePath.fsPath), 'template.yaml')),
                parameterOverrides: undefined,
                architecture: undefined,
                region: 'us-west-2',

                //
                // Csharp-related fields
                //
                debuggerPath: codeRoot + '/.vsdbg', // Normalized to absolute path.
                processName: 'dotnet',
                pipeTransport: {
                    debuggerPath: '/tmp/lambci_debug_files/vsdbg',
                    // tslint:disable-next-line: no-invalid-template-strings
                    pipeArgs: [
                        '-c',
                        `docker exec -i $(docker ps -q -f publish=${actual.debugPort}) \${debuggerCommand}`,
                    ],
                    pipeCwd: codeRoot,
                    pipeProgram: 'sh',
                },
                sourceFileMap: {
                    '/build': codeRoot,
                },
                windows: {
                    pipeTransport: {
                        debuggerPath: '/tmp/lambci_debug_files/vsdbg',
                        // tslint:disable-next-line: no-invalid-template-strings
                        pipeArgs: [
                            '-c',
                            `docker exec -i $(docker ps -q -f publish=${actual.debugPort}) \${debuggerCommand}`,
                        ],
                        pipeCwd: codeRoot,
                        pipeProgram: 'powershell',
                    },
                },
            }

            assertEqualLaunchConfigs(actual, expected)
            await assertFileText(expected.envFile!, '{"HelloWorldFunction":{"test-envvar-1":"test value 1"}}')
            await assertFileText(expected.eventPayloadFile!, '{"test-payload-key-1":"test payload value 1"}')
            await assertFileText(expected.containerEnvFile!, '{"_AWS_LAMBDA_DOTNET_DEBUGGING":"1"}')

            // Windows: sourceFileMap driveletter must be uppercase.
            if (os.platform() === 'win32') {
                const sourceFileMap = actual.sourceFileMap!['/build']
                assert.ok(/^[A-Z]:/.test(sourceFileMap.substring(0, 2)), 'sourceFileMap driveletter must be uppercase')
            }

            //
            // Test pathMapping
            //
            const inputWithPathMapping = {
                ...input,
                lambda: {
                    ...input.lambda,
                    pathMappings: [
                        {
                            localRoot: 'somethingLocal',
                            remoteRoot: 'somethingRemote',
                        },
                        {
                            localRoot: 'anotherLocal',
                            remoteRoot: 'anotherRemote',
                        },
                    ] as PathMapping[],
                },
            }
            const actualWithPathMapping = (await debugConfigProvider.makeConfig(folder, inputWithPathMapping))!
            const expectedWithPathMapping: SamLaunchRequestArgs = {
                ...expected,
                lambda: {
                    ...expected.lambda,
                    pathMappings: inputWithPathMapping.lambda.pathMappings,
                },
                sourceFileMap: {
                    somethingRemote: 'somethingLocal',
                    anotherRemote: 'anotherLocal',
                },
                baseBuildDir: actualWithPathMapping.baseBuildDir,
                containerEnvFile: `${actualWithPathMapping.baseBuildDir}/container-env-vars.json`,
                envFile: `${actualWithPathMapping.baseBuildDir}/env-vars.json`,
                eventPayloadFile: `${actualWithPathMapping.baseBuildDir}/event.json`,
            }
            assertEqualLaunchConfigs(actualWithPathMapping, expectedWithPathMapping)

            //
            // Test noDebug=true.
            //
            ;(input as any).noDebug = true
            const actualNoDebug = (await debugConfigProvider.makeConfig(folder, input))! as SamLaunchRequestArgs
            const expectedCodeRootNoDebug = (actualNoDebug.baseBuildDir ?? 'fail') + '/input'
            const expectedNoDebug: SamLaunchRequestArgs = {
                ...expected,
                codeRoot: expectedCodeRootNoDebug,
                noDebug: true,
                request: 'launch',
                debuggerPath: undefined,
                debugPort: undefined,
                baseBuildDir: actualNoDebug.baseBuildDir,
                envFile: `${actualNoDebug.baseBuildDir}/env-vars.json`,
                eventPayloadFile: `${actualNoDebug.baseBuildDir}/event.json`,
            }
            delete expectedNoDebug.processName
            delete expectedNoDebug.pipeTransport
            delete expectedNoDebug.sourceFileMap
            delete expectedNoDebug.windows
            assertEqualLaunchConfigs(actualNoDebug, expectedNoDebug)
        })

        it('target=code: python 3.7', async function () {
            const appDir = pathutil.normalize(
                path.join(testutil.getProjectDir(), 'testFixtures/workspaceFolder/python3.7-plain-sam-app')
            )
            const relPayloadPath = `events/event.json`
            const absPayloadPath = `${appDir}/${relPayloadPath}`
            const folder = testutil.getWorkspaceFolder(appDir)
            const input = {
                type: AWS_SAM_DEBUG_TYPE,
                name: 'Test debugconfig',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: CODE_TARGET_TYPE,
                    lambdaHandler: 'app.lambda_handler',
                    projectRoot: 'hello_world',
                },
                lambda: {
                    runtime: 'python3.7',
                    payload: {
                        path: relPayloadPath,
                    },
                },
            }

            // Invoke with noDebug=false (the default).
            const actual = (await debugConfigProvider.makeConfig(folder, input))!
            // Expected result with noDebug=false.
            const expected: SamLaunchRequestArgs = {
                awsCredentials: fakeCredentials,
                request: 'attach', // Input "direct-invoke", output "attach".
                runtime: 'python3.7',
                runtimeFamily: lambdaModel.RuntimeFamily.Python,
                useIkpdb: false,
                type: AWS_SAM_DEBUG_TYPE,
                handlerName: 'app.lambda_handler',
                workspaceFolder: {
                    index: 0,
                    name: 'test-workspace-folder',
                    uri: vscode.Uri.file(appDir),
                },
                baseBuildDir: actual.baseBuildDir, // Random, sanity-checked by assertEqualLaunchConfigs().
                envFile: undefined,
                eventPayloadFile: `${actual.baseBuildDir}/event.json`,
                codeRoot: pathutil.normalize(path.join(appDir, 'hello_world')),
                debugArgs: [
                    `/tmp/lambci_debug_files/py_debug_wrapper.py --listen 0.0.0.0:${actual.debugPort} --wait-for-client --log-to-stderr --debug`,
                ],
                apiPort: undefined,
                debugPort: actual.debugPort,
                documentUri: vscode.Uri.file(''), // TODO: remove or test.
                invokeTarget: { ...input.invokeTarget },
                lambda: {
                    ...input.lambda,
                    environmentVariables: {},
                    memoryMb: undefined,
                    timeoutSec: undefined,
                },
                name: input.name,
                templatePath: pathutil.normalize(path.join(actual.baseBuildDir!, 'app___vsctk___template.yaml')),
                port: actual.debugPort,
                redirectOutput: false,
                parameterOverrides: undefined,
                architecture: undefined,
                region: 'us-west-2',

                //
                // Python-related fields
                //
                host: 'localhost',
                pathMappings: [
                    {
                        localRoot: pathutil.normalize(path.join(appDir, 'hello_world')),
                        remoteRoot: '/var/task',
                    },
                ],
            }

            // Windows: pathMappings has uppercase and lowercase variants.
            // See getLocalRootVariants(). ref: 4bd1418863edd45e27
            if (os.platform() === 'win32') {
                const localRoot: string = expected.pathMappings[0].localRoot
                expected.pathMappings.unshift({
                    localRoot: localRoot.substring(0, 1).toLowerCase() + localRoot.substring(1),
                    remoteRoot: '/var/task',
                })
            }

            assertEqualLaunchConfigs(actual, expected)
            assert.strictEqual(await fs.readFileText(actual.eventPayloadFile!), await fs.readFileText(absPayloadPath))
            await assertFileText(
                expected.templatePath,
                `Resources:
  helloworld:
    Type: AWS::Serverless::Function
    Properties:
      Handler: ${expected.handlerName}
      CodeUri: >-
        ${expected.codeRoot}
      Runtime: python3.7
`
            )

            //
            // Test pathMapping
            //
            const inputWithPathMapping = {
                ...input,
                lambda: {
                    ...input.lambda,
                    pathMappings: [
                        {
                            localRoot: 'somethingLocal',
                            remoteRoot: 'somethingRemote',
                        },
                        {
                            localRoot: 'anotherLocal',
                            remoteRoot: 'anotherRemote',
                        },
                    ] as PathMapping[],
                },
            }
            const actualWithPathMapping = (await debugConfigProvider.makeConfig(folder, inputWithPathMapping))!
            const expectedWithPathMapping: SamLaunchRequestArgs = {
                ...expected,
                lambda: {
                    ...expected.lambda,
                    pathMappings: inputWithPathMapping.lambda.pathMappings,
                },
                pathMappings: inputWithPathMapping.lambda.pathMappings,
                baseBuildDir: actualWithPathMapping.baseBuildDir,
                envFile: undefined,
                eventPayloadFile: `${actualWithPathMapping.baseBuildDir}/event.json`,
            }
            assertEqualLaunchConfigs(actualWithPathMapping, expectedWithPathMapping)

            //
            // Test noDebug=true.
            //
            ;(input as any).noDebug = true
            const actualNoDebug = (await debugConfigProvider.makeConfig(folder, input))! as SamLaunchRequestArgs
            const expectedNoDebug: SamLaunchRequestArgs = {
                ...expected,
                noDebug: true,
                request: 'launch',
                debugPort: undefined,
                port: -1,
                handlerName: 'app.lambda_handler',
                baseBuildDir: actualNoDebug.baseBuildDir,
                envFile: undefined,
                eventPayloadFile: `${actualNoDebug.baseBuildDir}/event.json`,
            }
            assertEqualLaunchConfigs(actualNoDebug, expectedNoDebug)
        })

        it('target=template: python 3.7 (deep project tree)', async function () {
            // To test a deeper tree, use "testFixtures/workspaceFolder/" as the root.
            const appDir = pathutil.normalize(path.join(testutil.getProjectDir(), 'testFixtures/workspaceFolder/'))
            const folder = testutil.getWorkspaceFolder(appDir)
            const input = {
                type: AWS_SAM_DEBUG_TYPE,
                name: 'test-py37-template',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: TEMPLATE_TARGET_TYPE,
                    templatePath: 'python3.7-plain-sam-app/template.yaml',
                    logicalId: 'HelloWorldFunction',
                },
            }
            const templatePath = vscode.Uri.file(path.join(appDir, 'python3.7-plain-sam-app/template.yaml'))

            // Invoke with noDebug=false (the default).
            const actual = (await debugConfigProvider.makeConfig(folder, input))!
            // Expected result with noDebug=false.
            const expected: SamLaunchRequestArgs = {
                awsCredentials: fakeCredentials,
                request: 'attach', // Input "direct-invoke", output "attach".
                runtime: 'python3.7',
                runtimeFamily: lambdaModel.RuntimeFamily.Python,
                useIkpdb: false,
                type: AWS_SAM_DEBUG_TYPE,
                handlerName: 'app.lambda_handler',
                workspaceFolder: {
                    index: 0,
                    name: 'test-workspace-folder',
                    uri: vscode.Uri.file(appDir),
                },
                baseBuildDir: actual.baseBuildDir, // Random, sanity-checked by assertEqualLaunchConfigs().
                envFile: undefined,
                eventPayloadFile: undefined,
                codeRoot: pathutil.normalize(path.join(appDir, 'python3.7-plain-sam-app/hello_world')),
                debugArgs: [
                    `/tmp/lambci_debug_files/py_debug_wrapper.py --listen 0.0.0.0:${actual.debugPort} --wait-for-client --log-to-stderr --debug`,
                ],
                apiPort: undefined,
                debugPort: actual.debugPort,
                documentUri: vscode.Uri.file(''), // TODO: remove or test.
                invokeTarget: { ...input.invokeTarget },
                lambda: {
                    environmentVariables: {},
                    memoryMb: undefined,
                    timeoutSec: 3,
                },
                name: input.name,
                templatePath: pathutil.normalize(path.join(path.dirname(templatePath.fsPath), 'template.yaml')),
                port: actual.debugPort,
                redirectOutput: false,
                parameterOverrides: undefined,
                architecture: undefined,
                region: 'us-west-2',

                //
                // Python-related fields
                //
                host: 'localhost',
                pathMappings: [
                    {
                        localRoot: pathutil.normalize(path.join(appDir, 'python3.7-plain-sam-app/hello_world')),
                        remoteRoot: '/var/task',
                    },
                ],
            }

            // Windows: pathMappings has uppercase and lowercase variants.
            // See getLocalRootVariants(). ref: 4bd1418863edd45e27
            if (os.platform() === 'win32') {
                const localRoot: string = expected.pathMappings[0].localRoot
                expected.pathMappings.unshift({
                    localRoot: localRoot.substring(0, 1).toLowerCase() + localRoot.substring(1),
                    remoteRoot: '/var/task',
                })
            }

            assertEqualLaunchConfigs(actual, expected)

            //
            // Test pathMapping
            //
            const inputWithPathMapping = {
                ...input,
                lambda: {
                    pathMappings: [
                        {
                            localRoot: 'somethingLocal',
                            remoteRoot: 'somethingRemote',
                        },
                        {
                            localRoot: 'anotherLocal',
                            remoteRoot: 'anotherRemote',
                        },
                    ] as PathMapping[],
                },
            }
            const actualWithPathMapping = (await debugConfigProvider.makeConfig(folder, inputWithPathMapping))!
            const expectedWithPathMapping: SamLaunchRequestArgs = {
                ...expected,
                lambda: {
                    ...expected.lambda,
                    pathMappings: inputWithPathMapping.lambda.pathMappings,
                },
                pathMappings: inputWithPathMapping.lambda.pathMappings,
                baseBuildDir: actualWithPathMapping.baseBuildDir,
                envFile: undefined,
                eventPayloadFile: undefined,
            }
            assertEqualLaunchConfigs(actualWithPathMapping, expectedWithPathMapping)

            // Test noDebug=true.
            expected.handlerName = 'app.lambda_handler'
            await assertEqualNoDebugTemplateTarget(input, expected, folder, debugConfigProvider, true)
        })

        it('target=api: python 3.7 (deep project tree)', async function () {
            // Use "testFixtures/workspaceFolder/" as the project root to test
            // a deeper tree.
            const appDir = pathutil.normalize(path.join(testutil.getProjectDir(), 'testFixtures/workspaceFolder/'))
            const folder = testutil.getWorkspaceFolder(appDir)
            const input: AwsSamDebuggerConfiguration = {
                type: AWS_SAM_DEBUG_TYPE,
                name: 'test-py37-api',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: API_TARGET_TYPE,
                    templatePath: 'python3.7-plain-sam-app/template.yaml',
                    logicalId: 'HelloWorldFunction',
                },
                api: {
                    path: '/hello',
                    httpMethod: 'put',
                    headers: {
                        'accept-language': 'es-CA',
                    },
                    querystring: 'name1=value1&foo&bar',
                },
            }
            const templatePath = vscode.Uri.file(path.join(appDir, 'python3.7-plain-sam-app/template.yaml'))

            // Invoke with noDebug=false (the default).
            const actual = (await debugConfigProvider.makeConfig(folder, input))!
            // Expected result with noDebug=false.
            const expected: SamLaunchRequestArgs = {
                awsCredentials: fakeCredentials,
                request: 'attach', // Input "direct-invoke", output "attach".
                runtime: 'python3.7',
                runtimeFamily: lambdaModel.RuntimeFamily.Python,
                useIkpdb: false,
                type: AWS_SAM_DEBUG_TYPE,
                handlerName: 'app.lambda_handler',
                workspaceFolder: {
                    index: 0,
                    name: 'test-workspace-folder',
                    uri: vscode.Uri.file(appDir),
                },
                baseBuildDir: actual.baseBuildDir, // Random, sanity-checked by assertEqualLaunchConfigs().
                envFile: undefined,
                eventPayloadFile: undefined,
                codeRoot: pathutil.normalize(path.join(appDir, 'python3.7-plain-sam-app/hello_world')),
                debugArgs: [
                    `/tmp/lambci_debug_files/py_debug_wrapper.py --listen 0.0.0.0:${actual.debugPort} --wait-for-client --log-to-stderr --debug`,
                ],
                apiPort: actual.apiPort,
                debugPort: actual.debugPort,
                documentUri: vscode.Uri.file(''), // TODO: remove or test.
                invokeTarget: { ...input.invokeTarget },
                api: {
                    ...(input.api as APIGatewayProperties),
                },
                lambda: {
                    environmentVariables: {},
                    memoryMb: undefined,
                    timeoutSec: 3,
                },
                name: input.name,
                templatePath: pathutil.normalize(path.join(path.dirname(templatePath.fsPath), 'template.yaml')),
                port: actual.debugPort,
                redirectOutput: false,
                architecture: undefined,
                region: 'us-west-2',

                //
                // Python-related fields
                //
                host: 'localhost',
                pathMappings: [
                    {
                        localRoot: pathutil.normalize(path.join(appDir, 'python3.7-plain-sam-app/hello_world')),
                        remoteRoot: '/var/task',
                    },
                ],
                parameterOverrides: undefined,
            }

            // Windows: pathMappings has uppercase and lowercase variants.
            // See getLocalRootVariants(). ref: 4bd1418863edd45e27
            if (os.platform() === 'win32') {
                const localRoot: string = expected.pathMappings[0].localRoot
                expected.pathMappings.unshift({
                    localRoot: localRoot.substring(0, 1).toLowerCase() + localRoot.substring(1),
                    remoteRoot: '/var/task',
                })
            }

            assertEqualLaunchConfigs(actual, expected)

            // Test noDebug=true.
            expected.handlerName = 'app.lambda_handler'
            await assertEqualNoDebugTemplateTarget(input, expected, folder, debugConfigProvider, true)
        })

        it('target=template: Image python 3.7', async function () {
            // Use "testFixtures/workspaceFolder/" as the project root to test
            // a deeper tree.
            const appDir = pathutil.normalize(path.join(testutil.getProjectDir(), 'testFixtures/workspaceFolder/'))
            const folder = testutil.getWorkspaceFolder(appDir)
            const input = {
                type: AWS_SAM_DEBUG_TYPE,
                name: 'test-py37-image-template',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: TEMPLATE_TARGET_TYPE,
                    templatePath: 'python3.7-image-sam-app/template.yaml',
                    logicalId: 'HelloWorldFunction',
                },
                lambda: {
                    runtime: 'python3.7',
                },
            }
            const templatePath = vscode.Uri.file(path.join(appDir, 'python3.7-image-sam-app/template.yaml'))

            // Invoke with noDebug=false (the default).
            const actual = (await debugConfigProvider.makeConfig(folder, input))!
            // Expected result with noDebug=false.
            const expected: SamLaunchRequestArgs = {
                awsCredentials: fakeCredentials,
                request: 'attach', // Input "direct-invoke", output "attach".
                runtime: 'python3.7',
                runtimeFamily: lambdaModel.RuntimeFamily.Python,
                useIkpdb: false,
                type: AWS_SAM_DEBUG_TYPE,
                handlerName: 'HelloWorldFunction',
                workspaceFolder: {
                    index: 0,
                    name: 'test-workspace-folder',
                    uri: vscode.Uri.file(appDir),
                },
                baseBuildDir: actual.baseBuildDir, // Random, sanity-checked by assertEqualLaunchConfigs().
                envFile: undefined,
                eventPayloadFile: undefined,
                codeRoot: pathutil.normalize(path.join(appDir, 'python3.7-image-sam-app/hello_world')),
                debugArgs: [
                    `/var/lang/bin/python3.7 /tmp/lambci_debug_files/py_debug_wrapper.py --listen 0.0.0.0:${actual.debugPort} --wait-for-client --log-to-stderr /var/runtime/bootstrap --debug`,
                ],
                apiPort: undefined,
                debugPort: actual.debugPort,
                documentUri: vscode.Uri.file(''), // TODO: remove or test.
                invokeTarget: { ...input.invokeTarget },
                lambda: {
                    environmentVariables: {},
                    memoryMb: undefined,
                    timeoutSec: 3,
                    runtime: 'python3.7',
                },
                name: input.name,
                templatePath: pathutil.normalize(path.join(path.dirname(templatePath.fsPath), 'template.yaml')),
                port: actual.debugPort,
                redirectOutput: false,
                architecture: undefined,
                region: 'us-west-2',

                //
                // Python-related fields
                //
                host: 'localhost',
                pathMappings: [
                    {
                        localRoot: pathutil.normalize(path.join(appDir, 'python3.7-image-sam-app/hello_world')),
                        remoteRoot: '/var/task',
                    },
                ],
                parameterOverrides: undefined,
            }

            // Windows: pathMappings has uppercase and lowercase variants.
            // See getLocalRootVariants(). ref: 4bd1418863edd45e27
            if (os.platform() === 'win32') {
                const localRoot: string = expected.pathMappings[0].localRoot
                expected.pathMappings.unshift({
                    localRoot: localRoot.substring(0, 1).toLowerCase() + localRoot.substring(1),
                    remoteRoot: '/var/task',
                })
            }

            assertEqualLaunchConfigs(actual, expected)

            //
            // Test pathMapping
            //
            const inputWithPathMapping = {
                ...input,
                lambda: {
                    ...input.lambda,
                    pathMappings: [
                        {
                            localRoot: 'somethingLocal',
                            remoteRoot: 'somethingRemote',
                        },
                        {
                            localRoot: 'anotherLocal',
                            remoteRoot: 'anotherRemote',
                        },
                    ] as PathMapping[],
                },
            }
            const actualWithPathMapping = (await debugConfigProvider.makeConfig(folder, inputWithPathMapping))!
            const expectedWithPathMapping: SamLaunchRequestArgs = {
                ...expected,
                lambda: {
                    ...expected.lambda,
                    pathMappings: inputWithPathMapping.lambda.pathMappings,
                },
                pathMappings: inputWithPathMapping.lambda.pathMappings,
                baseBuildDir: actualWithPathMapping.baseBuildDir,
                envFile: undefined,
                eventPayloadFile: undefined,
            }
            assertEqualLaunchConfigs(actualWithPathMapping, expectedWithPathMapping)

            //
            // Test noDebug=true.
            //
            ;(input as any).noDebug = true
            const actualNoDebug = (await debugConfigProvider.makeConfig(folder, input))!
            const expectedNoDebug: SamLaunchRequestArgs = {
                ...expected,
                noDebug: true,
                request: 'launch',
                debugPort: undefined,
                port: -1,
                baseBuildDir: actualNoDebug.baseBuildDir,
                envFile: undefined,
                eventPayloadFile: undefined,
            }
            assertEqualLaunchConfigs(actualNoDebug, expectedNoDebug)
        })

        it('verify python debug option not set for non-debug log level', async function () {
            const appDir = pathutil.normalize(
                path.join(testutil.getProjectDir(), 'testFixtures/workspaceFolder/python3.7-plain-sam-app')
            )
            const relPayloadPath = `events/event.json`
            const folder = testutil.getWorkspaceFolder(appDir)
            const input = {
                type: AWS_SAM_DEBUG_TYPE,
                name: 'Test debugconfig',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: CODE_TARGET_TYPE,
                    lambdaHandler: 'app.lambda_handler',
                    projectRoot: 'hello_world',
                },
                lambda: {
                    runtime: 'python3.7', // Arbitrary choice of runtime for this test
                    payload: {
                        path: relPayloadPath,
                    },
                },
            }
            // Debug option should not appear now
            getLogger().setLogLevel('verbose')
            const actual = (await debugConfigProvider.makeConfig(folder, input))!
            // Just check that a debug flag is not being passed to the wrapper
            assert.strictEqual(
                actual.debugArgs![0],
                `/tmp/lambci_debug_files/py_debug_wrapper.py --listen 0.0.0.0:${actual.debugPort} --wait-for-client --log-to-stderr`,
                'Debug option was set for log level "verbose"'
            )
            getLogger().setLogLevel('debug')
        })

        it('target=code: ikpdb, python 3.7', async function () {
            const appDir = pathutil.normalize(
                path.join(testutil.getProjectDir(), 'testFixtures/workspaceFolder/python3.7-plain-sam-app')
            )
            const folder = testutil.getWorkspaceFolder(appDir)
            const input = {
                type: AWS_SAM_DEBUG_TYPE,
                name: 'test: ikpdb target=code',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: CODE_TARGET_TYPE,
                    lambdaHandler: 'app.lambda_handler',
                    projectRoot: 'hello_world',
                },
                lambda: {
                    runtime: 'python3.7',
                    payload: {
                        path: `${appDir}/events/event.json`,
                    },
                },
                // Force ikpdb in non-cloud9 environment.
                useIkpdb: true,
            }

            // Invoke with noDebug=false (the default).
            const actual = (await debugConfigProvider.makeConfig(folder, input))!
            // Expected result with noDebug=false.
            const expected: SamLaunchRequestArgs = {
                awsCredentials: fakeCredentials,
                request: 'attach', // Input "direct-invoke", output "attach".
                runtime: 'python3.7',
                runtimeFamily: lambdaModel.RuntimeFamily.Python,
                useIkpdb: true,
                type: AWS_SAM_DEBUG_TYPE,
                handlerName: 'app.lambda_handler',
                workspaceFolder: {
                    index: 0,
                    name: 'test-workspace-folder',
                    uri: vscode.Uri.file(appDir),
                },
                baseBuildDir: actual.baseBuildDir, // Random, sanity-checked by assertEqualLaunchConfigs().
                envFile: undefined,
                eventPayloadFile: `${actual.baseBuildDir}/event.json`,
                codeRoot: pathutil.normalize(path.join(appDir, 'hello_world')),
                debugArgs: [
                    `-m ikp3db --ikpdb-address=0.0.0.0 --ikpdb-port=${actual.debugPort} -ik_ccwd=hello_world -ik_cwd=/var/task --ikpdb-log=BEXFPG`,
                ],
                apiPort: actual.apiPort,
                debugPort: actual.debugPort,
                documentUri: vscode.Uri.file(''), // TODO: remove or test.
                invokeTarget: { ...input.invokeTarget },
                lambda: {
                    ...input.lambda,
                    environmentVariables: {},
                    memoryMb: undefined,
                    timeoutSec: undefined,
                },
                sam: {
                    containerBuild: true,
                },
                name: input.name,
                templatePath: pathutil.normalize(path.join(actual.baseBuildDir!, 'app___vsctk___template.yaml')),
                parameterOverrides: undefined,
                architecture: undefined,
                region: 'us-west-2',

                //
                // Python-ikpdb fields
                //
                port: actual.debugPort,
                address: 'localhost',
                localRoot: pathutil.normalize(path.join(appDir, 'hello_world')),
                remoteRoot: '/var/task',
            }

            assertEqualLaunchConfigs(actual, expected)
            assert.strictEqual(
                await fs.readFileText(actual.eventPayloadFile!),
                await fs.readFileText(input.lambda.payload.path)
            )
            await assertFileText(
                expected.templatePath,
                `Resources:
  helloworld:
    Type: AWS::Serverless::Function
    Properties:
      Handler: ${expected.handlerName}
      CodeUri: >-
        ${expected.codeRoot}
      Runtime: python3.7
`
            )

            //
            // Test noDebug=true.
            //
            ;(input as any).noDebug = true
            const actualNoDebug = (await debugConfigProvider.makeConfig(folder, input))! as SamLaunchRequestArgs
            const expectedNoDebug: SamLaunchRequestArgs = {
                ...expected,
                noDebug: true,
                request: 'launch',
                debugPort: undefined,
                port: -1,
                handlerName: 'app.lambda_handler',
                baseBuildDir: actualNoDebug.baseBuildDir,
                envFile: undefined,
                eventPayloadFile: `${actualNoDebug.baseBuildDir}/event.json`,
            }
            assertEqualLaunchConfigs(actualNoDebug, expectedNoDebug)
        })

        it('target=template: ikpdb, python 3.7 (deep project tree)', async function () {
            // To test a deeper tree, use "testFixtures/workspaceFolder/" as the root.
            const appDir = pathutil.normalize(path.join(testutil.getProjectDir(), 'testFixtures/workspaceFolder/'))
            const folder = testutil.getWorkspaceFolder(appDir)
            const input = {
                type: AWS_SAM_DEBUG_TYPE,
                name: 'test-py37-template',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: TEMPLATE_TARGET_TYPE,
                    templatePath: 'python3.7-plain-sam-app/template.yaml',
                    logicalId: 'HelloWorldFunction',
                },
                // Force ikpdb in non-cloud9 environment.
                useIkpdb: true,
            }
            const templatePath = vscode.Uri.file(path.join(appDir, 'python3.7-plain-sam-app/template.yaml'))

            // Invoke with noDebug=false (the default).
            const actual = (await debugConfigProvider.makeConfig(folder, input))!
            // Expected result with noDebug=false.
            const expected: SamLaunchRequestArgs = {
                awsCredentials: fakeCredentials,
                request: 'attach', // Input "direct-invoke", output "attach".
                runtime: 'python3.7',
                runtimeFamily: lambdaModel.RuntimeFamily.Python,
                useIkpdb: true,
                type: AWS_SAM_DEBUG_TYPE,
                handlerName: 'app.lambda_handler',
                workspaceFolder: {
                    index: 0,
                    name: 'test-workspace-folder',
                    uri: vscode.Uri.file(appDir),
                },
                baseBuildDir: actual.baseBuildDir, // Random, sanity-checked by assertEqualLaunchConfigs().
                envFile: undefined,
                eventPayloadFile: undefined,
                codeRoot: pathutil.normalize(path.join(appDir, 'python3.7-plain-sam-app/hello_world')),
                apiPort: undefined,
                debugArgs: [
                    `-m ikp3db --ikpdb-address=0.0.0.0 --ikpdb-port=${actual.debugPort} -ik_ccwd=python3.7-plain-sam-app/hello_world -ik_cwd=/var/task --ikpdb-log=BEXFPG`,
                ],
                debugPort: actual.debugPort,
                documentUri: vscode.Uri.file(''), // TODO: remove or test.
                invokeTarget: { ...input.invokeTarget },
                lambda: {
                    environmentVariables: {},
                    memoryMb: undefined,
                    timeoutSec: 3,
                },
                sam: {
                    containerBuild: true,
                },
                name: input.name,
                templatePath: pathutil.normalize(path.join(path.dirname(templatePath.fsPath), 'template.yaml')),
                parameterOverrides: undefined,
                architecture: undefined,
                region: 'us-west-2',

                //
                // Python-ikpdb fields
                //
                port: actual.debugPort,
                address: 'localhost',
                localRoot: pathutil.normalize(path.join(appDir, 'hello_world')),
                remoteRoot: '/var/task',
            }

            assertEqualLaunchConfigs(actual, expected)

            //
            // Test noDebug=true.
            //
            ;(input as any).noDebug = true
            const actualNoDebug = (await debugConfigProvider.makeConfig(folder, input))!
            const expectedNoDebug: SamLaunchRequestArgs = {
                ...expected,
                noDebug: true,
                request: 'launch',
                debugPort: undefined,
                port: -1,
                handlerName: 'app.lambda_handler',
                baseBuildDir: actualNoDebug.baseBuildDir,
                envFile: undefined,
                eventPayloadFile: undefined,
            }
            assertEqualLaunchConfigs(actualNoDebug, expectedNoDebug)
        })

        it('debugconfig with "aws" section', async function () {
            // Simluates credentials in "aws.credentials" launch-config field.
            const configCredentials: Credentials = {
                accessKeyId: 'access-from-config',
                secretAccessKey: 'secret-from-config',
                sessionToken: 'session-from-config',
            }
            const mockCredentialsStore: CredentialsStore = new CredentialsStore()

            const credentialsProvider: CredentialsProvider = {
                getCredentials: sandbox.stub().resolves({} as any as AWS.Credentials),
                getProviderType: sandbox.stub().resolves('profile'),
                getTelemetryType: sandbox.stub().resolves('staticProfile'),
                getCredentialsId: sandbox.stub().returns({
                    credentialSource: 'profile',
                    credentialTypeId: 'someId',
                }),
                getDefaultRegion: sandbox.stub().returns('someRegion'),
                getHashCode: sandbox.stub().returns('1234'),
                canAutoConnect: sandbox.stub().returns(true),
                isAvailable: sandbox.stub().returns(Promise.resolve(true)),
            }
            const getCredentialsProviderStub = sandbox.stub(
                CredentialsProviderManager.getInstance(),
                'getCredentialsProvider'
            )
            getCredentialsProviderStub.resolves(credentialsProvider)
            const upsertStub = sandbox.stub(mockCredentialsStore, 'upsertCredentials')
            upsertStub.resolves({
                credentials: configCredentials,
                credentialsHashCode: 'unimportant',
            })
            const debugConfigProviderMockCredentials = new SamDebugConfigProvider({
                ...fakeContext,
                credentialsStore: mockCredentialsStore,
            })

            const appDir = pathutil.normalize(
                path.join(testutil.getProjectDir(), 'testFixtures/workspaceFolder/js-manifest-in-root/')
            )
            const folder = testutil.getWorkspaceFolder(appDir)
            const awsSection = {
                aws: {
                    credentials: 'profile:success',
                    region: 'us-weast-9',
                },
            }
            const input = {
                type: AWS_SAM_DEBUG_TYPE,
                name: 'test-extraneous-env',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: TEMPLATE_TARGET_TYPE,
                    templatePath: tempFile.fsPath,
                    logicalId: resourceName,
                },
                lambda: {
                    // These are written to env-vars.json, but ignored by SAM.
                    environmentVariables: {
                        var1: '2',
                        var2: '1',
                    },
                },
                ...awsSection,
            }
            await testutil.toFile(
                makeSampleSamTemplateYaml(true, {
                    resourceName: resourceName,
                    runtime: 'nodejs18.x',
                    handler: 'my.test.handler',
                    codeUri: 'codeuri',
                }),
                tempFile.fsPath
            )
            const actual = (await debugConfigProviderMockCredentials.makeConfig(folder, input))!
            const tempDir = path.dirname(actual.codeRoot)

            const expected: SamLaunchRequestArgs = {
                // The `aws.credentials` field in debug config, overrides default toolkit credentials.
                awsCredentials: configCredentials,
                ...awsSection,
                type: AWS_SAM_DEBUG_TYPE,
                useIkpdb: false,
                workspaceFolder: {
                    index: 0,
                    name: 'test-workspace-folder',
                    uri: vscode.Uri.file(appDir),
                },
                baseBuildDir: actual.baseBuildDir, // Random, sanity-checked by assertEqualLaunchConfigs().
                envFile: `${actual.baseBuildDir}/env-vars.json`,
                eventPayloadFile: undefined,
                codeRoot: pathutil.normalize(path.join(tempDir, 'codeuri')), // Normalized to absolute path.
                apiPort: undefined,
                debugPort: actual.debugPort,
                documentUri: vscode.Uri.file(''), // TODO: remove or test.
                handlerName: 'my.test.handler',
                invokeTarget: {
                    target: 'template',
                    templatePath: pathutil.normalize(path.join(tempDir ?? '?', 'test.yaml')),
                    logicalId: 'myResource',
                },
                lambda: {
                    environmentVariables: {
                        var1: '2',
                        var2: '1',
                    },
                    memoryMb: undefined,
                    timeoutSec: 12345, // From template.yaml.
                },
                localRoot: pathutil.normalize(path.join(tempDir, 'codeuri')), // Normalized to absolute path.
                name: input.name,
                templatePath: pathutil.normalize(path.join(actual.baseBuildDir!, 'app___vsctk___template.yaml')),
                parameterOverrides: undefined,
                architecture: 'x86_64',
                // The `aws.region` field in debug config, overrides default toolkit region.
                region: 'us-weast-9',

                //
                // Node-related fields
                //
                address: 'localhost',
                port: actual.debugPort,
                preLaunchTask: undefined,
                protocol: 'inspector',
                remoteRoot: '/var/task',
                request: 'attach', // Input "direct-invoke", output "attach".
                runtime: 'nodejs18.x',
                runtimeFamily: lambdaModel.RuntimeFamily.NodeJS,
                skipFiles: ['/var/runtime/node_modules/**/*.js', '<node_internals>/**/*.js'],
                continueOnAttach: true,
                stopOnEntry: false,
            }

            assertEqualLaunchConfigs(actual, expected)
        })

        it('target=code: go', async function () {
            const appDir = pathutil.normalize(
                path.join(testutil.getProjectDir(), 'testFixtures/workspaceFolder/go1-plain-sam-app')
            )
            const folder = testutil.getWorkspaceFolder(appDir)
            const input = {
                type: AWS_SAM_DEBUG_TYPE,
                name: 'test-go-code',
                request: DIRECT_INVOKE_TYPE,
                invokeTarget: {
                    target: CODE_TARGET_TYPE,
                    lambdaHandler: 'hello-world',
                    projectRoot: 'hello-world',
                },
                lambda: {
                    runtime: 'go1.x',
                    // For target=code these envvars are written to the input-template.yaml.
                    environmentVariables: {
                        'test-envvar-1': 'test value 1',
                        'test-envvar-2': 'test value 2',
                    },
                    memoryMb: 1.2,
                    timeoutSec: 9000,
                    payload: {
                        json: {
                            'test-payload-key-1': 'test payload value 1',
                            'test-payload-key-2': 'test payload value 2',
                        },
                    },
                },
            }
            const actual = (await debugConfigProvider.makeConfig(folder, input))!
            const expected: SamLaunchRequestArgs = {
                type: AWS_SAM_DEBUG_TYPE,
                awsCredentials: fakeCredentials,
                request: 'attach', // Input "direct-invoke", output "attach".
                runtime: 'go1.x',
                runtimeFamily: lambdaModel.RuntimeFamily.Go,
                useIkpdb: false,
                workspaceFolder: {
                    index: 0,
                    name: 'test-workspace-folder',
                    uri: vscode.Uri.file(appDir),
                },
                baseBuildDir: actual.baseBuildDir, // Random, sanity-checked by assertEqualLaunchConfigs().
                envFile: `${actual.baseBuildDir}/env-vars.json`,
                eventPayloadFile: `${actual.baseBuildDir}/event.json`,
                codeRoot: pathutil.normalize(path.join(appDir, 'hello-world')), // Normalized to absolute path.
                apiPort: undefined,
                debugPort: actual.debugPort,
                documentUri: vscode.Uri.file(''), // TODO: remove or test.
                handlerName: 'hello-world',
                invokeTarget: { ...input.invokeTarget },
                lambda: {
                    ...input.lambda,
                },
                name: input.name,
                templatePath: pathutil.normalize(path.join(actual.baseBuildDir!, 'app___vsctk___template.yaml')),
                parameterOverrides: undefined,
                architecture: undefined,
                region: 'us-west-2',

                //
                // Go-related fields
                //
                host: 'localhost',
                mode: 'remote',
                processName: 'godelve',
                port: actual.debugPort,
                preLaunchTask: undefined,
                skipFiles: [],
                debugArgs: ['-delveAPI=2'],
                debugAdapter: 'legacy',
            }

            assertEqualLaunchConfigs(actual, expected)
            await assertFileText(
                expected.envFile!,
                '{"helloworld":{"test-envvar-1":"test value 1","test-envvar-2":"test value 2"}}'
            )
            await assertFileText(
                expected.eventPayloadFile!,
                '{"test-payload-key-1":"test payload value 1","test-payload-key-2":"test payload value 2"}'
            )
            await assertFileText(
                expected.templatePath,
                `Resources:
  helloworld:
    Type: AWS::Serverless::Function
    Properties:
      Handler: hello-world
      CodeUri: >-
        ${expected.codeRoot}
      Runtime: go1.x
      Environment:
        Variables:
          test-envvar-1: test value 1
          test-envvar-2: test value 2
      MemorySize: 1.2
      Timeout: 9000
`
            )

            //
            // Test noDebug=true.
            //
            ;(input as any).noDebug = true
            const actualNoDebug = (await debugConfigProvider.makeConfig(folder, input))!
            const expectedNoDebug: SamLaunchRequestArgs = {
                ...expected,
                noDebug: true,
                request: 'attach',
                mode: undefined,
                debugPort: undefined,
                port: -1,
                baseBuildDir: actualNoDebug.baseBuildDir,
                envFile: `${actualNoDebug.baseBuildDir}/env-vars.json`,
                eventPayloadFile: `${actualNoDebug.baseBuildDir}/event.json`,
            }
            // The assert function should just check for this but all well
            if (actualNoDebug.debugArgs === undefined) {
                delete actualNoDebug.debugArgs
            }
            assertEqualLaunchConfigs(actualNoDebug, expectedNoDebug)
        })
    })
})

describe('ensureRelativePaths', function () {
    it('ensures paths are relative', function () {
        const workspace: vscode.WorkspaceFolder = {
            uri: vscode.Uri.file('/test1/'),
            name: 'test workspace',
            index: 0,
        }
        const templateConfig = createTemplateAwsSamDebugConfig(
            undefined,
            undefined,
            false,
            'test name 1',
            '/test1/template.yaml'
        )
        assert.strictEqual(
            (templateConfig.invokeTarget as TemplateTargetProperties).templatePath,
            '/test1/template.yaml'
        )
        ensureRelativePaths(workspace, templateConfig)
        assert.strictEqual((templateConfig.invokeTarget as TemplateTargetProperties).templatePath, 'template.yaml')

        const codeConfig = createCodeAwsSamDebugConfig(
            undefined,
            'testName1',
            '/test1/project',
            lambdaModel.getDefaultRuntime(lambdaModel.RuntimeFamily.NodeJS) ?? ''
        )
        assert.strictEqual((codeConfig.invokeTarget as CodeTargetProperties).projectRoot, '/test1/project')
        ensureRelativePaths(workspace, codeConfig)
        assert.strictEqual((codeConfig.invokeTarget as CodeTargetProperties).projectRoot, 'project')
    })
})

function createBaseCodeConfig(params: {
    name?: string
    lambdaHandler?: string
    projectRoot?: string
}): AwsSamDebuggerConfiguration {
    return {
        type: AWS_SAM_DEBUG_TYPE,
        name: params.name ?? 'whats in a name',
        request: DIRECT_INVOKE_TYPE,
        invokeTarget: {
            target: CODE_TARGET_TYPE,
            lambdaHandler: params.lambdaHandler ?? 'sick handles',
            projectRoot: params.projectRoot ?? 'root as in beer',
        },
    }
}

/**
 * Gets a basic launch.json config for testing purposes, by generating the
 * config from a sample project located at `rootFolder`.
 */
async function getConfig(
    debugConfigProvider: SamDebugConfigProvider,
    registry: CloudFormationTemplateRegistry,
    rootFolder: string
): Promise<{ config: AwsSamDebuggerConfiguration; folder: vscode.WorkspaceFolder }> {
    const appDir = pathutil.normalize(path.join(testutil.getProjectDir(), rootFolder))
    const folder = testutil.getWorkspaceFolder(appDir)
    const templateFile = pathutil.normalize(path.join(appDir, 'template.yaml'))
    await registry.addItem(vscode.Uri.file(templateFile))

    // Generate config(s) from a sample project.
    const configs = await debugConfigProvider.provideDebugConfigurations(folder)
    if (!configs || configs.length === 0) {
        throw Error(`failed to generate config from: ${rootFolder}`)
    }
    return {
        config: configs[0],
        folder: folder,
    }
}

function createFakeConfig(params: {
    name?: string
    target?: string
    templatePath?: string
    logicalId?: string
}): AwsSamDebuggerConfiguration {
    return {
        type: AWS_SAM_DEBUG_TYPE,
        name: params.name ?? 'whats in a name',
        request: DIRECT_INVOKE_TYPE,
        invokeTarget:
            !params.target || params.target === TEMPLATE_TARGET_TYPE
                ? {
                      target: TEMPLATE_TARGET_TYPE,
                      templatePath: params.templatePath ?? 'somewhere else',
                      logicalId: params.logicalId ?? 'you lack resources',
                  }
                : {
                      target: CODE_TARGET_TYPE,
                      lambdaHandler: 'test-handler',
                      projectRoot: 'test-project-root',
                  },
    }
}

async function createAndRegisterYaml(
    subValues: {
        resourceName?: string
        resourceType?: string
        runtime?: string
        handler?: string
    },
    file: vscode.Uri,
    registry: CloudFormationTemplateRegistry
) {
    await testutil.toFile(makeSampleSamTemplateYaml(true, subValues), file.fsPath)
    await registry.addItem(file)
}

describe('createTemplateAwsSamDebugConfig', function () {
    const name = 'my body is a template'
    const templatePath = path.join('two', 'roads', 'diverged', 'in', 'a', 'yellow', 'wood')

    it('creates a template-type SAM debugger configuration with minimal configurations', function () {
        const config = createTemplateAwsSamDebugConfig(undefined, undefined, false, name, templatePath)
        assert.deepStrictEqual(config, {
            name: `yellow:${name}`,
            type: AWS_SAM_DEBUG_TYPE,
            request: DIRECT_INVOKE_TYPE,
            invokeTarget: {
                target: TEMPLATE_TARGET_TYPE,
                logicalId: name,
                templatePath: templatePath,
            },
            lambda: {
                payload: {},
                environmentVariables: {},
            },
        })
    })

    it('creates a template-type SAM debugger configuration with additional params', function () {
        const params = {
            eventJson: {
                payload: 'uneventufl',
            },
            environmentVariables: {
                varial: 'invert to fakie',
            },
            dockerNetwork: 'rockerFretwork',
        }
        const config = createTemplateAwsSamDebugConfig(undefined, undefined, false, name, templatePath, params)
        assert.deepStrictEqual(config.lambda?.payload?.json, params.eventJson)
        assert.deepStrictEqual(config.lambda?.environmentVariables, params.environmentVariables)
        assert.strictEqual(config.sam?.dockerNetwork, params.dockerNetwork)
        assert.strictEqual(config.sam?.containerBuild, undefined)
    })

    it('creates a template-type SAM debugger configuration with a runtime', function () {
        const config = createTemplateAwsSamDebugConfig(undefined, 'runtime', true, name, templatePath, undefined)
        assert.deepStrictEqual(config.lambda?.runtime, 'runtime')
    })
})

describe('createApiAwsSamDebugConfig', function () {
    const name = 'my body is a template'
    const templatePath = path.join('two', 'roads', 'diverged', 'in', 'a', 'yellow', 'wood')
    const runtime = 'timeToRun'

    it('creates a API-type SAM debugger configuration with minimal configurations', function () {
        const config = createApiAwsSamDebugConfig(undefined, undefined, name, templatePath)
        assert.deepStrictEqual(config, {
            name: `API yellow:${name}`,
            type: AWS_SAM_DEBUG_TYPE,
            request: DIRECT_INVOKE_TYPE,
            invokeTarget: {
                target: API_TARGET_TYPE,
                logicalId: name,
                templatePath: templatePath,
            },
            api: {
                path: '/',
                httpMethod: 'get',
                payload: {
                    json: {},
                },
            },
        })
    })

    it('creates a API-type SAM debugger configuration with additional params', function () {
        const config = createApiAwsSamDebugConfig(undefined, runtime, name, templatePath, {
            payload: { json: { key: 'value' } },
            httpMethod: 'OPTIONS',
            path: '/api',
        })
        assert.deepStrictEqual(config, {
            name: `API yellow:${name} (${runtime})`,
            type: AWS_SAM_DEBUG_TYPE,
            request: DIRECT_INVOKE_TYPE,
            invokeTarget: {
                target: API_TARGET_TYPE,
                logicalId: name,
                templatePath: templatePath,
            },
            api: {
                path: '/api',
                httpMethod: 'OPTIONS',
                payload: {
                    json: { key: 'value' },
                },
            },
            lambda: {
                runtime,
            },
        })
    })
})

describe('debugConfiguration', function () {
    let tempFolder: string
    let tempFile: vscode.Uri

    beforeEach(async function () {
        tempFolder = await makeTemporaryToolkitFolder()
        tempFile = vscode.Uri.file(path.join(tempFolder, 'test.yaml'))
    })

    afterEach(async function () {
        await fs.delete(tempFolder, { recursive: true })
        const r = await globals.templateRegistry
        r.reset()
    })

    it('getCodeRoot(), getHandlerName() with invokeTarget=code', async function () {
        const folder = testutil.getWorkspaceFolder(tempFolder)
        const relativePath = 'src'
        const fullPath = pathutil.normalize(path.join(tempFolder, relativePath))

        const config = {
            type: AWS_SAM_DEBUG_TYPE,
            name: 'test debugconfig',
            request: DIRECT_INVOKE_TYPE,
            invokeTarget: {
                target: CODE_TARGET_TYPE,
                lambdaHandler: 'my.test.handler',
                projectRoot: '',
            },
            lambda: {
                runtime: [...lambdaModel.nodeJsRuntimes.values()][0],
            },
        }

        assert.strictEqual(await debugConfiguration.getHandlerName(folder, config), 'my.test.handler')

        // Config with relative path:
        config.invokeTarget.projectRoot = relativePath
        assert.strictEqual(await debugConfiguration.getCodeRoot(folder, config), fullPath)

        // Config with absolute path:
        config.invokeTarget.projectRoot = fullPath
        assert.strictEqual(await debugConfiguration.getCodeRoot(folder, config), fullPath)
    })

    it('getCodeRoot(), getHandlerName() with invokeTarget=template', async function () {
        const folder = testutil.getWorkspaceFolder(tempFolder)
        const relativePath = 'src'
        const fullPath = pathutil.normalize(path.join(tempFolder, relativePath))

        const config = {
            type: AWS_SAM_DEBUG_TYPE,
            name: 'test debugconfig',
            request: DIRECT_INVOKE_TYPE,
            invokeTarget: {
                target: TEMPLATE_TARGET_TYPE,
                templatePath: tempFile.fsPath,
                logicalId: 'TestResource',
            },
            lambda: {
                runtime: [...lambdaModel.nodeJsRuntimes.values()][0],
            },
            sam: {
                template: {
                    parameters: {
                        override: 'override',
                    },
                },
            },
        }

        // Template with relative path:
        await testutil.toFile(
            makeSampleSamTemplateYaml(true, { codeUri: relativePath, handler: 'handler' }),
            tempFile.fsPath
        )
        await (await globals.templateRegistry).addItem(tempFile)
        assert.strictEqual(await debugConfiguration.getCodeRoot(folder, config), fullPath)
        assert.strictEqual(await debugConfiguration.getHandlerName(folder, config), 'handler')

        // Template with absolute path:
        await testutil.toFile(makeSampleSamTemplateYaml(true, { codeUri: fullPath }), tempFile.fsPath)
        await (await globals.templateRegistry).addItem(tempFile)
        assert.strictEqual(await debugConfiguration.getCodeRoot(folder, config), fullPath)

        // Template with refs that don't override:
        const tempFileRefs = vscode.Uri.file(path.join(tempFolder, 'testRefs.yaml'))
        const fileRefsConfig = {
            ...config,
            invokeTarget: {
                ...config.invokeTarget,
                templatePath: tempFileRefs.fsPath,
            },
        }
        const paramStr = makeSampleYamlParameters({
            notOverride: {
                Type: 'String',
                Default: 'notDoingAnything',
            },
        })
        await testutil.toFile(
            makeSampleSamTemplateYaml(true, { codeUri: fullPath, handler: 'handler' }, paramStr),
            tempFileRefs.fsPath
        )
        await (await globals.templateRegistry).addItem(tempFileRefs)
        assert.strictEqual(await debugConfiguration.getCodeRoot(folder, fileRefsConfig), fullPath)
        assert.strictEqual(await debugConfiguration.getHandlerName(folder, fileRefsConfig), 'handler')

        // Template with refs that overrides handler via default parameter value in YAML template
        const tempFileDefaultRefs = vscode.Uri.file(path.join(tempFolder, 'testDefaultRefs.yaml'))
        const fileDefaultRefsConfig = {
            ...config,
            invokeTarget: {
                ...config.invokeTarget,
                templatePath: tempFileDefaultRefs.fsPath,
            },
        }
        const paramStrDefaultOverride = makeSampleYamlParameters({
            defaultOverride: {
                Type: 'String',
                Default: 'thisWillOverride',
            },
        })
        await testutil.toFile(
            makeSampleSamTemplateYaml(
                true,
                { codeUri: fullPath, handler: '!Ref defaultOverride' },
                paramStrDefaultOverride
            ),
            tempFileDefaultRefs.fsPath
        )
        await (await globals.templateRegistry).addItem(tempFileDefaultRefs)
        assert.strictEqual(await debugConfiguration.getCodeRoot(folder, fileDefaultRefsConfig), fullPath)
        assert.strictEqual(await debugConfiguration.getHandlerName(folder, fileDefaultRefsConfig), 'thisWillOverride')

        // Template with refs that overrides handler via override value in launch config
        const tempFileOverrideRef = vscode.Uri.file(path.join(tempFolder, 'testOverrideRefs.yaml'))
        const fileOverrideRefConfig = {
            ...config,
            invokeTarget: {
                ...config.invokeTarget,
                templatePath: tempFileOverrideRef.fsPath,
            },
        }
        const paramStrNoDefaultOverride = makeSampleYamlParameters({
            override: {
                Type: 'String',
            },
        })
        await testutil.toFile(
            makeSampleSamTemplateYaml(true, { codeUri: fullPath, handler: '!Ref override' }, paramStrNoDefaultOverride),
            tempFileOverrideRef.fsPath
        )
        await (await globals.templateRegistry).addItem(tempFileOverrideRef)
        assert.strictEqual(await debugConfiguration.getCodeRoot(folder, fileOverrideRefConfig), fullPath)
        assert.strictEqual(await debugConfiguration.getHandlerName(folder, fileOverrideRefConfig), 'override')
    })
})
