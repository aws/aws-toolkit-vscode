/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { globals, ToolkitError } from '../../../shared'
import * as SamUtilsModule from '../../../shared/sam/utils'
import * as ProcessTerminalUtils from '../../../shared/sam/processTerminal'
import * as ResolveEnvModule from '../../../shared/env/resolveEnv'
import * as ProcessUtilsModule from '../../../shared/utilities/processUtils'
import { AppNode } from '../../../awsService/appBuilder/explorer/nodes/appNode'
import {
    BuildParams,
    BuildWizard,
    createParamsSourcePrompter,
    getBuildFlags,
    ParamsSource,
    resolveBuildFlags,
    runBuild,
    SamBuildResult,
} from '../../../shared/sam/build'
import { TreeNode } from '../../../shared/treeview/resourceTreeDataProvider'
import { createWizardTester } from '../wizards/wizardTestUtils'
import assert from 'assert'
import { createBaseTemplate } from '../cloudformation/cloudformationTestUtils'
import { getProjectRootUri } from '../../../shared/sam/utils'
import sinon from 'sinon'
import { createMultiPick, DataQuickPickItem } from '../../../shared/ui/pickerPrompter'
import * as config from '../../../shared/sam/config'
import * as utils from '../../../shared/sam/utils'
import { PrompterTester } from '../wizards/prompterTester'
import { getWorkspaceFolder, TestFolder } from '../../testUtil'
import { samconfigCompleteData, validTemplateData } from './samTestUtils'
import { CloudFormationTemplateRegistry } from '../../../shared/fs/templateRegistry'
import { getTestWindow } from '../vscode/window'
import { CancellationError } from '../../../shared/utilities/timeoutUtils'
import { SamAppLocation } from '../../../awsService/appBuilder/explorer/samProject'
import { SemVer } from 'semver'

describe('SAM BuildWizard', async function () {
    const createTester = async (params?: Partial<BuildParams>, arg?: TreeNode | undefined) =>
        createWizardTester(new BuildWizard({ ...params }, await globals.templateRegistry, arg))

    it('shows steps in correct order when triggered from command palette', async function () {
        const tester = await createTester()
        tester.template.assertShowFirst()
        tester.paramsSource.assertShowSecond()
    })

    it('shows steps in correct order when triggered from appBuilder', async function () {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
        assert.ok(workspaceFolder)

        const templateUri = vscode.Uri.joinPath(workspaceFolder.uri, 'template.yaml')
        const projectRootUri = getProjectRootUri(templateUri)
        const samAppLocation = {
            samTemplateUri: templateUri,
            workspaceFolder: workspaceFolder,
            projectRoot: projectRootUri,
        }
        const appNode = new AppNode(samAppLocation)
        const tester = await createTester({}, appNode)
        tester.template.assertDoesNotShow()
        tester.paramsSource.assertShowFirst()
    })

    it('shows steps in correct order when triggered from command palette', async function () {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
        assert.ok(workspaceFolder)

        const templateUri = vscode.Uri.joinPath(workspaceFolder.uri, 'template.yaml')
        const template = { uri: templateUri, data: createBaseTemplate() }
        const tester = await createTester({ template })
        tester.template.assertDoesNotShow()
        tester.paramsSource.assertShowFirst()
    })

    it('set the correct project root', async function () {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
        assert.ok(workspaceFolder)

        const templateUri = vscode.Uri.joinPath(workspaceFolder.uri, 'template.yaml')
        const template = { uri: templateUri, data: createBaseTemplate() }
        const tester = await createTester({ template })
        tester.projectRoot.path.assertValue(workspaceFolder.uri.path)
    })
})

