/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DynamoDB } from 'aws-sdk'
import { AttributeValue } from 'aws-sdk/clients/dynamodb'

export function getTableColumnsNames(items: DynamoDB.Types.ScanOutput) {
    const tableColumnsNames = new Set<string>()
    for (const item of items.Items ?? []) {
        for (const key of Object.keys(item)) {
            tableColumnsNames.add(key)
        }
    }
    return tableColumnsNames
}

export function getTableItems(tableColumnsNames: Set<string>, items: DynamoDB.Types.ScanOutput) {
    const tableItems = []
    for (const item of items.Items ?? []) {
        const curItem = []
        for (const columnName of tableColumnsNames) {
            const columnValue = item[columnName] || undefined
            if (columnValue === undefined) {
                curItem.push('')
            } else {
                const attributeValue = getAttributeValue(columnValue)
                curItem.push(attributeValue?.value)
            }
        }
        tableItems.push(curItem)
    }
    return tableItems
}

function getAttributeValue(attribute: AttributeValue): { key: string; value: any } | undefined {
    const keys = Object.keys(attribute) as (keyof AttributeValue)[]
    for (const key of keys) {
        if (attribute[key] !== undefined) {
            return { key, value: attribute[key] }
        }
    }
    return undefined
}
