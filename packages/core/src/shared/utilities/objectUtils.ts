/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export const _Set = <T extends object>(obj: T, path: string | string[], value: any): T => {
    if (Object(obj) !== obj) {
        return obj
    }

    if (!Array.isArray(path)) {
        path = path.toString().match(/[^.[\]]+/g) || []
    }

    path.slice(0, -1).reduce((a: any, c: string | number, i: number) => {
        if (Object(a[c]) === a[c]) {
            return a[c]
        } else {
            a[c] = Math.abs(Number(path[i + 1])) >> 0 === Number(path[i + 1]) ? [] : {}
            return a[c]
        }
    }, obj)[path[path.length - 1]] = value

    return obj
}

export const _Get = <T extends object, TState extends object, TDefault = undefined>(
    obj: TState,
    path: string | string[],
    defaultValue?: TDefault
): TDefault | any => {
    const pathArray = Array.isArray(path) ? path : path.match(/([^[.\]])+/g)

    if (pathArray !== null) {
        return pathArray.reduce((acc, key) => acc && acc[key], obj as Record<string, any>) || defaultValue
    }
    return defaultValue
}

export const _CloneDeep = <T extends object>(obj: T): T => {
    if (typeof obj !== 'object' || obj === null) {
        return obj
    }

    if (Array.isArray(obj)) {
        return obj.map(_CloneDeep) as T
    }

    if (obj instanceof Date) {
        return new Date(obj.getTime()) as any
    }

    if (obj instanceof RegExp) {
        return new RegExp(obj.source, obj.flags) as any
    }

    const clone: any = {}

    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            clone[key] = _CloneDeep(obj[key] as object)
        }
    }

    const proto = Object.getPrototypeOf(obj)
    return Object.setPrototypeOf(clone, proto) as T
}

export const _IsEqual = (x: { [x: string]: any }, y: { [x: string]: any }): boolean => {
    const ok = Object.keys,
        tx = typeof x,
        ty = typeof y
    return x && y && tx === 'object' && tx === ty
        ? ok(x).length === ok(y).length && ok(x).every(key => _IsEqual(x[key], y[key]))
        : x === y
}

export const _IsEmpty = <T extends object>(obj: T): boolean => {
    if (obj === undefined) {
        return true
    } // handle null and undefined
    if (typeof obj === 'object') {
        if (Array.isArray(obj)) {
            return obj.length === 0
        } else if (obj instanceof Map || obj instanceof Set) {
            return obj.size === 0
        } else {
            return Object.entries(obj).length === 0
        }
    }
    return false
}
