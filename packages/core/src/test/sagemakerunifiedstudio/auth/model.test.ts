/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import {
    createSmusProfile,
    isValidSmusConnection,
    scopeSmus,
    SmusConnection,
} from '../../../sagemakerunifiedstudio/auth/model'
import { SsoConnection } from '../../../auth/connection'

describe('SMUS Auth Model', function () {
    const testDomainUrl = 'https://dzd_domainId.sagemaker.us-east-2.on.aws'
    const testDomainId = 'dzd_domainId'
    const testStartUrl = 'https://identitycenter.amazonaws.com/ssoins-testInstanceId'
    const testRegion = 'us-east-2'

    describe('scopeSmus', function () {
        it('should have correct scope value', function () {
            assert.strictEqual(scopeSmus, 'datazone:domain:access')
        })
    })

    describe('createSmusProfile', function () {
        it('should create profile with default scopes', function () {
            const profile = createSmusProfile(testDomainUrl, testDomainId, testStartUrl, testRegion)

            assert.strictEqual(profile.domainUrl, testDomainUrl)
            assert.strictEqual(profile.domainId, testDomainId)
            assert.strictEqual(profile.startUrl, testStartUrl)
            assert.strictEqual(profile.ssoRegion, testRegion)
            assert.strictEqual(profile.type, 'sso')
            assert.deepStrictEqual(profile.scopes, [scopeSmus])
        })

        it('should create profile with custom scopes', function () {
            const customScopes = ['custom:scope', 'another:scope']
            const profile = createSmusProfile(testDomainUrl, testDomainId, testStartUrl, testRegion, customScopes)

            assert.strictEqual(profile.domainUrl, testDomainUrl)
            assert.strictEqual(profile.domainId, testDomainId)
            assert.strictEqual(profile.startUrl, testStartUrl)
            assert.strictEqual(profile.ssoRegion, testRegion)
            assert.strictEqual(profile.type, 'sso')
            assert.deepStrictEqual(profile.scopes, customScopes)
        })

        it('should create profile with all required properties', function () {
            const profile = createSmusProfile(testDomainUrl, testDomainId, testStartUrl, testRegion)

            // Check SsoProfile properties
            assert.strictEqual(profile.type, 'sso')
            assert.strictEqual(profile.startUrl, testStartUrl)
            assert.strictEqual(profile.ssoRegion, testRegion)
            assert.ok(Array.isArray(profile.scopes))

            // Check SmusProfile properties
            assert.strictEqual(profile.domainUrl, testDomainUrl)
            assert.strictEqual(profile.domainId, testDomainId)
        })
    })

    describe('isValidSmusConnection', function () {
        it('should return true for valid SMUS connection', function () {
            const validConnection = {
                id: 'test-connection-id',
                type: 'sso',
                startUrl: testStartUrl,
                ssoRegion: testRegion,
                scopes: [scopeSmus],
                label: 'Test SMUS Connection',
                domainUrl: testDomainUrl,
                domainId: testDomainId,
            } as SmusConnection

            assert.strictEqual(isValidSmusConnection(validConnection), true)
        })

        it('should return false for connection without SMUS scope', function () {
            const connectionWithoutScope = {
                id: 'test-connection-id',
                type: 'sso',
                startUrl: testStartUrl,
                ssoRegion: testRegion,
                scopes: ['sso:account:access'],
                label: 'Test Connection',
                domainUrl: testDomainUrl,
                domainId: testDomainId,
            } as any

            assert.strictEqual(isValidSmusConnection(connectionWithoutScope), false)
        })

        it('should return false for connection without SMUS properties', function () {
            const connectionWithoutSmusProps = {
                id: 'test-connection-id',
                type: 'sso',
                startUrl: testStartUrl,
                ssoRegion: testRegion,
                scopes: [scopeSmus],
                label: 'Test Connection',
            } as SsoConnection

            assert.strictEqual(isValidSmusConnection(connectionWithoutSmusProps), false)
        })

        it('should return false for non-SSO connection', function () {
            const nonSsoConnection = {
                id: 'test-connection-id',
                type: 'iam',
                label: 'Test IAM Connection',
                domainUrl: testDomainUrl,
                domainId: testDomainId,
                scopes: [scopeSmus],
            }

            assert.strictEqual(isValidSmusConnection(nonSsoConnection), false)
        })

        it('should return false for undefined connection', function () {
            assert.strictEqual(isValidSmusConnection(undefined), false)
        })

        it('should return false for null connection', function () {
            assert.strictEqual(isValidSmusConnection(undefined), false)
        })

        it('should return false for connection without scopes', function () {
            const connectionWithoutScopes = {
                id: 'test-connection-id',
                type: 'sso',
                startUrl: testStartUrl,
                ssoRegion: testRegion,
                label: 'Test Connection',
                domainUrl: testDomainUrl,
                domainId: testDomainId,
            }

            assert.strictEqual(isValidSmusConnection(connectionWithoutScopes), false)
        })

        it('should return false for connection with empty scopes array', function () {
            const connectionWithEmptyScopes = {
                id: 'test-connection-id',
                type: 'sso',
                startUrl: testStartUrl,
                ssoRegion: testRegion,
                scopes: [],
                label: 'Test Connection',
                domainUrl: testDomainUrl,
                domainId: testDomainId,
            }

            assert.strictEqual(isValidSmusConnection(connectionWithEmptyScopes), false)
        })

        it('should return true for connection with SMUS scope among other scopes', function () {
            const connectionWithMultipleScopes = {
                id: 'test-connection-id',
                type: 'sso',
                startUrl: testStartUrl,
                ssoRegion: testRegion,
                scopes: ['sso:account:access', scopeSmus, 'other:scope'],
                label: 'Test SMUS Connection',
                domainUrl: testDomainUrl,
                domainId: testDomainId,
            } as SmusConnection

            assert.strictEqual(isValidSmusConnection(connectionWithMultipleScopes), true)
        })

        it('should return false for connection missing domainUrl', function () {
            const connectionMissingDomainUrl = {
                id: 'test-connection-id',
                type: 'sso',
                startUrl: testStartUrl,
                ssoRegion: testRegion,
                scopes: [scopeSmus],
                label: 'Test Connection',
                domainId: testDomainId,
            }

            assert.strictEqual(isValidSmusConnection(connectionMissingDomainUrl), false)
        })

        it('should return false for connection missing domainId', function () {
            const connectionMissingDomainId = {
                id: 'test-connection-id',
                type: 'sso',
                startUrl: testStartUrl,
                ssoRegion: testRegion,
                scopes: [scopeSmus],
                label: 'Test Connection',
                domainUrl: testDomainUrl,
            }

            assert.strictEqual(isValidSmusConnection(connectionMissingDomainId), false)
        })
    })

    describe('SmusConnection interface', function () {
        it('should extend both SmusProfile and SsoConnection', function () {
            const connection = {
                id: 'test-connection-id',
                type: 'sso',
                startUrl: testStartUrl,
                ssoRegion: testRegion,
                scopes: [scopeSmus],
                label: 'Test SMUS Connection',
                domainUrl: testDomainUrl,
                domainId: testDomainId,
            } as SmusConnection

            // Should have Connection properties
            assert.strictEqual(connection.id, 'test-connection-id')
            assert.strictEqual(connection.label, 'Test SMUS Connection')

            // Should have SsoConnection properties
            assert.strictEqual(connection.type, 'sso')
            assert.strictEqual(connection.startUrl, testStartUrl)
            assert.strictEqual(connection.ssoRegion, testRegion)
            assert.ok(Array.isArray(connection.scopes))

            // Should have SmusProfile properties
            assert.strictEqual(connection.domainUrl, testDomainUrl)
            assert.strictEqual(connection.domainId, testDomainId)
        })
    })
})
