/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as path from 'path'
import * as vscode from 'vscode'
import { AWSContextCommands } from '../../shared/awsContextCommands'
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

    showInputBox: typeof vscode.window.showInputBox

    showQuickPick: typeof vscode.window.showQuickPick
}

class DefaultSamDeployWizardContext implements SamDeployWizardContext {
    public readonly onDetectLocalTemplates = detectLocalTemplates

    public readonly showInputBox = vscode.window.showInputBox

    public readonly showQuickPick = vscode.window.showQuickPick

    public get workspaceFolders(): vscode.Uri[] | undefined {
        return (vscode.workspace.workspaceFolders || []).map(f => f.uri)
    }
}

export class SamDeployWizard extends MultiStepWizard<SamDeployWizardResponse> {
    private readonly response: Partial<SamDeployWizardResponse> = {}

    public constructor(
        private readonly contextCommands: Pick<AWSContextCommands, 'onCommandSelectRegion'>,
        private readonly context: SamDeployWizardContext = new DefaultSamDeployWizardContext()
    ) {
        super()
    }

    protected get startStep() {
        return this.REGION
    }

    protected getResult(): SamDeployWizardResponse | undefined {
        if (!this.response.region || !this.response.template || !this.response.s3Bucket || !this.response.stackName) {
            return undefined
        }

        return {
            region: this.response.region,
            template: this.response.template,
            s3Bucket: this.response.s3Bucket,
            stackName: this.response.stackName
        }
    }

    private readonly REGION: WizardStep = async () => {
        this.response.region = await this.contextCommands.onCommandSelectRegion()

        return this.response.region ? this.TEMPLATE : undefined
    }

    private readonly TEMPLATE: WizardStep = async () => {
        const workspaceFolders = this.context.workspaceFolders || []
        const choice = await this.context.showQuickPick(
            await getTemplateChoices(this.context.onDetectLocalTemplates, ...workspaceFolders)
        )

        this.response.template = choice ? choice.uri : undefined

        return this.response.template ? this.S3_BUCKET : undefined
    }

    private readonly S3_BUCKET: WizardStep = async () => {
        this.response.s3Bucket = await this.context.showInputBox({
            value: this.response.s3Bucket,
            prompt: localize(
                'AWS.samcli.deploy.s3Bucket.prompt',
                'Enter the AWS S3 bucket to which your code should be deployed'
            ),
            placeHolder: localize(
                'AWS.samcli.deploy.s3Bucket.placeholder',
                'S3 bucket name'
            ),
            ignoreFocusOut: true,
            validateInput: validateS3Bucket
        })

        return this.response.s3Bucket ? this.STACK_NAME : this.TEMPLATE
    }

    private readonly STACK_NAME: WizardStep = async () => {
        this.response.stackName = await this.context.showInputBox({
            value: this.response.stackName,
            prompt: localize(
                'AWS.samcli.deploy.stackName.prompt',
                'Enter the name to use for the deployed stack'
            ),
            placeHolder: localize(
                'AWS.samcli.deploy.stackName.placeholder',
                'Stack name'
            ),
            ignoreFocusOut: true,
            validateInput: validateStackName
        })

        return this.response.stackName ? undefined : this.S3_BUCKET
    }
}

class SamTemplateQuickPickItem implements vscode.QuickPickItem {
    public readonly label: string

    public readonly description: string

    public constructor(
        public readonly uri: vscode.Uri
    ) {
        this.label = path.basename(uri.fsPath)
        this.description = path.dirname(uri.fsPath)
    }
}

// https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-s3-bucket-naming-requirements.html
function validateS3Bucket(value: string): string | undefined | null | Thenable<string | undefined | null> {
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
function validateStackName(value: string): string | undefined | null | Thenable<string | undefined | null> {
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
    const result: SamTemplateQuickPickItem[] = []
    for await (const uri of onDetectLocalTemplates({ workspaceUris: workspaceFolders })) {
        result.push(new SamTemplateQuickPickItem(uri))
    }

    return result
}
