/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Settings, SettingsConfiguration } from '../../shared/settingsConfiguration'
import { ClassToInterfaceType } from '../../shared/utilities/tsUtils'
import { cast, TypeConstructor } from '../../shared/utilities/typeConstructors'

type ObjectPath<T extends Record<string, any>, K extends PropertyKey[] = []> = K extends []
    ? [keyof T]
    : IndexObject<T, K> extends Record<string, any>
    ? K | [...K, keyof IndexObject<T, K>]
    : K

type IndexObject<T extends Record<string, any>, K> = K extends [infer L, ...infer R]
    ? L extends keyof T
        ? IndexObject<T[L], R>
        : undefined
    : T

function get<T extends Record<string, any>, K extends PropertyKey[], P extends ObjectPath<T, K>>(
    obj: T,
    path: P
): IndexObject<T, P> {
    const next = obj[path[0] as keyof T]

    if (path.length === 1 || next === undefined) {
        return next
    }

    return get(next, path.slice(1))
}

/**
 * Test utility class with an in-memory Settings Configuration key-value storage
 */
export class TestSettingsConfiguration implements ClassToInterfaceType<SettingsConfiguration> {
    private readonly data: { [key: string]: any } = {}
    private readonly onDidChangeEmitter = new vscode.EventEmitter<string>()

    public getSetting(key: string): unknown
    public getSetting<T>(key: string, type: TypeConstructor<T>): T | undefined
    public getSetting<T>(key: string, type: TypeConstructor<T>, defaultValue: T): T
    public getSetting<T>(key: string, type?: TypeConstructor<T>, defaultValue?: T): T | undefined {
        const value = (get(this.data, key.split('.')) as T) ?? defaultValue
        return !type || value === undefined ? value : cast(value, type)
    }

    public async updateSetting(key: string, value: unknown): Promise<boolean> {
        const parts = key.split('.')

        let obj = this.data
        for (const k of parts.slice(0, -1)) {
            obj = obj[k] ??= {}
        }

        obj[parts[parts.length - 1]] = value
        this.onDidChangeEmitter.fire(key)

        return true
    }

    public getSection(section: string, scope?: vscode.ConfigurationScope): Settings {
        return {
            reset: async () => {
                delete this.data[section]
            },
            get: (key, defaultValue?) => this.getSetting(`${section}.${key}`) ?? defaultValue,
            update: async (key, value) => {
                this.updateSetting(`${section}.${key}`, value)
            },
        }
    }

    public createScopedEmitter(
        section: string,
        scope?: vscode.ConfigurationScope
    ): [emitter: vscode.EventEmitter<vscode.ConfigurationChangeEvent>, listener: vscode.Disposable] {
        const emitter = new vscode.EventEmitter<vscode.ConfigurationChangeEvent>()
        const listener = this.onDidChangeEmitter.event(prop => {
            if (prop.startsWith(section)) {
                const remainder = prop.replace(section, '').replace(/^\./, '')
                emitter.fire({ affectsConfiguration: key => remainder.startsWith(key) })
            } else if (section.startsWith(prop)) {
                emitter.fire({ affectsConfiguration: key => key.startsWith(section) })
            }
        })

        return [emitter, listener]
    }
}
