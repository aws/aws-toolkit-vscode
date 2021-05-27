/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

// @ts-nocheck

import * as gulp from 'gulp'
import * as nls from 'vscode-nls-dev'
import { processFile, removePathPrefix } from 'vscode-nls-dev/lib/lib'
import * as path from 'path'
import * as fs from 'fs-extra'
import * as es from 'event-stream'
import * as ts from 'gulp-typescript'
import filter from 'gulp-filter'
import gulpEsbuild from 'gulp-esbuild'

/** ISO 639-2 language codes */
const languages = [
    { id: 'en', destination: 'eng' },
    //{ id: "es", destination: "spa" },
]

const packageJsonFile = path.join(__dirname, 'package.json')
const packageJson = JSON.parse(fs.readFileSync(packageJsonFile, 'utf8'))
const packageId = `${packageJson.publisher}.${packageJson.name}`

import * as recast from 'recast'
import * as types from 'ast-types'

// UMD unwrapping code is based off the Webpack plugin 'umd-compat-loader'

function checkUmd(content) {
    return content.indexOf('var v = factory(require, exports);') > -1
}

function checkUmdImport(content) {
    return content.indexOf('__syncRequire ? Promise.resolve().then') > -1
}

function matches(arr) {
    const allowed = ['require', 'exports']
    if (arr.length === allowed.length) {
        return arr.every((item, i) => allowed[i] === item.name)
    }
}

function unwrap(content, name) {
    const tree = recast.parse(content, { sourceFileName: name })

    const visitors = {
        visitFunctionExpression(path) {
            const params = path.node.params
            if (matches(params)) {
                const body = tree.program.body
                body.pop()
                tree.program.body = [...body, ...path.node.body.body]
                if (!checkUmdImport(content)) {
                    this.abort()
                }
            }
            this.traverse(path)
        },
    }

    types.visit(tree, visitors)
    return tree
}

/**
 * Removes umd wrapper from files
 */
const umdPlugin = {
    name: 'umd-unwrapper',
    setup(build) {
        build.onLoad({ filter: /umd\/.*\.js$/ }, async args => {
            const fileContents = fs.readFileSync(args.path).toString()
            const result = { contents: fileContents, loader: 'js' }

            if (checkUmd(fileContents)) {
                const tree = unwrap(fileContents, path.basename(args.path))
                const sourceMapPath = `${args.path}.map`
                const sourceMap = recast.print(tree, { sourceMapName: path.basename(sourceMapPath) })

                fs.writeFileSync(sourceMapPath, JSON.stringify(sourceMap.map, undefined, '\t'))
                result.contents = sourceMap.code
            }

            return result
        })
    },
}

/**
 * Implements vscode-nls as an esbuild plugin, replacing localize calls and extracting localization strings
 */
const nlsPlugin = {
    name: 'vscode-nls',
    setup(build) {
        // TODO: implement cache for even faster builds
        // const cache = new Map()

        build.onLoad({ filter: /[^.]*\.ts$/ }, async args => {
            const relativePath = path.relative('.', args.path)
            const fileContents = fs.readFileSync(args.path).toString()
            const result = processFile(fileContents, relativePath)

            if (result.errors && result.errors.length > 0) {
                throw new Error(result.errors.pop())
            }

            if (result.bundle) {
                const ext = path.extname(relativePath)
                const base = relativePath.substr(0, relativePath.length - ext.length)
                const metaDataContent = { ...result.bundle, filePath: removePathPrefix(base, '.') }
                const outPath = `dist/${base}.nls.metadata.json`

                await fs.ensureDir(path.dirname(outPath))
                fs.writeFile(outPath, JSON.stringify(metaDataContent, undefined, '\t'), err => {
                    if (err) {
                        throw err
                    }
                })
            }

            if (!result.contents) {
                return { contents: fileContents, loader: 'ts' }
            }

            if (result.sourceMap) {
                const sourceMapPath = `${args.path}.map`
                fs.writeFileSync(sourceMapPath, JSON.stringify(metaDataContent, undefined, '\t'))
                result.contents += `//# sourceMappingURL=${sourceMapPath}`
            }

            return { contents: result.contents, loader: 'ts' }
        })
    },
}

gulp.task('build', () => {
    // Transpile Typescript and replace localize calls
    const esbuild = gulp
        .src(['./src/extension.ts', './src/stepFunctions/asl/aslServer.ts'])
        .pipe(
            gulpEsbuild({
                outdir: useBundledEntrypoint() ? '.' : './src/',
                bundle: useBundledEntrypoint(),
                loader: {
                    '.ts': 'ts',
                },
                format: 'cjs',
                platform: 'node',
                external: ['vscode'],
                sourcemap: true,
                plugins: [nlsPlugin, umdPlugin],
                treeShaking: true,
            })
        )
        .pipe(gulp.dest('./dist/'))

    return esbuild
})

// Eventually change the environment variable to specify ESBuild rather than Webpack
function useBundledEntrypoint() {
    return (process.env.AWS_TOOLKIT_IGNORE_WEBPACK_BUNDLE || 'false').toLowerCase() !== 'true'
}

gulp.task('build-localization', () => {
    const metaData = gulp
        .src('./dist/**')
        .pipe(filter(['**/*.nls.json', '**/*.nls.metadata.json']))
        .pipe(nls.bundleMetaDataFiles(packageId, '.'))
        .pipe(filter(['**/nls.metadata.header.json', '**/nls.metadata.json']))
        .pipe(gulp.src('./package.nls.json'))
        .pipe(nls.createXlfFiles('aws-toolkit-vscode', 'aws-toolkit-vscode'))
        .pipe(gulp.dest('./dist/'))

    return metaData
})

const project = ts.createProject('./tsconfig.json')

gulp.task('localize-package', () => {
    return project
        .src()
        .pipe(project())
        .js.pipe(nls.createMetaDataFiles())
        .pipe(nls.bundleMetaDataFiles('aws-toolkit-vscode', 'dist'))
        .pipe(filter(['**/nls.bundle.*.json', '**/nls.metadata.header.json', '**/nls.metadata.json']))
        .pipe(gulp.dest('dist'))
})

gulp.task('translations-export', gulp.series('build', 'localize-package', 'build-localization'))

// Imports translations from xlf files to the i18n folder
// NOT CURRENTLY WORKING
gulp.task('translations-import', done => {
    const location = process.argv[3] ?? './dist'

    es.merge(
        languages.map(language => {
            const id = language.transifexId || language.id
            return gulp
                .src(path.join(location, id, 'aws-toolkit-vscode', 'aws-toolkit-vscode.xlf'))
                .pipe(nls.prepareJsonFiles())
                .pipe(gulp.dest(path.join('./i18n', language.destination)))
        })
    ).pipe(
        es.wait(() => {
            done()
        })
    )
})

/*
// Need to use this after cleaning up the package localization
const generatePackageLocalization = () => {
    return gulp
        .src(['package.nls.json'])
        .pipe(nls.createAdditionalLanguageFiles(languages, 'i18n'))
        .pipe(gulp.dest('.'))
}
*/
