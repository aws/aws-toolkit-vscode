/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { JavaDependencyGraph } from './javaDependencyGraph'
import { PythonDependencyGraph } from './pythonDependencyGraph'
import { JavascriptDependencyGraph } from './javascriptDependencyGraph'
import * as CodeWhispererConstants from '../../models/constants'
import { CsharpDependencyGraph } from './csharpDependencyGraph'
import { cloudformationDependencyGraph } from './cloudformationDependencyGraph'
import { DependencyGraphConstants } from './dependencyGraph'
import * as vscode from 'vscode'
import { terraformDependencyGraph } from './terraformDependencyGraph'
import { RubyDependencyGraph } from './rubyDependencyGraph'
import { GoDependencyGraph } from './goDependencyGraph'

const languageMap = {
    java: JavaDependencyGraph,
    python: PythonDependencyGraph,
    javascript: JavascriptDependencyGraph,
    typescript: JavascriptDependencyGraph, // typescript use same javascript dependency graph
    csharp: CsharpDependencyGraph,
    cloudformation: cloudformationDependencyGraph,
    terraform: terraformDependencyGraph,
    ruby: RubyDependencyGraph,
    go: GoDependencyGraph,
} as const

type LanguageMap = typeof languageMap
type Keys = keyof LanguageMap
type Tuples<T> = T extends Keys ? [T, InstanceType<LanguageMap[T]>] : never
type ClassType<A extends Keys> = Extract<Tuples<Keys>, [A, any]>[1]

export class DependencyGraphFactory {
    static getDependencyGraphFromFileExtensions<K extends Keys>(fileName: string): ClassType<K> {
        if (fileName.endsWith(DependencyGraphConstants.tfExt) || fileName.endsWith(DependencyGraphConstants.hclExt)) {
            return new languageMap['terraform']('tf' satisfies CodeWhispererConstants.PlatformLanguageId)
        } else if (fileName.endsWith(DependencyGraphConstants.jsonExt)) {
            return new languageMap['cloudformation']('json' satisfies CodeWhispererConstants.PlatformLanguageId)
        } else {
            return undefined
        }
    }

    static getDependencyGraph<K extends Keys>(editor: vscode.TextEditor): ClassType<K> {
        switch (editor.document.languageId) {
            case 'java' satisfies CodeWhispererConstants.PlatformLanguageId:
                return new languageMap['java']('java' satisfies CodeWhispererConstants.PlatformLanguageId)
            case 'python' satisfies CodeWhispererConstants.PlatformLanguageId:
                return new languageMap['python']('python' satisfies CodeWhispererConstants.PlatformLanguageId)
            case 'javascript' satisfies CodeWhispererConstants.PlatformLanguageId:
                return new languageMap['javascript']('javascript' satisfies CodeWhispererConstants.PlatformLanguageId)
            case 'typescript' satisfies CodeWhispererConstants.PlatformLanguageId:
                return new languageMap['typescript']('typescript' satisfies CodeWhispererConstants.PlatformLanguageId)
            case 'csharp' satisfies CodeWhispererConstants.PlatformLanguageId:
                return new languageMap['csharp']('csharp' satisfies CodeWhispererConstants.PlatformLanguageId)
            case 'yaml' satisfies CodeWhispererConstants.PlatformLanguageId:
                return new languageMap['cloudformation']('yaml' satisfies CodeWhispererConstants.PlatformLanguageId)
            case 'ruby' satisfies CodeWhispererConstants.PlatformLanguageId:
                return new languageMap['ruby']('ruby' satisfies CodeWhispererConstants.PlatformLanguageId)
            case 'go' satisfies CodeWhispererConstants.PlatformLanguageId:
                return new languageMap['go']('go' satisfies CodeWhispererConstants.PlatformLanguageId)
            default:
                return this.getDependencyGraphFromFileExtensions(editor.document.fileName)
        }
    }
}
