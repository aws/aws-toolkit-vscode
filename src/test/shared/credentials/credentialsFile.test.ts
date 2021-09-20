/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import * as assert from 'assert'
import * as path from 'path'
import * as fs from 'fs'
import * as credentialsActivation from '../../../credentials/activation'
import { writeFile } from 'fs-extra'
import { LoginManager } from '../../../credentials/loginManager'
import { createCredentialsFileWatcher } from '../../../shared/credentials/credentialsFile'
import { SettingsConfiguration } from '../../../shared/settingsConfiguration'
import { createTestWorkspaceFolder } from '../../testUtil'
import { WorkspaceFolder } from 'vscode'


describe('createCredentialsFileWatcher', function () {
    let tempFolder: WorkspaceFolder
    let credPath: string
    let configPath: string
    let sandbox: sinon.SinonSandbox
    let loginStub: sinon.SinonStub
    let credWatcher: fs.FSWatcher | undefined
    const fakeToolkitSettings = {} as any as SettingsConfiguration
    const fakeLoginManager = {} as any as LoginManager
    before(async function () {
        tempFolder = await createTestWorkspaceFolder()
        credPath = path.join(tempFolder.uri.fsPath, 'credentials')
        configPath = path.join(tempFolder.uri.fsPath, 'config')
        await writeFile(credPath, 'credentials file')
        await writeFile(configPath, 'config file')
    })

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        loginStub = sandbox.stub(credentialsActivation, 'loginWithMostRecentCredentials')
    })

    afterEach(function () {
        sandbox.restore()
        if (credWatcher) {
            credWatcher.close()
            credWatcher = undefined
        }
    })

    it('modify credentials file attemps login', async function () {
        credWatcher = createCredentialsFileWatcher(credPath, fakeToolkitSettings, fakeLoginManager)
        fs.appendFileSync(credPath, 'change added')
        // timeout to allow change event to fire and this function is debounced because of a known watcher bug
        await new Promise(resolve => setTimeout(resolve, 150))
        assert.strictEqual(loginStub.callCount, 1)
    })

    it('modify config file attemps login', async function () {
        credWatcher = createCredentialsFileWatcher(configPath, fakeToolkitSettings, fakeLoginManager)
        fs.appendFileSync(configPath, 'change added')
        await new Promise(resolve => setTimeout(resolve, 150))
        assert.strictEqual(loginStub.callCount, 1)
    })

    it('ignores multiple events in quick succession', async function () {
        credWatcher = createCredentialsFileWatcher(configPath, fakeToolkitSettings, fakeLoginManager)
        // this attempts to simulate a known bug where multiple events fire from a single change to the file being wathced
        fs.appendFileSync(configPath, 'change added')
        fs.appendFileSync(configPath, 'more added')
        fs.appendFileSync(configPath, 'even more added')
        await new Promise(resolve => setTimeout(resolve, 150))
        assert.strictEqual(loginStub.callCount, 1, 'Should ignore repeated calls using debounce')
    })
})
