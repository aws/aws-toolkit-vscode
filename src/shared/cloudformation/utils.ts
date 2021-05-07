/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import { getLogger } from '../logger'
import { getRemoteOrCachedFileWithManifest } from '../resourcefetcher/utils'
import { normalizeSeparator } from '../utilities/pathUtils'
import { getWorkspaceRelativePath } from '../utilities/workspaceUtils'

export let CFN_SCHEMA_PATH = ''
export let SAM_SCHEMA_PATH = ''
const MANIFEST_URL = 'https://api.github.com/repos/awslabs/goformation/releases/latest'

export async function refreshSchemas(extensionContext: vscode.ExtensionContext) {
    CFN_SCHEMA_PATH = path.join(extensionContext.globalStoragePath, 'cloudformation.schema.json')
    SAM_SCHEMA_PATH = path.join(extensionContext.globalStoragePath, 'sam.schema.json')
    await getRemoteOrCachedFileWithManifest({
        filepath: CFN_SCHEMA_PATH,
        manifestUrl: MANIFEST_URL,
        urlTransform: manifest => {
            try {
                const json = JSON.parse(manifest)
                if (json.tag_name) {
                    return {
                        url: `https://raw.githubusercontent.com/awslabs/goformation/${json.tag_name}/schema/cloudformation.schema.json`,
                        version: json.tag_name,
                    }
                }
            } catch (e) {
                getLogger().error(`Goformation manifest not parseable to JSON`)
                return undefined
            }
        },
        cacheKey: 'cfnSchemaVersion',
    })
    await getRemoteOrCachedFileWithManifest({
        filepath: SAM_SCHEMA_PATH,
        manifestUrl: MANIFEST_URL,
        urlTransform: manifest => {
            try {
                const json = JSON.parse(manifest)
                if (json.tag_name) {
                    return {
                        url: `https://raw.githubusercontent.com/awslabs/goformation/${json.tag_name}/schema/sam.schema.json`,
                        version: json.tag_name,
                    }
                }
            } catch (e) {
                getLogger().error(`Goformation manifest not parseable to JSON`)
                return undefined
            }
        },
        cacheKey: 'samSchemaVersion',
    })
}

/**
 * Pairs a template file to a CFN or SAM schema.
 * If present, removes association with the other type of schema.
 * Does not modify other schemas not managed by AWS.
 * @param path Template file path
 * @param type Template type to use for filepath
 */
export async function updateYamlSchemasArray(path: string, type: 'cfn' | 'sam'): Promise<void> {
    const config = vscode.workspace.getConfiguration('yaml')
    const relPath = normalizeSeparator(getWorkspaceRelativePath(path) ?? path)
    const schemas: { [key: string]: string | string[] } | undefined = config.get('schemas')
    const writeTo = type === 'cfn' ? CFN_SCHEMA_PATH : SAM_SCHEMA_PATH
    const deleteFrom = type === 'sam' ? CFN_SCHEMA_PATH : SAM_SCHEMA_PATH
    let newWriteArr: string[] = []
    let newDeleteArr: string[] = []

    if (schemas) {
        if (schemas[writeTo]) {
            newWriteArr = Array.isArray(schemas[writeTo])
                ? (schemas[writeTo] as string[])
                : [schemas[writeTo] as string]
            if (!newWriteArr.includes(relPath)) {
                newWriteArr.push(relPath)
            }
        }
        if (schemas[deleteFrom]) {
            const temp = Array.isArray(schemas[deleteFrom])
                ? (schemas[deleteFrom] as string[])
                : [schemas[deleteFrom] as string]
            newDeleteArr = temp.filter(val => val !== relPath)
        }
    }

    config.update('schemas', {
        ...(schemas ? schemas : {}),
        [writeTo]: newWriteArr,
        [deleteFrom]: newDeleteArr,
    })
}
