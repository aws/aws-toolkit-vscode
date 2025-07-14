/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { LambdaFunctionNode } from '../../../lambda/explorer/lambdaFunctionNode'
import fs from '../../../shared/fs/fs'
import { getLogger } from '../../../shared/logger/logger'
import * as os from 'os'
import {
    LAMBDA_FUNCTION_TYPE,
    LAMBDA_LAYER_TYPE,
    LAMBDA_URL_TYPE,
    SERVERLESS_FUNCTION_TYPE,
    SERVERLESS_LAYER_TYPE,
    Template,
    TemplateResources,
    loadByContents,
    save,
    tryLoad,
    ZipResourceProperties,
    Resource,
} from '../../../shared/cloudformation/cloudformation'

import { downloadUnzip, getLambdaClient, getCFNClient, isPermissionError } from '../utils'
import { openProjectInWorkspace } from '../walkthrough'
import { ToolkitError } from '../../../shared/errors'
import { ResourcesToImport, StackResource } from 'aws-sdk/clients/cloudformation'
import { SignatureV4 } from '@smithy/signature-v4'
import { Sha256 } from '@aws-crypto/sha256-js'
import { getIAMConnection } from '../../../auth/utils'
import globals from '../../../shared/extensionGlobals'
import { Runtime, telemetry } from '../../../shared/telemetry/telemetry'

/**
 * Information about a CloudFormation stack
 */
export interface StackInfo {
    stackId: string
    stackName: string
    isSamTemplate: boolean
    template: Template
}

/**
 * Main entry point for converting a Lambda function to a SAM project
 */
