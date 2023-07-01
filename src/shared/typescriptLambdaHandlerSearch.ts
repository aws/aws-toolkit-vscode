/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as ts from 'typescript'
import { LambdaHandlerSearch, RootlessLambdaHandlerCandidate } from './lambdaHandlerSearch'

const getRange = (node: ts.Node) => ({
    positionStart: node.getStart(),
    positionEnd: node.end,
})

/**
 * Detects functions that could possibly be used as Lambda Function Handlers from a Typescript file.
 */
export class TypescriptLambdaHandlerSearch implements LambdaHandlerSearch {
    public static readonly maximumFunctionParameters: number = 3

    private readonly _baseFilename: string
    // _candidateDeclaredFunctionNames - names of functions that could be lambda handlers
    private readonly _candidateDeclaredFunctionNames: Set<string> = new Set()
    // _candidateModuleExportsExpressions - all statements like "exports.handler = ..."
    private _candidateModuleExportsExpressions: ts.ExpressionStatement[] = []
    // _candidateExportDeclarations - all "export { xyz }"
    private _candidateExportDeclarations: ts.ExportDeclaration[] = []
    // _candidateExportNodes - all "export function Xyz()" / "export const Xyz = () => {}"
    private _candidateExportNodes: ts.Node[] = []

    public constructor(private readonly filename: string, private readonly fileContents: string) {
        this._baseFilename = path.parse(this.filename).name
    }

    /**
     * @description Looks for functions that appear to be valid Lambda Function Handlers.
     * @returns A collection of information for each detected candidate.
     */
    public async findCandidateLambdaHandlers(): Promise<RootlessLambdaHandlerCandidate[]> {
        this._candidateDeclaredFunctionNames.clear()
        this._candidateModuleExportsExpressions = []
        this._candidateExportDeclarations = []
        this._candidateExportNodes = []

        return await this.getCandidateHandlers()
    }

    private async getCandidateHandlers(): Promise<RootlessLambdaHandlerCandidate[]> {
        const sourceFile = ts.createSourceFile(this.filename, this.fileContents, ts.ScriptTarget.Latest, true)

        const handlers: RootlessLambdaHandlerCandidate[] = this.processSourceFile(sourceFile)

        return handlers
    }

    /**
     * @description looks for Lambda Handler candidates in the given source file
     * Lambda Handler candidates are top level exported methods/functions.
     *
     * @param sourceFile SourceFile child node to process
     * @returns Collection of candidate Lambda handler information, empty array otherwise
     */
    private processSourceFile(sourceFile: ts.SourceFile): RootlessLambdaHandlerCandidate[] {
        this.scanSourceFile(sourceFile)

        const handlers: RootlessLambdaHandlerCandidate[] = []

        handlers.push(...this.findCandidateHandlersInModuleExports())
        handlers.push(...this.findCandidateHandlersInExportedFunctions())
        handlers.push(...this.findCandidateHandlersInExportDecls())

        return handlers
    }

    /**
     * @description looks through a file's nodes, looking for data to support finding handler candidates
     */
    private scanSourceFile(sourceFile: ts.SourceFile): void {
        sourceFile.forEachChild((node: ts.Node) => {
            // Function declarations
            if (ts.isFunctionLike(node)) {
                if (TypescriptLambdaHandlerSearch.isFunctionLambdaHandlerCandidate(node)) {
                    this._candidateDeclaredFunctionNames.add(node.name!.getText())
                }
            }

            // Arrow Function declarations "const foo = (arg) => { }"
            if (ts.isVariableStatement(node)) {
                node.declarationList.forEachChild(declaration => {
                    if (ts.isVariableDeclaration(declaration)) {
                        const declarationName: string = declaration.name.getText()

                        if (
                            declarationName.length > 0 &&
                            declaration.initializer &&
                            ts.isFunctionLike(declaration.initializer) &&
                            TypescriptLambdaHandlerSearch.isFunctionLambdaHandlerCandidate(
                                declaration.initializer,
                                false // initializers do not have a name value, it is up in declaration.name
                            )
                        ) {
                            this._candidateDeclaredFunctionNames.add(declarationName)
                        }
                    }
                })
            }

            // export function xxx / "export const xxx = () => {}"
            // We grab all of these and filter them later on in order to better deal with the VariableStatement entries
            if (TypescriptLambdaHandlerSearch.isNodeExported(node)) {
                this._candidateExportNodes.push(node)
            }

            // Things like "exports.handler = ..."
            // Grab all, cull after we've found all valid functions that can be referenced on rhs
            if (ts.isExpressionStatement(node)) {
                if (TypescriptLambdaHandlerSearch.isModuleExportsAssignment(node)) {
                    this._candidateModuleExportsExpressions.push(node)
                }
            }

            // Things like "export { xxx }"
            // Grab all, cull after we've found all valid functions that can be referenced in brackets
            if (ts.isExportDeclaration(node)) {
                this._candidateExportDeclarations.push(node)
            }
        })
    }