describe('SAM build helper functions', () => {
    describe('getBuildFlags', () => {
        let sandbox: sinon.SinonSandbox
        let projectRoot: vscode.Uri
        const defaultFlags: string[] = ['--cached', '--parallel', '--save-params', '--use-container']
        let quickPickItems: DataQuickPickItem<string>[]

        beforeEach(() => {
            sandbox = sinon.createSandbox()
            projectRoot = vscode.Uri.parse('file:///path/to/project')
            quickPickItems = [
                {
                    label: 'Beta features',
                    data: '--beta-features',
                    description: 'Enable beta features',
                },
                {
                    label: 'Build in source',
                    data: '--build-in-source',
                    description: 'Opts in to build project in the source folder',
                },
                {
                    label: 'Cached',
                    data: '--cached',
                    description: 'Reuse build artifacts that have not changed from previous builds',
                },
                {
                    label: 'Debug',
                    data: '--debug',
                    description: 'Turn on debug logging to print debug messages and display timestamps',
                },
                {
                    label: 'Parallel',
                    data: '--parallel',
                    description: 'Enable parallel builds for AWS SAM template functions and layers',
                },
                {
                    label: 'Skip prepare infra',
                    data: '--skip-prepare-infra',
                    description: 'Skip preparation stage when there are no infrastructure changes',
                },
                {
                    label: 'Skip pull image',
                    data: '--skip-pull-image',
                    description: 'Skip pulling down the latest Docker image for Lambda runtime',
                },
                {
                    label: 'Use container',
                    data: '--use-container',
                    description: 'Build functions with an AWS Lambda-like container',
                },
                {
                    label: 'Save parameters',
                    data: '--save-params',
                    description: 'Save to samconfig.toml as default parameters',
                },
            ]
        })

        afterEach(() => {
            sandbox.restore() // Restore all stubs after each test
        })

        it('should return flags from buildFlagsPrompter when paramsSource is Specify', async () => {
            PrompterTester.init()
                .handleQuickPick('Select build flags', async (picker) => {
                    await picker.untilReady()
                    assert.strictEqual(picker.items.length, 9)
                    assert.strictEqual(picker.title, 'Select build flags')
                    assert.deepStrictEqual(picker.items, quickPickItems)
                    const betaFeatures = picker.items[0]
                    const buildInSource = picker.items[1]
                    const cached = picker.items[2]
                    assert.strictEqual(betaFeatures.data, '--beta-features')
                    assert.strictEqual(buildInSource.data, '--build-in-source')
                    assert.strictEqual(cached.data, '--cached')
                    const acceptedItems = [betaFeatures, buildInSource, cached]
                    picker.acceptItems(...acceptedItems)
                })
                .build()

            const flags = await createMultiPick(quickPickItems, {
                title: 'Select build flags',
                ignoreFocusOut: true,
            }).prompt()

            assert.deepStrictEqual(flags, JSON.stringify(['--beta-features', '--build-in-source', '--cached']))
        })

        it('should return config file flag when paramsSource is SamConfig', async () => {
            const mockConfigFileUri = vscode.Uri.parse('file:///path/to/samconfig.toml')
            const getConfigFileUriStub = sandbox.stub().resolves(mockConfigFileUri)
            sandbox.stub(config, 'getConfigFileUri').callsFake(getConfigFileUriStub)

            const flags = await getBuildFlags(ParamsSource.SamConfig, projectRoot, defaultFlags)
            assert.deepStrictEqual(flags, ['--config-file', mockConfigFileUri.fsPath])
        })

        it('should return default flags if getConfigFileUri throws an error', async () => {
            const getConfigFileUriStub = sinon.stub().rejects(new Error('Config file not found'))
            sandbox.stub(config, 'getConfigFileUri').callsFake(getConfigFileUriStub)

            const flags = await getBuildFlags(ParamsSource.SamConfig, projectRoot, defaultFlags)
            assert.deepStrictEqual(flags, defaultFlags)
        })
    })

    describe('createParamsSourcePrompter', () => {
        it('should return a prompter with the correct items with no valid samconfig', () => {
            const expectedItems: DataQuickPickItem<ParamsSource>[] = [
                {
                    label: 'Specify build flags',
                    data: ParamsSource.Specify,
                },
                {
                    label: 'Use default values',
                    data: ParamsSource.DefaultValues,
                    description: 'cached = true, parallel = true, use_container = true',
                },
            ]
            const prompter = createParamsSourcePrompter(false)
            const quickPick = prompter.quickPick
            assert.strictEqual(quickPick.title, 'Specify parameter source for build')
            assert.strictEqual(quickPick.placeholder, 'Select configuration options for sam build')
            assert.strictEqual(quickPick.items.length, 2)
            assert.deepStrictEqual(quickPick.items, expectedItems)
        })

        it('should return a prompter with the correct items with valid samconfig', () => {
            const expectedItems: DataQuickPickItem<ParamsSource>[] = [
                {
                    label: 'Specify build flags',
                    data: ParamsSource.Specify,
                },
                {
                    label: 'Use default values from samconfig',
                    data: ParamsSource.SamConfig,
                },
            ]
            const prompter = createParamsSourcePrompter(true)
            const quickPick = prompter.quickPick
            assert.strictEqual(quickPick.title, 'Specify parameter source for build')
            assert.strictEqual(quickPick.placeholder, 'Select configuration options for sam build')
            assert.strictEqual(quickPick.items.length, 2)
            assert.deepStrictEqual(quickPick.items, expectedItems)
        })
    })

    describe('resolveBuildFlags', () => {
        let sandbox: sinon.SinonSandbox
        beforeEach(() => {
            sandbox = sinon.createSandbox()
        })

        afterEach(() => {
            sandbox.restore()
        })

        it('uses --no-use-container when --use-container is absent', async () => {
            const normalVersion = new SemVer('1.133.0')
            const buildFlags = ['--cached', '--debug', '--parallel']
            const expectedBuildFlags = ['--cached', '--debug', '--parallel', '--no-use-container']
            return testResolveBuildFlags(sandbox, normalVersion, buildFlags, expectedBuildFlags)
        })

        it('preserves buildFlags when SAM CLI version < 1.133', async () => {
            const lowerVersion = new SemVer('1.110.0')
            const buildFlags = ['--cached', '--parallel', '--save-params']
            const expectedBuildFlags = ['--cached', '--parallel', '--save-params']
            return testResolveBuildFlags(sandbox, lowerVersion, buildFlags, expectedBuildFlags)
        })

        it('respects existing --use-container flag', async () => {
            const normalVersion = new SemVer('1.110.0')
            const buildFlags = ['--cached', '--parallel', '--save-params', '--use-container']
            const expectedBuildFlags = ['--cached', '--parallel', '--save-params', '--use-container']
            return testResolveBuildFlags(sandbox, normalVersion, buildFlags, expectedBuildFlags)
        })
    })
})

