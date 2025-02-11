/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../shared/logger/logger'

export const codeTransformMaxMetaDataLength = 65536

export interface ICodeTransformMetaData {
    dependencyVersionSelected?: string
    canceledFromChat?: boolean
    retryCount?: number
    errorMessage?: string
}
type ICodeTransformMetaDataKeys = keyof ICodeTransformMetaData

/**
 * @description Function to remove keys from the codeTransformMetaData
 * if the max length is exceeded.
 * If functionality changes to truncate the field, instead of delete ky, use truncateProps()
 * or partialClone() utility functions.
 * @param metaData
 * @returns Stringified JSON object
 */
export function codeTransformMetaDataToJsonString(metaData: ICodeTransformMetaData) {
    const jsonString = JSON.stringify(metaData)

    if (jsonString.length <= codeTransformMaxMetaDataLength) {
        return jsonString
    }

    let currentLength = 0
    const metaDataCopy = { ...metaData }
    const objectKeys = Object.keys(metaData) as ICodeTransformMetaDataKeys[]
    for (const key of objectKeys) {
        const value = metaData[key]
        // add 5 for quotes and comma around key-value pairs
        const elementLength = key.length + JSON.stringify(value).length + 5
        if (currentLength + elementLength >= codeTransformMaxMetaDataLength) {
            delete metaDataCopy[key]
            getLogger().info(`CodeTransformation: codeTransformMetaData key: ${key} is too large)}`)
        } else {
            currentLength += elementLength
        }
    }

    return JSON.stringify(metaDataCopy)
}
