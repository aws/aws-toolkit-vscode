/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { samImageLambdaRuntimes, samZipLambdaRuntimes } from '../../../lambda/models/samLambdaRuntime'
import * as CloudFormation from '../../cloudformation/cloudformation'
import { localize, replaceVscodeVars } from '../../utilities/vsCodeUtils'
import {
    awsSamDebugRequestTypes,
    awsSamDebugTargetTypes,
    AwsSamDebuggerConfiguration,
    CODE_TARGET_TYPE,
    TemplateTargetProperties,
    TEMPLATE_TARGET_TYPE,
    API_TARGET_TYPE,
} from './awsSamDebugConfiguration'
import { tryGetAbsolutePath } from '../../utilities/workspaceUtils'
import { CloudFormationTemplateRegistry } from '../../fs/templateRegistry'

export interface ValidationResult {
    isValid: boolean
    message?: string
}

export interface AwsSamDebugConfigurationValidator {
    validate(config: AwsSamDebuggerConfiguration, registry: CloudFormationTemplateRegistry): Promise<ValidationResult>
}

export class DefaultAwsSamDebugConfigurationValidator implements AwsSamDebugConfigurationValidator {
    public constructor(private readonly workspaceFolder: vscode.WorkspaceFolder | undefined) {}

    /**
     * Validates debug configuration properties.
     */
    public async validate(
        config: AwsSamDebuggerConfiguration,
        registry: CloudFormationTemplateRegistry,
        resolveVars?: boolean
    ): Promise<ValidationResult> {
        let rv: ValidationResult = { isValid: false, message: undefined }
        if (resolveVars) {
            config = doTraverseAndReplace(config, this.workspaceFolder?.uri.fsPath ?? '')
        }
        if (!config.request) {
            rv.message = localize(
                'AWS.sam.debugger.missingField',
                'Missing required field "{0}" in debug config',
                'request'
            )
        } else if (!awsSamDebugRequestTypes.includes(config.request)) {
            rv.message = localize(
                'AWS.sam.debugger.invalidRequest',
                'Debug Configuration has an unsupported request type. Supported types: {0}',
                awsSamDebugRequestTypes.join(', ')
            )
        } else if (!awsSamDebugTargetTypes.includes(config.invokeTarget.target)) {
            rv.message = localize(
                'AWS.sam.debugger.invalidTarget',
                'Debug Configuration has an unsupported target type. Supported types: {0}',
                awsSamDebugTargetTypes.join(', ')
            )
        } else if (
            config.invokeTarget.target === TEMPLATE_TARGET_TYPE ||
            config.invokeTarget.target === API_TARGET_TYPE
        ) {
            let cfnTemplate: CloudFormation.Template | undefined
            if (config.invokeTarget.templatePath) {
                // TODO: why wasn't ${workspaceFolder} resolved before now?
                const resolvedPath = replaceVscodeVars(
                    config.invokeTarget.templatePath,
                    this.workspaceFolder?.uri.fsPath
                )
                // Normalize to absolute path for use in the runner.
                const fullpath = tryGetAbsolutePath(this.workspaceFolder, resolvedPath)
                config.invokeTarget.templatePath = fullpath
                // Forcefully add to the registry in case the registry scan somehow missed the file. #2614
                // If the user (launch config) gave an explicit path we should always "find" it.
                const uri = vscode.Uri.file(fullpath)
                cfnTemplate = (await registry.addItem(uri, true))?.item
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

        const resource = resources?.[templateTarget.logicalId]

        if (!resource) {
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

        if (![CloudFormation.SERVERLESS_FUNCTION_TYPE, CloudFormation.LAMBDA_FUNCTION_TYPE].includes(resource.Type)) {
            return {
                isValid: false,
                message: localize(
                    'AWS.sam.debugger.resourceNotAFunction',
                    'Template Resource {0} in Template file {1} must be of type {2} or {3}',
                    templateTarget.logicalId,
                    templateTarget.templatePath,
                    CloudFormation.SERVERLESS_FUNCTION_TYPE,
                    CloudFormation.LAMBDA_FUNCTION_TYPE
                ),
            }
        }

        if (CloudFormation.isImageLambdaResource(resource?.Properties)) {
            // SAM also checks that Metadata.DockerContext and Metadata.Dockerfile exists
            if (!resource?.Metadata?.DockerContext || !resource?.Metadata?.Dockerfile) {
                return {
                    isValid: false,
                    message: localize(
                        'AWS.sam.debugger.missingSamMetadata',
                        'The Metadata section for Template Resource {0} in Template file {1} is not defined',
                        templateTarget.logicalId,
                        templateTarget.templatePath
                    ),
                }
            }
            // can't infer the runtime for image-based lambdas
            if (!config.lambda?.runtime || !samImageLambdaRuntimes().has(config.lambda.runtime)) {
                return {
                    isValid: false,
                    message: localize(
                        'AWS.sam.debugger.missingRuntimeForImage',
                        'Run configurations for Image-based Lambdas require a valid Lambda runtime value, expected one of [{0}]',
                        Array.from(samImageLambdaRuntimes()).join(', ')
                    ),
                }
            }
        } else {
            // TODO: Decide what to do with this re: refs.
            // As of now, this has to be directly declared without a ref, despite the fact that SAM will handle a ref.
            // Should we just pass validation off to SAM and ignore validation at this point, or should we directly process the value (like the handler)?
            const runtime = CloudFormation.getStringForProperty(resource?.Properties, 'Runtime', cfnTemplate)
            if (!runtime || !samZipLambdaRuntimes.has(runtime)) {
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
        }

        const templateEnv = resource?.Properties?.Environment
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
        if (!debugConfiguration.lambda?.runtime || !samZipLambdaRuntimes.has(debugConfiguration.lambda.runtime)) {
            return {
                isValid: false,
                message: localize(
                    'AWS.sam.debugger.missingRuntime',
                    'Debug Configurations with an invoke target of "{0}" require a valid Lambda runtime value, expected one of [{1}]',
                    CODE_TARGET_TYPE,
                    Array.from(samZipLambdaRuntimes).join(', ')
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

/**
 * Resolves the `${workspaceFolder}` variable with the workspace folder.
 * Unsure if any of the other variables are valuable for `aws-sam` configs at this time.
 * @param folder
 * @param config
 * @returns resolved config
 */
export function resolveWorkspaceFolderVariable(
    folder: vscode.WorkspaceFolder | undefined,
    config: AwsSamDebuggerConfiguration
): AwsSamDebuggerConfiguration {
    return doTraverseAndReplace(config, folder?.uri.fsPath)
}

function doTraverseAndReplace(object: { [key: string]: any }, fspath: string | undefined): any {
    const wsfRegex = /^(.*)(\$\{workspaceFolder\})(.*)$/g
    if (!vscode.workspace.workspaceFolders && !fspath) {
        throw new Error('No workspace folders available; cannot resolve workspaceFolder variable.')
    }
    const keys = Object.keys(object)
    const final = JSON.parse(JSON.stringify(object))
    for (const key of keys) {
        const val = object[key]
        if (typeof val === 'string') {
            const result = wsfRegex.exec(val)
            if (result) {
                if (!fspath) {
                    for (const wsf of vscode.workspace.workspaceFolders!) {
                        if (fs.existsSync(path.join(result[1], wsf.uri.fsPath, result[3]))) {
                            fspath = wsf.uri.fsPath
                            break
                        }
                    }
                }
                if (!fspath) {
                    throw new Error(`No compatible workspace folders for path: ${val}`)
                }
                final[key] = path.join(result[1], fspath, result[3])
            }
        } else if (typeof val === 'object') {
            final[key] = doTraverseAndReplace(val, fspath)
        }
    }

    return final
}
