/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { copyTagUri } from './commands/copyTagUri'
import { copyRepositoryUri } from './commands/copyRepositoryUri'
import { createRepository } from './commands/createRepository'
import { deleteRepository } from './commands/deleteRepository'
import { EcrNode } from './explorer/ecrNode'
import { EcrRepositoryNode } from './explorer/ecrRepositoryNode'
import { EcrTagNode } from './explorer/ecrTagNode'
import { deleteTag } from './commands/deleteTag'
import { Commands } from '../shared/vscode/commands2'

/**
 * Activates ECR components.
 */
export async function activate(extensionContext: vscode.ExtensionContext): Promise<void> {
    extensionContext.subscriptions.push(
        Commands.register('aws.ecr.createRepository', async (node: EcrNode) => {
            await createRepository(node)
        }),
        Commands.register('aws.ecr.deleteRepository', async (node: EcrRepositoryNode) => {
            await deleteRepository(node)
        }),
        Commands.register('aws.ecr.copyRepositoryUri', async (node: EcrRepositoryNode) => {
            await copyRepositoryUri(node)
        }),
        Commands.register('aws.ecr.copyTagUri', async (node: EcrTagNode) => {
            await copyTagUri(node)
        }),
        Commands.register('aws.ecr.deleteTag', async (node: EcrTagNode) => {
            await deleteTag(node)
        })
    )
}