describe('SAM runBuild', () => {
    let sandbox: sinon.SinonSandbox
    let testFolder: TestFolder
    let projectRoot: vscode.Uri
    let workspaceFolder: vscode.WorkspaceFolder
    let templateFile: vscode.Uri

    let mockGetSpawnEnv: sinon.SinonStub
    let mockGetSamCliPath: sinon.SinonStub
    let mockChildProcessClass: sinon.SinonStub
    let mockSamBuildChildProcess: sinon.SinonStub

    let registry: CloudFormationTemplateRegistry

    // Dependency clients
    beforeEach(async function () {
        testFolder = await TestFolder.create()
        projectRoot = vscode.Uri.file(testFolder.path)
        workspaceFolder = getWorkspaceFolder(testFolder.path)
        sandbox = sinon.createSandbox()
        registry = await globals.templateRegistry

        // Create template.yaml in temporary test folder and add to registery
        templateFile = vscode.Uri.file(await testFolder.write('template.yaml', validTemplateData))
        await registry.addItem(templateFile)

        mockGetSpawnEnv = sandbox.stub(ResolveEnvModule, 'getSpawnEnv').callsFake(
            sandbox.stub().resolves({
                AWS_TOOLING_USER_AGENT: 'AWS-Toolkit-For-VSCode/testPluginVersion',
                SAM_CLI_TELEMETRY: '0',
            })
        )
    })

    afterEach(() => {
        sandbox.restore()
        registry.reset()
    })

    describe(':) path', () => {
        let spyRunInterminal: sinon.SinonSpy

        beforeEach(() => {
            mockGetSamCliPath = sandbox
                .stub(SamUtilsModule, 'getSamCliPathAndVersion')
                .callsFake(sandbox.stub().resolves({ path: 'sam-cli-path' }))

            // Mock  child process with required properties that get called in ProcessTerminal
            mockSamBuildChildProcess = Object.create(ProcessUtilsModule.ChildProcess.prototype, {
                stopped: { get: sandbox.stub().returns(false) },
                stop: { value: sandbox.stub().resolves({}) },
                run: {
                    value: sandbox.stub().resolves({
                        exitCode: 0,
                        stdout: 'Mock successful build command execution ',
                        stderr: '',
                    }),
                },
            })
            spyRunInterminal = sandbox.spy(ProcessTerminalUtils, 'runInTerminal')
            mockChildProcessClass = sandbox.stub(ProcessUtilsModule, 'ChildProcess').returns(mockSamBuildChildProcess)
        })

        afterEach(() => {
            sandbox.restore()
        })

        const verifyCorrectDependencyCall = () => {
            // Prefer count comparison for debugging flakiness
            assert.strictEqual(mockGetSamCliPath.callCount, 1)
            assert.strictEqual(mockChildProcessClass.callCount, 1)
            assert.strictEqual(mockGetSpawnEnv.callCount, 1)
            assert.strictEqual(spyRunInterminal.callCount, 1)
            assert.deepEqual(spyRunInterminal.getCall(0).args, [mockSamBuildChildProcess, 'build'])
        }

        it('[entry: command palette] with specify flags should instantiate correct process in terminal', async () => {
            const prompterTester = PrompterTester.init()
                .handleQuickPick('Select a SAM/CloudFormation Template', async (quickPick) => {
                    await quickPick.untilReady()
                    assert.strictEqual(quickPick.items[0].label, templateFile.fsPath)
                    quickPick.acceptItem(quickPick.items[0])
                })
                .handleQuickPick('Specify parameter source for build', async (quickPick) => {
                    // Need sometime to wait for the template to search for template file
                    await quickPick.untilReady()
                    assert.strictEqual(quickPick.items.length, 2)
                    const items = quickPick.items
                    assert.deepStrictEqual(items[0], { data: ParamsSource.Specify, label: 'Specify build flags' })
                    assert.deepStrictEqual(items[1], {
                        label: 'Use default values',
                        data: ParamsSource.DefaultValues,
                        description: 'cached = true, parallel = true, use_container = true',
                    })
                    quickPick.acceptItem(quickPick.items[0])
                })
                .handleQuickPick('Select build flags', async (quickPick) => {
                    await quickPick.untilReady()

                    assert.strictEqual(quickPick.items.length, 9)
                    const item1 = quickPick.items[2] as DataQuickPickItem<string>
                    const item2 = quickPick.items[3] as DataQuickPickItem<string>
                    const item3 = quickPick.items[7] as DataQuickPickItem<string>
                    const item4 = quickPick.items[8] as DataQuickPickItem<string>

                    assert.deepStrictEqual(item1, {
                        label: 'Cached',
                        data: '--cached',
                        description: 'Reuse build artifacts that have not changed from previous builds',
                    })
                    assert.deepStrictEqual(item2, {
                        label: 'Debug',
                        data: '--debug',
                        description: 'Turn on debug logging to print debug messages and display timestamps',
                    })
                    assert.deepStrictEqual(item3, {
                        label: 'Use container',
                        data: '--use-container',
                        description: 'Build functions with an AWS Lambda-like container',
                    })
                    assert.deepStrictEqual(item4, {
                        label: 'Save parameters',
                        data: '--save-params',
                        description: 'Save to samconfig.toml as default parameters',
                    })
                    quickPick.acceptItems(item1, item2, item3, item4)
                })
                .build()

            // Invoke sync command from command palette
            // Instead of await runBuild(), prefer this to avoid flakiness due to race condition
            await delayedRunBuild()

            assert.deepEqual(mockChildProcessClass.getCall(0).args, [
                'sam-cli-path',
                [
                    'build',
                    '--cached',
                    '--debug',
                    '--use-container',
                    '--save-params',
                    '--template',
                    `${templateFile.fsPath}`,
                ],
                {
                    spawnOptions: {
                        cwd: projectRoot?.fsPath,
                        env: {
                            AWS_TOOLING_USER_AGENT: 'AWS-Toolkit-For-VSCode/testPluginVersion',
                            SAM_CLI_TELEMETRY: '0',
                        },
                    },
                },
            ])
            prompterTester.assertCallAll()
            verifyCorrectDependencyCall()
        })

        it('[entry: appbuilder node] with default flags should instantiate correct process in terminal and show progress notification', async () => {
            const prompterTester = getPrompterTester()
            const expectedSamAppLocation = {
                workspaceFolder: workspaceFolder,
                samTemplateUri: templateFile,
                projectRoot: projectRoot,
            }

            // Instead of await runBuild(), prefer this to avoid flakiness due to race condition
            await delayedRunBuild(expectedSamAppLocation)

            getTestWindow()
                .getFirstMessage()
                .assertProgress(`Building SAM template at ${expectedSamAppLocation.samTemplateUri.path}`)

            assert.deepEqual(mockChildProcessClass.getCall(0).args, [
                'sam-cli-path',
                [
                    'build',
                    '--cached',
                    '--parallel',
                    '--save-params',
                    '--use-container',
                    '--template',
                    `${templateFile.fsPath}`,
                ],
                {
                    spawnOptions: {
                        cwd: projectRoot?.fsPath,
                        env: {
                            AWS_TOOLING_USER_AGENT: 'AWS-Toolkit-For-VSCode/testPluginVersion',
                            SAM_CLI_TELEMETRY: '0',
                        },
                    },
                },
            ])
            verifyCorrectDependencyCall()
            prompterTester.assertCallAll()
        })

        it('[entry: appbuilder node] should throw an error when running two build processes in parallel for the same template', async () => {
            const prompterTester = getPrompterTester()
            const expectedSamAppLocation = {
                workspaceFolder: workspaceFolder,
                samTemplateUri: templateFile,
                projectRoot: projectRoot,
            }
            await assert.rejects(
                async () => {
                    await runInParallel(expectedSamAppLocation)
                },
                (e: any) => {
                    assert.strictEqual(e instanceof ToolkitError, true)
                    assert.strictEqual(e.message, 'This template is already being built')
                    assert.strictEqual(e.code, 'BuildInProgress')
                    return true
                }
            )
            prompterTester.assertCallAll(undefined, 2)
        })

        it('[entry: command palette] use samconfig should instantiate correct process in terminal', async () => {
            const samconfigFile = vscode.Uri.file(await testFolder.write('samconfig.toml', samconfigCompleteData))

            const prompterTester = PrompterTester.init()
                .handleQuickPick('Select a SAM/CloudFormation Template', async (quickPick) => {
                    await quickPick.untilReady()
                    assert.strictEqual(quickPick.items[0].label, templateFile.fsPath)
                    quickPick.acceptItem(quickPick.items[0])
                })
                .handleQuickPick('Specify parameter source for build', async (quickPick) => {
                    // Need sometime to wait for the template to search for template file
                    await quickPick.untilReady()

                    assert.strictEqual(quickPick.items.length, 2)
                    const items = quickPick.items

                    assert.deepStrictEqual(items[1], {
                        label: 'Use default values from samconfig',
                        data: ParamsSource.SamConfig,
                    })
                    quickPick.acceptItem(quickPick.items[1])
                })
                .build()

            // Instead of await runBuild(), prefer this to avoid flakiness due to race condition
            await delayedRunBuild()

            assert.deepEqual(mockChildProcessClass.getCall(0).args, [
                'sam-cli-path',
                ['build', '--config-file', `${samconfigFile.fsPath}`, '--template', `${templateFile.fsPath}`],
                {
                    spawnOptions: {
                        cwd: projectRoot?.fsPath,
                        env: {
                            AWS_TOOLING_USER_AGENT: 'AWS-Toolkit-For-VSCode/testPluginVersion',
                            SAM_CLI_TELEMETRY: '0',
                        },
                    },
                },
            ])
            verifyCorrectDependencyCall()
            prompterTester.assertCallAll()
        })
    })

    describe(':( path', () => {
        let appNode: AppNode
        beforeEach(async () => {
            mockGetSamCliPath = sandbox
                .stub(SamUtilsModule, 'getSamCliPathAndVersion')
                .callsFake(sandbox.stub().resolves({ path: 'sam-cli-path' }))

            appNode = new AppNode({
                workspaceFolder: workspaceFolder,
                samTemplateUri: templateFile,
                projectRoot: projectRoot,
            })
            await testFolder.write('samconfig.toml', samconfigCompleteData)
        })

        afterEach(() => {
            sandbox.restore()
        })

        it('should abort when customer cancel build wizard', async () => {
            getTestWindow().onDidShowQuickPick(async (picker) => {
                await picker.untilReady()
                picker.dispose()
            })

            try {
                await runBuild(appNode)
                assert.fail('should have thrown CancellationError')
            } catch (error: any) {
                assert(error instanceof CancellationError)
                assert.strictEqual(error.agent, 'user')
            }
        })

        it('should throw ToolkitError when build command fail', async () => {
            const prompterTester = PrompterTester.init()
                .handleQuickPick('Specify parameter source for build', async (quickPick) => {
                    await quickPick.untilReady()
                    assert.deepStrictEqual(quickPick.items[1].label, 'Use default values from samconfig')
                    quickPick.acceptItem(quickPick.items[1])
                })
                .build()

            // Mock  child process with required properties that get called in ProcessTerminal
            mockSamBuildChildProcess = Object.create(ProcessUtilsModule.ChildProcess.prototype, {
                stopped: { get: sandbox.stub().returns(false) },
                stop: { value: sandbox.stub().resolves({}) },
                run: {
                    value: sandbox.stub().resolves({
                        exitCode: -1,
                        stdout: 'Mock build command execution failure',
                        stderr: 'Docker is unreachable.',
                    }),
                },
            })
            mockChildProcessClass = sandbox.stub(ProcessUtilsModule, 'ChildProcess').returns(mockSamBuildChildProcess)

            try {
                await runBuild(appNode)
                assert.fail('should have thrown ToolkitError')
            } catch (error: any) {
                assert(error instanceof ToolkitError)
                assert.strictEqual(error.message, 'Failed to build SAM template')
                assert(error.details?.['terminal'] as unknown as vscode.Terminal)
                assert.strictEqual((error.details?.['terminal'] as unknown as vscode.Terminal).name, 'SAM build')
            }
            prompterTester.assertCallAll()
        })
    })
})

