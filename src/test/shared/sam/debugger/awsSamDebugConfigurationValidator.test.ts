/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import { instance, mock, when } from 'ts-mockito'

import * as CloudFormation from '../../../../shared/cloudformation/cloudformation'
import { CloudFormationTemplateRegistry } from '../../../../shared/fs/templateRegistry'
import {
    AwsSamDebuggerConfiguration,
    TemplateTargetProperties,
} from '../../../../shared/sam/debugger/awsSamDebugConfiguration'
import { DefaultAwsSamDebugConfigurationValidator } from '../../../../shared/sam/debugger/awsSamDebugConfigurationValidator'
import { createBaseTemplate } from '../../cloudformation/cloudformationTestUtils'
import { WatchedItem } from '../../../../shared/fs/watchedFiles'

function createTemplateConfig(): AwsSamDebuggerConfiguration {
    return {
        type: 'aws-sam',
        name: 'name',
        request: 'direct-invoke',
        invokeTarget: {
            target: 'template',
            templatePath: '/',
            logicalId: 'TestResource',
        },
    }
}

function createImageTemplateConfig(): AwsSamDebuggerConfiguration {
    return {
        type: 'aws-sam',
        name: 'name',
        request: 'direct-invoke',
        invokeTarget: {
            target: 'template',
            templatePath: '/image',
            logicalId: 'TestResource',
        },
        lambda: {
            runtime: 'nodejs18.x',
        },
    }
}

function createCodeConfig(): AwsSamDebuggerConfiguration {
    return {
        type: 'aws-sam',
        name: 'name',
        request: 'direct-invoke',
        invokeTarget: {
            target: 'code',
            lambdaHandler: 'foo',
            projectRoot: 'bar',
        },
    }
}

function createApiConfig(): AwsSamDebuggerConfiguration {
    return {
        type: 'aws-sam',
        name: 'name',
        request: 'direct-invoke',
        invokeTarget: {
            target: 'api',
            templatePath: '/',
            logicalId: 'TestResource',
        },
        api: {
            path: '/',
            httpMethod: 'get',
        },
    }
}

function createTemplateData(): WatchedItem<CloudFormation.Template> {
    return {
        path: '/',
        item: createBaseTemplate(),
    }
}

function createImageTemplateData(): WatchedItem<CloudFormation.Template> {
    return {
        path: '/image',
        item: createBaseTemplate(),
    }
}

describe('DefaultAwsSamDebugConfigurationValidator', function () {
    const templateConfig = createTemplateConfig()
    const imageTemplateConfig = createImageTemplateConfig()
    const codeConfig = createCodeConfig()
    const apiConfig = createApiConfig()
    const templateData = createTemplateData()
    const imageTemplateData = createImageTemplateData()

    const mockRegistry: CloudFormationTemplateRegistry = mock()
    const mockFolder: vscode.WorkspaceFolder = mock()

    let validator: DefaultAwsSamDebugConfigurationValidator

    beforeEach(function () {
        when(mockRegistry.getItem('/')).thenReturn(templateData)
        when(mockRegistry.getItem('/image')).thenReturn(imageTemplateData)

        validator = new DefaultAwsSamDebugConfigurationValidator(instance(mockFolder))
    })

    it('returns invalid when resolving debug configurations with an invalid request type', async () => {
        templateConfig.request = 'not-direct-invoke'

        const result = await validator.validate(templateConfig, mockRegistry)
        assert.strictEqual(result.isValid, false)
    })

    it('returns invalid when resolving debug configurations with an invalid target type', async () => {
        templateConfig.invokeTarget.target = 'not-valid' as any

        const result = await validator.validate(templateConfig as any, mockRegistry)
        assert.strictEqual(result.isValid, false)
    })

    it("returns invalid when resolving template debug configurations with a template that isn't in the registry", async () => {
        const mockEmptyRegistry: CloudFormationTemplateRegistry = mock()
        when(mockEmptyRegistry.getItem('/')).thenReturn(undefined)

        validator = new DefaultAwsSamDebugConfigurationValidator(instance(mockFolder))

        const result = await validator.validate(templateConfig, mockRegistry)
        assert.strictEqual(result.isValid, false)
    })

    it("returns invalid when resolving template debug configurations with a template that doesn't have the set resource", async () => {
        const target = templateConfig.invokeTarget as TemplateTargetProperties
        target.logicalId = 'wrong'

        const result = await validator.validate(templateConfig, mockRegistry)
        assert.strictEqual(result.isValid, false)
    })

    it("returns invalid when resolving template debug configurations with a template that isn't serverless", async () => {
        const target = templateConfig.invokeTarget as TemplateTargetProperties
        target.logicalId = 'OtherResource'

        const result = await validator.validate(templateConfig, mockRegistry)
        assert.strictEqual(result.isValid, false)
    })

    it('returns undefined when resolving template debug configurations with a resource that has an invalid runtime in template', async () => {
        const properties = templateData.item.Resources?.TestResource?.Properties as CloudFormation.ZipResourceProperties
        properties.Runtime = 'invalid'

        const result = await validator.validate(templateConfig, mockRegistry)
        assert.strictEqual(result.isValid, false)
    })

    it("API config returns invalid when resolving with a template that isn't serverless", async () => {
        const target = templateConfig.invokeTarget as TemplateTargetProperties
        target.logicalId = 'OtherResource'

        const result = await validator.validate(apiConfig, mockRegistry)
        assert.strictEqual(result.isValid, false)
    })

    it('API config is invalid when it does not have an API field', async () => {
        const config = createApiConfig()
        config.api = undefined

        const result = await validator.validate(config, mockRegistry)
        assert.strictEqual(result.isValid, false)
    })

    it("API config is invalid when its path does not start with a '/'", async () => {
        const config = createApiConfig()

        config.api!.path = 'noleadingslash'

        const result = await validator.validate(config, mockRegistry)
        assert.strictEqual(result.isValid, false)
    })

    it('returns invalid when resolving code debug configurations with invalid runtimes', async () => {
        codeConfig.lambda = { runtime: 'asd' }

        const result = await validator.validate(codeConfig, mockRegistry)
        assert.strictEqual(result.isValid, false)
    })

    it('returns invalid when Image app does not declare runtime', async () => {
        const lambda = imageTemplateConfig.lambda

        delete lambda?.runtime

        const result = await validator.validate(templateConfig, mockRegistry)
        assert.strictEqual(result.isValid, false)
    })
})
