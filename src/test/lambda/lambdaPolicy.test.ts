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
} from '../../../src/lambda/lambdaPolicy'

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

    let autoDisposeView: LambdaPolicyView | undefined

    afterEach(async () => {
        if (!!autoDisposeView) {
            autoDisposeView.dispose()
        }
    })

    it('starts initialized', async () => {
        autoDisposeView = new LambdaPolicyView(new DoNothingLambdaPolicyProvider('fn1'))

        assert.equal(autoDisposeView.status, LambdaPolicyViewStatus.Initialized)
    })

    it('enters loading state', async () => {
        let expectedStatus: boolean = false
        autoDisposeView = new LambdaPolicyView(
            {
                functionName: 'function1',
                getLambdaPolicy: async () => {
                    assert.equal(autoDisposeView!.status, LambdaPolicyViewStatus.Loading)
                    expectedStatus = true

                    return {}
                }
            }
        )

        await autoDisposeView.load()
        assert.equal(expectedStatus, true)
    })

    it('enters loaded state', async () => {
        autoDisposeView = new LambdaPolicyView(new DoNothingLambdaPolicyProvider('fn1'))
        await autoDisposeView.load()

        assert.equal(autoDisposeView.status, LambdaPolicyViewStatus.Loaded)
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

        assert.equal(autoDisposeView.status, LambdaPolicyViewStatus.Error)
    })

    it('enters disposed state', async () => {
        const view: LambdaPolicyView = new LambdaPolicyView(new DoNothingLambdaPolicyProvider('fn1'))
        view.dispose()

        assert.equal(view.status, LambdaPolicyViewStatus.Disposed)
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

        assert.equal(view.status, LambdaPolicyViewStatus.Disposed)
    })

})

describe('DefaultLambdaPolicyProvider', async () => {

    it('does not accept blank functionName', async () => {
        const lambda: Lambda = {} as any as Lambda

        assert.throws(() => {
            // tslint:disable-next-line:no-unused-expression
            new DefaultLambdaPolicyProvider(
                '',
                lambda
            )
        })
    })

    it('sets functionName', async () => {
        const lambda: Lambda = {} as any as Lambda
        const provider = new DefaultLambdaPolicyProvider('fn1', lambda)

        assert.equal(provider.functionName, 'fn1')
    })

    it('gets Lambda Policy', async () => {
        const policyResponse: Lambda.GetPolicyResponse = {
            Policy: ''
        }

        const lambda: Lambda = {
            // @ts-ignore
            getPolicy: () => {
                return {
                    promise: async () => Promise.resolve(policyResponse)
                }
            }
        }

        const provider = new DefaultLambdaPolicyProvider('fn1', lambda)

        assert.equal(await provider.getLambdaPolicy(), policyResponse)
    })
})
