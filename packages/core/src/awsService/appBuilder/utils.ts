/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { TreeNode } from '../../shared/treeview/resourceTreeDataProvider'
import * as nls from 'vscode-nls'
import { ResourceNode } from './explorer/nodes/resourceNode'
import type { SamAppLocation } from './explorer/samProject'
import { ToolkitError } from '../../shared/errors'
import globals from '../../shared/extensionGlobals'
import { OpenTemplateParams, OpenTemplateWizard } from './explorer/openTemplate'
import { DataQuickPickItem, createQuickPick } from '../../shared/ui/pickerPrompter'
import { createCommonButtons } from '../../shared/ui/buttons'
import { samDeployUrl } from '../../shared/constants'
import path from 'path'
import fs from '../../shared/fs/fs'
import { getLogger } from '../../shared/logger/logger'
import { RuntimeFamily, getFamily } from '../../lambda/models/samLambdaRuntime'
import { showMessage } from '../../shared/utilities/messages'
import { DefaultLambdaClient } from '../../shared/clients/lambdaClient'
import AdmZip from 'adm-zip'
import { CloudFormation, Lambda } from 'aws-sdk'
import { isAwsError, UnknownError } from '../../shared/errors'
const localize = nls.loadMessageBundle()

/**
 * Interface for mapping AWS service actions to their required permissions
 */
interface PermissionMapping {
    service: 'cloudformation' | 'lambda'
    action: string
    requiredPermissions: string[]
    documentation?: string
}

/**
 * Comprehensive mapping of AWS service actions to their required permissions
 */
const PermissionMappings: PermissionMapping[] = [
    // CloudFormation permissions
    {
        service: 'cloudformation',
        action: 'describeStacks',
        requiredPermissions: ['cloudformation:DescribeStacks'],
        documentation: 'https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_DescribeStacks.html',
    },
    {
        service: 'cloudformation',
        action: 'getTemplate',
        requiredPermissions: ['cloudformation:GetTemplate'],
        documentation: 'https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_GetTemplate.html',
    },
    {
        service: 'cloudformation',
        action: 'createChangeSet',
        requiredPermissions: ['cloudformation:CreateChangeSet'],
        documentation: 'https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_CreateChangeSet.html',
    },
    {
        service: 'cloudformation',
        action: 'executeChangeSet',
        requiredPermissions: ['cloudformation:ExecuteChangeSet'],
        documentation: 'https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_ExecuteChangeSet.html',
    },
    {
        service: 'cloudformation',
        action: 'describeChangeSet',
        requiredPermissions: ['cloudformation:DescribeChangeSet'],
        documentation: 'https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_DescribeChangeSet.html',
    },
    {
        service: 'cloudformation',
        action: 'describeStackResources',
        requiredPermissions: ['cloudformation:DescribeStackResources'],
        documentation:
            'https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_DescribeStackResources.html',
    },
    {
        service: 'cloudformation',
        action: 'describeStackResource',
        requiredPermissions: ['cloudformation:DescribeStackResource'],
        documentation:
            'https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_DescribeStackResource.html',
    },
    {
        service: 'cloudformation',
        action: 'getGeneratedTemplate',
        requiredPermissions: ['cloudformation:GetGeneratedTemplate'],
        documentation:
            'https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_GetGeneratedTemplate.html',
    },
    {
        service: 'cloudformation',
        action: 'describeGeneratedTemplate',
        requiredPermissions: ['cloudformation:DescribeGeneratedTemplate'],
        documentation:
            'https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_DescribeGeneratedTemplate.html',
    },
    // Lambda permissions
    {
        service: 'lambda',
        action: 'getFunction',
        requiredPermissions: ['lambda:GetFunction'],
        documentation: 'https://docs.aws.amazon.com/lambda/latest/api/API_GetFunction.html',
    },
    {
        service: 'lambda',
        action: 'listFunctions',
        requiredPermissions: ['lambda:ListFunctions'],
        documentation: 'https://docs.aws.amazon.com/lambda/latest/api/API_ListFunctions.html',
    },
    {
        service: 'lambda',
        action: 'getLayerVersion',
        requiredPermissions: ['lambda:GetLayerVersion'],
        documentation: 'https://docs.aws.amazon.com/lambda/latest/api/API_GetLayerVersion.html',
    },
    {
        service: 'lambda',
        action: 'listLayerVersions',
        requiredPermissions: ['lambda:ListLayerVersions'],
        documentation: 'https://docs.aws.amazon.com/lambda/latest/api/API_ListLayerVersions.html',
    },
    {
        service: 'lambda',
        action: 'listFunctionUrlConfigs',
        requiredPermissions: ['lambda:GetFunctionUrlConfig'],
        documentation: 'https://docs.aws.amazon.com/lambda/latest/api/API_GetFunctionUrlConfig.html',
    },
    {
        service: 'lambda',
        action: 'updateFunctionCode',
        requiredPermissions: ['lambda:UpdateFunctionCode'],
        documentation: 'https://docs.aws.amazon.com/lambda/latest/api/API_UpdateFunctionCode.html',
    },
    {
        service: 'lambda',
        action: 'deleteFunction',
        requiredPermissions: ['lambda:DeleteFunction'],
        documentation: 'https://docs.aws.amazon.com/lambda/latest/api/API_DeleteFunction.html',
    },
    {
        service: 'lambda',
        action: 'invoke',
        requiredPermissions: ['lambda:InvokeFunction'],
        documentation: 'https://docs.aws.amazon.com/lambda/latest/api/API_Invoke.html',
    },
]

