/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as sinon from 'sinon'
import assert from 'assert'
import { initialize, SagemakerCookie } from '../../auth/activation'
import { LoginManager } from '../../auth/deprecated/loginManager'
import * as extensionUtilities from '../../shared/extensionUtilities'
import * as authUtils from '../../auth/utils'
import * as errors from '../../shared/errors'

describe('auth/activation', function () {
    let sandbox: sinon.SinonSandbox
    let mockLoginManager: LoginManager
    let executeCommandStub: sinon.SinonStub
    let isAmazonQStub: sinon.SinonStub
    let isSageMakerStub: sinon.SinonStub
    let initializeCredentialsProviderManagerStub: sinon.SinonStub
    let getErrorMsgStub: sinon.SinonStub
    let mockLogger: any

    beforeEach(function () {
        sandbox = sinon.createSandbox()

        // Create mocks
        mockLoginManager = {
            login: sandbox.stub(),
            logout: sandbox.stub(),
        } as any

        mockLogger = {
            warn: sandbox.stub(),
            info: sandbox.stub(),
            error: sandbox.stub(),
            debug: sandbox.stub(),
        }

        // Stub external dependencies
        executeCommandStub = sandbox.stub(vscode.commands, 'executeCommand')
        isAmazonQStub = sandbox.stub(extensionUtilities, 'isAmazonQ')
        isSageMakerStub = sandbox.stub(extensionUtilities, 'isSageMaker')
        initializeCredentialsProviderManagerStub = sandbox.stub(authUtils, 'initializeCredentialsProviderManager')
        getErrorMsgStub = sandbox.stub(errors, 'getErrorMsg')
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('initialize', function () {
        it('should not execute sagemaker.parseCookies when not in AmazonQ and SageMaker environment', async function () {
            isAmazonQStub.returns(false)
            isSageMakerStub.returns(false)

            await initialize(mockLoginManager)

            assert.ok(!executeCommandStub.called)
            assert.ok(!initializeCredentialsProviderManagerStub.called)
        })

        it('should not execute sagemaker.parseCookies when only in AmazonQ environment', async function () {
            isAmazonQStub.returns(true)
            isSageMakerStub.returns(false)

            await initialize(mockLoginManager)

            assert.ok(!executeCommandStub.called)
            assert.ok(!initializeCredentialsProviderManagerStub.called)
        })

        it('should not execute sagemaker.parseCookies when only in SageMaker environment', async function () {
            isAmazonQStub.returns(false)
            isSageMakerStub.returns(true)

            await initialize(mockLoginManager)

            assert.ok(!executeCommandStub.called)
            assert.ok(!initializeCredentialsProviderManagerStub.called)
        })

        it('should execute sagemaker.parseCookies when in both AmazonQ and SageMaker environment', async function () {
            isAmazonQStub.returns(true)
            isSageMakerStub.returns(true)
            executeCommandStub.withArgs('sagemaker.parseCookies').resolves({ authMode: 'Sso' } as SagemakerCookie)

            await initialize(mockLoginManager)

            assert.ok(executeCommandStub.calledOnceWith('sagemaker.parseCookies'))
            assert.ok(!initializeCredentialsProviderManagerStub.called)
        })

        it('should initialize credentials provider manager when authMode is not Sso', async function () {
            isAmazonQStub.returns(true)
            isSageMakerStub.returns(true)
            executeCommandStub.withArgs('sagemaker.parseCookies').resolves({ authMode: 'Iam' } as SagemakerCookie)

            await initialize(mockLoginManager)

            assert.ok(executeCommandStub.calledOnceWith('sagemaker.parseCookies'))
            assert.ok(initializeCredentialsProviderManagerStub.calledOnce)
        })

        it('should initialize credentials provider manager when authMode is undefined', async function () {
            isAmazonQStub.returns(true)
            isSageMakerStub.returns(true)
            executeCommandStub.withArgs('sagemaker.parseCookies').resolves({} as SagemakerCookie)

            await initialize(mockLoginManager)

            assert.ok(executeCommandStub.calledOnceWith('sagemaker.parseCookies'))
            assert.ok(initializeCredentialsProviderManagerStub.calledOnce)
        })

        it('should warn and not throw when sagemaker.parseCookies command is not found', async function () {
            isAmazonQStub.returns(true)
            isSageMakerStub.returns(true)
            const error = new Error("command 'sagemaker.parseCookies' not found")
            executeCommandStub.withArgs('sagemaker.parseCookies').rejects(error)
            getErrorMsgStub.returns("command 'sagemaker.parseCookies' not found")

            await initialize(mockLoginManager)

            assert.ok(executeCommandStub.calledOnceWith('sagemaker.parseCookies'))
            assert.ok(getErrorMsgStub.calledOnceWith(error))
            assert.ok(!initializeCredentialsProviderManagerStub.called)
        })

        it('should throw when sagemaker.parseCookies fails with non-command-not-found error', async function () {
            isAmazonQStub.returns(true)
            isSageMakerStub.returns(true)
            const error = new Error('Some other error')
            executeCommandStub.withArgs('sagemaker.parseCookies').rejects(error)
            getErrorMsgStub.returns('Some other error')

            await assert.rejects(initialize(mockLoginManager), /Some other error/)

            assert.ok(executeCommandStub.calledOnceWith('sagemaker.parseCookies'))
            assert.ok(getErrorMsgStub.calledOnceWith(error))
            assert.ok(!mockLogger.warn.called)
            assert.ok(!initializeCredentialsProviderManagerStub.called)
        })
    })
})
