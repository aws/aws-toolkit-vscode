/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as SamUtilsModule from '../../../shared/sam/utils'
import * as S3ClientModule from '../../../shared/clients/s3Client'
import * as CloudFormationClientModule from '../../../shared/clients/cloudFormationClient'
import assert from 'assert'
import {
    createEnvironmentPrompter,
    ensureBucket,
    getSyncParamsFromConfig,
    prepareSyncParams,
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
import * as deploySamApplication from '../../../shared/sam/deploy'
import * as syncSam from '../../../shared/sam/sync'
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
import { validTemplateData } from '../../shared/sam/samTestUtils'
//import { beforeEach } from 'mocha'
import { getWorkspaceFolder, TestFolder } from '../../testUtil'
import { TemplateItem } from '../../../shared/ui/common/samTemplate'
import { ParamsSource } from '../../../shared/ui/common/paramsSource'

describe('SyncWizard', async function () {
    const createTester = async (params?: Partial<SyncParams>) =>
        createWizardTester(new SyncWizard({ deployType: 'code', ...params }, await globals.templateRegistry))

    it('shows steps in correct order', async function () {
        const tester = await createTester()
        tester.template.assertShowFirst()
        tester.paramsSource.assertShowSecond()
        tester.projectRoot.assertDoesNotShow()

        const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri || vscode.Uri.file('/')
        const rootFolderUri = vscode.Uri.joinPath(workspaceUri, 'my')
        const templateUri = vscode.Uri.joinPath(rootFolderUri, 'template.yaml')
        const tester2 = await createTester({
            template: { uri: templateUri, data: createBaseTemplate() },
            paramsSource: ParamsSource.SpecifyAndSave,
            projectRoot: rootFolderUri,
        })
        tester2.region.assertShow(1)
        tester2.stackName.assertShow(2)
        tester2.bucketName.assertShow(3)
        tester2.projectRoot.assertDoesNotShow()
    })

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

describe('SyncWizard', async () => {
    let sandbox: sinon.SinonSandbox
    let testFolder: TestFolder
    let projectRoot: vscode.Uri
    let workspaceFolder: vscode.WorkspaceFolder
    let templateFile: vscode.Uri

    let mockDefaultCFNClient: sinon.SinonStubbedInstance<DefaultCloudFormationClient>
    let mockDefaultS3Client: sinon.SinonStubbedInstance<DefaultS3Client>

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
        await (await globals.templateRegistry).addItem(templateFile)
    })

    afterEach(() => {
        sandbox.restore()
    })

    describe('deploy sync prompt', function () {
        let sandbox: sinon.SinonSandbox
        beforeEach(function () {
            sandbox = sinon.createSandbox()
        })

        afterEach(function () {
            sandbox.restore()
        })

        it('customer exit should not call any function', async function () {
            // Given
            const deploy = sandbox.stub(deploySamApplication, 'runDeploy').resolves()
            const sync = sandbox.stub(syncSam, 'runSync').resolves()
            getTestWindow().onDidShowQuickPick(async (picker) => {
                if (picker.title === 'Select deployment command') {
                    await picker.untilReady()
                    assert.strictEqual(picker.items[0].label, 'Sync')
                    assert.strictEqual(picker.items[1].label, 'Deploy')
                    assert.strictEqual(picker.items.length, 2)
                    picker.dispose()
                }
            })
            await vscode.commands.executeCommand('aws.appBuilder.deploy')
            // Then
            assert(deploy.notCalled)
            assert(sync.notCalled)
        })

        it('deploy is selected', async function () {
            // Given
            const deploy = sandbox.stub(deploySamApplication, 'runDeploy').resolves()
            const sync = sandbox.stub(syncSam, 'runSync').resolves()
            getTestWindow().onDidShowQuickPick(async (picker) => {
                if (picker.title === 'Select deployment command') {
                    await picker.untilReady()
                    assert.strictEqual(picker.items[0].label, 'Sync')
                    assert.strictEqual(picker.items[1].label, 'Deploy')
                    assert.strictEqual(picker.items.length, 2)
                    picker.acceptItem(picker.items[1])
                } else {
                    await picker.untilReady()
                    picker.acceptItem(picker.items[0])
                }
            })
            await vscode.commands.executeCommand('aws.appBuilder.deploy')
            // Then
            assert(deploy.called)
            assert(sync.notCalled)
        })

        it('sync is selected', async function () {
            // Given
            const deploy = sandbox.stub(deploySamApplication, 'runDeploy').resolves()
            const sync = sandbox.stub(syncSam, 'runSync').resolves()
            getTestWindow().onDidShowQuickPick(async (picker) => {
                if (picker.title === 'Select deployment command') {
                    await picker.untilReady()
                    assert.strictEqual(picker.items[0].label, 'Sync')
                    assert.strictEqual(picker.items[1].label, 'Deploy')
                    assert.strictEqual(picker.items.length, 2)
                    picker.acceptItem(picker.items[0])
                } else {
                    await picker.untilReady()
                    picker.acceptItem(picker.items[0])
                }
            })
            await vscode.commands.executeCommand('aws.appBuilder.deploy')
            // Then
            assert(deploy.notCalled)
            assert(sync.called)
        })
    }),
        describe('appBuilder', () => {
            let appNode: AppNode
            beforeEach(async () => {
                const expectedSamAppLocation = {
                    workspaceFolder: workspaceFolder,
                    samTemplateUri: templateFile,
                    projectRoot: projectRoot,
                }
                appNode = new AppNode(expectedSamAppLocation)
            })
            afterEach(() => {
                sandbox.restore()
            })

            it('should return correct params from quickPicks', async () => {
                getTestWindow().onDidShowQuickPick(async (picker) => {
                    if (picker.title === 'Specify parameters for deploy') {
                        assert.strictEqual(picker.items.length, 2)
                        assert.strictEqual(picker.items[0].label, 'Specify required parameters and save as defaults')
                        assert.strictEqual(picker.items[1].label, 'Specify required parameters')
                        picker.acceptItem(picker.items[1])
                    } else if (picker.title === 'Select a region') {
                        await picker.untilReady()
                        const select = picker.items.filter((i) => i.detail === 'us-west-2')[0]
                        picker.acceptItem(select || picker.items[0])
                    } else if (picker.title === 'Select a CloudFormation Stack') {
                        await picker.untilReady()
                        assert.strictEqual(picker.items.length, 3)
                        assert.strictEqual(picker.items[0].label, 'stack1')
                        assert.strictEqual(picker.items[1].label, 'stack2')
                        assert.strictEqual(picker.items[2].label, 'stack3')
                        picker.acceptItem(picker.items[1])
                    } else if (picker.title === 'Select an S3 Bucket') {
                        await picker.untilReady()
                        assert.strictEqual(picker.items.length, 3)
                        assert.strictEqual(picker.items[0].label, 'stack-1-bucket')
                        assert.strictEqual(picker.items[1].label, 'stack-2-bucket')
                        assert.strictEqual(picker.items[2].label, 'stack-3-bucket')
                        picker.acceptItem(picker.items[0])
                    } else if (picker.title === 'Specify parameters for sync') {
                        await picker.untilReady()
                        assert.strictEqual(picker.items.length, 9)
                        picker.acceptDefault()
                    }
                })

                const parameters = await new SyncWizard(
                    { deployType: 'infra', template: { uri: appNode.resource.samTemplateUri, data: {} } },
                    await globals.templateRegistry
                ).run()

                assert(parameters)

                assert.strictEqual(parameters.template.uri.path, templateFile.path)
                assert.strictEqual(parameters.projectRoot.path, projectRoot.path)
                assert.strictEqual(parameters.paramsSource, ParamsSource.Specify)
                assert.strictEqual(parameters.region, 'us-west-2')
                assert.strictEqual(parameters.stackName, 'stack2')
                assert.strictEqual(parameters.bucketName, 'stack-1-bucket')
            })
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
