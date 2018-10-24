/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as path from 'path'
import * as ts from 'typescript'
import * as vscode from 'vscode'
import * as filesystem from './filesystem'
import { LambdaHandlerCandidate, LambdaHandlerSearch } from './lambdaHandlerSearch'

/**
 * Detects functions that could possibly be used as Lambda Function Handlers from a Typescript file.
 */
export class TypescriptLambdaHandlerSearch implements LambdaHandlerSearch {

    public static readonly MAXIMUM_FUNCTION_PARAMETERS: number = 3

    private readonly _uri!: vscode.Uri

    public constructor(uri: vscode.Uri) {
        this._uri = uri
    }

    /**
     * @description Looks for functions that appear to be valid Lambda Function Handlers.
     * @returns A collection of information for each detected candidate.
     */
    public async findCandidateLambdaHandlers(): Promise<LambdaHandlerCandidate[]> {
        return await this.getCandidateHandlers(this._uri.fsPath)
    }

    private async getCandidateHandlers(filename: string): Promise<LambdaHandlerCandidate[]> {
        const fileContents = await filesystem.readFileAsyncAsString(filename)

        const sourceFile = ts.createSourceFile(filename, fileContents, ts.ScriptTarget.Latest, true)

        const handlers: LambdaHandlerCandidate[] = this.processSourceFile(sourceFile, filename)

        return handlers
    }

    /**
     * @description looks for Lambda Handler candidates in the given source file
     * Lambda Handler candidates are top level exported methods/functions.
     *
     * @param sourceFile SourceFile child node to process
     * @param filename filename of the loaded SourceFile
     * @returns Collection of candidate Lambda handler information, empty array otherwise
     */
    private processSourceFile(sourceFile: ts.SourceFile, filename: string): LambdaHandlerCandidate[] {
        // functionDeclarations - each top level function declared
        const functionDeclarations: ts.SignatureDeclaration[] = []
        // expressionStatements - all statements like "exports.handler = ..."
        const expressionStatements: ts.ExpressionStatement[] = []
        // exportNodes - all "export function Xyz()"
        const exportNodes: ts.Node[] = []

        // look for nodes of interest
        sourceFile.forEachChild((node: ts.Node) => {
            if (ts.isFunctionLike(node)) {
                functionDeclarations.push(node)
            }

            if (ts.isExpressionStatement(node) && (ts.isBinaryExpression(node.expression))) {
                expressionStatements.push(node)
            }

            if (TypescriptLambdaHandlerSearch.isNodeExported(node)) {
                exportNodes.push(node)
            }
        })

        const handlers: LambdaHandlerCandidate[] = []

        handlers.push(...TypescriptLambdaHandlerSearch.findModuleExportsRelatedHandlerCandidates(
            functionDeclarations,
            expressionStatements,
            filename
        ))

        handlers.push(...TypescriptLambdaHandlerSearch.findExportRelatedHandlerCandidates(
            exportNodes,
            filename
        ))

        return handlers
    }

    /**
     * @description Looks at function declaration and module.exports assignments to find candidate Lamdba handlers
     * @param functionDeclarations - Function declaration nodes
     * @param expressionStatements - assignment expressions
     * @param filename filename of the file containing these nodes
     */
    private static findModuleExportsRelatedHandlerCandidates(
        functionDeclarations: ts.SignatureDeclaration[],
        expressionStatements: ts.ExpressionStatement[],
        filename: string
    ): LambdaHandlerCandidate[] {
        const baseFilename = path.parse(filename).name

        // Determine the candidate function declarations
        const functionHandlerNames: string[] = functionDeclarations
            .filter(fn => fn.parameters.length <= TypescriptLambdaHandlerSearch.MAXIMUM_FUNCTION_PARAMETERS)
            .filter(fn => !!fn.name)
            .map(fn => fn.name!.getText())

        // Determine the candidate module exports assignments
        const candidateExpressionStatements: ts.ExpressionStatement[] = expressionStatements
            .filter(TypescriptLambdaHandlerSearch.isModuleExportsAssignment)
            .filter(stmt => {
                return TypescriptLambdaHandlerSearch.isEligibleLambdaHandlerAssignment(stmt, functionHandlerNames)
            })

        // Join to find actual module.exports assignments of interest
        const handlers: LambdaHandlerCandidate[] = []

        candidateExpressionStatements.forEach(candidate => {
            // 'module.exports.xyz' => ['module', 'exports', 'xyz']
            const lhsComponents: string[] = (candidate.expression as ts.BinaryExpression)
                .left.getText().split('.').map(x => x.trim())

            const exportsTarget: string = lhsComponents[0] === 'exports' ? lhsComponents[1] : lhsComponents[2]

            handlers.push({
                filename: filename,
                handlerName: `${baseFilename}.${exportsTarget}`,
            })
        })

        return handlers
    }

