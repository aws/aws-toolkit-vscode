/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { runSamCliDeploy, SamCliDeployParameters } from '../../../../shared/sam/cli/samCliDeploy'
import { getTestLogger } from '../../../globalSetup.test'
import { assertThrowsError } from '../../utilities/assertUtils'
import {
    assertArgIsPresent,
    assertArgNotPresent,
    assertArgsContainArgument,
    MockSamCliProcessInvoker,
} from './samCliTestUtils'
import {
    assertErrorContainsBadExitMessage,
    assertLogContainsBadExitInformation,
    BadExitCodeSamCliProcessInvoker,
} from './testSamCliProcessInvoker'

describe('runSamCliDeploy', async () => {
    const fakeRegion = 'region'
    const fakeStackName = 'stackName'
    const fakeTemplateFile = 'template'
    let invokeCount: number

    beforeEach(() => {
        invokeCount = 0
    })

    it('does not include --parameter-overrides if there are no overrides', async () => {
        const invoker = new MockSamCliProcessInvoker(args => {
            invokeCount++
            assertArgNotPresent(args, '--parameter-overrides')
        })

        await runSamCliDeploy(makeSampleSamCliDeployParameters(new Map<string, string>()), invoker)

        assert.strictEqual(invokeCount, 1, 'Unexpected invoke count')
    })

    it('includes overrides as a string of key=value pairs', async () => {
        const invoker = new MockSamCliProcessInvoker(args => {
            invokeCount++
            assertArgIsPresent(args, '--parameter-overrides')
            const overridesIndex = args.findIndex(arg => arg === '--parameter-overrides')
            assert.strictEqual(overridesIndex > -1, true)
            assert.strictEqual(args.length >= overridesIndex + 3, true)
            assert.strictEqual(args[overridesIndex + 1], 'key1=value1')
            assert.strictEqual(args[overridesIndex + 2], 'key2=value2')
        })

        await runSamCliDeploy(
            makeSampleSamCliDeployParameters(
                new Map<string, string>([
                    ['key1', 'value1'],
                    ['key2', 'value2'],
                ])
            ),
            invoker
        )

        assert.strictEqual(invokeCount, 1, 'Unexpected invoke count')
    })

    it('includes a template, stack name, and region', async () => {
        const invoker = new MockSamCliProcessInvoker(args => {
            invokeCount++
            assertArgsContainArgument(args, '--template-file', fakeTemplateFile)
            assertArgsContainArgument(args, '--stack-name', fakeStackName)
            assertArgsContainArgument(args, '--region', fakeRegion)
        })

        await runSamCliDeploy(makeSampleSamCliDeployParameters(new Map<string, string>()), invoker)

        assert.strictEqual(invokeCount, 1, 'Unexpected invoke count')
    })

    it('throws on unexpected exit code', async () => {
        const badExitCodeProcessInvoker = new BadExitCodeSamCliProcessInvoker({})

        const error = await assertThrowsError(async () => {
            await runSamCliDeploy(
                makeSampleSamCliDeployParameters(new Map<string, string>()),
                badExitCodeProcessInvoker
            )
        }, 'Expected an error to be thrown')

        assertErrorContainsBadExitMessage(error, badExitCodeProcessInvoker.error.message)
        await assertLogContainsBadExitInformation(
            getTestLogger(),
            badExitCodeProcessInvoker.makeChildProcessResult(),
            0
        )
    })

    function makeSampleSamCliDeployParameters(parameterOverrides: Map<string, string>): SamCliDeployParameters {
        return {
            environmentVariables: {},
            parameterOverrides: parameterOverrides,
            region: fakeRegion,
            stackName: fakeStackName,
            templateFile: fakeTemplateFile,
        }
    }
})
