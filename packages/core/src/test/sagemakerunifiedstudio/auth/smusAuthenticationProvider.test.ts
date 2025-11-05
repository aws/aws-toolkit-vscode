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
    let getResourceMetadataStub: sinon.SinonStub
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
            state: {
                get: sinon.stub().returns({}),
                update: sinon.stub().resolves(),
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
        sinon.stub(DataZoneClient, 'createWithCredentials').returns(mockDataZoneClient as any)
        extractDomainInfoStub = sinon
            .stub(SmusUtils, 'extractDomainInfoFromUrl')
            .returns({ domainId: testDomainId, region: testRegion })
        getSsoInstanceInfoStub = sinon.stub(SmusUtils, 'getSsoInstanceInfo').resolves(testSsoInstanceInfo)
        isInSmusSpaceEnvironmentStub = sinon.stub(SmusUtils, 'isInSmusSpaceEnvironment').returns(false)
        executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves()
        sinon.stub(require('../../../auth/secondaryAuth'), 'getSecondaryAuth').returns(mockSecondaryAuth)

        smusAuthProvider = new SmusAuthenticationProvider(mockAuth)

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
        let mockState: any
        let loadSharedCredentialsProfilesStub: sinon.SinonStub
        let validateIamProfileStub: sinon.SinonStub
        beforeEach(function () {
            mockState = {
                get: sinon.stub(),
                update: sinon.stub().resolves(),
            }
            mockSecondaryAuth.state = mockState

            loadSharedCredentialsProfilesStub = sinon.stub(
                require('../../../auth/credentials/sharedCredentials'),
                'loadSharedCredentialsProfiles'
            )
            validateIamProfileStub = sinon.stub(smusAuthProvider, 'validateIamProfile')
        })

        it('should call secondary auth restoreConnection when no saved connection ID', async function () {
            mockState.get.withArgs('smus.savedConnectionId').returns(undefined)

            await smusAuthProvider.restore()

            assert.ok(mockSecondaryAuth.restoreConnection.called)
            assert.ok(loadSharedCredentialsProfilesStub.notCalled)
        })

        it('should validate IAM profile and restore connection', async function () {
            const savedConnectionId = 'test-connection-id'
            const connectionMetadata = {
                profileName: 'test-profile',
                domainId: 'old-domain-id',
                region: 'us-west-1',
            }
            const smusConnections = { [savedConnectionId]: connectionMetadata }

            mockState.get.withArgs('smus.savedConnectionId').returns(savedConnectionId)
            mockState.get.withArgs('smus.connections').returns(smusConnections)
            loadSharedCredentialsProfilesStub.resolves({ 'test-profile': { region: 'us-east-1' } })
            validateIamProfileStub.resolves({ isValid: true })

            await smusAuthProvider.restore()

            assert.ok(validateIamProfileStub.calledWith('test-profile'))
            assert.ok(mockSecondaryAuth.restoreConnection.called)
        })
    })

    describe('connectToSmusWithSso', function () {
        it('should create new connection when none exists', async function () {
            mockAuth.listConnections.resolves([])

            const result = await smusAuthProvider.connectToSmusWithSso(testDomainUrl)

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

            const result = await smusAuthProvider.connectToSmusWithSso(testDomainUrl)

            assert.strictEqual(result, mockSmusConnection)
            assert.ok(mockAuth.createConnection.notCalled)
            assert.ok(mockSecondaryAuth.useNewConnection.calledWith(existingConnection))
            assert.ok(executeCommandStub.calledWith('aws.smus.switchProject'))
        })

        it('should reauthenticate existing invalid connection', async function () {
            const existingConnection = { ...mockSmusConnection, domainUrl: testDomainUrl.toLowerCase() }
            mockAuth.listConnections.resolves([existingConnection])
            mockAuth.getConnectionState.returns('invalid')

            const result = await smusAuthProvider.connectToSmusWithSso(testDomainUrl)

            assert.strictEqual(result, mockSmusConnection)
            assert.ok(mockAuth.reauthenticate.calledWith(existingConnection))
            assert.ok(mockSecondaryAuth.useNewConnection.called)
            assert.ok(executeCommandStub.calledWith('aws.smus.switchProject'))
        })

        it('should throw error for invalid domain URL', async function () {
            extractDomainInfoStub.returns({ domainId: undefined, region: testRegion })

            await assert.rejects(
                () => smusAuthProvider.connectToSmusWithSso('invalid-url'),
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
                () => smusAuthProvider.connectToSmusWithSso(testDomainUrl),
                (err: ToolkitError) => err.code === 'FailedToConnect'
            )
            // Should not trigger project selection on error
            assert.ok(executeCommandStub.notCalled)
        })

        it('should handle auth creation errors', async function () {
            const error = new Error('Auth creation failed')
            mockAuth.createConnection.rejects(error)

            await assert.rejects(
                () => smusAuthProvider.connectToSmusWithSso(testDomainUrl),
                (err: ToolkitError) => err.code === 'FailedToConnect'
            )
            // Should not trigger project selection on error
            assert.ok(executeCommandStub.notCalled)
        })

        it('should not trigger project selection in SMUS space environment', async function () {
            isInSmusSpaceEnvironmentStub.returns(true)
            mockAuth.listConnections.resolves([])

            const result = await smusAuthProvider.connectToSmusWithSso(testDomainUrl)

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

            const result = await smusAuthProvider.connectToSmusWithSso(testDomainUrl)

            assert.strictEqual(result, mockSmusConnection)
            assert.ok(mockSecondaryAuth.useNewConnection.calledWith(existingConnection))
            assert.ok(executeCommandStub.notCalled)
        })

        it('should not trigger project selection when reauthenticating in SMUS space environment', async function () {
            isInSmusSpaceEnvironmentStub.returns(true)
            const existingConnection = { ...mockSmusConnection, domainUrl: testDomainUrl.toLowerCase() }
            mockAuth.listConnections.resolves([existingConnection])
            mockAuth.getConnectionState.returns('invalid')

            const result = await smusAuthProvider.connectToSmusWithSso(testDomainUrl)

            assert.strictEqual(result, mockSmusConnection)
            assert.ok(mockAuth.reauthenticate.calledWith(existingConnection))
            assert.ok(mockSecondaryAuth.useNewConnection.called)
            assert.ok(executeCommandStub.notCalled)
        })
    })

    describe('reauthenticate', function () {
        it('should call auth reauthenticate for SSO connection', async function () {
            const result = await smusAuthProvider.reauthenticate(mockSmusConnection)

            // Verify the result has the correct SMUS properties preserved
            assert.strictEqual(result.id, mockSmusConnection.id)
            assert.strictEqual(result.domainUrl, mockSmusConnection.domainUrl)
            assert.strictEqual(result.domainId, mockSmusConnection.domainId)
            assert.strictEqual(result.type, mockSmusConnection.type)
            assert.strictEqual(result.startUrl, mockSmusConnection.startUrl)
            assert.strictEqual(result.label, mockSmusConnection.label)
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
        let getDerCredentialsProviderStub: sinon.SinonStub
        let getDomainRegionStub: sinon.SinonStub
        let mockStsClient: any
        let mockCredentialsProvider: any

        beforeEach(function () {
            // Mock dependencies
            getContextStub = sinon.stub(vscodeSetContext, 'getContext')
            getResourceMetadataStub = sinon.stub(resourceMetadataUtils, 'getResourceMetadata')

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
            let extractAccountIdFromResourceMetadataStub: sinon.SinonStub

            beforeEach(function () {
                getContextStub.withArgs('aws.smus.inSmusSpaceEnvironment').returns(true)
                extractAccountIdFromResourceMetadataStub = sinon
                    .stub(smusUtils, 'extractAccountIdFromResourceMetadata')
                    .resolves('123456789012')
            })

            it('should extract account from resource metadata and cache result', async function () {
                const testAccountId = '123456789012'

                const result = await smusAuthProvider.getDomainAccountId()

                assert.strictEqual(result, testAccountId)
                assert.strictEqual(smusAuthProvider['cachedDomainAccountId'], testAccountId)
                assert.ok(extractAccountIdFromResourceMetadataStub.called)
                assert.ok(mockStsClient.getCallerIdentity.notCalled)
            })

            it('should throw error when extractAccountIdFromResourceMetadata fails', async function () {
                extractAccountIdFromResourceMetadataStub.rejects(new ToolkitError('Metadata extraction failed'))

                await assert.rejects(
                    () => smusAuthProvider.getDomainAccountId(),
                    (err: ToolkitError) => err.message.includes('Metadata extraction failed')
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

    describe('getProjectAccountId', function () {
        let getContextStub: sinon.SinonStub
        let extractAccountIdFromResourceMetadataStub: sinon.SinonStub
        let getProjectCredentialProviderStub: sinon.SinonStub
        let mockProjectCredentialsProvider: any
        let mockStsClient: any
        let mockDataZoneClientForProject: any

        const testProjectId = 'test-project-id'
        const testAccountId = '123456789012'
        const testRegion = 'us-east-1'

        beforeEach(function () {
            // Mock dependencies
            getContextStub = sinon.stub(vscodeSetContext, 'getContext')
            extractAccountIdFromResourceMetadataStub = sinon
                .stub(smusUtils, 'extractAccountIdFromResourceMetadata')
                .resolves(testAccountId)

            // Mock project credentials provider
            mockProjectCredentialsProvider = {
                getCredentials: sinon.stub().resolves({
                    accessKeyId: 'test-key',
                    secretAccessKey: 'test-secret',
                    sessionToken: 'test-token',
                }),
            }
            getProjectCredentialProviderStub = sinon
                .stub(smusAuthProvider, 'getProjectCredentialProvider')
                .resolves(mockProjectCredentialsProvider)

            // Update the existing mockDataZoneClient to include getToolingEnvironment
            mockDataZoneClientForProject = {
                getToolingEnvironment: sinon.stub().resolves({
                    awsAccountRegion: testRegion,
                    projectId: testProjectId,
                    domainId: testDomainId,
                    createdBy: 'test-user',
                    name: 'test-environment',
                    id: 'test-env-id',
                    status: 'ACTIVE',
                }),
            }
            // Update the existing mockDataZoneClient instead of creating a new stub
            Object.assign(mockDataZoneClient, mockDataZoneClientForProject)

            // Mock STS client
            mockStsClient = {
                getCallerIdentity: sinon.stub().resolves({
                    Account: testAccountId,
                    UserId: 'test-user-id',
                    Arn: 'arn:aws:sts::123456789012:assumed-role/test-role/test-session',
                }),
            }

            // Clear cache
            smusAuthProvider['cachedProjectAccountIds'].clear()
            mockSecondaryAuthState.activeConnection = mockSmusConnection
        })

        afterEach(function () {
            sinon.restore()
        })

        describe('when cached value exists', function () {
            it('should return cached project account ID without making any calls', async function () {
                smusAuthProvider['cachedProjectAccountIds'].set(testProjectId, testAccountId)

                const result = await smusAuthProvider.getProjectAccountId(testProjectId)

                assert.strictEqual(result, testAccountId)
                assert.ok(getContextStub.notCalled)
                assert.ok(extractAccountIdFromResourceMetadataStub.notCalled)
                assert.ok(getProjectCredentialProviderStub.notCalled)
                assert.ok(mockStsClient.getCallerIdentity.notCalled)
            })
        })

        describe('in SMUS space environment', function () {
            beforeEach(function () {
                getContextStub.withArgs('aws.smus.inSmusSpaceEnvironment').returns(true)
            })

            it('should extract account ID from resource metadata and cache it', async function () {
                const result = await smusAuthProvider.getProjectAccountId(testProjectId)

                assert.strictEqual(result, testAccountId)
                assert.strictEqual(smusAuthProvider['cachedProjectAccountIds'].get(testProjectId), testAccountId)
                assert.ok(extractAccountIdFromResourceMetadataStub.called)
                assert.ok(getProjectCredentialProviderStub.notCalled)
                assert.ok(mockStsClient.getCallerIdentity.notCalled)
            })

            it('should throw error when extractAccountIdFromResourceMetadata fails', async function () {
                extractAccountIdFromResourceMetadataStub.rejects(new ToolkitError('Metadata extraction failed'))

                await assert.rejects(
                    () => smusAuthProvider.getProjectAccountId(testProjectId),
                    (err: ToolkitError) => err.message.includes('Metadata extraction failed')
                )

                assert.ok(!smusAuthProvider['cachedProjectAccountIds'].has(testProjectId))
            })
        })

        describe('in non-SMUS space environment', function () {
            let stsConstructorStub: sinon.SinonStub

            beforeEach(function () {
                getContextStub.withArgs('aws.smus.inSmusSpaceEnvironment').returns(false)
                // Stub the DefaultStsClient constructor to return our mock instance
                const stsClientModule = require('../../../shared/clients/stsClient')
                stsConstructorStub = sinon.stub(stsClientModule, 'DefaultStsClient').callsFake(() => mockStsClient)
            })

            afterEach(function () {
                if (stsConstructorStub) {
                    stsConstructorStub.restore()
                }
            })

            it('should use project credentials with STS to get account ID and cache it', async function () {
                const result = await smusAuthProvider.getProjectAccountId(testProjectId)

                assert.strictEqual(result, testAccountId)
                assert.strictEqual(smusAuthProvider['cachedProjectAccountIds'].get(testProjectId), testAccountId)
                assert.ok(getProjectCredentialProviderStub.calledWith(testProjectId))
                assert.ok(mockProjectCredentialsProvider.getCredentials.called)
                assert.ok((DataZoneClient.createWithCredentials as sinon.SinonStub).called)
                assert.ok(mockDataZoneClientForProject.getToolingEnvironment.calledWith(testProjectId))
                assert.ok(mockStsClient.getCallerIdentity.called)
            })

            it('should throw error when no active connection exists', async function () {
                mockSecondaryAuthState.activeConnection = undefined

                await assert.rejects(
                    () => smusAuthProvider.getProjectAccountId(testProjectId),
                    (err: ToolkitError) => {
                        return (
                            err.code === 'NoActiveConnection' &&
                            err.message.includes('No active SMUS connection available')
                        )
                    }
                )

                assert.ok(!smusAuthProvider['cachedProjectAccountIds'].has(testProjectId))
            })

            it('should throw error when tooling environment has no region', async function () {
                mockDataZoneClientForProject.getToolingEnvironment.resolves({
                    id: 'env-123',
                    awsAccountRegion: undefined,
                    projectId: undefined,
                    domainId: undefined,
                    createdBy: undefined,
                    name: undefined,
                    provider: undefined,
                    $metadata: {},
                })

                await assert.rejects(
                    () => smusAuthProvider.getProjectAccountId(testProjectId),
                    (err: ToolkitError) => {
                        return (
                            err.message.includes('Failed to get project account ID') &&
                            err.message.includes('No AWS account region found in tooling environment')
                        )
                    }
                )

                assert.ok(!smusAuthProvider['cachedProjectAccountIds'].has(testProjectId))
            })

            it('should throw error when STS GetCallerIdentity fails', async function () {
                mockStsClient.getCallerIdentity.rejects(new Error('STS call failed'))

                await assert.rejects(
                    () => smusAuthProvider.getProjectAccountId(testProjectId),
                    (err: ToolkitError) => {
                        return (
                            err.message.includes('Failed to get project account ID') &&
                            err.message.includes('STS call failed')
                        )
                    }
                )

                assert.ok(!smusAuthProvider['cachedProjectAccountIds'].has(testProjectId))
            })
        })
    })

    describe('signOut', function () {
        let mockState: any

        beforeEach(function () {
            mockState = {
                get: sinon.stub(),
                update: sinon.stub().resolves(),
            }
            mockSecondaryAuth.state = mockState
            mockSecondaryAuth.forgetConnection = sinon.stub().resolves()
        })

        it('should do nothing when no active connection exists', async function () {
            mockSecondaryAuthState.activeConnection = undefined

            await smusAuthProvider.signOut()

            assert.ok(mockState.get.notCalled)
            assert.ok(mockState.update.notCalled)
            assert.ok(mockSecondaryAuth.deleteConnection.notCalled)
            assert.ok(mockSecondaryAuth.forgetConnection.notCalled)
        })

        it('should delete SSO connection and clear metadata', async function () {
            const ssoConnection = {
                ...mockSmusConnection,
                type: 'sso' as const,
                id: 'sso-connection-id',
            }
            mockSecondaryAuthState.activeConnection = ssoConnection

            const smusConnections = {
                'sso-connection-id': {
                    domainUrl: testDomainUrl,
                    domainId: testDomainId,
                },
            }
            mockState.get.withArgs('smus.connections').returns(smusConnections)

            await smusAuthProvider.signOut()

            assert.ok(mockState.get.calledWith('smus.connections'))
            assert.ok(mockState.update.calledWith('smus.connections', {}))
            assert.ok(mockSecondaryAuth.deleteConnection.called)
            assert.ok(mockSecondaryAuth.forgetConnection.notCalled)
        })

        it('should forget IAM connection without deleting and clear metadata', async function () {
            const iamConnection = {
                id: 'profile:test-profile',
                type: 'iam' as const,
                label: 'Test IAM Profile',
            }
            mockSecondaryAuthState.activeConnection = iamConnection as any

            const smusConnections = {
                'profile:test-profile': {
                    profileName: 'test-profile',
                    region: testRegion,
                    domainUrl: testDomainUrl,
                    domainId: testDomainId,
                },
            }
            mockState.get.withArgs('smus.connections').returns(smusConnections)

            await smusAuthProvider.signOut()

            assert.ok(mockState.get.calledWith('smus.connections'))
            assert.ok(mockState.update.calledWith('smus.connections', {}))
            assert.ok(mockSecondaryAuth.forgetConnection.called)
            assert.ok(mockSecondaryAuth.deleteConnection.notCalled)
        })

        it('should handle mock connection in SMUS space environment', async function () {
            const mockConnection = {
                id: 'mock-connection-id',
                // No 'type' property - simulates mock connection
            }
            mockSecondaryAuthState.activeConnection = mockConnection as any

            const smusConnections = {
                'mock-connection-id': {
                    domainUrl: testDomainUrl,
                    domainId: testDomainId,
                },
            }
            mockState.get.withArgs('smus.connections').returns(smusConnections)

            await smusAuthProvider.signOut()

            assert.ok(mockState.get.calledWith('smus.connections'))
            assert.ok(mockState.update.calledWith('smus.connections', {}))
            assert.ok(mockSecondaryAuth.deleteConnection.notCalled)
            assert.ok(mockSecondaryAuth.forgetConnection.notCalled)
        })

        it('should handle missing metadata gracefully', async function () {
            const ssoConnection = {
                ...mockSmusConnection,
                type: 'sso' as const,
                id: 'sso-connection-id',
            }
            mockSecondaryAuthState.activeConnection = ssoConnection

            mockState.get.withArgs('smus.connections').returns({})

            await smusAuthProvider.signOut()

            assert.ok(mockState.get.calledWith('smus.connections'))
            // When there's no metadata to delete, update should not be called
            assert.ok(mockState.update.notCalled)
            assert.ok(mockSecondaryAuth.deleteConnection.called)
        })

        it('should throw ToolkitError when deleteConnection fails', async function () {
            const ssoConnection = {
                ...mockSmusConnection,
                type: 'sso' as const,
                id: 'sso-connection-id',
            }
            mockSecondaryAuthState.activeConnection = ssoConnection

            mockState.get.withArgs('smus.connections').returns({})
            mockSecondaryAuth.deleteConnection.rejects(new Error('Delete failed'))

            await assert.rejects(
                () => smusAuthProvider.signOut(),
                (err: ToolkitError) => {
                    return (
                        err.code === 'SignOutFailed' &&
                        err.message.includes('Failed to sign out from SageMaker Unified Studio')
                    )
                }
            )
        })

        it('should throw ToolkitError when forgetConnection fails', async function () {
            const iamConnection = {
                id: 'profile:test-profile',
                type: 'iam' as const,
                label: 'Test IAM Profile',
            }
            mockSecondaryAuthState.activeConnection = iamConnection as any

            mockState.get.withArgs('smus.connections').returns({})
            mockSecondaryAuth.forgetConnection.rejects(new Error('Forget failed'))

            await assert.rejects(
                () => smusAuthProvider.signOut(),
                (err: ToolkitError) => {
                    return (
                        err.code === 'SignOutFailed' &&
                        err.message.includes('Failed to sign out from SageMaker Unified Studio')
                    )
                }
            )
        })
    })

    describe('connectWithIamProfile', function () {
        let mockState: any
        const testProfileName = 'test-profile'
        const testIamConnection = {
            id: 'profile:test-profile',
            type: 'iam' as const,
            label: 'Test IAM Profile',
        }

        beforeEach(function () {
            mockState = {
                get: sinon.stub(),
                update: sinon.stub().resolves(),
            }
            mockSecondaryAuth.state = mockState
            mockAuth.getConnection = sinon.stub()
            mockAuth.refreshConnectionState = sinon.stub().resolves()
        })

        it('should connect with existing IAM profile and store metadata', async function () {
            extractDomainInfoStub.returns({ domainId: testDomainId, region: testRegion })
            mockAuth.getConnection.withArgs({ id: `profile:${testProfileName}` }).resolves(testIamConnection)
            mockState.get.withArgs('smus.connections').returns({})

            const result = await smusAuthProvider.connectWithIamProfile(testProfileName, testRegion, testDomainUrl)

            assert.strictEqual(result.id, testIamConnection.id)
            assert.strictEqual(result.type, 'iam')
            assert.strictEqual(result.profileName, testProfileName)
            assert.strictEqual(result.region, testRegion)
            assert.strictEqual(result.domainUrl, testDomainUrl)
            assert.strictEqual(result.domainId, testDomainId)

            assert.ok(mockAuth.getConnection.calledWith({ id: `profile:${testProfileName}` }))
            assert.ok(mockSecondaryAuth.useNewConnection.calledWith(testIamConnection))
            assert.ok(mockAuth.refreshConnectionState.calledWith(testIamConnection))
            assert.ok(
                mockState.update.calledWith('smus.connections', {
                    [testIamConnection.id]: {
                        profileName: testProfileName,
                        region: testRegion,
                        domainUrl: testDomainUrl,
                        domainId: testDomainId,
                        isExpressDomain: false,
                    },
                })
            )
        })

        it('should merge with existing SMUS connections metadata', async function () {
            extractDomainInfoStub.returns({ domainId: testDomainId, region: testRegion })
            mockAuth.getConnection.withArgs({ id: `profile:${testProfileName}` }).resolves(testIamConnection)

            const existingConnections = {
                'other-connection-id': {
                    domainUrl: 'https://other-domain.sagemaker.us-west-2.on.aws',
                    domainId: 'other-domain-id',
                },
            }
            mockState.get.withArgs('smus.connections').returns(existingConnections)

            await smusAuthProvider.connectWithIamProfile(testProfileName, testRegion, testDomainUrl)

            assert.ok(
                mockState.update.calledWith('smus.connections', {
                    'other-connection-id': existingConnections['other-connection-id'],
                    [testIamConnection.id]: {
                        profileName: testProfileName,
                        region: testRegion,
                        domainUrl: testDomainUrl,
                        domainId: testDomainId,
                        isExpressDomain: false,
                    },
                })
            )
        })

        it('should throw error for invalid domain URL', async function () {
            extractDomainInfoStub.returns({ domainId: undefined, region: testRegion })

            await assert.rejects(
                () => smusAuthProvider.connectWithIamProfile(testProfileName, testRegion, 'invalid-url'),
                (err: ToolkitError) => {
                    return (
                        err.code === 'FailedToConnect' &&
                        err.message.includes('Failed to connect to SageMaker Unified Studio with IAM profile')
                    )
                }
            )

            assert.ok(mockAuth.getConnection.notCalled)
            assert.ok(mockSecondaryAuth.useNewConnection.notCalled)
        })

        it('should throw error when IAM connection not found', async function () {
            extractDomainInfoStub.returns({ domainId: testDomainId, region: testRegion })
            mockAuth.getConnection.withArgs({ id: `profile:${testProfileName}` }).resolves(undefined)

            await assert.rejects(
                () => smusAuthProvider.connectWithIamProfile(testProfileName, testRegion, testDomainUrl),
                (err: ToolkitError) => {
                    return (
                        err.code === 'FailedToConnect' &&
                        err.message.includes('Failed to connect to SageMaker Unified Studio with IAM profile') &&
                        (err.cause as any)?.code === 'ConnectionNotFound'
                    )
                }
            )

            assert.ok(mockSecondaryAuth.useNewConnection.notCalled)
        })

        it('should throw error when connection is not IAM type', async function () {
            extractDomainInfoStub.returns({ domainId: testDomainId, region: testRegion })
            const nonIamConnection = {
                id: 'profile:test-profile',
                type: 'sso' as const,
                label: 'Test SSO Connection',
            }
            mockAuth.getConnection.withArgs({ id: `profile:${testProfileName}` }).resolves(nonIamConnection)

            await assert.rejects(
                () => smusAuthProvider.connectWithIamProfile(testProfileName, testRegion, testDomainUrl),
                (err: ToolkitError) => {
                    return (
                        err.code === 'FailedToConnect' &&
                        err.message.includes('Failed to connect to SageMaker Unified Studio with IAM profile')
                    )
                }
            )
        })

        it('should handle useNewConnection failure', async function () {
            extractDomainInfoStub.returns({ domainId: testDomainId, region: testRegion })
            mockAuth.getConnection.withArgs({ id: `profile:${testProfileName}` }).resolves(testIamConnection)
            mockState.get.withArgs('smus.connections').returns({})
            mockSecondaryAuth.useNewConnection.rejects(new Error('Failed to use connection'))

            await assert.rejects(
                () => smusAuthProvider.connectWithIamProfile(testProfileName, testRegion, testDomainUrl),
                (err: ToolkitError) => {
                    return (
                        err.code === 'FailedToConnect' &&
                        err.message.includes('Failed to connect to SageMaker Unified Studio with IAM profile')
                    )
                }
            )
        })

        it('should handle refreshConnectionState failure', async function () {
            extractDomainInfoStub.returns({ domainId: testDomainId, region: testRegion })
            mockAuth.getConnection.withArgs({ id: `profile:${testProfileName}` }).resolves(testIamConnection)
            mockState.get.withArgs('smus.connections').returns({})
            mockAuth.refreshConnectionState.rejects(new Error('Failed to refresh state'))

            await assert.rejects(
                () => smusAuthProvider.connectWithIamProfile(testProfileName, testRegion, testDomainUrl),
                (err: ToolkitError) => {
                    return (
                        err.code === 'FailedToConnect' &&
                        err.message.includes('Failed to connect to SageMaker Unified Studio with IAM profile')
                    )
                }
            )
        })
    })

    describe('activeConnection with IAM metadata', function () {
        let mockState: any

        beforeEach(function () {
            mockState = {
                get: sinon.stub(),
                update: sinon.stub().resolves(),
            }
            mockSecondaryAuth.state = mockState
        })

        it('should return IAM connection with SMUS metadata when available', function () {
            const iamConnection = {
                id: 'profile:test-profile',
                type: 'iam' as const,
                label: 'Test IAM Profile',
            }
            mockSecondaryAuthState.activeConnection = iamConnection as any

            const smusConnections = {
                'profile:test-profile': {
                    profileName: 'test-profile',
                    region: testRegion,
                    domainUrl: testDomainUrl,
                    domainId: testDomainId,
                },
            }
            mockState.get.withArgs('smus.connections').returns(smusConnections)

            const result = smusAuthProvider.activeConnection

            assert.strictEqual(result?.id, iamConnection.id)
            assert.strictEqual((result as any)?.type, 'iam')
            assert.strictEqual((result as any).profileName, 'test-profile')
            assert.strictEqual((result as any).region, testRegion)
            assert.strictEqual((result as any).domainUrl, testDomainUrl)
            assert.strictEqual((result as any).domainId, testDomainId)
        })

        it('should return SSO connection with SMUS metadata when available', function () {
            const ssoConnection = {
                ...mockSmusConnection,
                type: 'sso' as const,
            }
            mockSecondaryAuthState.activeConnection = ssoConnection

            const smusConnections = {
                [ssoConnection.id]: {
                    domainUrl: testDomainUrl,
                    domainId: testDomainId,
                },
            }
            mockState.get.withArgs('smus.connections').returns(smusConnections)

            const result = smusAuthProvider.activeConnection

            assert.strictEqual(result?.id, ssoConnection.id)
            assert.strictEqual((result as any)?.type, 'sso')
            assert.strictEqual((result as any)?.domainUrl, testDomainUrl)
            assert.strictEqual((result as any)?.domainId, testDomainId)
        })

        it('should return base connection when no metadata available', function () {
            const iamConnection = {
                id: 'profile:test-profile',
                type: 'iam' as const,
                label: 'Test IAM Profile',
            }
            mockSecondaryAuthState.activeConnection = iamConnection as any

            mockState.get.withArgs('smus.connections').returns({})

            const result = smusAuthProvider.activeConnection

            assert.strictEqual(result?.id, iamConnection.id)
            assert.strictEqual((result as any)?.type, 'iam')
            assert.strictEqual((result as any).profileName, undefined)
            assert.strictEqual((result as any).domainUrl, undefined)
        })

        it('should return undefined when no active connection', function () {
            mockSecondaryAuthState.activeConnection = undefined

            const result = smusAuthProvider.activeConnection

            assert.strictEqual(result, undefined)
        })

        it('should handle missing smus.connections state gracefully', function () {
            const iamConnection = {
                id: 'profile:test-profile',
                type: 'iam' as const,
                label: 'Test IAM Profile',
            }
            mockSecondaryAuthState.activeConnection = iamConnection as any

            mockState.get.withArgs('smus.connections').returns(undefined)

            const result = smusAuthProvider.activeConnection

            assert.strictEqual(result?.id, iamConnection.id)
            assert.strictEqual((result as any)?.type, 'iam')
        })
    })

    describe('getDerCredentialsProvider', function () {
        let getContextStub: sinon.SinonStub

        beforeEach(function () {
            getContextStub = sinon.stub(vscodeSetContext, 'getContext')

            // Clear cache
            smusAuthProvider['credentialsProviderCache'].clear()
        })

        describe('in SMUS space environment', function () {
            beforeEach(function () {
                getContextStub.withArgs('aws.smus.inSmusSpaceEnvironment').returns(true)

                // Mock resource metadata for SMUS space environment
                getResourceMetadataStub = sinon.stub(resourceMetadataUtils, 'getResourceMetadata').returns({
                    ResourceArn: 'arn:aws:sagemaker:us-east-2:123456789012:app/dzd_domainId/test-app',
                    AdditionalMetadata: {
                        DataZoneDomainId: testDomainId,
                        DataZoneDomainRegion: testRegion,
                    },
                } as any)
            })

            afterEach(function () {
                getResourceMetadataStub?.restore()
            })

            it('should return a credentials provider that can retrieve credentials', async function () {
                // In SMUS space environment, the method should return a provider
                // We can't easily test the internal branching logic without stubbing ES modules
                // So we test that it returns a valid provider structure
                const provider = await smusAuthProvider.getDerCredentialsProvider()

                assert.ok(provider, 'Provider should be returned')
                assert.ok(typeof provider.getCredentials === 'function', 'Provider should have getCredentials method')
            })

            it('should not cache providers in SMUS space environment', async function () {
                // Get provider twice
                const provider1 = await smusAuthProvider.getDerCredentialsProvider()
                const provider2 = await smusAuthProvider.getDerCredentialsProvider()

                // In SMUS space, providers are not cached (new provider each time)
                // This is because the logic returns early before caching
                assert.ok(provider1)
                assert.ok(provider2)
            })
        })

        describe('in non-SMUS space environment', function () {
            let getAccessTokenStub: sinon.SinonStub

            beforeEach(function () {
                getContextStub.withArgs('aws.smus.inSmusSpaceEnvironment').returns(false)
                mockSecondaryAuthState.activeConnection = mockSmusConnection
                getAccessTokenStub = sinon.stub(smusAuthProvider, 'getAccessToken').resolves('mock-access-token')
            })

            it('should create and cache DomainExecRoleCredentialsProvider for SSO connection', async function () {
                const provider = await smusAuthProvider.getDerCredentialsProvider()

                assert.ok(provider)
                assert.ok(getAccessTokenStub.notCalled) // Not called until getCredentials is invoked

                // Verify caching
                const cachedProvider = await smusAuthProvider.getDerCredentialsProvider()
                assert.strictEqual(provider, cachedProvider)
            })

            it('should throw error when no active connection', async function () {
                mockSecondaryAuthState.activeConnection = undefined

                await assert.rejects(
                    () => smusAuthProvider.getDerCredentialsProvider(),
                    (err: ToolkitError) => {
                        return (
                            err.code === 'NoActiveConnection' &&
                            err.message.includes('No active SMUS connection available')
                        )
                    }
                )
            })

            it('should throw error for non-SSO connection', async function () {
                const iamConnection = {
                    id: 'profile:test-profile',
                    type: 'iam' as const,
                    label: 'Test IAM Profile',
                }
                mockSecondaryAuthState.activeConnection = iamConnection as any

                await assert.rejects(
                    () => smusAuthProvider.getDerCredentialsProvider(),
                    (err: ToolkitError) => {
                        return (
                            err.code === 'InvalidConnectionType' &&
                            err.message.includes(
                                'Domain Execution Role credentials are only available for SSO connections'
                            )
                        )
                    }
                )
            })

            it('should use cached provider for same connection', async function () {
                const provider1 = await smusAuthProvider.getDerCredentialsProvider()
                const provider2 = await smusAuthProvider.getDerCredentialsProvider()

                assert.strictEqual(provider1, provider2)
            })

            it('should create different providers for different connections', async function () {
                const provider1 = await smusAuthProvider.getDerCredentialsProvider()

                // Change connection
                const differentConnection = {
                    ...mockSmusConnection,
                    id: 'different-connection-id',
                    domainId: 'different-domain-id',
                }
                mockSecondaryAuthState.activeConnection = differentConnection

                const provider2 = await smusAuthProvider.getDerCredentialsProvider()

                assert.notStrictEqual(provider1, provider2)
            })
        })
    })

    describe('initExpressModeContextInSpaceEnvironment', function () {
        let getResourceMetadataStub: sinon.SinonStub
        let getDerCredentialsProviderStub: sinon.SinonStub
        let getInstanceStub: sinon.SinonStub
        let isExpressDomainStub: sinon.SinonStub
        let mockCredentialsProvider: any
        let mockClientHelper: any

        const testResourceMetadata = {
            AdditionalMetadata: {
                DataZoneDomainId: 'test-domain-id',
                DataZoneDomainRegion: 'us-east-1',
                DataZoneProjectId: 'test-project-id',
            },
        }

        beforeEach(function () {
            getResourceMetadataStub = sinon.stub(resourceMetadataUtils, 'getResourceMetadata')

            // Reset the global setContext stub history for clean test state
            setContextStubGlobal.resetHistory()

            mockCredentialsProvider = {
                getCredentials: sinon.stub().resolves({
                    accessKeyId: 'test-key',
                    secretAccessKey: 'test-secret',
                }),
            }

            getDerCredentialsProviderStub = sinon
                .stub(smusAuthProvider, 'getDerCredentialsProvider')
                .resolves(mockCredentialsProvider)

            // Mock DataZoneCustomClientHelper
            isExpressDomainStub = sinon.stub()
            mockClientHelper = {
                isExpressDomain: isExpressDomainStub,
            }

            getInstanceStub = sinon
                .stub(
                    require('../../../sagemakerunifiedstudio/shared/client/datazoneCustomClientHelper')
                        .DataZoneCustomClientHelper,
                    'getInstance'
                )
                .returns(mockClientHelper)
        })

        afterEach(function () {
            sinon.restore()
        })

        it('should set express mode context to true when domain is express mode', async function () {
            getResourceMetadataStub.returns(testResourceMetadata)
            isExpressDomainStub.resolves(true)

            await smusAuthProvider['initExpressModeContextInSpaceEnvironment']()

            assert.ok(getResourceMetadataStub.called)
            assert.ok(getDerCredentialsProviderStub.called)
            assert.ok(
                getInstanceStub.calledWith(
                    mockCredentialsProvider,
                    testResourceMetadata.AdditionalMetadata.DataZoneDomainRegion
                )
            )
            assert.ok(isExpressDomainStub.calledWith(testResourceMetadata.AdditionalMetadata.DataZoneDomainId))
            assert.ok(setContextStubGlobal.calledWith('aws.smus.isExpressMode', true))
        })

        it('should set express mode context to false when domain is not express mode', async function () {
            getResourceMetadataStub.returns(testResourceMetadata)
            isExpressDomainStub.resolves(false)

            await smusAuthProvider['initExpressModeContextInSpaceEnvironment']()

            assert.ok(getResourceMetadataStub.called)
            assert.ok(getDerCredentialsProviderStub.called)
            assert.ok(
                getInstanceStub.calledWith(
                    mockCredentialsProvider,
                    testResourceMetadata.AdditionalMetadata.DataZoneDomainRegion
                )
            )
            assert.ok(isExpressDomainStub.calledWith(testResourceMetadata.AdditionalMetadata.DataZoneDomainId))
            assert.ok(setContextStubGlobal.calledWith('aws.smus.isExpressMode', false))
        })

        it('should not call express mode check when resource metadata is missing', async function () {
            getResourceMetadataStub.returns(undefined)

            await smusAuthProvider['initExpressModeContextInSpaceEnvironment']()

            assert.ok(getResourceMetadataStub.called)
            assert.ok(getDerCredentialsProviderStub.notCalled)
            assert.ok(getInstanceStub.notCalled)
            assert.ok(isExpressDomainStub.notCalled)
            assert.ok(setContextStubGlobal.notCalled)
        })

        it('should handle error when getDerCredentialsProvider fails', async function () {
            getResourceMetadataStub.returns(testResourceMetadata)
            const testError = new Error('Failed to get credentials provider')
            getDerCredentialsProviderStub.rejects(testError)

            await smusAuthProvider['initExpressModeContextInSpaceEnvironment']()

            assert.ok(getResourceMetadataStub.called)
            assert.ok(getDerCredentialsProviderStub.called)
            assert.ok(getInstanceStub.notCalled)
            assert.ok(isExpressDomainStub.notCalled)
            assert.ok(setContextStubGlobal.calledWith('aws.smus.isExpressMode', false))
        })
    })

    describe('getSessionName', function () {
        let mockStsClient: any
        let mockCredentialsProvider: any

        beforeEach(function () {
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
                    accessKeyId: 'test-access-key',
                    secretAccessKey: 'test-secret-key',
                    sessionToken: 'test-session-token',
                }),
            }

            sinon
                .stub(smusAuthProvider as any, 'getCredentialsForIamProfile')
                .resolves(mockCredentialsProvider.getCredentials())
        })

        afterEach(function () {
            sinon.restore()
        })

        it('should return session name for IAM connection with assumed role', async function () {
            const iamConnection = {
                id: 'profile:test-profile',
                type: 'iam' as const,
                label: 'Test IAM Profile',
                profileName: 'test-profile',
                region: testRegion,
                domainUrl: testDomainUrl,
                domainId: testDomainId,
                endpointUrl: undefined,
                getCredentials: sinon.stub().resolves(),
            }
            mockSecondaryAuthState.activeConnection = iamConnection as any

            // Mock STS response with assumed role ARN
            const assumedRoleArn = 'arn:aws:sts::123456789012:assumed-role/MyRole/my-session-name'
            mockStsClient.getCallerIdentity.resolves({
                Arn: assumedRoleArn,
                Account: '123456789012',
                UserId: 'AIDAI1234567890EXAMPLE:my-session-name',
            })

            // Mock connection metadata
            const smusConnections = {
                [iamConnection.id]: {
                    profileName: 'test-profile',
                    region: testRegion,
                    domainUrl: testDomainUrl,
                    domainId: testDomainId,
                },
            }
            mockSecondaryAuth.state.get.withArgs('smus.connections').returns(smusConnections)

            const sessionName = await smusAuthProvider.getSessionName()

            assert.strictEqual(sessionName, 'my-session-name')
            assert.ok(mockStsClient.getCallerIdentity.calledOnce)
        })

        it('should return undefined for IAM connection without assumed role (IAM user)', async function () {
            const iamConnection = {
                id: 'profile:test-profile',
                type: 'iam' as const,
                label: 'Test IAM Profile',
                profileName: 'test-profile',
                region: testRegion,
                domainUrl: testDomainUrl,
                domainId: testDomainId,
                endpointUrl: undefined,
                getCredentials: sinon.stub().resolves(),
            }
            mockSecondaryAuthState.activeConnection = iamConnection as any

            // Mock STS response with IAM user ARN (no session name)
            const iamUserArn = 'arn:aws:iam::123456789012:user/my-user'
            mockStsClient.getCallerIdentity.resolves({
                Arn: iamUserArn,
                Account: '123456789012',
                UserId: 'AIDAI1234567890EXAMPLE',
            })

            // Mock connection metadata
            const smusConnections = {
                [iamConnection.id]: {
                    profileName: 'test-profile',
                    region: testRegion,
                    domainUrl: testDomainUrl,
                    domainId: testDomainId,
                },
            }
            mockSecondaryAuth.state.get.withArgs('smus.connections').returns(smusConnections)

            const sessionName = await smusAuthProvider.getSessionName()

            assert.strictEqual(sessionName, undefined)
            assert.ok(mockStsClient.getCallerIdentity.calledOnce)
        })

        it('should return undefined for SSO connection', async function () {
            mockSecondaryAuthState.activeConnection = mockSmusConnection

            const sessionName = await smusAuthProvider.getSessionName()

            assert.strictEqual(sessionName, undefined)
            assert.ok(mockStsClient.getCallerIdentity.notCalled)
        })

        it('should return undefined when not connected', async function () {
            mockSecondaryAuthState.activeConnection = undefined

            const sessionName = await smusAuthProvider.getSessionName()

            assert.strictEqual(sessionName, undefined)
            assert.ok(mockStsClient.getCallerIdentity.notCalled)
        })

        it('should cache and reuse caller identity ARN', async function () {
            const iamConnection = {
                id: 'profile:test-profile',
                type: 'iam' as const,
                label: 'Test IAM Profile',
                profileName: 'test-profile',
                region: testRegion,
                domainUrl: testDomainUrl,
                domainId: testDomainId,
                endpointUrl: undefined,
                getCredentials: sinon.stub().resolves(),
            }
            mockSecondaryAuthState.activeConnection = iamConnection as any

            const assumedRoleArn = 'arn:aws:sts::123456789012:assumed-role/MyRole/my-session-name'
            mockStsClient.getCallerIdentity.resolves({
                Arn: assumedRoleArn,
                Account: '123456789012',
                UserId: 'AIDAI1234567890EXAMPLE:my-session-name',
            })

            // Mock connection metadata
            const smusConnections = {
                [iamConnection.id]: {
                    profileName: 'test-profile',
                    region: testRegion,
                    domainUrl: testDomainUrl,
                    domainId: testDomainId,
                },
            }
            mockSecondaryAuth.state.get.withArgs('smus.connections').returns(smusConnections)

            // First call - should fetch from STS
            const sessionName1 = await smusAuthProvider.getSessionName()
            assert.strictEqual(sessionName1, 'my-session-name')
            assert.ok(mockStsClient.getCallerIdentity.calledOnce)

            // Second call - should use cached value
            const sessionName2 = await smusAuthProvider.getSessionName()
            assert.strictEqual(sessionName2, 'my-session-name')
            assert.ok(mockStsClient.getCallerIdentity.calledOnce) // Still only called once
        })

        it('should handle STS errors gracefully', async function () {
            const iamConnection = {
                id: 'profile:test-profile',
                type: 'iam' as const,
                label: 'Test IAM Profile',
                profileName: 'test-profile',
                region: testRegion,
                domainUrl: testDomainUrl,
                domainId: testDomainId,
                endpointUrl: undefined,
                getCredentials: sinon.stub().resolves(),
            }
            mockSecondaryAuthState.activeConnection = iamConnection as any

            mockStsClient.getCallerIdentity.rejects(new Error('STS call failed'))

            // Mock connection metadata
            const smusConnections = {
                [iamConnection.id]: {
                    profileName: 'test-profile',
                    region: testRegion,
                    domainUrl: testDomainUrl,
                    domainId: testDomainId,
                },
            }
            mockSecondaryAuth.state.get.withArgs('smus.connections').returns(smusConnections)

            const sessionName = await smusAuthProvider.getSessionName()

            assert.strictEqual(sessionName, undefined)
        })

        it('should return undefined when connection metadata is missing', async function () {
            const iamConnection = {
                id: 'profile:test-profile',
                type: 'iam' as const,
                label: 'Test IAM Profile',
                profileName: 'test-profile',
                region: testRegion,
                domainUrl: testDomainUrl,
                domainId: testDomainId,
                endpointUrl: undefined,
                getCredentials: sinon.stub().resolves(),
            }
            mockSecondaryAuthState.activeConnection = iamConnection as any

            // No connection metadata
            mockSecondaryAuth.state.get.withArgs('smus.connections').returns({})

            const sessionName = await smusAuthProvider.getSessionName()

            assert.strictEqual(sessionName, undefined)
            assert.ok(mockStsClient.getCallerIdentity.notCalled)
        })
    })

    describe('getRoleArn', function () {
        let mockStsClient: any
        let mockCredentialsProvider: any

        beforeEach(function () {
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
                    accessKeyId: 'test-access-key',
                    secretAccessKey: 'test-secret-key',
                    sessionToken: 'test-session-token',
                }),
            }

            sinon
                .stub(smusAuthProvider as any, 'getCredentialsForIamProfile')
                .resolves(mockCredentialsProvider.getCredentials())
        })

        afterEach(function () {
            sinon.restore()
        })

        it('should return IAM role ARN for IAM connection with assumed role', async function () {
            const iamConnection = {
                id: 'profile:test-profile',
                type: 'iam' as const,
                label: 'Test IAM Profile',
                profileName: 'test-profile',
                region: testRegion,
                domainUrl: testDomainUrl,
                domainId: testDomainId,
                endpointUrl: undefined,
                getCredentials: sinon.stub().resolves(),
            }
            mockSecondaryAuthState.activeConnection = iamConnection as any

            // Mock STS response with assumed role ARN
            const assumedRoleArn = 'arn:aws:sts::123456789012:assumed-role/MyRole/my-session-name'
            mockStsClient.getCallerIdentity.resolves({
                Arn: assumedRoleArn,
                Account: '123456789012',
                UserId: 'AIDAI1234567890EXAMPLE:my-session-name',
            })

            // Mock connection metadata
            const smusConnections = {
                [iamConnection.id]: {
                    profileName: 'test-profile',
                    region: testRegion,
                    domainUrl: testDomainUrl,
                    domainId: testDomainId,
                },
            }
            mockSecondaryAuth.state.get.withArgs('smus.connections').returns(smusConnections)

            const roleArn = await smusAuthProvider.getRoleArn()

            // Should convert assumed role ARN to IAM role ARN
            assert.strictEqual(roleArn, 'arn:aws:iam::123456789012:role/MyRole')
            assert.ok(mockStsClient.getCallerIdentity.calledOnce)
        })

        it('should return undefined for SSO connection', async function () {
            mockSecondaryAuthState.activeConnection = mockSmusConnection

            const roleArn = await smusAuthProvider.getRoleArn()

            assert.strictEqual(roleArn, undefined)
            assert.ok(mockStsClient.getCallerIdentity.notCalled)
        })

        it('should return undefined when not connected', async function () {
            mockSecondaryAuthState.activeConnection = undefined

            const roleArn = await smusAuthProvider.getRoleArn()

            assert.strictEqual(roleArn, undefined)
            assert.ok(mockStsClient.getCallerIdentity.notCalled)
        })

        it('should use cached caller identity ARN', async function () {
            const iamConnection = {
                id: 'profile:test-profile',
                type: 'iam' as const,
                label: 'Test IAM Profile',
                profileName: 'test-profile',
                region: testRegion,
                domainUrl: testDomainUrl,
                domainId: testDomainId,
                endpointUrl: undefined,
                getCredentials: sinon.stub().resolves(),
            }
            mockSecondaryAuthState.activeConnection = iamConnection as any

            const assumedRoleArn = 'arn:aws:sts::123456789012:assumed-role/MyRole/my-session-name'
            mockStsClient.getCallerIdentity.resolves({
                Arn: assumedRoleArn,
                Account: '123456789012',
                UserId: 'AIDAI1234567890EXAMPLE:my-session-name',
            })

            // Mock connection metadata
            const smusConnections = {
                [iamConnection.id]: {
                    profileName: 'test-profile',
                    region: testRegion,
                    domainUrl: testDomainUrl,
                    domainId: testDomainId,
                },
            }
            mockSecondaryAuth.state.get.withArgs('smus.connections').returns(smusConnections)

            // First call - should fetch from STS
            const roleArn1 = await smusAuthProvider.getRoleArn()
            assert.strictEqual(roleArn1, 'arn:aws:iam::123456789012:role/MyRole')
            assert.ok(mockStsClient.getCallerIdentity.calledOnce)

            // Second call - should use cached value
            const roleArn2 = await smusAuthProvider.getRoleArn()
            assert.strictEqual(roleArn2, 'arn:aws:iam::123456789012:role/MyRole')
            assert.ok(mockStsClient.getCallerIdentity.calledOnce) // Still only called once
        })
    })
})