export async function lambdaToSam(lambdaNode: LambdaFunctionNode): Promise<void> {
    try {
        // Show progress notification for the overall process
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Converting ${lambdaNode.name} to SAM project`,
                cancellable: false,
            },
            async (progress) => {
                // 0. Prompt user for project location
                const saveUri = await promptForProjectLocation()
                if (!saveUri) {
                    getLogger().info('User canceled project location selection')
                    return
                }
                progress.report({ increment: 0, message: 'Checking stack association...' })

                // 1. Determine which scenario applies to this Lambda function
                telemetry.record({ runtime: lambdaNode?.configuration?.Runtime as Runtime | undefined })
                let stackInfo = await determineStackAssociation(lambdaNode)

                // 2. Handle the appropriate scenario
                let samTemplate: Template
                let sourceType: 'LambdaFunction' | 'SAMStack' | 'CFNStack'
                let stackName: string | undefined
                if (!stackInfo) {
                    telemetry.record({ action: 'deployStack' })
                    // Scenario 1: Lambda doesn't belong to any stack
                    sourceType = 'LambdaFunction'
                    progress.report({ increment: 30, message: 'Generating template...' })
                    // 2.1 call api to get CFN
                    let cfnTemplate: Template
                    let resourcesToImport: ResourcesToImport
                    try {
                        ;[cfnTemplate, resourcesToImport] = await callExternalApiForCfnTemplate(lambdaNode)
                    } catch (error) {
                        throw new ToolkitError(`Failed to generate template: ${error}`)
                    }

                    // 2.2. Deploy the CFN template to create a stack
                    progress.report({ increment: 20, message: 'Deploying template...' })
                    stackName = await promptForStackName(lambdaNode.name.replaceAll('_', '-'))
                    if (!stackName) {
                        throw new ToolkitError('Stack name not provided')
                    }

                    stackInfo = await deployCfnTemplate(
                        cfnTemplate,
                        resourcesToImport,
                        stackName,
                        lambdaNode.regionCode
                    )
                    samTemplate = {
                        AWSTemplateFormatVersion: stackInfo.template.AWSTemplateFormatVersion,
                        Transform: 'AWS::Serverless-2016-10-31',
                        Parameters: stackInfo.template.Parameters,
                        Globals: stackInfo.template.Globals,
                        Resources: stackInfo.template.Resources,
                    }
                } else if (stackInfo.isSamTemplate) {
                    // Scenario 3: Lambda belongs to a stack deployed by SAM
                    sourceType = 'SAMStack'
                    progress.report({ increment: 50, message: 'Processing SAM template...' })
                    samTemplate = stackInfo.template
                    stackName = stackInfo.stackName
                } else {
                    // Scenario 2: Lambda belongs to a CFN stack
                    sourceType = 'CFNStack'
                    progress.report({ increment: 50, message: 'Creating SAM project from CFN...' })
                    samTemplate = {
                        AWSTemplateFormatVersion: stackInfo.template.AWSTemplateFormatVersion,
                        Transform: 'AWS::Serverless-2016-10-31',
                        Parameters: stackInfo.template.Parameters,
                        Globals: stackInfo.template.Globals,
                        Resources: stackInfo.template.Resources,
                    }
                    stackName = stackInfo.stackName
                }

                const projectUri = vscode.Uri.joinPath(saveUri[0], stackName)

                telemetry.record({ iac: sourceType })

                // 3. Process Lambda functions in the template
                if (!samTemplate.Resources) {
                    throw new ToolkitError('Template does not contain any resource, please retry')
                }

                progress.report({ message: 'Downloading Lambda function code...' })
                await cfn2sam(samTemplate.Resources, projectUri, stackInfo, lambdaNode.regionCode)

                // 4. Save the SAM template
                progress.report({ message: 'Saving SAM template...' })
                await save(samTemplate, vscode.Uri.joinPath(projectUri, 'template.yaml').fsPath)

                // 5. Create a basic README.md
                // Use stack name from stackInfo if available, otherwise use the Lambda function name
                progress.report({ message: 'Creating Readme...' })
                await createReadme(stackName, sourceType, projectUri)

                // 6. Create samconfig.toml
                progress.report({ message: 'Creating SAM configuration...' })
                await createSAMConfig(stackName, lambdaNode.regionCode, projectUri)

                // 7. Open the project in VS Code
                await openProjectInWorkspace(projectUri)

                // 8. Show success message
                void vscode.window.showInformationMessage(`SAM project created successfully at ${projectUri.fsPath}`)
                progress.report({ increment: 100, message: 'Done!' })
            }
        )
    } catch (err) {
        throw new ToolkitError(`Failed to convert Lambda to SAM: ${err instanceof Error ? err.message : String(err)}`)
    }
}

export async function createReadme(
    stackName: string,
    sourceType: 'LambdaFunction' | 'SAMStack' | 'CFNStack',
    projectUri: vscode.Uri
) {
    const warningSection =
        sourceType !== 'LambdaFunction'
            ? ''
            : `**[Warning**: Currently only a subset of resource support converting to SAM, For any missing resources, please check the Lambda Console and add them manually to your SAM template. ]`
    const lambda2SAMReadmeSource = 'resources/markdown/lambda2sam.md'
    const readme = (await fs.readFileText(globals.context.asAbsolutePath(lambda2SAMReadmeSource)))
        .replace(/\$\{sourceType\}/g, sourceType)
        .replace(/\$\{stackName\}/g, stackName)
        .replace(/\$\{warning\}/g, warningSection)

    await fs.writeFile(vscode.Uri.joinPath(projectUri, 'README.md'), readme)
}

export async function createSAMConfig(stackName: string, region: string, projectUri: vscode.Uri) {
    const samConfigContent = `# More information about the configuration file can be found here:
# https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-config.html
version = 0.1

[default]
[default.global.parameters]
stack_name = "${stackName}"
region = "${region}"`
    await fs.writeFile(vscode.Uri.joinPath(projectUri, 'samconfig.toml'), samConfigContent)
}

/**
 * Determines if the Lambda function is associated with a CloudFormation stack
 * and if that stack was deployed using SAM
 */
export async function determineStackAssociation(lambdaNode: LambdaFunctionNode): Promise<StackInfo | undefined> {
    try {
        // Get Lambda function details including tags
        const lambdaClient = getLambdaClient(lambdaNode.regionCode)
        const functionDetails = await lambdaClient.getFunction(lambdaNode.name)

        // Check if the Lambda function has CloudFormation stack tags
        if (!functionDetails.Tags) {
            // Lambda doesn't have any tags, so it's not part of a stack
            return undefined
        }

        // Look for the CloudFormation stack ID tag
        const stackIdTag = functionDetails.Tags['aws:cloudformation:stack-id']
        if (!stackIdTag) {
            // Lambda doesn't have a CloudFormation stack ID tag
            return undefined
        }

        // Get the stack name tag if available, otherwise extract from stack ID
        let stackName = functionDetails.Tags['aws:cloudformation:stack-name']
        if (!stackName) {
            // Extract stack name from stack ID
            const stackIdParts = stackIdTag.split('/')
            stackName = stackIdParts.length > 1 ? stackIdParts[1] : ''
        }

        // Create CloudFormation client
        const cfn = await getCFNClient(lambdaNode.regionCode)

        // stack could be in DELETE_COMPLETE status or doesn't exist
        const describeStacksResult = await cfn.describeStacks({ StackName: stackIdTag })
        if (!describeStacksResult.Stacks || describeStacksResult.Stacks.length === 0) {
            return undefined
        }
        if (describeStacksResult.Stacks![0].StackStatus === 'DELETE_COMPLETE') {
            return undefined
        }
        // Get the original stack template
        const templateResponse = await cfn.getTemplate({
            StackName: stackIdTag,
            TemplateStage: 'Original', // Critical to get the original SAM template
        })

        const templateBody = templateResponse.TemplateBody || '{}'
        const template = await loadByContents(templateBody, false)

        // Determine if it's a SAM template by checking for the transform
        const isSamTemplate = ifSamTemplate(template)

        return {
            stackId: stackIdTag,
            stackName,
            isSamTemplate,
            template,
        }
    } catch (err) {
        throw new ToolkitError(`Error determining stack association: ${err}, please try again`)
    }
}

/**
 * Checks if a template is a SAM template by looking for the SAM transform
 */
export function ifSamTemplate(template: Template): boolean {
    // Check for SAM transform
    if (template.Transform) {
        if (typeof template.Transform === 'string') {
            return template.Transform.startsWith('AWS::Serverless')
        } else if (typeof template.Transform === 'object' && Array.isArray(template.Transform)) {
            // Handle case where Transform might be an array
            return template.Transform.some((t: string) => typeof t === 'string' && t.startsWith('AWS::Serverless'))
        }
    }

    return false
}

/**
 * Calls the external API to generate a CloudFormation template for a Lambda function
 * Note: This is a placeholder for the actual API call
 */
export async function callExternalApiForCfnTemplate(
    lambdaNode: LambdaFunctionNode
): Promise<[Template, ResourcesToImport]> {
    const conn = await getIAMConnection()
    if (!conn || conn.type !== 'iam') {
        return [{}, []]
    }

    const cred = await conn.getCredentials()
    const signer = new SignatureV4({
        credentials: cred,
        region: lambdaNode.regionCode,
        service: 'lambdaconsole',
        sha256: Sha256,
    })

    // TODO: govcloud URL is in a slightly different format
    const url = new URL(
        `https://${lambdaNode.regionCode}.prod.topology.console.lambda.aws.a2z.com/lambda-api/topology/topology?lambdaArn=${lambdaNode.arn}`
    )

    const signedRequest = await signer.sign({
        method: 'GET',
        headers: {
            host: url.hostname,
        },
        hostname: url.hostname,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        protocol: url.protocol,
    })

    const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
            Accept: 'application/xml',
            'Content-Type': 'application/json',
            ...signedRequest.headers,
        },
    })

    if (!response.ok) {
        getLogger().error('Failed to retrieve generated CloudFormation template: %O', await response.json())
        throw new ToolkitError(`Failed to retrieve generated CloudFormation template ID: ${response.statusText}`)
    }

    const data = await response.json()
    if (!data.cloudFormationTemplateId) {
        throw new ToolkitError('No template ID returned')
    }

    let status: string | undefined = 'CREATE_IN_PROGRESS'
    let getGeneratedTemplateResponse
    let resourcesToImport: ResourcesToImport = []
    const cfn = await getCFNClient(lambdaNode.regionCode)

    // Wait for template generation to complete
    while (status !== 'COMPLETE') {
        getGeneratedTemplateResponse = await cfn.getGeneratedTemplate({
            Format: 'YAML',
            GeneratedTemplateName: data.cloudFormationTemplateId,
        })

        status = getGeneratedTemplateResponse.Status
        if (status === 'FAILED') {
            throw new ToolkitError('CloudFormation template create status FAILED')
        }

        // Add a small delay to avoid hitting API rate limits
        if (status !== 'COMPLETE') {
            await new Promise((resolve) => setTimeout(resolve, 1000))
        }
    }

    // Get the generated template details to extract resource information
    const describeGeneratedTemplateResponse = await cfn.describeGeneratedTemplate({
        GeneratedTemplateName: data.cloudFormationTemplateId,
    })

    if (describeGeneratedTemplateResponse.Status === 'FAILED') {
        throw new ToolkitError('CloudFormation template describe request failed')
    }

    // Build resourcesToImport from the generated template resources
    if (describeGeneratedTemplateResponse.Resources) {
        resourcesToImport = describeGeneratedTemplateResponse.Resources.filter(
            (resource) => resource.LogicalResourceId && resource.ResourceType && resource.ResourceIdentifier
        ).map((resource) => {
            const resourceIdentifier = { ...resource.ResourceIdentifier! }

            // Fix Lambda function identifiers - extract function name from ARN
            if (resource.ResourceType === 'AWS::Lambda::Function' && resourceIdentifier.FunctionName) {
                // FunctionName might be returned as 'arn:aws:lambda:region:account:function:name'
                // We need to extract just the function name
                const functionNameOrArn = resourceIdentifier.FunctionName
                if (functionNameOrArn.startsWith('arn:')) {
                    const arnParts = functionNameOrArn.split(':')
                    // ARN format: arn:aws:lambda:region:account:function:function-name
                    if (arnParts.length >= 7 && arnParts[5] === 'function') {
                        resourceIdentifier.FunctionName = arnParts[6]
                    }
                }
            }

            return {
                ResourceType: resource.ResourceType!,
                LogicalResourceId: resource.LogicalResourceId!,
                ResourceIdentifier: resourceIdentifier,
            }
        })
    }

    const cfnTemplate = getGeneratedTemplateResponse!.TemplateBody

    const load = await tryLoad(vscode.Uri.from({ scheme: 'untitled' }), cfnTemplate)
    if (!load.template || !load.template.Resources) {
        throw new ToolkitError('Failed to load CloudFormation template')
    }

    return [load.template, resourcesToImport]
}

