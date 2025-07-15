/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { LanguageClientAuth, SsoLogin, IamLogin } from '../../auth/auth2'
import { LanguageClient } from 'vscode-languageclient'
import {
    GetSsoTokenResult,
    GetIamCredentialResult,
    SsoTokenSourceKind,
    AuthorizationFlowKind,
    ListProfilesResult,
    UpdateCredentialsParams,
    SsoTokenChangedParams,
    StsCredentialChangedParams,
    bearerCredentialsUpdateRequestType,
    bearerCredentialsDeleteNotificationType,
    iamCredentialsUpdateRequestType,
    iamCredentialsDeleteNotificationType,
    ssoTokenChangedRequestType,
    stsCredentialChangedRequestType,
    SsoTokenChangedKind,
    StsCredentialChangedKind,
    invalidateSsoTokenRequestType,
    invalidateStsCredentialRequestType,
    ProfileKind,
    AwsErrorCodes,
} from '@aws/language-server-runtimes/protocol'
import * as ssoProvider from '../../auth/sso/ssoAccessTokenProvider'

const profileName = 'test-profile'
const sessionName = 'test-session'
const region = 'us-east-1'
const startUrl = 'test-url'
const tokenId = 'test-token'

describe('LanguageClientAuth', () => {
    let client: sinon.SinonStubbedInstance<LanguageClient>
    let auth: LanguageClientAuth
    const encryptionKey = Buffer.from('test-key')
    let useDeviceFlowStub: sinon.SinonStub

    beforeEach(() => {
        client = sinon.createStubInstance(LanguageClient)
        auth = new LanguageClientAuth(client as unknown as LanguageClient, 'testClient', encryptionKey)
        useDeviceFlowStub = sinon.stub(ssoProvider, 'useDeviceFlow')
    })

    afterEach(() => {
        sinon.restore()
    })

    describe('getSsoToken', () => {
        async function testGetSsoToken(useDeviceFlow: boolean) {
            const tokenSource = {
                kind: SsoTokenSourceKind.IamIdentityCenter,
                profileName,
            }
            useDeviceFlowStub.returns(useDeviceFlow ? true : false)

            await auth.getSsoToken(tokenSource, true)

            sinon.assert.calledOnce(client.sendRequest)
            sinon.assert.calledWith(
                client.sendRequest,
                sinon.match.any,
                sinon.match({
                    clientName: 'testClient',
                    source: tokenSource,
                    options: {
                        loginOnInvalidToken: true,
                        authorizationFlow: useDeviceFlow
                            ? AuthorizationFlowKind.DeviceCode
                            : AuthorizationFlowKind.Pkce,
                    },
                })
            )
        }

        it('sends correct request parameters for pkce flow', async () => {
            await testGetSsoToken(false)
        })

        it('sends correct request parameters for device code flow', async () => {
            await testGetSsoToken(true)
        })
    })

    describe('updateProfile', () => {
        it('sends correct profile update parameters', async () => {
            await auth.updateSsoProfile(profileName, startUrl, region, ['scope1'])

            sinon.assert.calledOnce(client.sendRequest)
            const requestParams = client.sendRequest.firstCall.args[1]
            sinon.assert.match(requestParams.profile, {
                name: profileName,
            })
            sinon.assert.match(requestParams.ssoSession.settings, {
                sso_region: region,
            })
        })

        it('sends correct IAM profile update parameters', async () => {
            await auth.updateIamProfile(profileName, 'accessKey', 'secretKey', 'sessionToken')

            sinon.assert.calledOnce(client.sendRequest)
            const requestParams = client.sendRequest.firstCall.args[1]
            sinon.assert.match(requestParams.profile, {
                name: profileName,
                kinds: [ProfileKind.IamUserProfile],
            })
            sinon.assert.match(requestParams.profile.settings, {
                aws_access_key_id: 'accessKey',
                aws_secret_access_key: 'secretKey',
                aws_session_token: 'sessionToken',
            })
        })
    })

    describe('getProfile', () => {
        const profile = { name: profileName, settings: { sso_session: sessionName } }
        const ssoSession = { name: sessionName, settings: { sso_region: region, sso_start_url: startUrl } }

        it('returns the correct profile and sso session', async () => {
            const mockListProfilesResult: ListProfilesResult = {
                profiles: [
                    {
                        ...profile,
                        kinds: [],
                    },
                ],
                ssoSessions: [ssoSession],
            }
            client.sendRequest.resolves(mockListProfilesResult)

            const result = await auth.getProfile(profileName)

            sinon.assert.calledOnce(client.sendRequest)
            sinon.assert.match(result, {
                profile,
                ssoSession,
            })
        })

        it('returns undefined for non-existent profile', async () => {
            const mockListProfilesResult: ListProfilesResult = {
                profiles: [],
                ssoSessions: [],
            }
            client.sendRequest.resolves(mockListProfilesResult)

            const result = await auth.getProfile('non-existent-profile')

            sinon.assert.calledOnce(client.sendRequest)
            sinon.assert.match(result, { profile: undefined, ssoSession: undefined })
        })
    })

    describe('updateBearerToken', () => {
        it('sends request', async () => {
            const updateParams: UpdateCredentialsParams = {
                data: 'token-data',
                encrypted: true,
            }

            await auth.updateBearerToken(updateParams)

            sinon.assert.calledOnce(client.sendRequest)
            sinon.assert.calledWith(client.sendRequest, bearerCredentialsUpdateRequestType.method, updateParams)
        })
    })

    describe('deleteBearerToken', () => {
        it('sends notification', async () => {
            auth.deleteBearerToken()

            sinon.assert.calledOnce(client.sendNotification)
            sinon.assert.calledWith(client.sendNotification, bearerCredentialsDeleteNotificationType.method)
        })
    })

    describe('updateIamCredential', () => {
        it('sends request', async () => {
            const updateParams: UpdateCredentialsParams = {
                data: 'credential-data',
                encrypted: true,
            }

            await auth.updateIamCredential(updateParams)

            sinon.assert.calledOnce(client.sendRequest)
            sinon.assert.calledWith(client.sendRequest, iamCredentialsUpdateRequestType.method, updateParams)
        })
    })

    describe('deleteIamCredential', () => {
        it('sends notification', async () => {
            auth.deleteIamCredential()

            sinon.assert.calledOnce(client.sendNotification)
            sinon.assert.calledWith(client.sendNotification, iamCredentialsDeleteNotificationType.method)
        })
    })

    describe('getIamCredential', () => {
        it('sends correct request parameters', async () => {
            await auth.getIamCredential(profileName, true)

            sinon.assert.calledOnce(client.sendRequest)
            sinon.assert.calledWith(
                client.sendRequest,
                sinon.match.any,
                sinon.match({
                    profileName: profileName,
                    options: {
                        generateOnInvalidStsCredential: true,
                    },
                })
            )
        })
    })

    describe('invalidateStsCredential', () => {
        it('sends request', async () => {
            client.sendRequest.resolves({ success: true })
            const result = await auth.invalidateStsCredential(profileName)

            sinon.assert.calledOnce(client.sendRequest)
            sinon.assert.calledWith(client.sendRequest, invalidateStsCredentialRequestType.method, { profileName: profileName })
            sinon.assert.match(result, { success: true })
        })
    })

    describe('registerStsCredentialChangedHandler', () => {
        it('registers the handler correctly', () => {
            const handler = sinon.spy()

            auth.registerStsCredentialChangedHandler(handler)

            sinon.assert.calledOnce(client.onNotification)
            sinon.assert.calledWith(client.onNotification, stsCredentialChangedRequestType.method, sinon.match.func)

            const credentialChangedParams: StsCredentialChangedParams = {
                kind: StsCredentialChangedKind.Refreshed,
                stsCredentialId: 'test-credential-id',
            }
            const registeredHandler = client.onNotification.firstCall.args[1]
            registeredHandler(credentialChangedParams)

            sinon.assert.calledOnce(handler)
            sinon.assert.calledWith(handler, credentialChangedParams)
        })
    })

    describe('invalidateSsoToken', () => {
        it('sends request', async () => {
            client.sendRequest.resolves({ success: true })
            const result = await auth.invalidateSsoToken(tokenId)

            sinon.assert.calledOnce(client.sendRequest)
            sinon.assert.calledWith(client.sendRequest, invalidateSsoTokenRequestType.method, { ssoTokenId: tokenId })
            sinon.assert.match(result, { success: true })
        })
    })

    describe('registerSsoTokenChangedHandler', () => {
        it('registers the handler correctly', () => {
            const handler = sinon.spy()

            auth.registerSsoTokenChangedHandler(handler)

            sinon.assert.calledOnce(client.onNotification)
            sinon.assert.calledWith(client.onNotification, ssoTokenChangedRequestType.method, sinon.match.func)

            // Simulate a token changed notification
            const tokenChangedParams: SsoTokenChangedParams = {
                kind: SsoTokenChangedKind.Refreshed,
                ssoTokenId: tokenId,
            }
            const registeredHandler = client.onNotification.firstCall.args[1]
            registeredHandler(tokenChangedParams)

            sinon.assert.calledOnce(handler)
            sinon.assert.calledWith(handler, tokenChangedParams)
        })
    })
})

