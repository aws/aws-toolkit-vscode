/*!
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { createQuickPick, DataQuickPickItem } from '../../shared/ui/pickerPrompter'
import { createCommonButtons } from '../../shared/ui/buttons'
import { uploadLambdaCommand } from './uploadLambda'
import { CancellationError } from '../../shared/utilities/timeoutUtils'
import { uploadFileCommand } from '../../s3/commands/uploadFile'
import { createRegionPrompter } from '../../shared/ui/common/region'
import { Wizard } from '../../shared/wizards/wizard'
import { DefaultS3Client } from '../../shared/clients/s3Client'

export interface UploadToAwsWizardState {
    readonly resource: 's3' | 'lambda'
    readonly region?: string
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
        // region is needed to create an S3 client for the upload command
        this.form.region.bindPrompter(() => createRegionPrompter().transform(region => region.id), {
            showWhen: ({ resource }) => resource === 's3',
        })
    }
}

export async function uploadToAwsCommand(fileOrFolder: vscode.Uri) {
    const response = await new UploadToAwsWizard().run()

    if (!response) {
        throw new CancellationError('user')
    }

    if (response.resource === 's3') {
        if (response.region) {
            const s3 = new DefaultS3Client(response.region)
            await uploadFileCommand(s3, fileOrFolder)
        }
    }

    if (response.resource === 'lambda') {
        await uploadLambdaCommand(undefined, fileOrFolder)
    }
}
