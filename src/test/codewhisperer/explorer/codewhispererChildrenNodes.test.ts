/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import {
    createSignIn,
    createLearnMore,
    createFreeTierLimitMet,
    createGettingStarted,
    createAutoSuggestions,
    createOpenReferenceLog,
    createSecurityScan,
    createReconnect,
    createSelectCustomization,
} from '../../../codewhisperer/explorer/codewhispererChildrenNodes'

describe('codewhisperer children nodes', function () {
    afterEach(function () {
        sinon.restore()
    })

    it('builds the pause/resume codewhisperer command node', async function () {
        const resumeNode = createAutoSuggestions('tree', false)
        assert.strictEqual(resumeNode.resource.id, 'aws.codeWhisperer.toggleCodeSuggestion')
        assert.strictEqual((await resumeNode.getTreeItem()).label, 'Resume Auto-Suggestions')

        const pauseNode = createAutoSuggestions('tree', true)
        assert.strictEqual(pauseNode.resource.id, 'aws.codeWhisperer.toggleCodeSuggestion')
        assert.strictEqual((await pauseNode.getTreeItem()).label, 'Pause Auto-Suggestions')
    })

    it('builds the openReferenceLog command node', async function () {
        const resumeNode = createOpenReferenceLog('tree')
        assert.strictEqual(resumeNode.resource.id, 'aws.codeWhisperer.openReferencePanel')
    })

    it('builds the securityScan command node', async function () {
        const resumeNode = createSecurityScan('tree')
        assert.strictEqual(resumeNode.resource.id, 'aws.codeWhisperer.security.scan')
    })

    it('should build showSsoSignIn command node', function () {
        const node = createSignIn('tree')

        assert.strictEqual(node.resource.id, 'aws.codewhisperer.manageConnections')
    })

    it('builds the reconnect command node', async function () {
        const resumeNode = createReconnect('tree')
        assert.strictEqual(resumeNode.resource.id, 'aws.codewhisperer.reconnect')
    })

    it('should build showLearnMore command node', function () {
        const node = createLearnMore('tree')

        assert.strictEqual(node.resource.id, 'aws.codeWhisperer.learnMore')
    })

    it('should build showFreeTierLimit command node', function () {
        const node = createFreeTierLimitMet('tree')

        assert.strictEqual(node.resource.id, 'aws.codeWhisperer.freeTierLimit')
    })

    it('builds the selectCustomization command node', function () {
        const node = createSelectCustomization('tree')

        assert.strictEqual(node.resource.id, 'aws.codeWhisperer.selectCustomization')
    })

    it('builds the createGettingStarted command node', function () {
        const node = createGettingStarted('tree')
        assert.strictEqual(node.resource.id, 'aws.codeWhisperer.gettingStarted')
    })
})
