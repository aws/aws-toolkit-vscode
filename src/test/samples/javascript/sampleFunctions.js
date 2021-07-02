/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

function functionWithNoArgs() {}
exports.exportedFunctionWithNoArgs = functionWithNoArgs

function functionWithOneArg(arg1) {}
exports.exportedFunctionWithOneArg = functionWithOneArg

function functionWithTwoArgs(arg1, arg2) {}
exports.exportedFunctionWithTwoArgs = functionWithTwoArgs

function functionWithThreeArgs(arg1, arg2, arg3) {}
exports.exportedFunctionWithThreeArgs = functionWithThreeArgs

// 4 args shouldn't be considered a lambda handler
function functionWithFourArgs(arg1, arg2, arg3, arg4) {}
exports.exportedFunctionWithFourArgs = functionWithFourArgs

// module.exports assignments
module.exports.anotherExportedFunctionWithNoArgs = functionWithNoArgs
module.exports.directExportsArrowFunction = name => {
    console.log(name)
}
module.exports.directExportsArrowFunctionAsync = async name => {
    console.log(name)
}
module.exports.directExportsFunction = function (name) {
    console.log(name)
}
module.exports.directExportsFunctionAsync = async function (name) {
    console.log(name)
}

// module.!exports checks
module.fooFunction = () => {}
module.fooData = {}
module.fooStr = 'foo'
