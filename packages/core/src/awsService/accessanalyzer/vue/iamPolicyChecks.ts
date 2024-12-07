/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as fs from 'fs' // eslint-disable-line no-restricted-imports
import * as path from 'path'
import { getLogger, Logger } from '../../../shared/logger'
import { localize } from '../../../shared/utilities/vsCodeUtils'
import { VueWebview, VueWebviewPanel } from '../../../webviews/main'
import { ExtContext } from '../../../shared/extensions'
import { telemetry } from '../../../shared/telemetry/telemetry'
import { AccessAnalyzer, SharedIniFileCredentials } from 'aws-sdk'
import { execFileSync } from 'child_process'
import { ToolkitError } from '../../../shared/errors'
import { makeTemporaryToolkitFolder, tryRemoveFolder } from '../../../shared/filesystemUtilities'
import { globals } from '../../../shared'
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
import { DefaultS3Client, parseS3Uri } from '../../../shared/clients/s3Client'
import { ExpiredTokenException } from '@aws-sdk/client-sso-oidc'

const defaultTerraformConfigPath = 'resources/policychecks-tf-default.yaml'
// Diagnostics for Custom checks are shared
export const customPolicyCheckDiagnosticCollection = vscode.languages.createDiagnosticCollection('customPolicyCheck')
export const validatePolicyDiagnosticCollection = vscode.languages.createDiagnosticCollection('validatePolicy')

export interface IamPolicyChecksInitialData {
    checkNoNewAccessFilePath: string
    checkNoNewAccessTextArea: string
    checkAccessNotGrantedFilePath: string
    checkAccessNotGrantedActionsTextArea: string
    checkAccessNotGrantedResourcesTextArea: string
    customChecksFileErrorMessage: string
    cfnParameterPath: string
    pythonToolsInstalled: boolean
}

type PolicyCommandOpts = {
    command: string
    args: string[]
    cfnParameterPathExists: boolean
    documentType: PolicyChecksDocumentType
}

export class IamPolicyChecksWebview extends VueWebview {
    public static readonly sourcePath: string = 'src/awsService/accessanalyzer/vue/index.js'
    public readonly id = 'iamPolicyChecks'
    private static editedDocumentUri: vscode.Uri
    public static editedDocumentFileName: string
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

    public async readCustomChecksJsonFile(path: string): Promise<object> {
        try {
            const rawString = await _readCustomChecksFile(path)
            this.onFileReadError.fire('') // Reset error message display if no error is found
            return JSON.parse(rawString)
        } catch (err: any) {
            if (err instanceof PolicyChecksError && (err.code as PolicyChecksErrorCode) === 'FileReadError') {
                this.onFileReadError.fire(err.message)
            } else if (err instanceof SyntaxError) {
                this.onFileReadError.fire(`JSON Parse Error: ${err.message}`)
            } else {
                this.onFileReadError.fire(`Unexpected Error: ${err.message}`)
            }
        }
        return {}
    }