/**
 * Creates an enhanced error message for permission-related failures
 */
function createEnhancedPermissionError(
    originalError: unknown,
    service: 'cloudformation' | 'lambda',
    action: string,
    resourceArn?: string
): ToolkitError {
    const mapping = PermissionMappings.find((m) => m.service === service && m.action === action)

    if (!mapping) {
        return ToolkitError.chain(originalError, `Permission denied for ${service}:${action}`)
    }

    const permissionsList = mapping.requiredPermissions.map((p) => `  - ${p}`).join('\n')
    const resourceInfo = resourceArn ? `\nResource: ${resourceArn}` : ''

    const message = `Permission denied: Missing required permissions for ${service}:${action}

Required permissions:
${permissionsList}${resourceInfo}

To fix this issue:
1. Contact your AWS administrator to add the missing permissions
2. Add these permissions to your IAM user/role policy
3. If using IAM roles, ensure the role has these permissions attached

${mapping.documentation ? `Documentation: ${mapping.documentation}` : ''}`

    return new ToolkitError(message, {
        code: 'InsufficientPermissions',
        cause: UnknownError.cast(originalError),
        details: {
            service,
            action,
            requiredPermissions: mapping.requiredPermissions,
            resourceArn,
        },
    })
}

/**
 * Checks if an error is a permission-related error
 */
export function isPermissionError(error: unknown): boolean {
    return (
        isAwsError(error) &&
        (error.code === 'AccessDeniedException' ||
            error.code === 'UnauthorizedOperation' ||
            error.code === 'Forbidden' ||
            error.code === 'AccessDenied' ||
            (error as any).statusCode === 403)
    )
}

/**
 * Enhanced Lambda client wrapper that provides better error messages for permission issues
 */
export class EnhancedLambdaClient {
    constructor(
        private readonly client: DefaultLambdaClient,
        private readonly regionCode: string
    ) {}

    async deleteFunction(name: string): Promise<void> {
        try {
            return await this.client.deleteFunction(name)
        } catch (error) {
            if (isPermissionError(error)) {
                throw createEnhancedPermissionError(
                    error,
                    'lambda',
                    'deleteFunction',
                    `arn:aws:lambda:${this.regionCode}:*:function:${name}`
                )
            }
            throw error
        }
    }

    async invoke(name: string, payload?: Lambda.InvocationRequest['Payload']): Promise<Lambda.InvocationResponse> {
        try {
            return await this.client.invoke(name, payload)
        } catch (error) {
            if (isPermissionError(error)) {
                throw createEnhancedPermissionError(
                    error,
                    'lambda',
                    'invoke',
                    `arn:aws:lambda:${this.regionCode}:*:function:${name}`
                )
            }
            throw error
        }
    }

