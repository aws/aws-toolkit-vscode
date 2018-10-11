/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as del from 'del'
import * as fs from 'fs'
import * as path from 'path'
import { DefaultCredentialsFileReaderWriter } from '../shared/credentials/defaultCredentialsFileReaderWriter'
import { EnvironmentVariables } from '../shared/environmentVariables'

suite('DefaultCredentialsFileReaderWriter Tests', () => {

    let tempFolder: string
    const credentialsProfileNames: string[] = ['default', 'apple', 'orange']
    const configProfileNames: string[] = ['banana', 'mango']

    suiteSetup(() => {
        // Make a temp folder for all these tests
        // Stick some temp credentials files in there to load from
        tempFolder = fs.mkdtempSync('vsctk')

        const credentialsFilename = path.join(tempFolder, 'credentials-1')
        const configFilename = path.join(tempFolder, 'config-1')

        const configProfiles: string[] = []
        configProfileNames.forEach(x => configProfiles.push(`profile ${x}`))

        createCredentialsFile(credentialsFilename, credentialsProfileNames)
        createCredentialsFile(configFilename, configProfiles)

        const env = process.env as EnvironmentVariables
        env.AWS_SHARED_CREDENTIALS_FILE = credentialsFilename
        env.AWS_CONFIG_FILE = configFilename
    })

    suiteTeardown(() => {
        del.sync([tempFolder])
    })

    test('Can use Config File', async () => {
        const writer = new DefaultCredentialsFileReaderWriter()
        writer.setCanUseConfigFile(true)
        assert.equal(writer.getCanUseConfigFile(), true)
    })

    test('Can not use Config File', async () => {
        const writer = new DefaultCredentialsFileReaderWriter()
        writer.setCanUseConfigFile(false)
        assert.equal(writer.getCanUseConfigFile(), false)
    })

    test('Does load profiles from Config', async () => {
        const writer = new DefaultCredentialsFileReaderWriter()
        writer.setCanUseConfigFile(true)

        const profileNames = new Set(await writer.getProfileNames())

        credentialsProfileNames.forEach(profileName => {
            assert.equal(
                profileNames.has(profileName),
                true,
                `ERROR: profileNames [ ${[...profileNames].map(n => `'${n}'`).join(', ')} ]` +
                ` does not contain '${profileName}'`
            )
        })

        configProfileNames.forEach(profileName => {
            assert.equal(
                profileNames.has(profileName),
                true,
                `ERROR: configProfileNames [ ${[...configProfileNames].map(n => `'${n}'`).join(', ')} ]` +
                `does not contain '${profileName}'`
            )
        })
    })

    test('Refrains from loading profiles from Config', async () => {
        const writer = new DefaultCredentialsFileReaderWriter()
        writer.setCanUseConfigFile(false)

        const profileNames = new Set(await writer.getProfileNames())

        credentialsProfileNames.forEach(profileName => {
            assert.equal(
                profileNames.has(profileName),
                true,
                `ERROR: profileNames [ ${[...profileNames].map(n => `'${n}'`).join(', ')} ]` +
                ` does not contain '${profileName}'`
            )
        })

        configProfileNames.forEach(profileName => {
            assert.equal(
                profileNames.has(profileName),
                false,
                `ERROR: configProfileNames [ ${[...configProfileNames].map(n => `'${n}'`).join(', ')} ]` +
                ` contains '${profileName}'`
            )
        })
    })

    test('setCanUseConfigFileOnFileExistance with config file that exists', async () => {
        let canUseState: boolean | undefined

        const writer = new DefaultCredentialsFileReaderWriter()
        writer.setCanUseConfigFile = (allow) => {
            canUseState = allow
        }

        await writer.setCanUseConfigFileOnFileExistance()

        assert.equal(canUseState, true)
    })

    test('setCanUseConfigFileOnFileExistance with config file that does not exist', async () => {
        let canUseState: boolean | undefined

        const env = process.env as EnvironmentVariables
        env.AWS_CONFIG_FILE = path.join(tempFolder, 'config-not-exist-file')

        const writer = new DefaultCredentialsFileReaderWriter()
        writer.setCanUseConfigFile = (allow) => {
            canUseState = allow
        }

        await writer.setCanUseConfigFileOnFileExistance()

        assert.equal(canUseState, false)
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