    public _setActiveTextEditorListener() {
        // Send the current active text editor to Webview to show what is being targeted by the user
        vscode.window.onDidChangeActiveTextEditor((message: any) => {
            const editedFile = vscode.window.activeTextEditor?.document
            if (editedFile !== undefined) {
                IamPolicyChecksWebview.editedDocumentFileName = editedFile.uri.path
                IamPolicyChecksWebview.editedDocument = editedFile.getText()
                IamPolicyChecksWebview.editedDocumentUri = editedFile.uri
                this.onChangeInputPath.fire(editedFile.uri.path)
            }
        })
        vscode.workspace.onDidChangeTextDocument((message: any) => {
            const editedFile = vscode.window.activeTextEditor?.document
            if (editedFile !== undefined) {
                IamPolicyChecksWebview.editedDocument = editedFile.getText()
            }
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
                    telemetry.accessanalyzer_iamPolicyChecksValidatePolicy.run((span) => {
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
                    const command = 'tf-policy-validator'
                    const args = [
                        'validate',
                        '--template-path',
                        `${document}`,
                        '--region',
                        `${this.region}`,
                        '--config',
                        `${globals.context.asAbsolutePath(defaultTerraformConfigPath)}`,
                    ]
                    this.executeValidatePolicyCommand({
                        command,
                        args,
                        cfnParameterPathExists: !!cfnParameterPath,
                        documentType,
                        policyType,
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
            case 'CloudFormation': {
                if (isCloudFormationTemplate(document)) {
                    const command = 'cfn-policy-validator'
                    const args = ['validate', '--template-path', `${document}`, '--region', `${this.region}`]
                    if (cfnParameterPath !== '') {
                        args.push('--template-configuration-file', `${cfnParameterPath}`)
                    }
                    this.executeValidatePolicyCommand({
                        command,
                        args,
                        cfnParameterPathExists: !!cfnParameterPath,
                        documentType,
                        policyType,
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
                    const command = 'tf-policy-validator'
                    const args = [
                        'check-no-new-access',
                        '--template-path',
                        `${document}`,
                        '--region',
                        `${this.region}`,
                        '--config',
                        `${globals.context.asAbsolutePath(defaultTerraformConfigPath)}`,
                        '--reference-policy',
                        `${tempFilePath}`,
                        '--reference-policy-type',
                        `${policyType}`,
                    ]
                    this.executeCustomPolicyChecksCommand({
                        command,
                        args,
                        cfnParameterPathExists: !!cfnParameterPath,
                        documentType,
                        checkType: 'CheckNoNewAccess',
                        referencePolicyType: policyType,
                    })
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
                    const command = 'cfn-policy-validator'
                    const args = [
                        'check-no-new-access',
                        '--template-path',
                        `${document}`,
                        '--region',
                        `${this.region}`,
                        '--reference-policy',
                        `${tempFilePath}`,
                        '--reference-policy-type',
                        `${policyType}`,
                    ]
                    if (cfnParameterPath !== '') {
                        args.push('--template-configuration-file', `${cfnParameterPath}`)
                    }
                    this.executeCustomPolicyChecksCommand({
                        command,
                        args,
                        cfnParameterPathExists: !!cfnParameterPath,
                        documentType,
                        checkType: 'CheckNoNewAccess',
                        referencePolicyType: policyType,
                    })
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
        resources: string,
        cfnParameterPath?: string
    ) {
        const document = IamPolicyChecksWebview.editedDocumentFileName
        customPolicyCheckDiagnosticCollection.clear()
        if (actions !== '') {
            // Remove spaces, line breaks, carriage returns, and tabs
            actions = actions.replace(/\s*|\t|\r|\n/gm, '')
        }
        if (resources !== '') {
            // Remove spaces, line breaks, carriage returns, and tabs
            resources = resources.replace(/\s*|\t|\r|\n/gm, '')
        }
        if (!(actions || resources)) {
            this.onCustomPolicyCheckResponse.fire([
                IamPolicyChecksConstants.MissingActionsOrResourcesError,
                getResultCssColor('Error'),
            ])
            return
        }
        switch (documentType) {
            case 'Terraform Plan': {
                if (isTerraformPlan(document)) {
                    const command = 'tf-policy-validator'
                    const args = [
                        'check-access-not-granted',
                        '--template-path',
                        `${document}`,
                        '--region',
                        `${this.region}`,
                        '--config',
                        `${globals.context.asAbsolutePath(defaultTerraformConfigPath)}`,
                    ]
                    if (actions !== '') {
                        args.push('--actions', `${actions}`)
                    }
                    if (resources !== '') {
                        args.push('--resources', `${resources}`)
                    }
                    this.executeCustomPolicyChecksCommand({
                        command,
                        args,
                        cfnParameterPathExists: !!cfnParameterPath,
                        documentType,
                        checkType: 'CheckAccessNotGranted',
                    })
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
                    const command = 'cfn-policy-validator'
                    const args = [
                        'check-access-not-granted',
                        '--template-path',
                        `${document}`,
                        '--region',
                        `${this.region}`,
                    ]
                    if (actions !== '') {
                        args.push('--actions', `${actions}`)
                    }
                    if (resources !== '') {
                        args.push('--resources', `${resources}`)
                    }
                    if (cfnParameterPath !== '') {
                        args.push('--template-configuration-file', `${cfnParameterPath}`)
                    }
                    this.executeCustomPolicyChecksCommand({
                        command,
                        args,
                        cfnParameterPathExists: !!cfnParameterPath,
                        documentType,
                        checkType: 'CheckAccessNotGranted',
                    })
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

    public async checkNoPublicAccess(documentType: PolicyChecksDocumentType, cfnParameterPath?: string) {
        const document = IamPolicyChecksWebview.editedDocumentFileName
        customPolicyCheckDiagnosticCollection.clear()

        switch (documentType) {
            case 'Terraform Plan': {
                if (isTerraformPlan(document)) {
                    const command = 'tf-policy-validator'
                    const args = [
                        'check-no-public-access',
                        '--template-path',
                        `${document}`,
                        '--region',
                        `${this.region}`,
                        '--config',
                        `${globals.context.asAbsolutePath(defaultTerraformConfigPath)}`,
                    ]
                    this.executeCustomPolicyChecksCommand({
                        command,
                        args,
                        cfnParameterPathExists: !!cfnParameterPath,
                        documentType,
                        checkType: 'CheckNoPublicAccess',
                    })
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
                    const command = 'cfn-policy-validator'
                    const args = [
                        'check-no-public-access',
                        '--template-path',
                        `${document}`,
                        '--region',
                        `${this.region}`,
                    ]
                    if (cfnParameterPath !== '') {
                        args.push('--template-configuration-file', `${cfnParameterPath}`)
                    }
                    this.executeCustomPolicyChecksCommand({
                        command,
                        args,
                        cfnParameterPathExists: !!cfnParameterPath,
                        documentType,
                        checkType: 'CheckNoPublicAccess',
                    })
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

    public executeValidatePolicyCommand(opts: PolicyCommandOpts & { policyType?: PolicyChecksPolicyType }) {
        telemetry.accessanalyzer_iamPolicyChecksValidatePolicy.run((span) => {
            try {
                span.record({
                    cfnParameterFileUsed: opts.cfnParameterPathExists,
                    documentType: opts.documentType,
                    inputPolicyType: opts.policyType ?? 'None',
                })
                const resp = execFileSync(opts.command, opts.args)
                const findingsCount = this.handleValidatePolicyCliResponse(resp.toString())
                span.record({
                    findingsCount: findingsCount,
                })
            } catch (err: any) {
                if (err.status === 2) {
                    // CLI responds with a status code of 2 when findings are discovered
                    const findingsCount = this.handleValidatePolicyCliResponse(err.stdout.toString())
                    span.record({
                        findingsCount: findingsCount,
                    })
                } else {
                    span.record({
                        findingsCount: 0,
                    })
                    this.onValidatePolicyResponse.fire([
                        parseCliErrorMessage(err.message, opts.documentType),
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
        opts: PolicyCommandOpts & { checkType: PolicyChecksCheckType; referencePolicyType?: PolicyChecksPolicyType }
    ) {
        telemetry.accessanalyzer_iamPolicyChecksCustomChecks.run((span) => {
            try {
                span.record({
                    cfnParameterFileUsed: opts.cfnParameterPathExists,
                    checkType: opts.checkType,
                    documentType: opts.documentType,
                    inputPolicyType: 'None', // Note: This will change once JSON policy language is enabled for Custom policy checks
                    referencePolicyType: opts.referencePolicyType ?? 'None',
                })
                const resp = execFileSync(opts.command, opts.args)
                const findingsCount = this.handleCustomPolicyChecksCliResponse(resp.toString())
                span.record({
                    findingsCount: findingsCount,
                })
            } catch (err: any) {
                if (err.status === 2) {
                    // CLI responds with a status code of 2 when findings are discovered
                    const findingsCount = this.handleCustomPolicyChecksCliResponse(err.stdout.toString())
                    span.record({
                        findingsCount: findingsCount,
                    })
                } else {
                    span.record({
                        findingsCount: 0,
                    })
                    this.onCustomPolicyCheckResponse.fire([
                        parseCliErrorMessage(err.message, opts.documentType),
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
        const findingMessage: string = finding.message.includes('existingPolicyDocument')
            ? finding.message.replace('existingPolicyDocument', 'reference document')
            : finding.message
        const message = `${finding.findingType}: ${findingMessage} - Resource name: ${finding.resourceName}, Policy name: ${finding.policyName}`
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

export async function renderIamPolicyChecks(context: ExtContext): Promise<VueWebviewPanel | undefined> {
    const logger: Logger = getLogger()
    try {
        const client = new AccessAnalyzer({ region: context.regionProvider.defaultRegionId })
        // Read from settings to auto-fill some inputs
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
        let checkAccessNotGrantedActionsTextArea: string = ''
        let checkAccessNotGrantedResourcesTextArea: string = ''
        let customChecksFileErrorMessage: string = ''
        try {
            if (checkNoNewAccessFilePath) {
                checkNoNewAccessTextArea = await _readCustomChecksFile(checkNoNewAccessFilePath)
            }
            if (checkAccessNotGrantedFilePath) {
                // Parse JSON into actions & resources here
                const accessJson = JSON.parse(await _readCustomChecksFile(checkAccessNotGrantedFilePath))
                checkAccessNotGrantedActionsTextArea = accessJson.actions || ''
                checkAccessNotGrantedResourcesTextArea = accessJson.resources || ''
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
                checkAccessNotGrantedActionsTextArea,
                checkAccessNotGrantedResourcesTextArea,
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
        return wv
    } catch (err) {
        logger.error(err as Error)
    }
}

// Helper function to get document contents from a path
export async function _readCustomChecksFile(input: string): Promise<string> {
    if (fs.existsSync(input)) {
        return fs.readFileSync(input).toString()
    } else {
        try {
            const [region, bucket, key] = parseS3Uri(input)
            const s3Client = new DefaultS3Client(region)
            const resp = await s3Client.getObject({ bucketName: bucket, key })
            // Lint warning: this may evaluate to '[object Object]'. @typescript-eslint/no-base-to-string
            // eslint-disable-next-line @typescript-eslint/no-base-to-string
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

// Check if Cfn and Tf tools are installed
export function arePythonToolsInstalled(): boolean {
    const logger: Logger = getLogger()
    let cfnToolInstalled = true
    let tfToolInstalled = true
    try {
        execFileSync('tf-policy-validator')
    } catch (err: any) {
        if (isProcessNotFoundErr(err.message)) {
            tfToolInstalled = false
            logger.error('Terraform Policy Validator is not found')
        }
    }
    try {
        execFileSync('cfn-policy-validator')
    } catch (err: any) {
        if (isProcessNotFoundErr(err.message)) {
            cfnToolInstalled = false
            logger.error('Cloudformation Policy Validator is not found')
        }
    }
    return cfnToolInstalled && tfToolInstalled
}

export function isProcessNotFoundErr(errMsg: string) {
    return errMsg.includes('command not found') || errMsg.includes('ENOENT')
}

// Since TypeScript can only get the CLI tool's error output as a string, we have to parse and sanitize it ourselves
export function parseCliErrorMessage(message: string, documentType: PolicyChecksDocumentType): string {
    const cfnMatch = message.match(/ERROR: .*/)
    const botoMatch = message.match(/(?<=botocore\.exceptions\.).*/) // Boto errors have a special match
    const terraformMatch = message.match(/AttributeError:.*/) // Terraform CLI responds with a different error schema... this catches invalid .json plans
    if (
        message.includes('The security token included in the request is invalid') ||
        message.includes('The security token included in the request is expired')
    ) {
        return IamPolicyChecksConstants.InvalidAwsCredentials
    } else if (message.includes(`Unexpected error occurred. 'AccessAnalyzer' object has no attribute 'check`)) {
        return 'ERROR: The dependencies of the Python CLI tools are outdated.'
    } else if (cfnMatch?.[0]) {
        return cfnMatch[0]
    } else if (botoMatch?.[0]) {
        return botoMatch[0]
    } else if (isProcessNotFoundErr(message)) {
        return `Command not found, please install the ${documentType} Python CLI tool`
    } else if (terraformMatch?.[0]) {
        return 'ERROR: Unable to parse Terraform plan. Invalid Terraform plan schema detected.'
    } else if (message.includes('Unexpected end of JSON input')) {
        return 'ERROR: Unexpected input. Please enter a list of AWS actions, separated by commas.'
    }
    return message
}

export function getCheckNoNewAccessErrorMessage(finding: any) {
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

export function getResultCssColor(resultType: PolicyChecksResult): string {
    switch (resultType) {
        case 'Success':
            return 'var(--vscode-terminal-ansiGreen)'
        case 'Warning':
            return 'var(--vscode-debugConsole-warningForeground)'
        case 'Error':
            return 'var(--vscode-errorForeground)'
    }
}

export function isCloudFormationTemplate(document: string): boolean {
    const cfnFileTypes = ['.yaml', '.yml', '.json']
    return cfnFileTypes.some((t) => document.endsWith(t))
}

export function isTerraformPlan(document: string) {
    const terraformPlanFileTypes = ['.json']
    return terraformPlanFileTypes.some((t) => document.endsWith(t))
}

export function isJsonPolicyLanguage(document: string) {
    const policyLanguageFileTypes = ['.json']
    return policyLanguageFileTypes.some((t) => document.endsWith(t))
}

export class PolicyChecksError extends ToolkitError {
    constructor(message: string, code: PolicyChecksErrorCode) {
        super(message, { code })
    }
}
