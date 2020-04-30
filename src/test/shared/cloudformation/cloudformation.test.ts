/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as del from 'del'
import * as path from 'path'

import { CloudFormation } from '../../../shared/cloudformation/cloudformation'
import { fileExists, makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { SystemUtilities } from '../../../shared/systemUtilities'
import { assertRejects } from '../utilities/assertUtils'
import {
    createBaseResource,
    createBaseTemplate,
    makeSampleSamTemplateYaml,
    strToYamlFile,
} from './cloudformationTestUtils'

describe('CloudFormation', () => {
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

    describe('load', async () => {
        it('can successfully load a file', async () => {
            const yamlStr = makeSampleSamTemplateYaml(true)

            await strToYamlFile(yamlStr, filename)
            const loadedTemplate = await CloudFormation.load(filename)
            assert.deepStrictEqual(loadedTemplate, createBaseTemplate())
        })

        it('can successfully load a file without globals', async () => {
            const yamlStr = makeSampleSamTemplateYaml(false)

            await strToYamlFile(yamlStr, filename)
            const loadedTemplate = await CloudFormation.load(filename)

            const expectedTemplate = createBaseTemplate()
            delete expectedTemplate.Globals

            assert.deepStrictEqual(loadedTemplate, expectedTemplate)
        })

        it('can successfully load a file with parameters', async () => {
            const yamlStr: string = `Parameters:
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
                },
            }

            assert.deepStrictEqual(loadedTemplate, expectedTemplate)
        })

        it('Does not load YAML with missing fields', async () => {
            // codeuri is missing
            const badYamlStr: string = `Resources:
                                            TestResource:
                                                Type: ${CloudFormation.SERVERLESS_FUNCTION_TYPE}
                                                Properties:
                                                    Handler: handler
                                                    Runtime: runtime
                                                    Timeout: 1
                                                    Environment:
                                                        Variables:
                                                            ENVVAR: envvar`
            await strToYamlFile(badYamlStr, filename)
            await assertRejects(async () => await CloudFormation.load(filename))
        })

        it('only loads valid YAML', async () => {
            // same as above, minus the handler
            const badYamlStr: string = `Resources:
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

        it('Loads YAML with references', async () => {
            // This one is valid, "!Ref" is valid!
            const badYamlStr: string = `Resources:
                                            TestResource:
                                                Type: ${CloudFormation.SERVERLESS_FUNCTION_TYPE}
                                                Properties:
                                                    Handler: handler
                                                    CodeUri: codeuri
                                                    Runtime: runtime
                                                    Timeout: 12345
                                                    Environment:
                                                        Variables:
                                                            ENVVAR: !Ref this_is_valid`
            await strToYamlFile(badYamlStr, filename)
            await CloudFormation.load(filename)
        })
    })

    describe('save', async () => {
        it('can successfully save a file', async () => {
            await CloudFormation.save(createBaseTemplate(), filename)
            assert.strictEqual(await SystemUtilities.fileExists(filename), true)
        })

        it('can successfully save a file to YAML and load the file as a CloudFormation.Template', async () => {
            const baseTemplate = createBaseTemplate()
            await CloudFormation.save(baseTemplate, filename)
            assert.strictEqual(await SystemUtilities.fileExists(filename), true)
            const loadedYaml: CloudFormation.Template = await CloudFormation.load(filename)
            assert.deepStrictEqual(loadedYaml, baseTemplate)
        })
    })

    describe('validateTemplate', async () => {
        it('can successfully validate a valid template', () => {
            assert.doesNotThrow(() => CloudFormation.validateTemplate(createBaseTemplate()))
        })

        it('can detect an invalid template', () => {
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
        it('can successfully validate a valid resource', () => {
            assert.doesNotThrow(() => CloudFormation.validateResource(createBaseResource()))
        })

        it('can detect an invalid resource', () => {
            const badResource = createBaseResource()
            delete badResource.Properties!.CodeUri
            assert.throws(
                () => CloudFormation.validateResource(badResource),
                Error,
                'Missing or invalid value in Template for key: CodeUri'
            )
        })
    })

    const templateWithExistingHandlerScenarios = [
        {
            title: 'existing lambda, single runtime',
            handlerName: 'app.lambda_handler',
            templateFileName: 'template_python2.7.yaml',
            expectedRuntime: 'python2.7',
        },
        {
            title: '2nd existing lambda, multiple runtimes',
            handlerName: 'app.lambda_handler2',
            templateFileName: 'template_python_mixed.yaml',
            expectedRuntime: 'python2.7',
        },
        {
            title: '1st existing lambda, multiple runtimes',
            handlerName: 'app.lambda_handler3',
            templateFileName: 'template_python_mixed.yaml',
            expectedRuntime: 'python3.6',
        },
    ]

    const templateWithNonExistingHandlerScenarios = [
        {
            title: 'non-existing lambda, single runtime',
            handlerName: 'app.handler_that_does_not_exist',
            templateFileName: 'template_python2.7.yaml',
            expectedRuntime: undefined,
        },
        {
            title: 'non-existing lambda, multiple runtimes',
            handlerName: 'app.handler_that_does_not_exist',
            templateFileName: 'template_python_mixed.yaml',
            expectedRuntime: undefined,
        },
    ]

    const makeTemplatePath = (templateFileName: string): string => {
        return path.join(path.dirname(__filename), 'yaml', templateFileName)
    }

    describe('getResourceFromTemplate', async () => {
        for (const scenario of templateWithExistingHandlerScenarios) {
            it(`should retrieve resource for ${scenario.title}`, async () => {
                const templatePath = makeTemplatePath(scenario.templateFileName)

                const resource = await CloudFormation.getResourceFromTemplate({
                    templatePath,
                    handlerName: scenario.handlerName,
                })

                assert.ok(resource)
                // Verify runtimes as a way of seeing if we got the correct resource when there is more
                // than one entry with the same handler.
                const runtime = CloudFormation.getRuntime(resource)
                assert.strictEqual(runtime, scenario.expectedRuntime, 'Unexpected runtime resolved from SAM Template')
            })
        }

        for (const scenario of templateWithNonExistingHandlerScenarios) {
            it(`should throw for ${scenario.title}`, async () => {
                const templatePath = makeTemplatePath(scenario.templateFileName)

                await assertRejects(async () => {
                    await CloudFormation.getResourceFromTemplate({
                        templatePath,
                        handlerName: scenario.handlerName,
                    })
                })
            })
        }
    })

    describe('getResourceFromTemplateResources', async () => {
        for (const scenario of templateWithExistingHandlerScenarios) {
            it(`should retrieve resource for ${scenario.title}`, async () => {
                const templatePath = makeTemplatePath(scenario.templateFileName)
                const template = await CloudFormation.load(templatePath)

                const resource = await CloudFormation.getResourceFromTemplateResources({
                    templateResources: template.Resources,
                    handlerName: scenario.handlerName,
                })

                assert.ok(resource)
                // Verify runtimes as a way of seeing if we got the correct resource when there is more
                // than one entry with the same handler.
                const runtime = CloudFormation.getRuntime(resource)
                assert.strictEqual(runtime, scenario.expectedRuntime, 'Unexpected runtime resolved from SAM Template')
            })
        }

        for (const scenario of templateWithNonExistingHandlerScenarios) {
            it(`should throw for ${scenario.title}`, async () => {
                const templatePath = makeTemplatePath(scenario.templateFileName)
                const template = await CloudFormation.load(templatePath)

                await assertRejects(async () => {
                    await CloudFormation.getResourceFromTemplateResources({
                        templateResources: template.Resources,
                        handlerName: scenario.handlerName,
                    })
                })
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

            assert.strictEqual(runtime, 'nodejs12.x')
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

            assert.strictEqual(codeUri, '/')
        })
    })
})
