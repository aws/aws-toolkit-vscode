/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as SamUtilsModule from '../../../shared/sam/utils'
import * as ProcessTerminalUtils from '../../../shared/sam/processTerminal'
import * as S3ClientModule from '../../../shared/clients/s3Client'
import * as SamConfigModule from '../../../shared/sam/config'
import * as ResolveEnvModule from '../../../shared/env/resolveEnv'
import * as ProcessUtilsModule from '../../../shared/utilities/processUtils'
import { CancellationError } from '../../../shared/utilities/timeoutUtils'
import * as CloudFormationClientModule from '../../../shared/clients/cloudFormationClient'

import {
    createEnvironmentPrompter,
    ensureBucket,
    ensureRepo,
    getSyncParamsFromConfig,
    getSyncWizard,
    prepareSyncParams,
    runSync,
    saveAndBindArgs,
    syncFlagItems,
    SyncParams,
    SyncWizard,
} from '../../../shared/sam/sync'

import {
    createBaseImageTemplate,
    createBaseTemplate,
    makeSampleSamTemplateYaml,
} from '../cloudformation/cloudformationTestUtils'
import { createWizardTester } from '../wizards/wizardTestUtils'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { ToolkitError } from '../../../shared/errors'
import globals from '../../../shared/extensionGlobals'
import fs from '../../../shared/fs/fs'
import { createMultiPick, DataQuickPickItem } from '../../../shared/ui/pickerPrompter'
import sinon from 'sinon'
import { getTestWindow } from '../vscode/window'
import { DefaultS3Client } from '../../../shared/clients/s3Client'
import { RequiredProps } from '../../../shared/utilities/tsUtils'
import S3 from 'aws-sdk/clients/s3'
import { DefaultCloudFormationClient } from '../../../shared/clients/cloudFormationClient'
import CloudFormation from 'aws-sdk/clients/cloudformation'
import { intoCollection } from '../../../shared/utilities/collectionUtils'
import { SamConfig, Environment, parseConfig } from '../../../shared/sam/config'
import { RegionProvider } from '../../../shared/regions/regionProvider'
import { Region } from '../../../shared/regions/endpoints'
import { RegionNode } from '../../../awsexplorer/regionNode'
import { getProjectRootUri } from '../../../shared/sam/utils'
import { AppNode } from '../../../awsService/appBuilder/explorer/nodes/appNode'
import * as Cfn from '../../../shared/cloudformation/cloudformation'
import { getWorkspaceFolder, TestFolder } from '../../testUtil'
import { TemplateItem } from '../../../shared/ui/sam/templatePrompter'
import { ParamsSource } from '../../../shared/ui/sam/paramsSourcePrompter'
import { CloudFormationTemplateRegistry } from '../../../shared/fs/templateRegistry'

import { samconfigCompleteData, samconfigInvalidData, validTemplateData } from '../../shared/sam/samTestUtils'
import { assertTelemetry, assertTelemetryCurried } from '../../testUtil'
import { PrompterTester } from '../wizards/prompterTester'
import { createTestRegionProvider } from '../regions/testUtil'
import { ToolkitPromptSettings } from '../../../shared/settings'
import { DefaultEcrClient } from '../../../shared/clients/ecrClient'
import assert from 'assert'
import { BucketSource } from '../../../shared/ui/sam/bucketPrompter'

describe('SAM SyncWizard', async function () {
    const createTester = async (params?: Partial<SyncParams>) =>
        createWizardTester(new SyncWizard({ deployType: 'code', ...params }, await globals.templateRegistry))

    it('skips prompts if user chooses samconfig file as params source', async function () {
        const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri || vscode.Uri.file('/')
        const rootFolderUri = vscode.Uri.joinPath(workspaceUri, 'my')
        const templateUri = vscode.Uri.joinPath(rootFolderUri, 'template.yaml')
        const tester = await createTester({
            template: { uri: templateUri, data: createBaseTemplate() },
            paramsSource: ParamsSource.SamConfig,
            projectRoot: rootFolderUri,
        })
        tester.template.assertDoesNotShow()
        tester.region.assertDoesNotShow()
        tester.stackName.assertDoesNotShow()
        tester.bucketName.assertDoesNotShow()
    })

    it('prompts for ECR repo if template has image-based resource', async function () {
        const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri || vscode.Uri.file('/')
        const rootFolderUri = vscode.Uri.joinPath(workspaceUri, 'my')
        const templateUri = vscode.Uri.joinPath(rootFolderUri, 'template.yaml')
        const template = { uri: templateUri, data: createBaseImageTemplate() }
        const tester = await createTester({
            template,
            paramsSource: ParamsSource.Specify,
        })
        tester.ecrRepoUri.assertShow()
    })

    it('skips prompt for ECR repo if template has no image-based resources', async function () {
        const template = { uri: vscode.Uri.file('/'), data: createBaseTemplate() }
        const tester = await createTester({ template })
        tester.ecrRepoUri.assertDoesNotShow()
    })

    it('skips prompt for ECR repo if param source is to use samconfig', async function () {
        const template = { uri: vscode.Uri.file('/'), data: createBaseTemplate() }
        const tester = await createTester({ template, paramsSource: ParamsSource.SamConfig })
        tester.ecrRepoUri.assertDoesNotShow()
    })

    it("uses the template's workspace subfolder as the project root is not set", async function () {
        const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri
        assert.ok(workspaceUri)
        const rootFolderUri = vscode.Uri.joinPath(workspaceUri, 'my')
        assert.ok(rootFolderUri)

        const templateUri = vscode.Uri.joinPath(rootFolderUri, 'template.yaml')
        const template = { uri: templateUri, data: createBaseTemplate() }
        const tester = await createTester({ template, projectRoot: rootFolderUri })
        tester.projectRoot.path.assertValue(rootFolderUri.path)
    })
})

