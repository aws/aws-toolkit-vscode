/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { samLambdaRuntimes } from '../../../lambda/models/samLambdaRuntime'
import { CloudFormation } from '../../cloudformation/cloudformation'
import { CloudFormationTemplateRegistry } from '../../cloudformation/templateRegistry'
import { localize } from '../../utilities/vsCodeUtils'
import {
    AWS_SAM_DEBUG_REQUEST_TYPES,
    AWS_SAM_DEBUG_TARGET_TYPES,
    AwsSamDebuggerConfiguration,
    CODE_TARGET_TYPE,
    isCodeTargetProperties,
    isTemplateTargetProperties,
    TemplateTargetProperties,
} from './awsSamDebugConfiguration'

export interface ValidationResult {
    isValid: boolean
    message?: string
}

export interface AwsSamDebugConfigurationValidator {
    validateSamDebugConfiguration(debugConfiguration: AwsSamDebuggerConfiguration): ValidationResult
    isValidSamDebugConfiguration(debugConfiguration: AwsSamDebuggerConfiguration): boolean
}

export class DefaultAwsSamDebugConfigurationValidator implements AwsSamDebugConfigurationValidator {
    public constructor(private readonly cftRegistry = CloudFormationTemplateRegistry.getRegistry()) {}

    public validateSamDebugConfiguration(debugConfiguration: AwsSamDebuggerConfiguration): ValidationResult {
        const generalValidationResult = this.generalDebugConfigValidation(debugConfiguration)
        if (!generalValidationResult.isValid) {
            return generalValidationResult
        }

        if (isTemplateTargetProperties(debugConfiguration.invokeTarget)) {
            return this.templateDebugConfigValidation(debugConfiguration, this.cftRegistry)
        } else if (isCodeTargetProperties(debugConfiguration.invokeTarget)) {
            return this.codeDebugConfigValidation(debugConfiguration)
        }

        return { isValid: false, message: localize('AWS.generic.notImplemented', 'Not implemented') }
    }

    public isValidSamDebugConfiguration(debugConfiguration: AwsSamDebuggerConfiguration): boolean {
        return this.validateSamDebugConfiguration(debugConfiguration).isValid
    }

    private generalDebugConfigValidation(debugConfiguration: AwsSamDebuggerConfiguration): ValidationResult {
        if (!AWS_SAM_DEBUG_REQUEST_TYPES.includes(debugConfiguration.request)) {
            return {
                isValid: false,
                message: localize(
                    'AWS.sam.debugger.invalidRequest',
                    'Debug Configuration has an unsupported request type. Supported types: {0}',
                    AWS_SAM_DEBUG_REQUEST_TYPES.join(', ')
                ),
            }
        }

        if (!AWS_SAM_DEBUG_TARGET_TYPES.includes(debugConfiguration.invokeTarget.target)) {
            return {
                isValid: false,
                message: localize(
                    'AWS.sam.debugger.invalidTarget',
                    'Debug Configuration has an unsupported target type. Supported types: {0}',
                    AWS_SAM_DEBUG_TARGET_TYPES.join(', ')
                ),
            }
        }

        return { isValid: true }
    }

    private templateDebugConfigValidation(
        debugConfiguration: AwsSamDebuggerConfiguration,
        cftRegistry: CloudFormationTemplateRegistry
    ): ValidationResult {
        const templateTarget = debugConfiguration.invokeTarget as TemplateTargetProperties

        const template = cftRegistry.getRegisteredTemplate(templateTarget.samTemplatePath)

        if (!template) {
            return {
                isValid: false,
                message: localize(
                    'AWS.sam.debugger.missingTemplate',
                    'Unable to find the Template file {0}',
                    templateTarget.samTemplatePath
                ),
            }
        }

        const resources = template.template.Resources

        if (!resources || !Object.keys(resources).includes(templateTarget.samTemplateResource)) {
            return {
                isValid: false,
                message: localize(
                    'AWS.sam.debugger.missingResource',
                    'Unable to find the Template Resource {0} in Template file {1}',
                    templateTarget.samTemplateResource,
                    templateTarget.samTemplatePath
                ),
            }
        }

        const resource = resources[templateTarget.samTemplateResource]

        // TODO: Validate against `AWS::Lambda::Function`?
        if (resource?.Type !== CloudFormation.SERVERLESS_FUNCTION_TYPE) {
            return {
                isValid: false,
                message: localize(
                    'AWS.sam.debugger.resourceNotAFunction',
                    'Template Resource {0} in Template file {1} needs to be of type {2}',
                    templateTarget.samTemplateResource,
                    templateTarget.samTemplatePath,
                    CloudFormation.SERVERLESS_FUNCTION_TYPE
                ),
            }
        }

        if (!resource?.Properties?.Runtime || !samLambdaRuntimes.has(resource?.Properties?.Runtime as string)) {
            return {
                isValid: false,
                message: localize(
                    'AWS.sam.debugger.unsupportedRuntime',
                    'Runtime for Template Resource {0} in Template file {1} is either undefined or unsupported.',
                    templateTarget.samTemplateResource,
                    templateTarget.samTemplatePath
                ),
            }
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
                return {
                    isValid: true,
                    message: localize(
                        'AWS.sam.debugger.extraEnvVars',
                        'The following environment variables are not found in the targeted template and will not be overridden: {0}',
                        missingVars.join(', ')
                    ),
                }
            }
        }

        return { isValid: true }
    }

    private codeDebugConfigValidation(debugConfiguration: AwsSamDebuggerConfiguration): ValidationResult {
        if (!debugConfiguration.lambda?.runtime || !samLambdaRuntimes.has(debugConfiguration.lambda.runtime)) {
            return {
                isValid: false,
                message: localize(
                    'AWS.sam.debugger.missingRuntime',
                    'Debug Configurations with an invoke target of "{0}" require a valid Lambda runtime value',
                    CODE_TARGET_TYPE
                ),
            }
        }

        return { isValid: true }
    }
}
