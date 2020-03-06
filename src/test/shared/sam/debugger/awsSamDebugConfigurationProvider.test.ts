/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'

import { AwsSamDebugConfigurationProvider } from '../../../../shared/sam/debugger/awsSamDebugger'

describe('AwsSamDebugConfigurationProvider', async () => {
    let debugConfigProvider: AwsSamDebugConfigurationProvider

    before(() => {
        debugConfigProvider = new AwsSamDebugConfigurationProvider()
    })

    it('TEMP!!! - returns undefined when providing debug configurations', async () => {
        const provided = await debugConfigProvider.provideDebugConfigurations(undefined)
        assert.strictEqual(provided, undefined)
    })

    it('TEMP!!! - returns undefined when resolving debug configurations', async () => {
        const resolved = await debugConfigProvider.resolveDebugConfiguration(undefined, {
            type: 'aws-sam',
            name: 'whats in a name',
            request: 'direct-invoke',
            invokeTarget: {
                target: 'code',
                lambdaHandler: 'sick handles',
                projectRoot: 'root as in beer'
            }
        })
        assert.strictEqual(resolved, undefined)
    })
})
