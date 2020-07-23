'use strict'
/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT
 */
Object.defineProperty(exports, '__esModule', { value: true })
exports.suggestParameterNames = exports.suggestActionsSnippets = exports.suggestParametersSnippets = exports.findCurrentNodeHelper = exports.findCurrentNode = exports.findRootNode = exports.isRoot = exports.isArrayNode = exports.isObjectNode = exports.isPropertyNode = exports.isStringNode = void 0
const yamlParser07_1 = require('yaml-language-server/out/server/src/languageservice/parser/yamlParser07')
function isStringNode(node) {
    return node.type === 'string'
}
exports.isStringNode = isStringNode
function isPropertyNode(node) {
    return node.type === 'property'
}
exports.isPropertyNode = isPropertyNode
function isObjectNode(node) {
    return node.type === 'object'
}
exports.isObjectNode = isObjectNode
function isArrayNode(node) {
    return node.type === 'array'
}
exports.isArrayNode = isArrayNode
function isRoot(node) {
    return isObjectNode(node) && !node.parent
}
exports.isRoot = isRoot
/** Checks whether loc is inside the range of node */
function isLocationInNodeRange(node, loc) {
    return loc >= node.offset && loc <= node.offset + node.length
}
/** Find the root node of the document */
function findRootNode(document, doc) {
    if (!doc) {
        // YAML
        const docText = document.getText()
        doc = yamlParser07_1.parse(docText).documents[0]
    }
    const rootNode = doc.root
    return rootNode
}
exports.findRootNode = findRootNode
/** Finds the deepest node that contains offset */
function findCurrentNode(rootNode, offset) {
    if (!rootNode) {
        return undefined
    }
    let node = findCurrentNodeHelper(rootNode, offset)
    if (!node) {
        node = rootNode
    }
    return node
}
exports.findCurrentNode = findCurrentNode
/** Recursively inspects children of rootNode for whether loc is in range */
function findCurrentNodeHelper(rootNode, loc) {
    if (isLocationInNodeRange(rootNode, loc)) {
        const { children } = rootNode
        if (children === null || children === void 0 ? void 0 : children.length) {
            const nodeInRange = children.find(node => isLocationInNodeRange(node, loc))
            if (nodeInRange) {
                return findCurrentNodeHelper(nodeInRange, loc)
            }
        }
        return rootNode
    }
}
exports.findCurrentNodeHelper = findCurrentNodeHelper
/** Checks whether the parent node is a propertyNode whose keyNode has the target value */
function checkParentNodeValue(node, value) {
    var _a, _b
    return (
        !!node.parent &&
        isPropertyNode(node.parent) &&
        ((_a = node.parent.keyNode) === null || _a === void 0 ? void 0 : _a.value) === value &&
        !((_b = node.parent.parent) === null || _b === void 0 ? void 0 : _b.parent)
    )
}
/** Checks whether the great grand parent node is a propertyNode whose keyNode has the target value */
function checkGreatGrandParentNodeValue(node, value) {
    var _a, _b, _c, _d
    const greatGrandParentNode =
        (_b = (_a = node.parent) === null || _a === void 0 ? void 0 : _a.parent) === null || _b === void 0
            ? void 0
            : _b.parent
    return (
        !!greatGrandParentNode &&
        isPropertyNode(greatGrandParentNode) &&
        ((_c = greatGrandParentNode.keyNode) === null || _c === void 0 ? void 0 : _c.value) === value &&
        !((_d = greatGrandParentNode.parent) === null || _d === void 0 ? void 0 : _d.parent)
    )
}
/** Checks whetehr the node is inside a propertyNode with a given keyNode value */
function isInsidePropertyNode(node, property) {
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
function getClosestPropertyNodeKeyBeforeOffset(node, offset) {
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
function suggestParametersSnippets(node, offset) {
    var _a, _b, _c, _d, _e, _f
    if (isObjectNode(node)) {
        return checkGreatGrandParentNodeValue(node, 'parameters')
    } else if (isStringNode(node)) {
        const parametersNode =
            (_d =
                (_c =
                    (_b = (_a = node.parent) === null || _a === void 0 ? void 0 : _a.parent) === null || _b === void 0
                        ? void 0
                        : _b.parent) === null || _c === void 0
                    ? void 0
                    : _c.parent) === null || _d === void 0
                ? void 0
                : _d.parent
        return (
            !!parametersNode &&
            isPropertyNode(parametersNode) &&
            ((_e = parametersNode.keyNode) === null || _e === void 0 ? void 0 : _e.value) === 'parameters' &&
            !((_f = parametersNode.parent) === null || _f === void 0 ? void 0 : _f.parent)
        )
    }
}
exports.suggestParametersSnippets = suggestParametersSnippets
/** Returns whether action snippets should be suggested for auto-completion
 *  return true if   1. node is in mainSteps/runtimeConfig node
 *                   2. node is in root and the property before offset is mainSteps/runtimeConfig
 */
function suggestActionsSnippets(node, offset, schemaVersion) {
    if (schemaVersion === '1.2') {
        return (
            isInsidePropertyNode(node, 'runtimeConfig') ||
            (isRoot(node) && !node.parent && getClosestPropertyNodeKeyBeforeOffset(node, offset) === 'runtimeConfig')
        )
    }
    return (
        isInsidePropertyNode(node, 'mainSteps') ||
        (isRoot(node) && getClosestPropertyNodeKeyBeforeOffset(node, offset) === 'mainSteps')
    )
}
exports.suggestActionsSnippets = suggestActionsSnippets
/** Returns whether parameter names should be suggested for auto-completion
 *  return true if   1. node is an stringNode that is a a keyNode of a property of "parameters"
 */
function suggestParameterNames(node, offset) {
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
        (isRoot(node) && getClosestPropertyNodeKeyBeforeOffset(node, offset) === 'parameters')
    )
}
exports.suggestParameterNames = suggestParameterNames
//# sourceMappingURL=astFunctions.js.map
