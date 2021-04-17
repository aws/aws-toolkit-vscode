/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { SamCliInfoInvocation, SamCliInfoResponse } from '../../../../shared/sam/cli/samCliInfo'
import { makeUnpectedExitCodeError } from '../../../../shared/sam/cli/samCliInvokerUtils'
import { ChildProcessResult } from '../../../../shared/utilities/childProcess'
import { getTestLogger } from '../../../globalSetup.test'
import {
    assertLogContainsBadExitInformation,
    BadExitCodeSamCliProcessInvoker,
    FakeChildProcessResult,
    TestSamCliProcessInvoker,
} from './testSamCliProcessInvoker'

describe('SamCliInfoInvocation', async function () {
    const successfulInvoker: TestSamCliProcessInvoker = new TestSamCliProcessInvoker(
        (spawnOptions, args: any[]): ChildProcessResult => {
            return new FakeChildProcessResult({
                stdout: '{"version": "1.2.3"}',
            })
        }
    )
    class TestSamCliInfoCommand extends SamCliInfoInvocation {
        public convertOutput(text: string): SamCliInfoResponse | undefined {
            return super.convertOutput(text)
        }
    }

    it('converts sam info response to SamCliInfoResponse', async function () {
        const response: SamCliInfoResponse | undefined = new TestSamCliInfoCommand({
            invoker: successfulInvoker,
        }).convertOutput('{"version": "1.2.3"}')

        assert.ok(response)
        assert.strictEqual(response!.version, '1.2.3')
    })

    it('converts sam info response containing unexpected fields to SamCliInfoResponse', async function () {
        const response: SamCliInfoResponse | undefined = new TestSamCliInfoCommand({
            invoker: successfulInvoker,
        }).convertOutput('{"version": "1.2.3", "bananas": "123"}')

        assert.ok(response)
        assert.strictEqual(response!.version, '1.2.3')
    })

    it('converts sam info response without version to SamCliInfoResponse', async function () {
        const response: SamCliInfoResponse | undefined = new TestSamCliInfoCommand({
            invoker: successfulInvoker,
        }).convertOutput('{}')

        assert.ok(response)
        assert.strictEqual(response!.version, undefined)
    })

    it('converts non-response to undefined', async function () {
        ;['qwerty', '{"version": "1.2.3"} you have no new email messages'].forEach(output => {
            const response: SamCliInfoResponse | undefined = new TestSamCliInfoCommand({
                invoker: successfulInvoker,
            }).convertOutput(output)

            assert.strictEqual(response, undefined, `Expected text to not parse: ${output}`)
        })
    })

    it('handles successful errorcode and output', async function () {
        const samInfo: SamCliInfoInvocation = new SamCliInfoInvocation({ invoker: successfulInvoker })

        const response = await samInfo.execute()
        assert.ok(response)
        assert.strictEqual(response.version, '1.2.3', 'unexpected sam info version')
    })

    it('handles successful errorcode with strange output', async function () {
        const invoker: TestSamCliProcessInvoker = new TestSamCliProcessInvoker(
            (spawnOptions, args: any[]): ChildProcessResult => {
                return new FakeChildProcessResult({
                    stdout: 'unexpected output',
                })
            }
        )
        const samInfo: SamCliInfoInvocation = new SamCliInfoInvocation({ invoker })

        await assert.rejects(samInfo.execute(), 'Expected a error to be thrown')
    })

    it('throws on unexpected exit code', async function () {
        const badExitCodeProcessInvoker = new BadExitCodeSamCliProcessInvoker({})
        const samInfo: SamCliInfoInvocation = new SamCliInfoInvocation({ invoker: badExitCodeProcessInvoker })

        const expectedError = makeUnpectedExitCodeError(badExitCodeProcessInvoker.error.message)
        await assert.rejects(samInfo.execute(), expectedError, 'Expected error was not thrown')

        await assertLogContainsBadExitInformation(
            getTestLogger(),
            badExitCodeProcessInvoker.makeChildProcessResult(),
            0
        )
    })
})
