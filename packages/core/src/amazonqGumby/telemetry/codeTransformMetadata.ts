/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export const codeTransformMaxMetaDataLength = 65344

export interface ICodeTransformMetaData {
    dependencyVersionSelected?: string
    canceledFromChat?: boolean
    retryCount?: number
    errorMessage?: string
}
type ICodeTransformMetaDataKeys = keyof ICodeTransformMetaData
export const toJsonString = (metaData: ICodeTransformMetaData) => {
    const jsonString = JSON.stringify(metaData)

    if (jsonString.length <= codeTransformMaxMetaDataLength) {
        return jsonString
    }

    let currentLength = 0
    const objectKeys = Object.keys(metaData) as ICodeTransformMetaDataKeys[]
    for (const key of objectKeys) {
        const value = metaData[key]
        // add 5 for quotes and comma around key-value pairs
        const elementLength = key.length + JSON.stringify(value).length + 5
        if (currentLength + elementLength <= codeTransformMaxMetaDataLength) {
            delete metaData[key]
            currentLength += elementLength
        }
    }

    return JSON.stringify(metaData)
}
