/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as schema from 'cloudformation-schema-js-yaml'
import * as del from 'del'
import * as yaml from 'js-yaml'
import * as os from 'os'
import * as path from 'path'
import * as filesystem from '../../../shared/filesystem'
import * as filesystemUtilities from '../../../shared/filesystemUtilities'
import { SystemUtilities } from '../../../shared/systemUtilities'
import {
    CloudFormationResource,
    CloudFormationTemplate,
    SamTemplateGenerator
} from '../../../shared/templates/sam/samTemplateGenerator'

describe('SamTemplateGenerator', () => {

    let tempFolder: string

    beforeEach(async () => {
        tempFolder = await filesystem.mkdtempAsync(path.join(os.tmpdir(), 'vsctk-'))
    })

    afterEach(async () => {
        await del([tempFolder], { force: true })
    })

    describe('from scratch', () => {

        const sampleCodeUriValue: string = 'sampleCodeUri'
        const sampleFunctionHandlerValue: string = 'sampleFunctionHandler'
        const sampleResourceNameValue: string = 'sampleResourceName'
        const sampleRuntimeValue: string = 'sampleRuntime'
        let templateFilename: string

        beforeEach(() => {
            templateFilename = path.join(tempFolder, 'template.yml')
        })

        it('Produces a minimal template', async () => {
            await new SamTemplateGenerator()
                .withCodeUri(sampleCodeUriValue)
                .withFunctionHandler(sampleFunctionHandlerValue)
                .withRuntime(sampleRuntimeValue)
                .withResourceName(sampleResourceNameValue)
                .generate(templateFilename)

            assert.equal(await SystemUtilities.fileExists(templateFilename), true)

            const template: CloudFormationTemplate = await loadTemplate(templateFilename)
            assert.ok(template.Resources)
            assert.notEqual(Object.keys(template.Resources!).length, 0)

            const resource: CloudFormationResource = template.Resources![sampleResourceNameValue]
            assert.equal(resource.Properties!.CodeUri, sampleCodeUriValue)
            assert.equal(resource.Properties!.Handler, sampleFunctionHandlerValue)
            assert.equal(resource.Properties!.Runtime, sampleRuntimeValue)
        })

        it('errs if resource name is missing', async () => {
            const error: Error = await assertThrowsError(
                async () => {
                    await new SamTemplateGenerator()
                        .withCodeUri(sampleCodeUriValue)
                        .withFunctionHandler(sampleFunctionHandlerValue)
                        .withRuntime(sampleRuntimeValue)
                        .generate(templateFilename)
                })

            assert.ok(error)
            assert.equal(error.message, 'Missing value: ResourceName')
            assert.equal(await SystemUtilities.fileExists(templateFilename), false)
        })

        it('errs if function handler is missing', async () => {
            const error: Error = await assertThrowsError(
                async () => {
                    await new SamTemplateGenerator()
                        .withCodeUri(sampleCodeUriValue)
                        .withRuntime(sampleRuntimeValue)
                        .withResourceName(sampleResourceNameValue)
                        .generate(templateFilename)
                })

            assert.ok(error)
            assert.equal(error.message, 'Missing value: FunctionHandler')
            assert.equal(await SystemUtilities.fileExists(templateFilename), false)
        })

        it('errs if code uri is missing', async () => {
            const error: Error = await assertThrowsError(
                async () => {
                    await new SamTemplateGenerator()
                        .withFunctionHandler(sampleFunctionHandlerValue)
                        .withRuntime(sampleRuntimeValue)
                        .withResourceName(sampleResourceNameValue)
                        .generate(templateFilename)
                })

            assert.ok(error)
            assert.equal(error.message, 'Missing value: CodeUri')
            assert.equal(await SystemUtilities.fileExists(templateFilename), false)
        })

        it('errs if runtime is missing', async () => {
            const error: Error = await assertThrowsError(
                async () => {
                    await new SamTemplateGenerator()
                        .withCodeUri(sampleCodeUriValue)
                        .withFunctionHandler(sampleFunctionHandlerValue)
                        .withResourceName(sampleResourceNameValue)
                        .generate(templateFilename)
                })

            assert.ok(error)
            assert.equal(error.message, 'Missing value: Runtime')
            assert.equal(await SystemUtilities.fileExists(templateFilename), false)
        })
    })

    describe('from a preexisting template', () => {

        const sampleCodeUriValue: string = 'sampleCodeUri'
        const sampleFunctionHandlerValue: string = 'sampleFunctionHandler'
        const sampleResourceNameValue: string = 'sampleResourceName'
        const sampleRuntimeValue: string = 'sampleRuntime'
        let sourceTemplateFilename: string
        let destinationTemplateFilename: string

        beforeEach(async () => {
            sourceTemplateFilename = path.join(tempFolder, 'src-template.yml')
            destinationTemplateFilename = path.join(tempFolder, 'dst-template.yml')

            const templateContents: CloudFormationTemplate = createSampleTemplate(
                [sampleResourceNameValue]
            )

            await saveTemplate(templateContents, sourceTemplateFilename)
        })

        it('Produces a template given valid inputs', async () => {
            const expectedTemplateContents: CloudFormationTemplate = createSampleTemplate(
                [sampleResourceNameValue, 'Function2']
            )
            const expectedTemplateResourceKeys: string[] = Object.keys(expectedTemplateContents.Resources!)

            await saveTemplate(expectedTemplateContents, sourceTemplateFilename)

            await new SamTemplateGenerator()
                .withCodeUri(sampleCodeUriValue)
                .withFunctionHandler(sampleFunctionHandlerValue)
                .withRuntime(sampleRuntimeValue)
                .withResourceName(sampleResourceNameValue)
                .withExistingTemplate(sourceTemplateFilename)
                .generate(destinationTemplateFilename)

            assert.equal(await SystemUtilities.fileExists(destinationTemplateFilename), true)

            const template: CloudFormationTemplate = await loadTemplate(destinationTemplateFilename)
            assert.ok(template.Resources)
            const actualTemplateResourceKeys: string[] = Object.keys(template.Resources!)
            assert.equal(actualTemplateResourceKeys.length, expectedTemplateResourceKeys.length)
            assert.equal(
                expectedTemplateResourceKeys
                    .every(expectedKey => actualTemplateResourceKeys.some(actualKey => actualKey === expectedKey)),
                true
            )

            const resource: CloudFormationResource = template.Resources![sampleResourceNameValue]
            assert.equal(resource.Properties!.CodeUri, sampleCodeUriValue)
            assert.equal(resource.Properties!.Handler, sampleFunctionHandlerValue)
            assert.equal(resource.Properties!.Runtime, sampleRuntimeValue)
        })

        it('Produces a template using existing function handler value', async () => {
            const expectedTemplateContents: CloudFormationTemplate = createSampleTemplate(
                [sampleResourceNameValue]
            )

            await saveTemplate(expectedTemplateContents, sourceTemplateFilename)

            await new SamTemplateGenerator()
                .withCodeUri(sampleCodeUriValue)
                .withRuntime(sampleRuntimeValue)
                .withResourceName(sampleResourceNameValue)
                .withExistingTemplate(sourceTemplateFilename)
                .generate(destinationTemplateFilename)

            assert.equal(await SystemUtilities.fileExists(destinationTemplateFilename), true)

            const template: CloudFormationTemplate = await loadTemplate(destinationTemplateFilename)
            const resource: CloudFormationResource = template.Resources![sampleResourceNameValue]
            assert.equal(resource.Properties!.CodeUri, sampleCodeUriValue)
            assert.equal(resource.Properties!.Handler, `${sampleResourceNameValue}-handler`)
        })

        it('errs if code uri is missing', async () => {
            const error: Error = await assertThrowsError(
                async () => {
                    await new SamTemplateGenerator()
                        .withFunctionHandler(sampleFunctionHandlerValue)
                        .withRuntime(sampleRuntimeValue)
                        .withResourceName(sampleResourceNameValue)
                        .withExistingTemplate(sourceTemplateFilename)
                        .generate(destinationTemplateFilename)
                })

            assert.ok(error)
            assert.equal(error.message, 'Missing value: CodeUri')
            assert.equal(await SystemUtilities.fileExists(destinationTemplateFilename), false)
        })

        it('errs if function handler is not in existing template and not provided', async () => {
            const expectedTemplateContents: CloudFormationTemplate = createSampleTemplate(
                [sampleResourceNameValue]
            )

            delete expectedTemplateContents.Resources![sampleResourceNameValue].Properties!.Handler

            await saveTemplate(expectedTemplateContents, sourceTemplateFilename)

            const error: Error = await assertThrowsError(
                async () => {
                    await new SamTemplateGenerator()
                        .withCodeUri(sampleCodeUriValue)
                        .withRuntime(sampleRuntimeValue)
                        .withResourceName(sampleResourceNameValue)
                        .withExistingTemplate(sourceTemplateFilename)
                        .generate(destinationTemplateFilename)
                })

            assert.ok(error)
            assert.equal(error.message, 'Missing value: FunctionHandler')
            assert.equal(await SystemUtilities.fileExists(destinationTemplateFilename), false)
        })

        it('errs if runtime is not in existing template and not provided', async () => {
            const expectedTemplateContents: CloudFormationTemplate = createSampleTemplate(
                [sampleResourceNameValue]
            )

            delete expectedTemplateContents.Resources![sampleResourceNameValue].Properties!.Runtime

            await saveTemplate(expectedTemplateContents, sourceTemplateFilename)

            const error: Error = await assertThrowsError(
                async () => {
                    await new SamTemplateGenerator()
                        .withCodeUri(sampleCodeUriValue)
                        .withFunctionHandler(sampleFunctionHandlerValue)
                        .withResourceName(sampleResourceNameValue)
                        .withExistingTemplate(sourceTemplateFilename)
                        .generate(destinationTemplateFilename)
                })

            assert.ok(error)
            assert.equal(error.message, 'Missing value: Runtime')
            assert.equal(await SystemUtilities.fileExists(destinationTemplateFilename), false)
        })

        it('errs if resource name is missing', async () => {
            const error: Error = await assertThrowsError(
                async () => {
                    await new SamTemplateGenerator()
                        .withCodeUri(sampleCodeUriValue)
                        .withFunctionHandler(sampleFunctionHandlerValue)
                        .withRuntime(sampleRuntimeValue)
                        .withExistingTemplate(sourceTemplateFilename)
                        .generate(destinationTemplateFilename)
                })

            assert.ok(error)
            assert.equal(error.message, 'Missing value: ResourceName')
            assert.equal(await SystemUtilities.fileExists(destinationTemplateFilename), false)
        })

        it('errs if resource name is not found in the existing template', async () => {
            const error: Error = await assertThrowsError(
                async () => {
                    await new SamTemplateGenerator()
                        .withCodeUri(sampleCodeUriValue)
                        .withFunctionHandler(sampleFunctionHandlerValue)
                        .withRuntime(sampleRuntimeValue)
                        .withResourceName(`nonExistent${sampleResourceNameValue}`)
                        .withExistingTemplate(sourceTemplateFilename)
                        .generate(destinationTemplateFilename)
                })

            assert.ok(error)
            assert.notEqual(error.message.indexOf('Resource not found'), -1)
            assert.equal(await SystemUtilities.fileExists(destinationTemplateFilename), false)
        })

        it('errs if existing template does not exist', async () => {
            const fakeSourceTemplateFilename: string = path.join(tempFolder, 'fake-src-template.yml')

            const error: Error = await assertThrowsError(
                async () => {
                    await new SamTemplateGenerator()
                        .withCodeUri(sampleCodeUriValue)
                        .withFunctionHandler(sampleFunctionHandlerValue)
                        .withRuntime(sampleRuntimeValue)
                        .withResourceName(sampleResourceNameValue)
                        .withExistingTemplate(fakeSourceTemplateFilename)
                        .generate(destinationTemplateFilename)
                })

            assert.ok(error)
            assert.notEqual(error.message.indexOf('Template file not found'), -1)
            assert.equal(await SystemUtilities.fileExists(destinationTemplateFilename), false)
        })
    })

    // Todo : CC : move I/O to concrete class
    async function loadTemplate(filename: string): Promise<CloudFormationTemplate> {
        const templateAsYaml: string = await filesystemUtilities.readFileAsString(filename, 'utf8')

        return yaml.safeLoad(templateAsYaml, {
            // filename: templatePath,
            schema
        }) as CloudFormationTemplate
    }

    function createSampleTemplate(resourceNames: string[]): CloudFormationTemplate {
        const resources: {
            [key: string]: CloudFormationResource
        } = {}

        resourceNames.forEach(resourceName => {
            resources[resourceName] = {
                Type: 'AWS::Serverless::Function',
                Properties: {
                    Handler: `${resourceName}-handler`,
                    CodeUri: `${resourceName}-codeuri`,
                    Runtime: `${resourceName}-runtime`,
                }
            }
        })

        return {
            Resources: resources
        }
    }

    async function saveTemplate(
        template: CloudFormationTemplate,
        filename: string
    ): Promise<void> {
        const templateAsYaml: string = yaml.safeDump(template)

        await filesystem.writeFileAsync(filename, templateAsYaml, 'utf8')
    }
    async function assertThrowsError(fn: Function): Promise<Error> {
        try {
            await fn()
        } catch (err) {
            if (err instanceof Error) {
                return err
            }
        }

        throw new Error('function did not throw error as expected')
    }
})
