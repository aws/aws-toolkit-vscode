/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT
 */

import {
    ArrayASTNode,
    ASTNode,
    JSONDocument,
    ObjectASTNode,
    PropertyASTNode,
    StringASTNode,
    TextDocument,
} from 'vscode-json-languageservice'
import { parse } from 'yaml-language-server/out/server/src/languageservice/parser/yamlParser07'

export { ASTNode }

export interface ASTTree extends JSONDocument {
    root?: ASTNode
}

export function isStringNode(node: ASTNode): node is StringASTNode {
    return node.type === 'string'
}

export function isPropertyNode(node: ASTNode): node is PropertyASTNode {
    return node.type === 'property'
}

export function isObjectNode(node: ASTNode): node is ObjectASTNode {
    return node.type === 'object'
}

export function isArrayNode(node: ASTNode): node is ArrayASTNode {
    return node.type === 'array'
}

export function isRoot(node: ASTNode): boolean {
    return isObjectNode(node) && !node.parent
}

/** Checks whether loc is inside the range of node */
function isLocationInNodeRange(node: ASTNode, loc: number) {
    return loc >= node.offset && loc <= node.offset + node.length
}

/** Find the root node of the document */
export function findRootNode(document: TextDocument, doc?: JSONDocument): ASTNode {
    if (!doc) {
        // YAML
        const docText = document.getText()
        doc = parse(docText).documents[0]
    }
    const rootNode = (doc as ASTTree).root

    return rootNode
}

/** Finds the deepest node that contains offset */
export function findCurrentNode(rootNode: ASTNode, offset: number): ASTNode {
    if (!rootNode) {
        return undefined
    }

    let node = findCurrentNodeHelper(rootNode, offset)
    if (!node) {
        node = rootNode
    }

    return node
}

/** Recursively inspects children of rootNode for whether loc is in range */
export function findCurrentNodeHelper(rootNode: ASTNode, loc: number): ASTNode | undefined {
    if (isLocationInNodeRange(rootNode, loc)) {
        const { children } = rootNode
        if (children?.length) {
            const nodeInRange = children.find(node => isLocationInNodeRange(node, loc))
            if (nodeInRange) {
                return findCurrentNodeHelper(nodeInRange, loc)
            }
        }

        return rootNode
    }
}

/** Checks whether the parent node is a propertyNode whose keyNode has the target value */
function checkParentNodeValue(node: ASTNode, value: string): boolean {
    return (
        !!node.parent &&
        isPropertyNode(node.parent) &&
        node.parent.keyNode?.value === value &&
        !node.parent.parent?.parent
    )
}

/** Checks whether the great grand parent node is a propertyNode whose keyNode has the target value */
function checkGreatGrandParentNodeValue(node: ASTNode, value: string): boolean {
    const greatGrandParentNode = node.parent?.parent?.parent

    return (
        !!greatGrandParentNode &&
        isPropertyNode(greatGrandParentNode) &&
        greatGrandParentNode.keyNode?.value === value &&
        !greatGrandParentNode.parent?.parent
    )
}

/** Checks whetehr the node is inside a propertyNode with a given keyNode value */
function isInsidePropertyNode(node: ASTNode, property: string): boolean {
    /*
     * Current stringNode is a keyNode of a property of the object that is the valueNode of
     * the target property
     * For Example:
     *
     * {
     *     "targetProperty": {
     *          "currentNode": "someValue"
     *     }
     * }
     *
     * node (Node A) refers to the stringNode with value "currentNode"
     * node.parent (Node B) refers to the propertyNode, whose keyNode (Node A) has value "currentNode"
     *      and valueNode "someValue"
     * node.parent.parent (Node C) refers to the objectNode, which has a propertyNode (Node B)
     * node.parent.parent.parent refers to the propertyNode, whose keyNode has value "targetProperty"
     *      and valueNode is the objectNode (Node C)
     *
     * Therefore, to check whether current node is inside the target property node, we need to check
     * the greatGrandParentNode (node.parent.parent.parent)
     */
    if (isStringNode(node) && !!node.parent && isPropertyNode(node.parent) && node.parent.keyNode === node) {
        return checkGreatGrandParentNodeValue(node, property)
    }

    /*
     * Current node is a valueNode of the target propertyNode
     * The valueNode may be a objectNode, an arrayNode, or a stringNode
     * For Example:
     *
     * {
     *     "targetProperty": "currentNode"
     * }
     *
     * node (Node A) refers to the stringNode with value "currentNode", NOTE: node can also be an array or object node
     * node.parent (Node B) refers to the propertyNode, whose keyNode (Node A) has value "targetProperty"
     *      and valueNode "currentNode"
     *
     *
     * Therefore, to check whether current node is inside the target property node, we need to check
     * the parentNode (node.parent)
     */
    if (isObjectNode(node) || isArrayNode(node) || isStringNode(node)) {
        return checkParentNodeValue(node, property)
    }

    return false
}

