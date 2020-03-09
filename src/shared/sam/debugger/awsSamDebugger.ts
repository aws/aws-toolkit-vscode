/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { samLambdaRuntimes } from '../../../lambda/models/samLambdaRuntime'
import { CloudFormation } from '../../cloudformation/cloudformation'
import { CloudFormationTemplateRegistry } from '../../cloudformation/templateRegistry'
import { AwsSamDebuggerConfiguration, AwsSamDebuggerInvokeTargetTemplateFields } from './awsSamDebugConfiguration'

export const AWS_SAM_DEBUG_TYPE = 'aws-sam'
const DIRECT_INVOKE_TYPE = 'direct-invoke'
const TEMPLATE_TARGET_TYPE = 'template'
const CODE_TARGET_TYPE = 'code'

const AWS_SAM_DEBUG_REQUEST_TYPES = [DIRECT_INVOKE_TYPE]
const AWS_SAM_DEBUG_TARGET_TYPES = [TEMPLATE_TARGET_TYPE, CODE_TARGET_TYPE]

export class AwsSamDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
    public constructor(private readonly cftRegistry = CloudFormationTemplateRegistry.getRegistry()) {}

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
        let invalidMessage: string | undefined

        if (!AWS_SAM_DEBUG_REQUEST_TYPES.includes(debugConfiguration.request)) {
            invalidMessage = localize(
                'AWS.sam.debugger.invalidRequest',
                'Debug Configuration has an unsupported request type. Supported types: {0}',
                AWS_SAM_DEBUG_REQUEST_TYPES.join(', ')
            )
        }

        if (!AWS_SAM_DEBUG_TARGET_TYPES.includes(debugConfiguration.invokeTarget.target)) {
            invalidMessage = localize(
                'AWS.sam.debugger.invalidTarget',
                'Debug Configuration has an unsupported target type. Supported types: {0}',
                AWS_SAM_DEBUG_TARGET_TYPES.join(', ')
            )
        }

        if (!invalidMessage) {
            if (debugConfiguration.invokeTarget.target === TEMPLATE_TARGET_TYPE) {
                invalidMessage = isTemplateDebugConfigValid(debugConfiguration, this.cftRegistry)
            } else if (debugConfiguration.invokeTarget.target === CODE_TARGET_TYPE) {
                if (!debugConfiguration.lambda?.runtime || !samLambdaRuntimes.has(debugConfiguration.lambda.runtime)) {
                    invalidMessage = localize(
                        'AWS.sam.debugger.missingRuntime',
                        'Debug Configurations with an invoke target of "{0}" require a valid Lambda runtime value',
                        CODE_TARGET_TYPE
                    )
                }
            }
        }

        if (invalidMessage) {
            vscode.window.showErrorMessage(invalidMessage)

            return undefined
        }

        vscode.window.showInformationMessage(localize('AWS.sam.debugger.notImplemented', 'Not implemented'))

        return undefined
    }
}

function isTemplateDebugConfigValid(
    debugConfiguration: AwsSamDebuggerConfiguration,
    cftRegistry: CloudFormationTemplateRegistry
): string | undefined {
    const templateTarget = (debugConfiguration.invokeTarget as any) as AwsSamDebuggerInvokeTargetTemplateFields

    const template = cftRegistry.getRegisteredTemplate(templateTarget.samTemplatePath)

    if (!template) {
        return localize(
            'AWS.sam.debugger.missingTemplate',
            'Unable to find the Template file {0}',
            templateTarget.samTemplatePath
        )
    }

    const resources = template.template.Resources

    if (!resources || !Object.keys(resources).includes(templateTarget.samTemplateResource)) {
        return localize(
            'AWS.sam.debugger.missingResource',
            'Unable to find the Template Resource {0} in Template file {1}',
            templateTarget.samTemplateResource,
            templateTarget.samTemplatePath
        )
    }

    const resource = resources[templateTarget.samTemplateResource]

    // TODO: Validate against `AWS::Lambda::Function`?
    if (resource?.Type !== CloudFormation.SERVERLESS_FUNCTION_TYPE) {
        return localize(
            'AWS.sam.debugger.resourceNotAFunction',
            'Template Resource {0} in Template file {1} needs to be of type {2}',
            templateTarget.samTemplateResource,
            templateTarget.samTemplatePath,
            CloudFormation.SERVERLESS_FUNCTION_TYPE
        )
    }

    if (!resource?.Properties?.Runtime || !samLambdaRuntimes.has(resource?.Properties?.Runtime as string)) {
        return localize(
            'AWS.sam.debugger.unsupportedRuntime',
            'Runtime for Template Resource {0} in Template file {1} is either undefined or unsupported.',
            templateTarget.samTemplateResource,
            templateTarget.samTemplatePath
        )
    }

    const templateEnv = resource?.Properties.Environment
    if (templateEnv?.Variables) {
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
            // this check doesn't affect template validity.
            vscode.window.showInformationMessage(
                localize(
                    'AWS.sam.debugger.extraEnvVars',
                    'The following environment variables are not found in the targeted template and will not be overridden: {0}',
                    missingVars.join(', ')
                )
            )
        }
    }
}
