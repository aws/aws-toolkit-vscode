/*!
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { S3 } from 'aws-sdk'
import { DefaultS3Client, S3Client } from '../../clients/s3Client'
import globals from '../../extensionGlobals'
import { createCommonButtons, PrompterButtons } from '../buttons'
import { createQuickPick } from '../pickerPrompter'
import { getLogger } from '../../logger/logger'

interface BucketPrompterOptions {
    readonly s3Client?: S3Client
    readonly title?: string
    readonly buttons?: PrompterButtons<string>
    readonly helpUrl?: string | vscode.Uri
}
export async function createBucketPrompter(region: string, options: BucketPrompterOptions = {}) {
    const lastBucketKey = 'lastSelectedBucket'
    const lastBucket = globals.context.globalState.get<S3.Bucket>(lastBucketKey)
    const client = options.s3Client ?? new DefaultS3Client(region)

    const response = await client.listBuckets()
    const items = response.buckets.map(b => {
        return {
            label: b.name,
            data: b.name,
            recentlyUsed: b.name === lastBucket,
        }
    })

    const prompter = createQuickPick(items, {
        title: options.title ?? 'Select an S3 Bucket',
        placeholder: 'Filter bucket name',
        buttons: createCommonButtons(options.helpUrl),
    })

    return prompter.transform(item => {
        getLogger().debug('createBucketPrompter: selected %O', item)
        globals.context.globalState.update(lastBucketKey, item)
        return item
    })
}
