/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

export interface AWSContextCommands {
    onCommandLogin(): Promise<void>
    onCommandCreateCredentialsProfile(): Promise<void>
    onCommandLogout(): Promise<void>
    onCommandShowRegion(): Promise<void>
    onCommandSelectRegion(): Promise<string | undefined>
    onCommandHideRegion(regionCode?: string): Promise<void>
}
