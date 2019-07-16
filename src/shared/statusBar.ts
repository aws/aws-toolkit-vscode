/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ContextChangeEventsArgs } from './awsContext'

export interface AWSStatusBar {
    updateContext(eventContext: ContextChangeEventsArgs | undefined): Promise<void>
}
