/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { getLogger, Logger } from '../../shared/logger'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { VueWebview } from '../../webviews/main'
import { ExtContext } from '../../shared/extensions'
import { telemetry } from '../../shared/telemetry/telemetry'
import { AccessAnalyzer, SharedIniFileCredentials } from 'aws-sdk'
import { execSync } from 'child_process'
import { ToolkitError } from '../../shared/errors'
import { makeTemporaryToolkitFolder, tryRemoveFolder } from '../../shared/filesystemUtilities'
import { globals } from '../../shared'
import {
    IamPolicyChecksConstants,
    PolicyChecksCheckType,
    PolicyChecksDocumentType,
    PolicyChecksErrorCode,
    PolicyChecksPolicyType,
    PolicyChecksResult,
    PolicyChecksUiClick,
    ValidatePolicyFindingType,
} from './constants'
import { DefaultS3Client, parseS3Uri } from '../../shared/clients/s3Client'
import { ExpiredTokenException } from '@aws-sdk/client-sso-oidc'

const defaultTerraformConfigPath = 'resources/policychecks-tf-default.yaml'
// Diagnostics for Custom checks are shared
const customPolicyCheckDiagnosticCollection = vscode.languages.createDiagnosticCollection('customPolicyCheck')
const validatePolicyDiagnosticCollection = vscode.languages.createDiagnosticCollection('validatePolicy')

export interface IamPolicyChecksInitialData {
    checkNoNewAccessFilePath: string
    checkNoNewAccessTextArea: string
    checkAccessNotGrantedFilePath: string
    checkAccessNotGrantedTextArea: string
    customChecksFileErrorMessage: string
    cfnParameterPath: string
    pythonToolsInstalled: boolean
}

export class IamPolicyChecksWebview extends VueWebview {
    public static readonly sourcePath: string = 'src/accessanalyzer/vue/index.js'
    public readonly id = 'iamPolicyChecks'
    private static editedDocumentUri: vscode.Uri
    private static editedDocumentFileName: string
    private static editedDocument: string

    public constructor(
        private readonly data: IamPolicyChecksInitialData,
        private client: AccessAnalyzer,
        private readonly region: string,
        public readonly onChangeInputPath = new vscode.EventEmitter<string>(),
        public readonly onChangeCheckNoNewAccessFilePath = new vscode.EventEmitter<string>(),
        public readonly onChangeCheckAccessNotGrantedFilePath = new vscode.EventEmitter<string>(),
        public readonly onChangeCloudformationParameterFilePath = new vscode.EventEmitter<string>(),
        public readonly onValidatePolicyResponse = new vscode.EventEmitter<[string, string]>(),
        public readonly onCustomPolicyCheckResponse = new vscode.EventEmitter<[string, string]>(),
        public readonly onFileReadError = new vscode.EventEmitter<string>()
    ) {
        super(IamPolicyChecksWebview.sourcePath)
        this._setActiveTextEditorListener()
        this._setActiveConfigurationListener()
        if (vscode.window.activeTextEditor) {
            IamPolicyChecksWebview.editedDocumentFileName = vscode.window.activeTextEditor.document.uri.path
            IamPolicyChecksWebview.editedDocument = vscode.window.activeTextEditor.document.getText()
            IamPolicyChecksWebview.editedDocumentUri = vscode.window.activeTextEditor.document.uri
        }
    }

    public init(): typeof this.data {
        return this.data
    }

    public async readCustomChecksFile(path: string): Promise<string> {
        try {
            const customChecksTextArea = await _readCustomChecksFile(path)
            this.onFileReadError.fire('') // Reset error message display if no error is found
            return customChecksTextArea
        } catch (err: any) {
            if (err instanceof PolicyChecksError && (err.code as PolicyChecksErrorCode) === 'FileReadError') {
                this.onFileReadError.fire(err.message)
            }
            return ''
        }
    }

    public _setActiveTextEditorListener() {
        // Send the current active text editor to Webview to show what is being targeted by the user
        vscode.window.onDidChangeActiveTextEditor((message: any) => {
            const editedFile = vscode.window.activeTextEditor?.document
            IamPolicyChecksWebview.editedDocumentFileName = editedFile!.uri.path
            IamPolicyChecksWebview.editedDocument = editedFile!.getText()
            IamPolicyChecksWebview.editedDocumentUri = editedFile!.uri
            this.onChangeInputPath.fire(editedFile!.uri.path)
        })
        vscode.workspace.onDidChangeTextDocument((message: any) => {
            const editedFile = vscode.window.activeTextEditor?.document
            IamPolicyChecksWebview.editedDocument = editedFile!.getText()
        })
    }

