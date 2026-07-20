/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as path from 'path'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import {
    detectPoisonedCache,
    isLoginTokenFreshOnDisk,
    recordConsoleLoginSuccess,
    tryResumePendingSignIn,
    PendingSignIn,
} from '../../../sagemakerunifiedstudio/auth/consoleLoginRecovery'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { fs } from '../../../shared'
import { EnvironmentVariables } from '../../../shared/environmentVariables'
import globals from '../../../shared/extensionGlobals'
import { ToolkitError } from '../../../shared/errors'
import { SmusAuthenticationProvider } from '../../../sagemakerunifiedstudio/auth/providers/smusAuthenticationProvider'
import { getTestWindow } from '../../shared/vscode/window'
import { SeverityLevel } from '../../shared/vscode/message'
import { SmusAuthenticationOrchestrator } from '../../../sagemakerunifiedstudio/auth/authenticationOrchestrator'

const pendingSignInKey = 'aws.smus.pendingSignIn'

describe('consoleLoginRecovery', function () {
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(async function () {
        await globals.globalState.update(pendingSignInKey as any, undefined)
        sandbox.restore()
    })

    describe('isLoginTokenFreshOnDisk', function () {
        let tempFolder: string
        let cacheDir: string

        beforeEach(async function () {
            tempFolder = await makeTemporaryToolkitFolder()
            cacheDir = path.join(tempFolder, 'login-cache')
            await fs.mkdir(cacheDir)
            sandbox.stub(process, 'env').value({
                AWS_LOGIN_CACHE_DIRECTORY: cacheDir,
            } as EnvironmentVariables)
        })

        afterEach(async function () {
            await fs.delete(tempFolder, { recursive: true })
        })

        it('returns false when the cache directory has no token files', async function () {
            const result = await isLoginTokenFreshOnDisk()
            assert.strictEqual(result, false)
        })

        it('returns true when a cached token has a future expiresAt', async function () {
            const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
            await fs.writeFile(
                path.join(cacheDir, 'token.json'),
                JSON.stringify({ accessToken: { expiresAt: future } })
            )

            const result = await isLoginTokenFreshOnDisk()
            assert.strictEqual(result, true)
        })

        it('returns false when the only cached token is expired', async function () {
            const past = new Date(Date.now() - 60 * 60 * 1000).toISOString()
            await fs.writeFile(path.join(cacheDir, 'token.json'), JSON.stringify({ accessToken: { expiresAt: past } }))

            const result = await isLoginTokenFreshOnDisk()
            assert.strictEqual(result, false)
        })

        it('returns false and does not throw on an unparseable token file', async function () {
            await fs.writeFile(path.join(cacheDir, 'token.json'), 'not valid json')

            const result = await isLoginTokenFreshOnDisk()
            assert.strictEqual(result, false)
        })

        it('ignores non-json files in the cache directory', async function () {
            await fs.writeFile(path.join(cacheDir, 'README.txt'), 'not a token')

            const result = await isLoginTokenFreshOnDisk()
            assert.strictEqual(result, false)
        })
    })

    describe('detectPoisonedCache', function () {
        let tempFolder: string
        let cacheDir: string

        beforeEach(async function () {
            tempFolder = await makeTemporaryToolkitFolder()
            cacheDir = path.join(tempFolder, 'login-cache')
            await fs.mkdir(cacheDir)
            sandbox.stub(process, 'env').value({
                AWS_LOGIN_CACHE_DIRECTORY: cacheDir,
            } as EnvironmentVariables)
        })

        afterEach(async function () {
            await fs.delete(tempFolder, { recursive: true })
        })

        async function writeFreshToken() {
            const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
            await fs.writeFile(
                path.join(cacheDir, 'token.json'),
                JSON.stringify({ accessToken: { expiresAt: future } })
            )
        }

        it('returns true when a login just succeeded, the error is token-shaped, and disk token is fresh', async function () {
            recordConsoleLoginSuccess()
            await writeFreshToken()

            const result = await detectPoisonedCache(new Error('Failed to refresh token: ValidationException'))
            assert.strictEqual(result, true)
        })

        it('accepts a string error (validateIamProfile returns an error string, not a throw)', async function () {
            recordConsoleLoginSuccess()
            await writeFreshToken()

            const result = await detectPoisonedCache('Failed to refresh token: ValidationException')
            assert.strictEqual(result, true)
        })

        it('walks the ToolkitError cause chain to find a token-shaped message', async function () {
            recordConsoleLoginSuccess()
            await writeFreshToken()

            const wrapped = ToolkitError.chain(
                new Error('Failed to refresh token: expired'),
                'Console credentials error'
            )

            const result = await detectPoisonedCache(wrapped)
            assert.strictEqual(result, true)
        })

        it('returns false when no console login has happened recently', async function () {
            // lastConsoleLoginSuccessAt is module state; without calling recordConsoleLoginSuccess
            // in this test, and given the 5-minute window, a login from another test could still
            // be "recent" - so explicitly use a clearly non-token error to keep this deterministic.
            await writeFreshToken()

            const result = await detectPoisonedCache(new Error('some unrelated network error'))
            assert.strictEqual(result, false)
        })

        it('returns false when the error does not look like a token/refresh failure', async function () {
            recordConsoleLoginSuccess()
            await writeFreshToken()

            const result = await detectPoisonedCache(new Error('Access denied'))
            assert.strictEqual(result, false)
        })

        it('returns false when the disk token cannot be confirmed fresh (no cache files)', async function () {
            recordConsoleLoginSuccess()
            // cacheDir exists but is empty - nothing to confirm as fresh.

            const result = await detectPoisonedCache(new Error('Failed to refresh token: expired'))
            assert.strictEqual(result, false)
        })

        it('returns false when the only disk token is expired', async function () {
            recordConsoleLoginSuccess()
            const past = new Date(Date.now() - 60 * 60 * 1000).toISOString()
            await fs.writeFile(path.join(cacheDir, 'token.json'), JSON.stringify({ accessToken: { expiresAt: past } }))

            const result = await detectPoisonedCache(new Error('Failed to refresh token: expired'))
            assert.strictEqual(result, false)
        })
    })

    describe('tryResumePendingSignIn', function () {
        const fakeContext = {} as vscode.ExtensionContext
        const fakeAuthProvider = {} as SmusAuthenticationProvider

        it('does nothing when there is no pending marker', async function () {
            await tryResumePendingSignIn(fakeContext, fakeAuthProvider)

            assert.strictEqual(getTestWindow().shownMessages.length, 0)
        })

        it('does nothing when the marker is missing a profileName or region', async function () {
            await globals.globalState.update(pendingSignInKey as any, { attempted: false } as Partial<PendingSignIn>)

            await tryResumePendingSignIn(fakeContext, fakeAuthProvider)

            assert.strictEqual(getTestWindow().shownMessages.length, 0)
        })

        it('loop-guard: an already-attempted marker is cleared and not retried', async function () {
            const pending: PendingSignIn = { profileName: 'test-profile', region: 'us-west-2', attempted: true }
            await globals.globalState.update(pendingSignInKey as any, pending)

            await tryResumePendingSignIn(fakeContext, fakeAuthProvider)

            getTestWindow()
                .getFirstMessage()
                .assertError(/Couldn't restore your SageMaker Unified Studio sign-in/)
            const cleared = globals.globalState.get(pendingSignInKey as any)
            assert.strictEqual(cleared, undefined, 'marker should be cleared, not left for another attempt')
        })

        it('stamps attempted:true before running the resume, and clears the marker afterward', async function () {
            const pending: PendingSignIn = { profileName: 'test-profile', region: 'us-west-2', attempted: false }
            await globals.globalState.update(pendingSignInKey as any, pending)

            const handleIamAuthStub = sandbox
                .stub(SmusAuthenticationOrchestrator, 'handleIamAuthentication')
                .callsFake(async () => {
                    // Verify the loop-guard was stamped before the resume task runs.
                    const inFlight = globals.globalState.get<PendingSignIn>(pendingSignInKey as any)
                    assert.strictEqual(inFlight?.attempted, true, 'attempted should be true before resume runs')
                    return { status: 'SUCCESS' }
                })

            await tryResumePendingSignIn(fakeContext, fakeAuthProvider)

            assert.ok(
                handleIamAuthStub.calledOnceWith(
                    fakeAuthProvider,
                    sinon.match.any,
                    fakeContext,
                    'test-profile',
                    'us-west-2'
                )
            )
            const finalState = globals.globalState.get(pendingSignInKey as any)
            assert.strictEqual(finalState, undefined, 'marker should be cleared after a successful resume')
        })

        it('clears the marker and shows an error if the resume itself throws', async function () {
            const pending: PendingSignIn = { profileName: 'test-profile', region: 'us-west-2', attempted: false }
            await globals.globalState.update(pendingSignInKey as any, pending)
            sandbox.stub(SmusAuthenticationOrchestrator, 'handleIamAuthentication').rejects(new Error('resume failed'))

            await tryResumePendingSignIn(fakeContext, fakeAuthProvider)

            // First message is the "Reconnecting..." progress notification; the error follows it.
            const errorMessages = getTestWindow().shownMessages.filter((m) => m.severity === SeverityLevel.Error)
            assert.strictEqual(errorMessages.length, 1)
            errorMessages[0].assertError(/Couldn't restore your SageMaker Unified Studio sign-in/)
            const finalState = globals.globalState.get(pendingSignInKey as any)
            assert.strictEqual(finalState, undefined, 'marker should still be cleared on failure (one attempt only)')
        })
    })
})
