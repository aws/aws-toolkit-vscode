/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ExtContext } from '../extensions'
import { ConsoleLinkBuilder } from './builder'
import { DeepLinkCommands, openArnCommand } from './commands'
import { ArnScanner } from './scanner'

// Known issues:
// * S3 directory links are unreliable. Looks like their link format needs updates.
// * API gateway ARNs need to specify a 'resource' to work correctly

// S3 folder and APIG nodes aren't included in this feature because of this. We do not
// check for these resource types if an ARN is encountered else where, so users can
// still run into issues depending on the entry-point.

export function activate(context: ExtContext): void {
    const builder = new ConsoleLinkBuilder()
    const commands = new DeepLinkCommands(builder)
    const scanner = new ArnScanner(target => openArnCommand.build(target).asUri())

    context.extensionContext.subscriptions.push(
        vscode.languages.registerDocumentLinkProvider({ pattern: '**/*' }, scanner),
        context.awsContext.onDidChangeContext(() => builder.clearCache()),
        openArnCommand.register(commands)
    )
}
