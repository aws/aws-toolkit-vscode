//@ts-check

'use strict';

const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

/**@type {import('webpack').Configuration}*/
const config = {
    plugins: [
        new CopyWebpackPlugin({
            patterns: [
                { from: './node_modules/web-tree-sitter/tree-sitter.wasm', to: ''}
            ]
        })
    ],
    target: 'web',
    entry: './src/mynah-ui/index.ts',
    output: {
        path: path.resolve(__dirname, 'build/assets/js'),
        filename: 'mynah-ui.js',
        library: 'mynahUI',
        libraryTarget: 'var',
        devtoolModuleFilenameTemplate: '../[resource-path]',
    },
    devtool: 'source-map',
    resolve: {
        extensions: ['.ts', '.js', '.wasm'],
        fallback: {
            fs: false,
            path: false,
            util: false
        }
    },
    experiments: { asyncWebAssembly: true },
    module: {
        rules: [
            {test: /\.scss$/, use: ['style-loader', 'css-loader', 'sass-loader']},
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: 'ts-loader',
                    },
                ],
            },
        ],
    },
};
module.exports = config;
