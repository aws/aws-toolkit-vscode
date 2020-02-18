/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { downloadSchemaItemCode } from '../eventSchemas/commands/downloadSchemaItemCode'
import { createSearchSchemasWebView } from '../eventSchemas/commands/searchSchemas'
import { viewSchemaItem } from '../eventSchemas/commands/viewSchemaItem'
import { RegistryItemNode } from '../eventSchemas/explorer/registryItemNode'
import { SchemaItemNode } from '../eventSchemas/explorer/schemaItemNode'
import { SchemasNode } from '../eventSchemas/explorer/schemasNode'

/**
 * Activate Schemas functionality for the extension.
 */
export async function activate(): Promise<void> {
    await registerSchemasCommands()
}

async function registerSchemasCommands(): Promise<void> {
    vscode.commands.registerCommand('aws.viewSchemaItem', async (node: SchemaItemNode) => await viewSchemaItem(node))
    vscode.commands.registerCommand(
        'aws.downloadSchemaItemCode',
        async (node: SchemaItemNode) => await downloadSchemaItemCode(node)
    )
    vscode.commands.registerCommand(
        'aws.searchSchema',
        async (node: SchemasNode) => await createSearchSchemasWebView({ node: node })
    )
    vscode.commands.registerCommand(
        'aws.searchSchemaPerRegistry',
        async (node: RegistryItemNode) => await createSearchSchemasWebView({ node: node })
    )
}
