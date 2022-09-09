/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SDK Client
 */
export const endpoint = 'https://codewhisperer.us-east-1.amazonaws.com/'

export const region = 'us-east-1'

/**
 * Automated and manual trigger
 */
export const invocationTimeIntervalThreshold = 2 // seconds

export const promiseTimeoutLimit = 15 // seconds

export const invocationKeyThreshold = 15

export const specialCharactersList = ['{', '[', '(', ':', '\t', '\n']

export const normalTextChangeRegex = /[A-Za-z0-9]/g

export const autoSuggestionConfig = {
    settingId: 'codewhisperer_autoSuggestionActivation',
    activated: 'Activated',
    deactivated: 'Deactivated',
}

/**
 * EditorCon context
 */
export const charactersLimit = 10240

export const filenameCharsLimit = 1024

export const naturalLanguage = 'en-US'

export const maxRecommendations = 1

export const space = ' '

export const lineBreak = '\n'

export const lineBreakWin = '\r\n'

/**
 * Ux of recommendations
 */
export const labelLength = 20

export const completionDetail = 'CodeWhisperer'

/**
 * CodeWhisperer in configuration
 */
export const codewhisperer = 'CodeWhisperer'

/**
 * Supported languages
 */
export const java = 'java'

export const python = 'python'

export const javascript = 'javascript'

export const typescript = 'typescript'

export const supportedLanguages = ['java', 'python', 'javascript', 'typescript']

/**
 * Prompt
 */
export const pendingResponse = 'Waiting for CodeWhisperer...'

export const runningSecurityScan = 'Running security scan...'

export const noSuggestions = 'No suggestions from CodeWhisperer'

export const licenseFilter = 'CodeWhisperer suggestions were filtered due to reference setting'

/**
 * Beta landing page file
 */
export const welcomeCodeWhispererReadmeFileSource = 'resources/markdown/WelcomeToCodeWhisperer.md'

export const welcomeCodeWhispererCloud9ReadmeFileSource = 'resources/markdown/WelcomeToCodeWhispererCloud9.md'

export const welcomeMessageKey = 'CODEWHISPERER_WELCOME_MESSAGE'

/**
 * Key bindings JSON file path
 */
export const keyBindingPathMac = 'Library/Application Support/Code/User/keybindings.json'

export const keyBindingPathLinux = '.config/Code/User/keybindings.json'

export const keyBindingPathWin = 'Code/User/keybindings.json'

/**
 * Length of left context preview in output channel
 */
export const contextPreviewLen = 20

/**
 * Unsupported language cache
 */
export const unsupportedLanguagesCacheTTL = 10 * 60 * 60 * 1000

export const unsupportedLanguagesKey = 'CODEWHISPERER_UNSUPPORTED_LANGUAGES_KEY'

export const autoTriggerEnabledKey = 'CODEWHISPERER_AUTO_TRIGGER_ENABLED'

export const termsAcceptedKey = 'CODEWHISPERER_TERMS_ACCEPTED'

export const serviceActiveKey = 'CODEWHISPERER_SERVICE_ACTIVE'

export const accessToken = 'CODEWHISPERER_ACCESS_TOKEN'

export const learnMoreUri = 'https://aws.amazon.com/codewhisperer'

export const previewSignupPortal = 'https://pages.awscloud.com/codewhisperer-sign-up-form.html'

export const identityPoolID = 'us-east-1:70717e99-906f-4add-908c-bd9074a2f5b9'

/**
 * the interval of the background thread invocation, which is triggered by the timer
 */
export const defaultCheckPeriodMillis = 1000 * 60 * 5

// suggestion show delay, in milliseconds
export const suggestionShowDelay = 250

export const referenceLog = 'CodeWhisperer Reference Log'

export const suggestionDetailReferenceText = (licenses: string) =>
    `Reference code under ${licenses}. View full details in CodeWhisperer reference log.`

export const hoverInlayText = (licenseName: string | undefined, repository: string | undefined) =>
    `Reference code under the ${licenseName} license from repository ${repository}`

export const referenceLogText = (
    code: string,
    license: string,
    repository: string,
    filePath: string,
    lineInfo: string
) =>
    `with code ${code} provided with reference under ${license} from repository ${repository}. Added to ${filePath} ${lineInfo}.`

export const referenceLogPromptText = `Don\'t want suggestions that include code with references? Uncheck this option in 
    <a href="#" onclick="openSettings();return false;">CodeWhisperer Settings</a>`

/**
 * Security Scan
 */
export const codeScanJavaPayloadSizeLimitBytes = Math.pow(2, 20) // 1 MB

export const codeScanPythonPayloadSizeLimitBytes = 200 * Math.pow(2, 10) // 200 KB

export const codeScanTruncDirPrefix = 'codewhisperer_scan'

export const codeScanZipExt = '.zip'

export const contextTruncationTimeoutSeconds = 10

export const codeScanJobTimeoutSeconds = 50

export const projectSizeCalculateTimeoutSeconds = 10

export const codeScanJobPollingIntervalSeconds = 5

export const artifactTypeSource = 'SourceCode'

export const artifactTypeBuild = 'BuiltJars'

export const codeScanFindingsSchema = 'codescan/findings/1.0'

// telemetry experiment id
export const experimentId = 'codeWhisperer'

// wait time for editor to update editor.selection.active (in milliseconds)
export const vsCodeCursorUpdateDelay = 3

// cloud9 access state
export const cloud9AccessStateKey = 'cloud9AccessStateKey'

export const cloud9AccessSent = 'Access requested!'

export const cloud9AccessAlreadySent = 'Access has already been requested, we are still processing it.'
