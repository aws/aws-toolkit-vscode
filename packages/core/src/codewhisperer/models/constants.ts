/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

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

export const autoScansConfig = {
    settingId: 'codewhisperer_autoScansActivation',
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

export const autoScansEnabledKey = 'CODEWHISPERER_AUTO_SCANS_ENABLED'

export const serviceActiveKey = 'CODEWHISPERER_SERVICE_ACTIVE'

export const persistedCustomizationsKey = 'CODEWHISPERER_PERSISTED_CUSTOMIZATIONS'

export const selectedCustomizationKey = 'CODEWHISPERER_SELECTED_CUSTOMIZATION'

export const inlinehintKey = 'CODEWHISPERER_HINT_DISPLAYED'

export const inlinehintWipKey = 'aws.codewhisperer.tutorial.workInProgress'

export type AnnotationChangeSource = 'codewhisperer' | 'selection' | 'editor' | 'content'

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

export const fileScanPayloadSizeLimitBytes = 200 * Math.pow(2, 10) // 200 KB

export const projectScanPayloadSizeLimitBytes = 5 * Math.pow(2, 30) // 5 GB

export const codeScanTruncDirPrefix = 'codewhisperer_scan'

export const codeScanZipExt = '.zip'

export const contextTruncationTimeoutSeconds = 10

export const codeScanJobTimeoutSeconds = 50

export const projectSizeCalculateTimeoutSeconds = 10

export const codeScanJobPollingIntervalSeconds = 1

export const artifactTypeSource = 'SourceCode'

export const codeScanFindingsSchema = 'codescan/findings/1.0'

export const autoScanDebounceDelaySeconds = 2

export const codewhispererDiagnosticSourceLabel = 'CodeWhisperer '

// use vscode languageId here / Supported languages
export const securityScanLanguageIds = [
    'java',
    'python',
    'javascript',
    'typescript',
    'csharp',
    'go',
    'ruby',
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

export type SecurityScanLanguageId = (typeof securityScanLanguageIds)[number]

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

// Not const so that tests can set replace this with aws-core-vscode dummy extension name.
// Temporary until we can move this out of the core library.
export let codeScanLogsOutputChannelId =
    'workbench.action.output.show.extension-output-amazonwebservices.aws-toolkit-vscode-#1-CodeWhisperer Security Scan Logs'

export function setCodeScanLogsOutputChannelId(val: string) {
    codeScanLogsOutputChannelId = val
}

export const stopScanMessage =
    'Stop security scan? This scan will be counted as one complete scan towards your monthly security scan limits.'

export const showScannedFilesMessage = 'Show Scanned Files'

export const userGroupKey = 'CODEWHISPERER_USER_GROUP'

export const updateInlineLockKey = 'CODEWHISPERER_INLINE_UPDATE_LOCK_KEY'

export const newCustomizationMessage = 'You have access to new CodeWhisperer customizations.'

export const newCustomizationsAvailableKey = 'aws.amazonq.codewhisperer.newCustomizations'

// Amazon Q Code Transformation

export const amazonQFeedbackKey = 'Amazon Q'

export const amazonQFeedbackText = 'Submit feedback'

export const selectProjectPrompt = 'Select the project you want to transform'

export const compilingProjectMessage = 'Amazon Q is compiling your project. This can take up to 10 minutes.'

export const submittedProjectMessage =
    'Your project has been submitted for transformation. The code transformation process may take 10-30 mins depending on the size of your project.'

export const unsupportedJavaVersionSelectedMessage =
    'None of your open projects are supported by Amazon Q Code Transformation. For more information, see the [Amazon Q documentation](LINK_HERE).'

export const transformByQWindowTitle = 'Amazon Q Code Transformation'

export const failedToStartJobMessage =
    "Amazon Q couldn't begin the transformation. Try starting the transformation again."

export const failedToCompleteJobMessage =
    "Amazon Q couldn't complete the transformation. Try starting the transformation again."

export const stopTransformByQMessage = 'Stop transformation?'

export const stoppingTransformByQMessage = 'Stopping transformation...'

export const transformByQCancelledMessage = 'You cancelled the transformation.'

export const transformByQCompletedMessage =
    'Amazon Q successfully transformed your code. You can download a summary of the transformation and a diff with proposed changes in the Transformation Hub.'

export const transformByQPartiallyCompletedMessage =
    'Amazon Q partially transformed your code. You can download a summary of the transformation and a diff with proposed changes in the Transformation Hub.'

export const noPomXmlFoundMessage =
    'None of your open Java projects are supported by Amazon Q Code Transformation. Currently, Amazon Q can only upgrade Java projects built on Maven. A pom.xml must be present in the root of your project to upgrade it. For more information, see the [Amazon Q documentation](LINK_HERE).'

export const noActiveIdCMessage =
    'Amazon Q Code Transformation requires an active IAM Identity Center connection. For more information, see the [Code Transformation documentation](LINK_HERE).'

export const noOngoingJobMessage = 'No job is in-progress at the moment'

export const jobInProgressMessage = 'Job is already in-progress'

export const cancellationInProgressMessage = 'Cancellation is in-progress'

export const errorStoppingJobMessage = "Amazon Q couldn't stop the transformation."

export const errorDownloadingDiffMessage =
    "Amazon Q couldn't download the diff with your upgraded code. Try downloading it again. For more information, see the [Amazon Q documentation](LINK_HERE)."

export const emptyDiffMessage =
    "Amazon Q didn't make any changes to upgrade your code. Try restarting the transformation."

export const errorDeserializingDiffMessage =
    "Amazon Q couldn't parse the diff with your upgraded code. Try restarting the transformation."

export const viewProposedChangesMessage =
    'Download complete. You can view a summary of the transformation and accept or reject the proposed changes in the Transformation Hub.'

export const changesAppliedMessage = 'Amazon Q applied the changes to your project.'

export const noSupportedJavaProjectsFoundMessage =
    'None of your open projects are supported by Amazon Q Code Transformation. Currently, Amazon Q can only upgrade Java projects built on Maven. For more information, see the [Amazon Q documentation](LINK_HERE).'

export const linkToDocsHome = 'https://docs.aws.amazon.com/amazonq/latest/aws-builder-use-ug/code-transformation.html'

export const linkToPrerequisites =
    'https://docs.aws.amazon.com/amazonq/latest/aws-builder-use-ug/code-transformation.html#prerequisites'

export const linkToMavenTroubleshooting =
    'https://docs.aws.amazon.com/amazonq/latest/aws-builder-use-ug/troubleshooting-code-transformation.html#w24aac14c20c19b7'

export const linkToUploadZipTooLarge =
    'https://docs.aws.amazon.com/amazonq/latest/aws-builder-use-ug/troubleshooting-code-transformation.html#w24aac14c20c19b5'

export const linkToDownloadZipTooLarge =
    'https://docs.aws.amazon.com/amazonq/latest/aws-builder-use-ug/troubleshooting-code-transformation.html#w24aac14c20c19c11'

export const dependencyDisclaimer =
    'Please confirm you are ready to proceed with the transformation. Amazon Q Code Transformation will upload the application code and its dependency binaries from your machine to start the upgrade. If you have not yet compiled the application on your local machine, please do so once before starting the upgrade.'

export const dependencyFolderName = 'transformation_dependencies_temp_'

export const installErrorMessage =
    "Amazon Q couldn't execute the Maven install command. To troubleshoot, see the [Amazon Q Code Transformation documentation](LINK_HERE)."

export const dependencyErrorMessage =
    "Amazon Q couldn't execute the Maven copy-dependencies command. To troubleshoot, see the [Amazon Q Code Transformation documentation](LINK_HERE)."

export const planIntroductionMessage =
    'We reviewed your Java JAVA_VERSION_HERE application and generated a transformation plan. Any code changes made to your application will be done in the sandbox so as to not interfere with your working repository. Once the transformation job is done, we will share the new code which you can review before acccepting the code changes. In the meantime, you can work on your codebase and invoke Q Chat to answer questions about your codebase.'

export const planDisclaimerMessage = '**Proposed transformation changes** \n\n\n'

export const numMillisecondsPerSecond = 1000

export const uploadZipSizeLimitInBytes = 1000000000 // 1GB

export const maxBufferSize = 1024 * 1024 * 8 // this is 8MB; the default max buffer size for stdout for spawnSync is 1MB

export const transformByQStateRunningMessage = 'running'

export const transformByQStateCancellingMessage = 'cancelling'

export const transformByQStateFailedMessage = 'failed'

export const transformByQStateSucceededMessage = 'succeeded'

export const transformByQStatePartialSuccessMessage = 'partially succeeded'

export const transformByQStoppedState = 'STOPPED'

export const transformationJobPollingIntervalSeconds = 5

export const transformationJobTimeoutSeconds = 60 * 60 // 1 hour, to match backend

export const defaultLanguage = 'Java'

export const contentChecksumType = 'SHA_256'

export const uploadIntent = 'TRANSFORMATION'

export const transformationType = 'LANGUAGE_UPGRADE'

// job successfully started
export const validStatesForJobStarted = [
    'STARTED',
    'PREPARING',
    'PREPARED',
    'PLANNING',
    'PLANNED',
    'TRANSFORMING',
    'TRANSFORMED',
]

// initial build succeeded
export const validStatesForBuildSucceeded = ['PREPARED', 'PLANNING', 'PLANNED', 'TRANSFORMING', 'TRANSFORMED']

// plan must be available
export const validStatesForPlanGenerated = ['PLANNED', 'TRANSFORMING', 'TRANSFORMED']

export const failureStates = ['FAILED', 'STOPPING', 'STOPPED', 'REJECTED']

// if status is COMPLETED or PARTIALLY_COMPLETED we can download artifacts
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

export enum SecurityScanType {
    File = 'File',
    Project = 'Project',
}
