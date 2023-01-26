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

export const idleTimerPollPeriod = 25 // milliseconds

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

export const plaintext = 'plaintext'

// use vscode languageId here
export const supportedLanguages = [
    'java',
    'python',
    'javascript',
    'javascriptreact',
    'typescript',
    'typescriptreact',
    'csharp',
] as const

export type SupportedLanguage = typeof supportedLanguages[number]

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

export const welcomeCodeWhispererCloud9Readme = 'resources/markdown/WelcomeToCodeWhispererCloud9.md'

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

export const learnMoreUriGeneral = 'https://aws.amazon.com/codewhisperer/'

export const learnMoreUri = 'https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/codewhisperer.html'

export const accessTokenMigrationLearnMoreUri =
    'https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/codewhisperer-auth.html'

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

export const referenceLogPromptTextEnterpriseSSO =
    'Your organization controls whether suggestions include code with references. To update these settings, please contact your admin.'
/**
 * Security Scan
 */
export const codeScanJavaPayloadSizeLimitBytes = Math.pow(2, 20) // 1 MB

export const codeScanPythonPayloadSizeLimitBytes = 200 * Math.pow(2, 10) // 200 KB

export const codeScanJavascriptPayloadSizeLimitBytes = 200 * Math.pow(2, 10) // 200 KB

export const codeScanTruncDirPrefix = 'codewhisperer_scan'

export const codeScanZipExt = '.zip'

export const contextTruncationTimeoutSeconds = 10

export const codeScanJobTimeoutSeconds = 50

export const projectSizeCalculateTimeoutSeconds = 10

export const codeScanJobPollingIntervalSeconds = 5

export const artifactTypeSource = 'SourceCode'

export const artifactTypeBuild = 'BuiltJars'

export const codeScanFindingsSchema = 'codescan/findings/1.0'

// wait time for editor to update editor.selection.active (in milliseconds)
export const vsCodeCursorUpdateDelay = 3

export const reloadWindow = 'Reload Now'

export const reloadWindowPrompt =
    'Inline suggestion settings changed. The current window needs to be reloaded for CodeWhisperer to use these changes.'

export const ssoConfigAlertMessage = `This setting is controlled by your organization\’s admin and has been reset to the value they\’ve specified.`

export const settingsLearnMore = 'Learn More about CodeWhisperer Settings'

export const accessTokenCutOffDate = new Date(2023, 0, 31)

export const accessTokenMigrationWarningMessage = `To continue using CodeWhisperer, you must add an AWS Builder ID or AWS IAM Identity Center connection by January 31, 2023.`

export const accessTokenMigrationErrorMessage = `Your Preview Access Code has expired. To continue using CodeWhisperer, connect with AWS Builder ID or AWS IAM Identity center.`

export const accessTokenMigrationWarningButtonMessage = `Connect with AWS to Continue`

export const accessTokenMigrationErrorButtonMessage = `Connect with AWS`

export const connectWithAWSBuilderId = `Connect with AWS`

export const freeTierLimitReached =
    'Free tier limit for Amazon CodeWhisperer has been met. Features will be disabled until next billing cycle begins.'

export const throttlingLearnMore = `Learn More`

export const throttlingMessage = `Maximum recommendation count reached for this month`

export const connectionChangeMessage = `Keep using CodeWhisperer with `

export const failedToConnectAwsBuilderId = `Failed to connect to AWS Builder ID`

export const failedToConnectIamIdentityCenter = `Failed to connect to IAM Identity Center`

export const connectionExpired = `AWS Toolkit: Connection expired. Reauthenticate to continue.`

export const accessTokenMigrationLearnMore = `Learn More`

export const accessTokenMigrationDoNotShowAgain = `Don\'t Show Again`

export const accessTokenMigrationDoNotShowAgainKey = 'CODEWHISPERER_ACCESS_TOKEN_MIGRATION_DO_NOT_SHOW_AGAIN'

export const accessTokenExpiredDoNotShowAgainKey = 'CODEWHISPERER_ACCESS_TOKEN_EXPIRED_DO_NOT_SHOW_AGAIN'

export const accessTokenExpriedKey = 'CODEWHISPERER_ACCESS_TOKEN_EXPIRED'

export const accessTokenMigrationDoNotShowLastShown =
    'CODEWHISPERER_ACCESS_TOKEN_MIGRATION_DO_NOT_SHOW_AGAIN_LAST_SHOWN_TIME'

export const accessTokenExpiredDoNotShowLastShown =
    'CODEWHISPERER_ACCESS_TOKEN_EXPIRED_DO_NOT_SHOW_AGAIN_LAST_SHOWN_TIME'

export const accessTokenMigrationDoNotShowAgainInfo = `You will not receive this notification again. If you would like to continue using CodeWhisperer after January 31, 2023, you can still connect with AWS. [Learn More](https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/codewhisper-setup-general.html).`
