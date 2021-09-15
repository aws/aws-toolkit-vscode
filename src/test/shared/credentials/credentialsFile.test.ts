import * as sinon from 'sinon'
import * as assert from 'assert'
import * as path from 'path'
import * as credentialsActivation from '../../../credentials/activation'
import { appendFileSync } from 'fs'
import { remove, writeFile } from 'fs-extra'
import { LoginManager } from '../../../credentials/loginManager'
import { createCredentialsFileWatcher } from '../../../shared/credentials/credentialsFile'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { SettingsConfiguration } from '../../../shared/settingsConfiguration'

describe('createCredentialsFileWatcher', function () {
    let tempFolder: string
    let credPath: string
    let configPath: string
    let sandbox: sinon.SinonSandbox
    const fakeToolkitSettings = {} as any as SettingsConfiguration
    const fakeLoginManager = {} as any as LoginManager
    before(async function () {
        tempFolder = await makeTemporaryToolkitFolder()
        credPath = path.join(tempFolder, 'credentials')
        configPath = path.join(tempFolder, 'config')
        await writeFile(credPath, 'credentials file')
        await writeFile(configPath, 'config file')
    })

    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    after(function () {
        remove(tempFolder)
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('modify credentials/config file attemps login', async function () {
        const loginStub = sandbox.stub(credentialsActivation, 'loginWithMostRecentCredentials')
        createCredentialsFileWatcher(tempFolder, fakeToolkitSettings, fakeLoginManager)
        appendFileSync(credPath, 'change added')
        // timeout to allow change event to fire and this function is debounced because of a known watcher bug
        await new Promise(resolve => setTimeout(resolve, 150))
        assert.strictEqual(loginStub.callCount, 1)

        appendFileSync(configPath, 'change added')
        await new Promise(resolve => setTimeout(resolve, 150))
        assert.strictEqual(loginStub.callCount, 2)
    })
})
