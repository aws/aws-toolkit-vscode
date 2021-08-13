const path = require('path')
const webpack = require('webpack')
module.exports = {
    entry: './src/samVisualize/rendering/forceDirectedGraph.ts',
    mode: 'development',
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: [
                    {
                        loader: 'ts-loader',
                        options: {
                            configFile: 'tsconfig.samVisualize.json',
                        },
                    },
                ],
                exclude: /node_modules/,
            },
        ],
    },
    resolve: {
        extensions: ['.ts', '.js'],
    },
    output: {
        filename: 'samVisualizeRenderBundle.js',
        path: path.resolve(__dirname, './samVisualizeRenderJS'),
        library: 'GraphRender',
    },
    plugins: [
        // fix "process is not defined" error:
        // (do "npm install process" before running the build)
        new webpack.ProvidePlugin({
            process: 'process/browser',
        }),
    ],
}
