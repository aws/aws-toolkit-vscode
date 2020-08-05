/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TrieMap } from 'mnemonist'
import { CompletableSnippet } from './completableSnippet'

/**
 * An index for fast lookup of {@link CompletableSnippet}s based on their prefixes.
 */
export class SnippetProvider {
    private readonly snippetTrieMap: TrieMap<string, CompletableSnippet>

    public constructor(snippets: CompletableSnippet[]) {
        this.snippetTrieMap = new TrieMap<string, CompletableSnippet>()
        snippets.forEach(snippet => this.snippetTrieMap.set(snippet.prefixLower, snippet))
    }

    /**
     * Returns {@link CompletableSnippet}s whose {@link #prefixLower} begin with the given {@param prefixLower}.
     */
    public findByPrefix(prefixLower: string): CompletableSnippet[] {
        return this.snippetTrieMap.find(prefixLower).map(match => match[1])
    }
}
