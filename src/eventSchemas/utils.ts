/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { Schemas } from 'aws-sdk'
import * as vscode from 'vscode'
import { SchemaClient } from '../shared/clients/schemaClient'

export async function* listRegistryItems(client: SchemaClient): AsyncIterableIterator<Schemas.RegistrySummary> {
    const status = vscode.window.setStatusBarMessage(
        localize('AWS.message.statusBar.loading.registries', 'Loading Registry Items...')
    )

    try {
        yield* client.listRegistries()
    } finally {
        status.dispose()
    }
}

export async function* listSchemaItems(
    client: SchemaClient,
    registryName: string
): AsyncIterableIterator<Schemas.SchemaSummary> {
    const status = vscode.window.setStatusBarMessage(
        localize('AWS.message.statusBar.loading.schemaItems', 'Loading Schema Items...')
    )

    try {
        yield* client.listSchemas(registryName)
    } finally {
        status.dispose()
    }
}

export async function* searchSchemas(
    client: SchemaClient,
    keyword: string,
    registryName: string
): AsyncIterableIterator<Schemas.SearchSchemaSummary> {
    const status = vscode.window.setStatusBarMessage(
        localize('AWS.message.statusBar.searching.schemas', 'Searching Schemas...')
    )

    try {
        yield* client.searchSchemas(keyword, registryName)
    } finally {
        status.dispose()
    }
}
