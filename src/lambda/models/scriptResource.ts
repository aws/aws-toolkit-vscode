/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { types as vscode } from '../../shared/vscode'

export class ScriptResource {
    public uri: vscode.Uri | undefined
    public nonce: string | undefined
}
