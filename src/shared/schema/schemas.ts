/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdirSync, writeFileSync } from 'fs-extra'
import * as path from 'path'
import * as vscode from 'vscode'
import * as filesystemUtilities from '../filesystemUtilities'
import { getLogger } from '../logger'
import { CompositeResourceFetcher } from '../resourcefetcher/compositeResourceFetcher'
import { FileResourceFetcher } from '../resourcefetcher/fileResourceFetcher'
import { HttpResourceFetcher } from '../resourcefetcher/httpResourceFetcher'
import { ResourceFetcher } from '../resourcefetcher/resourcefetcher'
import { normalizeSeparator } from '../utilities/pathUtils'
import { Schemas } from './schemaService'

const GOFORMATION_MANIFEST_URL = 'https://api.github.com/repos/awslabs/goformation/releases/latest'

export type SchemaType = 'cfn' | 'sam' | 'none'

/**
 * Loads JSON schemas for CFN and SAM templates.
 * Checks manifest and downloads new schemas if the manifest version has been bumped.
 * Uses local, predownloaded version if up-to-date or network call fails
 * If the user has not previously used the toolkit and cannot pull the manifest, does not provide template autocomplete.
 * @param extensionContext VSCode extension context
 */
export async function getSchemas(extensionContext: vscode.ExtensionContext): Promise<Schemas> {
    try {
        // Convert the paths to URIs which is what the YAML extension expects
        const cfnSchemaUri = vscode.Uri.file(
            normalizeSeparator(path.join(extensionContext.globalStoragePath, 'cloudformation.schema.json'))
        )
        const samSchemaUri = vscode.Uri.file(
            normalizeSeparator(path.join(extensionContext.globalStoragePath, 'sam.schema.json'))
        )
        const goformationSchemaVersion = await getTag(GOFORMATION_MANIFEST_URL)

        await getRemoteOrCachedFile({
            filepath: cfnSchemaUri.fsPath,
            version: goformationSchemaVersion,
            url: `https://raw.githubusercontent.com/awslabs/goformation/${goformationSchemaVersion}/schema/cloudformation.schema.json`,
            cacheKey: 'cfnSchemaVersion',
            extensionContext,
        })
        await getRemoteOrCachedFile({
            filepath: samSchemaUri.fsPath,
            version: goformationSchemaVersion,
            url: `https://raw.githubusercontent.com/awslabs/goformation/${goformationSchemaVersion}/schema/sam.schema.json`,
            cacheKey: 'samSchemaVersion',
            extensionContext,
        })
        return {
            cfn: cfnSchemaUri,
            sam: samSchemaUri,
        }
    } catch (e) {
        getLogger().error('Could not refresh schemas:', (e as Error).message)
        throw e
    }
}

/**
 * Retrieves tag name from a GitHub release manifest
 * @param manifestUrl release manifest url
 * @returns tag name
 */
export async function getTag(manifestUrl: string, fetcher?: HttpResourceFetcher): Promise<string | undefined> {
    let manifest: string | undefined
    try {
        const manifestFetcher = fetcher ?? new HttpResourceFetcher(manifestUrl, { showUrl: true })
        manifest = await manifestFetcher.get()
        if (!manifest) {
            throw new Error(`Schema manifest at ${manifestUrl} was undefined`)
        }
        const json = JSON.parse(manifest)
        if (json.tag_name) {
            return json.tag_name
        } else {
            throw new Error('Manifest did not include a tag_name')
        }
    } catch (e) {
        getLogger().error(`Failed getting manifest at ${manifestUrl}:`, e)
    }
}

/**
 * Pulls a remote version of file if the local version doesn't match the manifest version (does not check semver increases) or doesn't exist
 * Pulls local version of file if it does. Uses remote as baskup in case local doesn't exist
 * @param params.filepath Path to local file
 * @param params.version Remote version
 * @param params.url Url to fetch from
 * @param params.cacheKey Cache key to check version against
 * @param params.extensionContext VSCode extension context
 */
export async function getRemoteOrCachedFile(params: {
    filepath: string
    version?: string
    url: string
    cacheKey: string
    extensionContext: vscode.ExtensionContext
}): Promise<string> {
    const dir = path.parse(params.filepath).dir
    if (!(await filesystemUtilities.fileExists(dir))) {
        mkdirSync(dir, { recursive: true })
    }
    const cachedVersion = params.extensionContext.globalState.get<string>(params.cacheKey)
    const fetchers: ResourceFetcher[] = []
    if (params.version && params.version !== cachedVersion) {
        fetchers.push(
            new HttpResourceFetcher(params.url, {
                showUrl: true,
                // updates curr version
                onSuccess: contents => {
                    writeFileSync(params.filepath, contents)
                    params.extensionContext.globalState.update(params.cacheKey, params.version)
                },
            })
        )
    }
    fetchers.push(new FileResourceFetcher(params.filepath))
    const fetcher = new CompositeResourceFetcher(...fetchers)

    const result = await fetcher.get()
    if (!result) {
        throw new Error(`could not resolve schema at ${params.filepath}`)
    }
    return result
}
