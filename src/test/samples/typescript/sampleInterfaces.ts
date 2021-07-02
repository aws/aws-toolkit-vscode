/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* tslint:disable:no-unused-variable */

// @ts-ignore
interface NonExportedInterface {
    method(): void
}

export interface ExportedInterface {
    method(): void
}

// @ts-ignore
function functionWithNoArgs(): void {}

export function exportedFunctionWithNoArgs(): void {}
