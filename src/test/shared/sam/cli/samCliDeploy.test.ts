/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { SamCliDeployInvocation } from '../../../../shared/sam/cli/samCliDeploy'
import { MockSamCliProcessInvoker } from './samCliTestUtils'

describe('SamCliDeployInvocation', async () => {
    it('does not include --parameter-overrides if there are no overrides', async () => {
        const invoker = new MockSamCliProcessInvoker(
            args => {
                assert.strictEqual(args.some(arg => arg === '--parameter-overrides'), false)
            }
        )

        const invocation = new SamCliDeployInvocation(
            'template',
            'stackName',
            'region',
            new Map<string, string>(),
            invoker,
            'profile'
        )

        await invocation.execute()
    })

    it('includes overrides as a string of key=value pairs', async () => {
        const invoker = new MockSamCliProcessInvoker(
            args => {
                const overridesIndex = args.findIndex(arg => arg === '--parameter-overrides')
                assert.strictEqual(overridesIndex > -1, true)
                assert.strictEqual(args.length >= overridesIndex + 3, true)
                assert.strictEqual(args[overridesIndex + 1], 'key1=value1')
                assert.strictEqual(args[overridesIndex + 2], 'key2=value2')
            }
        )

        const invocation = new SamCliDeployInvocation(
            'template',
            'stackName',
            'region',
            new Map<string, string>([
                ['key1', 'value1'],
                ['key2', 'value2'],
            ]),
            invoker,
            'profile'
        )

        await invocation.execute()
    })

    // TODO: Add tests for template, stackName, and region.
})
