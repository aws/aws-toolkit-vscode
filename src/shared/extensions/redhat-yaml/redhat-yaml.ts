/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ExtensionAPI as SchemaApi } from './schema-extension-api'
import { readFileSync } from 'fs-extra'

const EXTENSION_ID = 'redhat.vscode-yaml'
const AWS_SCHEME = 'aws-schema'
const mappings: Map<string, vscode.Uri> = new Map()

async function getSchemaApi(): Promise<SchemaApi> {
    const ext = vscode.extensions.getExtension(EXTENSION_ID)
    if (ext !== undefined) {
        return (await ext.activate())
    }
    throw new Error('Redhat YAML extension does not exist')
}

async function activate(): Promise<void> {
    const api = await getSchemaApi()

    api.registerContributor(AWS_SCHEME, resource => {
        return mappings.get(resource)?.toString()
    }, uri => { 
        return readFileSync(vscode.Uri.parse(uri).fsPath).toString()
    })
}

export function assignSchema(path: vscode.Uri, schema: vscode.Uri): void {
    const yamlExtension = vscode.extensions.getExtension(EXTENSION_ID)
    // tries to activate the extension every time the call is made
    // VSC offers no API to detecting when another extension is activated, so the alternative is to make a 
    // best-effort attempt at adding the hooks. this may miss detection if we add all schemas before the 
    // extension is ever activated.
    if (yamlExtension) {
        activate()
    }

    schema = vscode.Uri.parse(`${AWS_SCHEME}://${schema.fsPath}`)
    mappings.set(path.toString(), schema)
}

export function removeSchema(path: vscode.Uri): void {
    mappings.delete(path.toString())
}