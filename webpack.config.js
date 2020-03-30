//@ts-check

'use strict'

const path = require('path')
const webpack = require('webpack')
const fs = require('fs')
const TerserPlugin = require('terser-webpack-plugin')
const FileManagerPlugin = require('filemanager-webpack-plugin')
const { NLSBundlePlugin } = require('vscode-nls-dev/lib/webpack-bundler')
const packageJsonFile = path.join(__dirname, 'package.json')
const packageJson = JSON.parse(fs.readFileSync(packageJsonFile, 'utf8'))
const packageId = `${packageJson.publisher}.${packageJson.name}`

/**@type {import('webpack').Configuration}*/
const config = {
    target: 'node',
    entry: {
        extension: './src/extension.ts',
        aslServer: './src/stepFunctions/asl/aslServer.ts'
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].js',
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
            PLUGINVERSION: JSON.stringify(packageJson.version)
        }),
        // @ts-ignore
        new FileManagerPlugin({
            onStart: {
                mkdir: [path.resolve(__dirname, 'dist/src/stepFunctions/asl/')]
            },
            onEnd: {
                move: [
                    {
                        source: path.resolve(__dirname, 'dist/aslServer.js'),
                        destination: path.resolve(__dirname, 'dist/src/stepFunctions/asl/aslServer.js')
                    },
                    {
                        source: path.resolve(__dirname, 'dist/aslServer.js.LICENSE'),
                        destination: path.resolve(__dirname, 'dist/src/stepFunctions/asl/aslServer.js.LICENSE')
                    },
                    {
                        source: path.resolve(__dirname, 'dist/aslServer.js.map'),
                        destination: path.resolve(__dirname, 'dist/src/stepFunctions/asl/aslServer.js.map')
                    }
                ]
            }
        })
    ],
    optimization: {
        minimize: true,
        minimizer: [new TerserPlugin()]
    }
}
module.exports = config
