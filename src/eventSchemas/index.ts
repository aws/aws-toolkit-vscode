/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { downloadSchemaItemCode } from './commands/downloadSchemaItemCode'
import { createSearchSchemasWebView } from './vue/searchSchemas'
import { viewSchemaItem } from './commands/viewSchemaItem'
import { RegistryItemNode } from './explorer/registryItemNode'
import { SchemaItemNode } from './explorer/schemaItemNode'
import { SchemasNode } from './explorer/schemasNode'
import type { extcontext } from '../modules.gen'
import { Commands } from '../shared/vscode/commands2'

/**
 * Activate Schemas functionality for the extension.
 */
export async function activate(_: vscode.ExtensionContext, context: extcontext): Promise<void> {
    await registerSchemasCommands(context)
}

async function registerSchemasCommands(context: extcontext): Promise<void> {
    context.extensionContext.subscriptions.push(
        Commands.register('aws.viewSchemaItem', async (node: SchemaItemNode) => await viewSchemaItem(node)),
        Commands.register(
            'aws.downloadSchemaItemCode',
            async (node: SchemaItemNode) => await downloadSchemaItemCode(node, context.outputChannel)
        ),
        Commands.register(
            'aws.searchSchema',
            async (node: SchemasNode) => await createSearchSchemasWebView(context, node)
        ),
        Commands.register(
            'aws.searchSchemaPerRegistry',
            async (node: RegistryItemNode) => await createSearchSchemasWebView(context, node)
        )
    )
}
