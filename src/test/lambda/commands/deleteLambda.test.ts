/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { deleteLambda } from '../../../lambda/commands/deleteLambda'
import { MockOutputChannel } from '../../mockOutputChannel'
import { MockLambdaClient } from '../../shared/clients/mockClients'

describe('deleteLambda', async () => {
    it('should do nothing if function name is not provided', async () => {
        await assertLambdaDeleteWorksWhen({
            // test variables
            functionName: '',
            onConfirm: async () => assert.fail('should not try to confirm w/o function name'),

            // expected results
            expectedDeleteCallCount: 0,
            expectedRefreshCallCount: 0,
        })
    })

    it('should delete lambda when confirmed', async () => {
        await assertLambdaDeleteWorksWhen({
            // test variables
            functionName: 'myFunctionName',
            onConfirm: async () => true,

            // expected results
            expectedDeleteCallCount: 1,
            expectedRefreshCallCount: 1,
        })
    })

    it('should not delete lambda when cancelled', async () => {
        await assertLambdaDeleteWorksWhen({
            // test variables
            functionName: 'myFunctionName',
            onConfirm: async () => false,

            // expected results
            expectedDeleteCallCount: 0,
            expectedRefreshCallCount: 0,
        })
    })

    it('should handles errors gracefully', async () => {
        const errorToThrowDuringDelete = new SyntaxError('Fake error inserted to test error handling')

        await assertLambdaDeleteWorksWhen({
            // test variables
            errorToThrowDuringDelete,
            functionName: 'myFunctionName',
            onConfirm: async () => true,

            // expected results
            expectedDeleteCallCount: 1,
            expectedRefreshCallCount: 1,
            onAssertOutputChannel(outputChannel: MockOutputChannel) {
                const expectedMessagePart = String(errorToThrowDuringDelete)
                assert(outputChannel.isShown, 'output channel should be shown after error')
                assert(
                    outputChannel.value && outputChannel.value.indexOf(expectedMessagePart) > 0,
                    `output channel should contain "${expectedMessagePart}"`
                )
            },
        })
    })

    const assertLambdaDeleteWorksWhen = async ({
        onAssertOutputChannel = (channel: MockOutputChannel) => {
            // Defaults to expecting no output. Should verify output when expected.
            assert.strictEqual(channel.value, '', 'expect no output since output testing was omitted')
        },
        ...params
    }: {
        functionName: string
        errorToThrowDuringDelete?: Error
        expectedDeleteCallCount: number
        expectedRefreshCallCount: number
        onConfirm(): Promise<boolean>
        onAssertOutputChannel?(actualOutputChannel: MockOutputChannel): void
    }) => {
        let deleteCallCount = 0
        let refreshCallCount = 0
        const lambdaClient = new MockLambdaClient({
            deleteFunction: async name => {
                deleteCallCount += 1
                assert.strictEqual(
                    name,
                    params.functionName,
                    `expected lambda name "${params.functionName}", not "${name}"`
                )
                if (params.errorToThrowDuringDelete) {
                    throw params.errorToThrowDuringDelete
                }
            },
        })
        const outputChannel = new MockOutputChannel()

        try {
            await deleteLambda({
                deleteParams: { functionName: params.functionName },
                lambdaClient,
                outputChannel,
                onRefresh: () => (refreshCallCount += 1),
                onConfirm: async () => params.onConfirm(),
            })
        } catch (err) {
            const error = err as Error
            if (params.errorToThrowDuringDelete) {
                assert.deepStrictEqual(params.errorToThrowDuringDelete, err)
            } else {
                console.error(error)
                assert.fail(`Unexpected error during test: "${error.message}"`)
            }
        }

        assert(
            deleteCallCount === params.expectedDeleteCallCount,
            `delete should be called ${params.expectedDeleteCallCount} times, not ${deleteCallCount}`
        )

        assert(
            refreshCallCount === params.expectedRefreshCallCount,
            `refresh should be called ${params.expectedRefreshCallCount} times, not ${refreshCallCount}`
        )

        onAssertOutputChannel.bind({}) // Make linter happy
        onAssertOutputChannel(outputChannel)
    }
})
