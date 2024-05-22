/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { RequestType } from 'vscode-languageserver'

export type IndexRequest = [string]

export const IndexRequestType: RequestType<IndexRequest, any, any, any> = new RequestType('lsp/index')
