/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* tslint:disable:no-unused-variable */

// @ts-ignore
class NonExportedClass {
    public publicMethod(): void {}
    // @ts-ignore
    private privateMethod(): void {}
}

export class ExportedClass {
    public publicMethod(): void {}
    // @ts-ignore
    private privateMethod(): void {}

    public static publicStaticMethod(): void {}
}

// @ts-ignore
function functionWithNoArgs(): void {}

export function exportedFunctionWithNoArgs(): void {}
