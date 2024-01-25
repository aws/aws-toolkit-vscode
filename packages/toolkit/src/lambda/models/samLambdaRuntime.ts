/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { Runtime } from 'aws-sdk/clients/lambda'
import { Map as ImmutableMap, Set as ImmutableSet } from 'immutable'
import { isCloud9 } from '../../shared/extensionUtilities'
import { PrompterButtons } from '../../shared/ui/buttons'
import { createQuickPick, DataQuickPickItem, QuickPickPrompter } from '../../shared/ui/pickerPrompter'
import { supportedLambdaRuntimesUrl } from '../../shared/constants'
import { openUrl } from '../../shared/utilities/vsCodeUtils'

export enum RuntimeFamily {
    Unknown,
    Python,
    NodeJS,
    DotNet,
    Go,
    Java,
}

export type RuntimePackageType = 'Image' | 'Zip'

// TODO: Consolidate all of the runtime constructs into a single <Runtime, Set<Runtime>> map
//       We should be able to eliminate a fair amount of redundancy with that.
export const nodeJsRuntimes: ImmutableSet<Runtime> = ImmutableSet<Runtime>(['nodejs18.x', 'nodejs16.x', 'nodejs14.x'])
export function getNodeMajorVersion(version?: string): number | undefined {
    if (!version) {
        return undefined
    }

    const match = version.match(/^nodejs(\d+)\./)

    if (match) {
        return Number(match[1])
    } else {
        return undefined
    }
}

export const pythonRuntimes: ImmutableSet<Runtime> = ImmutableSet<Runtime>([
    'python3.12',
    'python3.11',
    'python3.10',
    'python3.9',
    'python3.8',
    'python3.7',
])
export const goRuntimes: ImmutableSet<Runtime> = ImmutableSet<Runtime>(['go1.x'])
export const javaRuntimes: ImmutableSet<Runtime> = ImmutableSet<Runtime>(['java11', 'java8', 'java8.al2'])
export const dotNetRuntimes: ImmutableSet<Runtime> = ImmutableSet<Runtime>(['dotnet6'])

/**
 * Deprecated runtimes can be found at https://docs.aws.amazon.com/lambda/latest/dg/runtime-support-policy.html
 * (or whatever shared/constants.supportedLambdaRuntimesUrl is pointing to)
 * Add runtimes as they enter Phase 2 deprecation (updating existing functions blocked)
 * Don't add unsupported languages for now (e.g. ruby25): no point in telling a user they're deprecated and then telling them we have no support after they update.
 */
export const deprecatedRuntimes: ImmutableSet<Runtime> = ImmutableSet<Runtime>([
    'dotnetcore1.0',
    'dotnetcore2.0',
    'python2.7',
    'nodejs',
    'nodejs4.3',
    'nodejs4.3-edge',
    'nodejs6.10',
    'nodejs8.10',
    'nodejs10.x',
])
const defaultRuntimes = ImmutableMap<RuntimeFamily, Runtime>([
    [RuntimeFamily.NodeJS, 'nodejs14.x'],
    [RuntimeFamily.Python, 'python3.9'],
    [RuntimeFamily.DotNet, 'dotnet6'],
    [RuntimeFamily.Go, 'go1.x'],
    [RuntimeFamily.Java, 'java11'],
])

export const samZipLambdaRuntimes: ImmutableSet<Runtime> = ImmutableSet.union([
    nodeJsRuntimes,
    pythonRuntimes,
    dotNetRuntimes,
    goRuntimes,
    javaRuntimes,
])

export const samArmLambdaRuntimes: ImmutableSet<Runtime> = ImmutableSet<Runtime>([
    'python3.9',
    'python3.8',
    'nodejs18.x',
    'nodejs16.x',
    'nodejs14.x',
    'java11',
    'java8.al2',
])

// Cloud9 supports a subset of runtimes for debugging.
// * .NET is not supported
const cloud9SupportedRuntimes: ImmutableSet<Runtime> = ImmutableSet.union([nodeJsRuntimes, pythonRuntimes])

// only interpreted languages are importable as compiled languages won't provide a useful artifact for editing.
export const samLambdaImportableRuntimes: ImmutableSet<Runtime> = ImmutableSet.union([nodeJsRuntimes, pythonRuntimes])

export function samLambdaCreatableRuntimes(cloud9: boolean = isCloud9()): ImmutableSet<Runtime> {
    return cloud9 ? cloud9SupportedRuntimes : samZipLambdaRuntimes
}

// Image runtimes are not a direct subset of valid ZIP lambda types
const dotnet50 = 'dotnet5.0'
export function samImageLambdaRuntimes(cloud9: boolean = isCloud9()): ImmutableSet<Runtime> {
    // Note: SAM also supports ruby, but Toolkit does not.
    return ImmutableSet<Runtime>([...samLambdaCreatableRuntimes(cloud9), ...(cloud9 ? [] : [dotnet50])])
}

export type DependencyManager = 'cli-package' | 'mod' | 'gradle' | 'pip' | 'npm' | 'maven' | 'bundler'
export type Architecture = 'x86_64' | 'arm64'

