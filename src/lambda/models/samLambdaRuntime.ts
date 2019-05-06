/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as immutable from 'immutable'

// TODO: Can we dynamically determine the available runtimes? We could theoretically parse the
// output of `sam init --help`, but that's a hack.
export type SamLambdaRuntime =
    'python3.7' |
    'python3.6' |
    'python2.7' |
    'nodejs6.10' |
    'nodejs8.10' |
    'dotnetcore2.1' |
    'dotnetcore2.0'

export const samLambdaRuntimes: immutable.Set<SamLambdaRuntime> = immutable.Set([
    'python3.7',
    'python3.6',
    'python2.7',
    'nodejs6.10',
    'nodejs8.10',
    'dotnetcore2.1',
    'dotnetcore2.0'
] as SamLambdaRuntime[])

export enum SamLambdaRuntimeFamily {
    Python,
    NodeJS,
    DotNetCore,
}

export function getFamily(runtime: string | undefined): SamLambdaRuntimeFamily {
    switch (runtime) {
        case 'python3.7':
        case 'python3.6':
        case 'python2.7':
        case 'python':
            return SamLambdaRuntimeFamily.Python
        case 'nodejs6.10':
        case 'nodejs8.10':
        case 'nodejs':
            return SamLambdaRuntimeFamily.NodeJS
        case 'dotnetcore2.1':
        case 'dotnetcore2.0':
        case 'dotnetcore':
        case 'dotnet':
            return SamLambdaRuntimeFamily.DotNetCore
        default:
            throw new Error(`Unrecognized runtime: '${runtime}'`)

    }
}