/**
 * Prompts the user for a stack name
 */
export async function promptForStackName(defaultName: string): Promise<string | undefined> {
    return vscode.window.showInputBox({
        title: 'Enter Stack Name',
        prompt: 'Enter a name for the CloudFormation stack',
        value: `${defaultName}-stack`,
        validateInput: (value) => {
            if (!value) {
                return 'Stack name is required'
            }
            if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(value)) {
                return 'Stack name must start with a letter and contain only letters, numbers, and hyphens'
            }
            return undefined
        },
    })
}

async function promptForProjectLocation(): Promise<vscode.Uri[] | undefined> {
    return vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: 'Select SAM project location',
        // if not workspace, use home dir
        defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file(os.homedir()),
    })
}

/**
 * Deploys a CloudFormation template to create a stack and imports the existing Lambda function
 */
export async function deployCfnTemplate(
    template: Template,
    resourcesToImport: ResourcesToImport,
    stackName: string,
    region: string
): Promise<StackInfo> {
    const cfn = await getCFNClient(region)

    removeUnwantedCodeParameters(template)

    // Convert template object to JSON string
    const templateBody = JSON.stringify(template)

    // Create a change set to import the existing resources
    const changeSetName = `ImportLambda-${Date.now()}`
    const changeSetResponse = await cfn.createChangeSet({
        StackName: stackName,
        ChangeSetName: changeSetName,
        ChangeSetType: 'IMPORT',
        TemplateBody: templateBody,
        Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM', 'CAPABILITY_AUTO_EXPAND'],
        ResourcesToImport: resourcesToImport,
    })

    if (!changeSetResponse.Id) {
        throw new ToolkitError('Failed to create change set')
    }

    // Wait for change set creation to complete
    await cfn
        .waitFor('changeSetCreateComplete', {
            StackName: stackName,
            ChangeSetName: changeSetName,
            $waiter: {
                delay: 2,
            },
        })
        .catch(async (err: any) => {
            // If the change set failed to create, get the status reason
            const describeResponse = await cfn.describeChangeSet({
                StackName: stackName,
                ChangeSetName: changeSetName,
            })

            throw new ToolkitError(`Change set creation failed: ${describeResponse.StatusReason || err.message}`)
        })

    // Execute the change set
    await cfn.executeChangeSet({
        StackName: stackName,
        ChangeSetName: changeSetName,
    })

    // Wait for stack import to complete
    await cfn
        .waitFor('stackImportComplete', {
            StackName: stackName,
            $waiter: {
                delay: 2,
            },
        })
        .catch(async () => {
            // If the stack import failed, wait for stack update complete instead
            // (AWS SDK might not have stackImportComplete waiter)
            await cfn.waitFor('stackUpdateComplete', {
                StackName: stackName,
                $waiter: {
                    delay: 2,
                },
            })
        })

    // Get the stack ID
    const describeStackResponse = await cfn.describeStacks({
        StackName: stackName,
    })

    if (!describeStackResponse.Stacks || !describeStackResponse.Stacks[0].StackId) {
        throw new ToolkitError('Failed to get stack information')
    }

    // Return information about the deployed stack
    return {
        stackId: describeStackResponse.Stacks[0].StackId,
        stackName,
        template,
        isSamTemplate: false,
    }
}

