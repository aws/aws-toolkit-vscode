/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import path from 'path'

export const getTestResourceFilePath = (relativePathToFile: string) => {
    return path.resolve(__dirname, relativePathToFile)
}
