/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { QuickPickItem } from 'vscode'

export class QuickPickNode implements QuickPickItem {
    public label: string
    public description?: string | undefined
    public detail?: string | undefined
    public picked?: boolean | undefined

    public constructor(
        readonly id: string
    ) {
        this.label = id
    }
}
