/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as fs from 'fs-extra'
import * as path from 'path'
import { Architecture } from '../../../lambda/models/samLambdaRuntime'
import * as CloudFormation from '../../../shared/cloudformation/cloudformation'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { SystemUtilities } from '../../../shared/systemUtilities'
import { SamTemplateGenerator } from '../../../shared/templates/sam/samTemplateGenerator'

describe('SamTemplateGenerator', function () {
    const sampleCodeUriValue: string = 'sampleCodeUri'
    const sampleFunctionHandlerValue: string = 'sampleFunctionHandler'
    const sampleResourceNameValue: string = 'sampleResourceName'
    const sampleMemorySize: number = 256
    const sampleTimeout: number = 321
    const sampleRuntimeValue: string = 'sampleRuntime'
    const sampleArchitecture: Architecture = 'arm64'
    const sampleEnvironment: CloudFormation.Environment = {}
    let templateFilename: string
    let tempFolder: string

    beforeEach(async function () {
        tempFolder = await makeTemporaryToolkitFolder()
        templateFilename = path.join(tempFolder, 'template.yml')
    })

    afterEach(async function () {
        await fs.remove(tempFolder)
    })

    function makeMinimalTemplate(): SamTemplateGenerator {
        return new SamTemplateGenerator()
            .withCodeUri(sampleCodeUriValue)
            .withFunctionHandler(sampleFunctionHandlerValue)
            .withRuntime(sampleRuntimeValue)
            .withResourceName(sampleResourceNameValue)
    }

    it('Produces a minimal template', async function () {
        await makeMinimalTemplate().generate(templateFilename)

        assert.strictEqual(await SystemUtilities.fileExists(templateFilename), true)

        const template: CloudFormation.Template = await CloudFormation.load(templateFilename)
        assert.ok(template.Resources)
        assert.notStrictEqual(Object.keys(template.Resources!).length, 0)

        const resource = template.Resources![sampleResourceNameValue]
        assert.ok(resource)
        assert.ok(CloudFormation.isZipLambdaResource(resource.Properties))
        assert.strictEqual(resource!.Properties!.CodeUri, sampleCodeUriValue)
        assert.strictEqual(resource!.Properties!.Handler, sampleFunctionHandlerValue)
        assert.strictEqual(resource!.Properties!.Runtime, sampleRuntimeValue)
    })

    it('Produces a template containing MemorySize', async function () {
        await makeMinimalTemplate().withMemorySize(sampleMemorySize).generate(templateFilename)

        assert.strictEqual(await SystemUtilities.fileExists(templateFilename), true)

        const template: CloudFormation.Template = await CloudFormation.load(templateFilename)
        assert.ok(template.Resources)
        assert.notStrictEqual(Object.keys(template.Resources!).length, 0)

        const resource = template.Resources![sampleResourceNameValue]
        assert.ok(resource)
        assert.strictEqual(resource!.Properties!.MemorySize, sampleMemorySize)
    })

    it('Produces a template containing Timeout', async function () {
        await makeMinimalTemplate().withTimeout(sampleTimeout).generate(templateFilename)

        assert.strictEqual(await SystemUtilities.fileExists(templateFilename), true)

        const template: CloudFormation.Template = await CloudFormation.load(templateFilename)
        assert.ok(template.Resources)
        assert.notStrictEqual(Object.keys(template.Resources!).length, 0)

        const resource = template.Resources![sampleResourceNameValue]
        assert.ok(resource)
        assert.strictEqual(resource!.Properties!.Timeout, sampleTimeout)
    })

    it('Produces a template containing Environment', async function () {
        await makeMinimalTemplate().withEnvironment(sampleEnvironment).generate(templateFilename)

        assert.strictEqual(await SystemUtilities.fileExists(templateFilename), true)

        const template: CloudFormation.Template = await CloudFormation.load(templateFilename)
        assert.ok(template.Resources)
        assert.notStrictEqual(Object.keys(template.Resources!).length, 0)

        const resource = template.Resources![sampleResourceNameValue]
        assert.ok(resource)
        assert.deepStrictEqual(resource!.Properties!.Environment, sampleEnvironment)
    })

    it('Produces a template containing Architectures', async function () {
        await makeMinimalTemplate().withArchitectures([sampleArchitecture]).generate(templateFilename)

        assert.strictEqual(await SystemUtilities.fileExists(templateFilename), true)

        const template: CloudFormation.Template = await CloudFormation.load(templateFilename)
        assert.ok(template.Resources)
        assert.notStrictEqual(Object.keys(template.Resources!).length, 0)

        const resource = template.Resources![sampleResourceNameValue]
        assert.ok(resource)
        assert.deepStrictEqual(resource!.Properties?.Architectures, [sampleArchitecture])
    })

    it('Produces a template with a Globals section', async function () {
        await makeMinimalTemplate()
            .withGlobals({
                Function: {
                    Timeout: 5,
                },
            })
            .generate(templateFilename)

        assert.strictEqual(await SystemUtilities.fileExists(templateFilename), true)

        const template: CloudFormation.Template = await CloudFormation.load(templateFilename)
        assert.ok(template.Globals, 'Expected loaded template to have a Globals section')
        const globals = template.Globals
        assert.notStrictEqual(Object.keys(globals).length, 0, 'Expected Template Globals to be not empty')

        const functionKey = 'Function'
        const timeoutKey = 'Timeout'
        assert.ok(globals[functionKey], 'Expected Globals to contain Function')
        assert.ok(globals[functionKey]![timeoutKey], 'Expected Globals.Function to contain Timeout')
        assert.strictEqual(globals[functionKey]![timeoutKey], 5, 'Unexpected Globals.Function.Timeout value')
    })

    it('errs if resource name is missing', async function () {
        await assert.rejects(
            new SamTemplateGenerator()
                .withCodeUri(sampleCodeUriValue)
                .withFunctionHandler(sampleFunctionHandlerValue)
                .withRuntime(sampleRuntimeValue)
                .generate(templateFilename),
            new Error('Missing value: at least one of ResourceName or TemplateResources')
        )

        assert.strictEqual(await SystemUtilities.fileExists(templateFilename), false)
    })

    it('errs if function handler is missing', async function () {
        await assert.rejects(
            new SamTemplateGenerator()
                .withCodeUri(sampleCodeUriValue)
                .withRuntime(sampleRuntimeValue)
                .withResourceName(sampleResourceNameValue)
                .generate(templateFilename),
            new Error('Missing value: Handler')
        )

        assert.strictEqual(await SystemUtilities.fileExists(templateFilename), false)
    })

    it('errs if code uri is missing', async function () {
        await assert.rejects(
            new SamTemplateGenerator()
                .withFunctionHandler(sampleFunctionHandlerValue)
                .withRuntime(sampleRuntimeValue)
                .withResourceName(sampleResourceNameValue)
                .generate(templateFilename),
            new Error('Missing value: CodeUri')
        )

        assert.strictEqual(await SystemUtilities.fileExists(templateFilename), false)
    })

    it('errs if runtime is missing', async function () {
        await assert.rejects(
            new SamTemplateGenerator()
                .withCodeUri(sampleCodeUriValue)
                .withFunctionHandler(sampleFunctionHandlerValue)
                .withResourceName(sampleResourceNameValue)
                .generate(templateFilename),
            new Error('Missing value: Runtime')
        )

        assert.strictEqual(await SystemUtilities.fileExists(templateFilename), false)
    })
})
