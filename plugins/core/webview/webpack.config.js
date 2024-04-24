
// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

//@ts-check

// eslint-disable-next-line header/header
'use strict';

const path = require('path');
const {VueLoaderPlugin} = require("vue-loader");
const CopyWebpackPlugin = require('copy-webpack-plugin');

/**@type {import('webpack').Configuration}*/
const vueConfig = {
    name: 'vue',
    target: 'web',
    entry: './src/q-ui/index.ts',
    output: {
        path: path.resolve(__dirname, 'build/assets/js'),
        filename: 'getStart.js',
        library: 'getStart',
        libraryTarget: 'var',
        devtoolModuleFilenameTemplate: '../[resource-path]',
    },
    devtool: 'source-map',
    resolve: {
        extensions: ['.ts', '.js', '.vue'],
        fallback: {
            fs: false,
            path: false,
            util: false
        },
        alias: {
            'vue': 'vue/dist/vue.esm-bundler.js',
            '@': path.resolve(__dirname, "./src/")
        }
    },
    experiments: {asyncWebAssembly: true},
    module: {
        rules: [
            {test: /\.scss$/, use: ['style-loader', 'css-loader', 'sass-loader']},
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                loader: 'ts-loader',
                options: {
                    appendTsSuffixTo: [/\.vue$/]
                }
            },
            {
                test: /\.vue$/,
                loader: 'vue-loader',
            },
            {
                test: /\.css$/,
                use: ['vue-style-loader', 'css-loader'],
            },
            {
                test: /\.(png|jpg|gif|svg)$/,
                use: 'file-loader',
            }
        ]
    },
    plugins: [
        new CopyWebpackPlugin({
            patterns: [
                {from: './node_modules/web-tree-sitter/tree-sitter.wasm', to: ''}
            ]
        }),
        new VueLoaderPlugin()
    ],
};

const toolkitVueConfig = {
    name: 'vue',
    target: 'web',
    entry: './src/q-ui/toolkit.ts',
    output: {
        path: path.resolve(__dirname, 'build/assets/js'),
        filename: 'toolkitGetStart.js',
        library: 'toolkitGetStart',
        libraryTarget: 'var',
        devtoolModuleFilenameTemplate: '../[resource-path]',
    },
    devtool: 'source-map',
    resolve: {
        extensions: ['.ts', '.js', '.vue'],
        fallback: {
            fs: false,
            path: false,
            util: false
        },
        alias: {
            'vue': 'vue/dist/vue.esm-bundler.js',
            '@': path.resolve(__dirname, "./src/")
        }
    },
    experiments: {asyncWebAssembly: true},
    module: {
        rules: [
            {test: /\.scss$/, use: ['style-loader', 'css-loader', 'sass-loader']},
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                loader: 'ts-loader',
                options: {
                    appendTsSuffixTo: [/\.vue$/]
                }
            },
            {
                test: /\.vue$/,
                loader: 'vue-loader',
            },
            {
                test: /\.css$/,
                use: ['vue-style-loader', 'css-loader'],
            },
            {
                test: /\.(png|jpg|gif|svg)$/,
                use: 'file-loader',
            }
        ]
    },
    plugins: [
        new CopyWebpackPlugin({
            patterns: [
                {from: './node_modules/web-tree-sitter/tree-sitter.wasm', to: ''}
            ]
        }),
        new VueLoaderPlugin()
    ],
};
module.exports = [vueConfig, toolkitVueConfig];
