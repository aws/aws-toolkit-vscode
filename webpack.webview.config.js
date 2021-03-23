/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

//@ts-check

const path = require('path')

/**@type {import('webpack').Configuration}*/
const config = {
    mode: 'production',

    entry: {
        // invokeRemote: path.resolve(__dirname, 'src', 'webviews', 'tsx', 'invokeRemote.tsx'),
        samInvokeVue: path.resolve(__dirname, 'src', 'lambda', 'vue', 'samInvokeVue.ts'),
        // createSamApp: path.resolve(__dirname, 'src', 'webviews', 'tsx', 'createSamApp.tsx')
        // createSamApp: path.resolve(__dirname, 'src', 'webviews', 'tsx', 'reducerCreateSamApp.tsx')
    },
    output: {
        path: path.resolve(__dirname, 'compiledWebviews'),
        filename: '[name].js',
    },

    // Enable sourcemaps for debugging webpack's output.
    devtool: 'source-map',

    resolve: {
        // Add '.ts' and '.tsx' as resolvable extensions.
        extensions: ['.ts', '.tsx', '.js', '.json'],
        alias: {
            vue$: require.resolve('vue/dist/vue.esm.js'),
        },
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                loader: 'esbuild-loader',
                options: {
                    // appendTsSuffixTo: [/\.vue$/],
                    target: 'es2018',
                },
                exclude: /node_modules/,
            },
            {
                test: /\.vue$/,
                loader: 'vue-loader',
            },
        ],
    },
}
module.exports = config