export function removeUnwantedCodeParameters(template: Template) {
    if (!template.Resources) {
        throw new Error('No Resources found in template')
    }

    const lambdaKey = Object.keys(template.Resources).find(
        (key) => template.Resources![key]?.Type === 'AWS::Lambda::Function'
    )

    if (!lambdaKey) {
        throw new Error('No Lambda function found in template')
    }

    template.Resources[lambdaKey]!.Properties!.Code = {
        ZipFile: '',
    }

    template.Parameters = {}
}

/**
 * Extracts the logical ID from an intrinsic function like !Ref or !GetAtt
 * Returns undefined if the value is not an intrinsic function
 */
export function extractLogicalIdFromIntrinsic(value: any): string | undefined {
    // Check for Ref: { "Ref": "logicalId" }
    if (typeof value === 'object' && value !== null && Object.keys(value).length === 1 && value.Ref) {
        return value.Ref
    }

    // Check for GetAtt: { "Fn::GetAtt": ["logicalId", "Arn"] }
    if (
        typeof value === 'object' &&
        value !== null &&
        Object.keys(value).length === 1 &&
        value['Fn::GetAtt'] &&
        Array.isArray(value['Fn::GetAtt']) &&
        value['Fn::GetAtt'].length === 2 &&
        value['Fn::GetAtt'][1] === 'Arn'
    ) {
        return value['Fn::GetAtt'][0]
    }

    return undefined
}

