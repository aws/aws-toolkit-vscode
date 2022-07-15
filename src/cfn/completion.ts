/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as yaml from 'js-yaml'
import * as cfn from './cfn.json'
import { schema } from 'yaml-cfn'

const cfnData = cfn as CloudFormationData

export interface YamlParseNode {
    readonly data: unknown
    readonly kind: 'mapping' | 'sequence' | 'scalar'
    readonly range: vscode.Range
    readonly children: YamlParseNode[]
}

function parseYaml(text: string): YamlParseNode {
    const nodes: YamlParseNode[][] = [[]]
    const positions: vscode.Position[] = []
    let depth = 0

    yaml.load(text, {
        schema,
        listener(type) {
            if (type === 'open') {
                positions.push(new vscode.Position(this.line, this.position - this.lineStart))
                nodes[++depth] ??= []
            } else if (type === 'close') {
                const last = positions.pop()
                if (last === undefined) {
                    throw new Error('no previous position')
                }

                const range = new vscode.Range(last, new vscode.Position(this.line, this.position - this.lineStart))
                const node = {
                    range,
                    data: this.result,
                    children: [...nodes[depth]],
                    kind: this.kind as 'mapping' | 'sequence' | 'scalar',
                }

                delete nodes[depth]
                nodes[--depth].push(node)
            }
        },
    })

    return nodes[0][0]
}

class YamlParseTree {
    // you could pre-compute most of these methods although that depends on the parser
    public constructor(private readonly root: YamlParseNode) {}

    public getParent(node: YamlParseNode, root = this.root): YamlParseNode | undefined {
        if (root.children.includes(node)) {
            return root
        }

        for (const c of root.children) {
            const parent = this.getParent(node, c)
            if (parent !== undefined) {
                return parent
            }
        }
    }

    // note: includes terminal and non-terminal symbols
    public getPredecessor(node: YamlParseNode): YamlParseNode | undefined {
        const parent = this.getParent(node)
        if (parent === undefined) {
            return
        }

        const index = parent.children.indexOf(node)
        if (index === -1) {
            throw new ReferenceError()
        } else if (index === 0) {
            return this.getPredecessor(parent)
        }

        return parent.children[index - 1]
    }

    public findNodeFromPosition(position: vscode.Position, root = this.root): YamlParseNode | undefined {
        for (const child of root.children) {
            const found = this.findNodeFromPosition(position, child)
            if (found) {
                return found
            }
        }

        if (root.range.contains(position)) {
            return root
        }
    }

    public findNodeFromKey(key: string, parent = this.root): YamlParseNode | undefined {
        const index = parent.children.findIndex(c => c.data === key)

        return index !== -1 ? parent.children[index + 1] : undefined
    }

    public static fromDocument(document: vscode.TextDocument): YamlParseTree | undefined {
        try {
            return new this(parseYaml(document.getText()))
        } catch {}
    }
}

export class CfnCompletionProvider implements vscode.CompletionItemProvider {
    public provideCompletionItems(
        doc: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): vscode.CompletionItem[] | undefined {
        const tree = YamlParseTree.fromDocument(doc)
        if (!tree) {
            return
        }

        const current = tree.findNodeFromPosition(position)
        const resources = tree.findNodeFromKey('Resources')

        if (!current || !resources) {
            return
        }

        const parent = tree.getParent(current)
        if (!parent) {
            return
        }

        const predecessor = tree.getPredecessor(current)

        if (predecessor?.data === 'Type' && resources.children.includes(parent)) {
            return Object.entries(cfnData.ResourceTypes).map(([k, v]) => {
                const item = new vscode.CompletionItem(`Type: ${k}`)
                item.range = predecessor.range
                item.documentation = v.Documentation

                return item
            })
        }

        // not sure what the best way is to trigger auto complete on tab
        // this will only pop-up when using the keyboard shortcut
        if (predecessor?.data === 'Properties') {
            const type = tree.findNodeFromKey('Type', parent)?.data
            if (!type || typeof type !== 'string') {
                return
            }

            const currentKeys = current.children
                .filter((_, i) => i % 2 === 0)
                .map(c => c.data)
                .filter(d => typeof d === 'string')
            const validProps = cfnData.ResourceTypes[type].Properties

            return Object.entries(validProps)
                .filter(([k]) => !currentKeys.includes(k))
                .map(([k, v]) => {
                    const item = new vscode.CompletionItem(k)
                    item.insertText = `${k}:`
                    item.documentation = v.Documentation

                    return item
                })
        }
    }
}

interface CloudFormationData {
    readonly PropertyTypes: Record<string, Property>
    readonly ResourceTypes: Record<string, Resource>
}

interface Resource {
    readonly Documentation: string
    readonly Properties: Record<string, Property>
    readonly Attributes?: Record<string, any>
}

interface Property {
    readonly Documentation: string
    readonly Required?: boolean
    readonly UpdateType?: string // 'Immutable'
    readonly Properties?: Record<string, any> // This is mututally exclusive with primtivetype ?
    readonly PrimitiveType?: string // 'Json'
}
