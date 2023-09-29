/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import {
    createEnableCodeSuggestionsNode,
    createSsoSignIn,
    createLearnMore,
    createFreeTierLimitMetNode,
} from '../../../codewhisperer/explorer/codewhispererChildrenNodes'

describe('codewhisperer children nodes', function () {
    afterEach(function () {
        sinon.restore()
    })

    it('should build enableCodeSuggestions command node', function () {
        const node = createEnableCodeSuggestionsNode()

        assert.strictEqual(node.resource.id, 'aws.codeWhisperer.enableCodeSuggestions')
    })

    it('should build showSsoSignIn command node', function () {
        const node = createSsoSignIn()

        assert.strictEqual(node.resource.id, 'aws.auth.manageConnections')
    })

    it('should build showLearnMore command node', function () {
        const node = createLearnMore()

        assert.strictEqual(node.resource.id, 'aws.codeWhisperer.learnMore')
    })

    it('should build showFreeTierLimit command node', function () {
        const node = createFreeTierLimitMetNode()

        assert.strictEqual(node.resource.id, 'aws.codeWhisperer.freeTierLimit')
    })
})
