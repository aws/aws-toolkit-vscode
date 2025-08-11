/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'

// Mock the setContext function BEFORE importing modules that use it
const setContextModule = require('../../../shared/vscode/setContext')
const setContextStubGlobal = sinon.stub(setContextModule, 'setContext').resolves()

import { SmusAuthenticationProvider } from '../../../sagemakerunifiedstudio/auth/providers/smusAuthenticationProvider'
import { SmusConnection } from '../../../sagemakerunifiedstudio/auth/model'
import { DataZoneClient } from '../../../sagemakerunifiedstudio/shared/client/datazoneClient'
import { SmusUtils } from '../../../sagemakerunifiedstudio/shared/smusUtils'
import { ToolkitError } from '../../../shared/errors'
import * as messages from '../../../shared/utilities/messages'

describe('SmusAuthenticationProvider', function () {
    let mockAuth: any
    let mockSecondaryAuth: any
    let mockDataZoneClient: sinon.SinonStubbedInstance<DataZoneClient>
    let smusAuthProvider: SmusAuthenticationProvider
    let extractDomainInfoStub: sinon.SinonStub
    let getSsoInstanceInfoStub: sinon.SinonStub
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
        sinon.stub(require('../../../auth/secondaryAuth'), 'getSecondaryAuth').returns(mockSecondaryAuth)

        smusAuthProvider = new SmusAuthenticationProvider(mockAuth, mockSecondaryAuth)
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
        })

        it('should reuse existing valid connection', async function () {
            const existingConnection = { ...mockSmusConnection, domainUrl: testDomainUrl.toLowerCase() }
            mockAuth.listConnections.resolves([existingConnection])
            mockAuth.getConnectionState.returns('valid')

            const result = await smusAuthProvider.connectToSmus(testDomainUrl)

            assert.strictEqual(result, mockSmusConnection)
            assert.ok(mockAuth.createConnection.notCalled)
            assert.ok(mockSecondaryAuth.useNewConnection.calledWith(existingConnection))
        })

        it('should reauthenticate existing invalid connection', async function () {
            const existingConnection = { ...mockSmusConnection, domainUrl: testDomainUrl.toLowerCase() }
            mockAuth.listConnections.resolves([existingConnection])
            mockAuth.getConnectionState.returns('invalid')

            const result = await smusAuthProvider.connectToSmus(testDomainUrl)

            assert.strictEqual(result, mockSmusConnection)
            assert.ok(mockAuth.reauthenticate.calledWith(existingConnection))
            assert.ok(mockSecondaryAuth.useNewConnection.called)
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
        })

        it('should handle SmusUtils errors', async function () {
            const error = new Error('SmusUtils error')
            getSsoInstanceInfoStub.rejects(error)

            await assert.rejects(
                () => smusAuthProvider.connectToSmus(testDomainUrl),
                (err: ToolkitError) => err.code === 'FailedToConnect'
            )
        })

        it('should handle auth creation errors', async function () {
            const error = new Error('Auth creation failed')
            mockAuth.createConnection.rejects(error)

            await assert.rejects(
                () => smusAuthProvider.connectToSmus(testDomainUrl),
                (err: ToolkitError) => err.code === 'FailedToConnect'
            )
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
})
