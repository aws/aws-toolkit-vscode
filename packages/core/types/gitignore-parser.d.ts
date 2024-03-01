/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

declare module '@gerhobbelt/gitignore-parser' {
    export interface GitIgnoreAcceptor {
        accepts(filePath: string)
    }
    export function compile(content: string): GitIgnoreAcceptor
}
