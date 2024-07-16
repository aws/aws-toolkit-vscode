/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../shared'
import { DynamoDbTableNode } from '../explorer/dynamoDbTableNode'

export async function scanTable(node: DynamoDbTableNode) {
    getLogger().debug('Yes, Table selected')
}
