/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { showAmazonQWalkthroughOnce } from '../../../amazonq/onboardingPage/walkthrough'
import { FakeMemento } from '../../fakeExtensionContext'
import sinon from 'sinon'

describe('showAmazonQWalkthroughOnce', function () {
    it('only shows once', async function () {
        const state = new FakeMemento()
        const showWalkthroughStub = sinon.stub()
        assert.deepStrictEqual(showWalkthroughStub.callCount, 0)
        await showAmazonQWalkthroughOnce(state, showWalkthroughStub)
        // Show walkthrough since our state indicates we haven't shown before
        assert.deepStrictEqual(showWalkthroughStub.callCount, 1)

        await showAmazonQWalkthroughOnce(state, showWalkthroughStub)
        // On the second call we do not show again since we've shown before.
        assert.deepStrictEqual(showWalkthroughStub.callCount, 1)
    })
})
