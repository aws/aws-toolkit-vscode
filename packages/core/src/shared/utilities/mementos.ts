/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { cast, Optional, Record, Unknown } from './typeConstructors'
import globals from '../extensionGlobals'
import { getCodeCatalystDevEnvId } from '../vscode/env'

/**
 * Divides a memento at the specified key, creating a 'scoped' memento.
 */
export function partition(memento: vscode.Memento, key: string): vscode.Memento {
    const get = () => cast(memento.get(key), Optional(Record(String, Unknown)))
    const update = (k: string, v: unknown) => memento.update(key, { ...get(), [k]: v })

    return {
        keys: () => [], // TODO(jmkeyes): implement this?
        get: (key, defaultValue?) => (get()?.[key] as any) ?? defaultValue,
        update,
    }
}

export function getEnvironmentSpecificMemento(): vscode.Memento {
    if (!vscode.env.remoteName) {
        // local compute: no further partitioning
        return globals.context.globalState
    }

    const devEnvId = getCodeCatalystDevEnvId()

    if (devEnvId !== undefined) {
        // dev env: partition to dev env ID (compute backend might not always be the same)
        return partition(globals.context.globalState, devEnvId)
    }

    // remote env: keeps a shared "global state" for all workspaces that report the same machine ID
    return partition(globals.context.globalState, globals.machineId)
}
