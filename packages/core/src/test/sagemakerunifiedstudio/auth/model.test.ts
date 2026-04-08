/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { Credentials } from '@aws-sdk/types'
import * as sinon from 'sinon'
import {
    SmusSsoConnection,
    SmusIamConnection,
    isSmusIamConnection,
    isSmusSsoConnection,
    isValidSmusConnection,
    createSmusProfile,
    scopeSmus,
    getDataZoneSsoScope,
} from '../../../sagemakerunifiedstudio/auth/model'
import { DevSettings } from '../../../shared/settings'

describe('SMUS Connection Model', function () {
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    const mockCredentials: Credentials = {
        accessKeyId: 'test-access-key',
        secretAccessKey: 'test-secret-key',
    }

    const mockCredentialsProvider = async (): Promise<Credentials> => mockCredentials

    const mockGetToken = async () => ({
        accessToken: 'mock-access-token',
        expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
    })

    const mockGetRegistration = async () => ({
        clientId: 'mock-client-id',
        clientSecret: 'mock-client-secret',
        expiresAt: new Date(Date.now() + 86400000), // 24 hours from now
        startUrl: 'https://test.sagemaker.us-east-1.on.aws/',
    })

    describe('isSmusIamConnection', function () {
        it('should return true for valid SMUS IAM connection', function () {
            const connection: SmusIamConnection = {
                type: 'iam',
                profileName: 'test-profile',
                region: 'us-east-1',
                domainUrl: 'https://test.sagemaker.us-east-1.on.aws/',
                domainId: 'test-domain-id',
                id: 'test-id',
                label: 'Test IAM Connection',
                endpointUrl: undefined,
                getCredentials: mockCredentialsProvider,
            }

            assert.strictEqual(isSmusIamConnection(connection), true)
        })

        it('should return false for SSO connection', function () {
            const connection: SmusSsoConnection = {
                type: 'sso',
                startUrl: 'https://test.awsapps.com/start',
                ssoRegion: 'us-east-1',
                scopes: [scopeSmus],
                domainUrl: 'https://test.sagemaker.us-east-1.on.aws/',
                domainId: 'test-domain-id',
                id: 'test-id',
                label: 'Test SSO Connection',
                getToken: mockGetToken,
                getRegistration: mockGetRegistration,
            }

            assert.strictEqual(isSmusIamConnection(connection), false)
        })

        it('should return false for connection missing required IAM properties', function () {
            const connection = {
                type: 'iam',
                profileName: 'test-profile',
                // Missing region, domainUrl, domainId, getCredentials
                id: 'test-id',
                label: 'Test IAM Connection',
                endpointUrl: undefined,
            }

            assert.strictEqual(isSmusIamConnection(connection as any), false)
        })

        it('should return false for undefined connection', function () {
            assert.strictEqual(isSmusIamConnection(undefined), false)
        })

        it('should return false for connection with wrong type', function () {
            const connection = {
                type: 'other',
                profileName: 'test-profile',
                region: 'us-east-1',
                domainUrl: 'https://test.sagemaker.us-east-1.on.aws/',
                domainId: 'test-domain-id',
                id: 'test-id',
                label: 'Test Connection',
            }

            assert.strictEqual(isSmusIamConnection(connection as any), false)
        })
    })

    describe('isSmusSsoConnection', function () {
        it('should return true for valid SMUS SSO connection', function () {
            const connection: SmusSsoConnection = {
                type: 'sso',
                startUrl: 'https://test.awsapps.com/start',
                ssoRegion: 'us-east-1',
                scopes: [scopeSmus],
                domainUrl: 'https://test.sagemaker.us-east-1.on.aws/',
                domainId: 'test-domain-id',
                id: 'test-id',
                label: 'Test SSO Connection',
                getToken: mockGetToken,
                getRegistration: mockGetRegistration,
            }

            assert.strictEqual(isSmusSsoConnection(connection), true)
        })

        it('should return false for IAM connection', function () {
            const connection: SmusIamConnection = {
                type: 'iam',
                profileName: 'test-profile',
                region: 'us-east-1',
                domainUrl: 'https://test.sagemaker.us-east-1.on.aws/',
                domainId: 'test-domain-id',
                id: 'test-id',
                label: 'Test IAM Connection',
                endpointUrl: undefined,
                getCredentials: mockCredentialsProvider,
            }

            assert.strictEqual(isSmusSsoConnection(connection), false)
        })

        it('should return false for SSO connection without SMUS scope', function () {
            const connection = {
                type: 'sso',
                startUrl: 'https://test.awsapps.com/start',
                ssoRegion: 'us-east-1',
                scopes: ['other:scope'],
                domainUrl: 'https://test.sagemaker.us-east-1.on.aws/',
                domainId: 'test-domain-id',
                id: 'test-id',
                label: 'Test SSO Connection',
            }

            assert.strictEqual(isSmusSsoConnection(connection as any), false)
        })

        it('should return false for SSO connection missing SMUS properties', function () {
            const connection = {
                type: 'sso',
                startUrl: 'https://test.awsapps.com/start',
                ssoRegion: 'us-east-1',
                scopes: [scopeSmus],
                // Missing domainUrl and domainId
                id: 'test-id',
                label: 'Test SSO Connection',
            }

            assert.strictEqual(isSmusSsoConnection(connection as any), false)
        })

        it('should return false for undefined connection', function () {
            assert.strictEqual(isSmusSsoConnection(undefined), false)
        })
    })

    describe('isValidSmusConnection', function () {
        it('should return true for valid SMUS SSO connection', function () {
            const connection: SmusSsoConnection = {
                type: 'sso',
                startUrl: 'https://test.awsapps.com/start',
                ssoRegion: 'us-east-1',
                scopes: [scopeSmus],
                domainUrl: 'https://test.sagemaker.us-east-1.on.aws/',
                domainId: 'test-domain-id',
                id: 'test-id',
                label: 'Test SSO Connection',
                getToken: mockGetToken,
                getRegistration: mockGetRegistration,
            }

            assert.strictEqual(isValidSmusConnection(connection), true)
        })

        it('should return true for valid SMUS IAM connection', function () {
            const connection: SmusIamConnection = {
                type: 'iam',
                profileName: 'test-profile',
                region: 'us-east-1',
                domainUrl: 'https://test.sagemaker.us-east-1.on.aws/',
                domainId: 'test-domain-id',
                id: 'test-id',
                label: 'Test IAM Connection',
                endpointUrl: undefined,
                getCredentials: mockCredentialsProvider,
            }

            assert.strictEqual(isValidSmusConnection(connection), true)
        })

        it('should return false for invalid connection', function () {
            const connection = {
                type: 'other',
                id: 'test-id',
                label: 'Test Connection',
            }

            assert.strictEqual(isValidSmusConnection(connection), false)
        })

        it('should return false for undefined connection', function () {
            assert.strictEqual(isValidSmusConnection(undefined), false)
        })
    })

    describe('getDataZoneSsoScope', function () {
        it('should return default scope when no custom setting is provided', function () {
            // When get() is called with default value, it returns the default (scopeSmus)
            // This simulates the behavior when aws.dev.datazoneScope is not set
            sandbox.stub(DevSettings.instance, 'get').withArgs('datazoneScope', scopeSmus).returns(scopeSmus)

            const scope = getDataZoneSsoScope()

            assert.strictEqual(scope, scopeSmus)
        })

        it('should return custom scope when setting is configured', function () {
            const customScope = 'custom:datazone:scope'
            // When get() is called, it returns the custom value from settings
            // This simulates the behavior when aws.dev.datazoneScope is set to customScope
            sandbox.stub(DevSettings.instance, 'get').withArgs('datazoneScope', scopeSmus).returns(customScope)

            const scope = getDataZoneSsoScope()

            assert.strictEqual(scope, customScope)
        })
    })

    describe('createSmusProfile', function () {
        it('should create a valid SMUS profile with default scope', function () {
            sandbox.stub(DevSettings.instance, 'get').withArgs('datazoneScope', scopeSmus).returns(scopeSmus)

            const domainUrl = 'https://test.sagemaker.us-east-1.on.aws/'
            const domainId = 'test-domain-id'
            const startUrl = 'https://test.awsapps.com/start'
            const region = 'us-east-1'

            const profile = createSmusProfile(domainUrl, domainId, startUrl, region)

            assert.strictEqual(profile.domainUrl, domainUrl)
            assert.strictEqual(profile.domainId, domainId)
            assert.strictEqual(profile.startUrl, startUrl)
            assert.strictEqual(profile.ssoRegion, region)
            assert.strictEqual(profile.type, 'sso')
            assert.deepStrictEqual(profile.scopes, [scopeSmus])
        })

        it('should create a valid SMUS profile with custom scope from settings', function () {
            const customScope = 'custom:datazone:scope'
            sandbox.stub(DevSettings.instance, 'get').withArgs('datazoneScope', scopeSmus).returns(customScope)

            const domainUrl = 'https://test.sagemaker.us-east-1.on.aws/'
            const domainId = 'test-domain-id'
            const startUrl = 'https://test.awsapps.com/start'
            const region = 'us-east-1'

            const profile = createSmusProfile(domainUrl, domainId, startUrl, region)

            assert.deepStrictEqual(profile.scopes, [customScope])
        })

        it('should create a valid SMUS profile with custom scopes parameter', function () {
            const domainUrl = 'https://test.sagemaker.us-east-1.on.aws/'
            const domainId = 'test-domain-id'
            const startUrl = 'https://test.awsapps.com/start'
            const region = 'us-east-1'
            const customScopes = ['custom:scope1', 'custom:scope2']

            const profile = createSmusProfile(domainUrl, domainId, startUrl, region, customScopes)

            assert.deepStrictEqual(profile.scopes, customScopes)
        })
    })

    describe('isSmusSsoConnection with custom scope', function () {
        it('should return true for connection with custom scope from settings', function () {
            const customScope = 'custom:datazone:scope'
            sandbox.stub(DevSettings.instance, 'get').withArgs('datazoneScope', scopeSmus).returns(customScope)

            const connection = {
                type: 'sso',
                startUrl: 'https://test.awsapps.com/start',
                ssoRegion: 'us-east-1',
                scopes: [customScope],
                domainUrl: 'https://test.sagemaker.us-east-1.on.aws/',
                domainId: 'test-domain-id',
                id: 'test-id',
                label: 'Test SSO Connection',
                getToken: mockGetToken,
                getRegistration: mockGetRegistration,
            } as SmusSsoConnection

            assert.strictEqual(isSmusSsoConnection(connection), true)
        })

        it('should return true for connection with default scope even when custom scope is configured', function () {
            const customScope = 'custom:datazone:scope'
            sandbox.stub(DevSettings.instance, 'get').withArgs('datazoneScope', scopeSmus).returns(customScope)

            const connection = {
                type: 'sso',
                startUrl: 'https://test.awsapps.com/start',
                ssoRegion: 'us-east-1',
                scopes: [scopeSmus], // Using default scope
                domainUrl: 'https://test.sagemaker.us-east-1.on.aws/',
                domainId: 'test-domain-id',
                id: 'test-id',
                label: 'Test SSO Connection',
                getToken: mockGetToken,
                getRegistration: mockGetRegistration,
            } as SmusSsoConnection

            // Should still work for backward compatibility
            assert.strictEqual(isSmusSsoConnection(connection), true)
        })
    })
})