describe('SAM SyncWizard', async () => {
    let sandbox: sinon.SinonSandbox
    let testFolder: TestFolder
    let projectRoot: vscode.Uri
    let workspaceFolder: vscode.WorkspaceFolder
    let templateFile: vscode.Uri

    let mockDefaultCFNClient: sinon.SinonStubbedInstance<DefaultCloudFormationClient>
    let mockDefaultS3Client: sinon.SinonStubbedInstance<DefaultS3Client>
    let registry: CloudFormationTemplateRegistry

    beforeEach(async () => {
        testFolder = await TestFolder.create()
        projectRoot = vscode.Uri.file(testFolder.path)
        workspaceFolder = getWorkspaceFolder(testFolder.path)
        sandbox = sinon.createSandbox()

        // Simulate return of deployed stacks
        mockDefaultCFNClient = sandbox.createStubInstance(CloudFormationClientModule.DefaultCloudFormationClient)
        sandbox.stub(CloudFormationClientModule, 'DefaultCloudFormationClient').returns(mockDefaultCFNClient)
        mockDefaultCFNClient.listAllStacks.returns(intoCollection(stackSummaries))

        // Simulate return of list bucket
        mockDefaultS3Client = sandbox.createStubInstance(S3ClientModule.DefaultS3Client)
        sandbox.stub(S3ClientModule, 'DefaultS3Client').returns(mockDefaultS3Client)
        mockDefaultS3Client.listBucketsIterable.returns(intoCollection(s3BucketListSummary))

        // generate template.yaml in temporary test folder and add to registery
        templateFile = vscode.Uri.file(await testFolder.write('template.yaml', validTemplateData))
        registry = await globals.templateRegistry
        await registry.addItem(templateFile)
    })

    afterEach(() => {
        sandbox.restore()
        registry.reset()
    })

    describe('entry: template file', () => {
        it('happy path with invalid samconfig.toml', async () => {
            /**
             * Selection:
             *  - template              : [Skip]     automatically set
             *  - projectRoot           : [Skip]     automatically set
             *  - paramsSource          : [Select]   1. ('Specify required parameters and save as defaults')
             *  - region                : [Select]   'us-west-2'
             *  - stackName             : [Select]   1. 'stack1'
             *  - bucketSource          : [Select]   1.  BucketSource.SamCliManaged
             *  - bucketName            : [Skip]     undefined
             *  - syncFlags             : [Select]   ["--dependency-layer","--use-container","--save-params"]
             */

            // generate samconfig.toml in temporary test folder
            await testFolder.write('samconfig.toml', samconfigInvalidData)

            const prompterTester = PrompterTester.init()
                .handleQuickPick('Specify parameter source for sync', async (picker) => {
                    // Need time to check samconfig.toml file and generate options
                    await picker.untilReady()

                    assert.strictEqual(picker.items.length, 2)
                    assert.strictEqual(picker.items[0].label, 'Specify required parameters and save as defaults')
                    assert.strictEqual(picker.items[1].label, 'Specify required parameters')
                    picker.acceptItem(picker.items[1])
                })
                .handleQuickPick('Select a region', (quickPick) => {
                    const select = quickPick.items.filter((i) => i.detail === 'us-west-2')[0]
                    quickPick.acceptItem(select || quickPick.items[0])
                })
                .handleQuickPick('Select a CloudFormation Stack', async (quickPick) => {
                    // The prompt will need some time to generate option
                    await quickPick.untilReady()

                    assert.strictEqual(quickPick.items.length, 3)
                    assert.strictEqual(quickPick.items[0].label, 'stack1')
                    assert.strictEqual(quickPick.items[1].label, 'stack2')
                    assert.strictEqual(quickPick.items[2].label, 'stack3')
                    quickPick.acceptItem(quickPick.items[0])
                })
                .handleQuickPick('Specify S3 bucket for deployment artifacts', async (picker) => {
                    await picker.untilReady()
                    assert.strictEqual(picker.items.length, 2)
                    assert.deepEqual(picker.items[0], {
                        label: 'Create a SAM CLI managed S3 bucket',
                        data: BucketSource.SamCliManaged,
                    })
                    assert.deepEqual(picker.items[1], {
                        label: 'Specify an S3 bucket',
                        data: BucketSource.UserProvided,
                    })
                    picker.acceptItem(picker.items[0])
                })
                .handleQuickPick('Specify parameters for sync', async (picker) => {
                    await picker.untilReady()
                    assert.strictEqual(picker.items.length, 9)
                    const dependencyLayer = picker.items.filter((item) => item.label === 'Dependency layer')[0]
                    const useContainer = picker.items.filter((item) => item.label === 'Use container')[0]
                    const saveParam = picker.items.filter((item) => item.label === 'Save parameters')[0]
                    picker.acceptItems(dependencyLayer, useContainer, saveParam)
                })
                .build()

            const parameters = await (await getSyncWizard('infra', templateFile, false, false)).run()

            assert(parameters)

            assert.strictEqual(parameters.template.uri.fsPath, templateFile.fsPath)
            assert.strictEqual(parameters.projectRoot.fsPath, projectRoot.fsPath)
            assert.strictEqual(parameters.paramsSource, ParamsSource.Specify)
            assert.strictEqual(parameters.region, 'us-west-2')
            assert.strictEqual(parameters.stackName, 'stack1')
            assert.strictEqual(parameters.bucketSource, BucketSource.SamCliManaged)
            assert(!parameters.bucketName)
            assert.strictEqual(parameters.deployType, 'infra')
            assert.strictEqual(parameters.skipDependencyLayer, true)
            assert.strictEqual(parameters.syncFlags, '["--dependency-layer","--use-container","--save-params"]')
            prompterTester.assertCallAll()
        })

        it('happy path with valid samconfig.toml', async () => {
            /**
             * Selection:
             *  - template              : [Skip]    automatically set
             *  - projectRoot           : [Skip]    automatically set
             *  - paramsSource          : [Select]  3. ('Use default values from samconfig')
             *  - region                : [Skip]    null; will use 'us-west-2' from samconfig
             *  - stackName             : [Skip]    null; will use 'project-1' from samconfig
             *  - bucketSource          : [Skip]    null;
             *  - bucketName            : [Skip]    automatically set for bucketSource option 1
             *  - syncFlags             : [Skip]    null; will use flags from samconfig
             */

            // generate samconfig.toml in temporary test folder
            await testFolder.write('samconfig.toml', samconfigCompleteData)

            const prompterTester = PrompterTester.init()
                .handleQuickPick('Specify parameter source for sync', async (quickPick) => {
                    // Need time to check samconfig.toml file and generate options
                    await quickPick.untilReady()
                    assert.strictEqual(quickPick.items.length, 3)
                    assert.strictEqual(quickPick.items[0].label, 'Specify required parameters and save as defaults')
                    assert.strictEqual(quickPick.items[1].label, 'Specify required parameters')
                    assert.strictEqual(quickPick.items[2].label, 'Use default values from samconfig')
                    quickPick.acceptItem(quickPick.items[2])
                })
                .build()

            const parameters = await (await getSyncWizard('infra', templateFile, false, false)).run()

            assert(parameters)

            assert.strictEqual(parameters.template.uri.fsPath, templateFile.fsPath)
            assert.strictEqual(parameters.projectRoot.fsPath, projectRoot.fsPath)
            assert.strictEqual(parameters.paramsSource, ParamsSource.SamConfig)
            assert(!parameters.region)
            assert(!parameters.stackName)
            assert.strictEqual(parameters.deployType, 'infra')
            assert(!parameters.bucketName)
            assert.strictEqual(parameters.skipDependencyLayer, true)
            assert(!parameters.syncFlags)
            prompterTester.assertCallAll()
        })
    })

    describe('entry: appBuilder', () => {
        let appNode: AppNode

        beforeEach(async () => {
            const expectedSamAppLocation = {
                workspaceFolder: workspaceFolder,
                samTemplateUri: templateFile,
                projectRoot: projectRoot,
            }
            appNode = new AppNode(expectedSamAppLocation)
        })

        it('happy path with invalid samconfig.toml', async () => {
            /**
             * Selection:
             *  - template              : [Skip]     automatically set
             *  - projectRoot           : [Skip]     automatically set
             *  - paramsSource          : [Select]   2. ('Specify required parameters')
             *  - region                : [Select]   'us-west-2'
             *  - stackName             : [Select]   2. 'stack2'
             *  - bucketSource          : [Select]   2.  BucketSource.UserProvided
             *  - bucketName            : [select]   3. stack-3-bucket
             *  - syncFlags             : [Select]   ["--save-params"]
             */

            const prompterTester = PrompterTester.init()
                .handleQuickPick('Specify parameter source for sync', async (picker) => {
                    // Need time to check samconfig.toml file and generate options
                    await picker.untilReady()

                    assert.strictEqual(picker.items.length, 2)
                    assert.strictEqual(picker.items[0].label, 'Specify required parameters and save as defaults')
                    assert.strictEqual(picker.items[1].label, 'Specify required parameters')
                    picker.acceptItem(picker.items[1])
                })
                .handleQuickPick('Select a region', async (picker) => {
                    await picker.untilReady()
                    const select = picker.items.filter((i) => i.detail === 'us-west-2')[0]
                    picker.acceptItem(select || picker.items[0])
                })
                .handleQuickPick('Select a CloudFormation Stack', async (picker) => {
                    await picker.untilReady()
                    assert.strictEqual(picker.items.length, 3)
                    assert.strictEqual(picker.items[0].label, 'stack1')
                    assert.strictEqual(picker.items[1].label, 'stack2')
                    assert.strictEqual(picker.items[2].label, 'stack3')
                    picker.acceptItem(picker.items[1])
                })
                .handleQuickPick('Specify S3 bucket for deployment artifacts', async (picker) => {
                    await picker.untilReady()
                    assert.strictEqual(picker.items.length, 2)
                    assert.deepStrictEqual(picker.items[0], {
                        label: 'Create a SAM CLI managed S3 bucket',
                        data: BucketSource.SamCliManaged,
                    })
                    assert.deepStrictEqual(picker.items[1], {
                        label: 'Specify an S3 bucket',
                        data: BucketSource.UserProvided,
                    })
                    picker.acceptItem(picker.items[1])
                })
                .handleQuickPick('Select an S3 Bucket', async (picker) => {
                    await picker.untilReady()
                    assert.strictEqual(picker.items.length, 3)
                    assert.strictEqual(picker.items[0].label, 'stack-1-bucket')
                    assert.strictEqual(picker.items[1].label, 'stack-2-bucket')
                    assert.strictEqual(picker.items[2].label, 'stack-3-bucket')
                    picker.acceptItem(picker.items[2])
                })
                .handleQuickPick('Specify parameters for sync', async (picker) => {
                    await picker.untilReady()
                    assert.strictEqual(picker.items.length, 9)
                    const saveParam = picker.items.filter((item) => item.label === 'Save parameters')[0]
                    picker.acceptItems(saveParam)
                })
                .build()

            const parameters = await (await getSyncWizard('infra', appNode, false, false)).run()

            assert(parameters)

            assert.strictEqual(parameters.template.uri.path, templateFile.path)
            assert.strictEqual(parameters.projectRoot.path, projectRoot.path)
            assert.strictEqual(parameters.paramsSource, ParamsSource.Specify)
            assert.strictEqual(parameters.region, 'us-west-2')
            assert.strictEqual(parameters.stackName, 'stack2')
            assert.strictEqual(parameters.bucketSource, BucketSource.UserProvided)
            assert.strictEqual(parameters.bucketName, 'stack-3-bucket')
            assert.strictEqual(parameters.deployType, 'infra')
            assert.strictEqual(parameters.skipDependencyLayer, true)
            assert.strictEqual(parameters.syncFlags, '["--save-params"]')
            prompterTester.assertCallAll()
        })

        it('happy path with valid samconfig.toml', async () => {
            /**
             * Selection:
             *  - template              : [Skip]     automatically set
             *  - projectRoot           : [Skip]     automatically set
             *  - paramsSource          : [Select]  3. ('Use default values from samconfig')
             *  - region                : [Skip]    null; will use value from samconfig file
             *  - stackName             : [Skip]    null; will use value from samconfig file
             *  - bucketSource          : [Skip]    null;
             *  - bucketName            : [Skip]    null; automatically set for bucketSource option 1
             *  - syncFlags             : [Skip]    null; will use flags from samconfig
             */

            // generate samconfig.toml in temporary test folder
            await testFolder.write('samconfig.toml', samconfigCompleteData)

            const prompterTester = PrompterTester.init()
                .handleQuickPick('Specify parameter source for sync', async (picker) => {
                    // Need time to check samconfig.toml file and generate options
                    await picker.untilReady()

                    assert.strictEqual(picker.items.length, 3)
                    assert.strictEqual(picker.items[0].label, 'Specify required parameters and save as defaults')
                    assert.strictEqual(picker.items[1].label, 'Specify required parameters')
                    assert.strictEqual(picker.items[2].label, 'Use default values from samconfig')
                    picker.acceptItem(picker.items[2])
                })
                .build()

            const parameters = await (await getSyncWizard('infra', appNode, false, false)).run()

            assert(parameters)

            assert.strictEqual(parameters.template.uri.path, templateFile.path)
            assert.strictEqual(parameters.projectRoot.path, projectRoot.path)
            assert.strictEqual(parameters.paramsSource, ParamsSource.SamConfig)
            assert.strictEqual(parameters.deployType, 'infra')
            assert(!parameters.region)
            assert(!parameters.stackName)
            assert(!parameters.bucketSource)
            assert(!parameters.bucketName)
            assert.strictEqual(parameters.skipDependencyLayer, true)
            prompterTester.assertCallAll()
        })
    })

    describe('entry: region node', () => {
        const expectedRegionId = 'us-west-2'
        let regionNode: RegionNode

        beforeEach(async () => {
            // Create RegionNode as entry point
            regionNode = new RegionNode(
                { id: expectedRegionId, name: 'US West (N. California)' },
                createTestRegionProvider()
            )
        })

        it('happy path with invalid samconfig.toml', async () => {
            /**
             * Selection:
             *  - template              : [Select]   template/yaml set
             *  - projectRoot           : [Skip]     automatically set
             *  - paramsSource          : [Select]   2. ('Specify required parameters')
             *  - region                : [Skip]     automatically set from region node 'us-west-2'
             *  - stackName             : [Select]   2. 'stack2'
             *  - bucketName            : [select]   2. stack-2-bucket
             *  - syncFlags             : [Select]   ["--dependency-layer","--use-container"]
             */

            const prompterTester = PrompterTester.init()
                .handleQuickPick('Select a SAM/CloudFormation Template', async (quickPick) => {
                    // Need sometime to wait for the template to search for template file
                    await quickPick.untilReady()
                    assert.strictEqual(quickPick.items.length, 1)
                    assert.strictEqual(quickPick.items[0].label, templateFile.fsPath)
                    quickPick.acceptItem(quickPick.items[0])
                })
                .handleQuickPick('Specify parameter source for sync', async (picker) => {
                    // Need time to check samconfig.toml file and generate options
                    await picker.untilReady()

                    assert.strictEqual(picker.items.length, 2)
                    assert.strictEqual(picker.items[0].label, 'Specify required parameters and save as defaults')
                    assert.strictEqual(picker.items[1].label, 'Specify required parameters')
                    picker.acceptItem(picker.items[1])
                })
                .handleQuickPick('Select a CloudFormation Stack', async (picker) => {
                    await picker.untilReady()
                    assert.strictEqual(picker.items.length, 3)
                    assert.strictEqual(picker.items[0].label, 'stack1')
                    assert.strictEqual(picker.items[1].label, 'stack2')
                    assert.strictEqual(picker.items[2].label, 'stack3')
                    picker.acceptItem(picker.items[1])
                })
                .handleQuickPick('Specify S3 bucket for deployment artifacts', async (picker) => {
                    await picker.untilReady()
                    assert.strictEqual(picker.items.length, 2)
                    assert.deepStrictEqual(picker.items[0], {
                        label: 'Create a SAM CLI managed S3 bucket',
                        data: BucketSource.SamCliManaged,
                    })
                    assert.deepStrictEqual(picker.items[1], {
                        label: 'Specify an S3 bucket',
                        data: BucketSource.UserProvided,
                    })
                    picker.acceptItem(picker.items[1])
                })
                .handleQuickPick('Select an S3 Bucket', async (picker) => {
                    await picker.untilReady()
                    assert.strictEqual(picker.items.length, 3)
                    assert.strictEqual(picker.items[0].label, 'stack-1-bucket')
                    assert.strictEqual(picker.items[1].label, 'stack-2-bucket')
                    assert.strictEqual(picker.items[2].label, 'stack-3-bucket')
                    picker.acceptItem(picker.items[1])
                })
                .handleQuickPick('Specify parameters for sync', async (picker) => {
                    await picker.untilReady()
                    assert.strictEqual(picker.items.length, 9)
                    const dependencyLayer = picker.items.filter((item) => item.label === 'Dependency layer')[0]
                    const useContainer = picker.items.filter((item) => item.label === 'Use container')[0]
                    picker.acceptItems(dependencyLayer, useContainer)
                })
                .build()

            const parameters = await (await getSyncWizard('infra', regionNode, false, false)).run()

            assert(parameters)

            assert.strictEqual(parameters.template.uri.fsPath, templateFile.fsPath)
            assert.strictEqual(parameters.projectRoot.fsPath, projectRoot.fsPath)
            assert.strictEqual(parameters.paramsSource, ParamsSource.Specify)
            assert.strictEqual(parameters.region, 'us-west-2')
            assert.strictEqual(parameters.stackName, 'stack2')
            assert.strictEqual(parameters.bucketSource, BucketSource.UserProvided)
            assert.strictEqual(parameters.bucketName, 'stack-2-bucket')
            assert.strictEqual(parameters.deployType, 'infra')
            assert.strictEqual(parameters.skipDependencyLayer, true)
            assert.strictEqual(parameters.syncFlags, '["--dependency-layer","--use-container"]')
            prompterTester.assertCallAll()
        })

        it('happy path with valid samconfig.toml', async () => {
            /**
             * Selection:
             *  - template              : [Select]  template.yaml
             *  - projectRoot           : [Skip]     automatically set
             *  - paramsSource          : [Select]  3. ('Use default values from samconfig')
             *  - region                : [Skip]    automatically set from region node 'us-west-2'
             *  - stackName             : [Skip]    null; will use value from samconfig file
             *  - bucketName            : [Skip]    automatically set for bucketSource option 1
             *  - syncFlags             : [Skip]    null; will use flags from samconfig
             */

            // generate samconfig.toml in temporary test folder
            await testFolder.write('samconfig.toml', samconfigCompleteData)

            const prompterTester = PrompterTester.init()
                .handleQuickPick('Select a SAM/CloudFormation Template', async (quickPick) => {
                    // Need sometime to wait for the template to search for template file
                    await quickPick.untilReady()
                    assert.strictEqual(quickPick.items.length, 1)
                    assert.strictEqual(quickPick.items[0].label, templateFile.fsPath)
                    quickPick.acceptItem(quickPick.items[0])
                })
                .handleQuickPick('Specify parameter source for sync', async (picker) => {
                    // Need time to check samconfig.toml file and generate options
                    await picker.untilReady()

                    assert.strictEqual(picker.items.length, 3)
                    assert.strictEqual(picker.items[0].label, 'Specify required parameters and save as defaults')
                    assert.strictEqual(picker.items[1].label, 'Specify required parameters')
                    assert.strictEqual(picker.items[2].label, 'Use default values from samconfig')
                    picker.acceptItem(picker.items[2])
                })
                .build()

            const parameters = await (await getSyncWizard('infra', regionNode, false, false)).run()

            assert(parameters)

            assert.strictEqual(parameters.template.uri.fsPath, templateFile.fsPath)
            assert.strictEqual(parameters.projectRoot.fsPath, projectRoot.fsPath)
            assert.strictEqual(parameters.paramsSource, ParamsSource.SamConfig)
            assert.strictEqual(parameters.deployType, 'infra')
            assert.strictEqual(parameters.region, 'us-west-2')
            assert(!parameters.stackName)
            assert(!parameters.bucketSource)
            assert.strictEqual(parameters.skipDependencyLayer, true)
            prompterTester.assertCallAll()
        })
    })

    describe('entry: samconfig file context menu', () => {
        it('sad path with invalid samconfig.toml should throw parsing config file error', async () => {
            // generate samconfig.toml in temporary test folder
            const samconfigFile = vscode.Uri.file(await testFolder.write('samconfig.toml', samconfigInvalidData))
            try {
                await (await getSyncWizard('infra', samconfigFile, false, false)).run()
            } catch (error: any) {
                assert.strictEqual(error.code, 'samConfigParseError')
            }
        })

        it('happy path with valid samconfig.toml', async () => {
            // generate samconfig.toml in temporary test folder
            const samconfigFile = vscode.Uri.file(await testFolder.write('samconfig.toml', samconfigCompleteData))
            const prompterTester = PrompterTester.init()
                .handleQuickPick('Select a SAM/CloudFormation Template', async (quickPick) => {
                    // Need sometime to wait for the template to search for template file
                    await quickPick.untilReady()
                    assert.strictEqual(quickPick.items.length, 1)
                    assert.strictEqual(quickPick.items[0].label, templateFile.fsPath)
                    quickPick.acceptItem(quickPick.items[0])
                })
                .handleQuickPick('Specify parameter source for sync', async (picker) => {
                    // Need time to check samconfig.toml file and generate options
                    await picker.untilReady()

                    assert.strictEqual(picker.items.length, 3)
                    assert.strictEqual(picker.items[0].label, 'Specify required parameters and save as defaults')
                    assert.strictEqual(picker.items[1].label, 'Specify required parameters')
                    assert.strictEqual(picker.items[2].label, 'Use default values from samconfig')
                    picker.acceptItem(picker.items[2])
                })
                .build()

            const parameters = await (await getSyncWizard('infra', samconfigFile, false, false)).run()
            assert(parameters)
            assert.strictEqual(parameters.template.uri.fsPath, templateFile.fsPath)
            assert.strictEqual(parameters.projectRoot.fsPath, projectRoot.fsPath)
            assert.strictEqual(parameters.paramsSource, ParamsSource.SamConfig)
            assert.strictEqual(parameters.region, 'us-west-2')
            assert.strictEqual(parameters.stackName, 'project-1')
            assert.strictEqual(parameters.deployType, 'infra')
            assert.strictEqual(parameters.bucketName, 'aws-sam-cli-managed-default-samclisourcebucket-lftqponsaxsr')
            assert.strictEqual(parameters.skipDependencyLayer, true)
            assert(!parameters.syncFlags)
            prompterTester.assertCallAll()
        })

        it('happy path with empty samconfig.toml', async () => {
            // generate samconfig.toml in temporary test folder
            const samconfigFile = vscode.Uri.file(await testFolder.write('samconfig.toml', ''))
            /**
             * Selection:
             *  - projectRoot           : [Skip]     automatically set
             *  - paramsSource          : [Select]   1. ('Specify required parameters and save as defaults')
             *  - region                : [Select]   'us-west-2'
             *  - stackName             : [Select]   2. 'stack2'
             *  - bucketName            : [select]   2. stack-2-bucket
             *  - syncFlags             : [Select]   ["--dependency-layer","--use-container","--watch"]
             */

            const prompterTester = PrompterTester.init()
                .handleQuickPick('Select a SAM/CloudFormation Template', async (quickPick) => {
                    // Need sometime to wait for the template to search for template file
                    await quickPick.untilReady()
                    assert.strictEqual(quickPick.items.length, 1)
                    assert.strictEqual(quickPick.items[0].label, templateFile.fsPath)
                    quickPick.acceptItem(quickPick.items[0])
                })
                .handleQuickPick('Specify parameter source for sync', async (picker) => {
                    // Need time to check samconfig.toml file and generate options
                    await picker.untilReady()

                    assert.strictEqual(picker.items.length, 2)
                    assert.strictEqual(picker.items[0].label, 'Specify required parameters and save as defaults')
                    assert.strictEqual(picker.items[1].label, 'Specify required parameters')
                    picker.acceptItem(picker.items[1])
                })
                .handleQuickPick('Select a CloudFormation Stack', async (picker) => {
                    await picker.untilReady()
                    assert.strictEqual(picker.items.length, 3)
                    assert.strictEqual(picker.items[0].label, 'stack1')
                    assert.strictEqual(picker.items[1].label, 'stack2')
                    assert.strictEqual(picker.items[2].label, 'stack3')
                    picker.acceptItem(picker.items[1])
                })
                .handleQuickPick('Select a region', (quickPick) => {
                    const select = quickPick.items.filter((i) => i.detail === 'us-west-2')[0]
                    quickPick.acceptItem(select || quickPick.items[0])
                })
                .handleQuickPick('Specify S3 bucket for deployment artifacts', async (picker) => {
                    await picker.untilReady()
                    assert.strictEqual(picker.items.length, 2)
                    assert.deepStrictEqual(picker.items[0], {
                        label: 'Create a SAM CLI managed S3 bucket',
                        data: BucketSource.SamCliManaged,
                    })
                    assert.deepStrictEqual(picker.items[1], {
                        label: 'Specify an S3 bucket',
                        data: BucketSource.UserProvided,
                    })
                    picker.acceptItem(picker.items[1])
                })
                .handleQuickPick('Select an S3 Bucket', async (picker) => {
                    await picker.untilReady()
                    assert.strictEqual(picker.items.length, 3)
                    assert.strictEqual(picker.items[0].label, 'stack-1-bucket')
                    assert.strictEqual(picker.items[1].label, 'stack-2-bucket')
                    assert.strictEqual(picker.items[2].label, 'stack-3-bucket')
                    picker.acceptItem(picker.items[1])
                })
                .handleQuickPick('Specify parameters for sync', async (picker) => {
                    await picker.untilReady()
                    assert.strictEqual(picker.items.length, 9)
                    const dependencyLayer = picker.items.filter((item) => item.label === 'Dependency layer')[0]
                    const useContainer = picker.items.filter((item) => item.label === 'Use container')[0]
                    const watch = picker.items.filter((item) => item.label === 'Watch')[0]
                    picker.acceptItems(dependencyLayer, useContainer, watch)
                })
                .build()

            const parameters = await (await getSyncWizard('infra', samconfigFile, false, false)).run()
            assert(parameters)
            assert.strictEqual(parameters.template.uri.fsPath, templateFile.fsPath)
            assert.strictEqual(parameters.projectRoot.fsPath, projectRoot.fsPath)
            assert.strictEqual(parameters.paramsSource, ParamsSource.Specify)
            assert.strictEqual(parameters.region, 'us-west-2')
            assert.strictEqual(parameters.stackName, 'stack2')
            assert.strictEqual(parameters.bucketSource, BucketSource.UserProvided)
            assert.strictEqual(parameters.bucketName, 'stack-2-bucket')
            assert.strictEqual(parameters.deployType, 'infra')
            assert.strictEqual(parameters.skipDependencyLayer, true)
            assert.strictEqual(parameters.syncFlags, '["--dependency-layer","--use-container","--watch"]')
            prompterTester.assertCallAll()
        })
    })

    describe('entry: command palette', () => {
        it('happy path with invalid samconfig.toml', async () => {
            /**
             * Selection:
             *  - template              : [Select]   template/yaml set
             *  - projectRoot           : [Skip]     automatically set
             *  - paramsSource          : [Select]   1. ('Specify required parameters and save as defaults')
             *  - region                : [Select]   'us-west-2'
             *  - stackName             : [Select]   3. 'stack3'
             *  - bucketName            : [select]   3. stack-3-bucket
             *  - syncFlags             : [Select]   all
             */

            const prompterTester = PrompterTester.init()
                .handleQuickPick('Select a SAM/CloudFormation Template', async (quickPick) => {
                    // Need sometime to wait for the template to search for template file
                    await quickPick.untilReady()
                    assert.strictEqual(quickPick.items.length, 1)
                    assert.strictEqual(quickPick.items[0].label, templateFile.fsPath)
                    quickPick.acceptItem(quickPick.items[0])
                })
                .handleQuickPick('Specify parameter source for sync', async (picker) => {
                    // Need time to check samconfig.toml file and generate options
                    await picker.untilReady()

                    assert.strictEqual(picker.items.length, 2)
                    assert.strictEqual(picker.items[0].label, 'Specify required parameters and save as defaults')
                    assert.strictEqual(picker.items[1].label, 'Specify required parameters')
                    picker.acceptItem(picker.items[0])
                })
                .handleQuickPick('Select a region', (quickPick) => {
                    const select = quickPick.items.filter((i) => i.detail === 'us-west-2')[0]
                    quickPick.acceptItem(select || quickPick.items[0])
                })
                .handleQuickPick('Select a CloudFormation Stack', async (picker) => {
                    await picker.untilReady()
                    assert.strictEqual(picker.items.length, 3)
                    assert.strictEqual(picker.items[0].label, 'stack1')
                    assert.strictEqual(picker.items[1].label, 'stack2')
                    assert.strictEqual(picker.items[2].label, 'stack3')
                    picker.acceptItem(picker.items[2])
                })
                .handleQuickPick('Specify S3 bucket for deployment artifacts', async (picker) => {
                    await picker.untilReady()
                    assert.strictEqual(picker.items.length, 2)
                    assert.deepStrictEqual(picker.items[0], {
                        label: 'Create a SAM CLI managed S3 bucket',
                        data: BucketSource.SamCliManaged,
                    })
                    assert.deepStrictEqual(picker.items[1], {
                        label: 'Specify an S3 bucket',
                        data: BucketSource.UserProvided,
                    })
                    picker.acceptItem(picker.items[0])
                })
                .handleQuickPick('Specify parameters for sync', async (picker) => {
                    await picker.untilReady()
                    assert.strictEqual(picker.items.length, 9)
                    const dependencyLayer = picker.items.filter((item) => item.label === 'Dependency layer')[0]
                    const useContainer = picker.items.filter((item) => item.label === 'Use container')[0]
                    picker.acceptItems(dependencyLayer, useContainer)
                })
                .build()

            const parameters = await (await getSyncWizard('infra', undefined, false, false)).run()

            assert(parameters)

            assert.strictEqual(parameters.template.uri.fsPath, templateFile.fsPath)
            assert.strictEqual(parameters.projectRoot.fsPath, projectRoot.fsPath)
            assert.strictEqual(parameters.paramsSource, ParamsSource.SpecifyAndSave)
            assert.strictEqual(parameters.region, 'us-west-2')
            assert.strictEqual(parameters.stackName, 'stack3')
            assert.strictEqual(parameters.bucketSource, BucketSource.SamCliManaged)
            assert(!parameters.bucketName)
            assert.strictEqual(parameters.deployType, 'infra')
            assert.strictEqual(parameters.skipDependencyLayer, true)
            assert.strictEqual(parameters.syncFlags, '["--dependency-layer","--use-container"]')
            prompterTester.assertCallAll()
        })

        it('happy path with valid samconfig.toml', async () => {
            /**
             * Selection:
             *  - template              : [Select]  template.yaml
             *  - projectRoot           : [Skip]     automatically set
             *  - paramsSource          : [Select]  3. ('Use default values from samconfig')
             *  - region                : [Skip]    automatically set from region node 'us-west-2'
             *  - stackName             : [Skip]    null; will use value from samconfig file
             *  - bucketName            : [Skip]    automatically set for bucketSource option 1
             *  - syncFlags             : [Skip]    null; will use flags from samconfig
             */

            // generate samconfig.toml in temporary test folder
            await testFolder.write('samconfig.toml', samconfigCompleteData)

            const prompterTester = PrompterTester.init()
                .handleQuickPick('Select a SAM/CloudFormation Template', async (quickPick) => {
                    // Need sometime to wait for the template to search for template file
                    await quickPick.untilReady()
                    assert.strictEqual(quickPick.items.length, 1)
                    assert.strictEqual(quickPick.items[0].label, templateFile.fsPath)
                    quickPick.acceptItem(quickPick.items[0])
                })
                .handleQuickPick('Specify parameter source for sync', async (picker) => {
                    // Need time to check samconfig.toml file and generate options
                    await picker.untilReady()

                    assert.strictEqual(picker.items.length, 3)
                    assert.strictEqual(picker.items[0].label, 'Specify required parameters and save as defaults')
                    assert.strictEqual(picker.items[1].label, 'Specify required parameters')
                    assert.strictEqual(picker.items[2].label, 'Use default values from samconfig')
                    picker.acceptItem(picker.items[2])
                })
                .build()

            const parameters = await (await getSyncWizard('infra', undefined, false, false)).run()

            assert(parameters)

            assert.strictEqual(parameters.template.uri.fsPath, templateFile.fsPath)
            assert.strictEqual(parameters.projectRoot.fsPath, projectRoot.fsPath)
            assert.strictEqual(parameters.paramsSource, ParamsSource.SamConfig)
            assert.strictEqual(parameters.deployType, 'infra')
            assert(!parameters.region)
            assert(!parameters.stackName)
            assert(!parameters.bucketSource)
            assert(!parameters.syncFlags)
            assert.strictEqual(parameters.skipDependencyLayer, true)
            prompterTester.assertCallAll()
        })
    })
})

