/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { JavaDependencyGraph } from './javaDependencyGraph'
import { PythonDependencyGraph } from './pythonDependencyGraph'
import { CodeWhispererConstants } from '../../models/constants'

const languageMap = {
    java: JavaDependencyGraph,
    python: PythonDependencyGraph,
} as const

type LanguageMap = typeof languageMap
type Keys = keyof LanguageMap
type Tuples<T> = T extends Keys ? [T, InstanceType<LanguageMap[T]>] : never
type ClassType<A extends Keys> = Extract<Tuples<Keys>, [A, any]>[1]

export class DependencyGraphFactory {
    static getDependencyGraph<K extends Keys>(k: string): ClassType<K> {
        switch (k) {
            case CodeWhispererConstants.java:
                return new languageMap['java']()
            case CodeWhispererConstants.python:
                return new languageMap['python']()
            default:
                return undefined
        }
    }
}
