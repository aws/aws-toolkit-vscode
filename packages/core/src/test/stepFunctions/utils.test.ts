/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import {
    isDocumentValid,
    isStepFunctionsRole,
    isInvalidJsonFile,
    isInvalidYamlFile,
    isExpressExecution,
    parseExecutionArnForStateMachine,
} from '../../stepFunctions/utils'
import { IamRole } from '../../shared/clients/iam'

describe('isStepFunctionsRole', function () {
    const baseIamRole: IamRole = {
        Path: '',
        RoleName: '',
        RoleId: 'myRole',
        Arn: 'arn:aws:iam::123456789012:role/myRole',
        CreateDate: new Date(),
    }

    it('return true if the Step Functions service principal is in the AssumeRolePolicyDocument', function () {
        const role: IamRole = {
            ...baseIamRole,
            AssumeRolePolicyDocument: JSON.stringify({
                Version: '2012-10-17',
                Statement: [
                    {
                        Effect: 'Allow',
                        Principal: {
                            Service: ['states.amazonaws.com'],
                        },
                        Action: ['sts:AssumeRole'],
                    },
                ],
            }),
        }
        assert.ok(isStepFunctionsRole(role))
    })

    it('returns false if the role does not have an AssumeRolePolicyDocument', function () {
        assert.ok(!isStepFunctionsRole(baseIamRole))
    })

    it("returns false if the AssumeRolePolicyDocument does not contain Step Functions' service principal", () => {
        const role: IamRole = {
            ...baseIamRole,
            AssumeRolePolicyDocument: JSON.stringify({
                Version: '2012-10-17',
                Statement: [
                    {
                        Effect: 'Allow',
                        Principal: {
                            Service: ['lambda.amazonaws.com'],
                        },
                        Action: ['sts:AssumeRole'],
                    },
                ],
            }),
        }
        assert.ok(!isStepFunctionsRole(role))
    })
})

describe('isDocumentValid', async function () {
    it('returns true for valid ASL', async function () {
        const aslText = `
            {
                "StartAt": "FirstMatchState",
                "States": {
                    "FirstMatchState": {
                        "Type": "Task",
                        "Resource": "arn:aws:lambda:us-west-2:000000000000:function:OnFirstMatch",
                        "End": true
                    }
                }
            } `

        const textDocument = await vscode.workspace.openTextDocument({ language: 'asl' })

        const isValid = await isDocumentValid(aslText, textDocument)
        assert.ok(isValid)
    })

    it('returns true for ASL with invalid arns', async function () {
        const aslText = `
            {
                "StartAt": "FirstMatchState",
                "States": {
                    "FirstMatchState": {
                        "Type": "Task",
                        "Resource": "arn:aws:lambda:REGION:ACCOUNT_ID:function:OnFirstMatch",
                        "End": true
                    }
                }
            } `

        const textDocument = await vscode.workspace.openTextDocument({ language: 'asl' })

        const isValid = await isDocumentValid(aslText, textDocument)
        assert.ok(isValid)
    })

    it('returns false for invalid ASL', async function () {
        const aslText = `
            {
                "StartAt": "Does not exist",
                "States": {
                    "FirstMatchState": {
                        "Type": "Task",
                        "Resource": "arn:aws:lambda:us-west-2:000000000000:function:OnFirstMatch",
                        "End": true
                    }
                }
            } `

        const textDocument = await vscode.workspace.openTextDocument({ language: 'asl' })

        const isValid = await isDocumentValid(aslText, textDocument)

        assert.ok(!isValid)
    })
})

describe('isInvalidJsonFile', function () {
    it('returns false for valid JSON with ASL language ID', async function () {
        const validJson = '{"StartAt": "Test", "States": {"Test": {"Type": "Pass", "End": true}}}'
        const textDocument = await vscode.workspace.openTextDocument({
            language: 'asl',
            content: validJson,
        })

        assert.strictEqual(isInvalidJsonFile(textDocument), false)
    })

    it('returns true for invalid JSON with ASL language ID', async function () {
        const invalidJson = '{"StartAt": "Test", "States": {'
        const textDocument = await vscode.workspace.openTextDocument({
            language: 'asl',
            content: invalidJson,
        })

        assert.strictEqual(isInvalidJsonFile(textDocument), true)
    })

    it('returns false for empty content with ASL language ID', async function () {
        const textDocument = await vscode.workspace.openTextDocument({
            language: 'asl',
            content: '',
        })

        assert.strictEqual(isInvalidJsonFile(textDocument), false)
    })

    it('returns false for whitespace-only content with ASL language ID', async function () {
        const textDocument = await vscode.workspace.openTextDocument({
            language: 'asl',
            content: '   \n\t  ',
        })

        assert.strictEqual(isInvalidJsonFile(textDocument), false)
    })

    it('returns false for valid JSON with non-ASL language ID', async function () {
        const validJson = '{"test": "value"}'
        const textDocument = await vscode.workspace.openTextDocument({
            language: 'json',
            content: validJson,
        })

        assert.strictEqual(isInvalidJsonFile(textDocument), false)
    })

    it('returns false for invalid JSON with non-ASL language ID', async function () {
        const invalidJson = '{"test": invalid}'
        const textDocument = await vscode.workspace.openTextDocument({
            language: 'json',
            content: invalidJson,
        })

        assert.strictEqual(isInvalidJsonFile(textDocument), false)
    })
})

