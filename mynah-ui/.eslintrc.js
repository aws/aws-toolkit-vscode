module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
    },
    env: {
        node: true,
        mocha: true,
    },
    plugins: ['@typescript-eslint', 'header', 'no-null'],
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/eslint-recommended',
        'plugin:@typescript-eslint/recommended-requiring-type-checking',
        'plugin:@typescript-eslint/recommended',
        'prettier',
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
        // TODO rennable this rule (by removing this off)
        // namespaces are not great and we should stop using them
        '@typescript-eslint/no-namespace': 'off',
        // Turn this on by removing off when we fix namespaces
        'no-inner-declarations': 'off',
        // This is off because prettier takes care of it
        'no-extra-semi': 'off',
        'no-null/no-null': 'error',
        '@typescript-eslint/no-empty-function': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        // New rules --> New TODOs
        '@typescript-eslint/no-var-requires': 'off', // Should be able to remove with the full migration of SDK v3
        '@typescript-eslint/no-unsafe-member-access': 'off', // use typeguard before accessing a member
        '@typescript-eslint/no-unsafe-assignment': 'off', // 112 errors, similar to above
        '@typescript-eslint/no-unsafe-return': 'off', // 26 errors, similar to above
        '@typescript-eslint/no-unsafe-call': 'off', // 24 errors, need types for imported constructors
        '@typescript-eslint/restrict-template-expressions': 'off', // 294 errors, forces template literals to be a certain type
        '@typescript-eslint/no-floating-promises': 'off', // 274 errors, promises should catch errors or be awaited
        '@typescript-eslint/ban-ts-comment': 'off', // 27 errors, bans compiler error exceptions
        '@typescript-eslint/explicit-module-boundary-types': 'off', // Remove this once 'explicit-function-return-type' is on
        // Do not check loops so while(true) works. Potentially reevalute this.
        'no-constant-condition': ['error', { checkLoops: false }],
        'no-empty': 'off',
        'header/header': [
            'error',
            'block',
            {
                pattern:
                    'Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.\\r?\\n \\* SPDX-License-Identifier: Apache-2.0',
            },
            { lineEndings: 'unix' },
        ],
    },
}
