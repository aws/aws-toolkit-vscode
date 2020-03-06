/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

import { samLambdaRuntimes } from '../../../lambda/models/samLambdaRuntime'
import { CloudFormation } from '../../cloudformation/cloudformation'
import { CloudFormationTemplateRegistry } from '../../cloudformation/templateRegistry'
import { AwsSamDebuggerConfiguration, AwsSamDebuggerInvokeTargetTemplateFields } from './awsSamDebugConfiguration'

export const AWS_SAM_DEBUG_TYPE = 'aws-sam'
const AWS_SAM_DEBUG_REQUEST_TYPES = new Set<string>(['direct-invoke'])
const AWS_SAM_DEBUG_TARGET_TYPES = new Set<string>(['template', 'code'])

export class AwsSamDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
    public constructor() {}

    public async provideDebugConfigurations(
        folder: vscode.WorkspaceFolder | undefined,
        token?: vscode.CancellationToken
    ): Promise<AwsSamDebuggerConfiguration[] | undefined> {
        return undefined
    }

    public async resolveDebugConfiguration(
        folder: vscode.WorkspaceFolder | undefined,
        debugConfiguration: AwsSamDebuggerConfiguration,
        token?: vscode.CancellationToken
    ): Promise<AwsSamDebuggerConfiguration | undefined> {
        if (!AWS_SAM_DEBUG_REQUEST_TYPES.has(debugConfiguration.request)) {
            vscode.window.showErrorMessage('Invalid request type')

            return undefined
        }

        if (!AWS_SAM_DEBUG_TARGET_TYPES.has(debugConfiguration.invokeTarget.target)) {
            vscode.window.showErrorMessage('Invalid invokeTarget.target type')

            return undefined
        }

        if (debugConfiguration.invokeTarget.target === 'template') {
            if (!isTemplateDebugConfigValid(debugConfiguration)) {
                return undefined
            }
        } else if (debugConfiguration.invokeTarget.target === 'code') {
            if (
                !debugConfiguration.lambda ||
                !debugConfiguration.lambda.runtime ||
                !samLambdaRuntimes.has(debugConfiguration.lambda.runtime)
            ) {
                vscode.window.showErrorMessage(
                    'Debug config of invokeTarget.target: code must have a valid lambda.runtime'
                )

                return undefined
            }
        }

        vscode.window.showInformationMessage('Not implemented')

        return debugConfiguration
    }
}

function isTemplateDebugConfigValid(debugConfiguration: AwsSamDebuggerConfiguration): boolean {
    const templateTarget = (debugConfiguration.invokeTarget as any) as AwsSamDebuggerInvokeTargetTemplateFields
    const cftRegistry = CloudFormationTemplateRegistry.getRegistry()

    const template = cftRegistry.getRegisteredTemplate(templateTarget.samTemplatePath)

    if (!template) {
        vscode.window.showErrorMessage('invokeTarget.target.samTemplatePath not found')

        return false
    }

    if (
        !template.template.Resources ||
        !Object.keys(template.template.Resources).includes(templateTarget.samTemplateResource)
    ) {
        vscode.window.showErrorMessage('invokeTarget.target.samTemplateResource not found in template')

        return false
    }

    if (
        template.template.Resources[templateTarget.samTemplateResource]?.Type !==
        CloudFormation.SERVERLESS_FUNCTION_TYPE
    ) {
        vscode.window.showErrorMessage('invokeTarget.target.samTemplateResource is not a serverless function')

        return false
    }

    if (
        !template.template.Resources[templateTarget.samTemplateResource]?.Properties?.Runtime ||
        !samLambdaRuntimes.has(
            template.template.Resources[templateTarget.samTemplateResource]?.Properties?.Runtime as string
        )
    ) {
        vscode.window.showErrorMessage(
            'Resource referenced by invokeTarget.target.samTemplateResource is using an invalid runtime in its template'
        )

        return false
    }

    const templateEnv = template.template.Resources[templateTarget.samTemplateResource]?.Properties.Environment
    if (templateEnv && templateEnv.Variables) {
        const templateEnvVars = Object.keys(templateEnv.Variables)
        const missingVars: string[] = []
        if (debugConfiguration.lambda && debugConfiguration.lambda.environmentVariables) {
            for (const key of Object.keys(debugConfiguration.lambda.environmentVariables)) {
                if (!templateEnvVars.includes(key)) {
                    missingVars.push(key)
                }
            }
        }
        if (missingVars.length > 0) {
            vscode.window.showInformationMessage(
                `The following environment variables are not found in the targeted template and will not be overridden: ${missingVars.toString()}`
            )
        }
    }

    return true
}