    public _setActiveConfigurationListener() {
        vscode.workspace.onDidChangeConfiguration((config: vscode.ConfigurationChangeEvent) => {
            // If settings change, we want to update the Webview to reflect the change in inputs
            if (config.affectsConfiguration(IamPolicyChecksConstants.CheckNoNewAccessFilePathSetting)) {
                this.onChangeCheckNoNewAccessFilePath.fire(
                    vscode.workspace.getConfiguration().get(IamPolicyChecksConstants.CheckNoNewAccessFilePathSetting)!
                )
            } else if (config.affectsConfiguration(IamPolicyChecksConstants.CheckAccessNotGrantedFilePathSetting)) {
                this.onChangeCheckAccessNotGrantedFilePath.fire(
                    vscode.workspace
                        .getConfiguration()
                        .get(IamPolicyChecksConstants.CheckAccessNotGrantedFilePathSetting)!
                )
            } else if (config.affectsConfiguration(IamPolicyChecksConstants.CfnParameterFilePathSetting)) {
                this.onChangeCloudformationParameterFilePath.fire(
                    vscode.workspace.getConfiguration().get(IamPolicyChecksConstants.CfnParameterFilePathSetting)!
                )
            }
        })
    }

    public emitUiClick(elementId: PolicyChecksUiClick) {
        telemetry.ui_click.emit({ elementId })
    }

