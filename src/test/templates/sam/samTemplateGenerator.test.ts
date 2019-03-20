/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as assert from 'assert'
import * as del from 'del'
import * as path from 'path'
import { CloudFormation } from '../../../shared/cloudformation/cloudformation'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { SystemUtilities } from '../../../shared/systemUtilities'
import { SamTemplateGenerator } from '../../../shared/templates/sam/samTemplateGenerator'

describe('SamTemplateGenerator', () => {
    const sampleCodeUriValue: string = 'sampleCodeUri'
    const sampleFunctionHandlerValue: string = 'sampleFunctionHandler'
    const sampleResourceNameValue: string = 'sampleResourceName'
    const sampleRuntimeValue: string = 'sampleRuntime'
    const sampleEnvironment: CloudFormation.Environment = {
        Variables: {
            key: 'value'
        }
    }
    let templateFilename: string
    let tempFolder: string

    beforeEach(async () => {
        tempFolder = await makeTemporaryToolkitFolder()
        templateFilename = path.join(tempFolder, 'template.yml')
    })

    afterEach(async () => {
        await del([tempFolder], { force: true })
    })

    it('Produces a minimal template', async () => {
        await new SamTemplateGenerator()
            .withCodeUri(sampleCodeUriValue)
            .withFunctionHandler(sampleFunctionHandlerValue)
            .withRuntime(sampleRuntimeValue)
            .withResourceName(sampleResourceNameValue)
            .withEnvironment(sampleEnvironment)
            .generate(templateFilename)

        assert.strictEqual(await SystemUtilities.fileExists(templateFilename), true)

        const template: CloudFormation.Template = await CloudFormation.load(templateFilename)
        assert.ok(template.Resources)
        assert.notStrictEqual(Object.keys(template.Resources!).length, 0)

        const resource = template.Resources![sampleResourceNameValue]
        assert.ok(resource)
        assert.strictEqual(resource!.Properties!.CodeUri, sampleCodeUriValue)
        assert.strictEqual(resource!.Properties!.Handler, sampleFunctionHandlerValue)
        assert.strictEqual(resource!.Properties!.Runtime, sampleRuntimeValue)
        assert.deepStrictEqual(resource!.Properties!.Environment, sampleEnvironment)
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
        assert.strictEqual(error.message, 'Missing value: ResourceName')
        assert.strictEqual(await SystemUtilities.fileExists(templateFilename), false)
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
        assert.strictEqual(error.message, 'Missing value: Handler')
        assert.strictEqual(await SystemUtilities.fileExists(templateFilename), false)
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
        assert.strictEqual(error.message, 'Missing value: CodeUri')
        assert.strictEqual(await SystemUtilities.fileExists(templateFilename), false)
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
        assert.strictEqual(error.message, 'Missing value: Runtime')
        assert.strictEqual(await SystemUtilities.fileExists(templateFilename), false)
    })

    async function assertThrowsError(fn: () => Thenable<any>): Promise<Error> {
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