/**
 * the main tansform to convert a CFN template to a sam project
 * @param resources the parsed CFN template
 * @param projectDir selected local location for project
 * @param stackInfo
 * @param region
 */
export async function cfn2sam(
    resources: TemplateResources,
    projectDir: vscode.Uri,
    stackInfo: StackInfo,
    region: string
): Promise<void> {
    const lambdaProcess = processLambdaResources(resources, projectDir, stackInfo, region)
    const lambdaLayerProcess = processLambdaLayerResources(resources, projectDir, stackInfo, region)
    await Promise.all([lambdaProcess, lambdaLayerProcess])
    await processLambdaUrlResources(resources)
}

/**
 * Processes Lambda resources in a template, transforming AWS::Lambda::Function to AWS::Serverless::Function
 */
export function Lambda2Serverless(resourceProp: ZipResourceProperties, key: string): Resource {
    const dlqConfig = resourceProp.DeadLetterConfig
    return {
        Type: SERVERLESS_FUNCTION_TYPE,
        Metadata: resourceProp.Metadata,
        Properties: {
            ...resourceProp,
            // Transform Tags from array to object format
            Tags: resourceProp.Tags
                ? Object.fromEntries(
                      resourceProp.Tags.filter((item: { Key: any; Value: any }) => item.Key !== 'lambda:createdBy').map(
                          (item: { Key: any; Value: any }) => [item.Key, item.Value]
                      )
                  )
                : undefined,
            // Remove Code property (S3 reference)
            Code: undefined,
            // Map TracingConfig.Mode to Tracing property
            Tracing: resourceProp.TracingConfig?.Mode,
            TracingConfig: undefined,
            // Transform DeadLetterConfig to DeadLetterQueue
            DeadLetterQueue: dlqConfig
                ? {
                      Type: dlqConfig.TargetArn.split(':')[2] === 'sqs' ? 'SQS' : 'SNS',
                      TargetArn: dlqConfig.TargetArn,
                  }
                : undefined,
            // Set CodeUri to the local path
            CodeUri: key,
        },
    }
}

