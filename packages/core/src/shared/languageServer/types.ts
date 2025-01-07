/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../logger/logger'

export const logger = getLogger('lsp')

type Location = 'remote' | 'cache' | 'override' | 'fallback' | 'unknown'

export interface LspResult {
    location: Location
    version: string
    assetDirectory: string
}

export interface LspInstaller {
    install(): Promise<LspResult>
}