/** Returns the value of keyNode of the proertyNode that is right before offset */
function getClosestPropertyNodeKeyBeforeOffset(node: ObjectASTNode, offset: number): string {
    let value = ''
    node.properties.forEach(property => {
        if (property.offset + property.length <= offset) {
            value = property.keyNode.value
        }
    })

    return value
}

/** Returns whether parameter snippets should be suggested for auto-completion
 *  return true if   1. node is in a valueNode of a propertyNode in the parameters
 */
export function suggestParametersSnippets(node: ASTNode, offset: number): boolean {
    if (isObjectNode(node)) {
        return checkGreatGrandParentNodeValue(node, 'parameters')
    } else if (isStringNode(node)) {
        const parametersNode = node.parent?.parent?.parent?.parent?.parent

        return (
            !!parametersNode &&
            isPropertyNode(parametersNode) &&
            parametersNode.keyNode?.value === 'parameters' &&
            !parametersNode.parent?.parent
        )
    }
}

/** Returns whether action snippets should be suggested for auto-completion
 *  return true if   1. node is in mainSteps/runtimeConfig node
 *                   2. node is in root and the property before offset is mainSteps/runtimeConfig
 */
export function suggestActionsSnippets(node: ASTNode, offset: number, schemaVersion: string): boolean {
    if (schemaVersion === '1.2') {
        return (
            isInsidePropertyNode(node, 'runtimeConfig') ||
            (isRoot(node) &&
                !node.parent &&
                getClosestPropertyNodeKeyBeforeOffset(node as ObjectASTNode, offset) === 'runtimeConfig')
        )
    }

    return (
        isInsidePropertyNode(node, 'mainSteps') ||
        (isRoot(node) && getClosestPropertyNodeKeyBeforeOffset(node as ObjectASTNode, offset) === 'mainSteps')
    )
}

/** Returns whether parameter names should be suggested for auto-completion
 *  return true if   1. node is an stringNode that is a a keyNode of a property of "parameters"
 */
export function suggestParameterNames(node: ASTNode, offset: number) {
    /*
     * Current stringNode is a keyNode of a property of "parameters"
     * For Example:
     *
     * {
     *     "parameters": {
     *          "currentNode": "someValue"
     *     }
     * }
     *
     * node (Node A) refers to the stringNode with value "currentNode"
     * node.parent (Node B) refers to the propertyNode, whose keyNode (Node A) has value "currentNode"
     *      and valueNode "someValue"
     * node.parent.parent (Node C) refers to the objectNode, which has a propertyNode (Node B)
     * node.parent.parent.parent refers to the propertyNode, whose keyNode has value "parameters"
     *      and valueNode is the objectNode (Node C)
     *
     * Therefore, to check whether current node is inside the "parameters" node, we need to check
     * the greatGrandParentNode (node.parent.parent.parent)
     */
    return (
        isInsidePropertyNode(node, 'parameters') ||
        (isRoot(node) && getClosestPropertyNodeKeyBeforeOffset(node as ObjectASTNode, offset) === 'parameters')
    )
}
