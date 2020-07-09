/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import { insertSnippetCommand, InsertSnippetCommandInput } from './commands/insertSnippet'
import { CompletableSnippet } from './completableSnippet'
import { SnippetCompletionItemProvider } from './snippetCompletionItemProvider'
import { parseSnippetsJson } from './snippetParser'
import { SnippetProvider } from './snippetProvider'

/**
 * Activates snippet code completion items.
 *
 * Parses and serves snippets in the compiled JSON snippet file(s).
 *
 * @param extensionContext VS Code extension context.
 */
export async function activate(extensionContext: vscode.ExtensionContext): Promise<void> {
    // For now, all snippets are in a single file
    // The JS snippets and TS snippets are currently identical
    const snippets = await parseSnippetsJson(
        path.join(extensionContext.extensionPath, 'snippets', 'out', 'snippets.json')
    )
    const javascriptSnippets = snippets.map(snippet => new CompletableSnippet(snippet, 'javascript'))
    const typescriptSnippets = snippets.map(snippet => new CompletableSnippet(snippet, 'typescript'))

    extensionContext.subscriptions.push(
        vscode.commands.registerCommand(
            'snippet.insert',
            async (input: InsertSnippetCommandInput) => await insertSnippetCommand(input)
        ),
        vscode.languages.registerCompletionItemProvider(
            { language: 'javascript' },
            new SnippetCompletionItemProvider(new SnippetProvider(javascriptSnippets))
        ),
        vscode.languages.registerCompletionItemProvider(
            { language: 'typescript' },
            new SnippetCompletionItemProvider(new SnippetProvider(typescriptSnippets))
        )
    )
}
