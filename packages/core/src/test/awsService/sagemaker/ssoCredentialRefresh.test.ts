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
 * refresh them. The flow breaks down as follows:
 *
 * 1. `persistLocalCredentials()` reads the current STS credentials from memory and writes
 *    them as static strings (`accessKeyId`, `secretAccessKey`, `sessionToken`) to the
 *    mapping file `~/.aws/.sagemaker-space-profiles`. This happens once during
 *    `prepareDevEnvConnection()` and never again.
 *
 * 2. The detached HTTP server's `resolveCredentialsFor()` reads these static values from
 *    the mapping file and returns them as-is for SSO connections. There is no expiry check,
 *    no call to `GetRoleCredentials`, and no re-derivation.
 *
 * 3. The SSO token refresh (`refreshToken()`) correctly refreshes the OIDC bearer token,
 *    but nothing converts the refreshed token into fresh STS credentials for the mapping
 *    file. The file goes stale.
 *
 * 4. When the SSM tunnel drops (~1 hour, matching default STS credential TTL), the detached
 *    server reads expired credentials from the mapping file, `StartSession` fails, and the
 *    user must re-authenticate.
 *
 * ## Why IAM connections are not affected
 *
 * For IAM profile connections, the detached server calls `fromIni({ profile: name })` which
 * resolves credentials dynamically on each request. SSO connections instead return stored
 * static strings with no re-derivation.
 *
 * ## Why SMUS connections are not affected
 *
 * SMUS (SageMaker Unified Studio) connections call `startProactiveCredentialRefresh()` after
 * persisting credentials. This runs a periodic timer that detects approaching expiry, fetches
 * fresh credentials, and writes them back to the mapping file. This mechanism exists in the
 * codebase but is only wired up for SMUS, not for SSO-based SageMaker Spaces.
 *
 * ## Expected fix
 *
 * Wire up `startProactiveCredentialRefresh()` for SSO connections, using the SSO token cache
 * (`~/.aws/sso/cache/`) and `GetRoleCredentials` as the credential source instead of the
 * SMUS DataZone endpoint. All three tests below will pass once this is implemented.
 *
 * ## References
 *
 * - `persistLocalCredentials()` in `credentialMapping.ts` - writes SSO creds once
 * - `persistSmusProjectCreds()` in `credentialMapping.ts` - calls `startProactiveCredentialRefresh()`
 * - `resolveCredentialsFor()` in `detached-server/credentials.ts` - returns static SSO values
 * - `ProjectRoleCredentialsProvider` in `sagemakerunifiedstudio/auth/providers/` - the refresh timer
 * - `SSOCredentials` in AWS SDK v2 (`sso_credentials.js`) - canonical SSO cache -> GetRoleCredentials flow
 */

import * as sinon from 'sinon'
import * as assert from 'assert'
import * as utils from '../../../awsService/sagemaker/detached-server/utils'
import { resolveCredentialsFor } from '../../../awsService/sagemaker/detached-server/credentials'
import { setSpaceSsoProfile } from '../../../awsService/sagemaker/credentialMapping'
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

    describe('persistLocalCredentials should trigger proactive refresh for SSO', () => {
        /**
         * Verifies that SSO credentials in the mapping file are updated when the in-memory
         * credentials are refreshed. Currently, `persistLocalCredentials()` calls
         * `setSpaceSsoProfile()` once at connection time with the current STS credentials
         * and never writes again, even after the SSO token refreshes and fresh STS
         * credentials become available in memory.
         */
        it('should update mapping file when SSO credentials are refreshed in memory', async () => {
            sandbox.stub(fs, 'existsFile').resolves(false)
            const writeStub = sandbox.stub(fs, 'writeFile').resolves()

            // Connection time: write initial SSO credentials
            await setSpaceSsoProfile(spaceArn, 'AKIA_INITIAL', 'SECRET_INITIAL', 'TOKEN_INITIAL')
            assert.ok(writeStub.calledOnce, 'Initial write happened')

            // Verify what was written
            const raw = writeStub.firstCall.args[1]
            const data = JSON.parse(typeof raw === 'string' ? raw : raw.toString())
            const stored = data.localCredential?.[spaceArn]

            // Time passes, SSO token refreshes, new STS creds available in memory.
            // Nothing writes them back to the mapping file.
            assert.strictEqual(
                stored.accessKey,
                'AKIA_REFRESHED',
                'Mapping file still contains initial SSO credentials ("AKIA_INITIAL"). ' +
                'persistLocalCredentials() writes once and never updates the file with refreshed STS credentials.'
            )
        })
    })

    describe('resolveCredentialsFor should not return stale SSO credentials', () => {
        /**
         * Verifies that the detached server does not blindly return expired SSO credentials.
         * Currently, `resolveCredentialsFor()` reads the mapping file and returns the raw
         * `accessKey`, `secret`, `token` values for SSO connections with no validation.
         *
         * Compare with the IAM path which calls `fromIni({ profile: name })`, dynamically
         * resolving credentials on each request via the AWS SDK credential chain.
         */
        it('should resolve SSO credentials dynamically like IAM credentials', async () => {
            sandbox.stub(utils, 'readMapping').resolves({
                localCredential: {
                    [spaceArn]: {
                        type: 'sso',
                        accessKey: 'AKIA_EXPIRED',
                        secret: 'SECRET_EXPIRED',
                        token: 'TOKEN_EXPIRED_AFTER_1H',
                    },
                },
            })

            // Detached server resolves credentials for /get_session after tunnel drop
            const creds = await resolveCredentialsFor(spaceArn)

            // SSO returns static values with no expiry check or refresh.
            // IAM calls fromIni() which resolves dynamically on each request.
            assert.notStrictEqual(
                creds.sessionToken,
                'TOKEN_EXPIRED_AFTER_1H',
                'Detached server returns stale SSO session token with no expiry check or refresh. ' +
                'IAM connections use fromIni() for dynamic resolution. ' +
                'SSO returns raw static values that expire after ~1h.'
            )
        })
    })

    describe('SSO and SMUS refresh parity', () => {
        /**
         * Verifies that SSO connections have the same proactive credential refresh mechanism
         * as SMUS connections. Currently, `persistSmusProjectCreds()` calls
         * `startProactiveCredentialRefresh()` which runs a periodic timer (10s check interval,
         * 5min safety buffer) that writes fresh credentials to the mapping file before expiry.
         *
         * `persistLocalCredentials()` for SSO connections writes once and returns with no
         * refresh timer. This means the mapping file goes stale after the default STS
         * credential TTL (~1 hour), causing session disconnects.
         */
        it('should start proactive credential refresh for SSO like SMUS does', async () => {
            sandbox.stub(fs, 'existsFile').resolves(false)
            const writeStub = sandbox.stub(fs, 'writeFile').resolves()

            // Simulate SSO persist (what persistLocalCredentials does for SSO connections)
            await setSpaceSsoProfile(spaceArn, 'AKIA123', 'SECRET', 'TOKEN')

            // persistLocalCredentials writes exactly once and never again.
            // persistSmusProjectCreds calls startProactiveCredentialRefresh() which
            // periodically calls saveMappings() with fresh credentials.
            // SSO has no equivalent mechanism.
            assert.ok(
                writeStub.callCount > 1,
                `Mapping file was written ${writeStub.callCount} time(s). ` +
                'Expected >1 writes if proactive credential refresh were active. ' +
                'SMUS calls startProactiveCredentialRefresh() but SSO does not.'
            )
        })
    })
})
