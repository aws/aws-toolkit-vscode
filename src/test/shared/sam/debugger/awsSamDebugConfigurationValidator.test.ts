/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { instance, mock, when } from 'ts-mockito'

import { CloudFormation } from '../../../../shared/cloudformation/cloudformation'
import { CloudFormationTemplateRegistry, TemplateDatum } from '../../../../shared/cloudformation/templateRegistry'
import {
    AwsSamDebuggerConfiguration,
    TemplateTargetProperties,
} from '../../../../shared/sam/debugger/awsSamDebugConfiguration'
import { DefaultAwsSamDebugConfigurationValidator } from '../../../../shared/sam/debugger/awsSamDebugConfigurationValidator'
import { createBaseTemplate } from '../../cloudformation/cloudformationTestUtils'

function createTemplateConfig(): AwsSamDebuggerConfiguration {
    return {
        type: 'aws-sam',
        name: 'name',
        request: 'direct-invoke',
        invokeTarget: {
            target: 'template',
            samTemplatePath: '/',
            samTemplateResource: 'TestResource',
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

function createTemplateData(): TemplateDatum {
    return {
        path: '/',
        template: createBaseTemplate(),
    }
}

describe('DefaultAwsSamDebugConfigurationValidator', () => {
    const templateConfig = createTemplateConfig()
    const codeConfig = createCodeConfig()
    const templateData = createTemplateData()

    const mockRegistry: CloudFormationTemplateRegistry = mock()

    let validator: DefaultAwsSamDebugConfigurationValidator

    beforeEach(() => {
        when(mockRegistry.getRegisteredTemplate('/')).thenReturn(templateData)

        validator = new DefaultAwsSamDebugConfigurationValidator(instance(mockRegistry))
    })

    it('returns valid when resolving a valid template debug configuration', () => {
        const result = validator.validateSamDebugConfiguration(templateConfig)
        assert.strictEqual(result.isValid, true)
    })

    it('returns valid when resolving a valid template debug configuration that specifies extraneous environment variables', () => {
        templateConfig.lambda = {
            environmentVariables: {
                EXTRANEOUS: 'envvar',
            },
        }
        const result = validator.validateSamDebugConfiguration(templateConfig)
        assert.strictEqual(result.isValid, true)
    })

    it('returns invalid when resolving debug configurations with an invalid request type', () => {
        templateConfig.request = 'not-direct-invoke'

        const result = validator.validateSamDebugConfiguration(templateConfig)
        assert.strictEqual(result.isValid, false)
    })

    it('returns invalid when resolving debug configurations with an invalid target type', () => {
        templateConfig.invokeTarget.target = 'not-valid' as any

        const result = validator.validateSamDebugConfiguration(templateConfig as any)
        assert.strictEqual(result.isValid, false)
    })

    it("returns invalid when resolving template debug configurations with a template that isn't in the registry", () => {
        const mockEmptyRegistry: CloudFormationTemplateRegistry = mock()
        when(mockEmptyRegistry.getRegisteredTemplate('/')).thenReturn(undefined)

        validator = new DefaultAwsSamDebugConfigurationValidator(instance(mockEmptyRegistry))

        const result = validator.validateSamDebugConfiguration(templateConfig)
        assert.strictEqual(result.isValid, false)
    })

    it("returns invalid when resolving template debug configurations with a template that doesn't have the set resource", () => {
        const target = templateConfig.invokeTarget as TemplateTargetProperties
        target.samTemplateResource = 'wrong'

        const result = validator.validateSamDebugConfiguration(templateConfig)
        assert.strictEqual(result.isValid, false)
    })

    it("returns invalid when resolving template debug configurations with a template that isn't serverless", () => {
        const target = templateConfig.invokeTarget as TemplateTargetProperties
        target.samTemplateResource = 'OtherResource'

        const result = validator.validateSamDebugConfiguration(templateConfig)
        assert.strictEqual(result.isValid, false)
    })

    it('returns undefined when resolving template debug configurations with a resource that has an invalid runtime in template', () => {
        const properties = templateData.template.Resources?.TestResource
            ?.Properties as CloudFormation.ResourceProperties
        properties.Runtime = 'invalid'

        const result = validator.validateSamDebugConfiguration(templateConfig)
        assert.strictEqual(result.isValid, false)
    })

    it('returns invalid when resolving code debug configurations with invalid runtimes', () => {
        codeConfig.lambda = { runtime: 'asd' }

        const result = validator.validateSamDebugConfiguration(codeConfig)
        assert.strictEqual(result.isValid, false)
    })
})