    /**
     * @description Looks at module.exports assignments to find candidate Lamdba handlers
     */
    private findCandidateHandlersInModuleExports(): RootlessLambdaHandlerCandidate[] {
        return this._candidateModuleExportsExpressions
            .filter(expression => {
                return TypescriptLambdaHandlerSearch.isEligibleLambdaHandlerAssignment(
                    expression,
                    this._candidateDeclaredFunctionNames
                )
            })
            .map(candidate => {
                // 'module.exports.xyz' => ['module', 'exports', 'xyz']
                const lhsComponents: string[] = (candidate.expression as ts.BinaryExpression).left
                    .getText()
                    .split('.')
                    .map(x => x.trim())

                const exportsTarget: string = lhsComponents[0] === 'exports' ? lhsComponents[1] : lhsComponents[2]

                return {
                    filename: this.filename,
                    handlerName: `${this._baseFilename}.${exportsTarget}`,
                    range: getRange(candidate),
                }
            })
    }

    /**
     * @description Looks at "export { xyz }" statements to find candidate Lambda handlers
     */
    private findCandidateHandlersInExportDecls(): RootlessLambdaHandlerCandidate[] {
        const handlers: RootlessLambdaHandlerCandidate[] = []

        this._candidateExportDeclarations.forEach(exportDeclaration => {
            if (exportDeclaration.exportClause) {
                exportDeclaration.exportClause.forEachChild(clause => {
                    if (ts.isExportSpecifier(clause)) {
                        const exportedFunction: string = clause.name.getText()

                        if (this._candidateDeclaredFunctionNames.has(exportedFunction)) {
                            handlers.push({
                                filename: this.filename,
                                handlerName: `${this._baseFilename}.${exportedFunction}`,
                                range: getRange(clause),
                            })
                        }
                    }
                })
            }
        })

        return handlers
    }

    /**
     * @description Looks at export function declarations to find candidate Lamdba handlers
     */
    private findCandidateHandlersInExportedFunctions(): RootlessLambdaHandlerCandidate[] {
        const handlers: RootlessLambdaHandlerCandidate[] = []

        this._candidateExportNodes.forEach(exportNode => {
            if (
                ts.isFunctionLike(exportNode) &&
                TypescriptLambdaHandlerSearch.isFunctionLambdaHandlerCandidate(exportNode) &&
                !!exportNode.name
            ) {
                handlers.push({
                    filename: this.filename,
                    handlerName: `${this._baseFilename}.${exportNode.name.getText()}`,
                    range: getRange(exportNode),
                })
            } else if (ts.isVariableStatement(exportNode)) {
                exportNode.declarationList.forEachChild(declaration => {
                    if (
                        ts.isVariableDeclaration(declaration) &&
                        !!declaration.initializer &&
                        ts.isFunctionLike(declaration.initializer) &&
                        TypescriptLambdaHandlerSearch.isFunctionLambdaHandlerCandidate(declaration.initializer, false)
                    ) {
                        handlers.push({
                            filename: this.filename,
                            handlerName: `${this._baseFilename}.${declaration.name.getText()}`,
                            range: getRange(declaration),
                        })
                    }
                })
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
            const lhsComponents: string[] = expressionStatement.expression.left
                .getText()
                .split('.')
                .map(x => x.trim())

            return (
                (lhsComponents.length === 3 && lhsComponents[0] === 'module' && lhsComponents[1] === 'exports') ||
                (lhsComponents.length === 2 && lhsComponents[0] === 'exports')
            )
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
        functionHandlerNames: Set<string>
    ): boolean {
        if (ts.isBinaryExpression(expressionStatement.expression)) {
            return (
                this.isTargetFunctionReference(expressionStatement.expression.right, functionHandlerNames) ||
                this.isValidFunctionAssignment(expressionStatement.expression.right)
            )
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
    private static isTargetFunctionReference(expression: ts.Expression, targetFunctionNames: Set<string>): boolean {
        if (ts.isIdentifier(expression)) {
            return targetFunctionNames.has(expression.text)
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
            return expression.parameters.length <= TypescriptLambdaHandlerSearch.maximumFunctionParameters
        }

        return false
    }

    /**
     * @description Indicates whether or not a node is marked as visible outside this file
     * @param node Node to check
     * @returns true if node is exported, false otherwise
     */
    private static isNodeExported(node: ts.Node): boolean {
        const flags: ts.ModifierFlags = ts.getCombinedModifierFlags(node as ts.Declaration)

        return (flags & ts.ModifierFlags.Export) === ts.ModifierFlags.Export
    }

    /**
     * @description Indicates whether or not a function/method could be a Lambda Handler
     * @param node Signature Declaration Node to check
     * @param validateName whether or not to check the name property
     */
    private static isFunctionLambdaHandlerCandidate(
        node: ts.SignatureDeclaration,
        validateName: boolean = true
    ): boolean {
        const nameIsValid: boolean = !validateName || !!node.name

        return node.parameters.length <= TypescriptLambdaHandlerSearch.maximumFunctionParameters && nameIsValid
    }
}
