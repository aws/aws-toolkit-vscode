/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { OutputChannel } from 'vscode'
import { deleteLambda } from '../../../lambda/commands/deleteLambda'
import { ext } from '../../../shared/extensionGlobals'
import {
    MockLambdaClient,
    MockToolkitClientBuilder
} from '../../shared/clients/mockClients'
import {
    MockStandaloneFunctionGroupNode,
    MockStandaloneFunctionNode
} from '../explorer/mockStandaloneNodes'

describe('deleteLambda', async () => {
    it('no-ops if function name is not provided', async () => {
        ext.toolkitClientBuilder = new MockToolkitClientBuilder(
            undefined,
            new MockLambdaClient(
                undefined,
                name => assert.fail()
            )
        )

        const parent = new MockStandaloneFunctionGroupNode(
            undefined,
            undefined,
            async () => assert.fail(),
            async () => assert.fail()
        )

        const node = new MockStandaloneFunctionNode(
            undefined,
            parent,
            {},
            async () => assert.fail(),
            async configuration => assert.fail()
        )

        await deleteLambda(node, () => assert.fail())
    })

    it('deletes the function with the specified name', async () => {
        let invokeCount = 0
        ext.toolkitClientBuilder = new MockToolkitClientBuilder(
            undefined,
            new MockLambdaClient(
                undefined,
                async name => {
                    assert.strictEqual(name, 'myFunctionName')
                    invokeCount++
                }
            )
        )

        const parent = new MockStandaloneFunctionGroupNode(
            undefined,
            undefined,
            async () => assert.fail(),
            async () => assert.fail()
        )

        const node = new MockStandaloneFunctionNode(
            undefined,
            parent,
            {
                FunctionName: 'myFunctionName'
            },
            async () => assert.fail(),
            async configuration => assert.fail()
        )

        await deleteLambda(node, () => {})

        assert.strictEqual(invokeCount, 1)
    })

    it('handles errors gracefully', async () => {
        let deleteCount = 0
        ext.toolkitClientBuilder = new MockToolkitClientBuilder(
            undefined,
            new MockLambdaClient(
                undefined,
                async name => {
                    deleteCount++
                    throw new Error()
                }
            )
        )

        ext.lambdaOutputChannel = {
            show(preserveFocus?: boolean | undefined): void { },
            appendLine(value: string): void { }
        } as any as OutputChannel

        const parent = new MockStandaloneFunctionGroupNode(
            undefined,
            undefined,
            async () => assert.fail(),
            async () => assert.fail()
        )

        const node = new MockStandaloneFunctionNode(
            undefined,
            parent,
            {
                FunctionArn: 'myFunctionArn',
                FunctionName: 'myFunctionName'
            },
            async () => assert.fail(),
            async configuration => assert.fail()
        )

        let refreshCount = 0
        await deleteLambda(node, () => refreshCount++)

        assert.strictEqual(deleteCount, 1)
        assert.strictEqual(refreshCount, 1)
    })

    it('refreshes after delete', async () => {
        let deleteCount = 0
        ext.toolkitClientBuilder = new MockToolkitClientBuilder(
            undefined,
            new MockLambdaClient(
                undefined,
                async name => {
                    deleteCount++
                }
            )
        )

        const parent = new MockStandaloneFunctionGroupNode(
            undefined,
            undefined,
            async () => assert.fail(),
            async () => assert.fail()
        )

        const node = new MockStandaloneFunctionNode(
            undefined,
            parent,
            {
                FunctionArn: 'myFunctionArn',
                FunctionName: 'myFunctionName'
            },
            async () => assert.fail(),
            async configuration => assert.fail()
        )

        let refreshCount = 0
        await deleteLambda(node, () => refreshCount++)

        assert.strictEqual(deleteCount, 1)
        assert.strictEqual(refreshCount, 1)
    })
})
