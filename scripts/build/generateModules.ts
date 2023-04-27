/*!
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as ts from 'typescript'
import * as glob from 'glob'
import * as path from 'path'
import * as fs from 'fs-extra'

const config = readConfig()
const srcDir = path.join(process.cwd(), 'src')
const header = `
/*!
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
`.trim()

interface Module {
    readonly id: string
    readonly source: ts.SourceFile
    readonly activation?: ts.FunctionDeclaration
}

function readConfig() {
    const configFile = ts.findConfigFile(process.cwd(), f => {
        try {
            fs.accessSync(f, fs.constants.F_OK)
            return true
        } catch (err) {
            return false
        }
    })

    if (!configFile) {
        throw new Error('No `tsconfig.json` file found')
    }

    return ts.readJsonConfigFile(configFile, f => fs.readFileSync(f, 'utf-8'))
}

async function getModules(cwd: string): Promise<Module[]> {
    // Only search 1-level deep to reduce noise
    // Could also throw if no activation function is found
    // But in that case we should add an extra level to the project
    // structure to make things explicit
    const modules = glob.sync('*/index.ts', {
        cwd,
        ignore: ['{test,integrationTest,testE2E}/*'],
    })

    return await Promise.all(
        modules.map(async p => {
            const modulePath = path.join(cwd, p)
            const content = await fs.readFile(modulePath, 'utf-8')
            const source = ts.createSourceFile(modulePath, content, config)
            const id = path.dirname(p).replace(/[\/\\\.]+/g, '_')

            return {
                id,
                source,
                activation: getActivation(source),
            }
        })
    )
}

function getActivation(source: ts.SourceFile): ts.FunctionDeclaration | undefined {
    let decl: ts.FunctionDeclaration | undefined
    ts.forEachChild(source, node => {
        if (ts.isFunctionDeclaration(node) && node.name?.text === 'activate') {
            if (!ts.getModifiers(node)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
                throw new Error(`Module has an activation function but it's not exported: ${source.fileName}`)
            }

            const params = node.parameters
            if (params.length > 0) {
                const firstParamType = params[0].type?.getText(source)
                if (!firstParamType) {
                    throw new Error(`No parameter type found in activation function: ${source.fileName}`)
                }

                // The "correct" way to check this is to actually load `vscode.d.ts` into the same
                // program and check the types for equality. There's little benefit in doing this
                // though as the types are still checked at build time anyway. A simple check here
                // should find the majority of mistakes and fails sooner.
                if (!['ExtensionContext', 'vscode.ExtensionContext'].includes(firstParamType)) {
                    throw new Error(
                        `An activation function must have "vscode.ExtensionContext" as its first parameter: ${source.fileName}`
                    )
                }
            }

            decl = node
        }
    })

    return decl
}

