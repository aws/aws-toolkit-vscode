'use strict';

/*
    This script is called from npm run compile.
    It creates an HTML version of the marketplace page to be used as a quick start page.
    It replaces relative paths with an `!!EXTENSIONROOT!!` token.
    This makes it easier to swap in relative links when the extension loads.
*/

const fs = require('fs-extra');
const path = require('path');
const marked = require('marked')

const repoRoot = path.dirname(__dirname);

( () => {
    const fileText = fs.readFileSync(path.join(repoRoot, 'extension-readme.md')).toString();

    // paths are a little more foolproof to find in markdown form than HTML.
    // find anything with a relative path and convert it to an easy-to-find token so we can convert to paths relative 
    const relativePathRegex = /]\(\.\//g;
    const transformedText = fileText.replace(relativePathRegex, '](!!EXTENSIONROOT!!/');

    marked(transformedText, (err, result) => {
        fs.writeFileSync(path.join(repoRoot, './quickStart.html'), result);
    })
})();