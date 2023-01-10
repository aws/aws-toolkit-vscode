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
    allowedTags: [
        'b',
        'i',
        'em',
        'strong',
        'pre',
        'code',
        'p',
        'li',
        'ul',
        'span',
        // TODO Should be removed after the new api for docs provided
        'amzn-mynah-frequently-used-fqns-panel',
        // TODO Should be removed after the new api for docs provided
        'amzn-mynah-fqn-url',
    ],
    allowedAttributes: {
        span: [
            {
                name: 'class',
                multiple: false,
                values: ['amzn-mynah-search-result-highlight'],
            },
        ],
        // TODO Should be removed after the new api for docs provided
        'amzn-mynah-fqn-url': ['href'],
    },
}

// TODO Should be removed after the new api for docs provided
const sanitizeOptionsTransformCustomTags = {
    allowedAttributes: {
        '*': ['href', 'class'],
    },
    transformTags: {
        'amzn-mynah-frequently-used-fqns-panel': (tagName: string, attribs: Record<string, string>) => {
            return {
                tagName: 'div',
                attribs: {
                    class: 'amzn-mynah-frequently-used-fqns-panel',
                },
            }
        },
        'amzn-mynah-fqn-url': (tagName: string, attribs: Record<string, string>) => {
            return {
                tagName: 'a',
                attribs: {
                    href: attribs.href,
                },
                text: attribs.fqn,
            }
        },
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
                    const suggestionsList = value.suggestions?.map(suggestion => {
                        let body = sanitize(suggestion.body as string, sanitizeOptions)

                        // TODO Should be removed after the new api for docs provided
                        if (suggestion.type === 'ApiDocumentation') {
                            body = `${sanitize(body, sanitizeOptionsTransformCustomTags)
                                .replace(
                                    `<div class="amzn-mynah-frequently-used-fqns-panel">`,
                                    `<div class="amzn-mynah-frequently-used-fqns-panel"><b>Frequently used APIs:</b> Based on real world usage, following APIs are frequently used with the API shown above:`
                                )
                                .replace(
                                    '</div>',
                                    `</div>
                            <input class="amzn-mynah-docs-showmore-toggle" id="amzon-api-doc-${suggestion.url}" type="checkbox">
                            <div class="amzn-mynah-docs-body">
                            <label for="amzon-api-doc-${suggestion.url}">
                            <i class="mynah-icon mynah-icon-down-open"></i>
                            <i class="mynah-icon mynah-icon-up-open"></i>
                            </label>
                            <div>`
                                )}
                            </div></div>`
                        }
                        return {
                            ...suggestion,
                            body,
                        }
                    })
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
