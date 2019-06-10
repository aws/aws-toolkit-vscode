/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as del from 'del'
import * as path from 'path'

import { CloudFormation } from '../../../shared/cloudformation/cloudformation'
import { writeFile } from '../../../shared/filesystem'
import { fileExists, makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { SystemUtilities } from '../../../shared/systemUtilities'
import { assertRejects } from '../utilities/assertUtils'

describe ('CloudFormation', () => {

    let tempFolder: string
    let filename: string

    before(async () => {
        // Make a temp folder for all these tests
        // Stick some temp credentials files in there to load from
        tempFolder = await makeTemporaryToolkitFolder()
        filename = path.join(tempFolder, 'temp.yaml')
    })

    afterEach(async () => {
        if (await fileExists(filename)) {
            await del(filename, { force: true })
        }
    })

    function createBaseTemplate(): CloudFormation.Template {
        return {
            Resources: {
                TestResource: createBaseResource()
            }
        }
    }

    function createBaseResource(): CloudFormation.Resource {
        return {
            Type: CloudFormation.SERVERLESS_FUNCTION_TYPE,
            Properties: {
                Handler: 'handler',
                CodeUri: 'codeuri',
                Runtime: 'runtime',
                Timeout: 12345,
                Environment: {
                    Variables: {
                        ENVVAR: 'envvar'
                    }
                }
            }
        }
    }

    async function strToYamlFile(str: string, file: string): Promise<void> {
        await writeFile(file, str, 'utf8')
    }

    describe('load', async () => {
        it ('can successfully load a file', async () => {
            const yamlStr: string =
`Resources:
    TestResource:
        Type: ${CloudFormation.SERVERLESS_FUNCTION_TYPE}
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
            assert.deepStrictEqual(loadedTemplate, createBaseTemplate())
        })

        it ('can successfully load a file with parameters', async () => {
            const yamlStr: string =
`Parameters:
    MyParam1:
        Type: String
    MyParam2:
        Type: Number
    MyParam3:
        Type: List<Number>
    MyParam4:
        Type: CommaDelimitedList
    MyParam5:
        Type: AWS::EC2::AvailabilityZone::Name
    MyParam6:
        Type: AWS::SSM::Parameter::Value<AWS::EC2::AvailabilityZone::Name>`

            await strToYamlFile(yamlStr, filename)
            const loadedTemplate = await CloudFormation.load(filename)
            const expectedTemplate: CloudFormation.Template = {
                Parameters: {
                    MyParam1: { Type: 'String' },
                    MyParam2: { Type: 'Number' },
                    MyParam3: { Type: 'List<Number>' },
                    MyParam4: { Type: 'CommaDelimitedList' },
                    MyParam5: { Type: 'AWS::EC2::AvailabilityZone::Name' },
                    MyParam6: { Type: 'AWS::SSM::Parameter::Value<AWS::EC2::AvailabilityZone::Name>' },
                }
            }

            assert.deepStrictEqual(loadedTemplate, expectedTemplate)
        })

        it ('only loads YAML with valid types', async () => {
            // timeout is not a number
            const badYamlStr: string =
`Resources:
    TestResource:
        Type: ${CloudFormation.SERVERLESS_FUNCTION_TYPE}
        Properties:
            Handler: handler
            CodeUri: codeuri
            Runtime: runtime
            Timeout: not a number
            Environment:
                Variables:
                    ENVVAR: envvar`
            await strToYamlFile(badYamlStr, filename)
            await assertRejects(async () => await CloudFormation.load(filename))
        })

        it ('only loads valid YAML', async () => {
            // same as above, minus the handler
            const badYamlStr: string =
`Resources:
    TestResource:
        Type: ${CloudFormation.SERVERLESS_FUNCTION_TYPE}
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
    })

    describe('save', async () => {
        it ('can successfully save a file', async() => {
            await CloudFormation.save(createBaseTemplate(), filename)
            assert.strictEqual(await SystemUtilities.fileExists(filename), true)
        })

        it ('can successfully save a file to YAML and load the file as a CloudFormation.Template', async () => {
            const baseTemplate = createBaseTemplate()
            await CloudFormation.save(baseTemplate, filename)
            assert.strictEqual(await SystemUtilities.fileExists(filename), true)
            const loadedYaml: CloudFormation.Template = await CloudFormation.load(filename)
            assert.deepStrictEqual(loadedYaml, baseTemplate)
        })
    })

    describe('validateTemplate', async () => {
        it ('can successfully validate a valid template', () => {
            assert.doesNotThrow(() => CloudFormation.validateTemplate(createBaseTemplate()))
        })

        it ('can detect an invalid template', () => {
            const badTemplate = createBaseTemplate()
            delete badTemplate.Resources!.TestResource!.Type
            assert.throws(
                () => CloudFormation.validateTemplate(badTemplate),
                Error,
                'Template does not contain any Lambda resources'
            )
        })
    })

    describe('validateResource', async () => {
        it ('can successfully validate a valid resource', () => {
            assert.doesNotThrow(() => CloudFormation.validateResource(createBaseResource()))
        })

        it ('can detect an invalid resource', () => {
            const badResource = createBaseResource()
            delete badResource.Properties!.CodeUri
            assert.throws(
                () => CloudFormation.validateResource(badResource),
                Error,
                'Missing or invalid value in Template for key: CodeUri'
            )
        })
    })

    describe('getResourceFromTemplate', async () => {
        const testData = [
            {
                title: 'existing lambda, single runtime',
                handlerName: 'app.lambda_handler',
                templateFileName: 'template_python2.7.yaml',
                expectedRuntime: 'python2.7'
            },
            {
                title: 'non-existing lambda, single runtime',
                handlerName: 'app.handler_that_does_not_exist',
                templateFileName: 'template_python2.7.yaml',
                expectedRuntime: undefined
            },
            {
                title: '2nd existing lambda, multiple runtimes',
                handlerName: 'app.lambda_handler2',
                templateFileName: 'template_python_mixed.yaml',
                expectedRuntime: 'python2.7'
            },
            {
                title: '1st existing lambda, multiple runtimes',
                handlerName: 'app.lambda_handler3',
                templateFileName: 'template_python_mixed.yaml',
                expectedRuntime: 'python3.6'
            },
            {
                title: 'non-existing lambda, multiple runtimes',
                handlerName: 'app.handler_that_does_not_exist',
                templateFileName: 'template_python_mixed.yaml',
                expectedRuntime: undefined
            },
        ]

        for (const data of testData) {
            it(`should ${data.expectedRuntime ? 'resolve runtime' : 'throw'} for ${data.title}`, async () => {
                const templatePath = path.join(path.dirname(__filename), 'yaml', data.templateFileName)
                const expectedRuntime = data.expectedRuntime
                if (data.expectedRuntime === undefined) {
                    await assertRejects(async () => {
                        const resource = await CloudFormation.getResourceFromTemplate({
                            templatePath,
                            handlerName: data.handlerName
                        })
                        CloudFormation.getRuntime(resource)
                    })
                } else {
                    const resource = await CloudFormation.getResourceFromTemplate({
                        templatePath,
                        handlerName: data.handlerName
                    })
                    const runtime = CloudFormation.getRuntime(resource)
                    assert(
                        expectedRuntime === runtime,
                        JSON.stringify({ expectedRuntime, runtime })
                    )
                }
            })
        }
    })

    describe('getRuntime', async () => {
        it('throws if resource does not specify properties', async () => {
            const resource = createBaseResource()
            delete resource.Properties

            assert.throws(() => CloudFormation.getRuntime(resource))
        })

        it('throws if resource does not specify a runtime', async () => {
            const resource = createBaseResource()
            delete resource.Properties!.Runtime

            assert.throws(() => CloudFormation.getRuntime(resource))
        })

        it('returns runtime if specified', async () => {
            const resource = createBaseResource()
            const runtime = CloudFormation.getRuntime(resource)

            assert.strictEqual(runtime, 'runtime')
        })
    })

    describe('getCodeUri', async () => {
        it('throws if resource does not specify properties', async () => {
            const resource = createBaseResource()
            delete resource.Properties

            assert.throws(() => CloudFormation.getCodeUri(resource))
        })

        it('throws if resource does not specify a code uri', async () => {
            const resource = createBaseResource()
            delete resource.Properties!.CodeUri

            assert.throws(() => CloudFormation.getCodeUri(resource))
        })

        it('returns code uri if specified', async () => {
            const resource = createBaseResource()
            const codeUri = CloudFormation.getCodeUri(resource)

            assert.strictEqual(codeUri, 'codeuri')
        })
    })
})
