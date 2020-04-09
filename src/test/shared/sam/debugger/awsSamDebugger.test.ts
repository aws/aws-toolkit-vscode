/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as path from 'path'
import { TEMPLATE_TARGET_TYPE } from '../../../../lambda/local/debugConfiguration'
import { TemplateTargetProperties } from '../../../../shared/sam/debugger/awsSamDebugConfiguration'
import { createDirectInvokeSamDebugConfiguration } from '../../../../shared/sam/debugger/awsSamDebugger'

describe('createDirectInvokeSamDebugConfiguration', () => {
    const name = 'my body is a template'
    const templatePath = path.join('two', 'roads', 'diverged', 'in', 'a', 'yellow', 'wood')

    it('creates a template-type SAM debugger configuration with minimal configurations', () => {
        const config = createDirectInvokeSamDebugConfiguration(name, templatePath)
        assert.strictEqual(config.invokeTarget.target, TEMPLATE_TARGET_TYPE)
        const invokeTarget = config.invokeTarget as TemplateTargetProperties
        assert.strictEqual(config.name, name)
        assert.strictEqual(invokeTarget.samTemplateResource, name)
        assert.strictEqual(invokeTarget.samTemplatePath, templatePath)
        assert.ok(!config.hasOwnProperty('lambda'))
    })

    it('creates a template-type SAM debugger configuration with additional params', () => {
        const params = {
            eventJson: {
                event: 'uneventufl',
            },
            environmentVariables: {
                varial: 'invert to fakie',
            },
            dockerNetwork: 'rockerFretwork',
        }
        const config = createDirectInvokeSamDebugConfiguration(name, templatePath, params)
        assert.deepStrictEqual(config.lambda?.event?.json, params.eventJson)
        assert.deepStrictEqual(config.lambda?.environmentVariables, params.environmentVariables)
        assert.strictEqual(config.sam?.dockerNetwork, params.dockerNetwork)
        assert.strictEqual(config.sam?.containerBuild, undefined)
    })
})
