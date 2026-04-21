/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SSO Credential Refresh Gap - SageMaker Space Remote Sessions
 *
 * ## Problem
 *
 * When a user connects to a SageMaker Space via VS Code using IAM Identity Center (SSO),
 * the session disconnects after ~1 hour. This kills active Jupyter kernels and forces a
 * full browser re-authentication + window reload.
 *
 * ## Root Cause
 *
 * SageMaker Space connections snapshot STS credentials once at connection time and never
 * refresh them. After ~1 hour (default STS credential TTL), the SSM tunnel drops and
 * reconnection fails because the detached server reads expired credentials from the
 * mapping file.
 *
 * ## Fix
 *
 * Wire up `SsoCredentialRefresher` (same pattern as SMUS `startProactiveCredentialRefresh()`)
 * for SSO connections. The refresher periodically checks the in-memory credential cache and
 * writes fresh credentials to the mapping file before they expire.
 *
 * ## References
 *
 * - `persistLocalCredentials()` in `credentialMapping.ts` - writes SSO creds and starts refresher
 * - `SsoCredentialRefresher` in `credentialMapping.ts` - the proactive refresh timer
 * - `persistSmusProjectCreds()` in `credentialMapping.ts` - calls `startProactiveCredentialRefresh()`
 * - `resolveCredentialsFor()` in `detached-server/credentials.ts` - returns credentials from mapping file
 * - `ProjectRoleCredentialsProvider` in `sagemakerunifiedstudio/auth/providers/` - the SMUS refresh timer
 */

import * as sinon from 'sinon'
import * as assert from 'assert'
import * as utils from '../../../awsService/sagemaker/detached-server/utils'
import { resolveCredentialsFor } from '../../../awsService/sagemaker/detached-server/credentials'
import {
    SsoCredentialRefresher,
    SsoCachedCredentials,
    setSpaceSsoProfile,
} from '../../../awsService/sagemaker/credentialMapping'
import { fs } from '../../../shared'

const spaceArn = 'arn:aws:sagemaker:us-west-2:123456789012:space/d-abc123/test-space'

