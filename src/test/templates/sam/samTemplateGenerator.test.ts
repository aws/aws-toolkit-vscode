/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as del from 'del'
import * as os from 'os'
import * as path from 'path'
import { CloudFormation } from '../../../shared/cloudformation/cloudformation'
import * as filesystem from '../../../shared/filesystem'
import { SystemUtilities } from '../../../shared/systemUtilities'
import { SamTemplateGenerator } from '../../../shared/templates/sam/samTemplateGenerator'

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

            const template: CloudFormation.Template = await CloudFormation.load(templateFilename)
            assert.ok(template.Resources)
            assert.notEqual(Object.keys(template.Resources!).length, 0)

            const resource: CloudFormation.Resource = template.Resources![sampleResourceNameValue]
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

            const templateContents: CloudFormation.Template = createSampleTemplate(
                [sampleResourceNameValue]
            )

            await CloudFormation.save(templateContents, sourceTemplateFilename)
        })

        it('Produces a template given valid inputs', async () => {
            const expectedTemplateContents: CloudFormation.Template = createSampleTemplate(
                [sampleResourceNameValue, 'Function2']
            )
            const expectedTemplateResourceKeys: string[] = Object.keys(expectedTemplateContents.Resources!)

            await CloudFormation.save(expectedTemplateContents, sourceTemplateFilename)

            await new SamTemplateGenerator()
                .withCodeUri(sampleCodeUriValue)
                .withFunctionHandler(sampleFunctionHandlerValue)
                .withRuntime(sampleRuntimeValue)
                .withResourceName(sampleResourceNameValue)
                .withExistingTemplate(sourceTemplateFilename)
                .generate(destinationTemplateFilename)

            assert.equal(await SystemUtilities.fileExists(destinationTemplateFilename), true)

            const template: CloudFormation.Template = await CloudFormation.load(destinationTemplateFilename)
            assert.ok(template.Resources)
            const actualTemplateResourceKeys: string[] = Object.keys(template.Resources!)
            assert.equal(actualTemplateResourceKeys.length, expectedTemplateResourceKeys.length)
            assert.equal(
                expectedTemplateResourceKeys
                    .every(expectedKey => actualTemplateResourceKeys.some(actualKey => actualKey === expectedKey)),
                true
            )

            const resource: CloudFormation.Resource = template.Resources![sampleResourceNameValue]
            assert.equal(resource.Properties!.CodeUri, sampleCodeUriValue)
            assert.equal(resource.Properties!.Handler, sampleFunctionHandlerValue)
            assert.equal(resource.Properties!.Runtime, sampleRuntimeValue)
        })

        it('Produces a template using existing function handler value', async () => {
            const expectedTemplateContents: CloudFormation.Template = createSampleTemplate(
                [sampleResourceNameValue]
            )

            await CloudFormation.save(expectedTemplateContents, sourceTemplateFilename)

            await new SamTemplateGenerator()
                .withCodeUri(sampleCodeUriValue)
                .withRuntime(sampleRuntimeValue)
                .withResourceName(sampleResourceNameValue)
                .withExistingTemplate(sourceTemplateFilename)
                .generate(destinationTemplateFilename)

            assert.equal(await SystemUtilities.fileExists(destinationTemplateFilename), true)

            const template: CloudFormation.Template = await CloudFormation.load(destinationTemplateFilename)
            const resource: CloudFormation.Resource = template.Resources![sampleResourceNameValue]
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
            const expectedTemplateContents: CloudFormation.Template = createSampleTemplate(
                [sampleResourceNameValue]
            )

            delete expectedTemplateContents.Resources![sampleResourceNameValue].Properties!.Handler

            await CloudFormation.save(expectedTemplateContents, sourceTemplateFilename)

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
            const expectedTemplateContents: CloudFormation.Template = createSampleTemplate(
                [sampleResourceNameValue]
            )

            delete expectedTemplateContents.Resources![sampleResourceNameValue].Properties!.Runtime

            await CloudFormation.save(expectedTemplateContents, sourceTemplateFilename)

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

    function createSampleTemplate(resourceNames: string[]): CloudFormation.Template {
        const resources: {
            [key: string]: CloudFormation.Resource
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

    async function assertThrowsError(fn: Function): Promise<Error> {
        try {
            // tslint:disable-next-line:no-unsafe-any
            await fn()
        } catch (err) {
            if (err instanceof Error) {
                return err
            }
        }

        throw new Error('function did not throw error as expected')
    }
})
