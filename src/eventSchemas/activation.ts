/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { downloadSchemaItemCode } from '../eventSchemas/commands/downloadSchemaItemCode'
import { createSearchSchemasWebView } from '../eventSchemas/commands/searchSchemas'
import { viewSchemaItem } from '../eventSchemas/commands/viewSchemaItem'
import { RegistryItemNode } from '../eventSchemas/explorer/registryItemNode'
import { SchemaItemNode } from '../eventSchemas/explorer/schemaItemNode'
import { SchemasNode } from '../eventSchemas/explorer/schemasNode'
import { registerCommand } from '../shared/telemetry/telemetryUtils'

/**
 * Activate Schemas functionality for the extension.
 */
export async function activate(): Promise<void> {
    await registerSchemasCommands()
}

async function registerSchemasCommands(): Promise<void> {
    registerCommand({
        command: 'aws.viewSchemaItem',
        callback: async (node: SchemaItemNode) => await viewSchemaItem(node),
        telemetryName: 'schemas_view'
    })

    registerCommand({
        command: 'aws.downloadSchemaItemCode',
        callback: async (node: SchemaItemNode) => await downloadSchemaItemCode(node),
        telemetryName: 'schemas_download'
    })

    registerCommand({
        command: 'aws.searchSchema',
        callback: async (node: SchemasNode) =>
            await createSearchSchemasWebView({
                node: node
            }),
        telemetryName: 'schemas_search'
    })

    registerCommand({
        command: 'aws.searchSchemaPerRegistry',
        callback: async (node: RegistryItemNode) =>
            await createSearchSchemasWebView({
                node: node
            }),
        telemetryName: 'schemas_search'
    })
}
