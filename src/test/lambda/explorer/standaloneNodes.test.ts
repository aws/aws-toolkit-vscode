/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { Lambda } from 'aws-sdk'
import * as os from 'os'
import { TreeItem, Uri } from 'vscode'
import { DefaultRegionNode } from '../../../lambda/explorer/defaultRegionNode'
import { ErrorNode } from '../../../lambda/explorer/errorNode'
import {
    DefaultStandaloneFunctionGroupNode,
    DefaultStandaloneFunctionNode,
    StandaloneFunctionNode
} from '../../../lambda/explorer/standaloneNodes'
import { CloudFormationClient } from '../../../shared/clients/cloudFormationClient'
import { LambdaClient } from '../../../shared/clients/lambdaClient'
import { StsClient } from '../../../shared/clients/stsClient'
import { ext } from '../../../shared/extensionGlobals'
import { TestLogger } from '../../../shared/loggerUtils'
import { RegionInfo } from '../../../shared/regions/regionInfo'
import { MockLambdaClient } from '../../shared/clients/mockClients'

// TODO : Consolidate all asyncGenerator calls into a shared utility method
async function* asyncGenerator<T>(items: T[]): AsyncIterableIterator<T> {
    yield* items
}

describe('DefaultStandaloneFunctionNode', () => {

    let fakeFunctionConfig: Lambda.FunctionConfiguration
    const fakeIconPathPrefix: string = 'DefaultStandaloneFunctionNode'
    let logger: TestLogger

    before(async () => {
        logger = await TestLogger.createTestLogger()
        fakeFunctionConfig = {
            FunctionName: 'testFunctionName',
            FunctionArn: 'testFunctionARN'
        }
    })

    after(async () => {
        await logger.cleanupLogger()
    })

    // Validates we tagged the node correctly
    it('initializes name and tooltip', async () => {
        const testNode = generateTestNode()

        assert.strictEqual(testNode.label, fakeFunctionConfig.FunctionName)
        assert.strictEqual(
            testNode.tooltip,
            `${fakeFunctionConfig.FunctionName}${os.EOL}${fakeFunctionConfig.FunctionArn}`
        )
    })

    it('initializes icon', async () => {
        const testNode = generateTestNode()

        validateIconPath(testNode)
    })

    // Validates we don't yield some unexpected value that our command triggers
    // don't recognize
    it('returns expected context value', async () => {
        const testNode = generateTestNode()

        assert.strictEqual(testNode.contextValue, 'awsRegionFunctionNode')
    })

    // Validates function nodes are leaves
    it('has no children', async () => {
        const testNode = generateTestNode()

        const childNodes = await testNode.getChildren()
        assert(childNodes !== undefined)
        assert.strictEqual(childNodes.length, 0)
    })

    function validateIconPath(
        node: TreeItem
    ) {
        const fileScheme: string = 'file'
        const expectedPrefix = `/${fakeIconPathPrefix}/`

        assert(node.iconPath !== undefined)
        const iconPath = node.iconPath! as {
            light: Uri,
            dark: Uri
        }

        assert(iconPath.light !== undefined)
        assert(iconPath.light instanceof Uri)
        assert.strictEqual(iconPath.light.scheme, fileScheme)
        const lightResourcePath: string = iconPath.light.path
        assert(
            lightResourcePath.indexOf(expectedPrefix) >= 0,
            `expected light resource path ${lightResourcePath} to contain ${expectedPrefix}`
        )
        assert(
            lightResourcePath.indexOf('/light/') >= 0,
            `expected light resource path ${lightResourcePath} to contain '/light/'`
        )

        assert(iconPath.dark !== undefined)
        assert(iconPath.dark instanceof Uri)
        assert.strictEqual(iconPath.dark.scheme, fileScheme)
        const darkResourcePath: string = iconPath.dark.path
        assert(
            darkResourcePath.indexOf(expectedPrefix) >= 0,
            `expected dark resource path ${darkResourcePath} to contain ${expectedPrefix}`
        )
        assert(
            darkResourcePath.indexOf('/dark/') >= 0,
            `expected light resource path ${darkResourcePath} to contain '/dark/'`
        )
    }

    function generateTestNode(): DefaultStandaloneFunctionNode {
        return new DefaultStandaloneFunctionNode(
            new DefaultStandaloneFunctionGroupNode(
                new DefaultRegionNode(new RegionInfo('code', 'name'), iconPathMaker),
                iconPathMaker
            ),
            fakeFunctionConfig,
            iconPathMaker
        )
    }

    function iconPathMaker(relativePath: string): string {
        return `${fakeIconPathPrefix}/${relativePath}`
    }
})

