/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { makeUnexpectedExitCodeError } from '../../../../shared/sam/cli/samCliInvokerUtils'
import { runSamCliDeploy, SamCliDeployParameters } from '../../../../shared/sam/cli/samCliDeploy'
import { getTestLogger } from '../../../globalSetup.test'
import {
    assertArgIsPresent,
    assertArgNotPresent,
    assertArgsContainArgument,
    MockSamCliProcessInvoker,
} from './samCliTestUtils'
import { assertLogContainsBadExitInformation, BadExitCodeSamCliProcessInvoker } from './testSamCliProcessInvoker'

describe('runSamCliDeploy', async function () {
    const fakeRegion = 'region'
    const fakeStackName = 'stackName'
    const fakeS3BucketName = 'coolbucket'
    const fakeTemplateFile = 'template'
    let invokeCount: number

    beforeEach(function () {
        invokeCount = 0
    })

    it('does not include --parameter-overrides if there are no overrides', async function () {
        const invoker = new MockSamCliProcessInvoker(args => {
            invokeCount++
            assertArgNotPresent(args, '--parameter-overrides')
        })

        await runSamCliDeploy(makeSampleSamCliDeployParameters(new Map<string, string>()), invoker)

        assert.strictEqual(invokeCount, 1, 'Unexpected invoke count')
    })

    it('includes overrides as a string of key=value pairs', async function () {
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

    it('includes a template, stack name, bucket, and region', async function () {
        const invoker = new MockSamCliProcessInvoker(args => {
            invokeCount++
            assertArgsContainArgument(args, '--template-file', fakeTemplateFile)
            assertArgsContainArgument(args, '--stack-name', fakeStackName)
            assertArgsContainArgument(args, '--region', fakeRegion)
            assertArgsContainArgument(args, '--s3-bucket', fakeS3BucketName)
        })

        await runSamCliDeploy(makeSampleSamCliDeployParameters(new Map<string, string>()), invoker)

        assert.strictEqual(invokeCount, 1, 'Unexpected invoke count')
    })

    it('Passes all cloudformation capabilities', async function () {
        const invoker = new MockSamCliProcessInvoker(args => {
            invokeCount++
            assertArgIsPresent(args, '--capabilities')
            assertArgIsPresent(args, 'CAPABILITY_IAM')
            assertArgIsPresent(args, 'CAPABILITY_NAMED_IAM')
            assertArgIsPresent(args, 'CAPABILITY_AUTO_EXPAND')
        })

        await runSamCliDeploy(makeSampleSamCliDeployParameters(new Map<string, string>()), invoker)

        assert.strictEqual(invokeCount, 1, 'Unexpected invoke count')
    })

    it('throws on unexpected exit code', async function () {
        const badExitCodeProcessInvoker = new BadExitCodeSamCliProcessInvoker({})

        await assert.rejects(
            runSamCliDeploy(makeSampleSamCliDeployParameters(new Map<string, string>()), badExitCodeProcessInvoker),
            makeUnexpectedExitCodeError(badExitCodeProcessInvoker.error.message),
            'Expected error was not thrown'
        )

        await assertLogContainsBadExitInformation(
            getTestLogger(),
            badExitCodeProcessInvoker.makeChildProcessResult(),
            0
        )
    })

    function makeSampleSamCliDeployParameters(
        parameterOverrides: Map<string, string>,
        ecrRepo: string | undefined = undefined
    ): SamCliDeployParameters {
        return {
            environmentVariables: {},
            parameterOverrides: parameterOverrides,
            region: fakeRegion,
            stackName: fakeStackName,
            s3Bucket: fakeS3BucketName,
            templateFile: fakeTemplateFile,
        }
    }
})
