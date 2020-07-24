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
export { ASTNode }
export interface ASTTree extends JSONDocument {
    root?: ASTNode
}
export declare function isStringNode(node: ASTNode): node is StringASTNode
export declare function isPropertyNode(node: ASTNode): node is PropertyASTNode
export declare function isObjectNode(node: ASTNode): node is ObjectASTNode
export declare function isArrayNode(node: ASTNode): node is ArrayASTNode
export declare function isRoot(node: ASTNode): boolean
/** Find the root node of the document */
export declare function findRootNode(document: TextDocument, doc?: JSONDocument): ASTNode
/** Finds the deepest node that contains offset */
export declare function findCurrentNode(rootNode: ASTNode, offset: number): ASTNode
/** Recursively inspects children of rootNode for whether loc is in range */
export declare function findCurrentNodeHelper(rootNode: ASTNode, loc: number): ASTNode | undefined
/** Returns whether parameter snippets should be suggested for auto-completion
 *  return true if   1. node is in a valueNode of a propertyNode in the parameters
 */
export declare function suggestParametersSnippets(node: ASTNode, offset: number): boolean
/** Returns whether action snippets should be suggested for auto-completion
 *  return true if   1. node is in mainSteps/runtimeConfig node
 *                   2. node is in root and the property before offset is mainSteps/runtimeConfig
 */
export declare function suggestActionsSnippets(node: ASTNode, offset: number, schemaVersion: string): boolean
/** Returns whether parameter names should be suggested for auto-completion
 *  return true if   1. node is an stringNode that is a a keyNode of a property of "parameters"
 */
export declare function suggestParameterNames(node: ASTNode, offset: number): boolean