describe('DefaultStandaloneFunctionGroupNode', () => {

    let logger: TestLogger

    before(async () => {
        logger = await TestLogger.createTestLogger()
    })

    after(async () => {
        await logger.cleanupLogger()
    })

    const stubPathResolver = (path: string): string => path
    const unusedPathResolver = () => { throw new Error('path resolver unused') }

    class FunctionNamesMockLambdaClient extends MockLambdaClient {
        public constructor(
            public readonly functionNames: string[] = [],
            listFunctions: () => AsyncIterableIterator<Lambda.FunctionConfiguration> =
                () => asyncGenerator<Lambda.FunctionConfiguration>(
                    functionNames.map<Lambda.FunctionConfiguration>(name => {
                        return {
                            FunctionName: name
                        }
                    })
                ),
        ) {
            super({
                listFunctions
            })
        }
    }

    class ThrowErrorDefaultStandaloneFunctionGroupNode extends DefaultStandaloneFunctionGroupNode {
        public constructor(
            public readonly parent: DefaultRegionNode
        ) {
            super(parent, unusedPathResolver)
        }

        public async updateChildren(): Promise<void> {
            throw new Error('Hello there!')
        }
    }

    it('Sorts Lambda Function Nodes', async () => {
        const inputFunctionNames: string[] = [
            'zebra',
            'Antelope',
            'aardvark',
            'elephant'
        ]

        ext.toolkitClientBuilder = {
            createCloudFormationClient(regionCode: string): CloudFormationClient {
                throw new Error('cloudformation client unused')
            },

            createLambdaClient(regionCode: string): LambdaClient {
                return new FunctionNamesMockLambdaClient(inputFunctionNames)
            },

            createStsClient(regionCode: string): StsClient {
                throw new Error('sts client unused')
            }
        }

        const functionGroupNode = new DefaultStandaloneFunctionGroupNode(
            new DefaultRegionNode(new RegionInfo('code', 'name'), stubPathResolver),
            stubPathResolver
        )

        const children = await functionGroupNode.getChildren()

        assert.ok(children, 'Expected to get Lambda function nodes as children')
        assert.strictEqual(
            inputFunctionNames.length,
            children.length,
            `Expected ${inputFunctionNames.length} Function children, got ${children.length}`
        )

        function assertChildNodeFunctionName(
            actualChildNode: StandaloneFunctionNode | ErrorNode,
            expectedNodeText: string) {

            assert.strictEqual(
                'functionName' in actualChildNode,
                true,
                'Child node expected to contain functionName property'
            )

            const node: DefaultStandaloneFunctionNode = actualChildNode as DefaultStandaloneFunctionNode
            assert.strictEqual(
                node.functionName,
                expectedNodeText,
                `Expected child node to have function name ${expectedNodeText} but got ${node.functionName}`
            )
        }

        assertChildNodeFunctionName(children[0], 'aardvark')
        assertChildNodeFunctionName(children[1], 'Antelope')
        assertChildNodeFunctionName(children[2], 'elephant')
        assertChildNodeFunctionName(children[3], 'zebra')
    })

    it('handles error', async () => {
        const testNode = new ThrowErrorDefaultStandaloneFunctionGroupNode(
            new DefaultRegionNode(new RegionInfo('code', 'name'), unusedPathResolver)
        )

        const childNodes = await testNode.getChildren()
        assert(childNodes !== undefined)
        assert.strictEqual(childNodes.length, 1)
        assert.strictEqual(childNodes[0] instanceof ErrorNode, true)
    })
})
