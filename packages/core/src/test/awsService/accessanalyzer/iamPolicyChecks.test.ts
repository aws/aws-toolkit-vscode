/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import {
    _readCustomChecksFile,
    getResultCssColor,
    IamPolicyChecksWebview,
    PolicyChecksError,
} from '../../../awsService/accessanalyzer/vue/iamPolicyChecks'
import { globals } from '../../../shared'
import { AccessAnalyzer, Config } from 'aws-sdk'
import * as s3Client from '../../../shared/clients/s3Client'
import { DefaultS3Client } from '../../../shared/clients/s3Client'
import * as iamPolicyChecks from '../../../awsService/accessanalyzer/vue/iamPolicyChecks'
import * as vscode from 'vscode'
import { IamPolicyChecksConstants } from '../../../awsService/accessanalyzer/vue/constants'
import { FileSystem } from '../../../shared/fs/fs'
import path from 'path'

const defaultTerraformConfigPath = 'resources/policychecks-tf-default.yaml'
let sandbox: sinon.SinonSandbox
let fakePolicyChecksWebview: IamPolicyChecksWebview
const vscodeFs = FileSystem.instance

describe('iamPolicyChecks', function () {
    it('IamPolicyChecksWebview built .vue source file path exists', async function () {
        assert.ok(
            await vscodeFs.existsFile(
                path.join(
                    path.dirname(globals.context.extensionPath),
                    `core/src/awsService/accessanalyzer/vue/iamPolicyChecks.vue`
                )
            )
        )
    })

    it('default Terraform config exists', async function () {
        assert.ok(await vscodeFs.existsFile(globals.context.asAbsolutePath(defaultTerraformConfigPath)))
    })
})

