/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Runtime } from 'aws-sdk/clients/lambda'
import { Map, Set } from 'immutable'

// NOTE: These are ORDERED! The newest runtime should always be placed first.
export const nodeJsRuntimes: Set<Runtime> = Set<Runtime>(['nodejs12.x', 'nodejs10.x', 'nodejs8.10'])
export const pythonRuntimes: Set<Runtime> = Set<Runtime>(['python3.8', 'python3.7', 'python3.6', 'python2.7'])
export const dotNetRuntimes: Set<Runtime> = Set<Runtime>(['dotnetcore2.1'])

export const samLambdaRuntimes: Set<Runtime> = Set.union([nodeJsRuntimes, pythonRuntimes, dotNetRuntimes])

export type DependencyManager = 'cli-package' | 'mod' | 'gradle' | 'pip' | 'npm' | 'maven' | 'bundler'

// TODO: Make this return an array of DependencyManagers when we add runtimes with multiple dependency managers
export function getDependencyManager(runtime: Runtime): DependencyManager {
    if (nodeJsRuntimes.has(runtime)) {
        return 'npm'
    } else if (pythonRuntimes.has(runtime)) {
        return 'pip'
    } else if (dotNetRuntimes.has(runtime)) {
        return 'cli-package'
    }
    throw new Error(`Runtime ${runtime} does not have an associated DependencyManager`)
}

export enum RuntimeFamily {
    Unknown,
    Python,
    NodeJS,
    DotNetCore,
}

export function getFamily(runtime: string): RuntimeFamily {
    if (nodeJsRuntimes.has(runtime)) {
        return RuntimeFamily.NodeJS
    } else if (pythonRuntimes.has(runtime)) {
        return RuntimeFamily.Python
    } else if (dotNetRuntimes.has(runtime)) {
        return RuntimeFamily.DotNetCore
    }
    return RuntimeFamily.Unknown
}

// This allows us to do things like "sort" nodejs10.x after nodejs8.10
// Map Values are used for comparisons, not for display
const runtimeCompareText: Map<Runtime, string> = Map<Runtime, string>([['nodejs8.10', 'nodejs08.10']])

function getSortableCompareText(runtime: Runtime): string {
    return runtimeCompareText.get(runtime) || runtime.toString()
}

export function compareSamLambdaRuntime(a: Runtime, b: Runtime): number {
    return getSortableCompareText(a).localeCompare(getSortableCompareText(b))
}
