//@ts-check

'use strict'

const path = require('path')
let webpack = require('webpack')
const fs = require('fs')
const { NLSBundlePlugin } = require('vscode-nls-dev/lib/webpack-bundler')
const packageJson = path.join(__dirname, 'package.json')
const pkg = JSON.parse(fs.readFileSync(packageJson, 'utf8'))
const packageId = `${pkg.publisher}.${pkg.name}`

/**@type {import('webpack').Configuration}*/
const config = {
    target: 'node',
    entry: './src/extension.ts',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'extension.js',
        libraryTarget: 'commonjs2',
        devtoolModuleFilenameTemplate: '../[resource-path]'
    },
    devtool: 'source-map',
    externals: {
        vscode: 'commonjs vscode'
    },
    resolve: {
        extensions: ['.ts', '.js'],
        alias: {
            handlebars: 'handlebars/dist/handlebars.min.js'
        }
    },
    node: {
        __dirname: false //preserve the default node.js behavior for __dirname
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: [
                    {
                        // vscode-nls-dev loader:
                        // * rewrite nls-calls
                        loader: 'vscode-nls-dev/lib/webpack-loader',
                        options: {
                            base: path.join(__dirname, 'src')
                        }
                    },
                    {
                        loader: 'ts-loader',
                        options: {
                            compilerOptions: {
                                sourceMap: true
                            }
                        }
                    }
                ]
            }
        ]
    },
    plugins: [
        new NLSBundlePlugin(packageId),
        new webpack.DefinePlugin({
            pluginVersion: JSON.stringify(process.env.npm_package_version)
        })
    ]
}
module.exports = config
