/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import * as fs from 'fs-extra'

import {
    CloudFormation,
    getManifestDetails,
    updateYamlSchemasArray,
} from '../../../shared/cloudformation/cloudformation'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { SystemUtilities } from '../../../shared/systemUtilities'
import {
    createBaseImageResource,
    createBaseImageTemplate,
    createBaseResource,
    createBaseTemplate,
    makeSampleSamTemplateYaml,
    strToYamlFile,
} from './cloudformationTestUtils'
import { FakeWorkspace } from '../vscode/fakeWorkspace'
import { WorkspaceConfiguration } from '../../../shared/vscode/workspace'

describe('CloudFormation', function () {
    let tempFolder: string
    let filename: string

    before(async function () {
        // Make a temp folder for all these tests
        // Stick some temp credentials files in there to load from
        tempFolder = await makeTemporaryToolkitFolder()
        filename = path.join(tempFolder, 'temp.yaml')
    })

    afterEach(async function () {
        await fs.remove(filename)
    })

    describe('load', async function () {
        it('can successfully load a file', async function () {
            const yamlStr = makeSampleSamTemplateYaml(true)

            await strToYamlFile(yamlStr, filename)
            const loadedTemplate = await CloudFormation.load(filename)
            assert.deepStrictEqual(loadedTemplate, createBaseTemplate())
        })

        it('can successfully load a file without globals', async function () {
            const yamlStr = makeSampleSamTemplateYaml(false)

            await strToYamlFile(yamlStr, filename)
            const loadedTemplate = await CloudFormation.load(filename)

            const expectedTemplate = createBaseTemplate()
            delete expectedTemplate.Globals

            assert.deepStrictEqual(loadedTemplate, expectedTemplate)
        })

        it('can successfully load a file with parameters', async function () {
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

        it('Does not load YAML with missing fields', async function () {
            // handler is missing
            const badYamlStr: string = `Resources:
                                            TestResource:
                                                Type: ${CloudFormation.SERVERLESS_FUNCTION_TYPE}
                                                Properties:
                                                    CodeUri: asdf
                                                    Runtime: runtime
                                                    Timeout: 1
                                                    Environment:
                                                        Variables:
                                                            ENVVAR: envvar`
            await strToYamlFile(badYamlStr, filename)
            await assert.rejects(CloudFormation.load(filename))
        })

        it('only loads valid YAML', async function () {
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
            await assert.rejects(CloudFormation.load(filename))
        })

        it('Loads YAML with references', async function () {
            // This one is valid, "!Ref" is valid!
            const validYamlStr: string = `Resources:
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
            await strToYamlFile(validYamlStr, filename)
            await CloudFormation.load(filename)
        })

        it('Loads YAML without a CodeUri', async function () {
            // This one is valid, "!Ref" is valid!
            const validYamlStr: string = `Resources:
                                            TestResource:
                                                Type: ${CloudFormation.SERVERLESS_FUNCTION_TYPE}
                                                Properties:
                                                    Handler: handler
                                                    Runtime: runtime
                                                    Timeout: 12345
                                                    Environment:
                                                        Variables:
                                                            ENVVAR: envvar`
            await strToYamlFile(validYamlStr, filename)
            const template = await CloudFormation.load(filename)
            assert.strictEqual(template.Resources!['TestResource']?.Properties?.CodeUri, '')
        })
    })

    describe('save', async function () {
        it('can successfully save a file', async function () {
            await CloudFormation.save(createBaseTemplate(), filename)
            assert.strictEqual(await SystemUtilities.fileExists(filename), true)
        })

        it('can successfully save a file to YAML and load the file as a CloudFormation.Template', async function () {
            const baseTemplate = createBaseTemplate()
            await CloudFormation.save(baseTemplate, filename)
            assert.strictEqual(await SystemUtilities.fileExists(filename), true)
            const loadedYaml: CloudFormation.Template = await CloudFormation.load(filename)
            assert.deepStrictEqual(loadedYaml, baseTemplate)
        })
    })

    describe('validateTemplate', async function () {
        it('can successfully validate a valid template', function () {
            assert.doesNotThrow(() => CloudFormation.validateTemplate(createBaseTemplate()))
        })

        it('can detect an invalid template', function () {
            const badTemplate = createBaseTemplate()
            delete (badTemplate.Resources!.TestResource as any)!.Type
            assert.throws(
                () => CloudFormation.validateTemplate(badTemplate),
                Error,
                'Template does not contain any Lambda resources'
            )
        })
    })

    describe('validateResource', async function () {
        it('can successfully validate a valid resource', function () {
            assert.doesNotThrow(() => CloudFormation.validateResource(createBaseResource(), createBaseTemplate()))
        })

        it('can detect an invalid resource', function () {
            const badResource = createBaseResource()
            delete (badResource.Properties as any)!.Handler
            assert.throws(
                () => CloudFormation.validateResource(badResource, createBaseTemplate()),
                Error,
                'Missing or invalid value in Template for key: Handler'
            )
        })

        it('can detect invalid Image resources', function () {
            const badResource = createBaseImageResource()
            assert.ok(CloudFormation.isImageLambdaResource(badResource.Properties))

            assert.throws(
                () => CloudFormation.validateResource(badResource, createBaseImageTemplate()),
                Error,
                'Missing or invalid value in Template for key: Metadata.Dockerfile'
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

    describe('getResourceFromTemplate', async function () {
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
                const runtime = CloudFormation.getStringForProperty(
                    resource.Properties,
                    'Runtime',
                    createBaseTemplate()
                )
                assert.strictEqual(runtime, scenario.expectedRuntime, 'Unexpected runtime resolved from SAM Template')
            })
        }

        for (const scenario of templateWithNonExistingHandlerScenarios) {
            it(`should throw for ${scenario.title}`, async () => {
                const templatePath = makeTemplatePath(scenario.templateFileName)

                await assert.rejects(
                    CloudFormation.getResourceFromTemplate({
                        templatePath,
                        handlerName: scenario.handlerName,
                    })
                )
            })
        }
    })

    describe('getResourceFromTemplateResources', async function () {
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
                const runtime = CloudFormation.getStringForProperty(
                    resource.Properties,
                    'Runtime',
                    createBaseTemplate()
                )
                assert.strictEqual(runtime, scenario.expectedRuntime, 'Unexpected runtime resolved from SAM Template')
            })
        }

        for (const scenario of templateWithNonExistingHandlerScenarios) {
            it(`should throw for ${scenario.title}`, async () => {
                const templatePath = makeTemplatePath(scenario.templateFileName)
                const template = await CloudFormation.load(templatePath)

                await assert.rejects(
                    CloudFormation.getResourceFromTemplateResources({
                        templateResources: template.Resources,
                        handlerName: scenario.handlerName,
                    })
                )
            })
        }
    })

    describe('Ref handlers', function () {
        const newTemplate: () => CloudFormation.Template = () => {
            return {
                Globals: {
                    Function: {
                        Runtime: 'GLOBAL HANDLER',
                        Timeout: 12345,
                        Description: {
                            Ref: 'strParamVal',
                        },
                        MemorySize: {
                            Ref: 'numParamVal',
                        },
                    },
                },
                Parameters: {
                    strParamVal: {
                        Type: 'String',
                        Default: 'asdf',
                    },
                    strParamNoVal: {
                        Type: 'String',
                    },
                    numParamVal: {
                        Type: 'Number',
                        Default: 999,
                    },
                    numParamNoVal: {
                        Type: 'Number',
                    },
                },
                Resources: {
                    resource: {
                        Type: 'lol',
                        Properties: {
                            Handler: 'myHandler',
                            CodeUri: 'myUri',
                        },
                    },
                },
            }
        }

        describe('getStringForProperty', function () {
            it('returns a string', function () {
                const template = newTemplate()
                assert.strictEqual(
                    CloudFormation.getStringForProperty(template.Resources!.resource?.Properties, 'Handler', template),
                    'myHandler'
                )
            })

            it('returns a string from a ref with a default value', function () {
                const property: CloudFormation.Ref = {
                    Ref: 'strParamVal',
                }
                const template = newTemplate()
                template.Resources!.resource!.Properties!.Handler = property
                assert.strictEqual(
                    CloudFormation.getStringForProperty(template.Resources!.resource!.Properties, 'Handler', template),
                    'asdf'
                )
            })

            it('returns undefined if the ref does not have a default value', function () {
                const property: CloudFormation.Ref = {
                    Ref: 'strParamNoVal',
                }
                const template = newTemplate()
                template.Resources!.resource!.Properties!.Handler = property
                assert.strictEqual(
                    CloudFormation.getStringForProperty(template.Resources!.resource!.Properties, 'Handler', template),
                    undefined
                )
            })

            it('returns undefined if a number is provided', function () {
                const property: number = 1
                const template = newTemplate()
                template.Resources!.resource!.Properties!.MemorySize = property
                assert.strictEqual(
                    CloudFormation.getStringForProperty(
                        template.Resources!.resource!.Properties,
                        'MemorySize',
                        template
                    ),
                    undefined
                )
            })

            it('returns undefined if a ref to a number is provided', function () {
                const property: CloudFormation.Ref = {
                    Ref: 'numParamVal',
                }
                const template = newTemplate()
                template.Resources!.resource!.Properties!.MemorySize = property
                assert.strictEqual(
                    CloudFormation.getStringForProperty(
                        template.Resources!.resource!.Properties,
                        'MemorySize',
                        template
                    ),
                    undefined
                )
            })

            it('returns undefined if undefined is provided', function () {
                const template = newTemplate()
                assert.strictEqual(CloudFormation.getStringForProperty(undefined, 'dont-matter', template), undefined)
            })

            it('returns a global value', function () {
                const template = newTemplate()
                assert.strictEqual(
                    CloudFormation.getStringForProperty(template.Resources!.resource?.Properties, 'Runtime', template),
                    'GLOBAL HANDLER'
                )
            })

            it('returns a global Ref value', function () {
                const template = newTemplate()
                assert.strictEqual(
                    CloudFormation.getStringForProperty(
                        template.Resources!.resource?.Properties,
                        'Description',
                        template
                    ),
                    'asdf'
                )
            })

            it('returns undefined for a global number value', function () {
                const template = newTemplate()
                assert.strictEqual(
                    CloudFormation.getStringForProperty(template.Resources!.resource?.Properties, 'Timeout', template),
                    undefined
                )
            })

            it('returns undefined for a global Ref number value', function () {
                const template = newTemplate()
                assert.strictEqual(
                    CloudFormation.getStringForProperty(
                        template.Resources!.resource?.Properties,
                        'MemorySize',
                        template
                    ),
                    undefined
                )
            })
        })

        describe('getNumberForProperty', function () {
            it('returns a number', function () {
                const property: number = 1
                const template = newTemplate()
                template.Resources!.resource!.Properties!.MemorySize = property
                assert.strictEqual(
                    CloudFormation.getNumberForProperty(
                        template.Resources!.resource!.Properties,
                        'MemorySize',
                        template
                    ),
                    property
                )
            })

            it('returns a number from a ref with a default value', function () {
                const property: CloudFormation.Ref = {
                    Ref: 'numParamVal',
                }
                const template = newTemplate()
                template.Resources!.resource!.Properties!.MemorySize = property
                assert.strictEqual(
                    CloudFormation.getNumberForProperty(
                        template.Resources!.resource!.Properties,
                        'MemorySize',
                        template
                    ),
                    999
                )
            })

            it('returns undefined if the ref does not have a default value', function () {
                const property: CloudFormation.Ref = {
                    Ref: 'numParamNoVal',
                }
                const template = newTemplate()
                template.Resources!.resource!.Properties!.MemorySize = property
                assert.strictEqual(
                    CloudFormation.getNumberForProperty(
                        template.Resources!.resource!.Properties,
                        'MemorySize',
                        template
                    ),
                    undefined
                )
            })

            it('returns undefined is a string', function () {
                const template = newTemplate()
                assert.strictEqual(
                    CloudFormation.getNumberForProperty(template.Resources!.resource!.Properties, 'Handler', template),
                    undefined
                )
            })

            it('returns undefined if a ref to a string is provided', function () {
                const property: CloudFormation.Ref = {
                    Ref: 'strParamVal',
                }
                const template = newTemplate()
                template.Resources!.resource!.Properties!.Handler = property
                assert.strictEqual(
                    CloudFormation.getNumberForProperty(template.Resources!.resource!.Properties, 'Handler', template),
                    undefined
                )
            })

            it('returns undefined if undefined is provided', function () {
                const template = newTemplate()
                assert.strictEqual(CloudFormation.getNumberForProperty(undefined, 'dont-matter', template), undefined)
            })

            it('returns a global value', function () {
                const template = newTemplate()
                assert.strictEqual(
                    CloudFormation.getNumberForProperty(template.Resources!.resource?.Properties, 'Timeout', template),
                    12345
                )
            })

            it('returns a global Ref value', function () {
                const template = newTemplate()
                assert.strictEqual(
                    CloudFormation.getNumberForProperty(
                        template.Resources!.resource?.Properties,
                        'MemorySize',
                        template
                    ),
                    999
                )
            })

            it('returns undefined for a global string value', function () {
                const template = newTemplate()
                assert.strictEqual(
                    CloudFormation.getNumberForProperty(template.Resources!.resource?.Properties, 'Runtime', template),
                    undefined
                )
            })

            it('returns undefined for a global Ref string value', function () {
                const template = newTemplate()
                assert.strictEqual(
                    CloudFormation.getNumberForProperty(
                        template.Resources!.resource?.Properties,
                        'Description',
                        template
                    ),
                    undefined
                )
            })
        })

        describe('resolvePropertyWithOverrides', function () {
            it('returns a string', function () {
                const property: string = 'good'
                const template = newTemplate()
                assert.strictEqual(CloudFormation.resolvePropertyWithOverrides(property, template), property)
            })

            it('returns a string from a ref with a default value', function () {
                const property: CloudFormation.Ref = {
                    Ref: 'strParamVal',
                }
                const template = newTemplate()
                assert.strictEqual(CloudFormation.resolvePropertyWithOverrides(property, template), 'asdf')
            })

            it('returns a number', function () {
                const property: number = 1
                const template = newTemplate()
                assert.strictEqual(CloudFormation.resolvePropertyWithOverrides(property, template), 1)
            })

            it('returns a number from a ref with a default value', function () {
                const property: CloudFormation.Ref = {
                    Ref: 'numParamVal',
                }
                const template = newTemplate()
                assert.strictEqual(CloudFormation.resolvePropertyWithOverrides(property, template), 999)
            })

            it('returns undefined if undefined is provided', function () {
                const template = newTemplate()
                assert.strictEqual(CloudFormation.resolvePropertyWithOverrides(undefined, template), undefined)
            })

            it('returns undefined if the ref does not have a default value and no overrides are present', function () {
                const property: CloudFormation.Ref = {
                    Ref: 'strParamNoVal',
                }
                const template = newTemplate()
                assert.strictEqual(CloudFormation.resolvePropertyWithOverrides(property, template), undefined)
            })

            it('returns the override value if no default value provided', function () {
                const property: CloudFormation.Ref = {
                    Ref: 'strParamNoVal',
                }
                const overrideParams = {
                    strParamNoVal: 'surprise!',
                }
                const template = newTemplate()
                assert.strictEqual(
                    CloudFormation.resolvePropertyWithOverrides(property, template, overrideParams),
                    'surprise!'
                )
            })

            it('returns the override value even if default value provided', function () {
                const property: CloudFormation.Ref = {
                    Ref: 'strParamVal',
                }
                const overrideParams = {
                    strParamVal: 'surprise!',
                }
                const template = newTemplate()
                assert.strictEqual(
                    CloudFormation.resolvePropertyWithOverrides(property, template, overrideParams),
                    'surprise!'
                )
            })
        })
    })
})

describe('Cloudformation Utils', function () {
    describe('updateYamlSchemasArray', function () {
        let config: WorkspaceConfiguration
        const cfnSchema = 'cfn'
        const samSchema = 'sam'

        beforeEach(function () {
            config = new FakeWorkspace().getConfiguration()
        })

        it('handles adding to and removing from a nonexistent setting', function () {
            updateYamlSchemasArray('/foo', 'cfn', config, { cfnSchema, samSchema })
            const val: any = config.get('schemas')
            assert.deepStrictEqual(val[cfnSchema], ['/foo'])
            assert.deepStrictEqual(val[samSchema], undefined)
        })

        it('handles adding to and removing from a setting with an undefined value', function () {
            config.update('schemas', undefined)
            updateYamlSchemasArray('/foo', 'cfn', config, { cfnSchema, samSchema })
            const val: any = config.get('schemas')
            assert.deepStrictEqual(val[cfnSchema], ['/foo'])
            assert.deepStrictEqual(val[samSchema], undefined)
        })
        it('handles adding to and removing from a setting with a blank array', function () {
            config.update('schemas', { cfn: [], sam: [] })
            updateYamlSchemasArray('/foo', 'cfn', config, { cfnSchema, samSchema })
            const val: any = config.get('schemas')
            assert.deepStrictEqual(val[cfnSchema], ['/foo'])
            assert.deepStrictEqual(val[samSchema], [])
        })

        it('handles adding to and removing from an existing array', function () {
            config.update('schemas', { cfn: ['/bar'], sam: ['/asdf', '/foo'] })
            updateYamlSchemasArray('/foo', 'cfn', config, { cfnSchema, samSchema })
            const val: any = config.get('schemas')
            assert.deepStrictEqual(val[cfnSchema], ['/bar', '/foo'])
            assert.deepStrictEqual(val[samSchema], ['/asdf'])
        })

        it('handles adding to and removing from a string', function () {
            config.update('schemas', { cfn: '/bar', sam: '/foo' })
            updateYamlSchemasArray('/foo', 'cfn', config, { cfnSchema, samSchema })
            const val: any = config.get('schemas')
            assert.deepStrictEqual(val[cfnSchema], ['/bar', '/foo'])
            assert.deepStrictEqual(val[samSchema], [])
        })

        it('handles removes from strings and arrays with `none`', function () {
            config.update('schemas', { cfn: '/bar', sam: ['/foo', '/bar'] })
            updateYamlSchemasArray('/bar', 'none', config, { cfnSchema, samSchema })
            const val: any = config.get('schemas')
            assert.deepStrictEqual(val[cfnSchema], [])
            assert.deepStrictEqual(val[samSchema], ['/foo'])
        })
    })

    describe('getManifestDetails', function () {
        it('errors if manifest is not JSON', function () {
            assert.throws(() => getManifestDetails('foo'))
        })

        it('errors if no tag name is present', function () {
            assert.throws(() => getManifestDetails('{"foo": "bar"}'))
        })

        it('returns URLs if a tag name is present', function () {
            const vals = getManifestDetails('{"tag_name": "111"}')
            assert.strictEqual(
                vals.samUrl,
                'https://raw.githubusercontent.com/awslabs/goformation/111/schema/sam.schema.json'
            )
            assert.strictEqual(
                vals.cfnUrl,
                'https://raw.githubusercontent.com/awslabs/goformation/111/schema/cloudformation.schema.json'
            )
            assert.strictEqual(vals.version, '111')
        })
    })
})