describe('sagemaker SSO credential refresh', () => {
    let sandbox: sinon.SinonSandbox

    beforeEach(() => {
        sandbox = sinon.createSandbox()
    })

    afterEach(() => {
        sandbox.restore()
    })

    describe('SsoCredentialRefresher', () => {
        /**
         * Verifies that the refresher writes fresh credentials to the mapping file
         * when the cached credentials are approaching expiry. This is the core fix:
         * without this, the mapping file goes stale after ~1h and the detached server
         * reads expired credentials on reconnect.
         */
        it('should update mapping file when credentials approach expiry', async () => {
            sandbox.stub(fs, 'existsFile').resolves(false)
            const writeStub = sandbox.stub(fs, 'writeFile').resolves()

            // Credentials expiring in 4 minutes (within 5-min safety buffer)
            const cached: SsoCachedCredentials = {
                credentials: {
                    accessKeyId: 'AKIA_REFRESHED',
                    secretAccessKey: 'SECRET_REFRESHED',
                    sessionToken: 'TOKEN_REFRESHED',
                    expiration: new Date(Date.now() + 4 * 60_000),
                },
            }

            const refresher = new SsoCredentialRefresher(spaceArn, () => cached, {
                checkIntervalMs: 10, // fast for testing
            })
            refresher.start()

            // Wait for the check to fire
            await new Promise((r) => setTimeout(r, 50))
            refresher.stop()

            assert.ok(
                writeStub.callCount >= 1,
                `Expected mapping file to be written with refreshed credentials, but writeFile was called ${writeStub.callCount} time(s).`
            )

            const raw = writeStub.lastCall.args[1]
            const data = JSON.parse(typeof raw === 'string' ? raw : raw.toString())
            const stored = data.localCredential?.[spaceArn]

            assert.strictEqual(stored.accessKey, 'AKIA_REFRESHED')
            assert.strictEqual(stored.token, 'TOKEN_REFRESHED')
        })

        /**
         * Verifies that the refresher does NOT write when credentials are still fresh.
         * This avoids unnecessary file I/O and matches the SMUS pattern where refresh
         * only happens when credentials expire within the safety buffer.
         */
        it('should not write when credentials are still fresh', async () => {
            sandbox.stub(fs, 'existsFile').resolves(false)
            const writeStub = sandbox.stub(fs, 'writeFile').resolves()

            // Credentials expiring in 30 minutes (well outside 5-min buffer)
            const cached: SsoCachedCredentials = {
                credentials: {
                    accessKeyId: 'AKIA_FRESH',
                    secretAccessKey: 'SECRET_FRESH',
                    sessionToken: 'TOKEN_FRESH',
                    expiration: new Date(Date.now() + 30 * 60_000),
                },
            }

            const refresher = new SsoCredentialRefresher(spaceArn, () => cached, {
                checkIntervalMs: 10,
            })
            refresher.start()

            await new Promise((r) => setTimeout(r, 50))
            refresher.stop()

            assert.strictEqual(
                writeStub.callCount,
                0,
                'Refresher should not write when credentials are still fresh (>5 min until expiry).'
            )
        })
    })

    describe('resolveCredentialsFor with refreshed credentials', () => {
        /**
         * Verifies that after the refresher updates the mapping file, the detached
         * server reads the fresh credentials instead of stale ones.
         */
        it('should return fresh credentials after refresh writes to mapping file', async () => {
            sandbox.stub(utils, 'readMapping').resolves({
                localCredential: {
                    [spaceArn]: {
                        type: 'sso',
                        accessKey: 'AKIA_REFRESHED',
                        secret: 'SECRET_REFRESHED',
                        token: 'TOKEN_REFRESHED',
                    },
                },
            })

            const creds = await resolveCredentialsFor(spaceArn)

            assert.strictEqual(creds.accessKeyId, 'AKIA_REFRESHED')
            assert.strictEqual(creds.sessionToken, 'TOKEN_REFRESHED')
        })
    })

    describe('SSO and SMUS refresh parity', () => {
        /**
         * Verifies that SSO connections now have a proactive credential refresh mechanism,
         * matching the behavior of SMUS connections which call `startProactiveCredentialRefresh()`.
         * The `SsoCredentialRefresher` uses the same timer pattern (10s check interval,
         * 5min safety buffer) and writes to the same mapping file.
         */
        it('should start proactive credential refresh for SSO like SMUS does', async () => {
            sandbox.stub(fs, 'existsFile').resolves(false)
            const writeStub = sandbox.stub(fs, 'writeFile').resolves()

            // Initial write (what persistLocalCredentials does)
            await setSpaceSsoProfile(spaceArn, 'AKIA_INITIAL', 'SECRET_INITIAL', 'TOKEN_INITIAL')
            assert.strictEqual(writeStub.callCount, 1, 'Initial write')

            // Credentials expiring in 3 minutes (within safety buffer)
            const cached: SsoCachedCredentials = {
                credentials: {
                    accessKeyId: 'AKIA_REFRESHED',
                    secretAccessKey: 'SECRET_REFRESHED',
                    sessionToken: 'TOKEN_REFRESHED',
                    expiration: new Date(Date.now() + 3 * 60_000),
                },
            }

            // Start refresher (what persistLocalCredentials now does for SSO)
            const refresher = new SsoCredentialRefresher(spaceArn, () => cached, {
                checkIntervalMs: 10,
            })
            refresher.start()

            await new Promise((r) => setTimeout(r, 50))
            refresher.stop()

            assert.ok(
                writeStub.callCount > 1,
                `Mapping file was written ${writeStub.callCount} time(s). ` +
                    'Expected >1 writes: initial persist + at least one refresh. ' +
                    'SSO connections now have proactive credential refresh like SMUS.'
            )
        })
    })
})
