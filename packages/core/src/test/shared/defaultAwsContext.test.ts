/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as AWS from 'aws-sdk'
import { AwsContextCredentials } from '../../shared/awsContext'
import { DefaultAwsContext } from '../../shared/awsContext'

describe('DefaultAwsContext', function () {
    const testAccountIdValue: string = '123456789012'

    it('instantiates with no credentials', async function () {
        const testContext = new DefaultAwsContext()

        assert.strictEqual(testContext.getCredentialProfileName(), undefined)
        assert.strictEqual(testContext.getCredentialAccountId(), undefined)
        assert.strictEqual(await testContext.getCredentials(), undefined)
    })

    it('sets credentials and gets credentialsId', async function () {
        const awsCredentials = makeSampleAwsContextCredentials()

        const testContext = new DefaultAwsContext()

        await testContext.setCredentials(awsCredentials)
        assert.strictEqual(testContext.getCredentialProfileName(), awsCredentials.credentialsId)
    })

    it('sets undefined credentials and gets credentialsId', async function () {
        const testContext = new DefaultAwsContext()

        await testContext.setCredentials(undefined)
        assert.strictEqual(testContext.getCredentialProfileName(), undefined)
    })

    it('sets credentials and gets accountId', async function () {
        const awsCredentials = makeSampleAwsContextCredentials()

        const testContext = new DefaultAwsContext()

        await testContext.setCredentials(awsCredentials)
        assert.strictEqual(testContext.getCredentialAccountId(), awsCredentials.accountId)
    })

    it('sets undefined credentials and gets accountId', async function () {
        const testContext = new DefaultAwsContext()

        await testContext.setCredentials(undefined)
        assert.strictEqual(testContext.getCredentialAccountId(), undefined)
    })

    it('sets credentials and gets credentials', async function () {
        const awsCredentials = makeSampleAwsContextCredentials()

        const testContext = new DefaultAwsContext()

        await testContext.setCredentials(awsCredentials)
        assert.strictEqual(await testContext.getCredentials(), awsCredentials.credentials)
    })

    it('sets undefined credentials and gets credentials', async function () {
        const testContext = new DefaultAwsContext()

        await testContext.setCredentials(undefined)
        assert.strictEqual(await testContext.getCredentials(), undefined)
    })

    it('fires event on credentials change', async function () {
        const testContext = new DefaultAwsContext()

        const awsCredentials = makeSampleAwsContextCredentials()

        await new Promise<void>(async resolve => {
            testContext.onDidChangeContext(awsContextChangedEvent => {
                assert.strictEqual(awsContextChangedEvent.profileName, awsCredentials.credentialsId)
                assert.strictEqual(awsContextChangedEvent.accountId, awsCredentials.accountId)
                resolve()
            })

            await testContext.setCredentials(awsCredentials)
        })
    })

    function makeSampleAwsContextCredentials(): AwsContextCredentials {
        return {
            credentials: {} as any as AWS.Credentials,
            credentialsId: 'qwerty',
            accountId: testAccountIdValue,
        }
    }
})
