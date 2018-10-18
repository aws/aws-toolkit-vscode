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

    private _uri!: vscode.Uri

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

        const handlers: LambdaHandlerCandidate[] = []

        sourceFile.forEachChild(
            childNode => {
                const foundHandlers = TypescriptLambdaHandlerSearch.visitSourceFileChild(
                    childNode,
                    filename
                )
                handlers.push(...foundHandlers)
            }
        )

        return handlers
    }

    /**
     * @description looks for Lambda Handler candidates in given node.
     * Lambda Handler candidates are top level exported methods/functions.
     *
     * @param node SourceFile child node to visit
     * @param filename filename of the loaded SourceFile
     * @returns Collection of candidate Lambda handler information, empty array otherwise
     */
    private static visitSourceFileChild(node: ts.Node, filename: string): LambdaHandlerCandidate[] {
        const handlers: LambdaHandlerCandidate[] = []

        if (this.isNodeExported(node)) {
            const baseFilename = path.parse(filename).name

            if (ts.isMethodDeclaration(node)) {
                if (this.isMethodLambdaHandlerCandidate(node)) {
                    const handlerStack = [baseFilename, node.name!.getText()]
                    handlers.push({
                        filename: filename,
                        handlerName: handlerStack.join('.'),
                        handlerStack: handlerStack
                    })
                }
            } else if (ts.isFunctionDeclaration(node)) {
                if (this.isFunctionLambdaHandlerCandidate(node)) {
                    const handlerStack = [baseFilename, node.name!.getText()]
                    handlers.push({
                        filename: filename,
                        handlerName: handlerStack.join('.'),
                        handlerStack: handlerStack
                    })
                }
            }
        }

        return handlers
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
     * @description Indicates whether or not a method could be a Lambda Handler
     * @param node Method Node to check
     */
    private static isMethodLambdaHandlerCandidate(node: ts.MethodDeclaration): boolean {
        return node.parameters.length <= 3
    }

    /**
     * @description Indicates whether or not a function could be a Lambda Handler
     * @param node Function Node to check
     */
    private static isFunctionLambdaHandlerCandidate(node: ts.FunctionDeclaration): boolean {
        return node.parameters.length <= 3 && !!node.name
    }
}