/**
 * Processes Lambda URL resources in a template, transforming AWS::Lambda::Url to AWS::Serverless::Function.FunctionUrlConfig
 */
export async function processLambdaResources(
    resources: TemplateResources,
    projectDir: vscode.Uri,
    stackInfo: StackInfo,
    region: string
): Promise<void> {
    await Promise.all(
        Object.entries(resources).map(async ([key, resource]) => {
            if (!resource) {
                return
            }

            const resourceProp = resource.Properties
            if (!resourceProp || resourceProp.PackageType === 'Image') {
                return
            }

            if (resource.Type === LAMBDA_FUNCTION_TYPE) {
                // Transform AWS::Lambda::Function to AWS::Serverless::Function
                try {
                    await downloadLambdaFunctionCode(key, stackInfo, projectDir, region, resourceProp.FunctionName)

                    // Transform to Serverless Function
                    resources[key] = Lambda2Serverless(resourceProp, key)
                } catch (err) {
                    throw new ToolkitError(
                        `Failed to process Lambda function ${key}: ${err instanceof Error ? err.message : String(err)}`
                    )
                }
            } else if (resource.Type === SERVERLESS_FUNCTION_TYPE) {
                // Update CodeUri for AWS::Serverless::Function
                try {
                    await downloadLambdaFunctionCode(key, stackInfo, projectDir, region, resourceProp.FunctionName)
                    // Update the CodeUri to point to the local directory
                    resourceProp.CodeUri = key
                } catch (err) {
                    throw new ToolkitError(
                        `Failed to process Serverless function ${key}: ${err instanceof Error ? err.message : String(err)}`
                    )
                }
            }
        })
    )
}

/**
 * Processes Lambda Layer resources in a template, transforming AWS::Lambda::LayerVersion to AWS::Serverless::LayerVersion
 */
export async function processLambdaLayerResources(
    resources: TemplateResources,
    projectDir: vscode.Uri,
    stackInfo: StackInfo,
    region: string
): Promise<void> {
    // Process each resource
    await Promise.all(
        Object.entries(resources).map(async ([key, resource]) => {
            if (!resource || (resource.Type !== LAMBDA_LAYER_TYPE && resource.Type !== SERVERLESS_LAYER_TYPE)) {
                return
            }

            const resourceProp = resource.Properties
            if (!resourceProp) {
                return
            }

            try {
                // Download the layer code
                await downloadLayerVersionResourceByName(key, stackInfo, projectDir, region)

                // Transform to Serverless LayerVersion
                resources[key] = {
                    Type: SERVERLESS_LAYER_TYPE,
                    Properties: {
                        ...resourceProp,
                        // Remove Content property (S3 reference)
                        Content: undefined,
                        // Set ContentUri to the local path
                        ContentUri: key,
                    },
                }

                getLogger().info(`Successfully transformed Lambda Layer ${key} to Serverless LayerVersion`)
            } catch (err) {
                throw new ToolkitError(
                    `Failed to process Lambda Layer ${key}: ${err instanceof Error ? err.message : String(err)}`
                )
            }
        })
    )
}

/**
 * Processes Lambda URL resources in a template, transforming AWS::Lambda::Url to AWS::Serverless::Function.FunctionUrlConfig
 */
