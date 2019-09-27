/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

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
    const sampleMemorySize: number = 256
    const sampleTimeout: number = 321
    const sampleRuntimeValue: string = 'sampleRuntime'
    const sampleEnvironment: unknown = {}
    let templateFilename: string
    let tempFolder: string

    beforeEach(async () => {
        tempFolder = await makeTemporaryToolkitFolder()
        templateFilename = path.join(tempFolder, 'template.yml')
    })

    afterEach(async () => {
        await del([tempFolder], { force: true })
    })

    function makeMinimalTemplate(): SamTemplateGenerator {
        return new SamTemplateGenerator()
            .withCodeUri(sampleCodeUriValue)
            .withFunctionHandler(sampleFunctionHandlerValue)
            .withRuntime(sampleRuntimeValue)
            .withResourceName(sampleResourceNameValue)
    }

    it('Produces a minimal template', async () => {
        await makeMinimalTemplate().generate(templateFilename)

        assert.strictEqual(await SystemUtilities.fileExists(templateFilename), true)

        const template: CloudFormation.Template = await CloudFormation.load(templateFilename)
        assert.ok(template.Resources)
        assert.notStrictEqual(Object.keys(template.Resources!).length, 0)

        const resource = template.Resources![sampleResourceNameValue]
        assert.ok(resource)
        assert.strictEqual(resource!.Properties!.CodeUri, sampleCodeUriValue)
        assert.strictEqual(resource!.Properties!.Handler, sampleFunctionHandlerValue)
        assert.strictEqual(resource!.Properties!.Runtime, sampleRuntimeValue)
    })

    it('Produces a template containing MemorySize', async () => {
        await makeMinimalTemplate()
            .withMemorySize(sampleMemorySize)
            .generate(templateFilename)

        assert.strictEqual(await SystemUtilities.fileExists(templateFilename), true)

        const template: CloudFormation.Template = await CloudFormation.load(templateFilename)
        assert.ok(template.Resources)
        assert.notStrictEqual(Object.keys(template.Resources!).length, 0)

        const resource = template.Resources![sampleResourceNameValue]
        assert.ok(resource)
        assert.strictEqual(resource!.Properties!.MemorySize, sampleMemorySize)
    })

    it('Produces a template containing Timeout', async () => {
        await makeMinimalTemplate()
            .withTimeout(sampleTimeout)
            .generate(templateFilename)

        assert.strictEqual(await SystemUtilities.fileExists(templateFilename), true)

        const template: CloudFormation.Template = await CloudFormation.load(templateFilename)
        assert.ok(template.Resources)
        assert.notStrictEqual(Object.keys(template.Resources!).length, 0)

        const resource = template.Resources![sampleResourceNameValue]
        assert.ok(resource)
        assert.strictEqual(resource!.Properties!.Timeout, sampleTimeout)
    })

    it('Produces a template containing Environment', async () => {
        await makeMinimalTemplate()
            .withEnvironment(sampleEnvironment)
            .generate(templateFilename)

        assert.strictEqual(await SystemUtilities.fileExists(templateFilename), true)

        const template: CloudFormation.Template = await CloudFormation.load(templateFilename)
        assert.ok(template.Resources)
        assert.notStrictEqual(Object.keys(template.Resources!).length, 0)

        const resource = template.Resources![sampleResourceNameValue]
        assert.ok(resource)
        assert.deepStrictEqual(resource!.Properties!.Environment, sampleEnvironment)
    })

    it('Produces a template with a Globals section', async () => {
        await makeMinimalTemplate()
            .withGlobals({
                Function: {
                    Timeout: 5
                }
            })
            .generate(templateFilename)

        assert.strictEqual(await SystemUtilities.fileExists(templateFilename), true)

        const template: CloudFormation.Template = await CloudFormation.load(templateFilename)
        assert.ok(template.Globals, 'Expected loaded template to have a Globals section')
        // tslint:disable:no-unsafe-any -- we don't care about the schema of globals for the test
        const globals = template.Globals!
        assert.notStrictEqual(Object.keys(globals).length, 0, 'Expected Template Globals to be not empty')

        const functionKey = 'Function'
        const timeoutKey = 'Timeout'
        assert.ok(globals[functionKey], 'Expected Globals to contain Function')
        assert.ok(globals[functionKey][timeoutKey], 'Expected Globals.Function to contain Timeout')
        assert.strictEqual(globals[functionKey][timeoutKey], 5, 'Unexpected Globals.Function.Timeout value')
        // tslint:enable:no-unsafe-any
    })

    it('errs if resource name is missing', async () => {
        const error: Error = await assertThrowsError(async () => {
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
        const error: Error = await assertThrowsError(async () => {
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
        const error: Error = await assertThrowsError(async () => {
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
        const error: Error = await assertThrowsError(async () => {
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
