/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { RequestType } from 'vscode-languageserver'

export type IndexRequestPayload = {
    filePaths: string[]
    rootPath: string
    refresh: boolean
}

export type IndexRequest = string

export const IndexRequestType: RequestType<IndexRequest, any, any> = new RequestType('lsp/index')

export type ClearRequest = string

export const ClearRequestType: RequestType<ClearRequest, any, any> = new RequestType('lsp/clear')

export type QueryRequest = string

export const QueryRequestType: RequestType<QueryRequest, any, any> = new RequestType('lsp/query')

export type UpdateIndexRequest = string

export const UpdateIndexRequestType: RequestType<UpdateIndexRequest, any, any> = new RequestType('lsp/updateIndex')

export type GetUsageRequest = string

export const GetUsageRequestType: RequestType<GetUsageRequest, any, any> = new RequestType('lsp/getUsage')

export interface Usage {
    memoryUsage: number
    cpuUsage: number
}
