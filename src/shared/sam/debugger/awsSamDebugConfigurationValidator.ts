/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as fs from 'fs'
import { samLambdaRuntimes } from '../../../lambda/models/samLambdaRuntime'
import { CloudFormation } from '../../cloudformation/cloudformation'
import { localize } from '../../utilities/vsCodeUtils'
import {
    AWS_SAM_DEBUG_REQUEST_TYPES,
    AWS_SAM_DEBUG_TARGET_TYPES,
    AwsSamDebuggerConfiguration,
    CODE_TARGET_TYPE,
    TemplateTargetProperties,
    TEMPLATE_TARGET_TYPE,
    API_TARGET_TYPE,
} from './awsSamDebugConfiguration'
import { tryGetAbsolutePath } from '../../utilities/workspaceUtils'
import { ext } from '../../extensionGlobals'

export interface ValidationResult {
    isValid: boolean
    message?: string
}

export interface AwsSamDebugConfigurationValidator {
    validate(config: AwsSamDebuggerConfiguration): ValidationResult
}

export class DefaultAwsSamDebugConfigurationValidator implements AwsSamDebugConfigurationValidator {
    public constructor(private readonly workspaceFolder: vscode.WorkspaceFolder | undefined) {}

    /**
     * Validates debug configuration properties.
     */
    public validate(config: AwsSamDebuggerConfiguration): ValidationResult {
        let rv: ValidationResult = { isValid: false, message: undefined }
        if (!config.request) {
            rv.message = localize(
                'AWS.sam.debugger.missingField',
                'Missing required field "{0}" in debug config',
                'request'
            )
        } else if (!AWS_SAM_DEBUG_REQUEST_TYPES.includes(config.request)) {
            rv.message = localize(
                'AWS.sam.debugger.invalidRequest',
                'Debug Configuration has an unsupported request type. Supported types: {0}',
                AWS_SAM_DEBUG_REQUEST_TYPES.join(', ')
            )
        } else if (!AWS_SAM_DEBUG_TARGET_TYPES.includes(config.invokeTarget.target)) {
            rv.message = localize(
                'AWS.sam.debugger.invalidTarget',
                'Debug Configuration has an unsupported target type. Supported types: {0}',
                AWS_SAM_DEBUG_TARGET_TYPES.join(', ')
            )
        } else if (
            config.invokeTarget.target === TEMPLATE_TARGET_TYPE ||
            config.invokeTarget.target === API_TARGET_TYPE
        ) {
            let cfnTemplate
            if (config.invokeTarget.templatePath) {
                const fullpath = tryGetAbsolutePath(this.workspaceFolder, config.invokeTarget.templatePath)
                // Normalize to absolute path for use in the runner.
                config.invokeTarget.templatePath = fullpath
                cfnTemplate = ext.templateRegistry.getRegisteredItem(fullpath)?.item
            }
            rv = this.validateTemplateConfig(config, config.invokeTarget.templatePath, cfnTemplate)
        } else if (config.invokeTarget.target === CODE_TARGET_TYPE) {
            rv = this.validateCodeConfig(config)
        }

        // Validate additional properties of API target type
        if (rv.isValid && config.invokeTarget.target === API_TARGET_TYPE) {
            rv = this.validateApiConfig(config)
        }

        if (rv.isValid) {
            rv = this.validateLambda(config)
        }

        if (!rv.isValid && !rv.message) {
            // Missing message, should never happen.
            throw Error(`invalid debug-config: ${rv.message}`)
        }

        return rv
    }

