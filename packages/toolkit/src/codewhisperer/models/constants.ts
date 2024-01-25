/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

export const showRecommendationTimerPollPeriod = 25

export const specialCharactersList = ['{', '[', '(', ':', '\t', '\n']

export const AWSTemplateKeyWords = ['AWSTemplateFormatVersion', 'Resources', 'AWS::', 'Description']

export const AWSTemplateCaseInsensitiveKeyWords = ['cloudformation', 'cfn', 'template', 'description']

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

export const supplementalContextTimeoutInMs = 50

/**
 * Ux of recommendations
 */
export const labelLength = 20

export const completionDetail = 'CodeWhisperer'

/**
 * CodeWhisperer in configuration
 */
export const codewhisperer = 'CodeWhisperer'

// use vscode languageId here / Supported languages
export const platformLanguageIds = [
    'java',
    'python',
    'javascript',
    'javascriptreact',
    'typescript',
    'typescriptreact',
    'csharp',
    'c',
    'cpp',
    'c_cpp', // Cloud9 reports C++ files with this language-id.
    'go',
    'kotlin',
    'php',
    'ruby',
    'rust',
    'scala',
    'shellscript',
    'sh', // Cloud9 reports bash files with this language-id
    'sql',
    'golang', // Cloud9 reports Go files with this language-id
    'json',
    'yaml',
    'tf',
    'hcl',
    'terraform',
    'terragrunt',
    'packer',
    'plaintext',
    'jsonc',
] as const

export type PlatformLanguageId = (typeof platformLanguageIds)[number]

/**
 * Prompt
 */
export const pendingResponse = 'Waiting for CodeWhisperer...'

export const runningSecurityScan = 'Scanning active file and its dependencies...'

export const noSuggestions = 'No suggestions from CodeWhisperer'

export const licenseFilter = 'CodeWhisperer suggestions were filtered due to reference setting'

/**
 * Beta landing page file
 */
export const welcomeCodeWhispererReadmeFileSource = 'resources/markdown/WelcomeToCodeWhisperer.md'

export const welcomeCodeWhispererCloud9Readme = 'resources/markdown/WelcomeToCodeWhispererCloud9.md'

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

export const serviceActiveKey = 'CODEWHISPERER_SERVICE_ACTIVE'

export const persistedCustomizationsKey = 'CODEWHISPERER_PERSISTED_CUSTOMIZATIONS'

export const selectedCustomizationKey = 'CODEWHISPERER_SELECTED_CUSTOMIZATION'

export const learnMoreUriGeneral = 'https://aws.amazon.com/codewhisperer/'

export const learnMoreUri = 'https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/codewhisperer.html'

export const customLearnMoreUri = 'https://docs.aws.amazon.com/codewhisperer/latest/userguide/customizations.html'

export const securityScanLearnMoreUri = 'https://docs.aws.amazon.com/codewhisperer/latest/userguide/security-scans.html'

export const identityPoolID = 'us-east-1:70717e99-906f-4add-908c-bd9074a2f5b9'

/**
 * the interval of the background thread invocation, which is triggered by the timer
 */
export const defaultCheckPeriodMillis = 1000 * 60 * 5

// suggestion show delay, in milliseconds
export const suggestionShowDelay = 250

// add 200ms more delay on top of inline default 30-50ms
export const inlineSuggestionShowDelay = 200

export const referenceLog = 'Code Reference Log'

export const suggestionDetailReferenceText = (licenses: string) =>
    `Reference code under ${licenses}. View full details in Code Reference Log.`

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

export const codeScanCsharpPayloadSizeLimitBytes = Math.pow(2, 20) // 1 MB

export const codeScanRubyPayloadSizeLimitBytes = 200 * Math.pow(2, 10) // 200 KB

export const codeScanGoPayloadSizeLimitBytes = 200 * Math.pow(2, 10) // 200 KB

export const codeScanPythonPayloadSizeLimitBytes = 200 * Math.pow(2, 10) // 200 KB

export const codeScanCFPayloadSizeLimitBytes = 200 * Math.pow(2, 10) // 200 KB

