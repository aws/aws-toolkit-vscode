'use strict'
/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT
 */
Object.defineProperty(exports, '__esModule', { value: true })
exports.toDocument = void 0
const service_1 = require('../service')
function toDocument(text, ext, type = 'command') {
    const textDoc = service_1.JsonLS.TextDocument.create(`file://test/test.${type}.ssm.${ext}`, `ssm-${ext}`, 0, text)
    let jsonDoc
    const ls = service_1.getLanguageServiceSSM({})
    if (ext === 'json') {
        // tslint:disable-next-line: no-inferred-empty-object-type
        jsonDoc = ls.parseJSONDocument(textDoc)
    }
    return { textDoc, jsonDoc }
}
exports.toDocument = toDocument
//# sourceMappingURL=util.js.map
