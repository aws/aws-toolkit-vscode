/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable */

import * as fs from 'fs-extra'

function init(modules: { typescript: typeof import("typescript/lib/tsserverlibrary") }) {
    const ts = modules.typescript

    function create(info: ts.server.PluginCreateInfo) {
        info.project.projectService.logger.info(
            "I'm getting set up now! Check the log for this message."
          );

        // Set up decorator
        const proxy: ts.LanguageService = Object.create(null)
        for (let k of Object.keys(info.languageService) as Array<keyof ts.LanguageService>) {
            const x = info.languageService[k]
            proxy[k] = ((...args: Array<{}>) => (x as any).apply(info.languageService, args)) as any
        }

        const ALLOWED_FILES = ['credentialsProvider.ts']
        const MATCHER = /@aws-sdk/g

        proxy.getSyntacticDiagnostics = fileName => {
            if (fileName in ALLOWED_FILES) {
                return []
            }

            const contents = fs.readFileSync(fileName).toString()
            const sourceFile = ts.createSourceFile(fileName, contents, ts.ScriptTarget.ES2016)
            const matches = contents.match(MATCHER)

            return matches !== null ? matches.map((match, index) => ({
                file: sourceFile,
                start: index,
                length: 6,
                category: ts.DiagnosticCategory.Error,
                code: 123123,
                messageText: 'Not allowed',
            })) : []
        }

        return proxy
    }
  
    return { create };
  }

  export = init;