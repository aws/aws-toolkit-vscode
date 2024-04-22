/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as fs from 'fs'
import { getLogger, Logger } from '../../shared/logger'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { VueWebview } from '../../webviews/main'
import { ExtContext } from '../../shared/extensions'
//import { telemetry } from '../../shared/telemetry/telemetry'
import { AccessAnalyzer, S3 } from 'aws-sdk'
import { exec } from 'child_process'
const AmazonS3URI = require('amazon-s3-uri')

export interface IamPolicyChecksInitialData {
    referenceFilePath: string
    cfnParameterPath: string
    referenceDocument: string
    pythonToolsInstalled: boolean
}

export class IamPolicyChecksWebview extends VueWebview {
    public static readonly sourcePath: string = 'src/accessanalyzer/vue/index.js'
    public readonly id = 'iamPolicyChecks'

    //private readonly logger = getLogger()

    public constructor(
        private readonly data: IamPolicyChecksInitialData,
        private readonly client: AccessAnalyzer,
        public readonly onChangeInputPath = new vscode.EventEmitter<string>(),
        public readonly onChangeReferenceFilePath = new vscode.EventEmitter<string>(),
        public readonly onChangeCloudformationParameterFilePath = new vscode.EventEmitter<string>()
    ) {
        super(IamPolicyChecksWebview.sourcePath)
        this._setActiveTextEditorListener()
        this._setActiveConfigurationListener()
    }

    public init(): typeof this.data {
        return this.data
    }

    public async getReferenceDocument(path: string): Promise<string> {
        return _getReferenceDocument(path)
    }

    public _setActiveTextEditorListener() {
        // Send the current active text editor to Webview to show what is being targeted by the user
        vscode.window.onDidChangeActiveTextEditor((message: any) => {
            const editedFile = vscode.window.activeTextEditor?.document
            this.onChangeInputPath.fire(editedFile!.uri.path)
        })
    }
    public _setActiveConfigurationListener() {
        vscode.workspace.onDidChangeConfiguration((config: vscode.ConfigurationChangeEvent) => {
            // If settings change, we want to update the Webview to reflect the change in inputs
            if (config.affectsConfiguration('aws.accessAnalyzer.policyChecks.referencePolicyFilePath')) {
                this.onChangeReferenceFilePath.fire(
                    vscode.workspace.getConfiguration().get('aws.accessAnalyzer.policyChecks.referencePolicyFilePath')!
                )
            } else if (config.affectsConfiguration('aws.accessAnalyzer.policyChecks.cloudFormationParameterFilePath')) {
                this.onChangeCloudformationParameterFilePath.fire(
                    vscode.workspace
                        .getConfiguration()
                        .get('aws.accessAnalyzer.policyChecks.cloudFormationParameterFilePath')!
                )
            }
        })
    }

    // TODO: Add functionality for the three checks
    public async validatePolicy(documentType: string, policyType: string) {
        this.client /* Do something */
    }
    public async checkNoNewAccess() {}
    public async checkAccessNotGranted() {}
}

const Panel = VueWebview.compilePanel(IamPolicyChecksWebview)

export async function renderIamPolicyChecks(context: ExtContext): Promise<void> {
    const logger: Logger = getLogger()
    try {
        const client = new AccessAnalyzer({ region: context.regionProvider.defaultRegionId })
        //Read from settings to auto-fill some inputs
        const referencePolicyFilePath: string = vscode.workspace
            .getConfiguration()
            .get('aws.accessAnalyzer.policyChecks.referencePolicyFilePath')!
        const cfnParameterPath: string = vscode.workspace
            .getConfiguration()
            .get('aws.accessAnalyzer.policyChecks.cloudFormationParameterFilePath')!

        //Check if Cfn and Tf tools are installed
        let cfnToolInstalled = true
        let tfToolInstalled = true
        exec('tf-policy-validator', err => {
            if (err) {
                if (err.message.includes('command not found')) {
                    tfToolInstalled = false
                }
            }
        })
        exec('cfn-policy-validator', err => {
            if (err) {
                if (err.message.includes('command not found')) {
                    cfnToolInstalled = false
                }
            }
        })

        const wv = new Panel(
            context.extensionContext,
            {
                referenceFilePath: referencePolicyFilePath ? referencePolicyFilePath : '',
                cfnParameterPath: cfnParameterPath ? cfnParameterPath : '',
                referenceDocument: await _getReferenceDocument(referencePolicyFilePath),
                pythonToolsInstalled: cfnToolInstalled && tfToolInstalled,
            },
            client
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
async function _getReferenceDocument(input: string): Promise<string> {
    if (fs.existsSync(input)) {
        return fs.readFileSync(input).toString()
    } else {
        try {
            const { region, bucket, key } = AmazonS3URI(input)
            const s3Client = new S3({ region })
            const resp = await s3Client.getObject({ Bucket: bucket, Key: key }).promise()
            return resp.Body!.toString()
        } catch (e: any) {}
    }
    return ''
}