export async function processLambdaUrlResources(resources: TemplateResources): Promise<void> {
    for (const [key, resource] of Object.entries(resources)) {
        if (resource && resource.Type === LAMBDA_URL_TYPE) {
            try {
                const resourceProp = resource.Properties
                if (!resourceProp) {
                    continue
                }

                // Skip if Qualifier is present (not supported in FunctionUrlConfig)
                if (resourceProp.Qualifier) {
                    getLogger().info(
                        `Skipping Lambda URL ${key} because Qualifier is not supported in FunctionUrlConfig`
                    )
                    continue
                }

                // Find the target function using TargetFunctionArn
                const targetFunctionArn = resourceProp.TargetFunctionArn
                if (!targetFunctionArn) {
                    getLogger().warn(`Lambda URL ${key} does not have a TargetFunctionArn`)
                    continue
                }

                const targetFunctionKey = extractLogicalIdFromIntrinsic(targetFunctionArn)
                if (!targetFunctionKey) {
                    getLogger().debug(`Could not extract logical ID from TargetFunctionArn in Lambda URL ${key}`)
                    continue
                }

                const targetFunction = resources[targetFunctionKey]
                // if MyLambdaFunction 's url is not formated as MyLambdaFunctionUrl, then we shouldn't transform it
                if (
                    !targetFunction ||
                    targetFunction.Type !== SERVERLESS_FUNCTION_TYPE ||
                    targetFunctionKey + 'Url' !== key
                ) {
                    getLogger().debug(`Target function ${targetFunctionKey} not found or not a Serverless Function`)
                    continue
                }

                // Add FunctionUrlConfig to the Serverless Function
                if (!targetFunction.Properties) {
                    // skip if target function is not correctly setup
                    continue
                }

                // Now we can safely add FunctionUrlConfig
                if (targetFunction.Properties) {
                    targetFunction.Properties.FunctionUrlConfig = {
                        AuthType: resourceProp.AuthType,
                        Cors: resourceProp.Cors,
                        InvokeMode: resourceProp.InvokeMode,
                    }
                }

                // Remove the original Lambda URL resource
                delete resources[key]

                getLogger().info(
                    `Successfully transformed Lambda URL ${key} to FunctionUrlConfig in ${targetFunctionKey}`
                )
            } catch (err) {
                throw new ToolkitError(
                    `Failed to process Lambda URL ${key}: ${err instanceof Error ? err.message : String(err)}`
                )
            }
        }
    }
}

/**
 * Download lambda function code based on logical resource ID or physical resrouce ID
 * If logical id is given, it will try to find the physical id first and then download the code
 * If physical id is given, it will download the code directly
 * @param resourceName logical name of Lambda function in CFN template
 * @param stackInfo
 * @param targetDir Local location to store the code
 * @param region
 * @param physicalResourceId Physical name of Lambda function
 */
export async function downloadLambdaFunctionCode(
    resourceName: string, // This is the logical name from CFN
    stackInfo: StackInfo,
    targetDir: vscode.Uri,
    region: string,
    physicalResourceId?: string
) {
    try {
        if (!physicalResourceId || typeof physicalResourceId !== 'string') {
            physicalResourceId = await getPhysicalIdfromCFNResourceName(
                resourceName,
                region,
                stackInfo.stackId,
                LAMBDA_FUNCTION_TYPE
            )
            if (!physicalResourceId) {
                throw new ToolkitError(`Could not find physical resource ID for ${resourceName}`)
            }
        }

        const lambdaClient = getLambdaClient(region)
        const functionDetails = await lambdaClient.getFunction(physicalResourceId)

        if (!functionDetails.Code || !functionDetails.Code.Location) {
            throw new ToolkitError(`Could not determine code location for function: ${physicalResourceId}`)
        }

        const outputPath = vscode.Uri.joinPath(targetDir, resourceName)
        await downloadUnzip(functionDetails.Code.Location, outputPath)

        getLogger().info(`Successfully downloaded and extracted: ${resourceName}`)
    } catch (err) {
        throw new ToolkitError(
            `Failed to download resource ${resourceName}: ${err instanceof Error ? err.message : String(err)}`
        )
    }
}

/**
 * Get physical resource ID from CFN resource name
 * @param name CFN resource name
 * @param region
 * @param stackId
 * @returns Physical resrouce ID
 */