export const codeScanTerraformPayloadSizeLimitBytes = 200 * Math.pow(2, 10) // 200 KB

export const codeScanJavascriptPayloadSizeLimitBytes = 200 * Math.pow(2, 10) // 200 KB

export const codeScanTruncDirPrefix = 'codewhisperer_scan'

export const codeScanZipExt = '.zip'

export const contextTruncationTimeoutSeconds = 10

export const codeScanJobTimeoutSeconds = 50

export const projectSizeCalculateTimeoutSeconds = 10

export const codeScanJobPollingIntervalSeconds = 1

export const artifactTypeSource = 'SourceCode'

export const codeScanFindingsSchema = 'codescan/findings/1.0'

// wait time for editor to update editor.selection.active (in milliseconds)
export const vsCodeCursorUpdateDelay = 10

export const reloadWindow = 'Reload Now'

export const reloadWindowPrompt =
    'Inline suggestion settings changed. The current window needs to be reloaded for CodeWhisperer to use these changes.'

export const ssoConfigAlertMessage = `This setting is controlled by your organization\’s admin and has been reset to the value they\’ve specified.`

export const ssoConfigAlertMessageShareData = `This setting doesn\’t apply, since you are in Professional tier`

export const settingsLearnMore = 'Learn More about CodeWhisperer Settings'

export const connectWithAWSBuilderId = `Connect with AWS`

export const freeTierLimitReached = 'You have reached the monthly fair use limit of code recommendations.'

export const freeTierLimitReachedCodeScan = 'You have reached the monthly quota of code scans.'

export const throttlingLearnMore = `Learn More`

export const throttlingMessage = `Maximum recommendation count reached for this month`

export const connectionChangeMessage = `Keep using CodeWhisperer with `

// TODO: align this text with service side
export const invalidCustomizationMessage = `You are not authorized to access`

export const failedToConnectAwsBuilderId = `Failed to connect to AWS Builder ID`

export const failedToConnectIamIdentityCenter = `Failed to connect to IAM Identity Center`

export const connectionExpired = `Connection expired. To continue using Amazon Q/CodeWhisperer, connect with AWS Builder ID or AWS IAM Identity center.`

export const DoNotShowAgain = `Don\'t Show Again`

export const codeScanLogsOutputChannelId =
    'workbench.action.output.show.extension-output-amazonwebservices.aws-toolkit-vscode-#1-CodeWhisperer Security Scan Logs'

export const stopScanMessage =
    'Stop security scan? This scan will be counted as one complete scan towards your monthly security scan limits.'

export const showScannedFilesMessage = 'Show Scanned Files'

export const userGroupKey = 'CODEWHISPERER_USER_GROUP'

export const updateInlineLockKey = 'CODEWHISPERER_INLINE_UPDATE_LOCK_KEY'

export const newCustomizationMessage = 'You have access to new CodeWhisperer customizations.'

export const newCustomizationAvailableKey = 'CODEWHISPERER_NEW_CUSTOMIZATION_AVAILABLE'

// Transform by Q

export const selectTargetLanguagePrompt = 'Select the target language'

export const selectTargetVersionPrompt = 'Select the target version'

export const selectModulePrompt = 'Select the module you want to transform'

export const transformByQWindowTitle = 'Amazon Q CodeTransformation'

export const stopTransformByQMessage = 'Stop Transformation?'

export const stoppingTransformByQMessage = 'Stopping Transformation...'

export const transformByQFailedMessage = 'Transformation failed'

export const transformByQCancelledMessage = 'Transformation cancelled'

export const transformByQCompletedMessage = 'Transformation completed'

export const transformByQPartiallyCompletedMessage = 'Transformation partially completed'

export const noPomXmlFoundMessage =
    'We could not find a valid configuration file. We currently support Maven build tool and require a POM.xml in the root directory to identify build configurations. Be sure to also build your project.'

export const noActiveIdCMessage = 'Transform by Q requires an active IAM Identity Center connection'

export const noOngoingJobMessage = 'No job is in-progress at the moment'

export const jobInProgressMessage = 'Job is already in-progress'

export const cancellationInProgressMessage = 'Cancellation is in-progress'

