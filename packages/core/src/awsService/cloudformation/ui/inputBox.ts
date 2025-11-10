/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { window, workspace, Uri, commands } from 'vscode'
import {
    validateStackName,
    validateParameterValue,
    validateChangeSetName,
} from '../stacks/actions/stackActionInputValidation'
import { Parameter, Capability, Tag, OnStackFailure } from '@aws-sdk/client-cloudformation'
import {
    TemplateParameter,
    ResourceToImport,
    TemplateResource,
    OptionalFlagMode,
} from '../stacks/actions/stackActionRequestType'
import { DocumentManager } from '../documents/documentManager'
import path from 'path'
import fs from '../../../shared/fs/fs'

export async function getTemplatePath(documentManager: DocumentManager): Promise<string | undefined> {
    const validTemplates = documentManager
        .get()
        .filter((doc) => doc.cfnType === 'template')
        .map((doc) => {
            const uri = doc.uri

            return {
                label: doc.fileName,
                description: workspace.asRelativePath(Uri.parse(uri)),
                uri: uri,
            }
        })
        .sort((a, b) => a.label.localeCompare(b.label))

    const options = [
        ...validTemplates,
        {
            label: '$(file) Browse for template file...',
            description: 'Select a CloudFormation template file',
            uri: 'browse',
        },
    ]

    const selected = await window.showQuickPick(options, {
        placeHolder: 'Select CloudFormation template',
        ignoreFocusOut: true,
    })

    if (!selected) {
        return undefined
    }

    if (selected.uri === 'browse') {
        const fileUri = await window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
                'CloudFormation Templates': ['yaml', 'yml', 'json', 'template', 'cfn', 'txt', ''],
            },
            title: 'Select CloudFormation Template',
        })

        return fileUri?.[0]?.fsPath
    }

    return selected.uri
}

export async function getStackName(prefill?: string): Promise<string | undefined> {
    return await window.showInputBox({
        prompt: 'Enter the CloudFormation stack name',
        value: prefill,
        validateInput: validateStackName,
        ignoreFocusOut: true,
    })
}

export async function getChangeSetName(prefill?: string): Promise<string | undefined> {
    return await window.showInputBox({
        prompt: 'Enter the CloudFormation change set name',
        value: prefill,
        validateInput: validateChangeSetName,
        ignoreFocusOut: true,
    })
}

export async function getParameterValues(
    templateParameters: TemplateParameter[],
    prefillParameters?: Parameter[]
): Promise<Parameter[] | undefined> {
    const parameters: Parameter[] = []

    for (const param of templateParameters) {
        const prefillCandidate = prefillParameters?.find((p) => p.ParameterKey === param.name)?.ParameterValue

        // If we are using a previous parameter value, we must ensure that it is compatible with possibly modified template
        const prefillValue =
            prefillCandidate && !validateParameterValue(prefillCandidate, param) ? prefillCandidate : undefined

        const value = await getParameterValue(param, prefillValue)
        if (value) {
            parameters.push(value)
        }
    }

    return parameters
}

async function getParameterValue(parameter: TemplateParameter, prefill?: string): Promise<Parameter | undefined> {
    const prompt = `Enter value for parameter "${parameter.name}"${parameter.Description ? ` - ${parameter.Description}` : ''}`
    const placeHolder = parameter.Default ? `Default: ${parameter.Default}` : (parameter.Type ?? 'String')
    const allowedInfo = parameter.AllowedValues ? ` (Allowed: ${parameter.AllowedValues.join(', ')})` : ''

    const value = await window.showInputBox({
        prompt: prompt + allowedInfo,
        placeHolder,
        value: prefill ?? parameter.Default?.toString(),
        validateInput: (input: string) => validateParameterValue(input, parameter),
        ignoreFocusOut: true,
    })

    if (value === undefined) {
        return undefined
    }

    return { ParameterKey: parameter.name, ParameterValue: value }
}