    /**
     * @description Looks at export function declarations to find candidate Lamdba handlers
     * @param exportNodes - nodes that 'export' something
     * @param filename filename of the file containing these nodes
     */
    private static findExportRelatedHandlerCandidates(
        exportNodes: ts.Node[],
        filename: string
    ): LambdaHandlerCandidate[] {
        const baseFilename = path.parse(filename).name

        const handlers: LambdaHandlerCandidate[] = []

        exportNodes.forEach(exportNode => {
            if (ts.isFunctionLike(exportNode)
                && (TypescriptLambdaHandlerSearch.isFunctionLambdaHandlerCandidate(exportNode))) {

                if (!!exportNode.name) {
                    handlers.push({
                        filename: filename,
                        handlerName: `${baseFilename}.${exportNode.name.getText()}`,
                    })
                }
            }
        })

        return handlers
    }

    /**
     * @description Whether or not the given expression is attempting to assign to '[module.]exports.foo'
     * @param expressionStatement Expression node to evaluate
     */
    private static isModuleExportsAssignment(expressionStatement: ts.ExpressionStatement): boolean {
        if (ts.isBinaryExpression(expressionStatement.expression)) {
            const lhsComponents: string[] = expressionStatement.expression.left.getText().split('.').map(x => x.trim())

            return (lhsComponents.length === 3 && lhsComponents[0] === 'module' && lhsComponents[1] === 'exports')
                || (lhsComponents.length === 2 && lhsComponents[0] === 'exports')
        }

        return false
    }

    /**
     * @description Whether or not the given expression appears to be assigning a candidate Lambda Handler
     * Expression could be one of:
     *      [module.]exports.foo = alreadyDeclaredFunction
     *      [module.]exports.foo = (event, context) => { ... }
     * @param expressionStatement Expression node to evaluate
     * @param functionHandlerNames Names of declared functions considered to be Handler Candidates
     */
    private static isEligibleLambdaHandlerAssignment(
        expressionStatement: ts.ExpressionStatement,
        functionHandlerNames: string[]
    ): boolean {
        if (ts.isBinaryExpression(expressionStatement.expression)) {
            return this.isTargetFunctionReference(expressionStatement.expression.right, functionHandlerNames)
                || this.isValidFunctionAssignment(expressionStatement.expression.right)
        }

        return false
    }

    /**
     * @description Whether or not the given expression appears to contain a function of interest on the right hand side
     *
     * Example expression:
     *      something = alreadyDeclaredFunction
     * @param expression Expression node to evaluate
     * @param targetFunctionNames Names of functions of interest
     */
    private static isTargetFunctionReference(expression: ts.Expression, targetFunctionNames: string[]): boolean {
        if (ts.isIdentifier(expression)) {
            return (targetFunctionNames.indexOf(expression.text) !== -1)
        }

        return false
    }

    /**
     * @description Whether or not the given expression appears to have a function that could be a valid Lambda handler
     * on the right hand side.
     *
     * Example expression:
     *      something = (event, context) => { }
     * @param expression Expression node to evaluate
     * @param targetFunctionNames Names of functions of interest
     */
    private static isValidFunctionAssignment(expression: ts.Expression): boolean {
        if (ts.isFunctionLike(expression)) {
            return expression.parameters.length <= TypescriptLambdaHandlerSearch.MAXIMUM_FUNCTION_PARAMETERS
        }

        return false
    }

    /**
     * @description Indicates whether or not a node is marked as visible outside this file
     * @param node Node to check
     * @returns true if node is exported, false otherwise
     */
    private static isNodeExported(node: ts.Node): boolean {
        // tslint:disable-next-line:no-bitwise
        return ((ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Export) !== 0)
    }

    /**
     * @description Indicates whether or not a function/method could be a Lambda Handler
     * @param node Signature Declaration Node to check
     */
    private static isFunctionLambdaHandlerCandidate(node: ts.SignatureDeclaration): boolean {
        return node.parameters.length <= TypescriptLambdaHandlerSearch.MAXIMUM_FUNCTION_PARAMETERS && !!node.name
    }
}
