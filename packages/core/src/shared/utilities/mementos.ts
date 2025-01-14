/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { cast, Optional, Record, Unknown } from './typeConstructors'
import globals from '../extensionGlobals'
import { getCodeCatalystDevEnvId } from '../vscode/env'

/**
 * Creates a memento interface to a nested object stored at `key`.
 *
 * For example, `partition(m, 'foo')` creates a nested object at "foo":
 *
 *     "foo": {
 *     }
 *
 * and returns a memento that gets/sets keys only on "foo" (not its container `m`).
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

/**
 * Resolves the appropriate memento/state for the current runtime environment.
 *
 * Why?
 * - In remote instances where we ssh in to them, we do not always want to share
 *   with the local globalState. We want certain functionality to be isolated to
 *   the remote instance.
 */
export function getEnvironmentSpecificMemento(): vscode.Memento {
    if (!vscode.env.remoteName) {
        // local compute: no further partitioning
        return globals.globalState
    }

    const devEnvId = getCodeCatalystDevEnvId()

    if (devEnvId !== undefined) {
        // dev env: partition to dev env ID (compute backend might not always be the same)
        return partition(globals.globalState, devEnvId)
    }

    // remote env: keeps a shared "global state" for all workspaces that report the same machine ID
    return partition(globals.globalState, globals.machineId)
}