    private validateTemplateConfig(
        config: AwsSamDebuggerConfiguration,
        cfnTemplatePath: string | undefined,
        cfnTemplate: CloudFormation.Template | undefined
    ): ValidationResult {
        const templateTarget = config.invokeTarget as TemplateTargetProperties

        if (!cfnTemplatePath) {
            return {
                isValid: false,
                message: localize(
                    'AWS.sam.debugger.missingField',
                    'Missing required field "{0}" in debug config',
                    'templatePath'
                ),
            }
        }

        if (!cfnTemplate) {
            return {
                isValid: false,
                message: localize(
                    'AWS.sam.debugger.missingTemplate',
                    'Invalid (or missing) template file (path must be workspace-relative, or absolute): {0}',
                    templateTarget.templatePath
                ),
            }
        }

        const resources = cfnTemplate.Resources
        if (!templateTarget.logicalId) {
            return {
                isValid: false,
                message: localize(
                    'AWS.sam.debugger.missingField',
                    'Missing required field "{0}" in debug config',
                    'logicalId'
                ),
            }
        }

        if (!resources || !Object.keys(resources).includes(templateTarget.logicalId)) {
            return {
                isValid: false,
                message: localize(
                    'AWS.sam.debugger.missingResource',
                    'Cannot find the template resource "{0}" in template file: {1}',
                    templateTarget.logicalId,
                    templateTarget.templatePath
                ),
            }
        }

        const resource = resources[templateTarget.logicalId]

        if (resource?.Type !== CloudFormation.SERVERLESS_FUNCTION_TYPE) {
            return {
                isValid: false,
                message: localize(
                    'AWS.sam.debugger.resourceNotAFunction',
                    'Template Resource {0} in Template file {1} needs to be of type {2} or {3}',
                    templateTarget.logicalId,
                    templateTarget.templatePath,
                    CloudFormation.SERVERLESS_FUNCTION_TYPE,
                    CloudFormation.LAMBDA_FUNCTION_TYPE
                ),
            }
        }

        // TODO: Decide what to do with this re: refs.
        // As of now, this has to be directly declared without a ref, despite the fact that SAM will handle a ref.
        // Should we just pass validation off to SAM and ignore validation at this point, or should we directly process the value (like the handler)?
        if (!resource?.Properties?.Runtime || !samLambdaRuntimes.has(resource?.Properties?.Runtime as string)) {
            return {
                isValid: false,
                message: localize(
                    'AWS.sam.debugger.unsupportedRuntime',
                    'Runtime for Template Resource {0} in Template file {1} is either undefined or unsupported.',
                    templateTarget.logicalId,
                    templateTarget.templatePath
                ),
            }
        }

        const templateEnv = resource?.Properties.Environment
        if (templateEnv?.Variables) {
            const templateEnvVars = Object.keys(templateEnv.Variables)
            const missingVars: string[] = []
            if (config.lambda && config.lambda.environmentVariables) {
                for (const key of Object.keys(config.lambda.environmentVariables)) {
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

    private validateApiConfig(debugConfiguration: AwsSamDebuggerConfiguration): ValidationResult {
        if (!debugConfiguration.api) {
            return {
                isValid: false,
                message: localize(
                    'AWS.sam.debugger.missingField',
                    'Missing required field "{0}" in debug config',
                    'api'
                ),
            }
        } else if (!debugConfiguration.api.path.startsWith('/')) {
            return {
                isValid: false,
                message: localize('AWS.sam.debugger.missingSlash', "Path must start with a '/'"),
            }
        }
        return { isValid: true }
    }
    private validateCodeConfig(debugConfiguration: AwsSamDebuggerConfiguration): ValidationResult {
        if (!debugConfiguration.lambda?.runtime || !samLambdaRuntimes.has(debugConfiguration.lambda.runtime)) {
            return {
                isValid: false,
                message: localize(
                    'AWS.sam.debugger.missingRuntime',
                    'Debug Configurations with an invoke target of "{0}" require a valid Lambda runtime value, expected one of [{1}]',
                    CODE_TARGET_TYPE,
                    Array.from(samLambdaRuntimes).join(', ')
                ),
            }
        }

        return { isValid: true }
    }

    private validateLambda(config: AwsSamDebuggerConfiguration): ValidationResult {
        if (config.lambda?.payload?.path) {
            const fullpath = tryGetAbsolutePath(this.workspaceFolder, config.lambda?.payload?.path)
            if (!fs.existsSync(fullpath)) {
                return {
                    isValid: false,
                    message: localize(
                        'AWS.sam.debugger.missingRuntime',
                        'Payload file not found: "{0}"',
                        config.lambda?.payload?.path
                    ),
                }
            }
        }

        return { isValid: true }
    }
}
