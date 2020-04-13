/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { deepEqual, instance, mock, verify, when } from 'ts-mockito'
import * as vscode from 'vscode'
import { DebugConfigurationSource, LaunchConfiguration } from '../../../shared/debug/launchConfiguration'
import { AwsSamDebuggerConfiguration } from '../../../shared/sam/debugger/awsSamDebugConfiguration'
import { AwsSamDebugConfigurationValidator } from '../../../shared/sam/debugger/awsSamDebugConfigurationValidator'

const samDebugConfiguration: AwsSamDebuggerConfiguration = {
    type: 'aws-sam',
    name: 'name',
    request: 'direct-invoke',
    invokeTarget: {
        target: 'template',
        samTemplatePath: '/',
        samTemplateResource: 'resource',
    },
}

const debugConfigurations: vscode.DebugConfiguration[] = [
    samDebugConfiguration,
    {
        ...samDebugConfiguration,
        type: 'not-aws-sam',
    },
    {
        ...samDebugConfiguration,
        request: 'invalid-request',
    },
]

const templateUri = vscode.Uri.file('/')

describe('LaunchConfiguration', () => {
    let mockConfigSource: DebugConfigurationSource
    let mockSamValidator: AwsSamDebugConfigurationValidator

    beforeEach(() => {
        mockConfigSource = mock()
        mockSamValidator = mock()

        when(mockConfigSource.getDebugConfigurations()).thenReturn(debugConfigurations)
        when(mockSamValidator.isValidSamDebugConfiguration(deepEqual(samDebugConfiguration))).thenReturn(true)
    })

    it('gets debug configurations', () => {
        const launchConfig = new LaunchConfiguration(
            templateUri,
            instance(mockConfigSource),
            instance(mockSamValidator)
        )
        assert.deepStrictEqual(launchConfig.getDebugConfigurations(), debugConfigurations)
    })

    it('gets sam debug configurations', () => {
        const launchConfig = new LaunchConfiguration(
            templateUri,
            instance(mockConfigSource),
            instance(mockSamValidator)
        )
        assert.deepStrictEqual(launchConfig.getSamDebugConfigurations(), [samDebugConfiguration])
    })

    it('adds debug configurations', async () => {
        const launchConfig = new LaunchConfiguration(
            templateUri,
            instance(mockConfigSource),
            instance(mockSamValidator)
        )
        await launchConfig.addDebugConfiguration(samDebugConfiguration)

        const expected = [samDebugConfiguration, ...debugConfigurations]
        verify(mockConfigSource.setDebugConfigurations(deepEqual(expected))).once()
    })
})