    async *listFunctions(): AsyncIterableIterator<Lambda.FunctionConfiguration> {
        try {
            yield* this.client.listFunctions()
        } catch (error) {
            if (isPermissionError(error)) {
                throw createEnhancedPermissionError(error, 'lambda', 'listFunctions')
            }
            throw error
        }
    }

    async getFunction(name: string): Promise<Lambda.GetFunctionResponse> {
        try {
            return await this.client.getFunction(name)
        } catch (error) {
            if (isPermissionError(error)) {
                throw createEnhancedPermissionError(
                    error,
                    'lambda',
                    'getFunction',
                    `arn:aws:lambda:${this.regionCode}:*:function:${name}`
                )
            }
            throw error
        }
    }

    async getLayerVersion(name: string, version: number): Promise<Lambda.GetLayerVersionResponse> {
        try {
            return await this.client.getLayerVersion(name, version)
        } catch (error) {
            if (isPermissionError(error)) {
                throw createEnhancedPermissionError(
                    error,
                    'lambda',
                    'getLayerVersion',
                    `arn:aws:lambda:${this.regionCode}:*:layer:${name}:${version}`
                )
            }
            throw error
        }
    }

    async *listLayerVersions(name: string): AsyncIterableIterator<Lambda.LayerVersionsListItem> {
        try {
            yield* this.client.listLayerVersions(name)
        } catch (error) {
            if (isPermissionError(error)) {
                throw createEnhancedPermissionError(
                    error,
                    'lambda',
                    'listLayerVersions',
                    `arn:aws:lambda:${this.regionCode}:*:layer:${name}`
                )
            }
            throw error
        }
    }

    async getFunctionUrlConfigs(name: string): Promise<Lambda.FunctionUrlConfigList> {
        try {
            return await this.client.getFunctionUrlConfigs(name)
        } catch (error) {
            if (isPermissionError(error)) {
                throw createEnhancedPermissionError(
                    error,
                    'lambda',
                    'listFunctionUrlConfigs',
                    `arn:aws:lambda:${this.regionCode}:*:function:${name}`
                )
            }
            throw error
        }
    }

    async updateFunctionCode(name: string, zipFile: Uint8Array): Promise<Lambda.FunctionConfiguration> {
        try {
            return await this.client.updateFunctionCode(name, zipFile)
        } catch (error) {
            if (isPermissionError(error)) {
                throw createEnhancedPermissionError(
                    error,
                    'lambda',
                    'updateFunctionCode',
                    `arn:aws:lambda:${this.regionCode}:*:function:${name}`
                )
            }
            throw error
        }
    }
}

/**
 * Enhanced CloudFormation client wrapper that provides better error messages for permission issues
 */
export class EnhancedCloudFormationClient {
    constructor(
        private readonly client: CloudFormation,
        private readonly regionCode: string
    ) {}

    async describeStacks(params: CloudFormation.DescribeStacksInput): Promise<CloudFormation.DescribeStacksOutput> {
        try {
            return await this.client.describeStacks(params).promise()
        } catch (error) {
            if (isPermissionError(error)) {
                const stackArn = params.StackName
                    ? `arn:aws:cloudformation:${this.regionCode}:*:stack/${params.StackName}/*`
                    : undefined
                throw createEnhancedPermissionError(error, 'cloudformation', 'describeStacks', stackArn)
            }
            throw error
        }
    }

    async getTemplate(params: CloudFormation.GetTemplateInput): Promise<CloudFormation.GetTemplateOutput> {
        try {
            return await this.client.getTemplate(params).promise()
        } catch (error) {
            if (isPermissionError(error)) {
                const stackArn = params.StackName
                    ? `arn:aws:cloudformation:${this.regionCode}:*:stack/${params.StackName}/*`
                    : undefined
                throw createEnhancedPermissionError(error, 'cloudformation', 'getTemplate', stackArn)
            }
            throw error
        }
    }

