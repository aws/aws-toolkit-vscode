/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as del from 'del'
import * as fs from 'fs'
import * as yaml from 'js-yaml'
import * as os from 'os'
import * as path from 'path'

import { CloudFormation } from '../../../shared/cloudformation/cloudformation'
import * as filesystem from '../../../shared/filesystem'
import * as filesystemUtilities from '../../../shared/filesystemUtilities'
import { SystemUtilities } from '../../../shared/systemUtilities'

describe ('CloudFormation', () => {

    let tempFolder: string
    let filename: string

    before(() => {
        // Make a temp folder for all these tests
        // Stick some temp credentials files in there to load from
        tempFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'vsctk'))
        filename = path.join(tempFolder, 'temp.yaml')
    })

    beforeEach(() => {
        if (filesystemUtilities.fileExists(filename)) {
            del.sync(filename, { force: true })
        }
    })

    after(() => {
        if (filesystemUtilities.fileExists(filename)) {
            del.sync(filename, { force: true })
        }
        del.sync([tempFolder], { force: true })
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
        const templateAsYaml: string = yaml.safeDump(str)

        await filesystem.writeFileAsync(file, templateAsYaml, 'utf8')
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
        assert.throws(async () => {await CloudFormation.load(filename)}, Error)
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
})
