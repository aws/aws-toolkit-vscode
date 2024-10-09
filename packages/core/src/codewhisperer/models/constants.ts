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

export const JsonConfigFileNamingConvention = new Set([
    'app.json',
    'appsettings.json',
    'bower.json',
    'composer.json',
    'db.json',
    'manifest.json',
    'package.json',
    'schema.json',
    'settings.json',
    'tsconfig.json',
    'vcpkg.json',
])

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

export const completionDetail = 'Amazon Q'

/**
 * CodeWhisperer in configuration
 */
export const codewhisperer = 'Amazon Q'

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
    'systemverilog',
    'verilog',
    'powershell',
    'dart',
    'lua',
    'r',
    'swift',
    'vue',
] as const

export type PlatformLanguageId = (typeof platformLanguageIds)[number]

/**
 * Prompt
 */
export const pendingResponse = 'Waiting for Amazon Q...'

export const runningSecurityScan = 'Scanning project for security issues...'

export const noSuggestions = 'No suggestions from Amazon Q'

export const licenseFilter = 'Amazon Q suggestions were filtered due to reference setting'

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

export const serviceActiveKey = 'CODEWHISPERER_SERVICE_ACTIVE'

export const inlinehintKey = 'CODEWHISPERER_HINT_DISPLAYED'

export type AnnotationChangeSource = 'codewhisperer' | 'selection' | 'editor' | 'content'

export const learnMoreUriGeneral = 'https://aws.amazon.com/q/developer/'

export const learnMoreUri = 'https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/q-in-IDE-setup.html'

export const customLearnMoreUri = 'https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/customizations.html'