export function getDependencyManager(runtime: Runtime): DependencyManager[] {
    if (deprecatedRuntimes.has(runtime)) {
        handleDeprecatedRuntime(runtime)
    } else if (nodeJsRuntimes.has(runtime)) {
        return ['npm']
    } else if (pythonRuntimes.has(runtime)) {
        return ['pip']
    } else if (dotNetRuntimes.has(runtime) || runtime === dotnet50) {
        return ['cli-package']
    } else if (goRuntimes.has(runtime)) {
        return ['mod']
    } else if (javaRuntimes.has(runtime)) {
        return ['gradle', 'maven']
    }
    throw new Error(`Runtime ${runtime} does not have an associated DependencyManager`)
}

export function getFamily(runtime: string): RuntimeFamily {
    if (deprecatedRuntimes.has(runtime)) {
        handleDeprecatedRuntime(runtime)
    } else if (nodeJsRuntimes.has(runtime)) {
        return RuntimeFamily.NodeJS
    } else if (pythonRuntimes.has(runtime)) {
        return RuntimeFamily.Python
    } else if (dotNetRuntimes.has(runtime) || runtime === dotnet50) {
        return RuntimeFamily.DotNet
    } else if (goRuntimes.has(runtime)) {
        return RuntimeFamily.Go
    } else if (javaRuntimes.has(runtime)) {
        return RuntimeFamily.Java
    }
    return RuntimeFamily.Unknown
}

function handleDeprecatedRuntime(runtime: Runtime) {
    const moreInfo = localize('AWS.generic.message.learnMore', 'Learn More')
    void vscode.window
        .showErrorMessage(
            localize(
                'AWS.samcli.deprecatedRuntime',
                'Runtime {0} has been deprecated. Update to a currently-supported runtime.',
                runtime
            ),
            moreInfo
        )
        .then(button => {
            if (button === moreInfo) {
                void openUrl(vscode.Uri.parse(supportedLambdaRuntimesUrl))
            }
        })
    throw new Error(`Runtime ${runtime} is deprecated, see: ${supportedLambdaRuntimesUrl}`)
}

/**
 * Sorts runtimes from lowest value to greatest value, helpful for outputting alphabetized lists of runtimes
 * Differs from normal sorting as it numbers into account: e.g. nodeJs8.10 < nodeJs10.x
 */
export function compareSamLambdaRuntime(a: string, b: string): number {
    return a.localeCompare(b, 'en', { numeric: true, ignorePunctuation: true })
}

function extractAndCompareRuntime(a: vscode.QuickPickItem, b: vscode.QuickPickItem): number {
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
            return RuntimeFamily.DotNet
        case 'python':
            return RuntimeFamily.Python
        case 'go':
            return RuntimeFamily.Go
        default:
            return RuntimeFamily.Unknown
    }
}

/**
 * Provides the default runtime for a given `RuntimeFamily` or undefined if the runtime is invalid.
 */
export function getDefaultRuntime(runtime: RuntimeFamily): string | undefined {
    return defaultRuntimes.get(runtime)
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
        case RuntimeFamily.DotNet:
            return dotNetRuntimes
        case RuntimeFamily.Go:
            return goRuntimes
        case RuntimeFamily.Java:
            return javaRuntimes
        default:
            return undefined
    }
}

export interface RuntimeAndPackage {
    packageType: RuntimePackageType
    runtime: Runtime
}

/**
 * Creates a quick pick for a Runtime with the following parameters (all optional)
 * @param {Object} params Optional parameters for creating a QuickPick for runtimes:
 * @param {vscode.QuickInputButton[]} params.buttons Array of buttons to add to the quick pick;
 * @param {RuntimeFamily} params.runtimeFamily RuntimeFamily that will define the list of runtimes to show (default: samLambdaCreatableRuntimes)
 */
export function createRuntimeQuickPick(params: {
    showImageRuntimes: boolean
    buttons?: PrompterButtons<RuntimeAndPackage>
    runtimeFamily?: RuntimeFamily
    step?: number
    totalSteps?: number
}): QuickPickPrompter<RuntimeAndPackage> {
    const zipRuntimes = params.runtimeFamily
        ? getRuntimesForFamily(params.runtimeFamily) ?? samLambdaCreatableRuntimes()
        : samLambdaCreatableRuntimes()

    const zipRuntimeItems = zipRuntimes
        // remove uncreatable runtimes
        .filter(value => samLambdaCreatableRuntimes().has(value))
        .toArray()
        .map(runtime => ({
            data: { runtime, packageType: 'Zip' } as RuntimeAndPackage,
            label: runtime,
        }))

    // internally, after init there is essentially no difference between a ZIP and Image runtime;
    // behavior is keyed off of what is specified in the cloudformation template
    let imageRuntimeItems: DataQuickPickItem<RuntimeAndPackage>[] = []
    if (params.showImageRuntimes) {
        imageRuntimeItems = samImageLambdaRuntimes()
            .map(runtime => ({
                data: { runtime, packageType: 'Image' } as RuntimeAndPackage,
                label: `${runtime} (Image)`,
            }))
            .toArray()
    }

    return createQuickPick([...zipRuntimeItems, ...imageRuntimeItems].sort(extractAndCompareRuntime), {
        title: localize('AWS.samcli.initWizard.runtime.prompt', 'Select a SAM Application Runtime'),
        buttons: params.buttons ?? [],
    })
}