export const errorStoppingJobMessage = 'Error stopping job'

export const errorDownloadingDiffMessage = 'Transform by Q experienced an error when downloading the diff'

export const viewProposedChangesMessage =
    'Transformation job completed. You can view the transformation summary along with the proposed changes and accept or reject them in the Proposed Changes panel.'

export const changesAppliedMessage = 'Changes applied'

export const noSupportedJavaProjectsFoundMessage =
    'We could not find an upgrade-eligible application. We currently support upgrade of Java applications of version 8 and 11. Be sure to also build your project.'

export const dependencyDisclaimer =
    'Please confirm you are ready to proceed with the transformation. Amazon Q will upload the application code and its dependency binaries from your machine to start the upgrade. If you have not yet compiled the application on your local machine, please do so once before starting the upgrade. Install Maven to ensure all module dependencies are picked for Transformation.'

export const dependencyFolderName = 'transformation_dependencies_temp_'

export const dependencyErrorMessage =
    'Failed to execute Maven. It is possible that the upload does not include all dependencies. We will still attempt to complete the transformation.'

export const planIntroductionMessage =
    'We reviewed your Java JAVA_VERSION_HERE application and generated a transformation plan. Any code changes made to your application will be done in the sandbox so as to not interfere with your working repository. Once the transformation job is done, we will share the new code which you can review before acccepting the code changes. In the meantime, you can work on your codebase and invoke Q Chat to answer questions about your codebase.'

export const planDisclaimerMessage = '**Proposed transformation changes** \n\n\n'

export const JDK8VersionNumber = '52'

export const JDK11VersionNumber = '55'

export const numMillisecondsPerSecond = 1000

export const transformByQStateRunningMessage = 'running'

export const transformByQStateCancellingMessage = 'cancelling'

export const transformByQStateFailedMessage = 'failed'

export const transformByQStateSucceededMessage = 'succeeded'

export const transformByQStatePartialSuccessMessage = 'partially succeeded'

export const transformByQStoppedState = 'STOPPED'

export const transformationJobPollingIntervalSeconds = 10

export const transformationJobTimeoutSeconds = 72000

export const progressIntervalMs = 1000

export const targetLanguages = ['Java']

export const targetVersions = new Map<string, string[]>([['Java', ['JDK17']]])

export const defaultLanguage = 'Java'

export const contentChecksumType = 'SHA_256'

export const uploadIntent = 'TRANSFORMATION'

export const transformationType = 'LANGUAGE_UPGRADE'

// when in one of these states, we can definitely say the plan is available
// in other states, we keep polling/waiting
export const validStatesForGettingPlan = ['COMPLETED', 'PARTIALLY_COMPLETED', 'PLANNED', 'TRANSFORMING', 'TRANSFORMED']

export const failureStates = ['FAILED', 'STOPPING', 'STOPPED', 'REJECTED']

// similarly, when in one of these states, we can stop polling, and if status is COMPLETED or PARTIALLY_COMPLETED we can download artifacts
export const validStatesForCheckingDownloadUrl = [
    'COMPLETED',
    'PARTIALLY_COMPLETED',
    'FAILED',
    'STOPPING',
    'STOPPED',
    'REJECTED',
]

export enum UserGroup {
    Classifier = 'Classifier',
    CrossFile = 'CrossFile',
    Control = 'Control',
    RightContext = 'RightContext',
}

export const isClassifierEnabledKey = 'CODEWHISPERER_CLASSIFIER_TRIGGER_ENABLED'

export const supplemetalContextFetchingTimeoutMsg = 'codewhisperer supplemental context fetching timeout'

export const codeFixAppliedSuccessMessage = 'Code fix was applied. Run a security scan to validate the fix.'

export const codeFixAppliedFailedMessage = 'Failed to apply suggested code fix.'

export const runSecurityScanButtonTitle = 'Run security scan'

export const crossFileContextConfig = {
    numberOfChunkToFetch: 60,
    topK: 3,
    numberOfLinesEachChunk: 10,
}

export const utgConfig = {
    maxSegmentSize: 10200,
}

export const transformTreeNode = 'qTreeNode'
