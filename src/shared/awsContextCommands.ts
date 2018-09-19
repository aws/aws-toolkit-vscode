'use strict'

export interface AWSContextCommands {
    onCommandLogin(): Promise<void>
    onCommandLogout(): Promise<void>
    onCommandShowRegion(): Promise<void>
    onCommandHideRegion(regionCode?: string): Promise<void>
}
