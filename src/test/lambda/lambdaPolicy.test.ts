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

        assert.equal(autoDisposeView.getStatus(), LambdaPolicyViewStatus.Initialized)
    })

    it('enters loading state', async () => {
        const promise = new Promise<void>(async (resolve, reject) => {
            autoDisposeView = new LambdaPolicyView(
                {
                    functionName: 'function1',
                    getLambdaPolicy: async () => {
                        assert.equal(autoDisposeView!.getStatus(), LambdaPolicyViewStatus.Loading)
                        resolve()

                        return {}
                    }
                }
            )

            await autoDisposeView.load()
        })

        await promise
    })

    it('enters loaded state', async () => {
        autoDisposeView = new LambdaPolicyView(new DoNothingLambdaPolicyProvider('fn1'))
        await autoDisposeView.load()

        assert.equal(autoDisposeView.getStatus(), LambdaPolicyViewStatus.Loaded)
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

        assert.equal(autoDisposeView.getStatus(), LambdaPolicyViewStatus.Error)
    })

    it('enters disposed state', async () => {
        const view: LambdaPolicyView = new LambdaPolicyView(new DoNothingLambdaPolicyProvider('fn1'))
        view.dispose()

        assert.equal(view.getStatus(), LambdaPolicyViewStatus.Disposed)
    })

    it('enters disposed state when view closes', async () => {
        class CloseableLambdaPolicyView extends LambdaPolicyView {
            public constructor(policyProvider: LambdaPolicyProvider) {
                super(policyProvider)
            }

            public closeView() {
                this._view!.dispose()
            }
        }

        const view: CloseableLambdaPolicyView = new CloseableLambdaPolicyView(new DoNothingLambdaPolicyProvider('fn1'))
        view.closeView()

        assert.equal(view.getStatus(), LambdaPolicyViewStatus.Disposed)
    })

})

describe('DefaultLambdaPolicyProvider', async () => {

    it('does not accept blank functionName', async () => {
        // @ts-ignore
        const lambda: Lambda = {}

        assert.throws(() => {
            // tslint:disable-next-line:no-unused-expression
            new DefaultLambdaPolicyProvider(
                '',
                lambda
            )
        })
    })

    it('sets functionName', async () => {
        // @ts-ignore
        const lambda: Lambda = {}
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
