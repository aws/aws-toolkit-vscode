/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { FileContext } from './file/model'

export interface EditorContext {
    readonly activeFileContext: FileContext | undefined
}
