/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT
 */

import { getLanguageServiceSSM, JsonLS, SSMLanguageService } from '../service'

export function toDocument(
    text: string,
    ext: string,
    type: string = 'command'
): { textDoc: JsonLS.TextDocument; jsonDoc?: JsonLS.JSONDocument } {
    const textDoc: JsonLS.TextDocument = JsonLS.TextDocument.create(
        `file://test/test.${type}.ssm.${ext}`,
        `ssm-${ext}`,
        0,
        text
    )
    let jsonDoc: JsonLS.JSONDocument
    const ls: SSMLanguageService = getLanguageServiceSSM({})
    if (ext === 'json') {
        // tslint:disable-next-line: no-inferred-empty-object-type
        jsonDoc = ls.parseJSONDocument(textDoc)
    }

    return { textDoc, jsonDoc }
}
