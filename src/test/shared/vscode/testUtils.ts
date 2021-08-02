/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

type InterceptEvent<T> = {
    [Property in keyof T as `fire${Capitalize<Property & string>}`]: T[Property] extends vscode.Event<infer R>
        ? vscode.EventEmitter<R>['fire']
        : never
} &
    T
type FilteredKeys<T> = { [Property in keyof T]: T[Property] extends never ? never : Property }[keyof T]
type NoNever<T> = Pick<T, FilteredKeys<T>>

function capitalize<S extends string>(s: S): Capitalize<S> {
    return `${s[0].toUpperCase()}${s.slice(1)}` as any
}

export type ExposeEmitters<T> = NoNever<InterceptEvent<T>>

/**
 * Exposes private event emitters of the object. This should exclusively be used for testing purposes since there
 * is no guarantee that the emitters are named 1:1 with their public counterparts. The majority of UI events in
 * VS code are triggered from user interaction, so firing these programmatically should be safe. It is highly
 * recommended to limit the amount of accumulated state when firing these events.
 *
 * @params obj Target object
 * @returns The extended object with {@link ExposeEmitters exposed methods}
 */
export function exposeEmitters<T>(obj: T): ExposeEmitters<T> {
    Object.entries(obj).forEach(([key, value]) => {
        if (key.startsWith('_onDid') && value instanceof vscode.EventEmitter) {
            Object.assign(obj, { [`fire${capitalize(key.slice(1).replace('Emitter', ''))}`]: value.fire.bind(value) })
        }
    })

    return obj as any
}
