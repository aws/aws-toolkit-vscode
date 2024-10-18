/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import assert from 'assert'
import sinon from 'sinon'
import { getProjectRootUri, getProjectRoot, getSource, isDotnetRuntime } from '../../../shared/sam/utils'
import { TemplateItem } from '../../../shared/sam/sync'
import { RegionNode } from '../../../awsexplorer/regionNode'
import { Region } from '../../../shared/regions/endpoints'
import { RegionProvider } from '../../../shared'
import { DeployedResource, DeployedResourceNode } from '../../../awsService/appBuilder/explorer/nodes/deployedNode'
import * as CloudFormation from '../../../shared/cloudformation/cloudformation'

describe('SAM utils', async function () {
    it('returns the projectRoot', async function () {
        const templateItem: TemplateItem = {
            uri: vscode.Uri.file('file://mock/path/project/file'),
            data: {},
        }
        const response = getProjectRoot(templateItem)
        assert.deepStrictEqual(response, vscode.Uri.file('file://mock/path/project'))
    })
    it('returns the projectRootUri', async function () {
        const template: vscode.Uri = vscode.Uri.file('file://mock/path/project/uri')
        const response = getProjectRootUri(template)
        assert.deepStrictEqual(response, vscode.Uri.file('file://mock/path/project'))
    })
    describe('getSource', async function () {
        const testScenarios = [
            {
                name: 'vscode.Uri',
                value: vscode.Uri.file('file://file'),
                expected: 'template',
            },
            {
                name: 'AWSTreeNode',
                value: new RegionNode({ name: 'us-east-1', id: 'IAD' } as Region, {} as RegionProvider),
                expected: 'regionNode',
            },
            {
                name: 'TreeNode',
                value: new DeployedResourceNode({ arn: 'aws:arn:...', contextValue: '' } as DeployedResource),
                expected: 'appBuilderDeploy',
            },
            {
                name: 'undefined',
                value: undefined,
                expected: undefined,
            },
        ]
        testScenarios.forEach((scenario) => {
            it(`returns Source for ${scenario.name}`, async () => {
                assert.strictEqual(getSource(scenario.value), scenario.expected)
            })
        })
    })

    describe('checks if it is DotNet', async function () {
        let sandbox: sinon.SinonSandbox
        const testScenarios = [
            {
                name: 'DotNet function',
                template: { Resources: [{ Type: 'AWS::Serverless::Function', Properties: { Runtime: 'dotnet8' } }] },
                expected: true,
            },
            {
                name: 'Global DotNet property',
                template: {
                    Globals: { Function: { Runtime: 'dotnet8' } },
                    Resources: [{ Type: 'AWS::Serverless::Function', Properties: {} }],
                },
                expected: true,
            },
            {
                name: 'different runtime',
                template: { Resources: [{ Type: 'AWS::Serverless::Function', Properties: { Runtime: 'nodejs20.x' } }] },
                expected: false,
            },
            {
                name: 'two functions, one DotNet',
                template: {
                    Resources: [
                        { Type: 'AWS::Serverless::Function', Properties: { Runtime: 'nodejs20.x' } },
                        { Type: 'AWS::Serverless::Function', Properties: { Runtime: 'dotnet8' } },
                    ],
                },
                expected: true,
            },
            {
                name: 'no function',
                template: { Resources: [{ Type: 'AWS::S3::Bucket', Properties: { Runtime: 'nodejs20.x' } }] },
                expected: false,
            },
            {
                name: 'no resources',
                template: {},
                expected: false,
            },
        ]

        beforeEach(() => {
            sandbox = sinon.createSandbox()
        })
        afterEach(() => {
            sandbox.restore()
        })

        testScenarios.forEach((scenario) => {
            it(`returns isDotNetRuntime for ${scenario.name}`, async () => {
                const tryLoadStub = sandbox.stub(CloudFormation, 'tryLoad')
                tryLoadStub.resolves({ template: scenario.template as any, kind: 'sam' })
                const templateFile = vscode.Uri.file('file://file') // File doesn't matter, because we're mocking the call where it's being used
                assert.strictEqual(await isDotnetRuntime(templateFile), scenario.expected)
                assert(tryLoadStub.calledWith(templateFile))
            })
        })
    })
})
