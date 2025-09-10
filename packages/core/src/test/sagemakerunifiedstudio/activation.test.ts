/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import * as vscode from 'vscode'
import { activate } from '../../sagemakerunifiedstudio/activation'
import * as extensionUtilities from '../../shared/extensionUtilities'
import * as connectionMagicsSelectorActivation from '../../sagemakerunifiedstudio/connectionMagicsSelector/activation'
import * as explorerActivation from '../../sagemakerunifiedstudio/explorer/activation'
import * as resourceMetadataUtils from '../../sagemakerunifiedstudio/shared/utils/resourceMetadataUtils'
import * as setContext from '../../shared/vscode/setContext'
import { SmusUtils } from '../../sagemakerunifiedstudio/shared/smusUtils'

describe('SageMaker Unified Studio Main Activation', function () {
    let mockExtensionContext: vscode.ExtensionContext
    let isSageMakerStub: sinon.SinonStub
    let initializeResourceMetadataStub: sinon.SinonStub
    let setContextStub: sinon.SinonStub
    let isInSmusSpaceEnvironmentStub: sinon.SinonStub
    let activateConnectionMagicsSelectorStub: sinon.SinonStub
    let activateExplorerStub: sinon.SinonStub

    beforeEach(function () {
        mockExtensionContext = {
            subscriptions: [],
            extensionPath: '/test/path',
            globalState: {
                get: sinon.stub(),
                update: sinon.stub(),
            },
            workspaceState: {
                get: sinon.stub(),
                update: sinon.stub(),
            },
        } as any

        // Stub all dependencies
        isSageMakerStub = sinon.stub(extensionUtilities, 'isSageMaker')
        initializeResourceMetadataStub = sinon.stub(resourceMetadataUtils, 'initializeResourceMetadata')
        setContextStub = sinon.stub(setContext, 'setContext')
        isInSmusSpaceEnvironmentStub = sinon.stub(SmusUtils, 'isInSmusSpaceEnvironment')
        activateConnectionMagicsSelectorStub = sinon.stub(connectionMagicsSelectorActivation, 'activate')
        activateExplorerStub = sinon.stub(explorerActivation, 'activate')

        // Set default return values
        isSageMakerStub.returns(false)
        initializeResourceMetadataStub.resolves()
        setContextStub.resolves()
        isInSmusSpaceEnvironmentStub.returns(false)
        activateConnectionMagicsSelectorStub.resolves()
        activateExplorerStub.resolves()
    })

    afterEach(function () {
        sinon.restore()
    })

    describe('activate function', function () {
        it('should always activate explorer regardless of environment', async function () {
            isSageMakerStub.returns(false)

            await activate(mockExtensionContext)

            assert.ok(activateExplorerStub.calledOnceWith(mockExtensionContext))
        })

        it('should not initialize SMUS components when not in SageMaker environment', async function () {
            isSageMakerStub.returns(false)

            await activate(mockExtensionContext)

            assert.ok(initializeResourceMetadataStub.notCalled)
            assert.ok(setContextStub.notCalled)
            assert.ok(activateConnectionMagicsSelectorStub.notCalled)
            assert.ok(activateExplorerStub.calledOnceWith(mockExtensionContext))
        })

        it('should initialize SMUS components when in SMUS environment', async function () {
            isSageMakerStub.withArgs('SMUS').returns(true)
            isSageMakerStub.withArgs('SMUS-SPACE-REMOTE-ACCESS').returns(false)
            isInSmusSpaceEnvironmentStub.returns(true)

            await activate(mockExtensionContext)

            assert.ok(initializeResourceMetadataStub.calledOnce)
            assert.ok(setContextStub.calledOnceWith('aws.smus.inSmusSpaceEnvironment', true))
            assert.ok(activateConnectionMagicsSelectorStub.calledOnceWith(mockExtensionContext))
            assert.ok(activateExplorerStub.calledOnceWith(mockExtensionContext))
        })

        it('should initialize SMUS components when in SMUS-SPACE-REMOTE-ACCESS environment', async function () {
            isSageMakerStub.withArgs('SMUS').returns(false)
            isSageMakerStub.withArgs('SMUS-SPACE-REMOTE-ACCESS').returns(true)
            isInSmusSpaceEnvironmentStub.returns(false)

            await activate(mockExtensionContext)

            assert.ok(initializeResourceMetadataStub.calledOnce)
            assert.ok(setContextStub.calledOnceWith('aws.smus.inSmusSpaceEnvironment', false))
            assert.ok(activateConnectionMagicsSelectorStub.calledOnceWith(mockExtensionContext))
            assert.ok(activateExplorerStub.calledOnceWith(mockExtensionContext))
        })

        it('should call functions in correct order for SMUS environment', async function () {
            isSageMakerStub.withArgs('SMUS').returns(true)
            isSageMakerStub.withArgs('SMUS-SPACE-REMOTE-ACCESS').returns(false)
            isInSmusSpaceEnvironmentStub.returns(true)

            await activate(mockExtensionContext)

            // Verify the order of calls
            assert.ok(initializeResourceMetadataStub.calledBefore(setContextStub))
            assert.ok(setContextStub.calledBefore(activateConnectionMagicsSelectorStub))
            assert.ok(activateConnectionMagicsSelectorStub.calledBefore(activateExplorerStub))
        })

        it('should handle initializeResourceMetadata errors', async function () {
            isSageMakerStub.withArgs('SMUS').returns(true)
            const error = new Error('Resource metadata initialization failed')
            initializeResourceMetadataStub.rejects(error)

            await assert.rejects(() => activate(mockExtensionContext), /Resource metadata initialization failed/)

            assert.ok(initializeResourceMetadataStub.calledOnce)
            assert.ok(setContextStub.notCalled)
            assert.ok(activateConnectionMagicsSelectorStub.notCalled)
        })

        it('should handle setContext errors', async function () {
            isSageMakerStub.withArgs('SMUS').returns(true)
            isInSmusSpaceEnvironmentStub.returns(true)
            const error = new Error('Set context failed')
            setContextStub.rejects(error)

            await assert.rejects(() => activate(mockExtensionContext), /Set context failed/)

            assert.ok(initializeResourceMetadataStub.calledOnce)
            assert.ok(setContextStub.calledOnce)
            assert.ok(activateConnectionMagicsSelectorStub.notCalled)
        })

        it('should handle connectionMagicsSelector activation errors', async function () {
            isSageMakerStub.withArgs('SMUS').returns(true)
            isInSmusSpaceEnvironmentStub.returns(true)
            const error = new Error('Connection magics selector activation failed')
            activateConnectionMagicsSelectorStub.rejects(error)

            await assert.rejects(() => activate(mockExtensionContext), /Connection magics selector activation failed/)

            assert.ok(initializeResourceMetadataStub.calledOnce)
            assert.ok(setContextStub.calledOnce)
            assert.ok(activateConnectionMagicsSelectorStub.calledOnce)
        })

        it('should handle explorer activation errors', async function () {
            const error = new Error('Explorer activation failed')
            activateExplorerStub.rejects(error)

            await assert.rejects(() => activate(mockExtensionContext), /Explorer activation failed/)

            assert.ok(activateExplorerStub.calledOnce)
        })

        it('should pass correct extension context to all activation functions', async function () {
            isSageMakerStub.withArgs('SMUS').returns(true)
            isInSmusSpaceEnvironmentStub.returns(true)

            await activate(mockExtensionContext)

            assert.ok(activateConnectionMagicsSelectorStub.calledWith(mockExtensionContext))
            assert.ok(activateExplorerStub.calledWith(mockExtensionContext))
        })
    })

    describe('environment detection logic', function () {
        it('should check both SMUS and SMUS-SPACE-REMOTE-ACCESS environments', async function () {
            isSageMakerStub.withArgs('SMUS').returns(false)
            isSageMakerStub.withArgs('SMUS-SPACE-REMOTE-ACCESS').returns(false)

            await activate(mockExtensionContext)

            assert.ok(isSageMakerStub.calledWith('SMUS'))
            assert.ok(isSageMakerStub.calledWith('SMUS-SPACE-REMOTE-ACCESS'))
        })

        it('should activate SMUS components if either environment check returns true', async function () {
            // Test case 1: Only SMUS returns true
            isSageMakerStub.withArgs('SMUS').returns(true)
            isSageMakerStub.withArgs('SMUS-SPACE-REMOTE-ACCESS').returns(false)
            isInSmusSpaceEnvironmentStub.returns(true)

            await activate(mockExtensionContext)

            assert.ok(initializeResourceMetadataStub.calledOnce)
            assert.ok(activateConnectionMagicsSelectorStub.calledOnce)

            // Reset stubs for second test
            initializeResourceMetadataStub.resetHistory()
            activateConnectionMagicsSelectorStub.resetHistory()

            // Test case 2: Only SMUS-SPACE-REMOTE-ACCESS returns true
            isSageMakerStub.withArgs('SMUS').returns(false)
            isSageMakerStub.withArgs('SMUS-SPACE-REMOTE-ACCESS').returns(true)
            isInSmusSpaceEnvironmentStub.returns(false)

            await activate(mockExtensionContext)

            assert.ok(initializeResourceMetadataStub.calledOnce)
            assert.ok(activateConnectionMagicsSelectorStub.calledOnce)
        })

        it('should use SmusUtils.isInSmusSpaceEnvironment() result for context setting', async function () {
            isSageMakerStub.withArgs('SMUS').returns(true)

            // Test with true
            isInSmusSpaceEnvironmentStub.returns(true)
            await activate(mockExtensionContext)
            assert.ok(setContextStub.calledWith('aws.smus.inSmusSpaceEnvironment', true))

            // Reset and test with false
            setContextStub.resetHistory()
            isInSmusSpaceEnvironmentStub.returns(false)
            await activate(mockExtensionContext)
            assert.ok(setContextStub.calledWith('aws.smus.inSmusSpaceEnvironment', false))
        })
    })

    describe('integration scenarios', function () {
        it('should handle mixed success and failure scenarios gracefully', async function () {
            isSageMakerStub.withArgs('SMUS').returns(true)
            isInSmusSpaceEnvironmentStub.returns(true)

            // initializeResourceMetadata succeeds, setContext fails
            const setContextError = new Error('Context setting failed')
            setContextStub.rejects(setContextError)

            await assert.rejects(() => activate(mockExtensionContext), /Context setting failed/)

            // Verify that initializeResourceMetadata was called but subsequent functions were not
            assert.ok(initializeResourceMetadataStub.calledOnce)
            assert.ok(setContextStub.calledOnce)
            assert.ok(activateConnectionMagicsSelectorStub.notCalled)
            assert.ok(activateExplorerStub.notCalled)
        })

        it('should complete successfully when all components initialize properly', async function () {
            isSageMakerStub.withArgs('SMUS').returns(true)
            isSageMakerStub.withArgs('SMUS-SPACE-REMOTE-ACCESS').returns(false)
            isInSmusSpaceEnvironmentStub.returns(true)

            // All functions should succeed
            await activate(mockExtensionContext)

            // Verify all expected functions were called
            assert.ok(initializeResourceMetadataStub.calledOnce)
            assert.ok(setContextStub.calledOnce)
            assert.ok(activateConnectionMagicsSelectorStub.calledOnce)
            assert.ok(activateExplorerStub.calledOnce)
        })

        it('should handle undefined extension context gracefully', async function () {
            const undefinedContext = undefined as any

            // Should not throw for undefined context, but let the individual activation functions handle it
            await activate(undefinedContext)

            assert.ok(activateExplorerStub.calledWith(undefinedContext))
        })
    })
})
