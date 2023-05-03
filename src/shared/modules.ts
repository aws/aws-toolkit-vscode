/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { telemetry } from './telemetry/telemetry'

export type ModuleApi<T> = T extends RegisteredModule<infer U> ? U : never

type Dependencies<T> = T extends [infer U, ...infer R] ? [ModuleApi<U>, ...Dependencies<R>] : []

interface ExtensionModule<T, U extends RegisteredModule[]> {
    activate(ctx: vscode.ExtensionContext, ...dependencies: Dependencies<U>): Promise<T> | T
    deactivate?(): Promise<void> | void
}

interface RegisteredModule<T = unknown> extends vscode.Disposable {
    readonly id: string
    readonly dependencies: RegisteredModule[]
    activate(ctx: vscode.ExtensionContext): Promise<T> | T
    dispose(): Promise<void> | void
}

const registeredModules = new Map<string, RegisteredModule>()
const activatedModules = new Map<string, unknown>()

function checkDependencies(id: string, dependencies: RegisteredModule[], stack = [id]) {
    for (const dep of dependencies) {
        if (dep.id === id) {
            throw new Error(`Circular dependency found: ${stack.join(' -> ')}`)
        }

        checkDependencies(id, dep.dependencies, [...stack, dep.id])
    }
}

type DynamicImport<T, U extends RegisteredModule[]> = () => Promise<ExtensionModule<T, U>>

export function register<T, U extends RegisteredModule[]>(
    id: string,
    extModule: ExtensionModule<T, U> | DynamicImport<T, U>,
    ...dependencies: U
): RegisteredModule<T> {
    checkDependencies(id, dependencies)

    const registered: RegisteredModule<T> = {
        id,
        dependencies,
        dispose: () => {
            registeredModules.delete(id)
            if (activatedModules.has(id)) {
                activatedModules.delete(id)

                if (!(typeof extModule === 'function')) {
                    return extModule.deactivate?.()
                }
            }
        },
        activate: async ctx => {
            const deps =
                dependencies.length > 0
                    ? ((await Promise.all(dependencies.map(d => d.activate(ctx)))) as Dependencies<U>)
                    : ([] as Dependencies<U>)

            return activateModule(ctx, id, extModule, ...deps)
        },
    }

    registeredModules.set(id, registered)

    return registered
}

export async function activateAll(ctx: vscode.ExtensionContext) {
    const activationPromises = [] as Promise<unknown>[]

    for (const [_id, extModule] of registeredModules.entries()) {
        // An error handler could be added here to isolate failures from other systems
        // This does require marking the module as 'failed' so dependents can also fail
        const result = extModule.activate(ctx)
        if (result instanceof Promise) {
            activationPromises.push(result)
        }
    }

    await Promise.all(activationPromises)
}

export async function deactivate() {
    const modules = Array.from(registeredModules.values())
    await Promise.all(modules.map(m => m.dispose()))
}

function activateModule<T, U extends RegisteredModule[]>(
    ctx: vscode.ExtensionContext,
    id: string,
    extModule: ExtensionModule<T, U> | DynamicImport<T, U>,
    ...deps: Dependencies<U>
): Promise<T> | T {
    if (activatedModules.has(id)) {
        return activatedModules.get(id) as Promise<T> | T
    }

    const result = telemetry.vscode_activateModule.run(async span => {
        span.record({ module: id })

        if (typeof extModule === 'function') {
            return (await extModule()).activate(ctx, ...deps)
        } else {
            return extModule.activate(ctx, ...deps)
        }
    })

    activatedModules.set(id, result)
    return result
}
