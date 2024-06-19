/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatchPolicy } from '../../../clients/chat/v0/model'

export interface FileContext {
    readonly fileText: string | undefined
    readonly fileLanguage: string | undefined
    readonly filePath: string | undefined
    readonly matchPolicy: MatchPolicy | undefined
}
