/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as del from 'del'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import { CloudFormation } from '../../../shared/cloudformation/cloudformation'
import * as filesystem from '../../../shared/filesystem'
import * as filesystemUtilities from '../../../shared/filesystemUtilities'
import { SystemUtilities } from '../../../shared/systemUtilities'
import { assertRejects } from '../utilities/assertUtils'

describe ('CloudFormation', () => {

    let tempFolder: string
    let filename: string

    before(async () => {
        // Make a temp folder for all these tests
        // Stick some temp credentials files in there to load from
        tempFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'vsctk'))
        filename = path.join(tempFolder, 'temp.yaml')
    })

    afterEach(async () => {
        if (await filesystemUtilities.fileExists(filename)) {
            await del(filename, { force: true })
        }
    })

    after(async () => {
        if (await filesystemUtilities.fileExists(filename)) {
            await del(filename, { force: true })
        }
        await del([tempFolder], { force: true })
    })

    const baseEnvironment: CloudFormation.Environment = {
        Variables: {
            ENVVAR: 'envvar'
        }
    }

    const baseResource: CloudFormation.Resource = {
        Type: 'type',
        Properties: {
            Handler: 'handler',
            CodeUri: 'codeuri',
            Runtime: 'runtime',
            Timeout: 12345,
            Environment: baseEnvironment
        }
    }

    const baseTemplate: CloudFormation.Template = {
        Resources: {
            TestResource: baseResource
        }
    }

    async function strToYamlFile(str: string, file: string): Promise<void> {
        await filesystem.writeFileAsync(file, str, 'utf8')
    }

    it ('can successfully load a file', async () => {
        const yamlStr: string =
`Resources:
    TestResource:
        Type: type
        Properties:
            Handler: handler
            CodeUri: codeuri
            Runtime: runtime
            Timeout: 12345
            Environment:
                Variables:
                    ENVVAR: envvar`

        await strToYamlFile(yamlStr, filename)
        const loadedTemplate = await CloudFormation.load(filename)
        assert.deepStrictEqual(loadedTemplate, baseTemplate)
    })

    it ('only loads valid YAML', async () => {
        // same as above, minus the handler
        const badYamlStr: string =
`Resources:
    TestResource:
        Type: type
        Properties:
            CodeUri: codeuri
            Runtime: runtime
            Timeout: 12345
            Environment:
                Variables:
                    ENVVAR: envvar`
        await strToYamlFile(badYamlStr, filename)
        await assertRejects(async () => await CloudFormation.load(filename))
    })

    it ('can successfully save a file', async() => {
        await CloudFormation.save(baseTemplate, filename)
        assert.strictEqual(await SystemUtilities.fileExists(filename), true)
    })

    it ('can successfully save a file to YAML and load the file as a CloudFormation.Template', async () => {
        await CloudFormation.save(baseTemplate, filename)
        assert.strictEqual(await SystemUtilities.fileExists(filename), true)
        const loadedYaml: CloudFormation.Template = await CloudFormation.load(filename)
        assert.deepStrictEqual(loadedYaml, baseTemplate)
    })

    it ('can successfully validate a valid template', () => {
        assert.doesNotThrow(() => CloudFormation.validateTemplate(baseTemplate))
    })

    it ('can successfully validate a valid resource', () => {
        assert.doesNotThrow(() => CloudFormation.validateResource(baseResource))
    })

    it ('can detect an invalid template', () => {
        const badTemplate = baseTemplate
        delete badTemplate.Resources!.TestResource!.Type
        assert.throws(() => {CloudFormation.validateTemplate(badTemplate)},
                      'Missing or invalid value in Template for key: Type')
    })

    it ('can detect an invalid resource', () => {
        const badResource = baseResource
        delete badResource.Properties!.CodeUri
        assert.throws(() => CloudFormation.validateResource(badResource),
                      'Missing or invalid value in Template for key: CodeUri')
    })
})
