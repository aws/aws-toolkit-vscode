/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export function splitPathSinceWSPath(filePath: string, workSpacePath: string) {
    return filePath.split(workSpacePath + '/')[1]
}
