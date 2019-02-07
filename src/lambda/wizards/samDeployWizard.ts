/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as path from 'path'
import * as vscode from 'vscode'
import { detectLocalTemplates } from '../local/detectLocalTemplates'
import { MultiStepWizard, WizardStep } from './multiStepWizard'

export interface SamDeployWizardArgs {
    template: vscode.Uri
    s3Bucket: string
    stackName: string
}

type WorkspaceFolderPickUri = Pick<vscode.WorkspaceFolder, 'uri'>

export interface SamDeployWizardContext {
    readonly onDetectLocalTemplates: typeof detectLocalTemplates

    readonly workspaceFolders: WorkspaceFolderPickUri[] | undefined

    showInputBox: typeof vscode.window.showInputBox

    showQuickPick: typeof vscode.window.showQuickPick
}

class DefaultSamDeployWizardContext implements SamDeployWizardContext {
    public readonly onDetectLocalTemplates = detectLocalTemplates

    public readonly showInputBox = vscode.window.showInputBox

    public readonly showQuickPick = vscode.window.showQuickPick

    public get workspaceFolders(): WorkspaceFolderPickUri[] | undefined {
        return vscode.workspace.workspaceFolders
    }
}

export class SamDeployWizard extends MultiStepWizard<SamDeployWizardArgs> {
    private template?: vscode.Uri
    private s3Bucket?: string
    private stackName?: string

    public constructor(
        private readonly context: SamDeployWizardContext = new DefaultSamDeployWizardContext()
    ) {
        super()
    }

    protected get startStep() {
        return this.TEMPLATE
    }

    protected getResult(): SamDeployWizardArgs | undefined {
        if (!this.template || !this.s3Bucket || !this.stackName) {
            return undefined
        }

        return {
            template: this.template,
            s3Bucket: this.s3Bucket,
            stackName: this.stackName
        }
    }

    private readonly TEMPLATE: WizardStep = async () => {
        const workspaceFolders = this.context.workspaceFolders || []
        const choice = await this.context.showQuickPick(
            await getTemplateChoices(this.context.onDetectLocalTemplates, ...workspaceFolders)
        )

        this.template = choice ? choice.uri : undefined

        return this.template ? this.S3_BUCKET : undefined
    }

    private readonly S3_BUCKET: WizardStep = async () => {
        this.s3Bucket = await this.context.showInputBox({
            value: this.s3Bucket,
            prompt: localize(
                'AWS.samcli.deploy.s3Bucket.prompt',
                'Enter the AWS S3 bucket to which your code should be deployed'
            ),
            placeHolder: localize(
                'AWS.samcli.deploy.s3Bucket.placeholder',
                'S3 bucket name'
            ),
            ignoreFocusOut: true,

            // https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-s3-bucket-naming-requirements.html
            validateInput(value: string): string | undefined | null | Thenable<string | undefined | null> {
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

                // TODO: Validate that a bucket with this name does not already exist.

                return undefined
            }
        })

        return this.s3Bucket ? this.STACK_NAME : this.TEMPLATE
    }

    private readonly STACK_NAME: WizardStep = async () => {
        this.stackName = await this.context.showInputBox({
            value: this.stackName,
            prompt: localize(
                'AWS.samcli.deploy.stackName.prompt',
                'Enter the name to use for the deployed stack'
            ),
            placeHolder: localize(
                'AWS.samcli.deploy.stackName.placeholder',
                'stack name'
            ),
            ignoreFocusOut: true,

            // https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_CreateStack.html
            // A stack name can contain only alphanumeric characters (case sensitive) and hyphens.
            // It must start with an alphabetic character and cannot be longer than 128 characters.
            validateInput(value: string): string | undefined | null | Thenable<string | undefined | null> {
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
        })

        return this.stackName ? undefined : this.S3_BUCKET
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

async function getTemplateChoices(
    onDetectLocalTemplates: typeof detectLocalTemplates = detectLocalTemplates,
    ...workspaceFolders: WorkspaceFolderPickUri[]
): Promise<SamTemplateQuickPickItem[]> {
    const result: SamTemplateQuickPickItem[] = []
    for await (const uri of onDetectLocalTemplates(...workspaceFolders)) {
        result.push(new SamTemplateQuickPickItem(uri))
    }

    return result
}
