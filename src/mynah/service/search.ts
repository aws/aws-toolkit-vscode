/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// import * as vs from 'vscode'
import { DefaultMynahSearchClient } from '../client/mynah'
import { NavigationTabItems, Query, SearchSuggestion } from '../models/model'
import * as mynahClient from '../client/mynah'
import * as sanitize from 'sanitize-html'
import * as vs from 'vscode'
import { ApiDocsSearchResponse, ApiDocsSuggestion, FullyQualifiedName, SearchResponse } from '../client/mynahclient'

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
                values: ['amzn-mynah-search-result-highlight', 'amzn-mynah-search-result-ellipsis'],
            },
        ],
        // TODO Should be removed after the new api for docs provided
        'amzn-mynah-fqn-url': ['href', 'fqn'],
    },
}

// TODO Should be removed after the new api for docs provided
const sanitizeOptionsTransformCustomTags = {
    allowedAttributes: {
        '*': ['href', 'class', 'fqn'],
    },
    transformTags: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        'amzn-mynah-frequently-used-fqns-panel': (tagName: string, attribs: Record<string, string>) => {
            return {
                tagName: 'div',
                attribs: {
                    class: 'amzn-mynah-frequently-used-fqns-panel',
                },
            }
        },
        // eslint-disable-next-line @typescript-eslint/naming-convention
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

export const NoQueryErrorMessage = 'no-query'

const processSuggestions = (value: SearchResponse) => {
    return value.suggestions?.map(suggestion => {
        let body = sanitize(suggestion.body as string, sanitizeOptions)

        // TODO Should be removed after the new api for docs provided
        if (suggestion.type === 'ApiDocumentation') {
            body = `${sanitize(body, sanitizeOptionsTransformCustomTags)
                .replace(
                    `<div class="amzn-mynah-frequently-used-fqns-panel">`,
                    `<div class="amzn-mynah-frequently-used-fqns-panel">
                    Based on real world usage, following API elements are frequently used with the one shown above:
                    <span>`
                )
                .replace(
                    '</div>',
                    `</span></div>
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
}

const processApiDocsSuggestions = (value: ApiDocsSearchResponse) => {
    return value.apiDocsSuggestions?.map(suggestion => {
        const processedSuggestion = {
            ...suggestion,
            type: 'ApiDocsSuggestion',
        }
        processedSuggestion.body = sanitize(processedSuggestion.body as string, sanitizeOptions)
        if (processedSuggestion.metadata?.canonicalExample) {
            processedSuggestion.metadata.canonicalExample.body = sanitize(
                processedSuggestion.metadata.canonicalExample.body as string,
                sanitizeOptions
            )
        }

        return processedSuggestion
    })
}
const guessLanguageFromContextKeys = (contextKeys: string[]): string | undefined => {
    if (contextKeys.includes('javascript') || contextKeys.includes('react')) {
        return 'javascript'
    } else if (contextKeys.includes('typescript')) {
        return 'typescript'
    } else if (contextKeys.includes('python')) {
        return 'python'
    } else if (contextKeys.includes('java')) {
        return 'java'
    }
    return undefined
}

export const getSearchSuggestions = async (
    client: DefaultMynahSearchClient,
    query: Query
): Promise<SearchSuggestion[] | ApiDocsSuggestion[]> => {
    return new Promise((resolve, reject) => {
        if (
            query.input === '' &&
            query.codeQuery?.simpleNames.length === 0 &&
            query.codeQuery?.usedFullyQualifiedNames.length === 0
        ) {
            reject(new Error(NoQueryErrorMessage))
        } else {
            if (query.selectedTab === NavigationTabItems.apiDocs) {
                // If there is codeQuery and usedFullyQualifiedNames, convert them to symbol source type
                const apiDocsSearchRequest: mynahClient.ApiDocsSearchRequest = {
                    code: {
                        usedFullyQualifiedNames: query.codeQuery?.usedFullyQualifiedNames
                            .map(fqn => {
                                const fqnExpanded: string[] = fqn.split('.')
                                return {
                                    sources: fqnExpanded.slice(0, fqnExpanded.length - 1),
                                    symbols: fqnExpanded.slice(fqnExpanded.length - 1, fqnExpanded.length),
                                } as FullyQualifiedName
                            })
                            .filter(elem => elem.sources !== undefined && elem.sources?.length > 0),
                        language:
                            guessLanguageFromContextKeys([...query.queryContext.should, ...query.queryContext.must]) ??
                            vs.window.activeTextEditor?.document.languageId,
                    },
                }

                if (
                    apiDocsSearchRequest.code?.usedFullyQualifiedNames &&
                    apiDocsSearchRequest.code?.usedFullyQualifiedNames.length > 0
                ) {
                    const output = client.apiDocsSearch(apiDocsSearchRequest)
                    output
                        .then((value: ApiDocsSearchResponse) => {
                            const suggestionList = processApiDocsSuggestions(value)
                            resolve(suggestionList as ApiDocsSuggestion[])
                        })
                        .catch(err => reject(err))
                } else {
                    throw new Error(`Not possible to search API Docs without used fully qualified names.`)
                }
            } else {
                const searchRequest: mynahClient.SearchRequest = {
                    input: query.input ? query.input.trim().substring(0, 1000) : undefined,
                    code: query.code ? query.code.trim().substring(0, 1000) : undefined,
                    context: {
                        matchPolicy: {
                            should: query.queryContext.should,
                            must: query.queryContext.must,
                            mustNot: query.queryContext.mustNot,
                        },
                    },
                    codeQuery:
                        query.codeQuery === undefined ||
                        (query.codeQuery.simpleNames.length === 0 &&
                            query.codeQuery.usedFullyQualifiedNames.length === 0)
                            ? undefined
                            : query.codeQuery,
                }

                const output = client.search(searchRequest)
                output
                    .then((value: SearchResponse) => {
                        const suggestionList = processSuggestions(value)
                        resolve(suggestionList as SearchSuggestion[])
                    })
                    .catch(err => reject(err))
            }
        }
    })
}
