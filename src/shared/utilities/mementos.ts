/*!
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { cast, Optional, Record, Unknown } from './typeConstructors'

/**
 * Divides a memento at the specified key, creating a 'scoped' memento.
 */
export function partition(memento: vscode.Memento, key: string): vscode.Memento {
    const get = () => cast(memento.get(key), Optional(Record(String, Unknown)))
    const update = (k: string, v: unknown) => memento.update(key, { ...get(), [k]: v })

    return {
        get: (key, defaultValue?) => (get()?.[key] as any) ?? defaultValue,
        update,
    }
}
