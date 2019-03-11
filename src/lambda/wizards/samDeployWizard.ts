/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as path from 'path'
import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger'
import { RegionProvider } from '../../shared/regions/regionProvider'
import * as input from '../../shared/ui/input'
import * as picker from '../../shared/ui/picker'
import { toArrayAsync } from '../../shared/utilities/collectionUtils'
import { detectLocalTemplates } from '../local/detectLocalTemplates'
import { MultiStepWizard, WizardStep } from './multiStepWizard'

export interface SamDeployWizardResponse {
    region: string
    template: vscode.Uri
    s3Bucket: string
    stackName: string
}

export interface SamDeployWizardContext {
    readonly onDetectLocalTemplates: typeof detectLocalTemplates

    readonly workspaceFolders: vscode.Uri[] | undefined

    /**
     * Retrieves the URI of a Sam template to deploy from the user
     *
     * @returns vscode.Uri of a Sam Template. undefined represents cancel.
     */
    promptUserForSamTemplate(initialValue?: vscode.Uri): Promise<vscode.Uri | undefined>

    promptUserForRegion(regionProvider: RegionProvider, initialValue?: string): Promise<string | undefined>

    /**
     * Retrieves an S3 Bucket to deploy to from the user.
     *
     * @param initialValue Optional, Initial value to prompt with
     *
     * @returns S3 Bucket name. Undefined represents cancel.
     */
    promptUserForS3Bucket(selectedRegion?: string, initialValue?: string): Promise<string | undefined>

    /**
     * Retrieves a Stack Name to deploy to from the user.
     *
     * @param initialValue Optional, Initial value to prompt with
     * @param validateInput Optional, validates input as it is entered
     *
     * @returns Stack name. Undefined represents cancel.
     */
    promptUserForStackName(
        {
            initialValue,
            validateInput,
        }: {
            initialValue?: string
            validateInput(value: string): string | undefined
        }
    ): Promise<string | undefined>
}

class DefaultSamDeployWizardContext implements SamDeployWizardContext {
    public readonly onDetectLocalTemplates = detectLocalTemplates

    public get workspaceFolders(): vscode.Uri[] | undefined {
        return (vscode.workspace.workspaceFolders || []).map(f => f.uri)
    }

    /**
     * Retrieves the URI of a Sam template to deploy from the user
     *
     * @returns vscode.Uri of a Sam Template. undefined represents cancel.
     */
    public async promptUserForSamTemplate(initialValue?: vscode.Uri): Promise<vscode.Uri | undefined> {
        const logger = getLogger()
        const workspaceFolders = this.workspaceFolders || []

        const quickPick = picker.createQuickPick<SamTemplateQuickPickItem>({
            options: {
                title: localize(
                    'AWS.samcli.deploy.template.prompt',
                    'Which SAM Template would you like to deploy to AWS?'
                )
            },
            items: await getTemplateChoices(this.onDetectLocalTemplates, ...workspaceFolders)
        })

        const choices = await picker.promptUser<SamTemplateQuickPickItem>({
            picker: quickPick,
        })

        if (!choices || choices.length === 0) {
            return undefined
        }

        if (choices.length > 1) {
            logger.warn(
                `Received ${choices.length} responses from user, expected 1.` +
                ' Cancelling to prevent deployment of unexpected template.'
            )

            return undefined
        }

        return choices[0].uri
    }

