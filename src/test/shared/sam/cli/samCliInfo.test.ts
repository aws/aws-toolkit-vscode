/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { TestLogger } from '../../../../shared/loggerUtils'
import { SamCliInfoInvocation, SamCliInfoResponse } from '../../../../shared/sam/cli/samCliInfo'
import { ChildProcessResult } from '../../../../shared/utilities/childProcess'
import { assertThrowsError } from '../../utilities/assertUtils'
import {
    assertErrorContainsBadExitMessage,
    assertLogContainsBadExitInformation,
    BadExitCodeSamCliProcessInvoker,
    FakeChildProcessResult,
    TestSamCliProcessInvoker
} from './testSamCliProcessInvoker'

describe('SamCliInfoInvocation', async () => {

    class TestSamCliInfoCommand extends SamCliInfoInvocation {
        public convertOutput(text: string): SamCliInfoResponse | undefined {
            return super.convertOutput(text)
        }
    }

    let logger: TestLogger

    before(async () => {
        logger = await TestLogger.createTestLogger()
    })

    after(async () => {
        await logger.cleanupLogger()
    })

    it('converts sam info response to SamCliInfoResponse', async () => {
        const response: SamCliInfoResponse | undefined = new TestSamCliInfoCommand()
            .convertOutput('{"version": "1.2.3"}')

        assert.ok(response)
        assert.strictEqual(response!.version, '1.2.3')
    })

    it('converts sam info response containing unexpected fields to SamCliInfoResponse', async () => {
        const response: SamCliInfoResponse | undefined = new TestSamCliInfoCommand()
            .convertOutput('{"version": "1.2.3", "bananas": "123"}')

        assert.ok(response)
        assert.strictEqual(response!.version, '1.2.3')
    })

    it('converts sam info response without version to SamCliInfoResponse', async () => {
        const response: SamCliInfoResponse | undefined = new TestSamCliInfoCommand()
            .convertOutput('{}')

        assert.ok(response)
        assert.strictEqual(response!.version, undefined)
    })

    it('converts non-response to undefined', async () => {
        [
            'qwerty',
            '{"version": "1.2.3"} you have no new email messages'
        ].forEach(output => {
            const response: SamCliInfoResponse | undefined = new TestSamCliInfoCommand()
                .convertOutput(output)

            assert.strictEqual(response, undefined, `Expected text to not parse: ${output}`)
        })
    })

    it('handles successful errorcode and output', async () => {
        const invoker: TestSamCliProcessInvoker = new TestSamCliProcessInvoker(
            (spawnOptions, args: any[]): ChildProcessResult => {
                return new FakeChildProcessResult(
                    {
                        stdout: '{"version": "1.2.3"}'
                    }
                )
            }
        )
        const samInfo: SamCliInfoInvocation = new SamCliInfoInvocation(invoker)

        const response = await samInfo.execute()
        assert.ok(response)
        assert.strictEqual(response.version, '1.2.3', 'unexpected sam info version')
    })

    it('handles successful errorcode with strange output', async () => {
        const invoker: TestSamCliProcessInvoker = new TestSamCliProcessInvoker(
            (spawnOptions, args: any[]): ChildProcessResult => {
                return new FakeChildProcessResult(
                    {
                        stdout: 'unexpected output'
                    }
                )
            }
        )
        const samInfo: SamCliInfoInvocation = new SamCliInfoInvocation(invoker)

        await assertThrowsError(
            async () => {
                await samInfo.execute()
            },
            'Expected a error to be thrown'
        )
    })

    it('throws on unexpected exit code', async () => {
        const badExitCodeProcessInvoker = new BadExitCodeSamCliProcessInvoker({})

        const error = await assertThrowsError(
            async () => {
                const samInfo: SamCliInfoInvocation = new SamCliInfoInvocation(badExitCodeProcessInvoker)
                await samInfo.execute()
            },
            'Expected an error to be thrown'
        )

        assertErrorContainsBadExitMessage(error, badExitCodeProcessInvoker.error.message)
        await assertLogContainsBadExitInformation(logger, badExitCodeProcessInvoker.makeChildProcessResult(), 0)
    })
})