    async createChangeSet(params: CloudFormation.CreateChangeSetInput): Promise<CloudFormation.CreateChangeSetOutput> {
        try {
            return await this.client.createChangeSet(params).promise()
        } catch (error) {
            if (isPermissionError(error)) {
                const stackArn = params.StackName
                    ? `arn:aws:cloudformation:${this.regionCode}:*:stack/${params.StackName}/*`
                    : undefined
                throw createEnhancedPermissionError(error, 'cloudformation', 'createChangeSet', stackArn)
            }
            throw error
        }
    }

    async executeChangeSet(
        params: CloudFormation.ExecuteChangeSetInput
    ): Promise<CloudFormation.ExecuteChangeSetOutput> {
        try {
            return await this.client.executeChangeSet(params).promise()
        } catch (error) {
            if (isPermissionError(error)) {
                const stackArn = params.StackName
                    ? `arn:aws:cloudformation:${this.regionCode}:*:stack/${params.StackName}/*`
                    : undefined
                throw createEnhancedPermissionError(error, 'cloudformation', 'executeChangeSet', stackArn)
            }
            throw error
        }
    }

    async describeChangeSet(
        params: CloudFormation.DescribeChangeSetInput
    ): Promise<CloudFormation.DescribeChangeSetOutput> {
        try {
            return await this.client.describeChangeSet(params).promise()
        } catch (error) {
            if (isPermissionError(error)) {
                const stackArn = params.StackName
                    ? `arn:aws:cloudformation:${this.regionCode}:*:stack/${params.StackName}/*`
                    : undefined
                throw createEnhancedPermissionError(error, 'cloudformation', 'describeChangeSet', stackArn)
            }
            throw error
        }
    }

    async describeStackResources(
        params: CloudFormation.DescribeStackResourcesInput
    ): Promise<CloudFormation.DescribeStackResourcesOutput> {
        try {
            return await this.client.describeStackResources(params).promise()
        } catch (error) {
            if (isPermissionError(error)) {
                const stackArn = params.StackName
                    ? `arn:aws:cloudformation:${this.regionCode}:*:stack/${params.StackName}/*`
                    : undefined
                throw createEnhancedPermissionError(error, 'cloudformation', 'describeStackResources', stackArn)
            }
            throw error
        }
    }

    async describeStackResource(
        params: CloudFormation.DescribeStackResourceInput
    ): Promise<CloudFormation.DescribeStackResourceOutput> {
        try {
            return await this.client.describeStackResource(params).promise()
        } catch (error) {
            if (isPermissionError(error)) {
                const stackArn = params.StackName
                    ? `arn:aws:cloudformation:${this.regionCode}:*:stack/${params.StackName}/*`
                    : undefined
                throw createEnhancedPermissionError(error, 'cloudformation', 'describeStackResource', stackArn)
            }
            throw error
        }
    }

    async getGeneratedTemplate(
        params: CloudFormation.GetGeneratedTemplateInput
    ): Promise<CloudFormation.GetGeneratedTemplateOutput> {
        try {
            return await this.client.getGeneratedTemplate(params).promise()
        } catch (error) {
            if (isPermissionError(error)) {
                throw createEnhancedPermissionError(error, 'cloudformation', 'getGeneratedTemplate')
            }
            throw error
        }
    }

    async describeGeneratedTemplate(
        params: CloudFormation.DescribeGeneratedTemplateInput
    ): Promise<CloudFormation.DescribeGeneratedTemplateOutput> {
        try {
            return await this.client.describeGeneratedTemplate(params).promise()
        } catch (error) {
            if (isPermissionError(error)) {
                throw createEnhancedPermissionError(error, 'cloudformation', 'describeGeneratedTemplate')
            }
            throw error
        }
    }

    async waitFor(state: string, params: any): Promise<any> {
        try {
            return await this.client.waitFor(state as any, params).promise()
        } catch (error) {
            if (isPermissionError(error)) {
                // For waitFor operations, we'll provide a generic permission error since the specific action varies
                throw createEnhancedPermissionError(error, 'cloudformation', 'describeStacks')
            }
            throw error
        }
    }
}

