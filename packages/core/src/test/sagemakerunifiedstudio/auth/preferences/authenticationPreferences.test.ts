/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import {
    SmusAuthenticationPreferencesManager,
    SmusAuthenticationPreferences,
    SmusIamProfileConfig,
} from '../../../../sagemakerunifiedstudio/auth/preferences/authenticationPreferences'
import { globals } from '../../../../shared'

describe('SmusAuthenticationPreferencesManager', function () {
    let mockContext: any
    let sandbox: sinon.SinonSandbox
    let mockGlobalState: any

    beforeEach(function () {
        sandbox = sinon.createSandbox()

        // Mock the globals.globalState instead of context.globalState directly
        mockGlobalState = {
            get: sandbox.stub(),
            update: sandbox.stub().resolves(),
        }

        // Mock VS Code extension context (still needed for the API)
        mockContext = {
            globalState: mockGlobalState,
        }

        // Stub globals.globalState to use our mock
        sandbox.stub(globals, 'globalState').value(mockGlobalState)
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('getPreferences', function () {
        it('should return default preferences when none are stored', function () {
            // Setup
            mockGlobalState.get.returns(undefined)

            // Act
            const preferences = SmusAuthenticationPreferencesManager.getPreferences(mockContext)

            // Assert
            assert.deepStrictEqual(preferences, {
                rememberChoice: false,
            })
        })

        it('should return stored preferences when available', function () {
            // Setup
            const storedPreferences: SmusAuthenticationPreferences = {
                preferredMethod: 'iam',
                rememberChoice: true,
                lastUsedSsoConnection: 'conn-123',
                lastUsedIamProfile: {
                    profileName: 'default',
                    region: 'us-east-1',
                    lastUsed: new Date('2023-01-01'),
                    isDefault: true,
                },
            }
            mockGlobalState.get.returns(storedPreferences)

            // Act
            const preferences = SmusAuthenticationPreferencesManager.getPreferences(mockContext)

            // Assert
            assert.deepStrictEqual(preferences, storedPreferences)
        })

        it('should merge stored preferences with defaults', function () {
            // Setup
            const partialPreferences = {
                preferredMethod: 'sso' as const,
            }
            mockGlobalState.get.returns(partialPreferences)

            // Act
            const preferences = SmusAuthenticationPreferencesManager.getPreferences(mockContext)

            // Assert
            assert.deepStrictEqual(preferences, {
                preferredMethod: 'sso',
                rememberChoice: false,
            })
        })
    })

    describe('updatePreferences', function () {
        it('should update preferences correctly', async function () {
            // Setup
            const currentPreferences: SmusAuthenticationPreferences = {
                preferredMethod: 'sso',
                rememberChoice: true,
            }
            mockGlobalState.get.returns(currentPreferences)

            const updates = {
                preferredMethod: 'iam' as const,
                lastUsedSsoConnection: 'conn-456',
            }

            // Act
            await SmusAuthenticationPreferencesManager.updatePreferences(mockContext, updates)

            // Assert
            assert.strictEqual(mockGlobalState.update.calledOnce, true)
            const [key, updatedPreferences] = mockGlobalState.update.firstCall.args
            assert.strictEqual(key, 'aws.smus.authenticationPreferences')
            assert.deepStrictEqual(updatedPreferences, {
                preferredMethod: 'iam',
                rememberChoice: true,
                lastUsedSsoConnection: 'conn-456',
            })
        })
    })

    describe('setPreferredMethod', function () {
        it('should set preferred method and remember choice', async function () {
            // Setup
            mockGlobalState.get.returns({})

            // Act
            await SmusAuthenticationPreferencesManager.setPreferredMethod(mockContext, 'iam', true)

            // Assert
            assert.strictEqual(mockGlobalState.update.calledOnce, true)
            const [key, preferences] = mockGlobalState.update.firstCall.args
            assert.strictEqual(key, 'aws.smus.authenticationPreferences')
            assert.deepStrictEqual(preferences, {
                preferredMethod: 'iam',
                rememberChoice: true,
            })
        })
    })

    describe('getPreferredMethod', function () {
        it('should return preferred method when remember choice is true', function () {
            // Setup
            const preferences: SmusAuthenticationPreferences = {
                preferredMethod: 'iam',
                rememberChoice: true,
            }
            mockGlobalState.get.returns(preferences)

            // Act
            const method = SmusAuthenticationPreferencesManager.getPreferredMethod(mockContext)

            // Assert
            assert.strictEqual(method, 'iam')
        })

        it('should return undefined when remember choice is false', function () {
            // Setup
            const preferences: SmusAuthenticationPreferences = {
                preferredMethod: 'iam',
                rememberChoice: false,
            }
            mockGlobalState.get.returns(preferences)

            // Act
            const method = SmusAuthenticationPreferencesManager.getPreferredMethod(mockContext)

            // Assert
            assert.strictEqual(method, undefined)
        })

        it('should return undefined when no preferred method is set', function () {
            // Setup
            const preferences: SmusAuthenticationPreferences = {
                rememberChoice: true,
            }
            mockGlobalState.get.returns(preferences)

            // Act
            const method = SmusAuthenticationPreferencesManager.getPreferredMethod(mockContext)

            // Assert
            assert.strictEqual(method, undefined)
        })
    })

    describe('setLastUsedSsoConnection', function () {
        it('should set last used SSO connection', async function () {
            // Setup
            mockGlobalState.get.returns({})

            // Act
            await SmusAuthenticationPreferencesManager.setLastUsedSsoConnection(mockContext, 'conn-789')

            // Assert
            assert.strictEqual(mockGlobalState.update.calledOnce, true)
            const [key, preferences] = mockGlobalState.update.firstCall.args
            assert.strictEqual(key, 'aws.smus.authenticationPreferences')
            assert.deepStrictEqual(preferences, {
                rememberChoice: false,
                lastUsedSsoConnection: 'conn-789',
            })
        })
    })

    describe('setLastUsedIamProfile', function () {
        it('should set last used IAM profile with timestamp', async function () {
            // Setup
            mockGlobalState.get.returns({})
            const profileConfig: SmusIamProfileConfig = {
                profileName: 'production',
                region: 'us-west-2',
                isDefault: false,
            }

            // Act
            await SmusAuthenticationPreferencesManager.setLastUsedIamProfile(mockContext, profileConfig)

            // Assert
            assert.strictEqual(mockGlobalState.update.calledOnce, true)
            const [key, preferences] = mockGlobalState.update.firstCall.args
            assert.strictEqual(key, 'aws.smus.authenticationPreferences')

            assert.strictEqual(preferences.lastUsedIamProfile.profileName, 'production')
            assert.strictEqual(preferences.lastUsedIamProfile.region, 'us-west-2')
            assert.strictEqual(preferences.lastUsedIamProfile.isDefault, false)
            assert.ok(preferences.lastUsedIamProfile.lastUsed instanceof Date)
        })
    })

    describe('getLastUsedIamProfile', function () {
        it('should return last used IAM profile when available', function () {
            // Setup
            const profileConfig: SmusIamProfileConfig = {
                profileName: 'test-profile',
                region: 'eu-west-1',
                lastUsed: new Date('2023-06-01'),
                isDefault: true,
            }
            const preferences: SmusAuthenticationPreferences = {
                rememberChoice: false,
                lastUsedIamProfile: profileConfig,
            }
            mockGlobalState.get.returns(preferences)

            // Act
            const result = SmusAuthenticationPreferencesManager.getLastUsedIamProfile(mockContext)

            // Assert
            assert.deepStrictEqual(result, profileConfig)
        })

        it('should return undefined when no IAM profile is stored', function () {
            // Setup
            mockGlobalState.get.returns({})

            // Act
            const result = SmusAuthenticationPreferencesManager.getLastUsedIamProfile(mockContext)

            // Assert
            assert.strictEqual(result, undefined)
        })
    })

    describe('clearPreferences', function () {
        it('should clear all preferences', async function () {
            // Act
            await SmusAuthenticationPreferencesManager.clearPreferences(mockContext)

            // Assert
            assert.strictEqual(mockGlobalState.update.calledOnce, true)
            const [key, value] = mockGlobalState.update.firstCall.args
            assert.strictEqual(key, 'aws.smus.authenticationPreferences')
            assert.strictEqual(value, undefined)
        })
    })

    describe('switchAuthenticationMethod', function () {
        it('should switch authentication method', async function () {
            // Setup
            const currentPreferences: SmusAuthenticationPreferences = {
                preferredMethod: 'sso',
                rememberChoice: true,
            }
            mockGlobalState.get.returns(currentPreferences)

            // Act
            await SmusAuthenticationPreferencesManager.switchAuthenticationMethod(mockContext, 'iam')

            // Assert
            assert.strictEqual(mockGlobalState.update.calledOnce, true)
            const [key, preferences] = mockGlobalState.update.firstCall.args
            assert.strictEqual(key, 'aws.smus.authenticationPreferences')
            assert.deepStrictEqual(preferences, {
                preferredMethod: 'iam',
                rememberChoice: true,
            })
        })
    })
})
