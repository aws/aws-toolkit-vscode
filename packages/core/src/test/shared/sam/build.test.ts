/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { globals } from '../../../shared'
import { AppNode } from '../../../awsService/appBuilder/explorer/nodes/appNode'
import {
    BuildParams,
    BuildWizard,
    createParamsSourcePrompter,
    getBuildFlags,
    ParamsSource,
} from '../../../shared/sam/build'
import { TreeNode } from '../../../shared/treeview/resourceTreeDataProvider'
import { createWizardTester } from '../wizards/wizardTestUtils'
import assert from 'assert'
import { createBaseTemplate } from '../cloudformation/cloudformationTestUtils'
import { getProjectRootUri } from '../../../shared/sam/utils'
import sinon from 'sinon'
import { createMultiPick, DataQuickPickItem } from '../../../shared/ui/pickerPrompter'
import * as config from '../../../shared/sam/config'
import { getTestWindow } from '../vscode/window'

describe('BuildWizard', async function () {
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
        getTestWindow().onDidShowQuickPick(async (picker) => {
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
        assert.strictEqual(quickPick.title, 'Specify parameters for build')
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
        assert.strictEqual(quickPick.title, 'Specify parameters for build')
        assert.strictEqual(quickPick.placeholder, 'Select configuration options for sam build')
        assert.strictEqual(quickPick.items.length, 2)
        assert.deepStrictEqual(quickPick.items, expectedItems)
    })
})
