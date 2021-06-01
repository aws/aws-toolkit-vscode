/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as ts from 'typescript'
import * as path from 'path'

export default function transformer(program: ts.Program): ts.TransformerFactory<ts.SourceFile> {
    return (context: ts.TransformationContext) => (file: ts.SourceFile) => visitNodeAndChildren(file, program, context)
}

function visitNodeAndChildren(node: ts.SourceFile, program: ts.Program, context: ts.TransformationContext): ts.SourceFile
function visitNodeAndChildren(node: ts.Node, program: ts.Program, context: ts.TransformationContext): ts.Node | undefined
function visitNodeAndChildren(node: ts.Node, program: ts.Program, context: ts.TransformationContext): ts.Node | undefined {
    return ts.visitEachChild(visitNode(node, program), childNode => visitNodeAndChildren(childNode, program, context), context)
}

type KeyPaths = { [key: string]: KeyPaths }

/**
 * TypeScript interfaces normally do not exist at runtime. However, this function allows us to traverse the
 * AST and extract out interface definitions, generated a 'stub' interface at compile time. The stub interface
 * can be thought of as a constructor that sets all interface-like fields to empty objects and every other field
 * to undefined (void 0)
 */
function generateKeyPaths(node: ts.Node, checker: ts.TypeChecker, d: number = 0): KeyPaths | undefined {
    let paths: KeyPaths = {}
    let type: ts.Type

    if (d > 10) {
      return undefined
    }

    if (ts.isTypeReferenceNode(node)) {
        const symbol = checker.getSymbolAtLocation(node.typeName)
        // Type does not actually exist
        if (symbol === undefined) {
            return undefined
        }

        type = checker.getDeclaredTypeOfSymbol(symbol)
        // We do not want to expant classes, nor do we want to expand beyond the first reference
        if (type.isClass() || type.isLiteral() || d > 0) { 
            return undefined
        }
    } else if (ts.isTypeLiteralNode(node)) {
        type = checker.getTypeAtLocation(node)
    } else if (ts.isLiteralTypeNode(node) || ts.isStringLiteral(node)) {
        return undefined
    } else {
        const childPaths = node.getChildren().map(child => generateKeyPaths(child, checker, d+1))
        childPaths.forEach(path => paths = {...paths, ...path})
        return paths
    }

    checker.getPropertiesOfType(type).forEach(property => {
        if (!property.name.startsWith('__@')) {
            const childPaths = property.declarations.map(declaration => 
                generateKeyPaths(declaration, checker, d+1)).filter(x => x)
            if (childPaths.length > 0) {  
                let tmp = {}
                childPaths.forEach(path => tmp = {...tmp, ...path})
                paths[property.name] = tmp
            }
        }
    })

    return paths
}

function visitNode(node: ts.SourceFile, program: ts.Program): ts.SourceFile;
function visitNode(node: ts.Node, program: ts.Program): ts.Node | undefined;
function visitNode(node: ts.Node, program: ts.Program): ts.Node | undefined {
    const typeChecker = program.getTypeChecker()
    if (isImportExpression(node)) {
        return
    }
    if (!isCallExpression(node, typeChecker, 'initializeInterface')) {
        return node
    }
    if (!node.typeArguments) {
        return ts.factory.createObjectLiteralExpression()
    }

    function conv(keys: KeyPaths): ts.ObjectLiteralExpression | undefined {
        const props: ts.ObjectLiteralElementLike[] = []
        Object.keys(keys).forEach(key => {
            const subProp = conv(keys[key])
            if (subProp === undefined) {
                props.push(ts.factory.createPropertyAssignment(key, ts.factory.createVoidZero()))
            } else {
                props.push(ts.factory.createPropertyAssignment(key, subProp))
            }
        })
        if (props.length === 0) {
            return undefined
        }
        return ts.factory.createObjectLiteralExpression(props)
    }

    const keys: KeyPaths | undefined = generateKeyPaths(node.typeArguments[0], typeChecker)
    return conv(keys ?? {}) ?? ts.factory.createObjectLiteralExpression()
}

function isImportExpression(node: ts.Node): node is ts.ImportDeclaration {
    if (!ts.isImportDeclaration(node)) {
        return false;
    }
    const module = (node.moduleSpecifier as ts.StringLiteral).text
    try {
        return __dirname === path.resolve(path.dirname(node.getSourceFile().fileName), module)
    } catch(e) {
        return false
    }
}

const indexTs = path.join(__dirname, 'index.d.ts')
function isCallExpression(node: ts.Node, typeChecker: ts.TypeChecker, name: string): node is ts.CallExpression {
    if (!ts.isCallExpression(node)) {
        return false
    }
    const declaration = typeChecker.getResolvedSignature(node)?.declaration
    if (!declaration || ts.isJSDocSignature(declaration) || declaration.name?.getText() !== name) {
        return false
    }
    try {
        return require.resolve(declaration.getSourceFile().fileName) === indexTs
    } catch {
        return false
    }
}
