/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */


import {QuickActionCommandGroup } from "@aws/mynah-ui-chat/dist/static"
import { TabType } from "../storages/tabsStorage"
import { QuickActionCommands } from "./constants"

export interface QuickActionGeneratorProps {
    isWeaverbirdEnabled: boolean
}

export class QuickActionGenerator {
    private isWeaverbirdEnabled: boolean

    constructor(props: QuickActionGeneratorProps) {
        this.isWeaverbirdEnabled = props.isWeaverbirdEnabled
    }

    public generateForTab(tabType: TabType): QuickActionCommandGroup[] {
        switch (tabType) {
            case 'wb':
                return []
            default: 
                return QuickActionCommands(this.isWeaverbirdEnabled)
        }
    }
}
