/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createCommonButtons } from '../buttons'
import * as nls from 'vscode-nls'
import * as vscode from 'vscode'
import * as telemetry from '../../../shared/telemetry/telemetry'
import { createLabelQuickPick, createQuickPick, DataQuickPickItem, QuickPickPrompter } from '../pickerPrompter'
import { ext } from '../../extensionGlobals'
import { Bucket } from '../../clients/s3Client'
import { DefaultSettingsConfiguration, SettingsConfiguration } from '../../settingsConfiguration'
import { getLogger } from '../../logger'
import { extensionSettingsPrefix } from '../../constants'
import { validateBucketName } from '../../../s3/util'
import { showViewLogsMessage } from '../../utilities/messages'
import { deferredCached } from '../../utilities/collectionUtils'
import { addCodiconToString } from '../../utilities/textUtilities'
import { isCloud9 } from '../../extensionUtilities'
import { Prompter, PrompterConfiguration, PromptResult } from '../prompter'
import { isValidResponse, WIZARD_BACK, WIZARD_RETRY } from '../../wizards/wizard'

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

// TODO: potentially use a memento to allow the saved buckets to be stored at different keys
function loadLastPickedBucket(profile: string, region: string): string | undefined {
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

const DOES_NOT_EXIST = localize('AWS.prompts.s3Bucket.doesNotExists', 'Bucket does not exist, select to create')

export function validateBucket(name: string, region: string): string | undefined | Promise<string> {
    const checkName = validateBucketName(name)
    if (checkName) {
        return addCodiconToString('error', checkName)
    }

    const client = ext.toolkitClientBuilder.createS3Client(region)
    // For now we'll just treat any error as the bucket existing.
    // There's a few edge-cases here and we should only block if we _know_ that the bucket doesn't exist.
    /*
    return client
        .checkBucketExists(name)
        .catch(() => true)
        .then(exists => {
            return exists ? '' : addCodiconToString('error', DOES_NOT_EXIST)
        })
    */
}

export interface S3BucketPrompterOptions {
    title?: string
    /** Lists all buckets in the account if no region is specified */
    region?: string
    profile?: string
    noBucketMessage?: string
    bucketErrorMessage?: string
    filter?: (bucket: Bucket) => boolean
    /** These buckets are always shown. */
    baseBuckets?: string[]
    helpUri?: string | vscode.Uri
}

export class S3BucketPrompter extends Prompter<Bucket> {
    private _recentItem: Bucket | undefined

    constructor(private readonly options: S3BucketPrompterOptions) {
        super()
    }

    public get recentItem(): Bucket | undefined {
        return this._recentItem
    }
    public set recentItem(response: Bucket | undefined) {
        this._recentItem = response ?? this._recentItem
    }
    protected async promptUser(config: PrompterConfiguration<Bucket>): Promise<PromptResult<Bucket>> {
        const bucketPrompt = createS3BucketPrompter(this.options)
        const bucket = await bucketPrompt.promptControl(config)

        if (!isValidResponse(bucket)) {
            return bucket
        }

        const client = ext.toolkitClientBuilder.createS3Client(this.options.region ?? 'us-east-1')
        // For now we'll just treat any error as the bucket existing.
        // There's a few edge-cases here and we should only block if we _know_ that the bucket doesn't exist.
        const exists = await client.checkBucketExists(bucket.name).catch(() => true)

        if (!exists) {
            const createBucketPrompter = createQuickPick(
                [
                    {
                        label: 'Yes',
                        data: async () => client.createBucket({ bucketName: bucket.name }).then(r => r.bucket),
                    },
                    {
                        label: 'No',
                        data: WIZARD_RETRY,
                    },
                ],
                {
                    title: 'Bucket does not exist. Create a new one?',
                }
            )
            createBucketPrompter.recentItem = this._recentItem
            createBucketPrompter.onResponse(b => (this._recentItem = b))
            const newConfig = { ...config }
            delete newConfig.steps
            return createBucketPrompter.promptControl(newConfig)
        }

        return bucket
    }
}

export function createS3BucketPrompter(options: S3BucketPrompterOptions = {}): QuickPickPrompter<Bucket> {
    const resolvedOptions = {
        noBucketMessage: localize('AWS.samcli.deploy.s3bucket.picker.noBuckets', 'No buckets found.'),
        bucketErrorMessage: localize(
            'AWS.samcli.deploy.s3bucket.picker.error',
            'There was an error loading S3 buckets.'
        ),
        ...options,
    }

    const { profile, region } = resolvedOptions

    const baseBuckets = (options.baseBuckets ?? []).concat(
        profile && region ? loadLastPickedBucket(profile, region) ?? [] : []
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

    const prompter = createQuickPick(
        deferredCached((region?: string) => loadBuckets(region, filter), region),
        {
            title: options.title ?? localize('AWS.prompts.s3Bucket.title', 'Select an AWS S3 Bucket'),
            matchOnDetail: true,
            buttons: createCommonButtons(options.helpUri),
            baseItems,
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
        }
    )

    // The below logic is bypassing the normal `prompter` control flow and manipulating it externally
    // This is not the preferred way to implement actions from the 'filter box' item, though it works for now
    /*
    prompter.quickPick.onDidAccept(() => {
        const active = prompter.quickPick.activeItems[0]
        if (active && active.invalidSelection && active.detail?.includes(DOES_NOT_EXIST)) {
            const createBucket = createNewBucket(region ?? 'us-east-1', active.description!).then(bucket => {
                if (bucket) {
                    prompter.refreshItems().then(() => {
                        // Cloud9 seems a bit buggy with their ext. host API
                        // certain fields aren't updated when they should be
                        if (isCloud9()) {
                            return
                        }
                        prompter.quickPick.selectedItems = prompter.quickPick.items.filter(
                            i => i.label === bucket?.name
                        )
                    })
                }
                return []
            })
            prompter.loadItems(createBucket, true)
        }
    })
    */

    return prompter
}
