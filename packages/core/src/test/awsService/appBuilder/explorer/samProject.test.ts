/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { getApp, getStackName, SamAppLocation } from '../../../../awsService/appBuilder/explorer/samProject'
import * as sinon from 'sinon'
import assert from 'assert'
import { ToolkitError } from '../../../../shared'
import * as CloudformationModule from '../../../../shared/cloudformation/cloudformation'
import path from 'path'
import { TestFolder } from '../../../testUtil'

import {
    generateSamconfigData,
    samconfigCompleteData,
    samconfigInvalidData,
    validTemplateData,
} from '../../../shared/sam/samTestUtils'
import { assertLogsContain } from '../../../globalSetup.test'
import { getTestWindow } from '../../../shared/vscode/window'

describe('samProject', () => {
    let sandbox: sinon.SinonSandbox
    let testFolder: TestFolder
    let projectRoot: vscode.Uri

    beforeEach(async () => {
        testFolder = await TestFolder.create()
        projectRoot = vscode.Uri.file(testFolder.path)
        sandbox = sinon.createSandbox()
    })

    afterEach(() => {
        sandbox.restore()
    })

    describe('getStackName', () => {
        it('returns stack name and region happy path', async () => {
            // generate samconfig.toml in temporary test folder
            await testFolder.write('samconfig.toml', samconfigCompleteData)

            const expectedStackName = 'project-1'
            const expectedRegion = 'us-west-2'

            const { stackName, region } = await getStackName(projectRoot)
            assert.strictEqual(stackName, expectedStackName)
            assert.strictEqual(region, expectedRegion)
        })

        it('returns undefined give no stack name or region in samconfig file', async () => {
            await testFolder.write(
                'samconfig.toml',
                generateSamconfigData({
                    deploy: [{ key: 'confirm_changeset', value: 'false' }],
                    build: [
                        { key: 'cached', value: 'true' },
                        { key: 'parallel', value: 'true' },
                    ],
                })
            )
            const { stackName, region } = await getStackName(projectRoot)
            assert.equal(stackName, undefined)
            assert.equal(region, undefined)
        })

        it('returns {} when (unlikely) given an undefined project root uri', async () => {
            const wrapperCall = async (projectRootUri: any) => {
                return await getStackName(projectRootUri)
            }

            const result = await wrapperCall(undefined)
            assert.deepStrictEqual(result, {})
            assertLogsContain('Error getting stack name or region information: No project folder found', false, 'warn')
        })

        it('returns empty object give no samconfig file found', async () => {
            // simulate error when no samconfig.toml file in directory
            const result = await getStackName(projectRoot)
            assert.deepStrictEqual(result, {})
            assertLogsContain('No stack name or region information available in samconfig.toml', false, 'info')
        })

        it('returns empty object give error parsing samconfig file', async () => {
            // simulate error when parsinf samconfig.toml: missing quote or empty value
            await testFolder.write('samconfig.toml', samconfigInvalidData)

            const result = await getStackName(projectRoot)
            assert.deepStrictEqual(result, {})

            assertLogsContain('Error getting stack name or region information:', false, 'error')
            getTestWindow().getFirstMessage().assertError('Encountered an issue reading samconfig.toml')
        })
    })

    describe('getApp', () => {
        let cloudformationTryLoadSpy: sinon.SinonSpy
        let mockSamAppLocation: SamAppLocation

        beforeEach(async () => {
            // create mock SamConfig instance
            cloudformationTryLoadSpy = sandbox.spy(CloudformationModule, 'tryLoad')
            mockSamAppLocation = {
                samTemplateUri: vscode.Uri.file(path.join(projectRoot.fsPath, 'template.yaml')),
                workspaceFolder: {
                    uri: vscode.Uri.file(projectRoot.fsPath),
                    name: 'test-workspace-folder',
                    index: 0,
                },
                projectRoot: projectRoot,
            }
        })

        it('returns correct location and resource in happy path', async () => {
            // Set up a valid template in test folder
            await testFolder.write('template.yaml', validTemplateData)
            // simulate successful loading template
            const { location, resourceTree } = await getApp(mockSamAppLocation)
            assert.deepStrictEqual(location, mockSamAppLocation)
            assert.strictEqual(resourceTree.length, 2)
            assert(cloudformationTryLoadSpy.calledOnce)
            // Expect one lambda node and one s3 bucket node
            const lambdaResourceNode = resourceTree.find((node) => node.Type === 'AWS::Serverless::Function')
            const s3BucketResourceNode = resourceTree.find((node) => node.Type === 'AWS::S3::Bucket')
            assert(lambdaResourceNode)
            assert(s3BucketResourceNode)
            // validate Lambda node
            assert.strictEqual(lambdaResourceNode.Handler, 'app.lambda_handler')
            assert.strictEqual(lambdaResourceNode.Id, 'ResizerFunction')
            assert.strictEqual(lambdaResourceNode.Runtime, 'python3.12')
            assert(lambdaResourceNode.Events && lambdaResourceNode.Events.length === 1)
            assert.deepStrictEqual(lambdaResourceNode.Events[0], {
                Id: 'FileUpload',
                Type: 'S3',
                Path: undefined,
                Method: undefined,
            })
            // validate S3 Bucket
            assert.strictEqual(s3BucketResourceNode.Id, 'SourceBucket')
            assert(!s3BucketResourceNode.Events)
            assert(!s3BucketResourceNode.Handler)
            assert(!s3BucketResourceNode.Method)
            assert(!s3BucketResourceNode.Runtime)
        })

        it('throws ToolkitError when fails to load Cloudformation template values', async () => {
            // simulate unsuccessful CFN loading template when there is no template.
            await assert.rejects(
                () => getApp(mockSamAppLocation),
                new ToolkitError(`Template at ${mockSamAppLocation.samTemplateUri.fsPath} is not valid`)
            )
            // try {
            //     await getApp(mockSamAppLocation)
            //     assert.fail('Test should not reach here. Expect ToolkitError thrown')
            // } catch (error) {
            //     assert(cloudformationTryLoadSpy.calledOnce)
            //     assert(error instanceof ToolkitError)
            //     assert.strictEqual(
            //         error.message,
            //         `Template at ${mockSamAppLocation.samTemplateUri.fsPath} is not valid`
            //     )
            // }
        })
    })
})