export async function getPhysicalIdfromCFNResourceName(
    name: string,
    region: string,
    stackId: string,
    resourceType: string
): Promise<string | undefined> {
    // Create CloudFormation client
    const cfn = await getCFNClient(region)

    try {
        // First try the exact match approach
        let describeResult
        try {
            describeResult = await cfn.describeStackResource({
                StackName: stackId,
                LogicalResourceId: name,
            })
        } catch (error) {
            // If it's a permission error, re-throw it immediately
            if (isPermissionError(error)) {
                throw error
            }
            // For other errors (like ResourceNotFound), continue to fuzzy matching
            describeResult = undefined
        }

        if (describeResult?.StackResourceDetail?.PhysicalResourceId) {
            const physicalResourceId = describeResult.StackResourceDetail.PhysicalResourceId
            getLogger().debug(`Resource ${name} found with exact match, physical ID: ${physicalResourceId}`)
            return physicalResourceId
        }

        // only do fuzzy matching for layer, function doesn't have random suffix
        if (resourceType === LAMBDA_FUNCTION_TYPE || resourceType === SERVERLESS_FUNCTION_TYPE) {
            throw new ToolkitError(`Could not find physical resource ID for ${name}`)
        }

        // If exact match fails, get all resources and try fuzzy matching
        getLogger().debug(`Resource ${name} not found with exact match, trying fuzzy match...`)
        const resources = await cfn.describeStackResources({
            StackName: stackId,
        })

        if (!resources.StackResources || resources.StackResources.length === 0) {
            getLogger().debug(`No resources found in stack ${stackId}`)
            return undefined
        }

        // Find resources that start with the given name (SAM transform often adds suffixes)
        const matchingResources = resources.StackResources.filter((resource: StackResource) =>
            resource.LogicalResourceId.startsWith(name)
        )

        if (matchingResources.length === 0) {
            // Try a more flexible approach - check if the resource name is a substring
            const substringMatches = resources.StackResources.filter((resource: StackResource) =>
                resource.LogicalResourceId.includes(name)
            )

            if (substringMatches.length === 0) {
                getLogger().debug(`No fuzzy matches found for resource ${name}`)
                return undefined
            }

            // Use the first substring match
            const match = substringMatches[0]
            getLogger().debug(
                `Resource ${name} matched with ${match.LogicalResourceId} using substring match, physical ID: ${match.PhysicalResourceId}`
            )
            return match.PhysicalResourceId
        }

        // If we have multiple matches, prefer exact prefix match
        // Sort by length to get the closest match (shortest additional suffix)
        matchingResources.sort(
            (a: StackResource, b: StackResource) => a.LogicalResourceId.length - b.LogicalResourceId.length
        )

        const bestMatch = matchingResources[0]
        getLogger().debug(
            `Resource ${name} matched with ${bestMatch.LogicalResourceId} using prefix match, physical ID: ${bestMatch.PhysicalResourceId}`
        )
        return bestMatch.PhysicalResourceId
    } catch (err) {
        throw ToolkitError.chain(err, `Error finding physical ID for resource ${name}, please retry`)
    }
}

/**
 * Download a Lambda Layer resource by name and stack info
 * @param resourceName Layer's Logical name from CFN
 * @param stackInfo
 * @param targetDir local location to store
 * @param region
 */
export async function downloadLayerVersionResourceByName(
    resourceName: string, // This is the logical name from CFN
    stackInfo: StackInfo,
    targetDir: vscode.Uri,
    region: string
) {
    try {
        const physicalResourceId = await getPhysicalIdfromCFNResourceName(
            resourceName,
            region,
            stackInfo.stackId,
            LAMBDA_LAYER_TYPE
        )
        if (!physicalResourceId) {
            throw new ToolkitError(`Could not find physical resource ID for ${resourceName}`)
        }

        getLogger().debug(`Resource ${resourceName} has physical ID ${physicalResourceId} and type LayerVersion`)

        // Parse the ARN to extract layer name and version
        // Format: arn:aws:lambda:region:account-id:layer:layer-name:version
        const arnParts = physicalResourceId.split(':')
        if (arnParts.length < 8) {
            throw new ToolkitError(`Invalid layer ARN format: ${physicalResourceId}`)
        }

        const layerName = arnParts[6]
        const version = parseInt(arnParts[7], 10)

        if (isNaN(version)) {
            throw new ToolkitError(`Invalid version number in layer ARN: ${physicalResourceId}`)
        }

        getLogger().debug(`Extracted layer name: ${layerName}, version: ${version} from ARN`)

        const lambdaClient = getLambdaClient(region)

        // Get the layer version details directly using the extracted name and version
        const layerDetails = await lambdaClient.getLayerVersion(layerName, version)

        if (!layerDetails.Content || !layerDetails.Content.Location) {
            throw new ToolkitError(`Could not determine code location for layer: ${layerName}:${version}`)
        }

        // Download Lambda layer code using the presigned URL
        const presignedUrl = layerDetails.Content.Location

        // Use node-fetch to download from the presigned URL
        const outputPath = vscode.Uri.joinPath(targetDir, resourceName)
        await downloadUnzip(presignedUrl, outputPath)

        getLogger().info(`Successfully downloaded and extracted layer ${layerName}:${version} to: ${resourceName}`)
    } catch (err) {
        throw new ToolkitError(
            `Failed to download resource ${resourceName}: ${err instanceof Error ? err.message : String(err)}, please retry`
        )
    }
}
