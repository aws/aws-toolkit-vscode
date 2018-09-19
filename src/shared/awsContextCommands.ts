/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 */

'use strict'

export interface AWSContextCommands {
    onCommandLogin(): Promise<void>
    onCommandLogout(): Promise<void>
    onCommandShowRegion(): Promise<void>
    onCommandHideRegion(regionCode?: string): Promise<void>
}
