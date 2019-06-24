/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export interface AWSContextCommands {
    onCommandLogin(): Promise<void>
    onCommandCreateCredentialsProfile(): Promise<void>
    onCommandLogout(): Promise<void>
    onCommandShowRegion(): Promise<void>
    onCommandHideRegion(regionCode?: string): Promise<void>
}
