/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { runSamCliDeploy } from '../../../../shared/sam/cli/samCliDeploy'
import { MockSamCliProcessInvoker } from './samCliTestUtils'

describe('runSamCliDeploy', async () => {
    const fakeProfile = 'profile'
    const fakeRegion = 'region'
    const fakeStackName = 'stackName'
    const fakeTemplateFile = 'template'
    let invokeCount: number

    beforeEach(() => {
        invokeCount = 0
    })

    it('does not include --parameter-overrides if there are no overrides', async () => {
        const invoker = new MockSamCliProcessInvoker(
            args => {
                invokeCount++
                assert.strictEqual(args.some(arg => arg === '--parameter-overrides'), false)
            }
        )

        await runSamCliDeploy(
            {
                profile: fakeProfile,
                parameterOverrides: new Map<string, string>(),
                region: fakeRegion,
                stackName: fakeStackName,
                templateFile: fakeTemplateFile,
            },
            invoker
        )

        assert.strictEqual(invokeCount, 1, 'Unexpected invoke count')
    })

    it('includes overrides as a string of key=value pairs', async () => {
        const invoker = new MockSamCliProcessInvoker(
            args => {
                invokeCount++
                const overridesIndex = args.findIndex(arg => arg === '--parameter-overrides')
                assert.strictEqual(overridesIndex > -1, true)
                assert.strictEqual(args.length >= overridesIndex + 3, true)
                assert.strictEqual(args[overridesIndex + 1], 'key1=value1')
                assert.strictEqual(args[overridesIndex + 2], 'key2=value2')
            }
        )

        await runSamCliDeploy(
            {
                profile: fakeProfile,
                parameterOverrides: new Map<string, string>([
                    ['key1', 'value1'],
                    ['key2', 'value2'],
                ]),
                region: fakeRegion,
                stackName: fakeStackName,
                templateFile: fakeTemplateFile,
            },
            invoker
        )

        assert.strictEqual(invokeCount, 1, 'Unexpected invoke count')
    })

    it('includes a template, stack name, region, and profile ', async () => {
        const invoker = new MockSamCliProcessInvoker(
            args => {
                invokeCount++
                const templateIndex = args.findIndex(arg => arg === '--template-file')
                const stackIndex = args.findIndex(arg => arg === '--stack-name')
                const regionIndex = args.findIndex(arg => arg === '--region')
                const profileIndex = args.findIndex(arg => arg === '--profile')
                assert.strictEqual(args[templateIndex + 1], 'template')
                assert.strictEqual(args[stackIndex + 1], 'stackName')
                assert.strictEqual(args[regionIndex + 1], 'region')
                assert.strictEqual(args[profileIndex + 1], 'profile')
            }
        )

        await runSamCliDeploy(
            {
                profile: fakeProfile,
                parameterOverrides: new Map<string, string>(),
                region: fakeRegion,
                stackName: fakeStackName,
                templateFile: fakeTemplateFile,
            },
            invoker
        )

        assert.strictEqual(invokeCount, 1, 'Unexpected invoke count')
    })
})