export async function confirmCapabilities(capabilities: Capability[]): Promise<Capability[] | undefined> {
    // Confirm if user wants to use detected capabilities
    const useDetected = await window.showQuickPick(['Yes', 'No, modify capabilities'], {
        placeHolder: `Use capabilities: ${capabilities.join(', ') || '(none)'}?`,
        canPickMany: false,
    })

    if (!useDetected) {
        return undefined // User cancelled
    }

    if (useDetected === 'Yes') {
        return capabilities
    }

    // Allow user to modify capabilities
    const allCapabilities: Capability[] = [
        Capability.CAPABILITY_IAM,
        Capability.CAPABILITY_NAMED_IAM,
        Capability.CAPABILITY_AUTO_EXPAND,
    ]

    const selected = await window.showQuickPick(
        allCapabilities.map((cap) => ({ label: cap, picked: capabilities.includes(cap) })),
        {
            placeHolder: 'Select capabilities to use',
            canPickMany: true,
        }
    )

    return selected ? selected.map((item) => item.label) : undefined
}

export async function shouldImportResources(): Promise<boolean> {
    const choice = await window.showQuickPick(['Deploy new/updated resources', 'Import existing resources'], {
        placeHolder: 'Select deployment mode',
        ignoreFocusOut: true,
    })

    return choice === 'Import existing resources'
}

export async function chooseOptionalFlagSuggestion(): Promise<string | undefined> {
    const choice = await window.showQuickPick(
        [OptionalFlagMode.Skip, OptionalFlagMode.Input, OptionalFlagMode.DevFriendly],
        {
            placeHolder: 'Enter optional change set flags?',
            ignoreFocusOut: true,
        }
    )

    return choice
}

export async function getTags(previousTags?: Tag[]): Promise<Tag[] | undefined> {
    const prefill = previousTags
        ?.filter((tag) => tag.Key && tag.Value)
        .map((tag) => `${tag.Key}=${tag.Value}`)
        .join(',')

    const input = await window.showInputBox({
        prompt: 'Enter CloudFormation tags (key=value pairs, comma-separated). Enter empty for no tags',
        placeHolder: 'key1=value1,key2=value2,key3=value3',
        value: prefill,
        validateInput: (value) => {
            if (!value) {
                return undefined
            }
            const isValid = /^[^=,]+=[^=,]+(,[^=,]+=[^=,]+)*$/.test(value.trim())
            return isValid ? undefined : 'Format: key1=value1,key2=value2'
        },
        ignoreFocusOut: true,
    })

    if (!input) {
        return undefined
    }

    return input.split(',').map((pair) => {
        const [key, value] = pair.split('=').map((s) => s.trim())
        return { Key: key, Value: value }
    })
}

export async function getIncludeNestedStacks(): Promise<boolean | undefined> {
    return (
        await window.showQuickPick(
            [
                { label: 'Yes', value: true },
                { label: 'No', value: false },
            ],
            { placeHolder: 'Include nested stacks?', ignoreFocusOut: true }
        )
    )?.value
}

export async function getImportExistingResources(): Promise<boolean | undefined> {
    return (
        await window.showQuickPick(
            [
                { label: 'Yes', value: true },
                { label: 'No', value: false },
            ],
            { placeHolder: 'Import existing resources?', ignoreFocusOut: true }
        )
    )?.value
}

export async function getOnStackFailure(): Promise<OnStackFailure | undefined> {
    return (
        await window.showQuickPick(
            [
                { label: 'Delete', description: 'Delete the stack on failure', value: OnStackFailure.DELETE },
                { label: 'Do Nothing', description: 'Leave stack in failed state', value: OnStackFailure.DO_NOTHING },
                { label: 'Rollback', description: 'Rollback to previous state', value: OnStackFailure.ROLLBACK },
            ],
            { placeHolder: 'What to do on stack failure?', ignoreFocusOut: true }
        )
    )?.value
}

