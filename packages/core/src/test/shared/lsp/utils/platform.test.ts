/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { createServerOptions } from '../../../../shared/lsp/utils/platform'
import * as extensionUtilities from '../../../../shared/extensionUtilities'
import * as env from '../../../../shared/vscode/env'
import { ChildProcess } from '../../../../shared/utilities/processUtils'

describe('createServerOptions - SageMaker Authentication', function () {
    let sandbox: sinon.SinonSandbox
    let isSageMakerStub: sinon.SinonStub
    let isRemoteWorkspaceStub: sinon.SinonStub
    let executeCommandStub: sinon.SinonStub

    beforeEach(function () {
        sandbox = sinon.createSandbox()

        isSageMakerStub = sandbox.stub(extensionUtilities, 'isSageMaker')
        isRemoteWorkspaceStub = sandbox.stub(env, 'isRemoteWorkspace')
        sandbox.stub(env, 'isDebugInstance').returns(false)
        executeCommandStub = sandbox.stub(vscode.commands, 'executeCommand')

        sandbox.stub(ChildProcess.prototype, 'run').resolves()
        sandbox.stub(ChildProcess.prototype, 'send').resolves()
        sandbox.stub(ChildProcess.prototype, 'proc').returns({} as any)
    })

    afterEach(function () {
        sandbox.restore()
    })

    // jscpd:ignore-start
    it('sets USE_IAM_AUTH=true when authMode is Iam', async function () {
        isSageMakerStub.returns(true)
        executeCommandStub.withArgs('sagemaker.parseCookies').resolves({ authMode: 'Iam' })

        // Capture constructor arguments using sinon stub
        let capturedOptions: any = undefined
        const childProcessConstructorSpy = sandbox.stub().callsFake((command: string, args: string[], options: any) => {
            capturedOptions = options
            // Create a fake instance with the methods we need
            const fakeInstance = {
                run: sandbox.stub().resolves(),
                send: sandbox.stub().resolves(),
                proc: sandbox.stub().returns({}),
                pid: sandbox.stub().returns(12345),
                stop: sandbox.stub(),
                stopped: false,
            }
            return fakeInstance
        })

        // Replace ChildProcess constructor
        sandbox.replace(
            require('../../../../shared/utilities/processUtils'),
            'ChildProcess',
            childProcessConstructorSpy
        )

        const serverOptions = createServerOptions({
            encryptionKey: Buffer.from('test-key'),
            executable: ['node'],
            serverModule: 'test-module.js',
            execArgv: ['--stdio'],
        })

        await serverOptions()

        assert(capturedOptions, 'ChildProcess constructor should have been called')
        assert(capturedOptions.spawnOptions, 'spawnOptions should be defined')
        assert(capturedOptions.spawnOptions.env, 'spawnOptions.env should be defined')
        assert.equal(capturedOptions.spawnOptions.env.USE_IAM_AUTH, 'true')
    })

    it('does not set USE_IAM_AUTH when authMode is Sso', async function () {
        isSageMakerStub.returns(true)
        executeCommandStub.withArgs('sagemaker.parseCookies').resolves({ authMode: 'Sso' })

        // Capture constructor arguments using sinon stub
        let capturedOptions: any = undefined
        const childProcessConstructorSpy = sandbox.stub().callsFake((command: string, args: string[], options: any) => {
            capturedOptions = options
            // Create a fake instance with the methods we need
            const fakeInstance = {
                run: sandbox.stub().resolves(),
                send: sandbox.stub().resolves(),
                proc: sandbox.stub().returns({}),
                pid: sandbox.stub().returns(12345),
                stop: sandbox.stub(),
                stopped: false,
            }
            return fakeInstance
        })

        // Replace ChildProcess constructor
        sandbox.replace(
            require('../../../../shared/utilities/processUtils'),
            'ChildProcess',
            childProcessConstructorSpy
        )

        const serverOptions = createServerOptions({
            encryptionKey: Buffer.from('test-key'),
            executable: ['node'],
            serverModule: 'test-module.js',
            execArgv: ['--stdio'],
        })

        await serverOptions()

        assert(capturedOptions, 'ChildProcess constructor should have been called')
        assert(capturedOptions.spawnOptions, 'spawnOptions should be defined')
        assert(capturedOptions.spawnOptions.env, 'spawnOptions.env should be defined')
        assert.equal(capturedOptions.spawnOptions.env.USE_IAM_AUTH, undefined)
    })

    it('defaults to IAM auth when parseCookies fails', async function () {
        isSageMakerStub.returns(true)
        isRemoteWorkspaceStub.returns(false)
        executeCommandStub.withArgs('sagemaker.parseCookies').rejects(new Error('Command failed'))

        // Capture constructor arguments using sinon stub
        let capturedOptions: any = undefined
        const childProcessConstructorSpy = sandbox.stub().callsFake((command: string, args: string[], options: any) => {
            capturedOptions = options
            // Create a fake instance with the methods we need
            const fakeInstance = {
                run: sandbox.stub().resolves(),
                send: sandbox.stub().resolves(),
                proc: sandbox.stub().returns({}),
                pid: sandbox.stub().returns(12345),
                stop: sandbox.stub(),
                stopped: false,
            }
            return fakeInstance
        })

        // Replace ChildProcess constructor
        sandbox.replace(
            require('../../../../shared/utilities/processUtils'),
            'ChildProcess',
            childProcessConstructorSpy
        )

        const serverOptions = createServerOptions({
            encryptionKey: Buffer.from('test-key'),
            executable: ['node'],
            serverModule: 'test-module.js',
            execArgv: ['--stdio'],
        })

        await serverOptions()

        assert(capturedOptions, 'ChildProcess constructor should have been called')
        assert(capturedOptions.spawnOptions, 'spawnOptions should be defined')
        assert(capturedOptions.spawnOptions.env, 'spawnOptions.env should be defined')
        assert.equal(capturedOptions.spawnOptions.env.USE_IAM_AUTH, 'true')
    })

    it('does not default to IAM in remote workspace without SMUS', async function () {
        isSageMakerStub.returns(true)
        isRemoteWorkspaceStub.returns(true)
        process.env.SERVICE_NAME = 'OtherService'
        executeCommandStub.withArgs('sagemaker.parseCookies').rejects(new Error('Command failed'))

        // Capture constructor arguments using sinon stub
        let capturedOptions: any = undefined
        const childProcessConstructorSpy = sandbox.stub().callsFake((command: string, args: string[], options: any) => {
            capturedOptions = options
            // Create a fake instance with the methods we need
            const fakeInstance = {
                run: sandbox.stub().resolves(),
                send: sandbox.stub().resolves(),
                proc: sandbox.stub().returns({}),
                pid: sandbox.stub().returns(12345),
                stop: sandbox.stub(),
                stopped: false,
            }
            return fakeInstance
        })

        // Replace ChildProcess constructor
        sandbox.replace(
            require('../../../../shared/utilities/processUtils'),
            'ChildProcess',
            childProcessConstructorSpy
        )

        const serverOptions = createServerOptions({
            encryptionKey: Buffer.from('test-key'),
            executable: ['node'],
            serverModule: 'test-module.js',
            execArgv: ['--stdio'],
        })

        await serverOptions()

        assert(capturedOptions, 'ChildProcess constructor should have been called')
        assert(capturedOptions.spawnOptions, 'spawnOptions should be defined')
        assert(capturedOptions.spawnOptions.env, 'spawnOptions.env should be defined')
        assert.equal(capturedOptions.spawnOptions.env.USE_IAM_AUTH, undefined)
    })
    // jscpd:ignore-end
})
