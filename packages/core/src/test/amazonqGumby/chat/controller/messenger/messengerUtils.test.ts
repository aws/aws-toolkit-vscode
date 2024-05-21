/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import DependencyVersions from '../../../../../amazonqGumby/models/dependencies'
import MessengerUtils from '../../../../../amazonqGumby/chat/controller/messenger/messengerUtils'

const TestDependencyVersions = new DependencyVersions('4.2', ['3.8', '4.2', '2.4'], ['1.12', '1.09', '1.10'], '1.3')

describe('MessengerUtils', () => {
    describe('createAvailableDependencyVersionString', async () => {
        it('returns a string containing the highest major version available', async () => {
            const message = MessengerUtils.createAvailableDependencyVersionString(TestDependencyVersions)
            assert.strictEqual(
                message.includes('Latest major version:'),
                true,
                "'Latest major version' was not found in string"
            )
            assert.strictEqual(
                message.includes('4.2'),
                true,
                'Expected the actual latest major version to be present in string'
            )
        })

        it('returns a string that does not contain a major version when major versions are not defined', async () => {
            const testDependencyVersions = new DependencyVersions('4.2', [], ['1.9', '1.11', '1.10'], '1.3')
            const message = MessengerUtils.createAvailableDependencyVersionString(testDependencyVersions)
            assert.strictEqual(message.includes('Latest major version:'), false)
        })

        it('returns a string containing the highest minor version available', async () => {
            const message = MessengerUtils.createAvailableDependencyVersionString(TestDependencyVersions)
            assert.strictEqual(message.includes('Latest minor version:'), true)
            assert.strictEqual(message.includes('1.12'), true)
        })

        it('returns a string that does not contain a minor version when minor versions are not defined', async () => {
            const testDependencyVersions = new DependencyVersions('4.2', ['3.8', '4.2', '2.4'], [], '1.3')
            const message = MessengerUtils.createAvailableDependencyVersionString(testDependencyVersions)
            assert.strictEqual(message.includes('Latest minor version:'), false)
        })
    })
})
