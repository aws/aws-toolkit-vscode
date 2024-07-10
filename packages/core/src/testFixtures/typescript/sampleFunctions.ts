/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* tslint:disable:no-unused-variable */

// @ts-ignore
function functionWithNoArgs(): void {}

export function exportedFunctionWithNoArgs(): void {}

// @ts-ignore
function functionWithOneArg(arg1: string): void {}

export function exportedFunctionWithOneArg(arg1: string): void {}

// @ts-ignore
function functionWithTwoArgs(arg1: string, arg2: string): void {}

export function exportedFunctionWithTwoArgs(arg1: string, arg2: string): void {}

// @ts-ignore
function functionWithThreeArgs(arg1: string, arg2: string, arg3: string): void {}

export function exportedFunctionWithThreeArgs(arg1: string, arg2: string, arg3: string): void {}

// @ts-ignore
function functionWithFourArgs(arg1: string, arg2: string, arg3: string, arg4: string): void {}

export function exportedFunctionWithFourArgs(arg1: string, arg2: string, arg3: string, arg4: string): void {}

export const exportedArrowFunction = (arg1: string) => {}

export const exportedArrowFunctionWithFourArgs = (arg1: string, arg2: string, arg3: string, arg4: string) => {}

function exportedViaDeclaration(arg1: string) {}

const exportedArrowViaDeclaration = (arg1: string) => {}
const exportedArrowViaDeclarationAlt: (x: string) => void = arg1 => {}

const exportedArrowViaDeclWithFourArgs = (arg1: string, arg2: string, arg3: string, arg4: string) => {}
const exportedArrowViaDeclWithFourArgsAlt: (arg1: string, arg2: string, arg3: string, arg4: string) => void = (
    arg1,
    arg2,
    arg3,
    arg4
) => {}

export { exportedViaDeclaration, exportedArrowViaDeclaration, exportedArrowViaDeclarationAlt }
export { functionWithFourArgs, exportedArrowViaDeclWithFourArgs, exportedArrowViaDeclWithFourArgsAlt }
