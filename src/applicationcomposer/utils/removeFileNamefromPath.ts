/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export function removeFileNamefromPath(filePath: string) {
    return filePath.substring(0, filePath.lastIndexOf('/'))
}
