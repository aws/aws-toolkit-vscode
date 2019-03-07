/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import { Lambda } from 'aws-sdk'
import {
    DefaultLambdaPolicyProvider,
    LambdaPolicyProvider,
    LambdaPolicyView,
    LambdaPolicyViewStatus
} from '../../lambda/lambdaPolicy'
import { LambdaClient } from '../../shared/clients/lambdaClient'
import { ext } from '../../shared/extensionGlobals'
import { TestLogger } from '../../shared/loggerUtils'
import { MockToolkitClientBuilder } from '../shared/clients/mockClients'

class DoNothingLambdaPolicyProvider implements LambdaPolicyProvider {
    public readonly functionName: string

    public constructor(functionName: string) {
        this.functionName = functionName
    }

    public async getLambdaPolicy(): Promise<Lambda.GetPolicyResponse> {
        return Promise.resolve({
            Policy: ''
        })
    }

}

describe('LambdaPolicyView', async () => {

    let logger: TestLogger
    let autoDisposeView: LambdaPolicyView | undefined

    before( async () => {
        logger = await TestLogger.createTestLogger()
    })

    afterEach(async () => {
        if (!!autoDisposeView) {
            autoDisposeView.dispose()
        }
    })

    after(async () => {
        await logger.cleanupLogger()
    })

    it('starts initialized', async () => {
        autoDisposeView = new LambdaPolicyView(new DoNothingLambdaPolicyProvider('fn1'))

        assert.strictEqual(autoDisposeView.status, LambdaPolicyViewStatus.Initialized)
    })

    it('enters loading state', async () => {
        let expectedStatus: boolean = false
        autoDisposeView = new LambdaPolicyView(
            {
                functionName: 'function1',
                getLambdaPolicy: async () => {
                    assert.strictEqual(autoDisposeView!.status, LambdaPolicyViewStatus.Loading)
                    expectedStatus = true

                    return {}
                }
            }
        )

        await autoDisposeView.load()
        assert.strictEqual(expectedStatus, true)
    })

    it('enters loaded state', async () => {
        autoDisposeView = new LambdaPolicyView(new DoNothingLambdaPolicyProvider('fn1'))
        await autoDisposeView.load()

        assert.strictEqual(autoDisposeView.status, LambdaPolicyViewStatus.Loaded)
    })

    it('enters error state', async () => {
        autoDisposeView = new LambdaPolicyView(
            {
                functionName: 'function1',
                getLambdaPolicy: async () => {
                    throw Error('Testing that error is thrown')
                }
            }
        )

        await autoDisposeView.load()

        assert.strictEqual(autoDisposeView.status, LambdaPolicyViewStatus.Error)
    })

    it('enters disposed state', async () => {
        const view: LambdaPolicyView = new LambdaPolicyView(new DoNothingLambdaPolicyProvider('fn1'))
        view.dispose()

        assert.strictEqual(view.status, LambdaPolicyViewStatus.Disposed)
    })

    it('enters disposed state when view closes', async () => {
        class CloseableLambdaPolicyView extends LambdaPolicyView {
            public constructor(policyProvider: LambdaPolicyProvider) {
                super(policyProvider)
            }

            public closeView() {
                assert.ok(!!this._view)
                this._view!.dispose()
            }
        }

        const view: CloseableLambdaPolicyView = new CloseableLambdaPolicyView(new DoNothingLambdaPolicyProvider('fn1'))
        view.closeView()

        assert.strictEqual(view.status, LambdaPolicyViewStatus.Disposed)
    })

})

describe('DefaultLambdaPolicyProvider', async () => {
    it('does not accept blank functionName', async () => {
        ext.toolkitClientBuilder = new MockToolkitClientBuilder()

        assert.throws(() => {
            // tslint:disable-next-line:no-unused-expression
            new DefaultLambdaPolicyProvider('', '')
        })
    })

    it('sets functionName', async () => {
        ext.toolkitClientBuilder = new MockToolkitClientBuilder()
        const provider = new DefaultLambdaPolicyProvider('fn1', '')

        assert.strictEqual(provider.functionName, 'fn1')
    })

    it('gets Lambda Policy', async () => {
        const policyResponse: Lambda.GetPolicyResponse = {
            Policy: ''
        }

        const client: LambdaClient = {
            getPolicy: async () => policyResponse
        } as any as LambdaClient
        ext.toolkitClientBuilder = new MockToolkitClientBuilder(undefined, client)

        const provider = new DefaultLambdaPolicyProvider('fn1', '')

        assert.strictEqual(await provider.getLambdaPolicy(), policyResponse)
    })
})
