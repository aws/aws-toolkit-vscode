/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export const ConsolasConstants = {
    /**
     * SDK Client
     */
    ALPHA_ENDPOINT: 'https://conso-conso-kt91i2m4jckw-a308b301002e515e.elb.us-west-2.amazonaws.com/',
    BETA_ENDPOINT: 'https://conso-conso-1gaw7rhj4gx1w-a813d3d32546185b.elb.us-west-2.amazonaws.com/',
    GAMMA_ENDPOINT: 'https://Conso-Conso-5NU9CUFTKAGS-82f6f7a6431ff74a.elb.us-west-2.amazonaws.com/',
    PROD_ENDPOINT: 'https://conso-conso-eh28s3s7lpja-dc3892a3fd48c07f.elb.us-west-2.amazonaws.com/',
    REGION: 'us-west-2',

    /**
     * Automated and manual trigger
     */
    INVOCATION_TIME_INTERVAL_THRESHOLD: 2, // seconds
    PROMISE_TIMEOUT_LIMIT: 5, // seconds
    INVOCATION_KEY_THRESHOLD: 15,
    SPECIAL_CHARACTERS_LIST: ['{', '[', '(', ':', '\t', '\n'],
    NORMAL_TEXT_CHANGE_REGEX: /[A-Za-z0-9]/g,

    /**
     * EditorCon context
     */
    CHARACTERS_LIMIT: 5120,
    FILENAME_CHARS_LIMIT: 1024,
    NATURAL_LANGUAGE: 'en-US',
    MAX_RECOMMENDATIONS: 10,
    SPACE: ' ',
    LINE_BREAK: '\n',

    /**
     * Ux of recommendations
     */
    LABEL_LENGTH: 20,
    COMPLETION_DETAIL: 'AWS Consolas',

    /**
     * Control feature
     */
    CONSOLAS_PREVIEW: 'consolas(Preview)',
    /**
     * Supported languages
     */
    JAVA: 'java',
    PYTHON: 'python',
    JAVASCRIPT: 'javascript',
    TYPESCRIPT: 'typescript',

    SUPPORTED_LANGUAGES: ['java', 'python', 'javascript', 'typescript'],

    /**
     * Prompt
     */
    PENDING_RESPONSE: 'Pending Consolas response, please wait...',

    /**
     * Beta landing page file
     */
    WELCOME_CONSOLAS_README_FILE_SOURCE: 'resources/markdown/WelcomeToConsolas.md',
    CONSOLAS_WELCOME_MESSAGE_KEY: 'CONSOLAS_WELCOME_MESSAGE',

    /**
     * Key bindings JSON file path
     */
    KEY_BINDING_PATH_MAC: 'Library/Application Support/Code/User/keybindings.json',
    KEY_BINDING_PATH_LINUX: '.config/Code/User/keybindings.json',
    KEY_BINDING_PATH_WIN: 'Code/User/keybindings.json',

    /**
     * Length of left context preview in output channel
     */
    CONTEXT_PREVIEW_LEN: 20,

    /**
     * Unsupported language cache
     */
    CONSOLAS_UNSUPPORTED_LANGUAGES_CACHE_TTL: 10 * 60 * 60 * 1000,
    CONSOLAS_UNSUPPORTED_LANGUAGES_KEY: 'CONSOLAS_UNSUPPORTED_LANGUAGES_KEY',
    CONSOLAS_AUTO_TRIGGER_ENABLED_KEY: 'CONSOLAS_AUTO_TRIGGER_ENABLED',
    CONSOLAS_TERMS_ACCEPTED_KEY: 'CONSOLAS_TERMS_ACCEPTED',

    //
    CONSOLAS_LEARN_MORE_URI: 'https://en.wikipedia.org/wiki/Consolas',
}
