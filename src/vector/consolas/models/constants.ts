/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export const ConsolasConstants = {
    /**
     * SDK Client
     */
    alphaEndpoint: 'https://conso-conso-2ql1n3f7bqyy-1380812087.us-west-2.elb.amazonaws.com/',
    betaEndpoint: 'https://conso-conso-1gaw7rhj4gx1w-a813d3d32546185b.elb.us-west-2.amazonaws.com/',
    gammaEndpoint: 'https://conso-conso-1ohz4gfxol2wj-1382674778.us-west-2.elb.amazonaws.com/',
    prodEndpoint: 'https://conso-conso-eh28s3s7lpja-dc3892a3fd48c07f.elb.us-west-2.amazonaws.com/',
    region: 'us-west-2',

    /**
     * Automated and manual trigger
     */
    invocationTimeIntervalThreshold: 2, // seconds
    promiseTimeoutLimit: 15, // seconds
    invocationKeyThreshold: 30,
    specialCharactersList: ['{', '[', '(', ':', '\t', '\n'],
    normalTextChangeRegex: /[A-Za-z0-9]/g,

    /**
     * EditorCon context
     */
    charactersLimit: 25600,
    filenameCharsLimit: 1024,
    naturalLanguage: 'en-US',
    maxRecommendations: 1,
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
    runningSecurityScan: 'Running security scan...',

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
    accessToken: 'CONSOLAS_ACCESS_TOKEN',

    //
    learnMoreUri: 'https://en.wikipedia.org/wiki/Consolas',

    // TODO: Update the portal url
    previewSignupPortal: 'https://docs.aws.amazon.com/',

    prodIdentityPoolID: 'us-west-2:1ec95da4-4533-48a5-aafb-fcac96a9bbc6',
    alphaIdentityPoolID: 'us-west-2:c84f4c4c-e283-469f-a1d4-bf43c44f48c1',
    betaIdentityPoolID: 'us-west-2:b4e4d976-f042-4347-9d89-299b8f9787f3',
    gammaIdentityPoolID: 'us-west-2:97e13e76-921d-4298-8a5d-614dd3039585',
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
    /**
     * Security Scan
     */
    codeScanStartedKey: 'CONSOLAS_SECURITY_SCAN_STARTED',
    codeScanPayloadSizeLimit: 1e6, // 1 MB
    codeScanTruncDirPrefix: 'consolas_scan',
    codeScanZipExt: '.zip',
    contextTruncationTimeout: 100, // Seconds
    codeScanJobTimeout: 300, // Seconds
    codeScanJobPollingInterval: 5, // Seconds
    artifactTypeSource: 'SourceCode',
    artifactTypeBuild: 'BuiltJars',
}
