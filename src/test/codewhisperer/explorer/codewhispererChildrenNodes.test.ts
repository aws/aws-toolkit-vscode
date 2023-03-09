/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { 
    createEnableCodeSuggestionsNode,
    createAutoSuggestionsNode, 
    createOpenReferenceLogNode, 
    createSecurityScanNode, 
    createSsoSignIn, 
    createLearnMore,
    createFreeTierLimitMetNode 
} from '../../../codewhisperer/explorer/codewhispererChildrenNodes'

describe('codewhisperer children nodes', function () {
    afterEach(function () {
        sinon.restore()
    })

    it('should build enableCodeSuggestions command node', function () {
        const node = createEnableCodeSuggestionsNode()

        assert.strictEqual(node.resource.id, 'aws.codeWhisperer.enableCodeSuggestions')
    })

    it('should build toggleCodeSuggestions command node', function () {
        const node = createAutoSuggestionsNode(true)

        assert.strictEqual(node.resource.id, 'aws.codeWhisperer.toggleCodeSuggestion')
    })

    it('should build showReferenceLog command node', function () {
        const node = createOpenReferenceLogNode()

        assert.strictEqual(node.resource.id, 'aws.codeWhisperer.openReferencePanel')
    })

    it('should build showSecurityScan command node', function () {
        const node = createSecurityScanNode()

        assert.strictEqual(node.resource.id, 'aws.codeWhisperer.security.scan')
    })

    it('should build showSsoSignIn command node', function () {
        const node = createSsoSignIn()

        assert.strictEqual(node.resource.id, 'aws.codeWhisperer.sso')
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
    