export async function runOpenTemplate(arg?: TreeNode) {
    const templateUri = arg ? (arg.resource as SamAppLocation).samTemplateUri : await promptUserForTemplate()
    if (!templateUri || !(await fs.exists(templateUri))) {
        throw new ToolkitError('SAM Template not found, cannot open template', { code: 'NoTemplateProvided' })
    }
    const document = await vscode.workspace.openTextDocument(templateUri)
    await vscode.window.showTextDocument(document)
}

/**
 * Find and open the lambda handler with given ResourceNode
 * If not found, a NoHandlerFound error will be raised
 * @param arg ResourceNode
 */
export async function runOpenHandler(arg: ResourceNode): Promise<void> {
    const folderUri = path.dirname(arg.resource.location.fsPath)
    if (!arg.resource.resource.CodeUri) {
        throw new ToolkitError('No CodeUri provided in template, cannot open handler', { code: 'NoCodeUriProvided' })
    }

    if (!arg.resource.resource.Handler) {
        throw new ToolkitError('No Handler provided in template, cannot open handler', { code: 'NoHandlerProvided' })
    }

    if (!arg.resource.resource.Runtime) {
        throw new ToolkitError('No Runtime provided in template, cannot open handler', { code: 'NoRuntimeProvided' })
    }

    const handlerFile = await getLambdaHandlerFile(
        vscode.Uri.file(folderUri),
        arg.resource.resource.CodeUri,
        arg.resource.resource.Handler,
        arg.resource.resource.Runtime
    )
    if (!handlerFile) {
        throw new ToolkitError(
            `No handler file found with name "${arg.resource.resource.Handler}". Ensure the file exists in the expected location."`,
            {
                code: 'NoHandlerFound',
            }
        )
    }
    await vscode.workspace.openTextDocument(handlerFile).then(async (doc) => await vscode.window.showTextDocument(doc))
}

// create a set to store all supported runtime in the following function
const supportedRuntimeForHandler = new Set<RuntimeFamily>([
    RuntimeFamily.Ruby,
    RuntimeFamily.Python,
    RuntimeFamily.NodeJS,
    RuntimeFamily.DotNet,
    RuntimeFamily.Java,
])

/**
 * Get the actual Lambda handler file, in vscode.Uri format, from the template
 * file and handler name. If not found, return undefined.
 *
 * @param folderUri The root folder for sam project
 * @param codeUri codeUri prop in sam template
 * @param handler handler prop in sam template
 * @param runtime runtime prop in sam template
 * @returns
 */
export async function getLambdaHandlerFile(
    folderUri: vscode.Uri,
    codeUri: string,
    handler: string,
    runtime: string
): Promise<vscode.Uri | undefined> {
    const family = getFamily(runtime)
    if (!supportedRuntimeForHandler.has(family)) {
        throw new ToolkitError(`Runtime ${runtime} is not supported for the 'Open handler' button`, {
            code: 'RuntimeNotSupported',
        })
    }

    // if this function is used to get handler from a just downloaded lambda function zip. codeUri will be ''
    if (codeUri !== '') {
        folderUri = vscode.Uri.joinPath(folderUri, codeUri)
    }

    const handlerParts = handler.split('.')
    // sample: app.lambda_handler -> app.rb
    if (family === RuntimeFamily.Ruby) {
        // Ruby supports namespace/class handlers as well, but the path is
        // guaranteed to be slash-delimited so we can assume the first part is
        // the path
        return vscode.Uri.joinPath(folderUri, handlerParts.slice(0, handlerParts.length - 1).join('/') + '.rb')
    }

    // sample:app.lambda_handler -> app.py
    if (family === RuntimeFamily.Python) {
        // Otherwise (currently Node.js and Python) handle dot-delimited paths
        return vscode.Uri.joinPath(folderUri, handlerParts.slice(0, handlerParts.length - 1).join('/') + '.py')
    }

    // sample: app.handler -> app.mjs/app.js
    // More likely to be mjs if NODEJS version>=18, now searching for both
    if (family === RuntimeFamily.NodeJS) {
        const handlerName = handlerParts.slice(0, handlerParts.length - 1).join('/')
        const handlerPath = path.dirname(handlerName)
        const handlerFile = path.basename(handlerName)
        const pattern = new vscode.RelativePattern(
            vscode.Uri.joinPath(folderUri, handlerPath),
            `${handlerFile}.{js,mjs,cjs,ts}`
        )
        return searchHandlerFile(folderUri, pattern)
    }
    // search directly under Code uri for Dotnet and java
    // sample: ImageResize::ImageResize.Function::FunctionHandler -> Function.cs
    if (family === RuntimeFamily.DotNet) {
        const handlerName = path.basename(handler.split('::')[1].replaceAll('.', '/'))
        const pattern = new vscode.RelativePattern(folderUri, `${handlerName}.cs`)
        return searchHandlerFile(folderUri, pattern)
    }

    // sample: resizer.App::handleRequest -> App.java
    if (family === RuntimeFamily.Java) {
        const handlerName = handler.split('::')[0].replaceAll('.', '/')
        const pattern = new vscode.RelativePattern(folderUri, `**/${handlerName}.java`)
        return searchHandlerFile(folderUri, pattern)
    }
}

