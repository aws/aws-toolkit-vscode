/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { CloudFormation, S3 } from 'aws-sdk'
import { AppNode } from '../../../awsService/appBuilder/explorer/nodes/appNode'
import { assertTelemetry, getWorkspaceFolder, TestFolder } from '../../testUtil'
import { DeployParams, DeployWizard, getDeployWizard, runDeploy } from '../../../shared/sam/deploy'
import { globals, ToolkitError } from '../../../shared'
import sinon from 'sinon'
import { samconfigCompleteData, samconfigInvalidData, validTemplateData } from './samTestUtils'
import * as SamUtilsModule from '../../../shared/sam/utils'
import assert from 'assert'
import { getTestWindow } from '../vscode/window'
import { DefaultCloudFormationClient } from '../../../shared/clients/cloudFormationClient'
import { intoCollection } from '../../../shared/utilities/collectionUtils'
import { PrompterTester } from '../wizards/prompterTester'
import { RegionNode } from '../../../awsexplorer/regionNode'
import { createTestRegionProvider } from '../regions/testUtil'
import { DefaultS3Client } from '../../../shared/clients/s3Client'
import * as CloudFormationClientModule from '../../../shared/clients/cloudFormationClient'
import * as S3ClientModule from '../../../shared/clients/s3Client'
import * as ProcessUtilsModule from '../../../shared/utilities/processUtils'
import * as ProcessTerminalModule from '../../../shared/sam/processTerminal'
import * as ResolveEnvModule from '../../../shared/env/resolveEnv'
import * as SamConfiModule from '../../../shared/sam/config'
import { RequiredProps } from '../../../shared/utilities/tsUtils'
import { UserAgent as __UserAgent } from '@smithy/types'

import { SamAppLocation } from '../../../awsService/appBuilder/explorer/samProject'
import { CancellationError } from '../../../shared/utilities/timeoutUtils'
import { TemplateItem } from '../../../shared/ui/sam/templatePrompter'
import { ParamsSource } from '../../../shared/ui/sam/paramsSourcePrompter'
import { BucketSource } from '../../../shared/ui/sam/bucketPrompter'

