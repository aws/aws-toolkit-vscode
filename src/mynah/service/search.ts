/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DefaultMynahSearchClient } from '../client/mynah'
import { Query, SearchSuggestion } from '../models/model'
import * as mynahClient from '../client/mynah'
import * as sanitize from 'sanitize-html'

const sanitizeOptions = {
    allowedTags: ['b', 'i', 'em', 'strong', 'pre', 'code', 'p', 'li', 'ul', 'span'],
    allowedAttributes: {
        span: [
            {
                name: 'class',
                multiple: false,
                values: ['amzn-mynah-search-result-highlight'],
            },
        ],
    },
}

export const getSearchSuggestions = async (
    client: DefaultMynahSearchClient,
    query: Query
): Promise<SearchSuggestion[]> => {
    if (query.input === '' && query.codeQuery === undefined) {
        return []
    }
    const request: mynahClient.SearchRequest = {
        input: query.input ? query.input.trim().substring(0, 1000) : undefined,
        code: query.code ? query.code.trim().substring(0, 1000) : undefined,
        context: {
            matchPolicy: {
                should: Array.from(query.queryContext.should),
                must: Array.from(query.queryContext.must),
                mustNot: Array.from(query.queryContext.mustNot),
            },
        },
        codeQuery: query.codeQuery,
    }

    try {
        const output = await client.search(request)
        return output.suggestions?.map(suggestion => ({
            ...suggestion,
            body: sanitize(suggestion.body as string, sanitizeOptions),
        })) as SearchSuggestion[]
    } catch (err: any) {
        // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
        throw new Error('Search request failed: ' + err)
    }
}
