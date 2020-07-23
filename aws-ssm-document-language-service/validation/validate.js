'use strict'
/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT
 */
Object.defineProperty(exports, '__esModule', { value: true })
exports.validate = exports.validateVariableValues = exports.validateVariableParameters = exports.validateStepsNonCyclic = exports.validateSchemaVersion = void 0
const validateSchemaVersion_1 = require('./validateSchemaVersion')
Object.defineProperty(exports, 'validateSchemaVersion', {
    enumerable: true,
    get: function() {
        return validateSchemaVersion_1.validateSchemaVersion
    },
})
const validateStepsNonCyclic_1 = require('./validateStepsNonCyclic')
Object.defineProperty(exports, 'validateStepsNonCyclic', {
    enumerable: true,
    get: function() {
        return validateStepsNonCyclic_1.validateStepsNonCyclic
    },
})
const validateVariables_1 = require('./validateVariables')
Object.defineProperty(exports, 'validateVariableParameters', {
    enumerable: true,
    get: function() {
        return validateVariables_1.validateVariableParameters
    },
})
Object.defineProperty(exports, 'validateVariableValues', {
    enumerable: true,
    get: function() {
        return validateVariables_1.validateVariableValues
    },
})
/** Returns Diagnostic[] for additional validations, which includes:
 *      1. validate whether schemaVersion is valid for documentType
 *      2. validate all variable parameters of format {{ VAR_NAME }}
 *      3. validate all variable parameters {{ ACTION.VAR }}
 *      4. validate that automation actions do not form a cycle
 */
function validate(document) {
    let diagnostics = []
    diagnostics = diagnostics.concat(
        validateSchemaVersion_1.validateSchemaVersion(document),
        validateVariables_1.validateVariableParameters(document),
        validateVariables_1.validateVariableValues(document),
        validateStepsNonCyclic_1.validateStepsNonCyclic(document)
    )
    return diagnostics
}
exports.validate = validate
//# sourceMappingURL=validate.js.map
