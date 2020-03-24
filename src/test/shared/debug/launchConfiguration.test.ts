/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { deepEqual, instance, mock, when, verify } from 'ts-mockito'
import * as vscode from 'vscode'
import { DebugConfigurationSource, LaunchConfiguration } from '../../../shared/debug/launchConfiguration'
import { AwsSamDebuggerConfiguration } from '../../../shared/sam/debugger/awsSamDebugConfiguration'

const samDebugConfiguration: AwsSamDebuggerConfiguration = {
    type: 'aws-sam',
    name: 'name',
    request: 'request',
    invokeTarget: {
        target: 'target',
        samTemplatePath: '/',
        samTemplateResource: 'resource'
    }
}

const debugConfigurations: vscode.DebugConfiguration[] = [
    samDebugConfiguration,
    {
        type: 'not-aws-sam',
        name: 'name',
        request: 'request'
    }
]

const TEMPLATE_URI = vscode.Uri.file('/')

describe('LaunchConfiguration', () => {
    let mockConfigSource: DebugConfigurationSource

    beforeEach(() => {
        mockConfigSource = mock()

        when(mockConfigSource.getDebugConfigurations()).thenReturn(debugConfigurations)
    })

    it('gets debug configurations', () => {
        const launchConfig = new LaunchConfiguration(TEMPLATE_URI, instance(mockConfigSource))
        assert.deepStrictEqual(launchConfig.getDebugConfigurations(), debugConfigurations)
    })

    it('gets sam debug configurations', () => {
        const launchConfig = new LaunchConfiguration(TEMPLATE_URI, instance(mockConfigSource))
        assert.deepStrictEqual(launchConfig.getSamDebugConfigurations(), [samDebugConfiguration])
    })

    it('adds debug configurations', async () => {
        const launchConfig = new LaunchConfiguration(TEMPLATE_URI, instance(mockConfigSource))
        await launchConfig.addDebugConfiguration(samDebugConfiguration)

        const expected = [samDebugConfiguration, ...debugConfigurations]
        verify(mockConfigSource.updateDebugConfigurations(deepEqual(expected))).once()
    })
})
