/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

function functionWithNoArgs() { }

export function exportedFunctionWithNoArgs() { }
exports.exportedFunctionWithNoArgs = exportedFunctionWithNoArgs

function functionWithOneArg(arg1) { }

export function exportedFunctionWithOneArg(arg1) { }
exports.exportedFunctionWithOneArg = exportedFunctionWithOneArg

function functionWithTwoArgs(arg1, arg2) { }

export function exportedFunctionWithTwoArgs(arg1, arg2) { }
exports.exportedFunctionWithTwoArgs = exportedFunctionWithTwoArgs

function functionWithThreeArgs(arg1, arg2, arg3) { }

export function exportedFunctionWithThreeArgs(arg1, arg2, arg3) { }
exports.exportedFunctionWithThreeArgs = exportedFunctionWithThreeArgs

function functionWithFourArgs(arg1, arg2, arg3, arg4) { }

export function exportedFunctionWithFourArgs(arg1, arg2, arg3, arg4) { }
exports.exportedFunctionWithFourArgs = exportedFunctionWithFourArgs
