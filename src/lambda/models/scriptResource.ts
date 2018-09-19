/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 */

import * as vscode from 'vscode'
export class ScriptResource {
    public Uri: vscode.Uri | undefined
    public Nonce: string | undefined
}