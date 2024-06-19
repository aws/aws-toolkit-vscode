/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { FocusAreaContext } from './focusArea/model'
import { FileContext } from './file/model'

export interface EditorContext {
    readonly activeFileContext: FileContext | undefined
    readonly focusAreaContext: FocusAreaContext | undefined
}