export async function getResourcesToImport(
    templateResources: TemplateResource[]
): Promise<ResourceToImport[] | undefined> {
    const resourcesToImport: ResourceToImport[] = []

    const selectedResources = await window.showQuickPick(
        templateResources.map((r) => ({
            label: r.logicalId,
            description: r.type,
            picked: false,
            resource: r,
        })),
        {
            placeHolder: 'Select resources to import',
            canPickMany: true,
            ignoreFocusOut: true,
        }
    )

    if (!selectedResources || selectedResources.length === 0) {
        return undefined
    }

    for (const selected of selectedResources) {
        const resourceIdentifier = await getResourceIdentifier(
            selected.resource.logicalId,
            selected.resource.type,
            selected.resource.primaryIdentifierKeys,
            selected.resource.primaryIdentifier
        )

        if (!resourceIdentifier) {
            return undefined
        }

        resourcesToImport.push({
            ResourceType: selected.resource.type,
            LogicalResourceId: selected.resource.logicalId,
            ResourceIdentifier: resourceIdentifier,
        })
    }

    return resourcesToImport
}

async function getResourceIdentifier(
    logicalId: string,
    resourceType: string,
    primaryIdentifierKeys?: string[],
    primaryIdentifier?: Record<string, string>
): Promise<Record<string, string> | undefined> {
    if (!primaryIdentifierKeys || primaryIdentifierKeys.length === 0) {
        void window.showErrorMessage(`No primary identifier keys found for ${resourceType}`)
        return undefined
    }

    if (primaryIdentifier && Object.keys(primaryIdentifier).length > 0) {
        const id = Object.values(primaryIdentifier).join('|')

        const usePrimary = await window.showQuickPick([id, 'Enter manually'], {
            placeHolder: `Select primary identifier for ${logicalId}`,
            ignoreFocusOut: true,
        })
        if (!usePrimary) {
            return undefined
        }
        if (usePrimary === id) {
            return primaryIdentifier
        }
    }

    const identifiers: Record<string, string> = {}

    for (const key of primaryIdentifierKeys) {
        const value = await window.showInputBox({
            prompt: `Enter ${key} for ${logicalId} (${resourceType})`,
            placeHolder: `Physical ${key} of existing resource`,
            ignoreFocusOut: true,
        })

        if (!value) {
            return undefined
        }

        identifiers[key] = value
    }

    return identifiers
}

export async function getProjectName(prefillValue: string | undefined) {
    return await window.showInputBox({
        prompt: 'Enter project name',
        value: prefillValue,
        validateInput: (v) => {
            if (!v.trim()) {
                return 'Required'
            }
            if (!/^[a-zA-Z0-9_-]{1,64}$/.test(v.trim())) {
                return 'Must be 1-64 characters, alphanumeric with hyphens and underscores only'
            }
            return undefined
        },
    })
}

export async function getProjectPath(prefillValue: string) {
    while (true) {
        const input = await window.showInputBox({
            prompt: 'Enter project path (optional)',
            value: prefillValue,
            placeHolder: 'Press Enter for current directory',
            ignoreFocusOut: true,
        })

        if (input === undefined) {
            return undefined
        } // User cancelled
        if (!input.trim()) {
            return input
        } // Empty is valid (optional field)

        // Validate after input
        try {
            const resolvedPath = path.resolve(input.trim())
            const parentDir = path.dirname(resolvedPath)

            const parentPathExists = await fs.existsDir(parentDir)
            if (!parentPathExists) {
                void window.showErrorMessage('Parent directory does not exist. Please try again.')
                continue // Ask again
            }

            return input
        } catch (error) {
            void window.showErrorMessage('Invalid path format. Please try again.')
            continue // Ask again
        }
    }
}

export async function getEnvironmentName() {
    return await window.showInputBox({
        prompt: 'Environment name',
        validateInput: (v) => {
            if (!v.trim()) {
                return 'Required'
            }
            if (!/^[a-zA-Z0-9_-]{1,32}$/.test(v.trim())) {
                return 'Must be 1-32 characters, alphanumeric with hyphens and underscores only'
            }
            return undefined
        },
    })
}

