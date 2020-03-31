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
export async function activate(activateArguments: { context: vscode.ExtensionContext }): Promise<void> {
    await registerSchemasCommands(activateArguments.context)
}

async function registerSchemasCommands(context: vscode.ExtensionContext): Promise<void> {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'aws.viewSchemaItem',
            async (node: SchemaItemNode) => await viewSchemaItem(node)
        )
    )
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'aws.downloadSchemaItemCode',
            async (node: SchemaItemNode) => await downloadSchemaItemCode(node)
        )
    )
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'aws.searchSchema',
            async (node: SchemasNode) => await createSearchSchemasWebView({ node: node })
        )
    )
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'aws.searchSchemaPerRegistry',
            async (node: RegistryItemNode) => await createSearchSchemasWebView({ node: node })
        )
    )
}
