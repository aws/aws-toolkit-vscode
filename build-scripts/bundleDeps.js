'use strict';
/*
    This script is called from npm run compile.
    It adds clientside libraries to ./media/libs.
*/
const fs = require('fs-extra');
const path = require('path');
const _ = require('lodash');

const DEPS = [{
        name: 'vue.min.js',
        path: 'vue/dist/vue.min.js'
    }
];
const workingDir = path.join(__dirname, '..');
const nodeModulesDir = path.join(workingDir, 'node_modules');
const libraryDir = path.join(workingDir, 'media', 'libs');
(async () => {
    const work = [];
    _.forEach(DEPS, (dep) => {
        const depPath = path.join(nodeModulesDir, dep.path);
        console.log(`Copying ${depPath} to ${libraryDir}`);
        work.push(fs.copy(depPath, path.join(libraryDir, dep.name)));
    });
    try {
        await Promise.all(work);
        console.log('Successfully copied all clientside dependencies.');
    } catch (e) {
        console.error('Error when copying clientside dependencies.');
        console.error(e);
    }
})();