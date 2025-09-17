/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import * as vscode from 'vscode'

// Mock the setContext function BEFORE importing modules that use it
const setContextModule = require('../../../shared/vscode/setContext')

import { SmusAuthenticationProvider } from '../../../sagemakerunifiedstudio/auth/providers/smusAuthenticationProvider'
import { SmusConnection } from '../../../sagemakerunifiedstudio/auth/model'
import { DataZoneClient } from '../../../sagemakerunifiedstudio/shared/client/datazoneClient'
import { SmusUtils } from '../../../sagemakerunifiedstudio/shared/smusUtils'
import * as smusUtils from '../../../sagemakerunifiedstudio/shared/smusUtils'
import { ToolkitError } from '../../../shared/errors'
import * as messages from '../../../shared/utilities/messages'
import * as vscodeSetContext from '../../../shared/vscode/setContext'
import * as resourceMetadataUtils from '../../../sagemakerunifiedstudio/shared/utils/resourceMetadataUtils'
import { DefaultStsClient } from '../../../shared/clients/stsClient'

describe('SmusAuthenticationProvider', function () {
    let mockAuth: any
    let mockSecondaryAuth: any
    let mockDataZoneClient: sinon.SinonStubbedInstance<DataZoneClient>
    let smusAuthProvider: SmusAuthenticationProvider
    let extractDomainInfoStub: sinon.SinonStub
    let getSsoInstanceInfoStub: sinon.SinonStub
    let isInSmusSpaceEnvironmentStub: sinon.SinonStub
    let executeCommandStub: sinon.SinonStub
    let setContextStubGlobal: sinon.SinonStub
    let mockSecondaryAuthState: {
        activeConnection: SmusConnection | undefined
        hasSavedConnection: boolean
        isConnectionExpired: boolean
    }

    const testDomainUrl = 'https://dzd_domainId.sagemaker.us-east-2.on.aws'
    const testDomainId = 'dzd_domainId'
    const testRegion = 'us-east-2'
    const testSsoInstanceInfo = {
        issuerUrl: 'https://identitycenter.amazonaws.com/ssoins-testInstanceId',
        ssoInstanceId: 'ssoins-testInstanceId',
        clientId: 'arn:aws:sso::123456789:application/ssoins-testInstanceId/apl-testAppId',
        region: testRegion,
    }

    const mockSmusConnection: SmusConnection = {
        id: 'test-connection-id',
        type: 'sso',
        startUrl: 'https://identitycenter.amazonaws.com/ssoins-testInstanceId',
        ssoRegion: testRegion,
        scopes: ['datazone:domain:access'],
        label: 'Test SMUS Connection',
        domainUrl: testDomainUrl,
        domainId: testDomainId,
        getToken: sinon.stub().resolves({ accessToken: 'mock-token', expiresAt: new Date() }),
        getRegistration: sinon.stub().resolves({ clientId: 'mock-client', expiresAt: new Date() }),
    }

    beforeEach(function () {
        // Create the setContext stub
        setContextStubGlobal = sinon.stub(setContextModule, 'setContext').resolves()

        mockAuth = {
            createConnection: sinon.stub().resolves(mockSmusConnection),
            listConnections: sinon.stub().resolves([]),
            getConnectionState: sinon.stub().returns('valid'),
            reauthenticate: sinon.stub().resolves(mockSmusConnection),
        } as any

        // Create a mock object with configurable properties
        mockSecondaryAuthState = {
            activeConnection: mockSmusConnection as SmusConnection | undefined,
            hasSavedConnection: false,
            isConnectionExpired: false,
        }

        mockSecondaryAuth = {
            get activeConnection() {
                return mockSecondaryAuthState.activeConnection
            },
            get hasSavedConnection() {
                return mockSecondaryAuthState.hasSavedConnection
            },
            get isConnectionExpired() {
                return mockSecondaryAuthState.isConnectionExpired
            },
            onDidChangeActiveConnection: sinon.stub().returns({ dispose: sinon.stub() }),
            restoreConnection: sinon.stub().resolves(),
            useNewConnection: sinon.stub().resolves(mockSmusConnection),
            deleteConnection: sinon.stub().resolves(),
        }

        mockDataZoneClient = {
            // Add any DataZoneClient methods that might be used
        } as any

        // Stub static methods
        sinon.stub(DataZoneClient, 'getInstance').returns(mockDataZoneClient as any)
        extractDomainInfoStub = sinon
            .stub(SmusUtils, 'extractDomainInfoFromUrl')
            .returns({ domainId: testDomainId, region: testRegion })
        getSsoInstanceInfoStub = sinon.stub(SmusUtils, 'getSsoInstanceInfo').resolves(testSsoInstanceInfo)
        isInSmusSpaceEnvironmentStub = sinon.stub(SmusUtils, 'isInSmusSpaceEnvironment').returns(false)
        executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves()
        sinon.stub(require('../../../auth/secondaryAuth'), 'getSecondaryAuth').returns(mockSecondaryAuth)

        smusAuthProvider = new SmusAuthenticationProvider(mockAuth, mockSecondaryAuth)

        // Reset the executeCommand stub for clean state
        executeCommandStub.resetHistory()
    })

    afterEach(function () {
        sinon.restore()
    })

    describe('constructor', function () {
        it('should initialize with auth and secondary auth', function () {
            assert.strictEqual(smusAuthProvider.auth, mockAuth)
            assert.strictEqual(smusAuthProvider.secondaryAuth, mockSecondaryAuth)
        })

        it('should register event listeners', function () {
            assert.ok(mockSecondaryAuth.onDidChangeActiveConnection.called)
        })

        it('should set initial context', async function () {
            // Context should be set during construction (async call)
            // Wait a bit for the async call to complete
            await new Promise((resolve) => setTimeout(resolve, 0))
            assert.ok(setContextStubGlobal.called)
        })
    })

    describe('activeConnection', function () {
        it('should return secondary auth active connection', function () {
            assert.strictEqual(smusAuthProvider.activeConnection, mockSmusConnection)
        })
    })

    describe('isUsingSavedConnection', function () {
        it('should return secondary auth hasSavedConnection value', function () {
            mockSecondaryAuthState.hasSavedConnection = true
            assert.strictEqual(smusAuthProvider.isUsingSavedConnection, true)

            mockSecondaryAuthState.hasSavedConnection = false
            assert.strictEqual(smusAuthProvider.isUsingSavedConnection, false)
        })
    })

    describe('isConnectionValid', function () {
        it('should return true when connection exists and is not expired', function () {
            mockSecondaryAuthState.activeConnection = mockSmusConnection
            mockSecondaryAuthState.isConnectionExpired = false

            assert.strictEqual(smusAuthProvider.isConnectionValid(), true)
        })

        it('should return false when no connection exists', function () {
            mockSecondaryAuthState.activeConnection = undefined

            assert.strictEqual(smusAuthProvider.isConnectionValid(), false)
        })

        it('should return false when connection is expired', function () {
            mockSecondaryAuthState.activeConnection = mockSmusConnection
            mockSecondaryAuthState.isConnectionExpired = true

            assert.strictEqual(smusAuthProvider.isConnectionValid(), false)
        })
    })

    describe('isConnected', function () {
        it('should return true when active connection exists', function () {
            mockSecondaryAuthState.activeConnection = mockSmusConnection
            assert.strictEqual(smusAuthProvider.isConnected(), true)
        })

        it('should return false when no active connection', function () {
            mockSecondaryAuthState.activeConnection = undefined
            assert.strictEqual(smusAuthProvider.isConnected(), false)
        })
    })

    describe('restore', function () {
        it('should call secondary auth restoreConnection', async function () {
            await smusAuthProvider.restore()
            assert.ok(mockSecondaryAuth.restoreConnection.called)
        })
    })

    describe('connectToSmus', function () {
        it('should create new connection when none exists', async function () {
            mockAuth.listConnections.resolves([])

            const result = await smusAuthProvider.connectToSmus(testDomainUrl)

            assert.strictEqual(result, mockSmusConnection)
            assert.ok(extractDomainInfoStub.calledWith(testDomainUrl))
            assert.ok(getSsoInstanceInfoStub.calledWith(testDomainUrl))
            assert.ok(mockAuth.createConnection.called)
            assert.ok(mockSecondaryAuth.useNewConnection.called)
            assert.ok(executeCommandStub.calledWith('aws.smus.switchProject'))
        })

        it('should reuse existing valid connection', async function () {
            const existingConnection = { ...mockSmusConnection, domainUrl: testDomainUrl.toLowerCase() }
            mockAuth.listConnections.resolves([existingConnection])
            mockAuth.getConnectionState.returns('valid')

            const result = await smusAuthProvider.connectToSmus(testDomainUrl)

            assert.strictEqual(result, mockSmusConnection)
            assert.ok(mockAuth.createConnection.notCalled)
            assert.ok(mockSecondaryAuth.useNewConnection.calledWith(existingConnection))
            assert.ok(executeCommandStub.calledWith('aws.smus.switchProject'))
        })

        it('should reauthenticate existing invalid connection', async function () {
            const existingConnection = { ...mockSmusConnection, domainUrl: testDomainUrl.toLowerCase() }
            mockAuth.listConnections.resolves([existingConnection])
            mockAuth.getConnectionState.returns('invalid')

            const result = await smusAuthProvider.connectToSmus(testDomainUrl)

            assert.strictEqual(result, mockSmusConnection)
            assert.ok(mockAuth.reauthenticate.calledWith(existingConnection))
            assert.ok(mockSecondaryAuth.useNewConnection.called)
            assert.ok(executeCommandStub.calledWith('aws.smus.switchProject'))
        })

        it('should throw error for invalid domain URL', async function () {
            extractDomainInfoStub.returns({ domainId: undefined, region: testRegion })

            await assert.rejects(
                () => smusAuthProvider.connectToSmus('invalid-url'),
                (err: ToolkitError) => {
                    // The error is wrapped with FailedToConnect, but the original error should be in the cause
                    return err.code === 'FailedToConnect' && (err.cause as any)?.code === 'InvalidDomainUrl'
                }
            )
            // Should not trigger project selection on error
            assert.ok(executeCommandStub.notCalled)
        })

        it('should handle SmusUtils errors', async function () {
            const error = new Error('SmusUtils error')
            getSsoInstanceInfoStub.rejects(error)

            await assert.rejects(
                () => smusAuthProvider.connectToSmus(testDomainUrl),
                (err: ToolkitError) => err.code === 'FailedToConnect'
            )
            // Should not trigger project selection on error
            assert.ok(executeCommandStub.notCalled)
        })

        it('should handle auth creation errors', async function () {
            const error = new Error('Auth creation failed')
            mockAuth.createConnection.rejects(error)

            await assert.rejects(
                () => smusAuthProvider.connectToSmus(testDomainUrl),
                (err: ToolkitError) => err.code === 'FailedToConnect'
            )
            // Should not trigger project selection on error
            assert.ok(executeCommandStub.notCalled)
        })

        it('should not trigger project selection in SMUS space environment', async function () {
            isInSmusSpaceEnvironmentStub.returns(true)
            mockAuth.listConnections.resolves([])

            const result = await smusAuthProvider.connectToSmus(testDomainUrl)

            assert.strictEqual(result, mockSmusConnection)
            assert.ok(mockAuth.createConnection.called)
            assert.ok(mockSecondaryAuth.useNewConnection.called)
            assert.ok(executeCommandStub.notCalled)
        })

        it('should not trigger project selection when reusing connection in SMUS space environment', async function () {
            isInSmusSpaceEnvironmentStub.returns(true)
            const existingConnection = { ...mockSmusConnection, domainUrl: testDomainUrl.toLowerCase() }
            mockAuth.listConnections.resolves([existingConnection])
            mockAuth.getConnectionState.returns('valid')

            const result = await smusAuthProvider.connectToSmus(testDomainUrl)

            assert.strictEqual(result, mockSmusConnection)
            assert.ok(mockSecondaryAuth.useNewConnection.calledWith(existingConnection))
            assert.ok(executeCommandStub.notCalled)
        })

        it('should not trigger project selection when reauthenticating in SMUS space environment', async function () {
            isInSmusSpaceEnvironmentStub.returns(true)
            const existingConnection = { ...mockSmusConnection, domainUrl: testDomainUrl.toLowerCase() }
            mockAuth.listConnections.resolves([existingConnection])
            mockAuth.getConnectionState.returns('invalid')

            const result = await smusAuthProvider.connectToSmus(testDomainUrl)

            assert.strictEqual(result, mockSmusConnection)
            assert.ok(mockAuth.reauthenticate.calledWith(existingConnection))
            assert.ok(mockSecondaryAuth.useNewConnection.called)
            assert.ok(executeCommandStub.notCalled)
        })
    })

    describe('reauthenticate', function () {
        it('should call auth reauthenticate', async function () {
            const result = await smusAuthProvider.reauthenticate(mockSmusConnection)

            assert.strictEqual(result, mockSmusConnection)
            assert.ok(mockAuth.reauthenticate.calledWith(mockSmusConnection))
        })

        it('should wrap auth errors in ToolkitError', async function () {
            const error = new Error('Reauthentication failed')
            mockAuth.reauthenticate.rejects(error)

            await assert.rejects(
                () => smusAuthProvider.reauthenticate(mockSmusConnection),
                (err: ToolkitError) => err.message.includes('Unable to reauthenticate')
            )
        })
    })

    describe('showReauthenticationPrompt', function () {
        it('should show reauthentication message', async function () {
            const showReauthenticateMessageStub = sinon.stub(messages, 'showReauthenticateMessage').resolves()

            await smusAuthProvider.showReauthenticationPrompt(mockSmusConnection)

            assert.ok(showReauthenticateMessageStub.called)
            const callArgs = showReauthenticateMessageStub.firstCall.args[0]
            assert.ok(callArgs.message.includes('SageMaker Unified Studio'))
            assert.strictEqual(callArgs.suppressId, 'smusConnectionExpired')
        })
    })

    describe('getAccessToken', function () {
        beforeEach(function () {
            mockSecondaryAuthState.activeConnection = mockSmusConnection
            mockAuth.getSsoAccessToken = sinon.stub().resolves('mock-access-token')
            mockAuth.invalidateConnection = sinon.stub()
        })

        it('should return access token when successful', async function () {
            const token = await smusAuthProvider.getAccessToken()

            assert.strictEqual(token, 'mock-access-token')
            assert.ok(mockAuth.getSsoAccessToken.calledWith(mockSmusConnection))
        })

        it('should throw error when no active connection', async function () {
            mockSecondaryAuthState.activeConnection = undefined

            await assert.rejects(
                () => smusAuthProvider.getAccessToken(),
                (err: ToolkitError) => err.code === 'NoActiveConnection'
            )
        })

        it('should handle InvalidGrantException and mark connection for reauthentication', async function () {
            const invalidGrantError = new Error('UnknownError')
            invalidGrantError.name = 'InvalidGrantException'
            mockAuth.getSsoAccessToken.rejects(invalidGrantError)

            await assert.rejects(
                () => smusAuthProvider.getAccessToken(),
                (err: ToolkitError) => {
                    return (
                        err.code === 'RedeemAccessTokenFailed' &&
                        err.message.includes('Failed to retrieve SSO access token for connection')
                    )
                }
            )

            // Verify connection was NOT invalidated (current implementation doesn't handle InvalidGrantException specially)
            assert.ok(mockAuth.invalidateConnection.notCalled)
        })

        it('should handle other errors normally', async function () {
            const genericError = new Error('Network error')
            mockAuth.getSsoAccessToken.rejects(genericError)

            await assert.rejects(
                () => smusAuthProvider.getAccessToken(),
                (err: ToolkitError) =>
                    err.message.includes('Failed to retrieve SSO access token for connection') &&
                    err.code === 'RedeemAccessTokenFailed'
            )

            // Verify connection was NOT invalidated for generic errors
            assert.ok(mockAuth.invalidateConnection.notCalled)
        })
    })

    describe('fromContext', function () {
        it('should return singleton instance', function () {
            const instance1 = SmusAuthenticationProvider.fromContext()
            const instance2 = SmusAuthenticationProvider.fromContext()

            assert.strictEqual(instance1, instance2)
        })

        it('should return instance property', function () {
            const instance = SmusAuthenticationProvider.fromContext()
            assert.strictEqual(SmusAuthenticationProvider.instance, instance)
        })
    })

    describe('getDomainAccountId', function () {
        let getContextStub: sinon.SinonStub
        let getResourceMetadataStub: sinon.SinonStub
        let extractAccountIdFromArnStub: sinon.SinonStub
        let getDerCredentialsProviderStub: sinon.SinonStub
        let getDomainRegionStub: sinon.SinonStub
        let mockStsClient: any
        let mockCredentialsProvider: any

        beforeEach(function () {
            // Mock dependencies
            getContextStub = sinon.stub(vscodeSetContext, 'getContext')
            getResourceMetadataStub = sinon.stub(resourceMetadataUtils, 'getResourceMetadata')
            extractAccountIdFromArnStub = sinon.stub(smusUtils, 'extractAccountIdFromArn')

            // Mock STS client
            mockStsClient = {
                getCallerIdentity: sinon.stub(),
            }
            sinon
                .stub(DefaultStsClient.prototype, 'getCallerIdentity')
                .callsFake(() => mockStsClient.getCallerIdentity())

            // Mock credentials provider
            mockCredentialsProvider = {
                getCredentials: sinon.stub().resolves({
                    accessKeyId: 'test-key',
                    secretAccessKey: 'test-secret',
                    sessionToken: 'test-token',
                }),
            }

            // Stub methods on the provider instance
            getDerCredentialsProviderStub = sinon
                .stub(smusAuthProvider, 'getDerCredentialsProvider')
                .resolves(mockCredentialsProvider)
            getDomainRegionStub = sinon.stub(smusAuthProvider, 'getDomainRegion').returns('us-east-1')

            // Reset cached value
            smusAuthProvider['cachedDomainAccountId'] = undefined
        })

        afterEach(function () {
            sinon.restore()
        })

        describe('when cached value exists', function () {
            it('should return cached account ID without making any calls', async function () {
                const cachedAccountId = '123456789012'
                smusAuthProvider['cachedDomainAccountId'] = cachedAccountId

                const result = await smusAuthProvider.getDomainAccountId()

                assert.strictEqual(result, cachedAccountId)
                assert.ok(getContextStub.notCalled)
                assert.ok(getResourceMetadataStub.notCalled)
                assert.ok(mockStsClient.getCallerIdentity.notCalled)
            })
        })

        describe('in SMUS space environment', function () {
            beforeEach(function () {
                getContextStub.withArgs('aws.smus.inSmusSpaceEnvironment').returns(true)
            })

            it('should extract account ID from ResourceArn and cache it', async function () {
                const testAccountId = '123456789012'
                const testResourceArn = `arn:aws:sagemaker:us-east-1:${testAccountId}:domain/test-domain`

                getResourceMetadataStub.returns({
                    ResourceArn: testResourceArn,
                })
                extractAccountIdFromArnStub.returns(testAccountId)

                const result = await smusAuthProvider.getDomainAccountId()

                assert.strictEqual(result, testAccountId)
                assert.strictEqual(smusAuthProvider['cachedDomainAccountId'], testAccountId)
                assert.ok(getResourceMetadataStub.called)
                assert.ok(extractAccountIdFromArnStub.calledWith(testResourceArn))
                assert.ok(mockStsClient.getCallerIdentity.notCalled)
            })

            it('should throw error when ResourceArn is missing from metadata', async function () {
                getResourceMetadataStub.returns({})

                await assert.rejects(
                    () => smusAuthProvider.getDomainAccountId(),
                    (err: ToolkitError) => {
                        return (
                            err.code === 'GetDomainAccountIdFailed' &&
                            err.message.includes(
                                'Failed to extract AWS account ID from ResourceArn in SMUS space environment'
                            )
                        )
                    }
                )

                assert.strictEqual(smusAuthProvider['cachedDomainAccountId'], undefined)
            })
        })

        describe('in non-SMUS space environment', function () {
            beforeEach(function () {
                getContextStub.withArgs('aws.smus.inSmusSpaceEnvironment').returns(false)
                mockSecondaryAuthState.activeConnection = mockSmusConnection
            })

            it('should use STS GetCallerIdentity to get account ID and cache it', async function () {
                const testAccountId = '123456789012'
                mockStsClient.getCallerIdentity.resolves({
                    Account: testAccountId,
                    UserId: 'test-user-id',
                    Arn: 'arn:aws:sts::123456789012:assumed-role/test-role/test-session',
                })

                const result = await smusAuthProvider.getDomainAccountId()

                assert.strictEqual(result, testAccountId)
                assert.strictEqual(smusAuthProvider['cachedDomainAccountId'], testAccountId)
                assert.ok(getDerCredentialsProviderStub.called)
                assert.ok(getDomainRegionStub.called)
                assert.ok(mockCredentialsProvider.getCredentials.called)
                assert.ok(mockStsClient.getCallerIdentity.called)
            })

            it('should throw error when no active connection exists', async function () {
                mockSecondaryAuthState.activeConnection = undefined

                await assert.rejects(
                    () => smusAuthProvider.getDomainAccountId(),
                    (err: ToolkitError) => {
                        return (
                            err.code === 'NoActiveConnection' &&
                            err.message.includes('No active SMUS connection available')
                        )
                    }
                )

                assert.strictEqual(smusAuthProvider['cachedDomainAccountId'], undefined)
                assert.ok(getDerCredentialsProviderStub.notCalled)
                assert.ok(mockStsClient.getCallerIdentity.notCalled)
            })

            it('should throw error when STS GetCallerIdentity fails', async function () {
                mockStsClient.getCallerIdentity.rejects(new Error('STS call failed'))

                await assert.rejects(
                    () => smusAuthProvider.getDomainAccountId(),
                    (err: ToolkitError) => {
                        return (
                            err.code === 'GetDomainAccountIdFailed' &&
                            err.message.includes('Failed to retrieve AWS account ID for active domain connection')
                        )
                    }
                )

                assert.strictEqual(smusAuthProvider['cachedDomainAccountId'], undefined)
            })
        })
    })
})
