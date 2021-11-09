/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createCommonButtons } from '../buttons'
import * as nls from 'vscode-nls'
import * as vscode from 'vscode'
import * as telemetry from '../../../shared/telemetry/telemetry'
import { createQuickPick, DataQuickPickItem, QuickPickPrompter } from '../pickerPrompter'
import { ext } from '../../extensionGlobals'
import { Bucket } from '../../clients/s3Client'
import { DefaultSettingsConfiguration, SettingsConfiguration } from '../../settingsConfiguration'
import { getLogger } from '../../logger'
import { extensionSettingsPrefix } from '../../constants'
import { validateBucketName } from '../../../s3/util'
import { showViewLogsMessage } from '../../utilities/messages'
import { partialCached } from '../../utilities/collectionUtils'

const localize = nls.loadMessageBundle()

export const CHOSEN_BUCKET_KEY = 'manuallySelectedBuckets'

async function* loadBuckets(region?: string, filter?: S3BucketPrompterOptions['filter']) {
    const mapBucket = (bucket: Bucket) => ({
        label: bucket.name,
        data: bucket,
    })

    // TODO: need to set the region correctly to the 'master' region per-partition
    // this was not done previously and would always try to use `us-east-1` regardless of partition
    const client = ext.toolkitClientBuilder.createS3Client(region ?? 'us-east-1')
    if (!region) {
        yield await client.listBuckets().then(({ buckets }) => buckets.filter(filter ?? (() => true)).map(mapBucket))
        return
    }

    for await (const bucket of client.listBucketsIterable()) {
        if (!filter || filter(bucket)) {
            yield mapBucket(bucket)
        }
    }
}

export interface SavedBuckets {
    [profile: string]: { [region: string]: string }
}

/**
 * The toolkit used to store saved buckets as a stringified JSON object. To ensure compatability,
 * we need to check for this and convert them into objects.
 */
export function readSavedBuckets(settings: SettingsConfiguration): SavedBuckets | undefined {
    try {
        const buckets = settings.readSetting<SavedBuckets | string | undefined>(CHOSEN_BUCKET_KEY)
        return typeof buckets === 'string' ? JSON.parse(buckets) : buckets
    } catch (e) {
        // If we fail to read settings then remove the bad data completely
        getLogger().error('Recent bucket JSON not parseable. Rewriting recent buckets from scratch...', e)
        settings.writeSetting(CHOSEN_BUCKET_KEY, {}, vscode.ConfigurationTarget.Global)
        return undefined
    }
}

/**
 * Writes a single new saved bucket to the stored buckets setting, combining previous saved data
 * if it exists. One saved bucket is limited per region per profile.
 */
export function writeSavedBucket(
    settings: SettingsConfiguration,
    profile: string,
    region: string,
    bucket: string
): void {
    const oldBuckets = readSavedBuckets(settings)

    settings.writeSetting(
        CHOSEN_BUCKET_KEY,
        {
            ...oldBuckets,
            [profile]: {
                ...(oldBuckets && oldBuckets[profile] ? oldBuckets[profile] : {}),
                [region]: bucket,
            },
        } as SavedBuckets,
        vscode.ConfigurationTarget.Global
    )
}

// key is currently *not* implemented but it would allow different prompts to save different buckets
function loadLastPickedBucket(profile: string, region: string, key?: string): string | undefined {
    const settings = new DefaultSettingsConfiguration(extensionSettingsPrefix)
    const existingBuckets = readSavedBuckets(settings)

    if (existingBuckets && profile && existingBuckets[profile] && existingBuckets[profile][region]) {
        return existingBuckets[profile][region]
    }
}

