/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
export class ScriptResource {
    public Uri: vscode.Uri | undefined
    public Nonce: string | undefined
}