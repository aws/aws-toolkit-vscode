/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

class NonExportedClass {
    publicMethod() {}
}

class ExportedClass {
    publicMethod() {}

    static publicStaticMethod() {}
}
exports.ExportedClass = ExportedClass

function functionWithNoArgs() {}

function exportedFunctionWithNoArgs() {}
exports.exportedFunctionWithNoArgs = exportedFunctionWithNoArgs
