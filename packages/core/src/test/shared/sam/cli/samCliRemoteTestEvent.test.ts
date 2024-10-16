/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    runSamCliRemoteTestEvents,
    SamCliRemoteTestEventsParameters,
    TestEventsOperation,
} from '../../../../shared/sam/cli/samCliRemoteTestEvent'
import assert from 'assert'
import { makeUnexpectedExitCodeError } from '../../../../shared/sam/cli/samCliInvokerUtils'
import { getTestLogger } from '../../../globalSetup.test'
import {
    assertArgIsPresent,
    assertArgNotPresent,
    assertArgsContainArgument,
    MockSamCliProcessInvoker,
} from './samCliTestUtils'
import { assertLogContainsBadExitInformation, BadExitCodeSamCliProcessInvoker } from './testSamCliProcessInvoker'

describe('runSamCliRemoteTestEvents', () => {
    const fakeFunctionArn = 'arn::aws:123456'
    const fakeName = 'name'
    const fakeEventSample = '{testKey: testValue}'
    let invokeCount: number

    beforeEach(() => {
        invokeCount = 0
    })

    it('should call invoker with correct arguments for List operation', async () => {
        const invoker = new MockSamCliProcessInvoker((args) => {
            invokeCount++
            assertArgIsPresent(args, fakeFunctionArn)
            assertArgNotPresent(args, '--file')
            assertArgNotPresent(args, '--name')
            assertArgIsPresent(args, 'remote')
            assertArgIsPresent(args, 'test-event')
            assertArgIsPresent(args, TestEventsOperation.List)
        })

        const params: SamCliRemoteTestEventsParameters = {
            functionArn: fakeFunctionArn,
            operation: TestEventsOperation.List,
        }

        await runSamCliRemoteTestEvents(params, invoker)

        assert.strictEqual(invokeCount, 1, 'Unexpected invoke count')
    })

    it('should call invoker with correct arguments for Get operation with name', async () => {
        const invoker = new MockSamCliProcessInvoker((args) => {
            invokeCount++
            assertArgIsPresent(args, fakeFunctionArn)
            assertArgsContainArgument(args, '--name', fakeName)
            assertArgIsPresent(args, 'remote')
            assertArgIsPresent(args, 'test-event')
            assertArgIsPresent(args, TestEventsOperation.Get)
            assertArgNotPresent(args, '--file')
        })

        const params: SamCliRemoteTestEventsParameters = {
            functionArn: fakeFunctionArn,
            operation: TestEventsOperation.Get,
            name: fakeName,
        }

        await runSamCliRemoteTestEvents(params, invoker)

        assert.strictEqual(invokeCount, 1, 'Unexpected invoke count')
    })

    it('should call invoker with correct arguments for Put operation with event sample', async () => {
        const invoker = new MockSamCliProcessInvoker((args) => {
            invokeCount++
            assertArgIsPresent(args, fakeFunctionArn)
            assertArgsContainArgument(args, '--name', fakeName)
            assertArgNotPresent(args, 'list')
            assertArgIsPresent(args, 'remote')
            assertArgIsPresent(args, 'test-event')
            assertArgIsPresent(args, '--file')
            assertArgIsPresent(args, TestEventsOperation.Put)
        })

        const params: SamCliRemoteTestEventsParameters = {
            functionArn: fakeFunctionArn,
            operation: TestEventsOperation.Put,
            eventSample: fakeEventSample,
            name: fakeName,
        }

        await runSamCliRemoteTestEvents(params, invoker)

        assert.strictEqual(invokeCount, 1, 'Unexpected invoke count')
    })

    it('should show error message and return empty array on error', async () => {
        const badExitCodeProcessInvoker = new BadExitCodeSamCliProcessInvoker({})

        const params: SamCliRemoteTestEventsParameters = {
            functionArn: fakeFunctionArn,
            operation: TestEventsOperation.List,
        }

        await assert.rejects(
            runSamCliRemoteTestEvents(params, badExitCodeProcessInvoker),
            makeUnexpectedExitCodeError(badExitCodeProcessInvoker.error.message),
            'Expected error was not thrown'
        )

        await assertLogContainsBadExitInformation(
            getTestLogger(),
            badExitCodeProcessInvoker.makeChildProcessResult(),
            0
        )
    })
})