/**
    Searches for a handler file in the given pattern and returns the first match.
    If no match is found, returns undefined.
*/
export async function searchHandlerFile(
    folderUri: vscode.Uri,
    pattern: vscode.RelativePattern
): Promise<vscode.Uri | undefined> {
    const handlerFile = await vscode.workspace.findFiles(pattern, new vscode.RelativePattern(folderUri, '.aws-sam'))
    if (handlerFile.length === 0) {
        return undefined
    }
    if (handlerFile.length > 1) {
        getLogger().warn(`Multiple handler files found with name "${path.basename(handlerFile[0].fsPath)}"`)
        void showMessage('warn', `Multiple handler files found with name "${path.basename(handlerFile[0].fsPath)}"`)
    }
    if (await fs.exists(handlerFile[0])) {
        return handlerFile[0]
    }
    return undefined
}

async function promptUserForTemplate() {
    const registry = await globals.templateRegistry
    const openTemplateParams: Partial<OpenTemplateParams> = {}

    const param = await new OpenTemplateWizard(openTemplateParams, registry).run()
    return param?.template.uri
}

export async function deployTypePrompt() {
    const items: DataQuickPickItem<string>[] = [
        {
            label: 'Sync',
            data: 'sync',
            detail: 'Speed up your development and testing experience in the AWS Cloud. With the --watch parameter, sync will build, deploy and watch for local changes',
            description: 'Development environments',
        },
        {
            label: 'Deploy',
            data: 'deploy',
            detail: 'Deploys your template through CloudFormation',
            description: 'Production environments',
        },
    ]

    const selected = await createQuickPick(items, {
        title: localize('AWS.appBuilder.deployType.title', 'Select deployment command'),
        placeholder: 'Press enter to proceed with highlighted option',
        buttons: createCommonButtons(samDeployUrl),
    }).prompt()

    if (!selected) {
        getLogger().info('Operation cancelled.')
        return
    }
    return selected
}

export async function downloadUnzip(url: string, destination: vscode.Uri) {
    const response = await fetch(url)
    if (!response.ok) {
        throw new Error(`Failed to download Lambda layer code: ${response.statusText}`)
    }

    // Get the response as an ArrayBuffer
    const arrayBuffer = await response.arrayBuffer()
    const zipBuffer = Buffer.from(arrayBuffer)

    // Create AdmZip instance with the buffer
    const zip = new AdmZip(zipBuffer)

    // Create output directory if it doesn't exist
    if (!(await fs.exists(destination))) {
        await fs.mkdir(destination)
    }

    // Extract zip contents to output path
    zip.extractAllTo(destination.fsPath, true)
}

export function getLambdaClient(region: string): EnhancedLambdaClient {
    const originalClient = new DefaultLambdaClient(region)
    return new EnhancedLambdaClient(originalClient, region)
}

export async function getCFNClient(regionCode: string): Promise<EnhancedCloudFormationClient> {
    const originalClient = await globals.sdkClientBuilder.createAwsService(CloudFormation, {}, regionCode)
    return new EnhancedCloudFormationClient(originalClient, regionCode)
}
