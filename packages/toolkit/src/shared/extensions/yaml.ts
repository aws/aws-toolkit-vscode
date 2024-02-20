/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { readFileSync } from 'fs-extra'
import { VSCODE_EXTENSION_ID } from '../extensions'
import { getLogger } from '../logger/logger'
import { getIdeProperties } from '../extensionUtilities'
import { activateExtension } from '../utilities/vsCodeUtils'
import { AWS_SCHEME } from '../constants'

// sourced from https://github.com/redhat-developer/vscode-yaml/blob/3d82d61ea63d3e3a9848fe6b432f8f1f452c1bec/src/schema-extension-api.ts
// removed everything that is not currently being used
interface YamlExtensionApi {
    registerContributor(
        schema: string,
        requestSchema: (resource: string) => string | undefined,
        requestSchemaContent: (uri: string) => string,
        label?: string
    ): boolean
}

function applyScheme(scheme: string, path: vscode.Uri): vscode.Uri {
    return path.with({ scheme })
}

function evaluate(schema: vscode.Uri | (() => vscode.Uri)): vscode.Uri {
    return schema instanceof Function ? schema() : schema
}

export interface YamlExtension {
    assignSchema(path: vscode.Uri, schema: vscode.Uri | (() => vscode.Uri)): void
    removeSchema(path: vscode.Uri): void
    getSchema(path: vscode.Uri): vscode.Uri | undefined
}

export async function activateYamlExtension(): Promise<YamlExtension | undefined> {
    const schemaMap = new Map<string, vscode.Uri>()

    const yamlExt = await activateExtension<YamlExtensionApi>(VSCODE_EXTENSION_ID.yaml)
    if (!yamlExt) {
        return undefined
    }
    yamlExt.exports.registerContributor(
        AWS_SCHEME,
        resource => {
            return schemaMap.get(resource)?.toString()
        },
        uri => {
            try {
                // SLOW: This request happens on every keystroke! (5MB+ read from filesystem).
                // This is a design flaw in this registerContributor() API.
                return readFileSync(vscode.Uri.parse(uri).fsPath).toString()
            } catch (e) {
                getLogger().error(`YAML Extension: failed to read schema URI "${uri}": ${e}`)
                throw new Error(`${getIdeProperties().company} Toolkit could not parse JSON schema URI: ${uri}`)
            }
        }
    )

    return {
        assignSchema: (path, schema) => schemaMap.set(path.toString(), applyScheme(AWS_SCHEME, evaluate(schema))),
        removeSchema: path => schemaMap.delete(path.toString()),
        getSchema: path => schemaMap.get(path.toString()),
    }
}