async function runInParallel(samLocation: SamAppLocation): Promise<[SamBuildResult, SamBuildResult]> {
    return Promise.all([runBuild(new AppNode(samLocation)), delayedRunBuild(samLocation)])
}

// We add a small delay to avoid the unlikely but possible race condition.
async function delayedRunBuild(samLocation?: SamAppLocation): Promise<SamBuildResult> {
    return new Promise(async (resolve, reject) => {
        // Add a small delay before returning the build promise
        setTimeout(() => {
            // Do nothing, just let the delay pass
        }, 20)

        const buildPromise = samLocation ? runBuild(new AppNode(samLocation)) : runBuild()
        buildPromise.then(resolve).catch(reject)
    })
}

function getPrompterTester() {
    return PrompterTester.init()
        .handleQuickPick('Specify parameter source for build', async (quickPick) => {
            // Need sometime to wait for the template to search for template file
            await quickPick.untilReady()

            assert.strictEqual(quickPick.items.length, 2)
            const items = quickPick.items
            assert.strictEqual(quickPick.items.length, 2)
            assert.deepStrictEqual(items[0], { data: ParamsSource.Specify, label: 'Specify build flags' })
            assert.deepStrictEqual(items[1].label, 'Use default values')
            quickPick.acceptItem(quickPick.items[1])
        })
        .build()
}
function testResolveBuildFlags(
    sandbox: sinon.SinonSandbox,
    parsedVersion: SemVer,
    buildFlags: string[],
    expectedBuildFlags: string[]
) {
    const pathAndVersionStub = sandbox.stub().resolves({ path: 'file:///path/to/cli', parsedVersion })
    sandbox.stub(utils, 'getSamCliPathAndVersion').callsFake(pathAndVersionStub)
    return resolveBuildFlags(buildFlags, parsedVersion).then((resolvedBuildFlags) => {
        assert.deepEqual(resolvedBuildFlags, expectedBuildFlags)
    })
}
