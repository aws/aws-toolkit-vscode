/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export function getNodeExecutableName(): string {
    return process.platform === 'win32' ? 'node.exe' : 'node'
}
