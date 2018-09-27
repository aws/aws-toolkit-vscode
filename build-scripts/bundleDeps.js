'use strict';
/*
    This script is called from npm run compile.
    It adds clientside libraries to ./media/libs.
*/
const fs = require('fs-extra');
const path = require('path');
const _ = require('lodash');

const JS_DEPS = [
    {
        name: 'vue.min.js',
        path: 'vue/dist/vue.min.js'
    }
];
const WORKING_DIR = path.join(__dirname, '..');
const NODE_MODULES_DIR = path.join(WORKING_DIR, 'node_modules');
const LIBRARY_DIR = path.join(WORKING_DIR, 'media', 'libs');
(async () => {
    const work = [];
    copy(JS_DEPS, LIBRARY_DIR, work);
    try {
        await Promise.all(work);
        console.log('Successfully copied all clientside dependencies.');
    } catch (e) {
        console.error('Error when copying clientside dependencies.');
        console.error(e);
    }

    function copy(deps, destinationPath, workArr) {
        _.forEach(deps, (dep) => {
            const depPath = path.join(NODE_MODULES_DIR, dep.path);
            console.log(`Copying ${depPath} to ${destinationPath}`);
            workArr.push(fs.copy(depPath, path.join(destinationPath, dep.name)));
        });
    }
})();