    /* Uses A2 SDK and Python CLI tools to call ValidatePolicy API
     * Responses are exposed in the Webview, including errors
     * Diagnostic objects are created to expose findings, which appear in the problems panel
     */
    public async validatePolicy(
        documentType: PolicyChecksDocumentType,
        policyType: PolicyChecksPolicyType,
        cfnParameterPath?: string
    ) {
        const document = IamPolicyChecksWebview.editedDocumentFileName
        validatePolicyDiagnosticCollection.clear()
        const diagnostics: vscode.Diagnostic[] = []
        switch (documentType) {
            case 'JSON Policy Language': {
                if (isJsonPolicyLanguage(document)) {
                    telemetry.accessanalyzer_iamPolicyChecksValidatePolicy.run(span => {
                        span.record({
                            documentType,
                            inputPolicyType: policyType ? policyType : 'None',
                        })
                        this.client.config.credentials = new SharedIniFileCredentials() // We need to detect changes in the user's credentials
                        this.client.validatePolicy(
                            {
                                policyDocument: IamPolicyChecksWebview.editedDocument,
                                policyType: policyType === 'Identity' ? 'IDENTITY_POLICY' : 'RESOURCE_POLICY',
                            },
                            (err, data) => {
                                if (err) {
                                    span.record({
                                        findingsCount: 0,
                                    })
                                    if (err instanceof ExpiredTokenException) {
                                        this.onValidatePolicyResponse.fire([
                                            IamPolicyChecksConstants.InvalidAwsCredentials,
                                            getResultCssColor('Error'),
                                        ])
                                    } else {
                                        this.onValidatePolicyResponse.fire([err.message, getResultCssColor('Error')])
                                    }
                                } else {
                                    if (data.findings.length > 0) {
                                        span.record({
                                            findingsCount: data.findings.length,
                                        })
                                        data.findings.forEach((finding: AccessAnalyzer.ValidatePolicyFinding) => {
                                            const message = `${finding.findingType}: ${finding.issueCode} - ${finding.findingDetails} Learn more: ${finding.learnMoreLink}`
                                            if ((finding.findingType as ValidatePolicyFindingType) === 'ERROR') {
                                                diagnostics.push(
                                                    new vscode.Diagnostic(
                                                        new vscode.Range(
                                                            finding.locations[0].span.start.line,
                                                            finding.locations[0].span.start.offset,
                                                            finding.locations[0].span.end.line,
                                                            finding.locations[0].span.end.offset
                                                        ),
                                                        message,
                                                        vscode.DiagnosticSeverity.Error
                                                    )
                                                )
                                                validatePolicyDiagnosticCollection.set(
                                                    IamPolicyChecksWebview.editedDocumentUri,
                                                    diagnostics
                                                )
                                            } else {
                                                diagnostics.push(
                                                    new vscode.Diagnostic(
                                                        new vscode.Range(
                                                            finding.locations[0].span.start.line,
                                                            finding.locations[0].span.start.offset,
                                                            finding.locations[0].span.end.line,
                                                            finding.locations[0].span.end.offset
                                                        ),
                                                        message,
                                                        vscode.DiagnosticSeverity.Warning
                                                    )
                                                )
                                                validatePolicyDiagnosticCollection.set(
                                                    IamPolicyChecksWebview.editedDocumentUri,
                                                    diagnostics
                                                )
                                            }
                                        })
                                        this.onValidatePolicyResponse.fire([
                                            IamPolicyChecksConstants.ValidatePolicySuccessWithFindings,
                                            getResultCssColor('Warning'),
                                        ])
                                        void vscode.commands.executeCommand('workbench.actions.view.problems')
                                    } else {
                                        this.onValidatePolicyResponse.fire([
                                            IamPolicyChecksConstants.ValidatePolicySuccessNoFindings,
                                            getResultCssColor('Success'),
                                        ])
                                    }
                                }
                            }
                        )
                    })
                    return
                } else {
                    this.onValidatePolicyResponse.fire([
                        IamPolicyChecksConstants.IncorrectFileExtension,
                        getResultCssColor('Error'),
                    ])
                    return
                }
            }
            case 'Terraform Plan': {
                if (isTerraformPlan(document)) {
                    const tfCommand = `tf-policy-validator validate --template-path ${document} --region ${
                        this.region
                    } --config ${globals.context.asAbsolutePath(defaultTerraformConfigPath)}`
                    this.executeValidatePolicyCommand(
                        tfCommand,
                        cfnParameterPath ? true : false,
                        documentType,
                        policyType
                    )
                    return
                } else {
                    this.onValidatePolicyResponse.fire([
                        IamPolicyChecksConstants.IncorrectFileExtension,
                        getResultCssColor('Error'),
                    ])
                    return
                }
            }
            case 'CloudFormation': {
                if (isCloudFormationTemplate(document)) {
                    const cfnCommand =
                        cfnParameterPath === ''
                            ? `cfn-policy-validator validate --template-path ${document} --region ${this.region}`
                            : `cfn-policy-validator validate --template-path ${document} --region ${this.region} --template-configuration-file ${cfnParameterPath}`
                    this.executeValidatePolicyCommand(
                        cfnCommand,
                        cfnParameterPath ? true : false,
                        documentType,
                        policyType
                    )
                    return
                } else {
                    this.onValidatePolicyResponse.fire([
                        IamPolicyChecksConstants.IncorrectFileExtension,
                        getResultCssColor('Error'),
                    ])
                    return
                }
            }
        }
    }

    public async checkNoNewAccess(
        documentType: PolicyChecksDocumentType,
        policyType: PolicyChecksPolicyType,
        referenceDocument: string,
        cfnParameterPath?: string
    ) {
        const tempFolder = await makeTemporaryToolkitFolder()
        const tempFilePath = path.join(tempFolder, 'policyChecksDocument')

        const document = IamPolicyChecksWebview.editedDocumentFileName
        customPolicyCheckDiagnosticCollection.clear()
        if (referenceDocument !== '') {
            fs.writeFileSync(tempFilePath, referenceDocument)
        } else {
            this.onCustomPolicyCheckResponse.fire([
                IamPolicyChecksConstants.MissingReferenceDocError,
                getResultCssColor('Error'),
            ])
            return
        }

        switch (documentType) {
            case 'Terraform Plan': {
                if (isTerraformPlan(document)) {
                    const tfCommand = `tf-policy-validator check-no-new-access --template-path ${document} --region ${
                        this.region
                    } --config ${globals.context.asAbsolutePath(
                        defaultTerraformConfigPath
                    )} --reference-policy ${tempFilePath} --reference-policy-type ${policyType}`
                    this.executeCustomPolicyChecksCommand(
                        tfCommand,
                        cfnParameterPath ? true : false,
                        documentType,
                        'CheckNoNewAccess',
                        policyType
                    )
                    return
                } else {
                    this.onCustomPolicyCheckResponse.fire([
                        IamPolicyChecksConstants.IncorrectFileExtension,
                        getResultCssColor('Error'),
                    ])
                    return
                }
            }
            case 'CloudFormation': {
                if (isCloudFormationTemplate(document)) {
                    const cfnCommand =
                        cfnParameterPath === ''
                            ? `cfn-policy-validator check-no-new-access --template-path ${document} --region ${this.region} --reference-policy ${tempFilePath} --reference-policy-type ${policyType}`
                            : `cfn-policy-validator check-no-new-access --template-path ${document} --region ${this.region} --reference-policy ${tempFilePath} --reference-policy-type ${policyType} --template-configuration-file ${cfnParameterPath}`
                    this.executeCustomPolicyChecksCommand(
                        cfnCommand,
                        cfnParameterPath ? true : false,
                        documentType,
                        'CheckNoNewAccess',
                        policyType
                    )
                    return
                } else {
                    this.onCustomPolicyCheckResponse.fire([
                        IamPolicyChecksConstants.IncorrectFileExtension,
                        getResultCssColor('Error'),
                    ])
                    return
                }
            }
        }
        await tryRemoveFolder(tempFolder)
    }

