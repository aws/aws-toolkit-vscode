/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { RequestType } from 'vscode-languageserver'

export type IndexRequest = {
    filePaths: string[]
    rootPath: string
    refresh: boolean
}

export const IndexRequestType: RequestType<IndexRequest, any, any> = new RequestType('lsp/index')

export type ClearRequest = string

export const ClearRequestType: RequestType<ClearRequest, any, any> = new RequestType('lsp/clear')

export type QueryRequest = string

export const QueryRequestType: RequestType<QueryRequest, any, any> = new RequestType('lsp/query')
