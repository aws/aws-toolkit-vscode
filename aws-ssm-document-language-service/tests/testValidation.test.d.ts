/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT
 */
export interface TestValidationOptions {
    ext: string
    text: string
    diagnostics: {
        message: string
        start: [number, number]
        end: [number, number]
    }[]
    filterMessage?: string[]
}
