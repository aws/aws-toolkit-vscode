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

    it('should do nothing if function name is not provided', async () => {
        return assertLambdaDeleteWorksWhen({
            // test variables
            functionName: '',
            onConfirm: async () => assert.fail('should not try to confirm w/o function name'),

            // expected results
            expectDeleteIsCalled: false,
            expectRefreshIsCalled: false
        })
    })

    it('should delete lambda when confirmed', async () => {
        return assertLambdaDeleteWorksWhen({
            // test variables
            functionName: 'myFunctionName',
            onConfirm: async () => true,

            // expected results
            expectDeleteIsCalled: true,
            expectRefreshIsCalled: true
        })
    })

    it('should not delete lambda when cancelled', async () => {
        return assertLambdaDeleteWorksWhen({
            // test variables
            functionName: 'myFunctionName',
            onConfirm: async () => false,

            // expected results
            expectDeleteIsCalled: false,
            expectRefreshIsCalled: false
        })
    })

    it('should handles errors gracefully', async () => {
        const errorToThrowDuringDelete = new SyntaxError('Fake error inserted to test error handling')

        return assertLambdaDeleteWorksWhen({
            // test variables
            errorToThrowDuringDelete,
            functionName: 'myFunctionName',
            onConfirm: async () => true,

            // expected results
            expectDeleteIsCalled: true,
            expectRefreshIsCalled: true,
            onAssertOutputChannel(outputChannel: MockOutputChannel) {
                const expectedMessagePart = String(errorToThrowDuringDelete)
                assert(!outputChannel.isHidden, 'output channel should not be hidden after error')
                assert(
                  outputChannel.value && outputChannel.value.indexOf(expectedMessagePart) > 0,
                  `output channel should contain "${expectedMessagePart}"`
                )
            }
        })
    })

    const assertLambdaDeleteWorksWhen = async ({
        onAssertOutputChannel = ((channel: MockOutputChannel) => {
            // Defaults to expecting no output. Should verify output when expected.
            assert.strictEqual(
              channel.value,
              '',
              'expect no output since output testing was omitted'
            )
        }),
        ...params
    }: {
        functionName: string,
        errorToThrowDuringDelete?: Error,
        expectDeleteIsCalled: boolean,
        expectRefreshIsCalled: boolean,
        onConfirm(): Promise<boolean>,
        onAssertOutputChannel?(actualOutputChannel: MockOutputChannel): void
    }) => {
        let isDeleteCalled = false
        let isRefreshCalled = false
        const lambdaClient = new MockLambdaClient(
          undefined,
          async (name) => {
              isDeleteCalled = true
              assert.strictEqual(
                name,
                params.functionName,
                `expected lambda name "${params.functionName}", not "${name}"`
              )
              if (params.errorToThrowDuringDelete) {
                  throw params.errorToThrowDuringDelete
              }
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
              FunctionName: params.functionName
          },
          async () => assert.fail(),
          async configuration => assert.fail()
        )
        const outputChannel = new MockOutputChannel()

        try {
            await deleteLambda({
                node,
                lambdaClient,
                outputChannel,
                onRefresh: () => isRefreshCalled = true,
                onConfirm: async () => params.onConfirm()
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

        assert.strictEqual(
          isDeleteCalled,
          params.expectDeleteIsCalled,
          `delete should ${params.expectDeleteIsCalled ? '' : ' not'} be called.`
        )

        assert.strictEqual(
          isRefreshCalled,
          params.expectRefreshIsCalled,
          `refresh should${params.expectRefreshIsCalled ? '' : ' not'} be called`
        )

        onAssertOutputChannel.bind({}) // Make linter happy

        onAssertOutputChannel(outputChannel)
    }
})
