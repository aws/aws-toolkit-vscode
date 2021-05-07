/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdirSync } from 'fs-extra'
import * as path from 'path'
import * as vscode from 'vscode'
import { extensionSettingsPrefix } from '../constants'
import { fileExists } from '../filesystemUtilities'
import { getLogger } from '../logger'
import { CompositeResourceFetcher } from './compositeResourceFetcher'
import { FileResourceFetcher } from './fileResourceFetcher'
import { HttpResourceFetcher } from './httpResourceFetcher'
import { ResourceFetcher } from './resourcefetcher'

/**
 * Attempts to pull down a manifest and transform it into a URL to get an artifact
 * @param manifestUrl URL to manifest
 * @param urlTransform Function to parse manifest and output the artifact path
 * @returns URL, or undefined if manifest was neither reachable nor transformable.
 */
export async function getManifestDetails(
    manifestUrl: string,
    urlTransform: (text: string) => { version: string; url: string } | undefined
): Promise<{ version: string; url: string } | undefined> {
    try {
        const manifestFetcher = new HttpResourceFetcher(manifestUrl, { showUrl: true })
        const manifest = await manifestFetcher.get()
        if (manifest) {
            return urlTransform(manifest)
        }
    } catch (e) {
        getLogger().error(`Failed getting manifest at ${manifestUrl}:`, e)
    }
}

/**
 * Checks an online manifest and does the following:
 * * If cached version is out of date/nonexistent, updates cached version on disk + updates cacheKey and returns the contents as a string
 * * If cache is current or there is an issue fetching upstream manifest/artifact, returns file cached on disk as a string
 * * Returns undefined if both remote and local copies can't be found.
 * @param params
 * @returns
 */
export async function getRemoteOrCachedFileWithManifest(params: {
    filepath: string
    manifestUrl: string
    urlTransform: (manifest: string) => { version: string; url: string } | undefined
    cacheKey: string
}): Promise<string | undefined> {
    const dir = path.parse(params.filepath).dir
    if (!fileExists(dir)) {
        mkdirSync(dir, { recursive: true })
    }
    const manifestDetails = await getManifestDetails(params.manifestUrl, params.urlTransform)
    const cachedVersion = vscode.workspace.getConfiguration(extensionSettingsPrefix).get<string>(params.cacheKey)

    const fetchers: ResourceFetcher[] = []
    if (manifestDetails && manifestDetails.version !== cachedVersion && manifestDetails.url) {
        fetchers.push(
            new HttpResourceFetcher(manifestDetails.url, {
                showUrl: true,
                pipeLocation: params.filepath,
                // updates curr version
                onSuccess: () =>
                    vscode.workspace
                        .getConfiguration(extensionSettingsPrefix)
                        .update(params.cacheKey, manifestDetails.version),
            })
        )
    }
    fetchers.push(new FileResourceFetcher(params.filepath))
    const fetcher = new CompositeResourceFetcher(...fetchers)

    return fetcher.get()
}
