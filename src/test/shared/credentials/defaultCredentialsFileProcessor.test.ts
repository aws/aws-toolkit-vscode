/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as del from 'del'
import * as fs from 'fs'
import * as path from 'path'
import { EnvironmentVariables } from '../../../shared/environmentVariables'

describe('DefaultCredentialsFileProcessor', () => {

    let tempFolder: string
    const credentialsProfileNames: string[] = ['default', 'apple', 'orange']
    const configProfileNames: string[] = ['banana', 'mango']

    before(() => {
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

    after(() => {
        del.sync([tempFolder])
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
