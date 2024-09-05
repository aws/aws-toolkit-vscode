/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { downloadSchemaItemCode } from '../eventSchemas/commands/downloadSchemaItemCode'
import { createSearchSchemasWebView } from './vue/searchSchemas'
import { viewSchemaItem } from '../eventSchemas/commands/viewSchemaItem'
import { RegistryItemNode } from '../eventSchemas/explorer/registryItemNode'
import { SchemaItemNode } from '../eventSchemas/explorer/schemaItemNode'
import { SchemasNode } from '../eventSchemas/explorer/schemasNode'
import { ExtContext } from '../shared/extensions'
import { Commands } from '../shared/vscode/commands2'

/**
 * Activate Schemas functionality for the extension.
 */
export async function activate(context: ExtContext): Promise<void> {
    await registerSchemasCommands(context)
}

async function registerSchemasCommands(context: ExtContext): Promise<void> {
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