    public async checkAccessNotGranted(
        documentType: PolicyChecksDocumentType,
        actions: string,
        cfnParameterPath?: string
    ) {
        const document = IamPolicyChecksWebview.editedDocumentFileName
        customPolicyCheckDiagnosticCollection.clear()
        if (actions !== '') {
            // Remove spaces, line breaks, carriage returns, and tabs
            actions = actions.replace(/\s*|\t|\r|\n/gm, '')
        } else {
            this.onCustomPolicyCheckResponse.fire([
                IamPolicyChecksConstants.MissingReferenceDocError,
                getResultCssColor('Error'),
            ])
            return
        }
        switch (documentType) {
            case 'Terraform Plan': {
                if (isTerraformPlan(document)) {
                    const tfCommand = `tf-policy-validator check-access-not-granted --template-path ${document} --region ${
                        this.region
                    } --config ${globals.context.asAbsolutePath(defaultTerraformConfigPath)} --actions ${actions}`
                    this.executeCustomPolicyChecksCommand(
                        tfCommand,
                        cfnParameterPath ? true : false,
                        documentType,
                        'CheckAccessNotGranted'
                    )
                    return
                } else {
                    this.onCustomPolicyCheckResponse.fire([
                        IamPolicyChecksConstants.IncorrectFileExtension,
                        getResultCssColor('Error'),
                    ])
                    return
                }
            }
            case 'CloudFormation': {
                if (isCloudFormationTemplate(document)) {
                    const cfnCommand =
                        cfnParameterPath === ''
                            ? `cfn-policy-validator check-access-not-granted --template-path ${document} --region ${this.region} --actions ${actions}`
                            : `cfn-policy-validator check-access-not-granted --template-path ${document} --region ${this.region} --actions ${actions} --template-copnfiguration-file ${cfnParameterPath}`
                    this.executeCustomPolicyChecksCommand(
                        cfnCommand,
                        cfnParameterPath ? true : false,
                        documentType,
                        'CheckAccessNotGranted'
                    )
                    return
                } else {
                    this.onCustomPolicyCheckResponse.fire([
                        IamPolicyChecksConstants.IncorrectFileExtension,
                        getResultCssColor('Error'),
                    ])
                    return
                }
            }
        }
    }

    public executeValidatePolicyCommand(
        command: string,
        cfnParameterPathExists: boolean,
        documentType: PolicyChecksDocumentType,
        policyType?: PolicyChecksPolicyType
    ) {
        telemetry.accessanalyzer_iamPolicyChecksValidatePolicy.run(span => {
            try {
                span.record({
                    cfnParameterFileUsed: cfnParameterPathExists,
                    documentType: documentType,
                    inputPolicyType: policyType ? policyType : 'None',
                })
                const resp = execSync(command)
                const findingsCount = this.handleValidatePolicyCliResponse(resp.toString())
                span.record({
                    findingsCount: findingsCount,
                })
            } catch (err: any) {
                if (err.status === 2) {
                    //CLI responds with a status code of 2 when findings are discovered
                    const findingsCount = this.handleValidatePolicyCliResponse(err.stdout.toString())
                    span.record({
                        findingsCount: findingsCount,
                    })
                } else {
                    span.record({
                        findingsCount: 0,
                    })
                    this.onValidatePolicyResponse.fire([
                        parseCliErrorMessage(err.message, documentType),
                        getResultCssColor('Error'),
                    ])
                }
            }
        })
    }

