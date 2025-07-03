/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as assert from 'assert'
import { persistLocalCredentials, persistSSMConnection } from '../../../awsService/sagemaker/credentialMapping'
import { Auth } from '../../../auth'
import { DevSettings, fs } from '../../../shared'
import globals from '../../../shared/extensionGlobals'

describe('credentialMapping', () => {
    describe('persistLocalCredentials', () => {
        const appArn = 'arn:aws:sagemaker:us-west-2:123456789012:app/domain/space'

        let sandbox: sinon.SinonSandbox

        beforeEach(() => {
            sandbox = sinon.createSandbox()
        })

        afterEach(() => {
            sandbox.restore()
        })

        it('writes IAM profile to mappings', async () => {
            sandbox.stub(Auth.instance, 'getCurrentProfileId').returns('profile:my-iam-profile')
            sandbox.stub(fs, 'existsFile').resolves(false) // simulate no existing mapping file
            const writeStub = sandbox.stub(fs, 'writeFile').resolves()

            await persistLocalCredentials(appArn)

            assert.ok(writeStub.calledOnce)
            const raw = writeStub.firstCall.args[1]
            const data = JSON.parse(typeof raw === 'string' ? raw : raw.toString())

            assert.deepStrictEqual(data.localCredential?.[appArn], {
                type: 'iam',
                profileName: 'profile:my-iam-profile',
            })
        })

        it('writes SSO credentials to mappings', async () => {
            sandbox.stub(Auth.instance, 'getCurrentProfileId').returns('sso:my-sso-profile')
            sandbox.stub(globals.loginManager.store, 'credentialsCache').value({
                'sso:my-sso-profile': {
                    credentials: {
                        accessKeyId: 'AKIA123',
                        secretAccessKey: 'SECRET',
                        sessionToken: 'TOKEN',
                    },
                },
            })
            sandbox.stub(fs, 'existsFile').resolves(false)
            const writeStub = sandbox.stub(fs, 'writeFile').resolves()

            await persistLocalCredentials(appArn)

            assert.ok(writeStub.calledOnce)
            const raw = writeStub.firstCall.args[1]
            const data = JSON.parse(typeof raw === 'string' ? raw : raw.toString())
            assert.deepStrictEqual(data.localCredential?.[appArn], {
                type: 'sso',
                accessKey: 'AKIA123',
                secret: 'SECRET',
                token: 'TOKEN',
            })
        })

        it('throws if no current profile ID is available', async () => {
            sandbox.stub(Auth.instance, 'getCurrentProfileId').returns(undefined)

            await assert.rejects(() => persistLocalCredentials(appArn), {
                message: 'No current profile ID available for saving space credentials.',
            })
        })
    })

    describe('persistSSMConnection', () => {
        const appArn = 'arn:aws:sagemaker:us-west-2:123456789012:app/domain/space'
        const domain = 'my-domain'
        let sandbox: sinon.SinonSandbox

        beforeEach(() => {
            sandbox = sinon.createSandbox()
        })

        afterEach(() => {
            sandbox.restore()
        })

        function assertRefreshUrlMatches(writtenUrl: string, expectedSubdomain: string) {
            assert.ok(
                writtenUrl.startsWith(`https://studio-${domain}.${expectedSubdomain}`),
                `Expected refresh URL to start with https://studio-${domain}.${expectedSubdomain}, got ${writtenUrl}`
            )
        }

        it('uses default (studio) endpoint if no custom endpoint is set', async () => {
            sandbox.stub(DevSettings.instance, 'get').returns({})
            sandbox.stub(fs, 'existsFile').resolves(false)
            const writeStub = sandbox.stub(fs, 'writeFile').resolves()

            await persistSSMConnection(appArn, domain)

            const raw = writeStub.firstCall.args[1]
            const data = JSON.parse(typeof raw === 'string' ? raw : raw.toString())

            assertRefreshUrlMatches(data.deepLink?.[appArn]?.refreshUrl, 'studio.us-west-2.sagemaker.aws')
            assert.deepStrictEqual(data.deepLink?.[appArn]?.requests['initial-connection'], {
                sessionId: '-',
                url: '-',
                token: '-',
                status: 'fresh',
            })
        })

        it('uses devo subdomain for beta endpoint', async () => {
            sandbox.stub(DevSettings.instance, 'get').returns({ sagemaker: 'https://beta.whatever' })
            sandbox.stub(fs, 'existsFile').resolves(false)
            const writeStub = sandbox.stub(fs, 'writeFile').resolves()

            await persistSSMConnection(appArn, domain, 'sess', 'wss://ws', 'token')

            const raw = writeStub.firstCall.args[1]
            const data = JSON.parse(typeof raw === 'string' ? raw : raw.toString())

            assertRefreshUrlMatches(data.deepLink?.[appArn]?.refreshUrl, 'devo.studio.us-west-2.asfiovnxocqpcry.com')
            assert.deepStrictEqual(data.deepLink?.[appArn]?.requests['initial-connection'], {
                sessionId: 'sess',
                url: 'wss://ws',
                token: 'token',
                status: 'fresh',
            })
        })

        it('uses loadtest subdomain for gamma endpoint', async () => {
            sandbox.stub(DevSettings.instance, 'get').returns({ sagemaker: 'https://gamma.example' })
            sandbox.stub(fs, 'existsFile').resolves(false)
            const writeStub = sandbox.stub(fs, 'writeFile').resolves()

            await persistSSMConnection(appArn, domain)

            const raw = writeStub.firstCall.args[1]
            const data = JSON.parse(typeof raw === 'string' ? raw : raw.toString())

            assertRefreshUrlMatches(
                data.deepLink?.[appArn]?.refreshUrl,
                'loadtest.studio.us-west-2.asfiovnxocqpcry.com'
            )
        })
    })
})
