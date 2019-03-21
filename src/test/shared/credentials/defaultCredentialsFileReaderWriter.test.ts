/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as del from 'del'
import * as fs from 'fs'
import * as path from 'path'
import { DefaultCredentialsFileReaderWriter } from '../../../shared/credentials/defaultCredentialsFileReaderWriter'
import { EnvironmentVariables } from '../../../shared/environmentVariables'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'

describe('DefaultCredentialsFileReaderWriter', () => {

    let tempFolder: string
    const credentialsProfileNames: string[] = ['default', 'apple', 'orange']
    const configProfileNames: string[] = ['banana', 'mango']

    before(async () => {
        // Make a temp folder for all these tests
        // Stick some temp credentials files in there to load from
        tempFolder = await makeTemporaryToolkitFolder()

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

    after(() => {
        del.sync([tempFolder], { force: true })
    })

    it('can use Config File', async () => {
        const writer = new DefaultCredentialsFileReaderWriter()
        writer.setCanUseConfigFile(true)
        assert.strictEqual(writer.getCanUseConfigFile(), true)
    })

    it('can not use Config File', async () => {
        const writer = new DefaultCredentialsFileReaderWriter()
        writer.setCanUseConfigFile(false)
        assert.strictEqual(writer.getCanUseConfigFile(), false)
    })

    it('loads profiles from Config', async () => {
        const writer = new DefaultCredentialsFileReaderWriter()
        writer.setCanUseConfigFile(true)

        const profileNames = new Set(await writer.getProfileNames())

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
        const writer = new DefaultCredentialsFileReaderWriter()
        writer.setCanUseConfigFile(false)

        const profileNames = new Set(await writer.getProfileNames())

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

    describe('setCanUseConfigFileIfExists', () => {

        it('allows use of config file if it exists', async () => {
            let canUseState: boolean | undefined

            const writer = new DefaultCredentialsFileReaderWriter()
            writer.setCanUseConfigFile = (allow) => {
                canUseState = allow
            }

            await writer.setCanUseConfigFileIfExists()

            assert.strictEqual(canUseState, true)
        })

        it('does not allow use of config file if it does not exist', async () => {
            let canUseState: boolean | undefined

            const env = process.env as EnvironmentVariables
            env.AWS_CONFIG_FILE = path.join(tempFolder, 'config-not-exist-file')

            const writer = new DefaultCredentialsFileReaderWriter()
            writer.setCanUseConfigFile = (allow) => {
                canUseState = allow
            }

            await writer.setCanUseConfigFileIfExists()

            assert.strictEqual(canUseState, false)
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
