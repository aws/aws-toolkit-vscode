'use strict'
/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT
 */
Object.defineProperty(exports, '__esModule', { value: true })
exports.getYAMLActionSnippetsCompletion = exports.complete = void 0
const completeParameterVariable_1 = require('./completeParameterVariable')
const completeSnippet_1 = require('./completeSnippet')
Object.defineProperty(exports, 'getYAMLActionSnippetsCompletion', {
    enumerable: true,
    get: function() {
        return completeSnippet_1.getYAMLActionSnippetsCompletion
    },
})
/** Returns CompletionItem[] for additional auto-completion, which includes:
 *      1. action snippets for inserting a new action
 *      2. parameter snippets for inserting a new parameter
 *      3. parameter names for editing the name of a parameter variable {{ VAR_NAME }}
 */
function complete(document, position, doc) {
    const parameterNameList = completeParameterVariable_1.getParameterNameCompletion(document, position, doc)
    const parameterSnippetList = completeSnippet_1.getJSONParameterSnippetsCompletion(document, position, doc)
    return parameterNameList.concat(parameterSnippetList)
}
exports.complete = complete
//# sourceMappingURL=complete.js.map
