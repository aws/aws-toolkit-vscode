/*!
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { createQuickPick, DataQuickPickItem } from './ui/pickerPrompter'
import { createCommonButtons } from './ui/buttons'
import { CancellationError } from './utilities/timeoutUtils'
import { Wizard } from './wizards/wizard'

export interface UploadToAwsWizardState {
    readonly resource: 's3' | 'lambda'
}

function createChooseResourcePrompter() {
    const items: DataQuickPickItem<'s3' | 'lambda'>[] = [
        { label: 'Upload to S3', data: 's3', detail: undefined },
        { label: 'Upload to Lambda', data: 'lambda', detail: undefined },
    ]
    return createQuickPick(items, {
        title: 'Choose an action',
        buttons: createCommonButtons(),
    })
}

export class UploadToAwsWizard extends Wizard<UploadToAwsWizardState> {
    constructor() {
        super()
        this.form.resource.bindPrompter(() => createChooseResourcePrompter())
    }
}

export async function uploadToAwsCommand(fileOrFolder: vscode.Uri) {
    const response = await new UploadToAwsWizard().run()

    if (!response) {
        throw new CancellationError('user')
    }

    if (response.resource === 's3') {
        vscode.commands.executeCommand('aws.s3.uploadFile', fileOrFolder)
    } else if (response.resource === 'lambda') {
        vscode.commands.executeCommand('aws.uploadLambda', fileOrFolder)
    }
}
