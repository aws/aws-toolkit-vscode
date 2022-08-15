/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export const CodeWhispererConstants = {
    /**
     * SDK Client
     */
    endpoint: 'https://codewhisperer.us-east-1.amazonaws.com/',
    region: 'us-east-1',

    /**
     * Automated and manual trigger
     */
    invocationTimeIntervalThreshold: 2, // seconds
    promiseTimeoutLimit: 15, // seconds
    invocationKeyThreshold: 15,
    specialCharactersList: ['{', '[', '(', ':', '\t', '\n'],
    normalTextChangeRegex: /[A-Za-z0-9]/g,
    AutoSuggestion: {
        settingId: 'cwspr_autoSuggestionActivation',
        activated: 'Activated',
        deactivated: 'Deactivated',
    },

    /**
     * EditorCon context
     */
    charactersLimit: 10240,
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
    completionDetail: 'CodeWhisperer',

    /**
     * CodeWhisperer in configuration
     */
    codewhisperer: 'CodeWhisperer',
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
    pendingResponse: 'Pending CodeWhisperer response, please wait...',
    runningSecurityScan: 'Running security scan...',
    noSuggestions: 'No suggestions from CodeWhisperer',
    licenseFilter: 'CodeWhisperer suggestions were filtered due to reference setting',

    /**
     * Beta landing page file
     */
    welcomeCodeWhispererReadmeFileSource: 'resources/markdown/WelcomeToCodeWhisperer.md',
    welcomeCodeWhispererCloud9ReadmeFileSource: 'resources/markdown/WelcomeToCodeWhispererCloud9.md',
    welcomeMessageKey: 'CODEWHISPERER_WELCOME_MESSAGE',

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
    unsupportedLanguagesKey: 'CODEWHISPERER_UNSUPPORTED_LANGUAGES_KEY',
    autoTriggerEnabledKey: 'CODEWHISPERER_AUTO_TRIGGER_ENABLED',
    termsAcceptedKey: 'CODEWHISPERER_TERMS_ACCEPTED',
    serviceActiveKey: 'CODEWHISPERER_SERVICE_ACTIVE',
    accessToken: 'CODEWHISPERER_ACCESS_TOKEN',

    learnMoreUri: 'https://aws.amazon.com/codewhisperer',

    previewSignupPortal: 'https://pages.awscloud.com/codewhisperer-sign-up-form.html',

    identityPoolID: 'us-east-1:70717e99-906f-4add-908c-bd9074a2f5b9',
    /**
     * the interval of the background thread invocation, which is triggered by the timer
     */
    defaultCheckPeriodMillis: 1000 * 60 * 5,

    // suggestion show delay, in milliseconds
    suggestionShowDelay: 250,

    referenceLog: 'CodeWhisperer Reference Log',

    suggestionDetailReferenceText: (licenses: string) =>
        `Reference code under ${licenses}. View full details in CodeWhisperer reference log.`,

    hoverInlayText: (licenseName: string | undefined, repository: string | undefined) =>
        `Reference code under the ${licenseName} license from repository ${repository}`,

    referenceLogText: (code: string, license: string, repository: string, filePath: string, lineInfo: string) =>
        `with code ${code} provided with reference under ${license} from repository ${repository}. Added to ${filePath} ${lineInfo}.`,

    referenceLogPromptText: `Don\'t want suggestions that include code with references? Uncheck this option in 
    <a href="#" onclick="openSettings();return false;">CodeWhisperer Settings</a>`,
    /**
     * Security Scan
     */
    codeScanJavaPayloadSizeLimitBytes: Math.pow(2, 20), // 1 MB
    codeScanPythonPayloadSizeLimitBytes: 200 * Math.pow(2, 10), // 200 KB
    codeScanTruncDirPrefix: 'codewhisperer_scan',
    codeScanZipExt: '.zip',
    contextTruncationTimeoutSeconds: 10,
    codeScanJobTimeoutSeconds: 50,
    codeScanJobPollingIntervalSeconds: 5,
    artifactTypeSource: 'SourceCode',
    artifactTypeBuild: 'BuiltJars',
    codeScanFindingsSchema: 'codescan/findings/1.0',

    // telemetry experiment id
    experimentId: 'codeWhisperer',

    // wait time for editor to update editor.selection.active (in milliseconds)
    vsCodeCursorUpdateDelay: 3,
    // cloud9 access state
    cloud9AccessStateKey: 'cloud9AccessStateKey',
    cloud9AccessSent: 'Access requested!',
    cloud9AccessAlreadySent: 'Access has already been requested, we are still processing it.',
}