async function generate() {
    const importDeclarations: ts.ImportDeclaration[] = []
    const moduleStatements: ts.VariableStatement[] = []
    const typeDeclarations: ts.TypeAliasDeclaration[] = []
    const moduleIdents = new Map<Module['id'], ts.Identifier>()
    const modules = await getModules(srcDir)
    const source = ts.createSourceFile('modules.gen.ts', '', config)

    const vscodeClause = ts.factory.createImportClause(
        false,
        undefined,
        ts.factory.createNamespaceImport(ts.factory.createIdentifier('vscode'))
    )
    const vscodeSpecifier = ts.factory.createStringLiteral('vscode', true)
    const modulesSpecifier = ts.factory.createStringLiteral('./shared/modules', true)
    const modulesClause = ts.factory.createImportClause(
        false,
        undefined,
        ts.factory.createNamedImports([
            ts.factory.createImportSpecifier(false, undefined, ts.factory.createIdentifier('register')),
            ts.factory.createImportSpecifier(false, undefined, ts.factory.createIdentifier('activateAll')),
            ts.factory.createImportSpecifier(false, undefined, ts.factory.createIdentifier('ModuleApi')),
        ])
    )

    importDeclarations.push(ts.factory.createImportDeclaration(undefined, vscodeClause, vscodeSpecifier))
    importDeclarations.push(ts.factory.createImportDeclaration(undefined, modulesClause, modulesSpecifier))

    const getText = (source: ts.SourceFile, node: ts.BindingName) =>
        !ts.isIdentifier(node) ? node.getText(source) : node.text

    function getReference(source: ts.SourceFile, param: ts.ParameterDeclaration, visited: Set<ts.SourceFile>) {
        // Typescript can detect circular references in most situations but we'll check here too
        if (visited.has(source)) {
            const message = Array.from(visited)
                .map(s => path.relative(srcDir, s.fileName))
                .join(' --> ')
            throw new Error(`Found circular dependnecy: ${message}`)
        }

        if (param.type === undefined) {
            throw new Error(`${source.fileName}: parameter has no type: ${getText(source, param.name)}`)
        }

        // Using the name of the type is not really the right way to do this.
        // The proper way requires creating a new program and loading the source
        // files. Then we can use the type checker to get the actual return types
        // and check them. The text is "good enough" of course.
        const id = param.type.getText(source)
        const targetModule = modules.find(m => m.id === id)
        if (targetModule === undefined) {
            throw new Error(
                `${source.fileName}: parameter "${getText(source, param.name)}" references an undefined module: ${id}`
            )
        }

        const moduleIdent = resolveModuleIdentifer(targetModule, new Set([...visited, source]))
        if (moduleIdent === undefined) {
            throw new Error(
                `${source.fileName}: parameter "${getText(
                    source,
                    param.name
                )}" references an unregistered module: ${id}`
            )
        }

        return moduleIdent
    }

    function resolveModuleIdentifer(m: Module, visited = new Set<ts.SourceFile>()): ts.Identifier | undefined {
        if (!m.activation) {
            return
        }

        // Future improvement: add source mapping so it's easier to go to the file
        if (moduleIdents.has(m.id)) {
            return moduleIdents.get(m.id)!
        }

        const importPath = path.dirname(path.relative(srcDir, m.source.fileName))
        const dynamicImportCb = ts.factory.createArrowFunction(
            undefined,
            undefined,
            [],
            undefined,
            undefined,
            ts.factory.createCallExpression(ts.factory.createIdentifier('import'), undefined, [
                ts.factory.createStringLiteral(`./${importPath}`, true),
            ])
        )

        const deps = m.activation.parameters.slice(1).map(p => getReference(m.source, p, visited))
        const registerExp = ts.factory.createCallExpression(ts.factory.createIdentifier('register'), undefined, [
            ts.factory.createStringLiteral(m.id, true),
            dynamicImportCb,
            ...deps,
        ])

        const moduleName = `${m.id}Module`
        const moduleIdent = ts.factory.createIdentifier(moduleName)
        const moduleExp = ts.factory.createVariableDeclaration(moduleName, undefined, undefined, registerExp)
        const moduleStatement = ts.factory.createVariableStatement(
            [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
            ts.factory.createVariableDeclarationList([moduleExp], ts.NodeFlags.Const)
        )

        const typeExp = ts.factory.createTypeAliasDeclaration(
            [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
            m.id,
            undefined,
            ts.factory.createTypeReferenceNode('ModuleApi', [ts.factory.createTypeQueryNode(moduleIdent)])
        )

        moduleStatements.push(moduleStatement)
        typeDeclarations.push(typeExp)
        moduleIdents.set(m.id, moduleIdent)

        return moduleIdent
    }

    modules.forEach(m => resolveModuleIdentifer(m))

    // The generated file has side-effects. Export an activation function to capture them.
    const activateAllDecl = ts.factory.createFunctionDeclaration(
        [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
        undefined,
        'activateModules',
        undefined,
        [
            ts.factory.createParameterDeclaration(
                undefined,
                undefined,
                'ctx',
                undefined,
                ts.factory.createTypeReferenceNode(
                    ts.factory.createQualifiedName(
                        ts.factory.createIdentifier('vscode'),
                        ts.factory.createIdentifier('ExtensionContext')
                    )
                )
            ),
        ],
        undefined,
        ts.factory.createBlock(
            [
                ts.factory.createReturnStatement(
                    ts.factory.createCallExpression(ts.factory.createIdentifier('activateAll'), undefined, [
                        ts.factory.createIdentifier('ctx'),
                    ])
                ),
            ],
            true
        )
    )

    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed })
    const print = (...nodes: ts.Node[]) =>
        nodes.map(n => printer.printNode(ts.EmitHint.Unspecified, n, source)).join('\n')

    // Write out all module paths into `dist` so they can be used as entry points in webpack
    // This bundles each module directly into `dist` instead of inside `dist/src`
    const paths: Record<string, string> = {}
    for (const m of modules) {
        if (m.activation) {
            paths[m.id] = `./${path.relative(process.cwd(), m.source.fileName)}`
        }
    }
    await fs.mkdirp(path.join(process.cwd(), '.', 'dist'))
    await fs.writeFile(path.join(process.cwd(), '.', 'dist', 'modulePaths.json'), JSON.stringify(paths, undefined, 4))

    return [
        header,
        print(...importDeclarations),
        print(...moduleStatements),
        print(...typeDeclarations),
        print(activateAllDecl),
    ].join('\n\n')
}

generate().then(async r => {
    await fs.writeFile(path.join('src', 'modules.gen.ts'), r)
})