describe('SAM runSync', () => {
    let sandbox: sinon.SinonSandbox
    let testFolder: TestFolder
    let projectRoot: vscode.Uri
    let workspaceFolder: vscode.WorkspaceFolder
    let templateFile: vscode.Uri

    let mockGetSpawnEnv: sinon.SinonStub
    let mockGetSamCliPath: sinon.SinonStub
    let mockChildProcessClass: sinon.SinonStub
    let mockSamSyncChildProcess: sinon.SinonStub

    let spyWriteSamconfigGlobal: sinon.SinonSpy
    let spyRunInterminal: sinon.SinonSpy

    let mockDefaultCFNClient: sinon.SinonStubbedInstance<DefaultCloudFormationClient>
    let mockDefaultS3Client: sinon.SinonStubbedInstance<DefaultS3Client>
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

        // Simulate return of deployed stacks
        mockDefaultCFNClient = sandbox.createStubInstance(CloudFormationClientModule.DefaultCloudFormationClient)
        sandbox.stub(CloudFormationClientModule, 'DefaultCloudFormationClient').returns(mockDefaultCFNClient)
        mockDefaultCFNClient.listAllStacks.returns(intoCollection(stackSummaries))

        // Simulate return of list bucket
        mockDefaultS3Client = sandbox.createStubInstance(S3ClientModule.DefaultS3Client)
        sandbox.stub(S3ClientModule, 'DefaultS3Client').returns(mockDefaultS3Client)
        mockDefaultS3Client.listBucketsIterable.returns(intoCollection(s3BucketListSummary))

        // Create Spy for validation
        spyWriteSamconfigGlobal = sandbox.spy(SamConfigModule, 'writeSamconfigGlobal')
        spyRunInterminal = sandbox.spy(ProcessTerminalUtils, 'runInTerminal')

        // generate template.yaml in temporary test folder and add to registery
        templateFile = vscode.Uri.file(await testFolder.write('template.yaml', validTemplateData))
        await (await globals.templateRegistry).addItem(templateFile)

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
        beforeEach(() => {
            mockGetSamCliPath = sandbox
                .stub(SamUtilsModule, 'getSamCliPathAndVersion')
                .callsFake(sandbox.stub().resolves({ path: 'sam-cli-path' }))

            // Confirm confirmDevStack message
            // getTestWindow().onDidShowMessage((m) => m.items.find((i) => i.title === 'OK')?.select())
            getTestWindow().onDidShowMessage((message) => {
                message.selectItem("OK, and don't show this again")
            })

            // Mock  child process with required properties that get called in ProcessTerminal
            mockSamSyncChildProcess = Object.create(ProcessUtilsModule.ChildProcess.prototype, {
                stopped: { get: sandbox.stub().returns(false) },
                stop: { value: sandbox.stub().resolves({}) },
                run: {
                    value: sandbox.stub().resolves({
                        exitCode: 0,
                        stdout: 'Mock successful sync command execution ',
                        stderr: '',
                    }),
                },
            })
            mockChildProcessClass = sandbox.stub(ProcessUtilsModule, 'ChildProcess').returns(mockSamSyncChildProcess)
        })

        afterEach(() => {
            sandbox.restore()
        })

        it('[entry: command palette] specify and save flag should instantiate correct process in terminal', async () => {
            const prompterTester = PrompterTester.init()
                .handleQuickPick('Select a SAM/CloudFormation Template', async (quickPick) => {
                    // Need sometime to wait for the template to search for template file
                    await quickPick.untilReady()
                    assert.strictEqual(quickPick.items[0].label, templateFile.fsPath)
                    quickPick.acceptItem(quickPick.items[0])
                })
                .handleQuickPick('Specify parameter source for sync', async (picker) => {
                    // Need time to check samconfig.toml file and generate options
                    await picker.untilReady()
                    assert.strictEqual(picker.items[0].label, 'Specify required parameters and save as defaults')
                    picker.acceptItem(picker.items[0])
                })
                .handleQuickPick('Select a region', (quickPick) => {
                    const select = quickPick.items.filter((i) => i.detail === 'us-west-2')[0]
                    quickPick.acceptItem(select || quickPick.items[0])
                })
                .handleQuickPick('Select a CloudFormation Stack', async (picker) => {
                    await picker.untilReady()
                    assert.strictEqual(picker.items[2].label, 'stack3')
                    picker.acceptItem(picker.items[2])
                })
                .handleQuickPick('Specify S3 bucket for deployment artifacts', async (picker) => {
                    await picker.untilReady()
                    assert.strictEqual(picker.items.length, 2)
                    assert.strictEqual(picker.items[1].label, 'Specify an S3 bucket')
                    picker.acceptItem(picker.items[1])
                })
                .handleQuickPick('Select an S3 Bucket', async (picker) => {
                    await picker.untilReady()
                    assert.strictEqual(picker.items.length, 3)
                    assert.strictEqual(picker.items[2].label, 'stack-3-bucket')
                    picker.acceptItem(picker.items[2])
                })
                .handleQuickPick('Specify parameters for sync', async (picker) => {
                    await picker.untilReady()
                    assert.strictEqual(picker.items.length, 9)
                    const dependencyLayer = picker.items.filter((item) => item.label === 'Dependency layer')[0]
                    const useContainer = picker.items.filter((item) => item.label === 'Use container')[0]
                    picker.acceptItems(dependencyLayer, useContainer)
                })
                .build()

            // Invoke sync command from command palette
            await runSync('code', undefined)

            assert(mockGetSamCliPath.calledOnce)
            assert(mockChildProcessClass.calledOnce)
            assert.deepEqual(mockChildProcessClass.getCall(0).args, [
                'sam-cli-path',
                [
                    'sync',
                    '--code',
                    '--template',
                    `${templateFile.fsPath}`,
                    '--s3-bucket',
                    'stack-3-bucket',
                    '--stack-name',
                    'stack3',
                    '--region',
                    'us-west-2',
                    '--no-dependency-layer',
                    '--save-params',
                    '--dependency-layer',
                    '--use-container',
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
            assert(mockGetSpawnEnv.calledOnce)
            assert(spyRunInterminal.calledOnce)
            assert.deepEqual(spyRunInterminal.getCall(0).args, [mockSamSyncChildProcess, 'sync'])
            assert(spyWriteSamconfigGlobal.calledOnce)
            // Check telementry
            assertTelemetry('sam_sync', { result: 'Succeeded', source: undefined })
            assertTelemetryCurried('sam_sync')({
                syncedResources: 'CodeOnly',
                source: undefined,
            })
            prompterTester.assertCallAll()
        })

        it('[entry: template file] specify flag should instantiate correct process in terminal', async () => {
            const prompterTester = PrompterTester.init()
                .handleQuickPick('Specify parameter source for sync', async (picker) => {
                    // Need time to check samconfig.toml file and generate options
                    await picker.untilReady()
                    assert.strictEqual(picker.items[1].label, 'Specify required parameters')
                    picker.acceptItem(picker.items[1])
                })
                .handleQuickPick('Select a region', (quickPick) => {
                    const select = quickPick.items.filter((i) => i.detail === 'us-west-2')[0]
                    quickPick.acceptItem(select || quickPick.items[0])
                })
                .handleQuickPick('Select a CloudFormation Stack', async (quickPick) => {
                    // The prompt will need some time to generate option
                    await quickPick.untilReady()
                    assert.strictEqual(quickPick.items[0].label, 'stack1')
                    quickPick.acceptItem(quickPick.items[0])
                })
                .handleQuickPick('Specify S3 bucket for deployment artifacts', async (picker) => {
                    await picker.untilReady()
                    assert.strictEqual(picker.items.length, 2)
                    assert.strictEqual(picker.items[1].label, 'Specify an S3 bucket')
                    picker.acceptItem(picker.items[1])
                })
                .handleQuickPick('Select an S3 Bucket', async (picker) => {
                    await picker.untilReady()
                    assert.strictEqual(picker.items[0].label, 'stack-1-bucket')
                    picker.acceptItem(picker.items[0])
                })
                .handleQuickPick('Specify parameters for sync', async (picker) => {
                    await picker.untilReady()
                    assert.strictEqual(picker.items.length, 9)
                    const dependencyLayer = picker.items.filter((item) => item.label === 'Dependency layer')[0]
                    const useContainer = picker.items.filter((item) => item.label === 'Use container')[0]
                    picker.acceptItems(dependencyLayer, useContainer)
                })
                .build()

            await runSync('infra', templateFile)

            assert(mockGetSamCliPath.calledOnce)
            assert(mockChildProcessClass.calledOnce)
            assert.deepEqual(mockChildProcessClass.getCall(0).args, [
                'sam-cli-path',
                [
                    'sync',
                    '--template',
                    `${templateFile.fsPath}`,
                    '--s3-bucket',
                    'stack-1-bucket',
                    '--stack-name',
                    'stack1',
                    '--region',
                    'us-west-2',
                    '--no-dependency-layer',
                    '--dependency-layer',
                    '--use-container',
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
            assert(mockGetSpawnEnv.calledOnce)
            assert(spyRunInterminal.calledOnce)
            assert.deepEqual(spyRunInterminal.getCall(0).args, [mockSamSyncChildProcess, 'sync'])
            assert(spyWriteSamconfigGlobal.calledOnce)

            // Check telementry
            assertTelemetry('sam_sync', { result: 'Succeeded', source: 'template' })
            assertTelemetryCurried('sam_sync')({
                syncedResources: 'AllResources',
                source: 'template',
            })
            prompterTester.assertCallAll()
        })

        it('[entry: appBuilder] use samconfig should instantiate correct process in terminal', async () => {
            const expectedSamAppLocation = {
                workspaceFolder: workspaceFolder,
                samTemplateUri: templateFile,
                projectRoot: projectRoot,
            }
            const appNode = new AppNode(expectedSamAppLocation)
            const samconfigFile = vscode.Uri.file(await testFolder.write('samconfig.toml', samconfigCompleteData))

            const prompterTester = PrompterTester.init()
                .handleQuickPick('Specify parameter source for sync', async (picker) => {
                    // Need time to check samconfig.toml file and generate options
                    await picker.untilReady()
                    assert.strictEqual(picker.items[2].label, 'Use default values from samconfig')
                    picker.acceptItem(picker.items[2])
                })
                .build()

            await runSync('infra', appNode)

            assert(mockGetSamCliPath.calledOnce)
            assert(mockChildProcessClass.calledOnce)
            assert.deepEqual(mockChildProcessClass.getCall(0).args, [
                'sam-cli-path',
                [
                    'sync',
                    '--template',
                    `${templateFile.fsPath}`,
                    '--no-dependency-layer',
                    '--config-file',
                    `${samconfigFile.fsPath}`,
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
            assert(mockGetSpawnEnv.calledOnce)
            assert(spyRunInterminal.calledOnce)
            assert.deepEqual(spyRunInterminal.getCall(0).args, [mockSamSyncChildProcess, 'sync'])
            assert(spyWriteSamconfigGlobal.notCalled)

            // Check telementry
            assertTelemetry('sam_sync', { result: 'Succeeded', source: 'appBuilderDeploy' })
            assertTelemetryCurried('sam_sync')({
                syncedResources: 'AllResources',
                source: 'appBuilderDeploy',
            })
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

        it('should abort when customer cancel sync dev stack agreement', async () => {
            // Set the
            await ToolkitPromptSettings.instance.update('samcliConfirmDevStack', false)
            // Confirm confirmDevStack message
            getTestWindow().onDidShowMessage((message) => {
                message.dispose()
            })

            try {
                await runSync('infra', appNode)
                assert.fail('should have thrown CancellationError')
            } catch (error: any) {
                assert(error instanceof CancellationError)
                assert.strictEqual(error.agent, 'user')
            }
        })

        it('should abort when customer cancel sync wizard', async () => {
            // Confirm confirmDevStack message
            getTestWindow().onDidShowMessage((m) => m.items.find((i) => i.title === 'OK')?.select())
            sandbox.stub(SyncWizard.prototype, 'run').resolves(undefined)

            try {
                await runSync('infra', appNode)
                assert.fail('should have thrown CancellationError')
            } catch (error: any) {
                assert(error instanceof CancellationError)
                assert.strictEqual(error.agent, 'user')
            }
        })

        it('should throw ToolkitError when sync command fail', async () => {
            // Confirm confirmDevStack message
            getTestWindow().onDidShowMessage((m) => m.items.find((i) => i.title === 'OK')?.select())

            const prompterTester = PrompterTester.init()
                .handleQuickPick('Specify parameter source for sync', async (picker) => {
                    // Need time to check samconfig.toml file and generate options
                    await picker.untilReady()
                    assert.strictEqual(picker.items[2].label, 'Use default values from samconfig')
                    picker.acceptItem(picker.items[2])
                })
                .build()

            // Mock  child process with required properties that get called in ProcessTerminal
            mockSamSyncChildProcess = Object.create(ProcessUtilsModule.ChildProcess.prototype, {
                stopped: { get: sandbox.stub().returns(false) },
                stop: { value: sandbox.stub().resolves({}) },
                run: {
                    value: sandbox.stub().resolves({
                        exitCode: -1,
                        stdout: 'Mock sync command execution failure',
                        stderr: '',
                    }),
                },
            })
            mockChildProcessClass = sandbox.stub(ProcessUtilsModule, 'ChildProcess').returns(mockSamSyncChildProcess)

            try {
                await runSync('infra', appNode)
                assert.fail('should have thrown ToolkitError')
            } catch (error: any) {
                assert(error instanceof ToolkitError)
                assert.strictEqual(error.message, 'Failed to sync SAM application')
            }
            prompterTester.assertCallAll()
        })
    })
})

describe('SAM sync helper functions', () => {
    describe('prepareSyncParams', function () {
        let tempDir: vscode.Uri

        beforeEach(async function () {
            tempDir = vscode.Uri.file(await makeTemporaryToolkitFolder())
        })

        afterEach(async function () {
            await fs.delete(tempDir, { recursive: true })
        })

        it('uses region if given a tree node', async function () {
            const params = await prepareSyncParams(
                new (class extends AWSTreeNodeBase {
                    public override readonly regionCode = 'foo'
                })('')
            )

            assert.strictEqual(params.region, 'foo')
        })

        async function makeTemplateItem(dir: vscode.Uri) {
            const uri = vscode.Uri.joinPath(dir, 'template.yaml')
            const data = makeSampleSamTemplateYaml(true)
            await fs.writeFile(uri, JSON.stringify(data))

            return { uri, data }
        }

        it('loads template if given a URI', async function () {
            const template = await makeTemplateItem(tempDir)

            const params = await prepareSyncParams(template.uri)
            assert.strictEqual(params.template?.uri.fsPath, template.uri.fsPath)
            assert.deepStrictEqual(params.template?.data, template.data)
        })

        it('skips dependency layers by default', async function () {
            const template = await makeTemplateItem(tempDir)

            const params = await prepareSyncParams(template.uri)
            assert.strictEqual(params.skipDependencyLayer, true)
        })

        describe('samconfig.toml', function () {
            async function makeDefaultConfig(dir: vscode.Uri, body: string) {
                const uri = vscode.Uri.joinPath(dir, 'samconfig.toml')
                const data = `
            [default.sync.parameters]
            ${body}
`
                await fs.writeFile(uri, data)

                return uri
            }

            async function getParams(body: string, dir = tempDir) {
                const config = await makeDefaultConfig(dir, body)

                return prepareSyncParams(config)
            }

            it('throws on non-string values', async function () {
                await assert.rejects(() => getParams(`region = 0`), ToolkitError)
            })

            it('does not fail on missing values', async function () {
                const params = await getParams(`region = "bar"`)
                assert.strictEqual(params.region, 'bar')
            })

            it('sets the project root as the parent directory', async function () {
                const params = await getParams(`region = "bar"`, tempDir)
                assert.strictEqual(params.projectRoot?.fsPath, tempDir.fsPath)
            })

            it('uses the depdency layer option if provided', async function () {
                const params = await getParams(`dependency_layer = true`, tempDir)
                assert.strictEqual(params.skipDependencyLayer, false)
            })

            it('can load a relative template param', async function () {
                const template = await makeTemplateItem(tempDir)
                const params = await getParams(`template = "./template.yaml"`)
                assert.deepStrictEqual(params.template?.data, template.data)
            })

            it('can load an absolute template param', async function () {
                const template = await makeTemplateItem(tempDir)
                const params = await getParams(`template = '${template.uri.fsPath}'`)
                assert.deepStrictEqual(params.template?.data, template.data)
            })

            it('can load a relative template param without a path seperator', async function () {
                const template = await makeTemplateItem(tempDir)
                const params = await getParams(`template = "template.yaml"`)
                assert.deepStrictEqual(params.template?.data, template.data)
            })

            it('can load a template param using an alternate key', async function () {
                const template = await makeTemplateItem(tempDir)
                const params = await getParams(`template_file = "template.yaml"`)
                assert.deepStrictEqual(params.template?.data, template.data)
            })

            it('can use global params', async function () {
                const params = await getParams(`
            region = "bar"
            [default.global.parameters]
            stack_name = "my-app"
            `)
                assert.strictEqual(params.stackName, 'my-app')
            })

            it('prefers using the sync section over globals', async function () {
                const params = await getParams(`
            stack_name = "my-sync-app"
            [default.global.parameters]
            stack_name = "my-app"
            `)
                assert.strictEqual(params.stackName, 'my-sync-app')
            })

            it('loads all values if found', async function () {
                const params = await getParams(`
            region = "bar"
            stack_name = "my-app"
            s3_bucket = "my-bucket"
            image_repository = "12345679010.dkr.ecr.bar.amazonaws.com/repo"
            `)
                assert.strictEqual(params.region, 'bar')
                assert.strictEqual(params.stackName, 'my-app')
                assert.strictEqual(params.bucketName, 'my-bucket')
                assert.strictEqual(params.ecrRepoUri, '12345679010.dkr.ecr.bar.amazonaws.com/repo')
            })
        })
    })

    describe('syncFlagsPrompter', () => {
        let sandbox: sinon.SinonSandbox
        let acceptedItems: DataQuickPickItem<string>[]

        beforeEach(() => {
            sandbox = sinon.createSandbox()
        })

        afterEach(() => {
            sandbox.restore() // Restore all stubs after each test
        })

        it('should return selected flags from buildFlagsPrompter', async () => {
            getTestWindow().onDidShowQuickPick(async (picker) => {
                await picker.untilReady()
                assert.strictEqual(picker.items.length, 9)
                assert.strictEqual(picker.title, 'Specify parameters for sync')
                assert.deepStrictEqual(picker.items, syncFlagItems)
                const buildInSource = picker.items[0]
                const code = picker.items[1]
                const dependencyLayer = picker.items[2]
                assert.strictEqual(buildInSource.data, '--build-in-source')
                assert.strictEqual(code.data, '--code')
                assert.strictEqual(dependencyLayer.data, '--dependency-layer')
                acceptedItems = [buildInSource, code, dependencyLayer]
                picker.acceptItems(...acceptedItems)
            })

            const flags = await createMultiPick(syncFlagItems, {
                title: 'Specify parameters for sync',
                placeholder: 'Press enter to proceed with highlighted option',
            }).prompt()

            assert.deepStrictEqual(flags, JSON.stringify(acceptedItems.map((i) => i.data)))
        })
    })

    describe('createEnvironmentPrompter', () => {
        let sandbox: sinon.SinonSandbox
        let config: SamConfig
        let listEnvironmentsStub: sinon.SinonStub

        beforeEach(() => {
            sandbox = sinon.createSandbox()
            // Create a stub for the SamConfig instance
            config = new SamConfig(vscode.Uri.parse('dummy://uri'))
            listEnvironmentsStub = sandbox.stub(config, 'listEnvironments')
        })

        afterEach(() => {
            sandbox.restore()
        })

        it('should create a prompter with existing samconfig env', () => {
            // Arrange
            const defaultEnv: Environment = {
                name: 'default',
                commands: {},
            }
            const stagingEnv: Environment = {
                name: 'staging',
                commands: {},
            }
            const prodEnv: Environment = {
                name: 'prod',
                commands: {},
            }
            const envs: Environment[] = [defaultEnv, stagingEnv, prodEnv]

            listEnvironmentsStub.returns(envs)
            sandbox.stub(SamUtilsModule, 'getRecentResponse').returns(undefined)

            // Act
            const prompter = createEnvironmentPrompter(config)

            // Assert
            assert.ok(listEnvironmentsStub.calledOnce)
            assert.strictEqual(prompter.quickPick.title, 'Select an Environment to Use')
            assert.strictEqual(prompter.quickPick.placeholder, 'Select an environment')
            assert.strictEqual(prompter.quickPick.items.length, 3)
            assert.deepStrictEqual(prompter.quickPick.items, [
                {
                    label: 'default',
                    data: defaultEnv,
                    recentlyUsed: false,
                },
                {
                    label: 'staging',
                    data: stagingEnv,
                    recentlyUsed: false,
                },
                {
                    label: 'prod',
                    data: prodEnv,
                    recentlyUsed: false,
                },
            ])
        })
    })

    describe('prepareSyncParams', () => {
        let sandbox: sinon.SinonSandbox
        beforeEach(() => {
            sandbox = sinon.createSandbox()
        })
        afterEach(() => {
            sandbox.restore()
        })

        it('should return correct params from region node', async () => {
            const regionNode = new RegionNode({ name: 'us-east-1', id: 'IAD' } as Region, {} as RegionProvider)
            const result = await prepareSyncParams(regionNode)
            assert.deepStrictEqual(result, { skipDependencyLayer: true, region: 'IAD' })
        })

        it('should return correct params from appBuilder', async () => {
            // setup appNode
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
            assert.ok(workspaceFolder)
            const templateUri = vscode.Uri.file('file://mock/path/project/file')
            const projectRootUri = getProjectRootUri(templateUri)
            const samAppLocation = {
                samTemplateUri: templateUri,
                workspaceFolder: workspaceFolder,
                projectRoot: projectRootUri,
            }
            const appNode = new AppNode(samAppLocation)
            const tryLoadStub = sandbox.stub(Cfn, 'load')

            tryLoadStub.resolves({} as Cfn.Template)

            const templateItem = {
                uri: templateUri,
                data: {},
            }

            // Act
            const result = await prepareSyncParams(appNode)

            // Assert
            assert.deepStrictEqual(result, {
                skipDependencyLayer: true,
                template: templateItem,
                projectRoot: projectRootUri,
            })
        })

        it('should return correct params for undefined input', async () => {
            const result = await prepareSyncParams(undefined)
            assert.deepStrictEqual(result, { skipDependencyLayer: true })
        })
    })

    describe('getSyncParamsFromConfig', () => {
        let sandbox: sinon.SinonSandbox
        beforeEach(() => {
            sandbox = sinon.createSandbox()
        })

        afterEach(() => {
            sandbox.restore()
        })

        it('should return correct params from config', async () => {
            const configUri = vscode.Uri.file('file://mock/path/project/file')
            const contents = `
        [default]
        [default.global.parameters]
        stack_name = "TestApp"
        [default.build.parameters]
        cached = true
        parallel = true
        [default.deploy.parameters]
        capabilities = "CAPABILITY_IAM"
        confirm_changeset = true
        resolve_s3 = true
        [default.sync.parameters]
        watch = true
        template_file = "/Users/mbfreder/TestApp/JavaSamApp/serverless-patterns/s3-lambda-resizing-python/template.yaml"
        s3_bucket = "aws-sam-cli-managed-default-samclisourcebucket-1o6ke33w96qag"
        stack_name = "s3-lambda-resizing-java-4"
        dependency_layer = false`

            const config = await parseConfig(contents)
            const samconfig = new SamConfig(configUri, config)

            const result = getSyncParamsFromConfig(samconfig)
            assert.strictEqual(
                result['templatePath'],
                '/Users/mbfreder/TestApp/JavaSamApp/serverless-patterns/s3-lambda-resizing-python/template.yaml'
            )
            assert.strictEqual(result['bucketName'], 'aws-sam-cli-managed-default-samclisourcebucket-1o6ke33w96qag')
            assert.strictEqual(result['stackName'], 's3-lambda-resizing-java-4')
        })

        it('should return correct params from config with no template file', async () => {
            const configUri = vscode.Uri.file('file://mock/path/project/file')
            const contents = `
        [default]
        [default.global.parameters]
        stack_name = "TestApp"
        [default.build.parameters]
        cached = true
        parallel = true
        [default.deploy.parameters]
        capabilities = "CAPABILITY_IAM"
        confirm_changeset = true
        resolve_s3 = true
        [default.sync.parameters]
        watch = true
        s3_bucket = "bucket-from-samconfig"
        stack_name = "s3-lambda-resizing-java-4"
        dependency_layer = false`

            const config = await parseConfig(contents)
            const samconfig = new SamConfig(configUri, config)

            const result = getSyncParamsFromConfig(samconfig)
            assert.strictEqual(result['templatePath'], undefined)
            assert.strictEqual(result['bucketName'], 'bucket-from-samconfig')
            assert.strictEqual(result['stackName'], 's3-lambda-resizing-java-4')
        })
    })

    describe('saveAndBindArgs', () => {
        let sandbox: sinon.SinonSandbox
        let getConfigFileUriStub: sinon.SinonStub

        beforeEach(() => {
            sandbox = sinon.createSandbox()
            getConfigFileUriStub = sandbox.stub()

            // Replace the real implementations with stubs
            sandbox.stub(SamUtilsModule, 'updateRecentResponse').resolves()
        })

        afterEach(() => {
            sandbox.restore()
        })

        it('should bind arguments correctly for code deployment', async () => {
            const testFolder = await TestFolder.create()
            const templateFile = vscode.Uri.file(await testFolder.write('template.yaml', validTemplateData))

            const args = {
                deployType: 'code',
                template: {
                    uri: templateFile,
                    data: {},
                } as TemplateItem,
                bucketName: 'myBucket',
                ecrRepoUri: 'myEcrRepo',
                stackName: 'myStack',
                region: 'us-east-1',
                skipDependencyLayer: false,
                paramsSource: ParamsSource.SpecifyAndSave,
            } as SyncParams

            const result = await saveAndBindArgs(args)

            assert.ok(result.boundArgs.includes('--template'))
            assert.ok(result.boundArgs.includes('--s3-bucket'))
            assert.ok(result.boundArgs.includes('--image-repository'))
            assert.ok(result.boundArgs.includes('--stack-name'))
            assert.ok(result.boundArgs.includes('--region'))
            assert.ok(result.boundArgs.includes('--code'))
            assert.ok(result.boundArgs.includes('--save-params'))
            assert.ok(result.boundArgs.includes(templateFile.fsPath))
            assert.ok(result.boundArgs.includes('myBucket'))
            assert.ok(result.boundArgs.includes('myEcrRepo'))
            assert.ok(result.boundArgs.includes('myStack'))
            assert.ok(result.boundArgs.includes('us-east-1'))
        })

        it('should handle SamConfig paramsSource', async () => {
            const testFolder = await TestFolder.create()
            const projectRoot = vscode.Uri.file(testFolder.path)
            const templateFile = vscode.Uri.file(await testFolder.write('template.yaml', validTemplateData))
            const samConfigFile = vscode.Uri.file(await testFolder.write('samconfig.toml', '[default]'))

            const args = {
                deployType: 'code',
                template: { uri: templateFile, data: {} } as TemplateItem,
                bucketName: 'myBucket',
                ecrRepoUri: 'myEcrRepo',
                stackName: 'myStack',
                region: 'us-east-1',
                skipDependencyLayer: false,
                paramsSource: ParamsSource.SamConfig,
                projectRoot: projectRoot,
            } as SyncParams

            getConfigFileUriStub.resolves(samConfigFile)

            const result = await saveAndBindArgs(args)

            assert.ok(result.boundArgs.includes('--config-file'))
            assert.ok(result.boundArgs.includes(samConfigFile.fsPath))
        })
    })

    describe('ensureBucket', () => {
        let sandbox: sinon.SinonSandbox
        let createBucketStub

        beforeEach(() => {
            sandbox = sinon.createSandbox()
        })

        afterEach(() => {
            sandbox.restore() // Restore original behavior after each test
        })

        it('should return the bucket name when it does not match newbucket:', async () => {
            const resp = { region: 'us-east-1', bucketName: 'existing-bucket' }
            const result = await ensureBucket(resp)
            assert.strictEqual(result, 'existing-bucket')
        })

        it('should create a new bucket and return its name when bucketName matches newbucket:', async () => {
            const resp = { region: 'us-east-1', bucketName: 'newbucket:my-new-bucket' }

            // Stub the S3 client's createBucket method
            createBucketStub = sandbox.stub(DefaultS3Client.prototype, 'createBucket').resolves()

            const result = await ensureBucket(resp)
            assert.ok(createBucketStub.calledOnce)
            assert.strictEqual(createBucketStub.firstCall.args[0].bucketName, 'my-new-bucket')
            assert.strictEqual(result, 'my-new-bucket')
        })

        it('should throw a ToolkitError when bucket creation fails', async () => {
            const resp = { region: 'us-east-1', bucketName: 'newbucket:my-failing-bucket' }

            // Stub the S3 client's createBucket method to throw an error
            createBucketStub = sandbox
                .stub(DefaultS3Client.prototype, 'createBucket')
                .rejects(new Error('Failed to create S3 bucket'))

            await assert.rejects(ensureBucket(resp)).catch((err) => {
                assert.ok(err instanceof ToolkitError)
                assert.ok(err.message, 'Failed to create S3 bucket')
            })
        })
    })

    describe('ensureRepo', () => {
        let createRepositoryStub: sinon.SinonStub
        let sandbox: sinon.SinonSandbox

        beforeEach(() => {
            sandbox = sinon.createSandbox()
            createRepositoryStub = sandbox.stub()
            sandbox.stub(DefaultEcrClient.prototype, 'createRepository').callsFake(createRepositoryStub)
        })

        afterEach(() => {
            sandbox.restore()
        })

        const createInput = (ecrRepoUri: string | undefined) => ({
            region: 'us-west-2',
            ecrRepoUri,
        })

        const createNewRepoInput = (repoName: string) => createInput(`newrepo:${repoName}`)

        describe('when not creating new repository', () => {
            it('should return original ecrRepoUri when not matching newrepo pattern', async () => {
                const input = createInput('existing-repo:latest')
                const result = await ensureRepo(input)

                assert(createRepositoryStub.notCalled)
                assert.strictEqual(result, input.ecrRepoUri)
            })

            it('should return original ecrRepoUri when ecrRepoUri is undefined', async () => {
                const input = createInput(undefined)
                const result = await ensureRepo(input)

                assert(!result)
                assert(createRepositoryStub.notCalled)
            })
        })

        describe('when creating new repository', () => {
            const repoName = 'test-repo'
            const input = createNewRepoInput(repoName)

            it('should create new repository successfully', async () => {
                const expectedUri = 'aws.ecr.test/test-repo'
                createRepositoryStub.resolves({
                    repository: {
                        repositoryUri: expectedUri,
                    },
                })

                const result = await ensureRepo(input)

                assert.strictEqual(result, expectedUri)
                assert(createRepositoryStub.calledOnceWith(repoName))
            })

            it('should handle repository creation failure', async () => {
                createRepositoryStub.rejects(new Error('Repository creation failed'))

                try {
                    await ensureRepo(input)
                    assert.fail('Should have thrown an error')
                } catch (err) {
                    assert(err instanceof ToolkitError)
                    assert.strictEqual(err.message, `Failed to create new ECR repository "${repoName}"`)
                }
            })

            const testCases = [
                {
                    name: 'undefined repositoryUri',
                    response: { repository: { repositoryUri: undefined } },
                },
                {
                    name: 'empty repository response',
                    response: {},
                },
            ]

            testCases.forEach(({ name, response }) => {
                it(`should handle ${name}`, async () => {
                    createRepositoryStub.resolves(response)

                    const result = await ensureRepo(input)

                    assert(!result)
                    assert(createRepositoryStub.calledOnceWith(repoName))
                })
            })
        })
    })
})

const s3BucketListSummary: Array<
    RequiredProps<S3.Bucket, 'Name'> & {
        readonly region: string
    }
> = [
    { Name: 'stack-1-bucket', region: 'us-west-2' },
    { Name: 'stack-2-bucket', region: 'us-west-2' },
    { Name: 'stack-3-bucket', region: 'us-west-2' },
]

const stackSummaries: CloudFormation.StackSummary[][] = [
    [
        {
            StackName: 'stack1',
            StackStatus: 'CREATE_COMPLETE',
            CreationTime: new Date(),
        } as CloudFormation.StackSummary,
        {
            StackName: 'stack2',
            StackStatus: 'CREATE_COMPLETE',
            CreationTime: new Date(),
        } as CloudFormation.StackSummary,
        {
            StackName: 'stack3',
            StackStatus: 'CREATE_COMPLETE',
            CreationTime: new Date(),
        } as CloudFormation.StackSummary,
    ],
]
