module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
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
        // TODO reenable this rule
        '@typescript-eslint/unbound-method': 'off',
        // TODO reenable this rule
        'no-async-promise-executor': 'off',
        // TODO reenable this rule
        '@typescript-eslint/no-misused-promises': 'off',
        // TODO reenable this rule
        '@typescript-eslint/ban-types': 'off',
        // TODO reenable this rule
        'no-ex-assign': 'off',
        // TODO reenable this rule
        '@typescript-eslint/prefer-regexp-exec': 'off',
        // TODO reenable this rule
        'no-empty-pattern': 'off',
        // TODO reenable this rule
        'no-async-promise-executors': 'off',
        // TODO reenable this rule
        '@typescript-eslint/consistent-type-assertions': 'off',
        // TODO reenable this rule
        'no-extra-semi': 'off',
        // TODO reenable this rule
        'no-case-declarations': 'off',
        // TODO reenable this rule
        '@typescript-eslint/ban-ts-ignore': 'off',
        // TODO reenable this rule
        'prefer-const': 'off',
        // TODO rennable this rule
        '@typescript-eslint/class-name-casing': 'off',
        // TODO rennable this rule
        'no-inner-declarations': 'off',
        // TODO rennable this rule
        '@typescript-eslint/no-inferrable-types': 'off',
        // TODO rennable this rule
        '@typescript-eslint/no-namespace': 'off',
        // TODO rennable this rule
        '@typescript-eslint/no-unnecessary-type-assertion': 'off',
        // TODO rennable this rule
        'no-prototype-builtins': 'off',
        // TODO rennable this rule
        'no-extra-boolean-cast': 'off',
        // TODO rennable this rule
        '@typescript-eslint/no-use-before-define': 'off',
        // TODO rennable this rule
        '@typescript-eslint/camelcase': 'off',
        // TODO rennable this rule
        'no-useless-escape': 'off',
        // TODO rennable this rule
        '@typescript-eslint/require-await': 'off',
        // TODO rennable this rule
        '@typescript-eslint/no-non-null-assertion': 'off',
        // TODO rennable this rule
        '@typescript-eslint/no-explicit-any': 'off',
        // TODO rennable this rule
        '@typescript-eslint/explicit-function-return-type': 'off',
        // TODO rennable this rule
        //'no-null/no-null': 2,
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