describe('SAM DeployWizard', async function () {
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

    describe('entry: template file', () => {
        it('happy path with invalid samconfig.toml', async () => {
            /**
             * Selection:
             *  - SourceBucketName      : [Select]   prefill value
             *  - DestinationBucketName : [Select]   prefill value
             *
             *  - template              : [Skip]     automatically set
             *  - projectRoot           : [Skip]     automatically set
             *  - paramsSource          : [Select]   1. ('Specify required parameters and save as defaults')
             *  - region                : [Select]   'us-west-2'
             *  - stackName             : [Select]   1. 'stack1'
             *  - bucketSource          : [Select]   1. ('Create a SAM CLI managed S3 bucket')
             *  - bucketName            : [Skip]     automatically set for bucketSource option 1
             */

            // generate samconfig.toml in temporary test folder
            await testFolder.write('samconfig.toml', samconfigInvalidData)

            const prompterTester = PrompterTester.init()
                .handleInputBox('Specify SAM parameter value for SourceBucketName', (inputBox) => {
                    inputBox.acceptValue('my-source-bucket-name')
                })
                .handleInputBox('Specify SAM parameter value for DestinationBucketName', (inputBox) => {
                    inputBox.acceptValue('my-destination-bucket-name')
                })
                .handleQuickPick('Specify parameter source for deploy', async (quickPick) => {
                    // Need time to check samconfig.toml file and generate options
                    await quickPick.untilReady()

                    assert.strictEqual(quickPick.items.length, 2)
                    assert.strictEqual(quickPick.items[0].label, 'Specify required parameters and save as defaults')
                    assert.strictEqual(quickPick.items[1].label, 'Specify required parameters')
                    quickPick.acceptItem(quickPick.items[0])
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
                .handleQuickPick('Specify S3 bucket for deployment artifacts', (quickPick) => {
                    assert.strictEqual(quickPick.items.length, 2)
                    assert.strictEqual(quickPick.items[0].label, 'Create a SAM CLI managed S3 bucket')
                    assert.strictEqual(quickPick.items[1].label, 'Specify an S3 bucket')
                    quickPick.acceptItem(quickPick.items[0])
                })
                .build()

            const parameters = await (await getDeployWizard(templateFile)).run()

            assert(parameters)
            assert.strictEqual(parameters.SourceBucketName, 'my-source-bucket-name')
            assert.strictEqual(parameters.DestinationBucketName, 'my-destination-bucket-name')

            assert.strictEqual(parameters.template.uri.fsPath, templateFile.fsPath)
            assert.strictEqual(parameters.projectRoot.fsPath, projectRoot.fsPath)
            assert.strictEqual(parameters.paramsSource, 0)
            assert.strictEqual(parameters.region, 'us-west-2')
            assert.strictEqual(parameters.stackName, 'stack1')
            assert.strictEqual(parameters.bucketSource, 0)
            prompterTester.assertCallAll()
        })

        it('happy path with valid samconfig.toml', async () => {
            /**
             * Selection:
             *  - SourceBucketName      : [Select]  prefill value
             *  - DestinationBucketName : [Select]  prefill value
             *
             *  - template              : [Skip]    automatically set
             *  - projectRoot           : [Skip]    automatically set
             *  - paramsSource          : [Select]  3. ('Use default values from samconfig')
             *  - region                : [Skip]    null; will use 'us-west-2' from samconfig
             *  - stackName             : [Skip]    null; will use 'project-1' from samconfig
             *  - bucketSource          : [Skip]    null; will use value from from samconfig
             *  - bucketName            : [Skip]    automatically set for bucketSource option 1
             */

            // generate samconfig.toml in temporary test folder
            await testFolder.write('samconfig.toml', samconfigCompleteData)

            const prompterTester = PrompterTester.init()
                .handleInputBox('Specify SAM parameter value for SourceBucketName', (inputBox) => {
                    inputBox.acceptValue('my-source-bucket-name')
                })
                .handleInputBox('Specify SAM parameter value for DestinationBucketName', (inputBox) => {
                    inputBox.acceptValue('my-destination-bucket-name')
                })
                .handleQuickPick('Specify parameter source for deploy', async (quickPick) => {
                    // Need time to check samconfig.toml file and generate options
                    await quickPick.untilReady()

                    assert.strictEqual(quickPick.items.length, 3)
                    assert.strictEqual(quickPick.items[0].label, 'Specify required parameters and save as defaults')
                    assert.strictEqual(quickPick.items[1].label, 'Specify required parameters')
                    assert.strictEqual(quickPick.items[2].label, 'Use default values from samconfig')
                    quickPick.acceptItem(quickPick.items[2])
                })
                .build()

            const parameters = await (await getDeployWizard(templateFile)).run()

            assert(parameters)
            assert.strictEqual(parameters.SourceBucketName, 'my-source-bucket-name')
            assert.strictEqual(parameters.DestinationBucketName, 'my-destination-bucket-name')

            assert.strictEqual(parameters.template.uri.fsPath, templateFile.fsPath)
            assert.strictEqual(parameters.projectRoot.fsPath, projectRoot.fsPath)
            assert.strictEqual(parameters.paramsSource, 2)
            assert(!parameters.region)
            assert(!parameters.stackName)
            assert(!parameters.bucketSource)
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

        it('happy path without/invalid samconfig.toml', async () => {
            /**
             * Selection:
             *  - SourceBucketName      : [Skip?]   undefined
             *  - DestinationBucketName : [Skip?]   undefined
             *
             *  - template              : [Select]   template/yaml set
             *  - projectRoot           : [Skip]     automatically set
             *  - paramsSource          : [Select]   2. ('Specify required parameters')
             *  - region                : [Skip]     automatically set from region node 'us-west-2'
             *  - stackName             : [Select]   1. 'stack1'
             *  - bucketSource          : [Select]   2. ('Specify an S3 bucket')
             *  - bucketName            : [Select]   1. 'stack-1-bucket'
             */

            // provide testWindow so that we can call other api
            const testWindow = getTestWindow()

            PrompterTester.init({ testWindow })
                .handleQuickPick('Select a SAM/CloudFormation Template', async (quickPick) => {
                    // Need sometime to wait for the template to search for template file
                    await quickPick.untilReady()
                    assert.strictEqual(quickPick.items.length, 1)
                    assert.strictEqual(quickPick.items[0].label, templateFile.fsPath)
                    quickPick.acceptItem(quickPick.items[0])
                })
                .handleQuickPick('Specify parameter source for deploy', async (quickPick) => {
                    // Need time to check samconfig.toml file and generate options
                    await quickPick.untilReady()

                    assert.strictEqual(quickPick.items.length, 2)
                    assert.strictEqual(quickPick.items[0].label, 'Specify required parameters and save as defaults')
                    assert.strictEqual(quickPick.items[1].label, 'Specify required parameters')
                    quickPick.acceptItem(quickPick.items[1])
                })
                .handleQuickPick('Select a CloudFormation Stack', async (quickPick) => {
                    // The prompt will need some time to generate option
                    await quickPick.untilReady()
                    assert.strictEqual(quickPick.items.length, 3)
                    assert.strictEqual(quickPick.items[0].label, 'stack1')
                    quickPick.acceptItem(quickPick.items[0])
                })
                .handleQuickPick('Specify S3 bucket for deployment artifacts', (quickPick) => {
                    assert.strictEqual(quickPick.items.length, 2)
                    assert.strictEqual(quickPick.items[0].label, 'Create a SAM CLI managed S3 bucket')
                    assert.strictEqual(quickPick.items[1].label, 'Specify an S3 bucket')
                    quickPick.acceptItem(quickPick.items[1])
                })
                .handleQuickPick('Select an S3 Bucket', async (quickPick) => {
                    // The prompt will need some time to generate option
                    await quickPick.untilReady()

                    assert.strictEqual(quickPick.items.length, 3)
                    assert.strictEqual(quickPick.items[0].label, 'stack-1-bucket')
                    assert.strictEqual(quickPick.items[1].label, 'stack-2-bucket')
                    assert.strictEqual(quickPick.items[2].label, 'stack-3-bucket')
                    quickPick.acceptItem(quickPick.items[0])
                })
                .build()

            const parameters = await (await getDeployWizard(regionNode)).run()

            assert(parameters)
            // assert.strictEqual(parameters.SourceBucketName, 'my-source-bucket-name')
            // assert.strictEqual(parameters.DestinationBucketName, 'my-destination-bucket-name')

            assert.strictEqual(parameters.template.uri.fsPath, templateFile.fsPath)
            assert.strictEqual(parameters.projectRoot.fsPath, projectRoot.fsPath)
            assert.strictEqual(parameters.paramsSource, 1)
            assert.strictEqual(parameters.region, 'us-west-2')
            assert.strictEqual(parameters.stackName, 'stack1')
            assert.strictEqual(parameters.bucketSource, 1)
            assert.strictEqual(parameters.bucketName, 'stack-1-bucket')
        })

        it('happy path with samconfig.toml', async () => {
            /**
             * Selection:
             *  - SourceBucketName      : [Skip?]   undefined
             *  - DestinationBucketName : [Skip?]   undefined
             *
             *  - template              : [Select]  template.yaml
             *  - projectRoot           : [Skip]    automatically set
             *  - paramsSource          : [Select]  3. ('Use default values from samconfig')
             *  - region                : [Skip]    automatically set from region node 'us-west-2'
             *  - stackName             : [Skip]    null; will use 'project-1' from samconfig
             *  - bucketSource          : [Skip]    null; will use value from from samconfig
             *  - bucketName            : [Skip]    null; will use value from samconfig file skip from bucketSource option
             */

            await testFolder.write('samconfig.toml', samconfigCompleteData)

            const prompterTester = PrompterTester.init()
                .handleQuickPick('Select a SAM/CloudFormation Template', async (quickPick) => {
                    // Need sometime to wait for the template to search for template file
                    await quickPick.untilReady()
                    assert.strictEqual(quickPick.items.length, 1)
                    assert.strictEqual(quickPick.items[0].label, templateFile.fsPath)
                    quickPick.acceptItem(quickPick.items[0])
                })
                .handleQuickPick('Specify parameter source for deploy', async (quickPick) => {
                    // Need time to check samconfig.toml file and generate options
                    await quickPick.untilReady()

                    assert.strictEqual(quickPick.items.length, 3)
                    assert.strictEqual(quickPick.items[0].label, 'Specify required parameters and save as defaults')
                    assert.strictEqual(quickPick.items[1].label, 'Specify required parameters')
                    assert.strictEqual(quickPick.items[2].label, 'Use default values from samconfig')
                    quickPick.acceptItem(quickPick.items[2])
                })
                .build()

            const parameters = await (await getDeployWizard(regionNode)).run()

            assert(parameters)

            assert.strictEqual(parameters.template.uri.fsPath, templateFile.fsPath)
            assert.strictEqual(parameters.projectRoot.fsPath, projectRoot.fsPath)
            assert.strictEqual(parameters.paramsSource, 2)
            assert.strictEqual(parameters.region, 'us-west-2')
            assert(!parameters.stackName)
            assert(!parameters.bucketSource)
            prompterTester.assertCallAll()
        })
    })

    describe('entry: appBuilder', () => {
        let appNode: AppNode

        beforeEach(async () => {
            // Create a mock samAppLocation object
            const expectedSamAppLocation = {
                workspaceFolder: workspaceFolder,
                samTemplateUri: templateFile,
                projectRoot: projectRoot,
            }
            appNode = new AppNode(expectedSamAppLocation)
        })

        it('happy path without/invalid samconfig.toml', async () => {
            /**
             * Selection:
             *  - SourceBucketName      : [Select]   prefill value
             *  - DestinationBucketName : [Select]   prefill value
             *
             *  - template              : [Skip]     automatically set
             *  - projectRoot           : [Skip]     automatically set
             *  - paramsSource          : [Select]   2. ('Specify required parameters')
             *  - region                : [Select]   'us-west-2'
             *  - stackName             : [Select]   2. 'stack2'
             *  - bucketSource          : [Select]   1. ('Create a SAM CLI managed S3 bucket')
             *  - bucketName            : [Skip]     automatically set for bucketSource option 1
             */

            const prompterTester = PrompterTester.init()
                .handleInputBox('Specify SAM parameter value for SourceBucketName', (inputBox) => {
                    inputBox.acceptValue('my-source-bucket-name')
                })
                .handleInputBox('Specify SAM parameter value for DestinationBucketName', (inputBox) => {
                    inputBox.acceptValue('my-destination-bucket-name')
                })
                .handleQuickPick('Specify parameter source for deploy', async (quickPick) => {
                    // Need time to check samconfig.toml file and generate options
                    await quickPick.untilReady()

                    assert.strictEqual(quickPick.items.length, 2)
                    assert.strictEqual(quickPick.items[0].label, 'Specify required parameters and save as defaults')
                    assert.strictEqual(quickPick.items[1].label, 'Specify required parameters')
                    quickPick.acceptItem(quickPick.items[1])
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
                    quickPick.acceptItem(quickPick.items[1])
                })
                .handleQuickPick('Specify S3 bucket for deployment artifacts', (quickPick) => {
                    assert.strictEqual(quickPick.items.length, 2)
                    assert.strictEqual(quickPick.items[0].label, 'Create a SAM CLI managed S3 bucket')
                    assert.strictEqual(quickPick.items[1].label, 'Specify an S3 bucket')
                    quickPick.acceptItem(quickPick.items[0])
                })
                .build()

            const parameters = await (await getDeployWizard(appNode)).run()

            assert(parameters)
            assert.strictEqual(parameters.SourceBucketName, 'my-source-bucket-name')
            assert.strictEqual(parameters.DestinationBucketName, 'my-destination-bucket-name')

            assert.strictEqual(parameters.template.uri.fsPath, templateFile.fsPath)
            assert.strictEqual(parameters.projectRoot.fsPath, projectRoot.fsPath)
            assert.strictEqual(parameters.paramsSource, 1)
            assert.strictEqual(parameters.region, 'us-west-2')
            assert.strictEqual(parameters.stackName, 'stack2')
            assert.strictEqual(parameters.bucketSource, 0)
            assert(!parameters.bucketName)
            prompterTester.assertCallAll()
        })

        it('happy path with valid samconfig.toml', async () => {
            /**
             * Selection:
             *  - SourceBucketName      : [Select]   prefill value
             *  - DestinationBucketName : [Select]   prefill value
             *
             *  - template              : [Skip]     automatically set
             *  - projectRoot           : [Skip]     automatically set
             *  - paramsSource          : [Select]  3. ('Use default values from samconfig')
             *  - region                : [Skip]    null; will use value from samconfig file
             *  - stackName             : [Skip]    null; will use value from samconfig file
             *  - bucketSource          : [Skip]    null; will use value from samconfig file
             *  - bucketName            : [Skip]    automatically set for bucketSource option 1
             */

            // generate samconfig.toml in temporary test folder
            await testFolder.write('samconfig.toml', samconfigCompleteData)

            const prompterTester = PrompterTester.init()
                .handleInputBox('Specify SAM parameter value for SourceBucketName', (inputBox) => {
                    inputBox.acceptValue('my-source-bucket-name')
                })
                .handleInputBox('Specify SAM parameter value for DestinationBucketName', (inputBox) => {
                    inputBox.acceptValue('my-destination-bucket-name')
                })
                .handleQuickPick('Specify parameter source for deploy', async (quickPick) => {
                    // Need time to check samconfig.toml file and generate options
                    await quickPick.untilReady()

                    assert.strictEqual(quickPick.items.length, 3)
                    assert.strictEqual(quickPick.items[0].label, 'Specify required parameters and save as defaults')
                    assert.strictEqual(quickPick.items[1].label, 'Specify required parameters')
                    assert.strictEqual(quickPick.items[2].label, 'Use default values from samconfig')
                    quickPick.acceptItem(quickPick.items[2])
                })
                .build()

            const parameters = await (await getDeployWizard(appNode)).run()

            assert(parameters)
            assert.strictEqual(parameters.SourceBucketName, 'my-source-bucket-name')
            assert.strictEqual(parameters.DestinationBucketName, 'my-destination-bucket-name')

            assert.strictEqual(parameters.template.uri.fsPath, templateFile.fsPath)
            assert.strictEqual(parameters.projectRoot.fsPath, projectRoot.fsPath)
            assert.strictEqual(parameters.paramsSource, 2)
            assert(!parameters.region)
            assert(!parameters.stackName)
            assert(!parameters.bucketSource)
            prompterTester.assertCallAll()
        })
    })

    describe('entry: command palette', () => {
        it('happy path without/invalid samconfig.toml', async () => {
            /**
             * Selection:
             *  - SourceBucketName      : [Skip?]   undefined
             *  - DestinationBucketName : [Skip?]   undefined
             *
             *  - template              : [Select]   template/yaml set
             *  - projectRoot           : [Skip]     automatically set
             *  - paramsSource          : [Select]   2. ('Specify required parameters')
             *  - region                : [Skip]     automatically set from region node 'us-west-2'
             *  - stackName             : [Select]   3. 'stack3'
             *  - bucketSource          : [Select]   2. ('Specify an S3 bucket')
             *  - bucketName            : [Select]   3. 'stack-3-bucket'
             */

            // Create a second project folder to simulate multiple project in 1 workspace
            const testFolder2 = await TestFolder.create()
            const templateFile2 = vscode.Uri.file(await testFolder2.write('template.yaml', validTemplateData))
            await (await globals.templateRegistry).addItem(templateFile2)

            const prompterTester = PrompterTester.init()
                .handleQuickPick('Select a SAM/CloudFormation Template', async (quickPick) => {
                    // Need sometime to wait for the template to search for template file
                    await quickPick.untilReady()
                    assert.strictEqual(quickPick.items.length, 2)
                    assert.strictEqual(quickPick.items[0].label, templateFile.fsPath)
                    quickPick.acceptItem(quickPick.items[0])
                })
                .handleQuickPick('Specify parameter source for deploy', async (quickPick) => {
                    // Need time to check samconfig.toml file and generate options
                    await quickPick.untilReady()
                    assert.strictEqual(quickPick.items.length, 2)
                    assert.strictEqual(quickPick.items[0].label, 'Specify required parameters and save as defaults')
                    assert.strictEqual(quickPick.items[1].label, 'Specify required parameters')
                    quickPick.acceptItem(quickPick.items[1])
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
                    quickPick.acceptItem(quickPick.items[2])
                })
                .handleQuickPick('Specify S3 bucket for deployment artifacts', (quickPick) => {
                    assert.strictEqual(quickPick.items.length, 2)
                    assert.strictEqual(quickPick.items[0].label, 'Create a SAM CLI managed S3 bucket')
                    assert.strictEqual(quickPick.items[1].label, 'Specify an S3 bucket')
                    quickPick.acceptItem(quickPick.items[1])
                })
                .handleQuickPick('Select an S3 Bucket', async (quickPick) => {
                    // The prompt will need some time to generate option
                    await quickPick.untilReady()
                    assert.strictEqual(quickPick.items.length, 3)
                    assert.strictEqual(quickPick.items[0].label, 'stack-1-bucket')
                    assert.strictEqual(quickPick.items[1].label, 'stack-2-bucket')
                    assert.strictEqual(quickPick.items[2].label, 'stack-3-bucket')
                    quickPick.acceptItem(quickPick.items[2])
                })
                .build()

            const parameters = await (await getDeployWizard()).run()
            assert(parameters)

            assert.strictEqual(parameters.template.uri.fsPath, templateFile.fsPath)
            assert.strictEqual(parameters.projectRoot.fsPath, projectRoot.fsPath)
            assert.strictEqual(parameters.paramsSource, 1)
            assert.strictEqual(parameters.region, 'us-west-2')
            assert.strictEqual(parameters.stackName, 'stack3')
            assert.strictEqual(parameters.bucketSource, 1)
            assert.strictEqual(parameters.bucketName, 'stack-3-bucket')
            prompterTester.assertCallAll()
        })

        it('happy path with samconfig.toml', async () => {
            /**
             * Selection:
             *  - SourceBucketName      : [Skip?]   undefined
             *  - DestinationBucketName : [Skip?]   undefined
             *
             *  - template              : [Select]  template.yaml
             *  - projectRoot           : [Skip]    automatically set
             *  - paramsSource          : [Select]  3. ('Use default values from samconfig')
             *  - region                : [Skip]    null; will use value from samconfig file
             *  - stackName             : [Skip]    null; will use value from samconfig file
             *  - bucketSource          : [Skip]    null; will use value from samconfig file
             *  - bucketName            : [Skip]    automatically set for bucketSource option 1
             */

            // Create a second project folder to simulate multiple project in 1 workspace
            const testFolder2 = await TestFolder.create()
            const templateFile2 = vscode.Uri.file(await testFolder2.write('template.yaml', validTemplateData))
            await (await globals.templateRegistry).addItem(templateFile2)

            await testFolder.write('samconfig.toml', samconfigCompleteData)
            // Simulate return of deployed stacks

            const prompterTester = PrompterTester.init()
                .handleQuickPick('Select a SAM/CloudFormation Template', async (quickPick) => {
                    // Need sometime to wait for the template to search for template file
                    await quickPick.untilReady()

                    assert.strictEqual(quickPick.items.length, 2)
                    assert.strictEqual(quickPick.items[0].label, templateFile.fsPath)
                    quickPick.acceptItem(quickPick.items[0])
                })
                .handleQuickPick('Specify parameter source for deploy', async (quickPick) => {
                    // Need time to check samconfig.toml file and generate options
                    await quickPick.untilReady()
                    assert.strictEqual(quickPick.items.length, 3)
                    assert.strictEqual(quickPick.items[0].label, 'Specify required parameters and save as defaults')
                    assert.strictEqual(quickPick.items[1].label, 'Specify required parameters')
                    assert.strictEqual(quickPick.items[2].label, 'Use default values from samconfig')
                    quickPick.acceptItem(quickPick.items[2])
                })
                .build()
            const parameters = await (await getDeployWizard()).run()
            assert(parameters)
            assert.strictEqual(parameters.template.uri.fsPath, templateFile.fsPath)
            assert.strictEqual(parameters.projectRoot.fsPath, projectRoot.fsPath)
            assert.strictEqual(parameters.paramsSource, 2)
            assert(!parameters.region)
            assert(!parameters.stackName)
            assert(!parameters.bucketSource)
            prompterTester.assertCallAll()
        })
    })
})

describe('SAM Deploy', () => {
    let sandbox: sinon.SinonSandbox
    let testFolder: TestFolder
    let projectRoot: vscode.Uri
    let workspaceFolder: vscode.WorkspaceFolder
    let templateFile: vscode.Uri

    let mockDeployParams: DeployParams
    let mockGetSpawnEnv: sinon.SinonStub
    let mockGetSamCliPath: sinon.SinonStub
    let mockRunInTerminal: sinon.SinonStub
    let spyWriteSamconfigGlobal: sinon.SinonSpy

    let appNode: AppNode

    // Dependency clients
    let mockChildProcess: sinon.SinonStub
    beforeEach(async function () {
        testFolder = await TestFolder.create()
        projectRoot = vscode.Uri.file(testFolder.path)
        workspaceFolder = getWorkspaceFolder(testFolder.path)
        sandbox = sinon.createSandbox()

        // Create template.yaml in temporary test folder and add to registery
        templateFile = vscode.Uri.file(await testFolder.write('template.yaml', validTemplateData))
        await (await globals.templateRegistry).addItem(templateFile)

        spyWriteSamconfigGlobal = sandbox.spy(SamConfiModule, 'writeSamconfigGlobal')

        mockGetSpawnEnv = sandbox.stub().resolves({
            AWS_TOOLING_USER_AGENT: 'AWS-Toolkit-For-VSCode/testPluginVersion',
            SAM_CLI_TELEMETRY: '0',
        })
        sandbox.stub(ResolveEnvModule, 'getSpawnEnv').callsFake(mockGetSpawnEnv)

        appNode = new AppNode({
            samTemplateUri: templateFile,
            workspaceFolder: workspaceFolder,
        } as SamAppLocation)
    })

    afterEach(() => {
        sandbox.restore()
    })

    describe(':) path', () => {
        beforeEach(() => {
            mockGetSamCliPath = sandbox.stub().resolves({ path: 'sam-cli-path' })
            sandbox.stub(SamUtilsModule, 'getSamCliPathAndVersion').callsFake(mockGetSamCliPath)

            mockChildProcess = sandbox.stub().resolves({})
            sandbox.stub(ProcessUtilsModule, 'ChildProcess').callsFake(mockChildProcess)

            mockRunInTerminal = sandbox.stub().resolves(Promise.resolve())
            sandbox.stub(ProcessTerminalModule, 'runInTerminal').callsFake(mockRunInTerminal)
        })

        it('[ParamsSource.SamConfig] should instantiate the correct ChildProcess', async () => {
            // Mock result from DeployWizard; the Wizard is already tested separately
            mockDeployParams = {
                paramsSource: ParamsSource.SamConfig,
                SourceBucketName: 'my-source-bucket-name',
                DestinationBucketName: 'my-destination-bucket-name',
                region: undefined,
                stackName: undefined,
                bucketName: undefined,
                template: { uri: templateFile, data: {} } as TemplateItem,
                bucketSource: BucketSource.UserProvided,
                projectRoot: projectRoot,
            } as unknown as DeployParams

            // Create samconfig.toml in temporary test folder
            const samconfigFile = await testFolder.write('samconfig.toml', samconfigCompleteData)

            // Stub the DeployWizard output
            sandbox.stub(DeployWizard.prototype, 'run').resolves(mockDeployParams)

            await runDeploy(appNode)

            // Check that ChildProcess for build and deploy are instantiated correctly
            assert.strictEqual(mockChildProcess.callCount, 2)
            const buildChildProcess = mockChildProcess.getCall(0)
            const deployChildProcess = mockChildProcess.getCall(1)

            assert.deepEqual(buildChildProcess.args, [
                'sam-cli-path',
                ['build', '--cached'],
                {
                    spawnOptions: {
                        cwd: mockDeployParams.projectRoot?.fsPath,
                        env: {
                            AWS_TOOLING_USER_AGENT: 'AWS-Toolkit-For-VSCode/testPluginVersion',
                            SAM_CLI_TELEMETRY: '0',
                        },
                    },
                },
            ])
            assert.deepEqual(deployChildProcess.args, [
                'sam-cli-path',
                [
                    'deploy',
                    '--no-confirm-changeset',
                    '--region',
                    // Expect region information from samconfig.toml
                    'us-west-2',
                    '--config-file',
                    `${samconfigFile}`,
                    '--parameter-overrides',
                    `ParameterKey=SourceBucketName,ParameterValue=${mockDeployParams.SourceBucketName} ` +
                        `ParameterKey=DestinationBucketName,ParameterValue=${mockDeployParams.DestinationBucketName}`,
                ],
                {
                    spawnOptions: {
                        cwd: mockDeployParams.projectRoot?.fsPath,
                        env: {
                            AWS_TOOLING_USER_AGENT: 'AWS-Toolkit-For-VSCode/testPluginVersion',
                            SAM_CLI_TELEMETRY: '0',
                        },
                    },
                },
            ])
            assert(spyWriteSamconfigGlobal.notCalled)
            // Check that runInTerminal is called with the correct arguments for build
            assert.strictEqual(mockRunInTerminal.callCount, 2)
            const buildProcess = mockChildProcess.getCall(0).returnValue
            assert.deepEqual(mockRunInTerminal.getCall(0).args, [buildProcess, 'build'])

            const deployProcess = mockChildProcess.getCall(1).returnValue // Get the instance from the first call
            assert.deepEqual(mockRunInTerminal.getCall(1).args, [deployProcess, 'deploy'])

            assertTelemetry('sam_deploy', { result: 'Succeeded', source: 'appBuilderDeploy' })
        })

        it('[ParamsSource.SamConfig] when trigger from region node should instantiate the correct ChildProcess without region flag', async () => {
            // Mock result from DeployWizard; the Wizard is already tested separately
            mockDeployParams = {
                paramsSource: ParamsSource.SamConfig,
                SourceBucketName: 'my-source-bucket-name',
                DestinationBucketName: 'my-destination-bucket-name',
                // Simulate entry from region node when region ('us-east-1') differ from 'us-west-2' in samconfig.toml
                region: 'us-east-1',
                stackName: undefined,
                bucketName: undefined,
                template: { uri: templateFile, data: {} } as TemplateItem,
                bucketSource: BucketSource.UserProvided,
                projectRoot: projectRoot,
            } as unknown as DeployParams

            // Create samconfig.toml in temporary test folder
            const samconfigFile = await testFolder.write('samconfig.toml', samconfigCompleteData)

            // Stub the DeployWizard output
            sandbox.stub(DeployWizard.prototype, 'run').resolves(mockDeployParams)

            await runDeploy(appNode)

            // Check that ChildProcess for build and deploy are instantiated correctly
            assert.strictEqual(mockChildProcess.callCount, 2)
            const buildChildProcess = mockChildProcess.getCall(0)
            const deployChildProcess = mockChildProcess.getCall(1)

            assert.deepEqual(buildChildProcess.args, [
                'sam-cli-path',
                ['build', '--cached'],
                {
                    spawnOptions: {
                        cwd: mockDeployParams.projectRoot?.fsPath,
                        env: {
                            AWS_TOOLING_USER_AGENT: 'AWS-Toolkit-For-VSCode/testPluginVersion',
                            SAM_CLI_TELEMETRY: '0',
                        },
                    },
                },
            ])
            assert.deepEqual(deployChildProcess.args, [
                'sam-cli-path',
                [
                    'deploy',
                    '--no-confirm-changeset',
                    '--region',
                    `${mockDeployParams.region}`,
                    '--config-file',
                    `${samconfigFile}`,
                    '--parameter-overrides',
                    `ParameterKey=SourceBucketName,ParameterValue=${mockDeployParams.SourceBucketName} ` +
                        `ParameterKey=DestinationBucketName,ParameterValue=${mockDeployParams.DestinationBucketName}`,
                ],
                {
                    spawnOptions: {
                        cwd: mockDeployParams.projectRoot?.fsPath,
                        env: {
                            AWS_TOOLING_USER_AGENT: 'AWS-Toolkit-For-VSCode/testPluginVersion',
                            SAM_CLI_TELEMETRY: '0',
                        },
                    },
                },
            ])
            assert(spyWriteSamconfigGlobal.notCalled)
            // Check that runInTerminal is called with the correct arguments for build
            assert.strictEqual(mockRunInTerminal.callCount, 2)
            const buildProcess = mockChildProcess.getCall(0).returnValue
            assert.deepEqual(mockRunInTerminal.getCall(0).args, [buildProcess, 'build'])

            const deployProcess = mockChildProcess.getCall(1).returnValue // Get the instance from the first call
            assert.deepEqual(mockRunInTerminal.getCall(1).args, [deployProcess, 'deploy'])

            assertTelemetry('sam_deploy', { result: 'Succeeded', source: 'appBuilderDeploy' })
        })

        it('[ParamsSource.SpecifyAndSave] should instantiate the correct ChildProcess for sam build and deploy', async () => {
            // Mock result from DeployWizard; the Wizard is already tested separately
            mockDeployParams = {
                paramsSource: ParamsSource.SpecifyAndSave,
                SourceBucketName: 'my-source-bucket-name',
                DestinationBucketName: 'my-destination-bucket-name',
                region: 'us-east-1',
                stackName: 'stack1',
                bucketName: undefined,
                template: { uri: templateFile, data: {} } as TemplateItem,
                bucketSource: BucketSource.SamCliManaged,
                projectRoot: projectRoot,
            } as unknown as DeployParams

            // Stub the DeployWizard output
            sandbox.stub(DeployWizard.prototype, 'run').resolves(mockDeployParams)

            await runDeploy(appNode)

            // Check that ChildProcess for build and deploy are instantiated correctly
            assert.strictEqual(mockChildProcess.callCount, 2)
            const buildChildProcess = mockChildProcess.getCall(0)
            const deployChildProcess = mockChildProcess.getCall(1)

            assert.deepEqual(buildChildProcess.args, [
                'sam-cli-path',
                ['build', '--cached'],
                {
                    spawnOptions: {
                        cwd: mockDeployParams.projectRoot?.fsPath,
                        env: {
                            AWS_TOOLING_USER_AGENT: 'AWS-Toolkit-For-VSCode/testPluginVersion',
                            SAM_CLI_TELEMETRY: '0',
                        },
                    },
                },
            ])

            assert.deepEqual(deployChildProcess.args, [
                'sam-cli-path',
                [
                    'deploy',
                    '--no-confirm-changeset',
                    '--region',
                    `${mockDeployParams.region}`,
                    '--stack-name',
                    `${mockDeployParams.stackName}`,
                    '--resolve-s3',
                    '--capabilities',
                    'CAPABILITY_IAM',
                    'CAPABILITY_NAMED_IAM',
                    '--save-params',
                    '--parameter-overrides',
                    `ParameterKey=SourceBucketName,ParameterValue=${mockDeployParams.SourceBucketName} ` +
                        `ParameterKey=DestinationBucketName,ParameterValue=${mockDeployParams.DestinationBucketName}`,
                ],
                {
                    spawnOptions: {
                        cwd: mockDeployParams.projectRoot?.fsPath,
                        env: {
                            AWS_TOOLING_USER_AGENT: 'AWS-Toolkit-For-VSCode/testPluginVersion',
                            SAM_CLI_TELEMETRY: '0',
                        },
                    },
                },
            ])

            assert(
                spyWriteSamconfigGlobal.calledOnceWith(projectRoot, mockDeployParams.stackName, mockDeployParams.region)
            )

            // Check that runInTerminal is called with the correct arguments for build
            assert.strictEqual(mockRunInTerminal.callCount, 2)
            const buildProcess = mockChildProcess.getCall(0).returnValue
            assert.deepEqual(mockRunInTerminal.getCall(0).args, [buildProcess, 'build'])

            const deployProcess = mockChildProcess.getCall(1).returnValue // Get the instance from the first call
            assert.deepEqual(mockRunInTerminal.getCall(1).args, [deployProcess, 'deploy'])

            assertTelemetry('sam_deploy', { result: 'Succeeded', source: 'appBuilderDeploy' })
        })
    })

    describe(':( path', () => {
        let mockDeployParams: DeployParams
        beforeEach(async () => {
            mockDeployParams = {
                paramsSource: ParamsSource.SpecifyAndSave,
                SourceBucketName: 'my-source-bucket-name',
                DestinationBucketName: 'my-destination-bucket-name',
                region: 'us-east-1',
                stackName: 'stack1',
                bucketName: undefined,
                template: { uri: templateFile, data: {} } as TemplateItem,
                bucketSource: BucketSource.SamCliManaged,
                projectRoot: projectRoot,
            } as unknown as DeployParams
        })

        it('should gracefully shut down when cancel by user', async () => {
            try {
                // Breaking point
                sandbox.stub(DeployWizard.prototype, 'run').resolves(undefined as unknown as DeployParams)

                await runDeploy(appNode)
                assert.fail('Should have thrown an CancellationError')
            } catch (err) {
                assert(spyWriteSamconfigGlobal.notCalled)
                assert(err instanceof CancellationError)
            }
        })

        it('should throw error given issue with sam cli prerequisite version', async () => {
            try {
                // Expect to be called
                sandbox.stub(DeployWizard.prototype, 'run').resolves(mockDeployParams)

                // Break point
                mockGetSamCliPath = sandbox
                    .stub(SamUtilsModule, 'getSamCliPathAndVersion')
                    .rejects(
                        new ToolkitError('SAM CLI version 1.53.0 or higher is required', { code: 'VersionTooLow' })
                    )

                // Not expect to be called
                mockChildProcess = sandbox.stub().resolves({})
                sandbox.stub(ProcessUtilsModule, 'ChildProcess').callsFake(mockChildProcess)
                mockRunInTerminal = sandbox.stub().resolves(Promise.resolve())
                sandbox.stub(ProcessTerminalModule, 'runInTerminal').callsFake(mockRunInTerminal)

                await runDeploy(appNode)
                assert.fail('Should have thrown an Error')
            } catch (err) {
                assert(err instanceof ToolkitError)
                assert(mockGetSamCliPath.calledOnce)
                assert(mockChildProcess.notCalled)
                assert(mockRunInTerminal.notCalled)
                assert(spyWriteSamconfigGlobal.notCalled)
                assert.strictEqual(err.message, 'Failed to deploy SAM template')
            }
        })

        it('should throw error given issue with building template', async () => {
            try {
                // Happy Stub
                sandbox.stub(DeployWizard.prototype, 'run').resolves(mockDeployParams)
                mockGetSamCliPath = sandbox.stub().resolves({ path: 'sam-cli-path' })
                sandbox.stub(SamUtilsModule, 'getSamCliPathAndVersion').callsFake(mockGetSamCliPath)
                mockChildProcess = sandbox.stub().resolves({})
                sandbox.stub(ProcessUtilsModule, 'ChildProcess').callsFake(mockChildProcess)

                // Breaking point
                mockRunInTerminal = sandbox
                    .stub(ProcessTerminalModule, 'runInTerminal')
                    .rejects(new ToolkitError('SAM CLI was cancelled before exiting', { cancelled: true }))

                await runDeploy(appNode)
                assert.fail('Should have thrown an Error')
            } catch (err) {
                assert(err instanceof ToolkitError)
                assert(mockGetSamCliPath.calledOnce)
                assert(mockChildProcess.calledOnce)
                assert(mockRunInTerminal.calledOnce)
                assert(spyWriteSamconfigGlobal.notCalled)
                assert.strictEqual(err.message, 'Failed to deploy SAM template')
            }
        })

        it('should throw error and write to samconfig.toml given no update when deploying template', async () => {
            try {
                // Happy Stub
                sandbox.stub(DeployWizard.prototype, 'run').resolves(mockDeployParams)
                mockGetSamCliPath = sandbox.stub().resolves({ path: 'sam-cli-path' })
                sandbox.stub(SamUtilsModule, 'getSamCliPathAndVersion').callsFake(mockGetSamCliPath)
                mockChildProcess = sandbox.stub().resolves({})
                sandbox.stub(ProcessUtilsModule, 'ChildProcess').callsFake(mockChildProcess)

                // Breaking point
                mockRunInTerminal = sandbox.stub(ProcessTerminalModule, 'runInTerminal').callsFake((input, cmd) => {
                    if (cmd === 'deploy') {
                        throw new ToolkitError('The stack is up to date', {
                            code: 'NoUpdateExitCode',
                        })
                    }
                    return Promise.resolve()
                })

                await runDeploy(appNode)
                assert.fail('Should have thrown an Error')
            } catch (err) {
                assert(err instanceof ToolkitError)
                assert(mockGetSamCliPath.calledOnce)
                assert(mockChildProcess.calledTwice)
                assert(mockRunInTerminal.calledTwice)
                assert(spyWriteSamconfigGlobal.calledOnce)
                assert.strictEqual(err.message, 'Failed to deploy SAM template')
            }
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
