/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export function getFileNameFromPath(filePath: string) {
    return filePath.replace(/^.*(\\|\/|\:)/, '')
}
