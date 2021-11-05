/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createPlusButton, PrompterButtons } from '../buttons'
import * as nls from 'vscode-nls'
import * as vscode from 'vscode'
import { createInputBox } from '../inputPrompter'
import { createQuickPick, DataQuickPickItem, QuickPickPrompter } from '../pickerPrompter'
import { ext } from '../../extensionGlobals'
import { Bucket } from '../../clients/s3Client'
import { DefaultSettingsConfiguration, SettingsConfiguration } from '../../settingsConfiguration'
import { getLogger } from '../../logger'
import { extensionSettingsPrefix } from '../../constants'
import { isValidResponse, WizardControl, WIZARD_RETRY } from '../../wizards/wizard'
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
    const client = ext.toolkitClientBuilder.createS3Client(region ?? 'us-east-1')
    if (!region) {
        return client.listBuckets().then(({ buckets }) => buckets.map(mapBucket))
    }

    for await (const bucket of client.listBucketsIterable()) {
        if (!filter || filter(bucket)) {
            yield [mapBucket(bucket)]
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

// key is currently implemented but it would allow different prompts to save different buckets
function loadLastPickedBucket(profile: string, region: string, key?: string): string | undefined {
    const settings = new DefaultSettingsConfiguration(extensionSettingsPrefix)
    const existingBuckets = readSavedBuckets(settings)

    if (existingBuckets && profile && existingBuckets[profile] && existingBuckets[profile][region]) {
        return existingBuckets[profile][region]
    }
}

async function createNewBucket(region: string): Promise<Bucket | WizardControl> {
    const prompter = createInputBox({
        title: localize('AWS.s3.createBucket.prompt', 'Enter a new bucket name'),
        validateInput: validateBucketName,
    })

    const response = await prompter.prompt()

    if (!isValidResponse(response)) {
        return WIZARD_RETRY
    }

    try {
        const s3Client = ext.toolkitClientBuilder.createS3Client(region!)
        const newBucket = (await s3Client.createBucket({ bucketName: response })).bucket
        getLogger().info('Created bucket: %O', newBucket.name)
        vscode.window.showInformationMessage(
            localize('AWS.s3.createBucket.success', 'Created bucket: {0}', newBucket.name)
        )
        //telemetry.recordS3CreateBucket({ result: 'Succeeded' })
        return newBucket
    } catch (e) {
        showViewLogsMessage(localize('AWS.s3.createBucket.error.general', 'Failed to create bucket: {0}', response))
        //telemetry.recordS3CreateBucket({ result: 'Failed' })
        return WIZARD_RETRY
    }
}

export interface S3BucketPrompterOptions {
    /** Lists all buckets in the account if no region is specified */
    region?: string
    profile?: string
    settingsKey?: string
    promptTitle?: string
    noBucketMessage?: string
    bucketErrorMessage?: string
    filter?: (bucket: Bucket) => boolean
    /** These are always shown and will automatically be created if they do not exist if the user selects them */
    baseBuckets?: string[]
    extraButtons?: PrompterButtons<Bucket>
}

const CREATE_NEW_BUCKET = localize('AWS.command.s3.createBucket', 'Create Bucket...')
const ENTER_BUCKET = localize('AWS.samcli.deploy.bucket.existingLabel', 'Enter Existing Bucket Name...')

// TODO: rewrite as a form so the prompts can swap between QuickInput and InputBox for creating a new bucket
export function createS3BucketPrompter(options: S3BucketPrompterOptions = {}): QuickPickPrompter<Bucket> {
    ;(options.noBucketMessage =
        options.noBucketMessage ?? localize('AWS.samcli.deploy.s3bucket.picker.noBuckets', 'No buckets found.')),
        (options.bucketErrorMessage =
            options.bucketErrorMessage ??
            localize('AWS.samcli.deploy.s3bucket.picker.error', 'There was an error loading S3 buckets.'))

    const baseBuckets = (options.baseBuckets ?? []).concat(
        (options.profile &&
            options.region &&
            loadLastPickedBucket(options.profile, options.region, options.settingsKey)) ||
            []
    )

    const createBucket = createPlusButton(CREATE_NEW_BUCKET)
    const baseItems = baseBuckets.map(name => ({ label: name, data: { name } } as DataQuickPickItem<Bucket>))

    const filter = (bucket: Bucket) => {
        return baseBuckets.indexOf(bucket.name) === -1 && (options.filter === undefined || options.filter(bucket))
    }

    const prompter = createQuickPick(baseItems, {
        title:
            options.promptTitle ??
            localize('AWS.samcli.deploy.s3Bucket.prompt', 'Select an AWS S3 Bucket to deploy code to'),
        matchOnDetail: true,
        buttons: [createBucket].concat(options.extraButtons ?? []),
        itemLoader: partialCached((region?: string) => loadBuckets(region ?? 'us-east-1', filter), options.region),
        placeholder: localize('', 'Select a bucket or enter a name'),
        filterBoxInputSettings: {
            label: localize('', 'Bucket name: '),
            transform: resp => ({ name: resp } as Bucket),
            validator: validateBucketName,
        },
    })

    createBucket.onClick = () => {
        createNewBucket(options.region ?? 'us-east-1')
    }

    return prompter
}