    public handleValidatePolicyCliResponse(response: string): number {
        let findingsCount = 0
        const diagnostics: vscode.Diagnostic[] = []
        const jsonOutput = JSON.parse(response)
        if (jsonOutput.BlockingFindings.length === 0 && jsonOutput.NonBlockingFindings.length === 0) {
            this.onValidatePolicyResponse.fire([
                IamPolicyChecksConstants.ValidatePolicySuccessNoFindings,
                getResultCssColor('Success'),
            ])
        } else {
            jsonOutput.BlockingFindings.forEach((finding: any) => {
                this.pushValidatePolicyDiagnostic(diagnostics, finding, true)
                findingsCount++
            })
            jsonOutput.NonBlockingFindings.forEach((finding: any) => {
                this.pushValidatePolicyDiagnostic(diagnostics, finding, false)
                findingsCount++
            })
            this.onValidatePolicyResponse.fire([
                IamPolicyChecksConstants.ValidatePolicySuccessWithFindings,
                getResultCssColor('Warning'),
            ])
            void vscode.commands.executeCommand('workbench.actions.view.problems')
        }
        return findingsCount
    }

    public executeCustomPolicyChecksCommand(
        command: string,
        cfnParameterPathExists: boolean,
        documentType: PolicyChecksDocumentType,
        checkType: PolicyChecksCheckType,
        referencePolicyType?: PolicyChecksPolicyType
    ) {
        telemetry.accessanalyzer_iamPolicyChecksCustomChecks.run(span => {
            try {
                span.record({
                    cfnParameterFileUsed: cfnParameterPathExists,
                    checkType: checkType,
                    documentType: documentType,
                    inputPolicyType: 'None', // Note: This will change once JSON policy language is enabled for Custom policy checks
                    referencePolicyType: referencePolicyType ? referencePolicyType : 'None',
                })
                const resp = execSync(command)
                const findingsCount = this.handleCustomPolicyChecksCliResponse(resp.toString())
                span.record({
                    findingsCount: findingsCount,
                })
            } catch (err: any) {
                if (err.status === 2) {
                    //CLI responds with a status code of 2 when findings are discovered
                    const findingsCount = this.handleCustomPolicyChecksCliResponse(err.stdout.toString())
                    span.record({
                        findingsCount: findingsCount,
                    })
                } else {
                    span.record({
                        findingsCount: 0,
                    })
                    this.onCustomPolicyCheckResponse.fire([
                        parseCliErrorMessage(err.message, documentType),
                        getResultCssColor('Error'),
                    ])
                }
            }
        })
    }

    public handleCustomPolicyChecksCliResponse(response: string): number {
        let findingsCount = 0
        let errorMessage: string | undefined
        const diagnostics: vscode.Diagnostic[] = []
        try {
            const jsonOutput = JSON.parse(response)
            if (jsonOutput.BlockingFindings.length === 0 && jsonOutput.NonBlockingFindings.length === 0) {
                this.onCustomPolicyCheckResponse.fire([
                    IamPolicyChecksConstants.CustomCheckSuccessNoFindings,
                    getResultCssColor('Success'),
                ])
            } else {
                jsonOutput.BlockingFindings.forEach((finding: any) => {
                    this.pushCustomCheckDiagnostic(diagnostics, finding, true)
                    errorMessage = getCheckNoNewAccessErrorMessage(finding)
                    findingsCount++
                })
                jsonOutput.NonBlockingFindings.forEach((finding: any) => {
                    this.pushCustomCheckDiagnostic(diagnostics, finding, false)
                    findingsCount++
                })
                if (errorMessage) {
                    this.onCustomPolicyCheckResponse.fire([errorMessage, getResultCssColor('Error')])
                } else {
                    this.onCustomPolicyCheckResponse.fire([
                        IamPolicyChecksConstants.CustomCheckSuccessWithFindings,
                        getResultCssColor('Warning'),
                    ])
                }
                void vscode.commands.executeCommand('workbench.actions.view.problems')
            }
        } catch (err: any) {
            this.onCustomPolicyCheckResponse.fire([err.message, getResultCssColor('Error')])
        }
        return findingsCount
    }

