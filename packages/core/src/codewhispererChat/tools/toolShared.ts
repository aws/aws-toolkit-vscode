/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
export const maxToolResponseSize = 30720 // 30KB

export enum OutputKind {
    Text = 'text',
    Json = 'json',
}

export interface InvokeOutput {
    output: {
        kind: OutputKind
        content: string
    }
}
