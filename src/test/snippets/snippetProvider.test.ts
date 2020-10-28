/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as _ from 'lodash'
import { CompletableSnippet } from '../../snippets/completableSnippet'
import { SnippetProvider } from '../../snippets/snippetProvider'

describe('SnippetProvider', () => {
    describe('findByPrefix', () => {
        const firstSnippet = snippetWithPrefix('foo.bar')
        const secondSnippet = snippetWithPrefix('foobar')
        const firstUnmatchedSnippet = snippetWithPrefix('foxbar')
        const secondUnmatchedSnippet = snippetWithPrefix('barfoo')

        const snippetProvider = new SnippetProvider([
            firstSnippet,
            firstUnmatchedSnippet,
            secondSnippet,
            secondUnmatchedSnippet,
        ])

        it('returns snippets that match prefix', () => {
            const snippets = snippetProvider.findByPrefix('foo')
            assert.deepStrictEqual(
                _.sortBy(snippets, snippet => snippet.prefixLower),
                [firstSnippet, secondSnippet]
            )
        })

        it('returns empty array when no snippets match prefix', () => {
            const snippets = snippetProvider.findByPrefix('food')
            assert.deepStrictEqual(snippets, [])
        })
    })
})

function snippetWithPrefix(prefix: string): CompletableSnippet {
    return new CompletableSnippet(
        {
            prefix,
            description: 'description',
            body: ['body'],
        },
        'language'
    )
}
