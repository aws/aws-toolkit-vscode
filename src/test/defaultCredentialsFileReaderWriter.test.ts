/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from "assert"
import * as fs from "fs"
import * as path from "path"
import * as del from "del"
import { DefaultCredentialsFileReaderWriter } from "../shared/credentials/defaultCredentialsFileReaderWriter"
import * as credentialsFile from "../shared/credentials/credentialsFile"

suite("DefaultCredentialsFileReaderWriter Tests", function (): void {

    let tempFolder: string
    let credentialsProfileNames: string[] = ["default", "apple", "orange"]
    let configProfileNames: string[] = ["banana", "mango"]

    suiteSetup(function () {
        // Make a temp folder for all these tests
        // Stick some temp credentials files in there to load from
        tempFolder = fs.mkdtempSync("vsctk")

        const credentialsFilename = path.join(tempFolder, "credentials-1")
        const configFilename = path.join(tempFolder, "config-1")

        const configProfiles: string[] = []
        configProfileNames.forEach(x => configProfiles.push(`profile ${x}`))

        createCredentialsFile(credentialsFilename, credentialsProfileNames)
        createCredentialsFile(configFilename, configProfiles)

        process.env[credentialsFile.ENV_CREDENTIALS_PATH] = credentialsFilename
        process.env[credentialsFile.ENV_CONFIG_PATH] = configFilename
    })

    suiteTeardown(function () {
        del.sync([tempFolder])
    })

    test("Can use Config File", async function () {
        const writer = new DefaultCredentialsFileReaderWriter()
        writer.setCanUseConfigFile(true)
        assert.equal(writer.getCanUseConfigFile(), true)
    })

    test("Can not use Config File", async function () {
        const writer = new DefaultCredentialsFileReaderWriter()
        writer.setCanUseConfigFile(false)
        assert.equal(writer.getCanUseConfigFile(), false)
    })

    test("Does load profiles from Config", async function () {
        const writer = new DefaultCredentialsFileReaderWriter()
        writer.setCanUseConfigFile(true)

        const profileNames = new Set(await writer.getProfileNames())

        credentialsProfileNames.forEach(profileName => {
            assert.equal(profileNames.has(profileName), true)
        })

        configProfileNames.forEach(profileName => {
            assert.equal(profileNames.has(profileName), true)
        })
    })

    test("Refrains from loading profiles from Config", async function () {
        const writer = new DefaultCredentialsFileReaderWriter()
        writer.setCanUseConfigFile(false)

        const profileNames = new Set(await writer.getProfileNames())

        credentialsProfileNames.forEach(profileName => {
            assert.equal(profileNames.has(profileName), true)
        })

        configProfileNames.forEach(profileName => {
            assert.equal(profileNames.has(profileName), false)
        })
    })

    function createCredentialsFile(filename: string, profileNames: string[]): void {
        let fileContents = ""

        profileNames.forEach(profileName => {
            fileContents += `[${profileName}]\n`
                + `aws_access_key_id = FAKEKEY\n`
                + `aws_secret_access_key = FAKESECRET\n`
        })

        fs.writeFileSync(filename, fileContents)
    }

})