async function createNewBucket(region: string, name: string): Promise<Bucket | undefined> {
    const client = ext.toolkitClientBuilder.createS3Client(region)

    try {
        const newBucket = (await client.createBucket({ bucketName: name })).bucket
        getLogger().info('Created bucket: %O', newBucket.name)
        vscode.window.showInformationMessage(
            localize('AWS.s3.createBucket.success', 'Created bucket: {0}', newBucket.name)
        )
        telemetry.recordS3CreateBucket({ result: 'Succeeded' })
        return newBucket
    } catch (e) {
        showViewLogsMessage(
            localize('AWS.s3.createBucket.error.general', 'Failed to create bucket: {0}', (e as Error).message)
        )
        telemetry.recordS3CreateBucket({ result: 'Failed' })
    }
}

const DOES_NOT_EXIST = localize('AWS.prompts.s3Bucket.doesNotExists', 'Bucket does not exist, create one?')

export function validateBucket(name: string, region: string): string | undefined | Promise<string> {
    const checkName = validateBucketName(name)
    if (checkName) {
        return `$(error) ${checkName}`
    }

    const client = ext.toolkitClientBuilder.createS3Client(region)
    // For now we'll just treat any error as the bucket existing.
    // There's a few edge-cases here and we should only block if we _know_ that the bucket doesn't exist.
    return client
        .checkBucketExists(name)
        .catch(() => true)
        .then(exists => {
            return exists ? '' : `$(error) ${DOES_NOT_EXIST}`
        })
}

export interface S3BucketPrompterOptions {
    title?: string
    /** Lists all buckets in the account if no region is specified */
    region?: string
    profile?: string
    /** [NOT IMPLEMENTED] Changes where the 'recently used' buckets are saved. */
    settingsKey?: string
    noBucketMessage?: string
    bucketErrorMessage?: string
    filter?: (bucket: Bucket) => boolean
    /** These buckets are always shown. */
    baseBuckets?: string[]
    helpUri?: string | vscode.Uri
}

// TODO: rewrite as a form so the prompts can swap between QuickInput and InputBox for creating a new bucket
export function createS3BucketPrompter(options: S3BucketPrompterOptions = {}): QuickPickPrompter<Bucket> {
    const resolvedOptions = {
        noBucketMessage: localize('AWS.samcli.deploy.s3bucket.picker.noBuckets', 'No buckets found.'),
        bucketErrorMessage: localize(
            'AWS.samcli.deploy.s3bucket.picker.error',
            'There was an error loading S3 buckets.'
        ),
        ...options,
    }

    const { profile, region, settingsKey } = resolvedOptions

    const baseBuckets = (options.baseBuckets ?? []).concat(
        profile && region ? loadLastPickedBucket(profile, region, settingsKey) ?? [] : []
    )

    const filter = (bucket: Bucket) => {
        return baseBuckets.indexOf(bucket.name) === -1 && (!options.filter || options.filter(bucket))
    }

    const baseItems = baseBuckets.map(
        name =>
            ({
                label: name,
                data: { name },
                recentlyUsed: true,
            } as DataQuickPickItem<Bucket>)
    )

    const prompter = createQuickPick(baseItems, {
        title: options.title ?? localize('AWS.prompts.s3Bucket.title', 'Select an AWS S3 Bucket'),
        matchOnDetail: true,
        buttons: createCommonButtons(options.helpUri),
        itemLoader: partialCached((region?: string) => loadBuckets(region, filter), region),
        placeholder: localize(
            'AWS.prompts.s3Bucket.placeholder',
            'Select a bucket you own or enter a name for a bucket'
        ),
        filterBoxInput: {
            label: localize('AWS.prompts.s3Bucket.filterBox.label', 'Enter bucket name: '),
            transform: resp => ({ name: resp } as Bucket),
            validator: val => validateBucket(val, region ?? 'us-east-1'),
        },
        noItemsFoundItem: resolvedOptions.noBucketMessage,
    })

    prompter.quickPick.onDidAccept(() => {
        const active = prompter.quickPick.activeItems[0]
        if (active && active.invalidSelection && active.detail?.includes(DOES_NOT_EXIST)) {
            createNewBucket(region ?? 'us-east-1', active.description!).then(bucket => {
                prompter.refreshItems()
            })
        }
    })

    return prompter
}