describe('SsoLogin', () => {
    let lspAuth: sinon.SinonStubbedInstance<LanguageClientAuth>
    let ssoLogin: SsoLogin
    let eventEmitter: vscode.EventEmitter<any>
    let fireEventSpy: sinon.SinonSpy

    const loginOpts = {
        startUrl,
        region,
        scopes: ['scope1'],
    }

    const mockGetSsoTokenResponse: GetSsoTokenResult = {
        ssoToken: {
            id: tokenId,
            accessToken: 'encrypted-token',
        },
        updateCredentialsParams: {
            data: '',
        },
    }

    beforeEach(() => {
        lspAuth = sinon.createStubInstance(LanguageClientAuth)
        eventEmitter = new vscode.EventEmitter()
        fireEventSpy = sinon.spy(eventEmitter, 'fire')
        ssoLogin = new SsoLogin(profileName, lspAuth as any, eventEmitter)
        ;(ssoLogin as any).eventEmitter = eventEmitter
        ;(ssoLogin as any).connectionState = 'notConnected'
    })

    afterEach(() => {
        sinon.restore()
        eventEmitter.dispose()
    })

    describe('login', () => {
        it('updates profile and returns SSO token', async () => {
            lspAuth.updateSsoProfile.resolves()
            lspAuth.getSsoToken.resolves(mockGetSsoTokenResponse)

            const response = await ssoLogin.login(loginOpts)

            sinon.assert.calledOnce(lspAuth.updateSsoProfile)
            sinon.assert.calledWith(
                lspAuth.updateSsoProfile,
                profileName,
                loginOpts.startUrl,
                loginOpts.region,
                loginOpts.scopes
            )
            sinon.assert.calledOnce(lspAuth.getSsoToken)
            sinon.assert.match(ssoLogin.getConnectionState(), 'connected')
            sinon.assert.match(ssoLogin.data, {
                startUrl: loginOpts.startUrl,
                region: loginOpts.region,
            })
            sinon.assert.match(response.ssoToken.id, tokenId)
            sinon.assert.match(response.updateCredentialsParams, mockGetSsoTokenResponse.updateCredentialsParams)
        })
    })

    describe('reauthenticate', () => {
        it('throws when not connected', async () => {
            ;(ssoLogin as any).connectionState = 'notConnected'
            try {
                await ssoLogin.reauthenticate()
                sinon.assert.fail('Should have thrown an error')
            } catch (err) {
                sinon.assert.match((err as Error).message, 'Cannot reauthenticate when not connected.')
            }
        })

        it('returns new SSO token when connected', async () => {
            ;(ssoLogin as any).connectionState = 'connected'
            lspAuth.getSsoToken.resolves(mockGetSsoTokenResponse)

            const response = await ssoLogin.reauthenticate()

            sinon.assert.calledOnce(lspAuth.getSsoToken)
            sinon.assert.match(ssoLogin.getConnectionState(), 'connected')
            sinon.assert.match(response.ssoToken.id, tokenId)
            sinon.assert.match(response.updateCredentialsParams, mockGetSsoTokenResponse.updateCredentialsParams)
        })
    })

    describe('logout', () => {
        it('invalidates token and updates state', async () => {
            await ssoLogin.logout()

            sinon.assert.match(ssoLogin.getConnectionState(), 'notConnected')
            sinon.assert.match(ssoLogin.data, undefined)
        })

        it('emits state change event', async () => {
            ;(ssoLogin as any).connectionState = 'connected'
            ;(ssoLogin as any).ssoTokenId = tokenId
            ;(ssoLogin as any)._data = {
                startUrl: loginOpts.startUrl,
                region: loginOpts.region,
            }
            ;(ssoLogin as any).eventEmitter = eventEmitter

            lspAuth.invalidateSsoToken.resolves({ success: true })

            await ssoLogin.logout()

            sinon.assert.calledOnce(fireEventSpy)
            sinon.assert.calledWith(fireEventSpy, {
                id: profileName,
                state: 'notConnected',
            })
        })
    })

    describe('restore', () => {
        const mockProfile = {
            profile: {
                kinds: [ProfileKind.SsoTokenProfile],
                name: profileName,
            },
            ssoSession: {
                name: sessionName,
                settings: {
                    sso_region: region,
                    sso_start_url: startUrl,
                },
            },
        }

        it('restores connection state from existing profile', async () => {
            lspAuth.getProfile.resolves(mockProfile)
            lspAuth.getSsoToken.resolves(mockGetSsoTokenResponse)

            await ssoLogin.restore()

            sinon.assert.calledOnce(lspAuth.getProfile)
            sinon.assert.calledWith(lspAuth.getProfile, mockProfile.profile.name)
            sinon.assert.calledOnce(lspAuth.getSsoToken)
            sinon.assert.calledWith(
                lspAuth.getSsoToken,
                sinon.match({
                    kind: SsoTokenSourceKind.IamIdentityCenter,
                    profileName: mockProfile.profile.name,
                }),
                false // login parameter
            )

            sinon.assert.match(ssoLogin.data, {
                region: region,
                startUrl: startUrl,
            })
            sinon.assert.match(ssoLogin.getConnectionState(), 'connected')
            sinon.assert.match((ssoLogin as any).ssoTokenId, tokenId)
        })

        it('does not connect for non-existent profile', async () => {
            lspAuth.getProfile.resolves({ profile: undefined, ssoSession: undefined })

            await ssoLogin.restore()

            sinon.assert.calledOnce(lspAuth.getProfile)
            sinon.assert.calledOnce(lspAuth.getSsoToken)
            sinon.assert.match(ssoLogin.data, undefined)
            sinon.assert.match(ssoLogin.getConnectionState(), 'notConnected')
        })

        it('emits state change event on successful restore', async () => {
            ;(ssoLogin as any).eventEmitter = eventEmitter

            lspAuth.getProfile.resolves(mockProfile)
            lspAuth.getSsoToken.resolves(mockGetSsoTokenResponse)

            await ssoLogin.restore()

            sinon.assert.calledOnce(fireEventSpy)
            sinon.assert.calledWith(fireEventSpy, {
                id: profileName,
                state: 'connected',
            })
        })
    })

    describe('cancelLogin', () => {
        it('cancels and dispose token source', async () => {
            await ssoLogin.login(loginOpts).catch(() => {})

            ssoLogin.cancelLogin()

            const tokenSource = (ssoLogin as any).cancellationToken
            sinon.assert.match(tokenSource, undefined)
        })
    })

    describe('_getSsoToken', () => {
        beforeEach(() => {
            ;(ssoLogin as any).connectionState = 'connected'
        })

        const testErrorHandling = async (errorCode: string, expectedState: string, shouldEmitEvent: boolean = true) => {
            const error = new Error('Token error')
            ;(error as any).data = { awsErrorCode: errorCode }
            lspAuth.getSsoToken.rejects(error)

            try {
                await (ssoLogin as any)._getSsoToken(false)
                sinon.assert.fail('Should have thrown an error')
            } catch (err) {
                sinon.assert.match(err, error)
            }

            sinon.assert.match(ssoLogin.getConnectionState(), expectedState)

            if (shouldEmitEvent) {
                sinon.assert.calledWith(fireEventSpy, {
                    id: profileName,
                    state: expectedState,
                })
            }

            sinon.assert.match((ssoLogin as any).cancellationToken, undefined)
        }

        const notConnectedErrors = [
            AwsErrorCodes.E_CANCELLED,
            AwsErrorCodes.E_SSO_SESSION_NOT_FOUND,
            AwsErrorCodes.E_PROFILE_NOT_FOUND,
            AwsErrorCodes.E_INVALID_SSO_TOKEN,
        ]

        for (const errorCode of notConnectedErrors) {
            it(`handles ${errorCode} error`, async () => {
                await testErrorHandling(errorCode, 'notConnected')
            })
        }

        it('handles token refresh error', async () => {
            await testErrorHandling(AwsErrorCodes.E_CANNOT_REFRESH_SSO_TOKEN, 'expired')
        })

        it('handles unknown errors', async () => {
            await testErrorHandling('UNKNOWN_ERROR', ssoLogin.getConnectionState(), false)
        })

        it('returns correct response and cleans up cancellation token', async () => {
            lspAuth.getSsoToken.resolves(mockGetSsoTokenResponse)

            const response = await (ssoLogin as any)._getSsoToken(true)

            sinon.assert.calledWith(
                lspAuth.getSsoToken,
                sinon.match({
                    kind: SsoTokenSourceKind.IamIdentityCenter,
                    profileName,
                }),
                true
            )

            sinon.assert.match(response, mockGetSsoTokenResponse)
            sinon.assert.match((ssoLogin as any).cancellationToken, undefined)
        })

        it('updates state when token is retrieved successfully', async () => {
            ;(ssoLogin as any).connectionState = 'notConnected'
            lspAuth.getSsoToken.resolves(mockGetSsoTokenResponse)

            await (ssoLogin as any)._getSsoToken(true)

            sinon.assert.match(ssoLogin.getConnectionState(), 'connected')
            sinon.assert.match((ssoLogin as any).ssoTokenId, tokenId)
            sinon.assert.calledWith(fireEventSpy, {
                id: profileName,
                state: 'connected',
            })
        })
    })

    // describe('onDidChangeConnectionState', () => {
    //     it('should register handler for connection state changes', () => {
    //         const handler = sinon.spy()
    //         ssoLogin.onDidChangeConnectionState(handler)

    //         // Simulate state change
    //         ;(ssoLogin as any).updateConnectionState('connected')

    //         sinon.assert.calledWith(handler, {
    //             id: profileName,
    //             state: 'connected',
    //         })
    //     })
    // })

    describe('ssoTokenChangedHandler', () => {
        beforeEach(() => {
            ;(ssoLogin as any).ssoTokenId = tokenId
            ;(ssoLogin as any).connectionState = 'connected'
        })

        it('updates state when token expires', () => {
            ;(ssoLogin as any).ssoTokenChangedHandler({
                kind: 'Expired',
                ssoTokenId: tokenId,
            })

            sinon.assert.match(ssoLogin.getConnectionState(), 'expired')
            sinon.assert.calledOnce(fireEventSpy)
            sinon.assert.calledWith(fireEventSpy, {
                id: profileName,
                state: 'expired',
            })
        })

        it('emits refresh event when token is refreshed', () => {
            ;(ssoLogin as any).ssoTokenChangedHandler({
                kind: 'Refreshed',
                ssoTokenId: tokenId,
            })

            sinon.assert.calledOnce(fireEventSpy)
            sinon.assert.calledWith(fireEventSpy, {
                id: profileName,
                state: 'refreshed',
            })
        })

        it('does not emit event for different token ID', () => {
            ;(ssoLogin as any).ssoTokenChangedHandler({
                kind: 'Refreshed',
                ssoTokenId: 'different-token-id',
            })

            sinon.assert.notCalled(fireEventSpy)
        })
    })
})

