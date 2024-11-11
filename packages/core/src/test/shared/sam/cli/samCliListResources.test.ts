/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { runSamCliListResource, SamCliListResourcesParameters } from '../../../../shared/sam/cli/samCliListResources'
import { assertArgIsPresent, assertArgsContainArgument, MockSamCliProcessInvoker } from './samCliTestUtils'
import { getTestLogger } from '../../../globalSetup.test'

describe('runSamCliListResource', function () {
    let invokeCount: number
    const fakeTemplateFile = 'template.yaml'
    const fakeStackName = 'testStack'
    const fakeRegion = 'us-west-2'
    const fakeProjectRoot = { fsPath: '/project/root' } as any

    beforeEach(function () {
        invokeCount = 0
    })

    function makeSampleParameters(region?: string): SamCliListResourcesParameters {
        return {
            templateFile: fakeTemplateFile,
            stackName: fakeStackName,
            region: region,
            projectRoot: fakeProjectRoot,
        }
    }

    it('includes template file, stack name, and JSON output format', async function () {
        const invoker = new MockSamCliProcessInvoker((args) => {
            invokeCount++
            assertArgsContainArgument(args, '--template-file', fakeTemplateFile)
            assertArgsContainArgument(args, '--stack-name', fakeStackName)
            assertArgsContainArgument(args, '--output', 'json')
        })

        await runSamCliListResource(makeSampleParameters(), invoker)

        assert.strictEqual(invokeCount, 1, 'Unexpected invoke count')
    })

    it('includes the region argument if provided', async function () {
        const invoker = new MockSamCliProcessInvoker((args) => {
            invokeCount++
            assertArgIsPresent(args, '--region')
            assertArgsContainArgument(args, '--region', fakeRegion)
        })

        await runSamCliListResource(makeSampleParameters(fakeRegion), invoker)

        assert.strictEqual(invokeCount, 1, 'Unexpected invoke count')
    })

    it('does not include region argument if not provided', async function () {
        const invoker = new MockSamCliProcessInvoker((args) => {
            invokeCount++
            assert.strictEqual(args.includes('--region'), false, 'Region argument should not be present')
        })

        await runSamCliListResource(makeSampleParameters(), invoker)

        assert.strictEqual(invokeCount, 1, 'Unexpected invoke count')
    })

    it('logs message on CFN error', async function () {
        const message = 'Resource does not exist on Cloudformation'
        const invoker = new MockSamCliProcessInvoker(() => {
            throw new Error(message)
        })
        const logger = getTestLogger()

        await runSamCliListResource(makeSampleParameters(), invoker)

        const logs = logger.getLoggedEntries()
        assert.ok(logs.find((entry) => entry === message))
    })
})