export const securityScanLearnMoreUri = 'https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/security-scans.html'

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
    <a href="#" onclick="openSettings();return false;">Amazon Q: Settings</a>`

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

export const fileScanUploadIntent = 'AUTOMATIC_FILE_SECURITY_SCAN'

export const projectScanPayloadSizeLimitBytes = 1 * Math.pow(2, 30) // 1GB

export const projectScanUploadIntent = 'FULL_PROJECT_SECURITY_SCAN'

export const codeScanTruncDirPrefix = 'codewhisperer_scan'

export const codeScanZipExt = '.zip'

export const contextTruncationTimeoutSeconds = 10

export const codeScanJobTimeoutSeconds = 60 * 10 //10 minutes

export const codeFileScanJobTimeoutSeconds = 60 //1 minute

export const projectSizeCalculateTimeoutSeconds = 10

export const codeScanJobPollingIntervalSeconds = 1

export const fileScanPollingDelaySeconds = 10

export const projectScanPollingDelaySeconds = 30

export const artifactTypeSource = 'SourceCode'

export const codeScanFindingsSchema = 'codescan/findings/1.0'

export const autoScanDebounceDelaySeconds = 30

export const codewhispererDiagnosticSourceLabel = 'Amazon Q '

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
    'c',
    'cpp',
    'php',
    'xml',
    'toml',
    'pip-requirements',
    'java-properties',
    'go.mod',
    'go.sum',
] as const

export type SecurityScanLanguageId = (typeof securityScanLanguageIds)[number]

// wait time for editor to update editor.selection.active (in milliseconds)
export const vsCodeCursorUpdateDelay = 10

export const reloadWindow = 'Reload Now'

export const reloadWindowPrompt =
    'Inline suggestion settings changed. The current window needs to be reloaded for Amazon Q to use these changes.'

export const ssoConfigAlertMessage = `This setting is controlled by your organization\’s admin and has been reset to the value they\’ve specified.`

export const ssoConfigAlertMessageShareData = `This setting doesn\’t apply, since you are in Professional tier`

export const settingsLearnMore = 'Learn More about Amazon Q Settings'

export const freeTierLimitReached = 'You have reached the monthly fair use limit of code recommendations.'

export const freeTierLimitReachedCodeScan = 'You have reached the monthly quota of code scans.'

export const fileScansLimitReached = 'Amazon Q: You have reached the monthly limit for auto-scans.'

export const projectScansLimitReached = 'Amazon Q: You have reached the monthly limit for project scans.'

export const DefaultCodeScanErrorMessage =
    'Amazon Q encountered an error while scanning for security issues. Try again later.'

export const FileSizeExceededErrorMessage = `Amazon Q: The selected file exceeds the input artifact limit. Try again with a smaller file. For more information about scan limits, see the [Amazon Q documentation](https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/security-scans.html#quotas).`

export const ProjectSizeExceededErrorMessage = `Amazon Q: The selected project exceeds the input artifact limit. Try again with a smaller project. For more information about scan limits, see the [Amazon Q documentation](https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/security-scans.html#quotas).`

export const noSourceFilesErrorMessage = 'Amazon Q: Project does not contain valid files to scan'

export const UploadArtifactToS3ErrorMessage = `Amazon Q is unable to upload your workspace artifacts to Amazon S3 for security scans. For more information, see the [Amazon Q documentation](https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/security_iam_manage-access-with-policies.html#data-perimeters).`

export const throttlingLearnMore = `Learn More`

export const throttlingMessage = `Maximum recommendation count reached for this month`

export const fileScansThrottlingMessage = `Maximum auto-scans count reached for this month`

export const projectScansThrottlingMessage = `Maximum project scan count reached for this month`

export const connectionChangeMessage = `Keep using Amazon Q with `

// TODO: align this text with service side
export const invalidCustomizationMessage = `You are not authorized to access`

export const failedToConnectAwsBuilderId = `Failed to connect to AWS Builder ID`

export const failedToConnectIamIdentityCenter = `Failed to connect to IAM Identity Center`

export const stopScanMessage =
    'Stop security scan? This scan will be counted as one complete scan towards your monthly security scan limits.'

export const showScannedFilesMessage = 'Show Scanned Files'

export const updateInlineLockKey = 'CODEWHISPERER_INLINE_UPDATE_LOCK_KEY'

export const newCustomizationMessage = 'You have access to new Amazon Q customizations.'

// Start of QCT Strings
export const uploadZipSizeLimitInBytes = 2000000000 // 2GB

export const maxBufferSize = 1024 * 1024 * 8 // this is 8MB; the default max buffer size for stdout for spawnSync is 1MB

export const transformationJobPollingIntervalSeconds = 5

export const transformationJobTimeoutSeconds = 3 * 60 * 60 // 3 hours, to match backend

export const defaultLanguage = 'Java'

export const contentChecksumType = 'SHA_256'

export const uploadIntent = 'TRANSFORMATION'

export const transformationType = 'LANGUAGE_UPGRADE'

// initial build succeeded
export const validStatesForBuildSucceeded = [
    'PREPARED',
    'PLANNING',
    'PLANNED',
    'TRANSFORMING',
    'TRANSFORMED',
    'PARTIALLY_COMPLETED',
    'COMPLETED',
]

// plan must be available
export const validStatesForPlanGenerated = [
    'PLANNED',
    'TRANSFORMING',
    'TRANSFORMED',
    'PARTIALLY_COMPLETED',
    'COMPLETED',
]

export const failureStates = ['FAILED', 'STOPPING', 'STOPPED', 'REJECTED']

export const pausedStates = ['PAUSED']

// if status is COMPLETED or PARTIALLY_COMPLETED we can download artifacts
export const validStatesForCheckingDownloadUrl = [
    'COMPLETED',
    'PARTIALLY_COMPLETED',
    'FAILED',
    'STOPPING',
    'STOPPED',
    'REJECTED',
]

export const amazonQFeedbackKey = 'Amazon Q'

export const amazonQFeedbackText = 'Submit feedback'

export const codeTransformTroubleshootProjectSize =
    'https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/troubleshooting-code-transformation.html#reduce-project-size'

export const codeTransformTroubleshootMvnFailure =
    'https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/troubleshooting-code-transformation.html#maven-commands-failing'

export const codeTransformTroubleshootConfigureProxy =
    'https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/troubleshooting-code-transformation.html#configure-proxy'

export const codeTransformTroubleshootDownloadExpired =
    'https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/troubleshooting-code-transformation.html#download-24-hrs'

export const codeTransformTroubleshootAllowS3Access =
    'https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/troubleshooting-code-transformation.html#allowlist-s3-bucket'

export const codeTransformTroubleshootUploadError =
    'https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/troubleshooting-code-transformation.html#project-upload-fail'

export const codeTransformTroubleshootDownloadError =
    'https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/troubleshooting-code-transformation.html#download-code-fail'

export const codeTransformPrereqDoc =
    'https://docs.aws.amazon.com/amazonq/latest/aws-builder-use-ug/code-transformation.html#prerequisites'

export const codeTransformBillingText = (linesOfCode: number) =>
    `<p>${linesOfCode} lines of code were submitted for transformation. If you reach the quota for lines of code included in your subscription, you will be charged $${codeTransformBillingRate} for each additional line of code. You might be charged up to $${(
        linesOfCode * codeTransformBillingRate
    ).toFixed(
        2
    )} for this transformation. To avoid being charged, stop the transformation job before it completes. For more information on pricing and quotas, see [Amazon Q Developer pricing](${linkToBillingInfo}).</p>`

export const codeTransformBillingRate = 0.003

export const codeTransformLocThreshold = 100000

export const jobStartedChatMessage =
    'I am starting to transform your code. It can take 10 to 30 minutes to upgrade your code, depending on the size of your project. To monitor progress, go to the Transformation Hub. If I run into any issues, I might pause the transformation to get input from you on how to proceed.'

export const uploadingCodeStepMessage = 'Uploading your code'

export const buildCodeStepMessage = 'Build uploaded code in secure build environment'

export const generatePlanStepMessage = 'Generate transformation plan'

export const transformStepMessage = 'Transform your code to Java 17 using transformation plan'

export const filesUploadedMessage =
    'Files have been uploaded to Amazon Q, transformation job has been accepted and is preparing to start.'

export const planningMessage = 'Amazon Q is analyzing your code in order to generate a transformation plan.'

export const transformingMessage = 'Amazon Q is transforming your code. Details will appear soon.'

export const stoppingJobMessage = 'Stopping the transformation...'

export const buildingCodeMessage =
    'Amazon Q is building your code using Java JAVA_VERSION_HERE in a secure build environment.'

export const scanningProjectMessage =
    'Amazon Q is scanning the project files and getting ready to start the job. To start the job, Amazon Q needs to upload the project artifacts. Once that is done, Amazon Q can start the transformation job. The estimated time for this operation ranges from a few seconds to several minutes.'

export const failedStepMessage = 'The step failed, fetching additional details...'

export const jobCompletedMessage = 'The transformation completed.'

export const noOngoingJobMessage = 'No ongoing job.'

export const nothingToShowMessage = 'Nothing to show'

export const jobStartedNotification =
    'Amazon Q is transforming your code. It can take 10 to 30 minutes to upgrade your code, depending on the size of your project. To monitor progress, go to the Transformation Hub.'

export const openTransformationHubButtonText = 'Open Transformation Hub'

export const startTransformationButtonText = 'Start a new transformation'

export const stopTransformationButtonText = 'Stop transformation'

export const checkingForProjectsChatMessage =
    'I am checking for open projects that are eligible for Code Transformation.'

export const buildStartedChatMessage =
    'I am building your project. This can take up to 10 minutes, depending on the size of your project.'

export const buildSucceededChatMessage = 'I was able to build your project and will start transforming your code soon.'

export const buildSucceededNotification =
    'Amazon Q was able to build your project and will start transforming your code soon.'

export const absolutePathDetectedMessage = (numPaths: number, buildFile: string, listOfPaths: string) =>
    `I detected ${numPaths} potential absolute file path(s) in your ${buildFile} file: **${listOfPaths}**. Absolute file paths might cause issues when I build your code. Any errors will show up in the build log.`

export const unsupportedJavaVersionChatMessage = `Sorry, currently I can only upgrade Java 8 or Java 11 projects. For more information, see the [Amazon Q documentation](${codeTransformPrereqDoc}).`

export const failedToStartJobChatMessage =
    "Sorry, I couldn't begin the transformation. Please try starting the transformation again."

export const failedToStartJobNotification =
    'Amazon Q could not begin the transformation. Please try starting the transformation again.'

export const failedToStartJobTooManyJobsChatMessage =
    "Sorry, I couldn't begin the transformation. You have too many active transformations running. Please try again after your other transformations have completed."

export const failedToStartJobTooManyJobsNotification =
    'Amazon Q could not begin the transformation. You have too many active transformations running. Please try again after your other transformations have completed.'

export const failedToStartJobMonthlyLimitNotification =
    'Amazon Q cannot transform your project because it will exceed the free tier limit of 2000 lines of code per month. Try transforming a smaller project.'

export const failedToStartJobMonthlyLimitChatMessage =
    'I am sorry, I cannot transform your project because it will exceed the free tier limit of 2000 lines of code per month. You can try again with a smaller project.'

export const failedToStartJobLinesLimitNotification =
    'Your project exceeds the free tier limit of 1000 lines of code per transformation. Try transforming a smaller project.'

export const failedToStartJobLinesLimitChatMessage =
    'I am sorry, your project exceeds the free tier limit of 1000 lines of code per transformation. You can try again with a smaller project.'

export const failedToUploadProjectChatMessage =
    "Sorry, I couldn't upload your project. Please try starting the transformation again."

export const failedToUploadProjectNotification =
    'Amazon Q could not upload your project. Please try starting the transformation again.'

export const failedToGetPlanChatMessage =
    "Sorry, I couldn't create the transformation plan to upgrade your project. Please try starting the transformation again."

export const failedToGetPlanNotification =
    'Amazon Q could not create the transformation plan to upgrade your project. Please try starting the transformation again.'

export const failedToCompleteJobChatMessage =
    "Sorry, I couldn't complete the transformation. Please try starting the transformation again."

export const failedToCompleteJobNotification =
    'Amazon Q could not complete the transformation. Please try starting the transformation again.'

export const failedToCompleteJobGenericChatMessage = "Sorry, I couldn't complete the transformation."

export const failedToCompleteJobGenericNotification = 'Amazon Q could not complete the transformation.'

export const genericErrorMessage =
    'Sorry, I am experiencing technical issues at the moment. Please try again in a few minutes.'

export const jobCancelledChatMessage =
    'I cancelled your transformation. If you want to start another transformation, choose **Start a new transformation**.'

export const jobCancelledNotification = 'You cancelled the transformation.'

export const jobCompletedChatMessage =
    'I upgraded your code to Java 17. You can review the diff to see my proposed changes and accept or reject them. The transformation summary has details about the files I updated.'

export const jobCompletedNotification =
    'Amazon Q upgraded your code to Java 17. You can review the diff to see my proposed changes and accept or reject them. The transformation summary has details about the files I updated.'

export const jobPartiallyCompletedChatMessage =
    'I upgraded part of your code to Java 17. You can review the diff to see my proposed changes and accept or reject them. The transformation summary has details about the files I updated and the errors that prevented a complete transformation.'

export const jobPartiallyCompletedNotification =
    'Amazon Q upgraded part of your code to Java 17. You can review the diff to see my proposed changes and accept or reject them. The transformation summary has details about the files I updated and the errors that prevented a complete transformation.'

export const noPomXmlFoundChatMessage = `Sorry, I couldn\'t find a project that I can upgrade. I couldn\'t find a pom.xml file in any of your open projects. Currently, I can only upgrade Java 8 or Java 11 projects built on Maven. For more information, see the [Amazon Q documentation](${codeTransformPrereqDoc}).`

export const noPomXmlFoundNotification = `None of your open projects are supported by Amazon Q Code Transformation. Amazon Q could not find a pom.xml file in any of your open projects. Currently, Amazon Q can only upgrade Java 8 or Java 11 projects built on Maven. For more information, see the [Amazon Q documentation](${codeTransformPrereqDoc}).`

export const noJavaHomeFoundChatMessage = `Sorry, I couldn\'t locate your Java installation. For more information, see the [Amazon Q documentation](${codeTransformPrereqDoc}).`

export const dependencyVersionsErrorMessage =
    'I could not find any other versions of this dependency in your local Maven repository. Try transforming the dependency to make it compatible with Java 17, and then try transforming this module again.'

export const errorUploadingWithExpiredUrl = `The upload error may have been caused by the expiration of the S3 pre-signed URL that was used to upload code artifacts to Q Code Transformation. The S3 pre-signed URL expires in 30 minutes. This could be caused by any delays introduced by intermediate services in your network infrastructure. Please investigate your network configuration and consider allowlisting 'amazonq-code-transformation-us-east-1-c6160f047e0.s3.amazonaws.com' to skip any scanning that might delay the upload. For more information, see the [Amazon Q documentation](${codeTransformTroubleshootAllowS3Access}).`

export const socketConnectionFailed =
    'Please check your network connectivity or firewall configuration, and then try again.'

export const selfSignedCertificateError = `This might have been caused by your IDE not trusting the certificate of your HTTP proxy. Ensure all certificates for your proxy client have been configured in your IDE, and then retry transformation. For more information, see the [Amazon Q documentation](${codeTransformTroubleshootConfigureProxy}).`

export const errorStoppingJobChatMessage = "Sorry, I couldn't stop the transformation."

export const errorStoppingJobNotification = 'Amazon Q could not stop the transformation.'

export const errorDownloadingDiffChatMessage = `Sorry, I couldn\'t download the diff with your upgraded code. Please try downloading it again. For more information, see the [Amazon Q documentation](${codeTransformTroubleshootDownloadError}).`

export const errorDownloadingDiffNotification = `Amazon Q could not download the diff with your upgraded code. Please try downloading it again. For more information, see the [Amazon Q documentation](${codeTransformTroubleshootDownloadError}).`

export const errorDownloadingExpiredDiff = `Your transformation is not available anymore. Your code and transformation summary are deleted 24 hours after the transformation completes. Please try starting the transformation again. For more information, see the [Amazon Q documentation](${codeTransformTroubleshootDownloadExpired}).`

export const errorDeserializingDiffChatMessage = `Sorry, I couldn\'t parse the diff with your upgraded code. Please try starting the transformation again. For more information, see the [Amazon Q documentation](${codeTransformTroubleshootDownloadError}).`

export const errorDeserializingDiffNotification = `Amazon Q could not parse the diff with your upgraded code. Please try starting the transformation again. For more information, see the [Amazon Q documentation](${codeTransformTroubleshootDownloadError}).`

export const viewProposedChangesChatMessage =
    'Download complete. You can view a summary of the transformation and accept or reject the proposed changes in the Transformation Hub.'

export const viewProposedChangesNotification =
    'Download complete. You can view a summary of the transformation and accept or reject the proposed changes in the Transformation Hub.'

export const changesAppliedChatMessage = 'I applied the changes to your project.'

export const changesAppliedNotification = 'Amazon Q applied the changes to your project.'

export const noOpenProjectsFoundChatMessage = `Sorry, I couldn\'t find a project that I can upgrade. Currently, I can only upgrade Java 8 or Java 11 projects built on Maven. For more information, see the [Amazon Q documentation](${codeTransformPrereqDoc}).`

export const noJavaProjectsFoundChatMessage = `Sorry, I couldn\'t find a project that I can upgrade. Currently, I can only upgrade Java 8 or Java 11 projects built on Maven. For more information, see the [Amazon Q documentation](${codeTransformPrereqDoc}).`

export const linkToDocsHome = 'https://docs.aws.amazon.com/amazonq/latest/aws-builder-use-ug/code-transformation.html'

export const linkToBillingInfo = 'https://aws.amazon.com/q/developer/pricing/'

export const linkToUploadZipTooLarge =
    'https://docs.aws.amazon.com/amazonq/latest/aws-builder-use-ug/troubleshooting-code-transformation.html#project-size-limit'

export const linkToDownloadZipTooLarge = ''

export const dependencyFolderName = 'transformation_dependencies_temp_'

export const cleanInstallErrorChatMessage = `Sorry, I couldn\'t run the Maven clean install command to build your project. For more information, see the [Amazon Q documentation](${codeTransformTroubleshootMvnFailure}).`

export const cleanInstallErrorNotification = `Amazon Q could not run the Maven clean install command to build your project. For more information, see the [Amazon Q documentation](${codeTransformTroubleshootMvnFailure}).`

export const enterJavaHomeChatMessage = 'Enter the path to JDK '

export const projectPromptChatMessage =
    'I can upgrade your JAVA_VERSION_HERE. To start the transformation, I need some information from you. Choose the project you want to upgrade and the target code version to upgrade to. Then, choose Transform.'

export const windowsJavaHomeHelpChatMessage =
    'To find the JDK path, run the following commands in a new terminal: `cd "C:/Program Files/Java"` and then `dir`. If you see your JDK version, run `cd <version>` and then `cd` to show the path.'

export const macJava8HomeHelpChatMessage =
    'To find the JDK path, run the following command in a new terminal:  `/usr/libexec/java_home -v 1.8`'

export const macJava11HomeHelpChatMessage =
    'To find the JDK path, run the following command in a new terminal:  `/usr/libexec/java_home -v 11`'

export const linuxJavaHomeHelpChatMessage =
    'To find the JDK path, run the following command in a new terminal: `update-java-alternatives --list`'

export const projectSizeTooLargeChatMessage = `Sorry, your project size exceeds the Amazon Q Code Transformation upload limit of 2GB. For more information, see the [Amazon Q documentation](${codeTransformTroubleshootProjectSize}).`

export const projectSizeTooLargeNotification = `Your project size exceeds the Amazon Q Code Transformation upload limit of 2GB. For more information, see the [Amazon Q documentation](${codeTransformTroubleshootProjectSize}).`

export const JDK8VersionNumber = '52'

export const JDK11VersionNumber = '55'

export const chooseProjectFormTitle = 'Choose a project to transform'

export const chooseSourceVersionFormTitle = 'Choose the source code version'

export const chooseTargetVersionFormTitle = 'Choose the target code version'

export const skipUnitTestsFormTitle = 'Choose to skip unit tests'

export const skipUnitTestsFormMessage =
    'I will build your project using `mvn test` by default. If you would like me to build your project without running unit tests, I will use `mvn test-compile`.'

export const runUnitTestsMessage = 'Run unit tests'

export const doNotSkipUnitTestsBuildCommand = 'clean test'

export const skipUnitTestsMessage = 'Skip unit tests'

export const skipUnitTestsBuildCommand = 'clean test-compile'

export const planTitle = 'Code Transformation plan by Amazon Q'

export const planIntroductionMessage =
    'Amazon Q reviewed your code and generated a transformation plan. Amazon Q will suggest code changes according to the plan, and you can review the updated code before accepting changes to your files.'

export const planHeaderMessage = 'Planned transformation changes'

export const planDisclaimerMessage =
    'Amazon Q will use the proposed changes as guidance during the transformation. The final code updates might differ from this plan.'

export const formattedStringMap = new Map([
    ['linesOfCode', 'Lines of code in your application'],
    ['plannedDependencyChanges', 'Dependencies to be replaced'],
    ['plannedDeprecatedApiChanges', 'Deprecated code instances to be replaced'],
    ['plannedFileChanges', 'Files to be changed'],
    ['dependencyName', 'Dependency'],
    ['action', 'Action'],
    ['currentVersion', 'Current version'],
    ['targetVersion', 'Target version'],
    ['relativePath', 'File'],
    ['apiFullyQualifiedName', 'Deprecated code'],
    ['numChangedFiles', 'Files to be changed'],
])

// end of QCT Strings

export enum UserGroup {
    Classifier = 'Classifier',
    CrossFile = 'CrossFile',
    Control = 'Control',
    RightContext = 'RightContext',
}

export const isClassifierEnabledKey = 'CODEWHISPERER_CLASSIFIER_TRIGGER_ENABLED'

export const supplemetalContextFetchingTimeoutMsg = 'Amazon Q supplemental context fetching timeout'

export const codeFixAppliedFailedMessage = 'Failed to apply suggested code fix.'

export const runSecurityScanButtonTitle = 'Run security scan'

export const crossFileContextConfig = {
    numberOfChunkToFetch: 60,
    topK: 3,
    numberOfLinesEachChunk: 50,
}

export const utgConfig = {
    maxSegmentSize: 10200,
}

export enum CodeAnalysisScope {
    FILE = 'FILE',
    PROJECT = 'PROJECT',
}
