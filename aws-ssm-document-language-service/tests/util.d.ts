/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT
 */
import { JsonLS } from '../service'
export declare function toDocument(
    text: string,
    ext: string,
    type?: string
): {
    textDoc: JsonLS.TextDocument
    jsonDoc?: JsonLS.JSONDocument
}
