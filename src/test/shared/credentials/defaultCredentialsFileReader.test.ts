/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as del from 'del'
import * as fs from 'fs'
import * as path from 'path'

import { DefaultCredentialsFileReader } from '../../../shared/credentials/defaultCredentialsFileReader'
import { defaultConfigFile } from '../../../shared/credentials/userCredentialsUtils'
import { EnvironmentVariables } from '../../../shared/environmentVariables'
import { SystemUtilities } from '../../../shared/systemUtilities'

describe('DefaultCredentialsFileReader', () => {

    let tempFolder: string
    const credentialsProfileNames: string[] = ['default', 'apple', 'orange']
    const configProfileNames: string[] = ['banana', 'mango']
    let credentialsFilename: string
    let configFilename: string

    before(() => {
        // Make a temp folder for all these tests
        // Stick some temp credentials files in there to load from
        tempFolder = fs.mkdtempSync('vsctk')

        credentialsFilename = path.join(tempFolder, 'credentials-1')
        configFilename = path.join(tempFolder, 'config-1')

        const configProfiles: string[] = []
        configProfileNames.forEach(x => configProfiles.push(`profile ${x}`))

        createCredentialsFile(credentialsFilename, credentialsProfileNames)
        createCredentialsFile(configFilename, configProfiles)

        const env = process.env as EnvironmentVariables
        env.AWS_SHARED_CREDENTIALS_FILE = credentialsFilename
        env.AWS_CONFIG_FILE = configFilename
    })

    after(() => {
        del.sync([tempFolder])
    })

    it('can use Config File', async () => {
        const reader = new DefaultCredentialsFileReader()
        reader.setCanUseConfigFile(true)
        assert.strictEqual(reader.getCanUseConfigFile(), true)
    })

    it('can not use Config File', async () => {
        const reader = new DefaultCredentialsFileReader()
        reader.setCanUseConfigFile(false)
        assert.strictEqual(reader.getCanUseConfigFile(), false)
    })

    it('loads profiles from Config', async () => {
        const reader = new DefaultCredentialsFileReader()
        reader.setCanUseConfigFile(true)

        const profileNames = new Set(await reader.getProfileNames())

        credentialsProfileNames.forEach(profileName => {
            assert.strictEqual(
                profileNames.has(profileName),
                true,
                `ERROR: profileNames [ ${[...profileNames].map(n => `'${n}'`).join(', ')} ]` +
                ` does not contain '${profileName}'`
            )
        })

        configProfileNames.forEach(profileName => {
            assert.strictEqual(
                profileNames.has(profileName),
                true,
                `ERROR: configProfileNames [ ${[...configProfileNames].map(n => `'${n}'`).join(', ')} ]` +
                `does not contain '${profileName}'`
            )
        })
    })

    it('refrains from loading profiles from Config', async () => {
        const reader = new DefaultCredentialsFileReader()
        reader.setCanUseConfigFile(false)

        const profileNames = new Set(await reader.getProfileNames())

        credentialsProfileNames.forEach(profileName => {
            assert.strictEqual(
                profileNames.has(profileName),
                true,
                `ERROR: profileNames [ ${[...profileNames].map(n => `'${n}'`).join(', ')} ]` +
                ` does not contain '${profileName}'`
            )
        })

        configProfileNames.forEach(profileName => {
            assert.strictEqual(
                profileNames.has(profileName),
                false,
                `ERROR: configProfileNames [ ${[...configProfileNames].map(n => `'${n}'`).join(', ')} ]` +
                ` contains '${profileName}'`
            )
        })
    })

    describe('setCanUseConfigFileIfExists', async () => {

        it('allows use of config file if it exists', async () => {

            const reader = new DefaultCredentialsFileReader()
            reader.setCanUseConfigFile(true)
            const configFileName = defaultConfigFile
            assert.ok(configFileName, 'expected configFileName to be set')
            const configFileExists = await SystemUtilities.fileExists(configFileName)
            assert.strictEqual(configFileExists, true, `expected "${configFileName}" to exist`)

            await reader.setCanUseConfigFileIfExists()
            assert.strictEqual(
                reader.getCanUseConfigFile(),
                true,
                `reader.getCanUseConfigFile() should be true but is "${reader.getCanUseConfigFile()}"`)
        })

        it('does not allow use of config file if it does not exist', async () => {

            const env = process.env as EnvironmentVariables
            env.AWS_CONFIG_FILE = path.join(tempFolder, 'config-not-exist-file')
            const exists = await SystemUtilities.fileExists(env.AWS_CONFIG_FILE)
            assert.strictEqual(exists, false, `"${env.AWS_CONFIG_FILE}" shouldn't exist`)

            const reader = new DefaultCredentialsFileReader()
            reader.setCanUseConfigFile(true)

            await reader.setCanUseConfigFileIfExists()

            assert.strictEqual(
                reader.getCanUseConfigFile(),
                false,
                `reader.getCanUseConfigFile() is "${reader.getCanUseConfigFile()}"`
            )
        })
    })

    function createCredentialsFile(filename: string, profileNames: string[]): void {
        let fileContents = ''

        profileNames.forEach(profileName => {
            fileContents += `[${profileName}]
aws_access_key_id = FAKEKEY
aws_secret_access_key = FAKESECRET
`
        })

        fs.writeFileSync(filename, fileContents)
    }

})
