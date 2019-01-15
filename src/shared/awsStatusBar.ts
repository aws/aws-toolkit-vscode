/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { ContextChangeEventsArgs } from './awsContext'
import { types as vscode } from './vscode'

// may want to have multiple elements of data on the status bar,
// so wrapping in a class to allow for per-element update capability
export interface AWSStatusBar {

    readonly credentialContext: vscode.StatusBarItem

    updateContext(eventContext: ContextChangeEventsArgs | undefined): Promise<void>
}
