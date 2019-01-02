/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

interface AwsTreeProvider {
    viewProviderId: string

    initialize(): void
}

export interface RefreshableAwsTreeProvider extends AwsTreeProvider {
    refresh(): void
}
