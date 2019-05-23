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
import { FakeChildProcessResult, TestSamCliProcessInvoker } from './testSamCliProcessInvoker'

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

    it('throws when unsuccessful errorcode is encountered', async () => {
        const childProcessResult: FakeChildProcessResult = new FakeChildProcessResult(
            {
                exitCode: 1,
                error: new Error('some-error-message'),
                stderr: 'somestderr',
                stdout: 'somestdout',
            }
        )

        const invoker: TestSamCliProcessInvoker = new TestSamCliProcessInvoker(
            (spawnOptions, args: any[]): ChildProcessResult => childProcessResult
        )
        const samInfo: SamCliInfoInvocation = new SamCliInfoInvocation(invoker)

        const error: Error = await assertThrowsError(
            async () => {
                await samInfo.execute()
            },
            'Expected a error to be thrown'
        )

        assert.ok(error.message.indexOf(childProcessResult.error!.message) !== -1, 'error message was not in error')
        assert.ok(error.message.indexOf(childProcessResult.stderr) !== -1, 'stderr was not in error')
        assert.ok(error.message.indexOf(childProcessResult.stdout) !== -1, 'stdout was not in error')
    })
})
