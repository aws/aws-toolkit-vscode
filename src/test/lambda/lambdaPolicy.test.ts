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

    it('starts initialized', async () => {
        const view: LambdaPolicyView = new LambdaPolicyView(new DoNothingLambdaPolicyProvider('fn1'))

        assert.equal(view.getStatus(), LambdaPolicyViewStatus.Initialized)
    })

    it('enters loading state', async () => {
        const promise = new Promise<void>(async (resolve, reject) => {
            const view: LambdaPolicyView = new LambdaPolicyView(
                {
                    functionName: 'function1',
                    getLambdaPolicy: async () => {
                        assert.equal(view.getStatus(), LambdaPolicyViewStatus.Loading)
                        resolve()

                        return {}
                    }
                }
            )

            await view.load()
        })

        await promise
    })

    it('enters loaded state', async () => {
        const view: LambdaPolicyView = new LambdaPolicyView(new DoNothingLambdaPolicyProvider('fn1'))
        await view.load()

        assert.equal(view.getStatus(), LambdaPolicyViewStatus.Loaded)
    })

    it('enters error state', async () => {
        const view: LambdaPolicyView = new LambdaPolicyView(
            {
                functionName: 'function1',
                getLambdaPolicy: async () => {
                    throw Error('Testing that error is thrown')
                }
            }
        )

        await view.load()

        assert.equal(view.getStatus(), LambdaPolicyViewStatus.Error)
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