    public async promptUserForRegion(regionProvider: RegionProvider,
                                     initialRegionCode: string): Promise<string | undefined> {
        const logger = getLogger()
        const regionData = await regionProvider.getRegionData()

        const quickPick = picker.createQuickPick<vscode.QuickPickItem>({
            options: {
                title: localize('AWS.samcli.deploy.region.prompt',
                                'Which AWS Region would you like to deploy to?'),
                value: initialRegionCode || '',
                matchOnDetail: true,
                ignoreFocusOut: true,
            },
            items: regionData.map(r => ({
                label: r.regionName,
                detail: r.regionCode,
                // this is the only way to get this to show on going back
                // this will make it so it always shows even when searching for something else
                alwaysShow: r.regionCode === initialRegionCode,
                description: r.regionCode === initialRegionCode ? localize('AWS.samcli.deploy.region.previousRegion',
                                                                           'Selected Previously')
                                                                : ''
            })),
            buttons: [
                vscode.QuickInputButtons.Back
            ],
        })

        const choices = await picker.promptUser<vscode.QuickPickItem>({
            picker: quickPick,
            onDidTriggerButton: (button, resolve, reject) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                }
            }
        })

        if (!choices || choices.length === 0) {
            return undefined
        }

        if (choices.length > 1) {
            logger.warn(
                `Received ${choices.length} responses from user, expected 1.` +
                ' Cancelling to prevent deployment of unexpected template.'
            )

            return undefined
        }

        return choices[0].detail
    }

    /**
     * Retrieves an S3 Bucket to deploy to from the user.
     *
     * @param initialValue Optional, Initial value to prompt with
     *
     * @returns S3 Bucket name. Undefined represents cancel.
     */
    public async promptUserForS3Bucket(selectedRegion: string, initialValue?: string): Promise<string | undefined> {
        const inputBox = input.createInputBox({
            buttons: [
                vscode.QuickInputButtons.Back
            ],
            options: {
                title: localize(
                    'AWS.samcli.deploy.s3Bucket.prompt',
                    'Enter the AWS S3 bucket to which your code should be deployed'
                ),
                ignoreFocusOut: true,
                prompt: localize('AWS.samcli.deploy.s3Bucket.region',
                                 'S3 bucket must be in selected region: {0}',
                                 selectedRegion)
            }
        })

        // Pre-populate the value if it was already set
        if (initialValue) {
            inputBox.value = initialValue
        }

        return await input.promptUser({
            inputBox: inputBox,
            onValidateInput: validateS3Bucket,
            onDidTriggerButton: (button, resolve, reject) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                }
            }
        })
    }

    /**
     * Retrieves a Stack Name to deploy to from the user.
     *
     * @param initialValue Optional, Initial value to prompt with
     * @param validateInput Optional, validates input as it is entered
     *
     * @returns Stack name. Undefined represents cancel.
     */
    public async promptUserForStackName(
        {
            initialValue,
            validateInput,
        }: {
            initialValue?: string
            validateInput(value: string): string | undefined
        }
    ): Promise<string | undefined> {
        const inputBox = input.createInputBox({
            buttons: [
                vscode.QuickInputButtons.Back
            ],
            options: {
                title: localize(
                    'AWS.samcli.deploy.stackName.prompt',
                    'Enter the name to use for the deployed stack'
                ),
                ignoreFocusOut: true,
            }
        })

        // Pre-populate the value if it was already set
        if (initialValue) {
            inputBox.value = initialValue
        }

        return await input.promptUser({
            inputBox: inputBox,
            onValidateInput: validateInput,
            onDidTriggerButton: (button, resolve, reject) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                }
            }
        })
    }
}

export class SamDeployWizard extends MultiStepWizard<SamDeployWizardResponse> {
    private readonly response: Partial<SamDeployWizardResponse> = {}

    public constructor(
        private readonly regionProvider: RegionProvider,
        private readonly context: SamDeployWizardContext = new DefaultSamDeployWizardContext()
    ) {
        super()
    }

    protected get startStep() {
        return this.TEMPLATE
    }

    protected getResult(): SamDeployWizardResponse | undefined {
        if (!this.response.template || !this.response.region || !this.response.s3Bucket || !this.response.stackName) {
            return undefined
        }

        return {
            template: this.response.template,
            region: this.response.region,
            s3Bucket: this.response.s3Bucket,
            stackName: this.response.stackName
        }
    }

    private readonly TEMPLATE: WizardStep = async () => {
        this.response.template = await this.context.promptUserForSamTemplate(this.response.template)

        return this.response.template ? this.REGION : undefined
    }

    private readonly REGION: WizardStep = async () => {
        this.response.region = await this.context.promptUserForRegion(this.regionProvider, this.response.region)

        return this.response.region ? this.S3_BUCKET : this.TEMPLATE
    }

    private readonly S3_BUCKET: WizardStep = async () => {
        this.response.s3Bucket = await this.context.promptUserForS3Bucket(this.response.region, this.response.s3Bucket)

        return this.response.s3Bucket ? this.STACK_NAME : this.REGION
    }

    private readonly STACK_NAME: WizardStep = async () => {
        this.response.stackName = await this.context.promptUserForStackName({
            initialValue: this.response.stackName,
            validateInput: validateStackName,
        })

        return this.response.stackName ? undefined : this.S3_BUCKET
    }
}

class SamTemplateQuickPickItem implements vscode.QuickPickItem {
    public readonly label: string

    public description?: string
    public detail?: string

