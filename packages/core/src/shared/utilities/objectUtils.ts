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

export const _IsEmpty = <T extends object | string | undefined>(obj: T): boolean => {
    if (obj === undefined || obj === null) {
        return true
    }
    if (typeof obj === 'string') {
        return obj.length === 0
    }
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

export const _IsString = (value: any): value is string => {
    return typeof value === 'string'
}

export const _KeysIn = <T extends object>(obj: T): string[] => {
    return Object.keys(obj)
}

interface ThrottleOptions {
    leading?: boolean
    trailing?: boolean
}

export const _Throttle = <T extends (...args: any[]) => any>(
    func: T,
    limit: number,
    options: ThrottleOptions = {}
): T => {
    let inThrottle: boolean
    let lastArgs: any[] | undefined = undefined

    const { leading = true, trailing = true } = options

    return function (this: any, ...args: any[]) {
        if (inThrottle) {
            if (trailing) {
                lastArgs = args
            }
            return
        }

        const callNow = !leading || (leading && !inThrottle)

        if (callNow) {
            func.apply(this, args)
        }

        inThrottle = true

        setTimeout(() => {
            if (lastArgs) {
                func.apply(this, lastArgs)
                lastArgs = undefined
            }
            inThrottle = false
        }, limit)
    } as T
}

export const _Template = (str: string) => {
    return (data: Record<string, any>): string => {
        const regex = /<%=([\s\S]+?)%>/g
        let match
        let output = ''
        let lastIndex = 0

        const evaluate = (expression: string): string => {
            try {
                // Use a template literal to evaluate the expression
                return String(eval(`(function() { return ${expression} })()`))
            } catch (err) {
                console.error(`Error evaluating expression: ${expression}`)
                return ''
            }
        }

        while ((match = regex.exec(str))) {
            output += str.slice(lastIndex, match.index)
            output += evaluate(match[1])
            lastIndex = match.index + match[0].length
        }

        output += str.slice(lastIndex)

        return output
    }
}

export const _Debounce = <T extends (...args: any[]) => any>(func: T, delay: number): { cancel: () => void } & T => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const debouncedFunc = function (this: any, ...args: any[]) {
        clearTimeout(timeoutId)

        timeoutId = setTimeout(() => {
            func.apply(this, args)
        }, delay)
    } as T

    const cancel = () => {
        clearTimeout(timeoutId)
    }

    return Object.assign(debouncedFunc, { cancel })
}

export const _Omit = <T extends object, K extends keyof T>(obj: T, ...keys: K[]): Omit<T, K> => {
    const shallowCopy = { ...obj }
    keys.forEach(key => {
        delete shallowCopy[key]
    })
    return shallowCopy
}

export const _IsError = (value: any): value is Error => {
    return value instanceof Error
}
