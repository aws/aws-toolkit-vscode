/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { AwsTreeProvider } from './awsTreeProvider'

export interface RefreshableAwsTreeProvider extends AwsTreeProvider {
    refresh(): void
}
