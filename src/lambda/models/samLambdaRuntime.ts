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
    'python' |
    'nodejs6.10' |
    'nodejs8.10' |
    'nodejs4.3' |
    'nodejs' |
    'dotnetcore2.1' |
    'dotnetcore2.0' |
    'dotnetcore1.0' |
    'dotnetcore' |
    'dotnet' |
    'go1.x' |
    'go' |
    'java8' |
    'java' |
    'ruby2.5'

export const samLambdaRuntimes: immutable.Set<SamLambdaRuntime> = immutable.Set([
    'python3.7',
    'python3.6',
    'python2.7',
    'python',
    'nodejs6.10',
    'nodejs8.10',
    'nodejs4.3',
    'nodejs',
    'dotnetcore2.1',
    'dotnetcore2.0',
    'dotnetcore1.0',
    'dotnetcore',
    'dotnet',
    'go1.x',
    'go',
    'java8',
    'java',
    'ruby2.5'
] as SamLambdaRuntime[])

export enum SamLambdaRuntimeFamily {
    Python,
    NodeJS,
    DotNet,
    Go,
    Java,
    Ruby
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
        case 'nodejs4.3':
        case 'nodejs':
            return SamLambdaRuntimeFamily.NodeJS
        case 'dotnetcore2.1':
        case 'dotnetcore2.0':
        case 'dotnetcore1.0':
        case 'dotnetcore':
        case 'dotnet':
            return SamLambdaRuntimeFamily.DotNet
        case 'go1.x':
        case 'go':
            return SamLambdaRuntimeFamily.Go
        case 'java8':
        case 'java':
            return SamLambdaRuntimeFamily.Java
        case 'ruby2.5':
            return SamLambdaRuntimeFamily.Ruby
        default:
            throw new Error(`Unrecognized runtime: '${runtime}'`)

    }
}
