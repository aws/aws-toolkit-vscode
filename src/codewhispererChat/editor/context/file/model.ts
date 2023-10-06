/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatchPolicy } from '../../../clients/chat/v0/model'

export interface FileContext {
    fileText: string | undefined
    fileLanguage: string | undefined
    matchPolicy: MatchPolicy | undefined
}
