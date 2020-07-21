/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { Runtime } from 'aws-sdk/clients/lambda'
import { Map, Set } from 'immutable'
import * as picker from '../../shared/ui/picker'

export enum RuntimeFamily {
    Unknown,
    Python,
    NodeJS,
    DotNetCore,
}

// TODO: Consolidate all of the runtime constructs into a single <Runtime, Set<Runtime>> map
//       We should be able to eliminate a fair amount of redundancy with that.
export const nodeJsRuntimes: Set<Runtime> = Set<Runtime>(['nodejs12.x', 'nodejs10.x', 'nodejs8.10'])
export const pythonRuntimes: Set<Runtime> = Set<Runtime>(['python3.8', 'python3.7', 'python3.6', 'python2.7'])
export const dotNetRuntimes: Set<Runtime> = Set<Runtime>(['dotnetcore2.1', 'dotnetcore3.1'])
const DEFAULT_RUNTIMES = Map<RuntimeFamily, Runtime>([
    [RuntimeFamily.NodeJS, 'nodejs12.x'],
    [RuntimeFamily.Python, 'python3.8'],
    [RuntimeFamily.DotNetCore, 'dotnetcore2.1'],
])

export const samLambdaRuntimes: Set<Runtime> = Set.union([nodeJsRuntimes, pythonRuntimes, dotNetRuntimes])

// Filter out node8 until local debugging is no longer supported, and it can be removed from samLambdaRuntimes
export const samLambdaCreatableRuntimes: Set<Runtime> = samLambdaRuntimes.filter(runtime => runtime !== 'nodejs8.10')

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

/**
 * Sorts runtimes from lowest value to greatest value, helpful for outputting alphabetized lists of runtimes
 * Differs from normal sorting as it numbers into account: e.g. nodeJs8.10 < nodeJs10.x
 */
export function compareSamLambdaRuntime(a: Runtime, b: Runtime): number {
    return getSortableCompareText(a).localeCompare(getSortableCompareText(b))
}

/**
 * Maps vscode document languageId to `RuntimeFamily`.
 */
export function getRuntimeFamily(langId: string): RuntimeFamily {
    switch (langId) {
        case 'typescript':
        case 'javascript':
            return RuntimeFamily.NodeJS
        case 'csharp':
            return RuntimeFamily.DotNetCore
        case 'python':
            return RuntimeFamily.Python
        default:
            return RuntimeFamily.Unknown
    }
}

/**
 * Provides the default runtime for a given `RuntimeFamily` or undefined if the runtime is invalid.
 */
export function getDefaultRuntime(runtime: RuntimeFamily): string | undefined {
    return DEFAULT_RUNTIMES.get(runtime)
}

/**
 * Returns a set of runtimes for a specified runtime family or undefined if not found.
 * @param family Runtime family to get runtimes for
 */
function getRuntimesForFamily(family: RuntimeFamily): Set<Runtime> | undefined {
    switch (family) {
        case RuntimeFamily.NodeJS:
            return nodeJsRuntimes
        case RuntimeFamily.Python:
            return pythonRuntimes
        case RuntimeFamily.DotNetCore:
            return dotNetRuntimes
        default:
            return undefined
    }
}

/**
 * Creates a quick pick for a Runtime with the following parameters (all optional)
 * @param {Object} params Optional parameters for creating a QuickPick for runtimes:
 * @param {vscode.QuickInputButton[]} params.buttons Array of buttons to add to the quick pick;
 * @param {Runtime} params.currRuntime Runtime to set a "Selected Previously" mark to;
 * @param {RuntimeFamily} params.runtimeFamily RuntimeFamily that will define the list of runtimes to show (default: samLambdaCreatableRuntimes)
 */
export function createRuntimeQuickPick(params: {
    buttons?: vscode.QuickInputButton[]
    currRuntime?: Runtime
    runtimeFamily?: RuntimeFamily
}): vscode.QuickPick<vscode.QuickPickItem> {
    const runtimes = params.runtimeFamily
        ? getRuntimesForFamily(params.runtimeFamily) ?? samLambdaCreatableRuntimes
        : samLambdaCreatableRuntimes

    return picker.createQuickPick<vscode.QuickPickItem>({
        options: {
            ignoreFocusOut: true,
            title: localize('AWS.samcli.initWizard.runtime.prompt', 'Select a SAM Application Runtime'),
            value: params.currRuntime ? params.currRuntime : '',
        },
        buttons: [...(params.buttons ?? []), vscode.QuickInputButtons.Back],
        items: runtimes
            // remove uncreatable runtimes
            .filter(value => samLambdaCreatableRuntimes.has(value))
            .toArray()
            .sort(compareSamLambdaRuntime)
            .map(runtime => ({
                label: runtime,
                alwaysShow: runtime === params.currRuntime,
                description:
                    runtime === params.currRuntime
                        ? localize('AWS.wizard.selectedPreviously', 'Selected Previously')
                        : '',
            })),
    })
}
