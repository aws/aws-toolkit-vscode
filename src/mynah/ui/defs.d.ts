/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { MynahConfig } from './helper/config'
import { ServiceConnector } from './helper/connector'
import { ContextManager } from './helper/context-manager'
import { DomBuilder } from './helper/dom'
import { I18n } from './translations/i18n'

export {}
declare global {
    interface Window {
        domBuilder: DomBuilder
        contextManager: ContextManager
        serviceConnector: ServiceConnector
        config: MynahConfig
        ideApi: any
        i18n: I18n
    }
    const acquireVsCodeApi: any
}
