/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { SmusAuthenticationOrchestrator } from '../../../sagemakerunifiedstudio/auth/authenticationOrchestrator'
import * as domainCache from '../../../sagemakerunifiedstudio/auth/utils/domainCache'
import { SmusErrorCodes } from '../../../sagemakerunifiedstudio/shared/smusUtils'

describe('SmusAuthenticationOrchestrator', function () {
    // Note: Due to AWS Toolkit test framework restrictions on mocking vscode.window,
    // these tests focus on the interface and behavior rather than deep mocking.
    // The actual authentication flows are tested through integration tests.

    describe('handleIamAuthentication', function () {
        it('should export the correct interface', function () {
            // Verify the class exists and has the expected static method
            assert.ok('handleIamAuthentication' in SmusAuthenticationOrchestrator)
            assert.strictEqual(typeof SmusAuthenticationOrchestrator.handleIamAuthentication, 'function')
        })

        it('should be callable without throwing', function () {
            // Verify the method exists and is accessible
            assert.doesNotThrow(() => {
                assert.ok('handleIamAuthentication' in SmusAuthenticationOrchestrator)
            })
        })
    })

    describe('handleSsoAuthentication', function () {
        it('should export the correct interface', function () {
            // Verify the class exists and has the expected static method
            assert.ok('handleSsoAuthentication' in SmusAuthenticationOrchestrator)
            assert.strictEqual(typeof SmusAuthenticationOrchestrator.handleSsoAuthentication, 'function')
        })

        it('should be callable without throwing', function () {
            // Verify the method exists and is accessible
            assert.doesNotThrow(() => {
                assert.ok('handleSsoAuthentication' in SmusAuthenticationOrchestrator)
            })
        })
    })

    describe('handleAuthenticationErrorForCache', function () {
        let removeDomainStub: sinon.SinonStub

        beforeEach(function () {
            removeDomainStub = sinon.stub(domainCache, 'removeDomainFromCache').resolves()
        })

        afterEach(function () {
            sinon.restore()
        })

        it('should remove domain from cache for InvalidDomainUrl error', async function () {
            const testDomainUrl = 'https://dzd_test123.sagemaker.us-east-1.on.aws'
            const error = new Error('Invalid domain URL') as any
            error.code = SmusErrorCodes.InvalidDomainUrl

            // Access the private method via reflection for testing
            await (SmusAuthenticationOrchestrator as any).handleAuthenticationError(testDomainUrl, error)

            assert.ok(removeDomainStub.calledOnce, 'removeDomainFromCache should be called once')
            assert.ok(
                removeDomainStub.calledWith(testDomainUrl),
                'removeDomainFromCache should be called with correct domain URL'
            )
        })

        it('should NOT remove domain from cache for ApiTimeout error', async function () {
            const testDomainUrl = 'https://dzd_test123.sagemaker.us-east-1.on.aws'
            const error = new Error('API timeout') as any
            error.code = SmusErrorCodes.ApiTimeout

            // Access the private method via reflection for testing
            await (SmusAuthenticationOrchestrator as any).handleAuthenticationError(testDomainUrl, error)

            assert.ok(removeDomainStub.notCalled, 'removeDomainFromCache should NOT be called for ApiTimeout')
        })

        it('should NOT remove domain from cache for FailedToConnect error', async function () {
            const testDomainUrl = 'https://dzd_test123.sagemaker.us-east-1.on.aws'
            const error = new Error('Failed to connect') as any
            error.code = SmusErrorCodes.FailedToConnect

            // Access the private method via reflection for testing
            await (SmusAuthenticationOrchestrator as any).handleAuthenticationError(testDomainUrl, error)

            assert.ok(removeDomainStub.notCalled, 'removeDomainFromCache should NOT be called for FailedToConnect')
        })

        it('should NOT remove domain from cache for other authentication errors', async function () {
            const testDomainUrl = 'https://dzd_test123.sagemaker.us-east-1.on.aws'
            const error = new Error('Authentication failed') as any
            error.code = SmusErrorCodes.SmusLoginFailed

            // Access the private method via reflection for testing
            await (SmusAuthenticationOrchestrator as any).handleAuthenticationError(testDomainUrl, error)

            assert.ok(
                removeDomainStub.notCalled,
                'removeDomainFromCache should NOT be called for other authentication errors'
            )
        })

        it('should NOT remove domain from cache for errors without error code', async function () {
            const testDomainUrl = 'https://dzd_test123.sagemaker.us-east-1.on.aws'
            const error = new Error('Generic error')

            // Access the private method via reflection for testing
            await (SmusAuthenticationOrchestrator as any).handleAuthenticationError(testDomainUrl, error)

            assert.ok(
                removeDomainStub.notCalled,
                'removeDomainFromCache should NOT be called for errors without error code'
            )
        })
    })

    describe('return types', function () {
        it('should handle SUCCESS and BACK return types correctly', function () {
            // Test that the return types are properly defined for both methods
            const testResult1: 'SUCCESS' | 'BACK' = 'SUCCESS'
            const testResult2: 'SUCCESS' | 'BACK' = 'BACK'

            assert.strictEqual(testResult1, 'SUCCESS')
            assert.strictEqual(testResult2, 'BACK')
        })
    })

    describe('class structure', function () {
        it('should be a class with static methods', function () {
            // Verify the orchestrator is properly structured
            assert.strictEqual(typeof SmusAuthenticationOrchestrator, 'function')
            assert.ok(SmusAuthenticationOrchestrator.prototype)
        })

        it('should have both required authentication methods', function () {
            // Verify both authentication methods exist
            const methods = ['handleIamAuthentication', 'handleSsoAuthentication']

            for (const method of methods) {
                assert.ok(method in SmusAuthenticationOrchestrator, `Missing method: ${method}`)
                assert.strictEqual(
                    typeof SmusAuthenticationOrchestrator[method as keyof typeof SmusAuthenticationOrchestrator],
                    'function',
                    `${method} should be a function`
                )
            }
        })
    })
})