describe('IamLogin', () => {
    let lspAuth: sinon.SinonStubbedInstance<LanguageClientAuth>
    let iamLogin: IamLogin
    let eventEmitter: vscode.EventEmitter<any>
    let fireEventSpy: sinon.SinonSpy

    const loginOpts = {
        accessKey: 'test-access-key',
        secretKey: 'test-secret-key',
        sessionToken: 'test-session-token',
    }

    const mockGetIamCredentialResponse: GetIamCredentialResult = {
        id: 'test-credential-id',
        credentials: {
            accessKeyId: 'encrypted-access-key',
            secretAccessKey: 'encrypted-secret-key',
            sessionToken: 'encrypted-session-token',
        },
        updateCredentialsParams: {
            data: 'credential-data',
        },
    }

    beforeEach(() => {
        lspAuth = sinon.createStubInstance(LanguageClientAuth)
        eventEmitter = new vscode.EventEmitter()
        fireEventSpy = sinon.spy(eventEmitter, 'fire')
        iamLogin = new IamLogin(profileName, lspAuth as any, eventEmitter)
        ;(iamLogin as any).eventEmitter = eventEmitter
        ;(iamLogin as any).connectionState = 'notConnected'
    })

    afterEach(() => {
        sinon.restore()
        eventEmitter.dispose()
    })

    describe('login', () => {
        it('updates profile and returns IAM credential', async () => {
            lspAuth.updateIamProfile.resolves()
            lspAuth.getIamCredential.resolves(mockGetIamCredentialResponse)

            const response = await iamLogin.login(loginOpts)

            sinon.assert.calledOnce(lspAuth.updateIamProfile)
            sinon.assert.calledWith(
                lspAuth.updateIamProfile,
                profileName,
                loginOpts.accessKey,
                loginOpts.secretKey,
                loginOpts.sessionToken,
                '',
                ''
            )
            sinon.assert.calledOnce(lspAuth.getIamCredential)
            sinon.assert.match(iamLogin.getConnectionState(), 'connected')
            sinon.assert.match(response.id, 'test-credential-id')
        })
    })

    describe('reauthenticate', () => {
        it('throws when not connected', async () => {
            ;(iamLogin as any).connectionState = 'notConnected'
            try {
                await iamLogin.reauthenticate()
                sinon.assert.fail('Should have thrown an error')
            } catch (err) {
                sinon.assert.match((err as Error).message, 'Cannot reauthenticate when not connected.')
            }
        })

        it('returns new IAM credential when connected', async () => {
            ;(iamLogin as any).connectionState = 'connected'
            lspAuth.getIamCredential.resolves(mockGetIamCredentialResponse)

            const response = await iamLogin.reauthenticate()

            sinon.assert.calledOnce(lspAuth.getIamCredential)
            sinon.assert.match(iamLogin.getConnectionState(), 'connected')
            sinon.assert.match(response.id, 'test-credential-id')
        })
    })

    describe('logout', () => {
        it('invalidates credential and updates state', async () => {
            ;(iamLogin as any).iamCredentialId = 'test-credential-id'
            lspAuth.invalidateStsCredential.resolves({ success: true })
            lspAuth.updateIamProfile.resolves()

            await iamLogin.logout()

            sinon.assert.calledOnce(lspAuth.invalidateStsCredential)
            sinon.assert.calledWith(lspAuth.invalidateStsCredential, 'test-credential-id')
            sinon.assert.match(iamLogin.getConnectionState(), 'notConnected')
            sinon.assert.match(iamLogin.data, undefined)
        })
    })

    describe('restore', () => {
        it('restores connection state', async () => {
            lspAuth.getIamCredential.resolves(mockGetIamCredentialResponse)

            await iamLogin.restore()

            sinon.assert.calledOnce(lspAuth.getIamCredential)
            sinon.assert.calledWith(lspAuth.getIamCredential, profileName, false)
            sinon.assert.match(iamLogin.getConnectionState(), 'connected')
        })
    })

    describe('_getIamCredential', () => {
        const testErrorHandling = async (errorCode: string, expectedState: string) => {
            const error = new Error('Credential error')
            ;(error as any).data = { awsErrorCode: errorCode }
            lspAuth.getIamCredential.rejects(error)

            try {
                await (iamLogin as any)._getIamCredential(false)
                sinon.assert.fail('Should have thrown an error')
            } catch (err) {
                sinon.assert.match(err, error)
            }

            sinon.assert.match(iamLogin.getConnectionState(), expectedState)
        }

        const notConnectedErrors = [
            AwsErrorCodes.E_CANCELLED,
            AwsErrorCodes.E_INVALID_PROFILE,
            AwsErrorCodes.E_PROFILE_NOT_FOUND,
            AwsErrorCodes.E_CANNOT_CREATE_STS_CREDENTIAL,
            AwsErrorCodes.E_INVALID_STS_CREDENTIAL,
        ]

        for (const errorCode of notConnectedErrors) {
            it(`handles ${errorCode} error`, async () => {
                await testErrorHandling(errorCode, 'notConnected')
            })
        }

        it('returns correct response and updates state', async () => {
            lspAuth.getIamCredential.resolves(mockGetIamCredentialResponse)

            const response = await (iamLogin as any)._getIamCredential(true)

            sinon.assert.calledWith(lspAuth.getIamCredential, profileName, true)
            sinon.assert.match(response, mockGetIamCredentialResponse)
            sinon.assert.match(iamLogin.getConnectionState(), 'connected')
            sinon.assert.match((iamLogin as any).iamCredentialId, 'test-credential-id')
        })
    })

    describe('stsCredentialChangedHandler', () => {
        beforeEach(() => {
            ;(iamLogin as any).iamCredentialId = 'test-credential-id'
            ;(iamLogin as any).connectionState = 'connected'
        })

        it('updates state when credential expires', () => {
            ;(iamLogin as any).stsCredentialChangedHandler({
                kind: StsCredentialChangedKind.Expired,
                stsCredentialId: 'test-credential-id',
            })

            sinon.assert.match(iamLogin.getConnectionState(), 'expired')
            sinon.assert.calledOnce(fireEventSpy)
            sinon.assert.calledWith(fireEventSpy, {
                id: profileName,
                state: 'expired',
            })
        })

        it('emits refresh event when credential is refreshed', () => {
            ;(iamLogin as any).stsCredentialChangedHandler({
                kind: StsCredentialChangedKind.Refreshed,
                stsCredentialId: 'test-credential-id',
            })

            sinon.assert.calledOnce(fireEventSpy)
            sinon.assert.calledWith(fireEventSpy, {
                id: profileName,
                state: 'refreshed',
            })
        })

        it('does not emit event for different credential ID', () => {
            ;(iamLogin as any).stsCredentialChangedHandler({
                kind: StsCredentialChangedKind.Refreshed,
                stsCredentialId: 'different-credential-id',
            })

            sinon.assert.notCalled(fireEventSpy)
        })
    })
})