/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export function addArgumentIf(args: string[], addIfConditional: boolean, ...argsToAdd: string[]) {
    if (addIfConditional) {
        args.push(...argsToAdd)
    }
}
