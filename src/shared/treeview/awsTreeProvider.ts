/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'

interface AwsTreeProvider {
    viewProviderId: string

    initialize(context: Pick<vscode.ExtensionContext, 'globalState'>): void
}

export interface RefreshableAwsTreeProvider extends AwsTreeProvider {
    refresh(): void
}
