"use strict";
/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable */
const fs = require("fs-extra");
/**
    export interface DiagnosticWithLocation extends Diagnostic {
        file: SourceFile;
        start: number;
        length: number;
    }
 */
function init(modules) {
    const ts = modules.typescript;
    function create(info) {
        info.project.projectService.logger.info("I'm getting set up now! Check the log for this message.");
        // Set up decorator
        const proxy = Object.create(null);
        for (let k of Object.keys(info.languageService)) {
            const x = info.languageService[k];
            proxy[k] = ((...args) => x.apply(info.languageService, args));
        }
        const ALLOWED_FILES = ['credentialsProvider.ts'];
        const MATCHER = /@aws-sdk/g;
        proxy.getSyntacticDiagnostics = fileName => {
            if (fileName in ALLOWED_FILES) {
                return [];
            }
            const contents = fs.readFileSync(fileName).toString();
            const sourceFile = ts.createSourceFile(fileName, contents, ts.ScriptTarget.ES2016);
            const matches = contents.match(MATCHER);
            return matches !== null ? matches.map((match, index) => ({
                file: sourceFile,
                start: index,
                length: 6,
                category: ts.DiagnosticCategory.Error,
                code: 123123,
                messageText: 'Not allowed',
            })) : [];
        };
        return proxy;
    }
    return { create };
}
module.exports = init;
//# sourceMappingURL=index.js.map