describe('isInvalidYamlFile', function () {
    it('returns false for valid YAML with ASL-YAML language ID', async function () {
        const validYaml = 'StartAt: Test\nStates:\n  Test:\n    Type: Pass\n    End: true'
        const textDocument = await vscode.workspace.openTextDocument({
            language: 'asl-yaml',
            content: validYaml,
        })

        assert.strictEqual(isInvalidYamlFile(textDocument), false)
    })

    it('returns true for invalid YAML with ASL-YAML language ID', async function () {
        const invalidYaml = 'StartAt: Test\nStates:\n  Test:\n    Type: Pass\n    End: true\n  - invalid list item'
        const textDocument = await vscode.workspace.openTextDocument({
            language: 'asl-yaml',
            content: invalidYaml,
        })

        assert.strictEqual(isInvalidYamlFile(textDocument), true)
    })

    it('returns false for empty content with ASL-YAML language ID', async function () {
        const textDocument = await vscode.workspace.openTextDocument({
            language: 'asl-yaml',
            content: '',
        })

        assert.strictEqual(isInvalidYamlFile(textDocument), false)
    })

    it('returns false for valid YAML with non-ASL-YAML language ID', async function () {
        const validYaml = 'key: value\nlist:\n  - item1\n  - item2'
        const textDocument = await vscode.workspace.openTextDocument({
            language: 'yaml',
            content: validYaml,
        })

        assert.strictEqual(isInvalidYamlFile(textDocument), false)
    })

    it('returns false for invalid YAML with non-ASL-YAML language ID', async function () {
        const invalidYaml = 'key: value\n  - invalid'
        const textDocument = await vscode.workspace.openTextDocument({
            language: 'yaml',
            content: invalidYaml,
        })

        assert.strictEqual(isInvalidYamlFile(textDocument), false)
    })
})

describe('isExpressExecution', function () {
    it('returns true for express execution ARN', function () {
        const expressArn = 'arn:aws:states:us-east-1:123456789012:express:stateMachine:MyStateMachine:execution-name'
        assert.strictEqual(isExpressExecution(expressArn), true)
    })

    it('returns false for standard execution ARN', function () {
        const standardArn = 'arn:aws:states:us-west-2:987654321098:stateMachine:TestMachine:execution-id'
        assert.strictEqual(isExpressExecution(standardArn), false)
    })

    it('returns false for ARN with express format but different resource type', function () {
        const arnWithDifferentType =
            'arn:aws:states:us-east-1:123456789012:standard:stateMachine:MyStateMachine:execution-name'
        assert.strictEqual(isExpressExecution(arnWithDifferentType), false)
    })

    it('returns false for malformed ARN with wrong segment count', function () {
        const malformedArn = 'arn:aws:states:us-east-1:123456789012:stateMachine:execution-name'
        assert.strictEqual(isExpressExecution(malformedArn), false)
    })

    it('returns false for empty string', function () {
        assert.strictEqual(isExpressExecution(''), false)
    })

    it('returns false for ARN with correct segment count but no express type', function () {
        const arnWithoutExpress =
            'arn:aws:states:us-east-1:123456789012:other:stateMachine:MyStateMachine:execution-name'
        assert.strictEqual(isExpressExecution(arnWithoutExpress), false)
    })
})

describe('parseExecutionArnForStateMachine', function () {
    it('parses express execution ARN correctly', function () {
        const expressArn = 'arn:aws:states:us-east-1:123456789012:express:stateMachine:MyStateMachine:execution-name'
        const result = parseExecutionArnForStateMachine(expressArn)

        assert.strictEqual(result.region, 'us-east-1')
        assert.strictEqual(result.stateMachineName, 'MyStateMachine')
        assert.strictEqual(result.stateMachineArn, 'arn:aws:states:us-east-1:123456789012:stateMachine:MyStateMachine')
    })

    it('parses standard execution ARN correctly', function () {
        const standardArn = 'arn:aws:states:us-west-2:987654321098:stateMachine:TestMachine:execution-id'
        const result = parseExecutionArnForStateMachine(standardArn)

        assert.strictEqual(result.region, 'us-west-2')
        assert.strictEqual(result.stateMachineName, 'TestMachine')
        assert.strictEqual(result.stateMachineArn, 'arn:aws:states:us-west-2:987654321098:stateMachine:TestMachine')
    })

    it('handles different regions correctly', function () {
        const euArn = 'arn:aws:states:eu-west-1:555666777888:stateMachine:EuroMachine:exec-123'
        const result = parseExecutionArnForStateMachine(euArn)

        assert.strictEqual(result.region, 'eu-west-1')
        assert.strictEqual(result.stateMachineName, 'EuroMachine')
        assert.strictEqual(result.stateMachineArn, 'arn:aws:states:eu-west-1:555666777888:stateMachine:EuroMachine')
    })

    it('handles state machine names with hyphens and special characters', function () {
        const arnWithSpecialName =
            'arn:aws:states:ap-southeast-2:111222333444:stateMachine:My-State_Machine.Test:exec-456'
        const result = parseExecutionArnForStateMachine(arnWithSpecialName)

        assert.strictEqual(result.region, 'ap-southeast-2')
        assert.strictEqual(result.stateMachineName, 'My-State_Machine.Test')
        assert.strictEqual(
            result.stateMachineArn,
            'arn:aws:states:ap-southeast-2:111222333444:stateMachine:My-State_Machine.Test'
        )
    })

    it('handles different account IDs correctly', function () {
        const differentAccountArn = 'arn:aws:states:us-central-1:999888777666:stateMachine:AccountTestMachine:exec-789'
        const result = parseExecutionArnForStateMachine(differentAccountArn)

        assert.strictEqual(result.region, 'us-central-1')
        assert.strictEqual(result.stateMachineName, 'AccountTestMachine')
        assert.strictEqual(
            result.stateMachineArn,
            'arn:aws:states:us-central-1:999888777666:stateMachine:AccountTestMachine'
        )
    })
})