    public pushValidatePolicyDiagnostic(diagnostics: vscode.Diagnostic[], finding: any, isBlocking: boolean) {
        diagnostics.push(
            new vscode.Diagnostic(
                new vscode.Range(0, 0, 0, 0),
                `${finding.findingType}: ${finding.code} - ${finding.details.findingDetails} Resource name: ${finding.resourceName}, Policy name: ${finding.policyName}. Learn more: ${finding.details.learnMoreLink}`,
                isBlocking ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning
            )
        )
        validatePolicyDiagnosticCollection.set(IamPolicyChecksWebview.editedDocumentUri, diagnostics)
    }

    public pushCustomCheckDiagnostic(diagnostics: vscode.Diagnostic[], finding: any, isBlocking: boolean) {
        const message = `${finding.findingType}: ${finding.message} - Resource name: ${finding.resourceName}, Policy name: ${finding.policyName}`
        if (message.includes('existingPolicyDocument')) {
            message.replace('existingPolicyDocument', 'reference document')
        }
        if (finding.details.reasons) {
            finding.details.reasons.forEach((reason: any) => {
                diagnostics.push(
                    new vscode.Diagnostic(
                        new vscode.Range(0, 0, 0, 0),
                        message + ` - ${reason.description}`,
                        isBlocking ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning
                    )
                )
            })
        } else {
            diagnostics.push(
                new vscode.Diagnostic(
                    new vscode.Range(0, 0, 0, 0),
                    message,
                    isBlocking ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning
                )
            )
        }
        customPolicyCheckDiagnosticCollection.set(IamPolicyChecksWebview.editedDocumentUri, diagnostics)
    }
}

const Panel = VueWebview.compilePanel(IamPolicyChecksWebview)

export async function renderIamPolicyChecks(context: ExtContext): Promise<void> {
    const logger: Logger = getLogger()
    try {
        const client = new AccessAnalyzer({ region: context.regionProvider.defaultRegionId })
        //Read from settings to auto-fill some inputs
        const checkNoNewAccessFilePath: string = vscode.workspace
            .getConfiguration()
            .get(IamPolicyChecksConstants.CheckNoNewAccessFilePathSetting)!
        const checkAccessNotGrantedFilePath: string = vscode.workspace
            .getConfiguration()
            .get(IamPolicyChecksConstants.CheckAccessNotGrantedFilePathSetting)!
        const cfnParameterPath: string = vscode.workspace
            .getConfiguration()
            .get(IamPolicyChecksConstants.CfnParameterFilePathSetting)!
        let checkNoNewAccessTextArea: string = ''
        let checkAccessNotGrantedTextArea: string = ''
        let customChecksFileErrorMessage: string = ''
        try {
            if (checkNoNewAccessFilePath) {
                checkNoNewAccessTextArea = await _readCustomChecksFile(checkNoNewAccessFilePath)
            }
            if (checkAccessNotGrantedFilePath) {
                checkAccessNotGrantedTextArea = await _readCustomChecksFile(checkAccessNotGrantedFilePath)
            }
        } catch (err: any) {
            customChecksFileErrorMessage = err.message
        }

        const wv = new Panel(
            context.extensionContext,
            {
                checkNoNewAccessFilePath: checkNoNewAccessFilePath ? checkNoNewAccessFilePath : '',
                checkNoNewAccessTextArea,
                checkAccessNotGrantedFilePath: checkAccessNotGrantedFilePath ? checkAccessNotGrantedFilePath : '',
                checkAccessNotGrantedTextArea,
                customChecksFileErrorMessage,
                cfnParameterPath: cfnParameterPath ? cfnParameterPath : '',
                pythonToolsInstalled: arePythonToolsInstalled(),
            },
            client,
            context.regionProvider.defaultRegionId
        )
        await wv.show({
            viewColumn: vscode.ViewColumn.Beside,
            title: localize('AWS.iamPolicyChecks.title', 'IAM Policy Checks'),
        })
    } catch (err) {
        logger.error(err as Error)
    }
}

