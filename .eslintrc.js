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
        'prettier/@typescript-eslint',
    ],
    rules: {
        // TODO reenable this rule (by removing this off)
        'no-async-promise-executor': 'off',
        // TODO reenable this rule (by removing this off)
        '@typescript-eslint/no-misused-promises': 'off',
        // TODO reenable this rule (by removing this off)
        '@typescript-eslint/ban-types': 'off',
        // TODO reenable this rule (by removing this off)
        'no-ex-assign': 'off',
        // TODO reenable this rule (by removing this off)
        '@typescript-eslint/prefer-regexp-exec': 'off',
        // TODO reenable this rule (by removing this off)
        'no-empty-pattern': 'off',
        // TODO reenable this rule (by removing this off)
        'no-async-promise-executors': 'off',
        // TODO reenable this rule (by removing this off)
        '@typescript-eslint/consistent-type-assertions': 'off',
        // TODO reenable this rule (by removing this off)
        'no-extra-semi': 'off',
        // TODO reenable this rule (by removing this off)
        'no-case-declarations': 'off',
        // TODO reenable this rule (by removing this off)
        '@typescript-eslint/ban-ts-ignore': 'off',
        // TODO reenable this rule (by removing this off)
        'prefer-const': 'off',
        // TODO rennable this rule (by removing this off)
        '@typescript-eslint/class-name-casing': 'off',
        // TODO rennable this rule (by removing this off)
        'no-inner-declarations': 'off',
        // TODO rennable this rule (by removing this off)
        '@typescript-eslint/no-inferrable-types': 'off',
        // TODO rennable this rule (by removing this off)
        '@typescript-eslint/no-namespace': 'off',
        // TODO rennable this rule (by removing this off)
        '@typescript-eslint/no-unnecessary-type-assertion': 'off',
        // TODO rennable this rule (by removing this off)
        'no-prototype-builtins': 'off',
        // TODO rennable this rule (by removing this off)
        'no-extra-boolean-cast': 'off',
        // TODO rennable this rule (by removing this off)
        '@typescript-eslint/no-use-before-define': 'off',
        // TODO rennable this rule (by removing this off)
        '@typescript-eslint/camelcase': 'off',
        // TODO rennable this rule (by removing this off)
        'no-useless-escape': 'off',
        // TODO rennable this rule (by removing this off)
        '@typescript-eslint/require-await': 'off',
        // TODO rennable this rule (by removing this off)
        '@typescript-eslint/no-non-null-assertion': 'off',
        // TODO rennable this rule (by removing this off)
        '@typescript-eslint/no-explicit-any': 'off',
        // TODO rennable this rule (by removing this off)
        '@typescript-eslint/explicit-function-return-type': 'off',
        // TODO rennable this rule (by removing this off)
        'no-null/no-null': 'off',
        // TODO reenable this rule, tests mostly break this one (by changing off to error)
        'sort-imports': 'off',
        '@typescript-eslint/no-empty-function': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        // Do not check loops so while(true) works. Potentially reevalute this.
        'no-constant-condition': ['error', { checkLoops: false }],
        'no-empty': 'off',
        'header/header': [
            'error',
            'block',
            {
                pattern:
                    'Copyright ([0-9]{4}[-,]{0,1}[ ]{0,1}){1,} Amazon.com, Inc. or its affiliates. All Rights Reserved.\\r?\\n \\* SPDX-License-Identifier: Apache-2.0',
            },
            { lineEndings: 'unix' },
        ],
    },
}
