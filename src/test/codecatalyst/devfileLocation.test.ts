/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import { getDevfileLocation } from '../../codecatalyst/model'
import { DevEnvClient } from '../../shared/clients/devenvClient'
import * as sinon from 'sinon'
import * as fileSystemUtils from '../../shared/filesystemUtilities'

describe('getDevfileLocation', function () {
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    function mockClient(location: string | undefined): DevEnvClient {
        const devEnvClient = new DevEnvClient()
        if (!location) {
            sandbox.stub(devEnvClient, 'getStatus').resolves({})
        } else {
            sandbox.stub(devEnvClient, 'getStatus').resolves({
                location: location,
            })
        }
        return devEnvClient
    }

    it('devfile found at root', async function () {
        const client = mockClient('devfile.yaml')
        const location = await getDevfileLocation(client, vscode.Uri.parse('/projects'))
        assert.strictEqual(location.toString(), 'file:///projects/devfile.yaml')
    })

    it('devfile with repo found in subfolder', async function () {
        const client = mockClient('WebApplication/devfile.yaml')
        const location = await getDevfileLocation(client, vscode.Uri.parse('/projects'))
        assert.strictEqual(location.toString(), 'file:///projects/WebApplication/devfile.yaml')
    })

    it('devfile without repo found in workspace root', async function () {
        const devfilePath = vscode.Uri.parse('/projects/WebApplication/devfile.yaml').fsPath
        sandbox.stub(fileSystemUtils, 'fileOrFolderExists').callsFake(async function (p: string) {
            return p === devfilePath
        })
        const client = mockClient('devfile.yaml')
        const location = await getDevfileLocation(client, vscode.Uri.parse('/projects/WebApplication'))
        assert.strictEqual(location.toString(), 'file:///projects/WebApplication/devfile.yaml')
    })

    it('devfile found in subfolder with repo', async function () {
        const devfilePath = vscode.Uri.parse('/projects/WebApplication/devfile.yaml').fsPath
        sandbox.stub(fileSystemUtils, 'fileOrFolderExists').callsFake(async function (p: string) {
            return p === devfilePath
        })
        const client = mockClient('WebApplication/devfile.yaml')
        const location = await getDevfileLocation(client, vscode.Uri.parse('/projects/WebApplication'))
        assert.strictEqual(location.toString(), 'file:///projects/WebApplication/devfile.yaml')
    })

    it('throws when devfile is not found', async function () {
        sandbox.stub(fileSystemUtils, 'fileOrFolderExists').resolves(false)
        const client = mockClient('test/devfile.yaml')
        const location = getDevfileLocation(client, vscode.Uri.parse('/projects/WebApplication'))
        assert.rejects(location, new Error('Devfile location was not found'))
    })

    it('falls back to default projects location when devfile cannot be located', async function () {
        const devfilePath = vscode.Uri.parse('/projects/devfile.yaml').fsPath
        sandbox.stub(fileSystemUtils, 'fileOrFolderExists').callsFake(async function (p: string) {
            return p === devfilePath
        })
        const client = mockClient('WebApplication/devfile.yaml')
        const location = await getDevfileLocation(client, vscode.Uri.parse('/projects/WebApplication'))
        assert.strictEqual(location.toString(), 'file:///projects/devfile.yaml')
    })

    it('falls back to default workspace location when devfile cannot be located', async function () {
        const devfilePath = vscode.Uri.parse('/projects/WebApplication/devfile.yaml').fsPath
        sandbox.stub(fileSystemUtils, 'fileOrFolderExists').callsFake(async function (p: string) {
            return p === devfilePath
        })
        const client = mockClient('devfile.yaml')
        const location = await getDevfileLocation(client, vscode.Uri.parse('/projects/WebApplication'))
        assert.strictEqual(location.toString(), 'file:///projects/WebApplication/devfile.yaml')
    })

    it('checks project root for devfile when location isnt specified', async function () {
        const devfilePath = vscode.Uri.parse('/projects/devfile.yaml').fsPath
        sandbox.stub(fileSystemUtils, 'fileOrFolderExists').callsFake(async function (p: string) {
            return p === devfilePath
        })
        const client = mockClient(undefined)
        const location = await getDevfileLocation(client, vscode.Uri.parse('/projects'))
        assert.strictEqual(location.toString(), 'file:///projects/devfile.yaml')
    })

    it('checks workspace root for devfile when location isnt specified', async function () {
        const devfilePath = vscode.Uri.parse('/projects/WebApplication/devfile.yaml').fsPath
        sandbox.stub(fileSystemUtils, 'fileOrFolderExists').callsFake(async function (p: string) {
            return p === devfilePath
        })
        const client = mockClient(undefined)
        const location = await getDevfileLocation(client, vscode.Uri.parse('/projects/WebApplication'))
        assert.strictEqual(location.toString(), 'file:///projects/WebApplication/devfile.yaml')
    })
})