// Helper function to get document contents from a path
async function _readCustomChecksFile(input: string): Promise<string> {
    if (fs.existsSync(input)) {
        return fs.readFileSync(input).toString()
    } else {
        try {
            const [region, bucket, key] = parseS3Uri(input)
            const s3Client = new DefaultS3Client(region)
            const resp = await s3Client.getObject({ bucketName: bucket, key })
            return resp.objectBody.toString()
        } catch (e: any) {
            if (e.message.includes('Invalid S3 URI')) {
                throw new PolicyChecksError('Invalid file path or S3 URI', 'FileReadError')
            } else {
                throw new PolicyChecksError(e.message, 'FileReadError')
            }
        }
    }
}

//Check if Cfn and Tf tools are installed
function arePythonToolsInstalled(): boolean {
    const logger: Logger = getLogger()
    let cfnToolInstalled = true
    let tfToolInstalled = true
    try {
        execSync('tf-policy-validator')
    } catch (err: any) {
        if (err.message.includes('command not found')) {
            tfToolInstalled = false
            logger.error('Terraform Policy Validator is not found')
        }
    }
    try {
        execSync('cfn-policy-validator')
    } catch (err: any) {
        if (err.message.includes('command not found')) {
            cfnToolInstalled = false
            logger.error('Cloudformation Policy Validator is not found')
        }
    }
    return cfnToolInstalled && tfToolInstalled
}

// Since TypeScript can only get the CLI tool's error output as a string, we have to parse and sanitize it ourselves
function parseCliErrorMessage(message: string, documentType: PolicyChecksDocumentType): string {
    const cfnMatch = message.match(/ERROR: .*/)
    const botoMatch = message.match(/(?<=botocore\.exceptions\.).*/) // Boto errors have a special match
    const terraformMatch = message.match(/AttributeError:.*/) // Terraform CLI responds with a different error schema... this catches invalid .json plans
    if (
        message.includes('The security token included in the request is invalid') ||
        message.includes('The security token included in the request is expired')
    ) {
        return IamPolicyChecksConstants.InvalidAwsCredentials
    } else if (
        message.includes(
            `Unexpected error occurred. 'AccessAnalyzer' object has no attribute 'check_access_not_granted'`
        )
    ) {
        return 'ERROR: The dependencies of the Python CLI tools are outdated.'
    } else if (cfnMatch?.[0]) {
        return cfnMatch[0]
    } else if (botoMatch?.[0]) {
        return botoMatch[0]
    } else if (message.includes('command not found')) {
        return `Command not found, please install the ${documentType} Python CLI tool`
    } else if (terraformMatch?.[0]) {
        return 'ERROR: Unable to parse Terraform plan. Invalid Terraform plan schema detected.'
    } else if (message.includes('Unexpected end of JSON input')) {
        return 'ERROR: Unexpected input. Please enter a list of AWS actions, separated by commas.'
    }
    return message
}

function getCheckNoNewAccessErrorMessage(finding: any) {
    if (finding.findingType === 'ERROR') {
        if (
            finding.message.includes(
                'The policy in existingPolicyDocument is invalid. Principal is a prohibited policy element.'
            )
        ) {
            return "ERROR: The policy in reference document is invalid. Principal is a prohibited policy element. Review the reference document's policy type and try again."
        }
    }
}

function getResultCssColor(resultType: PolicyChecksResult): string {
    switch (resultType) {
        case 'Success':
            return 'var(--vscode-terminal-ansiGreen)'
        case 'Warning':
            return 'var(--vscode-debugConsole-warningForeground)'
        case 'Error':
            return 'var(--vscode-errorForeground)'
    }
}

function isCloudFormationTemplate(document: string): boolean {
    if (document.endsWith('.yaml') || document.endsWith('.yml') || document.endsWith('.json')) {
        return true
    } else {
        return false
    }
}

function isTerraformPlan(document: string) {
    if (document.endsWith('.json')) {
        return true
    } else {
        return false
    }
}

function isJsonPolicyLanguage(document: string) {
    if (document.endsWith('.json')) {
        return true
    } else {
        return false
    }
}

export class PolicyChecksError extends ToolkitError {
    constructor(message: string, code: PolicyChecksErrorCode) {
        super(message, { code })
    }
}
