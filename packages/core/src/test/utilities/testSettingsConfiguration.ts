/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ResetableMemento, Settings } from '../../shared/settings'
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
export class TestSettings implements ClassToInterfaceType<Settings> {
    private readonly data: { [key: string]: any } = {}
    private readonly onDidChangeEmitter = new vscode.EventEmitter<string>()

    public get(key: string): unknown
    public get<T>(key: string, type: TypeConstructor<T>): T | undefined
    public get<T>(key: string, type: TypeConstructor<T>, defaultValue: T): T
    public get<T>(key: string, type?: TypeConstructor<T>, defaultValue?: T): T | undefined {
        const value = (get(this.data, key.split('.')) as T) ?? defaultValue
        return !type || value === undefined ? value : cast(value, type)
    }

    public async isValid(): Promise<'ok' | 'invalid' | 'nowrite'> {
        return 'ok'
    }

    public async update(key: string, value: unknown): Promise<boolean> {
        const parts = key.split('.')

        let obj = this.data
        for (const k of parts.slice(0, -1)) {
            obj = obj[k] ??= {}
        }

        obj[parts[parts.length - 1]] = value
        this.onDidChangeEmitter.fire(key)

        return true
    }

    public getSection(section: string, scope?: vscode.ConfigurationScope): ResetableMemento {
        return {
            keys: () => [],
            get: (key, defaultValue?) => this.get(`${section}.${key}`) ?? defaultValue,
            reset: async () => {
                delete this.data[section]
            },
            update: async (key, value) => {
                await this.update(`${section}.${key}`, value)
            },
        }
    }

    public onDidChangeSection(
        section: string,
        listener: (event: vscode.ConfigurationChangeEvent) => unknown
    ): vscode.Disposable {
        return this.onDidChangeEmitter.event(prop => {
            if (prop.startsWith(section)) {
                const remainder = prop.replace(section, '').replace(/^\./, '')
                listener({ affectsConfiguration: key => remainder.startsWith(key) })
            } else if (section.startsWith(prop)) {
                listener({ affectsConfiguration: key => key.startsWith(section) })
            }
        })
    }

    public isSet(key: string, section?: string): boolean {
        const merged = section ? [section, key].join('.') : key
        const value = get(this.data, merged.split('.'))

        return value !== undefined
    }
}
