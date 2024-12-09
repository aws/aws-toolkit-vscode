module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: ['./packages/*/tsconfig.json', './plugins/*/tsconfig.json'],
        tsconfigRootDir: __dirname,
    },
    env: {
        node: true,
        mocha: true,
        es2024: true,
    },
    plugins: ['@typescript-eslint', '@stylistic', 'unicorn', 'header', 'security-node', 'aws-toolkits'],
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/eslint-recommended',
        'plugin:@typescript-eslint/recommended-requiring-type-checking',
        'plugin:@typescript-eslint/recommended',
        // "Add this as the _last_ item in the extends array, so that eslint-config-prettier has the
        // opportunity to override other configs." https://github.com/prettier/eslint-plugin-prettier
        'plugin:prettier/recommended',
    ],
    rules: {
        curly: 2, // Enforce braces on "if"/"for"/etc.
        'id-length': [
            'error',
            {
                min: 1,
                max: 40,
                exceptionPatterns: [
                    '^codecatalyst_', // CodeCatalyst telemetry names are verbose :(
                ],
            },
        ],
        // https://typescript-eslint.io/rules/naming-convention/
        '@typescript-eslint/naming-convention': [
            'error',
            {
                selector: 'default',
                format: ['camelCase', 'PascalCase'],
                // Allow underscores.
                leadingUnderscore: 'allowSingleOrDouble',
                trailingUnderscore: 'allowSingleOrDouble',
            },
            // Allow object properties, enums, and methods to have any format:
            //   {
            //     'foo-1-2-3': 42,
            //   }
            // https://github.com/typescript-eslint/typescript-eslint/issues/1483#issuecomment-733421303
            {
                selector: ['objectLiteralProperty', 'classMethod', 'enumMember'],
                format: null,
                // modifiers: ['requiresQuotes'],
            },
        ],
        // Avoid accidental use of "==" instead of "===".
        eqeqeq: 'error',
        // TODO reenable this rule (by removing this off)
        'no-async-promise-executor': 'off',
        // TODO reenable this rule (by removing this off)
        '@typescript-eslint/no-misused-promises': 'off',
        // TODO reenable this rule (by removing this off)
        '@typescript-eslint/prefer-regexp-exec': 'off',
        // TODO reenable this rule (by removing this off)
        'no-async-promise-executors': 'off',
        // TODO reenable this rule (by removing this off)
        '@typescript-eslint/consistent-type-assertions': 'off',
        // TODO reenable this rule (by removing this off)
        '@typescript-eslint/ban-ts-ignore': 'off',
        // TODO rennable this rule (by removing this off)
        '@typescript-eslint/class-name-casing': 'off',
        // TODO rennable this rule (by removing this off)
        '@typescript-eslint/no-inferrable-types': 'off',
        // TODO rennable this rule (by removing this off)
        '@typescript-eslint/no-unnecessary-type-assertion': 'off',
        // TODO rennable this rule (by removing this off)
        // this is another troublesome one, producing ~600 issues
        '@typescript-eslint/no-use-before-define': 'off',
        // TODO rennable this rule (by removing this off)
        'no-useless-escape': 'off',
        // TODO rennable this rule (by removing this off)
        '@typescript-eslint/require-await': 'off',
        // TODO rennable this rule (by removing this off)
        '@typescript-eslint/no-non-null-assertion': 'off',
        // TODO rennable this rule (by removing this off)
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
        // TODO rennable this rule (by removing this off)
        '@typescript-eslint/explicit-function-return-type': 'off',
        // TODO reenable this rule, tests mostly break this one (by changing off to error)
        // This currently produces 700 non fixable by --fix errors
        'sort-imports': 'off',
        '@typescript-eslint/no-namespace': 'error',
        // This is off because prettier takes care of it
        'no-extra-semi': 'off',
        '@typescript-eslint/no-empty-function': 'off',
        // Disallows returning e.g. Promise<…|never> which signals that an exception may be thrown.
        // https://stackoverflow.com/q/64230626/152142
        '@typescript-eslint/no-redundant-type-constituents': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        '@typescript-eslint/no-floating-promises': 'error', // Promises must catch errors or be awaited.
        '@typescript-eslint/no-var-requires': 'off', // Should be able to remove with the full migration of SDK v3
        '@typescript-eslint/no-unsafe-member-access': 'off', // use typeguard before accessing a member
        '@typescript-eslint/no-unsafe-assignment': 'off', // 112 errors, similar to above
        '@typescript-eslint/no-unsafe-return': 'off', // 26 errors, similar to above
        '@typescript-eslint/no-unsafe-call': 'off', // 24 errors, need types for imported constructors
        '@typescript-eslint/restrict-template-expressions': 'off', // 294 errors, forces template literals to be a certain type
        '@typescript-eslint/ban-ts-comment': 'off', // 27 errors, bans compiler error exceptions
        '@typescript-eslint/explicit-module-boundary-types': 'off', // Remove this once 'explicit-function-return-type' is on
        // Do not check loops so while(true) works. Potentially reevalute this.
        'no-constant-condition': ['error', { checkLoops: false }],
        'no-empty': 'off',

        // https://eslint.style/rules/default/spaced-comment
        // Require space after // comment.
        '@stylistic/spaced-comment': [
            'error',
            'always',
            {
                block: {
                    markers: ['!'], // Allow the /*!…*/ license header.
                    // exceptions: ['*'],
                    // balanced: true
                },
            },
        ],

        // Rules from https://github.com/sindresorhus/eslint-plugin-unicorn
        // TODO: 'unicorn/no-useless-promise-resolve-reject': 'error',
        // TODO: 'unicorn/prefer-at': 'error',
        // TODO: 'unicorn/prefer-event-target': 'error',
        // TODO: 'unicorn/prefer-negative-index': 'error',
        // TODO: 'unicorn/prefer-string-slice': 'error',
        // TODO: 'unicorn/prefer-regexp-test': 'error',
        // TODO: 'unicorn/prefer-ternary': 'error',
        // TODO(?): 'unicorn/custom-error-definition': 'error',
        // TODO(?): 'unicorn/prefer-json-parse-buffer': 'error',
        // TODO: ESM modules https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-module.md
        // 'unicorn/prefer-module': 'error',
        'unicorn/no-abusive-eslint-disable': 'error',
        'unicorn/no-null': 'error',
        'unicorn/no-unnecessary-polyfills': 'error',
        'unicorn/no-useless-spread': 'error',
        'unicorn/prefer-array-some': 'error',
        'unicorn/prefer-blob-reading-methods': 'error',
        'unicorn/prefer-code-point': 'error',
        'unicorn/prefer-date-now': 'error',
        'unicorn/prefer-dom-node-text-content': 'error',
        'unicorn/prefer-includes': 'error',
        'unicorn/prefer-keyboard-event-key': 'error',
        'unicorn/prefer-modern-dom-apis': 'error',
        'unicorn/prefer-modern-math-apis': 'error',
        'unicorn/prefer-native-coercion-functions': 'error',
        // 'unicorn/prefer-node-protocol': 'error',
        // 'unicorn/prefer-object-from-entries': 'error',
        'unicorn/prefer-reflect-apply': 'error',
        'unicorn/prefer-string-trim-start-end': 'error',
        'unicorn/prefer-type-error': 'error',
        'security-node/detect-child-process': 'error',

        'header/header': [
            'error',
            'block',
            {
                pattern:
                    'Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.\\r?\\n \\* SPDX-License-Identifier: Apache-2.0',
            },
            { lineEndings: 'unix' },
        ],

        'aws-toolkits/no-only-in-tests': 'error',
        'aws-toolkits/no-await-on-vscode-msg': 'error',
        'aws-toolkits/no-banned-usages': 'error',
        'aws-toolkits/no-incorrect-once-usage': 'error',
        'aws-toolkits/no-string-exec-for-child-process': 'error',
        'aws-toolkits/no-console-log': 'error',
        'aws-toolkits/no-json-stringify-in-log': 'error',
        'aws-toolkits/no-printf-mismatch': 'error',
        'no-restricted-imports': [
            'error',
            {
                patterns: [
                    {
                        group: ['**/core/dist/*'],
                        message:
                            "Avoid importing from the core lib's dist/ folders; please use directly from the core lib defined exports.",
                    },
                ],
                // The following will place an error on the `fs-extra` import since we do not want it to be used for browser compatibility reasons.
                paths: [
                    {
                        name: 'fs-extra',
                        message:
                            'Avoid fs-extra, use shared/fs/fs.ts. Notify the Toolkit team if your required functionality is not available.',
                    },
                    {
                        name: 'fs',
                        message: 'Avoid node:fs and use shared/fs/fs.ts when possible.',
                    },
                ],
            },
        ],
    },
}
