/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { DefaultS3Client } from '../../clients/s3Client'
import { createCommonButtons } from '../buttons'
import { createQuickPick, DataQuickPickItem } from '../pickerPrompter'
import type { SyncParams } from '../../sam/sync'
import * as nls from 'vscode-nls'
import * as vscode from 'vscode'
import { getRecentResponse } from '../../sam/utils'

const localize = nls.loadMessageBundle()
export const prefixNewBucketName = (name: string) => `newbucket:${name}`

export enum BucketSource {
    SamCliManaged,
    UserProvided,
}

/**
 * Creates a quick pick prompter for configuring S3 bucket used for sync or deploy application artifact
 * Provides two options:
 * 1. Create a SAM CLI managed bucket
 * 2. Specify an existing bucket
 * @param samCommandUrl URL to the SAM CLI command documentation
 * @returns A QuickPick prompter configured with bucket source options
 */
export function createBucketSourcePrompter(samCommandUrl: vscode.Uri) {
    const items: DataQuickPickItem<BucketSource>[] = [
        {
            label: 'Create a SAM CLI managed S3 bucket',
            data: BucketSource.SamCliManaged,
        },
        {
            label: 'Specify an S3 bucket',
            data: BucketSource.UserProvided,
        },
    ]

    return createQuickPick(items, {
        title: 'Specify S3 bucket for deployment artifacts',
        placeholder: 'Press enter to proceed with highlighted option',
        buttons: createCommonButtons(samCommandUrl),
    })
}

/**
 * Creates a quick pick prompter for configuring S3 bucket name used for sync or deploy application artifact
 * The prompter supports choosing from existing s3 bucket name or creating a new one
 * @param client S3 client
 * @param mementoRootKey Memento key to store recent bucket name (e.g 'samcli.deploy.params')
 * @param samCommandUrl URL to the SAM CLI command documentation
 * @returns A quick pick prompter configured with bucket name options
 */
export function createBucketNamePrompter(client: DefaultS3Client, mementoRootKey: string, samCommandUrl: vscode.Uri) {
    const recentBucket = getRecentResponse(mementoRootKey, client.regionCode, 'bucketName')
    const items = client.listBucketsIterable().map((b) => [
        {
            label: b.Name,
            data: b.Name as SyncParams['bucketName'],
            recentlyUsed: b.Name === recentBucket,
        },
    ])

    return createQuickPick(items, {
        title: 'Select an S3 Bucket',
        placeholder: 'Select a bucket (or enter a name to create one)',
        buttons: createCommonButtons(samCommandUrl),
        filterBoxInputSettings: {
            label: 'Create a New Bucket',
            // This is basically a hack. I need to refactor `createQuickPick` a bit.
            transform: (v) => prefixNewBucketName(v),
        },
        noItemsFoundItem: {
            label: localize(
                'aws.cfn.noStacks',
                'No S3 buckets for region "{0}". Enter a name to create a new one.',
                client.regionCode
            ),
            data: undefined,
            onClick: undefined,
        },
    })
}
