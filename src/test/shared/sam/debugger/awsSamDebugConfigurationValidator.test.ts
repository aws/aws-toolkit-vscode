/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { instance, mock, when } from 'ts-mockito'

import { CloudFormation } from '../../../../shared/cloudformation/cloudformation'
import { CloudFormationTemplateRegistry } from '../../../../shared/cloudformation/templateRegistry'
import {
    AwsSamDebuggerConfiguration,
    TemplateTargetProperties,
} from '../../../../shared/sam/debugger/awsSamDebugConfiguration'
import { DefaultAwsSamDebugConfigurationValidator } from '../../../../shared/sam/debugger/awsSamDebugConfigurationValidator'
import { createBaseTemplate } from '../../cloudformation/cloudformationTestUtils'
import { ext } from '../../../../shared/extensionGlobals'
import { WatchedItem } from '../../../../shared/watchedFiles'

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
            runtime: 'nodejs12.x',
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

describe('DefaultAwsSamDebugConfigurationValidator', () => {
    const templateConfig = createTemplateConfig()
    const imageTemplateConfig = createImageTemplateConfig()
    const codeConfig = createCodeConfig()
    const apiConfig = createApiConfig()
    const templateData = createTemplateData()
    const imageTemplateData = createImageTemplateData()

    const mockRegistry: CloudFormationTemplateRegistry = mock()
    const mockFolder: vscode.WorkspaceFolder = mock()

    let validator: DefaultAwsSamDebugConfigurationValidator

    let savedRegistry: CloudFormationTemplateRegistry

    before(() => {
        savedRegistry = ext.templateRegistry
    })

    after(() => {
        ext.templateRegistry = savedRegistry
    })

    beforeEach(() => {
        when(mockRegistry.getRegisteredItem('/')).thenReturn(templateData)
        when(mockRegistry.getRegisteredItem('/image')).thenReturn(imageTemplateData)

        ext.templateRegistry = mockRegistry

        validator = new DefaultAwsSamDebugConfigurationValidator(instance(mockFolder))
    })

    it('returns invalid when resolving debug configurations with an invalid request type', () => {
        templateConfig.request = 'not-direct-invoke'

        const result = validator.validate(templateConfig)
        assert.strictEqual(result.isValid, false)
    })

    it('returns invalid when resolving debug configurations with an invalid target type', () => {
        templateConfig.invokeTarget.target = 'not-valid' as any

        const result = validator.validate(templateConfig as any)
        assert.strictEqual(result.isValid, false)
    })

    it("returns invalid when resolving template debug configurations with a template that isn't in the registry", () => {
        const mockEmptyRegistry: CloudFormationTemplateRegistry = mock()
        when(mockEmptyRegistry.getRegisteredItem('/')).thenReturn(undefined)

        validator = new DefaultAwsSamDebugConfigurationValidator(instance(mockFolder))

        const result = validator.validate(templateConfig)
        assert.strictEqual(result.isValid, false)
    })

    it("returns invalid when resolving template debug configurations with a template that doesn't have the set resource", () => {
        const target = templateConfig.invokeTarget as TemplateTargetProperties
        target.logicalId = 'wrong'

        const result = validator.validate(templateConfig)
        assert.strictEqual(result.isValid, false)
    })

    it("returns invalid when resolving template debug configurations with a template that isn't serverless", () => {
        const target = templateConfig.invokeTarget as TemplateTargetProperties
        target.logicalId = 'OtherResource'

        const result = validator.validate(templateConfig)
        assert.strictEqual(result.isValid, false)
    })

    it('returns undefined when resolving template debug configurations with a resource that has an invalid runtime in template', () => {
        const properties = templateData.item.Resources?.TestResource?.Properties as CloudFormation.ZipResourceProperties
        properties.Runtime = 'invalid'

        const result = validator.validate(templateConfig)
        assert.strictEqual(result.isValid, false)
    })

    it("API config returns invalid when resolving with a template that isn't serverless", () => {
        const target = templateConfig.invokeTarget as TemplateTargetProperties
        target.logicalId = 'OtherResource'

        const result = validator.validate(apiConfig)
        assert.strictEqual(result.isValid, false)
    })

    it('API config is invalid when it does not have an API field', () => {
        const config = createApiConfig()
        config.api = undefined

        const result = validator.validate(config)
        assert.strictEqual(result.isValid, false)
    })

    it("API config is invalid when its path does not start with a '/'", () => {
        const config = createApiConfig()

        config.api!.path = 'noleadingslash'

        const result = validator.validate(config)
        assert.strictEqual(result.isValid, false)
    })

    it('returns invalid when resolving code debug configurations with invalid runtimes', () => {
        codeConfig.lambda = { runtime: 'asd' }

        const result = validator.validate(codeConfig)
        assert.strictEqual(result.isValid, false)
    })

    it('returns invalid when Image app does not declare runtime', () => {
        const lambda = imageTemplateConfig.lambda

        delete lambda?.runtime

        const result = validator.validate(templateConfig)
        assert.strictEqual(result.isValid, false)
    })
})