    public constructor(
        public readonly uri: vscode.Uri,
        showWorkspaceFolderDetails: boolean,
    ) {
        this.label = SamTemplateQuickPickItem.getLabel(uri)

        if (showWorkspaceFolderDetails) {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)

            if (workspaceFolder) {
                this.description = `in ${workspaceFolder.uri.fsPath}`
            }
        }
    }

    public compareTo(rhs: SamTemplateQuickPickItem): number {
        const labelComp = this.label.localeCompare(rhs.label)
        if (labelComp !== 0) {
            return labelComp
        }

        const descriptionComp = (this.description || '').localeCompare(rhs.description || '')
        if (descriptionComp !== 0) {
            return descriptionComp
        }

        return (this.detail || '').localeCompare(rhs.detail || '')
    }

    public static getLabel(uri: vscode.Uri): string {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)

        if (workspaceFolder) {
            // If workspace is /usr/foo/code and uri is /usr/foo/code/processor/template.yaml,
            // show "processor/template.yaml"
            return path.relative(workspaceFolder.uri.fsPath, uri.fsPath)
        }

        // We shouldn't find sam templates outside of a workspace folder. If we do, show the full path.
        console.warn(
            `Unexpected situation: detected SAM Template ${uri.fsPath} not found within a workspace folder.`
        )

        return uri.fsPath
    }
}

// https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-s3-bucket-naming-requirements.html
function validateS3Bucket(value: string): string | undefined {
    if (value.length < 3 || value.length > 63) {
        return localize(
            'AWS.samcli.deploy.s3Bucket.error.length',
            'S3 bucket name must be between 3 and 63 characters long'
        )
    }

    if (!/^[a-z\d\.\-]+$/.test(value)) {
        return localize(
            'AWS.samcli.deploy.s3Bucket.error.invalidCharacters',
            'S3 bucket name may only contain lower-case characters, numbers, periods, and dashes'
        )
    }

    if (/^\d+\.\d+\.\d+\.\d+$/.test(value)) {
        return localize(
            'AWS.samcli.deploy.s3Bucket.error.ipAddress',
            'S3 bucket name may not be formatted as an IP address (198.51.100.24)'
        )
    }

    if (value[value.length - 1] === '-') {
        return localize(
            'AWS.samcli.deploy.s3Bucket.error.endsWithDash',
            'S3 bucket name may not end with a dash'
        )
    }

    if (value.includes('..')) {
        return localize(
            'AWS.samcli.deploy.s3Bucket.error.consecutivePeriods',
            'S3 bucket name may not have consecutive periods'
        )
    }

    if (value.includes('.-') || value.includes('-.')) {
        return localize(
            'AWS.samcli.deploy.s3Bucket.error.dashAdjacentPeriods',
            'S3 bucket name may not contain a period adjacent to a dash'
        )
    }

    if (value.split('.').some(label => !/^[a-z\d]/.test(label))) {
        return localize(
            'AWS.samcli.deploy.s3Bucket.error.labelFirstCharacter',
            'Each label in an S3 bucket name must begin with a number or a lower-case character'
        )
    }

    return undefined
}

// https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_CreateStack.html
// A stack name can contain only alphanumeric characters (case sensitive) and hyphens.
// It must start with an alphabetic character and cannot be longer than 128 characters.
function validateStackName(value: string): string | undefined {
    if (!/^[a-zA-Z\d\-]+$/.test(value)) {
        return localize(
            'AWS.samcli.deploy.stackName.error.invalidCharacters',
            'A stack name may contain only alphanumeric characters (case sensitive) and hyphens'
        )
    }

    if (!/^[a-zA-Z]/.test(value)) {
        return localize(
            'AWS.samcli.deploy.stackName.error.firstCharacter',
            'A stack name must begin with an alphabetic character'
        )
    }

    if (value.length > 128) {
        return localize(
            'AWS.samcli.deploy.stackName.error.length',
            'A stack name must not be longer than 128 characters'
        )
    }

    // TODO: Validate that a stack with this name does not already exist.

    return undefined
}

async function getTemplateChoices(
    onDetectLocalTemplates: typeof detectLocalTemplates = detectLocalTemplates,
    ...workspaceFolders: vscode.Uri[]
): Promise<SamTemplateQuickPickItem[]> {
    const uris = await toArrayAsync(onDetectLocalTemplates({ workspaceUris: workspaceFolders }))

    const uriToLabel: Map<vscode.Uri, string> = new Map<vscode.Uri, string>()
    const labelCounts: Map<string, number> = new Map()

    uris.forEach(uri => {
        const label = SamTemplateQuickPickItem.getLabel(uri)
        uriToLabel.set(uri, label)
        labelCounts.set(label, 1 + (labelCounts.get(label) || 0))
    })

    return Array.from(
        uriToLabel,
        ([uri, label]) => {
            const showWorkspaceFolderDetails: boolean = (labelCounts.get(label) || 0) > 1

            return new SamTemplateQuickPickItem(uri, showWorkspaceFolderDetails)
        }
    )
        .sort((a, b) => a.compareTo(b))
}
