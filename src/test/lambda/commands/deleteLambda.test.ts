/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { deleteLambda } from '../../../lambda/commands/deleteLambda'
import { MockOutputChannel } from '../../mockOutputChannel'
import { MockLambdaClient } from '../../shared/clients/mockClients'
import {
    MockStandaloneFunctionGroupNode,
    MockStandaloneFunctionNode
} from '../explorer/mockStandaloneNodes'

describe('deleteLambda', async () => {
    it('no-ops if function name is not provided', async () => {
        const lambdaClient = new MockLambdaClient(
            undefined,
            name => assert.fail()
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

        await deleteLambda({
            node,
            lambdaClient,
            outputChannel: new MockOutputChannel(),
            onRefresh: () => assert.fail(),
            onConfirm: async () => {
                assert.fail()

                return false
            }
        })
    })

    const assertLambdaDeleteWorks = async (confirmationResponse: boolean) => {
        let deleteCount = 0
        let refreshCount = 0
        const lambdaClient = new MockLambdaClient(
            undefined,
            async (name) => {
              deleteCount++
              assert.strictEqual(
                  name,
                  'myFunctionName',
                  `Expected lambda name "myFunctionName", not "${name}"`
              )
            }
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

        await deleteLambda({
             node,
             lambdaClient,
             outputChannel: new MockOutputChannel(),
             onRefresh: () => refreshCount++,
             onConfirm: async () => confirmationResponse
        })

        const expectedDeleteCount = confirmationResponse ? 1 : 0
        assert.strictEqual(
            deleteCount,
            expectedDeleteCount,
            `Expected delete count ${expectedDeleteCount}, actual count ${deleteCount}`
        )

        const expectedRefreshCount = 1
        assert.strictEqual(
            refreshCount,
            expectedRefreshCount,
            `Expected refresh count ${expectedRefreshCount}, actual count ${refreshCount}`
        )
    }

    it('deletes lambda with the specified name when confirmed', async () => {
        return assertLambdaDeleteWorks(true)
    })

    it('does not delete lambda with the specified name when cancelled', async () => {
        return assertLambdaDeleteWorks(false)
    })

    it('handles errors gracefully', async () => {
        let deleteCount = 0
        const expectedError = new Error('This error is expected')
        const lambdaClient = new MockLambdaClient(
            undefined,
            async name => {
                deleteCount++
                throw expectedError
            }
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

        const outputChannel = new MockOutputChannel()
        outputChannel.hide()

        let refreshCount = 0
        await deleteLambda({
           node,
           lambdaClient,
           outputChannel: outputChannel,
           onRefresh: () => refreshCount++,
           onConfirm: async () => true
        })

        assert.strictEqual(deleteCount, 1)
        assert.strictEqual(refreshCount, 1)

        assert.strictEqual(outputChannel.isHidden, false)
        assert.strictEqual(
            outputChannel.value && outputChannel.value.indexOf(String(expectedError)) > 0,
            true
        )
    })

    it('refreshes after delete', async () => {
        let deleteCount = 0
        const lambdaClient = new MockLambdaClient(
            undefined,
            async name => {
                deleteCount++
            }
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

        await deleteLambda({
            node,
            lambdaClient,
            outputChannel: new MockOutputChannel(),
            onRefresh: () => refreshCount++,
            onConfirm: async () => true
        })

        assert.strictEqual(deleteCount, 1)
        assert.strictEqual(refreshCount, 1)
    })
})