describe('_readCustomChecksFile', () => {
    let parseS3UriStub: sinon.SinonStub
    let s3ClientStub: sinon.SinonStubbedInstance<DefaultS3Client>
    sandbox = sinon.createSandbox()

    beforeEach(() => {
        parseS3UriStub = sandbox.stub(s3Client, 'parseS3Uri')
        s3ClientStub = sandbox.createStubInstance(DefaultS3Client)
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('should read file content if file exists', async () => {
        const filePath = globals.context.asAbsolutePath(defaultTerraformConfigPath)
        const fileContent = await vscodeFs.readFileText(filePath)

        const result = await _readCustomChecksFile(filePath)

        assert.strictEqual(result, fileContent)
    })

    it('should throw PolicyChecksError for invalid S3 URI', async () => {
        const invalidS3Uri = 's3://invalid-uri'

        try {
            await _readCustomChecksFile(invalidS3Uri)
            assert.fail('Expected method to throw.')
        } catch (error) {
            assert(error instanceof PolicyChecksError)
        }
    })

    it('should throw PolicyChecksError for other errors', async () => {
        const s3Uri = 's3://bucket/key'

        parseS3UriStub.withArgs(s3Uri).returns(['region', 'bucket', 'key'])
        s3ClientStub.getObject.rejects(new Error('Toolkit is not logged-in.'))

        try {
            await _readCustomChecksFile(s3Uri)
            assert.fail('Expected method to throw.')
        } catch (error) {
            assert(error instanceof PolicyChecksError)
        }
    })
})

describe('validatePolicy', function () {
    let onValidatePolicyResponseSpy: sinon.SinonSpy
    let executeCommandStub: sinon.SinonStub
    let pushValidatePolicyDiagnosticStub: sinon.SinonStub
    let validateDiagnosticSetStub: sinon.SinonStub
    const client = new AccessAnalyzer()
    client.config = new Config()
    const validatePolicyMock = sinon.mock(AccessAnalyzer)

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        const initialData = {
            cfnParameterPath: '',
            checkAccessNotGrantedActionsTextArea: '',
            checkAccessNotGrantedFilePath: '',
            checkAccessNotGrantedResourcesTextArea: '',
            checkNoNewAccessFilePath: '',
            checkNoNewAccessTextArea: '',
            customChecksFileErrorMessage: '',
            pythonToolsInstalled: false,
        }
        fakePolicyChecksWebview = new IamPolicyChecksWebview(initialData, client, 'us-east-1')

        pushValidatePolicyDiagnosticStub = sandbox.stub(fakePolicyChecksWebview, 'pushValidatePolicyDiagnostic')
        executeCommandStub = sandbox.stub(vscode.commands, 'executeCommand')
        onValidatePolicyResponseSpy = sandbox.spy(fakePolicyChecksWebview.onValidatePolicyResponse, 'fire')
        validateDiagnosticSetStub = sandbox.stub(iamPolicyChecks.validatePolicyDiagnosticCollection, 'set')
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('should handle JSON Policy Language correctly', async function () {
        const policyType = 'Identity'
        const documentType = 'JSON Policy Language'

        sandbox.stub(fakePolicyChecksWebview, 'executeValidatePolicyCommand')
        sandbox.stub(iamPolicyChecks, 'isJsonPolicyLanguage').returns(true)
        IamPolicyChecksWebview.editedDocumentFileName = 'test.json'
        await fakePolicyChecksWebview.validatePolicy(documentType, policyType)
        validatePolicyMock.verify()
    })

    it('should handle Terraform Plan correctly', async function () {
        const documentType = 'Terraform Plan'

        IamPolicyChecksWebview.editedDocumentFileName = 'test.json'
        sandbox.stub(iamPolicyChecks, 'isTerraformPlan').returns(true)
        const executeValidatePolicySpy = sandbox.spy(fakePolicyChecksWebview, 'executeValidatePolicyCommand')
        await fakePolicyChecksWebview.validatePolicy(documentType, 'Identity')

        assert(executeValidatePolicySpy.called)
        assert.deepStrictEqual(executeValidatePolicySpy.getCalls()[0].args[0], {
            command: 'tf-policy-validator',
            args: [
                'validate',
                '--template-path',
                IamPolicyChecksWebview.editedDocumentFileName,
                '--region',
                'us-east-1',
                '--config',
                `${globals.context.asAbsolutePath(defaultTerraformConfigPath)}`,
            ],
            cfnParameterPathExists: false,
            documentType,
            policyType: 'Identity',
        })
    })

    it('should handle CloudFormation correctly', async function () {
        const documentType = 'CloudFormation'
        const cfnParameterPath = 'path/to/parameters'

        IamPolicyChecksWebview.editedDocumentFileName = 'test.yaml'
        sandbox.stub(iamPolicyChecks, 'isCloudFormationTemplate').returns(true)
        const executeValidatePolicySpy = sandbox.spy(fakePolicyChecksWebview, 'executeValidatePolicyCommand')
        await fakePolicyChecksWebview.validatePolicy(documentType, 'Identity', cfnParameterPath)

        assert(executeValidatePolicySpy.called)
        assert.deepStrictEqual(executeValidatePolicySpy.getCalls()[0].args[0], {
            command: 'cfn-policy-validator',
            args: [
                'validate',
                '--template-path',
                IamPolicyChecksWebview.editedDocumentFileName,
                '--region',
                'us-east-1',
                '--template-configuration-file',
                cfnParameterPath,
            ],
            cfnParameterPathExists: true,
            documentType,
            policyType: 'Identity',
        })
    })

    it('handleValidatePolicyCliResponse no findings', function () {
        const response = JSON.stringify({
            BlockingFindings: [],
            NonBlockingFindings: [],
        })

        const findingsCount = fakePolicyChecksWebview.handleValidatePolicyCliResponse(response)

        assert.strictEqual(findingsCount, 0)
        assert(
            onValidatePolicyResponseSpy.calledOnceWith([
                IamPolicyChecksConstants.ValidatePolicySuccessNoFindings,
                getResultCssColor('Success'),
            ])
        )
        assert(executeCommandStub.notCalled)
    })

    it('handleValidatePolicyCliResponse should handle blocking and non-blocking findings correctly', function () {
        const response = JSON.stringify({
            BlockingFindings: [
                { id: 1, message: 'Blocking finding 1' },
                { id: 2, message: 'Blocking finding 2' },
            ],
            NonBlockingFindings: [{ id: 3, message: 'Non-blocking finding 1' }],
        })

        const findingsCount = fakePolicyChecksWebview.handleValidatePolicyCliResponse(response)

        assert.strictEqual(findingsCount, 3)

        assert(pushValidatePolicyDiagnosticStub.calledThrice)
        assert(pushValidatePolicyDiagnosticStub.calledWith(sinon.match.any, sinon.match.object, true))
        assert(pushValidatePolicyDiagnosticStub.calledWith(sinon.match.any, sinon.match.object, false))

        assert(
            onValidatePolicyResponseSpy.calledOnceWith([
                IamPolicyChecksConstants.ValidatePolicySuccessWithFindings,
                getResultCssColor('Warning'),
            ])
        )
        assert(executeCommandStub.calledOnceWith('workbench.actions.view.problems'))
    })

    it('handleValidatePolicyCliResponse should handle JSON parse errors', function () {
        const response = 'invalid json'

        assert.throws(
            () => {
                fakePolicyChecksWebview.handleValidatePolicyCliResponse(response)
            },
            {
                name: 'SyntaxError',
            }
        )

        assert(onValidatePolicyResponseSpy.notCalled)
        assert(executeCommandStub.notCalled)
    })

    it('pushValidatePolicyDiagnostic should push a blocking diagnostic correctly', function () {
        const diagnostics: vscode.Diagnostic[] = []
        const finding = {
            findingType: 'ERROR',
            code: 'E001',
            details: {
                findingDetails: 'Details about the finding',
                learnMoreLink: 'http://example.com',
            },
            resourceName: 'testResource',
            policyName: 'testPolicy',
        }
        const isBlocking = true
        pushValidatePolicyDiagnosticStub.restore()
        fakePolicyChecksWebview.pushValidatePolicyDiagnostic(diagnostics, finding, isBlocking)

        assert.strictEqual(diagnostics.length, 1)
        const diagnostic = diagnostics[0]
        assert.deepStrictEqual(diagnostic.range, new vscode.Range(0, 0, 0, 0))
        assert.strictEqual(
            diagnostic.message,
            'ERROR: E001 - Details about the finding Resource name: testResource, Policy name: testPolicy. Learn more: http://example.com'
        )
        assert.strictEqual(diagnostic.severity, vscode.DiagnosticSeverity.Error)
        assert(validateDiagnosticSetStub.calledOnce)
    })

    it('pushValidatePolicyDiagnostic should push a non-blocking diagnostic correctly', function () {
        const diagnostics: vscode.Diagnostic[] = []
        const finding = {
            findingType: 'WARNING',
            code: 'W001',
            details: {
                findingDetails: 'Details about the warning',
                learnMoreLink: 'http://example.com',
            },
            resourceName: 'testResource',
            policyName: 'testPolicy',
        }
        const isBlocking = false
        pushValidatePolicyDiagnosticStub.restore()
        fakePolicyChecksWebview.pushValidatePolicyDiagnostic(diagnostics, finding, isBlocking)

        assert.strictEqual(diagnostics.length, 1)
        const diagnostic = diagnostics[0]
        assert.deepStrictEqual(diagnostic.range, new vscode.Range(0, 0, 0, 0))
        assert.strictEqual(
            diagnostic.message,
            'WARNING: W001 - Details about the warning Resource name: testResource, Policy name: testPolicy. Learn more: http://example.com'
        )
        assert.strictEqual(diagnostic.severity, vscode.DiagnosticSeverity.Warning)
        assert(validateDiagnosticSetStub.calledOnce)
    })
})

describe('customChecks', function () {
    let executeCommandStub: sinon.SinonStub
    let pushCustomPolicyCheckDiagnosticStub: sinon.SinonStub
    let executeCustomPolicyChecksCommandStub: sinon.SinonStub
    let customPolicyDiagnosticSetStub: sinon.SinonStub
    let onCustomPolicyCheckResponseFireSpy: sinon.SinonSpy

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        const client = AccessAnalyzer.prototype
        const initialData = {
            cfnParameterPath: '',
            checkAccessNotGrantedActionsTextArea: '',
            checkAccessNotGrantedFilePath: '',
            checkAccessNotGrantedResourcesTextArea: '',
            checkNoNewAccessFilePath: '',
            checkNoNewAccessTextArea: '',
            customChecksFileErrorMessage: '',
            pythonToolsInstalled: false,
        }
        fakePolicyChecksWebview = new IamPolicyChecksWebview(initialData, client, 'us-east-1')

        pushCustomPolicyCheckDiagnosticStub = sandbox.stub(fakePolicyChecksWebview, 'pushCustomCheckDiagnostic')
        executeCommandStub = sandbox.stub(vscode.commands, 'executeCommand')
        onCustomPolicyCheckResponseFireSpy = sandbox.spy(fakePolicyChecksWebview.onCustomPolicyCheckResponse, 'fire')
        customPolicyDiagnosticSetStub = sandbox.stub(iamPolicyChecks.customPolicyCheckDiagnosticCollection, 'set')
    })

    afterEach(function () {
        onCustomPolicyCheckResponseFireSpy.restore()
        executeCommandStub.restore()
        customPolicyDiagnosticSetStub.restore()
        sandbox.restore()
    })

    it('checkNoNewAccess should handle Terraform Plan correctly', async function () {
        const documentType = 'Terraform Plan'
        const policyType = 'Identity'
        const referenceDocument = '{"some": "reference"}'
        const document = 'path/to/terraform.json'
        const cfnParameterPath = 'path/to/cfn-params'

        sandbox.stub(IamPolicyChecksWebview, 'editedDocumentFileName').value(document)
        sandbox.stub(iamPolicyChecks, 'isTerraformPlan').returns(true)
        sandbox.stub(iamPolicyChecks, 'isCloudFormationTemplate').returns(false)

        executeCustomPolicyChecksCommandStub = sandbox.stub(fakePolicyChecksWebview, 'executeCustomPolicyChecksCommand')

        await fakePolicyChecksWebview.checkNoNewAccess(documentType, policyType, referenceDocument, cfnParameterPath)

        // We do not want to validate the path of the temporary folder, so we check every other field instead of the entire args
        assert(executeCustomPolicyChecksCommandStub.called)
        const actualCommand = executeCustomPolicyChecksCommandStub.getCalls()[0].args[0]
        assert.deepStrictEqual(actualCommand.command, 'tf-policy-validator')
        assert.deepStrictEqual(actualCommand.args[0], 'check-no-new-access')
        assert.deepStrictEqual(actualCommand.args[2], document)
        assert.deepStrictEqual(actualCommand.args[4], 'us-east-1')
        assert.deepStrictEqual(actualCommand.args[6], `${globals.context.asAbsolutePath(defaultTerraformConfigPath)}`)
        assert.deepStrictEqual(actualCommand.args[10], policyType)
        assert.deepStrictEqual(actualCommand.cfnParameterPathExists, true)
        assert.deepStrictEqual(actualCommand.documentType, documentType)
        assert.deepStrictEqual(actualCommand.checkType, 'CheckNoNewAccess')
        assert.deepStrictEqual(actualCommand.referencePolicyType, policyType)

        assert(onCustomPolicyCheckResponseFireSpy.notCalled)
    })

    it('checkNoNewAccess should handle CloudFormation document type correctly', async function () {
        const documentType = 'CloudFormation'
        const policyType = 'Resource'
        const referenceDocument = '{"some": "reference"}'
        const document = 'path/to/cloudformation.yaml'
        const cfnParameterPath = 'path/to/cfn-params'

        sandbox.stub(IamPolicyChecksWebview, 'editedDocumentFileName').value(document)
        sandbox.stub(iamPolicyChecks, 'isCloudFormationTemplate').returns(true)
        sandbox.stub(iamPolicyChecks, 'isTerraformPlan').returns(false)

        executeCustomPolicyChecksCommandStub = sandbox.stub(fakePolicyChecksWebview, 'executeCustomPolicyChecksCommand')

        await fakePolicyChecksWebview.checkNoNewAccess(documentType, policyType, referenceDocument, cfnParameterPath)

        assert(executeCustomPolicyChecksCommandStub.called)
        const actualCommand = executeCustomPolicyChecksCommandStub.getCalls()[0].args[0]
        assert.deepStrictEqual(actualCommand.command, 'cfn-policy-validator')
        assert.deepStrictEqual(actualCommand.args[0], 'check-no-new-access')
        assert.deepStrictEqual(actualCommand.args[2], document)
        assert.deepStrictEqual(actualCommand.args[4], 'us-east-1')
        assert.deepStrictEqual(actualCommand.args[8], policyType)
        assert.deepStrictEqual(actualCommand.cfnParameterPathExists, true)
        assert.deepStrictEqual(actualCommand.documentType, documentType)
        assert.deepStrictEqual(actualCommand.checkType, 'CheckNoNewAccess')
        assert.deepStrictEqual(actualCommand.referencePolicyType, policyType)

        assert(onCustomPolicyCheckResponseFireSpy.notCalled)
    })

    it('checkNoNewAccess should handle missing reference document', async function () {
        const documentType = 'Terraform Plan'
        const policyType = 'Identity'
        const referenceDocument = '' // Empty document
        const document = 'path/to/terraform.json'

        sandbox.stub(IamPolicyChecksWebview, 'editedDocumentFileName').value(document)
        sandbox.stub(iamPolicyChecks, 'isTerraformPlan').returns(true)
        sandbox.stub(iamPolicyChecks, 'isCloudFormationTemplate').returns(false)
        executeCustomPolicyChecksCommandStub = sandbox.stub(fakePolicyChecksWebview, 'executeCustomPolicyChecksCommand')

        await fakePolicyChecksWebview.checkNoNewAccess(documentType, policyType, referenceDocument)

        assert(
            onCustomPolicyCheckResponseFireSpy.calledOnceWith([
                IamPolicyChecksConstants.MissingReferenceDocError,
                getResultCssColor('Error'),
            ])
        )
        assert(executeCommandStub.notCalled)
        assert(executeCustomPolicyChecksCommandStub.notCalled)
    })

    it('checkAccessNotGranted should handle Terraform Plan document type correctly', async function () {
        const documentType = 'Terraform Plan'
        const actions = 'action1 action2'
        const resources = 'resource1 resource2'
        const document = 'path/to/terraform.json'
        const cfnParameterPath = 'path/to/cfn-params'

        sandbox.stub(IamPolicyChecksWebview, 'editedDocumentFileName').value(document)
        sandbox.stub(iamPolicyChecks, 'isTerraformPlan').returns(true)
        sandbox.stub(iamPolicyChecks, 'isCloudFormationTemplate').returns(false)
        executeCustomPolicyChecksCommandStub = sandbox.stub(fakePolicyChecksWebview, 'executeCustomPolicyChecksCommand')

        await fakePolicyChecksWebview.checkAccessNotGranted(documentType, actions, resources, cfnParameterPath)

        assert(
            executeCustomPolicyChecksCommandStub.calledOnceWith({
                command: 'tf-policy-validator',
                args: [
                    'check-access-not-granted',
                    '--template-path',
                    document,
                    '--region',
                    'us-east-1',
                    '--config',
                    `${globals.context.asAbsolutePath(defaultTerraformConfigPath)}`,
                    '--actions',
                    'action1action2',
                    '--resources',
                    'resource1resource2',
                ],
                cfnParameterPathExists: !!cfnParameterPath,
                documentType,
                checkType: 'CheckAccessNotGranted',
            })
        )
        assert(onCustomPolicyCheckResponseFireSpy.notCalled)
        assert(executeCommandStub.notCalled)
    })

    it('checkAccessNotGranted should handle CloudFormation document type correctly', async function () {
        const documentType = 'CloudFormation'
        const actions = 'action1 action2'
        const resources = 'resource1 resource2'
        const document = 'path/to/cloudformation.yaml'
        const cfnParameterPath = 'path/to/cfn-params'

        sandbox.stub(IamPolicyChecksWebview, 'editedDocumentFileName').value(document)
        sandbox.stub(iamPolicyChecks, 'isTerraformPlan').returns(false)
        sandbox.stub(iamPolicyChecks, 'isCloudFormationTemplate').returns(true)
        executeCustomPolicyChecksCommandStub = sandbox.stub(fakePolicyChecksWebview, 'executeCustomPolicyChecksCommand')

        await fakePolicyChecksWebview.checkAccessNotGranted(documentType, actions, resources, cfnParameterPath)

        assert(
            executeCustomPolicyChecksCommandStub.calledOnceWith({
                command: 'cfn-policy-validator',
                args: [
                    'check-access-not-granted',
                    '--template-path',
                    document,
                    '--region',
                    'us-east-1',
                    '--actions',
                    'action1action2',
                    '--resources',
                    'resource1resource2',
                    '--template-configuration-file',
                    cfnParameterPath,
                ],
                cfnParameterPathExists: !!cfnParameterPath,
                documentType,
                checkType: 'CheckAccessNotGranted',
            })
        )
        assert(onCustomPolicyCheckResponseFireSpy.notCalled)
        assert(executeCommandStub.notCalled)
    })

    it('checkAccessNotGranted should handle missing actions and resources', async function () {
        const documentType = 'Terraform Plan'
        const actions = ''
        const resources = ''
        const document = 'path/to/terraform.json'

        sandbox.stub(IamPolicyChecksWebview, 'editedDocumentFileName').value(document)
        sandbox.stub(iamPolicyChecks, 'isTerraformPlan').returns(true)
        sandbox.stub(iamPolicyChecks, 'isCloudFormationTemplate').returns(false)
        executeCustomPolicyChecksCommandStub = sandbox.stub(fakePolicyChecksWebview, 'executeCustomPolicyChecksCommand')

        await fakePolicyChecksWebview.checkAccessNotGranted(documentType, actions, resources)

        assert(
            onCustomPolicyCheckResponseFireSpy.calledOnceWith([
                IamPolicyChecksConstants.MissingActionsOrResourcesError,
                getResultCssColor('Error'),
            ])
        )
        assert(executeCustomPolicyChecksCommandStub.notCalled)
        assert(executeCommandStub.notCalled)
    })

    it('checkNoPublicAccess should handle Terraform Plan document type correctly', async function () {
        const documentType = 'Terraform Plan'
        const document = 'path/to/terraform.json'
        const cfnParameterPath = 'path/to/cfn-params'

        sandbox.stub(IamPolicyChecksWebview, 'editedDocumentFileName').value(document)
        sandbox.stub(iamPolicyChecks, 'isTerraformPlan').returns(true)
        sandbox.stub(iamPolicyChecks, 'isCloudFormationTemplate').returns(false)
        executeCustomPolicyChecksCommandStub = sandbox.stub(fakePolicyChecksWebview, 'executeCustomPolicyChecksCommand')

        await fakePolicyChecksWebview.checkNoPublicAccess(documentType, cfnParameterPath)

        assert(
            executeCustomPolicyChecksCommandStub.calledOnceWith({
                command: 'tf-policy-validator',
                args: [
                    'check-no-public-access',
                    '--template-path',
                    document,
                    '--region',
                    'us-east-1',
                    '--config',
                    `${globals.context.asAbsolutePath(defaultTerraformConfigPath)}`,
                ],
                cfnParameterPathExists: !!cfnParameterPath,
                documentType,
                checkType: 'CheckNoPublicAccess',
            })
        )
        assert(onCustomPolicyCheckResponseFireSpy.notCalled)
        assert(executeCommandStub.notCalled)
    })

    it('checkNoPublicAccess should handle CloudFormation document type correctly', async function () {
        const documentType = 'CloudFormation'
        const document = 'path/to/cloudformation.yaml'
        const cfnParameterPath = 'path/to/cfn-params'

        sandbox.stub(IamPolicyChecksWebview, 'editedDocumentFileName').value(document)
        sandbox.stub(iamPolicyChecks, 'isTerraformPlan').returns(false)
        sandbox.stub(iamPolicyChecks, 'isCloudFormationTemplate').returns(true)
        executeCustomPolicyChecksCommandStub = sandbox.stub(fakePolicyChecksWebview, 'executeCustomPolicyChecksCommand')

        await fakePolicyChecksWebview.checkNoPublicAccess(documentType, cfnParameterPath)

        assert(
            executeCustomPolicyChecksCommandStub.calledOnceWith({
                command: 'cfn-policy-validator',
                args: [
                    'check-no-public-access',
                    '--template-path',
                    document,
                    '--region',
                    'us-east-1',
                    '--template-configuration-file',
                    cfnParameterPath,
                ],
                cfnParameterPathExists: !!cfnParameterPath,
                documentType,
                checkType: 'CheckNoPublicAccess',
            })
        )
        assert(onCustomPolicyCheckResponseFireSpy.notCalled)
        assert(executeCommandStub.notCalled)
    })

    it('checkNoPublicAccess should handle incorrect Terraform Plan document', async function () {
        const documentType = 'Terraform Plan'
        const document = 'path/to/invalid.terraform'

        sandbox.stub(IamPolicyChecksWebview, 'editedDocumentFileName').value(document)
        sandbox.stub(iamPolicyChecks, 'isTerraformPlan').returns(false)
        sandbox.stub(iamPolicyChecks, 'isCloudFormationTemplate').returns(false)
        executeCustomPolicyChecksCommandStub = sandbox.stub(fakePolicyChecksWebview, 'executeCustomPolicyChecksCommand')

        await fakePolicyChecksWebview.checkNoPublicAccess(documentType)

        assert(
            onCustomPolicyCheckResponseFireSpy.calledOnceWith([
                IamPolicyChecksConstants.IncorrectFileExtension,
                getResultCssColor('Error'),
            ])
        )
        assert(executeCustomPolicyChecksCommandStub.notCalled)
        assert(executeCommandStub.notCalled)
    })

    it('handleCustomPolicyChecksCliResponse should handle response with no findings correctly', function () {
        const response = JSON.stringify({
            BlockingFindings: [],
            NonBlockingFindings: [],
        })

        const findingsCount = fakePolicyChecksWebview.handleCustomPolicyChecksCliResponse(response)

        assert.strictEqual(findingsCount, 0)
        assert(
            onCustomPolicyCheckResponseFireSpy.calledOnceWith([
                IamPolicyChecksConstants.CustomCheckSuccessNoFindings,
                getResultCssColor('Success'),
            ])
        )
        assert(pushCustomPolicyCheckDiagnosticStub.notCalled)
        assert(executeCommandStub.notCalled)
    })

    it('handleCustomPolicyChecksCliResponse should handle response with blocking and non-blocking findings correctly', function () {
        const response = JSON.stringify({
            BlockingFindings: [
                {
                    id: 1,
                    findingType: 'ERROR',
                    message:
                        'The policy in existingPolicyDocument is invalid. Principal is a prohibited policy element.',
                },
            ],
            NonBlockingFindings: [{ id: 2 }],
        })
        const errorMessage =
            "ERROR: The policy in reference document is invalid. Principal is a prohibited policy element. Review the reference document's policy type and try again."
        sandbox.stub(iamPolicyChecks, 'getCheckNoNewAccessErrorMessage').returns(errorMessage)
        const findingsCount = fakePolicyChecksWebview.handleCustomPolicyChecksCliResponse(response)

        assert.strictEqual(findingsCount, 2)
        assert(pushCustomPolicyCheckDiagnosticStub.calledTwice)
        assert(pushCustomPolicyCheckDiagnosticStub.firstCall.calledWith(sinon.match.array, sinon.match.any, true))
        assert(pushCustomPolicyCheckDiagnosticStub.secondCall.calledWith(sinon.match.array, sinon.match.any, false))
        assert.deepStrictEqual(onCustomPolicyCheckResponseFireSpy.getCalls()[0].args[0], [
            errorMessage,
            getResultCssColor('Error'),
        ])
        assert(executeCommandStub.calledOnceWith('workbench.actions.view.problems'))
    })

    it('handleCustomPolicyChecksCliResponse should handle response with blocking findings and no error message correctly', function () {
        const response = JSON.stringify({
            BlockingFindings: [{ id: 1 }],
            NonBlockingFindings: [],
        })
        sandbox.stub(iamPolicyChecks, 'getCheckNoNewAccessErrorMessage').returns(undefined)

        const findingsCount = fakePolicyChecksWebview.handleCustomPolicyChecksCliResponse(response)

        assert.strictEqual(findingsCount, 1)
        assert(pushCustomPolicyCheckDiagnosticStub.calledOnce)
        assert(
            onCustomPolicyCheckResponseFireSpy.calledOnceWith([
                IamPolicyChecksConstants.CustomCheckSuccessWithFindings,
                getResultCssColor('Warning'),
            ])
        )
        assert(executeCommandStub.calledOnceWith('workbench.actions.view.problems'))
    })

    it('pushCustomCheckDiagnostic should push diagnostics with reasons correctly for blocking findings', function () {
        const diagnostics: vscode.Diagnostic[] = []
        const finding = {
            findingType: 'ERROR',
            message: 'Test message with existingPolicyDocument',
            resourceName: 'testResource',
            policyName: 'testPolicy',
            details: {
                reasons: [{ description: 'Reason 1' }, { description: 'Reason 2' }],
            },
        }
        const isBlocking = true
        pushCustomPolicyCheckDiagnosticStub.restore()
        fakePolicyChecksWebview.pushCustomCheckDiagnostic(diagnostics, finding, isBlocking)

        assert.strictEqual(diagnostics.length, 2) // One diagnostic per reason
        diagnostics.forEach((diagnostic, index) => {
            assert.deepStrictEqual(diagnostic.range, new vscode.Range(0, 0, 0, 0))
            assert.strictEqual(diagnostic.severity, vscode.DiagnosticSeverity.Error)
            assert.strictEqual(
                diagnostic.message,
                `${finding.findingType}: Test message with reference document - Resource name: ${finding.resourceName}, Policy name: ${finding.policyName} - Reason ${index + 1}`
            )
        })
        assert(customPolicyDiagnosticSetStub.calledOnce)
    })

    it('pushCustomCheckDiagnostic should push diagnostics with reasons correctly for non-blocking findings', function () {
        const diagnostics: vscode.Diagnostic[] = []
        const finding = {
            findingType: 'WARNING',
            message: 'Another test message',
            resourceName: 'testResource',
            policyName: 'testPolicy',
            details: {
                reasons: [{ description: 'Reason A' }, { description: 'Reason B' }],
            },
        }
        const isBlocking = false
        pushCustomPolicyCheckDiagnosticStub.restore()
        fakePolicyChecksWebview.pushCustomCheckDiagnostic(diagnostics, finding, isBlocking)

        assert.strictEqual(diagnostics.length, 2) // One diagnostic per reason
        diagnostics.forEach((diagnostic, index) => {
            assert.deepStrictEqual(diagnostic.range, new vscode.Range(0, 0, 0, 0))
            assert.strictEqual(diagnostic.severity, vscode.DiagnosticSeverity.Warning)
            assert.strictEqual(
                diagnostic.message,
                `WARNING: Another test message - Resource name: ${finding.resourceName}, Policy name: ${finding.policyName} - Reason ${index === 0 ? 'A' : 'B'}`
            )
        })
        assert(customPolicyDiagnosticSetStub.calledOnce)
    })

    it('should push a single diagnostic without reasons', function () {
        const diagnostics: vscode.Diagnostic[] = []
        const finding = {
            findingType: 'ERROR',
            message: 'Message without reasons',
            resourceName: 'testResource',
            policyName: 'testPolicy',
            details: {},
        }
        const isBlocking = true
        pushCustomPolicyCheckDiagnosticStub.restore()
        fakePolicyChecksWebview.pushCustomCheckDiagnostic(diagnostics, finding, isBlocking)

        assert.strictEqual(diagnostics.length, 1)
        const diagnostic = diagnostics[0]
        assert.deepStrictEqual(diagnostic.range, new vscode.Range(0, 0, 0, 0))
        assert.strictEqual(diagnostic.severity, vscode.DiagnosticSeverity.Error)
        assert.strictEqual(
            diagnostic.message,
            'ERROR: Message without reasons - Resource name: testResource, Policy name: testPolicy'
        )
        assert(customPolicyDiagnosticSetStub.calledOnce)
    })
})