export async function shouldSaveFlagsToFile(): Promise<boolean | undefined> {
    const config = workspace.getConfiguration('aws.cloudformation')
    const currentSetting = config.get<string>('environment.saveOptions', 'alwaysAsk')

    if (currentSetting === 'alwaysSave') {
        return true
    }
    if (currentSetting === 'neverSave') {
        return false
    }

    const choice = await window.showQuickPick(
        [
            {
                label: 'Save Options to file',
                description: 'Save the deployment options to a file in your environment',
                value: 'save',
            },
            {
                label: 'Do not save options to file',
                description: 'Do not save options to environment file',
                value: 'skip',
            },
            {
                label: 'Configure in Settings',
                description:
                    'Open CloudFormation Environment settings (settings will not affect this current deployment)',
                value: 'configure',
            },
        ],
        {
            placeHolder: 'Choose deployment options configuration for CloudFormation template',
            ignoreFocusOut: true,
        }
    )

    if (!choice) {
        return false
    }

    if (choice.value === 'configure') {
        await commands.executeCommand('workbench.action.openSettings', 'aws.cloudformation.environment.saveOptions')
        return undefined // Exit command, let user configure first
    }

    return choice.value === 'save'
}

export async function getFilePath(environmentDir: string) {
    while (true) {
        const input = await window.showInputBox({
            prompt: 'Enter File Name to save options to (must be .json, .yaml, or .yml)',
            ignoreFocusOut: true,
            validateInput: (v) => {
                if (!v.trim()) {
                    return 'Required'
                }
                if (!/^[a-zA-Z0-9_-]{1,32}\.(json|yaml|yml)$/.test(v.trim())) {
                    return 'Must be 1-32 characters (alphanumeric with hyphens and underscores) and end with .json, .yaml, or .yml'
                }
                return undefined
            },
        })

        if (input === undefined) {
            return undefined
        } // User cancelled

        // Validate after input
        try {
            const resolvedPath = path.resolve(path.join(environmentDir, input.trim()))

            const parentPathExists = await fs.existsFile(resolvedPath)
            if (parentPathExists) {
                void window.showErrorMessage('File already exists. Please try again.')
                continue // Ask again
            }

            return resolvedPath
        } catch (error) {
            void window.showErrorMessage('Environment directory was not found')
            return
        }
    }
}

export async function shouldUploadToS3(): Promise<boolean | undefined> {
    const config = workspace.getConfiguration('aws.cloudformation')
    const currentSetting = config.get<string>('s3', 'alwaysAsk')

    if (currentSetting === 'alwaysUpload') {
        return true
    }
    if (currentSetting === 'neverUpload') {
        return false
    }

    const choice = await window.showQuickPick(
        [
            {
                label: 'Upload to S3',
                description: 'Upload template to S3',
                value: 'upload',
            },
            {
                label: 'Do not upload to S3',
                description: 'Do not upload template to S3',
                value: 'skip',
            },
            {
                label: 'Configure in Settings',
                description: 'Open CloudFormation S3 settings',
                value: 'configure',
            },
        ],
        {
            placeHolder: 'Choose S3 upload option for CloudFormation template',
        }
    )

    if (!choice) {
        return false
    }

    if (choice.value === 'configure') {
        await commands.executeCommand('workbench.action.openSettings', 'aws.cloudformation.s3')
        return undefined // Exit command, let user configure first
    }

    return choice.value === 'upload'
}

export async function getS3Bucket(prompt?: string): Promise<string | undefined> {
    return await window.showInputBox({
        prompt: prompt || 'Enter S3 bucket name',
        validateInput: (value) => {
            if (!value.trim()) {
                return 'Bucket name is required'
            }
            if (!/^[a-z0-9.-]{3,63}$/.test(value)) {
                return 'Invalid bucket name format'
            }
            return undefined
        },
    })
}

export async function getS3Key(prefill?: string): Promise<string | undefined> {
    return await window.showInputBox({
        prompt: 'Enter S3 object key',
        value: prefill,
        validateInput: (value) => {
            if (!value.trim()) {
                return 'Object key is required'
            }
            return undefined
        },
    })
}
