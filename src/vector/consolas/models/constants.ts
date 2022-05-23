/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export const ConsolasConstants = {
    /**
     * SDK Client
     */
    alphaEndpoint: 'https://conso-conso-kt91i2m4jckw-a308b301002e515e.elb.us-west-2.amazonaws.com/',
    betaEndpoint: 'https://conso-conso-1gaw7rhj4gx1w-a813d3d32546185b.elb.us-west-2.amazonaws.com/',
    gammaEndpoint: 'https://Conso-Conso-5NU9CUFTKAGS-82f6f7a6431ff74a.elb.us-west-2.amazonaws.com/',
    prodEndpoint: 'https://conso-conso-eh28s3s7lpja-dc3892a3fd48c07f.elb.us-west-2.amazonaws.com/',
    region: 'us-west-2',

    /**
     * Automated and manual trigger
     */
    invocationTimeIntervalThreshold: 1, // seconds
    promiseTimeoutLimit: 15, // seconds
    invocationKeyThreshold: 15,
    specialCharactersList: ['{', '[', '(', ':', '\t', '\n'],
    normalTextChangeRegex: /[A-Za-z0-9]/g,

    /**
     * EditorCon context
     */
    charactersLimit: 25600,
    filenameCharsLimit: 1024,
    naturalLanguage: 'en-US',
    maxRecommendations: 10,
    space: ' ',
    lineBreak: '\n',
    lineBreakWin: '\r\n',

    /**
     * Ux of recommendations
     */
    labelLength: 20,
    completionDetail: 'AWS Consolas',

    /**
     * Consolas in configuration
     */
    consolas: 'Consolas',
    /**
     * Supported languages
     */
    java: 'java',
    python: 'python',
    javascript: 'javascript',
    typescript: 'typescript',

    supportedLanguages: ['java', 'python', 'javascript', 'typescript'],

    /**
     * Prompt
     */
    pendingResponse: 'Pending Consolas response, please wait...',

    /**
     * Beta landing page file
     */
    welcomeConsolasReadmeFileSource: 'resources/markdown/WelcomeToConsolas.md',
    welcomeMessageKey: 'CONSOLAS_WELCOME_MESSAGE',

    /**
     * Key bindings JSON file path
     */
    keyBindingPathMac: 'Library/Application Support/Code/User/keybindings.json',
    keyBindingPathLinux: '.config/Code/User/keybindings.json',
    keyBindingPathWin: 'Code/User/keybindings.json',

    /**
     * Length of left context preview in output channel
     */
    contextPreviewLen: 20,

    /**
     * Unsupported language cache
     */
    unsupportedLanguagesCacheTTL: 10 * 60 * 60 * 1000,
    unsupportedLanguagesKey: 'CONSOLAS_UNSUPPORTED_LANGUAGES_KEY',
    autoTriggerEnabledKey: 'CONSOLAS_AUTO_TRIGGER_ENABLED',
    termsAcceptedKey: 'CONSOLAS_TERMS_ACCEPTED',
    serviceActiveKey: 'CONSOLAS_SERVICE_ACTIVE',

    //
    learnMoreUri: 'https://en.wikipedia.org/wiki/Consolas',

    /**
     * the interval of the background thread invocation, which is triggered by the timer
     */
    defaultCheckPeriodMillis: 1000 * 60 * 5,

    // origin tracker
    referenceLog: 'Consolas Reference Log',
    includeSuggestionsWithLicensedCode: 'Include suggestions with licensed code',

    suggestionDetailReferenceText: (licenses: string) =>
        `Reference code under license ${licenses}. View full details in Consolas reference log.`,

    hoverInlayText: (licenseName: string | undefined, repository: string | undefined) =>
        `Reference code under the ${licenseName} license from repository ${repository}`,

    referenceLogText: (code: string, license: string, repository: string, filePath: string, lineInfo: string) =>
        `with code ${code} provided with reference under ${license} from ${repository}. Added to ${filePath} ${lineInfo}.`,

    referenceLogPromptText: `Don\'t want suggestions that include code from other sources? Uncheck this option in 
    <a href="#" onclick="openSettings();return false;">AWS Toolkit settings</a> 
    (Settings / Extensions / AWS Toolkit / Aws: Consolas / Include suggestions with licensed code).`,
}
