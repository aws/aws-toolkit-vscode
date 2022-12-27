/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DefaultMynahSearchClient } from '../client/mynah'
import { Query, SearchSuggestion } from '../models/model'
import * as mynahClient from '../client/mynah'
import * as sanitize from 'sanitize-html'
import { SearchResponse } from '../client/mynahclient'

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

export const NO_QUERY_ERROR_MESSAGE = 'no-query'

export const getSearchSuggestions = async (
    client: DefaultMynahSearchClient,
    query: Query
): Promise<SearchSuggestion[]> => {
    return new Promise((resolve, reject) => {
        if (
            query.input === '' &&
            query.codeQuery?.simpleNames.length === 0 &&
            query.codeQuery?.usedFullyQualifiedNames.length === 0
        ) {
            reject(new Error(NO_QUERY_ERROR_MESSAGE))
        } else {
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
                codeQuery:
                    query.codeQuery === undefined ||
                    (query.codeQuery.simpleNames.length === 0 && query.codeQuery.usedFullyQualifiedNames.length === 0)
                        ? undefined
                        : query.codeQuery,
            }

            try {
                const output = client.search(request)
                output.then((value: SearchResponse) => {
                    const suggestionsList = value.suggestions?.map(suggestion => ({
                        ...suggestion,
                        body: sanitize(suggestion.body as string, sanitizeOptions),
                    }))
                    resolve(suggestionsList as SearchSuggestion[])
                })
            } catch (err: any) {
                // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                reject()
                throw new Error(`Search request failed: ${err}`)
            }
        }
    })
}
