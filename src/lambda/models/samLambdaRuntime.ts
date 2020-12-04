/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { Runtime } from 'aws-sdk/clients/lambda'
import { Map as ImmutableMap, Set as ImmutableSet } from 'immutable'
import * as picker from '../../shared/ui/picker'

export enum RuntimeFamily {
    Unknown,
    Python,
    NodeJS,
    DotNetCore,
}

export type RuntimePackageType = 'Image' | 'Zip'

// TODO: Consolidate all of the runtime constructs into a single <Runtime, Set<Runtime>> map
//       We should be able to eliminate a fair amount of redundancy with that.
export const nodeJsRuntimes: ImmutableSet<Runtime> = ImmutableSet<Runtime>(['nodejs12.x', 'nodejs10.x', 'nodejs8.10'])
export const pythonRuntimes: ImmutableSet<Runtime> = ImmutableSet<Runtime>([
    'python3.8',
    'python3.7',
    'python3.6',
    'python2.7',
])
export const dotNetRuntimes: ImmutableSet<Runtime> = ImmutableSet<Runtime>(['dotnetcore2.1', 'dotnetcore3.1'])
const DEFAULT_RUNTIMES = ImmutableMap<RuntimeFamily, Runtime>([
    [RuntimeFamily.NodeJS, 'nodejs12.x'],
    [RuntimeFamily.Python, 'python3.8'],
    [RuntimeFamily.DotNetCore, 'dotnetcore2.1'],
])

export const samZipLambdaRuntimes: ImmutableSet<Runtime> = ImmutableSet.union([
    nodeJsRuntimes,
    pythonRuntimes,
    dotNetRuntimes,
])

export const samLambdaImportableRuntimes: ImmutableSet<Runtime> = ImmutableSet.union([nodeJsRuntimes, pythonRuntimes])

// Filter out node8 until local debugging is no longer supported, and it can be removed from samLambdaRuntimes
export const samLambdaCreatableRuntimes: ImmutableSet<Runtime> = samZipLambdaRuntimes.filter(
    runtime => runtime !== 'nodejs8.10'
)
// Image runtimes are not a direct subset of valid ZIP lambda types
const dotnet50 = 'dotnet5.0'
export const samImageLambdaRuntimes = ImmutableSet<Runtime>([
    ...samLambdaCreatableRuntimes,
    // TODO enable to allow dotnet 5 support
    // dotnet50,
    // SAM also supports ruby, go, java, but toolkit does not support
])

export const samLambdaRuntimes: ImmutableSet<Runtime> = ImmutableSet.union([
    samZipLambdaRuntimes,
    samImageLambdaRuntimes,
])

export type DependencyManager = 'cli-package' | 'mod' | 'gradle' | 'pip' | 'npm' | 'maven' | 'bundler'

// TODO: Make this return an array of DependencyManagers when we add runtimes with multiple dependency managers
export function getDependencyManager(runtime: Runtime): DependencyManager {
    if (nodeJsRuntimes.has(runtime)) {
        return 'npm'
    } else if (pythonRuntimes.has(runtime)) {
        return 'pip'
    } else if (dotNetRuntimes.has(runtime) || runtime === dotnet50) {
        return 'cli-package'
    }
    throw new Error(`Runtime ${runtime} does not have an associated DependencyManager`)
}

export function getFamily(runtime: string): RuntimeFamily {
    if (nodeJsRuntimes.has(runtime)) {
        return RuntimeFamily.NodeJS
    } else if (pythonRuntimes.has(runtime)) {
        return RuntimeFamily.Python
    } else if (dotNetRuntimes.has(runtime) || runtime === dotnet50) {
        return RuntimeFamily.DotNetCore
    }
    return RuntimeFamily.Unknown
}

/**
 * Sorts runtimes from lowest value to greatest value, helpful for outputting alphabetized lists of runtimes
 * Differs from normal sorting as it numbers into account: e.g. nodeJs8.10 < nodeJs10.x
 */
export function compareSamLambdaRuntime(a: string, b: string): number {
    return a.localeCompare(b, 'en', { numeric: true, ignorePunctuation: true })
}

function extractAndCompareRuntime(a: RuntimeQuickPickItem, b: RuntimeQuickPickItem): number {
    return compareSamLambdaRuntime(a.label, b.label)
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
function getRuntimesForFamily(family: RuntimeFamily): ImmutableSet<Runtime> | undefined {
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

export interface RuntimeQuickPickItem extends vscode.QuickPickItem {
    packageType: RuntimePackageType
    runtime: Runtime
}

export type RuntimeTuple = [Runtime, RuntimePackageType]

/**
 * Creates a quick pick for a Runtime with the following parameters (all optional)
 * @param {Object} params Optional parameters for creating a QuickPick for runtimes:
 * @param {vscode.QuickInputButton[]} params.buttons Array of buttons to add to the quick pick;
 * @param {Runtime} params.currRuntime Runtime to set a "Selected Previously" mark to;
 * @param {RuntimeFamily} params.runtimeFamily RuntimeFamily that will define the list of runtimes to show (default: samLambdaCreatableRuntimes)
 */
export function createRuntimeQuickPick(params: {
    showImageRuntimes: boolean
    buttons?: vscode.QuickInputButton[]
    currRuntime?: Runtime
    runtimeFamily?: RuntimeFamily
    step?: number
    totalSteps?: number
}): vscode.QuickPick<RuntimeQuickPickItem> {
    const zipRuntimes = params.runtimeFamily
        ? getRuntimesForFamily(params.runtimeFamily) ?? samLambdaCreatableRuntimes
        : samLambdaCreatableRuntimes

    const zipRuntimeItems = zipRuntimes
        // remove uncreatable runtimes
        .filter(value => samLambdaCreatableRuntimes.has(value))
        .toArray()
        .map<RuntimeQuickPickItem>(runtime => ({
            packageType: 'Zip',
            runtime: runtime,
            label: runtime,
            alwaysShow: runtime === params.currRuntime,
            description:
                runtime === params.currRuntime ? localize('AWS.wizard.selectedPreviously', 'Selected Previously') : '',
        }))

    // internally, after init there is essentially no difference between a ZIP and Image runtime;
    // behavior is keyed off of what is specified in the cloudformation template
    let imageRuntimeItems: RuntimeQuickPickItem[] = []
    if (params.showImageRuntimes) {
        imageRuntimeItems = samImageLambdaRuntimes
            .map<RuntimeQuickPickItem>(runtime => ({
                packageType: 'Image',
                runtime: runtime,
                label: `${runtime} (Image)`,
                alwaysShow: runtime === params.currRuntime,
                description:
                    runtime === params.currRuntime
                        ? localize('AWS.wizard.selectedPreviously', 'Selected Previously')
                        : '',
            }))
            .toArray()
    }

    return picker.createQuickPick({
        options: {
            ignoreFocusOut: true,
            title: localize('AWS.samcli.initWizard.runtime.prompt', 'Select a SAM Application Runtime'),
            value: params.currRuntime ? params.currRuntime : '',
            step: params.step,
            totalSteps: params.totalSteps,
        },
        buttons: [...(params.buttons ?? []), vscode.QuickInputButtons.Back],
        items: [...zipRuntimeItems, ...imageRuntimeItems].sort(extractAndCompareRuntime),
    })
}
